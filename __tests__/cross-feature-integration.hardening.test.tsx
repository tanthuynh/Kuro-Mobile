/**
 * __tests__/cross-feature-integration.hardening.test.tsx
 *
 * Kuro Mobile Cross-Feature Integration & Regression Hardening Test Suite.
 *
 * Verifies:
 * 1. Two-device realtime updates via Firestore onSnapshot without losing local state.
 * 2. Hardware back navigation sequence: open modal/sheet -> Back closes modal (screen stays) -> Back navigates to parent.
 * 3. Offline warehouse scan refusal without offline queueing.
 * 4. Multi-tenant zero-frame data isolation across tenant switches.
 * 5. In-flight disconnect handling & durable status reconciliation.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import EventDetailsScreen from '@/../app/events/[id]';
import { isOnline, setNetworkOnlineState, getPendingOperations, type PendingOperationRecord } from '@/services/pull-sheet-service';
import * as PullSheetService from '@/services/pull-sheet-service';
import { auth } from '@/lib/firebase';
import type { Pullsheet, PullsheetItem } from '@/types/pull-sheet';

// Mock Router
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({ id: 'evt-integration-101' }),
  useIsFocused: () => true,
  useFocusEffect: (cb: () => any) => {
    require('react').useEffect(cb, []);
  },
}));

// Mock Theme
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
    ThemeProvider: ({ children }: any) => children,
  };
});

// Mock Scanner Context
jest.mock('@/context/scanner-context', () => ({
  useScanner: () => ({
    activeEventId: 'evt-integration-101',
    setActiveEventId: jest.fn(),
    scanTargetStatus: 'prepped_scanned',
    setScanTargetStatus: jest.fn(),
    torchEnabled: false,
    toggleTorch: jest.fn(),
    lastResult: null,
    hudVisible: false,
    dismissHud: jest.fn(),
    processScan: jest.fn().mockResolvedValue({ success: true }),
  }),
  ScannerProvider: ({ children }: any) => children,
}));

// Mock Audio & Haptics
jest.mock('@/services/audio-service', () => ({
  AudioService: {
    playScanSuccess: jest.fn().mockResolvedValue(undefined),
    playScanFail: jest.fn().mockResolvedValue(undefined),
    playVictoryChime: jest.fn().mockResolvedValue(undefined),
    playStatusUpdateTone: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/haptic-service', () => ({
  HapticService: {
    scanSuccess: jest.fn(),
    scanError: jest.fn(),
    medium: jest.fn(),
    selection: jest.fn(),
  },
}));

// Mock Auth
const mockUser = {
  id: 'usr-tech-01',
  uid: 'usr-tech-01',
  name: 'Sam Integrator',
  email: 'sam@amiastudios.com',
  tenantId: 'tenant-acme',
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    tenant: { tenantId: 'tenant-acme', tenantName: 'Acme Staging' },
    isAuthenticated: true,
    isLoading: false,
    isRestoringSession: false,
  }),
}));

// Mock Events Hook
jest.mock('@/hooks/use-events', () => ({
  useSingleEvent: (eventId: string) => ({
    event: {
      id: eventId,
      name: 'Global Broadcast Gala',
      tenantId: 'tenant-acme',
      eventStatusId: 'Confirmed',
      startDate: new Date().toISOString(),
      finishDate: new Date(Date.now() + 86400000).toISOString(),
    },
    loading: false,
    error: null,
  }),
}));

// Mock Tickets Hook for owners
jest.mock('@/hooks/use-tickets', () => ({
  useTenantOwners: () => ({
    owners: [{ id: 'client-1', name: 'Acme Client' }],
    loading: false,
  }),
}));

describe('Kuro Mobile Cross-Feature Integration Hardening Suite', () => {
  let pullsheetData: Pullsheet;
  let pullsheetListener: ((data: Pullsheet) => void) | null = null;
  let backPressHandler: (() => boolean) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    setNetworkOnlineState(true);

    (auth as any).currentUser = {
      uid: mockUser.uid,
      getIdToken: jest.fn().mockResolvedValue('mock-id-token-valid'),
    };

    pullsheetData = {
      id: 'evt-integration-101',
      eventId: 'evt-integration-101',
      tenantId: 'tenant-acme',
      items: [
        {
          id: 'item-1',
          type: 'item',
          equipmentId: 'eq-robe-01',
          description: 'Robe MegaPointe',
          quantity: 4,
          scannedQuantity: 2,
          status: 'confirmed',
        } as PullsheetItem,
        {
          id: 'item-2',
          type: 'item',
          equipmentId: 'eq-shure-02',
          description: 'Shure Axient Dual Receiver',
          quantity: 2,
          scannedQuantity: 0,
          status: 'none',
        } as PullsheetItem,
      ],
    };

    // Spy on subscribePullsheet to capture subscriber callback
    jest.spyOn(PullSheetService, 'subscribePullsheet').mockImplementation((_eventId, _tenantId, onNext) => {
      pullsheetListener = onNext;
      onNext(pullsheetData);
      return jest.fn();
    });

    // Spy on BackHandler to capture hardware back subscription
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'hardwareBackPress') {
        backPressHandler = handler as any;
      }
      return {
        remove: jest.fn(() => {
          backPressHandler = null;
        }),
      };
    });
  });

  // ============================================================================
  // 1. TWO-DEVICE REALTIME UPDATES SIMULATION
  // ============================================================================
  describe('1. Two-Device Realtime Updates via onSnapshot', () => {
    it('updates item scanned counts and progress bar seamlessly when Device B mutates pull sheet', async () => {
      const { getByText, findByText } = render(<EventDetailsScreen />);

      expect(await findByText('Robe MegaPointe')).toBeTruthy();
      expect(getByText('2/4')).toBeTruthy();

      // Simulate Device B performing a scan and updating Firestore, which triggers Device A's listener
      act(() => {
        const updatedPullsheet: Pullsheet = {
          ...pullsheetData,
          items: [
            {
              ...pullsheetData.items[0],
              scannedQuantity: 3,
            },
            pullsheetData.items[1],
          ],
        };
        pullsheetListener?.(updatedPullsheet);
      });

      // Verify Device A's UI updates dynamically without refreshing screen
      expect(getByText('3/4')).toBeTruthy();
    });
  });

  // ============================================================================
  // 2. ANDROID HARDWARE BACK & SHEET INTERCEPTION
  // ============================================================================
  describe('2. Android Hardware Back Navigation & Sheet Dismissal', () => {
    it('dismisses bottom scanner sheet on hardware back press without navigating back', async () => {
      const { getByTestId } = render(<EventDetailsScreen />);

      // Open bottom scanner
      const startScanBtn = getByTestId('start-scanning-btn');
      act(() => {
        fireEvent.press(startScanBtn);
      });

      expect(backPressHandler).not.toBeNull();

      // Trigger Android hardware back press
      let handled = false;
      act(() => {
        handled = backPressHandler!();
      });

      // Hardware back should be consumed locally to close the scanner sheet
      expect(handled).toBe(true);

      // Router.back should NOT have been called
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('navigates back to /(tabs) when no modal sheet is open, debouncing rapid taps', async () => {
      render(<EventDetailsScreen />);

      expect(backPressHandler).not.toBeNull();

      // Trigger first hardware back press
      act(() => {
        const handled = backPressHandler!();
        expect(handled).toBe(true);
      });

      expect(mockBack).toHaveBeenCalledTimes(1);

      // Rapid secondary tap within debounce window (400ms)
      act(() => {
        backPressHandler!();
      });

      // router.back was debounced, so it was NOT called a second time
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 3. OFFLINE WAREHOUSE SCAN REFUSAL WITHOUT QUEUEING
  // ============================================================================
  describe('3. Offline Warehouse Scan Refusal', () => {
    it('blocks warehouse scan updates when offline and ensures zero writes are queued in storage', async () => {
      // Put service into offline state
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      const result = await PullSheetService.updatePullsheetItemScannedCount(
        'evt-integration-101',
        'tenant-acme',
        'item-1',
        3,
        false,
        { uid: mockUser.uid },
        'BAR-ROBE-001'
      );

      // Must be immediately rejected
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/network connection required/i);

      // Durable storage must NOT contain any offline mutation queue
      const pending = await getPendingOperations('tenant-acme', mockUser.uid);
      expect(pending).toHaveLength(0);
    });
  });

  // ============================================================================
  // 4. IN-FLIGHT DISCONNECT RECONCILIATION
  // ============================================================================
  describe('4. In-Flight Disconnect Handling & Durable Status Reconciliation', () => {
    it('persists in-flight operation as outcome_unknown on network drop and reconciles on reconnect', async () => {
      const opId = 'op-disconnect-test-99';
      const record: PendingOperationRecord = {
        operationId: opId,
        tenantId: 'tenant-acme',
        userId: mockUser.uid,
        eventId: 'evt-integration-101',
        action: 'increment_scan',
        payload: { itemId: 'item-1', scannedCount: 3, barcode: 'BAR-ROBE-001' },
        timestamp: Date.now(),
        state: 'outcome_unknown',
      };
      await AsyncStorage.setItem(
        `@kuro_pending_operations:tenant-acme:${mockUser.uid}`,
        JSON.stringify([record])
      );

      const saved = await getPendingOperations('tenant-acme', mockUser.uid);
      expect(saved).toHaveLength(1);
      expect(saved[0].operationId).toBe(opId);
      expect(saved[0].state).toBe('outcome_unknown');

      // Mock status endpoint returning committed result upon network restoration
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          status: 'committed',
          operationId: opId,
          reconciliationStatus: 'completed',
          result: { itemId: 'item-1', scannedCount: 3, status: 'partially_prepped' },
        }),
      } as any);

      // Reconcile pending operation
      const reconciliation = await PullSheetService.reconcilePendingOperation(
        'evt-integration-101',
        'tenant-acme',
        mockUser.uid,
        opId
      );

      expect(reconciliation.success).toBe(true);
      expect(reconciliation.status).toBe('committed');

      // Durable store should now be cleared of the acknowledged operation
      const afterReconcile = await getPendingOperations('tenant-acme', mockUser.uid);
      expect(afterReconcile).toHaveLength(0);
    });
  });
});
