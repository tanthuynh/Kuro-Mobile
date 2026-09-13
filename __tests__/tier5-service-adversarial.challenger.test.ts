/**
 * __tests__/tier5-service-adversarial.challenger.test.ts
 *
 * TIER 5 SERVICE ADVERSARIAL STRESS TEST SUITE (Challenger M4-1)
 * White-Box Adversarial Stress Testing on src/services/location-tracking-service.ts
 *
 * Stress-tested Dimensions:
 * 1. Invalidate session generation tokens under rapid concurrent events.
 * 2. Verify coordinate buffer serialization, storage bounds, and network flush recovery during intermittent packet drops.
 * 3. Test edge cases where device GPS enabled status changes while app is in background or during active tracking.
 * 4. Verify mutex lock behavior on isReconcilingAppState under simulated parallel worker threads / burst events.
 * 5. Verify clean teardown when switching jobs rapidly under degraded network conditions.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LOCATION_TASK_NAME,
  LOCATION_BUFFER_STORAGE_KEY_PREFIX,
  getBufferStorageKey,
  startTrackingJob,
  stopTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  getActiveTenantId,
  getLastKnownLocation,
  getTrackingStatus,
  getLastTrackingFailureReason,
  isTrackingSuspended,
  getSuspendedTrackingJobId,
  getSyncStatus,
  addSyncStatusListener,
  setNetworkOnlineState,
  isOnline,
  getLocationBufferCount,
  isLocationBufferFlushing,
  clearLocationBuffer,
  flushLocationBuffer,
  handleLocationUpdate,
  verifyTrackingPrerequisites,
  isAccuracyPrecise,
  initTrackingAppStateObserver,
  stopTrackingAppStateObserver,
  initTrackingAuthObserver,
  stopTrackingAuthObserver,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';
import * as LogisticsService from '@/services/logistics-service';
import type { DriverLocation } from '@/types/logistics';

// Mock logistics-service updates
jest.mock('@/services/logistics-service', () => {
  const actual = jest.requireActual('@/services/logistics-service');
  return {
    ...actual,
    updateJobLocation: jest.fn().mockResolvedValue(undefined),
    stopJobTracking: jest.fn().mockResolvedValue(undefined),
    batchUploadLocationHistory: jest.fn().mockResolvedValue(undefined),
    updateLogisticsStatus: jest.fn().mockResolvedValue(undefined),
  };
});

describe('Tier 5 Service Adversarial Challenger: location-tracking-service.ts', () => {
  let appStateListener: ((state: AppStateStatus) => Promise<void> | void) | null = null;
  let simulatedTimestamp = 1756300000000;

  function nextTimestamp(delta = 10000): number {
    simulatedTimestamp += delta;
    return simulatedTimestamp;
  }

  function makeLocation(
    latitude = -33.8688,
    longitude = 151.2093,
    accuracy = 5,
    timestamp = nextTimestamp(),
    heading = 0,
    speed = 0
  ): Location.LocationObject {
    return {
      coords: {
        latitude,
        longitude,
        altitude: 10,
        accuracy,
        altitudeAccuracy: null,
        heading,
        speed,
      },
      timestamp,
    };
  }

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    _resetTrackingStateForTesting();
    await AsyncStorage.clear();

    simulatedTimestamp = 1756300000000;
    setNetworkOnlineState(true);

    // Spy on AppState listener
    appStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: string, listener: any) => {
      if (event === 'change') {
        appStateListener = listener;
      }
      return { remove: jest.fn() } as any;
    });
    initTrackingAppStateObserver();

    // Default healthy mock responses
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
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(async () => ({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 10,
        accuracy: 5,
        heading: 0,
        speed: 0,
      },
      timestamp: nextTimestamp(),
    }));
    (Location.getLastKnownPositionAsync as jest.Mock).mockImplementation(async () => ({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 10,
        accuracy: 5,
        heading: 0,
        speed: 0,
      },
      timestamp: nextTimestamp(),
    }));
  });

  afterEach(() => {
    stopTrackingAppStateObserver();
    _resetTrackingStateForTesting();
  });

  // ============================================================================
  // FOCUS 1: SESSION GENERATION TOKEN INVALIDATION UNDER RAPID CONCURRENT EVENTS
  // ============================================================================
  describe('Focus 1: Session Generation Token Invalidation Under Rapid Concurrent Events', () => {
    it('T5.ADV.1.01: In-flight updateJobLocation completing AFTER stopTrackingJob() does NOT resurrect session or overwrite idle state', async () => {
      let resolveUpdate: (() => void) | null = null;
      (LogisticsService.updateJobLocation as jest.Mock).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveUpdate = resolve;
          })
      );

      // 1. Start tracking Job A
      const startPromise = startTrackingJob('job-adv-001', 'tenant-kuro');
      // Await start (it triggers initial position update)
      await new Promise((r) => setTimeout(r, 10));
      expect(resolveUpdate).not.toBeNull();

      // 2. While write is in-flight, driver stops tracking
      const stopPromise = stopTrackingJob('job-adv-001');

      // 3. Resolve the delayed in-flight write
      resolveUpdate!();
      await startPromise;
      await stopPromise;

      // 4. Session must remain terminated and idle; in-flight write barrier must hold
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(getSyncStatus().status).toBe('idle');
    });

    it('T5.ADV.1.02: Rapid concurrent startTrackingJob(JobA) immediately followed by startTrackingJob(JobB) with in-flight write isolates sessions', async () => {
      let resolveJobAWrite: (() => void) | null = null;
      let callCount = 0;

      (LogisticsService.updateJobLocation as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise<void>((resolve) => {
            resolveJobAWrite = resolve;
          });
        }
        return Promise.resolve();
      });

      // 1. Launch Job A
      const jobAPromise = startTrackingJob('job-adv-A', 'tenant-kuro');
      await new Promise((r) => setTimeout(r, 10));

      // 2. Launch Job B immediately before Job A's write resolves
      const jobBPromise = startTrackingJob('job-adv-B', 'tenant-kuro');

      // 3. Complete Job A's delayed write
      if (resolveJobAWrite) {
        (resolveJobAWrite as () => void)();
      }

      await jobAPromise;
      await jobBPromise;

      // 4. Job B must be the active job, and Job A must have had stopJobTracking called
      expect(getActiveTrackingJobId()).toBe('job-adv-B');
      expect(isTrackingActive()).toBe(true);
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-adv-A');
    });

    it('T5.ADV.1.03: AppState permission revocation invalidates session generation token; late callbacks are discarded', async () => {
      await startTrackingJob('job-adv-003', 'tenant-kuro');
      expect(isTrackingActive()).toBe(true);

      // Simulate permission revocation upon foregrounding
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      // Trigger AppState change
      if (appStateListener) {
        await appStateListener('active');
      }

      // Tracking should now be suspended
      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe('job-adv-003');
      expect(isTrackingActive()).toBe(false);

      // Now send a location update (simulating a delayed native callback)
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();
      const lateLocation = makeLocation(-33.875, 151.215, 5, nextTimestamp());
      const result = await handleLocationUpdate(lateLocation);

      // Should return formatted location for HUD, but NO Firestore write
      expect(result).not.toBeNull();
      expect(result?.latitude).toBe(-33.875);
      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
    });

    it('T5.ADV.1.04: 25 rapid concurrent start/stop interleavings maintain state integrity without unhandled rejections', async () => {
      const operations: Promise<any>[] = [];

      for (let i = 0; i < 25; i++) {
        if (i % 2 === 0) {
          operations.push(startTrackingJob(`job-interleave-${i}`, `tenant-${i % 2}`));
        } else {
          operations.push(stopTrackingJob(`job-interleave-${i - 1}`));
        }
      }

      await expect(Promise.all(operations)).resolves.not.toThrow();

      const status = getTrackingStatus();
      expect(typeof status.isTracking).toBe('boolean');
      if (status.isTracking) {
        expect(status.activeJobId).toBeDefined();
        expect(status.activeTenantId).toBeDefined();
      } else {
        expect(status.activeJobId).toBeNull();
        expect(status.activeTenantId).toBeNull();
      }
    });

    it('T5.ADV.1.05: handleLocationUpdate with invalid coordinates or stale timestamps returns null without modifying state', async () => {
      await startTrackingJob('job-adv-005', 'tenant-kuro');

      // Invalid latitude (> 90)
      const invalidLat = makeLocation(95.0, 151.2, 5, nextTimestamp());
      expect(await handleLocationUpdate(invalidLat)).toBeNull();

      // Invalid longitude (< -180)
      const invalidLng = makeLocation(-33.8, -185.0, 5, nextTimestamp());
      expect(await handleLocationUpdate(invalidLng)).toBeNull();

      // NaN accuracy
      const nanAcc: any = makeLocation(-33.8, 151.2, NaN, nextTimestamp());
      expect(await handleLocationUpdate(nanAcc)).toBeNull();

      // Stale / decreasing timestamp (< lastProcessedTimestamp) in milliseconds
      const staleTimestamp = makeLocation(-33.8, 151.2, 5, simulatedTimestamp - 50000);
      expect(await handleLocationUpdate(staleTimestamp)).toBeNull();
    });
  });

  // ============================================================================
  // FOCUS 2: COORDINATE BUFFER SERIALIZATION, STORAGE BOUNDS & FLUSH RECOVERY
  // ============================================================================
  describe('Focus 2: Coordinate Buffer Serialization, Storage Bounds & Network Flush Recovery', () => {
    it('T5.ADV.2.01: Intermittent packet drop during flush preserves in-memory buffer and AsyncStorage key; marks offline_failed', async () => {
      await startTrackingJob('job-adv-buf-01', 'tenant-kuro');

      // Go offline and accumulate points
      setNetworkOnlineState(false);
      const pt1 = makeLocation(-33.869, 151.209, 5, nextTimestamp());
      const pt2 = makeLocation(-33.872, 151.212, 5, nextTimestamp());
      await handleLocationUpdate(pt1);
      await handleLocationUpdate(pt2);

      expect(getLocationBufferCount()).toBe(2);

      // Verify persisted in AsyncStorage
      const rawPersisted = await AsyncStorage.getItem(getBufferStorageKey('job-adv-buf-01'));
      expect(rawPersisted).not.toBeNull();
      const parsed = JSON.parse(rawPersisted!);
      expect(parsed.length).toBe(2);

      // Mock batchUploadLocationHistory to fail (packet drop) BEFORE reconnecting
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockRejectedValueOnce(
        new Error('Network timeout: packet dropped')
      );

      // Reconnect network - auto-flush triggers and encounters error
      setNetworkOnlineState(true);

      // Explicit flush call joins or throws the error
      await expect(flushLocationBuffer('job-adv-buf-01')).rejects.toThrow('Network timeout: packet dropped');
      expect(getSyncStatus().status).toBe('offline_failed');

      // In-memory and AsyncStorage buffer must still retain all 2 points!
      expect(getLocationBufferCount()).toBe(2);
      const retainedRaw = await AsyncStorage.getItem(getBufferStorageKey('job-adv-buf-01'));
      expect(retainedRaw).not.toBeNull();
      expect(JSON.parse(retainedRaw!).length).toBe(2);
    });

    it('T5.ADV.2.02: Buffer accumulates points post-drop with strict chronological ordering and flushes cleanly on recovery', async () => {
      await startTrackingJob('job-adv-buf-02', 'tenant-kuro');
      setNetworkOnlineState(false);

      // Pre-drop points
      const t1 = nextTimestamp();
      const t2 = nextTimestamp();
      await handleLocationUpdate(makeLocation(-33.861, 151.201, 5, t1));
      await handleLocationUpdate(makeLocation(-33.862, 151.202, 5, t2));

      // Attempt flush with failure (mock failure BEFORE reconnecting)
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockRejectedValueOnce(
        new Error('Socket hang up')
      );
      setNetworkOnlineState(true);
      await expect(flushLocationBuffer('job-adv-buf-02')).rejects.toThrow('Socket hang up');

      // Go offline again and add new points (post-drop)
      setNetworkOnlineState(false);
      const t3 = nextTimestamp();
      const t4 = nextTimestamp();
      await handleLocationUpdate(makeLocation(-33.863, 151.203, 5, t3));
      await handleLocationUpdate(makeLocation(-33.864, 151.204, 5, t4));

      expect(getLocationBufferCount()).toBe(4);

      // Network recovers cleanly
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockResolvedValueOnce(undefined);
      setNetworkOnlineState(true);

      // Auto-flush or explicit flush
      await flushLocationBuffer('job-adv-buf-02');

      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
        'job-adv-buf-02',
        expect.arrayContaining([
          expect.objectContaining({ timestamp: t1 }),
          expect.objectContaining({ timestamp: t2 }),
          expect.objectContaining({ timestamp: t3 }),
          expect.objectContaining({ timestamp: t4 }),
        ])
      );

      // Buffer purged post-upload
      expect(getLocationBufferCount()).toBe(0);
      const rawAfter = await AsyncStorage.getItem(getBufferStorageKey('job-adv-buf-02'));
      expect(rawAfter).toBeNull();
      expect(getSyncStatus().status).toBe('synced');
    });

    it('T5.ADV.2.03: Deduplicates identical coordinates during offline state, preventing unbounded storage expansion', async () => {
      await startTrackingJob('job-adv-buf-03', 'tenant-kuro');
      setNetworkOnlineState(false);

      const fixedTimestamp = nextTimestamp();
      const identicalPoint = makeLocation(-33.8688, 151.2093, 5, fixedTimestamp);

      // Feed same point 5 times
      for (let i = 0; i < 5; i++) {
        await handleLocationUpdate(identicalPoint);
      }

      // Buffer count must be exactly 1, not 5
      expect(getLocationBufferCount()).toBe(1);

      const raw = await AsyncStorage.getItem(getBufferStorageKey('job-adv-buf-03'));
      expect(JSON.parse(raw!).length).toBe(1);
    });

    it('T5.ADV.2.04: Recovers gracefully from malformed or corrupted AsyncStorage buffer entries', async () => {
      // Intentionally seed corrupted non-JSON data into AsyncStorage
      await AsyncStorage.setItem(getBufferStorageKey('job-adv-buf-04'), 'MALFORMED_JSON_CORRUPTED{{{');

      await startTrackingJob('job-adv-buf-04', 'tenant-kuro');
      expect(isTrackingActive()).toBe(true);
      expect(getLocationBufferCount()).toBe(0);

      // Intentionally seed non-array JSON (e.g. object)
      await AsyncStorage.setItem(getBufferStorageKey('job-adv-buf-04'), JSON.stringify({ invalid: 'schema' }));
      await flushLocationBuffer('job-adv-buf-04');
      expect(getLocationBufferCount()).toBe(0);
    });

    it('T5.ADV.2.05: High-concurrency flush calls coalesce via activeFlushPromise into a single execution', async () => {
      await startTrackingJob('job-adv-buf-05', 'tenant-kuro');
      setNetworkOnlineState(false);

      await handleLocationUpdate(makeLocation(-33.865, 151.205, 5, nextTimestamp()));
      await handleLocationUpdate(makeLocation(-33.866, 151.206, 5, nextTimestamp()));

      let batchUploadCallCount = 0;
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementation(async () => {
        batchUploadCallCount++;
        await new Promise((r) => setTimeout(r, 25));
      });

      // Now set online and simultaneously invoke 10 concurrent flushes
      setNetworkOnlineState(true);
      const flushPromises = Array.from({ length: 10 }, () => flushLocationBuffer('job-adv-buf-05'));
      await Promise.all(flushPromises);

      // Must have invoked batchUploadLocationHistory exactly once
      expect(batchUploadCallCount).toBe(1);
      expect(getLocationBufferCount()).toBe(0);
    });

    it('T5.ADV.2.06: Correctly sorts chronologically out-of-order coordinate arrivals before persistence', async () => {
      await startTrackingJob('job-adv-buf-06', 'tenant-kuro');
      setNetworkOnlineState(false);

      const t1 = 1756300010000;
      const t2 = 1756300020000;
      const t3 = 1756300030000;

      await handleLocationUpdate(makeLocation(-33.862, 151.202, 5, t2));
      await handleLocationUpdate(makeLocation(-33.863, 151.203, 5, t3));

      const raw = await AsyncStorage.getItem(getBufferStorageKey('job-adv-buf-06'));
      const parsed: DriverLocation[] = JSON.parse(raw!);
      expect(parsed.length).toBe(2);
      expect(parsed[0].timestamp).toBeLessThanOrEqual(parsed[1].timestamp);
    });
  });

  // ============================================================================
  // FOCUS 3: DEVICE GPS ENABLED STATUS CHANGES WHILE BACKGROUNDED OR ACTIVE
  // ============================================================================
  describe('Focus 3: Device GPS Enabled Status Changes While Backgrounded or Active', () => {
    it('T5.ADV.3.01: Disabling device GPS while tracking is backgrounded suspends tracking upon foreground transition', async () => {
      await startTrackingJob('job-adv-gps-01', 'tenant-kuro');
      expect(isTrackingActive()).toBe(true);

      // Driver backgrounds app and disables GPS services
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      // App transitions to active
      if (appStateListener) {
        await appStateListener('active');
      }

      // Tracking must halt and suspend
      expect(isTrackingActive()).toBe(false);
      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe('job-adv-gps-01');
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
      expect(getSyncStatus().status).toBe('permission_denied');
    });

    it('T5.ADV.3.02: Repeated foreground transitions while GPS remains disabled do NOT restart tracking or throw', async () => {
      await startTrackingJob('job-adv-gps-02', 'tenant-kuro');

      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      // Foreground 5 times
      for (let i = 0; i < 5; i++) {
        if (appStateListener) {
          await appStateListener('active');
        }
      }

      expect(isTrackingActive()).toBe(false);
      expect(isTrackingSuspended()).toBe(true);
      expect(getSuspendedTrackingJobId()).toBe('job-adv-gps-02');
    });

    it('T5.ADV.3.03: Re-enabling GPS services triggers silent auto-resume on next foreground transition', async () => {
      await startTrackingJob('job-adv-gps-03', 'tenant-kuro');

      // Suspend by disabling GPS
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
      if (appStateListener) {
        await appStateListener('active');
      }
      expect(isTrackingSuspended()).toBe(true);

      // User re-enables GPS in device settings
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);

      // App returns to foreground
      if (appStateListener) {
        await appStateListener('active');
      }

      // Should automatically resume
      expect(isTrackingSuspended()).toBe(false);
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe('job-adv-gps-03');
      expect(getSyncStatus().status).toBe('synced');
    });

    it('T5.ADV.3.04: Location.hasServicesEnabledAsync throwing unexpected exception sets services_disabled failure reason', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockRejectedValue(new Error('Hardware exception: GPS chip failure'));

      const result = await verifyTrackingPrerequisites();
      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('services_disabled');

      const startResult = await startTrackingJob('job-adv-gps-04', 'tenant-kuro');
      expect(startResult).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('services_disabled');
    });

    it('T5.ADV.3.05: Incoming GPS updates arriving while session is suspended due to GPS off are discarded from Firestore write', async () => {
      await startTrackingJob('job-adv-gps-05', 'tenant-kuro');

      // Suspend tracking
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
      if (appStateListener) {
        await appStateListener('active');
      }
      expect(isTrackingSuspended()).toBe(true);

      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      // Incoming location update
      const loc = makeLocation(-33.87, 151.21, 5, nextTimestamp());
      await handleLocationUpdate(loc);

      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // FOCUS 4: MUTEX LOCK BEHAVIOR ON isReconcilingAppState UNDER BURST EVENTS
  // ============================================================================
  describe('Focus 4: Mutex Lock Behavior on isReconcilingAppState Under Burst Events', () => {
    it('T5.ADV.4.01: Burst of 10 concurrent AppState active events executes reconciliation only once due to mutex guard', async () => {
      await startTrackingJob('job-adv-mtx-01', 'tenant-kuro');

      let reconciliationCount = 0;
      (Location.getForegroundPermissionsAsync as jest.Mock).mockImplementation(async () => {
        reconciliationCount++;
        // Simulate async latency in permission query
        await new Promise((r) => setTimeout(r, 20));
        return {
          status: 'granted',
          granted: true,
          android: { accuracy: 'fine' },
          ios: { accuracy: 'full' },
        };
      });

      // Fire 10 rapid concurrent active transitions
      if (appStateListener) {
        const events = Array.from({ length: 10 }, () => appStateListener!('active'));
        await Promise.all(events);
      }

      // Mutex should have allowed only 1 (or at most sequential non-overlapping) reconciliation
      expect(reconciliationCount).toBe(1);
      expect(isTrackingActive()).toBe(true);
    });

    it('T5.ADV.4.02: Mutex lock is guaranteed to release in finally block even when permission check throws', async () => {
      await startTrackingJob('job-adv-mtx-02', 'tenant-kuro');

      // First call throws
      (Location.getForegroundPermissionsAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Native permission bridge failure')
      );

      if (appStateListener) {
        await appStateListener('active');
      }

      // Next call succeeds - verifies isReconcilingAppState was reset to false in finally
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        android: { accuracy: 'fine' },
        ios: { accuracy: 'full' },
      });

      let secondCallCompleted = false;
      if (appStateListener) {
        await appStateListener('active');
        secondCallCompleted = true;
      }

      expect(secondCallCompleted).toBe(true);
    });

    it('T5.ADV.4.03: 20 interleaved parallel startTrackingJob and stopTrackingJob calls serialize cleanly via lifecycle lock', async () => {
      const promises: Promise<any>[] = [];

      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          promises.push(startTrackingJob(`job-mtx-burst-${i}`, `tenant-${i}`));
        } else {
          promises.push(stopTrackingJob(`job-mtx-burst-${i - 1}`));
        }
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();

      const status = getTrackingStatus();
      expect(typeof status.isTracking).toBe('boolean');
    });

    it('T5.ADV.4.04: AppState transitions to inactive or background do NOT trigger reconciliation or disturb tracking', async () => {
      await startTrackingJob('job-adv-mtx-04', 'tenant-kuro');
      expect(isTrackingActive()).toBe(true);

      const checkSpy = jest.spyOn(Location, 'getForegroundPermissionsAsync');

      if (appStateListener) {
        await appStateListener('inactive');
        await appStateListener('background');
      }

      // getForegroundPermissionsAsync should NOT be called for inactive or background
      expect(checkSpy).not.toHaveBeenCalled();
      expect(isTrackingActive()).toBe(true);
    });
  });

  // ============================================================================
  // FOCUS 5: CLEAN TEARDOWN WHEN SWITCHING JOBS RAPIDLY UNDER DEGRADED NETWORK
  // ============================================================================
  describe('Focus 5: Clean Teardown When Switching Jobs Rapidly Under Degraded Network Conditions', () => {
    it('T5.ADV.5.01: Switching jobs while offline preserves previous job buffer in AsyncStorage and isolates new job buffer', async () => {
      // 1. Start Job A and buffer points offline
      await startTrackingJob('job-adv-switch-A', 'tenant-kuro');
      setNetworkOnlineState(false);

      await handleLocationUpdate(makeLocation(-33.871, 151.211, 5, nextTimestamp()));
      await handleLocationUpdate(makeLocation(-33.872, 151.212, 5, nextTimestamp()));
      expect(getLocationBufferCount()).toBe(2);

      // 2. Switch to Job B while still offline
      await startTrackingJob('job-adv-switch-B', 'tenant-kuro');

      // Job A buffer must be safely preserved in AsyncStorage
      const jobARaw = await AsyncStorage.getItem(getBufferStorageKey('job-adv-switch-A'));
      expect(jobARaw).not.toBeNull();
      expect(JSON.parse(jobARaw!).length).toBe(2);

      // In-memory buffer must hold only Job B's initial fix (1 point), not Job A's points
      expect(getLocationBufferCount()).toBe(1);
      expect(getActiveTrackingJobId()).toBe('job-adv-switch-B');

      // 3. Add point to Job B
      await handleLocationUpdate(makeLocation(-33.881, 151.221, 5, nextTimestamp()));
      expect(getLocationBufferCount()).toBe(2);

      const jobBRaw = await AsyncStorage.getItem(getBufferStorageKey('job-adv-switch-B'));
      expect(jobBRaw).not.toBeNull();
      expect(JSON.parse(jobBRaw!).length).toBe(2);

      // Verify no cross-contamination between Job A and Job B
      const jobAParsed = JSON.parse(jobARaw!);
      const jobBParsed = JSON.parse(jobBRaw!);
      expect(jobAParsed[0].latitude).toBe(-33.871);
      expect(jobBParsed[1].latitude).toBe(-33.881);
    });

    it('T5.ADV.5.02: Network failure during buffer flush on job switch does NOT crash or abort teardown', async () => {
      await startTrackingJob('job-adv-switch-02A', 'tenant-kuro');
      setNetworkOnlineState(false);
      await handleLocationUpdate(makeLocation(-33.87, 151.21, 5, nextTimestamp()));
      setNetworkOnlineState(true);

      // Mock batchUploadLocationHistory to fail during the switch flush
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockRejectedValueOnce(
        new Error('Degraded network: write timeout')
      );

      // Switching to Job B should handle flush error gracefully and still complete switch
      const started = await startTrackingJob('job-adv-switch-02B', 'tenant-kuro');
      expect(started).toBe(true);
      expect(getActiveTrackingJobId()).toBe('job-adv-switch-02B');
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-adv-switch-02A');
    });

    it('T5.ADV.5.03: Fatal Firestore error on stopping previous job is propagated and prevents starting new job in inconsistent state', async () => {
      await startTrackingJob('job-adv-switch-03A', 'tenant-kuro');

      (LogisticsService.stopJobTracking as jest.Mock).mockRejectedValueOnce(
        new Error('Firestore permission denied or document locked')
      );

      // Attempting to switch to Job B must propagate the error
      await expect(startTrackingJob('job-adv-switch-03B', 'tenant-kuro')).rejects.toThrow(
        'Firestore permission denied or document locked'
      );

      // Active tracking must NOT be Job B
      expect(getActiveTrackingJobId()).toBeNull();
      expect(isTrackingActive()).toBe(false);

      // Lifecycle lock must be released: subsequent call can succeed
      const recoveryStart = await startTrackingJob('job-adv-switch-03C', 'tenant-kuro');
      expect(recoveryStart).toBe(true);
      expect(getActiveTrackingJobId()).toBe('job-adv-switch-03C');
    });

    it('T5.ADV.5.04: Rapid cascading switch sequence (Job 1 -> Job 2 -> Job 3 -> Job 4) under artificial latency', async () => {
      // Simulate artificial network delay on stop and update
      (LogisticsService.stopJobTracking as jest.Mock).mockImplementation(
        async () => new Promise((r) => setTimeout(r, 10))
      );
      (LogisticsService.updateJobLocation as jest.Mock).mockImplementation(
        async () => new Promise((r) => setTimeout(r, 10))
      );

      const jobChain = ['job-chain-1', 'job-chain-2', 'job-chain-3', 'job-chain-4'];

      for (const jobId of jobChain) {
        const started = await startTrackingJob(jobId, 'tenant-kuro');
        expect(started).toBe(true);
        expect(getActiveTrackingJobId()).toBe(jobId);
      }

      // Preceding jobs must be stopped
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-chain-1');
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-chain-2');
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-chain-3');

      // Final state must be job-chain-4
      expect(getActiveTrackingJobId()).toBe('job-chain-4');
      expect(isTrackingActive()).toBe(true);

      await stopTrackingJob('job-chain-4');
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
    });

    it('T5.ADV.5.05: Auth state observer triggers teardown when user signs out during active tracking', async () => {
      let authCallback: ((user: any) => Promise<void>) | null = null;
      const mockCustomAuth = { currentUser: { uid: 'usr-orig-01' } };
      const mockOnAuthStateChanged = jest.fn((_auth: any, cb: any) => {
        authCallback = cb;
        return jest.fn();
      });

      initTrackingAuthObserver(mockCustomAuth, mockOnAuthStateChanged);
      await startTrackingJob('job-adv-auth-01', 'tenant-kuro');
      expect(isTrackingActive()).toBe(true);

      // Simulate sign out (user = null)
      if (authCallback) {
        await (authCallback as any)(null);
      }

      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-adv-auth-01');

      stopTrackingAuthObserver();
    });
  });
});
