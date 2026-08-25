/**
 * src/lib/date-utils.ts
 * Robust date parser and formatter for Kuro Mobile.
 * Handles Firestore Timestamps, raw seconds/nanoseconds objects, ISO strings,
 * JavaScript Dates, and epoch timestamps.
 */

/**
 * Safely parses any date-like input into a JavaScript Date instance or null.
 */
export function parseFirestoreDate(val: any): Date | null {
  if (val === null || val === undefined) return null;

  // Already a Date instance
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  // Firestore Timestamp with .toDate()
  if (typeof val === 'object' && typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }

  // Raw Firestore object {_seconds, _nanoseconds} or {seconds, nanoseconds}
  if (typeof val === 'object') {
    const sec = val._seconds !== undefined ? val._seconds : val.seconds;
    const nsec = val._nanoseconds !== undefined ? val._nanoseconds : val.nanoseconds || 0;
    if (typeof sec === 'number' && !isNaN(sec)) {
      const ms = sec * 1000 + Math.floor(nsec / 1000000);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // Number: Epoch milliseconds or seconds
  if (typeof val === 'number') {
    if (isNaN(val)) return null;
    // If number is small (< 1e11), treat as seconds rather than milliseconds
    const ms = val < 100000000000 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // String: ISO string or date string
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Formats a Date object for stage time display.
 */
export function formatStageTime(
  date: Date | null,
  format: 'timeOnly' | 'dateTime' | 'dateOnly' | 'shortDate' = 'dateTime'
): string {
  if (!date || isNaN(date.getTime())) return 'Not scheduled';

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const timeStr = `${hours}:${minutes}`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();

  if (format === 'timeOnly') {
    return timeStr;
  }

  if (format === 'dateOnly') {
    return `${dayName} ${dayNum} ${monthName}`;
  }

  if (format === 'shortDate') {
    return `${dayNum} ${monthName} ${year}`;
  }

  // Default dateTime
  return `${dayNum} ${monthName} ${timeStr}`;
}

/**
 * Formats an event date range into a concise human-readable string.
 * Example: "Mon 25 Aug 2026", "25 Aug - 27 Aug 2026", "Not scheduled"
 */
export function formatEventDateRange(startDate: Date | null, endDate: Date | null): string {
  if (!startDate && !endDate) return 'Not scheduled';
  if (startDate && !endDate) return formatStageTime(startDate, 'dateOnly');
  if (!startDate && endDate) return formatStageTime(endDate, 'dateOnly');

  const start = startDate!;
  const end = endDate!;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startDay = start.getDate();
  const startMonth = months[start.getMonth()];
  const startYear = start.getFullYear();

  const endDay = end.getDate();
  const endMonth = months[end.getMonth()];
  const endYear = end.getFullYear();

  if (startYear === endYear && start.getMonth() === end.getMonth() && startDay === endDay) {
    return `${startDay} ${startMonth} ${startYear}`;
  }

  if (startYear === endYear && start.getMonth() === end.getMonth()) {
    return `${startDay} - ${endDay} ${startMonth} ${startYear}`;
  }

  if (startYear === endYear) {
    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${startYear}`;
  }

  return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`;
}

/**
 * Checks if two dates fall on the same calendar day.
 */
export function isSameDay(date1: Date | null, date2: Date | null): boolean {
  if (!date1 || !date2) return false;
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Returns a new Date at 00:00:00.000 for the given date (or now).
 */
export function getStartOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/**
 * Returns a new Date at 23:59:59.999 for the given date (or now).
 */
export function getEndOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/**
 * Extracts the earliest operational start time and latest operational finish time
 * for an event across all 5 scheduling stages.
 */
export function getEventOperationalWindow(event: {
  deliveryTime?: Date | null;
  setupTime?: Date | null;
  startTime?: Date | null;
  finishTime?: Date | null;
  eventStartDate?: Date | null;
  eventFinishDate?: Date | null;
  pickupTime?: Date | null;
  packdownTime?: Date | null;
}): { start: Date | null; end: Date | null } {
  const startCandidates = [
    event.deliveryTime,
    event.setupTime,
    event.startTime,
    event.eventStartDate,
  ].filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()));

  const endCandidates = [
    event.packdownTime,
    event.pickupTime,
    event.finishTime,
    event.eventFinishDate,
  ].filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()));

  let start: Date | null = null;
  if (startCandidates.length > 0) {
    start = new Date(Math.min(...startCandidates.map((d) => d.getTime())));
  }

  let end: Date | null = null;
  if (endCandidates.length > 0) {
    end = new Date(Math.max(...endCandidates.map((d) => d.getTime())));
  }

  if (start && !end) end = new Date(start.getTime());
  if (end && !start) start = new Date(end.getTime());

  return { start, end };
}

/**
 * Formats a Date/Timestamp/string into relative time ago (e.g. 'Just now', '5m ago', '2h ago', '3d ago').
 */
export function formatTimeAgo(val: any): string {
  const date = parseFirestoreDate(val);
  if (!date) return 'Unknown';

  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const min = Math.max(1, Math.floor(diffSec / 60));
    return `${min}m ago`;
  }
  if (diffSec < 86400) {
    const hrs = Math.max(1, Math.floor(diffSec / 3600));
    return `${hrs}h ago`;
  }
  const days = Math.max(1, Math.floor(diffSec / 86400));
  if (days < 30) return `${days}d ago`;

  return formatStageTime(date, 'shortDate');
}

/**
 * Formats a Date/Timestamp/string into standard short date string (e.g. '25 Aug 2026').
 */
export function formatDate(val: any): string {
  const date = parseFirestoreDate(val);
  if (!date) return 'Not set';
  return formatStageTime(date, 'shortDate');
}

