/**
 * src/services/equipment-service.ts
 * Real-time Firestore service and multi-field search engine for Equipment in Kuro Mobile.
 * Synchronizes tenant equipment catalog and provides client-side multi-field querying.
 */

import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Equipment, SerialNumber } from '@/types/equipment';

/**
 * Maps a raw Firestore document into a strongly typed Equipment object.
 */
export function mapFirestoreEquipmentDoc(docSnap: any): Equipment {
  const data = docSnap.data ? docSnap.data() : docSnap;

  const serialNumbers: SerialNumber[] = Array.isArray(data.serialNumbers)
    ? data.serialNumbers.map((sn: any, idx: number) => ({
        id: sn.id || `sn-${idx}`,
        serial: sn.serial || '',
        status: sn.status || 'Available',
        currentLocation: sn.currentLocation,
        notes: sn.notes,
      }))
    : [];

  return {
    id: docSnap.id || data.id,
    tenantId: data.tenantId,
    name: data.name || 'Unnamed Equipment',
    manufacturer: data.manufacturer,
    model: data.model,
    category: data.category || 'General',
    categoryId: data.categoryId,
    barcode: data.barcode,
    assetNumber: data.assetNumber,
    segAssetNumber: data.segAssetNumber,
    serialNumber: data.serialNumber,
    serialNumbers,
    knownLocation: data.knownLocation,
    venue: data.venue,
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    consumedQuantity: typeof data.consumedQuantity === 'number' ? data.consumedQuantity : 0,
    quantityDispatched: typeof data.quantityDispatched === 'number' ? data.quantityDispatched : 0,
    quantityReturned: typeof data.quantityReturned === 'number' ? data.quantityReturned : 0,
    price: data.price,
    subrental_costs: data.subrental_costs,
    maxDiscount: data.maxDiscount,
    powerW: data.powerW,
    weight: data.weight,
    weightWithContents: data.weightWithContents,
    height: data.height,
    width: data.width,
    length: data.length,
    input: data.input,
    output: data.output,
    channels: data.channels,
    caseType: data.caseType,
    itemClass: data.itemClass,
    equipmentType: data.equipmentType,
    serialisation: data.serialisation,
    notes: data.notes,
    archived: data.archived === true,
    manualUrl: data.manualUrl,
    contents: data.contents,
  };
}

/**
 * Subscribes to live real-time updates for all non-archived equipment belonging to the tenant.
 */
export function subscribeEquipment(
  tenantId: string,
  onData: (items: Equipment[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!tenantId) {
    onData([]);
    return () => {};
  }

  try {
    const q = query(
      collection(db, 'equipment'),
      where('tenantId', '==', tenantId)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const equipment: Equipment[] = [];
        snapshot.forEach((docSnap) => {
          const item = mapFirestoreEquipmentDoc(docSnap);
          if (item.tenantId === tenantId && !item.archived) {
            equipment.push(item);
          }
        });
        onData(equipment);
      },
      (err) => {
        console.error('[equipmentService] subscribeEquipment error:', err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.error('[equipmentService] Failed to establish equipment listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetches tenant equipment once without maintaining a live listener.
 */
export async function fetchEquipment(tenantId: string): Promise<Equipment[]> {
  if (!tenantId) return [];

  const q = query(
    collection(db, 'equipment'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);
  const equipment: Equipment[] = [];
  snapshot.forEach((docSnap) => {
    const item = mapFirestoreEquipmentDoc(docSnap);
    if (item.tenantId === tenantId && !item.archived) {
      equipment.push(item);
    }
  });

  return equipment;
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
      const totalQty = item.quantity || 1;
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
    if (item.serialNumbers?.some((sn) => sn.serial.toLowerCase().includes(cleanQuery))) {
      return true;
    }

    return false;
  });
}
