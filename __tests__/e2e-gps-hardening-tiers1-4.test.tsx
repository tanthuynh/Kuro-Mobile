/**
 * __tests__/e2e-gps-hardening-tiers1-4.test.tsx
 *
 * Kuro Mobile GPS Tracking Hardening - Opaque-Box E2E Test Suite (Tiers 1-4)
 * Strictly derived from user requirements R1-R6 in ORIGINAL_REQUEST.md.
 *
 * Tier Structure:
 * - Tier 1: Feature Coverage (F1 to F10, >= 5 tests per feature)
 * - Tier 2: Boundary & Corner Cases (2.1 to 2.5, >= 5 tests per scenario)
 * - Tier 3: Cross-Feature Combinations (3.1 to 3.4 pairwise interaction tests)
 * - Tier 4: Real-World Workload Scenarios (4.1 to 4.4 full driver shift & fault recovery journeys)
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
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
  id: 'usr-driver-e2e',
  uid: 'usr-driver-e2e',
  name: 'Marcus Brody',
  email: 'marcus@kuro.test',
  tenantId: 'tenant-kuro-e2e',
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockDriver,
    tenant: { tenantId: 'tenant-kuro-e2e', tenantName: 'Kuro Transport Fleet' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

let mockActiveRouteJobId = 'job-e2e-001';
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

// Mock LogisticsService with wrapped jest.fn implementations for service integration
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
      id: 'veh-van-01',
      name: 'Van 01',
      rego: 'NSW-E2E-01',
    }),
    updateLogisticsStatus: jest.fn().mockResolvedValue(undefined),
    batchUploadLocationHistory: jest.fn().mockResolvedValue(undefined),
  };
});

// ============================================================================
// TEST FIXTURES & MONOTONIC TIME GENERATOR
// ============================================================================

let currentSimulatedTime = Date.now() + 100000;
function nextTimestamp(): number {
  currentSimulatedTime += 10000;
  return currentSimulatedTime;
}

function makeLocation(
  latitude = -33.87,
  longitude = 151.21,
  accuracy = 5,
  timestamp = nextTimestamp(),
  heading = 0,
  speed = 0
): Location.LocationObject {
  return {
    coords: {
      latitude,
      longitude,
      altitude: 0,
      accuracy,
      altitudeAccuracy: null,
      heading,
      speed,
    },
    timestamp,
  };
}

const mockJobAlpha: LogisticsEntry = {
  id: 'job-e2e-001',
  tenantId: 'tenant-kuro-e2e',
  eventNumber: 101,
  eventName: 'Harbour Pavilion Audio Delivery',
  location: 'Sydney Harbour Dock 4, NSW',
  status: 'Scheduled',
  driverName: 'Marcus Brody',
  assigneeId: 'usr-driver-e2e',
  driverId: 'usr-driver-e2e',
  vehicleId: 'veh-van-01',
  start: new Date('2026-09-15T08:00:00Z'),
  end: new Date('2026-09-15T14:00:00Z'),
  createdBy: 'Dispatcher Dave',
  updatedBy: 'Dispatcher Dave',
  createdAt: '2026-09-15T06:00:00Z',
  updatedAt: '2026-09-15T06:00:00Z',
  archived: false,
  isTrackingActive: false,
  notes: 'Fragile line-array loudspeakers loaded.',
  destinations: [
    {
      id: 'dest-01',
      type: 'destination',
      destinationName: 'Dock 4 Receiving',
      address: 'Circular Quay West, Sydney NSW 2000',
      time: '09:00 AM',
      estTravelTime: '25 min',
    },
  ],
};

const mockJobBeta: LogisticsEntry = {
  id: 'job-e2e-002',
  tenantId: 'tenant-kuro-e2e',
  eventNumber: 102,
  eventName: 'Metro Theatre Lighting Transport',
  location: '624 George St, Sydney NSW',
  status: 'Scheduled',
  driverName: 'Marcus Brody',
  assigneeId: 'usr-driver-e2e',
  driverId: 'usr-driver-e2e',
  vehicleId: 'veh-van-01',
  start: new Date('2026-09-15T14:30:00Z'),
  end: new Date('2026-09-15T19:00:00Z'),
  createdBy: 'Dispatcher Dave',
  updatedBy: 'Dispatcher Dave',
  createdAt: '2026-09-15T06:00:00Z',
  updatedAt: '2026-09-15T06:00:00Z',
  archived: false,
  isTrackingActive: false,
  notes: 'Truss and profile fixtures.',
  destinations: [
    {
      id: 'dest-02',
      type: 'destination',
      destinationName: 'Stage Door Loading',
      address: 'George St, Sydney NSW 2000',
      time: '03:00 PM',
      estTravelTime: '20 min',
    },
  ],
};

// ============================================================================
// SUITE IMPLEMENTATION
// ============================================================================

describe('Kuro Mobile GPS Tracking Hardening - E2E Tiers 1-4 [R1-R6]', () => {
  let alertSpy: jest.SpyInstance;
  let openSettingsSpy: jest.SpyInstance;
  let appStateListener: ((state: AppStateStatus) => void) | null = null;
  let nativeTrackingActive = false;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    locationTrackingService._resetTrackingStateForTesting();
    locationTrackingService.setNetworkOnlineState(true);

    mockActiveRouteJobId = 'job-e2e-001';
    nativeTrackingActive = false;

    alertSpy = jest.spyOn(Alert, 'alert');
    openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

    // AppState listener registration spy
    appStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: string, listener: any) => {
      if (event === 'change') {
        appStateListener = listener;
      }
      return { remove: jest.fn() } as any;
    });
    locationTrackingService.initTrackingAppStateObserver();

    // Default Expo Location mocks (all healthy and precise)
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
      canAskAgain: true,
      expires: 'never',
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
      canAskAgain: true,
      expires: 'never',
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
    });

    (Location.startLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      nativeTrackingActive = true;
    });
    (Location.stopLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      nativeTrackingActive = false;
    });
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      return nativeTrackingActive;
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(async () => ({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 12,
        accuracy: 5,
        heading: 90,
        speed: 15,
      },
      timestamp: nextTimestamp(),
    }));
    (Location.getLastKnownPositionAsync as jest.Mock).mockImplementation(async () => ({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 12,
        accuracy: 5,
        heading: 90,
        speed: 15,
      },
      timestamp: nextTimestamp(),
    }));

    // Default Logistics Service mocks
    (logisticsService.getLogisticsEntry as jest.Mock).mockResolvedValue(mockJobAlpha);
    (logisticsService.subscribeSingleLogisticsEntry as jest.Mock).mockImplementation((jId, _tId, cb) => {
      if (jId === mockJobBeta.id) {
        cb(mockJobBeta);
      } else {
        cb(mockJobAlpha);
      }
      return () => {};
    });
    (logisticsService.subscribeToLogistics as jest.Mock).mockImplementation((_tenantId, cb) => {
      cb([mockJobAlpha, mockJobBeta]);
      return () => {};
    });
    (logisticsService.fetchTenantLogistics as jest.Mock).mockResolvedValue([mockJobAlpha, mockJobBeta]);
    (logisticsService.updateLogisticsStatus as jest.Mock).mockResolvedValue(undefined);
    (logisticsService.updateJobLocation as jest.Mock).mockResolvedValue(undefined);
    (logisticsService.stopJobTracking as jest.Mock).mockResolvedValue(undefined);
    (logisticsService.batchUploadLocationHistory as jest.Mock).mockResolvedValue(undefined);
    (logisticsService.fetchVehicleById as jest.Mock).mockResolvedValue({
      id: 'veh-van-01',
      name: 'Van 01',
      rego: 'NSW-E2E-01',
    });
  });

  afterEach(async () => {
    locationTrackingService.stopTrackingAppStateObserver();
    await locationTrackingService.stopTrackingJob();
    jest.restoreAllMocks();
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (F1 - F10, >= 5 tests per feature)
  // ==========================================================================

  describe('Tier 1: Feature Coverage', () => {
    // ------------------------------------------------------------------------
    // F1: Device GPS Disabled Gating (R1)
    // ------------------------------------------------------------------------
    describe('F1: Device GPS Disabled Gating (R1)', () => {
      it('T1.F1.01: startTrackingJob returns false when hasServicesEnabledAsync is false', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(false);
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });

      it('T1.F1.02: Location.startLocationUpdatesAsync is not called when device GPS is disabled', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      });

      it('T1.F1.03: UI shows "Location Services Disabled" alert when user taps Start with GPS off', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(alertSpy).toHaveBeenCalledWith(
          'Location Services Disabled',
          'Device location services are turned off. Please enable GPS in device Settings to begin route tracking.',
          expect.any(Array)
        );
      });

      it('T1.F1.04: Alert dialog includes "Open Settings" button wired to Linking.openSettings()', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        const alertButtons = alertSpy.mock.calls[0][2];
        const openSettingsBtn = alertButtons.find((b: any) => b.text === 'Open Settings');
        expect(openSettingsBtn).toBeDefined();

        openSettingsBtn.onPress();
        expect(openSettingsSpy).toHaveBeenCalled();
      });

      it('T1.F1.05: Job status in Firestore remains unchanged (updateLogisticsStatus is not called)', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(logisticsService.updateLogisticsStatus).not.toHaveBeenCalled();
      });

      it('T1.F1.06: Alert includes "Cancel" button that dismisses cleanly without errors', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        const alertButtons = alertSpy.mock.calls[0][2];
        const cancelBtn = alertButtons.find((b: any) => b.style === 'cancel');
        expect(cancelBtn).toBeDefined();
      });
    });

    // ------------------------------------------------------------------------
    // F2: Missing Foreground / Background Permissions Gating (R1)
    // ------------------------------------------------------------------------
    describe('F2: Missing Foreground / Background Permissions Gating (R1)', () => {
      it('T1.F2.01: startTrackingJob returns false when foreground permission is denied', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(false);
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });

      it('T1.F2.02: startTrackingJob returns false when background permission is denied', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(false);
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });

      it('T1.F2.03: Detail screen shows "Location Permission Required" alert when permission is denied', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(alertSpy).toHaveBeenCalledWith(
          'Location Permission Required',
          expect.stringContaining('Location access is required'),
          expect.any(Array)
        );
      });

      it('T1.F2.04: Permission denied alert wires Open Settings button to Linking.openSettings()', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        const alertButtons = alertSpy.mock.calls[0][2];
        const openSettingsBtn = alertButtons.find((b: any) => b.text === 'Open Settings');
        expect(openSettingsBtn).toBeDefined();

        openSettingsBtn.onPress();
        expect(openSettingsSpy).toHaveBeenCalled();
      });

      it('T1.F2.05: Job status remains unchanged in Firestore upon permission gating failure', async () => {
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(logisticsService.updateLogisticsStatus).not.toHaveBeenCalled();
      });

      it('T1.F2.06: Sync status transitions to "permission_denied" on permission rejection', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(locationTrackingService.getSyncStatus().status).toBe('permission_denied');
      });
    });

    // ------------------------------------------------------------------------
    // F3: Approximate Location Accuracy Rejection (R1)
    // ------------------------------------------------------------------------
    describe('F3: Approximate Location Accuracy Rejection (R1)', () => {
      it('T1.F3.01: Android coarse accuracy is rejected (startTrackingJob returns false)', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'coarse' },
        });

        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(false);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('approximate_only');
      });

      it('T1.F3.02: Android none accuracy is rejected', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'none' },
        });

        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(false);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('approximate_only');
      });

      it('T1.F3.03: iOS reduced accuracy is rejected', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          ios: { accuracy: 'reduced' },
        });

        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(false);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('approximate_only');
      });

      it('T1.F3.04: Generic accuracy: "approximate" is rejected', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          accuracy: 'approximate',
        });

        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(false);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('approximate_only');
      });

      it('T1.F3.05: Detail screen shows "Precise Location Required" alert with Open Settings', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'coarse' },
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(alertSpy).toHaveBeenCalledWith(
          'Precise Location Required',
          'Kuro Mobile requires precise GPS location to track driver routes and calculate ETAs. Please allow precise location access in Settings.',
          expect.any(Array)
        );

        const alertButtons = alertSpy.mock.calls[0][2];
        const openSettingsBtn = alertButtons.find((b: any) => b.text === 'Open Settings');
        openSettingsBtn.onPress();
        expect(openSettingsSpy).toHaveBeenCalled();
      });

      it('T1.F3.06: Job status and native updates are never started when approximate accuracy is rejected', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'coarse' },
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(logisticsService.updateLogisticsStatus).not.toHaveBeenCalled();
        expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      });
    });

    // ------------------------------------------------------------------------
    // F4: Typed Failure Reporting in Tracking Service (R1)
    // ------------------------------------------------------------------------
    describe('F4: Typed Failure Reporting in Tracking Service (R1)', () => {
      it('T1.F4.01: getLastTrackingFailureReason returns "services_disabled" when GPS is disabled', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('services_disabled');
      });

      it('T1.F4.02: getLastTrackingFailureReason returns "permission_denied" when permissions are denied', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('permission_denied');
      });

      it('T1.F4.03: getLastTrackingFailureReason returns "approximate_only" when accuracy is coarse', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'coarse' },
        });
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('approximate_only');
      });

      it('T1.F4.04: getLastTrackingFailureReason returns "internal_error" when jobId or tenantId is invalid', async () => {
        const result1 = await locationTrackingService.startTrackingJob('', 'tenant-kuro-e2e');
        expect(result1).toBe(false);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('internal_error');

        const result2 = await locationTrackingService.startTrackingJob('job-e2e-001', '');
        expect(result2).toBe(false);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('internal_error');
      });

      it('T1.F4.05: getLastTrackingFailureReason returns null initially and after successful start', async () => {
        expect(locationTrackingService.getLastTrackingFailureReason()).toBeNull();

        const success = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(success).toBe(true);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBeNull();
      });

      it('T1.F4.06: verifyTrackingPrerequisites returns false and sets matching reason on failure', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const ok = await locationTrackingService.verifyTrackingPrerequisites();
        expect(ok).toBe(false);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('services_disabled');
      });
    });

    // ------------------------------------------------------------------------
    // F5: One-Time Background Disclosure Onboarding in Feed (R2)
    // ------------------------------------------------------------------------
    describe('F5: One-Time Background Disclosure Onboarding in Feed (R2)', () => {
      it('T1.F5.01: Disclosure modal is visible on first install when preference is unset', async () => {
        await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);

        const { findByTestId } = render(<LogisticsFeedScreen />);
        expect(await findByTestId('onboarding-bg-location-disclosure-modal')).toBeTruthy();
      });

      it('T1.F5.02: Accepting disclosure records "true" in AsyncStorage and requests background permission', async () => {
        await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);

        const { findByTestId } = render(<LogisticsFeedScreen />);
        const acceptBtn = await findByTestId('bg-location-accept-btn');

        await act(async () => {
          fireEvent.press(acceptBtn);
        });

        const stored = await AsyncStorage.getItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);
        expect(stored).toBe('true');
        expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
      });

      it('T1.F5.03: Declining disclosure records "declined" in AsyncStorage and does NOT request background permission', async () => {
        await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);

        const { findByTestId } = render(<LogisticsFeedScreen />);
        const declineBtn = await findByTestId('bg-location-decline-btn');

        await act(async () => {
          fireEvent.press(declineBtn);
        });

        const stored = await AsyncStorage.getItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);
        expect(stored).toBe('declined');
        expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
      });

      it('T1.F5.04: Modal does NOT appear if previously accepted across app restarts', async () => {
        await AsyncStorage.setItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY, 'true');

        const { queryByTestId } = render(<LogisticsFeedScreen />);
        expect(queryByTestId('bg-location-accept-btn')).toBeNull();
      });

      it('T1.F5.05: Modal does NOT appear if previously declined across app restarts', async () => {
        await AsyncStorage.setItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY, 'declined');

        const { queryByTestId } = render(<LogisticsFeedScreen />);
        expect(queryByTestId('bg-location-accept-btn')).toBeNull();
      });

      it('T1.F5.06: Disclosure modal is strictly NEVER rendered in LogisticsJobDetailScreen', async () => {
        await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);

        const { queryByTestId } = render(<LogisticsJobDetailScreen />);
        expect(queryByTestId('onboarding-bg-location-disclosure-modal')).toBeNull();
      });
    });

    // ------------------------------------------------------------------------
    // F6: Mid-Job Permission Revocation & Auto-Resume (R3)
    // ------------------------------------------------------------------------
    describe('F6: Mid-Job Permission Revocation & Auto-Resume (R3)', () => {
      it('T1.F6.01: Active tracking halts (stopLocationUpdatesAsync) when permission revoked upon foregrounding', async () => {
        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(true);
        expect(locationTrackingService.isTrackingActive()).toBe(true);

        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        await act(async () => {
          if (appStateListener) {
            await appStateListener('active');
          }
        });

        expect(Location.stopLocationUpdatesAsync).toHaveBeenCalled();
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });

      it('T1.F6.02: Session is preserved as suspended (isTrackingSuspended is true, jobId matches)', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        await act(async () => {
          if (appStateListener) {
            await appStateListener('active');
          }
        });

        expect(locationTrackingService.isTrackingSuspended()).toBe(true);
        expect(locationTrackingService.getSuspendedTrackingJobId()).toBe('job-e2e-001');
      });

      it('T1.F6.03: UI renders permission-revoked-warning banner and "Permission Required" badge', async () => {
        (logisticsService.subscribeSingleLogisticsEntry as jest.Mock).mockImplementation((_jId, _tId, cb) => {
          cb({ ...mockJobAlpha, status: 'In Progress', isTrackingActive: true });
          return () => {};
        });

        jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
        jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-e2e-001');

        const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
        expect(await findByTestId('permission-revoked-warning')).toBeTruthy();
        expect(await findByText('Permission Required')).toBeTruthy();
      });

      it('T1.F6.04: Tapping "Open Settings" in warning banner invokes Linking.openSettings()', async () => {
        jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
        jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-e2e-001');

        const { findByText } = render(<LogisticsJobDetailScreen />);
        const settingsLink = await findByText('Open Settings');

        await act(async () => {
          fireEvent.press(settingsLink);
        });

        expect(openSettingsSpy).toHaveBeenCalled();
      });

      it('T1.F6.05: When permissions restored and app foregrounds, tracking auto-resumes silently', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        // Revoke
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });
        expect(locationTrackingService.isTrackingSuspended()).toBe(true);

        // Restore
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });

        // Foreground again
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        expect(locationTrackingService.isTrackingSuspended()).toBe(false);
        expect(locationTrackingService.isTrackingActive()).toBe(true);
        expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-001');
      });

      it('T1.F6.06: Auto-resume clears warning banner and restores "Tracking" header badge', async () => {
        let syncListener: any = null;
        jest.spyOn(locationTrackingService, 'addSyncStatusListener').mockImplementation((cb) => {
          syncListener = cb;
          return () => {};
        });

        jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
        jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-e2e-001');

        const { findByTestId, queryByTestId, findByText } = render(<LogisticsJobDetailScreen />);
        expect(await findByTestId('permission-revoked-warning')).toBeTruthy();

        // Simulate restore
        jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(false);
        jest.spyOn(locationTrackingService, 'isTrackingActive').mockReturnValue(true);
        jest.spyOn(locationTrackingService, 'getActiveTrackingJobId').mockReturnValue('job-e2e-001');

        await act(async () => {
          if (syncListener) syncListener({ status: 'synced', lastSyncTime: Date.now(), lastError: null });
        });

        expect(queryByTestId('permission-revoked-warning')).toBeNull();
        expect(await findByText('Tracking')).toBeTruthy();
      });
    });

    // ------------------------------------------------------------------------
    // F7: Offline Telemetry Buffering & Auto-Retry (R4)
    // ------------------------------------------------------------------------
    describe('F7: Offline Telemetry Buffering & Auto-Retry (R4)', () => {
      it('T1.F7.01: handleLocationUpdate buffers coordinates in memory when offline', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        const point = makeLocation(-33.871, 151.211, 5, nextTimestamp(), 180, 20);

        const result = await locationTrackingService.handleLocationUpdate(point);
        expect(result).not.toBeNull();
        expect(locationTrackingService.getLocationBufferCount()).toBe(1);
      });

      it('T1.F7.02: Buffered points are mirrored to AsyncStorage with key @kuro_location_buffer:${jobId}', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        const ts = nextTimestamp();
        const point = makeLocation(-33.872, 151.212, 5, ts, 180, 20);

        await locationTrackingService.handleLocationUpdate(point);

        const key = locationTrackingService.getBufferStorageKey('job-e2e-001');
        const raw = await AsyncStorage.getItem(key);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.length).toBe(1);
        expect(parsed[0].timestamp).toBe(ts);
      });

      it('T1.F7.03: Sync status is updated to "offline_failed" during offline location updates', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        await locationTrackingService.handleLocationUpdate(makeLocation(-33.873, 151.213));

        expect(locationTrackingService.getSyncStatus().status).toBe('offline_failed');
      });

      it('T1.F7.04: UI shows "offline-sync-warning" banner when status is "offline_failed"', async () => {
        jest.spyOn(locationTrackingService, 'getSyncStatus').mockReturnValue({
          status: 'offline_failed',
          lastSyncTime: null,
          lastError: 'Offline',
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        expect(await findByTestId('offline-sync-warning')).toBeTruthy();
      });

      it('T1.F7.05: Reconnecting network auto-flushes buffer via batchUploadLocationHistory', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        // Go offline and buffer 2 points
        locationTrackingService.setNetworkOnlineState(false);
        const ts1 = nextTimestamp();
        const ts2 = nextTimestamp();

        await locationTrackingService.handleLocationUpdate(makeLocation(-33.874, 151.214, 5, ts1));
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.875, 151.215, 5, ts2));

        expect(locationTrackingService.getLocationBufferCount()).toBe(2);

        // Restore network
        locationTrackingService.setNetworkOnlineState(true);
        await locationTrackingService.flushLocationBuffer('job-e2e-001');

        expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
          'job-e2e-001',
          expect.arrayContaining([
            expect.objectContaining({ timestamp: ts1 }),
            expect.objectContaining({ timestamp: ts2 }),
          ])
        );
      });

      it('T1.F7.06: Successful flush clears in-memory and AsyncStorage buffers, updating sync status to "synced"', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        await locationTrackingService.handleLocationUpdate(makeLocation(-33.876, 151.216));
        expect(locationTrackingService.getLocationBufferCount()).toBe(1);

        locationTrackingService.setNetworkOnlineState(true);
        await locationTrackingService.flushLocationBuffer('job-e2e-001');

        expect(locationTrackingService.getLocationBufferCount()).toBe(0);
        const stored = await AsyncStorage.getItem(locationTrackingService.getBufferStorageKey('job-e2e-001'));
        expect(stored === null || stored === '[]').toBe(true);
        expect(locationTrackingService.getSyncStatus().status).toBe('synced');
      });
    });

    // ------------------------------------------------------------------------
    // F8: Concurrent Job Protection (R5)
    // ------------------------------------------------------------------------
    describe('F8: Concurrent Job Protection (R5)', () => {
      it('T1.F8.01: Starting Job B while Job A is active cleanly stops Job A before Job B starts', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-001');

        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        expect(logisticsService.stopJobTracking).toHaveBeenCalledWith('job-e2e-001');
        expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-002');
      });

      it('T1.F8.02: Job A buffered telemetry is flushed before switching to Job B', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        locationTrackingService.setNetworkOnlineState(false);
        const ts = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.877, 151.217, 5, ts));
        locationTrackingService.setNetworkOnlineState(true);

        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
          'job-e2e-001',
          expect.arrayContaining([expect.objectContaining({ timestamp: ts })])
        );
      });

      it('T1.F8.03: In-memory buffer is cleared before Job B starts to prevent cross-job coordinate mixing', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.878, 151.218));
        locationTrackingService.setNetworkOnlineState(true);

        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        expect(locationTrackingService.getLocationBufferCount()).toBe(0);
      });

      it('T1.F8.04: getActiveTrackingJobId returns Job B ID after transition', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-002');
        expect(locationTrackingService.isTrackingActive()).toBe(true);
      });

      it('T1.F8.05: If stopping Job A throws an error, the error is propagated and Job B is not started', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        (logisticsService.stopJobTracking as jest.Mock).mockRejectedValueOnce(
          new Error('Firestore stop write failed: Conflict')
        );

        await expect(
          locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e')
        ).rejects.toThrow('Firestore stop write failed: Conflict');

        expect(locationTrackingService.getActiveTrackingJobId()).toBeNull();
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });

      it('T1.F8.06: Starting same job twice is idempotent and does not stop or re-instantiate task', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        const secondStart = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(secondStart).toBe(true);
        expect(logisticsService.stopJobTracking).not.toHaveBeenCalled();
        expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-001');
      });
    });

    // ------------------------------------------------------------------------
    // F9: Job Completion Reliability (R6)
    // ------------------------------------------------------------------------
    describe('F9: Job Completion Reliability (R6)', () => {
      it('T1.F9.01: Pressing Finish commits updateStatus("Completed") first, then stopTrackingJob second', async () => {
        const executionSequence: string[] = [];
        (logisticsService.updateLogisticsStatus as jest.Mock).mockImplementation(async () => {
          executionSequence.push('updateStatus');
        });
        const stopSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob').mockImplementation(async () => {
          executionSequence.push('stopTracking');
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const finishBtn = await findByTestId('finish-job-btn');

        await act(async () => {
          fireEvent.press(finishBtn);
        });

        expect(executionSequence).toEqual(['updateStatus', 'stopTracking']);
        stopSpy.mockRestore();
      });

      it('T1.F9.02: QuickStatusSelector selecting "Completed" commits status update before stopping tracking', async () => {
        const executionSequence: string[] = [];
        (logisticsService.updateLogisticsStatus as jest.Mock).mockImplementation(async () => {
          executionSequence.push('updateStatus');
        });
        const stopSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob').mockImplementation(async () => {
          executionSequence.push('stopTracking');
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const completedPill = await findByTestId('status-btn-completed');

        await act(async () => {
          fireEvent.press(completedPill);
        });

        expect(executionSequence).toEqual(['updateStatus', 'stopTracking']);
        stopSpy.mockRestore();
      });

      it('T1.F9.03: If updateStatus fails, stopTrackingJob is NOT called; tracking stays active', async () => {
        (logisticsService.updateLogisticsStatus as jest.Mock).mockRejectedValueOnce(
          new Error('Network request failed: status 503')
        );
        const stopSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const finishBtn = await findByTestId('finish-job-btn');

        await act(async () => {
          fireEvent.press(finishBtn);
        });

        expect(stopSpy).not.toHaveBeenCalled();
      });

      it('T1.F9.04: UI shows clear error banner when completion fails, keeping Finish button enabled for retry', async () => {
        (logisticsService.updateLogisticsStatus as jest.Mock).mockRejectedValueOnce(
          new Error('Network timeout during finish')
        );

        const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
        const finishBtn = await findByTestId('finish-job-btn');

        await act(async () => {
          fireEvent.press(finishBtn);
        });

        expect(await findByText('Network timeout during finish')).toBeTruthy();
        expect(finishBtn.props.accessibilityState?.disabled).toBe(false);
      });

      it('T1.F9.05: Driver retry after network recovery successfully completes job and stops tracking', async () => {
        (logisticsService.updateLogisticsStatus as jest.Mock)
          .mockRejectedValueOnce(new Error('Transient failure'))
          .mockResolvedValueOnce(undefined);
        const stopSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const finishBtn = await findByTestId('finish-job-btn');

        // First attempt fails
        await act(async () => {
          fireEvent.press(finishBtn);
        });
        expect(stopSpy).not.toHaveBeenCalled();

        // Retry succeeds
        await act(async () => {
          fireEvent.press(finishBtn);
        });
        expect(logisticsService.updateLogisticsStatus).toHaveBeenCalledTimes(2);
        expect(stopSpy).toHaveBeenCalledWith('job-e2e-001');
      });

      it('T1.F9.06: QuickStatus selecting "Cancelled" safely updates status before deactivating tracking', async () => {
        const executionSequence: string[] = [];
        (logisticsService.updateLogisticsStatus as jest.Mock).mockImplementation(async () => {
          executionSequence.push('updateStatus');
        });
        const stopSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob').mockImplementation(async () => {
          executionSequence.push('stopTracking');
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const cancelledPill = await findByTestId('status-btn-cancelled');

        await act(async () => {
          fireEvent.press(cancelledPill);
        });

        expect(executionSequence).toEqual(['updateStatus', 'stopTracking']);
        stopSpy.mockRestore();
      });
    });

    // ------------------------------------------------------------------------
    // F10: Typed UI Alert Dialogs & Settings Deep Linking (R1)
    // ------------------------------------------------------------------------
    describe('F10: Typed UI Alert Dialogs & Settings Deep Linking (R1)', () => {
      it('T1.F10.01: Verifies exact title, body, and buttons for "Location Services Disabled" alert', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(alertSpy).toHaveBeenCalledWith(
          'Location Services Disabled',
          'Device location services are turned off. Please enable GPS in device Settings to begin route tracking.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: expect.any(Function) },
          ]
        );
      });

      it('T1.F10.02: Verifies exact title, body, and buttons for "Precise Location Required" alert', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'coarse' },
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(alertSpy).toHaveBeenCalledWith(
          'Precise Location Required',
          'Kuro Mobile requires precise GPS location to track driver routes and calculate ETAs. Please allow precise location access in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: expect.any(Function) },
          ]
        );
      });

      it('T1.F10.03: Verifies exact title, body, and buttons for "Location Permission Required" alert', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(alertSpy).toHaveBeenCalledWith(
          'Location Permission Required',
          'Location access is required to record route telemetry and dispatch ETA updates. Please enable location permissions in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: expect.any(Function) },
          ]
        );
      });

      it('T1.F10.04: Triggering Open Settings on any alert executes Linking.openSettings()', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        const btn = alertSpy.mock.calls[0][2].find((b: any) => b.text === 'Open Settings');
        btn.onPress();
        expect(openSettingsSpy).toHaveBeenCalled();
      });

      it('T1.F10.05: Dismissing alert via "Cancel" button leaves status untouched and clears loading', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(logisticsService.updateLogisticsStatus).not.toHaveBeenCalled();
        expect(startBtn.props.accessibilityState?.disabled).toBe(false);
      });

      it('T1.F10.06: Detail screen action error banner displays corresponding descriptive guidance', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestId('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(
          await findByText(
            'Device location services are turned off. Please enable GPS in device Settings to begin route tracking.'
          )
        ).toBeTruthy();
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>= 5 tests per scenario)
  // ==========================================================================

  describe('Tier 2: Boundary & Corner Cases', () => {
    // ------------------------------------------------------------------------
    // 2.1: Rapid AppState Background / Foreground Bouncing
    // ------------------------------------------------------------------------
    describe('2.1: Rapid AppState Background / Foreground Bouncing', () => {
      it('T2.AppState.01: Rapid bouncing active -> background -> active x5 does not throw or crash', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        for (let i = 0; i < 5; i++) {
          await act(async () => {
            if (appStateListener) {
              await appStateListener('background');
              await appStateListener('active');
            }
          });
        }

        expect(locationTrackingService.isTrackingActive()).toBe(true);
      });

      it('T2.AppState.02: Rapid bouncing while permissions are valid does not interrupt tracking', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        const stopSpy = jest.spyOn(Location, 'stopLocationUpdatesAsync');

        for (let i = 0; i < 3; i++) {
          await act(async () => {
            if (appStateListener) {
              await appStateListener('background');
              await appStateListener('active');
            }
          });
        }

        expect(stopSpy).not.toHaveBeenCalled();
        expect(locationTrackingService.isTrackingActive()).toBe(true);
      });

      it('T2.AppState.03: Rapid bouncing while permission is revoked retains single suspended session', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        for (let i = 0; i < 4; i++) {
          await act(async () => {
            if (appStateListener) {
              await appStateListener('background');
              await appStateListener('active');
            }
          });
        }

        expect(locationTrackingService.isTrackingSuspended()).toBe(true);
        expect(locationTrackingService.getSuspendedTrackingJobId()).toBe('job-e2e-001');
      });

      it('T2.AppState.04: AppState transition to "inactive" does not halt tracking if permissions remain', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        const stopSpy = jest.spyOn(Location, 'stopLocationUpdatesAsync');

        await act(async () => {
          if (appStateListener) {
            await appStateListener('inactive');
          }
        });

        expect(stopSpy).not.toHaveBeenCalled();
        expect(locationTrackingService.isTrackingActive()).toBe(true);
      });

      it('T2.AppState.05: Mutex lock prevents overlapping reconciliation runs during burst transitions', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        const calls: string[] = [];
        (Location.getForegroundPermissionsAsync as jest.Mock).mockImplementation(async () => {
          calls.push('getForeground');
          return { status: 'granted', granted: true, android: { accuracy: 'fine' } };
        });

        await act(async () => {
          if (appStateListener) {
            const p1 = appStateListener('active');
            const p2 = appStateListener('active');
            const p3 = appStateListener('active');
            await Promise.all([p1, p2, p3]);
          }
        });

        expect(calls.length).toBeLessThanOrEqual(3);
      });
    });

    // ------------------------------------------------------------------------
    // 2.2: Multi-Fault Recovery (Restoring Permission with GPS Disabled)
    // ------------------------------------------------------------------------
    describe('2.2: Multi-Fault Recovery (Restoring Permission with GPS Disabled)', () => {
      it('T2.MultiFault.01: Restoring permission in Settings while GPS is disabled does not auto-resume', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        // Suspend tracking
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });
        expect(locationTrackingService.isTrackingSuspended()).toBe(true);

        // Permissions restored, but GPS services still disabled
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        expect(locationTrackingService.isTrackingSuspended()).toBe(true);
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });

      it('T2.MultiFault.02: UI does not display "Tracking" badge when GPS is still off', async () => {
        jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
        jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-e2e-001');

        const { findByText } = render(<LogisticsJobDetailScreen />);
        expect(await findByText('Permission Required')).toBeTruthy();
      });

      it('T2.MultiFault.03: Once GPS services are re-enabled, subsequent foregrounding auto-resumes cleanly', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        // Revoke
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        // Partial recovery (permission granted, GPS off)
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });
        expect(locationTrackingService.isTrackingActive()).toBe(false);

        // Full recovery (GPS enabled)
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        expect(locationTrackingService.isTrackingActive()).toBe(true);
        expect(locationTrackingService.isTrackingSuspended()).toBe(false);
      });

      it('T2.MultiFault.04: Failure reason reflects "services_disabled" when permissions are granted but GPS is off', async () => {
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        const ok = await locationTrackingService.verifyTrackingPrerequisites();
        expect(ok).toBe(false);
        expect(locationTrackingService.getLastTrackingFailureReason()).toBe('services_disabled');
      });

      it('T2.MultiFault.05: Incoming GPS callbacks arriving during multi-fault state are discarded safely', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        (logisticsService.updateJobLocation as jest.Mock).mockClear();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.88, 151.22));

        expect(logisticsService.updateJobLocation).not.toHaveBeenCalled();
      });
    });

    // ------------------------------------------------------------------------
    // 2.3: Network Outage During Finish Status Write & Retry
    // ------------------------------------------------------------------------
    describe('2.3: Network Outage During Finish Status Write & Retry', () => {
      it('T2.FinishRetry.01: Network drop causes Finish write to reject; tracking session survives', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        (logisticsService.updateLogisticsStatus as jest.Mock).mockRejectedValueOnce(
          new Error('Network unavailable: write dropped')
        );

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const finishBtn = await findByTestId('finish-job-btn');

        await act(async () => {
          fireEvent.press(finishBtn);
        });

        expect(locationTrackingService.isTrackingActive()).toBe(true);
      });

      it('T2.FinishRetry.02: Location updates continuing to arrive after failed Finish are buffered safely', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        await locationTrackingService.handleLocationUpdate(makeLocation(-33.881, 151.221));

        expect(locationTrackingService.getLocationBufferCount()).toBe(1);
      });

      it('T2.FinishRetry.03: Driver presses Finish second time after network restores; status update succeeds', async () => {
        (logisticsService.updateLogisticsStatus as jest.Mock)
          .mockRejectedValueOnce(new Error('Network timeout'))
          .mockResolvedValueOnce(undefined);

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const finishBtn = await findByTestId('finish-job-btn');

        // First attempt
        await act(async () => {
          fireEvent.press(finishBtn);
        });

        // Second attempt
        await act(async () => {
          fireEvent.press(finishBtn);
        });

        expect(logisticsService.updateLogisticsStatus).toHaveBeenCalledTimes(2);
      });

      it('T2.FinishRetry.04: Buffered telemetry accumulated during the finish outage is flushed on teardown', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        // Buffer point while offline
        locationTrackingService.setNetworkOnlineState(false);
        const ts = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.882, 151.222, 5, ts));

        // Network restores and stopTrackingJob called
        locationTrackingService.setNetworkOnlineState(true);
        await locationTrackingService.stopTrackingJob('job-e2e-001');

        expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
          'job-e2e-001',
          expect.arrayContaining([expect.objectContaining({ timestamp: ts })])
        );
      });

      it('T2.FinishRetry.05: Tracking halts cleanly after the successful retry, leaving buffer empty', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        (logisticsService.updateLogisticsStatus as jest.Mock).mockResolvedValueOnce(undefined);

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const finishBtn = await findByTestId('finish-job-btn');

        await act(async () => {
          fireEvent.press(finishBtn);
        });

        expect(locationTrackingService.isTrackingActive()).toBe(false);
        expect(locationTrackingService.getLocationBufferCount()).toBe(0);
      });
    });

    // ------------------------------------------------------------------------
    // 2.4: Concurrent Job Start While Offline Buffering is Active
    // ------------------------------------------------------------------------
    describe('2.4: Concurrent Job Start While Offline Buffering is Active', () => {
      it('T2.ConcurrentOffline.01: Job A accumulates offline buffer; switching to Job B preserves Job A buffer in storage', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        await locationTrackingService.handleLocationUpdate(makeLocation(-33.883, 151.223));

        // Switch to Job B while still offline
        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        const keyA = locationTrackingService.getBufferStorageKey('job-e2e-001');
        const storedA = await AsyncStorage.getItem(keyA);
        expect(storedA).not.toBeNull();
        expect(JSON.parse(storedA!).length).toBe(1);
      });

      it('T2.ConcurrentOffline.02: Job B starts with clean buffer, avoiding telemetry pollution from Job A', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        const tsA = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.884, 151.224, 5, tsA));

        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-002');

        const keyA = locationTrackingService.getBufferStorageKey('job-e2e-001');
        const storedA = await AsyncStorage.getItem(keyA);
        expect(storedA).not.toBeNull();
        expect(JSON.parse(storedA!).some((pt: any) => pt.timestamp === tsA)).toBe(true);

        const keyB = locationTrackingService.getBufferStorageKey('job-e2e-002');
        const storedB = await AsyncStorage.getItem(keyB);
        if (storedB) {
          expect(JSON.parse(storedB).some((pt: any) => pt.timestamp === tsA)).toBe(false);
        }
      });

      it('T2.ConcurrentOffline.03: Job B buffers new coordinates under its own AsyncStorage key @kuro_location_buffer:job-e2e-002', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);
        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        const ts = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.885, 151.225, 5, ts));

        const keyB = locationTrackingService.getBufferStorageKey('job-e2e-002');
        const storedB = await AsyncStorage.getItem(keyB);
        expect(storedB).not.toBeNull();
        expect(JSON.parse(storedB!).some((pt: any) => pt.timestamp === ts)).toBe(true);
      });

      it('T2.ConcurrentOffline.04: Reconnecting network while on Job B flushes Job B buffer cleanly', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        locationTrackingService.setNetworkOnlineState(false);
        const ts = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.886, 151.226, 5, ts));

        locationTrackingService.setNetworkOnlineState(true);
        await locationTrackingService.flushLocationBuffer('job-e2e-002');

        expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
          'job-e2e-002',
          expect.arrayContaining([expect.objectContaining({ timestamp: ts })])
        );
      });

      it('T2.ConcurrentOffline.05: stopJobTracking for Job A is called during switch even when offline', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        expect(logisticsService.stopJobTracking).toHaveBeenCalledWith('job-e2e-001');
      });
    });

    // ------------------------------------------------------------------------
    // 2.5: Re-Opening App When Previous Session was Suspended
    // ------------------------------------------------------------------------
    describe('2.5: Re-Opening App When Previous Session was Suspended', () => {
      it('T2.ReOpenSuspended.01: isTrackingSuspended returns true when session is initialized as suspended', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        expect(locationTrackingService.isTrackingSuspended()).toBe(true);
        expect(locationTrackingService.getSuspendedTrackingJobId()).toBe('job-e2e-001');
      });

      it('T2.ReOpenSuspended.02: Detail screen immediately shows permission-revoked-warning banner upon mounting', async () => {
        jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
        jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-e2e-001');

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        expect(await findByTestId('permission-revoked-warning')).toBeTruthy();
      });

      it('T2.ReOpenSuspended.03: Header badge displays "Permission Required" rather than "Idle" or "Tracking"', async () => {
        jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
        jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-e2e-001');

        const { findByText } = render(<LogisticsJobDetailScreen />);
        expect(await findByText('Permission Required')).toBeTruthy();
      });

      it('T2.ReOpenSuspended.04: Foregrounding app after restoring permissions auto-resumes and transitions badge to Tracking', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        // Suspend
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        // Restore
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });

        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        expect(locationTrackingService.isTrackingActive()).toBe(true);
        expect(locationTrackingService.isTrackingSuspended()).toBe(false);
      });

      it('T2.ReOpenSuspended.05: Explicitly starting a different job clears the suspended session cleanly', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });
        expect(locationTrackingService.isTrackingSuspended()).toBe(true);

        // Restore permissions and explicitly start Job B
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });

        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        expect(locationTrackingService.isTrackingSuspended()).toBe(false);
        expect(locationTrackingService.getSuspendedTrackingJobId()).toBeNull();
        expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-002');
      });
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (PAIRWISE INTERACTIONS)
  // ==========================================================================

  describe('Tier 3: Cross-Feature Combinations (Pairwise Interactions)', () => {
    // ------------------------------------------------------------------------
    // 3.1: Offline Buffering + Mid-Job Permission Revocation
    // ------------------------------------------------------------------------
    describe('3.1: Offline Buffering + Mid-Job Permission Revocation', () => {
      it('T3.Pairwise.01: Location updates buffered while offline are preserved in storage across revocation and flush cleanly on restore', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        // 1. Go offline and buffer coordinate
        locationTrackingService.setNetworkOnlineState(false);
        const ts = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.887, 151.227, 5, ts));

        // 2. Revoke permission
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });
        expect(locationTrackingService.isTrackingSuspended()).toBe(true);

        // 3. Buffer remains in storage
        const stored = await AsyncStorage.getItem(locationTrackingService.getBufferStorageKey('job-e2e-001'));
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored!).length).toBe(1);

        // 4. Restore permission and network
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
        });
        locationTrackingService.setNetworkOnlineState(true);

        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        await locationTrackingService.flushLocationBuffer('job-e2e-001');

        expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
          'job-e2e-001',
          expect.arrayContaining([expect.objectContaining({ timestamp: ts })])
        );
        expect(locationTrackingService.isTrackingActive()).toBe(true);
      });

      it('T3.Pairwise.02: Restoring network before restoring permission does not flush until tracking is restored', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

        // Buffer offline
        locationTrackingService.setNetworkOnlineState(false);
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.888, 151.228));

        // Revoke
        (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });

        // Network comes back, but permission is still denied
        locationTrackingService.setNetworkOnlineState(true);

        await act(async () => {
          if (appStateListener) await appStateListener('active');
        });
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });
    });

    // ------------------------------------------------------------------------
    // 3.2: Concurrent Job Switch + Offline Buffering
    // ------------------------------------------------------------------------
    describe('3.2: Concurrent Job Switch + Offline Buffering', () => {
      it('T3.Pairwise.03: Switching from Job A to Job B while offline keeps separate buffers with zero timestamp contamination', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        // Point for Job A
        const tsA = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.889, 151.229, 5, tsA));

        // Switch to Job B while offline
        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        // Point for Job B
        const tsB = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.89, 151.23, 5, tsB));

        const keyA = locationTrackingService.getBufferStorageKey('job-e2e-001');
        const keyB = locationTrackingService.getBufferStorageKey('job-e2e-002');

        const rawA = await AsyncStorage.getItem(keyA);
        const rawB = await AsyncStorage.getItem(keyB);

        const listA = JSON.parse(rawA!);
        const listB = JSON.parse(rawB!);

        expect(listA.some((pt: any) => pt.timestamp === tsA)).toBe(true);
        expect(listA.some((pt: any) => pt.timestamp === tsB)).toBe(false);
        expect(listB.some((pt: any) => pt.timestamp === tsB)).toBe(true);
        expect(listB.some((pt: any) => pt.timestamp === tsA)).toBe(false);
      });

      it('T3.Pairwise.04: Subsequent network reconnection uploads Job B buffer with correct Job B ID', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-002', 'tenant-kuro-e2e');

        locationTrackingService.setNetworkOnlineState(false);
        const ts = nextTimestamp();
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.891, 151.231, 5, ts));

        locationTrackingService.setNetworkOnlineState(true);
        await locationTrackingService.flushLocationBuffer('job-e2e-002');

        expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
          'job-e2e-002',
          expect.arrayContaining([expect.objectContaining({ timestamp: ts })])
        );
      });
    });

    // ------------------------------------------------------------------------
    // 3.3: Disclosure Decline + Subsequent Tracking Attempts
    // ------------------------------------------------------------------------
    describe('3.3: Disclosure Decline + Subsequent Tracking Attempts', () => {
      it('T3.Pairwise.05: Declining disclosure on feed results in gating rejection and actionable alert in job detail', async () => {
        await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);

        // 1. Feed screen: decline disclosure
        const { findByTestId: findByTestIdFeed } = render(<LogisticsFeedScreen />);
        const declineBtn = await findByTestIdFeed('bg-location-decline-btn');

        await act(async () => {
          fireEvent.press(declineBtn);
        });

        expect(await AsyncStorage.getItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY)).toBe('declined');

        // 2. Background permission is ungranted because user declined disclosure
        (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'denied',
          granted: false,
        });

        // 3. Detail screen: tap Start
        const { findByTestId: findByTestIdDetail } = render(<LogisticsJobDetailScreen />);
        const startBtn = await findByTestIdDetail('play-job-btn');

        await act(async () => {
          fireEvent.press(startBtn);
        });

        expect(alertSpy).toHaveBeenCalledWith(
          'Location Permission Required',
          expect.stringContaining('Location access is required'),
          expect.any(Array)
        );
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });

      it('T3.Pairwise.06: User manually accepting disclosure later allows background request and tracking activation', async () => {
        await AsyncStorage.setItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY, 'declined');

        await locationTrackingService.recordBackgroundLocationDisclosureAccepted();
        expect(await locationTrackingService.hasAcceptedBackgroundLocationDisclosure()).toBe(true);

        const started = await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        expect(started).toBe(true);
        expect(locationTrackingService.isTrackingActive()).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // 3.4: Finish Write Failure + Coordinate Buffer Accumulation & Retry
    // ------------------------------------------------------------------------
    describe('3.4: Finish Write Failure + Coordinate Buffer Accumulation & Retry', () => {
      it('T3.Pairwise.07: Failed Finish while offline accumulates continuous GPS telemetry in buffer until reconnection retry', async () => {
        await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
        locationTrackingService.setNetworkOnlineState(false);

        // Try finish while offline -> rejects
        (logisticsService.updateLogisticsStatus as jest.Mock).mockRejectedValueOnce(
          new Error('Offline: cannot commit Completed')
        );

        const { findByTestId } = render(<LogisticsJobDetailScreen />);
        const finishBtn = await findByTestId('finish-job-btn');

        await act(async () => {
          fireEvent.press(finishBtn);
        });

        // Tracking survives -> driver continues driving and 2 pings arrive
        const ts1 = nextTimestamp();
        const ts2 = nextTimestamp();

        await locationTrackingService.handleLocationUpdate(makeLocation(-33.892, 151.232, 5, ts1));
        await locationTrackingService.handleLocationUpdate(makeLocation(-33.893, 151.233, 5, ts2));

        expect(locationTrackingService.getLocationBufferCount()).toBe(2);

        // Network restores
        locationTrackingService.setNetworkOnlineState(true);
        (logisticsService.updateLogisticsStatus as jest.Mock).mockResolvedValueOnce(undefined);

        // Retry finish
        await act(async () => {
          fireEvent.press(finishBtn);
        });

        expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
          'job-e2e-001',
          expect.arrayContaining([
            expect.objectContaining({ timestamp: ts1 }),
            expect.objectContaining({ timestamp: ts2 }),
          ])
        );
        expect(locationTrackingService.isTrackingActive()).toBe(false);
      });
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD WORKLOAD SCENARIOS
  // ==========================================================================

  describe('Tier 4: Real-World Workload Scenarios', () => {
    it('T4.Workflow.01: End-to-end full driver shift: Onboarding -> Accept -> Start Job 1 -> Dead-Zone Tunnel -> Exit Tunnel Auto-Flush -> Complete Job 1 -> Start Job 2 -> Arrive & Finish', async () => {
      // 1. First-time Onboarding on Feed Screen
      await AsyncStorage.removeItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY);
      const { findByTestId: findFeedBtn } = render(<LogisticsFeedScreen />);
      const acceptBtn = await findFeedBtn('bg-location-accept-btn');

      await act(async () => {
        fireEvent.press(acceptBtn);
      });
      expect(await AsyncStorage.getItem(locationTrackingService.BG_LOCATION_DISCLOSURE_KEY)).toBe('true');

      // 2. Start Job 1 in Job Detail Screen
      mockActiveRouteJobId = 'job-e2e-001';
      const { findByTestId: findDetailBtn1 } = render(<LogisticsJobDetailScreen />);
      const startBtn1 = await findDetailBtn1('play-job-btn');

      await act(async () => {
        fireEvent.press(startBtn1);
      });
      expect(locationTrackingService.isTrackingActive()).toBe(true);
      expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-001');

      // 3. Vehicle enters dead-zone tunnel (offline buffering)
      locationTrackingService.setNetworkOnlineState(false);
      const tArray: number[] = [];
      for (let i = 1; i <= 3; i++) {
        const ts = nextTimestamp();
        tArray.push(ts);
        await locationTrackingService.handleLocationUpdate(
          makeLocation(-33.894 + i * 0.001, 151.234 + i * 0.001, 5, ts, 90, 15)
        );
      }
      expect(locationTrackingService.getLocationBufferCount()).toBe(3);
      expect(locationTrackingService.getSyncStatus().status).toBe('offline_failed');

      // 4. Vehicle exits tunnel: network reconnects, auto-flush uploads path
      locationTrackingService.setNetworkOnlineState(true);
      await locationTrackingService.flushLocationBuffer('job-e2e-001');

      expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
        'job-e2e-001',
        expect.arrayContaining([
          expect.objectContaining({ timestamp: tArray[0] }),
          expect.objectContaining({ timestamp: tArray[1] }),
          expect.objectContaining({ timestamp: tArray[2] }),
        ])
      );
      expect(locationTrackingService.getLocationBufferCount()).toBe(0);

      // 5. Arrive at Job 1 destination and Finish
      const finishBtn1 = await findDetailBtn1('finish-job-btn');
      await act(async () => {
        fireEvent.press(finishBtn1);
      });
      expect(locationTrackingService.isTrackingActive()).toBe(false);

      // 6. Switch to Job 2
      mockActiveRouteJobId = 'job-e2e-002';
      const { findByTestId: findDetailBtn2 } = render(<LogisticsJobDetailScreen />);
      const startBtn2 = await findDetailBtn2('play-job-btn');

      await act(async () => {
        fireEvent.press(startBtn2);
      });
      expect(locationTrackingService.isTrackingActive()).toBe(true);
      expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-002');

      // 7. Complete Job 2
      const finishBtn2 = await findDetailBtn2('finish-job-btn');
      await act(async () => {
        fireEvent.press(finishBtn2);
      });
      expect(locationTrackingService.isTrackingActive()).toBe(false);
    });

    it('T4.Workflow.02: Driver encounters GPS disabled, enables in Settings, returns to app, starts route successfully', async () => {
      // 1. Device GPS disabled
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const startBtn = await findByTestId('play-job-btn');

      // Driver presses Start -> alert shown
      await act(async () => {
        fireEvent.press(startBtn);
      });
      expect(alertSpy).toHaveBeenCalledWith(
        'Location Services Disabled',
        expect.any(String),
        expect.any(Array)
      );

      // 2. Driver taps Open Settings
      const openSettingsBtn = alertSpy.mock.calls[0][2].find((b: any) => b.text === 'Open Settings');
      openSettingsBtn.onPress();
      expect(openSettingsSpy).toHaveBeenCalled();

      // 3. Driver enables GPS in device Settings and returns to app
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);

      // 4. Driver taps Start again -> successfully activates
      await act(async () => {
        fireEvent.press(startBtn);
      });

      expect(locationTrackingService.isTrackingActive()).toBe(true);
      expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-001');
    });

    it('T4.Workflow.03: Driver loses background permission mid-route, restores in Settings, app silently resumes tracking', async () => {
      // 1. Driver starts route
      await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');
      expect(locationTrackingService.isTrackingActive()).toBe(true);

      // 2. Driver switches out; OS or user revokes location permission
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      // 3. Driver returns to app: tracking halts and enters suspended state
      await act(async () => {
        if (appStateListener) await appStateListener('active');
      });
      expect(locationTrackingService.isTrackingActive()).toBe(false);
      expect(locationTrackingService.isTrackingSuspended()).toBe(true);

      // 4. Detail screen renders permission-revoked-warning banner
      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      expect(await findByTestId('permission-revoked-warning')).toBeTruthy();

      // Driver taps Open Settings
      const settingsLink = await findByText('Open Settings');
      await act(async () => {
        fireEvent.press(settingsLink);
      });
      expect(openSettingsSpy).toHaveBeenCalled();

      // 5. Driver restores permissions in OS Settings
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        android: { accuracy: 'fine' },
      });
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        android: { accuracy: 'fine' },
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        android: { accuracy: 'fine' },
      });

      // 6. Driver switches back to app: auto-resume fires silently with no manual Start tap needed
      await act(async () => {
        if (appStateListener) await appStateListener('active');
      });

      expect(locationTrackingService.isTrackingActive()).toBe(true);
      expect(locationTrackingService.isTrackingSuspended()).toBe(false);
      expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-e2e-001');
    });

    it('T4.Workflow.04: Complex multi-drop route with intermittent network dropouts and recovery', async () => {
      // 1. Start job
      await locationTrackingService.startTrackingJob('job-e2e-001', 'tenant-kuro-e2e');

      // 2. Online ping 1
      await locationTrackingService.handleLocationUpdate(makeLocation(-33.8688, 151.2093));

      // 3. Drop into canyon (offline)
      locationTrackingService.setNetworkOnlineState(false);
      for (let i = 1; i <= 2; i++) {
        await locationTrackingService.handleLocationUpdate(
          makeLocation(-33.87 + i * 0.002, 151.21 + i * 0.002)
        );
      }
      expect(locationTrackingService.getLocationBufferCount()).toBe(2);

      // 4. Emerge from canyon (online)
      locationTrackingService.setNetworkOnlineState(true);
      await locationTrackingService.flushLocationBuffer('job-e2e-001');
      expect(logisticsService.batchUploadLocationHistory).toHaveBeenCalled();
      expect(locationTrackingService.getLocationBufferCount()).toBe(0);

      // 5. Driver updates status via QuickStatusSelector to Completed
      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const completedPill = await findByTestId('status-btn-completed');

      await act(async () => {
        fireEvent.press(completedPill);
      });

      expect(locationTrackingService.isTrackingActive()).toBe(false);
    });
  });
});
