/**
 * __tests__/repair-adversarial.challenge.test.ts
 * ============================================================================
 * Tier 5: Adversarial, Concurrency, Multi-Tenant & Stress Challenge Test Suite
 * Kuro Mobile — Milestone 1 (Core Repair Domain, Types & Services)
 * ============================================================================
 *
 * This suite executes empirical adversarial challenges against:
 * 1. State machine transition properties (exhaustive matrix & bypass prevention)
 * 2. Multi-filter search combinations, special characters & high-volume stress
 * 3. Equipment condition derivation & serial number sync integrity
 * 4. RTDB availability ledger sync under rapid / concurrent burst scenarios
 * 5. Strict multi-tenant isolation across all reads, writes, and subscriptions
 * 6. Input validation bounds & schema bypass prevention
 */

import {
  validateRepairTicketInput,
  calculateEquipmentCondition,
  isValidStatusTransition,
  getNextRepairStatus,
  getAvailableStatusTransitions,
  getQuickStatusOptions,
  filterRepairTickets,
  sortRepairTickets,
  createActionLogEntry,
  normalizeRepairStatus,
  normalizeRepairPriority,
  normalizeEquipmentCondition,
  calculateRepairCostTotal,
  CANONICAL_REPAIR_STATUSES,
  CANONICAL_REPAIR_PRIORITIES,
  STATUS_TRANSITIONS_GRAPH,
} from '@/lib/repair-engine';
import {
  mapFirestoreRepairTicketDoc,
  subscribeTenantRepairTickets,
  subscribeSingleRepairTicket,
  fetchTenantRepairTickets,
  getRepairTicket,
  createRepairTicket,
  updateRepairTicketStatus,
  appendRepairAction,
  appendRepairNote,
  appendRepairAttachment,
  addRepairAttachment,
  syncRepairToRtdbLedger,
  updateEquipmentRepairCondition,
  uploadRepairDamagePhoto,
} from '@/services/repair-service';
import type {
  RepairTicket,
  RepairStatus,
  EquipmentCondition,
  CreateRepairTicketInput,
} from '@/types/repair';

import * as firestore from 'firebase/firestore';
import * as rtdb from 'firebase/database';
import * as storage from 'firebase/storage';

const mockFirestore = firestore as jest.Mocked<any>;
const mockRtdb = rtdb as jest.Mocked<any>;
const mockStorage = storage as jest.Mocked<any>;

// Mock fetch for storage photo uploads
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    blob: () => Promise.resolve({ size: 2048, type: 'image/jpeg' }),
  })
) as jest.Mock;

