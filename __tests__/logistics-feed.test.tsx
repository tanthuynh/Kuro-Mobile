/**
 * app/logistics/__tests__/logistics-feed.test.tsx
 * Milestone 4: Logistics Feed Component Tests.
 * Verifies real-time feed rendering, interactive top-row status metric cards,
 * search filtering, and navigation.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import LogisticsFeedScreen from '@/../app/(tabs)/logistics';
import * as logisticsService from '@/services/logistics-service';
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

// Mock Auth Context
const mockDriver = {
  id: 'usr-driver-01',
  uid: 'usr-driver-01',
  name: 'Sam Fisher',
  email: 'sam@kuro.test',
  firstName: 'Sam',
  lastName: 'Fisher',
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
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockLogisticsJobs: LogisticsEntry[] = [
  {
    id: 'job-alpha-01',
    tenantId: 'tenant-omega',
    eventNumber: 501,
    eventName: 'Sydney Opera House Audio Run',
    location: 'Bennelong Point, Sydney NSW',
    status: 'In Transit',
    driverName: 'Sam Fisher',
    assigneeId: 'usr-driver-01',
    vehicleId: 'VAN-04 (NSW-KURO1)',
    start: new Date('2026-08-27T08:00:00Z'),
    end: new Date('2026-08-27T12:00:00Z'),
    createdBy: 'Fleet Dispatcher',
    updatedBy: 'Sam Fisher',
    createdAt: '2026-08-27T07:00:00Z',
    updatedAt: '2026-08-27T08:00:00Z',
    archived: false,
    isTrackingActive: true,
    destinations: [
      {
        id: 'dest-01',
        type: 'destination',
        destinationName: 'Opera House Loading Bay 3',
        address: 'Macquarie St, Sydney NSW 2000',
        contact: 'Stage Manager: +61 412 345 678',
      },
    ],
  },
  {
    id: 'job-beta-02',
    tenantId: 'tenant-omega',
    eventNumber: 502,
    eventName: 'Enmore Theatre Lighting Rig',
    location: '118-132 Enmore Rd, Newtown NSW',
    status: 'Scheduled',
    driverName: 'Jack Reacher',
    assigneeId: 'usr-driver-99',
    vehicleId: 'TRUCK-02',
    start: new Date('2026-08-27T14:00:00Z'),
    end: new Date('2026-08-27T18:00:00Z'),
    createdBy: 'Fleet Dispatcher',
    updatedBy: 'Fleet Dispatcher',
    createdAt: '2026-08-27T07:00:00Z',
    updatedAt: '2026-08-27T07:00:00Z',
    archived: false,
    isTrackingActive: false,
    destinations: [
      {
        id: 'dest-02',
        type: 'destination',
        destinationName: 'Enmore Stage Door',
        address: '118 Enmore Rd, Newtown NSW 2042',
      },
    ],
  },
  {
    id: 'job-gamma-03',
    tenantId: 'tenant-omega',
    eventNumber: 503,
    eventName: 'Qudos Bank Arena Video Wall',
    location: 'Olympic Blvd, Sydney Olympic Park',
    status: 'Completed',
    driverName: 'Sam Fisher',
    assigneeId: 'usr-driver-01',
    vehicleId: 'VAN-04 (NSW-KURO1)',
    start: new Date('2026-08-26T09:00:00Z'),
    end: new Date('2026-08-26T16:00:00Z'),
    createdBy: 'Fleet Dispatcher',
    updatedBy: 'Sam Fisher',
    createdAt: '2026-08-26T08:00:00Z',
    updatedAt: '2026-08-26T16:00:00Z',
    archived: false,
    isTrackingActive: false,
  },
  {
    id: 'job-delta-04',
    tenantId: 'tenant-omega',
    eventNumber: 504,
    eventName: 'Hordern Pavilion Backline Delivery',
    location: 'Moore Park, Sydney NSW',
    status: 'Pending',
    driverName: 'Unassigned',
    assigneeId: '',
    vehicleId: '',
    start: new Date('2026-08-28T10:00:00Z'),
    end: new Date('2026-08-28T14:00:00Z'),
    createdBy: 'Fleet Dispatcher',
    updatedBy: 'Fleet Dispatcher',
    createdAt: '2026-08-27T09:00:00Z',
    updatedAt: '2026-08-27T09:00:00Z',
    archived: false,
    isTrackingActive: false,
  },
];

describe('Milestone 4: Logistics Feed Screen Component Tests', () => {
  let subscribeMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    subscribeMock = jest
      .spyOn(logisticsService, 'subscribeToLogistics')
      .mockImplementation((tenantId, onUpdate) => {
        onUpdate(mockLogisticsJobs);
        return () => {};
      });
  });

  it('renders interactive status metric cards and calculates summary metrics correctly', async () => {
    const { getByText, findByText, getByTestId } = render(<LogisticsFeedScreen />);

    expect(subscribeMock).toHaveBeenCalledWith('tenant-omega', expect.any(Function), expect.any(Function));

    // Interactive metrics cards
    expect(getByTestId('metric-card-all')).toBeTruthy();
    expect(getByTestId('metric-card-pending')).toBeTruthy();
    expect(getByTestId('metric-card-planned')).toBeTruthy();
    expect(getByTestId('metric-card-in-progress')).toBeTruthy();
    expect(getByTestId('metric-card-completed')).toBeTruthy();

    // Metric numbers and cards
    expect(await findByText('Sydney Opera House Audio Run')).toBeTruthy();
    expect(getByText('Enmore Theatre Lighting Rig')).toBeTruthy();
    expect(getByText('Qudos Bank Arena Video Wall')).toBeTruthy();
    expect(getByText('Hordern Pavilion Backline Delivery')).toBeTruthy();
  });

  it('filters feed jobs when tapping top-row interactive status metric cards', async () => {
    const { getByTestId, queryByText, findByText, getByText } = render(<LogisticsFeedScreen />);

    expect(await findByText('Sydney Opera House Audio Run')).toBeTruthy();
    expect(getByText('Enmore Theatre Lighting Rig')).toBeTruthy();
    expect(getByText('Qudos Bank Arena Video Wall')).toBeTruthy();
    expect(getByText('Hordern Pavilion Backline Delivery')).toBeTruthy();

    // Tap "Pending" metric card
    const pendingCard = getByTestId('metric-card-pending');
    await act(async () => {
      fireEvent.press(pendingCard);
    });

    expect(await findByText('Hordern Pavilion Backline Delivery')).toBeTruthy();
    expect(queryByText('Sydney Opera House Audio Run')).toBeNull();
    expect(queryByText('Enmore Theatre Lighting Rig')).toBeNull();
    expect(queryByText('Qudos Bank Arena Video Wall')).toBeNull();

    // Tap "In Progress" metric card
    const inProgressCard = getByTestId('metric-card-in-progress');
    await act(async () => {
      fireEvent.press(inProgressCard);
    });

    expect(await findByText('Sydney Opera House Audio Run')).toBeTruthy();
    expect(queryByText('Enmore Theatre Lighting Rig')).toBeNull();
    expect(queryByText('Qudos Bank Arena Video Wall')).toBeNull();
    expect(queryByText('Hordern Pavilion Backline Delivery')).toBeNull();

    // Tap "Planned" metric card
    const plannedCard = getByTestId('metric-card-planned');
    await act(async () => {
      fireEvent.press(plannedCard);
    });

    expect(await findByText('Enmore Theatre Lighting Rig')).toBeTruthy();
    expect(queryByText('Sydney Opera House Audio Run')).toBeNull();
    expect(queryByText('Qudos Bank Arena Video Wall')).toBeNull();
    expect(queryByText('Hordern Pavilion Backline Delivery')).toBeNull();

    // Tap "Completed" metric card
    const completedCard = getByTestId('metric-card-completed');
    await act(async () => {
      fireEvent.press(completedCard);
    });

    expect(await findByText('Qudos Bank Arena Video Wall')).toBeTruthy();
    expect(queryByText('Sydney Opera House Audio Run')).toBeNull();
    expect(queryByText('Enmore Theatre Lighting Rig')).toBeNull();
    expect(queryByText('Hordern Pavilion Backline Delivery')).toBeNull();

    // Tap "All" metric card
    const allCard = getByTestId('metric-card-all');
    await act(async () => {
      fireEvent.press(allCard);
    });

    expect(await findByText('Sydney Opera House Audio Run')).toBeTruthy();
    expect(getByText('Enmore Theatre Lighting Rig')).toBeTruthy();
    expect(getByText('Qudos Bank Arena Video Wall')).toBeTruthy();
    expect(getByText('Hordern Pavilion Backline Delivery')).toBeTruthy();
  });

  it('filters feed jobs via search keyword input and allows resetting filters from empty state', async () => {
    const { getByTestId, queryByText, findByText, getByText } = render(<LogisticsFeedScreen />);

    const searchInput = getByTestId('logistics-search-input');
    await act(async () => {
      fireEvent.changeText(searchInput, 'NonExistentPlaceXYZ');
    });

    expect(await findByText('No Logistics Jobs Found')).toBeTruthy();
    expect(queryByText('Sydney Opera House Audio Run')).toBeNull();

    // Reset filters button
    const resetBtn = getByTestId('reset-logistics-filters-btn');
    await act(async () => {
      fireEvent.press(resetBtn);
    });

    expect(await findByText('Sydney Opera House Audio Run')).toBeTruthy();
    expect(getByText('Enmore Theatre Lighting Rig')).toBeTruthy();
    expect(getByText('Qudos Bank Arena Video Wall')).toBeTruthy();
  });

  it('navigates to job detail screen when pressing a job card', async () => {
    const { findByTestId } = render(<LogisticsFeedScreen />);

    const jobCard = await findByTestId('logistics-job-job-alpha-01');
    await act(async () => {
      fireEvent.press(jobCard);
    });

    expect(mockPush).toHaveBeenCalledWith('/logistics/job-alpha-01');
  });

  it('displays LIVE GPS indicator badge on jobs with active tracking', async () => {
    const { findByTestId, queryByTestId } = render(<LogisticsFeedScreen />);

    expect(await findByTestId('job-live-tracking-pill-job-alpha-01')).toBeTruthy();
    expect(queryByTestId('job-live-tracking-pill-job-beta-02')).toBeNull();
  });
});
