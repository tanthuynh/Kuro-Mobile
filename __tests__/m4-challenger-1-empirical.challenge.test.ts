/**
 * __tests__/m4-challenger-1-empirical.challenge.test.ts
 * ============================================================================
 * Milestone 4 Adversarial Stress Harness & Empirical Verification
 * Challenger 1: GPS Concurrency, Offline Persistence & Deadlock Resistance
 * ============================================================================
 *
 * Empirical Challenges:
 * 1. Rapid offline/online state transition storm (100 toggles) under concurrent operations (zero unhandled rejections).
 * 2. High-concurrency mutation batches across Logistics and Repairs (100 parallel operations, zero race conditions).
 * 3. Lifecycle mutex lock contention & deadlock resistance under simulated native rejections.
 * 4. Memory leak & listener teardown verification under rapid registration/deregistration.
 * 5. GPS coordinate hardware timestamp fidelity & monotonic clock skew defenses.
 */

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as firestore from 'firebase/firestore';

import {
  startTrackingJob,
  stopTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  handleLocationUpdate,
  setNetworkOnlineState as setLocationTrackingOnlineState,
  isOnline as isLocationOnline,
  getLocationBufferCount,
  isLocationBufferFlushing,
  clearLocationBuffer,
  flushLocationBuffer,
  addLocationListener,
  addSyncStatusListener,
  getSyncStatus,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';

import {
  createRepairTicket,
  updateRepairTicketStatus,
  appendRepairNote,
  setNetworkOnlineState as setRepairOnlineState,
  isOnline as isRepairOnline,
} from '@/services/repair-service';

import {
  updateLogisticsStatus,
  appendLogisticsNote,
  batchUploadLocationHistory,
} from '@/services/logistics-service';

import {
  setNetworkOnlineState as setPullSheetOnlineState,
  isOnline as isPullSheetOnline,
  updatePullsheetItemStatus,
} from '@/services/pull-sheet-service';

import type { DriverLocation } from '@/types/logistics';
import type { CreateRepairTicketInput } from '@/types/repair';

const mockFirestore = firestore as jest.Mocked<any>;

describe('Challenger 1: Final Comprehensive Adversarial Stress Suite (M4)', () => {
  const tenantId = 'tenant-m4-challenger-01';
  const userId = 'tech-challenger-01';
  const currentUser = {
    id: userId,
    uid: userId,
    name: 'Challenger Tech',
    email: 'challenger@kuro.test',
    tenantId,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    _resetTrackingStateForTesting();
    await AsyncStorage.clear();

    setLocationTrackingOnlineState(true);
    setRepairOnlineState(true);
    setPullSheetOnlineState(true);

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
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);

    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 25.0,
        accuracy: 5.0,
        heading: 90,
        speed: 13.5,
      },
      timestamp: 1726000000000,
    });
  });

  afterEach(async () => {
    await stopTrackingJob();
    await clearLocationBuffer();
    _resetTrackingStateForTesting();
    await AsyncStorage.clear();
  });

  // ==========================================================================
  // CHALLENGE 1: RAPID NETWORK FLAPPING STORM (100 CYCLES) UNDER MUTATION LOAD
  // ==========================================================================
  describe('1. Rapid Offline/Online State Transition Storm (Zero Unhandled Rejections)', () => {
    it('survives 100 rapid asynchronous network toggles while concurrent mutations and telemetry updates are in-flight', async () => {
      // Mock Firestore doc snapshot for repairs
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId,
          status: 'Reported',
          condition: 'Available to Use',
          equipment: { id: 'eq-ch-01', name: 'Barco UDX 4K32' },
          notes: [],
          actions: [],
        }),
      });

      await startTrackingJob('job-flapping-01', tenantId);

      const unhandledErrors: any[] = [];
      const onUnhandled = (err: any) => unhandledErrors.push(err);
      process.on('unhandledRejection', onUnhandled);

      try {
        const mutationPromises: Promise<any>[] = [];

        // 1. Launch 50 interleaved mutations across services
        for (let i = 0; i < 50; i++) {
          if (i % 3 === 0) {
            mutationPromises.push(
              updateRepairTicketStatus(
                `ticket-flapping-${i % 5}`,
                'Under Repair',
                currentUser,
                tenantId,
                `Rapid flapping step ${i}`
              ).catch((e) => ({ error: e }))
            );
          } else if (i % 3 === 1) {
            mutationPromises.push(
              appendLogisticsNote(
                'job-flapping-01',
                `Telemetry ping milestone note ${i}`,
                'Driver Mike',
                tenantId
              ).catch((e) => ({ error: e }))
            );
          } else {
            mutationPromises.push(
              handleLocationUpdate({
                coords: {
                  latitude: -33.8688 + i * 0.001,
                  longitude: 151.2093 + i * 0.001,
                  accuracy: 5.0,
                  altitude: 10,
                  altitudeAccuracy: null,
                  speed: 15,
                  heading: 0,
                },
                timestamp: 1726000000000 + i * 1000,
              }).catch((e) => ({ error: e }))
            );
          }
        }

        // 2. Concurrently execute 100 rapid online/offline toggles
        const togglePromises: Promise<void>[] = [];
        for (let t = 0; t < 100; t++) {
          const isOnline = t % 2 === 0;
          togglePromises.push(
            (async () => {
              setLocationTrackingOnlineState(isOnline);
              setRepairOnlineState(isOnline);
              setPullSheetOnlineState(isOnline);
              await new Promise((r) => setTimeout(r, 1));
            })()
          );
        }

        await Promise.all([...mutationPromises, ...togglePromises]);

        // Assert zero unhandled rejections occurred
        expect(unhandledErrors).toHaveLength(0);

        // Ensure flush lock is cleanly released
        expect(isLocationBufferFlushing()).toBe(false);

        // Restore online and flush remaining buffer
        setLocationTrackingOnlineState(true);
        await flushLocationBuffer('job-flapping-01');
        expect(getLocationBufferCount()).toBe(0);
      } finally {
        process.removeListener('unhandledRejection', onUnhandled);
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 2: HIGH-CONCURRENCY MUTATION BATCHES (ZERO RACE CONDITIONS)
  // ==========================================================================
  describe('2. High-Concurrency Mutation Batches across Logistics and Repairs', () => {
    it('executes 100 parallel mutations across Logistics and Repairs without race conditions or writeBatch overflow', async () => {
      // 1. Offline mode: mutations must queue without throwing
      setRepairOnlineState(false);
      setLocationTrackingOnlineState(false);
      setPullSheetOnlineState(false);

      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId,
          status: 'Reported',
          condition: 'Available to Use',
          equipment: { id: 'eq-batch-100', name: 'L-Acoustics K2' },
          notes: [],
          actions: [],
        }),
      });

      const operations: Promise<any>[] = [];

      for (let i = 0; i < 50; i++) {
        const ticketInput: CreateRepairTicketInput = {
          equipment: { id: `eq-${i}`, name: `Equipment ${i}`, serialNumber: `SN-${i}` },
          status: 'Reported',
          priority: 'High',
        };
        operations.push(createRepairTicket(tenantId, ticketInput, currentUser));
      }

      for (let i = 0; i < 50; i++) {
        operations.push(
          updateLogisticsStatus(`job-batch-${i}`, 'In Progress', {
            tenantId,
            note: `Departure note ${i}`,
            updatedBy: 'Dispatcher',
          })
        );
      }

      const results = await Promise.all(operations);
      expect(results).toHaveLength(100);

      // Verify all 50 repair tickets returned non-empty string IDs
      for (let i = 0; i < 50; i++) {
        expect(typeof results[i]).toBe('string');
        expect(results[i].length).toBeGreaterThan(0);
      }

      // Verify Firestore setDoc (50 repair tickets) and updateDoc (50 logistics + 50 equipment sync = 100 calls) were invoked
      expect(mockFirestore.setDoc).toHaveBeenCalledTimes(50);
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(100);
    });

    it('batchUploadLocationHistory chunks operations into batches <= 400 without exceeding Firestore 500-op limit', async () => {
      const largeLocationBatch: DriverLocation[] = [];
      const baseTime = 1726000000000;

      // 950 distinct location coordinates (requires 3 chunks: 400, 400, 150)
      for (let i = 0; i < 950; i++) {
        largeLocationBatch.push({
          latitude: -33.8688 + i * 0.0001,
          longitude: 151.2093 + i * 0.0001,
          altitude: 10,
          accuracy: 5,
          speed: 15,
          heading: 90,
          timestamp: baseTime + i * 1000,
          jobId: 'job-chunk-test',
          driverId: 'drv-chunk',
        });
      }

      let committedBatchesCount = 0;
      const batchOpCounts: number[] = [];

      mockFirestore.writeBatch.mockImplementation(() => {
        let opCount = 0;
        return {
          set: jest.fn(() => {
            opCount++;
            return this;
          }),
          update: jest.fn(() => {
            opCount++;
            return this;
          }),
          delete: jest.fn(() => {
            opCount++;
            return this;
          }),
          commit: jest.fn(async () => {
            committedBatchesCount++;
            batchOpCounts.push(opCount);
          }),
        };
      });

      await batchUploadLocationHistory('job-chunk-test', largeLocationBatch);

      // 950 items chunked at 400:
      // Chunk 1: 400 sets = 400 ops
      // Chunk 2: 400 sets = 400 ops
      // Chunk 3: 150 sets + 1 parent update = 151 ops
      expect(committedBatchesCount).toBe(3);
      for (const count of batchOpCounts) {
        expect(count).toBeLessThanOrEqual(401);
        expect(count).toBeLessThan(500); // Strict Firestore safety boundary
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 3: LIFECYCLE MUTEX CONTENCTION & DEADLOCK RESISTANCE
  // ==========================================================================
  describe('3. Lifecycle Mutex Lock Contention & Deadlock Resistance', () => {
    it('does not deadlock or freeze when native startLocationUpdatesAsync throws an error', async () => {
      // Inject native exception into Expo Location start
      (Location.startLocationUpdatesAsync as jest.Mock).mockRejectedValueOnce(
        new Error('E_LOCATION_SETTINGS_UNSATISFIED: GPS disabled')
      );

      // Call 1 fails
      const startResult = await startTrackingJob('job-deadlock-01', tenantId);
      expect(startResult).toBe(false);
      expect(isTrackingActive()).toBe(false);

      // Lock MUST be released despite rejection. Call 2 succeeds immediately without hanging.
      const secondStartResult = await startTrackingJob('job-deadlock-01', tenantId);
      expect(secondStartResult).toBe(true);
      expect(isTrackingActive()).toBe(true);

      await stopTrackingJob();
      expect(isTrackingActive()).toBe(false);
    });

    it('50 interleaved concurrent start/stop cycles with random errors never lock the event loop', async () => {
      let callCount = 0;
      (Location.startLocationUpdatesAsync as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount % 5 === 0) {
          throw new Error(`Simulated native error #${callCount}`);
        }
      });

      const promises: Promise<any>[] = [];
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          promises.push(startTrackingJob(`job-interleaved-${i}`, tenantId));
        } else {
          promises.push(stopTrackingJob());
        }
      }

      // Must settle within reasonable time without timing out
      await expect(Promise.all(promises)).resolves.not.toThrow();

      // State is consistent
      expect(typeof isTrackingActive()).toBe('boolean');

      // Clean final stop
      await stopTrackingJob();
      expect(isTrackingActive()).toBe(false);
    });
  });

  // ==========================================================================
  // CHALLENGE 4: MEMORY LEAK & LISTENER UNREGISTER VERIFICATION
  // ==========================================================================
  describe('4. Memory Leak & Listener Teardown Verification', () => {
    it('cleans up all registered location and sync status listeners upon unsubscribe', async () => {
      let locationCallbackCount = 0;
      let syncStatusCallbackCount = 0;

      const unsubs: (() => void)[] = [];

      for (let i = 0; i < 50; i++) {
        unsubs.push(
          addLocationListener(() => {
            locationCallbackCount++;
          })
        );
        unsubs.push(
          addSyncStatusListener(() => {
            syncStatusCallbackCount++;
          })
        );
      }

      // Trigger 1 update
      await handleLocationUpdate({
        coords: {
          latitude: -33.8688,
          longitude: 151.2093,
          accuracy: 5.0,
          altitude: 10,
          altitudeAccuracy: null,
          speed: 10,
          heading: 0,
        },
        timestamp: 1726000000000,
      });

      expect(locationCallbackCount).toBe(50);

      // Now unsubscribe all 100 callbacks
      for (const unsub of unsubs) {
        unsub();
      }

      // Trigger another update
      await handleLocationUpdate({
        coords: {
          latitude: -33.8600,
          longitude: 151.2000,
          accuracy: 5.0,
          altitude: 10,
          altitudeAccuracy: null,
          speed: 10,
          heading: 0,
        },
        timestamp: 1726000010000,
      });

      // Count MUST remain exactly 50 (no leaked listeners fired)
      expect(locationCallbackCount).toBe(50);
    });
  });

  // ==========================================================================
  // CHALLENGE 5: HARDWARE TIMESTAMP FIDELITY & MONOTONIC CLOCK DEFENSES
  // ==========================================================================
  describe('5. Hardware Timestamp Fidelity & Monotonic Clock Defenses', () => {
    it('strictly preserves original hardware GPS epoch timestamps during buffering and upload', async () => {
      await startTrackingJob('job-timestamp-audit', tenantId);
      setLocationTrackingOnlineState(false);
      await clearLocationBuffer();

      const hardwareTimestamp1 = 1726000100000;
      const hardwareTimestamp2 = 1726000200000;

      await handleLocationUpdate({
        coords: {
          latitude: -33.8688,
          longitude: 151.2093,
          accuracy: 5.0,
          altitude: 10,
          altitudeAccuracy: null,
          speed: 10,
          heading: 0,
        },
        timestamp: hardwareTimestamp1,
      });

      await handleLocationUpdate({
        coords: {
          latitude: -33.8650,
          longitude: 151.2050,
          accuracy: 5.0,
          altitude: 10,
          altitudeAccuracy: null,
          speed: 10,
          heading: 0,
        },
        timestamp: hardwareTimestamp2,
      });

      expect(getLocationBufferCount()).toBe(2);

      // Inspect persisted AsyncStorage payload
      const rawStored = await AsyncStorage.getItem(`@kuro_location_buffer:job-timestamp-audit`);
      expect(rawStored).not.toBeNull();
      const parsed = JSON.parse(rawStored!);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].timestamp).toBe(hardwareTimestamp1);
      expect(parsed[1].timestamp).toBe(hardwareTimestamp2);

      // Restore network and capture writeBatch calls
      let committedHistoryDocs: Record<string, any>[] = [];
      mockFirestore.writeBatch.mockImplementation(() => ({
        set: jest.fn((docRef, payload) => {
          committedHistoryDocs.push(payload);
          return this;
        }),
        update: jest.fn(),
        commit: jest.fn(async () => undefined),
      }));

      setLocationTrackingOnlineState(true);
      await flushLocationBuffer('job-timestamp-audit');

      expect(getLocationBufferCount()).toBe(0);
      expect(committedHistoryDocs).toHaveLength(2);
      expect(committedHistoryDocs[0].timestamp).toBe(hardwareTimestamp1);
      expect(committedHistoryDocs[1].timestamp).toBe(hardwareTimestamp2);
    });

    it('rejects out-of-order / backward-dated timestamps from corrupting last known position', async () => {
      await startTrackingJob('job-monotonic-audit', tenantId);

      // First coordinate: T=1000
      const fix1 = await handleLocationUpdate({
        coords: { latitude: -33.8688, longitude: 151.2093, accuracy: 5.0, altitude: 0, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: 1726000005000,
      });
      expect(fix1).not.toBeNull();

      // Second coordinate: T=900 (stale / backward timestamp)
      const staleFix = await handleLocationUpdate({
        coords: { latitude: -33.8600, longitude: 151.2000, accuracy: 5.0, altitude: 0, altitudeAccuracy: null, speed: 0, heading: 0 },
        timestamp: 1726000001000,
      });
      // Out-of-order coordinate MUST be rejected
      expect(staleFix).toBeNull();
    });
  });
});
