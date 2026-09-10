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
} from 'react';
import { useAuth } from './auth-context';
import { useEquipment } from '@/hooks/use-equipment';
import {
  subscribePullsheet,
  updatePullsheetItemScannedCount,
  updatePullsheetItemStatus,
  isItemOperationPending,
  isOnline,
} from '@/services/pull-sheet-service';
import {
  isActionablePullsheetItem,
  normalizePullsheetStatus,
} from '@/lib/pull-sheet-engine';
import { evaluatePullsheetScan, createScanThrottle } from '@/lib/scanner-engine';
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

  const { equipmentLookupMap, equipment } = useEquipment();

  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activePullsheet, setActivePullsheet] = useState<Pullsheet | null>(null);
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

    const unsubscribe = subscribePullsheet(
      activeEventId,
      tenantId,
      (data) => {
        setActivePullsheet(data);
      },
      (err) => {
        console.error(`[ScannerContext] Pullsheet sync error for ${activeEventId}:`, err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [activeEventId, tenantId]);

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

      setIsProcessing(true);

      const pullsheetItems = activePullsheet?.items || [];
      const effectiveTargetStatus = targetStatusOverride || scanTargetStatus;
      const result = evaluatePullsheetScan(cleanCode, pullsheetItems, equipmentLookupMap, effectiveTargetStatus);

      // Multi-sensory feedback & Firestore reconciliation
      switch (result.type) {
        case 'SUCCESS': {
          let saveResult: { success: boolean; error?: string } = { success: true };

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

              saveResult = await updatePullsheetItemScannedCount(
                activeEventId,
                tenantId,
                result.item.id,
                newCount,
                isFullyPrepped,
                { uid: currentUserId },
                cleanCode
              );

              // 100% completion celebration triggers ONLY after validated server acknowledgement
              if (saveResult.success) {
                const is100Percent =
                  isFullyPrepped && isPullsheet100PercentComplete(pullsheetItems, result.item.id);

                if (is100Percent) {
                  await HapticService.scanCelebration();
                  await AudioService.playCelebrationChime();
                  setIsCompletionModalVisible(true);
                }
              }
            }
          }

          if (!saveResult.success) {
            // Server rejection or network loss: trigger error feedback and abort celebration
            await HapticService.scanError();
            await AudioService.playScanError();
            const failureResult: ScanEvaluationResult = {
              type: 'UNKNOWN_CODE',
              message: saveResult.error || 'Server rejected scan update',
            };
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

          setLastResult(result);
          showHudWithTimeout();
          break;
        }

        case 'ALREADY_COMPLETED': {
          // Over-prep or already completed guard: warning audio and haptic
          await HapticService.scanWarning();
          await AudioService.playScanWarning();
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
          setLastResult(result);
          showHudWithTimeout();
          break;
        }
      }

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
