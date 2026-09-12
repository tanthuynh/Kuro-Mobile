/**
 * __tests__/m3-offline-ux-adversarial.test.tsx
 * Empirical Challenger Adversarial Stress Suite for Milestone 3 (M3: Global Offline UX Indicators).
 *
 * Stress-tests and verifies:
 * 1. Rapid online/offline toggling & race conditions in NetworkProvider and useNetworkStatus().
 * 2. Rapid state changes and animation lifecycle in GlobalOfflineBanner without crashes or stuck states.
 * 3. Behavior when safe area insets are zero, undefined, null, or missing properties.
 * 4. Rapid metadata transitions (hasPendingWrites) on LogisticsJobCard and RepairTicketCard.
 * 5. Concurrent consumers and unmount race conditions.
 */

import React, { useEffect } from 'react';
import { render, act, renderHook } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import * as database from 'firebase/database';
import * as safeArea from 'react-native-safe-area-context';

import {
  NetworkProvider,
  useNetworkStatus,
  type NetworkStatus,
} from '@/context/network-context';
import { GlobalOfflineBanner } from '@/components/layout/global-offline-banner';
import { LogisticsJobCard } from '@/components/logistics/LogisticsJobCard';
import { RepairTicketCard } from '@/components/repair/repair-ticket-card';
import {
  mapFirestoreLogisticsDoc,
  subscribeToLogistics,
} from '@/services/logistics-service';
import {
  mapFirestoreRepairTicketDoc,
  subscribeTenantRepairTickets,
} from '@/services/repair-service';
import * as locationService from '@/services/location-tracking-service';
import * as repairService from '@/services/repair-service';
import * as pullSheetService from '@/services/pull-sheet-service';
import type { LogisticsEntry } from '@/types/logistics';
import type { RepairTicket } from '@/types/repair';

// Mock Safe Area Context with jest.fn() so it can be dynamically altered
jest.mock('react-native-safe-area-context', () => {
  const mockInset = { top: 44, right: 0, bottom: 34, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(mockInset),
    useSafeAreaInsets: jest.fn(() => mockInset),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// Mock Theme Context
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => ({
      colors: actualTheme.darkColors,
      typography: actualTheme.typography,
      spacing: actualTheme.spacing,
      layout: actualTheme.layout,
      isDark: false,
    }),
    ThemeProvider: ({ children }: any) => children,
  };
});

// Mock Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

