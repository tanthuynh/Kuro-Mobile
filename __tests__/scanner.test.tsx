/**
 * __tests__/scanner.test.tsx
 * Unit and integration tests for Milestone 4: Continuous Scanner, Camera Viewfinder & HUD.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { renderHook } from '@testing-library/react-native';
import { CameraViewfinder } from '@/components/scanner/camera-viewfinder';
import { ScanHudOverlay } from '@/components/scanner/scan-hud-overlay';
import { ManualCodeInput } from '@/components/scanner/manual-code-input';
import { ScannerProvider, useScanner } from '@/context/scanner-context';
import * as pullSheetService from '@/services/pull-sheet-service';
import * as equipmentService from '@/services/equipment-service';
import { AudioService } from '@/services/audio-service';
import { HapticService } from '@/services/haptic-service';
import type { Equipment } from '@/types/equipment';
import type { Pullsheet } from '@/types/pull-sheet';

// Mock theme
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

// Mock auth
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      uid: 'user-123',
      tenantId: 'tenant-abc',
      firstName: 'Alex',
    },
    tenant: {
      tenantId: 'tenant-abc',
      tenantName: 'Amia Productions',
    },
    isAuthenticated: true,
  }),
}));

const sampleEquipment: Equipment[] = [
  {
    id: 'eq-1',
    tenantId: 'tenant-abc',
    name: 'L-Acoustics K2 Line Array',
    barcode: 'BAR-LA-K2-0042',
    serialNumber: 'SN-994821',
    category: 'Audio',
    quantity: 12,
  },
  {
    id: 'eq-2',
    tenantId: 'tenant-abc',
    name: 'Robe BMFL Blade',
    barcode: 'BAR-RB-BMFL-018',
    serialNumber: 'SN-441209',
    category: 'Lighting',
    quantity: 8,
  },
];

const samplePullsheet: Pullsheet = {
  id: 'ev-101',
  eventId: 'ev-101',
  tenantId: 'tenant-abc',
  items: [
    {
      id: 'ps-item-1',
      inventoryItemId: 'eq-1',
      description: 'L-Acoustics K2 Line Array',
      quantity: 4,
      scannedQuantity: 1,
      type: 'item',
      status: 'confirmed',
    },
  ],
};

describe('Milestone 4: Continuous Scanner UI & Workflow', () => {
  describe('CameraViewfinder', () => {
    it('renders reticle, torch toggle, and simulated scan trigger', () => {
      const onScan = jest.fn();
      const onToggleTorch = jest.fn();

      const { getByTestId, getByText } = render(
        <CameraViewfinder
          onScan={onScan}
          torchEnabled={false}
          onToggleTorch={onToggleTorch}
        />
      );

      expect(getByTestId('camera-viewfinder-container')).toBeTruthy();
      expect(getByText('Point camera reticle at equipment asset tag')).toBeTruthy();

      // Trigger barcode scanned event on CameraView in test environment
      const cameraView = getByTestId('camera-view-native');
      fireEvent(cameraView, 'barcodeScanned', { data: 'SN-994821' });
      expect(onScan).toHaveBeenCalledWith('SN-994821');

      // Toggle torch
      const torchBtn = getByTestId('torch-toggle-btn');
      fireEvent.press(torchBtn);
      expect(onToggleTorch).toHaveBeenCalled();
    });
  });

  describe('ScanHudOverlay', () => {
    it('renders success, duplicate, and unassigned gear banners', () => {
      const onDismiss = jest.fn();

      const { getByText, rerender } = render(
        <ScanHudOverlay
          visible={true}
          onDismiss={onDismiss}
          result={{
            type: 'SUCCESS',
            message: 'Prepped: L-Acoustics K2 (2/4)',
            isFullyPrepped: false,
          }}
        />
      );

      expect(getByText('Asset Scanned')).toBeTruthy();
      expect(getByText('Prepped: L-Acoustics K2 (2/4)')).toBeTruthy();

      rerender(
        <ScanHudOverlay
          visible={true}
          onDismiss={onDismiss}
          result={{
            type: 'ALREADY_COMPLETED',
            message: 'Item already fully prepped',
            isFullyPrepped: true,
          }}
        />
      );
      expect(getByText('Already Fully Prepped')).toBeTruthy();

      rerender(
        <ScanHudOverlay
          visible={true}
          onDismiss={onDismiss}
          result={{
            type: 'NOT_ON_PULLSHEET',
            message: 'Item not on this pull sheet',
          }}
        />
      );
      expect(getByText('Gear Not On Job Pull Sheet')).toBeTruthy();
    });
  });

  describe('ManualCodeInput', () => {
    it('submits manual code on enter or button tap', () => {
      const onSubmit = jest.fn();

      const { getByPlaceholderText, getByTestId } = render(
        <ManualCodeInput onSubmitCode={onSubmit} />
      );

      const input = getByPlaceholderText('Type barcode or serial number...');
      fireEvent.changeText(input, 'SN-994821');

      const submitBtn = getByTestId('manual-code-submit-btn');
      fireEvent.press(submitBtn);

      expect(onSubmit).toHaveBeenCalledWith('SN-994821');
    });
  });

  describe('ScannerContext & Workflow', () => {
    beforeEach(() => {
      jest.spyOn(equipmentService, 'subscribeEquipment').mockImplementation((tenantId, onData) => {
        onData(sampleEquipment);
        return jest.fn();
      });

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onData) => {
        onData(samplePullsheet);
        return jest.fn();
      });

      jest.spyOn(pullSheetService, 'updatePullsheetItemScannedCount').mockResolvedValue({ success: true });
      jest.spyOn(AudioService, 'playScanSuccess').mockResolvedValue();
      jest.spyOn(AudioService, 'playScanWarning').mockResolvedValue();
      jest.spyOn(AudioService, 'playScanError').mockResolvedValue();
      jest.spyOn(HapticService, 'scanSuccess').mockResolvedValue();
      jest.spyOn(HapticService, 'scanWarning').mockResolvedValue();
      jest.spyOn(HapticService, 'scanError').mockResolvedValue();
    });

    it('processes scan matches and records recent scans', async () => {
      const wrapper = ({ children }: any) => <ScannerProvider>{children}</ScannerProvider>;
      const { result } = renderHook(() => useScanner(), { wrapper });

      act(() => {
        result.current.setActiveEventId('ev-101');
      });

      // Match item on pullsheet by barcode
      let scanRes: any;
      await act(async () => {
        scanRes = await result.current.processScan('SN-994821');
      });

      expect(scanRes.type).toBe('SUCCESS');
      expect(AudioService.playScanSuccess).toHaveBeenCalled();
      expect(HapticService.scanSuccess).toHaveBeenCalled();
      expect(result.current.recentScans.length).toBe(1);
      expect(result.current.recentScans[0].code).toBe('SN-994821');

      // Scan gear in fleet but not on pullsheet
      let notOnJobRes: any;
      await act(async () => {
        notOnJobRes = await result.current.processScan('BAR-RB-BMFL-018');
      });

      expect(notOnJobRes.type).toBe('NOT_ON_PULLSHEET');
      expect(AudioService.playScanError).toHaveBeenCalled();
    });
  });
});
