/**
 * src/lib/categorization.ts
 * Pure categorization engine for Kuro Mobile events.
 * Distributes events into Today's Jobs, In-Progress, Upcoming, and Completed buckets
 * with support for date offset scrubbers and multi-day active window overlap.
 */

import type { Event, CategorizedEvents } from '@/types/events';
import { getEventOperationalWindow, getStartOfDay, getEndOfDay } from './date-utils';

export interface CategorizeOptions {
  targetDateOffset?: number; // 0 = today, 1 = tomorrow, -1 = yesterday
  referenceDate?: Date;      // Anchor "now" date (defaults to new Date())
}

/**
 * Categorizes an array of events into operational buckets.
 */
export function categorizeEvents(
  events: Event[],
  options: CategorizeOptions | number = 0
): CategorizedEvents {
  const opts: CategorizeOptions =
    typeof options === 'number' ? { targetDateOffset: options } : options;

  const refDate = opts.referenceDate ? new Date(opts.referenceDate) : new Date();
  const offset = opts.targetDateOffset ?? 0;

  // Target day boundaries (for scrubber)
  const targetDay = new Date(refDate);
  targetDay.setDate(targetDay.getDate() + offset);
  const startOfTarget = getStartOfDay(targetDay);
  const endOfTarget = getEndOfDay(targetDay);

  // Today boundaries
  const startOfToday = getStartOfDay(refDate);
  const endOfToday = getEndOfDay(refDate);

  const todayJobs: Event[] = [];
  const inProgress: Event[] = [];
  const upcoming: Event[] = [];
  const completed: Event[] = [];

  for (const event of events) {
    if (event.archived) continue;

    const isCompleted = event.eventStatusId === 'Completed';
    const isCancelled = event.eventStatusId === 'Cancelled';

    if (isCompleted) {
      completed.push(event);
    }

    const { start, end } = getEventOperationalWindow(event);

    // If event has no scheduled dates
    if (!start || !end) {
      if (!isCompleted && !isCancelled) {
        upcoming.push(event);
      }
      continue;
    }

    // 1. Scrubber / Target Date Overlap:
    // Window overlaps target day if start <= endOfTarget and end >= startOfTarget
    if (start <= endOfTarget && end >= startOfTarget) {
      todayJobs.push(event);
    }

    // 2. In-Progress Right Now:
    // Window contains refDate (now) and event is active
    if (!isCompleted && !isCancelled && start <= refDate && end >= refDate) {
      inProgress.push(event);
    }

    // 3. Upcoming:
    // Starts strictly after the end of today and event is active
    if (!isCompleted && !isCancelled && start > endOfToday) {
      upcoming.push(event);
    }
  }

  // Sort todayJobs by start date ascending
  todayJobs.sort((a, b) => {
    const startA = getEventOperationalWindow(a).start?.getTime() || 0;
    const startB = getEventOperationalWindow(b).start?.getTime() || 0;
    return startA - startB;
  });

  // Sort inProgress by start date ascending
  inProgress.sort((a, b) => {
    const startA = getEventOperationalWindow(a).start?.getTime() || 0;
    const startB = getEventOperationalWindow(b).start?.getTime() || 0;
    return startA - startB;
  });

  // Sort upcoming by start date ascending
  upcoming.sort((a, b) => {
    const startA = getEventOperationalWindow(a).start?.getTime() || 0;
    const startB = getEventOperationalWindow(b).start?.getTime() || 0;
    return startA - startB;
  });

  // Sort completed by end date descending (most recent first)
  completed.sort((a, b) => {
    const endA = getEventOperationalWindow(a).end?.getTime() || 0;
    const endB = getEventOperationalWindow(b).end?.getTime() || 0;
    return endB - endA;
  });

  return { todayJobs, inProgress, upcoming, completed };
}