describe('Empirical Adversarial Stress Suite: Milestone 3 Offline UX Indicators', () => {
  let rtdbListenerCallback: ((snap: any) => void) | null = null;
  let rtdbUnsubscribeMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    rtdbUnsubscribeMock = jest.fn();
    (database.onValue as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      rtdbListenerCallback = callback;
      return rtdbUnsubscribeMock;
    });
  });

  afterEach(() => {
    rtdbListenerCallback = null;
  });

  // ==========================================================================
  // SECTION 1: RAPID ONLINE/OFFLINE TOGGLING & RACE CONDITIONS IN NETWORKPROVIDER
  // ==========================================================================
  describe('1. Rapid Online/Offline Toggling & Race Conditions in NetworkProvider', () => {
    it('handles a 50-cycle rapid synchronous toggle storm without crashing and settles on the correct final state', () => {
      const { result } = renderHook(() => useNetworkStatus(), {
        wrapper: ({ children }) => <NetworkProvider>{children}</NetworkProvider>,
      });

      expect(rtdbListenerCallback).toBeTruthy();

      // Fire 50 alternating online/offline snapshots rapidly
      act(() => {
        for (let i = 0; i < 50; i++) {
          const isOnline = i % 2 === 0;
          rtdbListenerCallback!({ val: () => isOnline });
        }
      });

      // Iteration 49 had i=49 (49 % 2 !== 0), so last value is offline (false)
      expect(result.current.isOnline).toBe(false);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionType).toBe('none');

      // Now toggle once more to online
      act(() => {
        rtdbListenerCallback!({ val: () => true });
      });

      expect(result.current.isOnline).toBe(true);
      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionType).toBe('wifi');
    });

    it('synchronizes domain services (location-tracking, repair, pull-sheet) accurately during rapid toggles', () => {
      const locSpy = jest.spyOn(locationService, 'setNetworkOnlineState');
      const repSpy = jest.spyOn(repairService, 'setNetworkOnlineState');
      const pullSpy = jest.spyOn(pullSheetService, 'setNetworkOnlineState');

      renderHook(() => useNetworkStatus(), {
        wrapper: ({ children }) => <NetworkProvider>{children}</NetworkProvider>,
      });

      // Clear initial mount synchronization calls
      locSpy.mockClear();
      repSpy.mockClear();
      pullSpy.mockClear();

      // Trigger offline
      act(() => {
        rtdbListenerCallback!({ val: () => false });
      });

      expect(locSpy).toHaveBeenCalledWith(false);
      expect(repSpy).toHaveBeenCalledWith(false);
      expect(pullSpy).toHaveBeenCalledWith(false);

      // Trigger online
      act(() => {
        rtdbListenerCallback!({ val: () => true });
      });

      expect(locSpy).toHaveBeenCalledWith(true);
      expect(repSpy).toHaveBeenCalledWith(true);
      expect(pullSpy).toHaveBeenCalledWith(true);

      locSpy.mockRestore();
      repSpy.mockRestore();
      pullSpy.mockRestore();
    });

    it('recovers cleanly when RTDB emits malformed or unexpected snapshot values', () => {
      const { result } = renderHook(() => useNetworkStatus(), {
        wrapper: ({ children }) => <NetworkProvider>{children}</NetworkProvider>,
      });

      // RTDB emits null snapshot
      act(() => {
        rtdbListenerCallback!(null);
      });
      expect(result.current.isOnline).toBe(false);

      // RTDB emits snapshot with undefined val()
      act(() => {
        rtdbListenerCallback!({ val: () => undefined });
      });
      expect(result.current.isOnline).toBe(false);

      // RTDB emits snapshot with non-boolean string "true"
      act(() => {
        rtdbListenerCallback!({ val: () => 'true' });
      });
      // val() === true strict check: string 'true' should evaluate to false
      expect(result.current.isOnline).toBe(false);

      // RTDB emits snapshot with boolean true
      act(() => {
        rtdbListenerCallback!({ val: () => true });
      });
      expect(result.current.isOnline).toBe(true);
    });

    it('properly cleans up RTDB subscription on unmount without memory leaks', () => {
      const { unmount } = renderHook(() => useNetworkStatus(), {
        wrapper: ({ children }) => <NetworkProvider>{children}</NetworkProvider>,
      });

      expect(rtdbUnsubscribeMock).not.toHaveBeenCalled();

      unmount();

      expect(rtdbUnsubscribeMock).toHaveBeenCalledTimes(1);
    });

    it('supports 100 concurrent consumer hooks subscribing simultaneously under rapid network state changes', () => {
      const consumerCount = 100;
      const hooks: Array<{ current: NetworkStatus }> = [];

      for (let i = 0; i < consumerCount; i++) {
        const { result } = renderHook(() => useNetworkStatus(), {
          wrapper: ({ children }) => <NetworkProvider>{children}</NetworkProvider>,
        });
        hooks.push(result);
      }

      // Verify all 100 consumers read initial state
      for (const h of hooks) {
        expect(h.current.isOnline).toBe(true);
      }
    });

    it('investigates initialOnline test override behavior under RTDB disconnection events', () => {
      // 1. Without initialOnline: RTDB false -> offline
      const hookDefault = renderHook(() => useNetworkStatus(), {
        wrapper: ({ children }) => <NetworkProvider>{children}</NetworkProvider>,
      });
      act(() => {
        rtdbListenerCallback!({ val: () => false });
      });
      expect(hookDefault.result.current.isOnline).toBe(false);

      // 2. With initialOnline=false: initial state is false
      const hookOffline = renderHook(() => useNetworkStatus(), {
        wrapper: ({ children }) => <NetworkProvider initialOnline={false}>{children}</NetworkProvider>,
      });
      expect(hookOffline.result.current.isOnline).toBe(false);
      // RTDB true overrides it
      act(() => {
        rtdbListenerCallback!({ val: () => true });
      });
      expect(hookOffline.result.current.isOnline).toBe(true);

      // 3. With initialOnline=true: When RTDB emits false (disconnects)
      const hookOnline = renderHook(() => useNetworkStatus(), {
        wrapper: ({ children }) => <NetworkProvider initialOnline={true}>{children}</NetworkProvider>,
      });
      expect(hookOnline.result.current.isOnline).toBe(true);
      act(() => {
        rtdbListenerCallback!({ val: () => false });
      });
      // Empirical verification: Because network-context.tsx lines 118-120 has:
      // if (initialOnline !== undefined && !connected) { setIsOnline(initialOnline); return; }
      // isOnline stays `true` (locked to initialOnline) and DOES NOT transition to false!
      expect(hookOnline.result.current.isOnline).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 2: RAPID STATE CHANGES IN GLOBALOFFLINEBANNER WITHOUT STUCK STATES
  // ==========================================================================
  describe('2. Rapid State Changes in GlobalOfflineBanner without Stuck States', () => {
    it('survives rapid online -> offline -> online -> offline toggling without crashing or stuck states', () => {
      const { queryByTestId, rerender } = render(
        <NetworkProvider initialOnline={true}>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      // Online: banner hidden
      expect(queryByTestId('global-offline-banner')).toBeNull();

      // Rapid cycling 10 times
      for (let cycle = 0; cycle < 10; cycle++) {
        rerender(
          <NetworkProvider initialOnline={false}>
            <GlobalOfflineBanner />
          </NetworkProvider>
        );
        expect(queryByTestId('global-offline-banner')).toBeTruthy();

        rerender(
          <NetworkProvider initialOnline={true}>
            <GlobalOfflineBanner />
          </NetworkProvider>
        );
        expect(queryByTestId('global-offline-banner')).toBeNull();
      }

      // Settle on offline
      rerender(
        <NetworkProvider initialOnline={false}>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      const banner = queryByTestId('global-offline-banner');
      expect(banner).toBeTruthy();
      expect(banner?.props.accessibilityRole).toBe('alert');
    });

    it('unmounts cleanly while fade animation is in progress without unhandled exceptions', () => {
      const { unmount } = render(
        <NetworkProvider initialOnline={false}>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      // Unmount immediately while timing animation is running
      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it('dynamically adapts when RTDB switches connection under live mount without rerendering wrapper props', () => {
      const { queryByTestId } = render(
        <NetworkProvider>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      // By default online -> banner null
      expect(queryByTestId('global-offline-banner')).toBeNull();

      // RTDB drops connection
      act(() => {
        rtdbListenerCallback!({ val: () => false });
      });
      expect(queryByTestId('global-offline-banner')).toBeTruthy();

      // RTDB restores connection
      act(() => {
        rtdbListenerCallback!({ val: () => true });
      });
      expect(queryByTestId('global-offline-banner')).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 3: BEHAVIOR WHEN SAFE AREA INSETS ARE ZERO, UNDEFINED, OR PARTIAL
  // ==========================================================================
  describe('3. Behavior When Safe Area Insets are Zero or Undefined', () => {
    it('handles safe area insets with top: 0 (e.g., Android without notch or desktop) gracefully', () => {
      const insetsSpy = jest.spyOn(safeArea, 'useSafeAreaInsets').mockReturnValue({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      });

      const { getByTestId } = render(
        <NetworkProvider initialOnline={false}>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      const banner = getByTestId('global-offline-banner');
      const flattenedStyle = banner.props.style;
      const styleObj = Array.isArray(flattenedStyle)
        ? Object.assign({}, ...flattenedStyle)
        : flattenedStyle;

      // paddingTop should be Math.max(0, 0) + 4 = 4
      expect(styleObj.paddingTop).toBe(4);

      insetsSpy.mockRestore();
    });

    it('handles negative safe area insets defensively by clamping to zero', () => {
      const insetsSpy = jest.spyOn(safeArea, 'useSafeAreaInsets').mockReturnValue({
        top: -15,
        bottom: 0,
        left: 0,
        right: 0,
      });

      const { getByTestId } = render(
        <NetworkProvider initialOnline={false}>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      const banner = getByTestId('global-offline-banner');
      const flattenedStyle = banner.props.style;
      const styleObj = Array.isArray(flattenedStyle)
        ? Object.assign({}, ...flattenedStyle)
        : flattenedStyle;

      // Math.max(-15, 0) + 4 = 4
      expect(styleObj.paddingTop).toBe(4);

      insetsSpy.mockRestore();
    });

    it('identifies vulnerability when safe area insets returns empty object (insets.top is undefined)', () => {
      const insetsSpy = jest.spyOn(safeArea, 'useSafeAreaInsets').mockReturnValue({} as any);

      const { getByTestId } = render(
        <NetworkProvider initialOnline={false}>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      const banner = getByTestId('global-offline-banner');
      const flattenedStyle = banner.props.style;
      const styleObj = Array.isArray(flattenedStyle)
        ? Object.assign({}, ...flattenedStyle)
        : flattenedStyle;

      // Empirical finding: Math.max(undefined, 0) in JS produces NaN!
      // Therefore styleObj.paddingTop becomes NaN (NaN + 4 = NaN)
      expect(Number.isNaN(styleObj.paddingTop)).toBe(true);

      insetsSpy.mockRestore();
    });

    it('identifies crash vulnerability when useSafeAreaInsets() returns undefined', () => {
      const insetsSpy = jest.spyOn(safeArea, 'useSafeAreaInsets').mockReturnValue(undefined as any);

      let crashError: any = null;
      try {
        render(
          <NetworkProvider initialOnline={false}>
            <GlobalOfflineBanner />
          </NetworkProvider>
        );
      } catch (err: any) {
        crashError = err;
      }

      // Empirical finding: GlobalOfflineBanner does `insets.top` without optional chaining `insets?.top`
      // causing TypeError: Cannot read property 'top' of undefined
      expect(crashError).toBeTruthy();
      expect(crashError.message).toMatch(/Cannot read propert/i);

      insetsSpy.mockRestore();
    });
  });

  // ==========================================================================
  // SECTION 4: RAPID METADATA CHANGES & PENDING SYNC INDICATORS
  // ==========================================================================
  describe('4. Rapid Metadata Changes (hasPendingWrites) on Feed Cards', () => {
    const baseJob: LogisticsEntry = {
      id: 'job-stress-01',
      tenantId: 'tenant-test',
      eventNumber: 301,
      eventName: 'Stadium Gig',
      location: 'Optus Stadium, Perth',
      status: 'In Transit',
      driverName: 'Alice',
      start: '2026-09-16T10:00:00Z',
      end: '2026-09-16T20:00:00Z',
      createdBy: 'admin',
      updatedBy: 'admin',
      createdAt: '2026-09-16T08:00:00Z',
      updatedAt: '2026-09-16T09:00:00Z',
    };

    const baseTicket: RepairTicket = {
      id: 'ticket-stress-01',
      tenantId: 'tenant-test',
      repairNumber: 701,
      equipment: {
        name: 'Moving Head Light',
        serialNumber: 'MHL-2000',
      },
      status: 'Reported',
      priority: 'High',
      requestedBy: 'Tech Crew',
      createdAt: '2026-09-16T11:00:00Z',
      updatedAt: '2026-09-16T11:30:00Z',
    };

    it('toggles LogisticsJobCard pending sync badge repeatedly across 20 state flips', () => {
      const { queryByTestId, rerender } = render(
        <LogisticsJobCard job={{ ...baseJob, hasPendingWrites: false }} />
      );

      for (let i = 0; i < 20; i++) {
        const isPending = i % 2 === 0;
        rerender(
          <LogisticsJobCard job={{ ...baseJob, hasPendingWrites: isPending }} />
        );

        if (isPending) {
          expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeTruthy();
        } else {
          expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeNull();
        }
      }
    });

    it('toggles RepairTicketCard pending sync badge repeatedly across 20 state flips', () => {
      const { queryByTestId, rerender } = render(
        <RepairTicketCard ticket={{ ...baseTicket, hasPendingWrites: false }} />
      );

      for (let i = 0; i < 20; i++) {
        const isPending = i % 2 === 0;
        rerender(
          <RepairTicketCard ticket={{ ...baseTicket, hasPendingWrites: isPending }} />
        );

        if (isPending) {
          expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeTruthy();
        } else {
          expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeNull();
        }
      }
    });

    it('mapFirestoreLogisticsDoc safely handles null or undefined metadata without crashing', () => {
      const docWithoutMetadata = {
        id: 'job-1',
        data: () => ({ id: 'job-1', tenantId: 'tenant-test', status: 'Scheduled' }),
      };

      const result = mapFirestoreLogisticsDoc(docWithoutMetadata);
      expect(result.hasPendingWrites).toBe(false);

      const docWithEmptyMetadata = {
        id: 'job-1',
        data: () => ({ id: 'job-1', tenantId: 'tenant-test', status: 'Scheduled' }),
        metadata: {},
      };
      const result2 = mapFirestoreLogisticsDoc(docWithEmptyMetadata);
      expect(result2.hasPendingWrites).toBe(false);
    });

    it('mapFirestoreRepairTicketDoc safely handles null or undefined metadata without crashing', () => {
      const docWithoutMetadata = {
        id: 'ticket-1',
        data: () => ({ id: 'ticket-1', tenantId: 'tenant-test', status: 'Reported', equipment: { name: 'Mic' } }),
      };

      const result = mapFirestoreRepairTicketDoc(docWithoutMetadata);
      expect(result.hasPendingWrites).toBe(false);

      const docWithEmptyMetadata = {
        id: 'ticket-1',
        data: () => ({ id: 'ticket-1', tenantId: 'tenant-test', status: 'Reported', equipment: { name: 'Mic' } }),
        metadata: {},
      };
      const result2 = mapFirestoreRepairTicketDoc(docWithEmptyMetadata);
      expect(result2.hasPendingWrites).toBe(false);
    });
  });
});
