/**
 * __tests__/date-utils.test.ts
 * Comprehensive test suite for date-utils domain library.
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

describe('date-utils', () => {
  describe('parseFirestoreDate', () => {
    it('returns null for null or undefined', () => {
      expect(parseFirestoreDate(null)).toBeNull();
      expect(parseFirestoreDate(undefined)).toBeNull();
    });

    it('returns the same Date if already a valid Date object', () => {
      const d = new Date(2026, 7, 25, 10, 30);
      const parsed = parseFirestoreDate(d);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.getTime()).toBe(d.getTime());
    });

    it('returns null for invalid Date instances', () => {
      const invalidDate = new Date('invalid-date-string');
      expect(parseFirestoreDate(invalidDate)).toBeNull();
    });

    it('parses Firestore Timestamp objects with toDate()', () => {
      const mockTimestamp = {
        toDate: () => new Date(2026, 7, 25, 14, 0),
      };
      const parsed = parseFirestoreDate(mockTimestamp);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.getHours()).toBe(14);
    });

    it('parses raw Firestore {_seconds, _nanoseconds} objects', () => {
      const rawSec = { _seconds: 1787654400, _nanoseconds: 500000000 };
      const parsed = parseFirestoreDate(rawSec);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.getTime()).toBe(1787654400500);
    });

    it('parses raw Firestore {seconds, nanoseconds} objects', () => {
      const rawSec = { seconds: 1787654400, nanoseconds: 0 };
      const parsed = parseFirestoreDate(rawSec);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.getTime()).toBe(1787654400000);
    });

    it('parses numeric timestamps (seconds and milliseconds)', () => {
      // Milliseconds
      const ms = 1787654400000;
      expect(parseFirestoreDate(ms)?.getTime()).toBe(ms);

      // Seconds (< 1e11)
      const sec = 1787654400;
      expect(parseFirestoreDate(sec)?.getTime()).toBe(sec * 1000);
    });

    it('parses ISO date strings', () => {
      const iso = '2026-08-25T12:30:00.000Z';
      const parsed = parseFirestoreDate(iso);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.toISOString()).toBe(iso);
    });

    it('returns null for unparseable strings or objects', () => {
      expect(parseFirestoreDate('')).toBeNull();
      expect(parseFirestoreDate('   ')).toBeNull();
      expect(parseFirestoreDate('not-a-date')).toBeNull();
      expect(parseFirestoreDate({})).toBeNull();
      expect(parseFirestoreDate([])).toBeNull();
      expect(parseFirestoreDate(NaN)).toBeNull();
    });
  });

  describe('formatStageTime', () => {
    it('returns "Not scheduled" for null/undefined or invalid dates', () => {
      expect(formatStageTime(null)).toBe('Not scheduled');
      expect(formatStageTime(new Date('invalid'))).toBe('Not scheduled');
    });

    it('formats timeOnly (HH:mm in 24h format)', () => {
      const d = new Date(2026, 7, 25, 9, 5);
      expect(formatStageTime(d, 'timeOnly')).toBe('09:05');

      const d2 = new Date(2026, 7, 25, 21, 45);
      expect(formatStageTime(d2, 'timeOnly')).toBe('21:45');
    });

    it('formats dateOnly (e.g. Tue 25 Aug)', () => {
      const d = new Date(2026, 7, 25, 10, 0); // 25 Aug 2026 is Tuesday
      const formatted = formatStageTime(d, 'dateOnly');
      expect(formatted).toContain('25');
      expect(formatted).toContain('Aug');
    });

    it('formats shortDate (e.g. 25 Aug 2026)', () => {
      const d = new Date(2026, 7, 25, 10, 0);
      expect(formatStageTime(d, 'shortDate')).toBe('25 Aug 2026');
    });

    it('formats default dateTime (e.g. 25 Aug 10:30)', () => {
      const d = new Date(2026, 7, 25, 10, 30);
      expect(formatStageTime(d)).toBe('25 Aug 10:30');
    });
  });

  describe('formatEventDateRange', () => {
    it('handles null dates', () => {
      expect(formatEventDateRange(null, null)).toBe('Not scheduled');
    });

    it('handles single date (only start or only end)', () => {
      const start = new Date(2026, 7, 25, 10, 0);
      expect(formatEventDateRange(start, null)).toContain('25 Aug');

      const end = new Date(2026, 7, 26, 18, 0);
      expect(formatEventDateRange(null, end)).toContain('26 Aug');
    });

    it('formats same-day range', () => {
      const start = new Date(2026, 7, 25, 8, 0);
      const end = new Date(2026, 7, 25, 23, 0);
      expect(formatEventDateRange(start, end)).toBe('25 Aug 2026');
    });

    it('formats same-month multi-day range', () => {
      const start = new Date(2026, 7, 25, 8, 0);
      const end = new Date(2026, 7, 28, 23, 0);
      expect(formatEventDateRange(start, end)).toBe('25 - 28 Aug 2026');
    });

    it('formats multi-month same-year range', () => {
      const start = new Date(2026, 7, 30, 8, 0);
      const end = new Date(2026, 8, 2, 23, 0);
      expect(formatEventDateRange(start, end)).toBe('30 Aug - 2 Sep 2026');
    });

    it('formats multi-year range', () => {
      const start = new Date(2026, 11, 31, 8, 0);
      const end = new Date(2027, 0, 2, 23, 0);
      expect(formatEventDateRange(start, end)).toBe('31 Dec 2026 - 2 Jan 2027');
    });
  });

  describe('isSameDay, getStartOfDay, getEndOfDay', () => {
    it('accurately detects same calendar day', () => {
      const d1 = new Date(2026, 7, 25, 2, 0);
      const d2 = new Date(2026, 7, 25, 23, 59);
      const d3 = new Date(2026, 7, 26, 0, 0);

      expect(isSameDay(d1, d2)).toBe(true);
      expect(isSameDay(d1, d3)).toBe(false);
      expect(isSameDay(d1, null)).toBe(false);
    });

    it('creates start of day at 00:00:00.000', () => {
      const d = new Date(2026, 7, 25, 15, 30, 45, 123);
      const start = getStartOfDay(d);
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(7);
      expect(start.getDate()).toBe(25);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      expect(start.getMilliseconds()).toBe(0);
    });

    it('creates end of day at 23:59:59.999', () => {
      const d = new Date(2026, 7, 25, 15, 30, 45, 123);
      const end = getEndOfDay(d);
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(7);
      expect(end.getDate()).toBe(25);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
      expect(end.getMilliseconds()).toBe(999);
    });
  });

  describe('getEventOperationalWindow', () => {
    it('extracts earliest start and latest finish across all 5 stages', () => {
      const delivery = new Date(2026, 7, 25, 7, 0);
      const setup = new Date(2026, 7, 25, 10, 0);
      const start = new Date(2026, 7, 25, 12, 0);
      const finish = new Date(2026, 7, 25, 18, 0);
      const pickup = new Date(2026, 7, 25, 19, 0);
      const packdown = new Date(2026, 7, 25, 23, 0);

      const window = getEventOperationalWindow({
        deliveryTime: delivery,
        setupTime: setup,
        startTime: start,
        finishTime: finish,
        pickupTime: pickup,
        packdownTime: packdown,
      });

      expect(window.start?.getTime()).toBe(delivery.getTime());
      expect(window.end?.getTime()).toBe(packdown.getTime());
    });

    it('handles partial dates gracefully', () => {
      const start = new Date(2026, 7, 25, 12, 0);
      const window = getEventOperationalWindow({
        eventStartDate: start,
      });

      expect(window.start?.getTime()).toBe(start.getTime());
      expect(window.end?.getTime()).toBe(start.getTime());
    });

    it('returns null for start and end when event has no dates', () => {
      const window = getEventOperationalWindow({});
      expect(window.start).toBeNull();
      expect(window.end).toBeNull();
    });
  });
});
