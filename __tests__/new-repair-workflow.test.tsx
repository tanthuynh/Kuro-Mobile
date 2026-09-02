/**
 * __tests__/new-repair-workflow.test.tsx
 * Unit test suite for New Repair Screen (`app/repair/new.tsx`).
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import NewRepairScreen from '@/../app/repair/new';
import * as repairService from '@/services/repair-service';
import * as equipmentService from '@/services/equipment-service';

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

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({}),
}));

describe('NewRepairScreen (app/repair/new.tsx)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(equipmentService, 'fetchEquipment').mockResolvedValue([
      {
        id: 'eq-1',
        tenantId: 'tenant-alpha',
        name: 'Clay Paky Mythos 2',
        category: 'Lighting',
        serialNumbers: [{ id: 'sn-1', serial: 'MYTH-9901', status: 'Available' }],
      } as any,
    ]);
    jest.spyOn(repairService, 'fetchTenantSuppliers').mockResolvedValue([
      { id: 's-1', name: 'Clay Paky Italy', type: 'Supplier' },
    ]);
    jest.spyOn(repairService, 'fetchTenantOwners').mockResolvedValue([
      { id: 'o-1', name: 'Sydney Opera House', type: 'Venue' },
    ]);
    jest.spyOn(repairService, 'fetchTenantCrewMembers').mockResolvedValue([
      { id: 'c-1', name: 'Alex Technician', role: 'Technician' },
    ]);
  });

  it('renders new repair screen with auto-filled Requested By and Report Fault header', async () => {
    const { findByText, getByDisplayValue, getByTestId } = render(<NewRepairScreen />);

    expect(await findByText('Report Fault')).toBeTruthy();
    expect(getByDisplayValue('Alex Technician')).toBeTruthy();
    expect(getByTestId('fault-details-card')).toBeTruthy();
  });

  it('allows filling out equipment, fault description, and submitting new repair ticket', async () => {
    const createSpy = jest.spyOn(repairService, 'createRepairTicket').mockResolvedValueOnce('ticket-new-999');

    const { findByTestId, getByTestId } = render(<NewRepairScreen />);

    await findByTestId('ticket-info-card');

    const equipInput = getByTestId('input-equipment-name');
    const descInput = getByTestId('input-fault-description');
    const submitBtn = getByTestId('submit-repair-btn');

    fireEvent.changeText(equipInput, 'Clay Paky Mythos 2');
    fireEvent.changeText(descInput, 'Pan motor belt snapped during rig');

    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(createSpy).toHaveBeenCalledWith(
      'tenant-alpha',
      expect.objectContaining({
        equipment: expect.objectContaining({
          name: 'Clay Paky Mythos 2',
        }),
        initialNote: 'Pan motor belt snapped during rig',
        requestedBy: 'Alex Technician',
      }),
      expect.anything()
    );
  });

  it('respects explicitly passed initial requestedBy parameter', async () => {
    const { findByDisplayValue } = render(
      <NewRepairScreen
        initialParams={{
          name: 'Clay Paky Mythos 2',
          requestedBy: 'Senior Engineer Maria',
        }}
      />
    );

    expect(await findByDisplayValue('Senior Engineer Maria')).toBeTruthy();
  });
});
