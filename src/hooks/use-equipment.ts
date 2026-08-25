/**
 * src/hooks/use-equipment.ts
 * Real-time React hook for Equipment & Inventory Catalog in Kuro Mobile.
 * Subscribes to live Firestore equipment collection and provides multi-field
 * search, category filtering, availability state, and O(1) lookup maps.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  subscribeEquipment,
  fetchEquipment,
  searchEquipment,
} from '@/services/equipment-service';
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

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('All');

  useEffect(() => {
    if (!tenantId) {
      setEquipment([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeEquipment(
      tenantId,
      (data) => {
        setEquipment(data);
        setLoading(false);
      },
      (err) => {
        console.error('[useEquipment] Subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [tenantId]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const fresh = await fetchEquipment(tenantId);
      setEquipment(fresh);
      setError(null);
    } catch (err: any) {
      console.error('[useEquipment] Refresh error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Build O(1) multi-key lookup map for scanner
  const equipmentLookupMap = useMemo<Map<string, Equipment>>(() => {
    const map = new Map<string, Equipment>();
    for (const eq of equipment) {
      if (eq.id) map.set(eq.id, eq);
      if (eq.barcode) map.set(eq.barcode.toLowerCase(), eq);
      if (eq.serialNumber) map.set(eq.serialNumber.toLowerCase(), eq);
      if (eq.assetNumber) map.set(eq.assetNumber.toLowerCase(), eq);
      if (eq.segAssetNumber) map.set(eq.segAssetNumber.toLowerCase(), eq);
      if (eq.serialNumbers) {
        for (const sn of eq.serialNumbers) {
          if (sn.serial) map.set(sn.serial.toLowerCase(), eq);
        }
      }
    }
    return map;
  }, [equipment]);

  // Filtered equipment list
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
      const total = item.quantity || 1;
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
