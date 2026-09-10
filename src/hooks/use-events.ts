/**
 * src/hooks/use-events.ts
 * Real-time React hook for Events in Kuro Mobile.
 * Subscribes to live Firestore events partitioned by tenant,
 * manages date offset scrubbing, and automatically categorizes jobs.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  subscribeTenantEvents,
  subscribeSingleEvent,
  fetchTenantEvents,
  fetchSingleEvent,
} from '@/services/event-service';
import { categorizeEvents } from '@/lib/categorization';
import { filterEvents, computeEventMetrics, type EventMetrics } from '@/lib/events-engine';
import type { Event, CategorizedEvents } from '@/types/events';

export type EventTabType = 'today' | 'in_progress' | 'upcoming' | 'all';

export interface EventFeedMetrics extends EventMetrics {
  totalActive: number;
  todayCount: number;
  inProgressCount: number;
  upcomingCount: number;
  completedCount: number;
}

export interface UseEventsOptions {
  initialOffset?: number;
  initialStatusFilter?: string;
  initialSearchQuery?: string;
}

export interface UseEventsResult {
  events: Event[];
  filteredEvents: Event[];
  categorized: CategorizedEvents;
  displayedEvents: Event[];
  selectedTab: EventTabType;
  setSelectedTab: (tab: EventTabType) => void;
  targetDateOffset: number;
  setTargetDateOffset: (offset: number | ((prev: number) => number)) => void;
  resetDateOffset: () => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  metrics: EventFeedMetrics;
}

/**
 * Hook for subscribing to all active events for the current tenant.
 */
