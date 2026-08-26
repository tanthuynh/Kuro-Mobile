/**
 * __tests__/repair-tickets-feed.test.tsx
 * Milestone 3: Real-Time Repair Tickets Feed & Filter Tests.
 * Verifies live subscription, 5 interactive status metric cards filtering ("All", "Reported", "Pending", "Under Repair", "Completed"),
 * search, and navigation routing.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import RepairsScreen from '@/../app/(tabs)/repairs';
import * as repairService from '@/services/repair-service';
import type { RepairTicket } from '@/types/repair';

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

// Mock Auth
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'usr-tech-01', name: 'Alex Technician', email: 'alex@kuro.test', tenantId: 'tenant-alpha' },
    tenant: { tenantId: 'tenant-alpha', tenantName: 'Alpha Stage Rentals' },
    isAuthenticated: true,
    isLoading: false,
    isRestoringSession: false,
  }),
}));

// Mock Router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockTickets: RepairTicket[] = [
  {
    id: 'ticket-001',
    tenantId: 'tenant-alpha',
    repairNumber: 101,
    equipment: {
      id: 'eq-1',
      name: 'Robe MegaPointe Moving Head',
      category: 'Lighting & FX',
      serialNumber: 'SN-ROBE-001',
      barcode: 'BAR-101',
      knownLocation: 'Bay 1',
    },
    repairType: 'Optical / Lens / Sensor',
    priority: 'Critical',
    status: 'Under Repair',
    condition: 'Out of Service',
    requestedBy: 'John Stagehand',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    attachments: [
      { id: 'att-1', type: 'Photo', url: 'https://mock/damage1.jpg' },
    ],
    actions: [
      { id: 'act-1', user: { name: 'Alex' }, action: 'Ticket opened', timestamp: new Date().toISOString() },
    ],
  },
  {
    id: 'ticket-002',
    tenantId: 'tenant-alpha',
    repairNumber: 102,
    equipment: {
      id: 'eq-2',
      name: 'Shure Axient Dual Receiver',
      category: 'Audio & Wireless',
      serialNumber: 'SN-SHURE-882',
      barcode: 'BAR-102',
      knownLocation: 'Audio Rack A',
    },
    repairType: 'Electrical / Power',
    priority: 'High',
    status: 'Pending',
    condition: 'Out of Service',
    requestedBy: 'Sarah Audio',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    actions: [],
  },
  {
    id: 'ticket-003',
    tenantId: 'tenant-alpha',
    repairNumber: 103,
    equipment: {
      id: 'eq-3',
      name: 'Barco E2 Gen2 Video Processor',
      category: 'Video & Switching',
      serialNumber: 'SN-BARCO-441',
      barcode: 'BAR-103',
      knownLocation: 'Video Suite',
    },
    repairType: 'Firmware / Software',
    priority: 'Low',
    status: 'Completed',
    condition: 'Available to Use',
    requestedBy: 'Dave Video',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    actions: [],
  },
  {
    id: 'ticket-004',
    tenantId: 'tenant-alpha',
    repairNumber: 104,
    equipment: {
      id: 'eq-4',
      name: 'Yamaha CL5 Digital Console',
      category: 'Audio',
      serialNumber: 'SN-CL5-009',
      barcode: 'BAR-104',
      knownLocation: 'FOH Rack',
    },
    repairType: 'Fader Issue',
    priority: 'Medium',
    status: 'Reported',
    condition: 'Out of Service',
    requestedBy: 'Sam Audio',
    createdAt: new Date(Date.now() - 10000000).toISOString(),
    actions: [],
  },
];

describe('Milestone 3: Repair Tickets Feed Screen', () => {
  let subscribeMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    subscribeMock = jest
      .spyOn(repairService, 'subscribeTenantRepairTickets')
      .mockImplementation((tenantId, onUpdate) => {
        onUpdate(mockTickets);
        return () => {};
      });
  });

  it('subscribes to live tenant tickets and renders 5 interactive status metric cards', async () => {
    const { getByText, findByText, getByTestId } = render(<RepairsScreen />);

    expect(subscribeMock).toHaveBeenCalledWith('tenant-alpha', expect.any(Function), expect.any(Function));

    // Verify all 5 metric cards exist
    expect(getByTestId('metric-card-all')).toBeTruthy();
    expect(getByTestId('metric-card-reported')).toBeTruthy();
    expect(getByTestId('metric-card-pending')).toBeTruthy();
    expect(getByTestId('metric-card-under-repair')).toBeTruthy();
    expect(getByTestId('metric-card-completed')).toBeTruthy();

    // Verify ticket names are displayed
    expect(await findByText('Robe MegaPointe Moving Head')).toBeTruthy();
    expect(getByText('Shure Axient Dual Receiver')).toBeTruthy();
    expect(getByText('Barco E2 Gen2 Video Processor')).toBeTruthy();
    expect(getByText('Yamaha CL5 Digital Console')).toBeTruthy();
  });

  it('filters tickets by tapping interactive status metric cards', async () => {
    const { getByTestId, queryByText, findByText } = render(<RepairsScreen />);

    // Click 'Under Repair' metric card
    const underRepairCard = getByTestId('metric-card-under-repair');
    await act(async () => {
      fireEvent.press(underRepairCard);
    });

    expect(await findByText('Robe MegaPointe Moving Head')).toBeTruthy();
    expect(queryByText('Shure Axient Dual Receiver')).toBeNull();
    expect(queryByText('Barco E2 Gen2 Video Processor')).toBeNull();
    expect(queryByText('Yamaha CL5 Digital Console')).toBeNull();

    // Click 'Completed' metric card
    const completedCard = getByTestId('metric-card-completed');
    await act(async () => {
      fireEvent.press(completedCard);
    });

    expect(await findByText('Barco E2 Gen2 Video Processor')).toBeTruthy();
    expect(queryByText('Robe MegaPointe Moving Head')).toBeNull();
    expect(queryByText('Shure Axient Dual Receiver')).toBeNull();
    expect(queryByText('Yamaha CL5 Digital Console')).toBeNull();

    // Click 'Pending' metric card
    const pendingCard = getByTestId('metric-card-pending');
    await act(async () => {
      fireEvent.press(pendingCard);
    });

    expect(await findByText('Shure Axient Dual Receiver')).toBeTruthy();
    expect(queryByText('Robe MegaPointe Moving Head')).toBeNull();
    expect(queryByText('Barco E2 Gen2 Video Processor')).toBeNull();

    // Click 'Reported' metric card
    const reportedCard = getByTestId('metric-card-reported');
    await act(async () => {
      fireEvent.press(reportedCard);
    });

    expect(await findByText('Yamaha CL5 Digital Console')).toBeTruthy();
    expect(queryByText('Robe MegaPointe Moving Head')).toBeNull();

    // Click 'All' metric card
    const allCard = getByTestId('metric-card-all');
    await act(async () => {
      fireEvent.press(allCard);
    });

    expect(await findByText('Robe MegaPointe Moving Head')).toBeTruthy();
    expect(queryByText('Shure Axient Dual Receiver')).toBeTruthy();
    expect(queryByText('Barco E2 Gen2 Video Processor')).toBeTruthy();
    expect(queryByText('Yamaha CL5 Digital Console')).toBeTruthy();
  });

  it('filters tickets via search input keyword', async () => {
    const { getByTestId, queryByText, findByText } = render(<RepairsScreen />);

    const searchInput = getByTestId('repair-feed-search-input');
    await act(async () => {
      fireEvent.changeText(searchInput, 'BAR-102');
    });

    expect(await findByText('Shure Axient Dual Receiver')).toBeTruthy();
    expect(queryByText('Robe MegaPointe Moving Head')).toBeNull();
    expect(queryByText('Barco E2 Gen2 Video Processor')).toBeNull();
  });

  it('navigates to ticket details on ticket card press', async () => {
    const { getByTestId } = render(<RepairsScreen />);

    const ticketCard = getByTestId('feed-ticket-ticket-001');
    await act(async () => {
      fireEvent.press(ticketCard);
    });

    expect(mockPush).toHaveBeenCalledWith('/repair/ticket-001');
  });

  it('navigates to new repair form on "+ Report Fault" press', async () => {
    const { getByTestId } = render(<RepairsScreen />);

    const newBtn = getByTestId('feed-new-repair-btn');
    await act(async () => {
      fireEvent.press(newBtn);
    });

    expect(mockPush).toHaveBeenCalledWith('/repair/new');
  });

  it('renders metric card counts correctly and handles empty search with filter reset', async () => {
    const { getByTestId, findByText, queryByText } = render(<RepairsScreen />);

    // Verify metric cards contain the correct numbers
    const allCard = getByTestId('metric-card-all');
    const reportedCard = getByTestId('metric-card-reported');
    const pendingCard = getByTestId('metric-card-pending');
    const underRepairCard = getByTestId('metric-card-under-repair');
    const completedCard = getByTestId('metric-card-completed');

    expect(allCard.props.accessibilityLabel).toContain('4 tickets');
    expect(reportedCard.props.accessibilityLabel).toContain('1 tickets');
    expect(pendingCard.props.accessibilityLabel).toContain('1 tickets');
    expect(underRepairCard.props.accessibilityLabel).toContain('1 tickets');
    expect(completedCard.props.accessibilityLabel).toContain('1 tickets');

    // Search for non-existent ticket to trigger empty state
    const searchInput = getByTestId('repair-feed-search-input');
    await act(async () => {
      fireEvent.changeText(searchInput, 'NonExistentDevice123');
    });

    expect(await findByText('No Repair Tickets Found')).toBeTruthy();
    const resetBtn = getByTestId('reset-filters-btn');
    expect(resetBtn).toBeTruthy();

    // Click Reset Filters
    await act(async () => {
      fireEvent.press(resetBtn);
    });

    expect(await findByText('Robe MegaPointe Moving Head')).toBeTruthy();
    expect(queryByText('No Repair Tickets Found')).toBeNull();
  });
});

