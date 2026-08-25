/**
 * src/services/pull-sheet-service.ts
 * Real-time Firestore service for Pull Sheets in Kuro Mobile.
 * Provides onSnapshot subscriptions, status mutations, continuous scan increments,
 * and bulk confirmation actions with multi-tenant scoping.
 */

import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  Pullsheet,
  PullsheetItem,
  PullsheetItemStatus,
} from '@/types/pull-sheet';
import {
  normalizePullsheetStatus,
  isActionablePullsheetItem,
} from '@/lib/pull-sheet-engine';
import { parseFirestoreDate } from '@/lib/date-utils';

/**
 * Maps a raw Firestore pullsheet document into a strongly typed Pullsheet object.
 */
export function mapFirestorePullsheetDoc(docSnap: any): Pullsheet {
  const data = docSnap.data ? docSnap.data() : docSnap;
  const rawItems = Array.isArray(data.items) ? data.items : [];

  const items: PullsheetItem[] = rawItems.map((item: any) => {
    const isActionable = isActionablePullsheetItem(item);
    return {
      id: item.id,
      sourceQuoteLineId: item.sourceQuoteLineId,
      inventoryItemId: item.inventoryItemId,
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      scannedQuantity: typeof item.scannedQuantity === 'number' ? item.scannedQuantity : undefined,
      scannedBarcodes: Array.isArray(item.scannedBarcodes) ? item.scannedBarcodes : [],
      description: item.description || '',
      internalNote: item.internalNote,
      type: item.type || 'item',
      sectionId: item.sectionId,
      parentItemId: item.parentItemId,
      hasContents: item.hasContents === true,
      unit: item.unit,
      cost: item.cost,
      discount: item.discount,
      time: item.time,
      status: isActionable ? normalizePullsheetStatus(item.status) : 'none',
      statusUpdatedAt: parseFirestoreDate(item.statusUpdatedAt),
      statusUpdatedBy: item.statusUpdatedBy,
    };
  });

  return {
    id: docSnap.id || data.id,
    eventId: data.eventId || docSnap.id || data.id,
    tenantId: data.tenantId,
    items,
    sourceCopyTimestamp: parseFirestoreDate(data.sourceCopyTimestamp),
    lastBulkConfirmAt: parseFirestoreDate(data.lastBulkConfirmAt),
    lastBulkConfirmBy: data.lastBulkConfirmBy,
    createdAt: parseFirestoreDate(data.createdAt),
    updatedAt: parseFirestoreDate(data.updatedAt),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
  };
}

/**
 * Subscribes to live real-time updates for a pull sheet document.
 */
