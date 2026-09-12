/**
 * __tests__/repair-service.test.ts
 * Comprehensive Tier 1 & Tier 2 Integration Test Suite for Kuro Mobile Repair Service.
 */

import {
  mapFirestoreRepairTicketDoc,
  mapFirestoreRepairDoc,
  subscribeTenantRepairTickets,
  subscribeSingleRepairTicket,
  subscribeRepairTicket,
  fetchTenantRepairTickets,
  getRepairTicket,
  generateRepairNumber,
  createRepairTicket,
  updateRepairTicketStatus,
  updateRepairTicketFields,
  appendRepairAction,
  appendRepairNote,
  appendRepairAttachment,
  addRepairAttachment,
  uploadRepairDamagePhoto,
  syncRepairToRtdbLedger,
  updateEquipmentRepairCondition,
  fetchTenantSuppliers,
  fetchTenantOwners,
  fetchTenantCrewMembers,
  removeUndefinedFields,
} from '@/services/repair-service';
import * as firestore from 'firebase/firestore';
import * as rtdb from 'firebase/database';
import * as storage from 'firebase/storage';

// Global mock references
const mockFirestore = firestore as jest.Mocked<any>;
const mockRtdb = rtdb as jest.Mocked<any>;
const mockStorage = storage as jest.Mocked<any>;

// Mock global fetch for photo upload
const mockBlob = { size: 1024, type: 'image/jpeg' };
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    blob: () => Promise.resolve(mockBlob),
  })
) as jest.Mock;

