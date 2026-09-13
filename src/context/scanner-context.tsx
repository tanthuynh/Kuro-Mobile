/**
 * src/context/scanner-context.tsx
 * High-throughput Continuous Barcode & QR Scanner Context for Kuro Mobile.
 * Coordinates camera feeds, audio/haptic multi-sensory feedback, live pullsheet
 * reconciliation, and recent scan logs across the entire application.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
} from 'react';
import { useAuth } from './auth-context';
import { useEquipment } from '@/hooks/use-equipment';
import {
  subscribePullsheet,
  updatePullsheetItemScannedCount,
  updatePullsheetItemStatus,
  isItemOperationPending,
  isOnline,
  type CommandExecutionResult,
} from '@/services/pull-sheet-service';
import {
  isActionablePullsheetItem,
  normalizePullsheetStatus,
} from '@/lib/pull-sheet-engine';
import { evaluatePullsheetScan, createScanThrottle, getSerializedScanCode } from '@/lib/scanner-engine';
import { AudioService } from '@/services/audio-service';
import { HapticService } from '@/services/haptic-service';
import type { Pullsheet, PullsheetItem } from '@/types/pull-sheet';
import type { Equipment } from '@/types/equipment';
import type { ScanEvaluationResult, ScannerMode, ScanTargetStatus } from '@/types/scanner';

export interface RecentScanRecord {
  id: string;
  code: string;
  name: string;
  category?: string;
  location?: string;
  status: string;
  resultType: ScanEvaluationResult['type'];
  timestamp: Date;
  item?: PullsheetItem;
  equipment?: Equipment;
}

export interface ScannerContextValue {
  activeEventId: string | null;
  setActiveEventId: (eventId: string | null) => void;
  activePullsheet: Pullsheet | null;
  scannerMode: ScannerMode;
  setScannerMode: (mode: ScannerMode) => void;
  scanTargetStatus: ScanTargetStatus;
  setScanTargetStatus: (status: ScanTargetStatus) => void;
  torchEnabled: boolean;
  setTorchEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  toggleTorch: () => void;
  lastResult: ScanEvaluationResult | null;
  hudVisible: boolean;
  dismissHud: () => void;
  recentScans: RecentScanRecord[];
  clearRecentScans: () => void;
  processScan: (code: string, targetStatusOverride?: ScanTargetStatus) => Promise<ScanEvaluationResult>;
  isProcessing: boolean;
  isCompletionModalVisible: boolean;
  dismissCompletionModal: () => void;
}

const ScannerContext = createContext<ScannerContextValue | null>(null);

export const ScannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.tenantId || user?.tenantId || '';
  const currentUserId = user?.uid || 'anonymous';

  const { equipmentLookupMap } = useEquipment();

  const scanBusyRef = useRef(false);
  const snapshotRevisionRef = useRef(0);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activePullsheet, setActivePullsheet] = useState<Pullsheet | null>(null);
  const latestPullsheetRef = useRef<Pullsheet | null>(null);
  const [scannerMode, setScannerMode] = useState<ScannerMode>('continuous');
  const [scanTargetStatus, setScanTargetStatus] = useState<ScanTargetStatus>('prepped_scanned');
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<ScanEvaluationResult | null>(null);
  const [hudVisible, setHudVisible] = useState<boolean>(false);
  const [recentScans, setRecentScans] = useState<RecentScanRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCompletionModalVisible, setIsCompletionModalVisible] = useState<boolean>(false);

  // Synchronously reset scanner state on identity change (logout, account switch, or tenant switch)
  const currentIdentityRef = useRef({ tenantId, currentUserId });
  if (
    currentIdentityRef.current.tenantId !== tenantId ||
    currentIdentityRef.current.currentUserId !== currentUserId
  ) {
    currentIdentityRef.current = { tenantId, currentUserId };
    setActiveEventId(null);
    setActivePullsheet(null);
    setRecentScans([]);
    setLastResult(null);
    setHudVisible(false);
    setIsCompletionModalVisible(false);
  }

  const scanScopeRef = useRef({ activeEventId, tenantId, currentUserId });
  useLayoutEffect(() => {
    scanScopeRef.current = { activeEventId, tenantId, currentUserId };
    return () => { scanScopeRef.current = { activeEventId: null, tenantId: '', currentUserId: '' }; };
  }, [activeEventId, tenantId, currentUserId]);

  const dismissCompletionModal = useCallback(() => {
    setIsCompletionModalVisible(false);
  }, []);

  // Scan throttle to prevent duplicate scans within 1.2 seconds
  const throttleRef = useRef(createScanThrottle(1200));
  const hudTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to pullsheet if activeEventId is set
  useEffect(() => {
    if (!activeEventId || !tenantId) {
      setActivePullsheet(null);
      return;
    }

    let subscribed = true;
    const unsubscribe = subscribePullsheet(
      activeEventId,
      tenantId,
      (data) => {
        if (!subscribed || scanScopeRef.current.activeEventId !== activeEventId ||
            scanScopeRef.current.tenantId !== tenantId || scanScopeRef.current.currentUserId !== currentUserId) return;
        snapshotRevisionRef.current++;
        latestPullsheetRef.current = data;
        setActivePullsheet(data);
      },
      (err) => {
        console.error(`[ScannerContext] Pullsheet sync error for ${activeEventId}:`, err);
      }
    );

    return () => {
      subscribed = false;
      unsubscribe();
    };
  }, [activeEventId, tenantId, currentUserId]);

  const toggleTorch = useCallback(() => {
    setTorchEnabled((prev) => !prev);
    HapticService.lightTap();
  }, []);

  const dismissHud = useCallback(() => {
    setHudVisible(false);
  }, []);

  const clearRecentScans = useCallback(() => {
    setRecentScans([]);
  }, []);

  const showHudWithTimeout = useCallback((durationMs: number = 2200) => {
    if (hudTimeoutRef.current) {
      clearTimeout(hudTimeoutRef.current);
    }
    setHudVisible(true);
    hudTimeoutRef.current = setTimeout(() => {
      setHudVisible(false);
    }, durationMs);
  }, []);

  const isPullsheet100PercentComplete = (
    items: PullsheetItem[],
    justCompletedItemId?: string
  ): boolean => {
    const actionableItems = items.filter(isActionablePullsheetItem);
    if (actionableItems.length === 0) return false;
    return actionableItems.every((it) => {
      if (justCompletedItemId && it.id === justCompletedItemId) {
        return true;
      }
      const target = Math.max(1, it.quantity || 1);
      const current =
        it.scannedQuantity !== undefined
          ? it.scannedQuantity
          : normalizePullsheetStatus(it.status) === 'prepped_scanned'
          ? target
          : 0;
      const status = normalizePullsheetStatus(it.status);
      const isStatusDone =
        status === 'prepped_scanned' ||
        status === 'dispatched' ||
        status === 'returned' ||
        status === 'deprepped';
      return isStatusDone || current >= target;
    });
  };

  const processScan = useCallback(
    async (code: string, targetStatusOverride?: ScanTargetStatus): Promise<ScanEvaluationResult> => {
      const cleanCode = (code || '').trim();
      if (!cleanCode) {
        return { type: 'UNKNOWN_CODE', message: 'Empty scan code' };
      }

      // Online Guard: Offline scanning is blocked immediately
      if (!isOnline()) {
        await HapticService.scanError();
        await AudioService.playScanError();
        const offlineResult: ScanEvaluationResult = {
          type: 'UNKNOWN_CODE',
          message: 'Network connection required. Offline scanning is disabled.',
        };
        setLastResult(offlineResult);
        showHudWithTimeout();
        return offlineResult;
      }

      // Throttle identical scans
      if (throttleRef.current.shouldThrottle(cleanCode)) {
        return {
          type: 'ALREADY_COMPLETED',
          message: `Code "${cleanCode}" throttled`,
        };
      }

      if (scanBusyRef.current) return { type: 'ALREADY_COMPLETED', message: 'A scan is already saving. Please wait.' };
      scanBusyRef.current = true;
      const scanScope = scanScopeRef.current;
      const scanRevision = snapshotRevisionRef.current;
      const isCurrentScan = () => scanScopeRef.current.activeEventId === scanScope.activeEventId &&
        scanScopeRef.current.tenantId === scanScope.tenantId && scanScopeRef.current.currentUserId === scanScope.currentUserId;
      setIsProcessing(true);
      try {

      const pullsheetItems = activePullsheet?.items || [];
      const effectiveTargetStatus = targetStatusOverride || scanTargetStatus;
      const result = evaluatePullsheetScan(cleanCode, pullsheetItems, equipmentLookupMap, effectiveTargetStatus);

      // Multi-sensory feedback & Firestore reconciliation
      switch (result.type) {
        case 'SUCCESS': {
          let saveResult: CommandExecutionResult = { success: true };

          if (result.item) {
            if (!activeEventId || !tenantId) {
              await HapticService.scanError();
              await AudioService.playScanError();
              const noEventResult: ScanEvaluationResult = {
                type: 'UNKNOWN_CODE',
                message: 'Active event and tenant are required for pull sheet scanning.',
              };
              setLastResult(noEventResult);
              showHudWithTimeout();
              setIsProcessing(false);
              return noEventResult;
            }

            // Guard against conflicting actions on an item with an in-flight or outcome-unknown operation
            const isPending = await isItemOperationPending(tenantId, currentUserId, result.item.id, activeEventId);
            if (!isCurrentScan()) return { type: 'UNKNOWN_CODE', message: 'Session changed before saving.' };
            if (isPending) {
              await HapticService.scanWarning();
              await AudioService.playScanWarning();
              const pendingResult: ScanEvaluationResult = {
                type: 'ALREADY_COMPLETED',
                item: result.item,
                equipment: result.equipment,
                warningOnly: true,
                message: `Operation in-flight for "${result.item.description || cleanCode}". Please wait or reconcile.`,
              };
              if (!isCurrentScan()) return pendingResult;
              setLastResult(pendingResult);
              showHudWithTimeout();
              setIsProcessing(false);
              return pendingResult;
            }

            if (effectiveTargetStatus === 'confirmed') {
              saveResult = await updatePullsheetItemStatus(
                activeEventId,
                tenantId,
                result.item.id,
                'confirmed',
                { uid: currentUserId }
              );
            } else if (effectiveTargetStatus === 'returned') {
              saveResult = await updatePullsheetItemStatus(
                activeEventId,
                tenantId,
                result.item.id,
                'returned',
                { uid: currentUserId }
              );
            } else if (effectiveTargetStatus === 'deprepped') {
              saveResult = await updatePullsheetItemStatus(
                activeEventId,
                tenantId,
                result.item.id,
                'deprepped',
                { uid: currentUserId }
              );
            } else {
              // 'prepped_scanned'
              const newCount = result.newScannedCount || 1;
              const isFullyPrepped = result.isFullyPrepped || false;

              if (result.item.inventoryItemId && !result.equipment) {
                throw new Error('Equipment details are not available yet. Refresh before scanning this item.');
              }
              saveResult = await updatePullsheetItemScannedCount(
                activeEventId,
                tenantId,
                result.item.id,
                newCount,
                isFullyPrepped,
                { uid: currentUserId },
                getSerializedScanCode(cleanCode, result.equipment)
              );

              if (!isCurrentScan()) return { type: 'UNKNOWN_CODE', message: 'Scan saved for the previous session. Check that pull sheet.' };
              // Only acknowledged server state can determine count/completion.
              const receiptItem = saveResult.item as PullsheetItem | undefined;
              const completionItems = snapshotRevisionRef.current === scanRevision
                ? pullsheetItems : latestPullsheetRef.current?.items || [];
              const committedItem = snapshotRevisionRef.current === scanRevision ? receiptItem
                : completionItems.find((item) => item.id === receiptItem?.id);
              result.isFullyPrepped = false;
              result.newScannedCount = undefined;
              result.message = 'Scan saved. Waiting for the updated count.';
              if (saveResult.success && committedItem?.id === result.item.id) {
                result.item = committedItem;
                result.newScannedCount = committedItem.scannedQuantity;
                result.isFullyPrepped = committedItem.status === 'prepped_scanned';
                result.message = `Prepped: ${committedItem.description || cleanCode} (${committedItem.scannedQuantity ?? 0}/${committedItem.quantity})`;
                if (snapshotRevisionRef.current === scanRevision) {
                  setActivePullsheet((prev) => prev ? { ...prev, items: prev.items.map((it) =>
                    it.id === committedItem.id ? { ...it, ...committedItem } : it) } : prev);
                }
                if (result.isFullyPrepped && saveResult.reconciliationStatus !== 'pending' &&
                    saveResult.reconciliationStatus !== 'failed' &&
                    isPullsheet100PercentComplete(completionItems, committedItem.id)) {
                  await HapticService.scanCelebration();
                  await AudioService.playCelebrationChime();
                  if (isCurrentScan()) setIsCompletionModalVisible(true);
                }
              }
            }
          }

          if (!isCurrentScan()) return { type: 'UNKNOWN_CODE', message: 'Session changed during the save. Check the original pull sheet.' };
          if (saveResult.success && (saveResult.reconciliationStatus === 'pending' || saveResult.reconciliationStatus === 'failed')) {
            result.warningOnly = true;
            result.message = 'Scan saved. Inventory synchronization needs recovery from the pull sheet.';
          }
          if (!saveResult.success) {
            // Server rejection or network loss: trigger error feedback and abort celebration
            await HapticService.scanError();
            await AudioService.playScanError();
            const failureResult: ScanEvaluationResult = {
              type: 'UNKNOWN_CODE',
              message: saveResult.error || 'Server rejected scan update',
            };
            if (!isCurrentScan()) return failureResult;
            setLastResult(failureResult);
            showHudWithTimeout();
            setIsProcessing(false);
            return failureResult;
          }

          // Trigger success tone and haptics ONLY after server confirmed
          if (result.warningOnly) {
            await HapticService.scanWarning();
            await AudioService.playScanWarning();
          } else {
            await HapticService.scanSuccess();
            await AudioService.playScanSuccess();
          }

          if (!isCurrentScan()) return result;
          setLastResult(result);
          showHudWithTimeout();
          break;
        }

        case 'ALREADY_COMPLETED': {
          // Over-prep or already completed guard: warning audio and haptic
          await HapticService.scanWarning();
          await AudioService.playScanWarning();
          if (!isCurrentScan()) return result;
          setLastResult(result);
          showHudWithTimeout();
          break;
        }

        case 'INVALID_TRANSITION':
        case 'NOT_ON_PULLSHEET':
        case 'UNKNOWN_CODE':
        default: {
          // Strict rejection: error audio and haptic, zero Firestore writes
          await HapticService.scanError();
          await AudioService.playScanError();
          if (!isCurrentScan()) return result;
          setLastResult(result);
          showHudWithTimeout();
          break;
        }
      }

      if (!isCurrentScan()) return result;
      // Record in recent scans list
      const newRecord: RecentScanRecord = {
        id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code: cleanCode,
        name: result.equipment?.name || result.item?.description || cleanCode,
        category: result.equipment?.category,
        location: result.equipment?.knownLocation,
        status: result.equipment?.serialNumbers?.[0]?.status || 'Available',
        resultType: result.type,
        timestamp: new Date(),
        item: result.item,
        equipment: result.equipment,
      };

      setRecentScans((prev) => [newRecord, ...prev.slice(0, 29)]);
      setIsProcessing(false);

      return result;
      } catch (err: any) {
        const failure: ScanEvaluationResult = { type: 'UNKNOWN_CODE', message: err?.message || 'Unable to process scan.' };
        if (isCurrentScan()) { setLastResult(failure); showHudWithTimeout(); }
        return failure;
      } finally { scanBusyRef.current = false; setIsProcessing(false); }
    },
    [activePullsheet, equipmentLookupMap, activeEventId, tenantId, currentUserId, scanTargetStatus, showHudWithTimeout]
  );

  const value = useMemo<ScannerContextValue>(
    () => ({
      activeEventId,
      setActiveEventId,
      activePullsheet,
      scannerMode,
      setScannerMode,
      scanTargetStatus,
      setScanTargetStatus,
      torchEnabled,
      setTorchEnabled,
      toggleTorch,
      lastResult,
      hudVisible,
      dismissHud,
      recentScans,
      clearRecentScans,
      processScan,
      isProcessing,
      isCompletionModalVisible,
      dismissCompletionModal,
    }),
    [
      activeEventId,
      activePullsheet,
      scannerMode,
      scanTargetStatus,
      torchEnabled,
      toggleTorch,
      lastResult,
      hudVisible,
      dismissHud,
      recentScans,
      clearRecentScans,
      processScan,
      isProcessing,
      isCompletionModalVisible,
      dismissCompletionModal,
    ]
  );

  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>;
};

const defaultScannerContext: ScannerContextValue = {
  activeEventId: null,
  setActiveEventId: () => {},
  activePullsheet: null,
  scannerMode: 'continuous',
  setScannerMode: () => {},
  scanTargetStatus: 'prepped_scanned',
  setScanTargetStatus: () => {},
  torchEnabled: false,
  setTorchEnabled: () => {},
  toggleTorch: () => {},
  lastResult: null,
  hudVisible: false,
  dismissHud: () => {},
  recentScans: [],
  clearRecentScans: () => {},
  processScan: async () => ({ type: 'UNKNOWN_CODE' }),
  isProcessing: false,
  isCompletionModalVisible: false,
  dismissCompletionModal: () => {},
};

export function useScanner(): ScannerContextValue {
  const context = useContext(ScannerContext);
  if (!context) {
    return defaultScannerContext;
  }
  return context;
}
