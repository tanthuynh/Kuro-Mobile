/**
 * __tests__/scanner-engine.test.ts
 * Comprehensive test suite for barcode evaluation engine and continuous scan throttle.
 */

import { evaluatePullsheetScan, createScanThrottle } from '@/lib/scanner-engine';
import type { PullsheetItem } from '@/types/pull-sheet';
import type { Equipment } from '@/types/equipment';

describe('scanner-engine', () => {
  const mockEquipmentList: Equipment[] = [
    {
      id: 'eq-k2',
      tenantId: 'tenant-123',
      name: 'L-Acoustics K2',
      manufacturer: 'L-Acoustics',
      model: 'K2',
      barcode: 'BAR-LA-K2-001',
      assetNumber: 'AST-K2-101',
      segAssetNumber: 'SEG-101',
      serialNumber: 'SN-K2-9901',
      serialNumbers: [
        { id: 'sn-1', serial: 'SN-K2-9901', status: 'Available' },
        { id: 'sn-2', serial: 'SN-K2-9902', status: 'Available' },
      ],
    },
    {
      id: 'eq-ks28',
      tenantId: 'tenant-123',
      name: 'L-Acoustics KS28 Subwoofer',
      manufacturer: 'L-Acoustics',
      model: 'KS28',
      barcode: 'BAR-LA-KS28-002',
      serialNumber: 'SN-KS28-5501',
    },
  ];

  const mockPullsheetItems: PullsheetItem[] = [
    {
      id: 'ps-line-1',
      inventoryItemId: 'eq-k2',
      quantity: 2,
      description: 'L-Acoustics K2 Line Array',
      type: 'item',
      status: 'confirmed',
      scannedQuantity: 0,
      scannedBarcodes: [],
    },
    {
      id: 'ps-line-2',
      quantity: 1,
      description: 'Custom DJ Booth Table',
      type: 'misc',
      status: 'pending',
      scannedQuantity: 0,
    },
  ];

  describe('evaluatePullsheetScan', () => {
    it('returns UNKNOWN_CODE for empty or whitespace-only code', () => {
      const res = evaluatePullsheetScan('', mockPullsheetItems, mockEquipmentList);
      expect(res.type).toBe('UNKNOWN_CODE');

      const res2 = evaluatePullsheetScan('   ', mockPullsheetItems, mockEquipmentList);
      expect(res2.type).toBe('UNKNOWN_CODE');
    });

    it('matches pullsheet item by linked equipment barcode (SUCCESS)', () => {
      const res = evaluatePullsheetScan('BAR-LA-K2-001', mockPullsheetItems, mockEquipmentList);
      expect(res.type).toBe('SUCCESS');
      expect(res.item?.id).toBe('ps-line-1');
      expect(res.equipment?.id).toBe('eq-k2');
      expect(res.newScannedCount).toBe(1);
      expect(res.isFullyPrepped).toBe(false);
    });

    it('matches pullsheet item by primary serial number', () => {
      const res = evaluatePullsheetScan('SN-K2-9901', mockPullsheetItems, mockEquipmentList);
      expect(res.type).toBe('SUCCESS');
      expect(res.item?.id).toBe('ps-line-1');
      expect(res.newScannedCount).toBe(1);
    });

    it('matches pullsheet item by individual serial number from serialNumbers array', () => {
      const res = evaluatePullsheetScan('SN-K2-9902', mockPullsheetItems, mockEquipmentList);
      expect(res.type).toBe('SUCCESS');
      expect(res.item?.id).toBe('ps-line-1');
      expect(res.newScannedCount).toBe(1);
    });

    it('matches pullsheet item by asset tag', () => {
      const res = evaluatePullsheetScan('AST-K2-101', mockPullsheetItems, mockEquipmentList);
      expect(res.type).toBe('SUCCESS');
      expect(res.item?.id).toBe('ps-line-1');
    });

    it('increments quantity and flags isFullyPrepped when target reached', () => {
      const itemsWithOneScanned: PullsheetItem[] = [
        {
          ...mockPullsheetItems[0],
          scannedQuantity: 1,
        },
      ];

      const res = evaluatePullsheetScan('BAR-LA-K2-001', itemsWithOneScanned, mockEquipmentList);
      expect(res.type).toBe('SUCCESS');
      expect(res.newScannedCount).toBe(2);
      expect(res.isFullyPrepped).toBe(true);
    });

    it('returns ALREADY_COMPLETED when item is already fully prepped', () => {
      const fullyPreppedItems: PullsheetItem[] = [
        {
          ...mockPullsheetItems[0],
          scannedQuantity: 2,
          status: 'prepped_scanned',
        },
      ];

      const res = evaluatePullsheetScan('BAR-LA-K2-001', fullyPreppedItems, mockEquipmentList);
      expect(res.type).toBe('ALREADY_COMPLETED');
      expect(res.item?.id).toBe('ps-line-1');
      expect(res.isFullyPrepped).toBe(true);
    });

    it('returns NOT_ON_PULLSHEET when barcode matches fleet inventory but not active pull sheet', () => {
      // KS28 is in mockEquipmentList, but not in mockPullsheetItems
      const res = evaluatePullsheetScan('BAR-LA-KS28-002', mockPullsheetItems, mockEquipmentList);
      expect(res.type).toBe('NOT_ON_PULLSHEET');
      expect(res.equipment?.id).toBe('eq-ks28');
      expect(res.message).toContain('not on this pull sheet');
    });

    it('returns UNKNOWN_CODE when barcode does not exist anywhere', () => {
      const res = evaluatePullsheetScan('COMPLETELY_RANDOM_CODE_999', mockPullsheetItems, mockEquipmentList);
      expect(res.type).toBe('UNKNOWN_CODE');
      expect(res.message).toContain('not recognized');
    });

    it('handles Map and Record input for equipmentLookup', () => {
      const eqMap = new Map<string, Equipment>();
      eqMap.set('eq-k2', mockEquipmentList[0]);

      const res = evaluatePullsheetScan('BAR-LA-K2-001', mockPullsheetItems, eqMap);
      expect(res.type).toBe('SUCCESS');
    });

    it('evaluates Confirmed target status and warns if already confirmed', () => {
      // First scan as confirmed on a pending item
      const pendingItems: PullsheetItem[] = [
        {
          ...mockPullsheetItems[0],
          status: 'pending',
        },
      ];
      const res1 = evaluatePullsheetScan('BAR-LA-K2-001', pendingItems, mockEquipmentList, 'confirmed');
      expect(res1.type).toBe('SUCCESS');
      expect(res1.targetStatus).toBe('confirmed');
      expect(res1.warningOnly).toBe(false);

      // Second scan on item that is already confirmed
      const confirmedItems: PullsheetItem[] = [
        {
          ...mockPullsheetItems[0],
          status: 'confirmed',
        },
      ];
      const res2 = evaluatePullsheetScan('BAR-LA-K2-001', confirmedItems, mockEquipmentList, 'confirmed');
      expect(res2.type).toBe('SUCCESS');
      expect(res2.warningOnly).toBe(true);
      expect(res2.message).toContain('Already confirmed');
    });

    it('evaluates Returned target status and warns if item was un-prepped', () => {
      // Un-prepped item
      const res1 = evaluatePullsheetScan('BAR-LA-K2-001', mockPullsheetItems, mockEquipmentList, 'returned');
      expect(res1.type).toBe('SUCCESS');
      expect(res1.targetStatus).toBe('returned');
      expect(res1.warningOnly).toBe(true);
      expect(res1.message).toContain('Warning: Unprepped item marked Returned');

      // Prepped item
      const preppedItems: PullsheetItem[] = [
        {
          ...mockPullsheetItems[0],
          status: 'prepped_scanned',
        },
      ];
      const res2 = evaluatePullsheetScan('BAR-LA-K2-001', preppedItems, mockEquipmentList, 'returned');
      expect(res2.type).toBe('SUCCESS');
      expect(res2.warningOnly).toBe(false);
      expect(res2.message).toContain('Returned');
    });

    it('evaluates Deprep target status: rejects un-prepped items and succeeds for prepped items', () => {
      // Un-prepped item: strictly rejected with INVALID_TRANSITION
      const res1 = evaluatePullsheetScan('BAR-LA-K2-001', mockPullsheetItems, mockEquipmentList, 'deprepped');
      expect(res1.type).toBe('INVALID_TRANSITION');
      expect(res1.message).toContain('Cannot deprep: "L-Acoustics K2 Line Array" is not currently prepped');

      // Prepped item: succeeds and resets count
      const preppedItems: PullsheetItem[] = [
        {
          ...mockPullsheetItems[0],
          scannedQuantity: 2,
          status: 'prepped_scanned',
        },
      ];
      const res2 = evaluatePullsheetScan('BAR-LA-K2-001', preppedItems, mockEquipmentList, 'deprepped');
      expect(res2.type).toBe('SUCCESS');
      expect(res2.targetStatus).toBe('deprepped');
      expect(res2.newScannedCount).toBe(0);
      expect(res2.message).toContain('Deprepped');
    });
  });

  describe('createScanThrottle', () => {
    it('allows the first scan of a barcode', () => {
      const throttle = createScanThrottle(1200);
      expect(throttle.shouldThrottle('CODE-123')).toBe(false);
    });

    it('throttles identical barcode scanned within 1200ms cooldown', () => {
      const throttle = createScanThrottle(1200);
      expect(throttle.shouldThrottle('CODE-123')).toBe(false); // First scan allowed
      expect(throttle.shouldThrottle('CODE-123')).toBe(true);  // Duplicate throttled
      expect(throttle.shouldThrottle('CODE-123')).toBe(true);  // Duplicate throttled
    });

    it('allows a different barcode immediately without throttle lock', () => {
      const throttle = createScanThrottle(1200);
      expect(throttle.shouldThrottle('CODE-123')).toBe(false);
      expect(throttle.shouldThrottle('CODE-456')).toBe(false); // Distinct code allowed immediately
    });

    it('allows identical barcode after cooldown expires', () => {
      jest.useFakeTimers();
      const throttle = createScanThrottle(1200);

      expect(throttle.shouldThrottle('CODE-123')).toBe(false);
      expect(throttle.shouldThrottle('CODE-123')).toBe(true);

      // Advance time beyond 1200ms
      jest.advanceTimersByTime(1250);

      expect(throttle.shouldThrottle('CODE-123')).toBe(false);
      jest.useRealTimers();
    });

    it('resets throttle cleanly', () => {
      const throttle = createScanThrottle(1200);
      expect(throttle.shouldThrottle('CODE-123')).toBe(false);
      expect(throttle.shouldThrottle('CODE-123')).toBe(true);

      throttle.reset();
      expect(throttle.shouldThrottle('CODE-123')).toBe(false);
    });
  });
});
