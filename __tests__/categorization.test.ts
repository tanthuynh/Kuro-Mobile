/**
 * __tests__/categorization.test.ts
 * Comprehensive test suite for pure event categorization engine.
 */

import { categorizeEvents } from '@/lib/categorization';
import type { Event } from '@/types/events';

describe('categorization engine', () => {
  const baseDate = new Date(2026, 7, 25, 12, 0, 0); // Tuesday, 25 Aug 2026 12:00 PM

  const createEvent = (overrides: Partial<Event>): Event => ({
    id: overrides.id || 'ev-1',
    tenantId: 'tenant-123',
    eventName: overrides.eventName || 'Test Event',
    clientId: 'client-1',
    eventStatusId: overrides.eventStatusId || 'Confirmed',
    eventTypeId: 'type-1',
    assigneeId: 'user-1',
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

  it('categorizes a single-day event today into todayJobs and inProgress', () => {
    const todayEvent = createEvent({
      id: 'today-1',
      eventName: 'Fringe Festival Gig',
      deliveryTime: new Date(2026, 7, 25, 8, 0), // 8:00 AM
      packdownTime: new Date(2026, 7, 25, 22, 0), // 10:00 PM
    });

    const result = categorizeEvents([todayEvent], { referenceDate: baseDate });

    expect(result.todayJobs.length).toBe(1);
    expect(result.todayJobs[0].id).toBe('today-1');
    expect(result.inProgress.length).toBe(1);
    expect(result.inProgress[0].id).toBe('today-1');
    expect(result.upcoming.length).toBe(0);
    expect(result.completed.length).toBe(0);
  });

  it('categorizes a multi-day event spanning today into todayJobs and inProgress', () => {
    const multiDayEvent = createEvent({
      id: 'multiday-1',
      eventName: '3-Day Arena Rock Tour',
      deliveryTime: new Date(2026, 7, 23, 8, 0), // Aug 23
      packdownTime: new Date(2026, 7, 27, 18, 0), // Aug 27
    });

    const result = categorizeEvents([multiDayEvent], { referenceDate: baseDate });

    expect(result.todayJobs.length).toBe(1);
    expect(result.todayJobs[0].id).toBe('multiday-1');
    expect(result.inProgress.length).toBe(1);
    expect(result.inProgress[0].id).toBe('multiday-1');
    expect(result.upcoming.length).toBe(0);
  });

  it('categorizes upcoming future events into upcoming bucket', () => {
    const futureEvent = createEvent({
      id: 'upcoming-1',
      eventName: 'Next Month Gala',
      deliveryTime: new Date(2026, 7, 28, 9, 0), // Aug 28 (3 days from Aug 25)
      packdownTime: new Date(2026, 7, 28, 23, 0),
    });

    const result = categorizeEvents([futureEvent], { referenceDate: baseDate });

    expect(result.todayJobs.length).toBe(0);
    expect(result.inProgress.length).toBe(0);
    expect(result.upcoming.length).toBe(1);
    expect(result.upcoming[0].id).toBe('upcoming-1');
  });

  it('categorizes completed events into completed bucket regardless of dates', () => {
    const completedEvent = createEvent({
      id: 'completed-1',
      eventName: 'Past Corporate Dinner',
      eventStatusId: 'Completed',
      deliveryTime: new Date(2026, 7, 25, 6, 0),
      packdownTime: new Date(2026, 7, 25, 11, 0), // Ended at 11:00 AM (before 12:00 PM baseDate)
    });

    const result = categorizeEvents([completedEvent], { referenceDate: baseDate });

    expect(result.completed.length).toBe(1);
    expect(result.completed[0].id).toBe('completed-1');
    expect(result.inProgress.length).toBe(0); // Completed events are not inProgress
  });

  it('excludes cancelled events from inProgress and upcoming', () => {
    const cancelledEvent = createEvent({
      id: 'cancelled-1',
      eventName: 'Rained Out Festival',
      eventStatusId: 'Cancelled',
      deliveryTime: new Date(2026, 7, 25, 8, 0),
      packdownTime: new Date(2026, 7, 25, 20, 0),
    });

    const result = categorizeEvents([cancelledEvent], { referenceDate: baseDate });

    expect(result.inProgress.length).toBe(0);
    expect(result.upcoming.length).toBe(0);
    expect(result.todayJobs.length).toBe(1); // Appears on calendar date scrubber
  });

  it('supports date scrubber offset (+1 tomorrow, -1 yesterday)', () => {
    const tomorrowEvent = createEvent({
      id: 'tomorrow-1',
      eventName: 'Tomorrow Gig',
      deliveryTime: new Date(2026, 7, 26, 9, 0), // Aug 26
      packdownTime: new Date(2026, 7, 26, 17, 0),
    });

    const yesterdayEvent = createEvent({
      id: 'yesterday-1',
      eventName: 'Yesterday Gig',
      deliveryTime: new Date(2026, 7, 24, 9, 0), // Aug 24
      packdownTime: new Date(2026, 7, 24, 17, 0),
    });

    // Today (offset 0)
    const todayRes = categorizeEvents([tomorrowEvent, yesterdayEvent], {
      referenceDate: baseDate,
      targetDateOffset: 0,
    });
    expect(todayRes.todayJobs.length).toBe(0);

    // Tomorrow (offset +1)
    const tomorrowRes = categorizeEvents([tomorrowEvent, yesterdayEvent], {
      referenceDate: baseDate,
      targetDateOffset: 1,
    });
    expect(tomorrowRes.todayJobs.length).toBe(1);
    expect(tomorrowRes.todayJobs[0].id).toBe('tomorrow-1');

    // Yesterday (offset -1)
    const yesterdayRes = categorizeEvents([tomorrowEvent, yesterdayEvent], {
      referenceDate: baseDate,
      targetDateOffset: -1,
    });
    expect(yesterdayRes.todayJobs.length).toBe(1);
    expect(yesterdayRes.todayJobs[0].id).toBe('yesterday-1');
  });

  it('strictly ignores archived events', () => {
    const archivedEvent = createEvent({
      id: 'archived-1',
      archived: true,
      deliveryTime: new Date(2026, 7, 25, 8, 0),
      packdownTime: new Date(2026, 7, 25, 20, 0),
    });

    const result = categorizeEvents([archivedEvent], { referenceDate: baseDate });

    expect(result.todayJobs.length).toBe(0);
    expect(result.inProgress.length).toBe(0);
    expect(result.upcoming.length).toBe(0);
    expect(result.completed.length).toBe(0);
  });

  it('sorts todayJobs and upcoming by start date ascending, completed descending', () => {
    const earlyToday = createEvent({
      id: 'early-today',
      deliveryTime: new Date(2026, 7, 25, 6, 0),
      packdownTime: new Date(2026, 7, 25, 12, 0),
    });

    const lateToday = createEvent({
      id: 'late-today',
      deliveryTime: new Date(2026, 7, 25, 15, 0),
      packdownTime: new Date(2026, 7, 25, 23, 0),
    });

    const result = categorizeEvents([lateToday, earlyToday], { referenceDate: baseDate });
    expect(result.todayJobs[0].id).toBe('early-today');
    expect(result.todayJobs[1].id).toBe('late-today');
  });

  it('handles events with no scheduled dates placing them into upcoming', () => {
    const undatedEvent = createEvent({
      id: 'undated-1',
      eventName: 'Draft Inquired Gig',
      eventStatusId: 'Inquiry',
    });

    const result = categorizeEvents([undatedEvent], { referenceDate: baseDate });
    expect(result.upcoming.length).toBe(1);
    expect(result.upcoming[0].id).toBe('undated-1');
  });
});
