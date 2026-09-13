/**
 * src/hooks/use-pull-sheet.ts
 * Real-time React hook for Mobile Pull Sheet management in Kuro Mobile.
 * Subscribes to live Firestore pullsheet documents, supports confirmed status
 * progressions, scanned count increments, bulk confirm, search, and category filtering.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  subscribePullsheet,
  fetchPullsheet,
  updatePullsheetItemStatus,
  updatePullsheetItemScannedCount,
  bulkConfirmPullsheet,
  isOnline,
  reconcilePendingOperation,
  retryPendingOperation,
  getPendingOperations,
  subscribePendingOperations,
  type PendingOperationRecord,
  type CommandExecutionResult,
} from '@/services/pull-sheet-service';
import {
  calculatePullsheetProgress,
  groupPullsheetBySections,
  getNextPullsheetStatus,
  getPreviousPullsheetStatus,
  normalizePullsheetStatus,
  isActionablePullsheetItem,
} from '@/lib/pull-sheet-engine';
import { HapticService } from '@/services/haptic-service';
import { AudioService } from '@/services/audio-service';
import type {
  Pullsheet,
  PullsheetItem,
  PullsheetItemStatus,
  PullsheetProgress,
  PullsheetSection,
} from '@/types/pull-sheet';

export interface UsePullSheetResult {
  pullsheet: Pullsheet | null;
  items: PullsheetItem[];
  sections: PullsheetSection[];
  filteredSections: PullsheetSection[];
  progress: PullsheetProgress;
  loading: boolean;
  error: Error | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  updateStatus: (
    itemId: string,
    newStatus: PullsheetItemStatus,
    options?: { scannedQuantity?: number }
  ) => Promise<boolean>;
  advanceStatus: (itemId: string) => Promise<boolean>;
  rollbackStatus: (itemId: string) => Promise<boolean>;
  incrementScannedCount: (itemId: string, barcode?: string) => Promise<boolean>;
  bulkConfirm: () => Promise<boolean>;
  refresh: () => Promise<void>;
  reconcileOperation: (operationId: string) => Promise<boolean>;
  retryOperation: (operationId: string) => Promise<boolean>;
  pendingOperations: PendingOperationRecord[];
}

export function usePullSheet(eventId: string): UsePullSheetResult {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.tenantId || user?.tenantId || '';
  const currentUserId = user?.uid || 'anonymous';

  const mutationBusyRef = useRef(false);
  const snapshotRevisionRef = useRef(0);
  const [pullsheet, setPullsheet] = useState<Pullsheet | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [pendingOperations, setPendingOperations] = useState<PendingOperationRecord[]>([]);

  // Synchronously purge stale pullsheet & pending operations when identity changes
  const identityRef = useRef({ tenantId, eventId, currentUserId });
  if (
    identityRef.current.tenantId !== tenantId ||
    identityRef.current.eventId !== eventId ||
    identityRef.current.currentUserId !== currentUserId
  ) {
    identityRef.current = { tenantId, eventId, currentUserId };
    setPullsheet(null);
    setPendingOperations([]);
    setError(null);
    setLoading(tenantId && eventId ? true : false);
  }

  useEffect(() => {
    if (!eventId || !tenantId) {
      setPullsheet(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let subscribed = true;
    const unsubscribe = subscribePullsheet(
      eventId,
      tenantId,
      (data) => {
        if (
          subscribed && identityRef.current.tenantId === tenantId &&
          identityRef.current.eventId === eventId &&
          identityRef.current.currentUserId === currentUserId
        ) {
          snapshotRevisionRef.current++;
          setPullsheet(data);
          setLoading(false);
        }
      },
      (err) => {
        if (
          subscribed && identityRef.current.tenantId === tenantId &&
          identityRef.current.eventId === eventId &&
          identityRef.current.currentUserId === currentUserId
        ) {
          console.error(`[usePullSheet] Subscription error for ${eventId}:`, err);
          setError(err);
          setLoading(false);
        }
      }
    );

    return () => {
      subscribed = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [eventId, tenantId, currentUserId]);

  const refreshGenRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!eventId || !tenantId) return;
    const currentGen = ++refreshGenRef.current;
    const revision = snapshotRevisionRef.current;
    try {
      setLoading(true);
      const fresh = await fetchPullsheet(eventId, tenantId);
      if (
        currentGen === refreshGenRef.current &&
        identityRef.current.tenantId === tenantId &&
        identityRef.current.eventId === eventId &&
          identityRef.current.currentUserId === currentUserId
      ) {
        if (snapshotRevisionRef.current === revision) setPullsheet(fresh);
        setError(null);
      }
    } catch (err: any) {
      if (
        currentGen === refreshGenRef.current &&
        identityRef.current.tenantId === tenantId &&
        identityRef.current.eventId === eventId &&
          identityRef.current.currentUserId === currentUserId
      ) {
        console.error(`[usePullSheet] Refresh error for ${eventId}:`, err);
        setError(err);
      }
    } finally {
      if (
        currentGen === refreshGenRef.current &&
        identityRef.current.tenantId === tenantId &&
        identityRef.current.eventId === eventId &&
          identityRef.current.currentUserId === currentUserId
      ) {
        setLoading(false);
      }
    }
  }, [eventId, tenantId, currentUserId]);

  // Reconcile pending in-flight operations on initial mount or cold start
  useEffect(() => {
    if (!eventId || !tenantId || !currentUserId) return;
    let isMounted = true;
    const unsubscribePending = subscribePendingOperations(tenantId, currentUserId, (records) => {
      if (isMounted && identityRef.current.tenantId === tenantId &&
          identityRef.current.currentUserId === currentUserId && identityRef.current.eventId === eventId) {
        setPendingOperations(records.filter((op) => op.eventId === eventId));
      }
    });

    (async () => {
      try {
        const allPending = await getPendingOperations(tenantId, currentUserId);
        const eventOps = allPending.filter((op) => op.eventId === eventId);
        if (
          isMounted &&
          eventOps.length > 0 &&
          identityRef.current.tenantId === tenantId &&
          identityRef.current.eventId === eventId &&
          identityRef.current.currentUserId === currentUserId
        ) {
          setPendingOperations(eventOps);
        }

        if (eventOps.length > 0 && isOnline()) {
          let anyCommitted = false;
          for (const op of eventOps) {
            const res = await reconcilePendingOperation(op.eventId, op.tenantId, op.userId, op.operationId);
            if (res.success && res.status === 'committed') anyCommitted = true;
          }
          if (isMounted && anyCommitted && identityRef.current.tenantId === tenantId &&
              identityRef.current.eventId === eventId && identityRef.current.currentUserId === currentUserId) {
            await refresh();
          }
          const updated = await getPendingOperations(tenantId, currentUserId);
          if (
            isMounted &&
            identityRef.current.tenantId === tenantId &&
            identityRef.current.eventId === eventId &&
            identityRef.current.currentUserId === currentUserId
          ) {
            const remaining = updated.filter((op) => op.eventId === eventId);
            setPendingOperations(remaining);
          }
        }
      } catch (e) {
        console.warn('[usePullSheet] Cold-start reconciliation error:', e);
      }
    })();

    return () => {
      isMounted = false;
      unsubscribePending();
    };
  }, [eventId, tenantId, currentUserId, refresh]);

  const items = useMemo<PullsheetItem[]>(() => {
    return pullsheet?.items || [];
  }, [pullsheet]);

  const progress = useMemo<PullsheetProgress>(() => {
    return calculatePullsheetProgress(items);
  }, [items]);

  const sections = useMemo<PullsheetSection[]>(() => {
    return groupPullsheetBySections(items);
  }, [items]);

  // Filter sections and items based on search query and selected category
  const filteredSections = useMemo<PullsheetSection[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const cat = selectedCategory.trim().toLowerCase();

    // Map parent-child relationships for search matching across the entire pullsheet
    const itemMap = new Map<string, PullsheetItem>();
    items.forEach((it) => itemMap.set(it.id, it));

    const childToParent = new Map<string, string>();
    const parentToChildren = new Map<string, Set<string>>();

    let lastParentId: string | null = null;
    for (const it of items) {
      if (it.type === 'section-header') {
        lastParentId = null;
        continue;
      }
      if (it.type === 'note' || it.type === 'section-footer') continue;

      const pId = it.parentItemId || (it.type === 'sub-item' ? lastParentId : null);
      if (pId && itemMap.has(pId)) {
        childToParent.set(it.id, pId);
        if (!parentToChildren.has(pId)) parentToChildren.set(pId, new Set());
        parentToChildren.get(pId)!.add(it.id);
      }

      if (it.type !== 'sub-item' && !it.parentItemId) {
        lastParentId = it.id;
      }
    }

    const itemSelfMatchesQuery = (item: PullsheetItem, query: string): boolean => {
      const matchesDesc = item.description?.toLowerCase().includes(query);
      const matchesNote = item.internalNote?.toLowerCase().includes(query);
      const matchesBarcodes = item.scannedBarcodes?.some((b) => b.toLowerCase().includes(query));
      return Boolean(matchesDesc || matchesNote || matchesBarcodes);
    };

    // An item matches query if itself matches, or any ancestor matches, or any descendant matches
    const itemMatchesQuery = (item: PullsheetItem, query: string): boolean => {
      if (!query) return true;
      if (itemSelfMatchesQuery(item, query)) return true;

      // Check ancestors
      let pId = childToParent.get(item.id);
      const visitedP = new Set<string>();
      while (pId && !visitedP.has(pId)) {
        visitedP.add(pId);
        const pItem = itemMap.get(pId);
        if (pItem && itemSelfMatchesQuery(pItem, query)) return true;
        pId = childToParent.get(pId);
      }

      // Check descendants
      const checkDescendants = (id: string, visitedD: Set<string>): boolean => {
        const children = parentToChildren.get(id);
        if (!children) return false;
        for (const cId of children) {
          if (visitedD.has(cId)) continue;
          visitedD.add(cId);
          const cItem = itemMap.get(cId);
          if (cItem && (itemSelfMatchesQuery(cItem, query) || checkDescendants(cId, visitedD))) {
            return true;
          }
        }
        return false;
      };

      return checkDescendants(item.id, new Set<string>());
    };

    return sections
      .map((section) => {
        const filteredItems = section.items.filter((item) => {
          // Strictly omit service items
          if ((item as any).type === 'service') return false;

          // Search query check (hierarchy-aware)
          if (q && !itemMatchesQuery(item, q)) {
            return false;
          }

          // Category filter check (e.g. Audio, Lighting, Rigging, etc.)
          if (cat && cat !== 'all') {
            const itemDesc = (item.description || '').toLowerCase();
            const sectionTitle = (section.title || '').toLowerCase();
            if (!itemDesc.includes(cat) && !sectionTitle.includes(cat)) {
              return false;
            }
          }

          return true;
        });

        return {
          ...section,
          items: filteredItems,
        };
      })
      .filter((section) => section.items.length > 0);
  }, [sections, searchQuery, selectedCategory, items]);

  // Confirmed state only: a failed request must never roll a newer snapshot back.
  const runMutation = useCallback(async (
    command: () => Promise<CommandExecutionResult>
  ): Promise<boolean> => {
    if (mutationBusyRef.current) return false;
    mutationBusyRef.current = true;
    const identity = identityRef.current;
    const revision = snapshotRevisionRef.current;
    const current = () => identityRef.current === identity;
    let acknowledged = false;
    try {
      setError(null);
      const result = await command();
      if (!current()) return false;
      acknowledged = result.success;
      const records = await getPendingOperations(tenantId, currentUserId);
      if (!current()) return false;
      setPendingOperations(records.filter((op) => op.eventId === eventId));
      if (!result.success) {
        setError(new Error(result.error || 'Save failed. Check status before retrying.'));
        await HapticService.scanError();
        return false;
      }
      if (result.item && snapshotRevisionRef.current === revision) {
        setPullsheet((prev) => prev ? { ...prev, items: prev.items.map((it) =>
          it.id === result.item.id ? { ...it, ...result.item } : it) } : prev);
      }
      if (result.reconciliationStatus === 'pending' || result.reconciliationStatus === 'failed') {
        setError(new Error('Changes saved. Inventory synchronization is pending; use Retry to finish synchronization.'));
        return true;
      }
      await HapticService.scanSuccess();
      await AudioService.playScanSuccess();
      return true;
    } catch (err: any) {
      if (current()) setError(new Error(acknowledged
        ? 'Changes saved. Unable to refresh recovery state; reopen the pull sheet to check.'
        : err?.message || 'Unable to verify save state.'));
      return acknowledged;
    } finally { mutationBusyRef.current = false; }
  }, [tenantId, currentUserId, eventId]);

  const updateStatus = useCallback(async (
    itemId: string, newStatus: PullsheetItemStatus, options?: { scannedQuantity?: number }
  ): Promise<boolean> => {
    if (!eventId || !tenantId || !items.some((it) => it.id === itemId && isActionablePullsheetItem(it))) return false;
    return runMutation(() => updatePullsheetItemStatus(eventId, tenantId, itemId, newStatus,
      { uid: currentUserId }, options));
  }, [eventId, tenantId, currentUserId, items, runMutation]);

  // Advance item status to next step in lifecycle
  const advanceStatus = useCallback(
    async (itemId: string): Promise<boolean> => {
      const item = items.find((it) => it.id === itemId);
      if (!item || !isActionablePullsheetItem(item)) return false;

      const currentStatus = normalizePullsheetStatus(item.status);
      const nextStatus = getNextPullsheetStatus(currentStatus);
      return updateStatus(itemId, nextStatus);
    },
    [items, updateStatus]
  );

  // Rollback item status to previous step
  const rollbackStatus = useCallback(
    async (itemId: string): Promise<boolean> => {
      const item = items.find((it) => it.id === itemId);
      if (!item || !isActionablePullsheetItem(item)) return false;

      const currentStatus = normalizePullsheetStatus(item.status);
      const prevStatus = getPreviousPullsheetStatus(currentStatus);
      const targetQty = Math.max(1, item.quantity || 1);
      const newScannedQty =
        currentStatus === 'prepped_scanned'
          ? 0
          : prevStatus === 'prepped_scanned'
          ? targetQty
          : item.scannedQuantity;
      return updateStatus(itemId, prevStatus, { scannedQuantity: newScannedQty });
    },
    [items, updateStatus]
  );

  const incrementScannedCount = useCallback(async (itemId: string, serializedBarcode?: string): Promise<boolean> => {
    const item = items.find((it) => it.id === itemId);
    if (!eventId || !tenantId || !item || !isActionablePullsheetItem(item)) return false;
    const current = item.scannedQuantity ?? (item.status === 'prepped_scanned' ? item.quantity : 0);
    if (current >= item.quantity) return false;
    return runMutation(() => updatePullsheetItemScannedCount(eventId, tenantId, itemId,
      current + 1, current + 1 >= item.quantity, { uid: currentUserId }, serializedBarcode));
  }, [eventId, tenantId, currentUserId, items, runMutation]);

  const bulkConfirm = useCallback(async (): Promise<boolean> => {
    if (!eventId || !tenantId) return false;
    return runMutation(() => bulkConfirmPullsheet(eventId, tenantId, { uid: currentUserId }));
  }, [eventId, tenantId, currentUserId, runMutation]);

  const reconcileOperation = useCallback(async (operationId: string): Promise<boolean> => {
    if (mutationBusyRef.current) return false;
    mutationBusyRef.current = true;
    const identity = identityRef.current;
    try {
      const result = await reconcilePendingOperation(eventId, tenantId, currentUserId, operationId);
      const records = await getPendingOperations(tenantId, currentUserId);
      if (identityRef.current !== identity) return false;
      setPendingOperations(records.filter((op) => op.eventId === eventId));
      if (!result.success) { setError(new Error(result.error || 'Status check failed.')); return false; }
      if (result.status === 'committed') {
        await refresh();
        if (identityRef.current !== identity) return false;
        if (result.reconciliationStatus === 'failed' || result.reconciliationStatus === 'pending') {
          setError(new Error('Changes saved. Retry to finish inventory synchronization.'));
        }
        return true;
      }
      return false;
    } catch (err: any) {
      if (identityRef.current === identity) setError(new Error(err.message));
      return false;
    } finally { mutationBusyRef.current = false; }
  }, [eventId, tenantId, currentUserId, refresh]);

  const retryOperation = useCallback(async (operationId: string): Promise<boolean> => {
    return runMutation(async () => {
      const records = await getPendingOperations(tenantId, currentUserId);
      const op = records.find((record) => record.operationId === operationId && record.eventId === eventId);
      if (!op) return { success: false, error: 'Original save record not found. Check status first.' };
      return retryPendingOperation(op, { uid: currentUserId });
    });
  }, [eventId, tenantId, currentUserId, runMutation]);

  return {
    pullsheet,
    items,
    sections,
    filteredSections,
    progress,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    updateStatus,
    advanceStatus,
    rollbackStatus,
    incrementScannedCount,
    bulkConfirm,
    refresh,
    reconcileOperation,
    retryOperation,
    pendingOperations,
  };
}
