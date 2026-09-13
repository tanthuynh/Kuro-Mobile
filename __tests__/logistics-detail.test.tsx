/**
 * app/logistics/__tests__/logistics-detail.test.tsx
 * Milestone 4: Logistics Detail Screen Component Tests.
 * Verifies bracketed [#eventNumber] title, header tracking status badge,
 * removal of live GPS banner, 3-button (Play/Pause/Finish) controls,
 * stripped Job Overview with vehicle name resolution, QuickStatusSelector,
 * and internal notes history.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert, Linking, StyleSheet } from 'react-native';
import LogisticsJobDetailScreen from '@/../app/logistics/[id]';
import * as logisticsService from '@/services/logistics-service';
import * as locationTrackingService from '@/services/location-tracking-service';
import type { LogisticsEntry } from '@/types/logistics';

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
  id: 'usr-driver-01',
  uid: 'usr-driver-01',
  name: 'Sam Fisher',
  email: 'sam@kuro.test',
  tenantId: 'tenant-omega',
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockDriver,
    tenant: { tenantId: 'tenant-omega', tenantName: 'Omega Fleet' },
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
      id: 'job-alpha-101',
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

const mockSingleJob: LogisticsEntry = {
  id: 'job-alpha-101',
  tenantId: 'tenant-omega',
  eventNumber: 777,
  eventName: 'Festival Stage 1 Audio Delivery',
  location: 'Centennial Parklands, Sydney NSW',
  status: 'Scheduled',
  driverName: 'Sam Fisher',
  assigneeId: 'usr-driver-01',
  vehicleId: 'veh-van-04',
  start: new Date('2026-08-27T08:00:00Z'),
  end: new Date('2026-08-27T14:00:00Z'),
  createdBy: 'Fleet Coordinator',
  updatedBy: 'Fleet Coordinator',
  createdAt: '2026-08-27T06:00:00Z',
  updatedAt: '2026-08-27T06:00:00Z',
  archived: false,
  isTrackingActive: false,
  notes: '2026-08-27 06:00 [Fleet Coordinator]: Gear prepped on Pallet 4.\n2026-08-27 07:00 [Sam Fisher]: Vehicle inspected, tire pressure OK.',
  destinations: [
    {
      id: 'dest-101',
      type: 'destination',
      destinationName: 'Main Stage Loading Dock',
      address: 'Grand Dr, Centennial Park NSW 2021',
      contact: 'Site Manager: +61 412 345 678',
      time: '08:30 AM',
      estTravelTime: '25 min',
      detailNote: 'Enter via Gate 3 on Fearnley Grounds.',
    },
    {
      id: 'dest-102',
      type: 'destination',
      destinationName: 'VIP Tent Return Hub',
      address: 'Loch Ave, Centennial Park NSW 2021',
      contact: 'Stage Crew: 02 9876 5432',
      time: '01:00 PM',
      detailNote: 'Collect return microphone cases.',
    },
  ],
};

describe('Milestone 4: Logistics Job Detail Screen Component Tests', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    locationTrackingService._resetTrackingStateForTesting();
    jest.clearAllMocks();
    jest.spyOn(logisticsService, 'getLogisticsEntry').mockResolvedValue(mockSingleJob);
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(mockSingleJob);
      return () => {};
    });
    jest.spyOn(logisticsService, 'fetchVehicleById').mockResolvedValue({
      id: 'veh-van-04',
      name: 'Van 04',
      rego: 'NSW-KURO1',
    });
  });

  it('renders bracketed event title, header tracking status badge, stripped job overview, and destinations', async () => {
    const { getByText, findByText, getByTestId, findByTestId, queryByTestId } = render(<LogisticsJobDetailScreen />);

    // ScreenHeader Title formatted with idBadge [eventNumber] like Repairs
    expect(await findByText('[777]')).toBeTruthy();
    expect(getByText('Festival Stage 1 Audio Delivery')).toBeTruthy();

    // Header Tracking Status Badge (Idle initially)
    expect(getByTestId('detail-tracking-status-badge')).toBeTruthy();
    expect(getByText('Idle')).toBeTruthy();

    // Large GPS Tracking Banner is removed
    expect(queryByTestId('live-gps-tracking-banner')).toBeNull();

    // Job Overview displays Driver and resolved Vehicle name
    expect(getByTestId('job-overview-card')).toBeTruthy();
    expect(getByText('Sam Fisher')).toBeTruthy();
    expect(await findByText('Van 04 (NSW-KURO1)')).toBeTruthy();

    // QuickStatusSelector is present in Job Overview
    expect(getByTestId('job-quick-status-selector')).toBeTruthy();

    // Destination stops list
    expect(getByTestId('destination-stops-section')).toBeTruthy();
    expect(await findByTestId('destination-stop-dest-101')).toBeTruthy();
    expect(getByTestId('destination-stop-dest-102')).toBeTruthy();
    expect(getByText('Main Stage Loading Dock')).toBeTruthy();
    expect(getByText('VIP Tent Return Hub')).toBeTruthy();
  });

  it('renders Tracking badge in header when job tracking is active', async () => {
    const activeTrackingJob: LogisticsEntry = {
      ...mockSingleJob,
      isTrackingActive: true,
      status: 'In Progress',
    };

    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(activeTrackingJob);
      return () => {};
    });

    const { findByTestId, getByText, queryByTestId } = render(<LogisticsJobDetailScreen />);

    const badge = await findByTestId('detail-tracking-status-badge');
    expect(badge).toBeTruthy();
    expect(getByText('Tracking')).toBeTruthy();
    expect(queryByTestId('live-gps-tracking-banner')).toBeNull();
  });

  it('play button starts GPS tracking and updates status to "In Progress"', async () => {
    const startTrackingSpy = jest
      .spyOn(locationTrackingService, 'startTrackingJob')
      .mockResolvedValueOnce(true);

    const updateStatusSpy = jest
      .spyOn(logisticsService, 'updateLogisticsStatus')
      .mockResolvedValueOnce(undefined);

    const { findByTestId, getByText } = render(<LogisticsJobDetailScreen />);

    const playBtn = await findByTestId('play-job-btn');
    expect(playBtn.props.accessibilityLabel).toBe('Start tracking');
    await act(async () => {
      fireEvent.press(playBtn);
    });

    expect(startTrackingSpy).toHaveBeenCalledWith(
      'job-alpha-101',
      'tenant-omega',
      expect.objectContaining({ driverId: 'usr-driver-01', driverName: 'Sam Fisher' })
    );

    expect(updateStatusSpy).toHaveBeenCalledWith(
      'job-alpha-101',
      'In Progress',
      expect.objectContaining({ tenantId: 'tenant-omega' })
    );
  });

  it('pause button stops GPS tracking while preserving job status', async () => {
    const activeJob: LogisticsEntry = {
      ...mockSingleJob,
      status: 'In Progress',
      isTrackingActive: true,
    };

    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(activeJob);
      return () => {};
    });

    const stopTrackingSpy = jest
      .spyOn(locationTrackingService, 'stopTrackingJob')
      .mockResolvedValueOnce(undefined);

    const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

    const { findByTestId } = render(<LogisticsJobDetailScreen />);

    const pauseBtn = await findByTestId('pause-job-btn');
    await act(async () => {
      fireEvent.press(pauseBtn);
    });

    expect(stopTrackingSpy).toHaveBeenCalledWith('job-alpha-101');
    expect(updateStatusSpy).not.toHaveBeenCalled();
  });

  it('finish button stops GPS tracking and updates status to "Completed"', async () => {
    const activeJob: LogisticsEntry = {
      ...mockSingleJob,
      status: 'In Progress',
      isTrackingActive: true,
    };

    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(activeJob);
      return () => {};
    });

    const stopTrackingSpy = jest
      .spyOn(locationTrackingService, 'stopTrackingJob')
      .mockResolvedValueOnce(undefined);

    const updateStatusSpy = jest
      .spyOn(logisticsService, 'updateLogisticsStatus')
      .mockResolvedValueOnce(undefined);

    const { findByTestId } = render(<LogisticsJobDetailScreen />);

    const finishBtn = await findByTestId('finish-job-btn');
    await act(async () => {
      fireEvent.press(finishBtn);
    });

    expect(stopTrackingSpy).toHaveBeenCalledWith('job-alpha-101');
    expect(updateStatusSpy).toHaveBeenCalledWith(
      'job-alpha-101',
      'Completed',
      expect.objectContaining({ tenantId: 'tenant-omega' })
    );
  });

  it('QuickStatusSelector performs 1-click status transitions', async () => {
    const updateStatusSpy = jest
      .spyOn(logisticsService, 'updateLogisticsStatus')
      .mockResolvedValueOnce(undefined);

    const startTrackingSpy = jest
      .spyOn(locationTrackingService, 'startTrackingJob')
      .mockResolvedValueOnce(true);

    const { findByTestId } = render(<LogisticsJobDetailScreen />);

    const inProgressPill = await findByTestId('status-btn-in-progress');
    await act(async () => {
      fireEvent.press(inProgressPill);
    });

    expect(startTrackingSpy).toHaveBeenCalledWith(
      'job-alpha-101',
      'tenant-omega',
      expect.anything()
    );
    expect(updateStatusSpy).toHaveBeenCalledWith(
      'job-alpha-101',
      'In Progress',
      expect.anything()
    );
  });

  it('disables Pending in quick status and has no change status button', async () => {
    const { queryByTestId, getByTestId } = render(<LogisticsJobDetailScreen />);

    // Change status button should not exist
    expect(queryByTestId('change-status-btn')).toBeNull();

    // Pending button should be disabled for drivers
    const pendingBtn = getByTestId('status-btn-pending');
    expect(pendingBtn.props.accessibilityState.disabled).toBe(true);
  });

  it('renders main add note button at bottom and opens notes modal', async () => {
    const appendNoteSpy = jest
      .spyOn(logisticsService, 'appendLogisticsNote')
      .mockResolvedValueOnce(undefined);

    const { getByTestId, findByTestId, queryByTestId, queryByText, getByText } = render(<LogisticsJobDetailScreen />);

    // Internal notes & activity card is removed
    expect(queryByTestId('job-notes-history-card')).toBeNull();
    expect(queryByText(/INTERNAL NOTES/i)).toBeNull();

    // Main add note button at bottom exists
    const addNoteBtn = await findByTestId('add-note-btn');
    expect(addNoteBtn).toBeTruthy();
    const flatNoteStyle = StyleSheet.flatten(
      typeof addNoteBtn.props.style === 'function' ? addNoteBtn.props.style({ pressed: false }) : addNoteBtn.props.style
    );
    expect(flatNoteStyle.backgroundColor).toBe('#206020');

    await act(async () => {
      fireEvent.press(addNoteBtn);
    });

    expect(getByTestId('job-notes-modal')).toBeTruthy();

    const noteInput = getByTestId('logistics-note-input');
    expect(noteInput.props.placeholder).toBe('Type your internal note...');
    fireEvent.changeText(noteInput, 'Gate 3 access code is 5678.');

    const submitBtn = getByTestId('submit-notes-btn');
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(appendNoteSpy).toHaveBeenCalledWith(
      'job-alpha-101',
      'Gate 3 access code is 5678.',
      'Sam Fisher',
      'tenant-omega'
    );
  });

  it('verifies route activation button displays "Start" and LogisticsNotesModal has empty placeholder', async () => {
    const { findByTestId, getByTestId, getByText, queryByText } = render(<LogisticsJobDetailScreen />);

    // Route activation button displays "Start" rather than "Play"
    const startBtn = await findByTestId('play-job-btn');
    expect(startBtn).toBeTruthy();
    expect(getByTestId('play-job-btn').props.accessibilityLabel).toBe('Start tracking');
    expect(queryByText('Play')).toBeNull();
    expect(startBtn.props.accessibilityLabel).toBe('Start tracking');

    // Open notes modal and verify empty placeholder
    const addNoteBtn = await findByTestId('add-note-btn');
    await act(async () => {
      fireEvent.press(addNoteBtn);
    });

    const noteInput = await findByTestId('logistics-note-input');
    expect(noteInput.props.placeholder).toBe('Type your internal note...');
  });
});

describe('Milestone M2: Gating Alerts, Mid-Job Revocation & Reliable Finish Sequence', () => {
  let alertSpy: jest.SpyInstance;
  let openSettingsSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    locationTrackingService._resetTrackingStateForTesting();
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    jest.spyOn(logisticsService, 'getLogisticsEntry').mockResolvedValue(mockSingleJob);
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(mockSingleJob);
      return () => {};
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    openSettingsSpy.mockRestore();
  });

  it('R1: shows "Location Services Disabled" alert with Open Settings when GPS is off, and leaves status unchanged', async () => {
    jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(false);
    jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValueOnce('services_disabled');
    const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

    const { findByTestId } = render(<LogisticsJobDetailScreen />);
    const playBtn = await findByTestId('play-job-btn');

    await act(async () => {
      fireEvent.press(playBtn);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Location Services Disabled',
      'Device location services are turned off. Please enable GPS in device Settings to begin route tracking.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Open Settings' }),
      ])
    );

    // Verify Open Settings onPress triggers Linking.openSettings
    const openSettingsBtn = alertSpy.mock.calls[0][2]?.find((b: any) => b.text === 'Open Settings');
    expect(openSettingsBtn).toBeDefined();
    openSettingsBtn.onPress();
    expect(openSettingsSpy).toHaveBeenCalled();

    // Status MUST NOT be updated
    expect(updateStatusSpy).not.toHaveBeenCalled();
  });

  it('R1: shows "Precise Location Required" alert when location accuracy is approximate, and leaves status unchanged', async () => {
    jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(false);
    jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValueOnce('approximate_only');
    const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

    const { findByTestId } = render(<LogisticsJobDetailScreen />);
    const playBtn = await findByTestId('play-job-btn');

    await act(async () => {
      fireEvent.press(playBtn);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Precise Location Required',
      'Kuro Mobile requires precise GPS location to track driver routes and calculate ETAs. Please allow precise location access in Settings.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Open Settings' }),
      ])
    );

    const openSettingsBtn = alertSpy.mock.calls[0][2]?.find((b: any) => b.text === 'Open Settings');
    expect(openSettingsBtn).toBeDefined();
    openSettingsBtn.onPress();
    expect(openSettingsSpy).toHaveBeenCalled();

    expect(updateStatusSpy).not.toHaveBeenCalled();
  });

  it('R1: shows "Location Permission Required" alert when permission is denied, and leaves status unchanged', async () => {
    jest.spyOn(locationTrackingService, 'startTrackingJob').mockResolvedValueOnce(false);
    jest.spyOn(locationTrackingService, 'getLastTrackingFailureReason').mockReturnValueOnce('permission_denied');
    const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

    const { findByTestId } = render(<LogisticsJobDetailScreen />);
    const playBtn = await findByTestId('play-job-btn');

    await act(async () => {
      fireEvent.press(playBtn);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Location Permission Required',
      'Location access is required to record route telemetry and dispatch ETA updates. Please enable location permissions in Settings.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Open Settings' }),
      ])
    );

    const openSettingsBtn = alertSpy.mock.calls[0][2]?.find((b: any) => b.text === 'Open Settings');
    expect(openSettingsBtn).toBeDefined();
    openSettingsBtn.onPress();
    expect(openSettingsSpy).toHaveBeenCalled();

    expect(updateStatusSpy).not.toHaveBeenCalled();
  });

  it('R3: renders permission-revoked-warning banner with Open Settings link when tracking is suspended', async () => {
    const activeJob: LogisticsEntry = {
      ...mockSingleJob,
      status: 'In Progress',
      isTrackingActive: true,
    };
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(activeJob);
      return () => {};
    });
    jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
    jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-alpha-101');
    jest.spyOn(locationTrackingService, 'getSyncStatus').mockReturnValue({
      status: 'permission_denied',
      lastSyncTime: null,
      lastError: 'Permission revoked',
    });

    const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);

    expect(await findByTestId('permission-revoked-warning')).toBeTruthy();
    expect(await findByText(/Location permission revoked. Please re-enable in Settings to resume tracking./i)).toBeTruthy();

    const badge = await findByTestId('detail-tracking-status-badge');
    expect(badge).toBeTruthy();
    expect(await findByText('Permission Required')).toBeTruthy();

    const openSettingsLink = await findByText('Open Settings');
    await act(async () => {
      fireEvent.press(openSettingsLink);
    });
    expect(openSettingsSpy).toHaveBeenCalled();
  });

  it('R3: auto-resume clears warning banner and restores tracking badge when permission restored', async () => {
    const activeJob: LogisticsEntry = {
      ...mockSingleJob,
      status: 'In Progress',
      isTrackingActive: true,
    };
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(activeJob);
      return () => {};
    });

    let syncListener: ((status: any) => void) | null = null;
    jest.spyOn(locationTrackingService, 'addSyncStatusListener').mockImplementation((cb) => {
      syncListener = cb;
      return () => {};
    });

    // Start in suspended state
    jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(true);
    jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue('job-alpha-101');
    jest.spyOn(locationTrackingService, 'getSyncStatus').mockReturnValue({
      status: 'permission_denied',
      lastSyncTime: null,
      lastError: 'Permission revoked',
    });

    const { findByTestId, queryByTestId, findByText } = render(<LogisticsJobDetailScreen />);

    expect(await findByTestId('permission-revoked-warning')).toBeTruthy();
    expect(await findByText('Permission Required')).toBeTruthy();

    // Now simulate auto-resume: permissions restored, tracking active, syncStatus synced
    jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(false);
    jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue(null);
    jest.spyOn(locationTrackingService, 'isTrackingActive').mockReturnValue(true);
    jest.spyOn(locationTrackingService, 'getActiveTrackingJobId').mockReturnValue('job-alpha-101');

    await act(async () => {
      if (syncListener) {
        syncListener({ status: 'synced', lastSyncTime: Date.now(), lastError: null });
      }
    });

    expect(queryByTestId('permission-revoked-warning')).toBeNull();
    expect(await findByText('Tracking')).toBeTruthy();
  });

  it('R6: Finish sequence commits updateStatus("Completed") first, then stopTrackingJob second', async () => {
    const activeJob: LogisticsEntry = {
      ...mockSingleJob,
      status: 'In Progress',
      isTrackingActive: true,
    };
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(activeJob);
      return () => {};
    });

    const executionOrder: string[] = [];
    jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(async () => {
      executionOrder.push('updateStatus');
    });
    jest.spyOn(locationTrackingService, 'stopTrackingJob').mockImplementation(async () => {
      executionOrder.push('stopTracking');
    });

    const { findByTestId } = render(<LogisticsJobDetailScreen />);
    const finishBtn = await findByTestId('finish-job-btn');

    await act(async () => {
      fireEvent.press(finishBtn);
    });

    expect(executionOrder).toEqual(['updateStatus', 'stopTracking']);
  });

  it('R6: Finish sequence retains active tracking and displays error banner when updateStatus throws', async () => {
    const activeJob: LogisticsEntry = {
      ...mockSingleJob,
      status: 'In Progress',
      isTrackingActive: true,
    };
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(activeJob);
      return () => {};
    });

    jest.spyOn(logisticsService, 'updateLogisticsStatus').mockRejectedValueOnce(
      new Error('Firestore write failed: Network unreachable')
    );
    const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');

    const { findByTestId, findByText } = render(<LogisticsJobDetailScreen />);
    const finishBtn = await findByTestId('finish-job-btn');

    await act(async () => {
      fireEvent.press(finishBtn);
    });

    // stopTrackingJob MUST NOT have been called
    expect(stopTrackingSpy).not.toHaveBeenCalled();

    // Error banner MUST be visible with the error message
    expect(await findByText('Firestore write failed: Network unreachable')).toBeTruthy();

    // Finish button must be re-enabled for retry
    expect(finishBtn.props.accessibilityState?.disabled).toBe(false);
  });
});
