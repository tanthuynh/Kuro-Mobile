/**
 * src/services/__tests__/location-tracking-service.test.ts
 * Comprehensive test suite for Background GPS Tracking Service (Milestone 3).
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as LogisticsService from '../logistics-service';
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
  verifyTrackingPrerequisites,
  getLastTrackingFailureReason,
  isAccuracyPrecise,
  getSyncStatus,
  flushLocationBuffer,
  getLocationBufferCount,
  _resetTrackingStateForTesting,
  TrackingFailureReason,
} from '../location-tracking-service';

// Spy on logistics service methods
jest.mock('../logistics-service', () => ({
  updateJobLocation: jest.fn().mockResolvedValue(undefined),
  stopJobTracking: jest.fn().mockResolvedValue(undefined),
}));

describe('Location Tracking Service (Milestone 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetTrackingStateForTesting();

    // Default permissions: granted
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
        altitude: 15.5,
        accuracy: 4.2,
        heading: 180,
        speed: 12.5,
      },
      timestamp: 1718000000000,
    });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 15.5,
        accuracy: 4.2,
        heading: 180,
        speed: 12.5,
      },
      timestamp: 1718000000000,
    });
  });

  afterEach(() => {
    _resetTrackingStateForTesting();
  });

  // ==========================================================================
  // 1. PERMISSION MANAGEMENT TESTS
  // ==========================================================================
  describe('requestLocationPermissions', () => {
    it('requests foreground then background permissions when both are granted', async () => {
      const result = await requestLocationPermissions();
      expect(result).toEqual({ foreground: true, background: true });
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns foreground: false, background: false when foreground is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const result = await requestLocationPermissions();
      expect(result).toEqual({ foreground: false, background: false });
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
      // Should NOT request background if foreground was denied
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns foreground: true, background: false when background permission is denied', async () => {
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const result = await requestLocationPermissions();
      expect(result).toEqual({ foreground: true, background: false });
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('handles unexpected exceptions gracefully during permission checks', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Native module unavailable')
      );

      const result = await requestLocationPermissions();
      expect(result).toEqual({ foreground: false, background: false });
    });
  });

  // ==========================================================================
  // 2. START TRACKING LIFECYCLE TESTS
  // ==========================================================================
  describe('startTrackingJob', () => {
    it('successfully starts tracking for a job and updates Firestore with initial location', async () => {
      const jobId = 'job-101';
      const tenantId = 'tenant-alpha';

      const success = await startTrackingJob(jobId, tenantId, {
        driverId: 'driver-99',
        driverName: 'John Doe',
      });

      expect(success).toBe(true);
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe(jobId);
      expect(getActiveTenantId()).toBe(tenantId);

      // Verify Expo Location configuration
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
        LOCATION_TASK_NAME,
        expect.objectContaining({
          accuracy: Location.Accuracy.High,
          timeInterval: 120000,
          distanceInterval: 100,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Kuro Logistics Tracking',
            notificationBody: 'Live route tracking active',
          },
          pausesUpdatesAutomatically: true,
        })
      );

      // Verify initial location was queried and written to Firestore
      expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({
          latitude: -33.8688,
          longitude: 151.2093,
          driverId: 'driver-99',
          driverName: 'John Doe',
          jobId,
        })
      );
    });

    it('respects custom tracking options when provided', async () => {
      const jobId = 'job-custom-opts';
      const tenantId = 'tenant-custom';

      const success = await startTrackingJob(jobId, tenantId, {
        timeInterval: 60000,
        distanceInterval: 50,
        pausesUpdatesAutomatically: false,
      });

      expect(success).toBe(true);
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
        LOCATION_TASK_NAME,
        expect.objectContaining({
          timeInterval: 60000,
          distanceInterval: 50,
          pausesUpdatesAutomatically: false,
        })
      );
    });

    it('rejects invalid inputs without starting tracking', async () => {
      const res1 = await startTrackingJob('', 'tenant-1');
      expect(res1).toBe(false);
      expect(isTrackingActive()).toBe(false);

      const res2 = await startTrackingJob('job-1', '   ');
      expect(res2).toBe(false);
      expect(isTrackingActive()).toBe(false);

      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('handles permission denial gracefully and returns false', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const success = await startTrackingJob('job-102', 'tenant-alpha');
      expect(success).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('is idempotent when called multiple times for the same job', async () => {
      const jobId = 'job-idempotent';
      const tenantId = 'tenant-alpha';

      const firstStart = await startTrackingJob(jobId, tenantId);
      expect(firstStart).toBe(true);
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);

      // Calling start again for the same active job should return true without re-initializing
      const secondStart = await startTrackingJob(jobId, tenantId);
      expect(secondStart).toBe(true);
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
      expect(getActiveTrackingJobId()).toBe(jobId);
    });

    it('stops tracking previous job before starting a new job', async () => {
      const job1 = 'job-first';
      const job2 = 'job-second';
      const tenantId = 'tenant-alpha';

      await startTrackingJob(job1, tenantId);
      expect(getActiveTrackingJobId()).toBe(job1);

      // Start second job
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(true);
      await startTrackingJob(job2, tenantId);

      // Verify stopJobTracking was called for job1
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith(job1);
      expect(getActiveTrackingJobId()).toBe(job2);
    });

    it('handles initial position fetch error and falls back to last known position', async () => {
      (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('GPS timeout'));

      const success = await startTrackingJob('job-fallback', 'tenant-alpha');
      expect(success).toBe(true);
      expect(Location.getLastKnownPositionAsync).toHaveBeenCalledTimes(1);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        'job-fallback',
        expect.objectContaining({
          latitude: -33.8688,
          longitude: 151.2093,
        })
      );
    });

    it('falls back to last known position if initial position fix exceeds 50m accuracy threshold', async () => {
      (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
        coords: {
          latitude: -33.9999,
          longitude: 151.9999,
          altitude: 0,
          accuracy: 150, // Inaccurate initial fix
          heading: 0,
          speed: 0,
        },
        timestamp: 1718000000000,
      });

      (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValueOnce({
        coords: {
          latitude: -33.8688,
          longitude: 151.2093,
          altitude: 10,
          accuracy: 15, // Good cached fix
          heading: 0,
          speed: 0,
        },
        timestamp: 1718000000000,
      });

      const success = await startTrackingJob('job-fallback-accuracy', 'tenant-alpha');
      expect(success).toBe(true);
      expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
      expect(Location.getLastKnownPositionAsync).toHaveBeenCalledTimes(1);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        'job-fallback-accuracy',
        expect.objectContaining({
          latitude: -33.8688,
          longitude: 151.2093,
          accuracy: 15,
        })
      );
    });

    it('handles errors from startLocationUpdatesAsync and resets state', async () => {
      (Location.startLocationUpdatesAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Location updates failed')
      );

      const success = await startTrackingJob('job-err', 'tenant-alpha');
      expect(success).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
    });
  });

  // ==========================================================================
  // 3. STOP TRACKING LIFECYCLE TESTS
  // ==========================================================================
  describe('stopTrackingJob', () => {
    it('stops active tracking and updates Firestore document', async () => {
      const jobId = 'job-to-stop';
      const tenantId = 'tenant-alpha';

      await startTrackingJob(jobId, tenantId);
      expect(isTrackingActive()).toBe(true);

      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true);
      await stopTrackingJob(jobId);

      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(getActiveTenantId()).toBeNull();

      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith(jobId);
    });

    it('stops tracking when called with no explicit jobId (uses activeJobId)', async () => {
      const jobId = 'job-active-implicit';
      const tenantId = 'tenant-alpha';

      await startTrackingJob(jobId, tenantId);
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true);

      await stopTrackingJob();

      expect(isTrackingActive()).toBe(false);
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith(jobId);
    });

    it('is idempotent when called when tracking is not active', async () => {
      expect(isTrackingActive()).toBe(false);

      // Should not throw or fail
      await expect(stopTrackingJob('non-active-job')).resolves.not.toThrow();
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith('non-active-job');
      expect(isTrackingActive()).toBe(false);
    });
  });

  // ==========================================================================
  // 4. BACKGROUND TASK & LOCATION UPDATE HANDLING
  // ==========================================================================
  describe('handleLocationUpdate & Background Task Executor', () => {
    it('formats location object correctly and writes to Firestore', async () => {
      const jobId = 'job-bg-update';
      await startTrackingJob(jobId, 'tenant-alpha', {
        driverId: 'driver-42',
        driverName: 'Driver Sam',
      });

      const mockLocation: Location.LocationObject = {
        coords: {
          latitude: -33.8568,
          longitude: 151.2153,
          altitude: 20.0,
          accuracy: 3.5,
          heading: 90,
          speed: 15.0,
          altitudeAccuracy: null,
        },
        timestamp: 1718000500000,
      };

      const result = await handleLocationUpdate(mockLocation);

      expect(result).toEqual({
        latitude: -33.8568,
        longitude: 151.2153,
        altitude: 20.0,
        accuracy: 3.5,
        heading: 90,
        speed: 15.0,
        timestamp: 1718000500000,
        driverId: 'driver-42',
        driverName: 'Driver Sam',
        jobId,
      });

      expect(getLastKnownLocation()).toEqual(result);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(jobId, result);
    });

    it('triggers registered in-memory listeners on location update', async () => {
      const listenerSpy = jest.fn();
      const unsubscribe = addLocationListener(listenerSpy);

      const mockLocation: Location.LocationObject = {
        coords: {
          latitude: -33.8500,
          longitude: 151.2000,
          altitude: 0,
          accuracy: 5,
          heading: 0,
          speed: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1718000600000,
      };

      await handleLocationUpdate(mockLocation);
      expect(listenerSpy).toHaveBeenCalledTimes(1);
      expect(listenerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: -33.8500,
          longitude: 151.2000,
        })
      );

      // Unsubscribe and verify listener is not called again
      unsubscribe();
      await handleLocationUpdate(mockLocation);
      expect(listenerSpy).toHaveBeenCalledTimes(1);
    });

    it('executes background task registered with TaskManager', async () => {
      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);
      expect(executor).toBeDefined();

      const jobId = 'job-bg-executor';
      await startTrackingJob(jobId, 'tenant-alpha');

      const mockLocations = [
        {
          coords: {
            latitude: -33.8700,
            longitude: 151.2100,
            altitude: 10,
            accuracy: 5,
            heading: 45,
            speed: 10,
          },
          timestamp: 1718000700000,
        },
      ];

      // Simulate TaskManager calling the executor with data
      await executor({ data: { locations: mockLocations } });

      expect(getLastKnownLocation()?.latitude).toBe(-33.8700);
      expect(getLastKnownLocation()?.longitude).toBe(151.2100);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({
          latitude: -33.8700,
          longitude: 151.2100,
        })
      );
    });

    it('handles TaskManager error safely without throwing', async () => {
      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);
      expect(executor).toBeDefined();

      // Should not throw
      await expect(
        executor({ error: new Error('Simulated OS background location error') })
      ).resolves.not.toThrow();
    });

    it('handles empty or malformed TaskManager data gracefully', async () => {
      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);

      await expect(executor({ data: null })).resolves.not.toThrow();
      await expect(executor({ data: { locations: [] } })).resolves.not.toThrow();
    });

    it('returns null if handleLocationUpdate is passed invalid location object', async () => {
      const res = await handleLocationUpdate(null as any);
      expect(res).toBeNull();
    });

    it('discards location pings with accuracy > 50 meters and avoids Firestore writes and listener calls', async () => {
      const jobId = 'job-accuracy-test';
      await startTrackingJob(jobId, 'tenant-alpha');

      // Clear mock calls from initial position fetch in startTrackingJob
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();
      const listenerSpy = jest.fn();
      addLocationListener(listenerSpy);

      const inaccurateLocation: Location.LocationObject = {
        coords: {
          latitude: -33.8600,
          longitude: 151.2100,
          altitude: 10,
          accuracy: 50.1, // > 50 meters
          heading: 0,
          speed: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1718000800000,
      };

      const result = await handleLocationUpdate(inaccurateLocation);

      expect(result).toBeNull();
      expect(listenerSpy).not.toHaveBeenCalled();
      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
    });

    it('accepts location pings with accuracy <= 50 meters (including exact boundary 50m)', async () => {
      const jobId = 'job-accuracy-boundary';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const boundaryLocation: Location.LocationObject = {
        coords: {
          latitude: -33.8650,
          longitude: 151.2150,
          altitude: 10,
          accuracy: 50, // exactly 50 meters
          heading: 0,
          speed: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1718000850000,
      };

      const result = await handleLocationUpdate(boundaryLocation);

      expect(result).not.toBeNull();
      expect(result?.accuracy).toBe(50);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(jobId, result);
    });

    it('accepts location pings when accuracy is null or undefined without throwing', async () => {
      const jobId = 'job-accuracy-null';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const noAccuracyLocation: Location.LocationObject = {
        coords: {
          latitude: -33.8660,
          longitude: 151.2160,
          altitude: 10,
          accuracy: null as any,
          heading: 0,
          speed: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1718000860000,
      };

      const result = await handleLocationUpdate(noAccuracyLocation);

      expect(result).not.toBeNull();
      expect(result?.accuracy).toBeNull();
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(jobId, result);
    });

    it('discards inaccurate locations passed via TaskManager background executor', async () => {
      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);
      expect(executor).toBeDefined();

      const jobId = 'job-bg-inaccurate';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const inaccurateLocations = [
        {
          coords: {
            latitude: -33.9000,
            longitude: 151.3000,
            altitude: 10,
            accuracy: 120, // inaccurate jump
            heading: 0,
            speed: 0,
          },
          timestamp: 1718000900000,
        },
      ];

      await executor({ data: { locations: inaccurateLocations } });

      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
    });

    it('processes latest valid location in a TaskManager batch when trailing location is inaccurate', async () => {
      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);
      expect(executor).toBeDefined();

      const jobId = 'job-bg-batch';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const batchedLocations = [
        {
          coords: {
            latitude: -33.8710,
            longitude: 151.2110,
            altitude: 10,
            accuracy: 25, // Valid ping
            heading: 0,
            speed: 0,
          },
          timestamp: 1718000910000,
        },
        {
          coords: {
            latitude: -33.8720,
            longitude: 151.2120,
            altitude: 10,
            accuracy: 95, // Inaccurate jump
            heading: 0,
            speed: 0,
          },
          timestamp: 1718000920000,
        },
      ];

      await executor({ data: { locations: batchedLocations } });

      // Should have skipped the 95m jump and successfully written the 25m valid ping once
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledTimes(1);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({
          latitude: -33.8710,
          longitude: 151.2110,
          accuracy: 25,
        })
      );
    });

    it('discards location pings with negative, NaN, Infinity, or non-numeric accuracy values', async () => {
      const jobId = 'job-accuracy-edge';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      const baseCoords = {
        latitude: -33.8600,
        longitude: 151.2100,
        altitude: 10,
        heading: 0,
        speed: 0,
        altitudeAccuracy: null,
      };

      // 1. Negative accuracy (iOS CoreLocation invalid fix)
      const resNeg = await handleLocationUpdate({
        coords: { ...baseCoords, accuracy: -1 },
        timestamp: 1718000930000,
      });
      expect(resNeg).toBeNull();

      // 2. NaN accuracy
      const resNaN = await handleLocationUpdate({
        coords: { ...baseCoords, accuracy: NaN },
        timestamp: 1718000940000,
      });
      expect(resNaN).toBeNull();

      // 3. Infinity accuracy
      const resInf = await handleLocationUpdate({
        coords: { ...baseCoords, accuracy: Infinity },
        timestamp: 1718000950000,
      });
      expect(resInf).toBeNull();

      // 4. Non-number string accuracy
      const resStr = await handleLocationUpdate({
        coords: { ...baseCoords, accuracy: 'invalid' as any },
        timestamp: 1718000960000,
      });
      expect(resStr).toBeNull();

      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
    });

    it('discards location pings with invalid or non-finite latitude/longitude', async () => {
      const jobId = 'job-coords-edge';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      // NaN latitude
      const resNaNLat = await handleLocationUpdate({
        coords: {
          latitude: NaN,
          longitude: 151.2100,
          accuracy: 10,
          altitude: null,
          heading: null,
          speed: null,
          altitudeAccuracy: null,
        },
        timestamp: 1718000970000,
      });
      expect(resNaNLat).toBeNull();

      // Non-finite longitude
      const resInfLng = await handleLocationUpdate({
        coords: {
          latitude: -33.8600,
          longitude: Infinity,
          accuracy: 10,
          altitude: null,
          heading: null,
          speed: null,
          altitudeAccuracy: null,
        },
        timestamp: 1718000980000,
      });
      expect(resInfLng).toBeNull();

      // Out of bounds latitude (> 90)
      const resOutOfBoundsLat = await handleLocationUpdate({
        coords: {
          latitude: 95.0,
          longitude: 151.2100,
          accuracy: 10,
          altitude: null,
          heading: null,
          speed: null,
          altitudeAccuracy: null,
        },
        timestamp: 1718000990000,
      });
      expect(resOutOfBoundsLat).toBeNull();

      // Out of bounds longitude (< -180)
      const resOutOfBoundsLng = await handleLocationUpdate({
        coords: {
          latitude: -33.8600,
          longitude: -185.0,
          accuracy: 10,
          altitude: null,
          heading: null,
          speed: null,
          altitudeAccuracy: null,
        },
        timestamp: 1718001000000,
      });
      expect(resOutOfBoundsLng).toBeNull();

      expect(LogisticsService.updateJobLocation).not.toHaveBeenCalled();
    });

    it('accepts exact geographic boundary coordinates (-90, 90, -180, 180)', async () => {
      const jobId = 'job-coords-boundaries';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      // Exact North Pole & Date Line
      const northPole = await handleLocationUpdate({
        coords: {
          latitude: 90.0,
          longitude: 180.0,
          accuracy: 10,
          altitude: 0,
          heading: 0,
          speed: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1718001010000,
      });
      expect(northPole).not.toBeNull();
      expect(northPole?.latitude).toBe(90.0);
      expect(northPole?.longitude).toBe(180.0);

      // Exact South Pole & Antimeridian
      const southPole = await handleLocationUpdate({
        coords: {
          latitude: -90.0,
          longitude: -180.0,
          accuracy: 10,
          altitude: 0,
          heading: 0,
          speed: 0,
          altitudeAccuracy: null,
        },
        timestamp: 1718001020000,
      });
      expect(southPole).not.toBeNull();
      expect(southPole?.latitude).toBe(-90.0);
      expect(southPole?.longitude).toBe(-180.0);
    });

    it('preserves lastKnownLocation in memory when a subsequent inaccurate location is discarded', async () => {
      const jobId = 'job-retain-lastknown';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      // 1. Valid initial update
      const validPing: Location.LocationObject = {
        coords: {
          latitude: -33.8500,
          longitude: 151.2000,
          altitude: 10,
          accuracy: 15,
          heading: 90,
          speed: 10,
          altitudeAccuracy: null,
        },
        timestamp: 1718001030000,
      };
      const validResult = await handleLocationUpdate(validPing);
      expect(validResult).not.toBeNull();
      expect(getLastKnownLocation()?.latitude).toBe(-33.8500);

      // 2. Inaccurate jump arrives (> 50m)
      const inaccuratePing: Location.LocationObject = {
        coords: {
          latitude: -33.9000,
          longitude: 151.3000,
          altitude: 10,
          accuracy: 150,
          heading: 90,
          speed: 10,
          altitudeAccuracy: null,
        },
        timestamp: 1718001040000,
      };
      const discardedResult = await handleLocationUpdate(inaccuratePing);
      expect(discardedResult).toBeNull();

      // Verify lastKnownLocation is preserved as the previous valid location
      expect(getLastKnownLocation()?.latitude).toBe(-33.8500);
      expect(getLastKnownLocation()?.longitude).toBe(151.2000);
    });

    it('handles stationary pause and resumes movement tracking with fresh batch delivery', async () => {
      const executor = (TaskManager as any)._getTaskExecutor(LOCATION_TASK_NAME);
      expect(executor).toBeDefined();

      const jobId = 'job-stationary-resume';
      await startTrackingJob(jobId, 'tenant-alpha');
      (LogisticsService.updateJobLocation as jest.Mock).mockClear();

      // Device pauses during stationary period (no updates fired).
      // Device resumes movement: TaskManager dispatches batch with fresh movement coordinates.
      const resumedBatch = [
        {
          coords: {
            latitude: -33.8600,
            longitude: 151.2100,
            altitude: 15,
            accuracy: 8,
            heading: 180,
            speed: 20,
          },
          timestamp: 1718002000000,
        },
        {
          coords: {
            latitude: -33.8650,
            longitude: 151.2150,
            altitude: 15,
            accuracy: 5,
            heading: 180,
            speed: 25,
          },
          timestamp: 1718002120000,
        },
      ];

      await executor({ data: { locations: resumedBatch } });

      // Should have synced newest movement coordinate (-33.8650, 151.2150)
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledTimes(1);
      expect(LogisticsService.updateJobLocation).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({
          latitude: -33.8650,
          longitude: 151.2150,
          speed: 25,
          timestamp: 1718002120000,
        })
      );
      expect(getLastKnownLocation()?.latitude).toBe(-33.8650);
    });
  });

  // ==========================================================================
  // 5. STATUS GETTERS & DRIVER METADATA
  // ==========================================================================
  describe('Status Getters & Driver Metadata', () => {
    it('returns full tracking status snapshot', async () => {
      expect(getTrackingStatus()).toEqual({
        isTracking: false,
        activeJobId: null,
        activeTenantId: null,
        lastKnownLocation: null,
      });

      await startTrackingJob('job-snap', 'tenant-1');
      const status = getTrackingStatus();

      expect(status.isTracking).toBe(true);
      expect(status.activeJobId).toBe('job-snap');
      expect(status.activeTenantId).toBe('tenant-1');
      expect(status.lastKnownLocation).not.toBeNull();
    });

    it('updates driver info via setTrackingDriverInfo', async () => {
      setTrackingDriverInfo({ id: 'driver-777', name: 'Alex Rivera' });

      await startTrackingJob('job-driver-test', 'tenant-1');
      expect(getLastKnownLocation()?.driverId).toBe('driver-777');
      expect(getLastKnownLocation()?.driverName).toBe('Alex Rivera');
    });
  });

  // ==========================================================================
  // 6. REQUIREMENT R1: PREREQUISITE GATING & TYPED FAILURE REPORTING
  // ==========================================================================
  describe('Requirement R1: Prerequisite Gating & Typed Failure Reporting', () => {
    it('verifies isAccuracyPrecise correctly validates precise vs approximate accuracy', () => {
      // Null / undefined falls back to true for backward compatibility
      expect(isAccuracyPrecise(null)).toBe(true);
      expect(isAccuracyPrecise(undefined)).toBe(true);

      // Fine / Full precise permissions
      expect(isAccuracyPrecise({ status: 'granted', granted: true, accuracy: 'fine' } as any)).toBe(true);
      expect(isAccuracyPrecise({ status: 'granted', granted: true, android: { accuracy: 'fine' } } as any)).toBe(true);
      expect(isAccuracyPrecise({ status: 'granted', granted: true, ios: { accuracy: 'full' } } as any)).toBe(true);

      // Coarse / Approximate / Reduced permissions must be rejected
      expect(isAccuracyPrecise({ status: 'granted', granted: true, accuracy: 'coarse' } as any)).toBe(false);
      expect(isAccuracyPrecise({ status: 'granted', granted: true, accuracy: 'approximate' } as any)).toBe(false);
      expect(isAccuracyPrecise({ status: 'granted', granted: true, accuracy: 'reduced' } as any)).toBe(false);
      expect(isAccuracyPrecise({ status: 'granted', granted: true, android: { accuracy: 'coarse' } } as any)).toBe(false);
      expect(isAccuracyPrecise({ status: 'granted', granted: true, android: { accuracy: 'none' } } as any)).toBe(false);
      expect(isAccuracyPrecise({ status: 'granted', granted: true, ios: { accuracy: 'reduced' } } as any)).toBe(false);
    });

    it('rejects startTrackingJob with services_disabled when device GPS is disabled globally', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(false);

      const success = await startTrackingJob('job-gps-off', 'tenant-alpha');
      expect(success).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('services_disabled');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob with permission_denied when foreground permission is not granted', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const success = await startTrackingJob('job-fg-denied', 'tenant-alpha');
      expect(success).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(getSyncStatus().status).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob with permission_denied when background permission is explicitly denied', async () => {
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const success = await startTrackingJob('job-bg-denied', 'tenant-alpha');
      expect(success).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(getSyncStatus().status).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob with approximate_only when foreground accuracy is coarse', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        android: { accuracy: 'coarse' },
      });

      const success = await startTrackingJob('job-coarse-fg', 'tenant-alpha');
      expect(success).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob with approximate_only when background accuracy is reduced on iOS', async () => {
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        ios: { accuracy: 'reduced' },
      });

      const success = await startTrackingJob('job-reduced-bg', 'tenant-alpha');
      expect(success).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('successfully starts tracking and clears failure reason when all gating checks pass', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        accuracy: 'fine',
        android: { accuracy: 'fine' },
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        accuracy: 'fine',
        android: { accuracy: 'fine' },
      });

      const success = await startTrackingJob('job-happy-gating', 'tenant-alpha');
      expect(success).toBe(true);
      expect(isTrackingActive()).toBe(true);
      expect(getLastTrackingFailureReason()).toBeNull();
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalled();
    });

    it('sets internal_error failure reason when startTrackingJob is called with blank jobId or tenantId', async () => {
      const res1 = await startTrackingJob('', 'tenant-alpha');
      expect(res1).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('internal_error');

      const res2 = await startTrackingJob('job-test', '   ');
      expect(res2).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('internal_error');
    });

    it('clears lastTrackingFailureReason on reset for testing', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(false);
      await startTrackingJob('job-fail-reset', 'tenant-alpha');
      expect(getLastTrackingFailureReason()).toBe('services_disabled');

      _resetTrackingStateForTesting();
      expect(getLastTrackingFailureReason()).toBeNull();
    });
  });

  // ==========================================================================
  // 7. REQUIREMENT R4: OFFLINE BUFFERING & OPPORTUNISTIC AUTO-RETRY
  // ==========================================================================
  describe('Requirement R4: Offline Buffering & Opportunistic Auto-Retry', () => {
    it('opportunistically flushes offline buffer during location update and transitions to synced', async () => {
      await startTrackingJob('job-buffer-flush-test', 'tenant-alpha');

      // 1. First write fails with network offline error and buffers the coordinate
      (LogisticsService.updateJobLocation as jest.Mock).mockRejectedValueOnce(
        new Error('Network connection offline')
      );
      await handleLocationUpdate({
        coords: { latitude: -33.8688, longitude: 151.2093, altitude: 0, accuracy: 5, speed: 0, heading: 0, altitudeAccuracy: null },
        timestamp: 1756285400000,
      });

      expect(getSyncStatus().status).toBe('offline_failed');
      expect(getLocationBufferCount()).toBe(1);

      // 2. Next location update succeeds and triggers opportunistic flush
      (LogisticsService.updateJobLocation as jest.Mock).mockResolvedValue(undefined);
      await handleLocationUpdate({
        coords: { latitude: -33.8600, longitude: 151.2093, altitude: 0, accuracy: 5, speed: 12, heading: 0, altitudeAccuracy: null },
        timestamp: 1756285500000,
      });

      // Status must transition to synced and buffer must be flushed
      expect(getSyncStatus().status).toBe('synced');
      expect(getLocationBufferCount()).toBe(0);
    });

    it('flushLocationBuffer transitions to synced when buffer is empty during active tracking', async () => {
      await startTrackingJob('job-empty-flush-test', 'tenant-alpha');
      expect(isTrackingActive()).toBe(true);

      // Explicitly invoke flushLocationBuffer with empty buffer
      await flushLocationBuffer('job-empty-flush-test');
      expect(getSyncStatus().status).toBe('synced');
    });
  });

  // ==========================================================================
  // 8. REQUIREMENT R5: CONCURRENT JOB PROTECTION & TEARDOWN
  // ==========================================================================
  describe('Requirement R5: Concurrent Job Protection & Teardown', () => {
    it('seamlessly transitions from Job A to Job B without deadlock', async () => {
      const jobA = 'job-concurrent-A';
      const jobB = 'job-concurrent-B';
      const tenantId = 'tenant-fleet';

      // Start Job A
      const startA = await startTrackingJob(jobA, tenantId);
      expect(startA).toBe(true);
      expect(getActiveTrackingJobId()).toBe(jobA);

      // Start Job B while Job A is active
      const startB = await startTrackingJob(jobB, tenantId);
      expect(startB).toBe(true);
      expect(LogisticsService.stopJobTracking).toHaveBeenCalledWith(jobA);
      expect(getActiveTrackingJobId()).toBe(jobB);
    });

    it('clears in-memory locationBuffer when switching jobs to preserve isolation', async () => {
      const jobA = 'job-iso-A';
      const jobB = 'job-iso-B';
      const tenantId = 'tenant-fleet';

      await startTrackingJob(jobA, tenantId);

      // Simulate network offline write for Job A so coordinate is buffered
      (LogisticsService.updateJobLocation as jest.Mock).mockRejectedValueOnce(new Error('Offline'));
      await handleLocationUpdate({
        coords: { latitude: -33.8688, longitude: 151.2093, altitude: 0, accuracy: 5, speed: 0, heading: 0, altitudeAccuracy: null },
        timestamp: 1756285600000,
      });
      expect(getLocationBufferCount()).toBe(1);

      // Switching to Job B must flush/clear Job A's buffer
      (LogisticsService.updateJobLocation as jest.Mock).mockResolvedValue(undefined);
      await startTrackingJob(jobB, tenantId);

      expect(getActiveTrackingJobId()).toBe(jobB);
      expect(getLocationBufferCount()).toBe(0);
    });

    it('propagates error when stopping Job A fails and resets active tracking state', async () => {
      const jobA = 'job-err-A';
      const jobB = 'job-err-B';
      const tenantId = 'tenant-fleet';

      await startTrackingJob(jobA, tenantId);
      expect(getActiveTrackingJobId()).toBe(jobA);

      // Mock stopJobTracking to reject
      (LogisticsService.stopJobTracking as jest.Mock).mockRejectedValueOnce(
        new Error('Firestore permission denied on stop')
      );

      // Starting Job B should reject with the propagated error
      await expect(startTrackingJob(jobB, tenantId)).rejects.toThrow(
        'Firestore permission denied on stop'
      );

      // State must be cleanly deactivated, not corrupted into Job B
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
    });
  });
});
