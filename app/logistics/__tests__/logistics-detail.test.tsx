/**
 * app/logistics/__tests__/logistics-detail.test.tsx
 * Milestone 4: Logistics Detail Screen Component Tests.
 * Verifies job detail rendering, GPS tracking banner, destination stops list,
 * status transitions modal, notes modal, and 1-tap activation / completion actions.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
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
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
  useLocalSearchParams: () => ({
    id: 'job-alpha-101',
  }),
}));

const mockSingleJob: LogisticsEntry = {
  id: 'job-alpha-101',
  tenantId: 'tenant-omega',
  eventNumber: 777,
  eventName: 'Festival Stage 1 Audio Delivery',
  location: 'Centennial Parklands, Sydney NSW',
  status: 'Scheduled',
  driverName: 'Sam Fisher',
  assigneeId: 'usr-driver-01',
  vehicleId: 'VAN-04 (NSW-KURO1)',
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
    jest.clearAllMocks();
    jest.spyOn(logisticsService, 'getLogisticsEntry').mockResolvedValue(mockSingleJob);
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(mockSingleJob);
      return () => {};
    });
  });

  it('renders job overview, driver, vehicle, and destination stops list', async () => {
    const { getByText, findAllByText, getByTestId, findByTestId } = render(<LogisticsJobDetailScreen />);

    const titles = await findAllByText('Festival Stage 1 Audio Delivery');
    expect(titles.length).toBeGreaterThan(0);
    expect(getByText('#777')).toBeTruthy();
    expect(getByText('VAN-04 (NSW-KURO1)')).toBeTruthy();
    const samNames = await findAllByText('Sam Fisher');
    expect(samNames.length).toBeGreaterThan(0);
    expect(getByTestId('destination-stops-section')).toBeTruthy();
    expect(await findByTestId('destination-stop-dest-101')).toBeTruthy();
    expect(getByTestId('destination-stop-dest-102')).toBeTruthy();
    expect(getByText('Main Stage Loading Dock')).toBeTruthy();
    expect(getByText('VIP Tent Return Hub')).toBeTruthy();
  });

  it('activates job and initiates live GPS tracking', async () => {
    const startTrackingSpy = jest
      .spyOn(locationTrackingService, 'startTrackingJob')
      .mockResolvedValueOnce(true);

    const updateStatusSpy = jest
      .spyOn(logisticsService, 'updateLogisticsStatus')
      .mockResolvedValueOnce(undefined);

    const { getByTestId, findByTestId } = render(<LogisticsJobDetailScreen />);

    const activateBtn = await findByTestId('activate-job-btn');
    await act(async () => {
      fireEvent.press(activateBtn);
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

  it('completes job and stops live GPS tracking', async () => {
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

    const { getByTestId, findByTestId } = render(<LogisticsJobDetailScreen />);

    const completeBtn = await findByTestId('complete-job-btn');
    await act(async () => {
      fireEvent.press(completeBtn);
    });

    expect(stopTrackingSpy).toHaveBeenCalledWith('job-alpha-101');
    expect(updateStatusSpy).toHaveBeenCalledWith(
      'job-alpha-101',
      'Completed',
      expect.objectContaining({ tenantId: 'tenant-omega' })
    );
  });

  it('opens status transition modal and updates job status', async () => {
    const updateStatusSpy = jest
      .spyOn(logisticsService, 'updateLogisticsStatus')
      .mockResolvedValueOnce(undefined);

    const { getByTestId, findByTestId } = render(<LogisticsJobDetailScreen />);

    const changeStatusBtn = await findByTestId('change-status-btn');
    await act(async () => {
      fireEvent.press(changeStatusBtn);
    });

    expect(getByTestId('job-status-modal')).toBeTruthy();

    // Select 'In Transit' option
    const inTransitOpt = getByTestId('status-option-in-transit');
    await act(async () => {
      fireEvent.press(inTransitOpt);
    });

    // Enter note
    const noteInput = getByTestId('status-note-input');
    fireEvent.changeText(noteInput, 'Departing warehouse now.');

    // Submit
    const submitBtn = getByTestId('submit-status-btn');
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(updateStatusSpy).toHaveBeenCalledWith(
      'job-alpha-101',
      'In Transit',
      expect.objectContaining({
        note: 'Departing warehouse now.',
        tenantId: 'tenant-omega',
      })
    );
  });

  it('opens notes modal and appends an internal note', async () => {
    const appendNoteSpy = jest
      .spyOn(logisticsService, 'appendLogisticsNote')
      .mockResolvedValueOnce(undefined);

    const { getByTestId, findByTestId } = render(<LogisticsJobDetailScreen />);

    const addNoteBtn = await findByTestId('add-note-btn');
    await act(async () => {
      fireEvent.press(addNoteBtn);
    });

    expect(getByTestId('job-notes-modal')).toBeTruthy();

    // Type note
    const noteInput = getByTestId('logistics-note-input');
    fireEvent.changeText(noteInput, 'Gate 3 access code is 5678.');

    // Submit
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

  it('renders internal notes history', async () => {
    const { getByText, findByText } = render(<LogisticsJobDetailScreen />);

    expect(await findByText('2026-08-27 06:00 [Fleet Coordinator]: Gear prepped on Pallet 4.')).toBeTruthy();
    expect(getByText('2026-08-27 07:00 [Sam Fisher]: Vehicle inspected, tire pressure OK.')).toBeTruthy();
  });
});
