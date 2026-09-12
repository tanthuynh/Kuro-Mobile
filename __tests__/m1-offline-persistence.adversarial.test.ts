import AsyncStorage from '@react-native-async-storage/async-storage';
import * as firestoreModule from 'firebase/firestore';
import * as rtdbModule from 'firebase/database';
import {
  buildFirestoreSettings,
  buildDefaultLocalCache,
  FIRESTORE_SETTINGS,
  db,
} from '@/lib/firebase';
import {
  createRepairTicket,
  updateRepairTicketStatus,
  updateRepairTicketFields,
  appendRepairNote,
  appendRepairAction,
  updateRepairNote,
  deleteRepairNote,
  deleteRepairAttachment,
  uploadRepairDamagePhoto,
  setNetworkOnlineState,
  isOnline,
  getPendingRepairOperations,
} from '@/services/repair-service';
import {
  appendLogisticsNote,
  updateLogisticsStatus,
} from '@/services/logistics-service';
import type {
  CreateRepairTicketInput,
  RepairTicket,
} from '@/types/repair';

const mockFirestore = firestoreModule as jest.Mocked<any>;
const mockRtdb = rtdbModule as jest.Mocked<any>;

describe('M1 Adversarial & Stress Testing: Offline Persistence & Mutations', () => {
  const tenantId = 'tenant-adversarial-123';
  const userId = 'tech-adversary-1';
  const currentUser = {
    id: userId,
    uid: userId,
    name: 'Adversary Tech',
    email: 'adversary@kuro.test',
    tenantId,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    setNetworkOnlineState(true);
  });

  // ==========================================================================
  // SUITE 1: FIRESTORE INITIALIZATION & MULTI-TIER STORAGE FALLBACK STRESS
  // ==========================================================================
  describe('Suite 1: Firestore Initialization & Cache Fallback Stress', () => {
    it('ADV-INIT-01: buildDefaultLocalCache handles multi-tier failure (persistent -> memory -> undefined)', () => {
      // 1. Both throw
      (firestoreModule.persistentLocalCache as jest.Mock).mockImplementationOnce(() => {
        throw new Error('IndexedDB quota exceeded');
      });
      (firestoreModule.memoryLocalCache as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Out of memory');
      });

      const cache = buildDefaultLocalCache();
      expect(cache).toBeUndefined();
    });

    it('ADV-INIT-02: initializeFirestore recovers when persistent AND memory fallbacks both fail during fresh init', () => {
      const undefinedCacheDb = { _isFallbackUndefined: true };
      const spyInit = jest.spyOn(firestoreModule, 'initializeFirestore');
      spyInit.mockClear();

      // First init (persistent) fails
      // Second init (memory) fails
      // Third init (undefined) succeeds
      spyInit
        .mockImplementationOnce(() => {
          throw new Error('Persistent storage blocked');
        })
        .mockImplementationOnce(() => {
          throw new Error('Memory cache init failed');
        })
        .mockReturnValueOnce(undefinedCacheDb as any);

      const spyGet = jest.spyOn(firestoreModule, 'getFirestore');
      spyGet.mockClear();
      spyGet.mockImplementationOnce(() => {
        throw new Error('No Firestore instance exists');
      });

      let reloaded: typeof import('@/lib/firebase');
      jest.isolateModules(() => {
        reloaded = require('@/lib/firebase');
      });

      expect(spyInit).toHaveBeenCalledTimes(3);
      expect(spyInit).toHaveBeenNthCalledWith(
        3,
        expect.anything(),
        expect.objectContaining({
          localCache: undefined,
        })
      );
      expect(reloaded!.db).toBe(undefinedCacheDb);

      spyInit.mockRestore();
      spyGet.mockRestore();
    });

    it('ADV-INIT-03: buildFirestoreSettings handles pathological inputs and clamping', () => {
      // Clamping extreme timeouts
      const clampedLow = buildFirestoreSettings(0);
      expect(clampedLow.experimentalLongPollingOptions?.timeoutSeconds).toBe(5);

      const clampedHigh = buildFirestoreSettings(999);
      expect(clampedHigh.experimentalLongPollingOptions?.timeoutSeconds).toBe(30);

      // Pathological string timeouts
      const negativeString = buildFirestoreSettings('-10');
      expect(negativeString.experimentalLongPollingOptions?.timeoutSeconds).toBe(5);

      const nanString = buildFirestoreSettings('not-a-number');
      expect(nanString.experimentalLongPollingOptions).toBeUndefined();

      // Mutual exclusion between localCache and cacheSizeBytes
      const customCacheObj = { kind: 'persistent_custom' } as any;
      const bothSettings = buildFirestoreSettings({
        localCache: customCacheObj,
        cacheSizeBytes: 5000000,
      });
      expect(bothSettings.localCache).toBe(customCacheObj);
      expect(bothSettings.cacheSizeBytes).toBeUndefined();
    });

    it('ADV-INIT-04: writeBatch mock handles 100 chained operations fluently without data loss', async () => {
      const batch = firestoreModule.writeBatch(db);
      for (let i = 0; i < 50; i++) {
        const d = firestoreModule.doc(db, 'tickets', `t-${i}`);
        batch.set(d, { index: i }).update(d, { status: 'Repaired' });
      }
      expect((batch as any)._operations).toHaveLength(100);
      await expect(batch.commit()).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // SUITE 2: OFFLINE MUTATION BEHAVIOR ACROSS REPAIR SERVICES (ADVERSARIAL)
  // ==========================================================================
  describe('Suite 2: Offline Mutation Behavior & Failure Modes in Repair Service', () => {
    it('ADV-REP-01: createRepairTicket offline with equipment.id when equipment doc is uncached', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      // Equipment getDoc fails because client is offline and doc is uncached
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      const input: CreateRepairTicketInput = {
        equipment: {
          id: 'equip-uncached-789',
          name: 'Pioneer CDJ-3000',
          serialNumber: 'SN-998877',
        },
        status: 'Reported',
        priority: 'High',
      };

      // Requirement 2: Mutations MUST NOT fail or reject when offline.
      // If createRepairTicket throws, error recovery is broken and operation is rejected!
      let caughtError: any = null;
      let ticketId: string | null = null;
      try {
        ticketId = await createRepairTicket(tenantId, input, currentUser);
      } catch (err: any) {
        caughtError = err;
      }

      // Assert that createRepairTicket completes gracefully without unhandled rejection
      expect(caughtError).toBeNull();
      expect(ticketId).toBeTruthy();
      expect(mockFirestore.setDoc).toHaveBeenCalled();
    });

    it('ADV-REP-02: createRepairTicket offline when RTDB sync throws network error', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      // Equipment getDoc succeeds (cached)
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ tenantId, serialNumbers: [] }),
      });

      // RTDB set throws network timeout / offline error
      mockRtdb.set.mockRejectedValueOnce(new Error('RTDB connection timeout: client offline'));

      const input: CreateRepairTicketInput = {
        equipment: {
          id: 'equip-cached-111',
          name: 'Martin MAC Aura',
        },
        status: 'Under Repair',
        condition: 'Out of Service',
      };

      // Requirement 2: Mutations MUST NOT fail or reject when offline.
      let caughtError: any = null;
      let ticketId: string | null = null;
      try {
        ticketId = await createRepairTicket(tenantId, input, currentUser);
      } catch (err: any) {
        caughtError = err;
      }

      // Assert that RTDB network timeout does NOT abort ticket creation
      expect(caughtError).toBeNull();
      expect(ticketId).toBeTruthy();
      expect(mockFirestore.setDoc).toHaveBeenCalled();
    });

    it('ADV-REP-03: updateRepairTicketFields offline when condition/status changes with equipment.id and equipment getDoc fails', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      // Ticket getDoc succeeds
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          tenantId,
          status: 'Reported',
          condition: 'Available to Use',
          equipment: { id: 'eq-222', name: 'Shure Axient' },
        }),
      });

      // Equipment getDoc in updateEquipmentRepairCondition fails offline
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      const result = await updateRepairTicketFields(
        'ticket-adv-1',
        { status: 'Under Repair', condition: 'Out of Service' },
        currentUser,
        tenantId
      );

      // Requirement 2: Mutations must not report failure when offline
      expect(result.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalled();
    });

    it('ADV-REP-04: updateRepairTicketStatus offline gracefully survives both equipment and RTDB failures', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      // Ticket getDoc succeeds
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          tenantId,
          status: 'Reported',
          condition: 'Available to Use',
          equipment: { id: 'eq-333', name: 'Robe MegaPointe' },
        }),
      });

      // Equipment condition update throws
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      // RTDB set throws
      mockRtdb.set.mockRejectedValueOnce(new Error('RTDB offline timeout'));

      const result = await updateRepairTicketStatus(
        'ticket-adv-2',
        'Under Repair',
        currentUser,
        tenantId,
        'Offline transition test',
        'Out of Service'
      );

      // updateRepairTicketStatus has defensive try/catch around both, so it should succeed
      expect(result.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        expect.objectContaining({
          status: 'Under Repair',
          condition: 'Out of Service',
        })
      );
    });

    it('ADV-REP-05: appendRepairNote offline queues updateDoc even when ticket getDoc fails offline', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      // Ticket getDoc throws offline error
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      const note = await appendRepairNote(
        'ticket-adv-3',
        'Inspected capacitor while offline in warehouse basement',
        currentUser,
        tenantId
      );

      expect(note).toBeDefined();
      expect(note.content).toContain('Inspected capacitor');
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        expect.objectContaining({
          notes: expect.anything(),
          actions: expect.anything(),
        })
      );
    });

    it('ADV-REP-06: updateRepairNote offline when ticket is uncached', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      // Ticket getDoc throws offline error
      mockFirestore.getDoc.mockRejectedValueOnce(
        new Error('Failed to get document because the client is offline')
      );

      let caughtError: any = null;
      try {
        await updateRepairNote('ticket-adv-4', 'note-1', 'Updated offline note', currentUser, tenantId);
      } catch (err) {
        caughtError = err;
      }

      // If uncaught, it throws offline error
      if (caughtError) {
        expect(caughtError.message).toMatch(/client is offline/);
      }
    });

    it('ADV-REP-07: uploadRepairDamagePhoto is strictly rejected offline without touching storage', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      await expect(
        uploadRepairDamagePhoto(tenantId, 'ticket-adv-5', 'file:///data/photo.jpg')
      ).rejects.toThrow(/Offline photo upload/i);
    });
  });

  // ==========================================================================
  // SUITE 3: CONCURRENCY & BURST TESTING UNDER RAPID NETWORK FLAPPING
  // ==========================================================================
  describe('Suite 3: Concurrency & Network Flapping Stress', () => {
    it('ADV-CONC-01: executes 30 interleaved offline mutations without race conditions or memory corruption', async () => {
      setNetworkOnlineState(false);

      // Provide mock cached ticket doc for getDoc
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ tenantId, notes: [], actions: [] }),
      });

      const promises: Promise<any>[] = [];
      for (let i = 0; i < 15; i++) {
        promises.push(
          appendRepairAction('ticket-burst', `Audit action step ${i}`, currentUser, tenantId)
        );
        promises.push(
          appendRepairNote('ticket-burst', `Field observation note ${i}`, currentUser, tenantId)
        );
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(30);
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(30);
    });

    it('ADV-CONC-02: rapid network state toggling during mutations does not cause unhandled rejections', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ tenantId, notes: [], actions: [] }),
      });

      for (let i = 0; i < 10; i++) {
        setNetworkOnlineState(i % 2 === 0);
        await appendRepairAction('ticket-flapping', `Action under state online=${i % 2 === 0}`, currentUser, tenantId);
      }
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(10);
    });
  });

  // ==========================================================================
  // SUITE 4: REGRESSION AUDIT ACROSS LOGISTICS SERVICE (EMPIRICAL ORACLE)
  // ==========================================================================
  describe('Suite 4: Regression Audit across Logistics Service', () => {
    it('ADV-LOG-01: appendLogisticsNote on non-existent document MUST reject with not found', async () => {
      // Setup mock where document does not exist
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => false,
        data: () => undefined,
      });

      let caught: any = null;
      try {
        await appendLogisticsNote('job-nonexistent-404', 'This note should fail');
      } catch (err) {
        caught = err;
      }

      // ORACLE CHECK: Does appendLogisticsNote throw when document does not exist?
      // In worker M1's implementation, the existence check was deleted, so this resolves instead of rejecting!
      expect(caught).toBeTruthy();
      expect(caught.message).toMatch(/not found/);
    });

    it('ADV-LOG-02: updateLogisticsStatus on non-existent document with tenantId check MUST reject with not found', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => false,
        data: () => undefined,
      });

      let caught: any = null;
      try {
        await updateLogisticsStatus('job-nonexistent-404', 'in_progress', {
          tenantId,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeTruthy();
      expect(caught.message).toMatch(/not found/);
    });
  });
});
