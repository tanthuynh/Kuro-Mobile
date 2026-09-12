/**
 * __tests__/pending-sync-indicators.test.tsx
 * Unit & Integration Test Suite for Pending Sync Cloud Indicators.
 *
 * Verifies:
 * 1. LogisticsJobCard renders CloudUpload with testID="job-pending-sync-${job.id}" when hasPendingWrites is true.
 * 2. LogisticsJobCard does not render pending sync indicator when hasPendingWrites is false or undefined.
 * 3. RepairTicketCard renders CloudUpload with testID="ticket-pending-sync-${ticket.id}" when hasPendingWrites is true.
 * 4. RepairTicketCard does not render pending sync indicator when hasPendingWrites is false or undefined.
 * 5. subscribeToLogistics passes { includeMetadataChanges: true } to onSnapshot and maps hasPendingWrites.
 * 6. subscribeTenantRepairTickets passes { includeMetadataChanges: true } to onSnapshot and maps hasPendingWrites.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { LogisticsJobCard } from '@/components/logistics/LogisticsJobCard';
import { RepairTicketCard } from '@/components/repair/repair-ticket-card';
import { subscribeToLogistics, mapFirestoreLogisticsDoc } from '@/services/logistics-service';
import { subscribeTenantRepairTickets, mapFirestoreRepairTicketDoc } from '@/services/repair-service';
import * as firestore from 'firebase/firestore';
import type { LogisticsEntry } from '@/types/logistics';
import type { RepairTicket } from '@/types/repair';

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

// Mock Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

const mockFirestore = firestore as jest.Mocked<any>;

describe('Pending Sync Cloud Indicators & Snapshot Metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseJob: LogisticsEntry = {
    id: 'job-pending-01',
    tenantId: 'tenant-test',
    eventNumber: 201,
    eventName: 'Summer Arena Concert',
    location: 'Rod Laver Arena, Melbourne',
    status: 'In Transit',
    driverName: 'Sam Driver',
    start: '2026-09-15T08:00:00Z',
    end: '2026-09-15T18:00:00Z',
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: '2026-09-15T06:00:00Z',
    updatedAt: '2026-09-15T07:00:00Z',
  };

  const baseTicket: RepairTicket = {
    id: 'ticket-pending-01',
    tenantId: 'tenant-test',
    repairNumber: 501,
    equipment: {
      name: 'Pioneer DJM-900NXS2',
      serialNumber: 'DJM-9941',
    },
    status: 'Reported',
    priority: 'High',
    requestedBy: 'Sound Engineer',
    createdAt: '2026-09-15T09:00:00Z',
    updatedAt: '2026-09-15T09:30:00Z',
  };

  // ==========================================================================
  // 1. LOGISTICS JOB CARD INDICATOR
  // ==========================================================================
  describe('LogisticsJobCard Pending Sync Indicator', () => {
    it('renders CloudUpload icon with testID="job-pending-sync-${job.id}" when hasPendingWrites is true', () => {
      const jobWithPendingWrites: LogisticsEntry = {
        ...baseJob,
        hasPendingWrites: true,
      };

      const { getByTestId } = render(
        <LogisticsJobCard job={jobWithPendingWrites} />
      );

      const indicator = getByTestId(`job-pending-sync-${baseJob.id}`);
      expect(indicator).toBeTruthy();
      expect(indicator.props.accessibilityRole).toBe('image');
      // Verify amber icon color #F59E0B and size 16 on CloudUpload icon
      expect(indicator.props.children.props.color).toBe('#F59E0B');
      expect(indicator.props.children.props.size).toBe(16);
    });

    it('hides pending sync indicator when hasPendingWrites is false', () => {
      const jobWithoutPendingWrites: LogisticsEntry = {
        ...baseJob,
        hasPendingWrites: false,
      };

      const { queryByTestId } = render(
        <LogisticsJobCard job={jobWithoutPendingWrites} />
      );

      expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeNull();
    });

    it('hides pending sync indicator when hasPendingWrites is undefined', () => {
      const { queryByTestId } = render(
        <LogisticsJobCard job={baseJob} />
      );

      expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeNull();
    });
  });

  // ==========================================================================
  // 2. REPAIR TICKET CARD INDICATOR
  // ==========================================================================
  describe('RepairTicketCard Pending Sync Indicator', () => {
    it('renders CloudUpload icon with testID="ticket-pending-sync-${ticket.id}" when hasPendingWrites is true', () => {
      const ticketWithPendingWrites: RepairTicket = {
        ...baseTicket,
        hasPendingWrites: true,
      };

      const { getByTestId } = render(
        <RepairTicketCard ticket={ticketWithPendingWrites} />
      );

      const indicator = getByTestId(`ticket-pending-sync-${baseTicket.id}`);
      expect(indicator).toBeTruthy();
      expect(indicator.props.accessibilityRole).toBe('image');
      // Verify amber icon color #F59E0B and size 16 on CloudUpload icon
      expect(indicator.props.children.props.color).toBe('#F59E0B');
      expect(indicator.props.children.props.size).toBe(16);
    });

    it('hides pending sync indicator when hasPendingWrites is false', () => {
      const ticketWithoutPendingWrites: RepairTicket = {
        ...baseTicket,
        hasPendingWrites: false,
      };

      const { queryByTestId } = render(
        <RepairTicketCard ticket={ticketWithoutPendingWrites} />
      );

      expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeNull();
    });

    it('hides pending sync indicator when hasPendingWrites is undefined', () => {
      const { queryByTestId } = render(
        <RepairTicketCard ticket={baseTicket} />
      );

      expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeNull();
    });
  });

  // ==========================================================================
  // 3. FIRESTORE SUBSCRIPTIONS & SNAPSHOT METADATA CONFIGURATION
  // ==========================================================================
  describe('Firestore Snapshot Subscriptions metadata configuration', () => {
    it('subscribeToLogistics passes { includeMetadataChanges: true } to onSnapshot', () => {
      const mockUnsub = jest.fn();
      mockFirestore.onSnapshot.mockReturnValue(mockUnsub);

      const callback = jest.fn();
      subscribeToLogistics('tenant-test', callback);

      expect(mockFirestore.onSnapshot).toHaveBeenCalledWith(
        expect.anything(),
        { includeMetadataChanges: true },
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('subscribeTenantRepairTickets passes { includeMetadataChanges: true } to onSnapshot', () => {
      const mockUnsub = jest.fn();
      mockFirestore.onSnapshot.mockReturnValue(mockUnsub);

      const callback = jest.fn();
      subscribeTenantRepairTickets('tenant-test', callback);

      expect(mockFirestore.onSnapshot).toHaveBeenCalledWith(
        expect.anything(),
        { includeMetadataChanges: true },
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('mapFirestoreLogisticsDoc extracts hasPendingWrites from docSnap metadata', () => {
      const docPending = {
        id: 'job-1',
        data: () => ({ id: 'job-1', tenantId: 'tenant-test', status: 'Scheduled' }),
        metadata: { hasPendingWrites: true, fromCache: true },
      };
      const entryPending = mapFirestoreLogisticsDoc(docPending);
      expect(entryPending.hasPendingWrites).toBe(true);

      const docSynced = {
        id: 'job-1',
        data: () => ({ id: 'job-1', tenantId: 'tenant-test', status: 'Scheduled' }),
        metadata: { hasPendingWrites: false, fromCache: false },
      };
      const entrySynced = mapFirestoreLogisticsDoc(docSynced);
      expect(entrySynced.hasPendingWrites).toBe(false);
    });

    it('mapFirestoreRepairTicketDoc extracts hasPendingWrites from docSnap metadata', () => {
      const docPending = {
        id: 'ticket-1',
        data: () => ({ id: 'ticket-1', tenantId: 'tenant-test', status: 'Reported', equipment: { name: 'Mic' } }),
        metadata: { hasPendingWrites: true, fromCache: true },
      };
      const ticketPending = mapFirestoreRepairTicketDoc(docPending);
      expect(ticketPending.hasPendingWrites).toBe(true);

      const docSynced = {
        id: 'ticket-1',
        data: () => ({ id: 'ticket-1', tenantId: 'tenant-test', status: 'Reported', equipment: { name: 'Mic' } }),
        metadata: { hasPendingWrites: false, fromCache: false },
      };
      const ticketSynced = mapFirestoreRepairTicketDoc(docSynced);
      expect(ticketSynced.hasPendingWrites).toBe(false);
    });
  });
});
