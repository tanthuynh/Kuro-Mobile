/**
 * src/hooks/use-logistics.ts
 * Reactive React Hooks for Kuro Mobile Logistics & Driver workflows.
 * Subscribes to real-time Firestore multi-tenant logistics streams,
 * computes driver filtered entries and aggregate metrics, and exposes mutation actions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  subscribeToLogistics,
  subscribeSingleLogisticsEntry,
  fetchTenantLogistics,
  getLogisticsEntry,
  updateLogisticsStatus,
  appendLogisticsNote,
  updateJobLocation,
  stopJobTracking,
} from '@/services/logistics-service';
import {
  filterLogisticsForDriver,
  computeLogisticsMetrics,
} from '@/lib/logistics-engine';
import type {
  LogisticsEntry,
  LogisticsMetrics,
  DriverLocation,
} from '@/types/logistics';

export interface UseLogisticsOptions {
  initialOnlyAssigned?: boolean;
  initialStatusFilter?: string;
  initialSearchQuery?: string;
}

export interface UseLogisticsResult {
  entries: LogisticsEntry[];
  filteredEntries: LogisticsEntry[];
  loading: boolean;
  error: Error | null;
  metrics: LogisticsMetrics;

  // Filter States & Setters
  onlyAssigned: boolean;
  setOnlyAssigned: (val: boolean | ((prev: boolean) => boolean)) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;

  // Mutations & Actions
  updateStatus: (entryId: string, status: string, note?: string) => Promise<void>;
  addNote: (entryId: string, note: string) => Promise<void>;
  appendNote: (entryId: string, note: string) => Promise<void>;
  syncLocation: (entryId: string, location: DriverLocation) => Promise<void>;
  stopTracking: (entryId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Primary React Hook for Driver Logistics Feed.
 *
 * @param options Optional initial filter configuration.
 * @returns State, computed metrics/filtered jobs, and mutation handlers.
 */