describe('Tier 5 Adversarial & Empirical Challenge Suite (Milestone 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. STATE MACHINE TRANSITIONS & BYPASS PREVENTION
  // ==========================================================================
  describe('1. State Machine Transitions & Bypass Prevention', () => {
    it('ADV-SM-01: Exhaustively validates all 64 canonical status transition pairs against transition graph', () => {
      for (const current of CANONICAL_REPAIR_STATUSES) {
        for (const next of CANONICAL_REPAIR_STATUSES) {
          const result = isValidStatusTransition(current, next);
          const expected =
            current === next ||
            (STATUS_TRANSITIONS_GRAPH[current] &&
              STATUS_TRANSITIONS_GRAPH[current].includes(next));

          expect(result).toBe(Boolean(expected));
        }
      }
    });

    it('ADV-SM-02: Strictly rejects arbitrary, malicious, or non-existent status transitions', () => {
      const maliciousStatuses = [
        'Hacked',
        '<script>alert(1)</script>',
        'DROP TABLE tickets;',
        'UNKNOWN_STATUS',
        '   ',
        '',
        null as any,
        undefined as any,
        123 as any,
        { status: 'Completed' } as any,
      ];

      for (const badStatus of maliciousStatuses) {
        for (const validStatus of CANONICAL_REPAIR_STATUSES) {
          expect(isValidStatusTransition(badStatus, validStatus)).toBe(false);
          expect(isValidStatusTransition(validStatus, badStatus)).toBe(false);
        }
      }
    });

    it('ADV-SM-03: Proves illegal or unknown statuses cannot transition', () => {
      expect(isValidStatusTransition('Decommissioned', 'Completed')).toBe(false);
      expect(isValidStatusTransition('Decommissioned', 'Under Repair')).toBe(false);
      expect(isValidStatusTransition('Unknown', 'Reported')).toBe(false);
      expect(isValidStatusTransition('Reported', 'Unknown')).toBe(false);
    });

    it('ADV-SM-04: Proves updateRepairTicketStatus rejects illegal transitions and prevents database write', async () => {
      const ticketId = 'ticket-locked-1';
      const tenantId = 'tenant-secure';

      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        id: ticketId,
        data: () => ({
          id: ticketId,
          tenantId,
          status: 'Under Repair',
          condition: 'Out of Service',
        }),
      });

      const user = { id: 'tech-1', name: 'Tester' };
      const res = await updateRepairTicketStatus(
        ticketId,
        'InvalidStatus' as any,
        user,
        tenantId
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid status transition');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
      expect(mockRtdb.set).not.toHaveBeenCalled();
    });

    it('ADV-SM-05: Tests getNextRepairStatus robustness with unknown/null/corrupt status inputs', () => {
      expect(getNextRepairStatus(null)).toBe('Reported');
      expect(getNextRepairStatus(undefined)).toBe('Reported');
      expect(getNextRepairStatus('')).toBe('Reported');
      expect(getNextRepairStatus('INVALID_STATUS')).toBe('Reported');
      expect(getNextRepairStatus('Completed')).toBe('Completed');
      expect(getNextRepairStatus('Under Repair')).toBe('Completed');
    });

    it('ADV-SM-06: Verifies getAvailableStatusTransitions and getQuickStatusOptions never return empty or mutate graph', () => {
      for (const status of CANONICAL_REPAIR_STATUSES) {
        const available = getAvailableStatusTransitions(status);
        const quick = getQuickStatusOptions(status);

        expect(Array.isArray(available)).toBe(true);
        expect(available.length).toBeGreaterThan(0);
        expect(Array.isArray(quick)).toBe(true);
        expect(quick.length).toBeGreaterThan(0);

        // Mutating return value must not affect subsequent calls
        available.push('Pending');
        const availableAgain = getAvailableStatusTransitions(status);
        expect(availableAgain.length).toBe(STATUS_TRANSITIONS_GRAPH[status]?.length);
      }
    });
  });

  // ==========================================================================
  // 2. MULTI-FILTER SEARCH COMBINATIONS & STRESS
  // ==========================================================================
  describe('2. Multi-Filter Search Combinations & Stress', () => {
    const sampleTickets: RepairTicket[] = [
      {
        id: 't-1',
        tenantId: 'tenant-1',
        repairNumber: 1001,
        equipment: {
          name: 'Clay Paky Mythos 2',
          serialNumber: 'SN-CP-901',
          barcode: 'BAR-CP-001',
          category: 'Moving Heads',
          knownLocation: 'Bay 1',
          venue: 'Warehouse Sydney',
          assetNumber: 'AST-101',
        },
        priority: 'Critical',
        status: 'Under Repair',
        condition: 'Out of Service',
        billingStatus: 'Internal',
        assigneeId: 'tech-alpha',
        assignee: { id: 'tech-alpha', name: 'Alpha Tech' },
        requestedBy: 'Warehouse Lead',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        notes: [{ id: 'n1', content: 'Prism rotation motor jammed', timestamp: '2026-08-01T01:00:00.000Z' }],
        actions: [{ id: 'a1', user: { name: 'Alpha Tech' }, action: 'Disassembled head', timestamp: '2026-08-01T01:00:00.000Z' }],
        archived: false,
      },
      {
        id: 't-2',
        tenantId: 'tenant-1',
        repairNumber: 1002,
        equipment: {
          name: 'MA Lighting grandMA3 full-size',
          serialNumber: 'SN-MA3-004',
          barcode: 'BAR-MA3-004',
          category: 'Consoles',
          knownLocation: 'Control Room',
          venue: 'Melbourne Arena',
          assetNumber: 'AST-202',
        },
        priority: 'High',
        status: 'Pending',
        condition: 'Out of Service',
        billingStatus: 'Quoted',
        assigneeId: 'tech-beta',
        assignee: { id: 'tech-beta', name: 'Beta Engineer' },
        requestedBy: 'Show Operator',
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
        notes: [{ id: 'n2', content: 'Fader wing 2 motorized fader strip replacement ordered', timestamp: '2026-08-10T02:00:00.000Z' }],
        actions: [{ id: 'a2', user: { name: 'Beta Engineer' }, action: 'Diagnostic complete', timestamp: '2026-08-10T02:00:00.000Z' }],
        archived: false,
      },
      {
        id: 't-3',
        tenantId: 'tenant-1',
        repairNumber: 1003,
        equipment: {
          name: 'L-Acoustics K2 Line Array Element',
          serialNumber: 'SN-LA-550',
          barcode: 'BAR-LA-550',
          category: 'Audio',
          knownLocation: 'Bay 8',
          venue: 'Brisbane Depot',
          assetNumber: 'AST-303',
        },
        priority: 'Low',
        status: 'Completed',
        condition: 'Available to Use',
        billingStatus: 'Invoiced',
        assigneeId: 'tech-alpha',
        assignee: { id: 'tech-alpha', name: 'Alpha Tech' },
        requestedBy: 'Audio Lead',
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
        notes: [{ id: 'n3', content: 'High frequency driver replaced and tested', timestamp: '2026-08-15T03:00:00.000Z' }],
        actions: [{ id: 'a3', user: { name: 'Alpha Tech' }, action: 'Bench test passed at 120dB', timestamp: '2026-08-16T03:00:00.000Z' }],
        archived: false,
      },
      {
        id: 't-4',
        tenantId: 'tenant-1',
        repairNumber: 1004,
        equipment: {
          name: 'Robe BMFL WashBeam',
          serialNumber: 'SN-ROBE-999',
          barcode: 'BAR-ROBE-999',
          category: 'Moving Heads',
        },
        priority: 'Medium',
        status: 'Completed',
        condition: 'Out of Service',
        billingStatus: 'None',
        assigneeId: null,
        requestedBy: 'System',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-05T00:00:00.000Z',
        archived: true,
      },
    ];

    it('ADV-FLT-01: Multi-status array filtering matches correctly and excludes unselected statuses', () => {
      const filtered = filterRepairTickets(sampleTickets, {
        status: ['Under Repair', 'Pending'],
      });

      expect(filtered.map((t) => t.id)).toEqual(['t-1', 't-2']);
    });

    it('ADV-FLT-02: Simultaneous combination of status + priority + condition + assignee + date range', () => {
      const filtered = filterRepairTickets(sampleTickets, {
        status: 'Under Repair',
        priority: 'Critical',
        condition: 'Out of Service',
        assigneeId: 'tech-alpha',
        dateFrom: '2026-07-31T00:00:00.000Z',
        dateTo: '2026-08-05T00:00:00.000Z',
      });

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('t-1');
    });

    it('ADV-FLT-03: Fuzzy multi-field search handles special regex characters, hashtags, and deep fields safely', () => {
      // Search by ticket hashtag
      expect(filterRepairTickets(sampleTickets, { search: '#1002' }).map((t) => t.id)).toEqual(['t-2']);
      expect(filterRepairTickets(sampleTickets, { search: '1002' }).map((t) => t.id)).toEqual(['t-2']);

      // Search inside notes content
      expect(filterRepairTickets(sampleTickets, { search: 'motorized fader' }).map((t) => t.id)).toEqual(['t-2']);

      // Search inside actions content
      expect(filterRepairTickets(sampleTickets, { search: 'Bench test' }).map((t) => t.id)).toEqual(['t-3']);

      // Search with regex special characters (must not crash or throw RegExp syntax errors)
      const specialChars = ['[', ']', '(', ')', '*', '+', '?', '\\', '.', '^', '$', '{', '}', '|'];
      for (const char of specialChars) {
        expect(() => filterRepairTickets(sampleTickets, { search: char })).not.toThrow();
      }
    });

    it('ADV-FLT-04: Archived flag filtering strictly excludes archived tickets unless explicitly requested', () => {
      // Default: no archived
      const defaultFiltered = filterRepairTickets(sampleTickets, {});
      expect(defaultFiltered.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3']);

      // Explicitly include archived
      const withArchived = filterRepairTickets(sampleTickets, { includeArchived: true });
      expect(withArchived.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3', 't-4']);
    });

    it('ADV-FLT-05: Stress tests filter and sort against 2,000 malformed/sparse ticket objects', () => {
      const massiveList: RepairTicket[] = Array.from({ length: 2000 }, (_, idx) => ({
        id: `stress-${idx}`,
        tenantId: `tenant-${idx % 5}`,
        repairNumber: idx % 2 === 0 ? idx + 1000 : null,
        equipment: {
          name: idx % 3 === 0 ? `Device ${idx}` : (undefined as any),
          serialNumber: idx % 4 === 0 ? `SN-${idx}` : null,
        },
        priority: (idx % 2 === 0 ? 'High' : undefined) as any,
        status: (idx % 2 === 0 ? 'Under Repair' : null) as any,
        createdAt: idx % 5 === 0 ? '2026-08-01T00:00:00.000Z' : null,
        updatedAt: null,
        requestedBy: 'System',
      }));

      expect(() => {
        const res = filterRepairTickets(massiveList, {
          search: 'Device 3',
          status: 'Under Repair',
        });
        expect(Array.isArray(res)).toBe(true);

        const sorted = sortRepairTickets(massiveList, 'repairNumber', 'desc');
        expect(sorted.length).toBe(2000);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 3. EQUIPMENT CONDITION LOGIC & SERIAL SYNC
  // ==========================================================================
  describe('3. Equipment Condition Logic & Serial Sync', () => {
    it('ADV-COND-01: Derives condition across all canonical statuses with fail-safe guarantee', () => {
      // Operational / Completed / Returned -> Available to Use
      expect(calculateEquipmentCondition('Operational')).toBe('Available to Use');
      expect(calculateEquipmentCondition('Completed')).toBe('Available to Use');
      expect(calculateEquipmentCondition('Returned')).toBe('Available to Use');
      expect(calculateEquipmentCondition('ready')).toBe('Available to Use');
      expect(calculateEquipmentCondition('repaired')).toBe('Available to Use');

      // Under Repair / Awaiting Parts / Collected / Decommissioned / Archived / Invalid -> Out of Service
      expect(calculateEquipmentCondition('Under Repair')).toBe('Out of Service');
      expect(calculateEquipmentCondition('Awaiting Parts')).toBe('Out of Service');
      expect(calculateEquipmentCondition('Collected')).toBe('Out of Service');
      expect(calculateEquipmentCondition('Decommissioned')).toBe('Out of Service');
      expect(calculateEquipmentCondition('Archived')).toBe('Out of Service');
      expect(calculateEquipmentCondition('')).toBe('Out of Service');
      expect(calculateEquipmentCondition(null)).toBe('Out of Service');
      expect(calculateEquipmentCondition(undefined)).toBe('Out of Service');
      expect(calculateEquipmentCondition('SOMETHING_BROKEN')).toBe('Out of Service');
    });

    it('ADV-COND-02: updateEquipmentRepairCondition isolates target serial and leaves other serials untouched', async () => {
      const equipmentId = 'eq-fixture-99';
      const tenantId = 'tenant-alpha';

      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId,
          name: 'Martin MAC Quantum Profile',
          serialNumbers: [
            { serial: 'SN-001', status: 'Available' },
            { serial: 'SN-002', status: 'Available' },
            { serial: 'SN-003', status: 'In Repair' },
          ],
        }),
      });

      await updateEquipmentRepairCondition(
        equipmentId,
        tenantId,
        'Out of Service',
        'Under Repair',
        'SN-002' // Only SN-002 should become 'In Repair'
      );

      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(1);
      const updateCall = mockFirestore.updateDoc.mock.calls[0][1];
      expect(updateCall.serialNumbers).toEqual([
        { serial: 'SN-001', status: 'Available' },
        { serial: 'SN-002', status: 'In Repair' },
        { serial: 'SN-003', status: 'In Repair' },
      ]);
    });

    it('ADV-COND-03: updateEquipmentRepairCondition safely handles equipment document without serials array', async () => {
      const equipmentId = 'eq-bulk-item';
      const tenantId = 'tenant-alpha';

      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId,
          name: 'XLR Cables 10m (Bulk)',
          quantity: 50,
        }),
      });

      await expect(
        updateEquipmentRepairCondition(equipmentId, tenantId, 'Out of Service', 'Under Repair')
      ).resolves.not.toThrow();

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          updatedAt: expect.anything(),
        })
      );
    });
  });

  // ==========================================================================
  // 4. RTDB AVAILABILITY SYNC UNDER RAPID / CONCURRENT BURSTS
  // ==========================================================================
  describe('4. RTDB Availability Sync Under Concurrent Bursts', () => {
    it('ADV-RTDB-01: Handles 50 concurrent rapid sync calls without unhandled rejections or race corruption', async () => {
      const tenantId = 'tenant-concurrency';

      const calls = Array.from({ length: 50 }, (_, i) => {
        const ticketId = `ticket-burst-${i}`;
        const equipmentId = `eq-${i}`;
        const condition: EquipmentCondition = i % 2 === 0 ? 'Out of Service' : 'Available to Use';
        const qty = (i % 5) + 1;

        return syncRepairToRtdbLedger(tenantId, ticketId, equipmentId, condition, qty);
      });

      await expect(Promise.all(calls)).resolves.toBeDefined();

      // 25 calls had condition='Out of Service' (setting payload)
      // 25 calls had condition='Available to Use' (setting null)
      expect(mockRtdb.set).toHaveBeenCalledTimes(50);
    });

    it('ADV-RTDB-02: Deletes RTDB reservation node when condition is Available to Use or equipmentId is missing', async () => {
      const tenantId = 'tenant-rtdb';
      const ticketId = 'ticket-clear-1';

      // 1. Available to Use -> null
      await syncRepairToRtdbLedger(tenantId, ticketId, 'eq-123', 'Available to Use', 1);
      expect(mockRtdb.set).toHaveBeenLastCalledWith(expect.anything(), null);

      // 2. Null equipmentId -> null
      await syncRepairToRtdbLedger(tenantId, ticketId, null, 'Out of Service', 1);
      expect(mockRtdb.set).toHaveBeenLastCalledWith(expect.anything(), null);
    });

    it('ADV-RTDB-03: Sets correct structured RTDB availability lock payload when Out of Service', async () => {
      const tenantId = 'tenant-rtdb';
      const ticketId = 'ticket-lock-99';
      const equipmentId = 'eq-robe-blade';

      await syncRepairToRtdbLedger(tenantId, ticketId, equipmentId, 'Out of Service', 3);

      expect(mockRtdb.ref).toHaveBeenCalledWith(
        expect.anything(),
        `availability/${tenantId}/r/${ticketId}`
      );
      expect(mockRtdb.set).toHaveBeenCalledWith(expect.anything(), {
        i: {
          [equipmentId]: { q: 3 },
        },
      });
    });
  });

  // ==========================================================================
  // 5. STRICT MULTI-TENANT ISOLATION
  // ==========================================================================
  describe('5. Strict Multi-Tenant Isolation', () => {
    it('ADV-TEN-01: subscribeTenantRepairTickets filters out foreign tenant documents in memory', (done) => {
      const targetTenant = 'tenant-alpha';

      mockFirestore.onSnapshot.mockImplementation((_query: any, onNext: any) => {
        const mockSnapshot = [
          { id: 't-1', data: () => ({ id: 't-1', tenantId: 'tenant-alpha', equipment: { name: 'Alpha Light' } }) },
          { id: 't-2', data: () => ({ id: 't-2', tenantId: 'tenant-beta', equipment: { name: 'Beta Light (LEAK!)' } }) },
          { id: 't-3', data: () => ({ id: 't-3', tenantId: 'tenant-alpha', equipment: { name: 'Alpha Audio' } }) },
        ];
        onNext(mockSnapshot);
        return () => {};
      });

      subscribeTenantRepairTickets(targetTenant, (tickets) => {
        expect(tickets.length).toBe(2);
        expect(tickets.every((t) => t.tenantId === targetTenant)).toBe(true);
        expect(tickets.some((t) => t.tenantId === 'tenant-beta')).toBe(false);
        done();
      });
    });

    it('ADV-TEN-02: subscribeSingleRepairTicket emits null if document tenantId does not match subscriber tenantId', (done) => {
      const subscriberTenant = 'tenant-alpha';
      const ticketId = 't-foreign-99';

      mockFirestore.onSnapshot.mockImplementation((_ref: any, onNext: any) => {
        onNext({
          exists: () => true,
          id: ticketId,
          data: () => ({
            id: ticketId,
            tenantId: 'tenant-beta', // Foreign tenant
            equipment: { name: 'Classified Console' },
          }),
        });
        return () => {};
      });

      subscribeSingleRepairTicket(ticketId, subscriberTenant, (ticket) => {
        expect(ticket).toBeNull();
        done();
      });
    });

    it('ADV-TEN-03: getRepairTicket returns null on tenant ID mismatch', async () => {
      const ticketId = 'ticket-confidential';
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        id: ticketId,
        data: () => ({
          id: ticketId,
          tenantId: 'tenant-omega',
          equipment: { name: 'Secret Prototype' },
        }),
      });

      const res = await getRepairTicket(ticketId, 'tenant-alpha');
      expect(res).toBeNull();
    });

    it('ADV-TEN-04: updateRepairTicketStatus blocks mutation if document belongs to different tenant', async () => {
      const ticketId = 'ticket-stolen';
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        id: ticketId,
        data: () => ({
          id: ticketId,
          tenantId: 'tenant-victim',
          status: 'Under Repair',
        }),
      });

      const res = await updateRepairTicketStatus(
        ticketId,
        'Completed',
        { id: 'attacker', name: 'Attacker' },
        'tenant-attacker'
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unauthorized/i);
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('ADV-TEN-05: appendRepairAction, appendRepairNote & appendRepairAttachment reject cross-tenant execution', async () => {
      const ticketId = 't-cross-tenant';
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        id: ticketId,
        data: () => ({
          id: ticketId,
          tenantId: 'tenant-legit',
        }),
      });

      const intruderTenant = 'tenant-intruder';
      const user = { id: 'u-1', name: 'Intruder' };

      await expect(
        appendRepairAction(ticketId, 'Hacked action', user, intruderTenant)
      ).rejects.toThrow(/unauthorized/i);

      await expect(
        appendRepairNote(ticketId, 'Hacked note', user, intruderTenant)
      ).rejects.toThrow(/unauthorized/i);

      await expect(
        appendRepairAttachment(
          ticketId,
          { id: 'att-1', type: 'Photo', url: 'https://evil.com/x.jpg' },
          user,
          intruderTenant
        )
      ).rejects.toThrow(/unauthorized/i);
    });

    it('ADV-TEN-06: uploadRepairDamagePhoto isolates storage path under tenantId directory namespace', async () => {
      const tenantId = 'tenant-acme';
      const ticketId = 'ticket-photo-1';
      const localUri = 'file:///data/user/0/com.kuro.mobile/cache/damage.jpg';

      mockStorage.getDownloadURL.mockResolvedValue('https://storage.googleapis.com/test-photo.jpg');

      const result = await uploadRepairDamagePhoto(tenantId, ticketId, localUri);

      expect(mockStorage.ref).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(new RegExp(`^tenants/${tenantId}/entity_documents/repair-${ticketId}/`))
      );
      expect(result.url).toBe('https://storage.googleapis.com/test-photo.jpg');
    });
  });

  // ==========================================================================
  // 6. SCHEMA VALIDATION BOUNDS & BYPASS PREVENTION
  // ==========================================================================
  describe('6. Schema Validation Bounds & Bypass Prevention', () => {
    it('ADV-VAL-01: Validates required equipment name and rejects empty or whitespace-only names', () => {
      expect(validateRepairTicketInput(null).isValid).toBe(false);
      expect(validateRepairTicketInput({} as any).isValid).toBe(false);
      expect(validateRepairTicketInput({ equipment: { name: '' } } as any).isValid).toBe(false);
      expect(validateRepairTicketInput({ equipment: { name: '   ' } } as any).isValid).toBe(false);
      expect(validateRepairTicketInput({ equipment: { name: 'Valid Gear' } }).isValid).toBe(true);
    });

    it('ADV-VAL-02: Enforces repairPeriodEnd >= repairPeriodStart constraint', () => {
      const invalidDates = validateRepairTicketInput({
        equipment: { name: 'Console' },
        repairPeriodStart: '2026-08-25T12:00:00.000Z',
        repairPeriodEnd: '2026-08-20T12:00:00.000Z', // 5 days before start!
      });

      expect(invalidDates.isValid).toBe(false);
      expect(invalidDates.errors.repairPeriodEnd).toContain('Repair End Date cannot be before Start Date.');

      const validDates = validateRepairTicketInput({
        equipment: { name: 'Console' },
        repairPeriodStart: '2026-08-20T12:00:00.000Z',
        repairPeriodEnd: '2026-08-25T12:00:00.000Z',
      });

      expect(validDates.isValid).toBe(true);
    });

    it('ADV-VAL-03: Rejects negative costs, zero quantities, and malformed parts/attachments', () => {
      const badInput: any = {
        equipment: { name: 'Laser Fixture', quantity: -2 },
        costs: -500,
        attachments: [{ url: '', type: 'InvalidType' }],
        partsUsed: [{ name: '', quantity: 0, cost: -10 }],
      };

      const result = validateRepairTicketInput(badInput);
      expect(result.isValid).toBe(false);
      expect(result.errors['equipment.quantity']).toBeDefined();
      expect(result.errors['costs']).toBeDefined();
      expect(result.errors['attachments[0].url']).toBeDefined();
      expect(result.errors['attachments[0].type']).toBeDefined();
      expect(result.errors['partsUsed[0].name']).toBeDefined();
      expect(result.errors['partsUsed[0].quantity']).toBeDefined();
      expect(result.errors['partsUsed[0].cost']).toBeDefined();
    });

    it('ADV-VAL-04: calculateRepairCostTotal sums part quantities, costs, and manual costs with exact rounding', () => {
      const total = calculateRepairCostTotal(
        [
          { id: 'p1', name: 'Lens', quantity: 3, cost: 45.5 },
          { id: 'p2', name: 'Belt', quantity: 2, cost: 12.25 },
        ],
        150.75
      );

      // (3 * 45.50 = 136.50) + (2 * 12.25 = 24.50) + 150.75 = 311.75
      expect(total).toBe(311.75);
    });
  });
});
