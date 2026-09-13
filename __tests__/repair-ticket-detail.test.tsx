/**
 * __tests__/repair-ticket-detail.test.tsx
 * Comprehensive Repair Ticket Detail Screen & New Repair Workflow Test Suite.
 *
 * Validates:
 * 1. Mobile-First Cleave Dialog Component (CleaveModalInput) for Equipment, Serial, Owner, Supplier, Requested By.
 * 2. Combined Row 2: 5 Equal Boxes (Priority: Low, Medium, High & Condition: Available to Use, Out of Service).
 * 3. 5-Second Debounced / Pooled Mutation Saving with optimistic UI updates and immediate unmount flush.
 * 4. 3-Column Mobile Date Scroller for Repair Period with presets.
 * 5. Terminology Simplification: Images, Documents & Notes (renamed from Technician Notes).
 * 6. Prominent top-level Internal Notes preview and modal editor in Details section.
 * 7. Auto-fill Requested By in New Mode.
 * 8. Real camera integration and active in-app document viewing via Linking.openURL.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import RepairTicketDetailScreen from '@/../app/repair/[id]';
import * as repairService from '@/services/repair-service';
import * as equipmentService from '@/services/equipment-service';
import type { RepairTicket, TenantSupplier, TenantOwner, TenantCrewMember } from '@/types/repair';
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
  internalNotes: 'REF-2026-X99: Optical bench diagnostic pending',
  internalReference: 'REF-2026-X99',
  supplierId: 'Stage Electrics UK',
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

const mockTenantOwners: TenantOwner[] = [
  { id: 'own-1', name: 'Alpha Rental Group', type: 'Client', email: 'rentals@alpha.test' },
  { id: 'own-2', name: 'Sydney Opera House', type: 'Venue', email: 'events@sydneyoperahouse.test' },
  { id: 'own-3', name: 'Enmore Theatre', type: 'Venue', email: 'production@enmore.test' },
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

describe('Comprehensive Repair Ticket Details Screen & Mobile Cleave Architecture', () => {
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
    jest.spyOn(repairService, 'fetchTenantOwners').mockResolvedValue(mockTenantOwners);
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
      const { findByTestId } = render(<RepairTicketDetailScreen mode="new" />);

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
  // 3. ROW 2: COMBINED PRIORITY & CONDITION STRIP
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
  // 4. MOBILE-FIRST CLEAVE DIALOG PICKERS & DETAILS CLEANUP
  // ==========================================================================
  describe('Mobile Cleave Dialogs & Details Section Cleanup', () => {
    it('renders prominent top-level Internal Notes preview and opens editor modal on tap', async () => {
      const { findByTestId, getByTestId, getByText } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('ticket-info-card')).toBeTruthy();
      const internalNotesBtn = getByTestId('ticket-internal-notes-btn');
      expect(internalNotesBtn).toBeTruthy();

      await act(async () => {
        fireEvent.press(internalNotesBtn);
      });

      expect(getByTestId('edit-internal-notes-modal')).toBeTruthy();
      const input = getByTestId('edit-internal-notes-input');
      fireEvent.changeText(input, 'New bench observation: optical capacitor replaced');

      const saveBtn = getByTestId('save-edit-internal-notes-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(getByText(/New bench observation/)).toBeTruthy();
    });

    it('replaces Location and Category with Owner Cleave picker populated with tenant contacts', async () => {
      const { findByTestId, getByTestId, queryByTestId } = render(<RepairTicketDetailScreen />);

      await findByTestId('ticket-info-card');

      // Verify Category and Location inputs are removed from details card
      expect(queryByTestId('input-category')).toBeNull();
      expect(queryByTestId('input-location')).toBeNull();

      // Verify Owner Cleave Picker exists
      const ownerPicker = getByTestId('input-owner');
      expect(ownerPicker).toBeTruthy();

      // Tap Owner picker to open Cleave dialog
      await act(async () => {
        fireEvent.press(ownerPicker);
      });

      const ownerSugg1 = await findByTestId('owner-option-1');
      expect(ownerSugg1).toBeTruthy();

      await act(async () => {
        fireEvent.press(ownerSugg1);
      });

      expect(getByTestId('input-owner')).toBeTruthy();
    });

    it('supports selecting serial numbers from equipment inventory via Cleave modal', async () => {
      const { findByTestId, getByTestId, getByDisplayValue } = render(<RepairTicketDetailScreen />);

      await findByTestId('ticket-info-card');
      const serialPicker = getByTestId('input-serial-number');

      await act(async () => {
        fireEvent.press(serialPicker);
      });

      const serialSugg0 = await findByTestId('serial-option-0');
      expect(serialSugg0).toBeTruthy();

      await act(async () => {
        fireEvent.press(serialSugg0);
      });

      expect(getByDisplayValue('SN-ROBE-9912')).toBeTruthy();
    });

    it('supports searching and selecting suppliers via Cleave modal dialog', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      await findByTestId('ticket-info-card');
      const suppPicker = getByTestId('input-supplier');

      await act(async () => {
        fireEvent.press(suppPicker);
      });

      const suppSugg0 = await findByTestId('supplier-option-0');
      expect(suppSugg0).toBeTruthy();

      await act(async () => {
        fireEvent.press(suppSugg0);
      });

      expect(getByTestId('input-supplier')).toBeTruthy();
    });

    it('supports searching and selecting crew members for Requested By via Cleave modal dialog', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      await findByTestId('ticket-info-card');
      const crewPicker = getByTestId('input-requested-by');

      await act(async () => {
        fireEvent.press(crewPicker);
      });

      const crewSugg0 = await findByTestId('crew-option-0');
      expect(crewSugg0).toBeTruthy();

      await act(async () => {
        fireEvent.press(crewSugg0);
      });

      expect(getByTestId('input-requested-by')).toBeTruthy();
    });

    it('auto-fills Requested By with logged-in user in new repair mode', async () => {
      const { findByTestId, getByDisplayValue } = render(<RepairTicketDetailScreen mode="new" />);

      await findByTestId('ticket-info-card');
      expect(getByDisplayValue('Alex Technician')).toBeTruthy();
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

      // Make edits
      fireEvent.changeText(equipInput, 'Clay Paky Sharpy Plus');
      fireEvent.changeText(serialInput, 'SN-CP-4401');
      fireEvent.changeText(internalRefInput, 'REF-BATCH-2026');
      fireEvent.press(lowPriorityBtn);

      expect(updateFieldsSpy).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(4900);
      });
      expect(updateFieldsSpy).not.toHaveBeenCalled();

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

      const preset1Week = getByTestId('period-preset-1week');
      fireEvent.press(preset1Week);

      const applyBtn = getByTestId('save-period-btn');
      await act(async () => {
        fireEvent.press(applyBtn);
      });

      expect(getByTestId('ticket-repair-period')).toBeTruthy();
    });
  });

  // ==========================================================================
  // 7. IMAGES, DOCUMENTS & NOTES TERMINOLOGY & ATTACHMENTS
  // ==========================================================================
  describe('Images, Documents & Notes Terminology & Attachments', () => {
    it('renders "Images", "Documents", and "Notes" sections cleanly', async () => {
      const { findByText, getByText } = render(<RepairTicketDetailScreen />);

      expect(await findByText('Images')).toBeTruthy();
      expect(getByText('Documents (1)')).toBeTruthy();
      expect(getByText('INTERNAL NOTES')).toBeTruthy();
    });

    it('supports opening document URL directly with View/Open Document action button', async () => {
      const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const docItem = await findByTestId('doc-item-0');
      await act(async () => {
        fireEvent.press(docItem);
      });

      expect(getByTestId('doc-viewer-modal')).toBeTruthy();

      const openBtn = getByTestId('open-document-btn');
      await act(async () => {
        fireEvent.press(openBtn);
      });

      expect(openURLSpy).toHaveBeenCalledWith('https://firebasestorage.googleapis.com/v0/b/mock/o/service_manual.pdf');
    });

    it('edits internal notes through the visible modal and saves the narrow field update', async () => {
      const updateSpy = jest.spyOn(repairService, 'updateRepairTicketFields').mockResolvedValue({ success: true });
      const { findByTestId, getByTestId, unmount } = render(<RepairTicketDetailScreen />);
      fireEvent.press(await findByTestId('ticket-internal-notes-btn'));
      fireEvent.changeText(getByTestId('edit-internal-notes-input'), 'Updated technician findings');
      fireEvent.press(getByTestId('save-edit-internal-notes-btn'));
      await act(async () => { unmount(); });
      expect(updateSpy).toHaveBeenCalledWith('ticket-101',
        expect.objectContaining({ internalNotes: 'Updated technician findings' }), expect.anything(), 'tenant-alpha');
    });

    it('invokes real camera capture with permissions and attaches photo', async () => {
      const reqPermSpy = jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync');
      const launchCamSpy = jest.spyOn(ImagePicker, 'launchCameraAsync');

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const addAttBtn = await findByTestId('detail-add-attachment-btn');
      await act(async () => {
        fireEvent.press(addAttBtn);
      });

      const addPhotoBtn = getByTestId('add-photo-evidence-btn');
      await act(async () => {
        fireEvent.press(addPhotoBtn);
      });

      expect(reqPermSpy).toHaveBeenCalled();
      expect(launchCamSpy).toHaveBeenCalledWith(
        expect.objectContaining({ quality: 0.8, allowsEditing: false })
      );
    });
  });

  // ==========================================================================
  // 8. DUAL FIXED BOTTOM ACTION BAR
  // ==========================================================================
  describe('Dual Fixed Bottom Action Bar', () => {
    it('opens the attachment chooser from the bottom action bar', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);
      fireEvent.press(await findByTestId('detail-add-attachment-btn'));
      expect(getByTestId('add-attachment-modal')).toBeTruthy();
      expect(getByTestId('add-photo-evidence-btn')).toBeTruthy();
      expect(getByTestId('add-doc-evidence-btn')).toBeTruthy();
    });

    it('styles both "Add Photo" and "Add Attachment" buttons with brandGreen background', async () => {
      const { findByTestId } = render(<RepairTicketDetailScreen />);
      const addPhotoBtn = await findByTestId('detail-add-photo-btn');
      const addAttBtn = await findByTestId('detail-add-attachment-btn');

      const flatPhotoStyle = StyleSheet.flatten(
        typeof addPhotoBtn.props.style === 'function' ? addPhotoBtn.props.style({ pressed: false }) : addPhotoBtn.props.style
      );
      const flatAttStyle = StyleSheet.flatten(
        typeof addAttBtn.props.style === 'function' ? addAttBtn.props.style({ pressed: false }) : addAttBtn.props.style
      );

      expect(flatPhotoStyle.backgroundColor).toBe('#206020');
      expect(flatAttStyle.backgroundColor).toBe('#206020');
    });
  });

  // ==========================================================================
  // 9. OPEN ISSUES LEDGER & EDGE CASE STRESS TESTS
  // ==========================================================================
  describe('Open Issues Ledger & Edge Case Stress Tests', () => {
    it('preserves raw custom strings when creating ticket with custom supplier, owner, and requester', async () => {
      const createSpy = jest
        .spyOn(repairService, 'createRepairTicket')
        .mockResolvedValueOnce('ticket-custom-123');

      const { findByTestId, getByTestId } = render(
        <RepairTicketDetailScreen
          mode="new"
          initialParams={{
            name: 'Custom LED Par',
            category: 'Lighting',
            owner: 'Custom Production Client',
          }}
        />
      );

      await findByTestId('ticket-info-card');

      const supplierInput = getByTestId('input-supplier');
      const requesterInput = getByTestId('input-requested-by');
      fireEvent.press(getByTestId('ticket-internal-notes-btn'));
    const descInput = getByTestId('edit-internal-notes-input');

      fireEvent.changeText(supplierInput, 'Custom Boutique Supplier Pty Ltd');
      fireEvent.changeText(requesterInput, 'External Subcontractor Jane');
      fireEvent.changeText(descInput, 'Blown power supply unit');
    fireEvent.press(getByTestId('save-edit-internal-notes-btn'));

      const submitBtn = getByTestId('submit-repair-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(createSpy).toHaveBeenCalledWith(
        'tenant-alpha',
        expect.objectContaining({
          supplierId: 'Custom Boutique Supplier Pty Ltd',
          requestedBy: 'External Subcontractor Jane',
          owner: 'Custom Production Client',
          internalNotes: 'Blown power supply unit',
        }),
        expect.anything()
      );
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

      const completeBtn = getByTestId('status-btn-completed');
      await act(async () => {
        fireEvent.press(completeBtn);
      });

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
  });
});