export function useEvents(optionsOrOffset: number | UseEventsOptions = 0): UseEventsResult {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.tenantId || user?.tenantId || '';

  const initialOffset = typeof optionsOrOffset === 'number' ? optionsOrOffset : optionsOrOffset?.initialOffset ?? 0;
  const initialStatus = typeof optionsOrOffset === 'object' ? optionsOrOffset?.initialStatusFilter ?? 'All' : 'All';
  const initialSearch = typeof optionsOrOffset === 'object' ? optionsOrOffset?.initialSearchQuery ?? '' : '';

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [targetDateOffset, setTargetDateOffset] = useState<number>(initialOffset);
  const [selectedTab, setSelectedTab] = useState<EventTabType>('today');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);

  // Synchronously purge stale events when tenantId changes (render-time identity guard)
  const currentTenantRef = useRef(tenantId);
  if (currentTenantRef.current !== tenantId) {
    currentTenantRef.current = tenantId;
    setEvents([]);
    setLoading(tenantId ? true : false);
    setError(null);
  }

  useEffect(() => {
    if (!tenantId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeTenantEvents(
      tenantId,
      (fetchedEvents) => {
        if (currentTenantRef.current === tenantId) {
          setEvents(fetchedEvents);
          setLoading(false);
        }
      },
      (err) => {
        if (currentTenantRef.current === tenantId) {
          console.error('[useEvents] Subscription error:', err);
          setError(err);
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [tenantId]);

  const resetDateOffset = useCallback(() => {
    setTargetDateOffset(0);
  }, []);

  const refreshGenRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const reqGen = ++refreshGenRef.current;
    try {
      setLoading(true);
      const freshEvents = await fetchTenantEvents(tenantId);
      if (reqGen === refreshGenRef.current && currentTenantRef.current === tenantId) {
        setEvents(freshEvents);
        setError(null);
      }
    } catch (err: any) {
      if (reqGen === refreshGenRef.current) {
        console.error('[useEvents] Refresh error:', err);
        setError(err);
      }
    } finally {
      if (reqGen === refreshGenRef.current) {
        setLoading(false);
      }
    }
  }, [tenantId]);

  // Categorize events based on targetDateOffset (legacy support)
  const categorized = useMemo<CategorizedEvents>(() => {
    return categorizeEvents(events, { targetDateOffset });
  }, [events, targetDateOffset]);

  // Filter events based on selected tab (legacy support)
  const displayedEvents = useMemo<Event[]>(() => {
    switch (selectedTab) {
      case 'today':
        return categorized.todayJobs;
      case 'in_progress':
        return categorized.inProgress;
      case 'upcoming':
        return categorized.upcoming;
      case 'all':
        return events.filter((e) => !e.archived && e.eventStatusId !== 'Completed' && e.eventStatusId !== 'Cancelled');
      default:
        return categorized.todayJobs;
    }
  }, [selectedTab, categorized, events]);

  // Filter events using 2-month (60-day) rolling window, status filter, and search query
  const filteredEvents = useMemo<Event[]>(() => {
    return filterEvents(events, {
      status: statusFilter,
      search: searchQuery,
      windowDays: 60,
    });
  }, [events, statusFilter, searchQuery]);

  const metrics = useMemo<EventFeedMetrics>(() => {
    const domainMetrics = computeEventMetrics(events, { windowDays: 60 });
    const activeEvents = events.filter(
      (e) => !e.archived && e.eventStatusId !== 'Completed' && e.eventStatusId !== 'Cancelled'
    );
    return {
      ...domainMetrics,
      totalActive: activeEvents.length,
      todayCount: categorized.todayJobs.length,
      inProgressCount: categorized.inProgress.length,
      upcomingCount: categorized.upcoming.length,
      completedCount: categorized.completed.length,
    };
  }, [events, categorized]);

  return {
    events,
    filteredEvents,
    categorized,
    displayedEvents,
    selectedTab,
    setSelectedTab,
    targetDateOffset,
    setTargetDateOffset,
    resetDateOffset,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    loading,
    error,
    refresh,
    metrics,
  };
}

export interface UseSingleEventResult {
  event: Event | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for subscribing to a single event document by ID.
 */
export function useSingleEvent(eventId: string): UseSingleEventResult {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.tenantId || user?.tenantId || '';

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Synchronously purge stale event when eventId or tenantId changes
  const currentScopeRef = useRef({ eventId, tenantId });
  if (
    currentScopeRef.current.eventId !== eventId ||
    currentScopeRef.current.tenantId !== tenantId
  ) {
    currentScopeRef.current = { eventId, tenantId };
    setEvent(null);
    setLoading(eventId && tenantId ? true : false);
    setError(null);
  }

  useEffect(() => {
    if (!eventId || !tenantId) {
      setEvent(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeSingleEvent(
      eventId,
      tenantId,
      (fetchedEvent) => {
        if (
          currentScopeRef.current.eventId === eventId &&
          currentScopeRef.current.tenantId === tenantId
        ) {
          setEvent(fetchedEvent);
          setLoading(false);
        }
      },
      (err) => {
        if (
          currentScopeRef.current.eventId === eventId &&
          currentScopeRef.current.tenantId === tenantId
        ) {
          console.error(`[useSingleEvent] Subscription error for ${eventId}:`, err);
          setError(err);
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [eventId, tenantId]);

  const refreshGenRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!eventId || !tenantId) return;
    const reqGen = ++refreshGenRef.current;
    try {
      setLoading(true);
      const freshEvent = await fetchSingleEvent(eventId, tenantId);
      if (
        reqGen === refreshGenRef.current &&
        currentScopeRef.current.eventId === eventId &&
        currentScopeRef.current.tenantId === tenantId
      ) {
        setEvent(freshEvent);
        setError(null);
      }
    } catch (err: any) {
      if (reqGen === refreshGenRef.current) {
        console.error(`[useSingleEvent] Refresh error for ${eventId}:`, err);
        setError(err);
      }
    } finally {
      if (reqGen === refreshGenRef.current) {
        setLoading(false);
      }
    }
  }, [eventId, tenantId]);

  return {
    event,
    loading,
    error,
    refresh,
  };
}