describe('repair-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. DEFENSIVE DOCUMENT MAPPER SUITE (SVC-MAP)
  // ==========================================================================
  describe('mapFirestoreRepairTicketDoc & mapFirestoreRepairDoc', () => {
    it('SVC-MAP-01: Maps complete Firestore document with Timestamps (Tier 1)', () => {
      const rawDoc = {
        id: 't-100',
        data: () => ({
          id: 't-100',
          tenantId: 'tenant-alpha',
          repairNumber: 1042,
          rentmanId: 'rm-99',
          equipment: {
            id: 'eq-1',
            name: 'Robe BMFL',
            serialNumber: 'SN-001',
            barcode: 'BAR-001',
            category: 'Lighting',
            quantity: 2,
          },
          repairType: 'Internal',
          priority: 'High',
          status: 'Under Repair',
          condition: 'Out of Service',
          billingStatus: 'Internal',
          assignee: { id: 'u-1', name: 'Alex Tech' },
          assigneeId: 'u-1',
          requestedBy: 'Lead Tech',
          repairPeriodStart: { _seconds: 1756118400, _nanoseconds: 0 },
          repairPeriodEnd: { _seconds: 1756204800, _nanoseconds: 0 },
          actions: [
            {
              id: 'act-1',
              user: { id: 'u-1', name: 'Alex Tech' },
              action: 'Initial diagnostic',
              timestamp: { _seconds: 1756118500, _nanoseconds: 0 },
              tenantId: 'tenant-alpha',
            },
          ],
          notes: [
            {
              id: 'n-1',
              content: 'Fan motor faulty',
              user: { name: 'Alex Tech' },
              timestamp: { _seconds: 1756118600, _nanoseconds: 0 },
            },
          ],
          attachments: [
            {
              id: 'att-1',
              type: 'Photo',
              url: 'https://storage.kuro.app/photo.jpg',
              uploadedAt: { _seconds: 1756118700, _nanoseconds: 0 },
            },
          ],
          partsUsed: [
            {
              id: 'p-1',
              name: 'Fan 12V',
              quantity: 2,
              cost: 15.0,
            },
          ],
          createdAt: { _seconds: 1756118400, _nanoseconds: 0 },
          updatedAt: { _seconds: 1756118800, _nanoseconds: 0 },
        }),
      };

      const ticket = mapFirestoreRepairTicketDoc(rawDoc);
      expect(ticket.id).toBe('t-100');
      expect(ticket.tenantId).toBe('tenant-alpha');
      expect(ticket.repairNumber).toBe(1042);
      expect(ticket.equipment.name).toBe('Robe BMFL');
      expect(ticket.equipment.quantity).toBe(2);
      expect(ticket.status).toBe('Under Repair');
      expect(ticket.condition).toBe('Out of Service');
      expect(ticket.actions).toHaveLength(1);
      expect(ticket.actions?.[0].action).toBe('Initial diagnostic');
      expect(ticket.notes).toHaveLength(1);
      expect(ticket.notes?.[0].content).toBe('Fan motor faulty');
      expect(ticket.attachments).toHaveLength(1);
      expect(ticket.partsUsed).toHaveLength(1);
      expect(ticket.createdAt).toBe(new Date(1756118400 * 1000).toISOString());
    });

    it('SVC-MAP-02: mapFirestoreRepairDoc alias produces identical mapped result (Tier 1)', () => {
      const raw = { id: 't-2', name: 'Test', status: 'Operational' };
      const res1 = mapFirestoreRepairTicketDoc(raw);
      const res2 = mapFirestoreRepairDoc(raw);
      expect(res1).toEqual(res2);
    });

    it('SVC-MAP-03: Defensive defaults for missing or corrupted doc fields (Tier 2)', () => {
      const emptyDoc = { id: 'empty-1' };
      const ticket = mapFirestoreRepairTicketDoc(emptyDoc);

      expect(ticket.id).toBe('empty-1');
      expect(ticket.equipment.name).toBe('Unnamed Equipment');
      expect(ticket.status).toBe('Reported');
      expect(ticket.condition).toBe('Out of Service');
      expect(ticket.actions).toEqual([]);
      expect(ticket.notes).toEqual([]);
      expect(ticket.attachments).toEqual([]);
      expect(ticket.partsUsed).toEqual([]);
      expect(ticket.costs).toBe(0);
    });

    it('SVC-MAP-04: Resolves condition from status when condition is missing (Tier 2)', () => {
      const opDoc = { id: 'op-1', status: 'Operational' };
      expect(mapFirestoreRepairTicketDoc(opDoc).condition).toBe('Available to Use');

      const compDoc = { id: 'comp-1', status: 'Completed' };
      expect(mapFirestoreRepairTicketDoc(compDoc).condition).toBe('Available to Use');

      const repDoc = { id: 'rep-1', status: 'Under Repair' };
      expect(mapFirestoreRepairTicketDoc(repDoc).condition).toBe('Out of Service');
    });

    it('SVC-MAP-05: Handles corrupt non-array fields safely without crashing (Tier 2)', () => {
      const corruptDoc = {
        id: 'corrupt-1',
        actions: 'invalid_string' as any,
        notes: null as any,
        attachments: 12345 as any,
        partsUsed: {} as any,
      };

      const ticket = mapFirestoreRepairTicketDoc(corruptDoc);
      expect(ticket.actions).toEqual([]);
      expect(ticket.notes).toEqual([]);
      expect(ticket.attachments).toEqual([]);
      expect(ticket.partsUsed).toEqual([]);
    });
  });

  // ==========================================================================
  // 2. REAL-TIME TENANT SUBSCRIPTION SUITE (SVC-SUB)
  // ==========================================================================
  describe('subscribeTenantRepairTickets', () => {
    it('SVC-SUB-01: Subscribes with tenant filter and receives tickets (Tier 1)', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_query: any, callback: any) => {
        snapshotCallback = callback;
        return jest.fn(); // mock unsubscribe
      });

      const onUpdate = jest.fn();
      const unsub = subscribeTenantRepairTickets('tenant-alpha', onUpdate);

      expect(mockFirestore.collection).toHaveBeenCalledWith(mockFirestore.getFirestore(), 'tickets');
      expect(mockFirestore.where).toHaveBeenCalledWith('tenantId', '==', 'tenant-alpha');

      // Trigger snapshot event
      const mockDocs = [
        {
          id: 't-1',
          data: () => ({
            id: 't-1',
            tenantId: 'tenant-alpha',
            repairNumber: 101,
            equipment: { name: 'Item 1' },
            createdAt: '2026-08-25T10:00:00Z',
          }),
        },
      ];
      snapshotCallback(mockDocs);

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate.mock.calls[0][0]).toHaveLength(1);
      expect(onUpdate.mock.calls[0][0][0].id).toBe('t-1');

      unsub();
    });

    it('SVC-SUB-02: Unsubscribe unregisters Firestore snapshot listener (Tier 1)', () => {
      const mockUnsubSpy = jest.fn();
      mockFirestore.onSnapshot.mockReturnValue(mockUnsubSpy);

      const unsub = subscribeTenantRepairTickets('tenant-alpha', jest.fn());
      unsub();
      expect(mockUnsubSpy).toHaveBeenCalledTimes(1);
    });

    it('SVC-SUB-03: Empty tenantId returns empty array and noop unsub without registering listener (Tier 2)', () => {
      const onUpdate = jest.fn();
      const unsub = subscribeTenantRepairTickets('', onUpdate);

      expect(onUpdate).toHaveBeenCalledWith([]);
      expect(mockFirestore.onSnapshot).not.toHaveBeenCalled();
      expect(() => unsub()).not.toThrow();
    });

    it('SVC-SUB-04: Cross-tenant data leakage prevention in live stream (Tier 2)', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_q: any, cb: any) => {
        snapshotCallback = cb;
        return jest.fn();
      });

      const onUpdate = jest.fn();
      subscribeTenantRepairTickets('tenant-alpha', onUpdate);

      // Emulate dirty snapshot containing another tenant's doc
      const mockDocs = [
        {
          id: 't-valid',
          data: () => ({ id: 't-valid', tenantId: 'tenant-alpha', equipment: { name: 'Valid' } }),
        },
        {
          id: 't-leak',
          data: () => ({ id: 't-leak', tenantId: 'tenant-beta', equipment: { name: 'Leak' } }),
        },
      ];
      snapshotCallback(mockDocs);

      const emitted = onUpdate.mock.calls[0][0];
      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe('t-valid');
    });

    it('SVC-SUB-05: Filters out archived tickets in live stream (Tier 2)', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_q: any, cb: any) => {
        snapshotCallback = cb;
        return jest.fn();
      });

      const onUpdate = jest.fn();
      subscribeTenantRepairTickets('tenant-alpha', onUpdate);

      const mockDocs = [
        {
          id: 't-active',
          data: () => ({ id: 't-active', tenantId: 'tenant-alpha', archived: false }),
        },
        {
          id: 't-archived',
          data: () => ({ id: 't-archived', tenantId: 'tenant-alpha', archived: true }),
        },
      ];
      snapshotCallback(mockDocs);

      const emitted = onUpdate.mock.calls[0][0];
      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe('t-active');
    });

    it('SVC-SUB-06: Error callback handles stream failures (Tier 2)', () => {
      let errorCallback: (err: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_q: any, _success: any, errCb: any) => {
        errorCallback = errCb;
        return jest.fn();
      });

      const onError = jest.fn();
      subscribeTenantRepairTickets('tenant-alpha', jest.fn(), onError);

      const error = new Error('Permission denied');
      errorCallback(error);

      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  // ==========================================================================
  // 3. SINGLE TICKET SUBSCRIPTION SUITE (SVC-SGT)
  // ==========================================================================
  describe('subscribeSingleRepairTicket & subscribeRepairTicket', () => {
    it('SVC-SGT-01: Subscribes to single ticket by ID and receives ticket (Tier 1)', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_ref: any, cb: any) => {
        snapshotCallback = cb;
        return jest.fn();
      });

      const onUpdate = jest.fn();
      subscribeSingleRepairTicket('t-100', 'tenant-alpha', onUpdate);

      const mockSnap = {
        exists: () => true,
        id: 't-100',
        data: () => ({
          id: 't-100',
          tenantId: 'tenant-alpha',
          equipment: { name: 'GrandMA3' },
          status: 'Under Repair',
        }),
      };
      snapshotCallback(mockSnap);

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 't-100', status: 'Under Repair' })
      );
    });

    it('SVC-SGT-02: subscribeRepairTicket alias works identically (Tier 1)', () => {
      expect(subscribeRepairTicket).toBe(subscribeSingleRepairTicket);
    });

    it('SVC-SGT-03: Cross-tenant single ticket access emits null (Tier 2)', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_ref: any, cb: any) => {
        snapshotCallback = cb;
        return jest.fn();
      });

      const onUpdate = jest.fn();
      subscribeSingleRepairTicket('t-100', 'tenant-alpha', onUpdate);

      const mockSnap = {
        exists: () => true,
        id: 't-100',
        data: () => ({
          id: 't-100',
          tenantId: 'tenant-other-beta', // Mismatched tenant
        }),
      };
      snapshotCallback(mockSnap);

      expect(onUpdate).toHaveBeenCalledWith(null);
    });

    it('SVC-SGT-04: Non-existent ticket emits null (Tier 2)', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_ref: any, cb: any) => {
        snapshotCallback = cb;
        return jest.fn();
      });

      const onUpdate = jest.fn();
      subscribeSingleRepairTicket('non-existent', 'tenant-alpha', onUpdate);

      const mockSnap = {
        exists: () => false,
      };
      snapshotCallback(mockSnap);

      expect(onUpdate).toHaveBeenCalledWith(null);
    });

    it('SVC-SGT-05: Empty ticketId or tenantId emits null immediately (Tier 2)', () => {
      const onUpdate = jest.fn();
      subscribeSingleRepairTicket('', 'tenant-alpha', onUpdate);
      expect(onUpdate).toHaveBeenCalledWith(null);
      expect(mockFirestore.onSnapshot).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 4. ONE-OFF FETCH OPERATIONS (SVC-FCH)
  // ==========================================================================
  describe('fetchTenantRepairTickets & getRepairTicket', () => {
    it('SVC-FCH-01: fetchTenantRepairTickets fetches and maps active tickets (Tier 1)', () => {
      mockFirestore.getDocs.mockResolvedValue([
        {
          id: 't-1',
          data: () => ({
            id: 't-1',
            tenantId: 'tenant-alpha',
            repairNumber: 1001,
            equipment: { name: 'Item 1' },
            createdAt: '2026-08-25T10:00:00Z',
          }),
        },
      ]);

      return fetchTenantRepairTickets('tenant-alpha').then((tickets) => {
        expect(tickets).toHaveLength(1);
        expect(tickets[0].id).toBe('t-1');
      });
    });

    it('SVC-FCH-02: getRepairTicket fetches single ticket and respects tenantId (Tier 1)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        id: 't-1',
        data: () => ({
          id: 't-1',
          tenantId: 'tenant-alpha',
          equipment: { name: 'Console' },
        }),
      });

      const ticket = await getRepairTicket('t-1', 'tenant-alpha');
      expect(ticket).not.toBeNull();
      expect(ticket?.id).toBe('t-1');

      const unauthorized = await getRepairTicket('t-1', 'tenant-wrong');
      expect(unauthorized).toBeNull();
    });

    it('SVC-FCH-03: getRepairTicket returns null for non-existent ticket or empty ID (Tier 2)', async () => {
      expect(await getRepairTicket('')).toBeNull();

      mockFirestore.getDoc.mockResolvedValue({
        exists: () => false,
      });
      expect(await getRepairTicket('non-existent')).toBeNull();
    });
  });

  // ==========================================================================
  // 5. TICKET CREATION & SEQUENTIAL NUMBERS (SVC-CRT)
  // ==========================================================================
  describe('createRepairTicket & generateRepairNumber', () => {
    it('SVC-CRT-01: generateRepairNumber increments highest number or defaults to 1001 (Tier 1)', async () => {
      // With existing tickets
      mockFirestore.getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ repairNumber: 1042 }) }],
      });
      const num1 = await generateRepairNumber('tenant-alpha');
      expect(num1).toBe(1043);

      // Without existing tickets
      mockFirestore.getDocs.mockResolvedValueOnce({
        empty: true,
        docs: [],
      }).mockResolvedValueOnce({
        forEach: jest.fn(),
      });
      const num2 = await generateRepairNumber('tenant-alpha');
      expect(num2).toBe(1001);
    });

    it('SVC-CRT-02: createRepairTicket writes document, initial action log, and triggers sync (Tier 1)', async () => {
      mockFirestore.doc.mockReturnValue({ id: 'generated-ticket-id' });
      mockFirestore.getDocs.mockResolvedValue({
        empty: false,
        docs: [{ data: () => ({ repairNumber: 1050 }) }],
      });
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ tenantId: 'tenant-alpha', serialNumbers: [{ serial: 'SN-001', status: 'Available' }] }),
      });

      const ticketId = await createRepairTicket(
        'tenant-alpha',
        {
          equipment: {
            id: 'eq-100',
            name: 'Robe BMFL',
            serialNumber: 'SN-001',
            quantity: 1,
          },
          status: 'Under Repair',
          priority: 'High',
          initialNote: 'Front lens cracked upon arrival',
        },
        { id: 'user-tech-1', name: 'Alex Technician', email: 'alex@kuro.app' }
      );

      expect(ticketId).toBe('generated-ticket-id');
      expect(mockFirestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'generated-ticket-id',
          tenantId: 'tenant-alpha',
          repairNumber: 1051,
          status: 'Under Repair',
          condition: 'Out of Service',
          notes: expect.arrayContaining([
            expect.objectContaining({ content: 'Front lens cracked upon arrival' }),
          ]),
          actions: expect.arrayContaining([
            expect.objectContaining({
              action: expect.stringContaining('Created repair ticket #1051 for Robe BMFL'),
            }),
          ]),
        })
      );

      // Verify RTDB availability sync
      expect(mockRtdb.set).toHaveBeenCalledWith(
        expect.anything(),
        { i: { 'eq-100': { q: 1 } } }
      );
    });

    it('SVC-CRT-03: createRepairTicket rejects missing tenantId or equipment name (Tier 2)', async () => {
      await expect(
        createRepairTicket('', { equipment: { name: 'Item' } })
      ).rejects.toThrow('Tenant ID is required to create a repair ticket');

      await expect(
        createRepairTicket('tenant-1', { equipment: { name: '' } })
      ).rejects.toThrow('Equipment name is required');
    });

    it('SVC-CRT-04: removeUndefinedFields recursively removes undefined values and preserves FieldValues and Dates', () => {
      const mockFieldValue = { _methodName: 'serverTimestamp' };
      const now = new Date();
      const input = {
        name: 'Projector',
        serialNumber: undefined,
        deep: {
          valid: 123,
          invalid: undefined,
          array: [1, undefined, { a: 'ok', b: undefined }],
        },
        ts: mockFieldValue,
        date: now,
      };

      const result = removeUndefinedFields(input);
      expect(result.serialNumber).toBeUndefined();
      expect('serialNumber' in result).toBe(false);
      expect(result.deep.valid).toBe(123);
      expect('invalid' in result.deep).toBe(false);
      expect(result.deep.array).toEqual([1, { a: 'ok' }]);
      expect(result.ts).toBe(mockFieldValue);
      expect(result.date).toBe(now);
    });

    it('SVC-CRT-05: createRepairTicket strips undefined fields from payload and nested objects preventing Firestore setDoc errors', async () => {
      mockFirestore.doc.mockReturnValue({ id: 'ticket-clean-test' });
      mockFirestore.getDocs.mockResolvedValue({
        empty: false,
        docs: [{ data: () => ({ repairNumber: 2000 }) }],
      });
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ tenantId: 'tenant-alpha' }),
      });

      await createRepairTicket(
        'tenant-alpha',
        {
          equipment: {
            id: 'eq-200',
            name: 'LED Panel',
            serialNumber: null,
            barcode: undefined as any,
          },
          status: 'Reported',
          priority: 'Medium',
          assignee: {
            id: 'u-123',
            name: 'Sam Tech',
            email: undefined as any,
          },
          supplierId: undefined as any,
          repairPeriodStart: undefined as any,
          repairPeriodEnd: undefined as any,
          initialNote: 'Faulty power supply',
        },
        {
          id: 'user-tech-2',
          name: 'Sam Tech',
          email: undefined,
          avatarUrl: undefined,
        }
      );

      expect(mockFirestore.setDoc).toHaveBeenCalled();

      // Deeply verify no undefined values exist anywhere in ANY setDoc call (entity doc or ticket doc)
      const checkNoUndefined = (obj: any, path: string = ''): void => {
        if (!obj || typeof obj !== 'object') return;
        if (obj._methodName || obj.constructor?.name?.includes('FieldValue') || obj instanceof Date) return;
        for (const [k, v] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${k}` : k;
          expect(v).not.toBeUndefined();
          if (typeof v === 'object' && v !== null) {
            checkNoUndefined(v, currentPath);
          }
        }
      };

      for (const call of mockFirestore.setDoc.mock.calls) {
        checkNoUndefined(call[1]);
      }

      const ticketPayload = mockFirestore.setDoc.mock.calls[mockFirestore.setDoc.mock.calls.length - 1][1];
      expect(ticketPayload.repairNumber).toBe(2001);
      expect(ticketPayload.notes[0].user.name).toBe('Sam Tech');
      expect(ticketPayload.notes[0].user.email).toBeUndefined();
      expect('email' in ticketPayload.notes[0].user).toBe(false);
      expect('avatarUrl' in ticketPayload.notes[0].user).toBe(false);
    });

    it('SVC-CRT-06: generateRepairNumber seamlessly falls back to unindexed ticket scan when composite index is missing', async () => {
      const indexError = new Error(
        'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/kurorms/firestore/indexes?create_composite=...'
      );
      (indexError as any).code = 'failed-precondition';

      // First query (indexed) throws missing index error
      // Second query (unindexed fallback) returns tickets with maximum repairNumber 1088
      mockFirestore.getDocs
        .mockRejectedValueOnce(indexError)
        .mockResolvedValueOnce({
          forEach: (cb: (doc: any) => void) => {
            cb({ data: () => ({ repairNumber: 1085 }) });
            cb({ data: () => ({ repairNumber: 1088 }) });
            cb({ data: () => ({ repairNumber: 1050 }) });
          },
        });

      const nextNum = await generateRepairNumber('tenant-alpha');
      expect(nextNum).toBe(1089);
    });
  });

  // ==========================================================================
  // 6. STATUS UPDATES & ACTION LOGGING (SVC-UPD)
  // ==========================================================================
  describe('updateRepairTicketStatus', () => {
    it('SVC-UPD-01: updateRepairTicketStatus updates status and appends action log (Tier 1)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          status: 'Under Repair',
          equipment: { id: 'eq-1', serialNumber: 'SN-001', quantity: 1 },
        }),
      });

      const res = await updateRepairTicketStatus(
        'ticket-1',
        'Pending',
        { id: 'u-1', name: 'Alex Tech' },
        'tenant-alpha',
        'Ordered stepper motor'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'Pending',
          actions: expect.anything(),
        })
      );
    });

    it('SVC-UPD-02: Updating status preserves condition independently (Tier 1)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          status: 'Under Repair',
          condition: 'Out of Service',
          equipment: { id: 'eq-1', serialNumber: 'SN-001', quantity: 1 },
        }),
      });

      const res = await updateRepairTicketStatus(
        'ticket-1',
        'Completed',
        { id: 'u-1', name: 'Alex Tech' },
        'tenant-alpha',
        'Replaced motor and calibrated'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'Completed',
        })
      );

      // Verify RTDB ledger maintains lock for Out of Service condition
      expect(mockRtdb.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          i: expect.objectContaining({ 'eq-1': { q: 1 } }),
        })
      );
    });

    it('SVC-UPD-03: Rejects invalid status transition (Tier 2)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          status: 'Under Repair',
        }),
      });

      const res = await updateRepairTicketStatus(
        'ticket-1',
        'InvalidStatus' as any,
        { name: 'Tech' },
        'tenant-alpha'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid status transition');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-UPD-04: Rejects unauthorized cross-tenant status update (Tier 2)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-beta', // Different tenant
          status: 'Under Repair',
        }),
      });

      const res = await updateRepairTicketStatus(
        'ticket-1',
        'Completed',
        { name: 'Tech' },
        'tenant-alpha'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Repair ticket not found or unauthorized');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-UPD-05: Safely handles null or undefined snapshot without throwing TypeError', async () => {
      mockFirestore.getDoc.mockResolvedValue(undefined);

      const res = await updateRepairTicketStatus(
        'ticket-nonexistent',
        'Completed',
        { name: 'Tech' },
        'tenant-alpha'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Repair ticket not found or unauthorized');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-UPD-06: Allows free direct transition from Reported directly to Cancel or Completed', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          status: 'Reported',
          equipment: { id: 'eq-1', quantity: 1 },
        }),
      });

      const resCancel = await updateRepairTicketStatus(
        'ticket-1',
        'Cancel',
        { name: 'Tech' },
        'tenant-alpha'
      );
      expect(resCancel.success).toBe(true);

      const resCompleted = await updateRepairTicketStatus(
        'ticket-1',
        'Completed',
        { name: 'Tech' },
        'tenant-alpha'
      );
      expect(resCompleted.success).toBe(true);
    });

    it('SVC-UPD-07: Normalizes lowercase status input to canonical casing', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          status: 'Reported',
          equipment: { id: 'eq-1', quantity: 1 },
        }),
      });

      const res = await updateRepairTicketStatus(
        'ticket-1',
        'under repair' as any,
        { name: 'Tech' },
        'tenant-alpha'
      );
      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'Under Repair',
        })
      );
    });
  });

  // ==========================================================================
  // 7. TECHNICIAN ACTIONS, NOTES & ATTACHMENTS (SVC-ACT)
  // ==========================================================================
  describe('appendRepairAction, appendRepairNote & attachments', () => {
    it('SVC-ACT-01: appendRepairAction appends audit action log (Tier 1)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ tenantId: 'tenant-alpha' }),
      });

      const entry = await appendRepairAction(
        't-1',
        'Cleaned optical sensor',
        { id: 'u-1', name: 'Alex' },
        'tenant-alpha'
      );

      expect(entry.action).toBe('Cleaned optical sensor');
      expect(entry.user.name).toBe('Alex');
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actions: expect.anything(),
        })
      );
    });

    it('SVC-ACT-02: appendRepairNote appends note and creates action log entry (Tier 1)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ tenantId: 'tenant-alpha' }),
      });

      const note = await appendRepairNote(
        't-1',
        'Inspected power supply board capacitor',
        { id: 'u-1', name: 'Alex' },
        'tenant-alpha'
      );

      expect(note.content).toBe('Inspected power supply board capacitor');
      expect(note.user?.name).toBe('Alex');
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notes: expect.anything(),
          actions: expect.anything(),
        })
      );
    });

    it('SVC-ACT-03: addRepairAttachment appends attachment and logs action (Tier 1)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ tenantId: 'tenant-alpha' }),
      });

      const res = await addRepairAttachment(
        't-1',
        {
          type: 'Photo',
          url: 'https://storage.kuro.app/photo.jpg',
          fileName: 'damage-front.jpg',
        },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(res.attachmentId).toMatch(/^att_/);
      expect(mockFirestore.updateDoc).toHaveBeenCalled();
    });

    it('SVC-ACT-04: Rejects empty action or note content (Tier 2)', async () => {
      await expect(
        appendRepairAction('t-1', '   ', { name: 'Tech' }, 'tenant-alpha')
      ).rejects.toThrow('Action text cannot be empty');

      await expect(
        appendRepairNote('t-1', '', { name: 'Tech' }, 'tenant-alpha')
      ).rejects.toThrow('Note content cannot be empty');
    });
  });

  // ==========================================================================
  // 8. STORAGE PHOTO UPLOAD (SVC-ATT)
  // ==========================================================================
  describe('uploadRepairDamagePhoto', () => {
    it('SVC-ATT-01: uploadRepairDamagePhoto uploads blob and returns URL & attachment (Tier 1)', async () => {
      mockStorage.ref.mockReturnValue({ type: 'storage_ref' });
      mockStorage.uploadBytes.mockResolvedValue({ ref: { fullPath: 'path' } });
      mockStorage.getDownloadURL.mockResolvedValue('https://firebasestorage.googleapis.com/download/damage.jpg');

      const result = await uploadRepairDamagePhoto(
        'tenant-alpha',
        't-100',
        'file:///local/path/evidence.jpg'
      );

      expect(result.url).toBe('https://firebasestorage.googleapis.com/download/damage.jpg');
      expect(result.attachment.type).toBe('Photo');
      expect(result.attachment.url).toBe('https://firebasestorage.googleapis.com/download/damage.jpg');
      expect(mockStorage.ref).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('tenants/tenant-alpha/entity_documents/repair-t-100/')
      );
    });

    it('SVC-ATT-02: uploadRepairDamagePhoto rejects missing parameters (Tier 2)', async () => {
      await expect(uploadRepairDamagePhoto('', 't-1', 'file:///path.jpg')).rejects.toThrow();
      await expect(uploadRepairDamagePhoto('tenant-1', '', 'file:///path.jpg')).rejects.toThrow();
      await expect(uploadRepairDamagePhoto('tenant-1', 't-1', '')).rejects.toThrow();
    });
  });

  // ==========================================================================
  // 9. RTDB & EQUIPMENT SYNC (SVC-SYN)
  // ==========================================================================
  describe('syncRepairToRtdbLedger & updateEquipmentRepairCondition', () => {
    it('SVC-SYN-01: syncRepairToRtdbLedger sets reservation lock when Out of Service (Tier 1)', async () => {
      await syncRepairToRtdbLedger('tenant-alpha', 't-1', 'eq-1', 'Out of Service', 2);
      expect(mockRtdb.set).toHaveBeenCalledWith(
        expect.anything(),
        { i: { 'eq-1': { q: 2 } } }
      );
    });

    it('SVC-SYN-02: syncRepairToRtdbLedger removes lock when Available to Use (Tier 1)', async () => {
      await syncRepairToRtdbLedger('tenant-alpha', 't-1', 'eq-1', 'Available to Use', 1);
      expect(mockRtdb.set).toHaveBeenCalledWith(expect.anything(), null);
    });

    it('SVC-SYN-03: updateEquipmentRepairCondition updates serial number status (Tier 1)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          serialNumbers: [
            { serial: 'SN-001', status: 'Available' },
            { serial: 'SN-002', status: 'Available' },
          ],
        }),
      });

      await updateEquipmentRepairCondition(
        'eq-1',
        'tenant-alpha',
        'Out of Service',
        'Under Repair',
        'SN-001'
      );

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          serialNumbers: [
            { serial: 'SN-001', status: 'In Repair' },
            { serial: 'SN-002', status: 'Available' },
          ],
        })
      );
    });
  });

  // ==========================================================================
  // 10. DIRECT FIELD UPDATES (SVC-FLD)
  // ==========================================================================
  describe('updateRepairTicketFields', () => {
    it('SVC-FLD-01: updates equipment name and serial number with audit action log', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          equipment: { id: 'eq-1', name: 'Old Moving Light', serialNumber: 'SN-OLD-01' },
          status: 'Under Repair',
          condition: 'Out of Service',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        {
          equipmentName: 'New Robe BMFL Profile',
          serialNumber: 'SN-NEW-99',
        },
        { id: 'u-1', name: 'Alex Tech' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          equipment: expect.objectContaining({
            id: 'eq-1',
            name: 'New Robe BMFL Profile',
            serialNumber: 'SN-NEW-99',
          }),
          actions: expect.anything(),
        })
      );
    });

    it('SVC-FLD-02: updates priority, condition, internal reference, and dates', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          equipment: { id: 'eq-1', name: 'Console', quantity: 1 },
          priority: 'Low',
          condition: 'Out of Service',
          internalReference: 'REF-OLD',
          status: 'Under Repair',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        {
          priority: 'Critical',
          condition: 'Available to Use',
          internalReference: 'REF-NEW-2026',
          repairPeriodStart: '2026-08-25T00:00:00.000Z',
          repairPeriodEnd: '2026-08-28T00:00:00.000Z',
        },
        { id: 'u-1', name: 'Alex Tech' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          priority: 'Critical',
          condition: 'Available to Use',
          internalReference: 'REF-NEW-2026',
          repairPeriodStart: '2026-08-25T00:00:00.000Z',
          repairPeriodEnd: '2026-08-28T00:00:00.000Z',
        })
      );

      // Verify RTDB ledger release on condition Available to Use
      expect(mockRtdb.set).toHaveBeenCalledWith(expect.anything(), null);
    });

    it('SVC-FLD-03: rejects unauthorized or non-existent ticket field updates', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => false,
      });

      const res = await updateRepairTicketFields(
        'ticket-missing',
        { priority: 'High' },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Repair ticket not found or unauthorized');

      const resNoTenant = await updateRepairTicketFields(
        '',
        { priority: 'High' },
        { name: 'Alex' },
        ''
      );
      expect(resNoTenant.success).toBe(false);
    });

    it('SVC-FLD-04: rejects empty or whitespace-only equipment names', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          equipment: { id: 'eq-1', name: 'Robe BMFL' },
        }),
      });

      const resEmpty = await updateRepairTicketFields(
        'ticket-101',
        { equipmentName: '   ' },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(resEmpty.success).toBe(false);
      expect(resEmpty.error).toBe('Equipment name cannot be empty');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-FLD-05: rejects invalid repair period where end date is before start date', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          equipment: { id: 'eq-1', name: 'Robe BMFL' },
          repairPeriodStart: '2026-08-25T00:00:00.000Z',
          repairPeriodEnd: '2026-08-28T00:00:00.000Z',
        }),
      });

      const resInvalid = await updateRepairTicketFields(
        'ticket-101',
        {
          repairPeriodStart: '2026-08-30T00:00:00.000Z',
          repairPeriodEnd: '2026-08-20T00:00:00.000Z',
        },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(resInvalid.success).toBe(false);
      expect(resInvalid.error).toBe('Repair period end date must be on or after start date');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-FLD-06: rejects ticket belonging to another tenant', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-other',
          equipment: { id: 'eq-1', name: 'Robe BMFL' },
        }),
      });

      const resCrossTenant = await updateRepairTicketFields(
        'ticket-cross',
        { priority: 'Critical' },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(resCrossTenant.success).toBe(false);
      expect(resCrossTenant.error).toBe('Repair ticket not found or unauthorized');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-FLD-07: avoids false audit actions when fields are identical or normalized nulls', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          equipment: { id: 'eq-1', name: 'Robe BMFL', serialNumber: null },
          internalReference: null,
          priority: 'High',
          repairPeriodStart: '2026-08-25T00:00:00.000Z',
          repairPeriodEnd: '2026-08-28T00:00:00.000Z',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        {
          equipmentName: 'Robe BMFL',
          serialNumber: null,
          internalReference: '',
          priority: 'High',
          repairPeriodStart: '2026-08-25T00:00:00.000Z',
          repairPeriodEnd: '2026-08-28T00:00:00.000Z',
        },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({
          actions: expect.anything(),
        })
      );
    });

    it('SVC-FLD-08: clears serial number to null and passes null to equipment condition sync (no resurrection)', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          equipment: { id: 'eq-1', name: 'Robe BMFL', serialNumber: 'SN-ROBE-OLD' },
          status: 'Under Repair',
          condition: 'Out of Service',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        { serialNumber: null },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          equipment: expect.objectContaining({ serialNumber: null }),
        })
      );
    });

    it('SVC-FLD-09: successfully updates priority to None', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          priority: 'High',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        { priority: 'None' },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          priority: 'None',
        })
      );
    });

    it('SVC-FLD-10: preserves existing equipment properties when updating partial equipment object', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          equipment: {
            id: 'eq-1',
            name: 'Robe BMFL',
            serialNumber: 'SN-001',
            knownLocation: 'Rack A',
            barcode: 'BAR-001',
          },
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        {
          equipment: {
            knownLocation: 'Rack B / Floor 2',
          },
        },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          equipment: {
            id: 'eq-1',
            name: 'Robe BMFL',
            serialNumber: 'SN-001',
            knownLocation: 'Rack B / Floor 2',
            barcode: 'BAR-001',
          },
        })
      );
    });

    it('SVC-FLD-11: rejects invalid priority level values', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          priority: 'Medium',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        { priority: 'UltraUrgent' as any },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid priority level');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-FLD-12: rejects invalid condition values', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          condition: 'Out of Service',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        { condition: 'Destroyed' as any },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid condition');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-FLD-13: rejects invalid date formats for repairPeriodStart and repairPeriodEnd', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
        }),
      });

      const resInvalidStart = await updateRepairTicketFields(
        'ticket-101',
        { repairPeriodStart: 'invalid-start-date' },
        { name: 'Alex' },
        'tenant-alpha'
      );
      expect(resInvalidStart.success).toBe(false);
      expect(resInvalidStart.error).toBe('Invalid repair period start date');

      const resInvalidEnd = await updateRepairTicketFields(
        'ticket-101',
        { repairPeriodEnd: 'invalid-end-date' },
        { name: 'Alex' },
        'tenant-alpha'
      );
      expect(resInvalidEnd.success).toBe(false);
      expect(resInvalidEnd.error).toBe('Invalid repair period end date');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-FLD-14: status updates independently without mutating condition when not specified', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          status: 'Under Repair',
          condition: 'Out of Service',
          equipment: { id: 'eq-1', quantity: 1 },
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        { status: 'Completed' },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'Completed',
        })
      );
    });

    it('SVC-FLD-15: rejects illegal status transitions in updateRepairTicketFields', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          status: 'Completed',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        { status: 'InvalidStatus' as any },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid status transition');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-FLD-16: safely coerces numeric serial number and internal reference without throwing', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          equipment: { id: 'eq-1', serialNumber: '100' },
          internalReference: '200',
        }),
      });

      const res = await updateRepairTicketFields(
        'ticket-101',
        {
          serialNumber: 9999 as any,
          internalReference: 8888 as any,
        },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(true);
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          equipment: expect.objectContaining({ serialNumber: '9999' }),
          internalReference: '8888',
        })
      );
    });

    it('SVC-FLD-17: safely handles null or undefined snapshot without throwing TypeError', async () => {
      mockFirestore.getDoc.mockResolvedValue(null);

      const res = await updateRepairTicketFields(
        'ticket-nonexistent',
        { equipmentName: 'New Name' },
        { name: 'Alex' },
        'tenant-alpha'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Repair ticket not found or unauthorized');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('SVC-FLD-18: allows direct status transition from Reported to Cancel or Completed in updateRepairTicketFields', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          status: 'Reported',
          equipment: { id: 'eq-1', quantity: 1 },
        }),
      });

      const resCancel = await updateRepairTicketFields(
        'ticket-101',
        { status: 'Cancel' },
        { name: 'Alex' },
        'tenant-alpha'
      );
      expect(resCancel.success).toBe(true);

      const resCompleted = await updateRepairTicketFields(
        'ticket-101',
        { status: 'Completed' },
        { name: 'Alex' },
        'tenant-alpha'
      );
      expect(resCompleted.success).toBe(true);
    });
  });

  // ==========================================================================
  // 11. TENANT SUPPLIERS & CREW MEMBERS FETCHERS (SVC-PICK)
  // ==========================================================================
  describe('fetchTenantSuppliers & fetchTenantCrewMembers', () => {
    it('SVC-PICK-01: fetchTenantSuppliers retrieves and filters suppliers from contacts collection', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-1',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Robe UK Supplies',
            types: ['Supplier'],
            email: 'supplies@robe.co.uk',
            phone: '+44 1234 567890',
          }),
        },
        {
          id: 'c-2',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Clay Paky Italy',
            isSupplier: true,
            email: 'info@claypaky.it',
          }),
        },
        {
          id: 'c-3',
          data: () => ({
            tenantId: 'tenant-beta', // Foreign tenant
            name: 'Foreign Supplier',
            types: ['Supplier'],
          }),
        },
        {
          id: 'c-4',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'ACME Client Corp',
            types: ['Client'], // Not a supplier
          }),
        },
      ]);

      const suppliers = await fetchTenantSuppliers('tenant-alpha');
      expect(suppliers).toHaveLength(2);
      expect(suppliers[0].name).toBe('Clay Paky Italy');
      expect(suppliers[1].name).toBe('Robe UK Supplies');
    });

    it('SVC-PICK-02: fetchTenantSuppliers returns empty array for empty tenantId or errors', async () => {
      expect(await fetchTenantSuppliers('')).toEqual([]);

      mockFirestore.getDocs.mockRejectedValueOnce(new Error('Firestore error'));
      expect(await fetchTenantSuppliers('tenant-alpha')).toEqual([]);
    });

    it('SVC-PICK-03: fetchTenantCrewMembers retrieves and maps active users belonging to tenant', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'u-1',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'David Lighting Tech',
            email: 'david@kuro.test',
            role: 'Technician',
            position: 'Senior Lighting Lead',
            disabled: false,
          }),
        },
        {
          id: 'u-2',
          data: () => ({
            tenantId: 'tenant-alpha',
            firstName: 'Alex',
            lastName: 'Technician',
            email: 'alex@kuro.test',
            role: 'Admin',
            disabled: false,
          }),
        },
        {
          id: 'u-3',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Disabled User',
            disabled: true, // Should be excluded
          }),
        },
        {
          id: 'u-4',
          data: () => ({
            tenantId: 'tenant-beta', // Foreign tenant
            name: 'Beta User',
          }),
        },
      ]);

      const crew = await fetchTenantCrewMembers('tenant-alpha');
      expect(crew).toHaveLength(2);
      expect(crew[0].name).toBe('Alex Technician');
      expect(crew[1].name).toBe('David Lighting Tech');
    });

    it('SVC-PICK-04: fetchTenantCrewMembers returns empty array for empty tenantId or errors', async () => {
      expect(await fetchTenantCrewMembers('')).toEqual([]);

      mockFirestore.getDocs.mockRejectedValueOnce(new Error('Firestore error'));
      expect(await fetchTenantCrewMembers('tenant-alpha')).toEqual([]);
    });

    it('SVC-PICK-05: handles raw docSnap objects where data is a plain property instead of a function', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-plain-1',
          data: {
            tenantId: 'tenant-alpha',
            name: 'Plain Object Supplier',
            types: ['Supplier'],
          },
        },
      ]);
      const suppliers = await fetchTenantSuppliers('tenant-alpha');
      expect(suppliers).toHaveLength(1);
      expect(suppliers[0].name).toBe('Plain Object Supplier');

      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'u-plain-1',
          data: {
            tenantId: 'tenant-alpha',
            name: 'Plain Object Crew Member',
            role: 'Technician',
          },
        },
      ]);
      const crew = await fetchTenantCrewMembers('tenant-alpha');
      expect(crew).toHaveLength(1);
      expect(crew[0].name).toBe('Plain Object Crew Member');
    });

    it('SVC-PICK-06: fetchTenantSuppliers recognizes vendor and manufacturer types', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-vendor-1',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Pro Sound Vendor Direct',
            types: ['Vendor'],
            email: 'sales@prosoundvendor.com',
          }),
        },
        {
          id: 'c-manuf-1',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Avolites Manufacturer Parts',
            types: ['Manufacturer'],
            website: 'https://avolites.com',
          }),
        },
      ]);

      const suppliers = await fetchTenantSuppliers('tenant-alpha');
      expect(suppliers).toHaveLength(2);
      expect(suppliers[0].name).toBe('Avolites Manufacturer Parts');
      expect(suppliers[1].name).toBe('Pro Sound Vendor Direct');
    });

    it('SVC-PICK-07: fetchTenantCrewMembers filters out archived, deleted, and inactive users', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'u-archived',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Archived Tech',
            archived: true,
          }),
        },
        {
          id: 'u-deleted',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Deleted Tech',
            isDeleted: true,
          }),
        },
        {
          id: 'u-inactive',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Inactive Tech',
            active: false,
          }),
        },
        {
          id: 'u-active',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Active Lead Tech',
            role: 'Lead Technician',
          }),
        },
      ]);

      const crew = await fetchTenantCrewMembers('tenant-alpha');
      expect(crew).toHaveLength(1);
      expect(crew[0].name).toBe('Active Lead Tech');
    });

    it('SVC-PICK-08: fetchTenantSuppliers recognizes companyName field and maps manufacturer type', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-comp-1',
          data: () => ({
            tenantId: 'tenant-alpha',
            companyName: 'Luminex Network Intelligence',
            types: ['Manufacturer'],
            phone: '+32 11 812 189',
          }),
        },
      ]);

      const suppliers = await fetchTenantSuppliers('tenant-alpha');
      expect(suppliers).toHaveLength(1);
      expect(suppliers[0].name).toBe('Luminex Network Intelligence');
      expect(suppliers[0].type).toBe('Manufacturer');
      expect(suppliers[0].phone).toBe('+32 11 812 189');
    });

    it('SVC-PICK-09: fetchTenantCrewMembers recognizes displayName field when name is omitted', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'u-disp-1',
          data: () => ({
            tenantId: 'tenant-alpha',
            displayName: 'Jordan Stagehand',
            email: 'jordan@kuro.test',
            role: 'Stagehand',
          }),
        },
      ]);

      const crew = await fetchTenantCrewMembers('tenant-alpha');
      expect(crew).toHaveLength(1);
      expect(crew[0].name).toBe('Jordan Stagehand');
      expect(crew[0].role).toBe('Stagehand');
    });

    it('SVC-PICK-10: fetchTenantOwners queries tenant contacts for clients and venues', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-client-1',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Alpha Production Group',
            types: ['Client'],
            email: 'info@alphaprod.com',
            address: { fullAddress: '123 Show St, Sydney' },
          }),
        },
        {
          id: 'c-venue-1',
          data: () => ({
            tenantId: 'tenant-alpha',
            company: 'Sydney Opera House Concert Hall',
            types: ['Venue'],
            phone: '+61 2 9250 7111',
          }),
        },
        {
          id: 'c-supp-only',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Parts Supplier Direct',
            types: ['Supplier'], // Not a client or venue, should be excluded
          }),
        },
      ]);

      const owners = await fetchTenantOwners('tenant-alpha');
      expect(owners).toHaveLength(2);
      expect(owners[0].name).toBe('Alpha Production Group');
      expect(owners[0].type).toBe('Client');
      expect(owners[1].name).toBe('Sydney Opera House Concert Hall');
      expect(owners[1].type).toBe('Venue');
    });

    it('SVC-PICK-11: fetchTenantOwners returns empty array on error or empty tenantId', async () => {
      expect(await fetchTenantOwners('')).toEqual([]);

      mockFirestore.getDocs.mockRejectedValueOnce(new Error('Firestore network timeout'));
      expect(await fetchTenantOwners('tenant-alpha')).toEqual([]);
    });

    it('SVC-PICK-12: appendRepairNote writes note to ticket array and syncs note entity doc to tenants/{tenantId}/entities/repair-{ticketId}/documents', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          notes: [],
        }),
      });

      const setDocSpy = mockFirestore.setDoc;
      const note = await appendRepairNote(
        'ticket-101',
        'Bench testing complete. All optics aligned.',
        { id: 'usr-1', name: 'Alex Technician', email: 'alex@kuro.test' },
        'tenant-alpha'
      );

      expect(note.content).toBe('Bench testing complete. All optics aligned.');
      expect(note.user?.name).toBe('Alex Technician');
      expect(setDocSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'Note',
          category: 'Notes',
          content: 'Bench testing complete. All optics aligned.',
          tenantId: 'tenant-alpha',
          ticketId: 'ticket-101',
        })
      );
    });

    it('SVC-PICK-13: fetchTenantOwners correctly categorizes contacts with isClient and isVenue boolean flags', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-client-bool',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Client Via Boolean Flag',
            isClient: true,
          }),
        },
        {
          id: 'c-venue-bool',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Venue Via Boolean Flag',
            isVenue: true,
          }),
        },
      ]);

      const owners = await fetchTenantOwners('tenant-alpha');
      expect(owners).toHaveLength(2);
      expect(owners[0].name).toBe('Client Via Boolean Flag');
      expect(owners[0].type).toBe('Client');
      expect(owners[1].name).toBe('Venue Via Boolean Flag');
      expect(owners[1].type).toBe('Venue');
    });

    it('SVC-PICK-14: fetchTenantSuppliers correctly categorizes contacts with isSupplier boolean flag', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-supp-bool',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Supplier Via Boolean Flag',
            isSupplier: true,
          }),
        },
      ]);

      const suppliers = await fetchTenantSuppliers('tenant-alpha');
      expect(suppliers).toHaveLength(1);
      expect(suppliers[0].name).toBe('Supplier Via Boolean Flag');
      expect(suppliers[0].type).toBe('Supplier');
    });

    it('SVC-PICK-15: uploadRepairDamagePhoto handles mock fallback if fetch fails', async () => {
      mockStorage.uploadBytes.mockResolvedValueOnce({ ref: { fullPath: 'mock/path' } });
      mockStorage.getDownloadURL.mockResolvedValueOnce('https://storage.mock/download.jpg');

      const result = await uploadRepairDamagePhoto(
        'tenant-alpha',
        'ticket-101',
        'file:///local/cache/damage_img.jpg',
        'damage_img.jpg'
      );

      expect(result.url).toBe('https://storage.mock/download.jpg');
      expect(result.attachment.type).toBe('Photo');
      expect(result.attachment.fileName).toBe('damage_img.jpg');
    });

    it('SVC-PICK-16: fetchTenantOwners filters out archived, disabled, and inactive contacts', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-archived',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Archived Client',
            types: ['Client'],
            archived: true,
          }),
        },
        {
          id: 'c-deleted',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Deleted Venue',
            types: ['Venue'],
            isDeleted: true,
          }),
        },
        {
          id: 'c-active',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Active Concert Hall',
            types: ['Venue'],
          }),
        },
      ]);

      const owners = await fetchTenantOwners('tenant-alpha');
      expect(owners).toHaveLength(1);
      expect(owners[0].name).toBe('Active Concert Hall');
    });

    it('SVC-PICK-17: fetchTenantSuppliers filters out archived, disabled, and inactive contacts', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 's-disabled',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Disabled Supplier',
            types: ['Supplier'],
            disabled: true,
          }),
        },
        {
          id: 's-inactive',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Inactive Vendor',
            types: ['Vendor'],
            active: false,
          }),
        },
        {
          id: 's-active',
          data: () => ({
            tenantId: 'tenant-alpha',
            name: 'Active Audio Vendor',
            types: ['Vendor'],
          }),
        },
      ]);

      const suppliers = await fetchTenantSuppliers('tenant-alpha');
      expect(suppliers).toHaveLength(1);
      expect(suppliers[0].name).toBe('Active Audio Vendor');
    });
  });
});





