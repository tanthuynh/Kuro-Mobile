/**
 * __tests__/gps-lifecycle-transitions.adversarial.test.tsx
 * Empirical Adversarial & Stress Testing for GPS Lifecycle & Job State Transitions.
 *
 * Authored by Challenger 1.
 * Tests:
 * 1. Button contract verification (Play, Pause, Finish).
 * 2. Rapid sequential state transitions (Play -> Pause -> Play -> Finish).
 * 3. Idempotency under duplicate taps.
 * 4. Error propagation and fault recovery when locationTrackingService or logisticsService fails.
 * 5. Concurrent tracking switch when another job is active.
 * 6. QuickStatusSelector interaction and tracking auto-start/auto-stop.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import LogisticsJobDetailScreen from '../app/logistics/[id]';
import * as logisticsService from '../src/services/logistics-service';
import * as locationTrackingService from '../src/services/location-tracking-service';
import type { LogisticsEntry } from '../src/types/logistics';

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

// Mock Expo Location & TaskManager
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  Accuracy: {
    High: 4,
    Balanced: 3,
  },
  ActivityType: {
    AutomotiveNavigation: 2,
  },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(true),
}));

// Mock Theme
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => ({
      colors: actualTheme.darkColors,
      typography: actualTheme.typography,
      spacing: actualTheme.spacing,
      layout: actualTheme.layout,
      isDark: true,
    }),
    ThemeProvider: ({ children }: any) => children,
  };
});

// Mock Auth Context
const mockDriver = {
  id: 'usr-driver-challenger-01',
  uid: 'usr-driver-challenger-01',
  name: 'Challenger Driver',
  email: 'challenger@kuro.test',
  tenantId: 'tenant-stress-test',
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockDriver,
    tenant: { tenantId: 'tenant-stress-test', tenantName: 'Stress Fleet' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock Router
const mockBack = jest.fn();
let mockSearchParamId = 'job-stress-100';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
  useLocalSearchParams: () => ({
    id: mockSearchParamId,
  }),
}));

const createMockJob = (overrides?: Partial<LogisticsEntry>): LogisticsEntry => ({
  id: 'job-stress-100',
  tenantId: 'tenant-stress-test',
  eventNumber: 9991,
  eventName: 'Festival Stage Audio Delivery',
  location: 'Centennial Parklands, Sydney NSW',
  status: 'Scheduled',
  driverName: 'Challenger Driver',
  assigneeId: 'usr-driver-challenger-01',
  vehicleId: 'veh-stress-01',
  start: new Date('2026-09-01T08:00:00Z'),
  end: new Date('2026-09-01T14:00:00Z'),
  createdBy: 'Fleet Lead',
  updatedBy: 'Fleet Lead',
  createdAt: '2026-09-01T06:00:00Z',
  updatedAt: '2026-09-01T06:00:00Z',
  archived: false,
  isTrackingActive: false,
  notes: '',
  destinations: [
    {
      id: 'dest-1',
      type: 'destination',
      destinationName: 'Main Arena',
      address: 'Grand Dr, Centennial Park NSW',
      contact: '0412345678',
    },
  ],
  ...overrides,
});

describe('Adversarial Stress Harness: GPS Lifecycle & State Transitions', () => {
  let mockJobState: LogisticsEntry;
  let listeners: ((entry: LogisticsEntry | null) => void)[] = [];

  beforeEach(() => {
    jest.restoreAllMocks();
    locationTrackingService._resetTrackingStateForTesting();
    mockSearchParamId = 'job-stress-100';
    mockJobState = createMockJob();
    listeners = [];

    jest.spyOn(logisticsService, 'getLogisticsEntry').mockImplementation(async () => mockJobState);
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      listeners.push(cb);
      cb(mockJobState);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    });

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
        latitude: -33.8568,
        longitude: 151.2153,
        altitude: 12.0,
        accuracy: 4.0,
        heading: 90,
        speed: 10.5,
      },
      timestamp: 1756285200000,
    });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8568,
        longitude: 151.2153,
        altitude: 12.0,
        accuracy: 4.0,
        heading: 90,
        speed: 10.5,
      },
      timestamp: 1756285200000,
    });
    jest.spyOn(logisticsService, 'fetchVehicleById').mockResolvedValue({
      id: 'veh-stress-01',
      name: 'Stress Van 01',
      rego: 'STRESS-01',
    });
  });

  const notifySubscribers = (updated: Partial<LogisticsEntry>) => {
    mockJobState = { ...mockJobState, ...updated };
    listeners.forEach((l) => l(mockJobState));
  };

  describe('1. Standard Button Actions & Contract Verification', () => {
    it('Play button triggers startTrackingJob and updateLogisticsStatus("In Progress")', async () => {
      const startTrackingSpy = jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValue(true);
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValue(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(playBtn);
      });

      expect(startTrackingSpy).toHaveBeenCalledWith(
        'job-stress-100',
        'tenant-stress-test',
        expect.objectContaining({
          driverId: 'usr-driver-challenger-01',
          driverName: 'Challenger Driver',
        })
      );
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-stress-100',
        'In Progress',
        expect.objectContaining({
          note: 'Driver started route and initiated GPS tracking',
          tenantId: 'tenant-stress-test',
        })
      );
    });

    it('Pause button triggers stopTrackingJob and leaves status untouched', async () => {
      mockJobState = createMockJob({ status: 'In Progress', isTrackingActive: true });
      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob').mockResolvedValue(undefined);
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const pauseBtn = await findByTestId('pause-job-btn');

      await act(async () => {
        fireEvent.press(pauseBtn);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-stress-100');
      expect(updateStatusSpy).not.toHaveBeenCalled();
    });

    it('Finish button triggers stopTrackingJob and updateLogisticsStatus("Completed")', async () => {
      mockJobState = createMockJob({ status: 'In Progress', isTrackingActive: true });
      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob').mockResolvedValue(undefined);
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValue(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-stress-100');
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-stress-100',
        'Completed',
        expect.objectContaining({
          note: 'Driver marked job as completed',
          tenantId: 'tenant-stress-test',
        })
      );
    });
  });

  describe('2. Rapid Sequential Interactions & Transition Sequence Stress Test', () => {
    it('executes rapid sequence: Play -> Pause -> Play -> Finish without state corruption', async () => {
      const startTrackingSpy = jest.spyOn(locationTrackingService, 'startTrackingJob').mockImplementation(async () => {
        notifySubscribers({ isTrackingActive: true, status: 'In Progress' });
        return true;
      });
      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob').mockImplementation(async () => {
        notifySubscribers({ isTrackingActive: false });
      });
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(async (_jId, st) => {
        notifySubscribers({ status: st as any });
      });

      const { findByTestId } = render(<LogisticsJobDetailScreen />);

      // Step 1: Tap Play
      const playBtn = await findByTestId('play-job-btn');
      await act(async () => {
        fireEvent.press(playBtn);
      });

      expect(startTrackingSpy).toHaveBeenCalledTimes(1);
      expect(updateStatusSpy).toHaveBeenCalledWith('job-stress-100', 'In Progress', expect.anything());
      expect(mockJobState.isTrackingActive).toBe(true);
      expect(mockJobState.status).toBe('In Progress');

      // Step 2: Tap Pause
      const pauseBtn = await findByTestId('pause-job-btn');
      await act(async () => {
        fireEvent.press(pauseBtn);
      });

      expect(stopTrackingSpy).toHaveBeenCalledTimes(1);
      expect(mockJobState.isTrackingActive).toBe(false);
      expect(mockJobState.status).toBe('In Progress'); // Preserved status

      // Step 3: Tap Play again
      await act(async () => {
        fireEvent.press(playBtn);
      });

      expect(startTrackingSpy).toHaveBeenCalledTimes(2);
      expect(mockJobState.isTrackingActive).toBe(true);

      // Step 4: Tap Finish
      const finishBtn = await findByTestId('finish-job-btn');
      await act(async () => {
        fireEvent.press(finishBtn);
      });

      expect(stopTrackingSpy).toHaveBeenCalledTimes(2);
      expect(updateStatusSpy).toHaveBeenCalledWith('job-stress-100', 'Completed', expect.anything());
      expect(mockJobState.status).toBe('Completed');
    });

    it('sets loading and disabled state on Play button while starting', async () => {
      let resolveStart: (val: boolean) => void;
      const startTrackingPromise = new Promise<boolean>((resolve) => {
        resolveStart = resolve;
      });

      jest.spyOn(locationTrackingService, 'startTrackingJob').mockReturnValue(startTrackingPromise);
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValue(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      // Trigger click
      act(() => {
        fireEvent.press(playBtn);
      });

      // Verify button reflects disabled and busy accessibility state
      expect(playBtn.props.accessibilityState?.disabled).toBe(true);
      expect(playBtn.props.accessibilityState?.busy).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolveStart!(true);
      });

      // After resolving, button returns to active state
      expect(playBtn.props.accessibilityState?.disabled).toBe(false);
      expect(playBtn.props.accessibilityState?.busy).toBe(false);
    });

    it('sets loading and disabled state on Finish button while completing', async () => {
      mockJobState = createMockJob({ status: 'In Progress', isTrackingActive: true });

      let resolveStatus: () => void;
      const updateStatusPromise = new Promise<void>((resolve) => {
        resolveStatus = resolve;
      });

      jest.spyOn(locationTrackingService, 'stopTrackingJob').mockResolvedValue(undefined);
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockReturnValue(updateStatusPromise);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      act(() => {
        fireEvent.press(finishBtn);
      });

      expect(finishBtn.props.accessibilityState?.disabled).toBe(true);
      expect(finishBtn.props.accessibilityState?.busy).toBe(true);

      await act(async () => {
        resolveStatus!();
      });

      expect(finishBtn.props.accessibilityState?.disabled).toBe(false);
      expect(finishBtn.props.accessibilityState?.busy).toBe(false);
    });
  });

  describe('3. Error Handling & Fault Resilience', () => {
    it('displays error banner and resets loading state when startTrackingJob throws', async () => {
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockRejectedValueOnce(
        new Error('GPS Hardware Failure: No signal available')
      );
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(playBtn);
      });

      // Verify error banner is rendered with message
      expect(await findByText('GPS Hardware Failure: No signal available')).toBeTruthy();
      // Status update must not have occurred
      expect(updateStatusSpy).not.toHaveBeenCalled();
      // Play button is re-enabled (not stuck in loading)
      expect(playBtn.props.accessibilityState?.disabled).toBeFalsy();
    });

    it('displays error banner when updateLogisticsStatus throws on Play', async () => {
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(true);
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockRejectedValueOnce(
        new Error('Network disconnected: Firestore write failed')
      );

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(playBtn);
      });

      expect(await findByText('Network disconnected: Firestore write failed')).toBeTruthy();
    });

    it('displays error banner and resets loading state when stopTrackingJob throws on Pause', async () => {
      mockJobState = createMockJob({ status: 'In Progress', isTrackingActive: true });
      jest.spyOn(locationTrackingService, 'stopTrackingJob').mockRejectedValueOnce(
        new Error('Location service unbind error')
      );

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      const pauseBtn = await findByTestId('pause-job-btn');

      await act(async () => {
        fireEvent.press(pauseBtn);
      });

      expect(await findByText('Location service unbind error')).toBeTruthy();
      expect(pauseBtn.props.accessibilityState?.disabled).toBeFalsy();
    });

    it('displays error banner when updateLogisticsStatus throws on Finish', async () => {
      mockJobState = createMockJob({ status: 'In Progress', isTrackingActive: true });
      jest.spyOn(locationTrackingService, 'stopTrackingJob').mockResolvedValueOnce(undefined);
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockRejectedValueOnce(
        new Error('Permission denied on job document')
      );

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      expect(await findByText('Permission denied on job document')).toBeTruthy();
    });
  });

  describe('4. QuickStatusSelector GPS Synchronization', () => {
    it('auto-starts tracking when selecting "In Progress" from QuickStatusSelector if tracking is idle', async () => {
      const startTrackingSpy = jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(true);
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValueOnce(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const inProgressPill = await findByTestId('status-btn-in-progress');

      await act(async () => {
        fireEvent.press(inProgressPill);
      });

      expect(startTrackingSpy).toHaveBeenCalledWith('job-stress-100', 'tenant-stress-test', expect.anything());
      expect(updateStatusSpy).toHaveBeenCalledWith('job-stress-100', 'In Progress', expect.anything());
    });

    it('auto-stops tracking when selecting "Completed" from QuickStatusSelector', async () => {
      mockJobState = createMockJob({ status: 'In Progress', isTrackingActive: true });
      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob').mockResolvedValueOnce(undefined);
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValueOnce(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const completedPill = await findByTestId('status-btn-completed');

      await act(async () => {
        fireEvent.press(completedPill);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-stress-100');
      expect(updateStatusSpy).toHaveBeenCalledWith('job-stress-100', 'Completed', expect.anything());
    });

    it('auto-stops tracking when selecting "Cancelled" from QuickStatusSelector', async () => {
      mockJobState = createMockJob({ status: 'In Progress', isTrackingActive: true });
      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob').mockResolvedValueOnce(undefined);
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValueOnce(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const cancelledPill = await findByTestId('status-btn-cancelled');

      await act(async () => {
        fireEvent.press(cancelledPill);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-stress-100');
      expect(updateStatusSpy).toHaveBeenCalledWith('job-stress-100', 'Cancelled', expect.anything());
    });
  });

  describe('5. Location Tracking Service Native In-Memory Engine Verification', () => {
    it('handles coordinate updates and filters out invalid coordinates and low accuracy pings (>50m)', async () => {
      const updateJobLocationSpy = jest.spyOn(logisticsService, 'updateJobLocation').mockResolvedValue(undefined);

      // Start tracking active job
      const startRes = await locationTrackingService.startTrackingJob('job-stress-100', 'tenant-stress-test');
      expect(startRes).toBe(true);

      // 1. Valid coordinate ping
      const validPing = {
        coords: {
          latitude: -33.8568,
          longitude: 151.2153,
          accuracy: 10,
          altitude: 15,
          heading: 180,
          speed: 12.5,
        },
        timestamp: 1756285200000,
      } as any;

      const result1 = await locationTrackingService.handleLocationUpdate(validPing);
      expect(result1).not.toBeNull();
      expect(result1?.latitude).toBe(-33.8568);
      expect(result1?.longitude).toBe(151.2153);
      expect(updateJobLocationSpy).toHaveBeenCalledWith('job-stress-100', expect.objectContaining({
        latitude: -33.8568,
        longitude: 151.2153,
      }));

      // 2. Out-of-bounds latitude (latitude > 90)
      const invalidLatPing = {
        coords: {
          latitude: 95.0,
          longitude: 151.2153,
          accuracy: 5,
        },
        timestamp: 1756285200000,
      } as any;
      const result2 = await locationTrackingService.handleLocationUpdate(invalidLatPing);
      expect(result2).toBeNull();

      // 3. Low accuracy ping (> 50m)
      const lowAccuracyPing = {
        coords: {
          latitude: -33.8568,
          longitude: 151.2153,
          accuracy: 120, // 120 meters > 50 threshold
        },
        timestamp: 1756285200000,
      } as any;
      const result3 = await locationTrackingService.handleLocationUpdate(lowAccuracyPing);
      expect(result3).toBeNull();

      // 4. NaN coordinates
      const nanPing = {
        coords: {
          latitude: NaN,
          longitude: 151.2153,
        },
        timestamp: 1756285200000,
      } as any;
      const result4 = await locationTrackingService.handleLocationUpdate(nanPing);
      expect(result4).toBeNull();
    });

    it('notifies registered location listeners on valid coordinate pings', async () => {
      const listenerSpy = jest.fn();
      const unsub = locationTrackingService.addLocationListener(listenerSpy);

      const validPing = {
        coords: {
          latitude: -33.8568,
          longitude: 151.2153,
          accuracy: 8,
        },
        timestamp: 1756285200000,
      } as any;

      await locationTrackingService.handleLocationUpdate(validPing);
      expect(listenerSpy).toHaveBeenCalledTimes(1);
      expect(listenerSpy).toHaveBeenCalledWith(expect.objectContaining({
        latitude: -33.8568,
        longitude: 151.2153,
      }));

      unsub();

      // After unsubscribe, listener should not be called
      await locationTrackingService.handleLocationUpdate(validPing);
      expect(listenerSpy).toHaveBeenCalledTimes(1);
    });

    it('stops previous job tracking before starting new job tracking', async () => {
      const stopJobTrackingSpy = jest.spyOn(logisticsService, 'stopJobTracking').mockResolvedValue(undefined);

      // Start Job 1
      const job1Res = await locationTrackingService.startTrackingJob('job-stress-100', 'tenant-stress-test');
      expect(job1Res).toBe(true);
      expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-stress-100');

      // Start Job 2
      const job2Res = await locationTrackingService.startTrackingJob('job-stress-200', 'tenant-stress-test');
      expect(job2Res).toBe(true);
      expect(stopJobTrackingSpy).toHaveBeenCalledWith('job-stress-100');
      expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-stress-200');
    });

    it('is idempotent when startTrackingJob is called repeatedly with same jobId', async () => {
      const job1Res = await locationTrackingService.startTrackingJob('job-stress-100', 'tenant-stress-test');
      expect(job1Res).toBe(true);

      // Immediate duplicate call returns true without restart
      const duplicateRes = await locationTrackingService.startTrackingJob('job-stress-100', 'tenant-stress-test');
      expect(duplicateRes).toBe(true);
      expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-stress-100');
    });
  });
});
