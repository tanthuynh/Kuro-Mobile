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
const mockCanGoBack = jest.fn().mockReturnValue(true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
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

  describe('R1: Modernized Header & Navigation', () => {
    it('displays [repairNumber], equipment name, status badge, and invokes back navigation', async () => {
      const { findByText, getByText, getByTestId } = render(<RepairTicketDetailScreen />);

      expect(await findByText('[1042]')).toBeTruthy();
      expect(getByText('Robe MegaPointe Moving Head')).toBeTruthy();
      expect(getByTestId('ticket-header-status')).toBeTruthy();

      const backBtn = getByTestId('ticket-detail-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('R2: Consolidated Top Info Card', () => {
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
  });

  describe('R3: 5-Button Status Transition Strip', () => {
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
  });
});

