/**
 * __tests__/m4-challenger-2-empirical.challenge.test.tsx
 * ============================================================================
 * Empirical Adversarial Challenge Suite — Milestone 4 (M4)
 * ============================================================================
 *
 * Authored by Challenger 2 for Milestone 4 (Final Comprehensive Adversarial Verification).
 *
 * Empirical verification of cross-feature interactions across:
 * 1. Logistics vs. Repairs: Concurrent offline write queueing without collection bleed or collision.
 * 2. Event Scanning Lockdown: Strict refusal of scan & pull-sheet mutations while offline,
 *    with zero leakage into AsyncStorage mutation stores or Firestore writes.
 * 3. Cross-Feature Feed Badge Isolation: LogisticsJobCard and RepairTicketCard accurately
 *    reflect pending writes in dense mixed feeds without cross-card or cross-feature contamination.
 * 4. Reconnection Coexistence: Network transition triggers GPS buffer flush without conflicting
 *    with queued Firestore mutations or unblocking prohibited offline scan mutations prematurely.
 * 5. Network Flapping & Rapid State Transitions across mixed domain operations.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as firestore from 'firebase/firestore';
import * as database from 'firebase/database';
import * as Location from 'expo-location';

// Domain services under verification
import {
  updateLogisticsStatus,
  appendLogisticsNote,
  subscribeToLogistics,
  mapFirestoreLogisticsDoc,
} from '@/services/logistics-service';

import {
  createRepairTicket,
  updateRepairTicketStatus,
  appendRepairNote,
  subscribeTenantRepairTickets,
  mapFirestoreRepairTicketDoc,
  setNetworkOnlineState as setRepairNetworkOnlineState,
} from '@/services/repair-service';

import {
  updatePullsheetItemStatus,
  updatePullsheetItemScannedCount,
  bulkConfirmPullsheet,
  isOnline as isPullsheetOnline,
  setNetworkOnlineState as setPullsheetNetworkOnlineState,
  getPendingOperations,
} from '@/services/pull-sheet-service';

import {
  setNetworkOnlineState as setLocationNetworkOnlineState,
  startTrackingJob,
  stopTrackingJob,
  handleLocationUpdate,
  getLocationBufferCount,
  clearLocationBuffer,
  flushLocationBuffer,
  _resetTrackingStateForTesting,
} from '@/services/location-tracking-service';

// UI components under verification
import { LogisticsJobCard } from '@/components/logistics/LogisticsJobCard';
import { RepairTicketCard } from '@/components/repair/repair-ticket-card';
import { GlobalOfflineBanner } from '@/components/layout/global-offline-banner';
import { NetworkProvider, useNetworkStatus } from '@/context/network-context';

import type { LogisticsEntry } from '@/types/logistics';
import type { RepairTicket, CreateRepairTicketInput } from '@/types/repair';

// Mocks
const mockFirestore = firestore as jest.Mocked<any>;

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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

// Mock Audio & Haptics
jest.mock('@/services/audio-service', () => ({
  AudioService: {
    playScanSuccess: jest.fn().mockResolvedValue(undefined),
    playScanFail: jest.fn().mockResolvedValue(undefined),
    playVictoryChime: jest.fn().mockResolvedValue(undefined),
    playStatusUpdateTone: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/haptic-service', () => ({
  HapticService: {
    scanSuccess: jest.fn(),
    scanError: jest.fn(),
    mediumTap: jest.fn(),
    selection: jest.fn(),
  },
}));

describe('M4 Challenger 2: Cross-Feature Adversarial Integration Challenge', () => {
  const tenantId = 'tenant-challenger-m4';
  const userId = 'usr-adv-challenger';

  const baseJob: LogisticsEntry = {
    id: 'job-cf-alpha',
    tenantId,
    eventNumber: 501,
    eventName: 'Arena World Tour',
    location: 'Rod Laver Arena, Melbourne',
    status: 'Scheduled',
    driverName: 'Lead Driver Jordan',
    start: '2026-09-20T08:00:00Z',
    end: '2026-09-20T22:00:00Z',
    createdBy: userId,
    updatedBy: userId,
    createdAt: '2026-09-12T00:00:00Z',
    updatedAt: '2026-09-12T00:00:00Z',
  };

  const baseTicket: RepairTicket = {
    id: 'ticket-cf-beta',
    tenantId,
    repairNumber: 901,
    equipment: {
      name: 'DiGiCo Quantum 338 Audio Console',
      serialNumber: 'DG-Q338-8812',
    },
    status: 'Reported',
    priority: 'Critical',
    requestedBy: 'Senior Sound Engineer',
    createdAt: '2026-09-12T01:00:00Z',
    updatedAt: '2026-09-12T01:00:00Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    _resetTrackingStateForTesting();
    setRepairNetworkOnlineState(true);
    setPullsheetNetworkOnlineState(true);
    setLocationNetworkOnlineState(true);

    // Mock Location permissions and methods for tracking
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', granted: true });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', granted: true });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', granted: true });
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -37.8136,
        longitude: 144.9631,
        altitude: 30,
        accuracy: 5,
        altitudeAccuracy: null,
        heading: 0,
        speed: 0,
      },
      timestamp: 1726140000000,
    });

    // Default mock for getDoc returning valid documents for existing records
    mockFirestore.getDoc.mockImplementation(async (docRef: any) => {
      const path = docRef?.path || docRef?._path?.segments?.join('/') || '';
      if (path.includes('tickets')) {
        return {
          exists: () => true,
          data: () => ({
            id: 'ticket-cf-beta',
            tenantId,
            status: 'Reported',
            repairNumber: 901,
            equipment: { name: 'DiGiCo Console' },
            notes: [],
            actions: [],
          }),
        };
      }
      if (path.includes('logistics')) {
        return {
          exists: () => true,
          data: () => ({
            id: 'job-cf-alpha',
            tenantId,
            status: 'Scheduled',
            notes: '',
          }),
        };
      }
      return {
        exists: () => true,
        data: () => ({ tenantId }),
      };
    });
  });

  afterEach(async () => {
    await stopTrackingJob();
    await clearLocationBuffer();
    _resetTrackingStateForTesting();
    await AsyncStorage.clear();
  });

  // ==========================================================================
  // CHALLENGE 1: CONCURRENT OFFLINE MUTATIONS IN LOGISTICS & REPAIRS
  // ==========================================================================
  describe('Challenge 1: Concurrent Offline Mutations in Logistics & Repairs (Zero Bleed)', () => {
    it('concurrently queues status updates and notes across Logistics and Repairs without cross-collection bleed', async () => {
      // 1. Simulate offline state across services
      setRepairNetworkOnlineState(false);
      setPullsheetNetworkOnlineState(false);
      setLocationNetworkOnlineState(false);

      // Track Firestore updateDoc and setDoc invocations
      const updateDocCalls: Array<{ path: string; data: any }> = [];
      const setDocCalls: Array<{ path: string; data: any }> = [];

      const getMockPath = (docRef: any): string => {
        if (docRef?.path) return docRef.path;
        if (docRef?.coll && docRef?.id) return `${docRef.coll}/${docRef.id}`;
        if (docRef?._path?.segments) return docRef._path.segments.join('/');
        return 'unknown-path';
      };

      mockFirestore.updateDoc.mockImplementation((docRef: any, data: any) => {
        const path = getMockPath(docRef);
        updateDocCalls.push({ path, data });
        return Promise.resolve();
      });

      mockFirestore.setDoc.mockImplementation((docRef: any, data: any) => {
        const path = getMockPath(docRef);
        setDocCalls.push({ path, data });
        return Promise.resolve();
      });

      // 2. Dispatch interleaved concurrent offline mutations
      const [jobStatusResult, ticketStatusResult, jobNoteResult, ticketNoteResult] = await Promise.all([
        updateLogisticsStatus('job-cf-alpha', 'In Progress', {
          note: 'Driver departed warehouse',
          updatedBy: 'Jordan',
          tenantId,
        }),
        updateRepairTicketStatus(
          'ticket-cf-beta',
          'Under Repair',
          { id: userId, name: 'Tech Casey', email: 'casey@kuro.test' },
          tenantId,
          'Bench diagnostics initiated'
        ),
        appendLogisticsNote('job-cf-alpha', 'En route on M1 motorway', 'Jordan', tenantId),
        appendRepairNote('ticket-cf-beta', 'PSU rail voltage fluctuates between 11.2V and 12.1V', {
          id: userId,
          name: 'Tech Casey',
          email: 'casey@kuro.test',
        }, tenantId),
      ]);

      // All 4 operations must succeed optimistically (resolving cleanly without throwing)
      expect(jobStatusResult).toBeUndefined();
      expect(ticketStatusResult).toBeDefined();
      expect(ticketStatusResult.success).toBe(true);
      expect(jobNoteResult).toBeUndefined();
      expect(ticketNoteResult).toBeDefined();
      expect(ticketNoteResult.id).toBeDefined();

      // Verify targeted Firestore document paths strictly separated
      const allPaths = [...updateDocCalls, ...setDocCalls].map((call) => call.path);
      
      const logisticsCalls = allPaths.filter((p) => p.startsWith('logistics/'));
      const ticketCalls = allPaths.filter((p) => p.startsWith('tickets/') || p.includes('tickets'));

      expect(logisticsCalls.length).toBeGreaterThanOrEqual(1);
      expect(ticketCalls.length).toBeGreaterThanOrEqual(1);

      // Verify zero collision: No logistics call touched tickets and vice-versa
      for (const call of updateDocCalls) {
        if (call.path.includes('logistics')) {
          expect(call.path).not.toContain('tickets');
          expect(call.data).not.toHaveProperty('repairNumber');
        }
        if (call.path.includes('tickets')) {
          expect(call.path).not.toContain('logistics');
          expect(call.data).not.toHaveProperty('eventNumber');
        }
      }
    });

    it('creates a new repair ticket offline while logistics mutations are pending without storage interference', async () => {
      setRepairNetworkOnlineState(false);

      const newTicketInput: CreateRepairTicketInput = {
        equipment: {
          id: 'eq-martin-mac',
          name: 'Martin MAC Viper Profile',
          serialNumber: 'VIPER-0099',
        },
        status: 'Reported',
        priority: 'High',
        requestedBy: 'Stage Tech',
        initialNote: 'CMY flag jammed on channel 14',
      };

      const ticketId = await createRepairTicket(
        tenantId,
        newTicketInput,
        { id: userId, name: 'Stage Tech', email: 'tech@kuro.test' }
      );

      expect(ticketId).toBeDefined();
      expect(typeof ticketId).toBe('string');

      // Verify logistics local storage keys are untouched
      const allKeys = await AsyncStorage.getAllKeys();
      const logisticsKeys = allKeys.filter((k) => k.startsWith('@kuro_location'));
      expect(logisticsKeys).toHaveLength(0);
    });
  });

  // ==========================================================================
  // CHALLENGE 2: EVENT SCANNING ABSOLUTE OFFLINE LOCKDOWN
  // ==========================================================================
  describe('Challenge 2: Event Scanning Absolute Offline Lockdown', () => {
    it('strictly prohibits all scanning and pull-sheet mutations when offline and leaves zero writes queued', async () => {
      // Ensure pull-sheet service is explicitly offline
      setPullsheetNetworkOnlineState(false);
      expect(isPullsheetOnline()).toBe(false);

      // Attempt 1: updatePullsheetItemStatus
      const statusRes = await updatePullsheetItemStatus(
        'evt-offline-01',
        tenantId,
        'item-mac-01',
        'prepped_scanned',
        { uid: userId }
      );
      expect(statusRes.success).toBe(false);
      expect(statusRes.error).toMatch(/network connection required/i);

      // Attempt 2: updatePullsheetItemScannedCount (barcode scan)
      const scanRes = await updatePullsheetItemScannedCount(
        'evt-offline-01',
        tenantId,
        'item-mac-01',
        2,
        false,
        { uid: userId },
        'BC-MAC-VIPER-01'
      );
      expect(scanRes.success).toBe(false);
      expect(scanRes.error).toMatch(/network connection required/i);

      // Attempt 3: bulkConfirmPullsheet
      const bulkRes = await bulkConfirmPullsheet('evt-offline-01', tenantId, { uid: userId });
      expect(bulkRes.success).toBe(false);
      expect(bulkRes.error).toMatch(/network connection required/i);

      // Verify zero operations written to AsyncStorage pending operations queue
      const pendingOps = await getPendingOperations(tenantId, userId);
      expect(pendingOps).toHaveLength(0);

      // Verify Firestore updateDoc was NEVER called for any pull-sheet document
      const pullsheetDocCalls = mockFirestore.updateDoc.mock.calls.filter((call: any[]) => {
        const path = call[0]?.path || '';
        return path.includes('pullsheets') || path.includes('events');
      });
      expect(pullsheetDocCalls).toHaveLength(0);
    });

    it('maintains scan mutation prohibition even if Logistics and Repairs are concurrently active offline', async () => {
      setRepairNetworkOnlineState(false);
      setPullsheetNetworkOnlineState(false);

      // Queue an offline Logistics update
      await updateLogisticsStatus('job-cf-alpha', 'In Progress', { tenantId });

      // Queue an offline Repair update
      await updateRepairTicketStatus('ticket-cf-beta', 'Pending', { id: userId, name: 'Tech' }, tenantId);

      // Attempt scanning mutation: MUST still be rejected
      const scanAttempt = await updatePullsheetItemScannedCount(
        'evt-offline-01',
        tenantId,
        'item-mac-01',
        1,
        false,
        { uid: userId },
        'BC-MAC-VIPER-01'
      );

      expect(scanAttempt.success).toBe(false);
      expect(scanAttempt.error).toMatch(/network connection required/i);

      const pendingOps = await getPendingOperations(tenantId, userId);
      expect(pendingOps).toHaveLength(0);
    });
  });

  // ==========================================================================
  // CHALLENGE 3: FEED BADGE ISOLATION IN MIXED MULTI-FEATURE DASHBOARD
  // ==========================================================================
  describe('Challenge 3: Mixed Multi-Feature Feed Badge State Isolation', () => {
    it('correctly isolates pending sync badges across mixed Logistics and Repair feeds without crosstalk', () => {
      // Construct 5 logistics entries: only index 1 and 3 are pending
      const jobs: LogisticsEntry[] = [0, 1, 2, 3, 4].map((i) => ({
        ...baseJob,
        id: `job-mixed-${i}`,
        eventNumber: 600 + i,
        hasPendingWrites: i === 1 || i === 3,
      }));

      // Construct 5 repair tickets: only index 2 and 4 are pending
      const tickets: RepairTicket[] = [0, 1, 2, 3, 4].map((i) => ({
        ...baseTicket,
        id: `ticket-mixed-${i}`,
        repairNumber: 800 + i,
        hasPendingWrites: i === 2 || i === 4,
      }));

      // Render a combined dashboard containing both feeds simultaneously
      const { queryByTestId, rerender } = render(
        <React.Fragment>
          {jobs.map((job) => (
            <LogisticsJobCard key={job.id} job={job} />
          ))}
          {tickets.map((ticket) => (
            <RepairTicketCard key={ticket.id} ticket={ticket} />
          ))}
        </React.Fragment>
      );

      // Verify Logistics badges
      expect(queryByTestId('job-pending-sync-job-mixed-0')).toBeNull();
      expect(queryByTestId('job-pending-sync-job-mixed-1')).toBeTruthy();
      expect(queryByTestId('job-pending-sync-job-mixed-2')).toBeNull();
      expect(queryByTestId('job-pending-sync-job-mixed-3')).toBeTruthy();
      expect(queryByTestId('job-pending-sync-job-mixed-4')).toBeNull();

      // Verify Repairs badges
      expect(queryByTestId('ticket-pending-sync-ticket-mixed-0')).toBeNull();
      expect(queryByTestId('ticket-pending-sync-ticket-mixed-1')).toBeNull();
      expect(queryByTestId('ticket-pending-sync-ticket-mixed-2')).toBeTruthy();
      expect(queryByTestId('ticket-pending-sync-ticket-mixed-3')).toBeNull();
      expect(queryByTestId('ticket-pending-sync-ticket-mixed-4')).toBeTruthy();

      // Now simulate server sync acknowledgment for Logistics job-mixed-1 only
      const updatedJobs = jobs.map((j) =>
        j.id === 'job-mixed-1' ? { ...j, hasPendingWrites: false } : j
      );

      rerender(
        <React.Fragment>
          {updatedJobs.map((job) => (
            <LogisticsJobCard key={job.id} job={job} />
          ))}
          {tickets.map((ticket) => (
            <RepairTicketCard key={ticket.id} ticket={ticket} />
          ))}
        </React.Fragment>
      );

      // job-mixed-1 cleared, job-mixed-3 remains, tickets unchanged
      expect(queryByTestId('job-pending-sync-job-mixed-1')).toBeNull();
      expect(queryByTestId('job-pending-sync-job-mixed-3')).toBeTruthy();
      expect(queryByTestId('ticket-pending-sync-ticket-mixed-2')).toBeTruthy();
      expect(queryByTestId('ticket-pending-sync-ticket-mixed-4')).toBeTruthy();

      // Now sync all remaining items
      const allSyncedJobs = updatedJobs.map((j) => ({ ...j, hasPendingWrites: false }));
      const allSyncedTickets = tickets.map((t) => ({ ...t, hasPendingWrites: false }));

      rerender(
        <React.Fragment>
          {allSyncedJobs.map((job) => (
            <LogisticsJobCard key={job.id} job={job} />
          ))}
          {allSyncedTickets.map((ticket) => (
            <RepairTicketCard key={ticket.id} ticket={ticket} />
          ))}
        </React.Fragment>
      );

      // Zero badges rendered anywhere
      for (let i = 0; i < 5; i++) {
        expect(queryByTestId(`job-pending-sync-job-mixed-${i}`)).toBeNull();
        expect(queryByTestId(`ticket-pending-sync-ticket-mixed-${i}`)).toBeNull();
      }
    });

    it('resists false-positive badge rendering under adversarial corrupted values across models', () => {
      const corruptedJob = mapFirestoreLogisticsDoc({
        id: 'job-corrupt',
        data: () => ({ id: 'job-corrupt', tenantId, status: 'Scheduled' }),
        metadata: { hasPendingWrites: undefined },
      });

      const corruptedTicket = mapFirestoreRepairTicketDoc({
        id: 'ticket-corrupt',
        data: () => ({ id: 'ticket-corrupt', tenantId, status: 'Reported', equipment: { name: 'Cable' } }),
        metadata: { hasPendingWrites: null },
      });

      expect(corruptedJob.hasPendingWrites).toBe(false);
      expect(corruptedTicket.hasPendingWrites).toBe(false);

      const { queryByTestId } = render(
        <React.Fragment>
          <LogisticsJobCard job={corruptedJob} />
          <RepairTicketCard ticket={corruptedTicket} />
        </React.Fragment>
      );

      expect(queryByTestId('job-pending-sync-job-corrupt')).toBeNull();
      expect(queryByTestId('ticket-pending-sync-ticket-corrupt')).toBeNull();
    });
  });

  // ==========================================================================
  // CHALLENGE 4: RECONNECTION TELEMETRY FLUSH COEXISTENCE
  // ==========================================================================
  describe('Challenge 4: Reconnection Telemetry Flush & Domain Coexistence', () => {
    it('buffers GPS coordinates offline, flushes upon reconnection, and re-enables Event Scanning seamlessly', async () => {
      const trackingJobId = 'job-tracking-cf-01';

      // Start active tracking session while online
      await startTrackingJob(trackingJobId, tenantId, { driverId: userId, driverName: 'Jordan' });

      // 1. Enter offline mode
      setLocationNetworkOnlineState(false);
      setPullsheetNetworkOnlineState(false);
      setRepairNetworkOnlineState(false);
      await clearLocationBuffer();

      // 2. Incoming GPS coordinate buffered during offline drop
      const timestamp1 = 1726140000000;
      await handleLocationUpdate(
        {
          coords: {
            latitude: -37.8136,
            longitude: 144.9631,
            altitude: 30,
            accuracy: 5,
            altitudeAccuracy: 5,
            heading: 90,
            speed: 15,
          },
          timestamp: timestamp1,
        } as any,
        true, // forceWrite
        false // bufferOnly
      );

      expect(getLocationBufferCount()).toBe(1);

      // Confirm offline scan is blocked
      const scanBlocked = await updatePullsheetItemStatus(
        'evt-recon-01',
        tenantId,
        'item-recon-01',
        'prepped_scanned',
        { uid: userId }
      );
      expect(scanBlocked.success).toBe(false);

      // 3. Network connection restored
      setLocationNetworkOnlineState(true);
      setPullsheetNetworkOnlineState(true);
      setRepairNetworkOnlineState(true);

      // Await buffer flush completion
      await flushLocationBuffer();

      // Verify location buffer flushed to 0
      expect(getLocationBufferCount()).toBe(0);

      // Verify scan mutation now proceeds (passes online check)
      const onlineAttempt = await updatePullsheetItemStatus(
        'evt-recon-01',
        tenantId,
        'item-recon-01',
        'prepped_scanned',
        { uid: userId }
      );

      // Online check was passed; result error is NOT 'Network connection required'
      if (!onlineAttempt.success) {
        expect(onlineAttempt.error).not.toMatch(/network connection required/i);
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 5: RAPID NETWORK FLAPPING & SYSTEM CONVERGENCE
  // ==========================================================================
  describe('Challenge 5: Rapid Network Flapping & System Convergence', () => {
    it('settles cleanly on the final network state across 30 rapid online/offline flips without leaking state', () => {
      let rtdbCallback: ((snap: any) => void) | null = null;
      (database.onValue as jest.Mock).mockImplementation((_ref: any, cb: any) => {
        rtdbCallback = cb;
        return jest.fn();
      });

      const { queryByTestId } = render(
        <NetworkProvider>
          <GlobalOfflineBanner />
        </NetworkProvider>
      );

      expect(rtdbCallback).not.toBeNull();

      // Flap network 30 times rapidly
      act(() => {
        for (let i = 0; i < 30; i++) {
          const isOnline = i % 2 === 0;
          rtdbCallback!({ val: () => isOnline });
        }
      });

      // Iteration 29 was i=29 (odd) -> offline
      expect(queryByTestId('global-offline-banner')).toBeTruthy();

      // Final toggle to online
      act(() => {
        rtdbCallback!({ val: () => true });
      });

      // Global banner hidden
      expect(queryByTestId('global-offline-banner')).toBeNull();
      expect(isPullsheetOnline()).toBe(true);
    });
  });
});
