/**
 * __tests__/event-service.test.ts
 * Unit tests for Event Service: bounded queries, operational rolling window,
 * and real-time subscription limits.
 */

import {
  subscribeTenantEvents,
  fetchTenantEvents,
  isEventWithinOperationalWindow,
  DEFAULT_EVENTS_QUERY_LIMIT,
  DEFAULT_HISTORICAL_WINDOW_DAYS,
} from '../src/services/event-service';
import * as firestore from 'firebase/firestore';
import type { Event } from '../src/types/events';

jest.mock('firebase/firestore');

describe('Event Service Bounded Queries & Operational Window Protection', () => {
  const mockTenantId = 'tenant-amia-101';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isEventWithinOperationalWindow', () => {
    it('returns false for archived events', () => {
      const event = {
        id: 'ev-archived',
        tenantId: mockTenantId,
        archived: true,
        eventStatusId: 'Confirmed',
      } as Event;

      expect(isEventWithinOperationalWindow(event)).toBe(false);
    });

    it('returns true for active/upcoming events regardless of age', () => {
      const activeEvent = {
        id: 'ev-active',
        tenantId: mockTenantId,
        archived: false,
        eventStatusId: 'Confirmed',
        startTime: new Date('2025-01-01T00:00:00Z'),
        finishTime: new Date('2025-01-02T00:00:00Z'),
      } as Event;

      expect(isEventWithinOperationalWindow(activeEvent)).toBe(true);
    });

    it('returns true for date-less inquiries without dropping them', () => {
      const inquiryEvent = {
        id: 'ev-inquiry',
        tenantId: mockTenantId,
        archived: false,
        eventStatusId: 'Inquiry',
        startTime: null,
        finishTime: null,
      } as unknown as Event;

      expect(isEventWithinOperationalWindow(inquiryEvent)).toBe(true);
    });

    it('returns true for completed events within the 60-day operational window', () => {
      const recentCompleted = {
        id: 'ev-completed-recent',
        tenantId: mockTenantId,
        archived: false,
        eventStatusId: 'Completed',
        finishTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      } as Event;

      expect(isEventWithinOperationalWindow(recentCompleted)).toBe(true);
    });

    it('returns false for completed events older than the 60-day operational window', () => {
      const oldCompleted = {
        id: 'ev-completed-old',
        tenantId: mockTenantId,
        archived: false,
        eventStatusId: 'Completed',
        finishTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      } as Event;

      expect(isEventWithinOperationalWindow(oldCompleted)).toBe(false);
    });

    it('returns false for cancelled events older than the 60-day operational window', () => {
      const oldCancelled = {
        id: 'ev-cancelled-old',
        tenantId: mockTenantId,
        archived: false,
        eventStatusId: 'Cancelled',
        finishTime: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000), // 75 days ago
      } as Event;

      expect(isEventWithinOperationalWindow(oldCancelled)).toBe(false);
    });

    it('retains completed event if it has no end date as a fail-safe', () => {
      const datelessCompleted = {
        id: 'ev-completed-no-dates',
        tenantId: mockTenantId,
        archived: false,
        eventStatusId: 'Completed',
        finishTime: null,
        startTime: null,
      } as unknown as Event;

      expect(isEventWithinOperationalWindow(datelessCompleted)).toBe(true);
    });

    it('retains completed event if finishTime is an invalid Date (NaN) as a fail-safe', () => {
      const invalidDateCompleted = {
        id: 'ev-completed-invalid-date',
        tenantId: mockTenantId,
        archived: false,
        eventStatusId: 'Completed',
        finishTime: new Date('invalid-date'),
      } as unknown as Event;

      expect(isEventWithinOperationalWindow(invalidDateCompleted)).toBe(true);
    });
  });

  describe('subscribeTenantEvents', () => {
    it('constructs query with default limit (150) and where archived == false', () => {
      (firestore.limit as jest.Mock).mockReturnValue('mock-limit-150');
      (firestore.query as jest.Mock).mockReturnValue('mock-query');
      (firestore.onSnapshot as jest.Mock).mockReturnValue(jest.fn());

      subscribeTenantEvents(mockTenantId, jest.fn());

      expect(firestore.limit).toHaveBeenCalledWith(DEFAULT_EVENTS_QUERY_LIMIT);
      expect(firestore.query).toHaveBeenCalled();
    });

    it('allows custom limitCount override', () => {
      (firestore.limit as jest.Mock).mockReturnValue('mock-limit-50');
      (firestore.query as jest.Mock).mockReturnValue('mock-query');
      (firestore.onSnapshot as jest.Mock).mockReturnValue(jest.fn());

      subscribeTenantEvents(mockTenantId, jest.fn(), undefined, { limitCount: 50 });

      expect(firestore.limit).toHaveBeenCalledWith(50);
    });

    it('filters out non-tenant, archived, and historical completed events older than 60 days', () => {
      let snapshotCallback: (snap: any) => void = () => {};
      (firestore.onSnapshot as jest.Mock).mockImplementation((_query: any, onNext: any) => {
        snapshotCallback = onNext;
        return jest.fn();
      });

      const onData = jest.fn();
      subscribeTenantEvents(mockTenantId, onData);

      const mockDocs = [
        // 1. Valid active inquiry (date-less) -> KEEP
        {
          id: 'ev-1',
          data: () => ({
            id: 'ev-1',
            tenantId: mockTenantId,
            eventName: 'Unscheduled Inquiry',
            eventStatusId: 'Inquiry',
            archived: false,
          }),
        },
        // 2. Different tenant -> DROP
        {
          id: 'ev-2',
          data: () => ({
            id: 'ev-2',
            tenantId: 'other-tenant',
            eventName: 'Other Tenant Event',
            eventStatusId: 'Confirmed',
            archived: false,
          }),
        },
        // 3. Archived event -> DROP
        {
          id: 'ev-3',
          data: () => ({
            id: 'ev-3',
            tenantId: mockTenantId,
            eventName: 'Archived Event',
            eventStatusId: 'Confirmed',
            archived: true,
          }),
        },
        // 4. Historical completed event from 90 days ago -> DROP
        {
          id: 'ev-4',
          data: () => ({
            id: 'ev-4',
            tenantId: mockTenantId,
            eventName: 'Old Completed Show',
            eventStatusId: 'Completed',
            finishTime: { toDate: () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            archived: false,
          }),
        },
        // 5. Recent completed event from 5 days ago -> KEEP
        {
          id: 'ev-5',
          data: () => ({
            id: 'ev-5',
            tenantId: mockTenantId,
            eventName: 'Recent Completed Show',
            eventStatusId: 'Completed',
            finishTime: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
            archived: false,
          }),
        },
      ];

      snapshotCallback({
        forEach: (fn: any) => mockDocs.forEach(fn),
      });

      expect(onData).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'ev-1', eventName: 'Unscheduled Inquiry' }),
        expect.objectContaining({ id: 'ev-5', eventName: 'Recent Completed Show' }),
      ]);
    });
  });

  describe('fetchTenantEvents', () => {
    it('bounds query with limit and filters historical completed events', async () => {
      (firestore.limit as jest.Mock).mockReturnValue('mock-limit-150');
      (firestore.query as jest.Mock).mockReturnValue('mock-query');

      const mockDocs = [
        {
          id: 'ev-active-1',
          data: () => ({
            id: 'ev-active-1',
            tenantId: mockTenantId,
            eventName: 'Active Gig',
            eventStatusId: 'Confirmed',
            archived: false,
          }),
        },
        {
          id: 'ev-old-cancelled',
          data: () => ({
            id: 'ev-old-cancelled',
            tenantId: mockTenantId,
            eventName: 'Old Cancelled Gig',
            eventStatusId: 'Cancelled',
            finishTime: { toDate: () => new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) },
            archived: false,
          }),
        },
      ];

      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (fn: any) => mockDocs.forEach(fn),
      });

      const events = await fetchTenantEvents(mockTenantId);

      expect(firestore.limit).toHaveBeenCalledWith(150);
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('ev-active-1');
    });
  });
});
