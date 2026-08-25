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
} from '@/services/pull-sheet-service';
import { evaluatePullsheetScan, createScanThrottle } from '@/lib/scanner-engine';
import { AudioService } from '@/services/audio-service';
import { HapticService } from '@/services/haptic-service';
import type { Pullsheet, PullsheetItem } from '@/types/pull-sheet';
import type { Equipment } from '@/types/equipment';
import type { ScanEvaluationResult, ScannerMode } from '@/types/scanner';

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
  torchEnabled: boolean;
  setTorchEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  toggleTorch: () => void;
  lastResult: ScanEvaluationResult | null;
  hudVisible: boolean;
  dismissHud: () => void;
  recentScans: RecentScanRecord[];
  clearRecentScans: () => void;
  processScan: (code: string) => Promise<ScanEvaluationResult>;
  isProcessing: boolean;
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
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<ScanEvaluationResult | null>(null);
  const [hudVisible, setHudVisible] = useState<boolean>(false);
  const [recentScans, setRecentScans] = useState<RecentScanRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

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

  const processScan = useCallback(
    async (code: string): Promise<ScanEvaluationResult> => {
      const cleanCode = (code || '').trim();
      if (!cleanCode) {
        return { type: 'UNKNOWN_CODE', message: 'Empty scan code' };
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
      const result = evaluatePullsheetScan(cleanCode, pullsheetItems, equipmentLookupMap);

      setLastResult(result);
      showHudWithTimeout();

      // Multi-sensory feedback & Firestore reconciliation
      switch (result.type) {
        case 'SUCCESS': {
          await HapticService.scanSuccess();
          await AudioService.playScanSuccess();

          if (result.item && activeEventId && tenantId) {
            const newCount = result.newScannedCount || 1;
            const isFullyPrepped = result.isFullyPrepped || false;

            // Update pullsheet item in Firestore
            updatePullsheetItemScannedCount(
              activeEventId,
              tenantId,
              result.item.id,
              newCount,
              isFullyPrepped,
              { uid: currentUserId },
              cleanCode
            ).catch((err) => {
              console.error('[ScannerContext] Scanned count update error:', err);
            });
          }
          break;
        }

        case 'ALREADY_COMPLETED': {
          await HapticService.scanWarning();
          await AudioService.playScanWarning();
          break;
        }

        case 'NOT_ON_PULLSHEET':
        case 'UNKNOWN_CODE':
        default: {
          await HapticService.scanError();
          await AudioService.playScanError();
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
    [activePullsheet, equipmentLookupMap, activeEventId, tenantId, currentUserId, showHudWithTimeout]
  );

  const value = useMemo<ScannerContextValue>(
    () => ({
      activeEventId,
      setActiveEventId,
      activePullsheet,
      scannerMode,
      setScannerMode,
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
    }),
    [
      activeEventId,
      activePullsheet,
      scannerMode,
      torchEnabled,
      toggleTorch,
      lastResult,
      hudVisible,
      dismissHud,
      recentScans,
      clearRecentScans,
      processScan,
      isProcessing,
    ]
  );

  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>;
};

export function useScanner(): ScannerContextValue {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error('useScanner must be used within a ScannerProvider');
  }
  return context;
}