export function subscribePullsheet(
  eventId: string,
  tenantId: string,
  onUpdate: (pullsheet: Pullsheet | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!eventId || !tenantId) {
    onUpdate(null);
    return () => {};
  }

  try {
    const docRef = doc(db, 'pullsheets', eventId);

    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onUpdate(null);
          return;
        }

        const data = snapshot.data();
        if (data.tenantId !== tenantId) {
          console.warn('[pullSheetService] Tenant mismatch on pull sheet subscription');
          onUpdate(null);
          return;
        }

        const pullsheet = mapFirestorePullsheetDoc(snapshot);
        onUpdate(pullsheet);
      },
      (err) => {
        console.error(`[pullSheetService] Subscription error for event ${eventId}:`, err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.error('[pullSheetService] Failed to establish pullsheet listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetches a pull sheet once without maintaining a real-time listener.
 */
export async function fetchPullsheet(
  eventId: string,
  tenantId: string
): Promise<Pullsheet | null> {
  if (!eventId || !tenantId) return null;

  const docRef = doc(db, 'pullsheets', eventId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.tenantId !== tenantId) return null;

  return mapFirestorePullsheetDoc(snap);
}

/**
 * Updates an individual item's lifecycle status.
 */
export async function updatePullsheetItemStatus(
  eventId: string,
  tenantId: string,
  itemId: string,
  newStatus: PullsheetItemStatus,
  user: { uid: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'pullsheets', eventId);
    const snap = await getDoc(docRef);

    if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
      return { success: false, error: 'Pull sheet not found or unauthorized' };
    }

    const currentItems: any[] = snap.data().items || [];
    let itemFound = false;

    const updatedItems = currentItems.map((item) => {
      if (item.id === itemId) {
        itemFound = true;
        const normalized = isActionablePullsheetItem(item) ? newStatus : 'none';
        return {
          ...item,
          status: normalized,
          statusUpdatedAt: serverTimestamp(),
          statusUpdatedBy: user.uid,
        };
      }
      return item;
    });

    if (!itemFound) {
      return { success: false, error: `Item with ID "${itemId}" not found on pull sheet` };
    }

    await updateDoc(docRef, {
      items: updatedItems,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[pullSheetService] updatePullsheetItemStatus error:', error);
    return { success: false, error: error.message || 'Failed to update item status' };
  }
}

/**
 * Updates an individual item's scanned quantity, with optional automatic transition
 * to 'prepped_scanned'.
 */
export async function updatePullsheetItemScannedCount(
  eventId: string,
  tenantId: string,
  itemId: string,
  newScannedCount: number,
  autoTransitionToPrepped: boolean,
  user: { uid: string },
  scannedBarcode?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'pullsheets', eventId);
    const snap = await getDoc(docRef);

    if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
      return { success: false, error: 'Pull sheet not found or unauthorized' };
    }

    const currentItems: any[] = snap.data().items || [];
    let itemFound = false;

    const updatedItems = currentItems.map((item) => {
      if (item.id === itemId) {
        itemFound = true;
        const existingBarcodes: string[] = Array.isArray(item.scannedBarcodes)
          ? [...item.scannedBarcodes]
          : [];

        if (scannedBarcode && !existingBarcodes.includes(scannedBarcode)) {
          existingBarcodes.push(scannedBarcode);
        }

        const newStatus = autoTransitionToPrepped ? 'prepped_scanned' : item.status;

        return {
          ...item,
          scannedQuantity: newScannedCount,
          scannedBarcodes: existingBarcodes,
          status: isActionablePullsheetItem(item) ? normalizePullsheetStatus(newStatus) : 'none',
          statusUpdatedAt: serverTimestamp(),
          statusUpdatedBy: user.uid,
        };
      }
      return item;
    });

    if (!itemFound) {
      return { success: false, error: `Item with ID "${itemId}" not found on pull sheet` };
    }

    await updateDoc(docRef, {
      items: updatedItems,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[pullSheetService] updatePullsheetItemScannedCount error:', error);
    return { success: false, error: error.message || 'Failed to update scanned count' };
  }
}

/**
 * Bulk confirms all actionable pending items on a pull sheet.
 */
export async function bulkConfirmPullsheet(
  eventId: string,
  tenantId: string,
  user: { uid: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'pullsheets', eventId);
    const snap = await getDoc(docRef);

    if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
      return { success: false, error: 'Pull sheet not found or unauthorized' };
    }

    const currentItems: any[] = snap.data().items || [];
    const now = serverTimestamp();
    let hasPendingChanges = false;

    const updatedItems = currentItems.map((item) => {
      const isActionable = isActionablePullsheetItem(item);
      const status = normalizePullsheetStatus(item.status);

      if (isActionable && status === 'pending') {
        hasPendingChanges = true;
        return {
          ...item,
          status: 'confirmed',
          statusUpdatedAt: now,
          statusUpdatedBy: user.uid,
        };
      }
      return item;
    });

    if (hasPendingChanges) {
      await updateDoc(docRef, {
        items: updatedItems,
        lastBulkConfirmAt: now,
        lastBulkConfirmBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[pullSheetService] bulkConfirmPullsheet error:', error);
    return { success: false, error: error.message || 'Failed to bulk confirm pull sheet' };
  }
}
