/**
 * src/hooks/use-events.ts
 * Real-time React hook for Events in Kuro Mobile.
 * Subscribes to live Firestore events partitioned by tenant,
 * manages date offset scrubbing, and automatically categorizes jobs.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  subscribeTenantEvents,
  subscribeSingleEvent,
  fetchTenantEvents,
  fetchSingleEvent,
} from '@/services/event-service';
import { categorizeEvents } from '@/lib/categorization';
import type { Event, CategorizedEvents } from '@/types/events';

export type EventTabType = 'today' | 'in_progress' | 'upcoming' | 'all';

export interface UseEventsResult {
  events: Event[];
  categorized: CategorizedEvents;
  displayedEvents: Event[];
  selectedTab: EventTabType;
  setSelectedTab: (tab: EventTabType) => void;
  targetDateOffset: number;
  setTargetDateOffset: (offset: number | ((prev: number) => number)) => void;
  resetDateOffset: () => void;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  metrics: {
    totalActive: number;
    todayCount: number;
    inProgressCount: number;
    upcomingCount: number;
    completedCount: number;
  };
}

/**
 * Hook for subscribing to all active events for the current tenant.
 */
export function useEvents(initialOffset: number = 0): UseEventsResult {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.tenantId || user?.tenantId || '';

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [targetDateOffset, setTargetDateOffset] = useState<number>(initialOffset);
  const [selectedTab, setSelectedTab] = useState<EventTabType>('today');

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
        setEvents(fetchedEvents);
        setLoading(false);
      },
      (err) => {
        console.error('[useEvents] Subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [tenantId]);

  const resetDateOffset = useCallback(() => {
    setTargetDateOffset(0);
  }, []);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const freshEvents = await fetchTenantEvents(tenantId);
      setEvents(freshEvents);
      setError(null);
    } catch (err: any) {
      console.error('[useEvents] Refresh error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Categorize events based on targetDateOffset
  const categorized = useMemo<CategorizedEvents>(() => {
    return categorizeEvents(events, { targetDateOffset });
  }, [events, targetDateOffset]);

  // Filter events based on selected tab
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

  const metrics = useMemo(() => {
    const activeEvents = events.filter(
      (e) => !e.archived && e.eventStatusId !== 'Completed' && e.eventStatusId !== 'Cancelled'
    );
    return {
      totalActive: activeEvents.length,
      todayCount: categorized.todayJobs.length,
      inProgressCount: categorized.inProgress.length,
      upcomingCount: categorized.upcoming.length,
      completedCount: categorized.completed.length,
    };
  }, [events, categorized]);

  return {
    events,
    categorized,
    displayedEvents,
    selectedTab,
    setSelectedTab,
    targetDateOffset,
    setTargetDateOffset,
    resetDateOffset,
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
        setEvent(fetchedEvent);
        setLoading(false);
      },
      (err) => {
        console.error(`[useSingleEvent] Subscription error for ${eventId}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [eventId, tenantId]);

  const refresh = useCallback(async () => {
    if (!eventId || !tenantId) return;
    try {
      setLoading(true);
      const freshEvent = await fetchSingleEvent(eventId, tenantId);
      setEvent(freshEvent);
      setError(null);
    } catch (err: any) {
      console.error(`[useSingleEvent] Refresh error for ${eventId}:`, err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [eventId, tenantId]);

  return {
    event,
    loading,
    error,
    refresh,
  };
}
