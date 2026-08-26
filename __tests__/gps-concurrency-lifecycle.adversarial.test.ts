/**
 * __tests__/gps-concurrency-lifecycle.adversarial.test.ts
 *
 * Adversarial Concurrency, Lifecycle & Fault Injection Stress Suite
 * for Kuro Mobile Logistics Background GPS Tracking and Firestore Sync.
 *
 * Stress-tested dimensions:
 * 1. Rapid concurrent start/stop and job-switching race conditions.
 * 2. Permission denial variants, native exceptions, and fallback cascades.
 * 3. TaskManager headless background callback resilience (null, empty, malformed, throwing).
 * 4. Missing/null/NaN coordinate payloads and edge values.
 * 5. Listener exception isolation and in-memory state leakage/cleanup.
 * 6. High-volume simulated GPS streaming under rapid status mutations.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  LOCATION_TASK_NAME,
  startTrackingJob,
  stopTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  getActiveTenantId,
  getLastKnownLocation,
  getTrackingStatus,
  setTrackingDriverInfo,
  addLocationListener,
  handleLocationUpdate,
  requestLocationPermissions,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';
import * as LogisticsService from '@/services/logistics-service';
import { mapFirestoreLogisticsDoc, updateLogisticsStatus } from '@/services/logistics-service';

// Mock logistics-service updates
jest.mock('@/services/logistics-service', () => {
  const actual = jest.requireActual('@/services/logistics-service');
  return {
    ...actual,
    updateJobLocation: jest.fn().mockResolvedValue(undefined),
    stopJobTracking: jest.fn().mockResolvedValue(undefined),
    updateLogisticsStatus: jest.fn().mockResolvedValue(undefined),
  };
});

describe('Adversarial GPS & Concurrency Stress Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetTrackingStateForTesting();

    // Default mock behaviors
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
      timestamp: 1718000000000,
    });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 25.0,
        accuracy: 5.0,
        heading: 90,
        speed: 13.5,
      },
      timestamp: 1718000000000,
    });
  });

  afterEach(() => {
    _resetTrackingStateForTesting();
  });

  // ==========================================================================
  // SECTION 1: RAPID CONCURRENT ACTIVATION & RACE CONDITIONS
  // ==========================================================================
  describe('1. Rapid Concurrent Activation & State Transitions', () => {
    it('handles 50 interleaved concurrent start and stop calls without corrupted state', async () => {
      const operations: Promise<any>[] = [];

      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          operations.push(startTrackingJob(`job-${i}`, `tenant-${i % 3}`));
        } else {
          operations.push(stopTrackingJob(`job-${i - 1}`));
        }
      }

      await expect(Promise.all(operations)).resolves.not.toThrow();

      // State must be consistently structured
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

    it('handles rapid job-switching sequence (Job A -> Job B -> Job C -> Job D)', async () => {
      const jobs = ['job-alpha', 'job-beta', 'job-gamma', 'job-delta'];

      for (const jobId of jobs) {
        const started = await startTrackingJob(jobId, 'tenant-main', {
          driverId: `driver-for-${jobId}`,
        });
        expect(started).toBe(true);
        expect(getActiveTrackingJobId()).toBe(jobId);
        expect(isTrackingActive()).toBe(true);
      }

      // Verify stop was called for preceding jobs
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-alpha');
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-beta');
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-gamma');

      // Final state must be job-delta
      expect(getActiveTrackingJobId()).toBe('job-delta');
      expect(getActiveTenantId()).toBe('tenant-main');

      // Clean stop
      await stopTrackingJob();
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-delta');
    });

    it('handles startTrackingJob when native startLocationUpdatesAsync is slow/delayed', async () => {
      (Location.startLocationUpdatesAsync as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      );

      const startPromise = startTrackingJob('job-slow', 'tenant-slow');
      expect(isTrackingActive()).toBe(false); // not yet resolved

      const result = await startPromise;
      expect(result).toBe(true);
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe('job-slow');
    });

    it('recovers cleanly if startLocationUpdatesAsync rejects with native error', async () => {
      (Location.startLocationUpdatesAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Location provider disabled by user')
      );

      const success = await startTrackingJob('job-fail-native', 'tenant-1');
      expect(success).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(getActiveTenantId()).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 2: PERMISSION DENIAL & FALLBACK CASCADES
  // ==========================================================================
  describe('2. Permission Denial Handling & Fallback Cascades', () => {
    it('gracefully denies tracking when foreground permission is rejected', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
        canAskAgain: false,
        expires: 'never',
      });

      const started = await startTrackingJob('job-denied-fg', 'tenant-1');
      expect(started).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('allows tracking initialization when foreground is granted even if background permission fails', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockRejectedValue(
        new Error('Background permission not supported on device')
      );

      const started = await startTrackingJob('job-bg-unsupported', 'tenant-1');
      expect(started).toBe(true);
      expect(isTrackingActive()).toBe(true);
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalled();
    });

    it('handles native crash/rejection in requestForegroundPermissionsAsync', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValue(
        new Error('CRITICAL_NATIVE_LOCATION_EXCEPTION')
      );

      const perms = await requestLocationPermissions();
      expect(perms).toEqual({ foreground: false, background: false });

      const started = await startTrackingJob('job-crash', 'tenant-1');
      expect(started).toBe(false);
      expect(isTrackingActive()).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 3: TASKMANAGER HEADLESS CALLBACK RESILIENCE
  // ==========================================================================
  describe('3. TaskManager Headless Callback Resilience', () => {
    const getExecutor = () => (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);

    it('survives empty, null, and undefined payload variants without throwing', async () => {
      const executor = getExecutor();
      expect(executor).toBeDefined();

      const corruptPayloads = [
        {},
        { data: null },
        { data: undefined },
        { data: {} },
        { data: { locations: null } },
        { data: { locations: undefined } },
        { data: { locations: [] } },
        { data: { locations: [null, undefined, {}] } },
        { error: { message: 'OS killed task' } },
        { error: 'Unknown string error' },
      ];

      for (const payload of corruptPayloads) {
        await expect(executor(payload)).resolves.not.toThrow();
      }
    });

    it('processes batch locations and syncs the latest coordinate to Firestore', async () => {
      const executor = getExecutor();
      await startTrackingJob('job-batch', 'tenant-1');

      const batchLocations = [
        {
          coords: { latitude: -33.8100, longitude: 151.1100, altitude: 10, accuracy: 5, heading: 0, speed: 5 },
          timestamp: 1000,
        },
        {
          coords: { latitude: -33.8200, longitude: 151.1200, altitude: 12, accuracy: 4, heading: 10, speed: 8 },
          timestamp: 2000,
        },
        {
          coords: { latitude: -33.8300, longitude: 151.1300, altitude: 15, accuracy: 3, heading: 20, speed: 12 },
          timestamp: 3000,
        },
      ];

      await executor({ data: { locations: batchLocations } });

      const lastKnown = getLastKnownLocation();
      expect(lastKnown?.latitude).toBe(-33.8300);
      expect(lastKnown?.longitude).toBe(151.1300);
      expect(lastKnown?.timestamp).toBe(3000);

      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        'job-batch',
        expect.objectContaining({
          latitude: -33.8300,
          longitude: 151.1300,
          timestamp: 3000,
        })
      );
    });

    it('does not write to Firestore when headless task fires while no job is active', async () => {
      const executor = getExecutor();
      expect(isTrackingActive()).toBe(false);
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      await executor({
        data: {
          locations: [
            {
              coords: { latitude: -33.9000, longitude: 151.2000, altitude: 0, accuracy: 5, heading: 0, speed: 0 },
              timestamp: 5000,
            },
          ],
        },
      });

      // Coordinates updated in memory
      expect(getLastKnownLocation()?.latitude).toBe(-33.9000);
      // But no Firestore sync should occur
      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
    });

    it('survives Firestore write failures during background execution', async () => {
      const executor = getExecutor();
      await startTrackingJob('job-firestore-fail', 'tenant-1');

      (LogisticsService.updateJobLocation as jest.Mock).mockRejectedValueOnce(
        new Error('UNAVAILABLE: Firestore connection timed out')
      );

      // Should not throw
      await expect(
        executor({
          data: {
            locations: [
              {
                coords: { latitude: -33.8500, longitude: 151.2100, altitude: 5, accuracy: 4, heading: 90, speed: 10 },
                timestamp: 6000,
              },
            ],
          },
        })
      ).resolves.not.toThrow();

      // State is still updated locally
      expect(getLastKnownLocation()?.latitude).toBe(-33.8500);
    });
  });

  // ==========================================================================
  // SECTION 4: MISSING / NULL / MALFORMED COORDINATES HANDLING
  // ==========================================================================
  describe('4. Missing / Null / Malformed Coordinate Attributes Handling', () => {
    it('returns null for missing coords in handleLocationUpdate', async () => {
      const res1 = await handleLocationUpdate(null as any);
      const res2 = await handleLocationUpdate({} as any);
      const res3 = await handleLocationUpdate({ coords: null } as any);

      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(res3).toBeNull();
    });

    it('handles nullable optional GPS fields (altitude, accuracy, speed, heading)', async () => {
      await startTrackingJob('job-null-coords', 'tenant-1');

      const sparseLocation: Location.LocationObject = {
        coords: {
          latitude: -37.8136,
          longitude: 144.9631,
          altitude: null,
          accuracy: null,
          speed: null,
          heading: null,
          altitudeAccuracy: null,
        },
        timestamp: 1718005000000,
      };

      const result = await handleLocationUpdate(sparseLocation);

      expect(result).toEqual({
        latitude: -37.8136,
        longitude: 144.9631,
        altitude: null,
        accuracy: null,
        speed: null,
        heading: null,
        timestamp: 1718005000000,
        driverId: undefined,
        driverName: undefined,
        jobId: 'job-null-coords',
      });
    });

    it('provides fallback timestamp when location object has 0 or invalid timestamp', async () => {
      const locationNoTs: Location.LocationObject = {
        coords: {
          latitude: -33.8688,
          longitude: 151.2093,
          altitude: 10,
          accuracy: 5,
          speed: 0,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 0,
      };

      const before = Date.now();
      const result = await handleLocationUpdate(locationNoTs);
      const after = Date.now();

      expect(result?.timestamp).toBeGreaterThanOrEqual(before);
      expect(result?.timestamp).toBeLessThanOrEqual(after);
    });

    it('defensively parses corrupt raw Firestore GPS documents in mapFirestoreLogisticsDoc', () => {
      // Test document with NaN, stringified numbers, missing fields, or broken coordinates
      const corruptDocSnap = {
        id: 'job-corrupt',
        data: () => ({
          tenantId: 'tenant-1',
          status: 'In Transit',
          currentLocation: {
            latitude: '-33.8688', // stringified valid
            longitude: '151.2093', // stringified valid
            heading: 'invalid-heading',
            speed: null,
            accuracy: undefined,
          },
          lastLocationUpdate: 1718009000000,
        }),
      };

      const mapped = mapFirestoreLogisticsDoc(corruptDocSnap);
      expect(mapped.id).toBe('job-corrupt');
      expect(mapped.currentLocation).toBeDefined();
      expect(mapped.currentLocation?.latitude).toBe(-33.8688);
      expect(mapped.currentLocation?.longitude).toBe(151.2093);
      expect(mapped.currentLocation?.heading).toBeNull(); // non-number parsed to null

      // Completely broken coordinates (strings that cannot be parsed to numbers)
      const unparseableDocSnap = {
        id: 'job-broken-coords',
        data: () => ({
          tenantId: 'tenant-1',
          currentLocation: {
            latitude: 'not-a-number',
            longitude: 'not-a-number',
          },
        }),
      };

      const brokenMapped = mapFirestoreLogisticsDoc(unparseableDocSnap);
      expect(brokenMapped.currentLocation).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 5: IN-MEMORY STATE CLEANUP & LISTENER ISOLATION
  // ==========================================================================
  describe('5. In-Memory State Cleanup & Listener Isolation', () => {
    it('isolates listener errors so one failing listener does not crash other listeners or the service', async () => {
      const healthySpy1 = jest.fn();
      const throwingSpy = jest.fn().mockImplementation(() => {
        throw new Error('Listener crashed due to unexpected UI state');
      });
      const healthySpy2 = jest.fn();

      addLocationListener(healthySpy1);
      addLocationListener(throwingSpy);
      addLocationListener(healthySpy2);

      const location: Location.LocationObject = {
        coords: {
          latitude: -33.8500,
          longitude: 151.2100,
          altitude: 0,
          accuracy: 5,
          speed: 0,
          heading: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1718010000000,
      };

      await expect(handleLocationUpdate(location)).resolves.not.toThrow();

      expect(healthySpy1).toHaveBeenCalledTimes(1);
      expect(throwingSpy).toHaveBeenCalledTimes(1);
      expect(healthySpy2).toHaveBeenCalledTimes(1);
    });

    it('completely cleans up state and unsubscribes all listeners upon _resetTrackingStateForTesting', async () => {
      const listenerSpy = jest.fn();
      addLocationListener(listenerSpy);
      setTrackingDriverInfo({ id: 'driver-temp', name: 'Temporary Driver' });

      await startTrackingJob('job-reset-test', 'tenant-1');
      expect(isTrackingActive()).toBe(true);
      expect(listenerSpy).toHaveBeenCalledTimes(1); // Received initial position update

      listenerSpy.mockClear();
      _resetTrackingStateForTesting();

      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(getActiveTenantId()).toBeNull();
      expect(getLastKnownLocation()).toBeNull();

      // Trigger location update - listener should not be called
      await handleLocationUpdate({
        coords: { latitude: -33.8000, longitude: 151.2000, altitude: 0, accuracy: 5, speed: 0, heading: 0, altitudeAccuracy: null },
        timestamp: 1718011000000,
      });

      expect(listenerSpy).not.toHaveBeenCalled();
    });

    it('stops tracking and updates Firestore document tracking flag on stopTrackingJob', async () => {
      await startTrackingJob('job-complete-clean', 'tenant-1');
      expect(isTrackingActive()).toBe(true);

      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true);
      await stopTrackingJob('job-complete-clean');

      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(getActiveTenantId()).toBeNull();
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('job-complete-clean');
    });
  });

  // ==========================================================================
  // SECTION 6: HIGH-VOLUME SIMULATED STREAMING & STRESS HARNESS
  // ==========================================================================
  describe('6. High-Volume GPS Streaming & Rapid Status Mutation Harness', () => {
    it('survives 100 rapid sequential GPS updates under load without memory leak or dropped state', async () => {
      await startTrackingJob('job-stress-stream', 'tenant-stream', {
        driverId: 'driver-streamer',
        driverName: 'Speedy Driver',
      });

      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const simulatedLocation: Location.LocationObject = {
          coords: {
            latitude: -33.8688 + i * 0.0001,
            longitude: 151.2093 + i * 0.0001,
            altitude: 10 + (i % 5),
            accuracy: 3 + (i % 3),
            heading: (i * 10) % 360,
            speed: 15 + (i % 10),
            altitudeAccuracy: null,
          },
          timestamp: startTime + i * 1000,
        };

        await executor({ data: { locations: [simulatedLocation] } });
      }

      const finalLocation = getLastKnownLocation();
      expect(finalLocation).toBeDefined();
      expect(finalLocation?.latitude).toBeCloseTo(-33.8688 + 99 * 0.0001, 5);
      expect(finalLocation?.longitude).toBeCloseTo(151.2093 + 99 * 0.0001, 5);
      expect(finalLocation?.driverId).toBe('driver-streamer');
      expect(finalLocation?.jobId).toBe('job-stress-stream');

      await stopTrackingJob('job-stress-stream');
      expect(isTrackingActive()).toBe(false);
    });
  });
});
