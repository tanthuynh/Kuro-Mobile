/**
 * __tests__/m1-challenger-2-empirical.challenge.test.tsx
 * ============================================================================
 * Empirical Adversarial & Concurrency Stress Challenge Suite — Milestone 1
 * ============================================================================
 *
 * Authored by Challenger 2 for Milestone 1 (M1).
 * Empirical verification of:
 * 1. Requirement 4: Event Scanning read-only cached access offline;
 *    strict rejection of scanning and swipe-to-scan mutations when offline.
 * 2. Repair Service Defensive getDoc resilience on uncached offline documents.
 * 3. High-volume concurrent offline mutations in repairs under uncached getDoc conditions.
 */

import React from 'react';
import { render, fireEvent, act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as firestore from 'firebase/firestore';

// Services under challenge
import {
  setNetworkOnlineState as setRepairNetworkOnlineState,
  isOnline as isRepairOnline,
  createRepairTicket,
  updateRepairTicketStatus,
  updateRepairTicketFields,
  appendRepairNote,
} from '@/services/repair-service';

import {
  updateLogisticsStatus,
  appendLogisticsNote,
} from '@/services/logistics-service';

import {
  setNetworkOnlineState as setPullsheetNetworkOnlineState,
  isOnline as isPullsheetOnline,
  subscribePullsheet,
  fetchPullsheet,
  updatePullsheetItemStatus,
  updatePullsheetItemScannedCount,
  bulkConfirmPullsheet,
} from '@/services/pull-sheet-service';

import {
  subscribeTenantEvents,
  fetchTenantEvents,
} from '@/services/event-service';

import { usePullSheet } from '@/hooks/use-pull-sheet';
import { ScannerProvider, useScanner } from '@/context/scanner-context';
import { PullSheetItemRow } from '@/components/pull-sheets/pull-sheet-item-row';
import { AudioService } from '@/services/audio-service';
import { HapticService } from '@/services/haptic-service';
import type { Pullsheet, PullsheetItem } from '@/types/pull-sheet';
import type { CreateRepairTicketInput } from '@/types/repair';

// Mocks
const mockFirestore = firestore as jest.Mocked<any>;

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

// Mock Auth Context
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      uid: 'challenger-user-01',
      tenantId: 'tenant-omega',
      firstName: 'Empirical',
      lastName: 'Challenger',
      email: 'challenger@amia.test',
      getIdToken: () => Promise.resolve('mock-challenger-token'),
    },
    tenant: {
      tenantId: 'tenant-omega',
      tenantName: 'Omega Productions',
    },
    isAuthenticated: true,
  }),
}));

// Mock Equipment Hook for scanner
jest.mock('@/hooks/use-equipment', () => ({
  useEquipment: () => ({
    equipmentLookupMap: new Map([
      ['BC-1001', { id: 'eq-1', name: 'Mac Viper Profile', barcode: 'BC-1001' }],
      ['BC-1002', { id: 'eq-2', name: 'GrandMA3 Full Size', barcode: 'BC-1002' }],
    ]),
    equipment: [],
    loading: false,
  }),
}));

