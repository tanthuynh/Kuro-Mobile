/**
 * __tests__/repair-ticket-detail.test.tsx
 * Comprehensive Repair Ticket Detail Screen Test Suite (R1-R6).
 *
 * Validates:
 * 1. Single Text Input with Autocomplete for Equipment, Serial Number, Requester, and Supplier.
 * 2. Combined Row 2: 5 Equal Boxes (Priority: Low, Medium, High & Condition: Available to Use, Out of Service).
 * 3. 5-Second Debounced / Pooled Mutation Saving with optimistic UI updates and immediate unmount flush.
 * 4. 3-Column Mobile Date Scroller for Repair Period with presets.
 * 5. Terminology Simplification (Images & Documents) and Attachments management.
 * 6. Dual fixed bottom action bar and action logs.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import RepairTicketDetailScreen from '@/../app/repair/[id]';
import * as repairService from '@/services/repair-service';
import * as equipmentService from '@/services/equipment-service';
import type { RepairTicket, TenantSupplier, TenantCrewMember } from '@/types/repair';
import type { Equipment } from '@/types/equipment';

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
  useLocalSearchParams: () => ({
    id: 'ticket-101',
  }),
}));

const mockSingleTicket: RepairTicket = {
  id: 'ticket-101',
  tenantId: 'tenant-alpha',
  repairNumber: 1042,
  internalReference: 'REF-2026-X99',
  supplierId: 'SUPP-ROBE-GLOBAL',
  owner: 'Alpha Rental Group',
  repairPeriodStart: '2026-08-25T08:00:00.000Z',
  repairPeriodEnd: '2026-08-27T18:00:00.000Z',
  equipment: {
    id: 'eq-robe-mega-01',
    name: 'Robe MegaPointe Moving Head',
    category: 'Lighting & FX',
    serialNumber: 'SN-ROBE-9912',
    barcode: 'BAR-ROBE-101',
    knownLocation: 'Bay 2 / Rack 4',
  },
  repairType: 'Optical / Lens / Sensor',
  priority: 'High',
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
      uploadedAt: '2026-08-26T10:00:00.000Z',
    },
    {
      id: 'att-2',
      type: 'PDF',
      url: 'https://firebasestorage.googleapis.com/v0/b/mock/o/service_manual.pdf',
      fileName: 'service_manual.pdf',
      uploadedAt: '2026-08-26T11:00:00.000Z',
    },
  ],
  notes: [
    {
      id: 'note-1',
      content: 'Inspection revealed cracked front glass element.',
      user: { id: 'usr-tech-01', name: 'Alex Technician' },
      timestamp: new Date(Date.now() - 1800000).toISOString(),
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
  ],
};

const mockTenantSuppliers: TenantSupplier[] = [
  { id: 'supp-1', name: 'Clay Paky Italy', type: 'Supplier', email: 'sales@claypaky.it' },
  { id: 'supp-2', name: 'Robe UK Supplies', type: 'Supplier', email: 'info@robe.co.uk' },
  { id: 'supp-3', name: 'Stage Electrics UK', type: 'Supplier', phone: '+44 117 938 4000' },
];

const mockTenantCrew: TenantCrewMember[] = [
  { id: 'crew-1', name: 'Alex Technician', email: 'alex@kuro.test', role: 'Technician', position: 'Lead Bench Tech' },
  { id: 'crew-2', name: 'David Lighting Tech', email: 'david@kuro.test', role: 'Technician', position: 'Head of Lighting' },
  { id: 'crew-3', name: 'Sarah Audio Engineer', email: 'sarah@kuro.test', role: 'Crew', position: 'A1 Audio' },
];

const mockTenantEquipment: Equipment[] = [
  {
    id: 'eq-1',
    tenantId: 'tenant-alpha',
    name: 'Robe MegaPointe Moving Head',
    category: 'Lighting & FX',
    model: 'MegaPointe',
    barcode: 'BAR-ROBE-101',
    serialNumber: 'SN-ROBE-9912',
    serialNumbers: [
      { id: 'sn-1', serial: 'SN-ROBE-9912', status: 'In Repair' },
      { id: 'sn-2', serial: 'SN-ROBE-9913', status: 'Available' },
      { id: 'sn-3', serial: 'SN-ROBE-9914', status: 'Available' },
    ],
    quantity: 12,
  },
  {
    id: 'eq-2',
    tenantId: 'tenant-alpha',
    name: 'Clay Paky Sharpy Plus',
    category: 'Lighting & FX',
    model: 'Sharpy Plus',
    barcode: 'BAR-CP-102',
    serialNumber: 'SN-CP-4401',
    serialNumbers: [
      { id: 'sn-4', serial: 'SN-CP-4401', status: 'Available' },
      { id: 'sn-5', serial: 'SN-CP-4402', status: 'Available' },
    ],
    quantity: 8,
  },
  {
    id: 'eq-3',
    tenantId: 'tenant-alpha',
    name: 'GrandMA3 Full-Size Console',
    category: 'Control',
    model: 'GrandMA3',
    barcode: 'BAR-MA3-103',
    serialNumber: 'SN-MA3-009',
    serialNumbers: [
      { id: 'sn-6', serial: 'SN-MA3-009', status: 'Available' },
    ],
    quantity: 2,
  },
];

describe('Comprehensive Repair Ticket Details Screen (R1-R6)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useRealTimers();
    jest.spyOn(repairService, 'getRepairTicket').mockResolvedValue(mockSingleTicket);
    jest.spyOn(repairService, 'subscribeSingleRepairTicket').mockImplementation((ticketId, tenantId, onUpdate) => {
      onUpdate(mockSingleTicket);
      return jest.fn();
    });
    jest.spyOn(repairService, 'fetchTenantSuppliers').mockResolvedValue(mockTenantSuppliers);
    jest.spyOn(repairService, 'fetchTenantCrewMembers').mockResolvedValue(mockTenantCrew);
    jest.spyOn(equipmentService, 'fetchEquipment').mockResolvedValue(mockTenantEquipment);
  });

  // ==========================================================================
  // 1. HEADER & NAVIGATION
  // ==========================================================================
  describe('Header & Navigation', () => {
    it('displays ticket number [1042], equipment name, and handles back navigation to repair list screen', async () => {
      const { findByText, getByText, getByTestId } = render(<RepairTicketDetailScreen />);

      expect(await findByText('[1042]')).toBeTruthy();
      expect(getByText('Robe MegaPointe Moving Head')).toBeTruthy();

      // Back navigation
      const backBtn = getByTestId('ticket-detail-back-btn');
      await act(async () => {
        fireEvent.press(backBtn);
      });

      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/repairs');
    });

    it('returns to repair list screen when pressing back button on new repair screen', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen mode="new" />);

      const backBtn = await findByTestId('new-repair-back-btn');
      await act(async () => {
        fireEvent.press(backBtn);
      });

      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/repairs');
    });
  });

  // ==========================================================================
  // 2. ROW 1: 5-BUTTON STATUS TRANSITION STRIP
  // ==========================================================================
  describe('Row 1: 5-Button Status Transition Strip', () => {
    it('renders all 5 canonical statuses and executes unblocked status transitions with instant feedback', async () => {
      const updateStatusSpy = jest
        .spyOn(repairService, 'updateRepairTicketStatus')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('status-btn-reported')).toBeTruthy();
      expect(getByTestId('status-btn-pending')).toBeTruthy();
      expect(getByTestId('status-btn-under-repair')).toBeTruthy();
      expect(getByTestId('status-btn-completed')).toBeTruthy();
      expect(getByTestId('status-btn-cancel')).toBeTruthy();

      // Transition to Cancel
      const cancelBtn = getByTestId('status-btn-cancel');
      await act(async () => {
        fireEvent.press(cancelBtn);
      });

      expect(updateStatusSpy).toHaveBeenCalledWith(
        'ticket-101',
        'Cancel',
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });
  });

  // ==========================================================================
  // 3. ROW 2: 5 EQUAL BOXES (COMBINED PRIORITY & CONDITION STRIP)
  // ==========================================================================
  describe('Row 2: Combined 5 Equal Boxes (Priority & Condition)', () => {
    it('renders 5 equal-width boxes on the same horizontal row: Low, Medium, High, Available to Use, Out of Service', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('combined-priority-condition-row')).toBeTruthy();
      expect(getByTestId('priority-btn-low')).toBeTruthy();
      expect(getByTestId('priority-btn-medium')).toBeTruthy();
      expect(getByTestId('priority-btn-high')).toBeTruthy();
      expect(getByTestId('condition-btn-available')).toBeTruthy();
      expect(getByTestId('condition-btn-out-of-service')).toBeTruthy();
    });

    it('updates priority optimistically when tapping Low, Medium, or High', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const lowBtn = await findByTestId('priority-btn-low');
      await act(async () => {
        fireEvent.press(lowBtn);
      });

      expect(lowBtn.props.accessibilityState.selected).toBe(true);

      const medBtn = getByTestId('priority-btn-medium');
      await act(async () => {
        fireEvent.press(medBtn);
      });

      expect(medBtn.props.accessibilityState.selected).toBe(true);
      expect(lowBtn.props.accessibilityState.selected).toBe(false);
    });

    it('updates condition optimistically when tapping Available to Use or Out of Service', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const availBtn = await findByTestId('condition-btn-available');
      await act(async () => {
        fireEvent.press(availBtn);
      });

      expect(availBtn.props.accessibilityState.selected).toBe(true);

      const oosBtn = getByTestId('condition-btn-out-of-service');
      await act(async () => {
        fireEvent.press(oosBtn);
      });

      expect(oosBtn.props.accessibilityState.selected).toBe(true);
      expect(availBtn.props.accessibilityState.selected).toBe(false);
    });
  });

  // ==========================================================================
  // 4. SINGLE TEXT INPUTS WITH AUTOCOMPLETE
  // ==========================================================================
  describe('Single Text Inputs with Autocomplete', () => {
    it('renders single text inputs with autocomplete for Serial, Supplier, and Requester', async () => {
      const { findByTestId, getByTestId, getByDisplayValue } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('ticket-info-card')).toBeTruthy();
      expect(getByTestId('input-serial-number')).toBeTruthy();
      expect(getByTestId('input-internal-ref')).toBeTruthy();
      expect(getByTestId('input-supplier')).toBeTruthy();
      expect(getByTestId('input-requested-by')).toBeTruthy();

      expect(getByDisplayValue('SN-ROBE-9912')).toBeTruthy();
      expect(getByDisplayValue('REF-2026-X99')).toBeTruthy();
    });

    it('allows typing custom equipment name or selecting from inventory suggestions via header editor', async () => {
      const { findByTestId, getByTestId, findByText } = render(<RepairTicketDetailScreen />);

      const equipHeaderBtn = await findByTestId('header-equipment-name-btn');
      await act(async () => {
        fireEvent.press(equipHeaderBtn);
      });

      expect(getByTestId('edit-equipment-modal')).toBeTruthy();
      const sugg0 = await findByTestId('equipment-option-0');
      expect(sugg0).toBeTruthy();

      await act(async () => {
        fireEvent.press(sugg0);
      });

      expect(await findByText('Robe MegaPointe Moving Head')).toBeTruthy();
    });

    it('populates serial number suggestions from selected equipment inventory item', async () => {
      const { findByTestId, getByTestId, getByDisplayValue } = render(<RepairTicketDetailScreen />);

      const equipHeaderBtn = await findByTestId('header-equipment-name-btn');
      await act(async () => {
        fireEvent.press(equipHeaderBtn);
      });

      const robeOption = await findByTestId('equipment-option-0');
      await act(async () => {
        fireEvent.press(robeOption);
      });

      const serialInput = getByTestId('input-serial-number');
      fireEvent(serialInput, 'focus');

      const serialSugg0 = await findByTestId('serial-option-0');
      expect(serialSugg0).toBeTruthy();

      await act(async () => {
        fireEvent.press(serialSugg0);
      });

      expect(getByDisplayValue('SN-ROBE-9912')).toBeTruthy();
    });

    it('allows typing custom serial number', async () => {
      const { findByTestId, getByTestId, getByDisplayValue } = render(<RepairTicketDetailScreen />);

      const serialInput = await findByTestId('input-serial-number');
      fireEvent.changeText(serialInput, 'CUSTOM-SN-7777');

      expect(getByDisplayValue('CUSTOM-SN-7777')).toBeTruthy();
    });

    it('supports autocomplete suggestions and custom entry for Supplier', async () => {
      const { findByTestId, getByTestId, getByDisplayValue } = render(<RepairTicketDetailScreen />);

      await findByTestId('ticket-info-card');
      const suppInput = getByTestId('input-supplier');
      fireEvent(suppInput, 'focus');
      fireEvent.changeText(suppInput, 'Stage');

      const suppSugg0 = await findByTestId('supplier-option-0');
      expect(suppSugg0).toBeTruthy();

      await act(async () => {
        fireEvent.press(suppSugg0);
      });

      expect(getByDisplayValue('Stage Electrics UK')).toBeTruthy();

      // Free-text entry
      fireEvent.changeText(suppInput, 'Independent Pro Audio Repair');
      expect(getByDisplayValue('Independent Pro Audio Repair')).toBeTruthy();
    });

    it('supports autocomplete suggestions and custom entry for Requested By', async () => {
      const { findByTestId, getByTestId, getByDisplayValue } = render(<RepairTicketDetailScreen />);

      await findByTestId('ticket-info-card');
      const crewInput = getByTestId('input-requested-by');
      fireEvent(crewInput, 'focus');
      fireEvent.changeText(crewInput, 'Sarah');

      const crewSugg0 = await findByTestId('crew-option-0');
      expect(crewSugg0).toBeTruthy();

      await act(async () => {
        fireEvent.press(crewSugg0);
      });

      expect(getByDisplayValue('Sarah Audio Engineer')).toBeTruthy();

      // Free-text entry
      fireEvent.changeText(crewInput, 'Freelance Systems Engineer');
      expect(getByDisplayValue('Freelance Systems Engineer')).toBeTruthy();
    });
  });

  // ==========================================================================
  // 5. 5-SECOND DEBOUNCED / POOLED MUTATION SAVING
  // ==========================================================================
  describe('5-Second Debounced / Pooled Mutation Saving', () => {
    it('buffers multiple field edits locally and flushes them in a single batch after 5 seconds', async () => {
      jest.useFakeTimers();
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValue({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);
      await findByTestId('ticket-info-card');

      const equipInput = getByTestId('input-equipment-name');
      const serialInput = getByTestId('input-serial-number');
      const internalRefInput = getByTestId('input-internal-ref');
      const lowPriorityBtn = getByTestId('priority-btn-low');

      // Make 4 separate edits in quick succession
      fireEvent.changeText(equipInput, 'Clay Paky Sharpy Plus');
      fireEvent.changeText(serialInput, 'SN-CP-4401');
      fireEvent.changeText(internalRefInput, 'REF-BATCH-2026');
      fireEvent.press(lowPriorityBtn);

      // Immediately: Service NOT called yet because of 5-second debounce
      expect(updateFieldsSpy).not.toHaveBeenCalled();

      // Advance timers by 4.9 seconds: Still not called
      act(() => {
        jest.advanceTimersByTime(4900);
      });
      expect(updateFieldsSpy).not.toHaveBeenCalled();

      // Advance past 5 seconds: Pooled changes flushed in one batch!
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        expect.objectContaining({
          equipmentName: 'Clay Paky Sharpy Plus',
          serialNumber: 'SN-CP-4401',
          internalReference: 'REF-BATCH-2026',
          priority: 'Low',
        }),
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );

      jest.useRealTimers();
    });

    it('immediately flushes pending pooled mutations on unmount', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValue({ success: true });

      const { findByTestId, getByTestId, unmount } = render(<RepairTicketDetailScreen />);
      await findByTestId('ticket-info-card');

      const internalRefInput = getByTestId('input-internal-ref');
      fireEvent.changeText(internalRefInput, 'REF-FLUSH-ON-UNMOUNT');

      // Unmount component before 5s timer expires
      unmount();

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        expect.objectContaining({
          internalReference: 'REF-FLUSH-ON-UNMOUNT',
        }),
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });
  });

  // ==========================================================================
  // 6. 3-COLUMN MOBILE DATE SCROLLER FOR REPAIR PERIOD
  // ==========================================================================
  describe('3-Column Mobile Date Scroller for Repair Period', () => {
    it('opens 3-column mobile date scroller modal with Day, Month, Year columns', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const periodTile = await findByTestId('ticket-repair-period');
      await act(async () => {
        fireEvent.press(periodTile);
      });

      expect(getByTestId('edit-period-modal')).toBeTruthy();
      expect(getByTestId('day-col')).toBeTruthy();
      expect(getByTestId('month-col')).toBeTruthy();
      expect(getByTestId('year-col')).toBeTruthy();
    });

    it('sets repair period dates using quick preset chips (Today, 3 Days, 1 Week, 2 Weeks, Clear)', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const periodTile = await findByTestId('ticket-repair-period');
      await act(async () => {
        fireEvent.press(periodTile);
      });

      // Tap 1 Week preset chip
      const preset1Week = getByTestId('period-preset-1week');
      fireEvent.press(preset1Week);

      // Save period
      const applyBtn = getByTestId('save-period-btn');
      await act(async () => {
        fireEvent.press(applyBtn);
      });

      expect(getByTestId('ticket-repair-period')).toBeTruthy();
    });

    it('validates that end date cannot be before start date in date scroller', async () => {
      const { findByTestId, getByTestId, findByText } = render(<RepairTicketDetailScreen />);

      const periodTile = await findByTestId('ticket-repair-period');
      await act(async () => {
        fireEvent.press(periodTile);
      });

      // Set Start Date to Day 25
      const startTab = getByTestId('date-tab-start');
      fireEvent.press(startTab);
      const day25 = getByTestId('day-col-item-25');
      fireEvent.press(day25);

      // Set End Date to Day 10 (earlier than start date)
      const endTab = getByTestId('date-tab-end');
      fireEvent.press(endTab);
      const day10 = getByTestId('day-col-item-10');
      fireEvent.press(day10);

      // Try to save
      const applyBtn = getByTestId('save-period-btn');
      await act(async () => {
        fireEvent.press(applyBtn);
      });

      // Should show validation error and NOT close modal
      expect(await findByText('End date must be on or after start date')).toBeTruthy();
      expect(getByTestId('edit-period-modal')).toBeTruthy();
    });

    it('adjusts day column list length dynamically when month is changed to February', async () => {
      const { findByTestId, getByTestId, queryByTestId } = render(<RepairTicketDetailScreen />);

      const periodTile = await findByTestId('ticket-repair-period');
      await act(async () => {
        fireEvent.press(periodTile);
      });

      // Select February (index 1) in Month column
      const monthFeb = getByTestId('month-col-item-1');
      fireEvent.press(monthFeb);

      // In non-leap year (e.g. 2025/2026/2027), Day 28 exists, Day 31 does NOT exist in list
      expect(getByTestId('day-col-item-28')).toBeTruthy();
      expect(queryByTestId('day-col-item-31')).toBeNull();
    });
  });

  // ==========================================================================
  // 7. IMAGES & DOCUMENTS TERMINOLOGY & ATTACHMENTS
  // ==========================================================================
  describe('Images & Documents Terminology & Attachments', () => {
    it('renders "Images" and "Documents" sections instead of legacy names', async () => {
      const { findByText, getByText } = render(<RepairTicketDetailScreen />);

      expect(await findByText('Images')).toBeTruthy();
      expect(getByText('Documents (1)')).toBeTruthy();
    });

    it('supports viewing image in lightbox and deleting with confirmation', async () => {
      const deleteAttSpy = jest
        .spyOn(repairService, 'deleteRepairAttachment')
        .mockResolvedValueOnce({ success: true } as any);

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const thumb = await findByTestId('photo-thumb-0');
      await act(async () => {
        fireEvent.press(thumb);
      });

      expect(getByTestId('photo-lightbox-modal')).toBeTruthy();

      const deleteBtn = getByTestId('lightbox-delete-btn');
      await act(async () => {
        fireEvent.press(deleteBtn);
      });

      expect(getByTestId('delete-confirm-modal')).toBeTruthy();
      const confirmBtn = getByTestId('confirm-delete-btn');
      await act(async () => {
        fireEvent.press(confirmBtn);
      });

      expect(deleteAttSpy).toHaveBeenCalledWith('ticket-101', 'att-1', expect.anything(), 'tenant-alpha');
    });

    it('supports adding technician notes and editing them with modal', async () => {
      const updateNoteSpy = jest
        .spyOn(repairService, 'updateRepairNote')
        .mockResolvedValueOnce({ id: 'note-1', content: 'Updated technician findings' } as any);

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const noteItem = await findByTestId('note-item-0');
      await act(async () => {
        fireEvent.press(noteItem);
      });

      expect(getByTestId('edit-note-modal')).toBeTruthy();

      const input = getByTestId('edit-note-input');
      fireEvent.changeText(input, 'Updated technician findings');

      const saveBtn = getByTestId('save-edit-note-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(updateNoteSpy).toHaveBeenCalledWith(
        'ticket-101',
        'note-1',
        'Updated technician findings',
        expect.anything(),
        'tenant-alpha'
      );
    });
  });

  // ==========================================================================
  // 8. DUAL FIXED BOTTOM ACTION BAR
  // ==========================================================================
  describe('Dual Fixed Bottom Action Bar', () => {
    it('opens Add Note modal and appends note to ticket', async () => {
      const appendNoteSpy = jest
        .spyOn(repairService, 'appendRepairNote')
        .mockResolvedValueOnce({ id: 'note-new', content: 'Added bench note', timestamp: new Date().toISOString() } as any);

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const addNoteBtn = await findByTestId('detail-add-note-btn');
      await act(async () => {
        fireEvent.press(addNoteBtn);
      });

      expect(getByTestId('add-note-modal')).toBeTruthy();

      const input = getByTestId('add-note-input');
      fireEvent.changeText(input, 'Added bench note');

      const submitBtn = getByTestId('submit-add-note-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(appendNoteSpy).toHaveBeenCalledWith(
        'ticket-101',
        'Added bench note',
        expect.anything(),
        'tenant-alpha'
      );
    });
  });

  // ==========================================================================
  // 9. OPEN ISSUES LEDGER & EDGE CASE STRESS TESTS
  // ==========================================================================
  describe('Open Issues Ledger & Edge Case Stress Tests', () => {
    it('verifies Row 2 all 5 equal boxes have adjustsFontSizeToFit enabled for narrow screens', async () => {
      const { findByTestId } = render(<RepairTicketDetailScreen />);

      const lowBtn = await findByTestId('priority-btn-low');
      const medBtn = await findByTestId('priority-btn-medium');
      const highBtn = await findByTestId('priority-btn-high');
      const availBtn = await findByTestId('condition-btn-available');
      const oosBtn = await findByTestId('condition-btn-out-of-service');

      // Verify all 5 box labels exist and have adjustsFontSizeToFit
      expect(lowBtn.findByProps({ adjustsFontSizeToFit: true })).toBeTruthy();
      expect(medBtn.findByProps({ adjustsFontSizeToFit: true })).toBeTruthy();
      expect(highBtn.findByProps({ adjustsFontSizeToFit: true })).toBeTruthy();
      expect(availBtn.findByProps({ adjustsFontSizeToFit: true })).toBeTruthy();
      expect(oosBtn.findByProps({ adjustsFontSizeToFit: true })).toBeTruthy();
    });

    it('preserves raw custom strings when creating ticket with custom supplier and requester without dropdown selection', async () => {
      const createSpy = jest
        .spyOn(repairService, 'createRepairTicket')
        .mockResolvedValueOnce('ticket-custom-123');

      const { findByTestId, getByTestId } = render(
        <RepairTicketDetailScreen
          mode="new"
          initialParams={{
            name: 'Custom LED Par',
            category: 'Lighting',
          }}
        />
      );

      await findByTestId('ticket-info-card');

      const supplierInput = getByTestId('input-supplier');
      const requesterInput = getByTestId('input-requested-by');
      const descInput = getByTestId('input-fault-description');

      // Type free-text strings directly
      fireEvent.changeText(supplierInput, 'Custom Boutique Supplier Pty Ltd');
      fireEvent.changeText(requesterInput, 'External Subcontractor Jane');
      fireEvent.changeText(descInput, 'Blown power supply unit');

      const submitBtn = getByTestId('submit-repair-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(createSpy).toHaveBeenCalledWith(
        'tenant-alpha',
        expect.objectContaining({
          supplierId: 'Custom Boutique Supplier Pty Ltd',
          requestedBy: 'External Subcontractor Jane',
          initialNote: 'Blown power supply unit',
        }),
        expect.anything()
      );
    });

    it('handles concurrent debounced edits and unmount flushing when network mutation is in flight', async () => {
      jest.useFakeTimers();
      let resolveFirstCall: (val: any) => void = () => {};
      const firstCallPromise = new Promise((resolve) => {
        resolveFirstCall = resolve;
      });

      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockImplementationOnce(() => firstCallPromise as any)
        .mockResolvedValue({ success: true } as any);

      const { findByTestId, getByTestId, unmount } = render(<RepairTicketDetailScreen />);
      await findByTestId('ticket-info-card');

      const refInput = getByTestId('input-internal-ref');

      // Edit 1
      fireEvent.changeText(refInput, 'REF-STAGE-1');

      // Advance 5 seconds to trigger flush 1
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(updateFieldsSpy).toHaveBeenCalledTimes(1);
      expect(updateFieldsSpy).toHaveBeenNthCalledWith(
        1,
        'ticket-101',
        expect.objectContaining({ internalReference: 'REF-STAGE-1' }),
        expect.anything(),
        'tenant-alpha'
      );

      // While first call is in flight, user makes Edit 2
      fireEvent.changeText(refInput, 'REF-STAGE-2');

      // User immediately closes screen / unmounts
      unmount();

      // Unmount flush must trigger second call immediately
      expect(updateFieldsSpy).toHaveBeenCalledTimes(2);
      expect(updateFieldsSpy).toHaveBeenNthCalledWith(
        2,
        'ticket-101',
        expect.objectContaining({ internalReference: 'REF-STAGE-2' }),
        expect.anything(),
        'tenant-alpha'
      );

      // Resolve first call in background
      await act(async () => {
        resolveFirstCall({ success: true });
      });

      jest.useRealTimers();
    });

    it('flushes pending debounced field edits immediately before executing a status transition', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValue({ success: true });
      const updateStatusSpy = jest
        .spyOn(repairService, 'updateRepairTicketStatus')
        .mockResolvedValue({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);
      await findByTestId('ticket-info-card');

      const refInput = getByTestId('input-internal-ref');
      fireEvent.changeText(refInput, 'REF-FLUSH-BEFORE-STATUS-CHANGE');

      // Click a status transition button immediately without waiting 5 seconds
      const completeBtn = getByTestId('status-btn-completed');
      await act(async () => {
        fireEvent.press(completeBtn);
      });

      // Both updateFields and updateStatus must have been called
      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        expect.objectContaining({ internalReference: 'REF-FLUSH-BEFORE-STATUS-CHANGE' }),
        expect.anything(),
        'tenant-alpha'
      );
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'ticket-101',
        'Completed',
        expect.anything(),
        'tenant-alpha'
      );
    });

    it('verifies transition coverage across all 5 canonical status buttons (Reported, Pending, Under Repair, Completed, Cancel)', async () => {
      const updateStatusSpy = jest
        .spyOn(repairService, 'updateRepairTicketStatus')
        .mockResolvedValue({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);
      await findByTestId('detail-quick-status-selector');

      // Initial status in mockSingleTicket is 'Under Repair'
      // 1. Transition to 'Reported'
      const repBtn = getByTestId('status-btn-reported');
      await act(async () => {
        fireEvent.press(repBtn);
      });
      expect(updateStatusSpy).toHaveBeenLastCalledWith('ticket-101', 'Reported', expect.anything(), 'tenant-alpha');

      // 2. Transition to 'Pending'
      const penBtn = getByTestId('status-btn-pending');
      await act(async () => {
        fireEvent.press(penBtn);
      });
      expect(updateStatusSpy).toHaveBeenLastCalledWith('ticket-101', 'Pending', expect.anything(), 'tenant-alpha');

      // 3. Transition to 'Under Repair'
      const underBtn = getByTestId('status-btn-under-repair');
      await act(async () => {
        fireEvent.press(underBtn);
      });
      expect(updateStatusSpy).toHaveBeenLastCalledWith('ticket-101', 'Under Repair', expect.anything(), 'tenant-alpha');

      // 4. Transition to 'Completed'
      const compBtn = getByTestId('status-btn-completed');
      await act(async () => {
        fireEvent.press(compBtn);
      });
      expect(updateStatusSpy).toHaveBeenLastCalledWith('ticket-101', 'Completed', expect.anything(), 'tenant-alpha');

      // 5. Transition to 'Cancel'
      const cancelBtn = getByTestId('status-btn-cancel');
      await act(async () => {
        fireEvent.press(cancelBtn);
      });
      expect(updateStatusSpy).toHaveBeenLastCalledWith('ticket-101', 'Cancel', expect.anything(), 'tenant-alpha');
    });

    it('verifies Row 2 boxes define minimumFontScale for resilient font scaling on compact displays', async () => {
      const { findByTestId } = render(<RepairTicketDetailScreen />);

      const lowBtn = await findByTestId('priority-btn-low');
      const medBtn = await findByTestId('priority-btn-medium');
      const highBtn = await findByTestId('priority-btn-high');
      const availBtn = await findByTestId('condition-btn-available');
      const oosBtn = await findByTestId('condition-btn-out-of-service');

      expect(lowBtn.findByProps({ minimumFontScale: 0.7 })).toBeTruthy();
      expect(medBtn.findByProps({ minimumFontScale: 0.7 })).toBeTruthy();
      expect(highBtn.findByProps({ minimumFontScale: 0.7 })).toBeTruthy();
      expect(availBtn.findByProps({ minimumFontScale: 0.7 })).toBeTruthy();
      expect(oosBtn.findByProps({ minimumFontScale: 0.7 })).toBeTruthy();
    });
  });
});

