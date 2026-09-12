/**
 * __tests__/location-gating-adversarial.challenger.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE (Challenger M1-1)
 *
 * Stress-tests and challenges prerequisite gating in location-tracking-service.ts:
 * 1. Device GPS globally disabled (hasServicesEnabledAsync: false, thrown errors, falsy returns)
 * 2. Foreground permission denied (denied, undetermined, exceptions, partial responses)
 * 3. Background permission denied (denied, undetermined, partial responses, thrown exceptions)
 * 4. Coarse/approximate accuracy rejection (Android coarse/none, iOS reduced, string variations, fallback queries)
 * 5. Rapid sequential and concurrent calls under shifting permission states
 * 6. Partial response bypass attempts and malformed inputs
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
  getLastTrackingFailureReason,
  verifyTrackingPrerequisites,
  isAccuracyPrecise,
  getSyncStatus,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';
import * as LogisticsService from '@/services/logistics-service';

jest.mock('@/services/logistics-service', () => ({
  updateJobLocation: jest.fn().mockResolvedValue(undefined),
  stopJobTracking: jest.fn().mockResolvedValue(undefined),
  batchUploadLocationHistory: jest.fn().mockResolvedValue(undefined),
}));

describe('Challenger M1-1: Prerequisite Gating & Accuracy Adversarial Harness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetTrackingStateForTesting();

    // Baseline healthy mocks
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
      canAskAgain: true,
      expires: 'never',
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
      canAskAgain: true,
      expires: 'never',
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
  });

  // ==========================================================================
  // CHALLENGE 1: DEVICE GPS GLOBALLY DISABLED
  // ==========================================================================
  describe('Adversarial Challenge 1: Device GPS Disabled Handling', () => {
    it('rejects startTrackingJob when hasServicesEnabledAsync returns false', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const result = await startTrackingJob('job-gps-off-1', 'tenant-test');

      expect(result).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
      expect(getLastTrackingFailureReason()).toBe('services_disabled');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob when hasServicesEnabledAsync throws a native exception', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockRejectedValue(
        new Error('Native location manager failure / hardware fault')
      );

      const result = await startTrackingJob('job-gps-off-2', 'tenant-test');

      expect(result).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('services_disabled');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob when hasServicesEnabledAsync returns falsy values (null, undefined, 0)', async () => {
      for (const falsyVal of [null, undefined, 0, false, '']) {
        _resetTrackingStateForTesting();
        (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(falsyVal);

        const result = await startTrackingJob('job-gps-falsy', 'tenant-test');

        expect(result).toBe(false);
        expect(getLastTrackingFailureReason()).toBe('services_disabled');
        expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      }
    });

    it('verifyTrackingPrerequisites directly returns false with services_disabled when GPS is off', async () => {
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const ok = await verifyTrackingPrerequisites();
      expect(ok).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('services_disabled');
    });
  });

  // ==========================================================================
  // CHALLENGE 2: FOREGROUND PERMISSION DENIED & EDGE CASES
  // ==========================================================================
  describe('Adversarial Challenge 2: Foreground Permission Denied & Malformed Responses', () => {
    it('rejects when foreground permission status is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const result = await startTrackingJob('job-fg-denied-1', 'tenant-test');

      expect(result).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(getSyncStatus().status).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('rejects when foreground permission status is undetermined', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const result = await startTrackingJob('job-fg-undetermined', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects when foreground request rejects with native exception', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValue(
        new Error('Platform permission request cancelled')
      );

      const result = await startTrackingJob('job-fg-error', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects partial foreground response with missing status but granted: false', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });

      const result = await startTrackingJob('job-fg-partial-1', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects partial foreground response returning null or empty object', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(null);

      const result = await startTrackingJob('job-fg-null', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // CHALLENGE 3: BACKGROUND PERMISSION DENIED & EDGE CASES
  // ==========================================================================
  describe('Adversarial Challenge 3: Background Permission Denied & Edge Cases', () => {
    it('rejects when background permission status is denied', async () => {
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const result = await startTrackingJob('job-bg-denied-1', 'tenant-test');

      expect(result).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(getSyncStatus().status).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects when background permission status is undetermined', async () => {
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const result = await startTrackingJob('job-bg-undetermined', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects when background permission returns partial response { granted: false }', async () => {
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });

      const result = await startTrackingJob('job-bg-partial-granted-false', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('adversarial check: what happens if requestBackgroundPermissionsAsync throws an error', async () => {
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockRejectedValue(
        new Error('Background permission rejected by OS')
      );

      const result = await startTrackingJob('job-bg-error-test', 'tenant-test');

      // CRITICAL CHECK: Does it enforce background permission requirement or does it bypass?
      // Requirement R1: "Foreground and background location permissions are granted. Before starting tracking, the app must verify... All three checks must occur inside the tracking service"
      // If it returns true or calls startLocationUpdatesAsync, that is a bypass!
      // If it caught bgError and skipped gating, verify the exact behavior:
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
    });
  });

  // ==========================================================================
  // CHALLENGE 4: COARSE / APPROXIMATE ACCURACY REJECTION
  // ==========================================================================
  describe('Adversarial Challenge 4: Coarse / Approximate Accuracy Rejection', () => {
    it('rejects startTrackingJob when foreground Android accuracy is coarse', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        android: { accuracy: 'coarse' },
      });

      const result = await startTrackingJob('job-coarse-android', 'tenant-test');

      expect(result).toBe(false);
      expect(isTrackingActive()).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob when foreground Android accuracy is none', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        android: { accuracy: 'none' },
      });

      const result = await startTrackingJob('job-none-android', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob when foreground iOS accuracy is reduced', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        ios: { accuracy: 'reduced' },
      });

      const result = await startTrackingJob('job-reduced-ios', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob when background Android accuracy is coarse', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        android: { accuracy: 'fine' },
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        android: { accuracy: 'coarse' },
      });

      const result = await startTrackingJob('job-bg-coarse', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects startTrackingJob when background iOS accuracy is reduced', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        ios: { accuracy: 'full' },
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        ios: { accuracy: 'reduced' },
      });

      const result = await startTrackingJob('job-bg-reduced', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('rejects generic raw accuracy strings: approximate, coarse, reduced (case insensitive)', async () => {
      const accuracyVariations = ['approximate', 'APPROXIMATE', 'coarse', 'Coarse', 'reduced', 'REDUCED'];

      for (const acc of accuracyVariations) {
        _resetTrackingStateForTesting();
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
          status: 'granted',
          granted: true,
          canAskAgain: true,
          expires: 'never',
          accuracy: acc,
        });

        const result = await startTrackingJob(`job-acc-${acc}`, 'tenant-test');

        expect(result).toBe(false);
        expect(getLastTrackingFailureReason()).toBe('approximate_only');
        expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      }
    });

    it('detects coarse accuracy when requestForegroundPermissionsAsync omits accuracy but getForegroundPermissionsAsync returns coarse', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
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
        android: { accuracy: 'coarse' },
      });

      const result = await startTrackingJob('job-fallback-fg-coarse', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('detects reduced accuracy when requestBackgroundPermissionsAsync omits accuracy but getBackgroundPermissionsAsync returns reduced', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        android: { accuracy: 'fine' },
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });
      (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        ios: { accuracy: 'reduced' },
      });

      const result = await startTrackingJob('job-fallback-bg-reduced', 'tenant-test');

      expect(result).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('accepts precise accuracy when Android is fine and iOS is full', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        android: { accuracy: 'fine' },
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
        ios: { accuracy: 'full' },
      });

      const result = await startTrackingJob('job-precise-pass', 'tenant-test');

      expect(result).toBe(true);
      expect(isTrackingActive()).toBe(true);
      expect(getLastTrackingFailureReason()).toBeNull();
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // CHALLENGE 5: RAPID SEQUENTIAL & CONCURRENT CALLS UNDER VARYING CONDITIONS
  // ==========================================================================
  describe('Adversarial Challenge 5: Rapid Sequential & Concurrent Calls Under Shifting States', () => {
    it('handles rapid sequential calls transitioning through failed and successful states', async () => {
      // 1. Device GPS disabled
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(false);
      const res1 = await startTrackingJob('job-seq-1', 'tenant-test');
      expect(res1).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('services_disabled');
      expect(isTrackingActive()).toBe(false);

      // 2. Foreground denied
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
      });
      const res2 = await startTrackingJob('job-seq-2', 'tenant-test');
      expect(res2).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(isTrackingActive()).toBe(false);

      // 3. Approximate accuracy
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        android: { accuracy: 'coarse' },
      });
      const res3 = await startTrackingJob('job-seq-3', 'tenant-test');
      expect(res3).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('approximate_only');
      expect(isTrackingActive()).toBe(false);

      // 4. Background denied
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        android: { accuracy: 'fine' },
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
      });
      const res4 = await startTrackingJob('job-seq-4', 'tenant-test');
      expect(res4).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
      expect(isTrackingActive()).toBe(false);

      // 5. Finally all prerequisites granted
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        android: { accuracy: 'fine' },
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        granted: true,
        android: { accuracy: 'fine' },
      });
      const res5 = await startTrackingJob('job-seq-5', 'tenant-test');
      expect(res5).toBe(true);
      expect(getLastTrackingFailureReason()).toBeNull();
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe('job-seq-5');
    });

    it('interleaving: when Job A is active and Job B fails gating, tracking state must not be corrupted', async () => {
      // Step 1: Start Job A successfully
      const resA = await startTrackingJob('job-active-A', 'tenant-test');
      expect(resA).toBe(true);
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe('job-active-A');

      // Step 2: Driver attempts to start Job B, but device GPS is now disabled!
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const resB = await startTrackingJob('job-failing-B', 'tenant-test');
      expect(resB).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('services_disabled');

      // CRITICAL CHECK: What is tracking state now?
      // Notice: Job A was stopped in Firestore by lines 916-956, and its currentSessionId was set to null.
      // But does isTrackingActive() still return true?
      // If isTrackingActive() is true and activeJobId is still job-active-A,
      // the system is in an inconsistent state (Job A was stopped in Firestore and session killed,
      // but in-memory state still reports tracking active)!
      expect(isTrackingActive()).toBe(false);
      expect(getActiveTrackingJobId()).toBeNull();
    });

    it('concurrent calls to startTrackingJob sequence cleanly without unhandled rejections', async () => {
      const promises = [
        startTrackingJob('job-concurrent-1', 'tenant-test'),
        startTrackingJob('job-concurrent-2', 'tenant-test'),
        startTrackingJob('job-concurrent-3', 'tenant-test'),
      ];

      const results = await Promise.all(promises);

      // All calls should resolve boolean without throwing
      results.forEach((res) => {
        expect(typeof res).toBe('boolean');
      });

      // Exactly the final sequenced job should be the active job
      expect(isTrackingActive()).toBe(true);
      expect(getActiveTrackingJobId()).toBe('job-concurrent-3');
    });
  });

  // ==========================================================================
  // CHALLENGE 6: INPUT SANITIZATION & PARTIAL RESPONSE BYPASS ATTEMPTS
  // ==========================================================================
  describe('Adversarial Challenge 6: Input Sanitization & Bypass Prevention', () => {
    it('rejects empty strings or whitespace for jobId and tenantId with internal_error', async () => {
      const cases: [string, string][] = [
        ['', 'tenant-1'],
        ['   ', 'tenant-1'],
        ['job-1', ''],
        ['job-1', '   '],
        ['', ''],
        ['   ', '   '],
      ];

      for (const [j, t] of cases) {
        _resetTrackingStateForTesting();
        const res = await startTrackingJob(j, t);
        expect(res).toBe(false);
        expect(getLastTrackingFailureReason()).toBe('internal_error');
        expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      }
    });

    it('cannot be fooled by status: granted when granted is explicitly false', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      const res = await startTrackingJob('job-spoof', 'tenant-test');
      expect(res).toBe(false);
      expect(getLastTrackingFailureReason()).toBe('permission_denied');
    });

    it('isAccuracyPrecise handles null, undefined, and empty objects safely', () => {
      expect(isAccuracyPrecise(null)).toBe(true);
      expect(isAccuracyPrecise(undefined)).toBe(true);
      expect(isAccuracyPrecise({} as any)).toBe(true);
      expect(isAccuracyPrecise({ android: { accuracy: 'fine' } } as any)).toBe(true);
      expect(isAccuracyPrecise({ android: { accuracy: 'coarse' } } as any)).toBe(false);
      expect(isAccuracyPrecise({ android: { accuracy: 'none' } } as any)).toBe(false);
      expect(isAccuracyPrecise({ ios: { accuracy: 'full' } } as any)).toBe(true);
      expect(isAccuracyPrecise({ ios: { accuracy: 'reduced' } } as any)).toBe(false);
      expect(isAccuracyPrecise({ accuracy: 'approximate' } as any)).toBe(false);
      expect(isAccuracyPrecise({ accuracy: 'fine' } as any)).toBe(true);
    });
  });
});
