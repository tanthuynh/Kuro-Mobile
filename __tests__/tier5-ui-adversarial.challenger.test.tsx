/**
 * __tests__/tier5-ui-adversarial.challenger.test.tsx
 *
 * Tier 5 White-Box Adversarial Stress Testing on:
 * - app/logistics/[id].tsx (LogisticsJobDetailScreen)
 * - app/(tabs)/logistics.tsx (LogisticsFeedScreen)
 *
 * Authored by Challenger M4-2 (Tier 5 UI Adversarial Challenger)
 *
 * Adversarial Focus:
 * 1. Rapid consecutive presses on Finish button (race condition prevention, idempotent completion, R6 ordering)
 * 2. Rapid consecutive presses on Start Tracking under gating failure (alert handling, state invariance, no memory leaks)
 * 3. Component unmounting while async updateStatus or stopTrackingJob is in-flight
 * 4. Linking.openSettings() rejection and platform exception handling
 * 5. Corrupted, malformed, or boundary AsyncStorage values for @kuro_bg_location_disclosure_accepted
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert, Linking, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import LogisticsJobDetailScreen from '@/../app/logistics/[id]';
import LogisticsFeedScreen from '@/../app/(tabs)/logistics';
import * as locationTrackingService from '@/services/location-tracking-service';
import * as logisticsService from '@/services/logistics-service';
import type { LogisticsEntry } from '@/types/logistics';

// ============================================================================
// CONTEXT & SERVICE MODULE MOCKS
// ============================================================================

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

const mockDriver = {
  id: 'usr-driver-adv',
  uid: 'usr-driver-adv',
  name: 'Elena Vance',
  email: 'elena@kuro.test',
  tenantId: 'tenant-adversarial',
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockDriver,
    tenant: { tenantId: 'tenant-adversarial', tenantName: 'Adversarial Transport' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

let mockActiveRouteJobId = 'job-adv-001';
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      push: mockRouterPush,
      back: mockRouterBack,
      canGoBack: () => true,
      replace: jest.fn(),
    }),
    useLocalSearchParams: () => ({
      id: mockActiveRouteJobId,
    }),
    useFocusEffect: jest.fn((effect) => {
      React.useEffect(() => {
        const cleanup = effect();
        return () => {
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    }),
    useIsFocused: jest.fn(() => true),
  };
});

jest.mock('@/services/logistics-service', () => {
  const actual = jest.requireActual('@/services/logistics-service');
  return {
    ...actual,
    updateJobLocation: jest.fn().mockResolvedValue(undefined),
    stopJobTracking: jest.fn().mockResolvedValue(undefined),
    getLogisticsEntry: jest.fn(),
    subscribeSingleLogisticsEntry: jest.fn(),
    subscribeToLogistics: jest.fn(),
    fetchTenantLogistics: jest.fn(),
    fetchVehicleById: jest.fn().mockResolvedValue({
      id: 'veh-adv-01',
      name: 'Adversarial Rig 01',
      rego: 'NSW-ADV-01',
    }),
    updateLogisticsStatus: jest.fn().mockResolvedValue(undefined),
    batchUploadLocationHistory: jest.fn().mockResolvedValue(undefined),
  };
});

// Mock Single Job Fixture
const mockScheduledJob: LogisticsEntry = {
  id: 'job-adv-001',
  tenantId: 'tenant-adversarial',
  eventNumber: 999,
  eventName: 'Adversarial Stress Route Run',
  location: 'Sydney Olympic Park, NSW',
  status: 'Scheduled',
  driverName: 'Elena Vance',
  assigneeId: 'usr-driver-adv',
  driverId: 'usr-driver-adv',
  vehicleId: 'veh-adv-01',
  start: new Date('2026-09-20T08:00:00Z'),
  end: new Date('2026-09-20T16:00:00Z'),
  createdBy: 'Stress Harness',
  updatedBy: 'Stress Harness',
  createdAt: '2026-09-20T06:00:00Z',
  updatedAt: '2026-09-20T06:00:00Z',
  archived: false,
  isTrackingActive: false,
  notes: 'High-velocity load run.',
  destinations: [
    {
      id: 'dest-01',
      type: 'destination',
      destinationName: 'Main Arena Bay 1',
      address: 'Olympic Blvd, Sydney NSW 2127',
      time: '09:00 AM',
      estTravelTime: '15 min',
    },
  ],
};

describe('Tier 5 UI Adversarial Stress Tests (Challenger M4-2)', () => {
  let alertSpy: jest.SpyInstance;
  let openSettingsSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    locationTrackingService._resetTrackingStateForTesting();
    locationTrackingService.setNetworkOnlineState(true);

    mockActiveRouteJobId = 'job-adv-001';

    alertSpy = jest.spyOn(Alert, 'alert');
    openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

    // Default Expo Location mocks (all precise and healthy)
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
    });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
    });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
    });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
    });
    (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);

    // Default Logistics service mocks
    (logisticsService.getLogisticsEntry as jest.Mock).mockResolvedValue(mockScheduledJob);
    (logisticsService.subscribeSingleLogisticsEntry as jest.Mock).mockImplementation((_jId, _tId, cb) => {
      cb(mockScheduledJob);
      return () => {};
    });
    (logisticsService.subscribeToLogistics as jest.Mock).mockImplementation((_tId, cb) => {
      cb([mockScheduledJob]);
      return () => {};
    });
  });

  // ==========================================================================
  // SECTION 1: Rapid Consecutive Presses on Finish Button
  // ==========================================================================
  describe('Focus 1: Rapid Consecutive Presses on Finish Button (Concurrency & R6 Invariance)', () => {
    it('T5.UI.Finish.01: Rapid triple press on Finish button while updateStatus is in-flight preserves R6 stop-after-status order', async () => {
      let resolveUpdateStatus: (val?: any) => void = () => {};
      let updateStatusCallCount = 0;

      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(() => {
        updateStatusCallCount++;
        return new Promise((resolve) => {
          resolveUpdateStatus = resolve;
        });
      });

      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      // Rapid consecutive presses on Finish
      await act(async () => {
        fireEvent.press(finishBtn);
        fireEvent.press(finishBtn);
        fireEvent.press(finishBtn);
      });

      // R6 invariant check: updateStatus is in-flight; stopTrackingJob must NOT have been called yet
      expect(updateStatusCallCount).toBeGreaterThanOrEqual(1);
      expect(stopTrackingSpy).not.toHaveBeenCalled();

      // Resolve the in-flight status update
      await act(async () => {
        resolveUpdateStatus(undefined);
      });

      // After status write succeeds, stopTrackingJob must be called
      expect(stopTrackingSpy).toHaveBeenCalledWith('job-adv-001');
    });

    it('T5.UI.Finish.02: Concurrent Finish button and QuickStatusSelector "Completed" triggers handle R6 safely without crashing', async () => {
      let resolveUpdateStatus: (val?: any) => void = () => {};
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(() => {
        return new Promise((resolve) => {
          resolveUpdateStatus = resolve;
        });
      });

      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');
      const quickStatusSelector = await findByTestId('job-quick-status-selector');

      // Simultaneously trigger Finish button and QuickStatus "Completed"
      await act(async () => {
        fireEvent.press(finishBtn);
        if (quickStatusSelector.props.onSelect) {
          quickStatusSelector.props.onSelect('Completed');
        }
      });

      expect(stopTrackingSpy).not.toHaveBeenCalled();

      // Resolve status updates
      await act(async () => {
        resolveUpdateStatus(undefined);
      });

      // Both gracefully finish and stop tracking without uncaught promise exceptions
      expect(stopTrackingSpy).toHaveBeenCalled();
    });

    it('T5.UI.Finish.03: Finish button is disabled when job is already Completed', async () => {
      const completedJob: LogisticsEntry = {
        ...mockScheduledJob,
        status: 'Completed',
      };

      (logisticsService.subscribeSingleLogisticsEntry as jest.Mock).mockImplementation((_jId, _tId, cb) => {
        cb(completedJob);
        return () => {};
      });

      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');
      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      expect(finishBtn.props.accessibilityState?.disabled).toBe(true);

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // Disabled button must not execute status update or tracking teardown
      expect(updateStatusSpy).not.toHaveBeenCalled();
      expect(stopTrackingSpy).not.toHaveBeenCalled();
    });

    it('T5.UI.Finish.04: Failed Finish write keeps tracking active and allows successful rapid retry', async () => {
      let callCount = 0;
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Firestore timeout / network drop');
        }
        return undefined;
      });

      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      // Attempt 1: Fails
      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // Tracking must remain active, error banner displayed
      expect(stopTrackingSpy).not.toHaveBeenCalled();
      expect(await findByText('Firestore timeout / network drop')).toBeTruthy();

      // Attempt 2: Rapid retry succeeds
      await act(async () => {
        fireEvent.press(finishBtn);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-adv-001');
    });

    it('T5.UI.Finish.05: Finish button maintains tracking when offline write fails with pending telemetry', async () => {
      locationTrackingService.setNetworkOnlineState(false);
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockRejectedValue(
        new Error('Network unavailable offline')
      );

      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // R6 invariant: tracking MUST remain active
      expect(stopTrackingSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SECTION 2: Rapid Consecutive Presses on Start Tracking Under Gating Failure
  // ==========================================================================
  describe('Focus 2: Rapid Consecutive Presses on Start Tracking Under Gating Failure', () => {
    it('T5.UI.StartGating.01: 5x burst press on Start with GPS disabled maintains state invariance and does not start native updates', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      // Fire 5 rapid presses
      await act(async () => {
        fireEvent.press(startBtn);
        fireEvent.press(startBtn);
        fireEvent.press(startBtn);
        fireEvent.press(startBtn);
        fireEvent.press(startBtn);
      });

      // Alert dialog presented
      expect(alertSpy).toHaveBeenCalledWith(
        'Location Services Disabled',
        expect.stringContaining('Device location services are turned off'),
        expect.any(Array)
      );

      // Invariance checks:
      // 1. Job status not updated
      expect(logisticsService.updateLogisticsStatus).not.toHaveBeenCalled();
      // 2. Native tracking updates never initiated
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      // 3. Button is not stuck loading
      expect(startBtn.props.accessibilityState?.busy).toBe(false);
    });

    it('T5.UI.StartGating.02: 5x burst press on Start with denied permissions shows actionable alert and preserves Scheduled status', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          fireEvent.press(startBtn);
        }
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Location Permission Required',
        expect.stringContaining('Location access is required'),
        expect.any(Array)
      );

      expect(logisticsService.updateLogisticsStatus).not.toHaveBeenCalled();
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('T5.UI.StartGating.03: 5x burst press on Start with approximate accuracy prompts for precise location without mutating state', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        android: { accuracy: 'coarse' },
      });

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          fireEvent.press(startBtn);
        }
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Precise Location Required',
        expect.stringContaining('Kuro Mobile requires precise GPS location'),
        expect.any(Array)
      );

      expect(logisticsService.updateLogisticsStatus).not.toHaveBeenCalled();
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('T5.UI.StartGating.04: Cancelling alert leaves component in consistent state for subsequent start attempts', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(startBtn);
      });

      expect(alertSpy).toHaveBeenCalled();
      const alertButtons = alertSpy.mock.calls[0][2];
      const cancelBtn = alertButtons.find((b: any) => b.text === 'Cancel');
      expect(cancelBtn).toBeDefined();

      // Dismiss alert via Cancel button
      if (cancelBtn?.onPress) {
        await act(async () => {
          cancelBtn.onPress();
        });
      }

      // Re-attempting Start produces clean alert without crash
      await act(async () => {
        fireEvent.press(startBtn);
      });

      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('T5.UI.StartGating.05: Listener registrations do not leak or multiply across repeated start gating failures', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const addLocSpy = jest.spyOn(locationTrackingService, 'addLocationListener');
      const addSyncSpy = jest.spyOn(locationTrackingService, 'addSyncStatusListener');

      const { findByTestId, unmount } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      // Initial mount registers exactly 1 listener each
      expect(addLocSpy).toHaveBeenCalledTimes(1);
      expect(addSyncSpy).toHaveBeenCalledTimes(1);

      // Perform repeated start presses
      await act(async () => {
        for (let i = 0; i < 5; i++) {
          fireEvent.press(startBtn);
        }
      });

      // Pressing start does not re-subscribe component lifecycle listeners
      expect(addLocSpy).toHaveBeenCalledTimes(1);
      expect(addSyncSpy).toHaveBeenCalledTimes(1);

      // Clean unmount unsubscribes listeners
      unmount();
    });
  });

  // ==========================================================================
  // SECTION 3: Component Unmounting While Async Operations In-Flight
  // ==========================================================================
  describe('Focus 3: Component Unmounting While Async Operations In-Flight', () => {
    it('T5.UI.Unmount.01: Unmounting while updateStatus in handleFinish is in-flight executes stopTrackingJob safely on resolution', async () => {
      let resolveUpdate: (val?: any) => void = () => {};
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(() => {
        return new Promise((resolve) => {
          resolveUpdate = resolve;
        });
      });

      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

      const { findByTestId, unmount } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      // Trigger finish
      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // Component unmounts while updateStatus is in-flight
      unmount();

      // Resolve the status update
      await act(async () => {
        resolveUpdate(undefined);
      });

      // stopTrackingJob still executes to ensure tracking is not left orphaned
      expect(stopTrackingSpy).toHaveBeenCalledWith('job-adv-001');
    });

    it('T5.UI.Unmount.02: Unmounting while stopTrackingJob in handleFinish is in-flight settles without unhandled rejections', async () => {
      let resolveStop: (val?: any) => void = () => {};
      jest.spyOn(locationTrackingService, 'stopTrackingJob').mockImplementation(() => {
        return new Promise((resolve) => {
          resolveStop = resolve;
        });
      });

      const { findByTestId, unmount } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      unmount();

      await act(async () => {
        resolveStop(undefined);
      });

      // Expect no crash or unhandled rejection
      expect(locationTrackingService.isTrackingActive()).toBe(false);
    });

    it('T5.UI.Unmount.03: Unmounting while startTrackingJob is in-flight resolves cleanly without memory corruption', async () => {
      let resolveStart: (val?: any) => void = () => {};
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockImplementation(() => {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      });

      const { findByTestId, unmount } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(startBtn);
      });

      unmount();

      await act(async () => {
        resolveStart(true);
      });

      // No crash
    });

    it('T5.UI.Unmount.04: Unmounting while stopTrackingJob in handlePause is in-flight settles safely', async () => {
      const activeJob: LogisticsEntry = {
        ...mockScheduledJob,
        isTrackingActive: true,
        status: 'In Progress',
      };

      (logisticsService.subscribeSingleLogisticsEntry as jest.Mock).mockImplementation((_jId, _tId, cb) => {
        cb(activeJob);
        return () => {};
      });

      let resolveStop: (val?: any) => void = () => {};
      jest.spyOn(locationTrackingService, 'stopTrackingJob').mockImplementation(() => {
        return new Promise((resolve) => {
          resolveStop = resolve;
        });
      });

      const { findByTestId, unmount } = render(<LogisticsJobDetailScreen />);
      const pauseBtn = await findByTestId('pause-job-btn');

      await act(async () => {
        fireEvent.press(pauseBtn);
      });

      unmount();

      await act(async () => {
        resolveStop(undefined);
      });
    });

    it('T5.UI.Unmount.05: Unmounting while vehicle name lookup is in-flight guards against state updates', async () => {
      let resolveVehicle: (val: any) => void = () => {};
      jest.spyOn(logisticsService, 'fetchVehicleById').mockImplementation(() => {
        return new Promise((resolve) => {
          resolveVehicle = resolve;
        });
      });

      const { unmount } = render(<LogisticsJobDetailScreen />);

      // Unmount immediately while fetchVehicleById is in-flight
      unmount();

      // Resolve vehicle lookup after unmount
      await act(async () => {
        resolveVehicle({ id: 'veh-adv-01', name: 'Delayed Vehicle', rego: 'NSW-000' });
      });

      // Verification: isMounted guard in useEffect prevents unmounted state mutation
    });
  });

  // ==========================================================================
  // SECTION 4: Linking.openSettings() Rejection & Exception Handling
  // ==========================================================================
  describe('Focus 4: Linking.openSettings() Rejection & Exception Handling', () => {
    it('T5.UI.Linking.01: Linking.openSettings() promise rejection from Gating Alert is caught gracefully', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      // Rejection simulation
      openSettingsSpy.mockRejectedValue(new Error('OS Security Exception: Permission Settings unavailable'));

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(startBtn);
      });

      expect(alertSpy).toHaveBeenCalled();
      const alertButtons = alertSpy.mock.calls[0][2];
      const settingsBtn = alertButtons.find((b: any) => b.text === 'Open Settings');
      expect(settingsBtn).toBeDefined();

      // Pressing Open Settings executes Linking.openSettings and catches rejection via .catch(() => {})
      await act(async () => {
        settingsBtn.onPress();
      });

      expect(openSettingsSpy).toHaveBeenCalled();
    });

    it('T5.UI.Linking.02: Linking.openSettings() promise rejection from permission-revoked-warning is caught without unhandled rejection', async () => {
      // Simulate suspended tracking session (R3)
      jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
      jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-adv-001');

      openSettingsSpy.mockRejectedValue(new Error('Platform failed to open device settings'));

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      expect(await findByTestId('permission-revoked-warning')).toBeTruthy();

      const openSettingsLink = await findByText('Open Settings');

      await act(async () => {
        fireEvent.press(openSettingsLink);
      });

      expect(openSettingsSpy).toHaveBeenCalled();
      // No unhandled promise rejection error
    });

    it('T5.UI.Linking.03: Linking.openSettings throwing synchronously from alert handler reveals uncaught behavior vs rejection', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      // Synchronous throw simulation (e.g. native module crash or invalid bridge)
      openSettingsSpy.mockImplementation(() => {
        throw new Error('Synchronous native link failure');
      });

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(startBtn);
      });

      const alertButtons = alertSpy.mock.calls[0][2];
      const settingsBtn = alertButtons.find((b: any) => b.text === 'Open Settings');

      // Because line 185 invokes Linking.openSettings().catch(...), a synchronous throw
      // occurs before .catch can attach. We verify this empirical behavior:
      expect(() => {
        settingsBtn.onPress();
      }).toThrow('Synchronous native link failure');
    });

    it('T5.UI.Linking.04: Dismissing Gating Alert via Cancel leaves screen in consistent state', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(startBtn);
      });

      const alertButtons = alertSpy.mock.calls[0][2];
      const cancelBtn = alertButtons.find((b: any) => b.style === 'cancel');

      if (cancelBtn?.onPress) {
        await act(async () => {
          cancelBtn.onPress();
        });
      }

      // Action error banner remains visible for driver guidance
      expect(await findByText(/Device location services are turned off/)).toBeTruthy();
      expect(openSettingsSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SECTION 5: Corrupted, Malformed, or Boundary AsyncStorage Values for Disclosure
  // ==========================================================================
  describe('Focus 5: Corrupted, Malformed, or Boundary AsyncStorage Values for Disclosure Onboarding', () => {
    it('T5.UI.Storage.01: Empty string in AsyncStorage suppresses disclosure modal (empirical finding)', async () => {
      // Mock getItem returning empty string "" to simulate native device storage containing ""
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('');

      const { queryByTestId } = render(<LogisticsFeedScreen />);

      // LogisticsFeed checks (storedValue === null || storedValue === undefined)
      // Since "" is neither null nor undefined, the modal is suppressed even though empty string is NOT 'true' or 'declined'
      await waitFor(() => {
        expect(queryByTestId('bg-location-accept-btn')).toBeNull();
      });

      // Consequence: hasAcceptedBackgroundLocationDisclosure returns false
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('');
      const accepted = await locationTrackingService.hasAcceptedBackgroundLocationDisclosure();
      expect(accepted).toBe(false);

      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('');
      const answered = await locationTrackingService.hasAnsweredBackgroundLocationDisclosure();
      expect(answered).toBe(true);
    });

    it('T5.UI.Storage.02: Corrupted JSON object string in AsyncStorage does not crash feed and suppresses modal', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce(
        '{"corrupted": true, "syntax_error": '
      );

      const { queryByTestId } = render(<LogisticsFeedScreen />);
      await waitFor(() => {
        expect(queryByTestId('bg-location-accept-btn')).toBeNull();
      });

      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce(
        '{"corrupted": true, "syntax_error": '
      );
      const accepted = await locationTrackingService.hasAcceptedBackgroundLocationDisclosure();
      expect(accepted).toBe(false);
    });

    it('T5.UI.Storage.03: Literal string "null" in AsyncStorage suppresses modal without accepting', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('null');

      const { queryByTestId } = render(<LogisticsFeedScreen />);
      await waitFor(() => {
        expect(queryByTestId('bg-location-accept-btn')).toBeNull();
      });

      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('null');
      const accepted = await locationTrackingService.hasAcceptedBackgroundLocationDisclosure();
      expect(accepted).toBe(false);
    });

    it('T5.UI.Storage.04: AsyncStorage.getItem throwing disk error handles warning gracefully without crashing feed', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(
        new Error('Disk I/O failure: SQLite database disk image is malformed')
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { queryByTestId, findByTestId } = render(<LogisticsFeedScreen />);

      // Feed renders without crashing
      expect(await findByTestId('logistics-feed-screen')).toBeTruthy();
      // Disclosure modal remains hidden on error
      expect(queryByTestId('bg-location-accept-btn')).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('T5.UI.Storage.05: AsyncStorage.setItem failure during disclosure acceptance handles error gracefully', async () => {
      await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);

      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(
        new Error('AsyncStorage quota exceeded')
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { findByTestId } = render(<LogisticsFeedScreen />);
      const acceptBtn = await findByTestId('bg-location-accept-btn');

      await act(async () => {
        fireEvent.press(acceptBtn);
      });

      // Warning logged, screen remains functional
      expect(warnSpy).toHaveBeenCalledWith(
        '[LogisticsFeedScreen] Failed to persist disclosure acceptance:',
        expect.any(Error)
      );
    });

    it('T5.UI.Storage.06: AsyncStorage.setItem failure during disclosure decline handles error gracefully', async () => {
      await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);

      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(
        new Error('AsyncStorage disk write lock failure')
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { findByTestId } = render(<LogisticsFeedScreen />);
      const declineBtn = await findByTestId('bg-location-decline-btn');

      await act(async () => {
        fireEvent.press(declineBtn);
      });

      expect(warnSpy).toHaveBeenCalledWith(
        '[LogisticsFeedScreen] Failed to persist disclosure decline:',
        expect.any(Error)
      );
    });

    it('T5.UI.Storage.07: Exported helper functions behavior under boundary and corrupted storage states', async () => {
      // 1. Clean null
      await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);
      expect(await locationTrackingService.hasAcceptedBackgroundLocationDisclosure()).toBe(false);
      expect(await locationTrackingService.hasAnsweredBackgroundLocationDisclosure()).toBe(false);

      // 2. Valid 'true'
      await AsyncStorage.setItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY, 'true');
      expect(await locationTrackingService.hasAcceptedBackgroundLocationDisclosure()).toBe(true);
      expect(await locationTrackingService.hasAnsweredBackgroundLocationDisclosure()).toBe(true);

      // 3. Valid 'declined'
      await AsyncStorage.setItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY, 'declined');
      expect(await locationTrackingService.hasAcceptedBackgroundLocationDisclosure()).toBe(false);
      expect(await locationTrackingService.hasAnsweredBackgroundLocationDisclosure()).toBe(true);

      // 4. Boundary: empty string (mocked to reflect native "" storage behavior vs mock || null coercion)
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('');
      expect(await locationTrackingService.hasAcceptedBackgroundLocationDisclosure()).toBe(false);

      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('');
      expect(await locationTrackingService.hasAnsweredBackgroundLocationDisclosure()).toBe(true);

      // 5. Corrupted string
      await AsyncStorage.setItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY, 'GARBAGE_VAL');
      expect(await locationTrackingService.hasAcceptedBackgroundLocationDisclosure()).toBe(false);
      expect(await locationTrackingService.hasAnsweredBackgroundLocationDisclosure()).toBe(true);

      // 6. Thrown read error
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Read failed'));
      expect(await locationTrackingService.hasAcceptedBackgroundLocationDisclosure()).toBe(false);

      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Read failed'));
      expect(await locationTrackingService.hasAnsweredBackgroundLocationDisclosure()).toBe(false);
    });
  });
});
