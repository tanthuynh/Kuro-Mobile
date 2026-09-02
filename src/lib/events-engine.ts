/**
 * src/lib/events-engine.ts
 * Pure functional domain logic for Kuro Mobile Events Feed & Operations.
 * Handles 30-day rolling window calculations, status filtering, search querying,
 * event sorting, and aggregate metrics.
 */

import type { Event, EventStatus } from '@/types/events';
import { getEventOperationalWindow, getStartOfDay, getEndOfDay } from './date-utils';

export interface EventFilterOptions {
  status?: string;        // 'All' | 'Inquiry' | 'Pending' | 'Confirmed' | 'Completed'
  search?: string;        // Search keywords
  referenceDate?: Date;   // Anchor date (defaults to current date)
  windowDays?: number;    // Rolling window length in days (default: 30)
}

export interface EventMetrics {
  total: number;
  all: number;
  inquiry: number;
  pending: number;
  confirmed: number;
  completed: number;
}

/**
 * Checks whether an event falls within the rolling window (e.g. today 00:00:00 to today + 30 days 23:59:59).
 * Excludes past events that ended prior to today 00:00:00.
 */
export function isEventInRollingWindow(
  event: Event,
  referenceDate: Date = new Date(),
  windowDays: number = 30
): boolean {
  if (!event || event.archived) return false;

  const startOfToday = getStartOfDay(referenceDate);
  const endOfWindow = getEndOfDay(
    new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() + windowDays)
  );

  const { start, end } = getEventOperationalWindow(event);

  // If event has an end date and ended before today 00:00:00, exclude it (past event)
  if (end && end.getTime() < startOfToday.getTime()) {
    return false;
  }

  // If event has a start date and starts strictly after the rolling window end, exclude it
  if (start && start.getTime() > endOfWindow.getTime()) {
    return false;
  }

  // If start and end are both null, but event is active and not archived, include it
  return true;
}

/**
 * Filters events by rolling 30-day window, status, and search query.
 */
export function filterEvents(
  events: Event[],
  options: EventFilterOptions = {}
): Event[] {
  if (!Array.isArray(events)) return [];
  const {
    status = 'All',
    search = '',
    referenceDate = new Date(),
    windowDays = 30,
  } = options;

  const trimmedSearch = search.trim().toLowerCase();
  const normalizedStatus = status.trim().toLowerCase();

  const filtered = events.filter((event) => {
    // 1. Exclude archived
    if (event.archived) return false;

    // 2. 30-day rolling window check
    if (!isEventInRollingWindow(event, referenceDate, windowDays)) {
      return false;
    }

    // 3. Status filter
    if (normalizedStatus !== 'all') {
      const eventStatus = (event.eventStatusId || '').toLowerCase();
      if (eventStatus !== normalizedStatus) {
        return false;
      }
    }

    // 4. Search query filter
    if (trimmedSearch) {
      const cleanSearchNoHash = trimmedSearch.replace(/^#\s*/, '');
      const nameMatch = event.eventName?.toLowerCase().includes(trimmedSearch);
      const numberMatch =
        event.eventNumber !== null &&
        event.eventNumber !== undefined &&
        (event.eventNumber.toString().includes(trimmedSearch) ||
          event.eventNumber.toString().includes(cleanSearchNoHash) ||
          `#${event.eventNumber}`.toLowerCase().includes(trimmedSearch));
      const clientMatch = event.clientId?.toLowerCase().includes(trimmedSearch);
      const venueMatch = event.venueId?.toLowerCase().includes(trimmedSearch);
      const notesMatch = event.notes?.toLowerCase().includes(trimmedSearch);

      if (!nameMatch && !numberMatch && !clientMatch && !venueMatch && !notesMatch) {
        // Multi-term search across all text fields
        const combinedText = [
          event.eventName || '',
          event.eventNumber !== null && event.eventNumber !== undefined ? `#${event.eventNumber} ${event.eventNumber}` : '',
          event.clientId || '',
          event.venueId || '',
          event.notes || '',
        ].join(' ').toLowerCase();

        const tokens = trimmedSearch.split(/\s+/).filter(Boolean);
        const allTokensMatch = tokens.length > 1 && tokens.every((token) => combinedText.includes(token));
        if (!allTokensMatch) {
          return false;
        }
      }
    }

    return true;
  });

  // Sort chronologically ascending by operational start date
  return filtered.sort((a, b) => {
    const startA = getEventOperationalWindow(a).start?.getTime() || 0;
    const startB = getEventOperationalWindow(b).start?.getTime() || 0;

    if (startA !== startB) {
      return startA - startB;
    }

    const numA = a.eventNumber ?? 0;
    const numB = b.eventNumber ?? 0;
    if (numA !== numB) {
      return numA - numB;
    }

    return (a.eventName || '').localeCompare(b.eventName || '');
  });
}

/**
 * Computes status counts across the 30-day rolling window dataset.
 */
export function computeEventMetrics(
  events: Event[],
  options?: { referenceDate?: Date; windowDays?: number }
): EventMetrics {
  if (!Array.isArray(events)) {
    return { total: 0, all: 0, inquiry: 0, pending: 0, confirmed: 0, completed: 0 };
  }

  const refDate = options?.referenceDate || new Date();
  const windowDays = options?.windowDays ?? 30;

  const windowEvents = events.filter((e) => isEventInRollingWindow(e, refDate, windowDays));

  let inquiry = 0;
  let pending = 0;
  let confirmed = 0;
  let completed = 0;

  for (const ev of windowEvents) {
    const s = (ev.eventStatusId || '').toLowerCase();
    if (s === 'inquiry') inquiry++;
    else if (s === 'pending') pending++;
    else if (s === 'confirmed') confirmed++;
    else if (s === 'completed') completed++;
  }

  return {
    total: windowEvents.length,
    all: windowEvents.length,
    inquiry,
    pending,
    confirmed,
    completed,
  };
}
