/**
 * __tests__/repair-ticket-detail.test.tsx
 * Repair Ticket Detail Screen Comprehensive Test Suite (R1-R5).
 * Validates Header, Consolidated Info Card, 5-Button Status Strip,
 * Inline Notes & Attachments with Modals & Deletion Confirmation,
 * Fixed Dual Bottom Action Bar, and Cost Calculations.
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
    {
      id: 'act-2',
      user: { name: 'Alex Technician' },
      action: 'Diagnosed cracked lens ring. Ordered OEM replacement.',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
};

describe('Repair Ticket Details Screen (R1-R5)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.spyOn(repairService, 'getRepairTicket').mockResolvedValue(mockSingleTicket);
  });

  describe('R1: Title-Sized Header & Top-Right Cleanup', () => {
    it('displays [repairNumber], equipment name, removes top-right status badge, and invokes back navigation', async () => {
      const { findByText, getByText, queryByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      expect(await findByText('[1042]')).toBeTruthy();
      expect(getByText('Robe MegaPointe Moving Head')).toBeTruthy();
      // Status badge should be removed from top right header
      expect(queryByTestId('ticket-header-status')).toBeNull();

      const backBtn = getByTestId('ticket-detail-back-btn');
      fireEvent.press(backBtn);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/repairs');
    });

    it('opens quick text edit dialog on tapping equipment name and updates name instantly', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const equipNameBtn = await findByTestId('header-equipment-name-btn');
      await act(async () => {
        fireEvent.press(equipNameBtn);
      });

      expect(getByTestId('edit-equipment-modal')).toBeTruthy();
      const input = getByTestId('edit-equipment-name-input');
      fireEvent.changeText(input, 'Robe MegaPointe Moving Head (Gen 2)');

      const saveBtn = getByTestId('save-edit-equipment-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { equipmentName: 'Robe MegaPointe Moving Head (Gen 2)' },
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });
  });

  describe('R2: 1-Click Selectors for Priority & Condition', () => {
    it('renders Row 1 (Priority, Condition, Period) and Row 2 (Serial, Ref, Supplier, Owner•Requester)', async () => {
      const { findByTestId, getByText } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('ticket-info-card')).toBeTruthy();
      expect(findByTestId('ticket-priority-badge')).toBeTruthy();
      expect(findByTestId('ticket-condition-banner')).toBeTruthy();
      expect(getByText('Out of Service')).toBeTruthy();
      expect(getByText('Critical Priority')).toBeTruthy();

      // Row 2 fields
      expect(getByText('SN-ROBE-9912')).toBeTruthy();
      expect(getByText('REF-2026-X99')).toBeTruthy();
      expect(getByText('SUPP-ROBE-GLOBAL')).toBeTruthy();
      expect(getByText('Alpha Rental Group • David Lighting Tech')).toBeTruthy();
    });

    it('opens 1-tap priority picker and updates priority instantly on option tap', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const priorityBadge = await findByTestId('ticket-priority-badge');
      await act(async () => {
        fireEvent.press(priorityBadge);
      });

      expect(getByTestId('priority-picker-modal')).toBeTruthy();

      // Tap High Priority option
      const highOption = getByTestId('priority-option-high');
      await act(async () => {
        fireEvent.press(highOption);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { priority: 'High' },
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });

    it('opens 1-tap condition picker and updates condition instantly on option tap', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const conditionBanner = await findByTestId('ticket-condition-banner');
      await act(async () => {
        fireEvent.press(conditionBanner);
      });

      expect(getByTestId('condition-picker-modal')).toBeTruthy();

      // Tap Available to Use option
      const availOption = getByTestId('condition-option-available');
      await act(async () => {
        fireEvent.press(availOption);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { condition: 'Available to Use' },
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });
  });

  describe('R3: 1-Tap Text Field Editors (Serial & Internal Reference)', () => {
    it('opens quick text edit dialog on tapping Serial Number and updates serial', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const serialItem = await findByTestId('ticket-serial-number');
      await act(async () => {
        fireEvent.press(serialItem);
      });

      expect(getByTestId('edit-serial-modal')).toBeTruthy();

      const input = getByTestId('edit-serial-input');
      fireEvent.changeText(input, 'SN-ROBE-9999-PRO');

      const saveBtn = getByTestId('save-edit-serial-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { serialNumber: 'SN-ROBE-9999-PRO' },
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });

    it('opens quick text edit dialog on tapping Internal Reference and updates reference', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const internalRefItem = await findByTestId('ticket-internal-ref');
      await act(async () => {
        fireEvent.press(internalRefItem);
      });

      expect(getByTestId('edit-internal-ref-modal')).toBeTruthy();

      const input = getByTestId('edit-internal-ref-input');
      fireEvent.changeText(input, 'REF-NEW-2026-B');

      const saveBtn = getByTestId('save-edit-internal-ref-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { internalReference: 'REF-NEW-2026-B' },
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });
  });

  describe('R4: Quick Date Range Editor', () => {
    it('opens date range picker dialog on tapping Repair Period and updates dates with presets', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const periodItem = await findByTestId('ticket-repair-period');
      await act(async () => {
        fireEvent.press(periodItem);
      });

      expect(getByTestId('edit-period-modal')).toBeTruthy();

      // Tap 1 Week Preset
      const presetWeekBtn = getByTestId('period-preset-1week');
      fireEvent.press(presetWeekBtn);

      const saveBtn = getByTestId('save-period-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        expect.objectContaining({
          repairPeriodStart: expect.any(String),
          repairPeriodEnd: expect.any(String),
        }),
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });
  });

  describe('5-Button Status Transition Strip', () => {
    it('renders all 5 canonical statuses in equal single strip and allows transitions', async () => {
      const updateSpy = jest
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

      expect(updateSpy).toHaveBeenCalledWith(
        'ticket-101',
        'Cancel',
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha',
        undefined
      );
    });
  });

  describe('R4: Consolidated Notes & Files / Attachments Card', () => {
    it('renders inline photo thumbnails and opens lightbox with delete option', async () => {
      const deleteAttSpy = jest
        .spyOn(repairService, 'deleteRepairAttachment')
        .mockResolvedValueOnce({ success: true } as any);

      const { findByTestId, getByTestId, getByText } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('photo-thumb-0')).toBeTruthy();

      // Tap thumbnail to open full-screen lightbox
      const thumb = getByTestId('photo-thumb-0');
      await act(async () => {
        fireEvent.press(thumb);
      });

      expect(getByTestId('photo-lightbox-modal')).toBeTruthy();
      expect(getByTestId('lightbox-delete-btn')).toBeTruthy();

      // Trigger delete from lightbox
      const deleteBtn = getByTestId('lightbox-delete-btn');
      await act(async () => {
        fireEvent.press(deleteBtn);
      });

      // Confirm delete dialog opens
      expect(getByTestId('delete-confirm-modal')).toBeTruthy();
      const confirmBtn = getByTestId('confirm-delete-btn');
      await act(async () => {
        fireEvent.press(confirmBtn);
      });

      expect(deleteAttSpy).toHaveBeenCalledWith('ticket-101', 'att-1', expect.anything(), 'tenant-alpha');
    });

    it('renders document list and opens document viewer with delete option', async () => {
      const deleteAttSpy = jest
        .spyOn(repairService, 'deleteRepairAttachment')
        .mockResolvedValueOnce({ success: true } as any);

      const { findByTestId, getByTestId, getByText } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('doc-item-0')).toBeTruthy();
      expect(getByText('service_manual.pdf')).toBeTruthy();

      // Tap doc item to open doc viewer modal
      const docItem = getByTestId('doc-item-0');
      await act(async () => {
        fireEvent.press(docItem);
      });

      expect(getByTestId('doc-viewer-modal')).toBeTruthy();

      // Delete from doc viewer
      const viewerDelBtn = getByTestId('viewer-delete-doc-btn');
      await act(async () => {
        fireEvent.press(viewerDelBtn);
      });

      expect(getByTestId('delete-confirm-modal')).toBeTruthy();
      const confirmBtn = getByTestId('confirm-delete-btn');
      await act(async () => {
        fireEvent.press(confirmBtn);
      });

      expect(deleteAttSpy).toHaveBeenCalledWith('ticket-101', 'att-2', expect.anything(), 'tenant-alpha');
    });

    it('renders technician notes, opens edit modal, updates and deletes note with confirmation', async () => {
      const updateNoteSpy = jest
        .spyOn(repairService, 'updateRepairNote')
        .mockResolvedValueOnce({ id: 'note-1', content: 'Updated note text' } as any);

      const deleteNoteSpy = jest
        .spyOn(repairService, 'deleteRepairNote')
        .mockResolvedValueOnce({ success: true } as any);

      const { findByTestId, getByTestId, getByText } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('note-item-0')).toBeTruthy();
      expect(getByText('Inspection revealed cracked front glass element.')).toBeTruthy();

      // Tap note to open edit dialog
      const noteItem = getByTestId('note-item-0');
      await act(async () => {
        fireEvent.press(noteItem);
      });

      expect(getByTestId('edit-note-modal')).toBeTruthy();

      // Update content and save
      const input = getByTestId('edit-note-input');
      fireEvent.changeText(input, 'Updated note content after second check.');
      const saveBtn = getByTestId('save-edit-note-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(updateNoteSpy).toHaveBeenCalledWith(
        'ticket-101',
        'note-1',
        'Updated note content after second check.',
        expect.anything(),
        'tenant-alpha'
      );
    });
  });

  describe('R5: Dual Fixed Bottom Action Bar', () => {
    it('opens Add Note modal from bottom bar and appends technician note', async () => {
      const appendNoteSpy = jest
        .spyOn(repairService, 'appendRepairNote')
        .mockResolvedValueOnce({
          id: 'note-99',
          content: 'New technician note added via bottom bar',
          timestamp: new Date().toISOString(),
        } as any);

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const addNoteBtn = await findByTestId('detail-add-note-btn');
      await act(async () => {
        fireEvent.press(addNoteBtn);
      });

      expect(getByTestId('add-note-modal')).toBeTruthy();

      const input = getByTestId('add-note-input');
      fireEvent.changeText(input, 'New technician note added via bottom bar');

      const submitBtn = getByTestId('submit-add-note-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(appendNoteSpy).toHaveBeenCalledWith(
        'ticket-101',
        'New technician note added via bottom bar',
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });

    it('opens Add Attachment modal from bottom bar and attaches document', async () => {
      const addAttSpy = jest
        .spyOn(repairService, 'addRepairAttachment')
        .mockResolvedValueOnce({
          id: 'att-99',
          url: 'https://example.com/schematic.pdf',
          fileName: 'schematic.pdf',
          type: 'PDF',
          uploadedAt: new Date().toISOString(),
        } as any);

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const addAttBtn = await findByTestId('detail-add-attachment-btn');
      await act(async () => {
        fireEvent.press(addAttBtn);
      });

      expect(getByTestId('add-attachment-modal')).toBeTruthy();

      // Enter custom URL
      const urlInput = getByTestId('attachment-url-input');
      const nameInput = getByTestId('attachment-name-input');
      fireEvent.changeText(urlInput, 'https://example.com/schematic.pdf');
      fireEvent.changeText(nameInput, 'schematic.pdf');

      const submitBtn = getByTestId('submit-attachment-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(addAttSpy).toHaveBeenCalledWith(
        'ticket-101',
        expect.objectContaining({
          url: 'https://example.com/schematic.pdf',
          fileName: 'schematic.pdf',
        }),
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });
  });

  describe('Parts Used & Action Log Cards', () => {
    it('renders parts used list with total calculations and action log timeline', async () => {
      const { findByTestId, getByText, getByTestId } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('ticket-parts-card')).toBeTruthy();
      expect(getByText('MegaPointe Front Lens Assembly')).toBeTruthy();
      expect(getByText('Prism Optical Filter Glass')).toBeTruthy();
      expect(getByText('$280.00')).toBeTruthy();
      expect(getByText('$90.00')).toBeTruthy();
      expect(getByText('$370.00')).toBeTruthy();

      expect(getByTestId('ticket-actions-card')).toBeTruthy();
      expect(getByText('Reported shattered front lens during load-out.')).toBeTruthy();
      expect(getByText('Diagnosed cracked lens ring. Ordered OEM replacement.')).toBeTruthy();
    });
  });

  describe('Adversarial & Edge Cases', () => {
    it('cancelling deletion confirmation modal aborts deletion without invoking service', async () => {
      const deleteAttSpy = jest.spyOn(repairService, 'deleteRepairAttachment');

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const removeBtn = await findByTestId('photo-remove-0');
      await act(async () => {
        fireEvent.press(removeBtn);
      });

      expect(getByTestId('delete-confirm-modal')).toBeTruthy();

      // Tap Cancel button
      const cancelBtn = getByTestId('cancel-delete-confirm-btn');
      await act(async () => {
        fireEvent.press(cancelBtn);
      });

      expect(deleteAttSpy).not.toHaveBeenCalled();
    });

    it('displays error banner when status update fails', async () => {
      jest
        .spyOn(repairService, 'updateRepairTicketStatus')
        .mockRejectedValueOnce(new Error('Network connection timeout'));

      const { findByTestId, getByTestId, findByText } = render(<RepairTicketDetailScreen />);

      const cancelBtn = await findByTestId('status-btn-cancel');
      await act(async () => {
        fireEvent.press(cancelBtn);
      });

      expect(await findByText('Network connection timeout')).toBeTruthy();
    });

    it('displays error banner when note deletion fails and dismisses modal cleanly', async () => {
      jest
        .spyOn(repairService, 'deleteRepairNote')
        .mockRejectedValueOnce(new Error('Permission denied'));

      const { findByTestId, getByTestId, getByText } = render(<RepairTicketDetailScreen />);

      const noteItem = await findByTestId('note-item-0');
      await act(async () => {
        fireEvent.press(noteItem);
      });

      const deleteBtn = getByTestId('delete-note-btn');
      await act(async () => {
        fireEvent.press(deleteBtn);
      });

      const confirmBtn = getByTestId('confirm-delete-btn');
      await act(async () => {
        fireEvent.press(confirmBtn);
      });

      await waitFor(() => {
        expect(getByText('Permission denied')).toBeTruthy();
      });
    });

    it('handles tickets with empty notes, attachments, and parts gracefully', async () => {
      const emptyTicket: RepairTicket = {
        ...mockSingleTicket,
        id: 'ticket-empty',
        attachments: [],
        notes: [],
        partsUsed: [],
        actions: [],
        repairPeriodStart: undefined,
        repairPeriodEnd: undefined,
        condition: undefined as any,
        status: 'Completed',
      };

      jest.spyOn(repairService, 'getRepairTicket').mockResolvedValueOnce(emptyTicket);

      const { findByText } = render(<RepairTicketDetailScreen />);

      expect(await findByText('No damage photos attached.')).toBeTruthy();
      expect(findByText('No PDFs or documentation attached.')).toBeTruthy();
      expect(findByText('No notes recorded yet. Tap "Add Note" below to record notes.')).toBeTruthy();
      expect(findByText('Available to Use')).toBeTruthy();
    });

    it('correctly handles repairNumber 0 without falling back to ticket ID', async () => {
      const zeroNumTicket: RepairTicket = {
        ...mockSingleTicket,
        repairNumber: 0,
        id: 'fallback-id-12345',
      };

      jest.spyOn(repairService, 'getRepairTicket').mockResolvedValueOnce(zeroNumTicket);

      const { findByText } = render(<RepairTicketDetailScreen />);

      expect(await findByText('[0]')).toBeTruthy();
    });

    it('displays error banner inside Add Note modal when note creation fails', async () => {
      jest
        .spyOn(repairService, 'appendRepairNote')
        .mockRejectedValueOnce(new Error('Failed to create note on server'));

      const { findByTestId, getByTestId, findAllByText } = render(<RepairTicketDetailScreen />);

      const addNoteBtn = await findByTestId('detail-add-note-btn');
      await act(async () => {
        fireEvent.press(addNoteBtn);
      });

      const input = getByTestId('add-note-input');
      fireEvent.changeText(input, 'New test note');

      const submitBtn = getByTestId('submit-add-note-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      const errors = await findAllByText('Failed to create note on server');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(getByTestId('add-note-modal')).toBeTruthy();
    });

    it('allows deleting document directly from doc list row delete button with confirmation', async () => {
      const deleteAttSpy = jest
        .spyOn(repairService, 'deleteRepairAttachment')
        .mockResolvedValueOnce({ success: true } as any);

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const docDelBtn = await findByTestId('delete-doc-btn-0');
      await act(async () => {
        fireEvent.press(docDelBtn);
      });

      expect(getByTestId('delete-confirm-modal')).toBeTruthy();
      const confirmBtn = getByTestId('confirm-delete-btn');
      await act(async () => {
        fireEvent.press(confirmBtn);
      });

      expect(deleteAttSpy).toHaveBeenCalledWith('ticket-101', 'att-2', expect.anything(), 'tenant-alpha');
    });

    it('classifies .jpeg and .webp as photo attachments and non-images as doc attachments', async () => {
      const multiAttTicket: RepairTicket = {
        ...mockSingleTicket,
        attachments: [
          { id: 'att-jpg', type: 'Photo', url: 'https://example.com/photo.jpeg' },
          { id: 'att-webp', type: 'Photo', url: 'https://example.com/photo.webp' },
          { id: 'att-csv', type: 'Document', url: 'https://example.com/report.csv', fileName: 'report.csv' },
        ],
      };

      jest.spyOn(repairService, 'getRepairTicket').mockResolvedValueOnce(multiAttTicket);

      const { findByTestId, getByTestId, getByText } = render(<RepairTicketDetailScreen />);

      expect(await findByTestId('photo-thumb-0')).toBeTruthy();
      expect(getByTestId('photo-thumb-1')).toBeTruthy();
      expect(getByText('report.csv')).toBeTruthy();
    });

    it('disables save button on empty equipment name and displays error banner when update fails', async () => {
      jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockRejectedValueOnce(new Error('Server rejected equipment name'));

      const { findByTestId, getByTestId, findAllByText } = render(<RepairTicketDetailScreen />);

      const equipNameBtn = await findByTestId('header-equipment-name-btn');
      await act(async () => {
        fireEvent.press(equipNameBtn);
      });

      expect(getByTestId('edit-equipment-modal')).toBeTruthy();
      const input = getByTestId('edit-equipment-name-input');
      const saveBtn = getByTestId('save-edit-equipment-btn');

      // Whitespace input disables save button
      fireEvent.changeText(input, '   ');
      expect(saveBtn.props.accessibilityState.disabled).toBe(true);

      // Valid text enables save button, but server error shows error banner
      fireEvent.changeText(input, 'New Valid Name');
      expect(saveBtn.props.accessibilityState.disabled).toBe(false);

      await act(async () => {
        fireEvent.press(saveBtn);
      });

      const errors = await findAllByText('Server rejected equipment name');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('displays error banner inside period edit modal when invalid date range is submitted', async () => {
      const { findByTestId, getByTestId, findAllByText } = render(<RepairTicketDetailScreen />);

      const periodItem = await findByTestId('ticket-repair-period');
      await act(async () => {
        fireEvent.press(periodItem);
      });

      expect(getByTestId('edit-period-modal')).toBeTruthy();

      const startInput = getByTestId('input-period-start');
      const endInput = getByTestId('input-period-end');
      fireEvent.changeText(startInput, '2026-08-30');
      fireEvent.changeText(endInput, '2026-08-20');

      const saveBtn = getByTestId('save-period-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      const errors = await findAllByText('End date must be on or after start date');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('allows clearing serial number and internal reference to null', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValue({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      // Clear serial number
      const serialItem = await findByTestId('ticket-serial-number');
      await act(async () => {
        fireEvent.press(serialItem);
      });

      const serialInput = getByTestId('edit-serial-input');
      fireEvent.changeText(serialInput, '');
      const saveSerialBtn = getByTestId('save-edit-serial-btn');
      await act(async () => {
        fireEvent.press(saveSerialBtn);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { serialNumber: null },
        expect.anything(),
        'tenant-alpha'
      );

      // Clear internal reference
      const internalRefItem = await findByTestId('ticket-internal-ref');
      await act(async () => {
        fireEvent.press(internalRefItem);
      });

      const refInput = getByTestId('edit-internal-ref-input');
      fireEvent.changeText(refInput, '');
      const saveRefBtn = getByTestId('save-edit-internal-ref-btn');
      await act(async () => {
        fireEvent.press(saveRefBtn);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { internalReference: null },
        expect.anything(),
        'tenant-alpha'
      );
    });

    it('exercises all period presets: Today, 3 Days, 2 Weeks, Clear', async () => {
      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const periodItem = await findByTestId('ticket-repair-period');
      await act(async () => {
        fireEvent.press(periodItem);
      });

      expect(getByTestId('edit-period-modal')).toBeTruthy();

      const startInput = getByTestId('input-period-start');
      const endInput = getByTestId('input-period-end');

      // Test Today preset
      fireEvent.press(getByTestId('period-preset-today'));
      expect(startInput.props.value).toBeTruthy();
      expect(endInput.props.value).toBe(startInput.props.value);

      // Test 3 Days preset
      fireEvent.press(getByTestId('period-preset-3days'));
      expect(endInput.props.value).not.toBe(startInput.props.value);

      // Test 2 Weeks preset
      fireEvent.press(getByTestId('period-preset-2weeks'));
      expect(endInput.props.value).toBeTruthy();

      // Test Clear preset
      fireEvent.press(getByTestId('period-preset-clear'));
      expect(startInput.props.value).toBe('');
      expect(endInput.props.value).toBe('');
    });

    it('allows selecting None priority from priority picker', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const priorityBadge = await findByTestId('ticket-priority-badge');
      await act(async () => {
        fireEvent.press(priorityBadge);
      });

      expect(getByTestId('priority-picker-modal')).toBeTruthy();
      const noneOption = getByTestId('priority-option-none');
      await act(async () => {
        fireEvent.press(noneOption);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { priority: 'None' },
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });

    it('displays error banner inside period edit modal when invalid date format is entered', async () => {
      const { findByTestId, getByTestId, findAllByText } = render(<RepairTicketDetailScreen />);

      const periodItem = await findByTestId('ticket-repair-period');
      await act(async () => {
        fireEvent.press(periodItem);
      });

      expect(getByTestId('edit-period-modal')).toBeTruthy();

      const startInput = getByTestId('input-period-start');
      fireEvent.changeText(startInput, 'invalid-date-string');

      const saveBtn = getByTestId('save-period-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      const errors = await findAllByText('Start date format is invalid (YYYY-MM-DD)');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('displays error banner inside priority picker modal when priority update fails', async () => {
      jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockRejectedValueOnce(new Error('Failed to update priority on server'));

      const { findByTestId, getByTestId, findAllByText } = render(<RepairTicketDetailScreen />);

      const priorityBadge = await findByTestId('ticket-priority-badge');
      await act(async () => {
        fireEvent.press(priorityBadge);
      });

      expect(getByTestId('priority-picker-modal')).toBeTruthy();
      const lowOption = getByTestId('priority-option-low');
      await act(async () => {
        fireEvent.press(lowOption);
      });

      const errors = await findAllByText('Failed to update priority on server');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('displays error banner inside condition picker modal when condition update fails', async () => {
      jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockRejectedValueOnce(new Error('Failed to update condition on server'));

      const { findByTestId, getByTestId, findAllByText } = render(<RepairTicketDetailScreen />);

      const conditionBanner = await findByTestId('ticket-condition-banner');
      await act(async () => {
        fireEvent.press(conditionBanner);
      });

      expect(getByTestId('condition-picker-modal')).toBeTruthy();
      const outOption = getByTestId('condition-option-out-of-service');
      await act(async () => {
        fireEvent.press(outOption);
      });

      const errors = await findAllByText('Failed to update condition on server');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('cancelling serial and internal ref modals does not trigger update', async () => {
      const updateFieldsSpy = jest.spyOn(repairService, 'updateRepairTicketFields');

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      // Open serial modal then cancel
      const serialItem = await findByTestId('ticket-serial-number');
      await act(async () => {
        fireEvent.press(serialItem);
      });
      expect(getByTestId('edit-serial-modal')).toBeTruthy();
      fireEvent.press(getByTestId('cancel-edit-serial-btn'));

      // Open internal ref modal then cancel
      const refItem = await findByTestId('ticket-internal-ref');
      await act(async () => {
        fireEvent.press(refItem);
      });
      expect(getByTestId('edit-internal-ref-modal')).toBeTruthy();
      fireEvent.press(getByTestId('cancel-edit-internal-ref-btn'));

      expect(updateFieldsSpy).not.toHaveBeenCalled();
    });

    it('opens equipment name edit dialog from top-right header edit pencil button', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const headerEditBtn = await findByTestId('header-edit-equipment-btn');
      expect(headerEditBtn).toBeTruthy();

      await act(async () => {
        fireEvent.press(headerEditBtn);
      });

      expect(getByTestId('edit-equipment-modal')).toBeTruthy();
      const input = getByTestId('edit-equipment-name-input');
      fireEvent.changeText(input, 'Clay Paky Sharpy Plus');

      await act(async () => {
        fireEvent.press(getByTestId('save-edit-equipment-btn'));
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        expect.objectContaining({
          equipmentName: 'Clay Paky Sharpy Plus',
        }),
        expect.anything(),
        'tenant-alpha'
      );
    });

    it('opens supplier edit dialog from supplier button card and saves', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const supplierTile = await findByTestId('ticket-supplier');
      expect(supplierTile).toBeTruthy();

      await act(async () => {
        fireEvent.press(supplierTile);
      });

      expect(getByTestId('edit-supplier-modal')).toBeTruthy();
      const input = getByTestId('edit-supplier-input');
      fireEvent.changeText(input, 'Stage Electrics UK');

      await act(async () => {
        fireEvent.press(getByTestId('save-edit-supplier-btn'));
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        expect.objectContaining({
          supplierId: 'Stage Electrics UK',
        }),
        expect.anything(),
        'tenant-alpha'
      );
    });

    it('opens requester and owner edit dialog from owner-requester button card and saves', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const ownerReqTile = await findByTestId('ticket-owner-requester');
      expect(ownerReqTile).toBeTruthy();

      await act(async () => {
        fireEvent.press(ownerReqTile);
      });

      expect(getByTestId('edit-owner-requester-modal')).toBeTruthy();
      const reqInput = getByTestId('edit-requested-by-input');
      const ownerInput = getByTestId('edit-owner-input');

      fireEvent.changeText(reqInput, 'Alex Warehouse');
      fireEvent.changeText(ownerInput, 'Lighting Fleet Division');

      await act(async () => {
        fireEvent.press(getByTestId('save-edit-owner-requester-btn'));
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        expect.objectContaining({
          owner: 'Lighting Fleet Division',
          requestedBy: 'Alex Warehouse',
        }),
        expect.anything(),
        'tenant-alpha'
      );
    });

    it('allows all 5 status buttons to be clicked freely without transition graph blocking', async () => {
      const updateStatusSpy = jest
        .spyOn(repairService, 'updateRepairTicketStatus')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId } = render(<RepairTicketDetailScreen />);

      // Ticket is initially 'Reported'
      // Under old restrictions, Reported could not go directly to Completed or Cancel without going through Pending/Under Repair.
      // Now all non-current status buttons should be enabled and freely clickable.
      const completedBtn = await findByTestId('status-btn-completed');
      expect(completedBtn.props.accessibilityState.disabled).toBe(false);

      await act(async () => {
        fireEvent.press(completedBtn);
      });

      expect(updateStatusSpy).toHaveBeenCalledWith(
        'ticket-101',
        'Completed',
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha',
        undefined
      );
    });

    it('allows Deferred priority option to be selected from priority picker modal', async () => {
      const updateFieldsSpy = jest
        .spyOn(repairService, 'updateRepairTicketFields')
        .mockResolvedValueOnce({ success: true });

      const { findByTestId, getByTestId } = render(<RepairTicketDetailScreen />);

      const priorityBadge = await findByTestId('ticket-priority-badge');
      await act(async () => {
        fireEvent.press(priorityBadge);
      });

      expect(getByTestId('priority-picker-modal')).toBeTruthy();
      const deferredOption = getByTestId('priority-option-deferred');
      expect(deferredOption).toBeTruthy();

      await act(async () => {
        fireEvent.press(deferredOption);
      });

      expect(updateFieldsSpy).toHaveBeenCalledWith(
        'ticket-101',
        { priority: 'Deferred' },
        expect.objectContaining({ name: 'Alex Technician' }),
        'tenant-alpha'
      );
    });
  });
});


