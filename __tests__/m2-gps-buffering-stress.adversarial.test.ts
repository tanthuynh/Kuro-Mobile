/**
 * __tests__/m2-gps-buffering-stress.adversarial.test.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS HARNESS — Milestone 2 (M2)
 * High-Frequency Offline GPS Telemetry Buffering, Multi-Chunk Batch Upload (>400),
 * and Rapid Online/Offline Network Toggling Concurrency.
 *
 * Areas Tested:
 * 1. High-frequency location pings during offline periods (100 to 500 pings, sequential & concurrent,
 *    corrupt payload resilience, GPS hardware timestamp immutability, AsyncStorage mirroring).
 * 2. Large batches (>400 coordinates) requiring multiple chunks in batchUploadLocationHistory
 *    (400, 401, 800, 850, 1200 items, <=401 ops per batch, parent update on final chunk only, sequential fallback).
 * 3. Rapid online/offline network state toggling during active flush operations
 *    (flush coalescence via activeFlushPromise, zero lost or duplicated coordinates, interleaved new arrivals).
 * 4. Comprehensive end-to-end cellular dead-zone (tunnel) lifecycle simulation.
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
import type { DriverLocation } from '@/types/logistics';

// Wrap LogisticsService with spied actual implementations
jest.mock('@/services/logistics-service', () => {
  const actual = jest.requireActual('@/services/logistics-service');
  return {
    ...actual,
    updateJobLocation: jest.fn(actual.updateJobLocation),
    stopJobTracking: jest.fn(actual.stopJobTracking),
    batchUploadLocationHistory: jest.fn(actual.batchUploadLocationHistory),
  };
});

describe('M2 Empirical Stress Test: GPS Buffering, Large Multi-Chunk Batches & Network Oscillation', () => {
  const testJobId = 'job-stress-adversarial-001';
  const testTenantId = 'tenant-stress-adversarial';
  const baseTimestamp = 1756285000000;

  // Track all created writeBatches for forensic verification
  let createdBatches: Array<{
    _operations: Array<{ type: string; docRef: any; data?: any; args?: any }>;
    set: jest.Mock;
    update: jest.Mock;
    commit: jest.Mock;
  }> = [];

  beforeEach(async () => {
    jest.clearAllMocks();
    createdBatches = [];
    _resetTrackingStateForTesting();
    await AsyncStorage.clear();

    // Mock writeBatch factory to capture each created batch
    (firestore.writeBatch as jest.Mock).mockImplementation((_db: any) => {
      const operations: Array<{ type: string; docRef: any; data?: any; args?: any; options?: any }> = [];
      const batchInstance: any = {
        _operations: operations,
        set: jest.fn((docRef, data, options) => {
          operations.push({ type: 'set', docRef, data, options });
          return batchInstance;
        }),
        update: jest.fn((docRef, ...args) => {
          operations.push({ type: 'update', docRef, args });
          return batchInstance;
        }),
        delete: jest.fn((docRef) => {
          operations.push({ type: 'delete', docRef });
          return batchInstance;
        }),
        commit: jest.fn().mockResolvedValue(undefined),
      };
      createdBatches.push(batchInstance);
      return batchInstance;
    });

    // Mock Expo Location permissions
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

    // Default initial fix
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
      timestamp: baseTimestamp,
    });
  });

  afterEach(async () => {
    await stopTrackingJob();
    await clearLocationBuffer();
    _resetTrackingStateForTesting();
    await AsyncStorage.clear();
  });

  // ============================================================================
  // AREA 1: HIGH-FREQUENCY LOCATION PINGS DURING OFFLINE PERIODS
  // ============================================================================
  describe('Area 1: High-Frequency Location Pings During Offline Periods', () => {
    it('buffers 500 sequential high-frequency GPS pings offline without data loss or Firestore leaks', async () => {
      await startTrackingJob(testJobId, testTenantId);
      // Ensure initial start tracking sync completes and resets mock counters
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();
      (firestore.setDoc as jest.Mock).mockClear();
      (firestore.updateDoc as jest.Mock).mockClear();

      // Go offline
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      const PING_COUNT = 500;
      const startMs = baseTimestamp + 1000;

      // Emit 500 pings in rapid sequence (100ms apart in hardware time)
      for (let i = 0; i < PING_COUNT; i++) {
        const ping: Location.LocationObject = {
          coords: {
            latitude: -33.8600 + i * 0.0001,
            longitude: 151.2000 + i * 0.0001,
            altitude: 15 + (i % 20),
            accuracy: 4 + (i % 3),
            altitudeAccuracy: null,
            heading: (i * 5) % 360,
            speed: 10 + (i % 15),
          },
          timestamp: startMs + i * 100,
        };

        const result = await handleLocationUpdate(ping);
        expect(result).not.toBeNull();
      }

      // Empirical Check 1: In-memory buffer must hold exactly 500 points
      expect(getLocationBufferCount()).toBe(PING_COUNT);

      // Empirical Check 2: Zero live Firestore calls were made while offline
      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
      expect(firestore.setDoc).not.toHaveBeenCalled();
      expect(firestore.updateDoc).not.toHaveBeenCalled();

      // Empirical Check 3: AsyncStorage contains the identical 500 points
      const rawPersisted = await AsyncStorage.getItem(getBufferStorageKey(testJobId));
      expect(rawPersisted).not.toBeNull();
      const parsedPersisted: DriverLocation[] = JSON.parse(rawPersisted!);
      expect(parsedPersisted).toHaveLength(PING_COUNT);

      // Empirical Check 4: Unaltered hardware timestamps across all 500 coordinates
      for (let i = 0; i < PING_COUNT; i++) {
        const expectedTimestamp = startMs + i * 100;
        expect(parsedPersisted[i].timestamp).toBe(expectedTimestamp);
        expect(parsedPersisted[i].latitude).toBeCloseTo(-33.8600 + i * 0.0001, 5);
        expect(parsedPersisted[i].longitude).toBeCloseTo(151.2000 + i * 0.0001, 5);
      }

      // Empirical Check 5: Buffer is strictly monotonically sorted
      for (let i = 1; i < parsedPersisted.length; i++) {
        expect(parsedPersisted[i].timestamp).toBeGreaterThan(parsedPersisted[i - 1].timestamp);
      }

      // Empirical Check 6: Sync status reflects offline state
      expect(getSyncStatus().status).toBe('offline_failed');
    });

    it('handles 100 concurrent GPS pings via Promise.all without race conditions or dropped points', async () => {
      await startTrackingJob(testJobId, testTenantId);
      setNetworkOnlineState(false);

      const CONCURRENT_COUNT = 100;
      const startMs = baseTimestamp + 100000;

      const pings: Location.LocationObject[] = Array.from({ length: CONCURRENT_COUNT }, (_, i) => ({
        coords: {
          latitude: -33.7000 + i * 0.0002,
          longitude: 151.1000 + i * 0.0002,
          altitude: 20,
          accuracy: 5,
          altitudeAccuracy: null,
          heading: 180,
          speed: 25,
        },
        timestamp: startMs + i * 50,
      }));

      // Fire all 100 updates concurrently
      await Promise.all(pings.map((p) => handleLocationUpdate(p)));

      // In-memory buffer and AsyncStorage must hold all 100 points
      expect(getLocationBufferCount()).toBe(CONCURRENT_COUNT);
      const raw = await AsyncStorage.getItem(getBufferStorageKey(testJobId));
      const persisted = JSON.parse(raw!);
      expect(persisted).toHaveLength(CONCURRENT_COUNT);

      // Verify all timestamps are preserved and in order
      expect(persisted[0].timestamp).toBe(startMs);
      expect(persisted[CONCURRENT_COUNT - 1].timestamp).toBe(startMs + (CONCURRENT_COUNT - 1) * 50);
    });

    it('defensively filters corrupt, NaN, out-of-bounds, and degraded accuracy pings during offline flood', async () => {
      await startTrackingJob(testJobId, testTenantId);
      setNetworkOnlineState(false);

      const startMs = baseTimestamp + 200000;
      let validCount = 0;

      // 1. Valid ping 1
      await handleLocationUpdate({
        coords: { latitude: -33.85, longitude: 151.21, accuracy: 5 } as any,
        timestamp: startMs + 1000,
      });
      validCount++;

      // 2. Corrupt: NaN latitude
      const nanRes = await handleLocationUpdate({
        coords: { latitude: NaN, longitude: 151.21, accuracy: 5 } as any,
        timestamp: startMs + 2000,
      });
      expect(nanRes).toBeNull();

      // 3. Corrupt: string longitude
      const strRes = await handleLocationUpdate({
        coords: { latitude: -33.85, longitude: 'invalid' as any, accuracy: 5 } as any,
        timestamp: startMs + 3000,
      });
      expect(strRes).toBeNull();

      // 4. Corrupt: out-of-bounds latitude (> 90)
      const oobLatRes = await handleLocationUpdate({
        coords: { latitude: 95.0, longitude: 151.21, accuracy: 5 } as any,
        timestamp: startMs + 4000,
      });
      expect(oobLatRes).toBeNull();

      // 5. Corrupt: out-of-bounds longitude (< -180)
      const oobLngRes = await handleLocationUpdate({
        coords: { latitude: -33.85, longitude: -195.0, accuracy: 5 } as any,
        timestamp: startMs + 5000,
      });
      expect(oobLngRes).toBeNull();

      // 6. Degraded accuracy (> 50m)
      const badAccRes = await handleLocationUpdate({
        coords: { latitude: -33.85, longitude: 151.21, accuracy: 75 } as any,
        timestamp: startMs + 6000,
      });
      expect(badAccRes).toBeNull();

      // 7. Negative accuracy (< 0)
      const negAccRes = await handleLocationUpdate({
        coords: { latitude: -33.85, longitude: 151.21, accuracy: -5 } as any,
        timestamp: startMs + 7000,
      });
      expect(negAccRes).toBeNull();

      // 8. Non-monotonic / backwards timestamp (clock skew to past)
      const staleRes = await handleLocationUpdate({
        coords: { latitude: -33.85, longitude: 151.21, accuracy: 5 } as any,
        timestamp: startMs + 500, // strictly earlier than lastProcessedTimestamp (startMs + 1000)
      });
      expect(staleRes).toBeNull();

      // 9. Valid ping 2
      await handleLocationUpdate({
        coords: { latitude: -33.84, longitude: 151.22, accuracy: 10 } as any,
        timestamp: startMs + 8000,
      });
      validCount++;

      // 10. Valid ping 3
      await handleLocationUpdate({
        coords: { latitude: -33.83, longitude: 151.23, accuracy: 12 } as any,
        timestamp: startMs + 9000,
      });
      validCount++;

      // Exact count verification: ONLY the 3 valid pings must be in buffer
      expect(validCount).toBe(3);
      expect(getLocationBufferCount()).toBe(3);

      const persisted = JSON.parse((await AsyncStorage.getItem(getBufferStorageKey(testJobId)))!);
      expect(persisted).toHaveLength(3);
      expect(persisted.map((p: DriverLocation) => p.timestamp)).toEqual([
        startMs + 1000,
        startMs + 8000,
        startMs + 9000,
      ]);
    });
  });

  // ============================================================================
  // AREA 2: LARGE BATCHES (>400 COORDINATES) REQUIRING MULTIPLE CHUNKS
  // ============================================================================
  describe('Area 2: Large Batches (>400 Coordinates) Requiring Multiple Chunks in batchUploadLocationHistory', () => {
    function generateLocationPoints(count: number, startTimestamp: number): DriverLocation[] {
      return Array.from({ length: count }, (_, i) => ({
        latitude: -33.8500 + i * 0.0001,
        longitude: 151.2000 + i * 0.0001,
        heading: 90,
        speed: 15,
        accuracy: 5,
        altitude: 10,
        timestamp: startTimestamp + i * 1000,
        jobId: testJobId,
      }));
    }

    it('processes exactly 400 coordinates as a single chunk with parent update included', async () => {
      const COUNT = 400;
      const points = generateLocationPoints(COUNT, baseTimestamp + 300000);

      await LogisticsService.batchUploadLocationHistory(testJobId, points);

      // Exactly 1 writeBatch created
      expect(createdBatches).toHaveLength(1);
      const batch1 = createdBatches[0];

      // 400 sets + 1 update = 401 operations (safe under 500)
      expect(batch1.set).toHaveBeenCalledTimes(400);
      expect(batch1.update).toHaveBeenCalledTimes(1);
      expect(batch1._operations).toHaveLength(401);
      expect(batch1._operations.length).toBeLessThanOrEqual(500);
      expect(batch1.commit).toHaveBeenCalledTimes(1);

      // Check that the parent document was updated with the 400th point
      const lastPoint = points[COUNT - 1];
      const updateCall = batch1.update.mock.calls[0];
      expect(updateCall[1].currentLocation.timestamp).toBe(lastPoint.timestamp);
      expect(updateCall[1].currentLocation.latitude).toBe(lastPoint.latitude);
      expect(updateCall[1].isTrackingActive).not.toBe(true);
    });

    it('splits exactly 401 coordinates across 2 chunks, with parent update ONLY on chunk 2', async () => {
      const COUNT = 401;
      const points = generateLocationPoints(COUNT, baseTimestamp + 400000);

      await LogisticsService.batchUploadLocationHistory(testJobId, points);

      // 2 writeBatches created: Chunk 1 has 400, Chunk 2 has 1
      expect(createdBatches).toHaveLength(2);

      const chunk1 = createdBatches[0];
      const chunk2 = createdBatches[1];

      // Chunk 1: 400 sets, NO update
      expect(chunk1.set).toHaveBeenCalledTimes(400);
      expect(chunk1.update).not.toHaveBeenCalled();
      expect(chunk1._operations).toHaveLength(400);
      expect(chunk1.commit).toHaveBeenCalledTimes(1);

      // Chunk 2: 1 set, 1 update = 2 operations
      expect(chunk2.set).toHaveBeenCalledTimes(1);
      expect(chunk2.update).toHaveBeenCalledTimes(1);
      expect(chunk2._operations).toHaveLength(2);
      expect(chunk2.commit).toHaveBeenCalledTimes(1);

      // Total sets across all batches must equal 401
      const totalSets = chunk1.set.mock.calls.length + chunk2.set.mock.calls.length;
      expect(totalSets).toBe(401);

      // Parent update reflects the 401st point
      const lastPoint = points[COUNT - 1];
      expect(chunk2.update.mock.calls[0][1].currentLocation.timestamp).toBe(lastPoint.timestamp);
    });

    it('splits 850 coordinates (>400) across 3 chunks cleanly without off-by-one errors', async () => {
      const COUNT = 850;
      const points = generateLocationPoints(COUNT, baseTimestamp + 500000);

      await LogisticsService.batchUploadLocationHistory(testJobId, points);

      // Math.ceil(850 / 400) = 3 batches
      expect(createdBatches).toHaveLength(3);

      const chunk1 = createdBatches[0];
      const chunk2 = createdBatches[1];
      const chunk3 = createdBatches[2];

      // Chunk 1: 400 sets, 0 updates
      expect(chunk1.set).toHaveBeenCalledTimes(400);
      expect(chunk1.update).not.toHaveBeenCalled();
      expect(chunk1._operations).toHaveLength(400);

      // Chunk 2: 400 sets, 0 updates
      expect(chunk2.set).toHaveBeenCalledTimes(400);
      expect(chunk2.update).not.toHaveBeenCalled();
      expect(chunk2._operations).toHaveLength(400);

      // Chunk 3: 50 sets, 1 update = 51 operations
      expect(chunk3.set).toHaveBeenCalledTimes(50);
      expect(chunk3.update).toHaveBeenCalledTimes(1);
      expect(chunk3._operations).toHaveLength(51);

      // Verify every chunk is strictly <= 500 operations
      for (const batch of createdBatches) {
        expect(batch._operations.length).toBeLessThanOrEqual(500);
        expect(batch.commit).toHaveBeenCalledTimes(1);
      }

      // Total points written = 850
      const totalSets = chunk1.set.mock.calls.length + chunk2.set.mock.calls.length + chunk3.set.mock.calls.length;
      expect(totalSets).toBe(850);

      // Newest location in parent update is the 850th point
      const newestPoint = points[COUNT - 1];
      expect(chunk3.update.mock.calls[0][1].currentLocation.timestamp).toBe(newestPoint.timestamp);
      expect(chunk3.update.mock.calls[0][1].currentLocation.latitude).toBe(newestPoint.latitude);
    });

    it('processes a massive batch of 1,200 coordinates across 3 full chunks of 400 each', async () => {
      const COUNT = 1200;
      const points = generateLocationPoints(COUNT, baseTimestamp + 600000);

      await LogisticsService.batchUploadLocationHistory(testJobId, points);

      expect(createdBatches).toHaveLength(3);
      expect(createdBatches[0].set).toHaveBeenCalledTimes(400);
      expect(createdBatches[0].update).not.toHaveBeenCalled();

      expect(createdBatches[1].set).toHaveBeenCalledTimes(400);
      expect(createdBatches[1].update).not.toHaveBeenCalled();

      expect(createdBatches[2].set).toHaveBeenCalledTimes(400);
      expect(createdBatches[2].update).toHaveBeenCalledTimes(1);

      const totalSets =
        createdBatches[0].set.mock.calls.length +
        createdBatches[1].set.mock.calls.length +
        createdBatches[2].set.mock.calls.length;
      expect(totalSets).toBe(1200);
    });

    it('deduplicates points with identical timestamps in large batches to prevent batch key collision', async () => {
      const startMs = baseTimestamp + 700000;
      const points: DriverLocation[] = [];

      // 450 unique points + 50 duplicates sharing the same timestamps
      for (let i = 0; i < 450; i++) {
        points.push({
          latitude: -33.8 + i * 0.001,
          longitude: 151.2 + i * 0.001,
          timestamp: startMs + i * 1000,
        });
      }
      for (let i = 0; i < 50; i++) {
        points.push({
          latitude: -33.8 + i * 0.001,
          longitude: 151.2 + i * 0.001,
          timestamp: startMs + i * 1000, // Duplicates first 50 timestamps
        });
      }
      expect(points).toHaveLength(500);

      await LogisticsService.batchUploadLocationHistory(testJobId, points);

      // Should deduplicate to 450 unique points
      // 450 items: Chunk 1 = 400, Chunk 2 = 50
      expect(createdBatches).toHaveLength(2);
      expect(createdBatches[0].set).toHaveBeenCalledTimes(400);
      expect(createdBatches[1].set).toHaveBeenCalledTimes(50);
    });

    it('gracefully activates sequential fallback if writeBatch throws during multi-chunk upload', async () => {
      const COUNT = 450;
      const points = generateLocationPoints(COUNT, baseTimestamp + 800000);

      // Make writeBatch throw on Chunk 2
      let batchCount = 0;
      (firestore.writeBatch as jest.Mock).mockImplementation((_db: any) => {
        batchCount++;
        const ops: any[] = [];
        return {
          _operations: ops,
          set: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          commit: jest.fn().mockImplementation(() => {
            if (batchCount === 2) {
              return Promise.reject(new Error('FIRESTORE_RESOURCE_EXHAUSTED: batch limit hit'));
            }
            return Promise.resolve();
          }),
        };
      });

      // Execute batch upload
      await LogisticsService.batchUploadLocationHistory(testJobId, points);

      // Sequential fallback should execute setDoc for all 450 points and updateDoc for parent
      expect(firestore.setDoc).toHaveBeenCalledTimes(450);
      expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // AREA 3: RAPID ONLINE/OFFLINE NETWORK TOGGLING DURING ACTIVE FLUSH OPERATIONS
  // ============================================================================
  describe('Area 3: Rapid Online/Offline Network Toggling During Active Flush Operations', () => {
    it('coalesces rapid network toggles during an in-flight flush with zero duplicate uploads', async () => {
      await startTrackingJob(testJobId, testTenantId);
      setNetworkOnlineState(false);

      // Buffer 250 points offline
      const startMs = baseTimestamp + 900000;
      for (let i = 0; i < 250; i++) {
        await handleLocationUpdate({
          coords: { latitude: -33.8 + i * 0.0001, longitude: 151.2 + i * 0.0001, accuracy: 5 } as any,
          timestamp: startMs + i * 100,
        });
      }
      expect(getLocationBufferCount()).toBe(250);

      // Clear spy call history before reconnection
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockClear();

      // Delay batchUploadLocationHistory to simulate realistic in-flight network upload
      let resolveUpload: () => void = () => {};
      const uploadHoldPromise = new Promise<void>((resolve) => {
        resolveUpload = resolve;
      });

      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementationOnce(
        async (jid: string, pts: DriverLocation[]) => {
          await uploadHoldPromise;
          const actualFn = jest.requireActual('@/services/logistics-service').batchUploadLocationHistory;
          return actualFn(jid, pts);
        }
      );

      // Trigger reconnection -> starts in-flight flush
      setNetworkOnlineState(true);
      expect(isLocationBufferFlushing()).toBe(true);

      // While flush is in flight, toggle network state rapidly 20 times!
      for (let i = 0; i < 20; i++) {
        setNetworkOnlineState(i % 2 === 0);
      }

      // Also invoke flushLocationBuffer concurrently 5 times
      const concurrentFlushes = [
        flushLocationBuffer(testJobId),
        flushLocationBuffer(testJobId),
        flushLocationBuffer(testJobId),
        flushLocationBuffer(testJobId),
        flushLocationBuffer(testJobId),
      ];

      // Verify that batchUploadLocationHistory was only invoked ONCE so far (no race duplicate)
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledTimes(1);

      // Now complete the upload hold
      resolveUpload();
      await Promise.all(concurrentFlushes);

      // Settle any microtasks
      await new Promise((resolve) => setTimeout(resolve, 10));

      // After flush resolves:
      // 1. Buffer must be completely drained to 0
      expect(getLocationBufferCount()).toBe(0);

      // 2. AsyncStorage must be cleared
      const raw = await AsyncStorage.getItem(getBufferStorageKey(testJobId));
      expect(raw).toBeNull();

      // 3. Flushing flag must be false
      expect(isLocationBufferFlushing()).toBe(false);

      // 4. batchUploadLocationHistory was NOT redundantly invoked again for the same items
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledTimes(1);
    });

    it('safely interleaves new GPS arrivals during an in-flight flush: original uploaded, new retained', async () => {
      await startTrackingJob(testJobId, testTenantId);
      setNetworkOnlineState(false);

      // Buffer initial 400 points offline
      const startMs = baseTimestamp + 1000000;
      for (let i = 0; i < 400; i++) {
        await handleLocationUpdate({
          coords: { latitude: -33.8 + i * 0.0001, longitude: 151.2 + i * 0.0001, accuracy: 5 } as any,
          timestamp: startMs + i * 100,
        });
      }
      expect(getLocationBufferCount()).toBe(400);

      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockClear();

      // Hold in-flight upload
      let resolveFirstFlush: () => void = () => {};
      const firstFlushHold = new Promise<void>((resolve) => {
        resolveFirstFlush = resolve;
      });

      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementationOnce(
        async (jid: string, pts: DriverLocation[]) => {
          await firstFlushHold;
          const actualFn = jest.requireActual('@/services/logistics-service').batchUploadLocationHistory;
          return actualFn(jid, pts);
        }
      );

      // Trigger online -> first flush begins with 400 points
      setNetworkOnlineState(true);
      expect(isLocationBufferFlushing()).toBe(true);

      // WHILE FIRST FLUSH IS IN FLIGHT, 50 NEW PINGS ARRIVE (force buffer or online fallback)
      const newArrivalsStart = startMs + 100000;
      for (let i = 0; i < 50; i++) {
        await handleLocationUpdate(
          {
            coords: { latitude: -33.9 + i * 0.0001, longitude: 151.3 + i * 0.0001, accuracy: 5 } as any,
            timestamp: newArrivalsStart + i * 100,
          },
          false,
          true // bufferOnly flag
        );
      }

      // At this moment, locationBuffer has 450 items (400 being uploaded + 50 newly arrived)
      expect(getLocationBufferCount()).toBe(450);

      // Now release the first flush
      resolveFirstFlush();
      // Allow async chain to process slice
      await flushLocationBuffer(testJobId);

      // CRITICAL VERIFICATION:
      // Exactly 400 points were uploaded in the first batch.
      // The 50 new points MUST REMAIN in locationBuffer (not wiped out by slice)!
      expect(getLocationBufferCount()).toBe(50);

      // AsyncStorage must also store exactly the 50 new points
      const rawPersisted = await AsyncStorage.getItem(getBufferStorageKey(testJobId));
      expect(rawPersisted).not.toBeNull();
      const parsedPersisted = JSON.parse(rawPersisted!);
      expect(parsedPersisted).toHaveLength(50);
      expect(parsedPersisted[0].timestamp).toBe(newArrivalsStart);

      // Trigger second flush to upload the remaining 50 points
      await flushLocationBuffer(testJobId);
      expect(getLocationBufferCount()).toBe(0);

      // Total batch uploads invoked = 2 (400 in first, 50 in second = 450 total points)
      expect(LogisticsService.batchUploadLocationHistory).toHaveBeenCalledTimes(2);
      expect((LogisticsService.batchUploadLocationHistory as jest.Mock).mock.calls[0][1]).toHaveLength(400);
      expect((LogisticsService.batchUploadLocationHistory as jest.Mock).mock.calls[1][1]).toHaveLength(50);
    });

    it('retains buffer in memory and AsyncStorage when batch upload fails during network oscillation', async () => {
      await startTrackingJob(testJobId, testTenantId);
      setNetworkOnlineState(false);

      const startMs = baseTimestamp + 1200000;
      for (let i = 0; i < 100; i++) {
        await handleLocationUpdate({
          coords: { latitude: -33.85 + i * 0.0001, longitude: 151.25 + i * 0.0001, accuracy: 5 } as any,
          timestamp: startMs + i * 100,
        });
      }
      expect(getLocationBufferCount()).toBe(100);

      // Make batchUploadLocationHistory reject with network error
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockRejectedValueOnce(
        new Error('Unavailable: Transport connection broken')
      );

      // Trigger flush
      setNetworkOnlineState(true);
      await expect(flushLocationBuffer(testJobId)).rejects.toThrow('Unavailable: Transport connection broken');

      // Points must NOT be dropped on failure
      expect(getLocationBufferCount()).toBe(100);
      const raw = await AsyncStorage.getItem(getBufferStorageKey(testJobId));
      expect(JSON.parse(raw!)).toHaveLength(100);

      // Status must reflect failure
      expect(getSyncStatus().status).toBe('offline_failed');
      expect(isLocationBufferFlushing()).toBe(false);

      // Now restore working upload and retry
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementation(
        jest.requireActual('@/services/logistics-service').batchUploadLocationHistory
      );

      await flushLocationBuffer(testJobId);

      // Successfully uploaded on retry
      expect(getLocationBufferCount()).toBe(0);
      expect(getSyncStatus().status).toBe('synced');
    });
  });

  // ============================================================================
  // AREA 4: COMPREHENSIVE REAL-WORLD CELLULAR DEAD-ZONE (TUNNEL) SIMULATION
  // ============================================================================
  describe('Area 4: Real-World Cellular Dead-Zone Lifecycle Simulation', () => {
    it('accurately buffers entire dead-zone route, survives cell flicker, and flushes upon exit', async () => {
      // 1. Driver starts tracking online
      setNetworkOnlineState(true);
      const started = await startTrackingJob(testJobId, testTenantId);
      expect(started).toBe(true);

      const startMs = baseTimestamp + 1300000;

      // 2. Driver enters 10km mountain tunnel -> cellular connection lost
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      // 3. Driver travels through tunnel: 150 pings emitted by GPS hardware
      for (let i = 0; i < 150; i++) {
        await handleLocationUpdate({
          coords: {
            latitude: -33.8000 + i * 0.0002,
            longitude: 151.1000 + i * 0.0002,
            altitude: 50,
            accuracy: 6,
            heading: 45,
            speed: 22,
          } as any,
          timestamp: startMs + i * 1000,
        });
      }
      expect(getLocationBufferCount()).toBe(150);

      // 4. Brief network flicker (100ms) with failed ping, drops back offline immediately
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockRejectedValueOnce(
        new Error('Network flicker handshake timeout')
      );
      setNetworkOnlineState(true);
      setNetworkOnlineState(false);

      // 5. Driver continues in tunnel: 150 more pings emitted
      const secondLegStart = startMs + 150000;
      for (let i = 0; i < 150; i++) {
        await handleLocationUpdate({
          coords: {
            latitude: -33.7700 + i * 0.0002,
            longitude: 151.1300 + i * 0.0002,
            altitude: 40,
            accuracy: 5,
            heading: 45,
            speed: 24,
          } as any,
          timestamp: secondLegStart + i * 1000,
        });
      }
      expect(getLocationBufferCount()).toBe(300);

      // 6. Driver emerges from tunnel into clear 5G coverage
      const actualLogistics = jest.requireActual('@/services/logistics-service');
      (LogisticsService.batchUploadLocationHistory as jest.Mock).mockImplementation(actualLogistics.batchUploadLocationHistory);
      setNetworkOnlineState(true);
      expect(isOnline()).toBe(true);

      // Await automatic reconnection flush
      await flushLocationBuffer(testJobId);

      // 7. Verify all 300 points flushed cleanly
      expect(getLocationBufferCount()).toBe(0);
      expect(getSyncStatus().status).toBe('synced');

      // 8. Driver completes job -> stop tracking
      await stopTrackingJob(testJobId);
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();

      // In-memory and AsyncStorage buffer clean
      expect(getLocationBufferCount()).toBe(0);
      const rawAfterStop = await AsyncStorage.getItem(getBufferStorageKey(testJobId));
      expect(rawAfterStop).toBeNull();
    });
  });
});
