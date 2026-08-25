/**
 * __tests__/m1-services-adversarial.challenge.test.ts
 * Tier 5 Empirical Adversarial & Boundary Stress Test Suite for Milestone 1.
 * Tests repair-engine.ts pure domain logic and repair-service.ts multi-tenant operations
 * against hostile inputs, extreme edge cases, data boundary conditions, and cross-tenant leak vectors.
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
  normalizeRepairBillingStatus,
  normalizeEquipmentCondition,
  normalizeDateToISO,
  normalizeDate,
  formatRepairNumber,
  calculateRepairCostTotal,
  getStatusBadgeVariant,
  getPriorityBadgeVariant,
  CANONICAL_REPAIR_STATUSES,
  CANONICAL_REPAIR_PRIORITIES,
} from '@/lib/repair-engine';
import {
  mapFirestoreRepairTicketDoc,
  subscribeTenantRepairTickets,
  subscribeSingleRepairTicket,
  fetchTenantRepairTickets,
  getRepairTicket,
  generateRepairNumber,
  createRepairTicket,
  updateRepairTicketStatus,
  appendRepairAction,
  appendRepairNote,
  appendRepairAttachment,
  addRepairAttachment,
  uploadRepairDamagePhoto,
  syncRepairToRtdbLedger,
  updateEquipmentRepairCondition,
} from '@/services/repair-service';
import type { RepairTicket, RepairPart } from '@/types/repair';
import * as firestore from 'firebase/firestore';
import * as rtdb from 'firebase/database';
import * as storage from 'firebase/storage';

const mockFirestore = firestore as jest.Mocked<any>;
const mockRtdb = rtdb as jest.Mocked<any>;
const mockStorage = storage as jest.Mocked<any>;

// Mock fetch for image upload
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    blob: () => Promise.resolve({ size: 2048, type: 'image/png' }),
  })
) as jest.Mock;

describe('Tier 5 Adversarial & Empirical Challenge Suite — Milestone 1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // SECTION 1: VALIDATION ENGINE ADVERSARIAL STRESS (ADV-VAL)
  // ==========================================================================
  describe('ADV-VAL: Input Validation Engine Stress Testing', () => {
    it('ADV-VAL-01: Rejects undefined, null, primitive, or array payloads without throwing', () => {
      const inputs = [null, undefined, 12345, 'string', true, Symbol('bad'), []];
      inputs.forEach((input: any) => {
        expect(() => validateRepairTicketInput(input)).not.toThrow();
        const res = validateRepairTicketInput(input);
        expect(res.isValid).toBe(false);
        expect(res.errorMessages.length).toBeGreaterThan(0);
      });
    });

    it('ADV-VAL-02: Rejects whitespace-only equipment names', () => {
      const whitespaceNames = [
        '',
        '   ',
        '\t\t\n\r',
        '      ',
      ];

      whitespaceNames.forEach((name) => {
        const res = validateRepairTicketInput({
          tenantId: 'tenant-1',
          equipment: { name },
        });
        expect(res.isValid).toBe(false);
        expect(res.errors['equipment.name']).toBeDefined();
      });
    });

    it('ADV-VAL-03: Accepts international unicode, emoji, and special characters in equipment name', () => {
      const validNames = [
        'Robe BMFL™ Blade 4K (Moving Head)',
        'Yamaha ヤマハ デジタルミキサー QL5',
        'مكبر صوت L-Acoustics K2',
        'Aputure 600d Pro 💡 Flash',
        'Audio-Technica / Sennheiser 500-G4 #12 [Rack A]',
      ];

      validNames.forEach((name) => {
        const res = validateRepairTicketInput({
          tenantId: 'tenant-1',
          equipment: { name },
        });
        expect(res.isValid).toBe(true);
        expect(res.errorMessages).toHaveLength(0);
      });
    });

    it('ADV-VAL-04: Rejects negative, NaN, and invalid numeric bounds for costs and quantities', () => {
      const badInputs = [
        { costs: -0.01 },
        { costs: -1000 },
        { costs: NaN },
        { equipment: { name: 'Item', quantity: 0 } },
        { equipment: { name: 'Item', quantity: -5 } },
        { equipment: { name: 'Item', quantity: NaN } },
      ];

      badInputs.forEach((item) => {
        const res = validateRepairTicketInput({
          tenantId: 'tenant-1',
          equipment: { name: 'Valid Item' },
          ...item,
        });
        expect(res.isValid).toBe(false);
      });
    });

    it('ADV-VAL-05: Validates date boundary chronologies and extreme dates', () => {
      // Inverted chronology
      const inverted = validateRepairTicketInput({
        tenantId: 'tenant-1',
        equipment: { name: 'Moving Head' },
        repairPeriodStart: '2026-08-25T15:00:00.000Z',
        repairPeriodEnd: '2026-08-25T14:59:59.999Z',
      });
      expect(inverted.isValid).toBe(false);
      expect(inverted.errors['repairPeriodEnd']).toBeDefined();

      // Equal start and end
      const equalDate = validateRepairTicketInput({
        tenantId: 'tenant-1',
        equipment: { name: 'Moving Head' },
        repairPeriodStart: '2026-08-25T15:00:00.000Z',
        repairPeriodEnd: '2026-08-25T15:00:00.000Z',
      });
      expect(equalDate.isValid).toBe(true);

      // Extreme future/past valid ISO dates
      const extremeValid = validateRepairTicketInput({
        tenantId: 'tenant-1',
        equipment: { name: 'Moving Head' },
        repairPeriodStart: '1970-01-01T00:00:00.000Z',
        repairPeriodEnd: '2099-12-31T23:59:59.000Z',
      });
      expect(extremeValid.isValid).toBe(true);

      // Garbage dates
      const garbageDate = validateRepairTicketInput({
        tenantId: 'tenant-1',
        equipment: { name: 'Moving Head' },
        repairPeriodStart: 'not-a-real-date',
      });
      expect(garbageDate.isValid).toBe(false);
      expect(garbageDate.errors['repairPeriodStart']).toBeDefined();
    });

    it('ADV-VAL-06: Validates nested attachments and parts array contents', () => {
      const payloadWithBadAttachments = {
        tenantId: 'tenant-1',
        equipment: { name: 'Console' },
        attachments: [
          { id: '1', type: 'Photo' as const, url: 'https://valid.url/photo.jpg' },
          { id: '2', type: 'InvalidType' as any, url: 'https://valid.url/file.bin' },
          { id: '3', type: 'Photo' as const, url: '   ' },
        ],
      };
      const resAtt = validateRepairTicketInput(payloadWithBadAttachments);
      expect(resAtt.isValid).toBe(false);
      expect(resAtt.errors['attachments[1].type']).toBeDefined();
      expect(resAtt.errors['attachments[2].url']).toBeDefined();

      const payloadWithBadParts = {
        tenantId: 'tenant-1',
        equipment: { name: 'Console' },
        partsUsed: [
          { id: 'p1', name: 'Valid Part', quantity: 1, cost: 0 }, // $0 warranty part is valid
          { id: 'p2', name: '   ', quantity: 1, cost: 10 },
          { id: 'p3', name: 'Bad Part', quantity: 0, cost: 10 },
          { id: 'p4', name: 'Bad Part 2', quantity: 1, cost: -5 },
        ],
      };
      const resParts = validateRepairTicketInput(payloadWithBadParts);
      expect(resParts.isValid).toBe(false);
      expect(resParts.errors['partsUsed[1].name']).toBeDefined();
      expect(resParts.errors['partsUsed[2].quantity']).toBeDefined();
      expect(resParts.errors['partsUsed[3].cost']).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 2: FAIL-SAFE CONDITION & STATE MACHINE INVARIANTS (ADV-CND & ADV-TRN)
  // ==========================================================================
  describe('ADV-CND & ADV-TRN: Fail-Safe Condition and Transition Graph Invariants', () => {
    it('ADV-CND-01: Fail-safe invariant: Unrecognized or malicious status ALWAYS resolves to Out of Service', () => {
      const maliciousOrUnknownStatuses = [
        '<script>alert("xss")</script>',
        'DROP TABLE tickets;',
        '{}',
        'null',
        'undefined',
        '--SELECT--',
        'OPERATIONAL_BUT_BROKEN',
        'random_junk_status_123',
        null,
        undefined,
        '',
      ];

      maliciousOrUnknownStatuses.forEach((status: any) => {
        const condition = calculateEquipmentCondition(status);
        expect(condition).toBe('Out of Service');
      });
    });

    it('ADV-CND-02: Only canonical operational/completed statuses map to Available to Use', () => {
      const availableStatuses = ['Operational', 'Completed', 'Returned', 'Ready', 'Repaired', 'operational', 'completed'];
      availableStatuses.forEach((status) => {
        expect(calculateEquipmentCondition(status)).toBe('Available to Use');
      });

      const outOfServiceStatuses = ['Under Repair', 'Awaiting Parts', 'Collected', 'Decommissioned', 'Archived', 'under_repair'];
      outOfServiceStatuses.forEach((status) => {
        expect(calculateEquipmentCondition(status)).toBe('Out of Service');
      });
    });

    it('ADV-TRN-01: Permitted and forbidden state transitions match state machine specifications', () => {
      // Forbidden direct transitions
      expect(isValidStatusTransition('Decommissioned', 'Completed')).toBe(false);
      expect(isValidStatusTransition('Decommissioned', 'Operational')).toBe(false);
      expect(isValidStatusTransition('Decommissioned', 'Awaiting Parts')).toBe(false);
      expect(isValidStatusTransition('Archived', 'Awaiting Parts')).toBe(false);
      expect(isValidStatusTransition('Collected', 'Completed')).toBe(false);
      expect(isValidStatusTransition('Collected', 'Returned')).toBe(false);

      // Permitted rehabilitation / lifecycle transitions
      expect(isValidStatusTransition('Decommissioned', 'Under Repair')).toBe(true);
      expect(isValidStatusTransition('Archived', 'Under Repair')).toBe(true);
      expect(isValidStatusTransition('Archived', 'Operational')).toBe(true);
      expect(isValidStatusTransition('Collected', 'Under Repair')).toBe(true);
      expect(isValidStatusTransition('Collected', 'Operational')).toBe(true);
    });

    it('ADV-TRN-02: Stress test rapid cyclical status transitions (100 cycles)', () => {
      let currentStatus: any = 'Under Repair';
      const sequence = ['Completed', 'Operational', 'Returned', 'Under Repair', 'Awaiting Parts', 'Under Repair'];

      for (let i = 0; i < 100; i++) {
        const next = sequence[i % sequence.length];
        const valid = isValidStatusTransition(currentStatus, next);
        expect(valid).toBe(true);
        currentStatus = next;
      }
    });

    it('ADV-TRN-03: Terminal idempotency of getNextRepairStatus on Archived', () => {
      expect(getNextRepairStatus('Archived')).toBe('Archived');
      expect(getNextRepairStatus('Under Repair')).toBe('Completed');
      expect(getNextRepairStatus('Completed')).toBe('Operational');
      expect(getNextRepairStatus('Operational')).toBe('Returned');
      expect(getNextRepairStatus('Returned')).toBe('Archived');
    });

    it('ADV-TRN-04: getAvailableStatusTransitions and getQuickStatusOptions return valid subsets', () => {
      const availUnderRepair = getAvailableStatusTransitions('Under Repair');
      expect(availUnderRepair).toContain('Completed');
      expect(availUnderRepair).toContain('Awaiting Parts');
      expect(availUnderRepair).toContain('Operational');

      const quickOptions = getQuickStatusOptions('Under Repair');
      expect(quickOptions.length).toBeGreaterThanOrEqual(2);
      quickOptions.forEach((opt) => {
        expect(isValidStatusTransition('Under Repair', opt)).toBe(true);
      });
    });
  });

  // ==========================================================================
  // SECTION 3: FUZZY SEARCH & LARGE-SCALE FILTERING ADVERSARIAL (ADV-FLT & ADV-SRT)
  // ==========================================================================
  describe('ADV-FLT & ADV-SRT: Fuzzy Search, ReDoS Resistance, and Large Scale Filtering', () => {
    // Generate 1,000 synthetic repair tickets
    const largeTicketList: RepairTicket[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `ticket-bulk-${i}`,
      tenantId: 'tenant-bulk',
      repairNumber: 1000 + i,
      equipment: {
        id: `eq-${i % 50}`,
        name: `Fixture Brand ${i % 10} Model ${i}`,
        serialNumber: `SN-BULK-${i.toString().padStart(5, '0')}`,
        barcode: `BAR-BULK-${i}`,
        category: i % 2 === 0 ? 'Lighting' : 'Audio',
        knownLocation: `Warehouse Bay ${i % 20}`,
      },
      priority: CANONICAL_REPAIR_PRIORITIES[i % CANONICAL_REPAIR_PRIORITIES.length],
      status: CANONICAL_REPAIR_STATUSES[i % CANONICAL_REPAIR_STATUSES.length],
      condition: i % 3 === 0 ? 'Available to Use' : 'Out of Service',
      billingStatus: 'Internal',
      assigneeId: `tech-${i % 5}`,
      requestedBy: `User ${i % 8}`,
      repairPeriodStart: new Date(Date.UTC(2026, 7, 1 + (i % 28))).toISOString(),
      createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 28))).toISOString(),
      notes: [{ id: `n-${i}`, content: `Technician note for ticket index ${i} with special token #tok-${i % 20}`, timestamp: new Date().toISOString() }],
      actions: [{ id: `a-${i}`, user: { name: `Tech ${i % 5}` }, action: `Action log with unique code [CODE-AUDIT-${i}]`, timestamp: new Date().toISOString() }],
      archived: i % 10 === 0,
    }));

    it('ADV-FLT-01: ReDoS & Regex Injection Resistance in search query', () => {
      const evilRegexQueries = [
        '((((((((a+)+)+)+)+)+)+)+)',
        '(a+)+$',
        '[a-z',
        '***',
        '???',
        '\\u0000',
        '^(?:[a-zA-Z0-9_-]+)*$',
        '(?=.*[0-9])(?=.*[a-z])',
        '[\\]',
        '(*UTF8)',
      ];

      evilRegexQueries.forEach((query) => {
        const start = performance.now();
        expect(() => {
          filterRepairTickets(largeTicketList, { search: query });
        }).not.toThrow();
        const duration = performance.now() - start;
        expect(duration).toBeLessThan(100); // Must complete in <100ms without catastrophic backtracking
      });
    });

    it('ADV-FLT-02: Fast filtering across 1,000 tickets with multi-criteria conditions', () => {
      const start = performance.now();
      const filtered = filterRepairTickets(largeTicketList, {
        status: ['Under Repair', 'Awaiting Parts'],
        priority: 'High',
        assigneeId: 'tech-2',
        search: 'Brand 2',
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      expect(Array.isArray(filtered)).toBe(true);
      filtered.forEach((t) => {
        expect(['Under Repair', 'Awaiting Parts']).toContain(t.status);
        expect(t.priority).toBe('High');
        expect(t.assigneeId).toBe('tech-2');
        expect(t.archived).toBe(false);
      });
    });

    it('ADV-FLT-03: Search matches deeply in notes content and action logs', () => {
      const resNote = filterRepairTickets(largeTicketList, { search: '#tok-7' });
      expect(resNote.length).toBeGreaterThan(0);
      resNote.forEach((t) => {
        const hasNote = t.notes?.some((n) => n.content.includes('#tok-7'));
        expect(hasNote).toBe(true);
      });

      const resAction = filterRepairTickets(largeTicketList, { search: '[CODE-AUDIT-42]' });
      expect(resAction.length).toBe(1);
      expect(resAction[0].id).toBe('ticket-bulk-42');
    });

    it('ADV-SRT-01: Sorts large ticket arrays stably by all sort keys without throwing on nulls/missing fields', () => {
      const ticketsWithMissingFields: RepairTicket[] = [
        { id: '1', tenantId: 't', equipment: { name: '' }, priority: 'High', status: 'Under Repair', requestedBy: 'A' },
        { id: '2', tenantId: 't', equipment: { name: 'A-Item' }, priority: 'Low', status: 'Operational', requestedBy: 'B', repairNumber: 200 },
        { id: '3', tenantId: 't', equipment: { name: 'Z-Item' }, priority: 'Critical', status: 'Completed', requestedBy: 'C', repairNumber: 100 },
        { id: '4', tenantId: 't', equipment: { name: 'M-Item' }, priority: 'Medium', status: 'Archived', requestedBy: 'D', createdAt: '2026-08-25T10:00:00Z' },
      ];

      const sortKeys = ['repairNumber', 'priority', 'status', 'equipmentName', 'createdAt', 'updatedAt'] as const;
      sortKeys.forEach((key) => {
        expect(() => sortRepairTickets(ticketsWithMissingFields, key, 'asc')).not.toThrow();
        expect(() => sortRepairTickets(ticketsWithMissingFields, key, 'desc')).not.toThrow();
      });
    });

    it('ADV-CST-01: Cost calculation handles precision decimals and missing parts gracefully', () => {
      const parts: RepairPart[] = [
        { id: '1', name: 'Capacitor', quantity: 3, cost: 0.1 }, // 0.30
        { id: '2', name: 'Resistor', quantity: 2, cost: 0.2 },  // 0.40
        { id: '3', name: 'Wire', quantity: 1, cost: 0.05 },     // 0.05
      ];
      // 0.3 + 0.4 + 0.05 + 1.25 = 2.00
      const total = calculateRepairCostTotal(parts, 1.25);
      expect(total).toBe(2.0);

      // Empty / undefined inputs
      expect(calculateRepairCostTotal([], null)).toBe(0);
      expect(calculateRepairCostTotal(undefined, undefined)).toBe(0);
      expect(calculateRepairCostTotal(undefined, 89.99)).toBe(89.99);
    });

    it('ADV-NRM-01: Normalizers handle canonical, alias, and fallback inputs safely', () => {
      expect(normalizeRepairStatus('in_repair')).toBe('Under Repair');
      expect(normalizeRepairStatus('ready')).toBe('Operational');
      expect(normalizeRepairStatus('unknown_status_xyz')).toBe('Under Repair');

      expect(normalizeRepairPriority('critical')).toBe('Critical');
      expect(normalizeRepairPriority('med')).toBe('Medium');
      expect(normalizeRepairPriority(null)).toBe('Low');

      expect(normalizeRepairBillingStatus('invoiced')).toBe('Invoiced');
      expect(normalizeRepairBillingStatus(null)).toBe('None');

      expect(normalizeEquipmentCondition('available')).toBe('Available to Use');
      expect(normalizeEquipmentCondition(null)).toBe('Out of Service');

      expect(formatRepairNumber(1042)).toBe('#1042');
      expect(formatRepairNumber(null)).toBe('—');
      expect(formatRepairNumber(undefined)).toBe('—');

      expect(getStatusBadgeVariant('Under Repair')).toBe('warning');
      expect(getStatusBadgeVariant('Operational')).toBe('success');
      expect(getPriorityBadgeVariant('Critical')).toBe('destructive');

      const iso = '2026-08-25T12:00:00.000Z';
      expect(normalizeDateToISO(iso)).toBe(iso);
      expect(normalizeDate(new Date(iso))).toBe(iso);
      expect(normalizeDateToISO(null)).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 4: MULTI-TENANT ISOLATION & SERVICE LAYER ADVERSARIAL SECURITY (ADV-SEC)
  // ==========================================================================
  describe('ADV-SEC: Multi-Tenant Data Isolation & Firestore Integrity', () => {
    it('ADV-SEC-01: subscribeTenantRepairTickets strictly drops foreign tenant documents leaked in snapshot', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_q: any, cb: any) => {
        snapshotCallback = cb;
        return jest.fn();
      });

      const onUpdate = jest.fn();
      subscribeTenantRepairTickets('tenant-target', onUpdate);

      // Simulate a malicious/compromised Firestore snapshot injecting 3 foreign tenant documents
      const dirtySnapshot = [
        {
          id: 'doc-target-1',
          data: () => ({ id: 'doc-target-1', tenantId: 'tenant-target', equipment: { name: 'Valid Target' } }),
        },
        {
          id: 'doc-attacker-1',
          data: () => ({ id: 'doc-attacker-1', tenantId: 'tenant-victim-corp', equipment: { name: 'Victim Secret Item' } }),
        },
        {
          id: 'doc-attacker-2',
          data: () => ({ id: 'doc-attacker-2', tenantId: 'tenant-competitor', equipment: { name: 'Competitor Secret Console' } }),
        },
      ];
      snapshotCallback(dirtySnapshot);

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const emittedTickets: RepairTicket[] = onUpdate.mock.calls[0][0];
      expect(emittedTickets).toHaveLength(1);
      expect(emittedTickets[0].id).toBe('doc-target-1');
      expect(emittedTickets[0].equipment.name).toBe('Valid Target');
      expect(emittedTickets.some((t) => t.tenantId !== 'tenant-target')).toBe(false);
    });

    it('ADV-SEC-02: subscribeSingleRepairTicket denies access and emits null when tenant ID mismatches', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      mockFirestore.onSnapshot.mockImplementation((_ref: any, cb: any) => {
        snapshotCallback = cb;
        return jest.fn();
      });

      const onUpdate = jest.fn();
      subscribeSingleRepairTicket('ticket-secret-99', 'tenant-intruder', onUpdate);

      // Snapshot contains valid ticket but for victim tenant
      const foreignSnap = {
        exists: () => true,
        id: 'ticket-secret-99',
        data: () => ({
          id: 'ticket-secret-99',
          tenantId: 'tenant-victim',
          equipment: { name: 'Top Secret Stage Laser' },
        }),
      };
      snapshotCallback(foreignSnap);

      expect(onUpdate).toHaveBeenCalledWith(null);
    });

    it('ADV-SEC-03: getRepairTicket rejects cross-tenant retrieval and returns null', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        id: 'ticket-101',
        data: () => ({
          id: 'ticket-101',
          tenantId: 'tenant-victim',
          equipment: { name: 'Confidential Gear' },
        }),
      });

      const res = await getRepairTicket('ticket-101', 'tenant-attacker');
      expect(res).toBeNull();
    });

    it('ADV-SEC-04: updateRepairTicketStatus rejects unauthorized cross-tenant modification and does not mutate DB', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-victim',
          status: 'Under Repair',
        }),
      });

      const res = await updateRepairTicketStatus(
        'ticket-victim-1',
        'Operational',
        { name: 'Attacker Tech' },
        'tenant-attacker',
        'Malicious status override'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Repair ticket not found or unauthorized');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
      expect(mockRtdb.set).not.toHaveBeenCalled();
    });

    it('ADV-SEC-05: appendRepairAction and appendRepairNote reject cross-tenant injection', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ tenantId: 'tenant-victim' }),
      });

      await expect(
        appendRepairAction('ticket-1', 'Malicious action', { name: 'Attacker' }, 'tenant-attacker')
      ).rejects.toThrow('Repair ticket not found or unauthorized');

      await expect(
        appendRepairNote('ticket-1', 'Malicious note', { name: 'Attacker' }, 'tenant-attacker')
      ).rejects.toThrow('Repair ticket not found or unauthorized');

      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('ADV-SEC-06: mapFirestoreRepairTicketDoc defends against prototype pollution and malformed fields', () => {
      const evilDoc = {
        id: 'ticket-evil',
        data: () => ({
          id: 'ticket-evil',
          tenantId: 'tenant-1',
          __proto__: { isAdmin: true },
          equipment: {
            name: 'Injected Fixture',
            __proto__: { isRoot: true },
          },
          actions: 'MALFORMED_NON_ARRAY',
          notes: 123456,
          attachments: null,
          partsUsed: false,
          costs: 'not_a_number',
        }),
      };

      const mapped = mapFirestoreRepairTicketDoc(evilDoc);
      expect(mapped.id).toBe('ticket-evil');
      expect(mapped.tenantId).toBe('tenant-1');
      expect(mapped.equipment.name).toBe('Injected Fixture');
      expect(mapped.actions).toEqual([]);
      expect(mapped.notes).toEqual([]);
      expect(mapped.attachments).toEqual([]);
      expect(mapped.partsUsed).toEqual([]);
      expect(mapped.costs).toBe(0);
      expect((mapped as any).isAdmin).toBeUndefined();
    });

    it('ADV-SEC-07: syncRepairToRtdbLedger safely releases reservation ledger on operational completion', async () => {
      await syncRepairToRtdbLedger('tenant-alpha', 'ticket-42', 'eq-100', 'Available to Use', 1);
      expect(mockRtdb.set).toHaveBeenCalledWith(expect.anything(), null);

      // Safe with null equipment
      await syncRepairToRtdbLedger('tenant-alpha', 'ticket-42', null, 'Out of Service', 1);
      expect(mockRtdb.set).toHaveBeenCalledWith(expect.anything(), null);
    });

    it('ADV-SEC-08: updateEquipmentRepairCondition safely handles equipment without serial numbers or mismatched serial', async () => {
      mockFirestore.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-alpha',
          serialNumbers: [
            { serial: 'SN-REAL-001', status: 'Available' },
          ],
        }),
      });

      // Update with non-matching serial should not throw or alter existing serials
      await updateEquipmentRepairCondition(
        'eq-1',
        'tenant-alpha',
        'Out of Service',
        'Under Repair',
        'SN-NON-EXISTENT'
      );

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          serialNumbers: [{ serial: 'SN-REAL-001', status: 'Available' }],
        })
      );
    });
  });
});
