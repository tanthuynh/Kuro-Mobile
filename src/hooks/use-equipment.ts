/**
 * src/hooks/use-equipment.ts
 * Real-time React hook for Equipment & Inventory Catalog in Kuro Mobile.
 * Subscribes to live Firestore equipment collection and provides multi-field
 * search, category filtering, availability state, and O(1) lookup maps.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  subscribeEquipment,
  fetchEquipment,
  searchEquipment,
} from '@/services/equipment-service';
import {
  getCachedEquipment,
  getCachedLookupMap,
  buildEquipmentLookupMap,
  handleTenantChange,
  handleAuthIdentityChange,
} from '@/services/equipment-cache';
import type { Equipment } from '@/types/equipment';

export interface UseEquipmentResult {
  equipment: Equipment[];
  filteredEquipment: Equipment[];
  equipmentLookupMap: Map<string, Equipment>;
  loading: boolean;
  error: Error | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  availabilityFilter: string;
  setAvailabilityFilter: (avail: string) => void;
  refresh: () => Promise<void>;
  metrics: {
    totalItems: number;
    availableCount: number;
    inUseCount: number;
    inRepairCount: number;
  };
}

export function useEquipment(): UseEquipmentResult {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.tenantId || user?.tenantId || '';
  const uid = user?.uid || '';

  const [equipment, setEquipment] = useState<Equipment[]>(() => {
    return (tenantId ? getCachedEquipment(tenantId, { uid }) : null) || [];
  });
  const [sharedLookupMap, setSharedLookupMap] = useState<Map<string, Equipment>>(() => {
    return (tenantId ? getCachedLookupMap(tenantId, { uid }) : null) || new Map();
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!tenantId) return false;
    return !getCachedEquipment(tenantId, { uid });
  });
  const [error, setError] = useState<Error | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('All');

  const [currentIdentity, setCurrentIdentity] = useState({ tenantId, uid });
  const isMountedRef = useRef(true);
  const activeTenantRef = useRef(tenantId);
  activeTenantRef.current = tenantId;
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  // Render-time state sync to guarantee zero stale data leakage on identity switch
  if (currentIdentity.tenantId !== tenantId || currentIdentity.uid !== uid) {
    setCurrentIdentity({ tenantId, uid });
    if (currentIdentity.tenantId && currentIdentity.tenantId !== tenantId) {
      handleTenantChange(tenantId, currentIdentity.tenantId);
    }
    if (currentIdentity.uid && currentIdentity.uid !== uid) {
      handleAuthIdentityChange(uid || null);
    }
    const cachedData = tenantId ? getCachedEquipment(tenantId, { uid }) : null;
    const cachedMap = tenantId ? getCachedLookupMap(tenantId, { uid }) : null;
    setEquipment(cachedData || []);
    setSharedLookupMap(cachedMap || new Map());
    setLoading(tenantId ? !cachedData : false);
    setError(null);
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!tenantId) {
      setEquipment([]);
      setSharedLookupMap(new Map());
      setLoading(false);
      setError(null);
      return;
    }

    const cachedData = getCachedEquipment(tenantId, { uid });
    const cachedMap = getCachedLookupMap(tenantId, { uid });

    if (cachedData && cachedMap) {
      setEquipment(cachedData);
      setSharedLookupMap(cachedMap);
      setLoading(false);
    } else {
      setEquipment([]);
      setSharedLookupMap(new Map());
      setLoading(true);
    }
    setError(null);

    const unsubscribe = subscribeEquipment(
      tenantId,
      (data, lookupMap) => {
        setEquipment(data);
        if (lookupMap) {
          setSharedLookupMap(lookupMap);
        } else {
          setSharedLookupMap(getCachedLookupMap(tenantId, { uid }) || new Map());
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useEquipment] Subscription error:', err);
        setError(err);
        setLoading(false);
      },
      { uid }
    );

    return () => {
      unsubscribe();
    };
  }, [tenantId, uid]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const reqTenant = tenantId;
    const reqUid = uid;
    try {
      setLoading(true);
      await fetchEquipment(tenantId, { uid });
      if (isMountedRef.current && activeTenantRef.current === reqTenant && activeUidRef.current === reqUid) {
        setError(null);
      }
    } catch (err: any) {
      if (isMountedRef.current && activeTenantRef.current === reqTenant && activeUidRef.current === reqUid) {
        console.error('[useEquipment] Refresh error:', err);
        setError(err);
      }
    } finally {
      if (isMountedRef.current && activeTenantRef.current === reqTenant && activeUidRef.current === reqUid) {
        setLoading(false);
      }
    }
  }, [tenantId, uid]);

  // Use pre-computed stable lookup map from shared cache, falling back to build if needed
  const equipmentLookupMap = useMemo<Map<string, Equipment>>(() => {
    if (sharedLookupMap.size > 0 || equipment.length === 0) {
      return sharedLookupMap;
    }
    return buildEquipmentLookupMap(equipment);
  }, [equipment, sharedLookupMap]);

  // Filtered equipment list (per-consumer local search & filtering)
  const filteredEquipment = useMemo<Equipment[]>(() => {
    return searchEquipment(
      equipment,
      searchQuery,
      selectedCategory,
      availabilityFilter
    );
  }, [equipment, searchQuery, selectedCategory, availabilityFilter]);

  // Inventory metrics
  const metrics = useMemo(() => {
    let availableCount = 0;
    let inUseCount = 0;
    let inRepairCount = 0;

    for (const item of equipment) {
      if (item.archived) continue;
      const total = typeof item.quantity === 'number' ? item.quantity : 1;
      const consumed = item.consumedQuantity || 0;
      const avail = Math.max(0, total - consumed);

      if (avail > 0) availableCount += avail;
      if (consumed > 0) inUseCount += consumed;

      if (item.serialNumbers) {
        for (const sn of item.serialNumbers) {
          if (sn.status === 'In Repair') inRepairCount += 1;
        }
      }
    }

    return {
      totalItems: equipment.filter((e) => !e.archived).length,
      availableCount,
      inUseCount,
      inRepairCount,
    };
  }, [equipment]);

  return {
    equipment,
    filteredEquipment,
    equipmentLookupMap,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    availabilityFilter,
    setAvailabilityFilter,
    refresh,
    metrics,
  };
}
