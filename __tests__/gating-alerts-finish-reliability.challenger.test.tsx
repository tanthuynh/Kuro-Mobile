/**
 * __tests__/gating-alerts-finish-reliability.challenger.test.tsx
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE (Challenger M2-1)
 * Focus: UI Gating Failure Alerts (R1) and Finish Reliability / Recovery (R6)
 * Target Component: app/logistics/[id].tsx
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import LogisticsJobDetailScreen from '@/../app/logistics/[id]';
import * as logisticsService from '@/services/logistics-service';
import * as locationTrackingService from '@/services/location-tracking-service';
import type { LogisticsEntry } from '@/types/logistics';

// Mock Theme Context
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

// Mock Auth Context with assigned driver
const mockDriver = {
  id: 'usr-driver-77',
  uid: 'usr-driver-77',
  name: 'Alex Vance',
  email: 'alex@kuro.test',
  tenantId: 'tenant-kuro-01',
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockDriver,
    tenant: { tenantId: 'tenant-kuro-01', tenantName: 'Kuro Transport Fleet' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock Router
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      back: mockBack,
      canGoBack: () => true,
      replace: jest.fn(),
      push: jest.fn(),
    }),
    useLocalSearchParams: () => ({
      id: 'job-challenge-999',
    }),
    useFocusEffect: jest.fn((effect) => {
      React.useEffect(() => {
        const cleanup = effect();
        return () => {
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    }),
    useIsFocused: jest.fn(() => true),
  };
});

const mockTestJob: LogisticsEntry = {
  id: 'job-challenge-999',
  tenantId: 'tenant-kuro-01',
  eventNumber: 999,
  eventName: 'Adversarial Challenge Logistics Run',
  location: 'Sydney Olympic Park, NSW',
  status: 'Scheduled',
  driverName: 'Alex Vance',
  assigneeId: 'usr-driver-77',
  vehicleId: 'veh-heavy-09',
  start: new Date('2026-09-12T08:00:00Z'),
  end: new Date('2026-09-12T16:00:00Z'),
  createdBy: 'Fleet Dispatcher',
  updatedBy: 'Fleet Dispatcher',
  createdAt: '2026-09-12T06:00:00Z',
  updatedAt: '2026-09-12T06:00:00Z',
  archived: false,
  isTrackingActive: false,
  notes: 'Pre-run adversarial audit inspection.',
  destinations: [
    {
      id: 'dest-991',
      type: 'destination',
      destinationName: 'Main Arena Bay 4',
      address: 'Olympic Blvd, Sydney Olympic Park NSW 2127',
      contact: 'Dock Master: 0411 222 333',
      time: '09:00 AM',
      estTravelTime: '30 min',
      detailNote: 'Security check at Gate A.',
    },
  ],
};

describe('Challenger M2-1: R1 Gating Alerts & R6 Finish Reliability Empirical Verification', () => {
  let alertSpy: jest.SpyInstance;
  let openSettingsSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

    jest.spyOn(logisticsService, 'getLogisticsEntry').mockResolvedValue(mockTestJob);
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(mockTestJob);
      return () => {};
    });
    jest.spyOn(logisticsService, 'fetchVehicleById').mockResolvedValue({
      id: 'veh-heavy-09',
      name: 'Heavy Transport 09',
      rego: 'NSW-CHAL01',
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    openSettingsSpy.mockRestore();
  });

  describe('Suite 1: R1 UI Gating Alerts Empirical Challenges', () => {
    it('CHAL-R1-1: Start with GPS off surfaces "Location Services Disabled" alert, wires Settings link, and keeps status intact', async () => {
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(false);
      jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValueOnce('services_disabled');
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

      const { findByTestId, getByText } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(playBtn);
      });

      // 1. Verify Alert.alert arguments
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alertSpy.mock.calls[0];
      expect(title).toBe('Location Services Disabled');
      expect(message).toBe(
        'Device location services are turned off. Please enable GPS in device Settings to begin route tracking.'
      );

      // 2. Verify alert buttons structure
      expect(buttons).toHaveLength(2);
      expect(buttons[0]).toEqual(expect.objectContaining({ text: 'Cancel', style: 'cancel' }));
      expect(buttons[1]).toEqual(expect.objectContaining({ text: 'Open Settings' }));

      // 3. Verify Linking.openSettings executes on button tap
      buttons[1].onPress();
      expect(openSettingsSpy).toHaveBeenCalledTimes(1);

      // 4. Verify job status does NOT change
      expect(updateStatusSpy).not.toHaveBeenCalled();

      // 5. Verify actionError banner displays the alert message
      expect(getByText('Device location services are turned off. Please enable GPS in device Settings to begin route tracking.')).toBeTruthy();
    });

    it('CHAL-R1-2: Start with permission denied surfaces "Location Permission Required" alert, wires Settings link, and keeps status intact', async () => {
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(false);
      jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValueOnce('permission_denied');
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

      const { findByTestId, getByText } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(playBtn);
      });

      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alertSpy.mock.calls[0];
      expect(title).toBe('Location Permission Required');
      expect(message).toBe(
        'Location access is required to record route telemetry and dispatch ETA updates. Please enable location permissions in Settings.'
      );

      const settingsBtn = buttons.find((b: any) => b.text === 'Open Settings');
      expect(settingsBtn).toBeDefined();
      settingsBtn.onPress();
      expect(openSettingsSpy).toHaveBeenCalledTimes(1);

      expect(updateStatusSpy).not.toHaveBeenCalled();
      expect(getByText('Location access is required to record route telemetry and dispatch ETA updates. Please enable location permissions in Settings.')).toBeTruthy();
    });

    it('CHAL-R1-3: Start with approximate accuracy surfaces "Precise Location Required" alert, wires Settings link, and keeps status intact', async () => {
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(false);
      jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValueOnce('approximate_only');
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

      const { findByTestId, getByText } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(playBtn);
      });

      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alertSpy.mock.calls[0];
      expect(title).toBe('Precise Location Required');
      expect(message).toBe(
        'Kuro Mobile requires precise GPS location to track driver routes and calculate ETAs. Please allow precise location access in Settings.'
      );

      const settingsBtn = buttons.find((b: any) => b.text === 'Open Settings');
      expect(settingsBtn).toBeDefined();
      settingsBtn.onPress();
      expect(openSettingsSpy).toHaveBeenCalledTimes(1);

      expect(updateStatusSpy).not.toHaveBeenCalled();
      expect(getByText('Kuro Mobile requires precise GPS location to track driver routes and calculate ETAs. Please allow precise location access in Settings.')).toBeTruthy();
    });

    it('CHAL-R1-4: Linking.openSettings rejection is safely absorbed without unhandled exception', async () => {
      openSettingsSpy.mockRejectedValueOnce(new Error('OS Settings launch failed'));
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(false);
      jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValueOnce('services_disabled');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(playBtn);
      });

      const buttons = alertSpy.mock.calls[0][2];
      const settingsBtn = buttons.find((b: any) => b.text === 'Open Settings');
      expect(() => settingsBtn.onPress()).not.toThrow();
    });

    it('CHAL-R1-5: Selecting "In Progress" via QuickStatusSelector when GPS off triggers gating alert and aborts status update', async () => {
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(false);
      jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValueOnce('services_disabled');
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const inProgressBtn = await findByTestId('status-btn-in-progress');

      await act(async () => {
        fireEvent.press(inProgressBtn);
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Location Services Disabled',
        expect.stringContaining('Device location services are turned off'),
        expect.anything()
      );
      expect(updateStatusSpy).not.toHaveBeenCalled();
    });

    it('CHAL-R1-6: Multiple rapid presses on Start under gating failure reset loading state properly', async () => {
      jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValue(false);
      jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValue('services_disabled');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      // Tap 3 times rapidly
      await act(async () => {
        fireEvent.press(playBtn);
        fireEvent.press(playBtn);
        fireEvent.press(playBtn);
      });

      // Verify button is not permanently stuck loading or disabled
      expect(playBtn.props.accessibilityState?.disabled).toBe(false);
    });
  });

  describe('Suite 2: R6 Finish Reliability Empirical Challenges', () => {
    it('CHAL-R6-1: Finish when Firestore is reachable commits updateStatus("Completed") FIRST, then stops tracking SECOND', async () => {
      const activeJob: LogisticsEntry = {
        ...mockTestJob,
        status: 'In Progress',
        isTrackingActive: true,
      };
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(activeJob);
        return () => {};
      });

      const callOrder: string[] = [];
      const updateStatusSpy = jest
        .spyOn(logisticsService, 'updateLogisticsStatus')
        .mockImplementation(async (id, status) => {
          callOrder.push(`updateStatus:${status}`);
        });

      const stopTrackingSpy = jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockImplementation(async (id) => {
          callOrder.push(`stopTracking:${id}`);
        });

      const { findByTestId, queryByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // 1. Strict sequence verification
      expect(callOrder).toEqual([
        'updateStatus:Completed',
        'stopTracking:job-challenge-999',
      ]);

      // 2. Both spies called with exact params
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-challenge-999',
        'Completed',
        expect.objectContaining({ tenantId: 'tenant-kuro-01' })
      );
      expect(stopTrackingSpy).toHaveBeenCalledWith('job-challenge-999');

      // 3. No error banner rendered
      expect(queryByTestId('action-error-banner')).toBeNull();
    });

    it('CHAL-R6-2: Finish when Firestore is unreachable (network outage): tracking stays active, error banner displays, retry succeeds after restoration', async () => {
      const activeJob: LogisticsEntry = {
        ...mockTestJob,
        status: 'In Progress',
        isTrackingActive: true,
      };
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(activeJob);
        return () => {};
      });

      // Step 1: Simulate network outage on first attempt
      let shouldFail = true;
      const updateStatusSpy = jest
        .spyOn(logisticsService, 'updateLogisticsStatus')
        .mockImplementation(async (_id, status) => {
          if (shouldFail) {
            throw new Error('Firestore write failed: Network unreachable [ECONNREFUSED]');
          }
        });

      const stopTrackingSpy = jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockResolvedValue(undefined);

      const { findByTestId, findByText, queryByText } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      // Press finish during outage
      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // Verification of Outage state:
      // A: stopTrackingJob MUST NOT have been called
      expect(stopTrackingSpy).not.toHaveBeenCalled();

      // B: Error banner rendered with exact network error message
      expect(await findByText('Firestore write failed: Network unreachable [ECONNREFUSED]')).toBeTruthy();

      // C: Finish button must be re-enabled to allow driver retry
      expect(finishBtn.props.accessibilityState?.disabled).toBe(false);

      // Step 2: Simulate network restoration and retry
      shouldFail = false;

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // Verification of Successful Retry:
      // A: updateLogisticsStatus was called a second time
      expect(updateStatusSpy).toHaveBeenCalledTimes(2);

      // B: stopTrackingJob is now called cleanly
      expect(stopTrackingSpy).toHaveBeenCalledTimes(1);
      expect(stopTrackingSpy).toHaveBeenCalledWith('job-challenge-999');

      // C: Error banner should be cleared
      expect(queryByText('Firestore write failed: Network unreachable [ECONNREFUSED]')).toBeNull();
    });

    it('CHAL-R6-3: QuickStatusSelector "Completed" commits status FIRST, stops tracking SECOND, and handles failures reliably', async () => {
      const activeJob: LogisticsEntry = {
        ...mockTestJob,
        status: 'In Progress',
        isTrackingActive: true,
      };
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(activeJob);
        return () => {};
      });

      const callOrder: string[] = [];
      let networkThrows = true;

      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(async (_id, status) => {
        if (networkThrows) {
          throw new Error('Firestore timeout on quick status update');
        }
        callOrder.push(`updateStatus:${status}`);
      });

      const stopTrackingSpy = jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockImplementation(async (id) => {
          callOrder.push(`stopTracking:${id}`);
        });

      const { findByTestId, findByText, queryByText } = render(<LogisticsJobDetailScreen />);
      const completedBtn = await findByTestId('status-btn-completed');

      // 1. Attempt while network throws
      await act(async () => {
        fireEvent.press(completedBtn);
      });

      expect(stopTrackingSpy).not.toHaveBeenCalled();
      expect(await findByText('Firestore timeout on quick status update')).toBeTruthy();

      // 2. Retry after network recovers
      networkThrows = false;
      await act(async () => {
        fireEvent.press(completedBtn);
      });

      expect(callOrder).toEqual([
        'updateStatus:Completed',
        'stopTracking:job-challenge-999',
      ]);
      expect(queryByText('Firestore timeout on quick status update')).toBeNull();
    });

    it('CHAL-R6-4: QuickStatusSelector "Cancelled" also commits status FIRST and stops tracking SECOND', async () => {
      const activeJob: LogisticsEntry = {
        ...mockTestJob,
        status: 'In Progress',
        isTrackingActive: true,
      };
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(activeJob);
        return () => {};
      });

      const callOrder: string[] = [];
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(async (_id, status) => {
        callOrder.push(`updateStatus:${status}`);
      });

      jest.spyOn(locationTrackingService, 'stopTrackingJob').mockImplementation(async (id) => {
        callOrder.push(`stopTracking:${id}`);
      });

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const cancelledBtn = await findByTestId('status-btn-cancelled');

      await act(async () => {
        fireEvent.press(cancelledBtn);
      });

      expect(callOrder).toEqual([
        'updateStatus:Cancelled',
        'stopTracking:job-challenge-999',
      ]);
    });

    it('CHAL-R6-5: Double-tap on Finish button during active update does not spawn concurrent status updates', async () => {
      const activeJob: LogisticsEntry = {
        ...mockTestJob,
        status: 'In Progress',
        isTrackingActive: true,
      };
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(activeJob);
        return () => {};
      });

      let resolveUpdate: () => void;
      const delayedUpdatePromise = new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      });

      const updateStatusSpy = jest
        .spyOn(logisticsService, 'updateLogisticsStatus')
        .mockImplementation(() => delayedUpdatePromise);

      const stopTrackingSpy = jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockResolvedValue(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      // First tap begins async execution
      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // Second tap while isCompleting is true
      await act(async () => {
        fireEvent.press(finishBtn);
      });

      // Verify updateLogisticsStatus was only called once
      expect(updateStatusSpy).toHaveBeenCalledTimes(1);

      // Resolve the initial promise
      await act(async () => {
        resolveUpdate!();
      });

      expect(stopTrackingSpy).toHaveBeenCalledTimes(1);
    });

    it('CHAL-R6-6: Exception inside stopTrackingJob after updateStatus is caught and surfaces in actionError', async () => {
      const activeJob: LogisticsEntry = {
        ...mockTestJob,
        status: 'In Progress',
        isTrackingActive: true,
      };
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(activeJob);
        return () => {};
      });

      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValue(undefined);
      jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockRejectedValueOnce(new Error('Native Location TaskManager unregister failure'));

      const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      expect(await findByText('Native Location TaskManager unregister failure')).toBeTruthy();
      expect(finishBtn.props.accessibilityState?.disabled).toBe(false);
    });
  });
});
