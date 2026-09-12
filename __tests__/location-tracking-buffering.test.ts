/**
 * __tests__/location-tracking-buffering.test.ts
 *
 * Comprehensive Test Suite for Milestone 2:
 * Background GPS Telemetry Buffering & Reconnection Batch Upload.
 *
 * Verifies:
 * 1. Offline coordinate buffering in-memory and mirrored to AsyncStorage (@kuro_location_buffer:).
 * 2. Unaltered preservation of original hardware GPS timestamps across all buffered points.
 * 3. Reconnection batch upload to Firestore location_history via writeBatch with parent doc update.
 * 4. TaskManager.defineTask multi-location batch handling retaining all valid intermediate points.
 * 5. Concurrency, network toggling stress, and clean lifecycle teardown.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as firestore from 'firebase/firestore';
import {
  LOCATION_TASK_NAME,
  LOCATION_BUFFER_STORAGE_KEY_PREFIX,
  getBufferStorageKey,
  startTrackingJob,
  stopTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  getLastKnownLocation,
  getSyncStatus,
  addSyncStatusListener,
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

// Mock LogisticsService with wrapped actual implementations
jest.mock('@/services/logistics-service', () => {
  const actual = jest.requireActual('@/services/logistics-service');
  return {
    ...actual,
    updateJobLocation: jest.fn(actual.updateJobLocation),
    stopJobTracking: jest.fn(actual.stopJobTracking),
    batchUploadLocationHistory: jest.fn(actual.batchUploadLocationHistory),
  };
});

describe('Milestone 2: Background GPS Telemetry Buffering & Batch Flush Suite', () => {
  const jobId = 'job-telemetry-buffer-001';
  const tenantId = 'tenant-test-telemetry';

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
    (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementation(actualLogistics.batchUploadLocationHistory);
  });

  // ==========================================================================
  // SECTION 1: OFFLINE COORDINATE BUFFERING & ASYNCSTORAGE PERSISTENCE
  // ==========================================================================
  describe('1. Offline Coordinate Buffering & Persistence', () => {
    it('buffers coordinates when network is offline (isOnline === false)', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      const ping1: Location.LocationObject = {
        coords: {
          latitude: -33.8600,
          longitude: 151.2000,
          altitude: 12,
          accuracy: 6,
          altitudeAccuracy: null,
          heading: 90,
          speed: 15,
        },
        timestamp: 1756285300000,
      };

      const ping2: Location.LocationObject = {
        coords: {
          latitude: -33.8550,
          longitude: 151.2050,
          altitude: 14,
          accuracy: 5,
          altitudeAccuracy: null,
          heading: 90,
          speed: 18,
        },
        timestamp: 1756285350000,
      };

      const res1 = await handleLocationUpdate(ping1);
      const res2 = await handleLocationUpdate(ping2);

      expect(res1).not.toBeNull();
      expect(res2).not.toBeNull();

      // Buffer in memory must reflect the 2 offline pings
      expect(getLocationBufferCount()).toBe(2);

      // Verify AsyncStorage persistence under @kuro_location_buffer:
      const rawStored = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      expect(rawStored).not.toBeNull();
      const parsed: DriverLocation[] = JSON.parse(rawStored!);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].latitude).toBe(-33.8600);
      expect(parsed[1].latitude).toBe(-33.8550);
      expect(parsed[0].jobId).toBe(jobId);

      // Sync status reflects offline failure
      expect(getSyncStatus().status).toBe('offline_failed');
    });

    it('buffers coordinates when updateJobLocation throws a network disconnection error while online', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(true);

      // Simulate sudden network failure in Firestore write
      (LogisticsService.updateJobLocation as jest.Mock).mockRejectedValueOnce(
        new Error('UNAVAILABLE: network transport reset by peer')
      );

      const ping: Location.LocationObject = {
        coords: {
          latitude: -33.8400,
          longitude: 151.2100,
          altitude: 20,
          accuracy: 4,
          altitudeAccuracy: null,
          heading: 45,
          speed: 22,
        },
        timestamp: 1756285400000,
      };

      await handleLocationUpdate(ping);

      // Failed ping must be buffered immediately
      expect(getLocationBufferCount()).toBe(1);

      const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed[0].latitude).toBe(-33.8400);
      expect(getSyncStatus().status).toBe('offline_failed');
      expect(getSyncStatus().lastError).toContain('network transport reset');
    });

    it('rehydrates in-memory buffer from AsyncStorage when tracking initializes', async () => {
      // Pre-seed AsyncStorage with an existing buffer from a previous session
      const preSeeded: DriverLocation[] = [
        {
          latitude: -33.8100,
          longitude: 151.2200,
          altitude: 10,
          accuracy: 5,
          heading: 0,
          speed: 10,
          timestamp: 1756285100000,
          jobId,
        },
      ];
      await AsyncStorage.setItem(getBufferStorageKey(jobId), JSON.stringify(preSeeded));

      // Start tracking while offline so it does not auto-flush
      setNetworkOnlineState(false);
      await startTrackingJob(jobId, tenantId);

      // Must have loaded the pre-seeded point into in-memory queue (+ initial position fix)
      expect(getLocationBufferCount()).toBeGreaterThanOrEqual(1);
      const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      const parsed = JSON.parse(raw!);
      expect(parsed.some((p: DriverLocation) => p.latitude === -33.8100)).toBe(true);
    });

    it('clearLocationBuffer purges both in-memory queue and AsyncStorage record', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);

      await handleLocationUpdate({
        coords: { latitude: -33.8200, longitude: 151.2100, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: 1756285500000,
      });

      expect(getLocationBufferCount()).toBe(1);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).not.toBeNull();

      await clearLocationBuffer();

      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 2: HARDWARE GPS TIMESTAMPS PRESERVATION
  // ==========================================================================
  describe('2. Hardware GPS Timestamps Preservation', () => {
    it('preserves exact original hardware epoch millisecond timestamp on every buffered coordinate', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);

      const exactHardwareTimestamp1 = 1756285600123;
      const exactHardwareTimestamp2 = 1756285650456;

      await handleLocationUpdate({
        coords: { latitude: -33.8300, longitude: 151.2100, altitude: 10, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: exactHardwareTimestamp1,
      });

      await handleLocationUpdate({
        coords: { latitude: -33.8250, longitude: 151.2150, altitude: 12, accuracy: 5, altitudeAccuracy: null, speed: 12, heading: 0 },
        timestamp: exactHardwareTimestamp2,
      });

      const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      expect(raw).not.toBeNull();
      const parsed: DriverLocation[] = JSON.parse(raw!);

      expect(parsed[0].timestamp).toBe(exactHardwareTimestamp1);
      expect(parsed[1].timestamp).toBe(exactHardwareTimestamp2);
    });

    it('strictly drops backwards or corrupt timestamps to prevent clock skew corruption in buffer', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);

      const validTs = 1756285700000;
      await handleLocationUpdate({
        coords: { latitude: -33.8200, longitude: 151.2000, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: validTs,
      });

      expect(getLocationBufferCount()).toBe(1);

      // Stale / older timestamp: must be discarded
      const staleTs = validTs - 10000;
      const resStale = await handleLocationUpdate({
        coords: { latitude: -33.8150, longitude: 151.2050, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: staleTs,
      });

      expect(resStale).toBeNull();
      expect(getLocationBufferCount()).toBe(1);
    });
  });

  // ==========================================================================
  // SECTION 3: RECONNECTION BATCH UPLOAD VIA WRITEBATCH
  // ==========================================================================
  describe('3. Reconnection Batch Upload via writeBatch', () => {
    it('batch-uploads accumulated buffered points to location_history on reconnection', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);

      const p1: Location.LocationObject = {
        coords: { latitude: -33.8500, longitude: 151.2000, altitude: 5, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: 1756286000000,
      };
      const p2: Location.LocationObject = {
        coords: { latitude: -33.8450, longitude: 151.2050, altitude: 6, accuracy: 5, altitudeAccuracy: null, speed: 12, heading: 0 },
        timestamp: 1756286050000,
      };
      const p3: Location.LocationObject = {
        coords: { latitude: -33.8400, longitude: 151.2100, altitude: 7, accuracy: 5, altitudeAccuracy: null, speed: 14, heading: 0 },
        timestamp: 1756286100000,
      };

      await handleLocationUpdate(p1);
      await handleLocationUpdate(p2);
      await handleLocationUpdate(p3);

      expect(getLocationBufferCount()).toBe(3);

      // Spy on writeBatch
      const writeBatchSpy = jest.spyOn(firestore, 'writeBatch');

      // Reconnect network: triggers flushLocationBuffer automatically
      setNetworkOnlineState(true);
      await flushLocationBuffer();

      expect(writeBatchSpy).toHaveBeenCalled();
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
        jobId,
        expect.arrayContaining([
          expect.objectContaining({ timestamp: 1756286000000 }),
          expect.objectContaining({ timestamp: 1756286050000 }),
          expect.objectContaining({ timestamp: 1756286100000 }),
        ])
      );

      // Buffer must be cleared from memory and AsyncStorage
      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();
      expect(getSyncStatus().status).toBe('synced');
    });

    it('batchUploadLocationHistory chunks operations into batches of <= 400 operations to adhere to Firestore limits', async () => {
      // Create 450 location points
      const largeBatch: DriverLocation[] = [];
      const baseTs = 1756287000000;
      for (let i = 0; i < 450; i++) {
        largeBatch.push({
          latitude: -33.8500 + i * 0.0001,
          longitude: 151.2000 + i * 0.0001,
          altitude: 10,
          accuracy: 5,
          speed: 10,
          heading: 0,
          timestamp: baseTs + i * 1000,
          jobId,
        });
      }

      const mockBatchInstance = {
        set: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        commit: jest.fn().mockResolvedValue(undefined),
      };
      (firestore.writeBatch as jest.Mock).mockReturnValue(mockBatchInstance);

      await batchUploadLocationHistory(jobId, largeBatch);

      // 450 points chunked into 400 and 50: writeBatch called twice
      expect(firestore.writeBatch).toHaveBeenCalledTimes(2);
      expect(mockBatchInstance.commit).toHaveBeenCalledTimes(2);

      // Chunk 1: 400 set calls
      // Chunk 2: 50 set calls + 1 update call to parent doc
      expect(mockBatchInstance.set).toHaveBeenCalledTimes(450);
      expect(mockBatchInstance.update).toHaveBeenCalledTimes(1);

      // Parent document updated with newest coordinate (point 449)
      expect(mockBatchInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        expect.objectContaining({
          currentLocation: expect.objectContaining({
            timestamp: baseTs + 449 * 1000,
          }),
        })
      );
    });

    it('gracefully executes sequential fallback when writeBatch throws an unexpected error', async () => {
      const locations: DriverLocation[] = [
        {
          latitude: -33.8500,
          longitude: 151.2000,
          altitude: 10,
          accuracy: 5,
          speed: 10,
          heading: 0,
          timestamp: 1756288000000,
          jobId,
        },
      ];

      (firestore.writeBatch as jest.Mock).mockImplementationOnce(() => {
        throw new Error('INTERNAL: writeBatch unsupported in test environment');
      });

      await expect(batchUploadLocationHistory(jobId, locations)).resolves.not.toThrow();

      // Verified fallback calls setDoc and updateDoc
      expect(firestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          timestamp: 1756288000000,
          buffered: true,
        })
      );
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentLocation: expect.objectContaining({
            timestamp: 1756288000000,
          }),
        })
      );
    });

    it('retains buffered points in memory and AsyncStorage when batch upload fails during reconnection', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);

      const p1: Location.LocationObject = {
        coords: { latitude: -33.8500, longitude: 151.2000, altitude: 5, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: 1756286200000,
      };
      const p2: Location.LocationObject = {
        coords: { latitude: -33.8450, longitude: 151.2050, altitude: 6, accuracy: 5, altitudeAccuracy: null, speed: 12, heading: 0 },
        timestamp: 1756286250000,
      };

      await handleLocationUpdate(p1);
      await handleLocationUpdate(p2);

      expect(getLocationBufferCount()).toBe(2);

      // Force batch upload to fail (e.g. network disconnect or Firestore write failure)
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockRejectedValueOnce(
        new Error('UNAVAILABLE: Network transport disconnected during upload')
      );

      // Reconnect network
      setNetworkOnlineState(true);

      // Attempt flush - should reject because batchUploadLocationHistory failed
      await expect(flushLocationBuffer()).rejects.toThrow('UNAVAILABLE: Network transport disconnected during upload');

      // CRITICAL: Points must NOT be sliced or cleared!
      expect(getLocationBufferCount()).toBe(2);

      const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      expect(raw).not.toBeNull();
      const parsed: DriverLocation[] = JSON.parse(raw!);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].timestamp).toBe(1756286200000);
      expect(parsed[1].timestamp).toBe(1756286250000);
      expect(getSyncStatus().status).toBe('offline_failed');

      // Restore actual batchUploadLocationHistory implementation
      const actualLogistics = jest.requireActual('@/services/logistics-service');
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementation(actualLogistics.batchUploadLocationHistory);

      // Mock writeBatch to succeed
      const mockBatch = {
        set: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        commit: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(firestore, 'writeBatch').mockReturnValue(mockBatch as any);

      // Subsequent flush succeeds
      await flushLocationBuffer();
      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();
      expect(getSyncStatus().status).toBe('synced');
    });

    it('coalesces concurrent flushLocationBuffer invocations to avoid redundant uploads', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);

      await handleLocationUpdate({
        coords: { latitude: -33.8500, longitude: 151.2000, altitude: 5, accuracy: 5, altitudeAccuracy: null, speed: 10, heading: 0 },
        timestamp: 1756286300000,
      });
      await handleLocationUpdate({
        coords: { latitude: -33.8450, longitude: 151.2050, altitude: 6, accuracy: 5, altitudeAccuracy: null, speed: 12, heading: 0 },
        timestamp: 1756286350000,
      });

      expect(getLocationBufferCount()).toBe(2);

      // Delay batch upload to simulate realistic in-flight network transit
      let uploadCallCount = 0;
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementation(async () => {
        uploadCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      setNetworkOnlineState(true);

      // Fire 4 concurrent flush calls simultaneously
      const results = await Promise.all([
        flushLocationBuffer(jobId),
        flushLocationBuffer(jobId),
        flushLocationBuffer(jobId),
        flushLocationBuffer(jobId),
      ]);

      // All resolved cleanly
      expect(results).toHaveLength(4);

      // Must coalesce into a single execution of batchUploadLocationHistory
      expect(uploadCallCount).toBe(1);
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledTimes(1);

      // Buffer emptied and status synced
      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();
      expect(getSyncStatus().status).toBe('synced');

      const actualLogistics = jest.requireActual('@/services/logistics-service');
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementation(actualLogistics.batchUploadLocationHistory);
    });
  });

  // ==========================================================================
  // SECTION 4: TASKMANAGER BATCH HANDLING WITH INTERMEDIATE POINTS
  // ==========================================================================
  describe('4. TaskManager.defineTask Multi-Location Batch Handling', () => {
    it('buffers all valid intermediate points in a multi-location batch when offline without dropping them', async () => {
      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);
      expect(executor).toBeDefined();

      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);
      await clearLocationBuffer();

      // OS delivers a batch of 4 locations recorded while driving through a dead zone
      const batchLocations = [
        {
          coords: { latitude: -33.8800, longitude: 151.2000, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 20, heading: 0 },
          timestamp: 1756289000000,
        },
        {
          coords: { latitude: -33.8810, longitude: 151.2010, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 20, heading: 0 },
          timestamp: 1756289020000,
        },
        {
          coords: { latitude: -33.8820, longitude: 151.2020, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 20, heading: 0 },
          timestamp: 1756289040000,
        },
        {
          coords: { latitude: -33.8830, longitude: 151.2030, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 20, heading: 0 },
          timestamp: 1756289060000,
        },
      ];

      await executor({ data: { locations: batchLocations } });

      // All 4 intermediate points must be buffered!
      expect(getLocationBufferCount()).toBe(4);

      const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(4);
      expect(parsed[0].timestamp).toBe(1756289000000);
      expect(parsed[3].timestamp).toBe(1756289060000);
    });

    it('filters out inaccurate (>50m) or corrupted locations in TaskManager batch while retaining valid points', async () => {
      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);
      await clearLocationBuffer();

      const mixedBatch = [
        {
          coords: { latitude: -33.8800, longitude: 151.2000, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 20, heading: 0 },
          timestamp: 1756289100000,
        },
        {
          // Inaccurate ping (accuracy 95m > 50m limit)
          coords: { latitude: -33.8810, longitude: 151.2010, altitude: 0, accuracy: 95, altitudeAccuracy: null, speed: 20, heading: 0 },
          timestamp: 1756289120000,
        },
        {
          coords: { latitude: -33.8820, longitude: 151.2020, altitude: 0, accuracy: 6, altitudeAccuracy: null, speed: 20, heading: 0 },
          timestamp: 1756289140000,
        },
      ];

      await executor({ data: { locations: mixedBatch } });

      // Only the 2 valid pings should be buffered; inaccurate ping rejected
      expect(getLocationBufferCount()).toBe(2);
      const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].timestamp).toBe(1756289100000);
      expect(parsed[1].timestamp).toBe(1756289140000);
    });
  });

  // ==========================================================================
  // SECTION 5: RAPID NETWORK TOGGLING & LIFECYCLE CONCURRENCY STRESS
  // ==========================================================================
  describe('5. Rapid Network Toggling & Lifecycle Concurrency Stress', () => {
    it('survives rapid online/offline state toggling without duplicate flushes or corrupted buffer', async () => {
      await startTrackingJob(jobId, tenantId);

      // Rapidly toggle network state 10 times while injecting locations
      for (let i = 0; i < 10; i++) {
        const isOfflineCycle = i % 2 === 0;
        setNetworkOnlineState(!isOfflineCycle);

        await handleLocationUpdate({
          coords: {
            latitude: -33.8500 + i * 0.001,
            longitude: 151.2000 + i * 0.001,
            altitude: 10,
            accuracy: 5,
            altitudeAccuracy: null,
            speed: 15,
            heading: 0,
          },
          timestamp: 1756290000000 + i * 10000,
        });
      }

      // Reconnect permanently and flush
      setNetworkOnlineState(true);
      await flushLocationBuffer();

      // Final buffer must be cleanly emptied
      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();
      expect(isLocationBufferFlushing()).toBe(false);
    });

    it('stopTrackingJob while offline cleanly preserves the persisted buffer in AsyncStorage', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);

      await handleLocationUpdate({
        coords: { latitude: -33.8600, longitude: 151.2100, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: 1756291000000,
      });

      expect(getLocationBufferCount()).toBe(1);

      // Stop tracking while offline
      await stopTrackingJob(jobId);

      expect(isTrackingActive()).toBe(false);

      // Persisted buffer must remain intact in AsyncStorage for future recovery!
      const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].timestamp).toBe(1756291000000);
    });

    it('stopTrackingJob while online flushes remaining buffer before teardown', async () => {
      await startTrackingJob(jobId, tenantId);
      setNetworkOnlineState(false);

      // Accumulate buffer offline
      await handleLocationUpdate({
        coords: { latitude: -33.8700, longitude: 151.2200, altitude: 0, accuracy: 5, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: 1756292000000,
      });
      expect(getLocationBufferCount()).toBe(1);

      // Set online and stop tracking immediately
      setNetworkOnlineState(true);
      await stopTrackingJob(jobId);

      // Buffer must have flushed during stopTrackingJob
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalled();
      expect(getLocationBufferCount()).toBe(0);
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobId))).toBeNull();
    });

    it('maintains strict multi-job buffer isolation when stopping Job A offline and starting Job B', async () => {
      const jobA = 'job-isolation-A-001';
      const jobB = 'job-isolation-B-002';

      // 1. Start tracking Job A while offline
      await startTrackingJob(jobA, tenantId);
      setNetworkOnlineState(false);
      await clearLocationBuffer();

      const jobAPingTs = 1756293000000;
      await handleLocationUpdate({
        coords: { latitude: -33.8111, longitude: 151.2111, altitude: 5, accuracy: 5, altitudeAccuracy: null, speed: 15, heading: 45 },
        timestamp: jobAPingTs,
      });

      expect(getLocationBufferCount()).toBe(1);
      const rawA = await AsyncStorage.getItem(getBufferStorageKey(jobA));
      expect(rawA).not.toBeNull();
      expect(JSON.parse(rawA!)[0].timestamp).toBe(jobAPingTs);

      // 2. Driver finishes / stops Job A while still offline
      await stopTrackingJob(jobA);
      expect(isTrackingActive()).toBe(false);

      // In-memory buffer MUST be cleared so Job A coordinates do not bleed into Job B!
      expect(getLocationBufferCount()).toBe(0);

      // But Job A's persisted buffer in AsyncStorage MUST be intact for later sync
      const rawAPreserved = await AsyncStorage.getItem(getBufferStorageKey(jobA));
      expect(rawAPreserved).not.toBeNull();
      expect(JSON.parse(rawAPreserved!)[0].timestamp).toBe(jobAPingTs);

      // 3. Driver starts tracking Job B while still offline
      await startTrackingJob(jobB, tenantId);
      expect(getActiveTrackingJobId()).toBe(jobB);

      // In-memory buffer for Job B must NOT contain Job A's point
      const rawBInitial = await AsyncStorage.getItem(getBufferStorageKey(jobB));
      expect(rawBInitial).not.toBeNull();
      const parsedBInitial: DriverLocation[] = JSON.parse(rawBInitial!);
      expect(parsedBInitial.some((p: DriverLocation) => p.timestamp === jobAPingTs)).toBe(false);
      expect(parsedBInitial.every((p: DriverLocation) => p.jobId === jobB)).toBe(true);

      // Emit ping for Job B
      const jobBPingTs = 1756294000000;
      await handleLocationUpdate({
        coords: { latitude: -33.8222, longitude: 151.2222, altitude: 8, accuracy: 5, altitudeAccuracy: null, speed: 20, heading: 90 },
        timestamp: jobBPingTs,
      });

      const rawB = await AsyncStorage.getItem(getBufferStorageKey(jobB));
      expect(rawB).not.toBeNull();
      const parsedB = JSON.parse(rawB!);
      expect(parsedB.some((p: DriverLocation) => p.timestamp === jobBPingTs)).toBe(true);
      expect(parsedB.some((p: DriverLocation) => p.timestamp === jobAPingTs)).toBe(false);

      // 4. Reconnect to network and flush Job B
      setNetworkOnlineState(true);
      await flushLocationBuffer(jobB);

      // Verify Job B was uploaded with only Job B's coordinates
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
        jobB,
        expect.arrayContaining([
          expect.objectContaining({ timestamp: jobBPingTs, latitude: -33.8222 }),
        ])
      );
      // Ensure Job A's coordinates were NOT passed to Job B's upload
      expect(LogisticsService.batchUploadLocationHistory).not.toHaveBeenCalledWith(
        jobB,
        expect.arrayContaining([
          expect.objectContaining({ timestamp: jobAPingTs }),
        ])
      );

      // Job B buffer is now cleared
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobB))).toBeNull();

      // Job A buffer in AsyncStorage is STILL preserved for when Job A is flushed
      const rawAStillPreserved = await AsyncStorage.getItem(getBufferStorageKey(jobA));
      expect(rawAStillPreserved).not.toBeNull();

      // 5. Explicitly flush Job A
      await flushLocationBuffer(jobA);
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledWith(
        jobA,
        expect.arrayContaining([
          expect.objectContaining({ timestamp: jobAPingTs, latitude: -33.8111 }),
        ])
      );
      expect(await AsyncStorage.getItem(getBufferStorageKey(jobA))).toBeNull();
    });
  });
});
