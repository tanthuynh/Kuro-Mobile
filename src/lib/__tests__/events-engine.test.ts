/**
 * src/lib/__tests__/events-engine.test.ts
 * Pure unit tests for Kuro Mobile Events Engine:
 * - 30-day rolling window calculations (excluding past events, including today + 30 days)
 * - Status filtering (All, Inquiry, Pending, Confirmed, Completed)
 * - Search keyword filtering across event name, event number, client, venue, notes
 * - Chronological sorting
 * - Metrics aggregation
 */

import {
  isEventInRollingWindow,
  filterEvents,
  computeEventMetrics,
} from '../events-engine';
import { getEventOperationalWindow } from '../date-utils';
import type { Event } from '@/types/events';

describe('events-engine pure domain logic', () => {
  const baseAnchor = new Date('2026-09-01T12:00:00.000Z');

  const createMockEvent = (overrides: Partial<Event>): Event => {
    const start = overrides.startTime !== undefined ? overrides.startTime : new Date('2026-09-05T08:00:00.000Z');
    const finish = overrides.finishTime !== undefined
      ? overrides.finishTime
      : (start ? new Date(start.getTime() + 12 * 3600 * 1000) : null);

    return {
      id: 'mock-1',
      tenantId: 'tenant-test',
      eventName: 'Sample Test Event',
      eventNumber: 100,
      clientId: 'Client Corp',
      eventStatusId: 'Confirmed',
      eventTypeId: 'type-1',
      venueId: 'Venue Central',
      assigneeId: 'user-1',
      startTime: start,
      finishTime: finish,
      deliveryTime: overrides.deliveryTime !== undefined ? overrides.deliveryTime : start,
      setupTime: overrides.setupTime !== undefined ? overrides.setupTime : start,
      rehearsalTime: overrides.rehearsalTime !== undefined ? overrides.rehearsalTime : null,
      eventStartDate: overrides.eventStartDate !== undefined ? overrides.eventStartDate : start,
      eventFinishDate: overrides.eventFinishDate !== undefined ? overrides.eventFinishDate : finish,
      pickupTime: overrides.pickupTime !== undefined ? overrides.pickupTime : finish,
      packdownTime: overrides.packdownTime !== undefined ? overrides.packdownTime : finish,
      notes: 'Important stage notes',
      archived: false,
      ...overrides,
    };
  };

  describe('isEventInRollingWindow', () => {
    it('returns false for archived events', () => {
      const event = createMockEvent({ archived: true });
      expect(isEventInRollingWindow(event, baseAnchor)).toBe(false);
    });

    it('returns false for past events that finished before today 00:00:00', () => {
      const pastEvent = createMockEvent({
        id: 'past-event',
        startTime: new Date('2026-08-20T08:00:00.000Z'),
        finishTime: new Date('2026-08-30T18:00:00.000Z'),
        packdownTime: new Date('2026-08-30T18:00:00.000Z'),
        eventFinishDate: new Date('2026-08-30T18:00:00.000Z'),
      });
      expect(isEventInRollingWindow(pastEvent, baseAnchor)).toBe(false);
    });

    it('returns true for events occurring today', () => {
      const todayEvent = createMockEvent({
        id: 'today-event',
        startTime: new Date('2026-09-01T08:00:00.000Z'),
        finishTime: new Date('2026-09-01T20:00:00.000Z'),
      });
      expect(isEventInRollingWindow(todayEvent, baseAnchor)).toBe(true);
    });

    it('returns true for multi-day events that started yesterday but finish today or later', () => {
      const spanningEvent = createMockEvent({
        id: 'spanning-event',
        startTime: new Date('2026-08-28T08:00:00.000Z'),
        finishTime: new Date('2026-09-03T20:00:00.000Z'),
        packdownTime: new Date('2026-09-03T20:00:00.000Z'),
      });
      expect(isEventInRollingWindow(spanningEvent, baseAnchor)).toBe(true);
    });

    it('returns true for events within 30 days in the future', () => {
      const futureEvent = createMockEvent({
        id: 'future-event',
        startTime: new Date('2026-09-25T08:00:00.000Z'),
        finishTime: new Date('2026-09-25T20:00:00.000Z'),
      });
      expect(isEventInRollingWindow(futureEvent, baseAnchor)).toBe(true);
    });

    it('returns false for events starting > 30 days in the future', () => {
      const distantEvent = createMockEvent({
        id: 'distant-event',
        startTime: new Date('2026-10-15T08:00:00.000Z'), // ~44 days away
        finishTime: new Date('2026-10-15T20:00:00.000Z'),
      });
      expect(isEventInRollingWindow(distantEvent, baseAnchor)).toBe(false);
    });

    it('correctly handles multi-day spanning events right at the 30-day rolling window boundary', () => {
      const localAnchor = new Date(2026, 8, 1, 12, 0, 0); // 1 Sept 2026

      // Day 30 at 22:00 -> Starts within window (1 Oct 22:00), finishes after -> Included
      const day30BoundaryEvent = createMockEvent({
        id: 'day-30-boundary',
        startTime: new Date(2026, 9, 1, 22, 0, 0),
        finishTime: new Date(2026, 9, 5, 12, 0, 0),
      });
      expect(isEventInRollingWindow(day30BoundaryEvent, localAnchor)).toBe(true);

      // Day 31 at 08:00 -> Starts strictly after window (2 Oct 08:00) -> Excluded
      const day31ExcludedEvent = createMockEvent({
        id: 'day-31-excluded',
        startTime: new Date(2026, 9, 2, 8, 0, 0),
        finishTime: new Date(2026, 9, 5, 12, 0, 0),
      });
      expect(isEventInRollingWindow(day31ExcludedEvent, localAnchor)).toBe(false);

      // Multi-day event starting 10 days ago and ending on Day 25 -> Included
      const ongoingMultiDayEvent = createMockEvent({
        id: 'ongoing-multiday',
        startTime: new Date(2026, 7, 22, 8, 0, 0),
        finishTime: new Date(2026, 8, 26, 20, 0, 0),
      });
      expect(isEventInRollingWindow(ongoingMultiDayEvent, localAnchor)).toBe(true);

      // Event with only rehearsalTime scheduled in window -> Included
      const rehearsalOnlyEvent = createMockEvent({
        id: 'rehearsal-only',
        startTime: null,
        finishTime: null,
        deliveryTime: null,
        setupTime: null,
        eventStartDate: null,
        eventFinishDate: null,
        pickupTime: null,
        packdownTime: null,
        rehearsalTime: new Date(2026, 8, 15, 14, 0, 0),
      });
      expect(isEventInRollingWindow(rehearsalOnlyEvent, localAnchor)).toBe(true);
    });
  });

  describe('filterEvents', () => {
    const mockEvents: Event[] = [
      createMockEvent({
        id: 'ev-inquiry',
        eventName: 'Autumn Gala Dinner',
        eventNumber: 101,
        eventStatusId: 'Inquiry',
        clientId: 'City Council',
        venueId: 'Town Hall',
        notes: 'Needs 4 wireless mics',
        startTime: new Date('2026-09-02T10:00:00.000Z'),
        finishTime: new Date('2026-09-02T22:00:00.000Z'),
      }),
      createMockEvent({
        id: 'ev-pending',
        eventName: 'Spring Fashion Runway',
        eventNumber: 102,
        eventStatusId: 'Pending',
        clientId: 'Vogue APAC',
        venueId: 'Convention Centre Hall A',
        notes: 'LED wall configuration',
        startTime: new Date('2026-09-05T08:00:00.000Z'),
        finishTime: new Date('2026-09-05T20:00:00.000Z'),
      }),
      createMockEvent({
        id: 'ev-confirmed',
        eventName: 'Rock Fest 2026',
        eventNumber: 103,
        eventStatusId: 'Confirmed',
        clientId: 'Live Nation',
        venueId: 'Stadium Arena',
        notes: 'Line array audio package',
        startTime: new Date('2026-09-10T08:00:00.000Z'),
        finishTime: new Date('2026-09-10T23:00:00.000Z'),
      }),
      createMockEvent({
        id: 'ev-completed',
        eventName: 'Morning Breakfast Launch',
        eventNumber: 104,
        eventStatusId: 'Completed',
        clientId: 'Tech Innovators',
        venueId: 'Hotel Ballroom',
        notes: 'Podium & spotlights',
        startTime: new Date('2026-09-01T06:00:00.000Z'),
        finishTime: new Date('2026-09-01T11:00:00.000Z'),
      }),
      createMockEvent({
        id: 'ev-past',
        eventName: 'Old Festival 2025',
        eventNumber: 99,
        eventStatusId: 'Completed',
        startTime: new Date('2026-08-01T08:00:00.000Z'),
        finishTime: new Date('2026-08-01T20:00:00.000Z'),
        packdownTime: new Date('2026-08-01T20:00:00.000Z'),
      }),
      createMockEvent({
        id: 'ev-distant',
        eventName: 'Next Year NYE Concert',
        eventNumber: 105,
        eventStatusId: 'Confirmed',
        startTime: new Date('2026-12-31T08:00:00.000Z'),
        finishTime: new Date('2026-12-31T23:59:00.000Z'),
      }),
    ];

    it('filters by status correctly', () => {
      const allEvents = filterEvents(mockEvents, { status: 'All', referenceDate: baseAnchor });
      expect(allEvents.map((e) => e.id)).toEqual(['ev-completed', 'ev-inquiry', 'ev-pending', 'ev-confirmed']);

      const inquiryEvents = filterEvents(mockEvents, { status: 'Inquiry', referenceDate: baseAnchor });
      expect(inquiryEvents).toHaveLength(1);
      expect(inquiryEvents[0].id).toBe('ev-inquiry');

      const pendingEvents = filterEvents(mockEvents, { status: 'Pending', referenceDate: baseAnchor });
      expect(pendingEvents).toHaveLength(1);
      expect(pendingEvents[0].id).toBe('ev-pending');

      const confirmedEvents = filterEvents(mockEvents, { status: 'Confirmed', referenceDate: baseAnchor });
      expect(confirmedEvents).toHaveLength(1);
      expect(confirmedEvents[0].id).toBe('ev-confirmed');

      const completedEvents = filterEvents(mockEvents, { status: 'Completed', referenceDate: baseAnchor });
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].id).toBe('ev-completed');
    });

    it('filters by search keyword matching eventName, eventNumber, client, venue, or notes', () => {
      // By event name
      const byName = filterEvents(mockEvents, { search: 'Runway', referenceDate: baseAnchor });
      expect(byName).toHaveLength(1);
      expect(byName[0].id).toBe('ev-pending');

      // By event number
      const byNumber = filterEvents(mockEvents, { search: '103', referenceDate: baseAnchor });
      expect(byNumber).toHaveLength(1);
      expect(byNumber[0].id).toBe('ev-confirmed');

      // By client
      const byClient = filterEvents(mockEvents, { search: 'City Council', referenceDate: baseAnchor });
      expect(byClient).toHaveLength(1);
      expect(byClient[0].id).toBe('ev-inquiry');

      // By venue
      const byVenue = filterEvents(mockEvents, { search: 'Ballroom', referenceDate: baseAnchor });
      expect(byVenue).toHaveLength(1);
      expect(byVenue[0].id).toBe('ev-completed');

      // By notes
      const byNotes = filterEvents(mockEvents, { search: 'wireless mics', referenceDate: baseAnchor });
      expect(byNotes).toHaveLength(1);
      expect(byNotes[0].id).toBe('ev-inquiry');
    });

    it('filters by multi-keyword search query and hash prefixes', () => {
      const byMultiWord = filterEvents(mockEvents, { search: 'Fashion Runway', referenceDate: baseAnchor });
      expect(byMultiWord).toHaveLength(1);
      expect(byMultiWord[0].id).toBe('ev-pending');

      const byHashAndSpace = filterEvents(mockEvents, { search: '# 103', referenceDate: baseAnchor });
      expect(byHashAndSpace).toHaveLength(1);
      expect(byHashAndSpace[0].id).toBe('ev-confirmed');
    });

    it('returns empty array when search matches nothing', () => {
      const none = filterEvents(mockEvents, { search: 'nonexistent keyword xyz', referenceDate: baseAnchor });
      expect(none).toHaveLength(0);
    });

    it('sorts events chronologically by start date', () => {
      const sorted = filterEvents(mockEvents, { referenceDate: baseAnchor });
      expect(sorted[0].id).toBe('ev-completed'); // Sept 1 06:00
      expect(sorted[1].id).toBe('ev-inquiry');   // Sept 2 10:00
      expect(sorted[2].id).toBe('ev-pending');   // Sept 5 08:00
      expect(sorted[3].id).toBe('ev-confirmed'); // Sept 10 08:00
    });
  });

  describe('computeEventMetrics', () => {
    const mockEvents: Event[] = [
      createMockEvent({ id: 'e1', eventStatusId: 'Inquiry', startTime: new Date('2026-09-02T10:00:00.000Z') }),
      createMockEvent({ id: 'e2', eventStatusId: 'inquiry' as any, startTime: new Date('2026-09-03T10:00:00.000Z') }),
      createMockEvent({ id: 'e3', eventStatusId: 'Pending', startTime: new Date('2026-09-04T10:00:00.000Z') }),
      createMockEvent({ id: 'e4', eventStatusId: 'Confirmed', startTime: new Date('2026-09-05T10:00:00.000Z') }),
      createMockEvent({ id: 'e5', eventStatusId: 'confirmed' as any, startTime: new Date('2026-09-06T10:00:00.000Z') }),
      createMockEvent({ id: 'e6', eventStatusId: 'Completed', startTime: new Date('2026-09-01T08:00:00.000Z') }),
      createMockEvent({
        id: 'e-past',
        eventStatusId: 'Completed',
        startTime: new Date('2026-08-01T08:00:00.000Z'),
        finishTime: new Date('2026-08-01T20:00:00.000Z'),
        packdownTime: new Date('2026-08-01T20:00:00.000Z'),
      }),
    ];

    it('correctly tallies metrics in 30-day window case-insensitively', () => {
      const metrics = computeEventMetrics(mockEvents, { referenceDate: baseAnchor });

      expect(metrics.total).toBe(6);
      expect(metrics.all).toBe(6);
      expect(metrics.inquiry).toBe(2);
      expect(metrics.pending).toBe(1);
      expect(metrics.confirmed).toBe(2);
      expect(metrics.completed).toBe(1);
    });

    it('handles null, undefined, or empty arrays gracefully', () => {
      expect(computeEventMetrics(null as any)).toEqual({
        total: 0,
        all: 0,
        inquiry: 0,
        pending: 0,
        confirmed: 0,
        completed: 0,
      });
      expect(computeEventMetrics([] as any)).toEqual({
        total: 0,
        all: 0,
        inquiry: 0,
        pending: 0,
        confirmed: 0,
        completed: 0,
      });
      expect(filterEvents(null as any)).toEqual([]);
      expect(filterEvents(undefined as any)).toEqual([]);
    });
  });

  describe('getEventOperationalWindow edge cases', () => {
    it('returns nulls for null or undefined event objects', () => {
      expect(getEventOperationalWindow(null as any)).toEqual({ start: null, end: null });
      expect(getEventOperationalWindow(undefined as any)).toEqual({ start: null, end: null });
      expect(getEventOperationalWindow({})).toEqual({ start: null, end: null });
    });

    it('correctly computes start and end when only deliveryTime and setupTime are specified', () => {
      const delivery = new Date('2026-09-10T08:00:00.000Z');
      const setup = new Date('2026-09-10T12:00:00.000Z');
      const window = getEventOperationalWindow({ deliveryTime: delivery, setupTime: setup });

      expect(window.start?.toISOString()).toBe(delivery.toISOString());
      expect(window.end?.toISOString()).toBe(setup.toISOString());
    });

    it('correctly computes start and end when only pickupTime and packdownTime are specified', () => {
      const pickup = new Date('2026-09-12T20:00:00.000Z');
      const packdown = new Date('2026-09-13T02:00:00.000Z');
      const window = getEventOperationalWindow({ pickupTime: pickup, packdownTime: packdown });

      expect(window.start?.toISOString()).toBe(pickup.toISOString());
      expect(window.end?.toISOString()).toBe(packdown.toISOString());
    });

    it('correctly computes window across all 5 operational stage windows', () => {
      const delivery = new Date('2026-09-15T06:00:00.000Z');
      const setup = new Date('2026-09-15T10:00:00.000Z');
      const rehearsal = new Date('2026-09-15T14:00:00.000Z');
      const eventStart = new Date('2026-09-15T18:00:00.000Z');
      const eventFinish = new Date('2026-09-15T23:00:00.000Z');
      const pickup = new Date('2026-09-16T00:00:00.000Z');
      const packdown = new Date('2026-09-16T04:00:00.000Z');

      const window = getEventOperationalWindow({
        deliveryTime: delivery,
        setupTime: setup,
        rehearsalTime: rehearsal,
        eventStartDate: eventStart,
        eventFinishDate: eventFinish,
        pickupTime: pickup,
        packdownTime: packdown,
      });

      expect(window.start?.toISOString()).toBe(delivery.toISOString());
      expect(window.end?.toISOString()).toBe(packdown.toISOString());
    });

    it('handles unscheduled draft events (all dates null) safely in rolling window and sorting', () => {
      const unscheduledDraft = createMockEvent({
        id: 'ev-unscheduled',
        eventName: 'Unscheduled Draft Inquiry',
        eventNumber: 50,
        startTime: null,
        finishTime: null,
        deliveryTime: null,
        setupTime: null,
        rehearsalTime: null,
        eventStartDate: null,
        eventFinishDate: null,
        pickupTime: null,
        packdownTime: null,
      });

      expect(isEventInRollingWindow(unscheduledDraft, baseAnchor)).toBe(true);

      const filtered = filterEvents([unscheduledDraft], { referenceDate: baseAnchor });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('ev-unscheduled');
    });

    it('correctly handles raw Firestore timestamp objects in operational window', () => {
      const eventWithFirestoreTimestamps = {
        deliveryTime: { seconds: 1788220800, nanoseconds: 0 },
        packdownTime: { _seconds: 1788235200, _nanoseconds: 500000000 },
      };

      const window = getEventOperationalWindow(eventWithFirestoreTimestamps as any);
      expect(window.start).toBeInstanceOf(Date);
      expect(window.end).toBeInstanceOf(Date);
      expect(window.start?.getTime()).toBe(1788220800000);
      expect(window.end?.getTime()).toBe(1788235200500);
    });

    it('recovers gracefully from inverted dates where finishTime is before startTime', () => {
      const invertedEvent = createMockEvent({
        id: 'inverted-event',
        startTime: new Date('2026-09-10T18:00:00.000Z'),
        finishTime: new Date('2026-09-05T08:00:00.000Z'),
      });

      const window = getEventOperationalWindow(invertedEvent);
      expect(window.start?.getTime()).toBe(new Date('2026-09-05T08:00:00.000Z').getTime());
      expect(window.end?.getTime()).toBe(new Date('2026-09-10T18:00:00.000Z').getTime());
    });

    it('searches across multiple fields in combined search query (e.g. client + venue tokens)', () => {
      const complexEvent = createMockEvent({
        id: 'complex-search-event',
        eventName: 'Annual Gala 2026',
        eventNumber: 0,
        clientId: 'Sydney Opera Trust',
        venueId: 'Concert Hall North',
        notes: 'VIP red carpet entrance',
        startTime: new Date('2026-09-08T10:00:00.000Z'),
        finishTime: new Date('2026-09-08T22:00:00.000Z'),
      });

      // Search matching token from client ('opera') and venue ('hall')
      const resultCrossField = filterEvents([complexEvent], { search: 'Opera Concert Hall', referenceDate: baseAnchor });
      expect(resultCrossField).toHaveLength(1);
      expect(resultCrossField[0].id).toBe('complex-search-event');

      // Search matching event number 0
      const resultZeroNum = filterEvents([complexEvent], { search: '#0', referenceDate: baseAnchor });
      expect(resultZeroNum).toHaveLength(1);
    });

    it('handles custom rolling window duration (e.g. 7 days and 0 days)', () => {
      const eventIn7Days = createMockEvent({
        id: 'event-7d',
        startTime: new Date('2026-09-06T10:00:00.000Z'), // Day 5
      });
      const eventIn15Days = createMockEvent({
        id: 'event-15d',
        startTime: new Date('2026-09-16T10:00:00.000Z'), // Day 15
      });

      // 7 days window
      expect(isEventInRollingWindow(eventIn7Days, baseAnchor, 7)).toBe(true);
      expect(isEventInRollingWindow(eventIn15Days, baseAnchor, 7)).toBe(false);

      // 0 days window (today only)
      const eventToday = createMockEvent({
        id: 'event-today',
        startTime: new Date('2026-09-01T04:00:00.000Z'),
      });
      expect(isEventInRollingWindow(eventToday, baseAnchor, 0)).toBe(true);
      expect(isEventInRollingWindow(eventIn7Days, baseAnchor, 0)).toBe(false);
    });

    it('handles year-end transition for rolling window (Dec 31 to Jan 30)', () => {
      const decAnchor = new Date('2026-12-25T12:00:00.000Z');
      const janEvent = createMockEvent({
        id: 'nye-jan-event',
        startTime: new Date('2027-01-10T10:00:00.000Z'), // ~16 days after Dec 25
      });
      const febEvent = createMockEvent({
        id: 'feb-event',
        startTime: new Date('2027-02-15T10:00:00.000Z'), // ~52 days after Dec 25
      });

      expect(isEventInRollingWindow(janEvent, decAnchor, 30)).toBe(true);
      expect(isEventInRollingWindow(febEvent, decAnchor, 30)).toBe(false);
    });
  });
});
