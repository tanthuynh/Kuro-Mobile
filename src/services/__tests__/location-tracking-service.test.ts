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
  _resetTrackingStateForTesting,
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
          timeInterval: 10000,
          distanceInterval: 10,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Kuro Logistics Tracking',
            notificationBody: 'Live route tracking active',
          },
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
});
