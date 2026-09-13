/**
 * __tests__/rapid-job-switch-gating.challenger.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER STRESS HARNESS (Challenger M1-R2)
 *
 * Dedicated regression and stress verification for:
 * Rapid sequential and concurrent job switches where subsequent jobs fail gating.
 * Verifies that isTrackingActive() remains false and getActiveTrackingJobId() is null.
 */

import * as Location from 'expo-location';
import {
  startTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  getActiveTenantId,
  getLastTrackingFailureReason,
  getSyncStatus,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';
import * as LogisticsService from '@/services/logistics-service';

jest.mock('@/services/logistics-service', () => ({
  updateJobLocation: jest.fn().mockResolvedValue(undefined),
  stopJobTracking: jest.fn().mockResolvedValue(undefined),
  batchUploadLocationHistory: jest.fn().mockResolvedValue(undefined),
}));

describe('Challenger M1-R2: Rapid Sequential Job Switches Gating Failure Stress Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetTrackingStateForTesting();

    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      accuracy: 'fine',
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
    });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      accuracy: 'fine',
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
    });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      accuracy: 'fine',
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
    });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      accuracy: 'fine',
      android: { accuracy: 'fine' },
      ios: { accuracy: 'full' },
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
        heading: 0,
        speed: 0,
      },
      timestamp: Date.now(),
    });
  });

  afterEach(() => {
    _resetTrackingStateForTesting();
  });

  it('verifies state cleanup across 10 rapid sequential failing job switches after an active job', async () => {
    // 1. Start Initial Active Job
    const started = await startTrackingJob('job-active-initial', 'tenant-1');
    expect(started).toBe(true);
    expect(isTrackingActive()).toBe(true);
    expect(getActiveTrackingJobId()).toBe('job-active-initial');
    expect(getActiveTenantId()).toBe('tenant-1');

    // Define 10 diverse failure modes
    const failureScenarios = [
      {
        name: 'GPS disabled',
        setup: () => {
          (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
        },
        expectedReason: 'services_disabled',
      },
      {
        name: 'Foreground denied',
        setup: () => {
          (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
          (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
            status: 'denied',
            granted: false,
          });
        },
        expectedReason: 'permission_denied',
      },
      {
        name: 'Foreground coarse accuracy',
        setup: () => {
          (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
            status: 'granted',
            granted: true,
            android: { accuracy: 'coarse' },
          });
        },
        expectedReason: 'approximate_only',
      },
      {
        name: 'Background denied',
        setup: () => {
          (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
            status: 'granted',
            granted: true,
            android: { accuracy: 'fine' },
          });
          (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
            status: 'denied',
            granted: false,
          });
        },
        expectedReason: 'permission_denied',
      },
      {
        name: 'Background exception thrown (Bug 1 regression check)',
        setup: () => {
          (Location.requestBackgroundPermissionsAsync as jest.Mock).mockRejectedValue(
            new Error('Native background permission failure')
          );
        },
        expectedReason: 'permission_denied',
      },
      {
        name: 'Background reduced accuracy iOS',
        setup: () => {
          (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
            status: 'granted',
            granted: true,
            ios: { accuracy: 'reduced' },
          });
        },
        expectedReason: 'approximate_only',
      },
      {
        name: 'Device GPS throws exception',
        setup: () => {
          (Location.hasServicesEnabledAsync as jest.Mock).mockRejectedValue(
            new Error('Hardware sensor query failure')
          );
        },
        expectedReason: 'services_disabled',
      },
      {
        name: 'Foreground undetermined status',
        setup: () => {
          (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
          (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
            status: 'undetermined',
            granted: false,
          });
        },
        expectedReason: 'permission_denied',
      },
      {
        name: 'Background partial response { granted: false }',
        setup: () => {
          (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
            status: 'granted',
            granted: true,
            android: { accuracy: 'fine' },
          });
          (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
            granted: false,
          });
        },
        expectedReason: 'permission_denied',
      },
      {
        name: 'Whitespace/empty jobId',
        setup: () => {
          (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
            status: 'granted',
            granted: true,
            accuracy: 'fine',
          });
        },
        jobId: '   ',
        expectedReason: 'internal_error',
      },
    ];

    for (let i = 0; i < failureScenarios.length; i++) {
      const scenario = failureScenarios[i];
      scenario.setup();

      const jobId = scenario.jobId ?? `failing-job-${i + 1}`;
      const result = await startTrackingJob(jobId, 'tenant-1');

      expect(result).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(getActiveTenantId()).toBeNull();
      expect(getLastTrackingFailureReason()).toBe(scenario.expectedReason);
    }
  });

  it('verifies concurrent burst switches where all jobs fail gating', async () => {
    // Start initial job
    const started = await startTrackingJob('job-active-initial', 'tenant-1');
    expect(started).toBe(true);

    // Make all gating fail (GPS off)
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

    // Launch 15 concurrent start attempts
    const burstPromises = Array.from({ length: 15 }, (_, idx) =>
      startTrackingJob(`burst-job-${idx}`, 'tenant-1')
    );

    const burstResults = await Promise.all(burstPromises);

    burstResults.forEach((res) => {
      expect(res).toBe(false);
    });

    expect(isTrackingActive()).toBe(false);
    expect(getActiveTrackingJobId()).toBeNull();
    expect(getActiveTenantId()).toBeNull();
    expect(getLastTrackingFailureReason()).toBe('services_disabled');
  });

  it('verifies recovery sequence: Active -> Fail -> Active -> Fail', async () => {
    // 1. Initial Job A active
    let res = await startTrackingJob('job-seq-A', 'tenant-1');
    expect(res).toBe(true);
    expect(isTrackingActive()).toBe(true);
    expect(getActiveTrackingJobId()).toBe('job-seq-A');

    // 2. Switch to Job B which throws background exception
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockRejectedValueOnce(
      new Error('OS background permission dialog crash')
    );
    res = await startTrackingJob('job-seq-B', 'tenant-1');
    expect(res).toBe(false);
    expect(isTrackingActive()).toBe(false);
    expect(getActiveTrackingJobId()).toBeNull();
    expect(getActiveTenantId()).toBeNull();
    expect(getLastTrackingFailureReason()).toBe('permission_denied');

    // 3. Switch to Job C which has valid prerequisites
    res = await startTrackingJob('job-seq-C', 'tenant-1');
    expect(res).toBe(true);
    expect(isTrackingActive()).toBe(true);
    expect(getActiveTrackingJobId()).toBe('job-seq-C');
    expect(getActiveTenantId()).toBe('tenant-1');
    expect(getLastTrackingFailureReason()).toBeNull();

    // 4. Switch to Job D which has coarse accuracy
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'granted',
      granted: true,
      android: { accuracy: 'coarse' },
    });
    res = await startTrackingJob('job-seq-D', 'tenant-1');
    expect(res).toBe(false);
    expect(isTrackingActive()).toBe(false);
    expect(getActiveTrackingJobId()).toBeNull();
    expect(getActiveTenantId()).toBeNull();
    expect(getLastTrackingFailureReason()).toBe('approximate_only');
  });

  it('handles stopJobTracking rejection gracefully during job switch without corrupting state', async () => {
    // Start initial job
    const started = await startTrackingJob('job-active-initial', 'tenant-1');
    expect(started).toBe(true);

    // Make stopJobTracking reject
    (LogisticsService.stopJobTracking as jest.Mock).mockRejectedValueOnce(
      new Error('Firestore network timeout during stop')
    );

    // Attempt switch to Job B
    await expect(startTrackingJob('job-switch-err', 'tenant-1')).rejects.toThrow(
      'Firestore network timeout during stop'
    );

    // Even when stop throws, tracking state must be cleared and not corrupted
    expect(isTrackingActive()).toBe(false);
    expect(getActiveTrackingJobId()).toBeNull();
    expect(getActiveTenantId()).toBeNull();
  });
});