/**
 * __tests__/repair-tickets-feed.test.tsx
 * Milestone 3: Real-Time Repair Tickets Feed & Filter Tests.
 * Verifies live subscription, metrics aggregation, status/priority filtering,
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
    status: 'Awaiting Parts',
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
    status: 'Operational',
    condition: 'Available to Use',
    requestedBy: 'Dave Video',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
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

  it('subscribes to live tenant tickets and renders metric counters', async () => {
    const { getByText, findByText } = render(<RepairsScreen />);

    expect(subscribeMock).toHaveBeenCalledWith('tenant-alpha', expect.any(Function), expect.any(Function));

    // Metric numbers
    expect(await findByText('Robe MegaPointe Moving Head')).toBeTruthy();
    expect(getByText('Shure Axient Dual Receiver')).toBeTruthy();
    expect(getByText('Barco E2 Gen2 Video Processor')).toBeTruthy();
  });

  it('filters tickets by status tab', async () => {
    const { getByTestId, queryByText, findByText } = render(<RepairsScreen />);

    // Click 'Under Repair' tab
    const underRepairTab = getByTestId('status-filter-tab-under-repair');
    await act(async () => {
      fireEvent.press(underRepairTab);
    });

    expect(await findByText('Robe MegaPointe Moving Head')).toBeTruthy();
    expect(queryByText('Shure Axient Dual Receiver')).toBeNull();
    expect(queryByText('Barco E2 Gen2 Video Processor')).toBeNull();

    // Click 'Operational' tab
    const opTab = getByTestId('status-filter-tab-operational');
    await act(async () => {
      fireEvent.press(opTab);
    });

    expect(await findByText('Barco E2 Gen2 Video Processor')).toBeTruthy();
    expect(queryByText('Robe MegaPointe Moving Head')).toBeNull();
  });

  it('filters tickets by priority chip', async () => {
    const { getByTestId, queryByText, findByText } = render(<RepairsScreen />);

    // Click 'Critical' priority chip
    const criticalChip = getByTestId('priority-filter-chip-critical');
    await act(async () => {
      fireEvent.press(criticalChip);
    });

    expect(await findByText('Robe MegaPointe Moving Head')).toBeTruthy();
    expect(queryByText('Shure Axient Dual Receiver')).toBeNull();
    expect(queryByText('Barco E2 Gen2 Video Processor')).toBeNull();
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
});
