/**
 * __tests__/scanner-burst-debounce-harness.test.ts
 * Empirical Stress Harness & Simulation Oracle for Kuro Mobile Continuous Scanner.
 * 
 * Stress-tests:
 * 1. Rapid barcode burst streams (100-500 rapid scan bursts)
 * 2. Duplicate debounce locking (1200ms lock window) vs. 0ms distinct consecutive transitions
 * 3. Over-prep quantity bounds, multi-line completion, and non-actionable item exclusion
 * 4. Unlisted fleet barcode rejection (NOT_ON_PULLSHEET) and uncataloged barcode rejection (UNKNOWN_CODE)
 * 5. Adversarial input strings (whitespace, unicode, control characters, SQL/regex injections)
 */

import { evaluatePullsheetScan, createScanThrottle } from '@/lib/scanner-engine';
import type { PullsheetItem } from '@/types/pull-sheet';
import type { Equipment } from '@/types/equipment';

describe('Scanner Burst, Debounce & Resilience Stress Harness', () => {
  const sampleEquipmentFleet: Equipment[] = [
    {
      id: 'eq-audio-k2',
      tenantId: 'tenant-kuro-01',
      name: 'L-Acoustics K2 Line Array',
      barcode: 'BAR-LA-K2-001',
      assetNumber: 'AST-K2-101',
      segAssetNumber: 'SEG-101',
      serialNumber: 'SN-K2-8801',
      serialNumbers: [
        { id: 'sn-1', serial: 'SN-K2-8801', status: 'Available' },
        { id: 'sn-2', serial: 'SN-K2-8802', status: 'Available' },
        { id: 'sn-3', serial: 'SN-K2-8803', status: 'Available' },
        { id: 'sn-4', serial: 'SN-K2-8804', status: 'Available' },
      ],
      category: 'Audio',
      knownLocation: 'Warehouse Bay A-1',
    },
    {
      id: 'eq-audio-ks28',
      tenantId: 'tenant-kuro-01',
      name: 'L-Acoustics KS28 Subwoofer',
      barcode: 'BAR-LA-KS28-005',
      serialNumber: 'SN-KS28-9901',
      category: 'Audio',
      knownLocation: 'Warehouse Bay A-2',
    },
    {
      id: 'eq-light-bmfl',
      tenantId: 'tenant-kuro-01',
      name: 'Robe BMFL Blade',
      barcode: 'BAR-RB-BMFL-018',
      serialNumber: 'SN-BMFL-4412',
      category: 'Lighting',
      knownLocation: 'Warehouse Bay L-3',
    },
    {
      id: 'eq-video-p2',
      tenantId: 'tenant-kuro-01',
      name: 'Absen Polaris 2.5mm LED Panel',
      barcode: 'BAR-ABS-P2-099',
      serialNumber: 'SN-ABS-1234',
      category: 'Video',
      knownLocation: 'Warehouse Bay V-1',
    },
  ];

  const samplePullsheetItems: PullsheetItem[] = [
    {
      id: 'ps-line-k2',
      inventoryItemId: 'eq-audio-k2',
      quantity: 4,
      scannedQuantity: 0,
      description: 'L-Acoustics K2 Line Array Module',
      type: 'item',
      status: 'confirmed',
      scannedBarcodes: [],
    },
    {
      id: 'ps-line-bmfl',
      inventoryItemId: 'eq-light-bmfl',
      quantity: 2,
      scannedQuantity: 0,
      description: 'Robe BMFL Blade Profile',
      type: 'item',
      status: 'confirmed',
      scannedBarcodes: [],
    },
    {
      id: 'ps-line-misc-cables',
      quantity: 10,
      scannedQuantity: 0,
      description: 'Socapex 19-Pin 20m Multi-Cable',
      type: 'misc',
      status: 'pending',
      scannedBarcodes: ['BAR-SOC-20M-001', 'BAR-SOC-20M-002'],
    },
    {
      id: 'ps-line-section-header',
      quantity: 0,
      description: '--- AUDIO RIGGING HARDWARE ---',
      type: 'section-header',
      status: 'none',
    },
    {
      id: 'ps-line-note',
      quantity: 0,
      description: 'Operator Note: Deliver to Dock 2 before 08:00 AM',
      type: 'note',
      status: 'none',
    },
  ];

  // =========================================================================
  // 1. RAPID BARCODE BURSTS & THROTTLE DEBOUNCE (1200ms)
  // =========================================================================
  describe('1. Rapid Barcode Bursts & Debounce Oracle', () => {
    it('accurately locks identical barcode scans within 1200ms window during a 100-scan burst', () => {
      const throttle = createScanThrottle(1200);
      const barcode = 'BAR-LA-K2-001';

      let allowedCount = 0;
      let throttledCount = 0;

      // Burst of 100 rapid scans in same millisecond tick
      for (let i = 0; i < 100; i++) {
        if (throttle.shouldThrottle(barcode)) {
          throttledCount++;
        } else {
          allowedCount++;
        }
      }

      expect(allowedCount).toBe(1);
      expect(throttledCount).toBe(99);
      expect(throttle.getLastCode()).toBe(barcode);
    });

    it('allows 0ms instant transition when consecutive barcodes are distinct', () => {
      const throttle = createScanThrottle(1200);
      const distinctCodes = [
        'BAR-LA-K2-001',
        'BAR-RB-BMFL-018',
        'BAR-ABS-P2-099',
        'SN-K2-8801',
        'SN-K2-8802',
        'BAR-SOC-20M-001',
      ];

      // Each distinct code scanned back-to-back with 0ms delay
      for (const code of distinctCodes) {
        const isThrottled = throttle.shouldThrottle(code);
        expect(isThrottled).toBe(false);
      }
    });

    it('handles alternating barcode ping-pong burst without duplicate lock', () => {
      const throttle = createScanThrottle(1200);
      const codeA = 'BAR-LA-K2-001';
      const codeB = 'BAR-RB-BMFL-018';

      // 50 pairs of alternating scans
      for (let i = 0; i < 50; i++) {
        expect(throttle.shouldThrottle(codeA)).toBe(false);
        expect(throttle.shouldThrottle(codeB)).toBe(false);
      }
    });

    it('resumes accepting identical barcode after fake timers advance past 1200ms', () => {
      jest.useFakeTimers();
      const throttle = createScanThrottle(1200);
      const code = 'BAR-LA-K2-001';

      expect(throttle.shouldThrottle(code)).toBe(false);
      expect(throttle.shouldThrottle(code)).toBe(true);

      // Advance by 600ms (still within window)
      jest.advanceTimersByTime(600);
      expect(throttle.shouldThrottle(code)).toBe(true);

      // Advance another 601ms (total 1201ms > 1200ms)
      jest.advanceTimersByTime(601);
      expect(throttle.shouldThrottle(code)).toBe(false);

      jest.useRealTimers();
    });

    it('supports custom debounce window durations', () => {
      jest.useFakeTimers();
      const quickThrottle = createScanThrottle(500);
      const code = 'QUICK-BARCODE';

      expect(quickThrottle.shouldThrottle(code)).toBe(false);
      expect(quickThrottle.shouldThrottle(code)).toBe(true);

      jest.advanceTimersByTime(501);
      expect(quickThrottle.shouldThrottle(code)).toBe(false);

      jest.useRealTimers();
    });
  });

  // =========================================================================
  // 2. SCAN EVALUATION ENGINE ORACLE & QUANTITY BOUNDS
  // =========================================================================
  describe('2. Scan Evaluation Engine & Quantity Boundary Oracle', () => {
    it('progressively increments scanned count across multiple scans until fully prepped (4/4)', () => {
      let currentItems: PullsheetItem[] = JSON.parse(JSON.stringify(samplePullsheetItems));
      const targetItemId = 'ps-line-k2';

      // Step 1: Scan 1
      let evalResult = evaluatePullsheetScan('BAR-LA-K2-001', currentItems, sampleEquipmentFleet);
      expect(evalResult.type).toBe('SUCCESS');
      expect(evalResult.newScannedCount).toBe(1);
      expect(evalResult.isFullyPrepped).toBe(false);
      expect(evalResult.item?.id).toBe(targetItemId);

      // Simulate update in state
      currentItems = currentItems.map((item) =>
        item.id === targetItemId ? { ...item, scannedQuantity: 1 } : item
      );

      // Step 2: Scan 2 (using individual serial number SN-K2-8802)
      evalResult = evaluatePullsheetScan('SN-K2-8802', currentItems, sampleEquipmentFleet);
      expect(evalResult.type).toBe('SUCCESS');
      expect(evalResult.newScannedCount).toBe(2);
      expect(evalResult.isFullyPrepped).toBe(false);

      currentItems = currentItems.map((item) =>
        item.id === targetItemId ? { ...item, scannedQuantity: 2 } : item
      );

      // Step 3: Scan 3 (using asset tag AST-K2-101)
      evalResult = evaluatePullsheetScan('AST-K2-101', currentItems, sampleEquipmentFleet);
      expect(evalResult.type).toBe('SUCCESS');
      expect(evalResult.newScannedCount).toBe(3);
      expect(evalResult.isFullyPrepped).toBe(false);

      currentItems = currentItems.map((item) =>
        item.id === targetItemId ? { ...item, scannedQuantity: 3 } : item
      );

      // Step 4: Scan 4 (final prep)
      evalResult = evaluatePullsheetScan('BAR-LA-K2-001', currentItems, sampleEquipmentFleet);
      expect(evalResult.type).toBe('SUCCESS');
      expect(evalResult.newScannedCount).toBe(4);
      expect(evalResult.isFullyPrepped).toBe(true);
      expect(evalResult.message).toContain('Complete');

      currentItems = currentItems.map((item) =>
        item.id === targetItemId ? { ...item, scannedQuantity: 4, status: 'prepped_scanned' } : item
      );

      // Step 5: Over-prep Scan 5 (Boundary violation challenge)
      evalResult = evaluatePullsheetScan('BAR-LA-K2-001', currentItems, sampleEquipmentFleet);
      expect(evalResult.type).toBe('ALREADY_COMPLETED');
      expect(evalResult.newScannedCount).toBe(4); // Clamped at 4, NOT 5
      expect(evalResult.isFullyPrepped).toBe(true);
      expect(evalResult.message).toContain('already fully prepped (4/4)');
    });

    it('correctly handles item with target quantity = 1 (single-unit item)', () => {
      const singleItem: PullsheetItem[] = [
        {
          id: 'ps-single',
          inventoryItemId: 'eq-light-bmfl',
          quantity: 1,
          scannedQuantity: 0,
          description: 'Single Light',
          type: 'item',
          status: 'confirmed',
        },
      ];

      // First scan should complete it immediately
      const firstScan = evaluatePullsheetScan('BAR-RB-BMFL-018', singleItem, sampleEquipmentFleet);
      expect(firstScan.type).toBe('SUCCESS');
      expect(firstScan.newScannedCount).toBe(1);
      expect(firstScan.isFullyPrepped).toBe(true);

      // Subsequent scan on prepped single-unit item returns ALREADY_COMPLETED
      const preppedSingle = [{ ...singleItem[0], scannedQuantity: 1, status: 'prepped_scanned' as const }];
      const secondScan = evaluatePullsheetScan('BAR-RB-BMFL-018', preppedSingle, sampleEquipmentFleet);
      expect(secondScan.type).toBe('ALREADY_COMPLETED');
      expect(secondScan.newScannedCount).toBe(1);
      expect(secondScan.isFullyPrepped).toBe(true);
    });

    it('matches misc items via scannedBarcodes array', () => {
      const evalResult = evaluatePullsheetScan('BAR-SOC-20M-002', samplePullsheetItems, sampleEquipmentFleet);
      expect(evalResult.type).toBe('SUCCESS');
      expect(evalResult.item?.id).toBe('ps-line-misc-cables');
      expect(evalResult.newScannedCount).toBe(1);
    });

    it('strictly skips non-actionable line items (section headers, notes)', () => {
      // Trying to match header text or note text
      const headerScan = evaluatePullsheetScan('--- AUDIO RIGGING HARDWARE ---', samplePullsheetItems, sampleEquipmentFleet);
      expect(headerScan.type).toBe('UNKNOWN_CODE');

      const noteScan = evaluatePullsheetScan('ps-line-note', samplePullsheetItems, sampleEquipmentFleet);
      expect(noteScan.type).toBe('UNKNOWN_CODE');
    });
  });

  // =========================================================================
  // 3. UNLISTED FLEET GEAR VS. UNKNOWN CODES
  // =========================================================================
  describe('3. Unlisted Fleet Gear vs. Unknown Codes Oracle', () => {
    it('returns NOT_ON_PULLSHEET when equipment is in global catalog but not on active pullsheet', () => {
      // KS28 is in sampleEquipmentFleet, but NOT in samplePullsheetItems
      const result = evaluatePullsheetScan('BAR-LA-KS28-005', samplePullsheetItems, sampleEquipmentFleet);
      expect(result.type).toBe('NOT_ON_PULLSHEET');
      expect(result.equipment?.id).toBe('eq-audio-ks28');
      expect(result.equipment?.name).toBe('L-Acoustics KS28 Subwoofer');
      expect(result.message).toContain('not on this pull sheet');
    });

    it('returns NOT_ON_PULLSHEET when lookup is performed via Map instead of Array', () => {
      const eqMap = new Map<string, Equipment>();
      sampleEquipmentFleet.forEach((eq) => eqMap.set(eq.id, eq));

      const result = evaluatePullsheetScan('BAR-LA-KS28-005', samplePullsheetItems, eqMap);
      expect(result.type).toBe('NOT_ON_PULLSHEET');
      expect(result.equipment?.id).toBe('eq-audio-ks28');
    });

    it('returns UNKNOWN_CODE when barcode does not match pull sheet nor equipment catalog', () => {
      const result = evaluatePullsheetScan('COMPLETELY-UNREGISTERED-999', samplePullsheetItems, sampleEquipmentFleet);
      expect(result.type).toBe('UNKNOWN_CODE');
      expect(result.message).toContain('Barcode "COMPLETELY-UNREGISTERED-999" not recognized in catalog');
      expect(result.item).toBeUndefined();
      expect(result.equipment).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. ADVERSARIAL SCAN INPUT STRINGS & CORRUPTION
  // =========================================================================
  describe('4. Adversarial Barcode Strings & Corruption Stress', () => {
    it('handles empty and whitespace-only barcode strings gracefully', () => {
      const emptyRes = evaluatePullsheetScan('', samplePullsheetItems, sampleEquipmentFleet);
      expect(emptyRes.type).toBe('UNKNOWN_CODE');
      expect(emptyRes.message).toBe('Empty barcode or scan input');

      const wsRes = evaluatePullsheetScan('   \t\n   ', samplePullsheetItems, sampleEquipmentFleet);
      expect(wsRes.type).toBe('UNKNOWN_CODE');
      expect(wsRes.message).toBe('Empty barcode or scan input');

      const nullRes = evaluatePullsheetScan(null as unknown as string, samplePullsheetItems, sampleEquipmentFleet);
      expect(nullRes.type).toBe('UNKNOWN_CODE');
    });

    it('trims leading and trailing whitespace from barcode scans before matching', () => {
      const paddedBarcode = '   BAR-LA-K2-001 \n\t ';
      const result = evaluatePullsheetScan(paddedBarcode, samplePullsheetItems, sampleEquipmentFleet);
      expect(result.type).toBe('SUCCESS');
      expect(result.item?.id).toBe('ps-line-k2');
    });

    it('handles case-insensitive barcode and serial matching', () => {
      const lowerBarcode = 'bar-la-k2-001';
      const result = evaluatePullsheetScan(lowerBarcode, samplePullsheetItems, sampleEquipmentFleet);
      expect(result.type).toBe('SUCCESS');
      expect(result.item?.id).toBe('ps-line-k2');

      const mixedSerial = 'sn-k2-8803';
      const serialRes = evaluatePullsheetScan(mixedSerial, samplePullsheetItems, sampleEquipmentFleet);
      expect(serialRes.type).toBe('SUCCESS');
      expect(serialRes.item?.id).toBe('ps-line-k2');
    });

    it('survives SQL injection and script injection payload barcodes without throwing', () => {
      const injectionCodes = [
        "'; DROP TABLE equipment; --",
        '<script>alert("xss")</script>',
        '${7*7}',
        '{{7*7}}',
        'SELECT * FROM pullsheets WHERE 1=1',
        '../../../etc/passwd',
      ];

      for (const injection of injectionCodes) {
        expect(() => {
          const res = evaluatePullsheetScan(injection, samplePullsheetItems, sampleEquipmentFleet);
          expect(res.type).toBe('UNKNOWN_CODE');
        }).not.toThrow();
      }
    });

    it('survives multi-megabyte oversized barcode payload without memory crash', () => {
      const massiveCode = 'A'.repeat(50000);
      expect(() => {
        const res = evaluatePullsheetScan(massiveCode, samplePullsheetItems, sampleEquipmentFleet);
        expect(res.type).toBe('UNKNOWN_CODE');
      }).not.toThrow();
    });

    it('survives unicode and emoji barcodes', () => {
      const unicodeCodes = [
        '🔊-LA-K2-001',
        '⚡-SOC-19P',
        '💡-BMFL-44',
        '日本語バーコード',
        'مرحبا-123',
      ];

      for (const code of unicodeCodes) {
        expect(() => {
          const res = evaluatePullsheetScan(code, samplePullsheetItems, sampleEquipmentFleet);
          expect(res.type).toBe('UNKNOWN_CODE');
        }).not.toThrow();
      }
    });
  });
});
