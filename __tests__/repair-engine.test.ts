/**
 * __tests__/repair-engine.test.ts
 * Comprehensive Tier 1 & Tier 2 Unit Test Suite for Kuro Mobile Repair Pure Domain Engine.
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
import type {
  RepairTicket,
  RepairStatus,
  RepairPriority,
  RepairActionLog,
  RepairAttachment,
  RepairNote,
  RepairPart,
} from '@/types/repair';

// ============================================================================
// FIXTURES & FACTORIES
// ============================================================================

const createMockTicket = (overrides: Partial<RepairTicket> = {}): RepairTicket => ({
  id: 'ticket-101',
  tenantId: 'tenant-alpha',
  repairNumber: 1042,
  rentmanId: 'rm-rep-88',
  equipment: {
    id: 'eq-robe-01',
    name: 'Robe BMFL Blade Moving Head',
    serialNumber: 'SN-ROBE-1002',
    barcode: 'BAR-ROBE-001',
    category: 'Lighting',
    knownLocation: 'Bay 4B - Faults Rack',
    venue: 'Sydney Warehouse',
    itemUsable: 'No',
    quantity: 1,
    assetNumber: 'AST-9901',
    segAssetNumber: 'SEG-881',
  },
  repairType: 'Internal Repair',
  priority: 'High',
  status: 'Under Repair',
  condition: 'Out of Service',
  billingStatus: 'Internal',
  assignee: {
    id: 'user-tech-01',
    name: 'Alex Technician',
    email: 'alex@kuro.app',
  },
  assigneeId: 'user-tech-01',
  requestedBy: 'Warehouse Crew Lead',
  supplierId: null,
  repairPeriodStart: '2026-08-25T08:00:00.000Z',
  repairPeriodEnd: '2026-08-27T17:00:00.000Z',
  notes: [
    {
      id: 'note-1',
      content: 'Tested motor calibration; pan sensor is unresponsive.',
      user: { name: 'Alex Technician', email: 'alex@kuro.app' },
      timestamp: '2026-08-25T09:00:00.000Z',
    },
  ],
  internalNotes: 'Handle with care; delicate color flags',
  attachments: [
    {
      id: 'att-1',
      type: 'Photo',
      url: 'https://storage.kuro.app/damage-1.jpg',
      fileName: 'damage-front-panel.jpg',
      notes: 'Cracked optical front lens',
      uploadedAt: '2026-08-25T08:15:00.000Z',
    },
  ],
  partsUsed: [
    {
      id: 'part-1',
      name: 'BMFL Stepper Motor #4',
      quantity: 2,
      cost: 125.0,
      supplier: 'Robe Lighting AU',
    },
  ],
  actions: [
    {
      id: 'act-1',
      user: { name: 'Alex Technician' },
      action: 'Created repair ticket for Robe BMFL',
      timestamp: '2026-08-25T08:00:00.000Z',
      tenantId: 'tenant-alpha',
    },
  ],
  internalReference: 'REF-2026-08-ROBE',
  costs: 50.0,
  source: 'Internal',
  archived: false,
  owner: 'Amia Productions',
  createdAt: '2026-08-25T08:00:00.000Z',
  updatedAt: '2026-08-25T12:00:00.000Z',
  ...overrides,
});

describe('repair-engine', () => {
  // ==========================================================================
  // 1. INPUT VALIDATION SUITE (ENG-VAL)
  // ==========================================================================
  describe('validateRepairTicketInput', () => {
    it('ENG-VAL-01: Valid full repair ticket passes validation (Tier 1)', () => {
      const validTicket = createMockTicket();
      const result = validateRepairTicketInput(validTicket);
      expect(result.isValid).toBe(true);
      expect(result.errorMessages).toHaveLength(0);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('ENG-VAL-02: Minimal required fields pass validation (Tier 1)', () => {
      const minimalTicket = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'Aputure 600d Pro' },
        requestedBy: 'Crew Chief',
      };
      const result = validateRepairTicketInput(minimalTicket);
      expect(result.isValid).toBe(true);
      expect(result.errorMessages).toHaveLength(0);
    });

    it('ENG-VAL-03: Missing equipment name fails validation (Tier 2)', () => {
      const invalid = {
        tenantId: 'tenant-alpha',
        equipment: { name: '   ' },
      };
      const result = validateRepairTicketInput(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors['equipment.name']).toBeDefined();
      expect(result.errorMessages).toContain('Equipment name is required.');
    });

    it('ENG-VAL-04: Missing equipment object fails validation (Tier 2)', () => {
      const invalid = {
        tenantId: 'tenant-alpha',
      };
      const result = validateRepairTicketInput(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors['equipment.name']).toBeDefined();
    });

    it('ENG-VAL-05: Empty tenantId fails validation (Tier 2)', () => {
      const invalid = {
        tenantId: '   ',
        equipment: { name: 'Yamaha QL5' },
      };
      const result = validateRepairTicketInput(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors['tenantId']).toBeDefined();
    });

    it('ENG-VAL-06: Empty requestedBy string fails validation (Tier 2)', () => {
      const invalid = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'Yamaha QL5' },
        requestedBy: '   ',
      };
      const result = validateRepairTicketInput(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors['requestedBy']).toBeDefined();
    });

    it('ENG-VAL-07: Inverted repair period dates (end before start) fail validation (Tier 2)', () => {
      const invalid = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'Shure Axient Receiver' },
        repairPeriodStart: '2026-08-25T10:00:00.000Z',
        repairPeriodEnd: '2026-08-20T10:00:00.000Z',
      };
      const result = validateRepairTicketInput(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors['repairPeriodEnd']).toBeDefined();
      expect(result.errorMessages).toContain('Repair End Date cannot be before Start Date.');
    });

    it('ENG-VAL-08: Same start and end dates pass validation (Tier 2)', () => {
      const valid = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'Shure Axient Receiver' },
        repairPeriodStart: '2026-08-25T10:00:00.000Z',
        repairPeriodEnd: '2026-08-25T10:00:00.000Z',
      };
      const result = validateRepairTicketInput(valid);
      expect(result.isValid).toBe(true);
    });

    it('ENG-VAL-09: Negative costs fail validation (Tier 2)', () => {
      const invalid = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'GrandMA3 Console' },
        costs: -45.5,
      };
      const result = validateRepairTicketInput(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors['costs']).toBeDefined();
      expect(result.errorMessages).toContain('Cost cannot be negative.');
    });

    it('ENG-VAL-10: Equipment quantity less than 1 fails validation (Tier 2)', () => {
      const invalidZero = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'L-Acoustics K2', quantity: 0 },
      };
      const resultZero = validateRepairTicketInput(invalidZero);
      expect(resultZero.isValid).toBe(false);
      expect(resultZero.errors['equipment.quantity']).toBeDefined();

      const invalidNeg = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'L-Acoustics K2', quantity: -3 },
      };
      const resultNeg = validateRepairTicketInput(invalidNeg);
      expect(resultNeg.isValid).toBe(false);
    });

    it('ENG-VAL-11: Invalid attachment URL or type fails validation (Tier 2)', () => {
      const invalid = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'Martin MAC Aura' },
        attachments: [
          { id: '1', type: 'INVALID_TYPE' as any, url: '' },
        ],
      };
      const result = validateRepairTicketInput(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors['attachments[0].url']).toBeDefined();
      expect(result.errors['attachments[0].type']).toBeDefined();
    });

    it('ENG-VAL-12: Invalid parts quantity or cost fails validation (Tier 2)', () => {
      const invalid = {
        tenantId: 'tenant-alpha',
        equipment: { name: 'Clay Paky Sharpy' },
        partsUsed: [
          { id: '1', name: '', quantity: 0, cost: -10 },
        ],
      };
      const result = validateRepairTicketInput(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors['partsUsed[0].name']).toBeDefined();
      expect(result.errors['partsUsed[0].quantity']).toBeDefined();
      expect(result.errors['partsUsed[0].cost']).toBeDefined();
    });

    it('ENG-VAL-13: Null, undefined, or empty payload fails gracefully without throwing (Tier 2)', () => {
      expect(() => validateRepairTicketInput(null)).not.toThrow();
      expect(() => validateRepairTicketInput(undefined)).not.toThrow();
      expect(() => validateRepairTicketInput({})).not.toThrow();

      const resNull = validateRepairTicketInput(null);
      expect(resNull.isValid).toBe(false);
      expect(resNull.errorMessages.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 2. EQUIPMENT CONDITION MAPPING SUITE (ENG-CND)
  // ==========================================================================
  describe('calculateEquipmentCondition', () => {
    it('ENG-CND-01: Under Repair maps to Out of Service (Tier 1)', () => {
      expect(calculateEquipmentCondition('Under Repair')).toBe('Out of Service');
    });

    it('ENG-CND-02: Awaiting Parts maps to Out of Service (Tier 1)', () => {
      expect(calculateEquipmentCondition('Awaiting Parts')).toBe('Out of Service');
    });

    it('ENG-CND-03: Decommissioned maps to Out of Service (Tier 1)', () => {
      expect(calculateEquipmentCondition('Decommissioned')).toBe('Out of Service');
    });

    it('ENG-CND-04: Collected maps to Out of Service (Tier 1)', () => {
      expect(calculateEquipmentCondition('Collected')).toBe('Out of Service');
    });

    it('ENG-CND-05: Archived maps to Out of Service (Tier 1)', () => {
      expect(calculateEquipmentCondition('Archived')).toBe('Out of Service');
    });

    it('ENG-CND-06: Operational maps to Available to Use (Tier 1)', () => {
      expect(calculateEquipmentCondition('Operational')).toBe('Available to Use');
    });

    it('ENG-CND-07: Completed maps to Available to Use (Tier 1)', () => {
      expect(calculateEquipmentCondition('Completed')).toBe('Available to Use');
    });

    it('ENG-CND-08: Returned maps to Available to Use (Tier 1)', () => {
      expect(calculateEquipmentCondition('Returned')).toBe('Available to Use');
    });

    it('ENG-CND-09: Case-insensitive and trimmed status strings normalize correctly (Tier 2)', () => {
      expect(calculateEquipmentCondition('  under repair  ')).toBe('Out of Service');
      expect(calculateEquipmentCondition('AWAITING PARTS')).toBe('Out of Service');
      expect(calculateEquipmentCondition('operational')).toBe('Available to Use');
      expect(calculateEquipmentCondition('  COMPLETED  ')).toBe('Available to Use');
    });

    it('ENG-CND-10: Unknown, null, or undefined status defaults safely to Out of Service (Tier 2)', () => {
      expect(calculateEquipmentCondition(null)).toBe('Out of Service');
      expect(calculateEquipmentCondition(undefined)).toBe('Out of Service');
      expect(calculateEquipmentCondition('')).toBe('Out of Service');
      expect(calculateEquipmentCondition('UNKNOWN_CORRUPTED_STATUS')).toBe('Out of Service');
    });
  });

  // ==========================================================================
  // 3. STATE MACHINE & STATUS TRANSITIONS SUITE (ENG-TRN)
  // ==========================================================================
  describe('isValidStatusTransition & getNextRepairStatus', () => {
    it('ENG-TRN-01: Under Repair transitions are valid (Tier 1)', () => {
      expect(isValidStatusTransition('Under Repair', 'Pending')).toBe(true);
      expect(isValidStatusTransition('Under Repair', 'Completed')).toBe(true);
      expect(isValidStatusTransition('Under Repair', 'Reported')).toBe(true);
    });

    it('ENG-TRN-02: Pending transitions are valid (Tier 1)', () => {
      expect(isValidStatusTransition('Pending', 'Under Repair')).toBe(true);
      expect(isValidStatusTransition('Pending', 'Completed')).toBe(true);
      expect(isValidStatusTransition('Pending', 'Reported')).toBe(true);
    });

    it('ENG-TRN-03: Completed transitions are valid (Tier 1)', () => {
      expect(isValidStatusTransition('Completed', 'Under Repair')).toBe(true);
      expect(isValidStatusTransition('Completed', 'Pending')).toBe(true);
      expect(isValidStatusTransition('Completed', 'Reported')).toBe(true);
    });

    it('ENG-TRN-04: Reported transitions are valid (Tier 1)', () => {
      expect(isValidStatusTransition('Reported', 'Pending')).toBe(true);
      expect(isValidStatusTransition('Reported', 'Under Repair')).toBe(true);
      expect(isValidStatusTransition('Reported', 'Completed')).toBe(true);
    });

    it('ENG-TRN-06: Identity self-transitions are valid and idempotent (Tier 1)', () => {
      CANONICAL_REPAIR_STATUSES.forEach((status) => {
        expect(isValidStatusTransition(status, status)).toBe(true);
      });
    });

    it('ENG-TRN-07: Illegal transitions with unknown statuses are rejected (Tier 2)', () => {
      expect(isValidStatusTransition('InvalidStatus', 'Pending')).toBe(false);
      expect(isValidStatusTransition('Pending', 'UnknownStatus')).toBe(false);
    });

    it('ENG-TRN-08: Corrupted/invalid/null status inputs return false without throwing (Tier 2)', () => {
      expect(isValidStatusTransition(null, 'Completed')).toBe(false);
      expect(isValidStatusTransition('Completed', null)).toBe(false);
      expect(isValidStatusTransition('INVALID_STATUS', 'Completed')).toBe(false);
      expect(isValidStatusTransition('Completed', 'INVALID_STATUS')).toBe(false);
      expect(isValidStatusTransition('', '')).toBe(false);
    });

    it('ENG-TRN-09: getNextRepairStatus returns logical progressive lifecycle status (Tier 1)', () => {
      expect(getNextRepairStatus('Reported')).toBe('Pending');
      expect(getNextRepairStatus('Pending')).toBe('Under Repair');
      expect(getNextRepairStatus('Under Repair')).toBe('Completed');
      expect(getNextRepairStatus('Completed')).toBe('Completed');
      expect(getNextRepairStatus('UNKNOWN')).toBe('Reported');
    });

    it('ENG-TRN-10: getQuickStatusOptions returns actionable mobile options (Tier 1)', () => {
      const underRepairQuick = getQuickStatusOptions('Under Repair');
      expect(underRepairQuick).toContain('Pending');
      expect(underRepairQuick).toContain('Completed');

      const reportedQuick = getQuickStatusOptions('Reported');
      expect(reportedQuick).toContain('Pending');
      expect(reportedQuick).toContain('Under Repair');
    });
  });

  // ==========================================================================
  // 4. FILTERING & SEARCH ENGINE SUITE (ENG-FLT)
  // ==========================================================================
  describe('filterRepairTickets', () => {
    const sampleTickets: RepairTicket[] = [
      createMockTicket({
        id: 't-1',
        repairNumber: 1001,
        equipment: { name: 'Robe BMFL Blade', serialNumber: 'SN-ROBE-101', barcode: 'BAR-001' },
        status: 'Under Repair',
        priority: 'Critical',
        condition: 'Out of Service',
        billingStatus: 'Internal',
        assigneeId: 'tech-1',
        repairPeriodStart: '2026-08-20T00:00:00.000Z',
        actions: [{ id: 'act-1', user: { name: 'Alex Tech' }, action: 'Created repair ticket for Robe BMFL', timestamp: '2026-08-20T00:00:00Z', tenantId: 'tenant-alpha' }],
      }),
      createMockTicket({
        id: 't-2',
        repairNumber: 1002,
        equipment: { name: 'Aputure 600d Light', serialNumber: 'SN-APU-202', barcode: 'BAR-002' },
        status: 'Pending',
        priority: 'High',
        condition: 'Out of Service',
        billingStatus: 'Quoted',
        assigneeId: 'tech-2',
        repairPeriodStart: '2026-08-22T00:00:00.000Z',
        actions: [{ id: 'act-2', user: { name: 'Alex Tech' }, action: 'Created repair ticket for Aputure 600d', timestamp: '2026-08-22T00:00:00Z', tenantId: 'tenant-alpha' }],
      }),
      createMockTicket({
        id: 't-3',
        repairNumber: 1003,
        equipment: { name: 'Yamaha QL5 Console', serialNumber: 'SN-YAM-303', barcode: 'BAR-003' },
        status: 'Completed',
        priority: 'Medium',
        condition: 'Available to Use',
        billingStatus: 'Invoiced',
        assigneeId: 'tech-1',
        repairPeriodStart: '2026-08-24T00:00:00.000Z',
        actions: [{ id: 'act-3', user: { name: 'Alex Tech' }, action: 'Created repair ticket for Yamaha QL5', timestamp: '2026-08-24T00:00:00Z', tenantId: 'tenant-alpha' }],
      }),
      createMockTicket({
        id: 't-4',
        repairNumber: 1004,
        equipment: { name: 'L-Acoustics SB18 Sub', serialNumber: 'SN-LA-404', barcode: 'BAR-004' },
        status: 'Reported',
        priority: 'Low',
        condition: 'Available to Use',
        billingStatus: 'Internal',
        assigneeId: 'tech-3',
        repairPeriodStart: '2026-08-25T00:00:00.000Z',
        actions: [{ id: 'act-4', user: { name: 'Alex Tech' }, action: 'Created repair ticket for L-Acoustics SB18', timestamp: '2026-08-25T00:00:00Z', tenantId: 'tenant-alpha' }],
      }),
      createMockTicket({
        id: 't-5',
        repairNumber: 1005,
        equipment: { name: 'Old Fog Machine [Scrapped]', serialNumber: 'SN-FOG-505' },
        status: 'Completed',
        priority: 'None',
        condition: 'Out of Service',
        archived: true,
        actions: [{ id: 'act-5', user: { name: 'Alex Tech' }, action: 'Created repair ticket for Fog Machine', timestamp: '2026-08-10T00:00:00Z', tenantId: 'tenant-alpha' }],
      }),
    ];

    it('ENG-FLT-01: Filter by exact single status (Tier 1)', () => {
      const res = filterRepairTickets(sampleTickets, { status: 'Under Repair' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('t-1');
    });

    it('ENG-FLT-02: Filter by array of statuses (Tier 1)', () => {
      const res = filterRepairTickets(sampleTickets, {
        status: ['Under Repair', 'Pending'],
      });
      expect(res).toHaveLength(2);
      expect(res.map((t) => t.id)).toEqual(['t-1', 't-2']);
    });

    it('ENG-FLT-03: Filter by status "all" or "All" returns all active non-archived tickets (Tier 1)', () => {
      const resLower = filterRepairTickets(sampleTickets, { status: 'all' });
      expect(resLower).toHaveLength(4);

      const resUpper = filterRepairTickets(sampleTickets, { status: 'All' });
      expect(resUpper).toHaveLength(4);

      const resAllPrio = filterRepairTickets(sampleTickets, { priority: 'All' });
      expect(resAllPrio).toHaveLength(4);

      const resAllCond = filterRepairTickets(sampleTickets, { condition: 'All' });
      expect(resAllCond).toHaveLength(4);

      const resAllBill = filterRepairTickets(sampleTickets, { billingStatus: 'All' });
      expect(resAllBill).toHaveLength(4);
    });

    it('ENG-FLT-04: Filter by priority (Tier 1)', () => {
      const res = filterRepairTickets(sampleTickets, { priority: 'Critical' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('t-1');
    });

    it('ENG-FLT-05: Filter by condition (Tier 1)', () => {
      const resAvail = filterRepairTickets(sampleTickets, { condition: 'Available to Use' });
      expect(resAvail).toHaveLength(2);
      expect(resAvail.map((t) => t.id)).toEqual(['t-3', 't-4']);

      const resOut = filterRepairTickets(sampleTickets, { condition: 'Out of Service' });
      expect(resOut).toHaveLength(2); // t-1 and t-2 (t-5 is archived)
    });

    it('ENG-FLT-06: Filter by billingStatus and assigneeId (Tier 1)', () => {
      const resBilling = filterRepairTickets(sampleTickets, { billingStatus: 'Quoted' });
      expect(resBilling).toHaveLength(1);
      expect(resBilling[0].id).toBe('t-2');

      const resAssignee = filterRepairTickets(sampleTickets, { assigneeId: 'tech-1' });
      expect(resAssignee).toHaveLength(2);
      expect(resAssignee.map((t) => t.id)).toEqual(['t-1', 't-3']);
    });

    it('ENG-FLT-07: Search by Equipment Name (Tier 1)', () => {
      const res = filterRepairTickets(sampleTickets, { search: 'Aputure' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('t-2');
    });

    it('ENG-FLT-08: Search by Serial Number (Tier 1)', () => {
      const res = filterRepairTickets(sampleTickets, { search: 'SN-YAM-303' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('t-3');
    });

    it('ENG-FLT-09: Search by Barcode (Tier 1)', () => {
      const res = filterRepairTickets(sampleTickets, { search: 'BAR-004' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('t-4');
    });

    it('ENG-FLT-10: Search by Repair Ticket Number (Tier 1)', () => {
      const resNum = filterRepairTickets(sampleTickets, { search: '1001' });
      expect(resNum).toHaveLength(1);
      expect(resNum[0].id).toBe('t-1');

      const resHash = filterRepairTickets(sampleTickets, { search: '#1002' });
      expect(resHash).toHaveLength(1);
      expect(resHash[0].id).toBe('t-2');
    });

    it('ENG-FLT-11: Search with regex characters does not crash (Tier 2)', () => {
      expect(() => {
        filterRepairTickets(sampleTickets, { search: '[BMFL] (v2.0) +*?' });
      }).not.toThrow();
    });

    it('ENG-FLT-12: Search with mixed casing and whitespace (Tier 2)', () => {
      const res = filterRepairTickets(sampleTickets, { search: '   rObE bMfL   ' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('t-1');
    });

    it('ENG-FLT-13: Date range filtering (dateFrom, dateTo) (Tier 2)', () => {
      const resRange = filterRepairTickets(sampleTickets, {
        dateFrom: '2026-08-21T00:00:00.000Z',
        dateTo: '2026-08-23T23:59:59.999Z',
      });
      expect(resRange).toHaveLength(1);
      expect(resRange[0].id).toBe('t-2');
    });

    it('ENG-FLT-14: Excludes archived tickets unless includeArchived is true (Tier 2)', () => {
      const resNoArchived = filterRepairTickets(sampleTickets, {});
      expect(resNoArchived.some((t) => t.id === 't-5')).toBe(false);

      const resWithArchived = filterRepairTickets(sampleTickets, { includeArchived: true });
      expect(resWithArchived.some((t) => t.id === 't-5')).toBe(true);
    });

    it('ENG-FLT-15: Empty ticket list returns empty array (Tier 2)', () => {
      const res = filterRepairTickets([], { search: 'test' });
      expect(res).toEqual([]);
    });
  });

  // ==========================================================================
  // 5. SORTING & COST CALCULATION SUITE (ENG-SRT & ENG-CST)
  // ==========================================================================
  describe('sortRepairTickets & calculateRepairCostTotal', () => {
    const list: RepairTicket[] = [
      createMockTicket({ id: 'a', repairNumber: 100, priority: 'Low', createdAt: '2026-08-20T00:00:00Z', equipment: { name: 'Zebra Light' } }),
      createMockTicket({ id: 'b', repairNumber: 300, priority: 'Critical', createdAt: '2026-08-22T00:00:00Z', equipment: { name: 'Alpha Speaker' } }),
      createMockTicket({ id: 'c', repairNumber: 200, priority: 'Medium', createdAt: '2026-08-21T00:00:00Z', equipment: { name: 'Beta Mic' } }),
    ];

    it('ENG-SRT-01: Sorts by priority descending (Tier 1)', () => {
      const sorted = sortRepairTickets(list, 'priority', 'desc');
      expect(sorted.map((t) => t.id)).toEqual(['b', 'c', 'a']);
    });

    it('ENG-SRT-02: Sorts by repairNumber ascending (Tier 1)', () => {
      const sorted = sortRepairTickets(list, 'repairNumber', 'asc');
      expect(sorted.map((t) => t.id)).toEqual(['a', 'c', 'b']);
    });

    it('ENG-SRT-03: Sorts by equipmentName ascending (Tier 1)', () => {
      const sorted = sortRepairTickets(list, 'equipmentName', 'asc');
      expect(sorted.map((t) => t.id)).toEqual(['b', 'c', 'a']);
    });

    it('ENG-CST-01: calculateRepairCostTotal sums parts and manual costs correctly (Tier 1)', () => {
      const parts: RepairPart[] = [
        { id: '1', name: 'Lens', quantity: 2, cost: 45.5 }, // 91.0
        { id: '2', name: 'Belt', quantity: 1, cost: 15.25 }, // 15.25
      ];
      const total = calculateRepairCostTotal(parts, 50.0);
      expect(total).toBe(156.25);
    });

    it('ENG-CST-02: calculateRepairCostTotal handles empty or missing inputs safely (Tier 2)', () => {
      expect(calculateRepairCostTotal(undefined, null)).toBe(0);
      expect(calculateRepairCostTotal([], 0)).toBe(0);
      expect(calculateRepairCostTotal(undefined, 75.5)).toBe(75.5);
    });
  });

  // ==========================================================================
  // 6. ACTION LOG GENERATION & NORMALIZATION SUITE (ENG-ACT & ENG-NRM)
  // ==========================================================================
  describe('createActionLogEntry & normalizers', () => {
    it('ENG-ACT-01: createActionLogEntry generates valid audit record (Tier 1)', () => {
      const user = { id: 'u-1', name: 'Sarah Tech', email: 'sarah@kuro.app' };
      const entry = createActionLogEntry(user, 'Replaced fuse', 'tenant-1');

      expect(entry.id).toMatch(/^act_\d+_/);
      expect(entry.user.name).toBe('Sarah Tech');
      expect(entry.user.id).toBe('u-1');
      expect(entry.action).toBe('Replaced fuse');
      expect(entry.tenantId).toBe('tenant-1');
      expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
    });

    it('ENG-ACT-02: createActionLogEntry handles missing user details with fallback (Tier 2)', () => {
      const entry = createActionLogEntry(null, 'Checked power');
      expect(entry.user.name).toBe('Technician');
      expect(entry.action).toBe('Checked power');
    });

    it('ENG-ACT-03: Successive generated action IDs are unique (Tier 2)', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const entry = createActionLogEntry({ name: 'Tech' }, `Action ${i}`);
        ids.add(entry.id);
      }
      expect(ids.size).toBe(50);
    });

    it('ENG-NRM-01: Normalizers handle canonical, alias, and fallback inputs (Tier 1)', () => {
      expect(normalizeRepairStatus('in_repair')).toBe('Under Repair');
      expect(normalizeRepairStatus('ready')).toBe('Completed');
      expect(normalizeRepairStatus('reported')).toBe('Reported');
      expect(normalizeRepairStatus('awaiting parts')).toBe('Pending');
      expect(normalizeRepairPriority('med')).toBe('Medium');
      expect(normalizeRepairBillingStatus('invoiced')).toBe('Invoiced');
      expect(normalizeEquipmentCondition('available')).toBe('Available to Use');
    });

    it('ENG-NRM-02: formatRepairNumber formats numbers and handles nulls (Tier 1)', () => {
      expect(formatRepairNumber(1042)).toBe('#1042');
      expect(formatRepairNumber(42, 'REP-')).toBe('REP-42');
      expect(formatRepairNumber(null)).toBe('—');
      expect(formatRepairNumber(undefined)).toBe('—');
    });

    it('ENG-NRM-03: Badge variants resolve properly (Tier 1)', () => {
      expect(getStatusBadgeVariant('Under Repair')).toBe('destructive');
      expect(getStatusBadgeVariant('Completed')).toBe('success');
      expect(getStatusBadgeVariant('Reported')).toBe('info');
      expect(getStatusBadgeVariant('Pending')).toBe('warning');
      expect(getPriorityBadgeVariant('Critical')).toBe('destructive');
      expect(getPriorityBadgeVariant('High')).toBe('warning');
      expect(getPriorityBadgeVariant('Low')).toBe('info');
    });

    it('ENG-NRM-04: normalizeDate and normalizeDateToISO handle varied inputs (Tier 2)', () => {
      const iso = '2026-08-25T12:00:00.000Z';
      expect(normalizeDateToISO(iso)).toBe(iso);
      expect(normalizeDate(new Date(iso))).toBe(iso);
      expect(normalizeDateToISO(null)).toBeNull();
      expect(normalizeDateToISO('invalid-date')).toBeNull();
    });
  });
});