export function useLogistics(options?: UseLogisticsOptions): UseLogisticsResult {
  const { user, tenant } = useAuth();
  const tenantId = user?.tenantId || tenant?.tenantId || '';

  const [entries, setEntries] = useState<LogisticsEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Filter States
  const [onlyAssigned, setOnlyAssigned] = useState<boolean>(
    options?.initialOnlyAssigned ?? false
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    options?.initialStatusFilter ?? 'all'
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    options?.initialSearchQuery ?? ''
  );

  // Live Subscription
  useEffect(() => {
    if (!tenantId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToLogistics(
      tenantId,
      (liveEntries) => {
        setEntries(liveEntries);
        setLoading(false);
      },
      (err) => {
        console.error('[useLogistics] Subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [tenantId]);

  // Current Driver identity representation for domain filtering
  const driverUser = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id || user.uid,
      name: user.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }, [user]);

  // Filtered entries computed via pure functional domain engine
  const filteredEntries = useMemo(() => {
    return filterLogisticsForDriver(
      entries,
      driverUser,
      onlyAssigned,
      statusFilter,
      searchQuery
    );
  }, [entries, driverUser, onlyAssigned, statusFilter, searchQuery]);

  // Aggregated summary metrics across tenant entries
  const metrics = useMemo(() => {
    return computeLogisticsMetrics(entries);
  }, [entries]);

  // Mutation: Update job status
  const handleUpdateStatus = useCallback(
    async (entryId: string, status: string, note?: string) => {
      if (!tenantId) {
        throw new Error('Cannot update status: tenantId missing');
      }
      const updatedBy = user?.name || user?.email || 'Driver';
      await updateLogisticsStatus(entryId, status, {
        note,
        updatedBy,
        tenantId,
      });
    },
    [tenantId, user]
  );

  // Mutation: Append internal note
  const handleAddNote = useCallback(
    async (entryId: string, note: string) => {
      if (!tenantId) {
        throw new Error('Cannot add note: tenantId missing');
      }
      const author = user?.name || user?.email || 'Driver';
      await appendLogisticsNote(entryId, note, author, tenantId);
    },
    [tenantId, user]
  );

  // Mutation: Sync GPS location
  const handleSyncLocation = useCallback(
    async (entryId: string, location: DriverLocation) => {
      await updateJobLocation(entryId, {
        ...location,
        driverId: location.driverId || user?.id || user?.uid,
        driverName: location.driverName || user?.name || user?.email,
      });
    },
    [user]
  );

  // Mutation: Stop tracking
  const handleStopTracking = useCallback(async (entryId: string) => {
    await stopJobTracking(entryId);
  }, []);

  // Refresh helper for manual re-fetch
  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await fetchTenantLogistics(tenantId);
      setEntries(data);
      setError(null);
    } catch (err: any) {
      console.error('[useLogistics] Refresh error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  return {
    entries,
    filteredEntries,
    loading,
    error,
    metrics,
    onlyAssigned,
    setOnlyAssigned,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    updateStatus: handleUpdateStatus,
    addNote: handleAddNote,
    appendNote: handleAddNote,
    syncLocation: handleSyncLocation,
    stopTracking: handleStopTracking,
    refresh,
  };
}

export interface UseSingleLogisticsResult {
  entry: LogisticsEntry | null;
  job: LogisticsEntry | null;
  loading: boolean;
  error: Error | null;
  updateStatus: (status: string, note?: string) => Promise<void>;
  addNote: (note: string) => Promise<void>;
  appendNote: (note: string) => Promise<void>;
  syncLocation: (location: DriverLocation) => Promise<void>;
  stopTracking: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * React Hook for viewing and managing a single logistics job.
 *
 * @param entryId Logistics document ID.
 * @returns Live single entry state and mutation helpers.
 */
export function useSingleLogistics(entryId?: string | null): UseSingleLogisticsResult {
  const { user, tenant } = useAuth();
  const tenantId = user?.tenantId || tenant?.tenantId || '';

  const [entry, setEntry] = useState<LogisticsEntry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchJob = useCallback(async () => {
    if (!entryId || !tenantId) {
      setEntry(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getLogisticsEntry(entryId, tenantId);
      setEntry(data);
      setError(null);
    } catch (err: any) {
      console.error('[useSingleLogistics] Fetch error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [entryId, tenantId]);

  useEffect(() => {
    if (!entryId || !tenantId) {
      setEntry(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeSingleLogisticsEntry(
      entryId,
      tenantId,
      (liveEntry) => {
        setEntry(liveEntry);
        setLoading(false);
      },
      (err) => {
        console.error('[useSingleLogistics] Subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [entryId, tenantId]);

  const handleUpdateStatus = useCallback(
    async (status: string, note?: string) => {
      if (!entryId || !tenantId) return;
      const updatedBy = user?.name || user?.email || 'Driver';
      await updateLogisticsStatus(entryId, status, {
        note,
        updatedBy,
        tenantId,
      });
    },
    [entryId, tenantId, user]
  );

  const handleAddNote = useCallback(
    async (note: string) => {
      if (!entryId || !tenantId) return;
      const author = user?.name || user?.email || 'Driver';
      await appendLogisticsNote(entryId, note, author, tenantId);
    },
    [entryId, tenantId, user]
  );

  const handleSyncLocation = useCallback(
    async (location: DriverLocation) => {
      if (!entryId) return;
      await updateJobLocation(entryId, {
        ...location,
        driverId: location.driverId || user?.id || user?.uid,
        driverName: location.driverName || user?.name || user?.email,
      });
    },
    [entryId, user]
  );

  const handleStopTracking = useCallback(async () => {
    if (!entryId) return;
    await stopJobTracking(entryId);
  }, [entryId]);

  return {
    entry,
    job: entry,
    loading,
    error,
    updateStatus: handleUpdateStatus,
    addNote: handleAddNote,
    appendNote: handleAddNote,
    syncLocation: handleSyncLocation,
    stopTracking: handleStopTracking,
    refresh: fetchJob,
  };
}

/**
 * Alias for useSingleLogistics.
 */
export const useLogisticsJob = useSingleLogistics;
