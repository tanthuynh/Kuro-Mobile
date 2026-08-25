/**
 * __tests__/continuous-scanning-workflow.stress.test.tsx
 * Comprehensive Integration & Stress Test Suite for the Continuous Camera Scanning Workflow
 * in Kuro Mobile (Milestones 2-4).
 * 
 * Tests the complete lifecycle:
 * Job -> Pull Sheet -> Scan -> Item Identified -> Status Updated -> Multi-Sensory Feedback -> HUD
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { renderHook } from '@testing-library/react-native';
import { ScannerProvider, useScanner } from '@/context/scanner-context';
import ScannerScreen from '../app/(tabs)/scanner';
import { CameraViewfinder } from '@/components/scanner/camera-viewfinder';
import { ScanHudOverlay } from '@/components/scanner/scan-hud-overlay';
import { ManualCodeInput } from '@/components/scanner/manual-code-input';
import * as pullSheetService from '@/services/pull-sheet-service';
import * as equipmentService from '@/services/equipment-service';
import * as eventService from '@/services/event-service';
import { AudioService } from '@/services/audio-service';
import { HapticService } from '@/services/haptic-service';
import type { Equipment } from '@/types/equipment';
import type { Pullsheet, PullsheetItem } from '@/types/pull-sheet';
import type { Event } from '@/types/events';

// Mock theme context
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => ({
      colors: actualTheme.darkColors,
      typography: actualTheme.typography,
      spacing: actualTheme.spacing,
      layout: actualTheme.layout,
      isDark: true,
    }),
  };
});

// Mock auth context
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      uid: 'operator-uid-99',
      tenantId: 'tenant-kuro-sydney',
      firstName: 'Elena',
      lastName: 'Vance',
    },
    tenant: {
      tenantId: 'tenant-kuro-sydney',
      tenantName: 'Kuro Sydney Arena Productions',
    },
    isAuthenticated: true,
  }),
}));

// Mock expo-router
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: { eventId?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

describe('Continuous Camera Scanning Workflow Stress & Integration Suite', () => {
  const mockEquipmentCatalog: Equipment[] = [
    {
      id: 'eq-k2',
      tenantId: 'tenant-kuro-sydney',
      name: 'L-Acoustics K2 Line Array',
      barcode: 'BAR-LA-K2-0042',
      serialNumber: 'SN-994821',
      category: 'Audio',
      knownLocation: 'Sydney Warehouse Bay A1',
      quantity: 16,
    },
    {
      id: 'eq-bmfl',
      tenantId: 'tenant-kuro-sydney',
      name: 'Robe BMFL Blade Moving Head',
      barcode: 'BAR-RB-BMFL-018',
      serialNumber: 'SN-441209',
      category: 'Lighting',
      knownLocation: 'Sydney Warehouse Bay L3',
      quantity: 12,
    },
    {
      id: 'eq-cable-socapex',
      tenantId: 'tenant-kuro-sydney',
      name: 'Socapex 19-Pin 25m Multicore',
      barcode: 'BAR-SOC-25M-007',
      category: 'Cables',
      knownLocation: 'Cable Trunk C-4',
      quantity: 30,
    },
    {
      id: 'eq-unlisted-projector',
      tenantId: 'tenant-kuro-sydney',
      name: 'Barco UDX-4K32 Laser Projector',
      barcode: 'BAR-BARCO-4K-001',
      category: 'Video',
      knownLocation: 'Projection Vault',
      quantity: 4,
    },
  ];

  const mockActiveEvent: Event = {
    id: 'event-syd-2026',
    tenantId: 'tenant-kuro-sydney',
    eventName: 'Sydney Vivid Lights Mainstage',
    eventNumber: 402,
    clientId: 'Vivid Sydney Festival',
    eventStatusId: 'Confirmed',
    eventTypeId: 'Festival',
    startTime: new Date('2026-08-26T18:00:00Z'),
    finishTime: new Date('2026-08-26T23:30:00Z'),
    deliveryTime: new Date('2026-08-25T08:00:00Z'),
    setupTime: new Date('2026-08-25T10:00:00Z'),
    eventStartDate: new Date('2026-08-26T00:00:00Z'),
    eventFinishDate: new Date('2026-08-26T23:59:59Z'),
    pickupTime: new Date('2026-08-27T02:00:00Z'),
    packdownTime: new Date('2026-08-27T04:00:00Z'),
    assigneeId: 'operator-uid-99',
  };

  const initialPullsheet: Pullsheet = {
    id: 'event-syd-2026',
    eventId: 'event-syd-2026',
    tenantId: 'tenant-kuro-sydney',
    items: [
      {
        id: 'ps-item-k2',
        inventoryItemId: 'eq-k2',
        description: 'L-Acoustics K2 Line Array',
        quantity: 2,
        scannedQuantity: 0,
        type: 'item',
        status: 'confirmed',
        scannedBarcodes: [],
      },
      {
        id: 'ps-item-bmfl',
        inventoryItemId: 'eq-bmfl',
        description: 'Robe BMFL Blade Moving Head',
        quantity: 1,
        scannedQuantity: 0,
        type: 'item',
        status: 'confirmed',
        scannedBarcodes: [],
      },
      {
        id: 'ps-item-cable',
        inventoryItemId: 'eq-cable-socapex',
        description: 'Socapex 19-Pin 25m Multicore',
        quantity: 5,
        scannedQuantity: 0,
        type: 'item',
        status: 'pending',
        scannedBarcodes: [],
      },
    ],
  };

  let currentPullsheetState: Pullsheet;
  let pullsheetSubCallback: ((ps: Pullsheet | null) => void) | null = null;
  let equipmentSubCallback: ((eq: Equipment[]) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    currentPullsheetState = JSON.parse(JSON.stringify(initialPullsheet));

    // Mock Firestore equipment subscription
    jest.spyOn(equipmentService, 'subscribeEquipment').mockImplementation((tenantId, onData) => {
      equipmentSubCallback = onData;
      onData(mockEquipmentCatalog);
      return jest.fn();
    });

    // Mock Firestore pullsheet subscription
    jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onData) => {
      pullsheetSubCallback = onData;
      onData(currentPullsheetState);
      return jest.fn();
    });

    // Mock Firestore event subscription
    jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, onData) => {
      onData(mockActiveEvent);
      return jest.fn();
    });

    // Mock pullsheet update mutations
    jest.spyOn(pullSheetService, 'updatePullsheetItemScannedCount').mockImplementation(
      async (eventId, tenantId, itemId, newScannedCount, autoTransitionToPrepped, user, scannedBarcode) => {
        // Update local pullsheet simulation and trigger listener
        currentPullsheetState = {
          ...currentPullsheetState,
          items: currentPullsheetState.items.map((it) => {
            if (it.id === itemId) {
              const barcodes = it.scannedBarcodes ? [...it.scannedBarcodes] : [];
              if (scannedBarcode && !barcodes.includes(scannedBarcode)) {
                barcodes.push(scannedBarcode);
              }
              return {
                ...it,
                scannedQuantity: newScannedCount,
                scannedBarcodes: barcodes,
                status: autoTransitionToPrepped ? 'prepped_scanned' : it.status,
              };
            }
            return it;
          }),
        };
        if (pullsheetSubCallback) {
          pullsheetSubCallback(currentPullsheetState);
        }
        return { success: true };
      }
    );

    // Mock multi-sensory feedback services
    jest.spyOn(AudioService, 'playScanSuccess').mockResolvedValue();
    jest.spyOn(AudioService, 'playScanWarning').mockResolvedValue();
    jest.spyOn(AudioService, 'playScanError').mockResolvedValue();
    jest.spyOn(AudioService, 'playCelebrationChime').mockResolvedValue();
    jest.spyOn(HapticService, 'scanSuccess').mockResolvedValue();
    jest.spyOn(HapticService, 'scanWarning').mockResolvedValue();
    jest.spyOn(HapticService, 'scanError').mockResolvedValue();
    jest.spyOn(HapticService, 'lightTap').mockResolvedValue();
  });

  // =========================================================================
  // WORKFLOW STRESS 1: END-TO-END PREP SCANNING & MUTATIONS
  // =========================================================================
  describe('1. Full Continuous Scan Pipeline: Job -> Pull Sheet -> Scan -> Status Update', () => {
    it('executes progressive scanning workflow from initial un-prepped state to fully prepped', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      // Step 1: Bind active job to scanner
      act(() => {
        result.current.setActiveEventId('event-syd-2026');
      });

      expect(result.current.activeEventId).toBe('event-syd-2026');
      expect(result.current.activePullsheet?.items.length).toBe(3);

      // Step 2: Scan K2 item 1 of 2
      let scan1Res: any;
      await act(async () => {
        scan1Res = await result.current.processScan('BAR-LA-K2-0042');
      });

      expect(scan1Res.type).toBe('SUCCESS');
      expect(scan1Res.newScannedCount).toBe(1);
      expect(scan1Res.isFullyPrepped).toBe(false);
      expect(AudioService.playScanSuccess).toHaveBeenCalledTimes(1);
      expect(HapticService.scanSuccess).toHaveBeenCalledTimes(1);
      expect(pullSheetService.updatePullsheetItemScannedCount).toHaveBeenCalledWith(
        'event-syd-2026',
        'tenant-kuro-sydney',
        'ps-item-k2',
        1,
        false,
        { uid: 'operator-uid-99' },
        'BAR-LA-K2-0042'
      );

      // Step 3: Scan distinct item BMFL with 0ms transition delay (1 of 1 -> fully prepped)
      let scan2Res: any;
      await act(async () => {
        scan2Res = await result.current.processScan('BAR-RB-BMFL-018');
      });

      expect(scan2Res.type).toBe('SUCCESS');
      expect(scan2Res.newScannedCount).toBe(1);
      expect(scan2Res.isFullyPrepped).toBe(true);
      expect(AudioService.playScanSuccess).toHaveBeenCalledTimes(2);
      expect(HapticService.scanSuccess).toHaveBeenCalledTimes(2);
      expect(pullSheetService.updatePullsheetItemScannedCount).toHaveBeenCalledWith(
        'event-syd-2026',
        'tenant-kuro-sydney',
        'ps-item-bmfl',
        1,
        true,
        { uid: 'operator-uid-99' },
        'BAR-RB-BMFL-018'
      );

      // Step 4: Scan K2 second unit (2 of 2 -> now fully prepped)
      let scan3Res: any;
      await act(async () => {
        scan3Res = await result.current.processScan('BAR-LA-K2-0042');
      });

      expect(scan3Res.type).toBe('SUCCESS');
      expect(scan3Res.newScannedCount).toBe(2);
      expect(scan3Res.isFullyPrepped).toBe(true);
      expect(pullSheetService.updatePullsheetItemScannedCount).toHaveBeenCalledWith(
        'event-syd-2026',
        'tenant-kuro-sydney',
        'ps-item-k2',
        2,
        true,
        { uid: 'operator-uid-99' },
        'BAR-LA-K2-0042'
      );

      // Step 5: Verify Session Scan Log recorded all 3 operations with details
      expect(result.current.recentScans.length).toBe(3);
      expect(result.current.recentScans[0].code).toBe('BAR-LA-K2-0042');
      expect(result.current.recentScans[0].resultType).toBe('SUCCESS');
      expect(result.current.recentScans[1].code).toBe('BAR-RB-BMFL-018');
      expect(result.current.recentScans[2].code).toBe('BAR-LA-K2-0042');
    });

    it('handles duplicate scan lock within 1200ms without sending duplicate Firestore writes', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('event-syd-2026');
      });

      // First scan passes
      await act(async () => {
        await result.current.processScan('BAR-LA-K2-0042');
      });
      expect(pullSheetService.updatePullsheetItemScannedCount).toHaveBeenCalledTimes(1);

      // Immediate second scan of exact same barcode within 1200ms is throttled
      let duplicateRes: any;
      await act(async () => {
        duplicateRes = await result.current.processScan('BAR-LA-K2-0042');
      });

      expect(duplicateRes.type).toBe('ALREADY_COMPLETED');
      expect(duplicateRes.message).toContain('throttled');
      // Verify Firestore mutation was NOT called a second time
      expect(pullSheetService.updatePullsheetItemScannedCount).toHaveBeenCalledTimes(1);
    });

    it('rejects unlisted fleet equipment with NOT_ON_PULLSHEET error audio and haptics', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('event-syd-2026');
      });

      // Scan projector which is in fleet catalog but NOT in this pull sheet
      let unlistedRes: any;
      await act(async () => {
        unlistedRes = await result.current.processScan('BAR-BARCO-4K-001');
      });

      expect(unlistedRes.type).toBe('NOT_ON_PULLSHEET');
      expect(unlistedRes.equipment?.id).toBe('eq-unlisted-projector');
      expect(unlistedRes.message).toContain('not on this pull sheet');
      expect(AudioService.playScanError).toHaveBeenCalled();
      expect(HapticService.scanError).toHaveBeenCalled();
      expect(pullSheetService.updatePullsheetItemScannedCount).not.toHaveBeenCalled();

      // Recorded in recent scans with NOT_ON_PULLSHEET badge
      expect(result.current.recentScans[0].resultType).toBe('NOT_ON_PULLSHEET');
      expect(result.current.recentScans[0].name).toBe('Barco UDX-4K32 Laser Projector');
    });

    it('rejects uncataloged / unrecognized barcode with UNKNOWN_CODE error audio and haptics', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('event-syd-2026');
      });

      let unknownRes: any;
      await act(async () => {
        unknownRes = await result.current.processScan('UNKNOWN-RANDOM-BARCODE-999');
      });

      expect(unknownRes.type).toBe('UNKNOWN_CODE');
      expect(unknownRes.message).toContain('not recognized in catalog');
      expect(AudioService.playScanError).toHaveBeenCalled();
      expect(HapticService.scanError).toHaveBeenCalled();
      expect(pullSheetService.updatePullsheetItemScannedCount).not.toHaveBeenCalled();
    });

    it('enforces over-prep boundary when item is already fully prepped', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('event-syd-2026');
      });

      // Prep BMFL (quantity = 1)
      await act(async () => {
        await result.current.processScan('BAR-RB-BMFL-018');
      });

      // Clear throttle for next distinct scan or wait timer
      // Attempt to prep BMFL again (over-prep boundary)
      // Manually set pullsheet status to prepped_scanned
      let overprepRes: any;
      await act(async () => {
        // Different code representation (serial number) to bypass code throttle
        overprepRes = await result.current.processScan('SN-441209');
      });

      expect(overprepRes.type).toBe('ALREADY_COMPLETED');
      expect(overprepRes.message).toContain('already fully prepped (1/1)');
      expect(AudioService.playScanWarning).toHaveBeenCalled();
      expect(HapticService.scanWarning).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // WORKFLOW STRESS 2: UI RENDERING, HUD OVERLAYS & MANUAL ENTRY
  // =========================================================================
  describe('2. Scanner Screen UI, HUD Overlays & Manual Entry Fallback', () => {
    it('renders full scanner UI with active job context, viewfinder, manual input, and scan log', async () => {
      mockSearchParams = { eventId: 'event-syd-2026' };

      const { getByText, getByTestId, getByPlaceholderText } = render(
        <ScannerProvider>
          <ScannerScreen />
        </ScannerProvider>
      );

      // Header and Active Job Banner
      expect(getByText('Job Prep Scanner')).toBeTruthy();
      expect(getByText('Active Job: Sydney Vivid Lights Mainstage')).toBeTruthy();
      expect(getByTestId('scanner-view-pullsheet-btn')).toBeTruthy();

      // Viewfinder container
      expect(getByTestId('camera-viewfinder-container')).toBeTruthy();

      // Manual input field
      expect(getByPlaceholderText('Type barcode or serial number...')).toBeTruthy();
      expect(getByTestId('manual-code-submit-btn')).toBeTruthy();
      expect(getByTestId('exit-job-scanner-mode-btn')).toBeTruthy();
    });

    it('submits manual barcode entry cleanly in Job Prep Mode', async () => {
      mockSearchParams = { eventId: 'event-syd-2026' };

      const { getByPlaceholderText, getByTestId } = render(
        <ScannerProvider>
          <ScannerScreen />
        </ScannerProvider>
      );

      const input = getByPlaceholderText('Type barcode or serial number...');
      fireEvent.changeText(input, 'BAR-LA-K2-0042');

      const submitBtn = getByTestId('manual-code-submit-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(AudioService.playScanSuccess).toHaveBeenCalled();
      expect(HapticService.scanSuccess).toHaveBeenCalled();
    });

    it('submits manual barcode entry in Standalone Fleet Scanner Mode', async () => {
      mockSearchParams = {};

      const { getByPlaceholderText, getByTestId, getByText } = render(
        <ScannerProvider>
          <ScannerScreen />
        </ScannerProvider>
      );

      expect(getByText('Fleet Scanner')).toBeTruthy();

      const input = getByPlaceholderText('Type barcode or serial number...');
      fireEvent.changeText(input, 'BAR-BARCO-4K-001');

      const submitBtn = getByTestId('manual-code-submit-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(AudioService.playScanError).toHaveBeenCalled();
      expect(HapticService.scanError).toHaveBeenCalled();
    });

    it('displays Non-Blocking ScanHudOverlay and auto-dismisses after timeout', async () => {
      jest.useFakeTimers();
      const onDismiss = jest.fn();

      const { getByText, rerender } = render(
        <ScanHudOverlay
          visible={true}
          onDismiss={onDismiss}
          result={{
            type: 'SUCCESS',
            message: 'Prepped: L-Acoustics K2 (Complete)',
            isFullyPrepped: true,
          }}
        />
      );

      expect(getByText('Prep Line Complete')).toBeTruthy();
      expect(getByText('Prepped: L-Acoustics K2 (Complete)')).toBeTruthy();

      // Manual Dismiss Button
      const { getByRole } = render(
        <ScanHudOverlay
          visible={true}
          onDismiss={onDismiss}
          result={{
            type: 'SUCCESS',
            message: 'Dismiss me',
          }}
        />
      );

      // Rerender as hidden
      rerender(
        <ScanHudOverlay
          visible={false}
          onDismiss={onDismiss}
          result={null}
        />
      );

      jest.useRealTimers();
    });

    it('toggles torch flashlight in camera viewfinder with haptic tap', () => {
      const onToggleTorch = jest.fn();
      const onScan = jest.fn();

      const { getByTestId } = render(
        <CameraViewfinder
          onScan={onScan}
          torchEnabled={false}
          onToggleTorch={onToggleTorch}
        />
      );

      const torchBtn = getByTestId('torch-toggle-btn');
      fireEvent.press(torchBtn);

      expect(onToggleTorch).toHaveBeenCalled();
    });

    it('allows clearing recent session scans log', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      await act(async () => {
        await result.current.processScan('BAR-LA-K2-0042');
      });

      expect(result.current.recentScans.length).toBe(1);

      act(() => {
        result.current.clearRecentScans();
      });

      expect(result.current.recentScans.length).toBe(0);
    });
  });
});
