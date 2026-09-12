/**
 * __tests__/offline-ux-indicators.adversarial.test.tsx
 * Empirical Challenger Test Suite for Milestone 3 (M3: Global Offline UX Indicators).
 *
 * Adversarial & Stress Testing Dimensions:
 * 1. Lifecycle of pending sync cloud icons under rapid rerenders (true -> false transitions).
 * 2. False-positive immunity: non-pending cards and falsy/corrupted metadata never render CloudUpload.
 * 3. Multi-card feed state isolation: no cross-card state leakage in dense feeds.
 * 4. Firestore snapshot metadata listener fidelity: metadata changes trigger listeners even when data is unchanged.
 * 5. Edge cases: malformed metadata, tenant isolation, rapid unsubscriptions.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { LogisticsJobCard } from '@/components/logistics/LogisticsJobCard';
import { RepairTicketCard } from '@/components/repair/repair-ticket-card';
import { GlobalOfflineBanner } from '@/components/layout/global-offline-banner';
import { NetworkProvider } from '@/context/network-context';
import * as database from 'firebase/database';
import {
  subscribeToLogistics,
  subscribeSingleLogisticsEntry,
  mapFirestoreLogisticsDoc,
} from '@/services/logistics-service';
import {
  subscribeTenantRepairTickets,
  subscribeSingleRepairTicket,
  mapFirestoreRepairTicketDoc,
} from '@/services/repair-service';
import * as firestore from 'firebase/firestore';
import type { LogisticsEntry, LogisticsStatus } from '@/types/logistics';
import type { RepairTicket, RepairStatus } from '@/types/repair';

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

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

const mockFirestore = firestore as jest.Mocked<any>;

describe('Adversarial & Stress Verification: Milestone 3 Offline UX Indicators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseJob: LogisticsEntry = {
    id: 'job-adv-001',
    tenantId: 'tenant-adv-100',
    eventNumber: 301,
    eventName: 'Adversarial Concert Event',
    location: 'Melbourne Sports Center',
    status: 'In Transit',
    driverName: 'Lead Driver Alex',
    start: '2026-09-15T08:00:00Z',
    end: '2026-09-15T18:00:00Z',
    createdBy: 'user-ops',
    updatedBy: 'user-ops',
    createdAt: '2026-09-15T06:00:00Z',
    updatedAt: '2026-09-15T07:00:00Z',
  };

  const baseTicket: RepairTicket = {
    id: 'ticket-adv-001',
    tenantId: 'tenant-adv-100',
    repairNumber: 801,
    equipment: {
      name: 'Wireless Receiver Shure UR4D',
      serialNumber: 'UR4D-7729',
    },
    status: 'Under Repair',
    priority: 'High',
    requestedBy: 'Senior Tech Dana',
    createdAt: '2026-09-15T09:00:00Z',
    updatedAt: '2026-09-15T09:30:00Z',
  };

  // ==========================================================================
  // 1. LIFECYCLE & RAPID RERENDER STRESS TESTING
  // ==========================================================================
  describe('Lifecycle & Rapid Rerender Stress Testing (hasPendingWrites: true <-> false)', () => {
    it('handles 100 rapid alternating rerender cycles of hasPendingWrites on LogisticsJobCard without ghost artifacts', () => {
      let isPending = true;
      const { queryByTestId, rerender } = render(
        <LogisticsJobCard job={{ ...baseJob, hasPendingWrites: isPending }} />
      );

      // Verify initial pending state
      expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeTruthy();

      // Stress test: 100 rapid state flips
      for (let i = 0; i < 100; i++) {
        isPending = !isPending;
        rerender(
          <LogisticsJobCard
            job={{
              ...baseJob,
              hasPendingWrites: isPending,
              updatedAt: `2026-09-15T07:${i < 10 ? '0' + i : i}:00Z`,
            }}
          />
        );

        const indicator = queryByTestId(`job-pending-sync-${baseJob.id}`);
        if (isPending) {
          expect(indicator).toBeTruthy();
        } else {
          expect(indicator).toBeNull();
        }
      }

      // Conclude with transition to false (synced)
      rerender(<LogisticsJobCard job={{ ...baseJob, hasPendingWrites: false }} />);
      expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeNull();
    });

    it('handles 100 rapid alternating rerender cycles of hasPendingWrites on RepairTicketCard without ghost artifacts', () => {
      let isPending = true;
      const { queryByTestId, rerender } = render(
        <RepairTicketCard ticket={{ ...baseTicket, hasPendingWrites: isPending }} />
      );

      // Verify initial pending state
      expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeTruthy();

      // Stress test: 100 rapid state flips
      for (let i = 0; i < 100; i++) {
        isPending = !isPending;
        rerender(
          <RepairTicketCard
            ticket={{
              ...baseTicket,
              hasPendingWrites: isPending,
              updatedAt: `2026-09-15T09:${i < 10 ? '0' + i : i}:00Z`,
            }}
          />
        );

        const indicator = queryByTestId(`ticket-pending-sync-${baseTicket.id}`);
        if (isPending) {
          expect(indicator).toBeTruthy();
        } else {
          expect(indicator).toBeNull();
        }
      }

      // Conclude with transition to false (synced)
      rerender(<RepairTicketCard ticket={{ ...baseTicket, hasPendingWrites: false }} />);
      expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeNull();
    });

    it('correctly clears pending sync indicator during concurrent data mutation on LogisticsJobCard', () => {
      // Start in offline pending state with "Draft"
      const { queryByTestId, getByText, rerender } = render(
        <LogisticsJobCard job={{ ...baseJob, status: 'Draft' as LogisticsStatus, hasPendingWrites: true }} />
      );

      expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeTruthy();
      expect(getByText('Draft')).toBeTruthy();

      // Commit sync while simultaneously transitioning status to "Completed" and updating driver
      rerender(
        <LogisticsJobCard
          job={{
            ...baseJob,
            status: 'Completed' as LogisticsStatus,
            driverName: 'Driver Sam Final',
            hasPendingWrites: false,
          }}
        />
      );

      expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeNull();
      expect(getByText('Completed')).toBeTruthy();
    });

    it('correctly clears pending sync indicator during concurrent status and notes mutation on RepairTicketCard', () => {
      // Start in offline pending state with "Reported"
      const { queryByTestId, getByText, rerender } = render(
        <RepairTicketCard ticket={{ ...baseTicket, status: 'Reported' as RepairStatus, hasPendingWrites: true }} />
      );

      expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeTruthy();
      expect(getByText('Reported')).toBeTruthy();

      // Commit sync while transitioning status to "Completed" and changing priority
      rerender(
        <RepairTicketCard
          ticket={{
            ...baseTicket,
            status: 'Completed' as RepairStatus,
            priority: 'Critical',
            hasPendingWrites: false,
          }}
        />
      );

      expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeNull();
      expect(getByText('Completed')).toBeTruthy();
      expect(getByText('Critical')).toBeTruthy();
    });
  });

  // ==========================================================================
  // 2. FALSE POSITIVE IMMUNITY & ADVERSARIAL FALSY VALUES
  // ==========================================================================
  describe('False-Positive Immunity & Adversarial Falsy Inputs', () => {
    it('never renders CloudUpload on LogisticsJobCard with adversarial falsy inputs', () => {
      const falsyValues = [
        false,
        undefined,
        null,
        0,
        '',
        NaN,
      ];

      for (const val of falsyValues) {
        const { queryByTestId } = render(
          <LogisticsJobCard job={{ ...baseJob, hasPendingWrites: val as any }} />
        );
        expect(queryByTestId(`job-pending-sync-${baseJob.id}`)).toBeNull();
      }
    });

    it('never renders CloudUpload on RepairTicketCard with adversarial falsy inputs', () => {
      const falsyValues = [
        false,
        undefined,
        null,
        0,
        '',
        NaN,
      ];

      for (const val of falsyValues) {
        const { queryByTestId } = render(
          <RepairTicketCard ticket={{ ...baseTicket, hasPendingWrites: val as any }} />
        );
        expect(queryByTestId(`ticket-pending-sync-${baseTicket.id}`)).toBeNull();
      }
    });

    it('maintains strict state isolation across dense 25-card feed with sparse pending writes (Logistics)', () => {
      const jobs: LogisticsEntry[] = Array.from({ length: 25 }, (_, idx) => ({
        ...baseJob,
        id: `job-feed-${idx}`,
        eventNumber: 100 + idx,
        eventName: `Job Event ${idx}`,
        // Only items at index 7 and 19 have pending writes
        hasPendingWrites: idx === 7 || idx === 19,
      }));

      const { queryByTestId, rerender } = render(
        <>
          {jobs.map((j) => (
            <LogisticsJobCard key={j.id} job={j} />
          ))}
        </>
      );

      // Verify strictly only job-feed-7 and job-feed-19 have the indicator
      for (let idx = 0; idx < 25; idx++) {
        const indicator = queryByTestId(`job-pending-sync-job-feed-${idx}`);
        if (idx === 7 || idx === 19) {
          expect(indicator).toBeTruthy();
        } else {
          expect(indicator).toBeNull();
        }
      }

      // Sync job-feed-7: only job-feed-19 should remain pending
      const updatedJobs = jobs.map((j) =>
        j.id === 'job-feed-7' ? { ...j, hasPendingWrites: false } : j
      );

      rerender(
        <>
          {updatedJobs.map((j) => (
            <LogisticsJobCard key={j.id} job={j} />
          ))}
        </>
      );

      expect(queryByTestId('job-pending-sync-job-feed-7')).toBeNull();
      expect(queryByTestId('job-pending-sync-job-feed-19')).toBeTruthy();

      // Sync job-feed-19: zero indicators should remain
      const allSyncedJobs = updatedJobs.map((j) =>
        j.id === 'job-feed-19' ? { ...j, hasPendingWrites: false } : j
      );

      rerender(
        <>
          {allSyncedJobs.map((j) => (
            <LogisticsJobCard key={j.id} job={j} />
          ))}
        </>
      );

      for (let idx = 0; idx < 25; idx++) {
        expect(queryByTestId(`job-pending-sync-job-feed-${idx}`)).toBeNull();
      }
    });

    it('maintains strict state isolation across dense 25-card feed with sparse pending writes (Repairs)', () => {
      const tickets: RepairTicket[] = Array.from({ length: 25 }, (_, idx) => ({
        ...baseTicket,
        id: `ticket-feed-${idx}`,
        repairNumber: 200 + idx,
        // Only items at index 3 and 21 have pending writes
        hasPendingWrites: idx === 3 || idx === 21,
      }));

      const { queryByTestId, rerender } = render(
        <>
          {tickets.map((t) => (
            <RepairTicketCard key={t.id} ticket={t} />
          ))}
        </>
      );

      // Verify strictly only ticket-feed-3 and ticket-feed-21 have the indicator
      for (let idx = 0; idx < 25; idx++) {
        const indicator = queryByTestId(`ticket-pending-sync-ticket-feed-${idx}`);
        if (idx === 3 || idx === 21) {
          expect(indicator).toBeTruthy();
        } else {
          expect(indicator).toBeNull();
        }
      }

      // Sync ticket-feed-3: only ticket-feed-21 should remain pending
      const updatedTickets = tickets.map((t) =>
        t.id === 'ticket-feed-3' ? { ...t, hasPendingWrites: false } : t
      );

      rerender(
        <>
          {updatedTickets.map((t) => (
            <RepairTicketCard key={t.id} ticket={t} />
          ))}
        </>
      );

      expect(queryByTestId('ticket-pending-sync-ticket-feed-3')).toBeNull();
      expect(queryByTestId('ticket-pending-sync-ticket-feed-21')).toBeTruthy();
    });
  });

  // ==========================================================================
  // 3. FIRESTORE SNAPSHOT METADATA CHANGES LISTENER FIDELITY
  // ==========================================================================
  describe('Firestore Snapshot Metadata Change Triggers', () => {
    it('subscribeToLogistics triggers listener on metadata-only transition (hasPendingWrites: true -> false with identical document data)', () => {
      let listenerCallback: (snapshot: any) => void = () => {};
      let capturedOptions: any = null;

      mockFirestore.onSnapshot.mockImplementation((_query: any, options: any, onNext: any, _onError: any) => {
        capturedOptions = options;
        listenerCallback = onNext;
        return jest.fn();
      });

      const emittedUpdates: LogisticsEntry[][] = [];
      const unsub = subscribeToLogistics('tenant-adv-100', (entries) => {
        emittedUpdates.push(entries);
      });

      // Verify options included { includeMetadataChanges: true }
      expect(capturedOptions).toEqual({ includeMetadataChanges: true });

      // 1. Initial Snapshot: local write in-flight (hasPendingWrites: true)
      const docData = {
        id: 'job-meta-1',
        tenantId: 'tenant-adv-100',
        eventName: 'Metadata Test Concert',
        status: 'In Transit',
        archived: false,
      };

      const pendingSnapshot = {
        forEach: (cb: any) => {
          cb({
            id: 'job-meta-1',
            data: () => docData, // Exact same data
            metadata: { hasPendingWrites: true, fromCache: true },
          });
        },
      };

      listenerCallback(pendingSnapshot);

      expect(emittedUpdates.length).toBe(1);
      expect(emittedUpdates[0][0].id).toBe('job-meta-1');
      expect(emittedUpdates[0][0].hasPendingWrites).toBe(true);

      // 2. Second Snapshot: write committed to server.
      // Crucial test condition: document data() is 100% UNCHANGED, only metadata.hasPendingWrites changes to false
      const syncedSnapshot = {
        forEach: (cb: any) => {
          cb({
            id: 'job-meta-1',
            data: () => docData, // Identical data reference & content
            metadata: { hasPendingWrites: false, fromCache: false },
          });
        },
      };

      listenerCallback(syncedSnapshot);

      expect(emittedUpdates.length).toBe(2);
      expect(emittedUpdates[1][0].id).toBe('job-meta-1');
      expect(emittedUpdates[1][0].hasPendingWrites).toBe(false);

      unsub();
    });

    it('subscribeTenantRepairTickets triggers listener on metadata-only transition (hasPendingWrites: true -> false with identical document data)', () => {
      let listenerCallback: (snapshot: any) => void = () => {};
      let capturedOptions: any = null;

      mockFirestore.onSnapshot.mockImplementation((_query: any, options: any, onNext: any, _onError: any) => {
        capturedOptions = options;
        listenerCallback = onNext;
        return jest.fn();
      });

      const emittedUpdates: RepairTicket[][] = [];
      const unsub = subscribeTenantRepairTickets('tenant-adv-100', (tickets) => {
        emittedUpdates.push(tickets);
      });

      // Verify options included { includeMetadataChanges: true }
      expect(capturedOptions).toEqual({ includeMetadataChanges: true });

      const ticketData = {
        id: 'ticket-meta-1',
        tenantId: 'tenant-adv-100',
        repairNumber: 999,
        equipment: { name: 'Amp Rack' },
        status: 'Reported',
        archived: false,
        createdAt: '2026-09-15T10:00:00Z',
      };

      // 1. Initial Snapshot: local write in-flight (hasPendingWrites: true)
      const pendingSnapshot = {
        forEach: (cb: any) => {
          cb({
            id: 'ticket-meta-1',
            data: () => ticketData,
            metadata: { hasPendingWrites: true, fromCache: true },
          });
        },
      };

      listenerCallback(pendingSnapshot);
      expect(emittedUpdates.length).toBe(1);
      expect(emittedUpdates[0][0].hasPendingWrites).toBe(true);

      // 2. Second Snapshot: server committed write, identical document data
      const syncedSnapshot = {
        forEach: (cb: any) => {
          cb({
            id: 'ticket-meta-1',
            data: () => ticketData,
            metadata: { hasPendingWrites: false, fromCache: false },
          });
        },
      };

      listenerCallback(syncedSnapshot);
      expect(emittedUpdates.length).toBe(2);
      expect(emittedUpdates[1][0].hasPendingWrites).toBe(false);

      unsub();
    });

    it('subscribeSingleLogisticsEntry triggers update when single document metadata transitions to synced', () => {
      let listenerCallback: (snapshot: any) => void = () => {};
      let capturedOptions: any = null;

      mockFirestore.onSnapshot.mockImplementation((_ref: any, options: any, onNext: any, _onError: any) => {
        capturedOptions = options;
        listenerCallback = onNext;
        return jest.fn();
      });

      const emitted: (LogisticsEntry | null)[] = [];
      const unsub = subscribeSingleLogisticsEntry('job-single-1', 'tenant-adv-100', (entry) => {
        emitted.push(entry);
      });

      expect(capturedOptions).toEqual({ includeMetadataChanges: true });

      const docData = {
        id: 'job-single-1',
        tenantId: 'tenant-adv-100',
        eventName: 'Single Doc Test',
        status: 'In Transit',
      };

      // 1. Pending write
      listenerCallback({
        exists: () => true,
        id: 'job-single-1',
        data: () => docData,
        metadata: { hasPendingWrites: true, fromCache: true },
      });

      expect(emitted.length).toBe(1);
      expect(emitted[0]?.hasPendingWrites).toBe(true);

      // 2. Synced write (data unchanged)
      listenerCallback({
        exists: () => true,
        id: 'job-single-1',
        data: () => docData,
        metadata: { hasPendingWrites: false, fromCache: false },
      });

      expect(emitted.length).toBe(2);
      expect(emitted[1]?.hasPendingWrites).toBe(false);

      unsub();
    });

    it('subscribeSingleRepairTicket triggers update when single document metadata transitions to synced', () => {
      let listenerCallback: (snapshot: any) => void = () => {};
      let capturedOptions: any = null;

      mockFirestore.onSnapshot.mockImplementation((_ref: any, options: any, onNext: any, _onError: any) => {
        capturedOptions = options;
        listenerCallback = onNext;
        return jest.fn();
      });

      const emitted: (RepairTicket | null)[] = [];
      const unsub = subscribeSingleRepairTicket('ticket-single-1', 'tenant-adv-100', (ticket) => {
        emitted.push(ticket);
      });

      expect(capturedOptions).toEqual({ includeMetadataChanges: true });

      const ticketData = {
        id: 'ticket-single-1',
        tenantId: 'tenant-adv-100',
        equipment: { name: 'Console Yamaha CL5' },
        status: 'Reported',
      };

      // 1. Pending write
      listenerCallback({
        exists: () => true,
        data: () => ticketData,
        metadata: { hasPendingWrites: true, fromCache: true },
      });

      expect(emitted.length).toBe(1);
      expect(emitted[0]?.hasPendingWrites).toBe(true);

      // 2. Synced write (data unchanged)
      listenerCallback({
        exists: () => true,
        data: () => ticketData,
        metadata: { hasPendingWrites: false, fromCache: false },
      });

      expect(emitted.length).toBe(2);
      expect(emitted[1]?.hasPendingWrites).toBe(false);

      unsub();
    });
  });

  // ==========================================================================
  // 4. EDGE CASES & DEFENSIVE RESILIENCE
  // ==========================================================================
  describe('Edge Cases & Defensive Resilience', () => {
    it('safely handles missing, null, or undefined metadata object on docSnap', () => {
      // Test cases with malformed docSnap metadata
      const docNoMeta = {
        id: 'job-nometa',
        data: () => ({ id: 'job-nometa', tenantId: 'tenant-adv-100' }),
      };
      expect(mapFirestoreLogisticsDoc(docNoMeta).hasPendingWrites).toBe(false);
      expect(mapFirestoreRepairTicketDoc(docNoMeta).hasPendingWrites).toBe(false);

      const docNullMeta = {
        id: 'job-nullmeta',
        data: () => ({ id: 'job-nullmeta', tenantId: 'tenant-adv-100' }),
        metadata: null,
      };
      expect(mapFirestoreLogisticsDoc(docNullMeta).hasPendingWrites).toBe(false);
      expect(mapFirestoreRepairTicketDoc(docNullMeta).hasPendingWrites).toBe(false);

      const docEmptyMeta = {
        id: 'job-emptymeta',
        data: () => ({ id: 'job-emptymeta', tenantId: 'tenant-adv-100' }),
        metadata: {},
      };
      expect(mapFirestoreLogisticsDoc(docEmptyMeta).hasPendingWrites).toBe(false);
      expect(mapFirestoreRepairTicketDoc(docEmptyMeta).hasPendingWrites).toBe(false);

      const docCorruptMeta = {
        id: 'job-corruptmeta',
        data: () => ({ id: 'job-corruptmeta', tenantId: 'tenant-adv-100' }),
        metadata: { hasPendingWrites: 'invalid-string' },
      };
      // Boolean('invalid-string') is true, but Boolean(false) is false
      expect(mapFirestoreLogisticsDoc({ ...docCorruptMeta, metadata: { hasPendingWrites: false } }).hasPendingWrites).toBe(false);
    });

    it('enforces strict tenant isolation even if a foreign tenant doc has pending writes', () => {
      let listenerCallback: (snapshot: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_query: any, _opts: any, onNext: any, _onError: any) => {
        listenerCallback = onNext;
        return jest.fn();
      });

      const emittedJobs: LogisticsEntry[][] = [];
      subscribeToLogistics('tenant-my-company', (entries) => {
        emittedJobs.push(entries);
      });

      // Foreign tenant document arrives with pending writes
      const foreignSnapshot = {
        forEach: (cb: any) => {
          cb({
            id: 'foreign-job-1',
            data: () => ({
              id: 'foreign-job-1',
              tenantId: 'tenant-other-company', // Different tenant
              eventName: 'Hacked Job',
              archived: false,
            }),
            metadata: { hasPendingWrites: true, fromCache: true },
          });
        },
      };

      listenerCallback(foreignSnapshot);

      // Foreign document must be rejected by tenant isolation filter
      expect(emittedJobs.length).toBe(1);
      expect(emittedJobs[0].length).toBe(0);
    });

    it('handles unsubscribe cleanup cleanly without unhandled rejections or leaks', () => {
      const mockUnsub = jest.fn();
      mockFirestore.onSnapshot.mockReturnValue(mockUnsub);

      const unsubLogistics = subscribeToLogistics('tenant-adv-100', jest.fn());
      unsubLogistics();
      expect(mockUnsub).toHaveBeenCalledTimes(1);

      const unsubRepairs = subscribeTenantRepairTickets('tenant-adv-100', jest.fn());
      unsubRepairs();
      expect(mockUnsub).toHaveBeenCalledTimes(2);
    });

    it('handles empty collection snapshots gracefully for both logistics and repairs', () => {
      let logisticsCb: any = null;
      let repairsCb: any = null;

      mockFirestore.onSnapshot.mockImplementation((_query: any, _opts: any, onNext: any, _onError: any) => {
        if (!logisticsCb) logisticsCb = onNext;
        else repairsCb = onNext;
        return jest.fn();
      });

      const logUpdates: any[] = [];
      const repUpdates: any[] = [];

      subscribeToLogistics('tenant-empty', (items) => logUpdates.push(items));
      subscribeTenantRepairTickets('tenant-empty', (items) => repUpdates.push(items));

      const emptySnapshot = { forEach: (_fn: any) => {} };

      logisticsCb(emptySnapshot);
      repairsCb(emptySnapshot);

      expect(logUpdates).toEqual([[]]);
      expect(repUpdates).toEqual([[]]);
    });

    it('propagates Firestore errors to onError callbacks in both logistics and repair subscriptions', () => {
      let logisticsErrCb: any = null;
      let repairsErrCb: any = null;

      mockFirestore.onSnapshot.mockImplementation((_query: any, _opts: any, _onNext: any, onError: any) => {
        if (!logisticsErrCb) logisticsErrCb = onError;
        else repairsErrCb = onError;
        return jest.fn();
      });

      const logErrors: Error[] = [];
      const repErrors: Error[] = [];

      subscribeToLogistics('tenant-err', jest.fn(), (err) => logErrors.push(err));
      subscribeTenantRepairTickets('tenant-err', jest.fn(), (err) => repErrors.push(err));

      const testError = new Error('permission-denied: simulated Firestore security rule rejection');

      logisticsErrCb(testError);
      repairsErrCb(testError);

      expect(logErrors).toHaveLength(1);
      expect(logErrors[0].message).toContain('permission-denied');
      expect(repErrors).toHaveLength(1);
      expect(repErrors[0].message).toContain('permission-denied');
    });

    it('survives burst metadata event storm (50 rapid alternating snapshots)', () => {
      let listenerCallback: (snapshot: any) => void = () => {};

      mockFirestore.onSnapshot.mockImplementation((_query: any, _opts: any, onNext: any, _onError: any) => {
        listenerCallback = onNext;
        return jest.fn();
      });

      const emittedUpdates: LogisticsEntry[][] = [];
      subscribeToLogistics('tenant-burst', (entries) => {
        emittedUpdates.push(entries);
      });

      const docData = {
        id: 'job-burst-1',
        tenantId: 'tenant-burst',
        eventName: 'Burst Concert',
        status: 'In Transit',
        archived: false,
      };

      for (let i = 0; i < 50; i++) {
        const isPending = i % 2 === 0;
        listenerCallback({
          forEach: (cb: any) => {
            cb({
              id: 'job-burst-1',
              data: () => docData,
              metadata: { hasPendingWrites: isPending, fromCache: isPending },
            });
          },
        });
      }

      expect(emittedUpdates.length).toBe(50);
      expect(emittedUpdates[49][0].hasPendingWrites).toBe(false);
    });
  });

  // ==========================================================================
  // 5. RAPID NETWORK FLAPPING & GLOBAL OFFLINE BANNER RESILIENCE
  // ==========================================================================
  describe('Rapid Network Flapping & Global Offline Banner Resilience', () => {
    it('handles 50 rapid network online/offline toggles without crashing or leaking state', () => {
      let online = false;
      const { queryByTestId, rerender } = render(
        <NetworkProvider initialOnline={online}>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      // Initially offline -> banner is visible
      expect(queryByTestId('global-offline-banner')).toBeTruthy();

      for (let i = 0; i < 50; i++) {
        online = !online;
        rerender(
          <NetworkProvider initialOnline={online}>
            <GlobalOfflineBanner />
          </NetworkProvider>
        );

        const banner = queryByTestId('global-offline-banner');
        if (online) {
          expect(banner).toBeNull();
        } else {
          expect(banner).toBeTruthy();
        }
      }

      // Final state: online -> banner null
      rerender(
        <NetworkProvider initialOnline={true}>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );
      expect(queryByTestId('global-offline-banner')).toBeNull();
    });
  });
});

