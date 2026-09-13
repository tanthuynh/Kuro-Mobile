/**
 * __tests__/disclosure-and-revocation.challenger.test.tsx
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE (Challenger M2-2)
 *
 * Focus:
 * - R2: One-Time Background Location Disclosure Onboarding & Persistence
 * - R3: Mid-Job Permission Revocation Halting, UI Warning Banner & Silent Auto-Resume
 *
 * Targets:
 * - app/(tabs)/logistics.tsx (Feed Screen onboarding modal)
 * - app/logistics/[id].tsx (Detail Screen revocation warning & isolation)
 * - src/services/location-tracking-service.ts (Core tracking lifecycle & AppState listener)
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert, Linking, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as fs from 'fs';
import * as path from 'path';

import LogisticsFeedScreen from '@/../app/(tabs)/logistics';
import LogisticsJobDetailScreen from '@/../app/logistics/[id]';
import * as logisticsService from '@/services/logistics-service';
import {
  LOCATION_TASK_NAME,
  BG_LOCATION_DISCLOSURE_KEY,
  startTrackingJob,
  stopTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  isTrackingSuspended,
  getSuspendedTrackingJobId,
  getSyncStatus,
  hasAcceptedBackgroundLocationDisclosure,
  recordBackgroundLocationDisclosureAccepted,
  recordBackgroundLocationDisclosureDeclined,
  hasAnsweredBackgroundLocationDisclosure,
  initTrackingAppStateObserver,
  stopTrackingAppStateObserver,
  initTrackingAuthObserver,
  stopTrackingAuthObserver,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';
import type { LogisticsEntry } from '@/types/logistics';

// ============================================================================
// CONTEXT & ROUTER MOCKS
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
  id: 'usr-driver-challenge',
  uid: 'usr-driver-challenge',
  name: 'Jordan Hayes',
  email: 'jordan@kuro.test',
  tenantId: 'tenant-challenger-m2',
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockDriver,
    tenant: { tenantId: 'tenant-challenger-m2', tenantName: 'Kuro Challenger Fleet' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      canGoBack: () => true,
      replace: jest.fn(),
    }),
    useLocalSearchParams: () => ({
      id: 'job-challenge-revocation',
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

// Mock LogisticsService
jest.mock('@/services/logistics-service', () => {
  const actual = jest.requireActual('@/services/logistics-service');
  return {
    ...actual,
    updateJobLocation: jest.fn().mockResolvedValue(undefined),
    stopJobTracking: jest.fn().mockResolvedValue(undefined),
    getLogisticsEntry: jest.fn(),
    subscribeSingleLogisticsEntry: jest.fn(),
    subscribeToLogistics: jest.fn(),
    fetchVehicleById: jest.fn().mockResolvedValue({
      id: 'veh-challenge-01',
      name: 'Freightliner M2',
      rego: 'NSW-M2-REV',
    }),
    updateLogisticsStatus: jest.fn().mockResolvedValue(undefined),
  };
});

// Test Job Fixture
const mockChallengeJob: LogisticsEntry = {
  id: 'job-challenge-revocation',
  tenantId: 'tenant-challenger-m2',
  eventNumber: 888,
  eventName: 'Empirical Challenge Route Run',
  location: 'Moore Park Entertainment Quarter, Sydney',
  status: 'In Progress',
  driverName: 'Jordan Hayes',
  assigneeId: 'usr-driver-challenge',
  vehicleId: 'veh-challenge-01',
  start: new Date('2026-09-12T09:00:00Z'),
  end: new Date('2026-09-12T17:00:00Z'),
  createdBy: 'Fleet Controller',
  updatedBy: 'Fleet Controller',
  createdAt: '2026-09-12T08:00:00Z',
  updatedAt: '2026-09-12T08:00:00Z',
  archived: false,
  isTrackingActive: false,
  destinations: [
    {
      id: 'dest-rev-01',
      type: 'destination',
      destinationName: 'Hordern Pavilion Bay 2',
      address: 'Driver Ave, Moore Park NSW 2021',
      time: '10:30 AM',
      estTravelTime: '25 min',
    },
  ],
};

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Challenger M2-2: Disclosure Onboarding & Revocation Auto-Resume Empirical Suite', () => {
  let appStateListener: ((state: AppStateStatus) => void) | null = null;
  let openSettingsSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    _resetTrackingStateForTesting();

    openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

    // Setup AppState spy to capture the listener
    appStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: string, listener: any) => {
      if (event === 'change') {
        appStateListener = listener;
      }
      return { remove: jest.fn() } as any;
    });

    // Default: all permissions granted and precise, GPS enabled
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      android: { accuracy: 'fine' },
    });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      android: { accuracy: 'fine' },
    });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      android: { accuracy: 'fine' },
    });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      android: { accuracy: 'fine' },
    });

    let nativeRunning = false;
    (Location.startLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      nativeRunning = true;
    });
    (Location.stopLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      nativeRunning = false;
    });
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      return nativeRunning;
    });

    // Default logistics service subscriptions
    jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((_tenantId, onUpdate) => {
      onUpdate([mockChallengeJob]);
      return () => {};
    });
    jest.spyOn(logisticsService, 'getLogisticsEntry').mockResolvedValue(mockChallengeJob);
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(mockChallengeJob);
      return () => {};
    });
  });

  afterEach(() => {
    stopTrackingAppStateObserver();
    stopTrackingAuthObserver();
    _resetTrackingStateForTesting();
  });

  // ==========================================================================
  // 1. R2 DISCLOSURE ONBOARDING EMPIRICAL CHALLENGES
  // ==========================================================================
  describe('1. R2 Background Location Disclosure Onboarding & Persistence', () => {
    it('1.1: First launch (null in AsyncStorage): displays disclosure modal with compliant messaging', async () => {
      await AsyncStorage.removeItem(BG_LOCATION_DISCLOSURE_KEY);

      const { findByTestId, findByText } = render(<LogisticsFeedScreen />);

      // Modal must mount and become visible
      const modal = await findByTestId('onboarding-bg-location-disclosure-modal');
      expect(modal.props.visible).toBe(true);

      // Verify required disclosure copy mandated by Google Play & Apple App Store
      expect(await findByText('Background Location Access')).toBeTruthy();
      expect(await findByText(/including when the app is closed or not in use/i)).toBeTruthy();
      expect(await findByText(/Real-Time Route Telemetry:/i)).toBeTruthy();
      expect(await findByText(/Active Job Bound:/i)).toBeTruthy();
      expect(await findByText(/Always Allow/i)).toBeTruthy();
    });

    it('1.2: Accept flow: stores "true", dismisses modal, and requests background location permissions', async () => {
      await AsyncStorage.removeItem(BG_LOCATION_DISCLOSURE_KEY);

      const { findByTestId, queryByText } = render(<LogisticsFeedScreen />);
      const acceptBtn = await findByTestId('bg-location-accept-btn');

      await act(async () => {
        fireEvent.press(acceptBtn);
      });

      // Verify persistence in AsyncStorage
      const stored = await AsyncStorage.getItem(BG_LOCATION_DISCLOSURE_KEY);
      expect(stored).toBe('true');

      // Verify background permission request was triggered
      expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalledTimes(1);

      // Verify modal is dismissed
      expect(queryByText('Background Location Access')).toBeNull();
    });

    it('1.3: Decline flow: stores "declined", dismisses modal, and does NOT request background location permissions', async () => {
      await AsyncStorage.removeItem(BG_LOCATION_DISCLOSURE_KEY);

      const { findByTestId, queryByText } = render(<LogisticsFeedScreen />);
      const declineBtn = await findByTestId('bg-location-decline-btn');

      await act(async () => {
        fireEvent.press(declineBtn);
      });

      // Verify persistence in AsyncStorage
      const stored = await AsyncStorage.getItem(BG_LOCATION_DISCLOSURE_KEY);
      expect(stored).toBe('declined');

      // Crucial requirement: background permission must NOT be requested if user declines
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();

      // Verify modal is dismissed
      expect(queryByText('Background Location Access')).toBeNull();
    });

    it('1.4: App restart with stored "true": modal is permanently suppressed', async () => {
      await AsyncStorage.setItem(BG_LOCATION_DISCLOSURE_KEY, 'true');

      const { queryByTestId, queryByText } = render(<LogisticsFeedScreen />);

      await act(async () => {
        await Promise.resolve();
      });

      const modal = queryByTestId('onboarding-bg-location-disclosure-modal');
      if (modal) {
        expect(modal.props.visible).toBe(false);
      }
      expect(queryByText('Background Location Access')).toBeNull();
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('1.5: App restart with stored "declined": modal is permanently suppressed', async () => {
      await AsyncStorage.setItem(BG_LOCATION_DISCLOSURE_KEY, 'declined');

      const { queryByTestId, queryByText } = render(<LogisticsFeedScreen />);

      await act(async () => {
        await Promise.resolve();
      });

      const modal = queryByTestId('onboarding-bg-location-disclosure-modal');
      if (modal) {
        expect(modal.props.visible).toBe(false);
      }
      expect(queryByText('Background Location Access')).toBeNull();
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('1.6: Detail Screen Isolation: verify modal is NEVER imported or rendered in app/logistics/[id].tsx', async () => {
      // Static AST / source inspection
      const detailScreenPath = path.resolve(__dirname, '../app/logistics/[id].tsx');
      const detailScreenSource = fs.readFileSync(detailScreenPath, 'utf-8');

      expect(detailScreenSource).not.toContain('BackgroundLocationDisclosureModal');
      expect(detailScreenSource).not.toContain('onboarding-bg-location-disclosure-modal');
      expect(detailScreenSource).not.toContain('bg-location-disclosure-modal');

      // Runtime rendering inspection
      await AsyncStorage.removeItem(BG_LOCATION_DISCLOSURE_KEY);
      const { queryByTestId, queryByText } = render(<LogisticsJobDetailScreen />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(queryByTestId('onboarding-bg-location-disclosure-modal')).toBeNull();
      expect(queryByTestId('bg-location-disclosure-modal')).toBeNull();
      expect(queryByText('Background Location Access')).toBeNull();
    });

    it('1.7: Service Helpers: verify hasAccepted, recordAccepted, recordDeclined, hasAnswered helpers', async () => {
      await AsyncStorage.removeItem(BG_LOCATION_DISCLOSURE_KEY);
      expect(await hasAcceptedBackgroundLocationDisclosure()).toBe(false);
      expect(await hasAnsweredBackgroundLocationDisclosure()).toBe(false);

      await recordBackgroundLocationDisclosureDeclined();
      expect(await hasAcceptedBackgroundLocationDisclosure()).toBe(false);
      expect(await hasAnsweredBackgroundLocationDisclosure()).toBe(true);

      await recordBackgroundLocationDisclosureAccepted();
      expect(await hasAcceptedBackgroundLocationDisclosure()).toBe(true);
      expect(await hasAnsweredBackgroundLocationDisclosure()).toBe(true);
    });
  });

  // ==========================================================================
  // 2. R3 MID-JOB PERMISSION REVOCATION & SILENT AUTO-RESUME
  // ==========================================================================
  describe('2. R3 Mid-Job Revocation & Silent Auto-Resume', () => {
    it('2.1: Revocation halts native tracking, suspends session, and sets status to permission_denied', async () => {
      initTrackingAppStateObserver();

      // Start active tracking
      const started = await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);
      expect(started).toBe(true);
      expect(isTrackingActive()).toBe(true);
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
        LOCATION_TASK_NAME,
        expect.anything()
      );

      // User switches away and revokes foreground permission
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      // App returns to foreground (AppState -> active)
      expect(appStateListener).not.toBeNull();
      await act(async () => {
        await appStateListener!('active');
      });

      // Native updates must halt immediately
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);

      // Tracking state must be suspended
      expect(isTrackingActive()).toBe(false);
      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe(mockChallengeJob.id);
      expect(getSyncStatus().status).toBe('permission_denied');
    });

    it('2.2: Revocation on background permission loss halts tracking and suspends session', async () => {
      initTrackingAppStateObserver();

      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);
      expect(isTrackingActive()).toBe(true);

      // Foreground granted, but background revoked (e.g. changed to "While Using App")
      (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      await act(async () => {
        await appStateListener!('active');
      });

      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
      expect(isTrackingActive()).toBe(false);
      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe(mockChallengeJob.id);
      expect(getSyncStatus().status).toBe('permission_denied');
    });

    it('2.3: Revocation when device GPS service is globally disabled halts tracking and suspends session', async () => {
      initTrackingAppStateObserver();

      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);
      expect(isTrackingActive()).toBe(true);

      // Device Location Services toggled off
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      await act(async () => {
        await appStateListener!('active');
      });

      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
      expect(isTrackingActive()).toBe(false);
      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe(mockChallengeJob.id);
      expect(getSyncStatus().status).toBe('permission_denied');
    });

    it('2.4: Revocation when user downgrades accuracy to Approximate halts tracking and suspends session', async () => {
      initTrackingAppStateObserver();

      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);
      expect(isTrackingActive()).toBe(true);

      // Approximate accuracy
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        android: { accuracy: 'coarse' },
      });

      await act(async () => {
        await appStateListener!('active');
      });

      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
      expect(isTrackingActive()).toBe(false);
      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe(mockChallengeJob.id);
      expect(getSyncStatus().status).toBe('permission_denied');
    });

    it('2.5: UI renders permission-revoked-warning banner and header badge during suspension', async () => {
      initTrackingAppStateObserver();
      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);
      expect(isTrackingActive()).toBe(true);

      // Revoke permission mid-job
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      await act(async () => {
        await appStateListener!('active');
      });

      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe(mockChallengeJob.id);

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);

      // Warning banner must be present
      expect(await findByTestId('permission-revoked-warning')).toBeTruthy();
      expect(
        await findByText('Location permission revoked. Please re-enable in Settings to resume tracking.')
      ).toBeTruthy();

      // Header badge must reflect "Permission Required"
      const badge = await findByTestId('detail-tracking-status-badge');
      expect(badge).toBeTruthy();
      expect(await findByText('Permission Required')).toBeTruthy();

      // Tapping "Open Settings" link opens device settings
      const settingsLink = await findByText('Open Settings');
      await act(async () => {
        fireEvent.press(settingsLink);
      });
      expect(openSettingsSpy).toHaveBeenCalled();
    });

    it('2.6: Permission restoration auto-resumes tracking silently without tapping Start and clears banner', async () => {
      initTrackingAppStateObserver();

      // Step 1: Start tracking
      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);
      expect(isTrackingActive()).toBe(true);
      (Location.startLocationUpdatesAsync as jest.Mock).mockClear();

      // Step 2: Revoke permission
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });
      await act(async () => {
        await appStateListener!('active');
      });
      expect(isTrackingActive()).toBe(false);
      expect(isTrackingSuspended()).toBe(true);

      // Render UI in suspended state
      const { findByTestId, queryByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      expect(await findByTestId('permission-revoked-warning')).toBeTruthy();
      expect(await findByText('Permission Required')).toBeTruthy();

      // Step 3: User goes to Settings and restores all permissions
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
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

      // App returns to foreground (AppState -> active)
      await act(async () => {
        await appStateListener!('active');
      });

      // Verification: Location.startLocationUpdatesAsync was called silently
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
        LOCATION_TASK_NAME,
        expect.anything()
      );

      // Tracking state is restored
      expect(isTrackingActive()).toBe(true);
      expect(isTrackingSuspended()).toBe(false);
      expect(getSuspendedTrackingJobId()).toBeNull();
      expect(getSyncStatus().status).toBe('synced');

      // UI Verification: warning banner disappears and header badge updates to Tracking
      expect(queryByTestId('permission-revoked-warning')).toBeNull();
      expect(await findByText('Tracking')).toBeTruthy();
    });
  });

  // ==========================================================================
  // 3. ADVERSARIAL EDGE CASES & STRESS HARNESS
  // ==========================================================================
  describe('3. Adversarial Edge Cases & Robustness', () => {
    it('3.1: Re-entrancy guard: burst of rapid AppState "active" events triggers exactly one reconciliation', async () => {
      initTrackingAppStateObserver();
      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);

      // Revoke permission
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      (Location.stopLocationUpdatesAsync as jest.Mock).mockClear();

      // Fire 5 rapid active events concurrently
      await act(async () => {
        await Promise.all([
          appStateListener!('active'),
          appStateListener!('active'),
          appStateListener!('active'),
          appStateListener!('active'),
          appStateListener!('active'),
        ]);
      });

      // stopLocationUpdatesAsync should only be called once, not 5 times
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    });

    it('3.2: Explicit stop during suspension clears suspended session (no phantom auto-resume)', async () => {
      initTrackingAppStateObserver();
      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);

      // Revoke permission
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });
      await act(async () => {
        await appStateListener!('active');
      });
      expect(isTrackingSuspended()).toBe(true);

      // Driver explicitly stops tracking while suspended (e.g. cancels job or pauses)
      await stopTrackingJob(mockChallengeJob.id);
      expect(isTrackingSuspended()).toBe(false);
      expect(getSuspendedTrackingJobId()).toBeNull();

      // Permissions restored later
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
      (Location.startLocationUpdatesAsync as jest.Mock).mockClear();

      await act(async () => {
        await appStateListener!('active');
      });

      // Must NOT auto-resume since user explicitly stopped tracking
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(isTrackingActive()).toBe(false);
    });

    it('3.3: User sign-out clears suspended session to prevent cross-user auto-resume', async () => {
      let authCallback: ((user: any) => void) | null = null;
      const mockCustomAuth = { currentUser: { uid: 'usr-driver-challenge' } };
      const mockCustomOnAuthStateChanged = jest.fn((_auth, cb) => {
        authCallback = cb;
        return jest.fn();
      });

      initTrackingAuthObserver(mockCustomAuth, mockCustomOnAuthStateChanged);
      initTrackingAppStateObserver();

      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);

      // Revoke permission mid-job
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });
      await act(async () => {
        await appStateListener!('active');
      });
      expect(isTrackingSuspended()).toBe(true);

      // User signs out (authCallback emits null user)
      expect(authCallback).not.toBeNull();
      await act(async () => {
        await authCallback!(null);
      });

      // Suspended session must be discarded
      expect(isTrackingSuspended()).toBe(false);
      expect(getSuspendedTrackingJobId()).toBeNull();

      // Permissions restored later
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
      (Location.startLocationUpdatesAsync as jest.Mock).mockClear();

      await act(async () => {
        await appStateListener!('active');
      });

      // Must NOT auto-resume for signed-out user
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('3.4: Partial restoration (foreground restored, background still denied) does NOT resume and retains suspension', async () => {
      initTrackingAppStateObserver();
      await startTrackingJob(mockChallengeJob.id, mockChallengeJob.tenantId);

      // Revoke foreground mid-job
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });
      await act(async () => {
        await appStateListener!('active');
      });
      expect(isTrackingSuspended()).toBe(true);

      (Location.startLocationUpdatesAsync as jest.Mock).mockClear();

      // User enables foreground, but forgets or refuses background permission
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
        status: 'denied',
        granted: false,
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      await act(async () => {
        await appStateListener!('active');
      });

      // Must NOT resume tracking without background permission
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(isTrackingActive()).toBe(false);
      // Must remain suspended so it can resume once background is granted
      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe(mockChallengeJob.id);
    });
  });
});
