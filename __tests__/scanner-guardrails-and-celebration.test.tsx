/**
 * __tests__/scanner-guardrails-and-celebration.test.tsx
 * Rigorous test suite for Kuro Mobile Continuous Scanner:
 * 1. Strict Rejection of off-sheet gear (error audio, error haptic, zero DB writes)
 * 2. Over-Prep Guard against exceeding line item quota (warning audio, warning haptic, zero DB writes)
 * 3. 100% Pull Sheet Completion celebration chime, haptics, and modal trigger
 * 4. app.json camera permissions & plugin configuration verification
 */

import React from 'react';
import { renderHook, act, render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/context/theme-context';
import { ScannerProvider, useScanner } from '@/context/scanner-context';
import ScannerScreen from '../app/(tabs)/scanner';
import { AudioService } from '@/services/audio-service';
import { HapticService } from '@/services/haptic-service';
import * as pullSheetService from '@/services/pull-sheet-service';
import type { Pullsheet } from '@/types/pull-sheet';
import fs from 'fs';
import path from 'path';

// Mock auth context
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: { uid: 'operator-uid-100', tenantId: 'tenant-test' },
    tenant: { tenantId: 'tenant-test', name: 'Kuro Test' },
  }),
}));

// Mock equipment catalog
jest.mock('@/hooks/use-equipment', () => {
  const catalog = [
    {
      id: 'eq-k2',
      name: 'L-Acoustics K2',
      barcode: 'BAR-LA-K2-001',
      serialNumber: 'SN-K2-001',
      category: 'Audio',
      knownLocation: 'Warehouse A-1',
    },
    {
      id: 'eq-bmfl',
      name: 'Robe BMFL Blade',
      barcode: 'BAR-ROBE-BMFL-01',
      serialNumber: 'SN-BMFL-01',
      category: 'Lighting',
      knownLocation: 'Warehouse B-3',
    },
    {
      id: 'eq-off-sheet',
      name: 'Barco E2 Gen 2',
      barcode: 'BAR-BARCO-E2',
      serialNumber: 'SN-E2-99',
      category: 'Video',
      knownLocation: 'Warehouse V-1',
    },
  ];

  const map = new Map();
  for (const eq of catalog) {
    map.set(eq.id, eq);
  }

  return {
    useEquipment: () => ({
      equipment: catalog,
      equipmentLookupMap: map,
      isLoading: false,
    }),
  };
});

// Mock expo-router
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = { eventId: 'event-fest-2026' };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: jest.fn(),
  }),
  useLocalSearchParams: () => mockSearchParams,
  useIsFocused: () => true,
}));

// Mock single event hook
jest.mock('@/hooks/use-events', () => ({
  useSingleEvent: (eventId: string) => ({
    event: eventId
      ? {
          id: eventId,
          eventName: 'Electric Bloom Festival',
          eventNumber: 5001,
        }
      : null,
    isLoading: false,
  }),
}));

