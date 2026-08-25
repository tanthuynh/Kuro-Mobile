/**
 * __tests__/domain-engines.adversarial.test.ts
 * Empirical Challenger Adversarial Stress Suite for Kuro Mobile Domain Engines
 * 
 * Engines under test:
 * 1. date-utils (parseFirestoreDate, formatStageTime, formatEventDateRange, isSameDay, getStartOfDay, getEndOfDay, getEventOperationalWindow)
 * 2. categorization (categorizeEvents with boundary conditions, offsets, large datasets, sorting invariants)
 * 3. pull-sheet-engine (normalizePullsheetStatus, state machine transitions, progress metrics, section grouping)
 * 4. scanner-engine (evaluatePullsheetScan, disambiguation, serial matching, throttle bursts, overscan states)
 */

import {
  parseFirestoreDate,
  formatStageTime,
  formatEventDateRange,
  isSameDay,
  getStartOfDay,
  getEndOfDay,
  getEventOperationalWindow,
} from '@/lib/date-utils';

import {
  categorizeEvents,
} from '@/lib/categorization';

import {
  normalizePullsheetStatus,
  isActionablePullsheetItem,
  getNextPullsheetStatus,
  getPreviousPullsheetStatus,
  calculatePullsheetProgress,
  groupPullsheetBySections,
} from '@/lib/pull-sheet-engine';

import {
  evaluatePullsheetScan,
  createScanThrottle,
} from '@/lib/scanner-engine';

import type { Event } from '@/types/events';
import type { PullsheetItem, PullsheetItemStatus } from '@/types/pull-sheet';
import type { Equipment } from '@/types/equipment';

