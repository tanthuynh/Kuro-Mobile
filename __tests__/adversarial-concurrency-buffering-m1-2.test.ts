/**
 * __tests__/adversarial-concurrency-buffering-m1-2.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGE SUITE: Challenger M1-2
 *
 * Stress-tests and challenges:
 * 1. Concurrency Protection (R5):
 *    - Concurrent job switching (Job A -> Job B, buffer flushing, stop propagation, getActiveTrackingJobId)
 *    - Stop failure error propagation and tagging (_isStopError)
 *    - Mutex resilience: rapid sequential switching (A -> B -> C -> D) and concurrent burst switching
 *    - In-flight write race conditions during job switches
 *    - Offline job switching with multi-job buffer isolation and preservation
 * 2. Offline Buffering & Auto-Retry (R4):
 *    - Network disconnection during active tracking and coordinate accumulation in memory + AsyncStorage
 *    - Automatic batch flush on reconnection via setNetworkOnlineState
 *    - Opportunistic flush during subsequent location updates (including stationary pings)
 *    - Clearing of 'offline_failed' sync status upon successful sync
 *    - Resilience against upload failures with zero data loss
 *    - Large batch stress test and coordinate deduplication
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as firestore from 'firebase/firestore';
import {
  LOCATION_TASK_NAME,
  getBufferStorageKey,
  startTrackingJob,
  stopTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  getActiveTenantId,
  getSyncStatus,
  handleLocationUpdate,
  setNetworkOnlineState,
  isOnline,
  getLocationBufferCount,
  isLocationBufferFlushing,
  clearLocationBuffer,
  flushLocationBuffer,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';
import * as LogisticsService from '@/services/logistics-service';
import { batchUploadLocationHistory } from '@/services/logistics-service';
import type { DriverLocation } from '@/types/logistics';

// Mock LogisticsService
jest.mock('@/services/logistics-service', () => {
  const actual = jest.requireActual('@/services/logistics-service');
  return {
    ...actual,
    updateJobLocation: jest.fn(actual.updateJobLocation),
    stopJobTracking: jest.fn(actual.stopJobTracking),
    batchUploadLocationHistory: jest.fn(actual.batchUploadLocationHistory),
  };
});

describe('Challenger M1-2: Concurrency & Buffering Adversarial Stress Test Suite', () => {
  const defaultTenantId = 'tenant-challenger-m1';

  beforeEach(async () => {
    jest.clearAllMocks();
    _resetTrackingStateForTesting();
    await AsyncStorage.clear();

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
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);

    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 10,
        accuracy: 5,
        altitudeAccuracy: null,
        heading: 0,
        speed: 0,
      },
      timestamp: 1756285200000,
    });
  });

  afterEach(async () => {
    await stopTrackingJob();
    await clearLocationBuffer();
    _resetTrackingStateForTesting();
    await AsyncStorage.clear();
    const actualLogistics = jest.requireActual('@/services/logistics-service');
    (LogisticsService.updateJobLocation as jest.Mock).mockImplementation(actualLogistics.updateJobLocation);
    (LogisticsService.stopJobTracking as jest.Mock).mockImplementation(actualLogistics.stopJobTracking);
    (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementation(actualLogistics.batchUploadLocationHistory);
  });

  // ============================================================================
  // CHALLENGE 1: CONCURRENT JOB SWITCHING STRESS (R5)
  // ============================================================================
  describe('Challenge 1: Concurrent Job Switching Stress (R5)', () => {
    it('switches from Job A to Job B, flushes Job A buffer, stops Job A in Firestore, isolates coordinates, and reflects Job B', async () => {
      const jobA = 'job-adv-switch-A';
      const jobB = 'job-adv-switch-B';

      // 1. Start Job A while offline so coordinates accumulate in buffer
      await startTrackingJob(jobA, defaultTenantId);
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe(jobA);

      setNetworkOnlineState(false);

      const pingA1: Location.LocationObject = {
        coords: { latitude: -33.8600, longitude: 151.2000, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: 1756285300000,
      };
      const pingA2: Location.LocationObject = {
        coords: { latitude: -33.8550, longitude: 151.2050, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 12, heading: 0 },
        timestamp: 1756285350000,
      };

      await handleLocationUpdate(pingA1);
      await handleLocationUpdate(pingA2);

      expect(getLocationBufferCount()).toBe(2);

      // 2. Reconnect network
      setNetworkOnlineState(true);

      // Spy on stopJobTracking and batchUploadLocationHistory
      const stopSpy = LogisticsService.stopJobTracking as jest.Mock;
      const uploadSpy = LogisticsService.batchUploadLocationHistory as jest.Mock;

      // 3. Start Job B while Job A is active
      const switchSuccess = await startTrackingJob(jobB, defaultTenantId);

      expect(switchSuccess).toBe(true);
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe(jobB);

      // Verify Job A buffer was flushed during switch
      expect(uploadSpy).toHaveBeenCalledWith(
        jobA,
        expect.arrayContaining([
          expect.objectContaining({ timestamp: 1756285300000 }),
          expect.objectContaining({ timestamp: 1756285350000 }),
        ])
      );

      // Verify Job A was cleanly stopped in Firestore
      expect(stopSpy).toHaveBeenCalledWith(jobA);

      // In-memory buffer must be reset/clean for Job B
      expect(getLocationBufferCount()).toBe(0);

      // 4. Send location update for Job B and verify it routes only to Job B
      const pingB: Location.LocationObject = {
        coords: { latitude: -33.8500, longitude: 151.2100, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 15, heading: 0 },
        timestamp: 1756285400000,
      };
      await handleLocationUpdate(pingB);

      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        jobB,
        expect.objectContaining({ latitude: -33.8500, jobId: jobB })
      );
    });

    it('propagates failure and _isStopError tag when stopping Job A throws an error, deactivating tracking safely', async () => {
      const jobA = 'job-adv-fail-A';
      const jobB = 'job-adv-fail-B';

      await startTrackingJob(jobA, defaultTenantId);
      expect(getActiveTrackingJobId()).toBe(jobA);

      // Simulate failure when stopping Job A in Firestore
      (LogisticsService.stopJobTracking as jest.Mock).mockRejectedValueOnce(
        new Error('UNAVAILABLE: Firestore stop operation failed')
      );

      // Switching to Job B must throw the error
      let caughtError: any = null;
      try {
        await startTrackingJob(jobB, defaultTenantId);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toContain('Firestore stop operation failed');
      expect(caughtError._isStopError).toBe(true);

      // State must be cleanly deactivated to avoid dangling tracking on either job
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(getSyncStatus().status).toBe('idle');

      // Crucial: Mutex lock must be released! A subsequent startTrackingJob must succeed
      (LogisticsService.stopJobTracking as jest.Mock).mockResolvedValue(undefined);
      const recoveryStart = await startTrackingJob(jobB, defaultTenantId);
      expect(recoveryStart).toBe(true);
      expect(getActiveTrackingJobId()).toBe(jobB);
    });

    it('survives rapid sequential job switching (A -> B -> C -> D) without unhandled rejections or mutex deadlocks', async () => {
      const jobs = ['job-seq-A', 'job-seq-B', 'job-seq-C', 'job-seq-D', 'job-seq-E'];

      for (let i = 0; i < jobs.length; i++) {
        const currentJob = jobs[i];
        const success = await startTrackingJob(currentJob, defaultTenantId);
        expect(success).toBe(true);
        expect(getActiveTrackingJobId()).toBe(currentJob);

        if (i > 0) {
          const prevJob = jobs[i - 1];
          expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith(prevJob);
        }
      }

      expect(getActiveTrackingJobId()).toBe('job-seq-E');
      expect(isTrackingActive()).toBe(true);

      await stopTrackingJob();
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
    });

    it('survives concurrent burst switching without mutex deadlocks or state corruption', async () => {
      const burstJobs = ['burst-job-1', 'burst-job-2', 'burst-job-3', 'burst-job-4'];

      // Fire all 4 startTrackingJob calls concurrently
      const results = await Promise.all(
        burstJobs.map((j) => startTrackingJob(j, defaultTenantId))
      );

      // All calls should resolve successfully due to lifecycle mutex queueing
      expect(results.every((r) => r === true)).toBe(true);
      expect(isTrackingActive()).toBe(true);

      // The active job must be one of the burst jobs (the last one processed by the mutex)
      const finalJob = getActiveTrackingJobId();
      expect(burstJobs).toContain(finalJob);

      // Only one job should be active
      expect(isTrackingActive()).toBe(true);

      // All previous jobs in the burst must have had stopJobTracking called
      const stoppedCalls = (LogisticsService.stopJobTracking as jest.Mock).mock.calls.map((c) => c[0]);
      for (const j of burstJobs) {
        if (j !== finalJob) {
          expect(stoppedCalls).toContain(j);
        }
      }
    });

    it('settles in-flight coordinate writes during job switch without race resurrection', async () => {
      const jobA = 'job-race-A';
      const jobB = 'job-race-B';

      await startTrackingJob(jobA, defaultTenantId);
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      let resolveInFlightWrite: () => void;
      const inFlightPromise = new Promise<void>((resolve) => {
        resolveInFlightWrite = resolve;
      });

      // Update for Job A starts and gets delayed
      (LogisticsService.updateJobLocation as jest.Mock).mockImplementationOnce(() => inFlightPromise);

      const pingA: Location.LocationObject = {
        coords: { latitude: -33.8600, longitude: 151.2000, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: 1756285500000,
      };

      const updatePromise = handleLocationUpdate(pingA);

      // While Job A's write is in flight across the wire, startTrackingJob for Job B is triggered
      const switchPromise = startTrackingJob(jobB, defaultTenantId);

      // Resolve the in-flight write for Job A
      resolveInFlightWrite!();

      await Promise.all([updatePromise, switchPromise]);

      // Job B must be the active tracking job, not overwritten or resurrected by Job A
      expect(getActiveTrackingJobId()).toBe(jobB);
      expect(isTrackingActive()).toBe(true);
    });

    it('isolates offline buffers between jobs: switching offline preserves Job A buffer in AsyncStorage and starts Job B clean', async () => {
      const jobA = 'job-offline-iso-A';
      const jobB = 'job-offline-iso-B';

      // 1. Start Job A offline and accumulate points
      await startTrackingJob(jobA, defaultTenantId);
      setNetworkOnlineState(false);

      const tsA1 = 1756286100000;
      const tsA2 = 1756286200000;
      await handleLocationUpdate({
        coords: { latitude: -33.8100, longitude: 151.2100, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: tsA1,
      });
      await handleLocationUpdate({
        coords: { latitude: -33.8150, longitude: 151.2150, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: tsA2,
      });

      expect(getLocationBufferCount()).toBe(2);

      // 2. Switch to Job B while still offline
      await startTrackingJob(jobB, defaultTenantId);
      expect(getActiveTrackingJobId()).toBe(jobB);

      // In-memory buffer must contain only Job B's initial position fix (0 coordinates from Job A)
      expect(getLocationBufferCount()).toBe(1);
      const storedBInitial = await AsyncStorage.getItem(getBufferStorageKey(jobB));
      expect(storedBInitial).not.toBeNull();
      const parsedBInit: DriverLocation[] = JSON.parse(storedBInitial!);
      expect(parsedBInit.every((p) => p.jobId === jobB)).toBe(true);
      expect(parsedBInit.some((p) => p.timestamp === tsA1 || p.timestamp === tsA2)).toBe(false);

      // But Job A's AsyncStorage key must be preserved!
      const storedA = await AsyncStorage.getItem(getBufferStorageKey(jobA));
      expect(storedA).not.toBeNull();
      const parsedA: DriverLocation[] = JSON.parse(storedA!);
      expect(parsedA).toHaveLength(2);
      expect(parsedA[0].timestamp).toBe(tsA1);

      // 3. Add movement point for Job B while offline
      const tsB = 1756286300000;
      await handleLocationUpdate({
        coords: { latitude: -33.8200, longitude: 151.2200, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: tsB,
      });

      expect(getLocationBufferCount()).toBe(2);
      const storedB = await AsyncStorage.getItem(getBufferStorageKey(jobB));
      expect(storedB).not.toBeNull();
      const parsedB = JSON.parse(storedB!);
      expect(parsedB).toHaveLength(2);
      expect(parsedB.some((p: DriverLocation) => p.timestamp === tsB)).toBe(true);
      expect(parsedB.every((p: DriverLocation) => p.jobId === jobB)).toBe(true);

      // 4. Reconnect network and flush Job B
      setNetworkOnlineState(true);
      await flushLocationBuffer(jobB);

      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
        jobB,
        expect.arrayContaining([expect.objectContaining({ timestamp: tsB })])
      );
      expect(LogisticsService.batchUploadLocationHistory).not.toHaveBeenCalledWith(
        jobB,
        expect.arrayContaining([expect.objectContaining({ timestamp: tsA1 })])
      );

      // Job A buffer in AsyncStorage is still safely retained until explicitly flushed
      const storedAAfter = await AsyncStorage.getItem(getBufferStorageKey(jobA));
      expect(storedAAfter).not.toBeNull();

      // 5. Explicitly flush Job A
      await flushLocationBuffer(jobA);
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
        jobA,
        expect.arrayContaining([expect.objectContaining({ timestamp: tsA1 })])
      );
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobA))).toBeNull();
    });
  });

  // ============================================================================
  // CHALLENGE 2: OFFLINE BUFFERING & AUTO-RETRY STRESS (R4)
  // ============================================================================
  describe('Challenge 2: Offline Buffering & Auto-Retry Stress (R4)', () => {
    it('buffers coordinates during network loss, updates AsyncStorage, and sets syncStatus to offline_failed', async () => {
      const jobId = 'job-buffer-stress-1';

      await startTrackingJob(jobId, defaultTenantId);
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      // Send 5 distinct location updates with movement >= 30m
      const baseLat = -33.8500;
      const baseLng = 151.2000;
      const baseTs = 1756287000000;

      for (let i = 0; i < 5; i++) {
        await handleLocationUpdate({
          coords: {
            latitude: baseLat + i * 0.001,
            longitude: baseLng + i * 0.001,
            altitude: 10,
            accuracy: 5,
            altitudeAccuracy: null,
            speed: 15,
            heading: 45,
          },
          timestamp: baseTs + i * 15000,
        });
      }

      // Memory buffer should hold all 5 points
      expect(getLocationBufferCount()).toBe(5);

      // AsyncStorage should hold all 5 points
      const rawStored = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      expect(rawStored).not.toBeNull();
      const storedPoints: DriverLocation[] = JSON.parse(rawStored!);
      expect(storedPoints).toHaveLength(5);
      expect(storedPoints[0].timestamp).toBe(baseTs);
      expect(storedPoints[4].timestamp).toBe(baseTs + 4 * 15000);

      // Sync status must show offline_failed
      expect(getSyncStatus().status).toBe('offline_failed');
      expect(getSyncStatus().lastError).toBeDefined();
    });

    it('auto-flushes buffer on setNetworkOnlineState(true), clears offline_failed, and reaches synced', async () => {
      const jobId = 'job-auto-flush-reconnect';

      await startTrackingJob(jobId, defaultTenantId);
      setNetworkOnlineState(false);

      // Add 3 offline points
      for (let i = 0; i < 3; i++) {
        await handleLocationUpdate({
          coords: {
            latitude: -33.8600 + i * 0.001,
            longitude: 151.2100 + i * 0.001,
            altitude: 10,
            accuracy: 5,
            altitudeAccuracy: null,
            speed: 10,
            heading: 0,
          },
          timestamp: 1756288000000 + i * 10000,
        });
      }

      expect(getLocationBufferCount()).toBe(3);
      expect(getSyncStatus().status).toBe('offline_failed');

      // Reconnect network: setNetworkOnlineState(true) triggers auto-flush
      setNetworkOnlineState(true);
      await flushLocationBuffer();

      // Buffer must be cleared
      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();

      // Sync status must be synced and lastError must be null
      const syncStatus = getSyncStatus();
      expect(syncStatus.status).toBe('synced');
      expect(syncStatus.lastError).toBeNull();
    });

    it('opportunistically flushes buffer during stationary location update after network write failure', async () => {
      const jobId = 'job-opp-flush';

      await startTrackingJob(jobId, defaultTenantId);
      // Clear initial write calls
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      // 1. Simulate Firestore write failure while online (e.g. transient 500 or timeout)
      (LogisticsService.updateJobLocation as jest.Mock).mockRejectedValueOnce(
        new Error('UNAVAILABLE: Firestore connection reset')
      );

      await handleLocationUpdate({
        coords: { latitude: -33.8600, longitude: 151.2000, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: 1756289000000,
      });

      // Point must be buffered and status must be offline_failed
      expect(getLocationBufferCount()).toBe(1);
      expect(getSyncStatus().status).toBe('offline_failed');

      // 2. Next ping is a stationary ping (< 30m displacement) arriving while online
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockResolvedValueOnce(undefined);

      await handleLocationUpdate({
        coords: { latitude: -33.86001, longitude: 151.20001, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: 1756289010000,
      });

      // Opportunistic stationary flush must have cleared the buffer and updated status to synced
      expect(getLocationBufferCount()).toBe(0);
      expect(getSyncStatus().status).toBe('synced');
      expect(getSyncStatus().lastError).toBeNull();
    });

    it('handles batch upload failure during flush without data loss, then succeeds on next retry', async () => {
      const jobId = 'job-retry-loss-prevention';

      await startTrackingJob(jobId, defaultTenantId);
      setNetworkOnlineState(false);

      const ts1 = 1756290000000;
      const ts2 = 1756290020000;

      await handleLocationUpdate({
        coords: { latitude: -33.8700, longitude: 151.2100, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: ts1,
      });
      await handleLocationUpdate({
        coords: { latitude: -33.8750, longitude: 151.2150, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: ts2,
      });

      expect(getLocationBufferCount()).toBe(2);

      // Configure batchUpload to fail BEFORE setting network online
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockRejectedValueOnce(
        new Error('UNAVAILABLE: 503 Service Unavailable')
      );

      // Reconnect network: auto-flush will reject with 503 Service Unavailable
      setNetworkOnlineState(true);

      // Await pending flush
      try {
        await flushLocationBuffer();
      } catch (err: any) {
        expect(err.message).toContain('503 Service Unavailable');
      }

      // CRITICAL: Points must NOT be lost!
      expect(getLocationBufferCount()).toBe(2);
      const stored = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      expect(stored).not.toBeNull();
      const parsed: DriverLocation[] = JSON.parse(stored!);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].timestamp).toBe(ts1);
      expect(parsed[1].timestamp).toBe(ts2);
      expect(getSyncStatus().status).toBe('offline_failed');

      // Second retry succeeds
      const mockBatch = {
        set: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        commit: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(firestore, 'writeBatch').mockReturnValue(mockBatch as any);
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockResolvedValueOnce(undefined);

      await flushLocationBuffer();

      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();
      expect(getSyncStatus().status).toBe('synced');
      expect(getSyncStatus().lastError).toBeNull();
    });

    it('deduplicates identical coordinates in buffer to prevent unbounded memory growth', async () => {
      const jobId = 'job-dedup-test';

      await startTrackingJob(jobId, defaultTenantId);
      setNetworkOnlineState(false);

      const fixedLocation = {
        coords: { latitude: -33.8600, longitude: 151.2000, altitude: 10, accuracy: 5, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: 1756291000000,
      };

      // Send the same location ping 3 times
      await handleLocationUpdate(fixedLocation, false, true);
      await handleLocationUpdate(fixedLocation, false, true);
      await handleLocationUpdate(fixedLocation, false, true);

      // Should only buffer 1 unique point
      expect(getLocationBufferCount()).toBe(1);
    });

    it('stress-tests large offline buffer (50 points) with correct sorting and chronological batch upload', async () => {
      const jobId = 'job-large-buffer-stress';

      await startTrackingJob(jobId, defaultTenantId);
      setNetworkOnlineState(false);

      const count = 50;
      const baseTs = 1756292000000;

      for (let i = 0; i < count; i++) {
        await handleLocationUpdate({
          coords: {
            latitude: -33.8500 + i * 0.0005,
            longitude: 151.2000 + i * 0.0005,
            altitude: 10,
            accuracy: 5,
            altitudeAccuracy: null,
            speed: 15,
            heading: 90,
          },
          timestamp: baseTs + i * 2000,
        });
      }

      expect(getLocationBufferCount()).toBe(count);

      const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      const parsed: DriverLocation[] = JSON.parse(raw!);
      expect(parsed).toHaveLength(count);

      // Verify strict monotonic timestamp order
      for (let i = 1; i < count; i++) {
        expect(parsed[i].timestamp).toBeGreaterThan(parsed[i - 1].timestamp);
      }

      // Reconnect and flush
      setNetworkOnlineState(true);
      await flushLocationBuffer();

      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();
      expect(getSyncStatus().status).toBe('synced');
    });
  });
});
