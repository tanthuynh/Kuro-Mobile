/**
 * src/hooks/use-logistics.ts
 * Reactive React Hooks for Kuro Mobile Logistics & Driver workflows.
 * Subscribes to real-time Firestore multi-tenant logistics streams,
 * computes driver filtered entries and aggregate metrics, and exposes mutation actions.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  fetchVehicleById,
  formatVehicleDisplayName,
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
  metrics: LogisticsMetrics;
  loading: boolean;
  error: Error | null;

  // Filter Controls
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

  // Synchronously purge stale logistics entries when tenantId changes
  const currentTenantRef = useRef(tenantId);
  if (currentTenantRef.current !== tenantId) {
    currentTenantRef.current = tenantId;
    setEntries([]);
    setLoading(tenantId ? true : false);
    setError(null);
  }

  // Filter States
  const [onlyAssigned, setOnlyAssigned] = useState<boolean>(
    options?.initialOnlyAssigned ?? false
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    options?.initialStatusFilter ?? 'All'
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

  // Resolved vehicle display names indexed by vehicleId
  const [vehicleNamesMap, setVehicleNamesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!entries.length || !tenantId) {
      return;
    }

    const unmappedIds = Array.from(
      new Set(
        entries
          .map((e) => e.vehicleId)
          .filter((vId): vId is string => Boolean(vId && vId.trim() && !vehicleNamesMap[vId]))
      )
    );

    if (!unmappedIds.length) {
      return;
    }

    let isMounted = true;

    Promise.all(
      unmappedIds.map(async (vId) => {
        try {
          const veh = await fetchVehicleById(vId, tenantId);
          return { vId, name: formatVehicleDisplayName(veh, vId) };
        } catch {
          return { vId, name: vId };
        }
      })
    ).then((resolved) => {
      if (!isMounted) return;
      setVehicleNamesMap((prev) => {
        const next = { ...prev };
        resolved.forEach(({ vId, name }) => {
          next[vId] = name;
        });
        return next;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [entries, tenantId, vehicleNamesMap]);

  // Enriched entries with resolved vehicleName
  const enrichedEntries = useMemo(() => {
    if (Object.keys(vehicleNamesMap).length === 0) {
      return entries;
    }
    return entries.map((entry) => {
      if (entry.vehicleId && vehicleNamesMap[entry.vehicleId]) {
        return {
          ...entry,
          vehicleName: vehicleNamesMap[entry.vehicleId],
        };
      }
      return entry;
    });
  }, [entries, vehicleNamesMap]);

  // Filtered entries computed via pure functional domain engine
  const filteredEntries = useMemo(() => {
    return filterLogisticsForDriver(
      enrichedEntries,
      driverUser,
      onlyAssigned,
      statusFilter,
      searchQuery
    );
  }, [enrichedEntries, driverUser, onlyAssigned, statusFilter, searchQuery]);

  // Aggregated summary metrics across tenant entries
  const metrics = useMemo(() => {
    return computeLogisticsMetrics(enrichedEntries);
  }, [enrichedEntries]);

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
    entries: enrichedEntries,
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

  // Synchronously purge stale entry when entryId or tenantId changes
  const currentScopeRef = useRef({ entryId, tenantId });
  if (
    currentScopeRef.current.entryId !== entryId ||
    currentScopeRef.current.tenantId !== tenantId
  ) {
    currentScopeRef.current = { entryId, tenantId };
    setEntry(null);
    setLoading(entryId && tenantId ? true : false);
    setError(null);
  }

  const fetchJob = useCallback(async () => {
    if (!entryId || !tenantId) {
      setEntry(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getLogisticsEntry(entryId, tenantId);
      if (
        currentScopeRef.current.entryId === entryId &&
        currentScopeRef.current.tenantId === tenantId
      ) {
        setEntry(data);
        setError(null);
      }
    } catch (err: any) {
      if (
        currentScopeRef.current.entryId === entryId &&
        currentScopeRef.current.tenantId === tenantId
      ) {
        console.error('[useSingleLogistics] Fetch error:', err);
        setError(err);
      }
    } finally {
      if (
        currentScopeRef.current.entryId === entryId &&
        currentScopeRef.current.tenantId === tenantId
      ) {
        setLoading(false);
      }
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
        if (
          currentScopeRef.current.entryId === entryId &&
          currentScopeRef.current.tenantId === tenantId
        ) {
          setEntry(liveEntry);
          setLoading(false);
        }
      },
      (err) => {
        if (
          currentScopeRef.current.entryId === entryId &&
          currentScopeRef.current.tenantId === tenantId
        ) {
          console.error('[useSingleLogistics] Subscription error:', err);
          setError(err);
          setLoading(false);
        }
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
