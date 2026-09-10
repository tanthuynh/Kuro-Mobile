/**
 * src/services/equipment-service.ts
 * Real-time Firestore service and multi-field search engine for Equipment in Kuro Mobile.
 * Synchronizes tenant equipment catalog and provides client-side multi-field querying.
 */

import type { Unsubscribe } from 'firebase/firestore';
import type { Equipment } from '@/types/equipment';
import {
  subscribeSharedEquipment,
  refreshSharedEquipment,
  mapEquipmentDoc,
} from './equipment-cache';

/**
 * Maps a raw Firestore document into a strongly typed Equipment object.
 */
export function mapFirestoreEquipmentDoc(docSnap: any): Equipment {
  return mapEquipmentDoc(docSnap);
}

/**
 * Subscribes to live real-time updates for all non-archived equipment belonging to the tenant.
 */
export function subscribeEquipment(
  tenantId: string,
  onData: (items: Equipment[], lookupMap?: Map<string, Equipment>) => void,
  onError?: (err: Error) => void,
  options?: { uid?: string; queryScope?: string }
): Unsubscribe {
  if (!tenantId) {
    onData([], new Map());
    return () => {};
  }

  return subscribeSharedEquipment(
    tenantId,
    {
      onData: (items, lookupMap) => {
        onData(items, lookupMap);
      },
      onError: (err) => {
        console.error('[equipmentService] subscribeEquipment error:', err);
        if (onError) onError(err);
      },
    },
    options
  );
}

/**
 * Fetches tenant equipment once without maintaining a live listener.
 */
export async function fetchEquipment(
  tenantId: string,
  options?: { uid?: string; queryScope?: string }
): Promise<Equipment[]> {
  if (!tenantId) return [];
  return refreshSharedEquipment(tenantId, options);
}

/**
 * Performs fast multi-field search and filtering across the equipment catalog.
 */
export function searchEquipment(
  items: Equipment[],
  queryText: string = '',
  categoryFilter?: string,
  availabilityFilter?: string
): Equipment[] {
  const cleanQuery = (queryText || '').trim().toLowerCase();
  const cleanCategory = (categoryFilter || '').trim().toLowerCase();
  const cleanAvail = (availabilityFilter || '').trim().toLowerCase();

  return items.filter((item) => {
    if (item.archived) return false;

    // 1. Category Filter Match
    if (cleanCategory && cleanCategory !== 'all') {
      const itemCat = (item.category || '').toLowerCase();
      if (itemCat !== cleanCategory && item.categoryId !== categoryFilter) {
        return false;
      }
    }

    // 2. Availability Filter Match
    if (cleanAvail && cleanAvail !== 'all') {
      const totalQty = typeof item.quantity === 'number' ? item.quantity : 1;
      const consumed = item.consumedQuantity || 0;
      const availableQty = Math.max(0, totalQty - consumed);

      if (cleanAvail === 'available') {
        const hasAvailableSerials = item.serialNumbers?.some((sn) => sn.status === 'Available');
        if (availableQty <= 0 && !hasAvailableSerials) return false;
      } else if (cleanAvail === 'in use' || cleanAvail === 'in-use') {
        const hasInUseSerials = item.serialNumbers?.some((sn) => sn.status === 'In Use');
        if (consumed <= 0 && !hasInUseSerials) return false;
      } else if (cleanAvail === 'in repair' || cleanAvail === 'in-repair') {
        const hasRepairSerials = item.serialNumbers?.some((sn) => sn.status === 'In Repair');
        if (!hasRepairSerials) return false;
      }
    }

    // 3. Search Query Text Match (Multi-field)
    if (!cleanQuery) return true;

    // Name, make, model
    if (item.name && item.name.toLowerCase().includes(cleanQuery)) return true;
    if (item.manufacturer && item.manufacturer.toLowerCase().includes(cleanQuery)) return true;
    if (item.model && item.model.toLowerCase().includes(cleanQuery)) return true;

    // Barcode, asset tag, serial
    if (item.barcode && item.barcode.toLowerCase().includes(cleanQuery)) return true;
    if (item.assetNumber && item.assetNumber.toLowerCase().includes(cleanQuery)) return true;
    if (item.segAssetNumber && item.segAssetNumber.toLowerCase().includes(cleanQuery)) return true;
    if (item.serialNumber && item.serialNumber.toLowerCase().includes(cleanQuery)) return true;

    // Location & Category
    if (item.knownLocation && item.knownLocation.toLowerCase().includes(cleanQuery)) return true;
    if (item.category && item.category.toLowerCase().includes(cleanQuery)) return true;

    // Serial numbers array
    if (item.serialNumbers?.some((sn) => sn && sn.serial && sn.serial.toLowerCase().includes(cleanQuery))) {
      return true;
    }

    return false;
  });
}
