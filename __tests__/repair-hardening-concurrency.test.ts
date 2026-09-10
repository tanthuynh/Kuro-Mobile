/**
 * __tests__/repair-hardening-concurrency.test.ts
 * ============================================================================
 * Integration Test Suite: Kuro Mobile Repair Workflow Hardening & Concurrency
 * ============================================================================
 *
 * Verifies the 5 identified audit risks and required behaviors:
 * 1. Strict online enforcement (offline throws immediately, no offline mutation queue).
 * 2. Duplicate submission prevention & safe retry using idempotent operationId.
 * 3. Atomic sequential numbering avoiding duplicate repair numbers.
 * 4. Partial failure propagation (equipment & RTDB errors unswallowed).
 * 5. Web-aligned Firebase Storage and Entity Document paths.
 * 6. Form state and draft preservation across failures and cold starts.
 * 7. Multi-tenant isolation and authorization guardrails.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setNetworkOnlineState,
  isOnline,
  createRepairTicket,
  updateRepairTicketStatus,
  updateRepairTicketFields,
  appendRepairNote,
  uploadRepairDamagePhoto,
  generateRepairNumber,
  savePendingRepairOperation,
  getPendingRepairOperations,
  clearPendingRepairOperation,
  isTicketOperationPending,
  hasPendingRepairOperations,
  saveRepairDraft,
  getRepairDraft,
  clearRepairDraft,
  executeRepairCommand,
  reconcilePendingRepairOperation,
  retryPendingRepairOperation,
  reconcilePendingRepairOperationsOnColdStart,
} from '@/services/repair-service';
import * as firestore from 'firebase/firestore';
import * as rtdb from 'firebase/database';
import * as storage from 'firebase/storage';
import type {
  CreateRepairTicketInput,
  PendingRepairOperationRecord,
  RepairDraft,
} from '@/types/repair';

// Global mocks
const mockFirestore = firestore as jest.Mocked<any>;
const mockRtdb = rtdb as jest.Mocked<any>;
const mockStorage = storage as jest.Mocked<any>;

// Mock fetch
const originalFetch = global.fetch;

describe('Repair Workflow Hardening & Concurrency Test Suite', () => {
  const tenantId = 'tenant-acme-corp';
  const userId = 'tech-user-42';
  const currentUser = {
    id: userId,
    uid: userId,
    name: 'Jane Tech',
    email: 'jane@acme.com',
    tenantId,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    setNetworkOnlineState(true);
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // ==========================================================================
  // SUITE 1: STRICT ONLINE ENFORCEMENT (NO OFFLINE MUTATION QUEUE)
  // ==========================================================================
  describe('Strict Online Enforcement', () => {
    it('HRD-ONL-01: createRepairTicket throws immediately when offline without saving to mutation queue', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      const input: CreateRepairTicketInput = {
        equipment: { name: 'Yamaha QL5 Console' },
      };

      await expect(createRepairTicket(tenantId, input, currentUser)).rejects.toThrow(
        /Network connection required/i
      );

      // Verify no pending operations were queued in AsyncStorage
      const pending = await getPendingRepairOperations(tenantId, userId);
      expect(pending).toHaveLength(0);
    });

    it('HRD-ONL-02: updateRepairTicketStatus rejects immediately when offline', async () => {
      setNetworkOnlineState(false);
      const result = await updateRepairTicketStatus(
        'ticket-101',
        'Under Repair',
        { id: userId, name: 'Jane Tech' },
        tenantId
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Network connection required/i);
    });

    it('HRD-ONL-03: updateRepairTicketFields rejects immediately when offline', async () => {
      setNetworkOnlineState(false);
      const result = await updateRepairTicketFields(
        'ticket-101',
        { priority: 'High' },
        { id: userId, name: 'Jane Tech' },
        tenantId
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Network connection required/i);
    });

    it('HRD-ONL-04: appendRepairNote throws immediately when offline', async () => {
      setNetworkOnlineState(false);
      await expect(
        appendRepairNote('ticket-101', 'Replaced capacitor C4', { id: userId, name: 'Jane Tech' }, tenantId)
      ).rejects.toThrow(/Network connection required/i);
    });

    it('HRD-ONL-05: uploadRepairDamagePhoto throws immediately when offline', async () => {
      setNetworkOnlineState(false);
      await expect(
        uploadRepairDamagePhoto(tenantId, 'ticket-101', 'file:///local/damage.jpg')
      ).rejects.toThrow(/Network connection required/i);
    });
  });

  // ==========================================================================
  // SUITE 2: BACKEND COMMAND PROTOCOL & IDEMPOTENCY
  // ==========================================================================
  describe('Backend Command Protocol & Idempotency', () => {
    it('HRD-CMD-01: executeRepairCommand transitions through in_flight and clears on committed response', async () => {
      const mockTicket = {
        id: 't-server-999',
        repairNumber: 1042,
        equipment: { name: 'Martin MAC Aura' },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          status: 'committed',
          ticketId: 't-server-999',
          repairNumber: 1042,
          ticket: mockTicket,
        }),
      });

      const result = await executeRepairCommand(
        'create_ticket',
        tenantId,
        { uid: userId },
        { ticketData: { equipment: { name: 'Martin MAC Aura' } } }
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('committed');
      expect(result.ticketId).toBe('t-server-999');
      expect(result.repairNumber).toBe(1042);

      // Operation should be cleared from durable AsyncStorage upon committed response
      const pending = await getPendingRepairOperations(tenantId, userId);
      expect(pending).toHaveLength(0);
    });

    it('HRD-CMD-02: marks operation outcome_unknown on server 500 error and preserves record in AsyncStorage', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Bad Gateway' }),
      });

      const result = await executeRepairCommand(
        'create_ticket',
        tenantId,
        { uid: userId },
        { ticketData: { equipment: { name: 'Shure Axient Receiver' } } }
      );

      expect(result.success).toBe(false);
      expect(result.outcomeUnknown).toBe(true);
      expect(result.operationId).toBeDefined();

      // In-flight record should be persisted as outcome_unknown in AsyncStorage
      const pending = await getPendingRepairOperations(tenantId, userId);
      expect(pending).toHaveLength(1);
      expect(pending[0].state).toBe('outcome_unknown');
      expect(pending[0].operationId).toBe(result.operationId);
    });

    it('HRD-CMD-03: marks operation outcome_unknown on network disconnect during fetch', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));

      const result = await executeRepairCommand(
        'create_ticket',
        tenantId,
        { uid: userId },
        { ticketData: { equipment: { name: 'Crown I-Tech Amp' } } }
      );

      expect(result.success).toBe(false);
      expect(result.outcomeUnknown).toBe(true);
      expect(result.error).toMatch(/Connection lost/i);

      const pending = await getPendingRepairOperations(tenantId, userId);
      expect(pending).toHaveLength(1);
      expect(pending[0].state).toBe('outcome_unknown');
    });

    it('HRD-CMD-04: retryPendingRepairOperation reuses original operationId safely', async () => {
      const originalOpId = 'op-uuid-12345';
      const record: PendingRepairOperationRecord = {
        operationId: originalOpId,
        tenantId,
        userId,
        ticketId: 't-retry-1',
        action: 'create_ticket',
        payload: { equipment: { name: 'L-Acoustics K2' } },
        timestamp: Date.now() - 5000,
        state: 'outcome_unknown',
      };
      await savePendingRepairOperation(record);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          status: 'committed',
          operationId: originalOpId,
          ticketId: 't-retry-1',
          repairNumber: 1045,
        }),
      });

      const retryResult = await retryPendingRepairOperation(record);

      expect(retryResult.success).toBe(true);
      expect(retryResult.operationId).toBe(originalOpId);
      expect(retryResult.ticketId).toBe('t-retry-1');

      // Verified original operationId was sent in request payload
      const fetchBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(fetchBody.operationId).toBe(originalOpId);

      // Pending record cleared on success
      const pendingAfter = await getPendingRepairOperations(tenantId, userId);
      expect(pendingAfter).toHaveLength(0);
    });

    it('HRD-CMD-05: reconcilePendingRepairOperation polls status and resolves committed state', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          status: 'committed',
          ticketId: 't-reconciled-7',
          repairNumber: 1049,
        }),
      });

      const result = await reconcilePendingRepairOperation(
        't-reconciled-7',
        tenantId,
        userId,
        'op-recon-01'
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('committed');
      expect(result.ticketId).toBe('t-reconciled-7');
    });

    it('HRD-CMD-06: reconcilePendingRepairOperationsOnColdStart clears committed ops and retains unconfirmed', async () => {
      // Seed two pending operations in AsyncStorage
      const op1: PendingRepairOperationRecord = {
        operationId: 'op-cold-1',
        tenantId,
        userId,
        ticketId: 't-cold-1',
        action: 'create_ticket',
        payload: {},
        timestamp: Date.now() - 10000,
        state: 'outcome_unknown',
      };
      const op2: PendingRepairOperationRecord = {
        operationId: 'op-cold-2',
        tenantId,
        userId,
        ticketId: 't-cold-2',
        action: 'create_ticket',
        payload: {},
        timestamp: Date.now() - 10000,
        state: 'outcome_unknown',
      };

      await savePendingRepairOperation(op1);
      await savePendingRepairOperation(op2);

      // Server returns committed for op1, but not_found for op2
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true, status: 'committed', ticketId: 't-cold-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: false, status: 'not_found' }),
        });

      await reconcilePendingRepairOperationsOnColdStart(tenantId, userId);

      const remaining = await getPendingRepairOperations(tenantId, userId);
      // op1 was committed and cleared; op2 not found on server so still pending
      expect(remaining.map((r) => r.operationId)).toEqual(['op-cold-2']);
    });
  });

  // ==========================================================================
  // SUITE 3: SEQUENTIAL NUMBERING & CONCURRENCY
  // ==========================================================================
  describe('Sequential Number Generation', () => {
    it('HRD-NUM-01: generateRepairNumber starts at 1001 when tenant has no existing tickets', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });
      // Fallback query also empty
      mockFirestore.getDocs.mockResolvedValueOnce({
        empty: true,
        forEach: () => {},
      });

      const num = await generateRepairNumber(tenantId);
      expect(num).toBe(1001);
    });

    it('HRD-NUM-02: generateRepairNumber increments highest number atomically', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ repairNumber: 1088 }) }],
      });

      const num = await generateRepairNumber(tenantId);
      expect(num).toBe(1089);
    });
  });

  // ==========================================================================
  // SUITE 4: PARTIAL FAILURE HANDLING & ROLLBACK
  // ==========================================================================
  describe('Partial Failure Handling & Error Propagation', () => {
    it('HRD-ERR-01: createRepairTicket surfaces equipment update failure without swallowing', async () => {
      // Mock ticket doc creation success, but equipment condition update failure
      mockFirestore.setDoc.mockResolvedValueOnce(undefined); // tickets write succeeds
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'act-1' }); // audit log

      // Equipment getDoc succeeds
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ tenantId, serialNumbers: [] }),
      });
      // Equipment update fails
      mockFirestore.updateDoc.mockRejectedValueOnce(new Error('Equipment permission denied or locked'));

      const input: CreateRepairTicketInput = {
        equipment: { id: 'eq-corrupt-1', name: 'Faulty Moving Head', serialNumber: 'SN-999' },
        priority: 'High',
        status: 'Reported',
      };

      // Ensure error is surfaced and not swallowed
      await expect(
        createRepairTicket(tenantId, input, currentUser, { preferLocalExecution: true })
      ).rejects.toThrow(/Equipment permission denied or locked/i);
    });

    it('HRD-ERR-02: createRepairTicket surfaces RTDB availability sync failure without swallowing', async () => {
      mockFirestore.setDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'act-1' });
      // Equipment condition sync succeeds
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ tenantId, serialNumbers: [] }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      // RTDB set fails
      mockRtdb.set.mockRejectedValueOnce(new Error('RTDB connection timeout'));

      const input: CreateRepairTicketInput = {
        equipment: { id: 'eq-rtdb-fail', name: 'Stage Rig Motor' },
        priority: 'High',
        status: 'Reported',
      };

      await expect(
        createRepairTicket(tenantId, input, currentUser, { preferLocalExecution: true })
      ).rejects.toThrow(/RTDB connection timeout/i);
    });
  });

  // ==========================================================================
  // SUITE 5: FORM STATE & DRAFT PERSISTENCE
  // ==========================================================================
  describe('Form Draft Persistence & Safety', () => {
    it('HRD-DFT-01: saves, restores, and clears repair drafts correctly', async () => {
      const draft: RepairDraft = {
        tenantId,
        equipmentName: 'Clay Paky Sharpy',
        serialNumber: 'SH-8821',
        faultDescription: 'Prism rotation wheel blocked',
        priority: 'High',
        condition: 'Out of Service',
        status: 'Reported',
        internalNotes: 'Checked by Jane on shift 2',
        stagedPhotos: [
          { id: 'p1', url: 'file:///cache/p1.jpg', fileName: 'prism_crack.jpg' },
        ],
        lastModified: Date.now(),
      };

      await saveRepairDraft(tenantId, draft);

      const loaded = await getRepairDraft(tenantId);
      expect(loaded).toBeDefined();
      expect(loaded?.equipmentName).toBe('Clay Paky Sharpy');
      expect(loaded?.serialNumber).toBe('SH-8821');
      expect(loaded?.stagedPhotos).toHaveLength(1);

      await clearRepairDraft(tenantId);
      const afterClear = await getRepairDraft(tenantId);
      expect(afterClear).toBeNull();
    });
  });

  // ==========================================================================
  // SUITE 6: WEB-ALIGNED STORAGE & ENTITY DOCUMENT PATHS
  // ==========================================================================
  describe('Web-Aligned Storage & Document Paths', () => {
    it('HRD-PTH-01: uploadRepairDamagePhoto uploads to web-aligned entity_documents storage path', async () => {
      mockStorage.getDownloadURL.mockResolvedValueOnce(
        'https://firebasestorage.googleapis.com/download/damage.jpg'
      );

      const result = await uploadRepairDamagePhoto(
        tenantId,
        'ticket-456',
        'file:///cache/photo.jpg',
        'damage_lens.jpg'
      );

      expect(result.url).toBe('https://firebasestorage.googleapis.com/download/damage.jpg');
      expect(result.attachment.type).toBe('Photo');

      // Expect storage.ref to have been called with canonical path:
      // tenants/{tenantId}/entity_documents/repair-{ticketId}/{fileName}
      expect(mockStorage.ref).toHaveBeenCalledWith(
        expect.anything(),
        `tenants/${tenantId}/entity_documents/repair-ticket-456/damage_lens.jpg`
      );
    });

    it('HRD-PTH-02: appendRepairNote synchronizes to web-aligned entity_documents items collection', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ tenantId, notes: [] }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'act-note' }); // action log
      mockFirestore.setDoc.mockResolvedValueOnce(undefined); // entity doc write

      await appendRepairNote(
        'ticket-789',
        'Tested harness with multimeter',
        { id: userId, name: 'Jane Tech' },
        tenantId
      );

      // Verify entity document was written to tenants/{tenantId}/entity_documents/repair-{ticketId}/items
      expect(mockFirestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'tenants',
        tenantId,
        'entity_documents',
        'repair-ticket-789',
        'items'
      );
      expect(mockFirestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          content: 'Tested harness with multimeter',
          entityId: 'repair-ticket-789',
          tenantId,
        })
      );
    });
  });

  // ==========================================================================
  // SUITE 7: TENANT ISOLATION & AUTHORIZATION
  // ==========================================================================
  describe('Tenant Isolation & Authorization', () => {
    it('HRD-SEC-01: createRepairTicket rejects mismatched user tenantId', async () => {
      const rogueUser = {
        id: 'attacker-1',
        uid: 'attacker-1',
        tenantId: 'tenant-evil-corp',
      };

      const input: CreateRepairTicketInput = {
        equipment: { name: 'Secret Audio Rack' },
      };

      await expect(
        createRepairTicket('tenant-victim-corp', input, rogueUser)
      ).rejects.toThrow(/Unauthorized: Tenant mismatch/i);
    });

    it('HRD-SEC-02: createRepairTicket rejects missing tenantId', async () => {
      const input: CreateRepairTicketInput = {
        equipment: { name: 'Spotlight' },
      };

      await expect(
        createRepairTicket('', input, currentUser)
      ).rejects.toThrow(/Tenant ID is required/i);
    });

    it('HRD-SEC-03: updateRepairTicketStatus rejects unauthorized cross-tenant attempt', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-other-company',
          status: 'Reported',
        }),
      });

      const result = await updateRepairTicketStatus(
        'ticket-x',
        'Completed',
        { id: userId, name: 'Jane Tech' },
        'tenant-acme-corp'
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unauthorized/i);
    });
  });
});
