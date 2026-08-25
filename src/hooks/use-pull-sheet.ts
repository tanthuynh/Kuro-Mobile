/**
 * src/hooks/use-pull-sheet.ts
 * Real-time React hook for Mobile Pull Sheet management in Kuro Mobile.
 * Subscribes to live Firestore pullsheet documents, supports optimistic status
 * progressions, scanned count increments, bulk confirm, search, and category filtering.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  subscribePullsheet,
  fetchPullsheet,
  updatePullsheetItemStatus,
  updatePullsheetItemScannedCount,
  bulkConfirmPullsheet,
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
        setPullsheet(data);
        setLoading(false);
      },
      (err) => {
        console.error(`[usePullSheet] Subscription error for ${eventId}:`, err);
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
      const fresh = await fetchPullsheet(eventId, tenantId);
      setPullsheet(fresh);
      setError(null);
    } catch (err: any) {
      console.error(`[usePullSheet] Refresh error for ${eventId}:`, err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [eventId, tenantId]);

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

    return sections
      .map((section) => {
        const filteredItems = section.items.filter((item) => {
          // Strictly omit service items
          if ((item as any).type === 'service') return false;

          // Search query check
          if (q) {
            const matchesDesc = item.description?.toLowerCase().includes(q);
            const matchesNote = item.internalNote?.toLowerCase().includes(q);
            const matchesBarcodes = item.scannedBarcodes?.some((b) => b.toLowerCase().includes(q));
            if (!matchesDesc && !matchesNote && !matchesBarcodes) return false;
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
  }, [sections, searchQuery, selectedCategory]);

  // Update item status with optimistic UI
  const updateStatus = useCallback(
    async (itemId: string, newStatus: PullsheetItemStatus): Promise<boolean> => {
      if (!eventId || !tenantId) return false;

      // Optimistic update in local state
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
        console.error('[usePullSheet] updateStatus failed:', result.error);
        await HapticService.scanError();
        return false;
      }
    },
    [eventId, tenantId, currentUserId]
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

  // Increment scanned quantity for prep workflow
  const incrementScannedCount = useCallback(
    async (itemId: string, barcode?: string): Promise<boolean> => {
      if (!eventId || !tenantId) return false;

      const item = items.find((it) => it.id === itemId);
      if (!item) return false;

      const targetQty = Math.max(1, item.quantity || 1);
      const currentScanned = item.scannedQuantity || (item.status === 'prepped_scanned' ? targetQty : 0);
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
        await HapticService.scanError();
        return false;
      }
    },
    [eventId, tenantId, currentUserId, items]
  );

  // Bulk confirm all pending actionable items
  const bulkConfirm = useCallback(async (): Promise<boolean> => {
    if (!eventId || !tenantId) return false;

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
      return true;
    } else {
      console.error('[usePullSheet] bulkConfirm failed:', result.error);
      await HapticService.scanError();
      return false;
    }
  }, [eventId, tenantId, currentUserId]);

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
  };
}
