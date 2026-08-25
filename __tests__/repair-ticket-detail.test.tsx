/**
 * __tests__/repair-ticket-detail.test.tsx
 * Milestone 3 & 4: Repair Ticket Details, 1-Tap Status Updates & Action Logs.
 * Verifies equipment specifications, photo gallery lightbox, parts used,
 * 1-tap status transitions, and modal action logging.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import RepairTicketDetailScreen from '@/../app/repair/[id]';
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
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
  useLocalSearchParams: () => ({
    id: 'ticket-101',
  }),
}));

const mockSingleTicket: RepairTicket = {
  id: 'ticket-101',
  tenantId: 'tenant-alpha',
  repairNumber: 1042,
  equipment: {
    id: 'eq-robe-mega-01',
    name: 'Robe MegaPointe Moving Head',
    category: 'Lighting & FX',
    serialNumber: 'SN-ROBE-9912',
    barcode: 'BAR-ROBE-101',
    knownLocation: 'Bay 2 / Rack 4',
  },
  repairType: 'Optical / Lens / Sensor',
  priority: 'Critical',
  status: 'Under Repair',
  condition: 'Out of Service',
  requestedBy: 'David Lighting Tech',
  assignee: { id: 'usr-tech-01', name: 'Alex Technician', email: 'alex@kuro.test' },
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  attachments: [
    {
      id: 'att-1',
      type: 'Photo',
      url: 'https://firebasestorage.googleapis.com/v0/b/mock/o/lens_crack.jpg',
      fileName: 'lens_crack.jpg',
    },
  ],
  partsUsed: [
    {
      id: 'part-1',
      name: 'MegaPointe Front Lens Assembly',
      quantity: 1,
      cost: 280,
      notes: 'OEM replacement lens',
    },
    {
      id: 'part-2',
      name: 'Prism Optical Filter Glass',
      quantity: 2,
      cost: 45,
    },
  ],
  actions: [
    {
      id: 'act-1',
      user: { name: 'David Lighting Tech' },
      action: 'Reported shattered front lens during load-out.',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'act-2',
      user: { name: 'Alex Technician' },
      action: 'Diagnosed cracked lens ring. Ordered OEM replacement.',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
};

describe('Milestone 3 & 4: Repair Ticket Details Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(repairService, 'getRepairTicket').mockResolvedValue(mockSingleTicket);
  });

  it('renders equipment specifications, status, priority, and condition banner', async () => {
    const { getByText, findAllByText, getByTestId } = render(<RepairTicketDetailScreen />);

    const titles = await findAllByText('Robe MegaPointe Moving Head');
    expect(titles.length).toBeGreaterThan(0);
    expect(getByText('#REP-1042')).toBeTruthy();
    expect(getByText('SN-ROBE-9912')).toBeTruthy();
    expect(getByText('#BAR-ROBE-101')).toBeTruthy();
    expect(getByText('Lighting & FX')).toBeTruthy();
    expect(getByText('Bay 2 / Rack 4')).toBeTruthy();
    const alexNames = await findAllByText('Alex Technician');
    expect(alexNames.length).toBeGreaterThan(0);
    const davidNames = await findAllByText('David Lighting Tech');
    expect(davidNames.length).toBeGreaterThan(0);
    expect(getByTestId('ticket-condition-banner')).toBeTruthy();
  });

  it('renders damage photo gallery and opens full-screen lightbox preview', async () => {
    const { getByTestId, findByTestId, findByText } = render(<RepairTicketDetailScreen />);

    expect(await findByTestId('photo-thumb-0')).toBeTruthy();

    // Tap photo thumbnail to open lightbox
    const thumb = getByTestId('photo-thumb-0');
    await act(async () => {
      fireEvent.press(thumb);
    });

    expect(await findByText('Damage Photo Preview')).toBeTruthy();
    expect(getByTestId('lightbox-close-btn')).toBeTruthy();

    // Close lightbox
    const closeBtn = getByTestId('lightbox-close-btn');
    await act(async () => {
      fireEvent.press(closeBtn);
    });
  });

  it('renders parts used list with cost calculations', async () => {
    const { getByText, findByText } = render(<RepairTicketDetailScreen />);

    expect(await findByText('MegaPointe Front Lens Assembly')).toBeTruthy();
    expect(getByText('Prism Optical Filter Glass')).toBeTruthy();
    expect(getByText('$280.00')).toBeTruthy();
    expect(getByText('$90.00')).toBeTruthy();
    // Total badge: 280 + (45*2) = 370
    expect(getByText('$370.00')).toBeTruthy();
  });

  it('renders chronological audit action logs', async () => {
    const { getByText, findByText } = render(<RepairTicketDetailScreen />);

    expect(await findByText('Reported shattered front lens during load-out.')).toBeTruthy();
    expect(getByText('Diagnosed cracked lens ring. Ordered OEM replacement.')).toBeTruthy();
  });

  it('executes 1-tap quick status transition to Awaiting Parts', async () => {
    const updateSpy = jest
      .spyOn(repairService, 'updateRepairTicketStatus')
      .mockResolvedValueOnce({ success: true });

    const { getByTestId, findByTestId } = render(<RepairTicketDetailScreen />);

    const partsBtn = await findByTestId('status-btn-awaiting-parts');
    await act(async () => {
      fireEvent.press(partsBtn);
    });

    expect(updateSpy).toHaveBeenCalledWith(
      'ticket-101',
      'Awaiting Parts',
      expect.objectContaining({ name: 'Alex Technician' }),
      'tenant-alpha',
      undefined
    );
  });

  it('opens modal and appends technician action log', async () => {
    const appendSpy = jest
      .spyOn(repairService, 'appendRepairAction')
      .mockResolvedValueOnce({
        id: 'act-99',
        user: { name: 'Alex Technician' },
        action: 'Replaced front lens and recalibrated pan/tilt stepper motors.',
        timestamp: new Date().toISOString(),
      });

    const { getByTestId, findByTestId } = render(<RepairTicketDetailScreen />);

    // Open Modal
    const addLogBtn = await findByTestId('detail-add-action-btn');
    await act(async () => {
      fireEvent.press(addLogBtn);
    });

    expect(getByTestId('ticket-action-note-modal')).toBeTruthy();

    // Type note
    const input = getByTestId('action-note-input');
    fireEvent.changeText(input, 'Replaced front lens and recalibrated pan/tilt stepper motors.');

    // Submit
    const submitBtn = getByTestId('submit-action-note-btn');
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(appendSpy).toHaveBeenCalledWith(
      'ticket-101',
      'Replaced front lens and recalibrated pan/tilt stepper motors.',
      expect.objectContaining({ name: 'Alex Technician' }),
      'tenant-alpha'
    );
  });
});
