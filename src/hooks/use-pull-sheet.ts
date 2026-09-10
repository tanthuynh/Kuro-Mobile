/**
 * src/hooks/use-pull-sheet.ts
 * Real-time React hook for Mobile Pull Sheet management in Kuro Mobile.
 * Subscribes to live Firestore pullsheet documents, supports optimistic status
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
  clearPendingOperation,
  isItemOperationPending,
  hasPendingOperations,
  type PendingOperationRecord,
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
  updateStatus: (itemId: string, newStatus: PullsheetItemStatus) => Promise<boolean>;
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

    const unsubscribe = subscribePullsheet(
      eventId,
      tenantId,
      (data) => {
        if (
          identityRef.current.tenantId === tenantId &&
          identityRef.current.eventId === eventId
        ) {
          setPullsheet(data);
          setLoading(false);
        }
      },
      (err) => {
        if (
          identityRef.current.tenantId === tenantId &&
          identityRef.current.eventId === eventId
        ) {
          console.error(`[usePullSheet] Subscription error for ${eventId}:`, err);
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
    const currentGen = ++refreshGenRef.current;
    try {
      setLoading(true);
      const fresh = await fetchPullsheet(eventId, tenantId);
      if (
        currentGen === refreshGenRef.current &&
        identityRef.current.tenantId === tenantId &&
        identityRef.current.eventId === eventId
      ) {
        setPullsheet(fresh);
        setError(null);
      }
    } catch (err: any) {
      if (
        currentGen === refreshGenRef.current &&
        identityRef.current.tenantId === tenantId &&
        identityRef.current.eventId === eventId
      ) {
        console.error(`[usePullSheet] Refresh error for ${eventId}:`, err);
        setError(err);
      }
    } finally {
      if (
        currentGen === refreshGenRef.current &&
        identityRef.current.tenantId === tenantId &&
        identityRef.current.eventId === eventId
      ) {
        setLoading(false);
      }
    }
  }, [eventId, tenantId]);

  // Reconcile pending in-flight operations on initial mount or cold start
  useEffect(() => {
    if (!eventId || !tenantId || !currentUserId) return;
    let isMounted = true;

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
            if (res.success && res.status === 'committed') {
              anyCommitted = true;
              await HapticService.scanSuccess();
              await AudioService.playScanSuccess();
            }
          }
          if (isMounted && anyCommitted) {
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

  // Update item status with optimistic UI and selective rollback
  const updateStatus = useCallback(
    async (itemId: string, newStatus: PullsheetItemStatus): Promise<boolean> => {
      if (!eventId || !tenantId) return false;

      // Online Guard: offline mutations blocked immediately
      if (!isOnline()) {
        await HapticService.scanError();
        setError(new Error('Network connection required. Offline updates are disabled.'));
        return false;
      }

      // Disable conflicting actions if item has an in-flight operation or bulk confirm is pending
      const isPending =
        pendingOperations.some(
          (op) =>
            (op.state === 'in_flight' || op.state === 'outcome_unknown' || op.state === 'reconciling') &&
            (op.payload?.itemId === itemId || op.action === 'bulk_confirm')
        ) || (await isItemOperationPending(tenantId, currentUserId, itemId, eventId));

      if (isPending) {
        await HapticService.scanError();
        setError(new Error('Operation already in-flight for this item. Please wait or reconcile.'));
        return false;
      }

      const previousItem = items.find((it) => it.id === itemId);
      if (!previousItem) return false;

      // Optimistic overlay for target item
      setPullsheet((prev) => {
        if (!prev) return prev;
        const updatedItems = prev.items.map((it) => {
          if (it.id === itemId) {
            return {
              ...it,
              status: isActionablePullsheetItem(it) ? newStatus : 'none',
              statusUpdatedAt: new Date(),
              statusUpdatedBy: currentUserId,
            };
          }
          return it;
        });
        return { ...prev, items: updatedItems };
      });

      const result = await updatePullsheetItemStatus(
        eventId,
        tenantId,
        itemId,
        newStatus,
        { uid: currentUserId }
      );

      if (result.success) {
        await HapticService.mediumTap();
        return true;
      } else {
        // Selective rollback: restore ONLY target item, preserving newer live listener updates
        setPullsheet((prev) => {
          if (!prev) return prev;
          const restoredItems = prev.items.map((it) => (it.id === itemId ? previousItem : it));
          return { ...prev, items: restoredItems };
        });
        if (result.outcomeUnknown) {
          const freshOps = await getPendingOperations(tenantId, currentUserId);
          setPendingOperations(freshOps.filter((op) => op.eventId === eventId));
        }
        console.error('[usePullSheet] updateStatus failed:', result.error);
        await HapticService.scanError();
        setError(new Error(result.error || 'Failed to update item status'));
        return false;
      }
    },
    [eventId, tenantId, currentUserId, items, pendingOperations]
  );

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
      return updateStatus(itemId, prevStatus);
    },
    [items, updateStatus]
  );

  // Increment scanned quantity for prep workflow with selective rollback
  const incrementScannedCount = useCallback(
    async (itemId: string, barcode?: string): Promise<boolean> => {
      if (!eventId || !tenantId) return false;

      // Online Guard: offline scanning blocked immediately
      if (!isOnline()) {
        await HapticService.scanError();
        setError(new Error('Network connection required. Offline scanning is disabled.'));
        return false;
      }

      // Disable conflicting actions if item has an in-flight operation or bulk confirm is pending
      const isPending =
        pendingOperations.some(
          (op) =>
            (op.state === 'in_flight' || op.state === 'outcome_unknown' || op.state === 'reconciling') &&
            (op.payload?.itemId === itemId || op.action === 'bulk_confirm')
        ) || (await isItemOperationPending(tenantId, currentUserId, itemId, eventId));

      if (isPending) {
        await HapticService.scanError();
        setError(new Error('Operation already in-flight for this item. Please wait or reconcile.'));
        return false;
      }

      const previousItem = items.find((it) => it.id === itemId);
      if (!previousItem) return false;

      const targetQty = Math.max(1, previousItem.quantity || 1);
      const currentScanned = previousItem.scannedQuantity || (previousItem.status === 'prepped_scanned' ? targetQty : 0);
      const nextCount = currentScanned + 1;
      const isFullyPrepped = nextCount >= targetQty;

      // Optimistic update
      setPullsheet((prev) => {
        if (!prev) return prev;
        const updatedItems = prev.items.map((it) => {
          if (it.id === itemId) {
            const existingBarcodes = [...(it.scannedBarcodes || [])];
            if (barcode && !existingBarcodes.includes(barcode)) {
              existingBarcodes.push(barcode);
            }
            return {
              ...it,
              scannedQuantity: nextCount,
              scannedBarcodes: existingBarcodes,
              status: isFullyPrepped ? 'prepped_scanned' : it.status,
              statusUpdatedAt: new Date(),
              statusUpdatedBy: currentUserId,
            };
          }
          return it;
        });
        return { ...prev, items: updatedItems };
      });

      const result = await updatePullsheetItemScannedCount(
        eventId,
        tenantId,
        itemId,
        nextCount,
        isFullyPrepped,
        { uid: currentUserId },
        barcode
      );

      if (result.success) {
        await HapticService.scanSuccess();
        await AudioService.playScanSuccess();
        return true;
      } else {
        // Selective rollback: restore ONLY target item
        setPullsheet((prev) => {
          if (!prev) return prev;
          const restoredItems = prev.items.map((it) => (it.id === itemId ? previousItem : it));
          return { ...prev, items: restoredItems };
        });
        if (result.outcomeUnknown) {
          const freshOps = await getPendingOperations(tenantId, currentUserId);
          setPendingOperations(freshOps.filter((op) => op.eventId === eventId));
        }
        await HapticService.scanError();
        setError(new Error(result.error || 'Failed to update scanned count'));
        return false;
      }
    },
    [eventId, tenantId, currentUserId, items, pendingOperations]
  );

  // Bulk confirm all pending actionable items with selective rollback
  const bulkConfirm = useCallback(async (): Promise<boolean> => {
    if (!eventId || !tenantId) return false;

    // Online Guard: offline bulk confirm blocked immediately
    if (!isOnline()) {
      await HapticService.scanError();
      setError(new Error('Network connection required. Offline updates are disabled.'));
      return false;
    }

    const hasPending =
      pendingOperations.some(
        (op) => op.state === 'in_flight' || op.state === 'outcome_unknown' || op.state === 'reconciling'
      ) || (await hasPendingOperations(tenantId, currentUserId, eventId));

    if (hasPending) {
      await HapticService.scanError();
      setError(new Error('Cannot bulk confirm while operations are pending. Reconcile first.'));
      return false;
    }

    const previousPendingItems = items.filter(
      (it) => isActionablePullsheetItem(it) && normalizePullsheetStatus(it.status) === 'pending'
    );
    if (previousPendingItems.length === 0) return true;

    // Optimistic update
    setPullsheet((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((it) => {
        if (isActionablePullsheetItem(it) && normalizePullsheetStatus(it.status) === 'pending') {
          return {
            ...it,
            status: 'confirmed' as PullsheetItemStatus,
            statusUpdatedAt: new Date(),
            statusUpdatedBy: currentUserId,
          };
        }
        return it;
      });
      return { ...prev, items: updatedItems };
    });

    const result = await bulkConfirmPullsheet(eventId, tenantId, { uid: currentUserId });

    if (result.success) {
      await HapticService.scanSuccess();
      await AudioService.playScanSuccess();
      return true;
    } else {
      // Selective rollback for pending items
      setPullsheet((prev) => {
        if (!prev) return prev;
        const restoredItems = prev.items.map((it) => {
          const match = previousPendingItems.find((p) => p.id === it.id);
          return match ? match : it;
        });
        return { ...prev, items: restoredItems };
      });
      if (result.outcomeUnknown) {
        const freshOps = await getPendingOperations(tenantId, currentUserId);
        setPendingOperations(freshOps.filter((op) => op.eventId === eventId));
      }
      console.error('[usePullSheet] bulkConfirm failed:', result.error);
      await HapticService.scanError();
      setError(new Error(result.error || 'Failed to bulk confirm pull sheet'));
      return false;
    }
  }, [eventId, tenantId, currentUserId, items, pendingOperations]);

  // Read-only status reconciliation for an in-flight operation
  const reconcileOperation = useCallback(
    async (operationId: string): Promise<boolean> => {
      if (!eventId || !tenantId) return false;
      const res = await reconcilePendingOperation(eventId, tenantId, currentUserId, operationId);
      if (res.success) {
        if (res.status === 'committed') {
          await HapticService.scanSuccess();
          await AudioService.playScanSuccess();
          setPendingOperations((prev) => prev.filter((p) => p.operationId !== operationId));
          await refresh();
          return true;
        } else if (res.status === 'not_found') {
          // Revert optimistic overlay by refreshing from server, and synchronize local pending state
          await refresh();
          const allPending = await getPendingOperations(tenantId, currentUserId);
          setPendingOperations(allPending.filter((op) => op.eventId === eventId));
          return false;
        }
      }
      return false;
    },
    [eventId, tenantId, currentUserId, refresh]
  );

  // Explicit user retry for an outcome-unknown or not-found operation
  const retryOperation = useCallback(
    async (operationId: string): Promise<boolean> => {
      if (!eventId || !tenantId) return false;
      let op = pendingOperations.find((p) => p.operationId === operationId);
      if (!op) {
        // Fallback: check durable storage in case operation originated outside this hook instance
        const allPending = await getPendingOperations(tenantId, currentUserId);
        op = allPending.find((p) => p.operationId === operationId);
      }
      if (!op) return false;

      const result = await retryPendingOperation(op, { uid: currentUserId });
      if (result.success) {
        await HapticService.scanSuccess();
        await AudioService.playScanSuccess();
        await clearPendingOperation(tenantId, currentUserId, operationId);
        setPendingOperations((prev) => prev.filter((p) => p.operationId !== operationId));
        await refresh();
        return true;
      } else {
        await HapticService.scanError();
        setError(new Error(result.error || 'Retry failed'));
        return false;
      }
    },
    [eventId, tenantId, currentUserId, pendingOperations, refresh]
  );

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