describe('Scanner Guardrails & 100% Completion Celebration Suite', () => {
  let mockPullsheetState: Pullsheet;
  let pullsheetListener: ((data: Pullsheet) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPullsheetState = {
      id: 'event-fest-2026',
      eventId: 'event-fest-2026',
      tenantId: 'tenant-test',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-k2',
          inventoryItemId: 'eq-k2',
          description: 'L-Acoustics K2 Line Array',
          quantity: 2,
          scannedQuantity: 1,
          status: 'pending',
          type: 'item',
        },
        {
          id: 'item-bmfl',
          inventoryItemId: 'eq-bmfl',
          description: 'Robe BMFL Blade',
          quantity: 1,
          scannedQuantity: 1,
          status: 'prepped_scanned',
          type: 'item',
        },
      ],
    };

    jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation(
      (eventId, tenantId, onUpdate) => {
        pullsheetListener = onUpdate;
        onUpdate(mockPullsheetState);
        return () => {
          pullsheetListener = null;
        };
      }
    );

    jest.spyOn(pullSheetService, 'updatePullsheetItemScannedCount').mockResolvedValue({
      success: true,
    });

    jest.spyOn(AudioService, 'playScanSuccess').mockResolvedValue();
    jest.spyOn(AudioService, 'playScanWarning').mockResolvedValue();
    jest.spyOn(AudioService, 'playScanError').mockResolvedValue();
    jest.spyOn(AudioService, 'playCelebrationChime').mockResolvedValue();

    jest.spyOn(HapticService, 'scanSuccess').mockResolvedValue();
    jest.spyOn(HapticService, 'scanWarning').mockResolvedValue();
    jest.spyOn(HapticService, 'scanError').mockResolvedValue();
    jest.spyOn(HapticService, 'scanCelebration').mockResolvedValue();
  });

  describe('1. Strict Rejection of Off-Sheet Items', () => {
    it('enforces strict rejection for fleet gear not on the active pullsheet: error tone, error haptic, zero DB writes', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('event-fest-2026');
      });

      let scanResult: any;
      await act(async () => {
        scanResult = await result.current.processScan('BAR-BARCO-E2');
      });

      expect(scanResult.type).toBe('NOT_ON_PULLSHEET');
      expect(AudioService.playScanError).toHaveBeenCalledTimes(1);
      expect(HapticService.scanError).toHaveBeenCalledTimes(1);
      expect(pullSheetService.updatePullsheetItemScannedCount).not.toHaveBeenCalled();
    });

    it('enforces strict rejection for completely unknown / unregistered barcode', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('event-fest-2026');
      });

      let scanResult: any;
      await act(async () => {
        scanResult = await result.current.processScan('TOTALLY-UNKNOWN-9999');
      });

      expect(scanResult.type).toBe('UNKNOWN_CODE');
      expect(AudioService.playScanError).toHaveBeenCalledTimes(1);
      expect(HapticService.scanError).toHaveBeenCalledTimes(1);
      expect(pullSheetService.updatePullsheetItemScannedCount).not.toHaveBeenCalled();
    });

    it('rejects scan and triggers error feedback if activeEventId is missing, preventing false success without server writes', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      // Explicitly ensure activeEventId is null
      act(() => {
        result.current.setActiveEventId(null);
      });

      let scanResult: any;
      await act(async () => {
        scanResult = await result.current.processScan('BAR-LA-K2-001');
      });

      expect(scanResult.type).toBe('NOT_ON_PULLSHEET');
      expect(AudioService.playScanError).toHaveBeenCalledTimes(1);
      expect(HapticService.scanError).toHaveBeenCalledTimes(1);
      expect(AudioService.playScanSuccess).not.toHaveBeenCalled();
      expect(HapticService.scanSuccess).not.toHaveBeenCalled();
      expect(pullSheetService.updatePullsheetItemScannedCount).not.toHaveBeenCalled();
    });
  });

  describe('2. Over-Prep Guard', () => {
    it('blocks scanning gear that has already reached 100% required quantity with warning audio and zero DB writes', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('event-fest-2026');
      });

      // item-bmfl is already 1/1 prepped
      let scanResult: any;
      await act(async () => {
        scanResult = await result.current.processScan('BAR-ROBE-BMFL-01');
      });

      expect(scanResult.type).toBe('ALREADY_COMPLETED');
      expect(scanResult.message).toContain('already fully prepped');
      expect(AudioService.playScanWarning).toHaveBeenCalledTimes(1);
      expect(HapticService.scanWarning).toHaveBeenCalledTimes(1);
      expect(pullSheetService.updatePullsheetItemScannedCount).not.toHaveBeenCalled();
    });
  });

  describe('3. 100% Pull Sheet Completion Celebration', () => {
    it('triggers victory chime, celebration haptics, and opens completion modal when final item is scanned', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ScannerProvider>{children}</ScannerProvider>
      );
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('event-fest-2026');
      });

      expect(result.current.isCompletionModalVisible).toBe(false);

      // item-k2 is 1/2. Scanning it will make it 2/2 (100% for k2, and bmfl is already 1/1).
      // This fulfills the ENTIRE pull sheet!
      let scanResult: any;
      await act(async () => {
        scanResult = await result.current.processScan('BAR-LA-K2-001');
      });

      expect(scanResult.type).toBe('SUCCESS');
      expect(scanResult.newScannedCount).toBe(2);
      expect(scanResult.isFullyPrepped).toBe(true);

      // Celebration acoustic & tactile feedback
      expect(AudioService.playCelebrationChime).toHaveBeenCalledTimes(1);
      expect(HapticService.scanCelebration).toHaveBeenCalledTimes(1);
      expect(result.current.isCompletionModalVisible).toBe(true);

      // Firestore was updated with final count
      expect(pullSheetService.updatePullsheetItemScannedCount).toHaveBeenCalledWith(
        'event-fest-2026',
        'tenant-test',
        'item-k2',
        2,
        true,
        { uid: 'operator-uid-100' },
        'BAR-LA-K2-001'
      );
    });

    it('renders celebration modal in ScannerScreen with navigation options', async () => {
      const { getByTestId, getByText, getByPlaceholderText } = render(
        <ThemeProvider>
          <ScannerProvider>
            <ScannerScreen />
          </ScannerProvider>
        </ThemeProvider>
      );

      // Enter the code for the final missing item
      const input = getByPlaceholderText('Type barcode or serial number...');
      fireEvent.changeText(input, 'BAR-LA-K2-001');

      const submitBtn = getByTestId('manual-code-submit-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(getByTestId('pullsheet-completion-celebration-modal')).toBeTruthy();
      expect(getByText('Pull Sheet 100% Complete!')).toBeTruthy();
      expect(getByTestId('celebration-view-pullsheet-btn')).toBeTruthy();
      expect(getByTestId('celebration-return-events-btn')).toBeTruthy();

      // Tap View Pull Sheet
      fireEvent.press(getByTestId('celebration-view-pullsheet-btn'));
      expect(mockReplace).toHaveBeenCalledWith('/pullsheet/event-fest-2026');
    }, 25000);
  });

  describe('4. Hardware & Camera Configuration in app.json', () => {
    it('has NSCameraUsageDescription, android CAMERA permission, and expo-camera plugin', () => {
      const appJsonPath = path.resolve(__dirname, '../app.json');
      const raw = fs.readFileSync(appJsonPath, 'utf8');
      const appConfig = JSON.parse(raw);

      // iOS
      expect(appConfig.expo.ios.infoPlist.NSCameraUsageDescription).toBeDefined();
      expect(appConfig.expo.ios.infoPlist.NSCameraUsageDescription).toContain('camera');

      // Android
      expect(appConfig.expo.android.permissions).toContain('CAMERA');

      // Plugins
      const hasCameraPlugin = appConfig.expo.plugins.some((p: any) =>
        typeof p === 'string' ? p === 'expo-camera' : p[0] === 'expo-camera'
      );
      expect(hasCameraPlugin).toBe(true);
    });
  });
});