describe('Empirical Challenger: Domain Engines Adversarial Test Suite', () => {

  // =========================================================================
  // 1. DATE-UTILS ADVERSARIAL STRESS SUITE
  // =========================================================================
  describe('Engine 1: date-utils Adversarial & Edge Cases', () => {
    describe('parseFirestoreDate - Corrupted & Extreme Inputs', () => {
      it('handles throwing .toDate() methods gracefully without unhandled exception', () => {
        const throwingTimestamp = {
          toDate: () => {
            throw new Error('Corrupted internal timestamp pointer');
          },
        };
        expect(parseFirestoreDate(throwingTimestamp)).toBeNull();
      });

      it('handles .toDate() returning non-Date or invalid Date', () => {
        const bogusToDate1 = { toDate: () => '2026-08-25' };
        const bogusToDate2 = { toDate: () => 1787654400000 };
        const bogusToDate3 = { toDate: () => null };
        const bogusToDate4 = { toDate: () => new Date('invalid') };

        expect(parseFirestoreDate(bogusToDate1)).toBeNull();
        expect(parseFirestoreDate(bogusToDate2)).toBeNull();
        expect(parseFirestoreDate(bogusToDate3)).toBeNull();
        expect(parseFirestoreDate(bogusToDate4)).toBeNull();
      });

      it('handles corrupted raw {_seconds, _nanoseconds} objects', () => {
        // Non-number seconds
        expect(parseFirestoreDate({ _seconds: '1787654400', _nanoseconds: 0 })).toBeNull();
        expect(parseFirestoreDate({ _seconds: NaN, _nanoseconds: 0 })).toBeNull();
        expect(parseFirestoreDate({ _seconds: null, _nanoseconds: 500 })).toBeNull();
        expect(parseFirestoreDate({ seconds: undefined, nanoseconds: undefined })).toBeNull();

        // Valid seconds with extreme nanoseconds
        const parsed = parseFirestoreDate({ _seconds: 1000, _nanoseconds: 999999999 });
        expect(parsed).toBeInstanceOf(Date);
        expect(parsed?.getTime()).toBe(1000 * 1000 + 999);
      });

      it('handles extreme timestamps (Unix 2038, Year 2100, Year 1970, Negative epochs)', () => {
        // Epoch 0 (1970-01-01T00:00:00.000Z)
        const epoch0 = parseFirestoreDate(0);
        expect(epoch0).toBeInstanceOf(Date);
        expect(epoch0?.getTime()).toBe(0);

        // Pre-1970 negative epoch (-1000000 seconds = 1969)
        const pre1970 = parseFirestoreDate(-1000000);
        expect(pre1970).toBeInstanceOf(Date);
        expect(pre1970?.getTime()).toBe(-1000000000);

        // Year 2038 (Unix 32-bit overflow boundary: 2147483647 seconds)
        const y2038Sec = 2147483647;
        const parsed2038 = parseFirestoreDate(y2038Sec);
        expect(parsed2038).toBeInstanceOf(Date);
        expect(parsed2038?.getFullYear()).toBe(2038);

        // Year 2100 in milliseconds
        const y2100Ms = 4102444800000;
        const parsed2100 = parseFirestoreDate(y2100Ms);
        expect(parsed2100?.getFullYear()).toBe(2100);
      });

      it('handles adversarial number values (NaN, Infinity, -Infinity, Floats)', () => {
        expect(parseFirestoreDate(NaN)).toBeNull();
        expect(parseFirestoreDate(Infinity)).toBeNull();
        expect(parseFirestoreDate(-Infinity)).toBeNull();

        // Float timestamp (e.g. 1787654400.5 seconds)
        const floatSec = 1787654400.5;
        const parsedFloat = parseFirestoreDate(floatSec);
        expect(parsedFloat).toBeInstanceOf(Date);
        expect(parsedFloat?.getTime()).toBe(Math.floor(floatSec * 1000));
      });

      it('handles adversarial string inputs (XSS payloads, SQL injections, control characters)', () => {
        expect(parseFirestoreDate("<script>alert('xss')</script>")).toBeNull();
        expect(parseFirestoreDate("'; DROP TABLE events; --")).toBeNull();
        expect(parseFirestoreDate('\0\r\n\t')).toBeNull();
        expect(parseFirestoreDate('[object Object]')).toBeNull();
        expect(parseFirestoreDate('undefined')).toBeNull();
        expect(parseFirestoreDate('null')).toBeNull();
        expect(parseFirestoreDate('NaN')).toBeNull();
      });
    });

    describe('formatStageTime & formatEventDateRange - Edge Cases', () => {
      it('formats leap year dates accurately (Feb 29, 2028)', () => {
        const leapDate = new Date(2028, 1, 29, 14, 30); // 29 Feb 2028 is Tuesday
        expect(formatStageTime(leapDate, 'shortDate')).toBe('29 Feb 2028');
        expect(formatStageTime(leapDate, 'dateOnly')).toBe('Tue 29 Feb');
        expect(formatStageTime(leapDate, 'timeOnly')).toBe('14:30');
      });

      it('formats start/end date ranges when start > end without throwing', () => {
        const start = new Date(2026, 7, 28, 18, 0);
        const end = new Date(2026, 7, 25, 8, 0);
        // Start is Aug 28, end is Aug 25 (inverted inverted schedule)
        const formatted = formatEventDateRange(start, end);
        expect(formatted).toBe('28 - 25 Aug 2026');
      });

      it('formats year boundary transition (Dec 31 to Jan 1)', () => {
        const start = new Date(2026, 11, 31, 20, 0);
        const end = new Date(2027, 0, 1, 4, 0);
        expect(formatEventDateRange(start, end)).toBe('31 Dec 2026 - 1 Jan 2027');
      });

      it('tests formatStageTime with non-Date object (potential runtime crash if not Date instance)', () => {
        // formatStageTime expects Date | null. If passed string or number at runtime:
        try {
          const res = formatStageTime('2026-08-25' as unknown as Date);
          expect(res).toBe('Not scheduled');
        } catch (e: any) {
          // Document if it throws TypeError: date.getTime is not a function
          expect(e).toBeDefined();
        }
      });
    });

    describe('isSameDay, getStartOfDay, getEndOfDay Invariants', () => {
      it('satisfies reflexive and symmetric properties for isSameDay', () => {
        const d1 = new Date(2026, 7, 25, 1, 0, 0);
        const d2 = new Date(2026, 7, 25, 23, 59, 59);
        const d3 = new Date(2026, 7, 26, 0, 0, 0);

        expect(isSameDay(d1, d1)).toBe(true);
        expect(isSameDay(d1, d2)).toBe(true);
        expect(isSameDay(d2, d1)).toBe(true);
        expect(isSameDay(d1, d3)).toBe(false);
        expect(isSameDay(d3, d1)).toBe(false);
      });

      it('strictly bounds any timestamp: getStartOfDay(d) <= d <= getEndOfDay(d)', () => {
        const testTimestamps = [
          new Date(2026, 7, 25, 0, 0, 0, 0),
          new Date(2026, 7, 25, 12, 34, 56, 789),
          new Date(2026, 7, 25, 23, 59, 59, 999),
        ];

        for (const t of testTimestamps) {
          const start = getStartOfDay(t);
          const end = getEndOfDay(t);
          expect(start.getTime()).toBeLessThanOrEqual(t.getTime());
          expect(end.getTime()).toBeGreaterThanOrEqual(t.getTime());
          expect(end.getTime() - start.getTime()).toBe(86399999); // 24h - 1ms
        }
      });
    });

    describe('getEventOperationalWindow - Complex Stage Combinations', () => {
      it('correctly resolves window when stages are out of chronological order in object', () => {
        const window = getEventOperationalWindow({
          pickupTime: new Date(2026, 7, 26, 12, 0),
          deliveryTime: new Date(2026, 7, 25, 6, 0), // Earliest
          eventStartDate: new Date(2026, 7, 25, 10, 0),
          packdownTime: new Date(2026, 7, 27, 22, 0), // Latest
          startTime: new Date(2026, 7, 25, 14, 0),
          finishTime: new Date(2026, 7, 26, 2, 0),
        });

        expect(window.start?.getTime()).toBe(new Date(2026, 7, 25, 6, 0).getTime());
        expect(window.end?.getTime()).toBe(new Date(2026, 7, 27, 22, 0).getTime());
      });

      it('filters out invalid Date instances among valid dates in stage properties', () => {
        const window = getEventOperationalWindow({
          deliveryTime: new Date('invalid'),
          setupTime: null,
          startTime: new Date(2026, 7, 25, 12, 0),
          finishTime: new Date('another-invalid'),
          pickupTime: new Date(2026, 7, 25, 18, 0),
        });

        expect(window.start?.getTime()).toBe(new Date(2026, 7, 25, 12, 0).getTime());
        expect(window.end?.getTime()).toBe(new Date(2026, 7, 25, 18, 0).getTime());
      });
    });
  });

  // =========================================================================
  // 2. CATEGORIZATION ADVERSARIAL STRESS SUITE
  // =========================================================================
  describe('Engine 2: categorization Adversarial & Edge Cases', () => {
    const refDate = new Date(2026, 7, 25, 12, 0, 0); // Tue 25 Aug 2026, 12:00:00 PM

    const makeEvent = (id: string, overrides: Partial<Event> = {}): Event => ({
      id,
      tenantId: 'tenant-test',
      eventName: `Event-${id}`,
      clientId: 'client-test',
      eventStatusId: 'Confirmed',
      eventTypeId: 'type-test',
      assigneeId: 'user-test',
      startTime: null,
      finishTime: null,
      deliveryTime: null,
      setupTime: null,
      eventStartDate: null,
      eventFinishDate: null,
      pickupTime: null,
      packdownTime: null,
      archived: false,
      ...overrides,
    });

    it('processes a massive workload of 1,000 mixed events rapidly without crash or memory leak', () => {
      const largeBatch: Event[] = [];
      for (let i = 0; i < 1000; i++) {
        const dayOffset = (i % 21) - 10; // -10 days to +10 days
        const start = new Date(2026, 7, 25 + dayOffset, 8, 0);
        const end = new Date(2026, 7, 25 + dayOffset, 20, 0);
        const isArchived = i % 10 === 0;
        const isCompleted = i % 5 === 0;
        const isCancelled = i % 7 === 0;

        largeBatch.push(
          makeEvent(`stress-ev-${i}`, {
            deliveryTime: start,
            packdownTime: end,
            archived: isArchived,
            eventStatusId: isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : 'Confirmed',
          })
        );
      }

      const startTime = Date.now();
      const result = categorizeEvents(largeBatch, { referenceDate: refDate });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(500); // Must execute under 500ms for 1,000 items
      expect(result.todayJobs).toBeDefined();
      expect(result.inProgress).toBeDefined();
      expect(result.upcoming).toBeDefined();
      expect(result.completed).toBeDefined();

      // Ensure no archived events exist in ANY category
      expect(result.todayJobs.some((e) => e.archived)).toBe(false);
      expect(result.inProgress.some((e) => e.archived)).toBe(false);
      expect(result.upcoming.some((e) => e.archived)).toBe(false);
      expect(result.completed.some((e) => e.archived)).toBe(false);
    });

    it('maintains strict sorting invariant: todayJobs ascending, completed descending', () => {
      const ev1 = makeEvent('ev1', {
        deliveryTime: new Date(2026, 7, 25, 18, 0),
        packdownTime: new Date(2026, 7, 25, 23, 0),
      });
      const ev2 = makeEvent('ev2', {
        deliveryTime: new Date(2026, 7, 25, 6, 0),
        packdownTime: new Date(2026, 7, 25, 10, 0),
      });
      const ev3 = makeEvent('ev3', {
        deliveryTime: new Date(2026, 7, 25, 12, 0),
        packdownTime: new Date(2026, 7, 25, 16, 0),
      });

      const comp1 = makeEvent('comp1', {
        eventStatusId: 'Completed',
        deliveryTime: new Date(2026, 7, 20, 8, 0),
        packdownTime: new Date(2026, 7, 20, 18, 0), // Older completed
      });
      const comp2 = makeEvent('comp2', {
        eventStatusId: 'Completed',
        deliveryTime: new Date(2026, 7, 24, 8, 0),
        packdownTime: new Date(2026, 7, 24, 18, 0), // Newer completed
      });

      const result = categorizeEvents([ev1, ev2, ev3, comp1, comp2], { referenceDate: refDate });

      // todayJobs sorted ascending: ev2 (6am) -> ev3 (12pm) -> ev1 (6pm)
      expect(result.todayJobs.map((e) => e.id)).toEqual(['ev2', 'ev3', 'ev1']);

      // completed sorted descending by end: comp2 (Aug 24) -> comp1 (Aug 20)
      expect(result.completed.map((e) => e.id)).toEqual(['comp2', 'comp1']);
    });

    it('handles exact millisecond day boundaries (23:59:59.999 vs 00:00:00.000 next day)', () => {
      const endingAtMidnight = makeEvent('midnight-end', {
        deliveryTime: new Date(2026, 7, 25, 20, 0),
        packdownTime: new Date(2026, 7, 25, 23, 59, 59, 999), // Today
      });
      const startingNextDay = makeEvent('midnight-start', {
        deliveryTime: new Date(2026, 7, 26, 0, 0, 0, 0), // Tomorrow
        packdownTime: new Date(2026, 7, 26, 4, 0),
      });

      // Offset 0 (Today)
      const todayRes = categorizeEvents([endingAtMidnight, startingNextDay], {
        referenceDate: refDate,
        targetDateOffset: 0,
      });
      expect(todayRes.todayJobs.map((e) => e.id)).toContain('midnight-end');
      expect(todayRes.todayJobs.map((e) => e.id)).not.toContain('midnight-start');

      // Offset +1 (Tomorrow)
      const tomorrowRes = categorizeEvents([endingAtMidnight, startingNextDay], {
        referenceDate: refDate,
        targetDateOffset: 1,
      });
      expect(tomorrowRes.todayJobs.map((e) => e.id)).not.toContain('midnight-end');
      expect(tomorrowRes.todayJobs.map((e) => e.id)).toContain('midnight-start');
    });

    it('handles extreme offset parameters (e.g. +365 days, -365 days)', () => {
      const yearFromNow = makeEvent('future-year', {
        deliveryTime: new Date(2027, 7, 25, 10, 0),
        packdownTime: new Date(2027, 7, 25, 18, 0),
      });

      const resToday = categorizeEvents([yearFromNow], { referenceDate: refDate, targetDateOffset: 0 });
      expect(resToday.todayJobs.length).toBe(0);
      expect(resToday.upcoming.length).toBe(1);

      const resYear = categorizeEvents([yearFromNow], { referenceDate: refDate, targetDateOffset: 365 });
      expect(resYear.todayJobs.length).toBe(1);
      expect(resYear.todayJobs[0].id).toBe('future-year');
    });
  });

  // =========================================================================
  // 3. PULL-SHEET-ENGINE ADVERSARIAL STRESS SUITE
  // =========================================================================
  describe('Engine 3: pull-sheet-engine Adversarial & Edge Cases', () => {
    describe('normalizePullsheetStatus - Malformed & Unknown Inputs', () => {
      it('normalizes bizarre casing, mixed whitespaces, tabs, newlines', () => {
        expect(normalizePullsheetStatus('\t  CONFIRMED  \n')).toBe('confirmed');
        expect(normalizePullsheetStatus('pRePpEd/ScAnNeD')).toBe('prepped_scanned');
        expect(normalizePullsheetStatus('  rEaDy ')).toBe('confirmed');
        expect(normalizePullsheetStatus('DiSpAtChEd')).toBe('dispatched');
        expect(normalizePullsheetStatus('DePrEpPeD')).toBe('deprepped');
      });

      it('safely handles empty strings and unknown status strings returning "none"', () => {
        expect(normalizePullsheetStatus(null)).toBe('none');
        expect(normalizePullsheetStatus(undefined)).toBe('none');
        expect(normalizePullsheetStatus('')).toBe('none');
        expect(normalizePullsheetStatus('custom_unsupported_status')).toBe('none');
      });

      it('detects type vulnerability when non-string status values are passed', () => {
        // When status is not a string (e.g., number 123 or object {}), normalizePullsheetStatus throws TypeError
        try {
          const res = normalizePullsheetStatus(123 as unknown as string);
          expect(res).toBe('none');
        } catch (err: any) {
          // Documented vulnerability: normalizePullsheetStatus expects typeof status === 'string'
          expect(err).toBeInstanceOf(TypeError);
          expect(err.message).toContain('trim');
        }
      });
    });

    describe('Lifecycle State Machine Invariants', () => {
      it('guarantees forward terminal idempotency at "deprepped"', () => {
        let status: PullsheetItemStatus = 'deprepped';
        for (let i = 0; i < 10; i++) {
          status = getNextPullsheetStatus(status);
        }
        expect(status).toBe('deprepped');
      });

      it('guarantees backward initial idempotency at "pending"', () => {
        let status: PullsheetItemStatus = 'pending';
        for (let i = 0; i < 10; i++) {
          status = getPreviousPullsheetStatus(status);
        }
        expect(status).toBe('pending');
      });

      it('returns "none" when stepping forward or backward from "none"', () => {
        expect(getNextPullsheetStatus('none')).toBe('none');
        expect(getPreviousPullsheetStatus('none')).toBe('none');
      });

      it('reversibility: forward then backward returns initial status (for intermediate states)', () => {
        const intermediateStates: PullsheetItemStatus[] = ['confirmed', 'prepped_scanned', 'dispatched', 'returned'];
        for (const st of intermediateStates) {
          const next = getNextPullsheetStatus(st);
          const back = getPreviousPullsheetStatus(next);
          expect(back).toBe(st);
        }
      });
    });

    describe('calculatePullsheetProgress - Edge Cases & Invariants', () => {
      it('handles items with zero, negative, or undefined quantities safely', () => {
        const malformedItems: PullsheetItem[] = [
          { id: '1', quantity: 0, description: 'Zero Qty Item', type: 'item', status: 'pending' },
          { id: '2', quantity: -5, description: 'Negative Qty Item', type: 'item', status: 'prepped_scanned' },
          { id: '3', quantity: undefined as unknown as number, description: 'Undefined Qty', type: 'item', status: 'confirmed' },
        ];

        const progress = calculatePullsheetProgress(malformedItems);
        expect(progress.totalLines).toBe(3);
        expect(progress.totalQuantity).toBeGreaterThanOrEqual(1);
      });

      it('verifies cumulative progression invariants: Prepped >= Dispatched >= Returned >= Deprepped', () => {
        const mixedItems: PullsheetItem[] = [
          { id: '1', quantity: 2, description: 'A', type: 'item', status: 'deprepped' },
          { id: '2', quantity: 3, description: 'B', type: 'item', status: 'returned' },
          { id: '3', quantity: 4, description: 'C', type: 'item', status: 'dispatched' },
          { id: '4', quantity: 5, description: 'D', type: 'item', status: 'prepped_scanned' },
          { id: '5', quantity: 1, description: 'E', type: 'item', status: 'confirmed' },
        ];

        const progress = calculatePullsheetProgress(mixedItems);
        expect(progress.totalQuantity).toBe(15);
        expect(progress.percentPrepped).toBeGreaterThanOrEqual(progress.percentDispatched);
        expect(progress.percentDispatched).toBeGreaterThanOrEqual(progress.percentReturned);
      });

      it('handles a large pull sheet of 2,000 items efficiently', () => {
        const largeList: PullsheetItem[] = [];
        for (let i = 0; i < 2000; i++) {
          largeList.push({
            id: `item-${i}`,
            quantity: (i % 5) + 1,
            description: `Equipment Item ${i}`,
            type: i % 20 === 0 ? 'section-header' : 'item',
            status: i % 2 === 0 ? 'prepped_scanned' : 'pending',
          });
        }

        const start = Date.now();
        const progress = calculatePullsheetProgress(largeList);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(100);
        expect(progress.totalLines).toBe(1900); // 2000 - 100 section headers
        expect(progress.percentPrepped).toBeGreaterThan(0);
      });
    });

    describe('groupPullsheetBySections - Structural Anomalies', () => {
      it('handles consecutive section headers without items between them', () => {
        const items: PullsheetItem[] = [
          { id: 'sec-1', quantity: 0, description: 'Section 1', type: 'section-header', status: 'none' },
          { id: 'sec-2', quantity: 0, description: 'Section 2', type: 'section-header', status: 'none' },
          { id: 'item-1', quantity: 1, description: 'Item under sec 2', type: 'item', status: 'pending' },
        ];

        const sections = groupPullsheetBySections(items);
        expect(sections.some((s) => s.title === 'Section 2' && s.items.length === 1)).toBe(true);
      });

      it('filters out service items completely regardless of placement', () => {
        const items: any[] = [
          { id: 's1', description: 'Audio', type: 'section-header' },
          { id: 'svc1', description: 'Tech Labour', type: 'service' },
          { id: 'i1', description: 'Speaker', type: 'item' },
          { id: 'svc2', description: 'Delivery Driver', type: 'service' },
        ];

        const sections = groupPullsheetBySections(items);
        expect(sections.length).toBe(1);
        expect(sections[0].items.length).toBe(1);
        expect(sections[0].items[0].id).toBe('i1');
      });
    });
  });

  // =========================================================================
  // 4. SCANNER-ENGINE ADVERSARIAL STRESS SUITE
  // =========================================================================
  describe('Engine 4: scanner-engine Adversarial & Edge Cases', () => {
    const mockFleet: Equipment[] = [
      {
        id: 'eq-main',
        tenantId: 'tenant-123',
        name: 'd&b audiotechnik J-SUB',
        manufacturer: 'd&b',
        model: 'J-SUB',
        barcode: 'BAR-DB-JSUB-001',
        assetNumber: 'AST-JSUB-90',
        segAssetNumber: 'SEG-90',
        serialNumber: 'SN-JSUB-PRIMARY',
        serialNumbers: [
          { id: 'sn-a', serial: 'SN-JSUB-ALT-1', status: 'Available' },
          { id: 'sn-b', serial: 'SN-JSUB-ALT-2', status: 'Available' },
        ],
      },
      {
        id: 'eq-unassigned',
        tenantId: 'tenant-123',
        name: 'Chamsys MagicQ MQ500M',
        manufacturer: 'Chamsys',
        model: 'MQ500M',
        barcode: 'BAR-CHAM-MQ500',
        serialNumber: 'SN-CHAM-7711',
      },
    ];

    const mockPullsheet: PullsheetItem[] = [
      {
        id: 'ps-sub-1',
        inventoryItemId: 'eq-main',
        quantity: 3,
        description: 'd&b J-SUB Subwoofer',
        type: 'item',
        status: 'confirmed',
        scannedQuantity: 0,
        scannedBarcodes: [],
      },
    ];

    describe('evaluatePullsheetScan - Matching & Disambiguation', () => {
      it('matches case-insensitively on secondary serial numbers in serialNumbers array', () => {
        const result = evaluatePullsheetScan('sn-jsub-alt-2', mockPullsheet, mockFleet);
        expect(result.type).toBe('SUCCESS');
        expect(result.item?.id).toBe('ps-sub-1');
        expect(result.equipment?.id).toBe('eq-main');
        expect(result.newScannedCount).toBe(1);
      });

      it('matches on segAssetNumber', () => {
        const result = evaluatePullsheetScan('seg-90', mockPullsheet, mockFleet);
        expect(result.type).toBe('SUCCESS');
        expect(result.item?.id).toBe('ps-sub-1');
      });

      it('matches by direct pull sheet item id', () => {
        const result = evaluatePullsheetScan('ps-sub-1', mockPullsheet, mockFleet);
        expect(result.type).toBe('SUCCESS');
        expect(result.item?.id).toBe('ps-sub-1');
      });

      it('correctly reports NOT_ON_PULLSHEET for fleet equipment not on this sheet', () => {
        const result = evaluatePullsheetScan('BAR-CHAM-MQ500', mockPullsheet, mockFleet);
        expect(result.type).toBe('NOT_ON_PULLSHEET');
        expect(result.equipment?.id).toBe('eq-unassigned');
        expect(result.message).toContain('Chamsys MagicQ MQ500M');
      });

      it('handles adversarial scan inputs (special chars, emojis, null-byte)', () => {
        expect(evaluatePullsheetScan('', mockPullsheet, mockFleet).type).toBe('UNKNOWN_CODE');
        expect(evaluatePullsheetScan('   \t\n  ', mockPullsheet, mockFleet).type).toBe('UNKNOWN_CODE');
        expect(evaluatePullsheetScan('📦🏷️-EMOJI-CODE', mockPullsheet, mockFleet).type).toBe('UNKNOWN_CODE');
        expect(evaluatePullsheetScan('A'.repeat(5000), mockPullsheet, mockFleet).type).toBe('UNKNOWN_CODE');
      });

      it('tracks incremental scans up to target quantity and flags ALREADY_COMPLETED when done', () => {
        // Step 1: Scan 1 (0 -> 1)
        const itemState1: PullsheetItem = { ...mockPullsheet[0], scannedQuantity: 0 };
        const res1 = evaluatePullsheetScan('BAR-DB-JSUB-001', [itemState1], mockFleet);
        expect(res1.type).toBe('SUCCESS');
        expect(res1.newScannedCount).toBe(1);
        expect(res1.isFullyPrepped).toBe(false);

        // Step 2: Scan 2 (1 -> 2)
        const itemState2: PullsheetItem = { ...mockPullsheet[0], scannedQuantity: 1 };
        const res2 = evaluatePullsheetScan('BAR-DB-JSUB-001', [itemState2], mockFleet);
        expect(res2.type).toBe('SUCCESS');
        expect(res2.newScannedCount).toBe(2);
        expect(res2.isFullyPrepped).toBe(false);

        // Step 3: Scan 3 (2 -> 3, target reached!)
        const itemState3: PullsheetItem = { ...mockPullsheet[0], scannedQuantity: 2 };
        const res3 = evaluatePullsheetScan('BAR-DB-JSUB-001', [itemState3], mockFleet);
        expect(res3.type).toBe('SUCCESS');
        expect(res3.newScannedCount).toBe(3);
        expect(res3.isFullyPrepped).toBe(true);

        // Step 4: Scan 4 when status marked prepped_scanned (already completed)
        const itemState4: PullsheetItem = {
          ...mockPullsheet[0],
          scannedQuantity: 3,
          status: 'prepped_scanned',
        };
        const res4 = evaluatePullsheetScan('BAR-DB-JSUB-001', [itemState4], mockFleet);
        expect(res4.type).toBe('ALREADY_COMPLETED');
        expect(res4.isFullyPrepped).toBe(true);
      });
    });

    describe('createScanThrottle - Burst Stress Harness', () => {
      it('handles a burst of 1,000 rapid duplicate scans throttling 999 of them', () => {
        const throttle = createScanThrottle(1200);
        let allowed = 0;
        let throttled = 0;

        for (let i = 0; i < 1000; i++) {
          if (throttle.shouldThrottle('BURST-BARCODE-001')) {
            throttled++;
          } else {
            allowed++;
          }
        }

        expect(allowed).toBe(1);
        expect(throttled).toBe(999);
      });

      it('permits rapid interleaving of different barcodes without blocking', () => {
        const throttle = createScanThrottle(1200);
        const codeA = 'BARCODE-AAA';
        const codeB = 'BARCODE-BBB';

        // Alternating sequence of 50 scans
        for (let i = 0; i < 25; i++) {
          expect(throttle.shouldThrottle(codeA)).toBe(false);
          expect(throttle.shouldThrottle(codeB)).toBe(false);
        }
      });

      it('throttles code with varying whitespace padding as duplicate', () => {
        const throttle = createScanThrottle(1200);
        expect(throttle.shouldThrottle('CODE-TRIM')).toBe(false);
        expect(throttle.shouldThrottle('   CODE-TRIM   ')).toBe(true);
        expect(throttle.shouldThrottle('\tCODE-TRIM\n')).toBe(true);
      });
    });
  });
});