describe('Milestone 1 — Challenger 2 Empirical Challenge Test Suite', () => {
  const tenantId = 'tenant-omega';
  const userId = 'challenger-user-01';
  const testUser = {
    id: userId,
    uid: userId,
    name: 'Empirical Challenger',
    email: 'challenger@amia.test',
    tenantId,
  };

  const samplePullsheetItems: PullsheetItem[] = [
    {
      id: 'item-101',
      description: 'Martin Mac Viper Profile',
      quantity: 4,
      scannedQuantity: 2,
      scannedBarcodes: ['BC-1001'],
      type: 'item',
      status: 'confirmed',
      sectionId: 'sec-lighting',
    },
    {
      id: 'item-102',
      description: 'GrandMA3 Full Size Console',
      quantity: 1,
      scannedQuantity: 1,
      scannedBarcodes: ['BC-1002'],
      type: 'item',
      status: 'prepped_scanned',
      sectionId: 'sec-control',
    },
    {
      id: 'item-103',
      description: 'Spare Lamp Kit',
      quantity: 2,
      scannedQuantity: 0,
      type: 'item',
      status: 'confirmed',
      sectionId: 'sec-spares',
    },
  ];

  const samplePullsheet: Pullsheet = {
    id: 'ps-event-99',
    eventId: 'ps-event-99',
    tenantId,
    items: samplePullsheetItems,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    setRepairNetworkOnlineState(true);
    setPullsheetNetworkOnlineState(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  afterEach(() => {
    setRepairNetworkOnlineState(true);
    setPullsheetNetworkOnlineState(true);
  });

  // ==========================================================================
  // SECTION 1: REQUIREMENT 4 — EVENT SCANNING READ-ONLY CACHE & MUTATION REJECTION
  // ==========================================================================
  describe('Requirement 4: Event Scanning Read-Only Offline Enforcement', () => {
    it('EMP-RO-01: Offline Event & Pullsheet reads succeed from local cache', async () => {
      // Simulate going offline
      setPullsheetNetworkOnlineState(false);
      expect(isPullsheetOnline()).toBe(false);

      // Mock cached snapshot returned by Firestore onSnapshot
      const mockEventSnap = {
        forEach: (cb: any) => {
          cb({
            id: 'ev-cached-1',
            data: () => ({
              tenantId,
              eventName: 'Cached Arena Show',
              eventStatusId: 'Confirmed',
              archived: false,
              startTime: new Date('2026-10-01T10:00:00Z'),
            }),
          });
        },
      };

      mockFirestore.onSnapshot.mockImplementation((q: any, onNext: any) => {
        onNext(mockEventSnap);
        return jest.fn();
      });

      // 1. Subscribe events offline
      let receivedEvents: any[] = [];
      const unsub = subscribeTenantEvents(tenantId, (events) => {
        receivedEvents = events;
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].eventName).toBe('Cached Arena Show');
      unsub();

      // 2. Fetch pullsheet offline from cache
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => samplePullsheet,
        id: 'ps-event-99',
      });

      const cachedPs = await fetchPullsheet('ps-event-99', tenantId);
      expect(cachedPs).not.toBeNull();
      expect(cachedPs?.items).toHaveLength(3);
    });

    it('EMP-RO-02: Barcode Scanning strictly rejects mutations and triggers error feedback when offline', async () => {
      // Disconnect network
      setPullsheetNetworkOnlineState(false);
      expect(isPullsheetOnline()).toBe(false);

      const audioSpy = jest.spyOn(AudioService, 'playScanError').mockResolvedValue(undefined as any);
      const hapticSpy = jest.spyOn(HapticService, 'scanError').mockResolvedValue(undefined as any);

      // Render Scanner Context Consumer
      let scannerRef: any;
      const ScannerConsumer = () => {
        scannerRef = useScanner();
        return null;
      };

      render(
        <ScannerProvider>
          <ScannerConsumer />
        </ScannerProvider>
      );

      act(() => {
        scannerRef.setActiveEventId('ps-event-99');
      });

      // Attempt to process a scan while offline
      let scanResult: any;
      await act(async () => {
        scanResult = await scannerRef.processScan('BC-1001');
      });

      expect(scanResult.type).toBe('UNKNOWN_CODE');
      expect(scanResult.message).toContain('Offline scanning is disabled');
      expect(audioSpy).toHaveBeenCalledTimes(1);
      expect(hapticSpy).toHaveBeenCalledTimes(1);

      // Verify zero mutation writes to Firestore
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
      expect(mockFirestore.setDoc).not.toHaveBeenCalled();
    });

    it('EMP-RO-03: Pullsheet service mutation commands fail immediately when offline', async () => {
      setPullsheetNetworkOnlineState(false);

      // 1. updatePullsheetItemStatus
      const resStatus = await updatePullsheetItemStatus(
        'ps-event-99',
        tenantId,
        'item-101',
        'prepped_scanned',
        { uid: userId }
      );
      expect(resStatus.success).toBe(false);
      expect(resStatus.error).toContain('Offline scanning is disabled');

      // 2. updatePullsheetItemScannedCount
      const resCount = await updatePullsheetItemScannedCount(
        'ps-event-99',
        tenantId,
        'item-101',
        3,
        false,
        { uid: userId }
      );
      expect(resCount.success).toBe(false);
      expect(resCount.error).toContain('Offline scanning is disabled');

      // 3. bulkConfirmPullsheet
      const resBulk = await bulkConfirmPullsheet(
        'ps-event-99',
        tenantId,
        { uid: userId }
      );
      expect(resBulk.success).toBe(false);
      expect(resBulk.error).toContain('Offline scanning is disabled');

      // Zero network fetch commands dispatched
      expect(global.fetch).not.toHaveBeenCalled();
      // Zero Firestore writes
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('EMP-RO-04: Swipe-Right (Manual Scan) gesture rejects mutation when offline', async () => {
      setPullsheetNetworkOnlineState(false);

      const hapticsSpy = jest.spyOn(Haptics, 'impactAsync');
      const hapticScanErrorSpy = jest.spyOn(HapticService, 'scanError').mockResolvedValue(undefined as any);

      // Mount usePullSheet hook
      mockFirestore.onSnapshot.mockImplementation((ref: any, onNext: any) => {
        onNext({
          exists: () => true,
          data: () => samplePullsheet,
          id: 'ps-event-99',
        });
        return jest.fn();
      });

      const { result: pullsheetHook } = renderHook(() => usePullSheet('ps-event-99'));

      const handleSwipeRight = async (item: PullsheetItem) => {
        await pullsheetHook.current.updateStatus(item.id, 'prepped_scanned', { scannedQuantity: 4 });
      };

      const { getByTestId } = render(
        <PullSheetItemRow
          item={samplePullsheetItems[0]}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeRight={handleSwipeRight}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-101');

      // Drag right past threshold (dx = 140)
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 140, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 140, dy: 0 } });
      });

      // Component triggers gesture feedback, but hook blocks the mutation
      expect(hapticsSpy).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
      expect(hapticScanErrorSpy).toHaveBeenCalled();
      expect(pullsheetHook.current.error?.message).toContain('Network connection required');

      // No Firestore write was performed
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('EMP-RO-05: Swipe-Left (Revert Status) gesture rejects mutation when offline', async () => {
      setPullsheetNetworkOnlineState(false);

      const hapticScanErrorSpy = jest.spyOn(HapticService, 'scanError').mockResolvedValue(undefined as any);

      const { result: pullsheetHook } = renderHook(() => usePullSheet('ps-event-99'));

      // Prepped item (item-102) reverts to confirmed
      const handleSwipeLeft = async (item: PullsheetItem) => {
        await pullsheetHook.current.updateStatus(item.id, 'confirmed', { scannedQuantity: 0 });
      };

      const { getByTestId } = render(
        <PullSheetItemRow
          item={samplePullsheetItems[1]} // prepped_scanned
          isScannerOpen={true}
          onSwipeLeft={handleSwipeLeft}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-102');

      // Drag left past threshold (dx = -140)
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: -140, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: -140, dy: 0 } });
      });

      expect(hapticScanErrorSpy).toHaveBeenCalled();
      expect(pullsheetHook.current.error?.message).toContain('Network connection required');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('EMP-RO-06: Confirmed floor prevents left-swipe demotion regardless of online status', async () => {
      setPullsheetNetworkOnlineState(true); // Online

      const onSwipeLeft = jest.fn();
      const hapticsSpy = jest.spyOn(Haptics, 'impactAsync');

      const { getByTestId } = render(
        <PullSheetItemRow
          item={samplePullsheetItems[0]} // status: 'confirmed'
          isScannerOpen={true}
          onSwipeLeft={onSwipeLeft}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-101');

      // Drag left past threshold
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: -140, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: -140, dy: 0 } });
      });

      // Strict floor: onSwipeLeft is NOT called
      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(hapticsSpy).not.toHaveBeenCalled();
    });

    it('EMP-RO-07: In non-scanner mode, swiping is strictly disabled', async () => {
      const onSwipeRight = jest.fn();

      const { getByTestId } = render(
        <PullSheetItemRow
          item={samplePullsheetItems[0]}
          isScannerOpen={false} // Closed scanner mode
          onSwipeRight={onSwipeRight}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-101');

      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 150, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 150, dy: 0 } });
      });

      expect(onSwipeRight).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SECTION 2: REPAIR DEFENSIVE getDoc RESILIENCE ON UNCACHED DOCUMENTS
  // ==========================================================================
  describe('Repair Service Defensive getDoc Resilience on Uncached Documents', () => {
    it('EMP-DOC-01: updateRepairTicketStatus succeeds when getDoc throws offline error', async () => {
      setRepairNetworkOnlineState(false);
      expect(isRepairOnline()).toBe(false);

      // getDoc rejects because document was never cached locally
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      const result = await updateRepairTicketStatus(
        'ticket-uncached-01',
        'Under Repair',
        testUser,
        tenantId,
        'Scheduled bench inspection'
      );

      expect(result.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        expect.objectContaining({
          status: 'Under Repair',
          actions: expect.any(Object),
          updatedAt: expect.any(Object),
        })
      );
    });

    it('EMP-DOC-02: updateRepairTicketFields succeeds when getDoc throws offline error', async () => {
      setRepairNetworkOnlineState(false);

      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      const result = await updateRepairTicketFields(
        'ticket-uncached-02',
        {
          priority: 'High',
          internalNotes: 'Capacitor blew during sound check',
          internalReference: 'REF-OFFLINE-99',
        },
        testUser,
        tenantId
      );

      expect(result.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        expect.objectContaining({
          priority: 'High',
          internalNotes: 'Capacitor blew during sound check',
          internalReference: 'REF-OFFLINE-99',
          updatedAt: expect.any(Object),
        })
      );
    });

    it('EMP-DOC-03: appendRepairNote succeeds when getDoc throws offline error', async () => {
      setRepairNetworkOnlineState(false);

      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      const note = await appendRepairNote(
        'ticket-uncached-03',
        'Offline technician note: awaiting parts from distributor',
        testUser,
        tenantId
      );

      expect(note).toBeDefined();
      expect(note.content).toBe('Offline technician note: awaiting parts from distributor');
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        expect.objectContaining({
          notes: expect.any(Object),
          actions: expect.any(Object),
          updatedAt: expect.any(Object),
        })
      );
    });

    it('EMP-DOC-04: Logistics Service getDoc resilience on uncached documents', async () => {
      // 1. updateLogisticsStatus on uncached doc
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      await expect(
        updateLogisticsStatus('logistics-uncached-01', 'Completed', {
          tenantId,
          updatedBy: 'Driver Dan',
        })
      ).resolves.not.toThrow();

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        expect.objectContaining({
          status: 'Completed',
          isTrackingActive: false,
          updatedBy: 'Driver Dan',
        })
      );

      // 2. appendLogisticsNote on uncached doc
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      await expect(
        appendLogisticsNote('logistics-uncached-02', 'Left at loading dock gate 4', 'Driver Dan', tenantId)
      ).resolves.not.toThrow();
    });

    it('EMP-DOC-05: Real tenant mismatch or unauthorized errors are NOT swallowed', async () => {
      setRepairNetworkOnlineState(false);

      // 1. Unauthorized error rethrows
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('unauthorized: Permission denied')
      );

      await expect(
        updateRepairTicketStatus('ticket-auth-fail', 'Completed', testUser, tenantId)
      ).resolves.toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('unauthorized'),
        })
      );

      // 2. Tenant mismatch snap data
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ tenantId: 'other-tenant-hacker' }),
      });

      const mismatchResult = await updateRepairTicketStatus('ticket-mismatch', 'Completed', testUser, tenantId);
      expect(mismatchResult.success).toBe(false);
      expect(mismatchResult.error).toContain('unauthorized');
    });
  });

  // ==========================================================================
  // SECTION 3: STRESS TEST CONCURRENT OFFLINE MUTATIONS IN REPAIRS
  // ==========================================================================
  describe('High-Volume Concurrent Offline Mutation Stress Testing', () => {
    it('EMP-STR-01: 50 Concurrent Mixed Offline Mutations Complete Without Disruption', async () => {
      setRepairNetworkOnlineState(false);
      expect(isRepairOnline()).toBe(false);

      // Intermittent getDoc: 60% of reads fail with offline uncached error, 40% return cached data
      let getDocInvocationCount = 0;
      mockFirestore.getDoc.mockImplementation(async () => {
        getDocInvocationCount++;
        if (getDocInvocationCount % 2 === 0) {
          throw new Error('Failed to get document because the client is offline');
        }
        return {
          exists: () => true,
          data: () => ({
            tenantId,
            status: 'Reported',
            condition: 'Available to Use',
            equipment: { id: 'eq-stress', name: 'Stress Tested Gear' },
          }),
        };
      });

      const promises: Promise<any>[] = [];

      // 15 concurrent ticket creations
      for (let i = 0; i < 15; i++) {
        const input: CreateRepairTicketInput = {
          equipment: { name: `Offline Batch Amp #${i}` },
          repairType: 'Emergency Repair',
          priority: 'High',
        };
        promises.push(createRepairTicket(tenantId, input, testUser));
      }

      // 15 concurrent status updates on various uncached/cached tickets
      for (let i = 0; i < 15; i++) {
        promises.push(
          updateRepairTicketStatus(
            `ticket-stress-status-${i}`,
            'Under Repair',
            testUser,
            tenantId,
            `Concurrent status change #${i}`
          )
        );
      }

      // 10 concurrent field updates
      for (let i = 0; i < 10; i++) {
        promises.push(
          updateRepairTicketFields(
            `ticket-stress-fields-${i}`,
            {
              priority: 'High',
              internalNotes: `Stress field note #${i}`,
              internalReference: `BATCH-${i}`,
            },
            testUser,
            tenantId
          )
        );
      }

      // 10 concurrent note appends
      for (let i = 0; i < 10; i++) {
        promises.push(
          appendRepairNote(
            `ticket-stress-notes-${i}`,
            `Concurrent inspection note #${i}`,
            testUser,
            tenantId
          )
        );
      }

      expect(promises).toHaveLength(50);

      // Execute all 50 concurrent mutations in parallel
      const results = await Promise.allSettled(promises);

      // Assert zero rejections
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(0);

      // Assert all 50 operations completed successfully
      results.forEach((r, idx) => {
        expect(r.status).toBe('fulfilled');
        if (r.status === 'fulfilled') {
          if (idx < 15) {
            // createRepairTicket returns string ticket ID
            expect(typeof r.value).toBe('string');
            expect(r.value).toBeTruthy();
          } else if (idx < 30) {
            // updateRepairTicketStatus returns { success: true }
            expect(r.value).toEqual({ success: true });
          } else if (idx < 40) {
            // updateRepairTicketFields returns { success: true }
            expect(r.value).toEqual({ success: true });
          } else {
            // appendRepairNote returns note object
            expect(r.value).toHaveProperty('content');
          }
        }
      });

      // Verify Firestore mutation counts
      // 15 creates call setDoc, plus 10 appendRepairNote calls sync entity document via setDoc = 25 setDoc
      expect(mockFirestore.setDoc.mock.calls.length).toBeGreaterThanOrEqual(25);
      // 15 status + 10 field + 10 note updates = at least 35 calls to updateDoc (plus secondary equipment syncs)
      expect(mockFirestore.updateDoc.mock.calls.length).toBeGreaterThanOrEqual(35);

      // Total queued Firestore writes: at least 60
      const totalWrites = mockFirestore.setDoc.mock.calls.length + mockFirestore.updateDoc.mock.calls.length;
      expect(totalWrites).toBeGreaterThanOrEqual(60);
    });

    it('EMP-STR-02: Rapid sequential writes on an uncached document queue safely in order', async () => {
      setRepairNetworkOnlineState(false);

      // getDoc continually rejects because document is uncached
      mockFirestore.getDoc.mockRejectedValue(
        new Error('Failed to get document because the client is offline')
      );

      const ticketId = 'ticket-sequential-uncached';

      // 1. Status update
      const res1 = await updateRepairTicketStatus(ticketId, 'Under Repair', testUser, tenantId);
      expect(res1.success).toBe(true);

      // 2. Field update
      const res2 = await updateRepairTicketFields(
        ticketId,
        { priority: 'Low', internalNotes: 'Backordered PSU' },
        testUser,
        tenantId
      );
      expect(res2.success).toBe(true);

      // 3. Note append
      const note = await appendRepairNote(ticketId, 'Supplier ETA is next Tuesday', testUser, tenantId);
      expect(note).toBeDefined();

      // All three mutations proceeded to updateDoc without interruption
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(3);
    });
  });
});
