/**
 * __tests__/location-tracking-hardening.test.ts
 *
 * Comprehensive Hardening Test Suite for Kuro Mobile Logistics GPS Tracking.
 *
 * Verifies:
 * 1. Duplicate start prevention & watcher coalescence.
 * 2. Stop during in-flight update (elimination of post-stop tracking state resurrection).
 * 3. Immediate teardown on logout / account switch via auth observer.
 * 4. Immediate teardown on tenant switch.
 * 5. Mid-session permission revocation handling & AppState foreground reconciliation.
 * 6. Monotonic timestamp verification & rejection of out-of-order callbacks.
 * 7. Movement (>=30m) & Heartbeat (5 min) write throttling (stationary jitter suppression).
 * 8. History breadcrumb movement threshold (>=50m) preservation without cluttering DB.
 * 9. Explicit network loss reporting without claiming false success.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  LOCATION_TASK_NAME,
  MOVEMENT_THRESHOLD_METERS,
  HEARTBEAT_THRESHOLD_MS,
  HISTORY_MOVEMENT_THRESHOLD_METERS,
  startTrackingJob,
  stopTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  getActiveTenantId,
  getLastKnownLocation,
  getSyncStatus,
  addSyncStatusListener,
  handleLocationUpdate,
  calculateHaversineDistance,
  initTrackingAuthObserver,
  stopTrackingAuthObserver,
  initTrackingAppStateObserver,
  stopTrackingAppStateObserver,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';
import * as LogisticsService from '@/services/logistics-service';

// Mock LogisticsService
jest.mock('@/services/logistics-service', () => ({
  updateJobLocation: jest.fn().mockResolvedValue(undefined),
  stopJobTracking: jest.fn().mockResolvedValue(undefined),
}));

describe('Hardened Logistics Location Tracking Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetTrackingStateForTesting();

    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    let isNativeUpdatesStarted = false;
    (Location.startLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      isNativeUpdatesStarted = true;
    });
    (Location.stopLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      isNativeUpdatesStarted = false;
    });
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
      return isNativeUpdatesStarted;
    });

    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 10,
        accuracy: 5,
        heading: 0,
        speed: 0,
      },
      timestamp: 1756285200000,
    });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 10,
        accuracy: 5,
        heading: 0,
        speed: 0,
      },
      timestamp: 1756285200000,
    });
  });

  afterEach(() => {
    _resetTrackingStateForTesting();
    stopTrackingAuthObserver();
    stopTrackingAppStateObserver();
  });

  // ==========================================================================
  // 1. DUPLICATE START & CONCURRENT WATCHER PREVENTION
  // ==========================================================================
  describe('1. Duplicate Start Prevention & Watcher Coalescence', () => {
    it('coalesces rapid concurrent start calls into a single native location watcher', async () => {
      const calls = Array.from({ length: 10 }, () =>
        startTrackingJob('job-dup-1', 'tenant-1', { driverId: 'drv-1', driverName: 'Driver 1' })
      );

      const results = await Promise.all(calls);

      // All calls must resolve true
      expect(results.every((r) => r === true)).toBe(true);

      // Expo Location startLocationUpdatesAsync must be called EXACTLY once
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe('job-dup-1');
    });

    it('returns true immediately without re-initializing if already tracking the exact job', async () => {
      const first = await startTrackingJob('job-idempotent-2', 'tenant-1');
      expect(first).toBe(true);
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);

      const second = await startTrackingJob('job-idempotent-2', 'tenant-1');
      expect(second).toBe(true);
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. STOP DURING IN-FLIGHT UPDATE (NO TRACKING RESURRECTION)
  // ==========================================================================
  describe('2. Stop During In-Flight Update (Race Condition Elimination)', () => {
    it('guarantees that an in-flight location update does not resurrect isTrackingActive after stop', async () => {
      let resolveInFlightUpdate: () => void;
      const delayedWritePromise = new Promise<void>((resolve) => {
        resolveInFlightUpdate = resolve;
      });

      await startTrackingJob('job-race-stop', 'tenant-1');

      // Clear mock calls from initial position
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();
      (LogisticsService.stopJobTracking as jest.Mock).mockClear();

      // Configure second update with network delay
      (LogisticsService.updateJobLocation as jest.Mock).mockImplementationOnce(
        () => delayedWritePromise
      );

      // Dispatch a location update that moves 100m away
      const movePing: Location.LocationObject = {
        coords: {
          latitude: -33.8600,
          longitude: 151.2000,
          altitude: 10,
          accuracy: 5,
          speed: 10,
          heading: 90,
          altitudeAccuracy: null,
        },
        timestamp: 1756285250000,
      };

      // Start the update (it enters in-flight state)
      const updatePromise = handleLocationUpdate(movePing);

      // Concurrently call stopTrackingJob while the write is traveling across the network
      const stopPromise = stopTrackingJob('job-race-stop');

      // Now release the in-flight network write
      resolveInFlightUpdate!();

      await Promise.all([updatePromise, stopPromise]);

      // Verify tracking is stopped
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();

      // Crucial: stopJobTracking was called for job-race-stop
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-race-stop');

      // Verify stopJobTracking was called AFTER the in-flight updateJobLocation started
      const updateCallOrder = (LogisticsService.updateJobLocation as jest.Mock).mock.invocationCallOrder[0];
      const stopCallOrder = (LogisticsService.stopJobTracking as jest.Mock).mock.invocationCallOrder[0];
      expect(stopCallOrder).toBeGreaterThan(updateCallOrder);
    });

    it('discards location callbacks that resolve after tracking has stopped', async () => {
      await startTrackingJob('job-discard-after-stop', 'tenant-1');
      await stopTrackingJob('job-discard-after-stop');

      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const postStopPing: Location.LocationObject = {
        coords: {
          latitude: -33.8500,
          longitude: 151.2000,
          altitude: 10,
          accuracy: 5,
          speed: 0,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1756285300000,
      };

      const result = await handleLocationUpdate(postStopPing);

      // Position is returned formatted, but NO Firestore write is issued
      expect(result).not.toBeNull();
      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. LOGOUT & ACCOUNT SWITCH TEARDOWN (AUTH OBSERVER)
  // ==========================================================================
  describe('3. Immediate Teardown on Logout & User Switch', () => {
    it('stops tracking automatically when auth observer detects signout (null user)', async () => {
      let authCallback: ((user: any) => void) | null = null;
      const mockCustomOnAuthStateChanged = jest.fn((_auth, cb) => {
        authCallback = cb;
        return () => {};
      });

      const mockAuth = {
        currentUser: { uid: 'driver-logged-in-1', displayName: 'Driver One' },
      };

      initTrackingAuthObserver(mockAuth, mockCustomOnAuthStateChanged);

      await startTrackingJob('job-auth-teardown', 'tenant-1', {
        driverId: 'driver-logged-in-1',
      });
      expect(isTrackingActive()).toBe(true);

      // Simulate sign out via auth observer callback
      expect(authCallback).not.toBeNull();
      await authCallback!(null);

      // Tracking must be halted immediately
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-auth-teardown');
    });

    it('stops tracking automatically when a different user logs in (UID mismatch)', async () => {
      let authCallback: ((user: any) => void) | null = null;
      const mockCustomOnAuthStateChanged = jest.fn((_auth, cb) => {
        authCallback = cb;
        return () => {};
      });

      const mockAuth = {
        currentUser: { uid: 'driver-alice', displayName: 'Alice' },
      };

      initTrackingAuthObserver(mockAuth, mockCustomOnAuthStateChanged);

      await startTrackingJob('job-user-switch', 'tenant-1', {
        driverId: 'driver-alice',
      });
      expect(isTrackingActive()).toBe(true);

      // Simulate driver switch to Bob
      await authCallback!({ uid: 'driver-bob', displayName: 'Bob' });

      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-user-switch');
    });
  });

  // ==========================================================================
  // 4. TENANT SWITCH TEARDOWN
  // ==========================================================================
  describe('4. Immediate Teardown on Tenant Switch', () => {
    it('cleanly stops tracking previous tenant job when starting a job under another tenant', async () => {
      await startTrackingJob('job-tenant-A', 'tenant-alpha');
      expect(getActiveTenantId()).toBe('tenant-alpha');

      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true);

      // Switch to Tenant B
      await startTrackingJob('job-tenant-B', 'tenant-beta');

      // Tenant A tracking stopped
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-tenant-A');
      expect(getActiveTenantId()).toBe('tenant-beta');
      expect(getActiveTrackingJobId()).toBe('job-tenant-B');
    });
  });

  // ==========================================================================
  // 5. PERMISSION LOSS DETECTION & APP STATE RECONCILIATION
  // ==========================================================================
  describe('5. Mid-Session Permission Revocation & AppState Reconciliation', () => {
    it('halts tracking and sets status to permission_denied if permission is revoked upon foregrounding', async () => {
      let appStateCallback: ((state: string) => void) | null = null;
      jest.spyOn(require('react-native').AppState, 'addEventListener').mockImplementation(
        (_event: any, cb: any) => {
          appStateCallback = cb;
          return { remove: jest.fn() };
        }
      );

      initTrackingAppStateObserver();

      await startTrackingJob('job-perm-revoked', 'tenant-1');
      expect(isTrackingActive()).toBe(true);

      // Simulate user revoking permission in Android/iOS Settings while app was backgrounded
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      // App returns to foreground
      expect(appStateCallback).not.toBeNull();
      await appStateCallback!('active');

      // Tracking should be stopped and sync status updated
      expect(isTrackingActive()).toBe(false);
      expect(getSyncStatus().status).toBe('permission_denied');
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
    });

    it('rejects startTrackingJob immediately if foreground permission is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
      });

      const started = await startTrackingJob('job-denied', 'tenant-1');
      expect(started).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getSyncStatus().status).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 6. MONOTONIC TIMESTAMP & OUT-OF-ORDER REJECTION
  // ==========================================================================
  describe('6. Monotonic Timestamp & Out-of-Order Callbacks', () => {
    it('rejects older callbacks that arrive after a newer callback has been processed', async () => {
      await startTrackingJob('job-monotonic', 'tenant-1');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      // Newer callback: T = 1756285300000
      const newerPing: Location.LocationObject = {
        coords: {
          latitude: -33.8500,
          longitude: 151.2000,
          altitude: 10,
          accuracy: 5,
          speed: 10,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1756285300000,
      };

      const resNew = await handleLocationUpdate(newerPing);
      expect(resNew).not.toBeNull();
      expect(resNew?.timestamp).toBe(1756285300000);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledTimes(1);

      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      // Older delayed callback: T = 1756285250000 (50 seconds earlier)
      const olderDelayedPing: Location.LocationObject = {
        coords: {
          latitude: -33.8550,
          longitude: 151.2050,
          altitude: 10,
          accuracy: 5,
          speed: 10,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1756285250000,
      };

      const resOld = await handleLocationUpdate(olderDelayedPing);

      // Stale callback must be dropped completely
      expect(resOld).toBeNull();
      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
      expect(getLastKnownLocation()?.timestamp).toBe(1756285300000);
    });
  });

  // ==========================================================================
  // 7. MOVEMENT & HEARTBEAT WRITE THROTTLING
  // ==========================================================================
  describe('7. Movement & Heartbeat Write Throttling (Stationary Suppression)', () => {
    it('suppresses Firestore writes when stationary movement is under 30 meters and within 5 minutes', async () => {
      await startTrackingJob('job-stationary-throttle', 'tenant-1');
      // Clear initial position write from startTrackingJob
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const initialLat = -33.8688;
      const initialLng = 151.2093;

      // 1. First movement ping: 5 meters jitter, 10 seconds later
      // Displacement of 0.00004 deg lat is ~4.4 meters
      const jitterPing: Location.LocationObject = {
        coords: {
          latitude: initialLat + 0.00004,
          longitude: initialLng,
          altitude: 10,
          accuracy: 5,
          speed: 0,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1756285210000,
      };

      const distance = calculateHaversineDistance(initialLat, initialLng, initialLat + 0.00004, initialLng);
      expect(distance).toBeLessThan(MOVEMENT_THRESHOLD_METERS);

      const resJitter = await handleLocationUpdate(jitterPing);
      expect(resJitter).not.toBeNull();
      // DB write must be suppressed!
      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();

      // 2. Second ping: 50 meters movement (> 30m threshold), triggers parent write
      // 0.00045 deg lat is ~50 meters
      const movementPing: Location.LocationObject = {
        coords: {
          latitude: initialLat + 0.00045,
          longitude: initialLng,
          altitude: 10,
          accuracy: 5,
          speed: 15,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1756285230000,
      };

      const moveDistance = calculateHaversineDistance(initialLat, initialLng, initialLat + 0.00045, initialLng);
      expect(moveDistance).toBeGreaterThanOrEqual(MOVEMENT_THRESHOLD_METERS);

      await handleLocationUpdate(movementPing);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledTimes(1);
    });

    it('triggers heartbeat write after 5 minutes even if vehicle is stationary', async () => {
      await startTrackingJob('job-heartbeat', 'tenant-1');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const initialLat = -33.8688;
      const initialLng = 151.2093;
      const initialTime = 1756285200000;

      // Ping arriving exactly 5 minutes (300,000 ms) later at the exact same location
      const heartbeatPing: Location.LocationObject = {
        coords: {
          latitude: initialLat,
          longitude: initialLng,
          altitude: 10,
          accuracy: 5,
          speed: 0,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: initialTime + HEARTBEAT_THRESHOLD_MS,
      };

      await handleLocationUpdate(heartbeatPing);

      // Heartbeat write must fire to confirm connection liveness
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 8. HISTORY BREADCRUMB MOVEMENT THRESHOLD
  // ==========================================================================
  describe('8. History Breadcrumb Movement Threshold (>= 50m)', () => {
    it('skips history breadcrumb subcollection write when movement is between 30m and 49m', async () => {
      await startTrackingJob('job-history-threshold', 'tenant-1');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const initialLat = -33.8688;
      const initialLng = 151.2093;

      // Displacement of 0.00032 deg lat is ~35.5 meters (>= 30m parent threshold, but < 50m history threshold)
      const moderateMovePing: Location.LocationObject = {
        coords: {
          latitude: initialLat + 0.00032,
          longitude: initialLng,
          altitude: 10,
          accuracy: 5,
          speed: 5,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1756285230000,
      };

      const dist = calculateHaversineDistance(initialLat, initialLng, initialLat + 0.00032, initialLng);
      expect(dist).toBeGreaterThanOrEqual(MOVEMENT_THRESHOLD_METERS);
      expect(dist).toBeLessThan(HISTORY_MOVEMENT_THRESHOLD_METERS);

      await handleLocationUpdate(moderateMovePing);

      // Parent was updated, but skipHistory was true!
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        'job-history-threshold',
        expect.objectContaining({ latitude: initialLat + 0.00032 }),
        { skipHistory: true, isTrackingActive: true }
      );
    });

    it('writes history breadcrumb when movement exceeds 50 meters', async () => {
      await startTrackingJob('job-history-write', 'tenant-1');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const initialLat = -33.8688;
      const initialLng = 151.2093;

      // Displacement of 0.00055 deg lat is ~61 meters (>= 50m history threshold)
      const bigMovePing: Location.LocationObject = {
        coords: {
          latitude: initialLat + 0.00055,
          longitude: initialLng,
          altitude: 10,
          accuracy: 5,
          speed: 20,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1756285250000,
      };

      const dist = calculateHaversineDistance(initialLat, initialLng, initialLat + 0.00055, initialLng);
      expect(dist).toBeGreaterThanOrEqual(HISTORY_MOVEMENT_THRESHOLD_METERS);

      await handleLocationUpdate(bigMovePing);

      // History was NOT skipped (called with standard 2 args)
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        'job-history-write',
        expect.objectContaining({ latitude: initialLat + 0.00055 })
      );
    });
  });

  // ==========================================================================
  // 9. EXPLICIT NETWORK LOSS REPORTING
  // ==========================================================================
  describe('9. Explicit Network Loss Reporting without False Success', () => {
    it('sets syncStatus to offline_failed when Firestore sync throws network error', async () => {
      await startTrackingJob('job-network-loss', 'tenant-1');

      (LogisticsService.updateJobLocation as jest.Mock).mockRejectedValueOnce(
        new Error('UNAVAILABLE: network connection closed')
      );

      const statusListenerSpy = jest.fn();
      addSyncStatusListener(statusListenerSpy);

      // Displacement of 100 meters
      const ping: Location.LocationObject = {
        coords: {
          latitude: -33.8500,
          longitude: 151.2000,
          altitude: 10,
          accuracy: 5,
          speed: 10,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1756285300000,
      };

      await handleLocationUpdate(ping);

      const sync = getSyncStatus();
      expect(sync.status).toBe('offline_failed');
      expect(sync.lastError).toContain('network connection closed');
      expect(statusListenerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'offline_failed',
        })
      );
    });

    it('recovers syncStatus to synced once connection is restored and write succeeds', async () => {
      await startTrackingJob('job-network-recovery', 'tenant-1');

      // 1. First write fails
      (LogisticsService.updateJobLocation as jest.Mock).mockRejectedValueOnce(
        new Error('UNAVAILABLE: offline')
      );
      await handleLocationUpdate({
        coords: { latitude: -33.8500, longitude: 151.2000, altitude: 0, accuracy: 5, speed: 0, heading: 0, altitudeAccuracy: null },
        timestamp: 1756285300000,
      });
      expect(getSyncStatus().status).toBe('offline_failed');

      // 2. Next write succeeds
      (LogisticsService.updateJobLocation as jest.Mock).mockResolvedValueOnce(undefined);
      await handleLocationUpdate({
        coords: { latitude: -33.8400, longitude: 151.2000, altitude: 0, accuracy: 5, speed: 10, heading: 0, altitudeAccuracy: null },
        timestamp: 1756285350000,
      });

      expect(getSyncStatus().status).toBe('synced');
      expect(getSyncStatus().lastError).toBeNull();
    });
  });
});
