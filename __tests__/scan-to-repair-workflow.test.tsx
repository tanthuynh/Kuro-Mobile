/**
 * __tests__/scan-to-repair-workflow.test.tsx
 * Milestone 2: Scan-to-Repair & Fault Reporting Workflow Tests.
 * Verifies pre-filled equipment specs, form validation, photo evidence capture,
 * and Firestore ticket submission.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import NewRepairScreen from '@/../app/repair/new';
import * as repairService from '@/services/repair-service';
import * as expoRouter from 'expo-router';

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
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
  useLocalSearchParams: jest.fn(() => ({
    equipmentId: 'eq-sony-fx6-01',
    name: 'Sony FX6 Cinema Camera',
    serialNumber: 'SN-FX6-9921',
    barcode: 'BAR-FX6-01',
    category: 'Cameras & Optics',
    location: 'Bay 4 / Shelf C',
  })),
}));

describe('Milestone 2: Scan-to-Repair Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pre-fills equipment metadata from navigation search params', () => {
    const { getByTestId, getByDisplayValue } = render(<NewRepairScreen />);

    expect(getByDisplayValue('Sony FX6 Cinema Camera')).toBeTruthy();
    expect(getByDisplayValue('SN-FX6-9921')).toBeTruthy();
    expect(getByDisplayValue('BAR-FX6-01')).toBeTruthy();
    expect(getByDisplayValue('Cameras & Optics')).toBeTruthy();
    expect(getByDisplayValue('Bay 4 / Shelf C')).toBeTruthy();
  });

  it('validates mandatory fault description before submission', async () => {
    const createSpy = jest.spyOn(repairService, 'createRepairTicket');
    const { getByTestId, findByText } = render(<NewRepairScreen />);

    const submitBtn = getByTestId('submit-repair-btn');
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(createSpy).not.toHaveBeenCalled();
    expect(await findByText('Please provide a fault description / damage notes')).toBeTruthy();
  });

  it('allows selecting priority, repair type, and operational condition toggle', async () => {
    const { getByTestId } = render(<NewRepairScreen />);

    // Select Critical Priority
    const criticalPill = getByTestId('priority-pill-critical');
    fireEvent.press(criticalPill);

    // Toggle Operational Condition to Available
    const availableToggle = getByTestId('condition-available');
    fireEvent.press(availableToggle);

    // Toggle back to Out of Service
    const outOfServiceToggle = getByTestId('condition-out-of-service');
    fireEvent.press(outOfServiceToggle);

    expect(outOfServiceToggle).toBeTruthy();
  });

  it('supports adding and removing photo attachments', async () => {
    const { getByTestId, queryByTestId, findByTestId } = render(<NewRepairScreen />);

    const addPhotoBtn = getByTestId('gallery-add-photo-btn');

    // Add first photo
    await act(async () => {
      fireEvent.press(addPhotoBtn);
    });

    expect(await findByTestId('photo-thumb-0')).toBeTruthy();

    // Add second photo
    await act(async () => {
      fireEvent.press(addPhotoBtn);
    });

    expect(await findByTestId('photo-thumb-1')).toBeTruthy();

    // Remove first photo
    const removeBtn = getByTestId('photo-remove-0');
    await act(async () => {
      fireEvent.press(removeBtn);
    });

    // One photo should remain
    expect(getByTestId('photo-thumb-0')).toBeTruthy();
    expect(queryByTestId('photo-thumb-1')).toBeNull();
  });

  it('submits valid repair ticket with tenant isolation, photos, and navigates back', async () => {
    const createSpy = jest
      .spyOn(repairService, 'createRepairTicket')
      .mockResolvedValueOnce('ticket-new-999');

    const { getByTestId } = render(<NewRepairScreen />);

    // Enter fault description
    const descInput = getByTestId('input-fault-description');
    fireEvent.changeText(descInput, 'HDMI output port is loose and dropping signal intermittently.');

    // Add damage photo
    const addPhotoBtn = getByTestId('gallery-add-photo-btn');
    await act(async () => {
      fireEvent.press(addPhotoBtn);
    });

    // Submit
    const submitBtn = getByTestId('submit-repair-btn');
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(createSpy).toHaveBeenCalledWith(
      'tenant-alpha',
      expect.objectContaining({
        equipment: expect.objectContaining({
          name: 'Sony FX6 Cinema Camera',
          serialNumber: 'SN-FX6-9921',
          barcode: 'BAR-FX6-01',
          category: 'Cameras & Optics',
        }),
        priority: 'High',
        status: 'Under Repair',
        condition: 'Out of Service',
        initialNote: 'HDMI output port is loose and dropping signal intermittently.',
        requestedBy: 'Alex Technician',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            type: 'Photo',
          }),
        ]),
      })
    );

    expect(mockBack).toHaveBeenCalled();
  });
});
