/**
 * src/lib/__tests__/logistics-engine.test.ts
 * Comprehensive unit tests for Kuro Mobile Logistics domain engine.
 */

import {
  formatDestinationAddress,
  buildMapsUrl,
  buildPhoneUrl,
  isJobActive,
  isJobCompleted,
  isJobScheduled,
  isJobPending,
  isJobPlanned,
  isJobInProgress,
  isValidStatusTransition,
  filterLogisticsForDriver,
  computeLogisticsMetrics,
} from '../logistics-engine';
import type { LogisticsEntry } from '../../types/logistics';

describe('Logistics Engine Domain Functions', () => {
  describe('formatDestinationAddress', () => {
    it('returns empty string for null, undefined, or empty values', () => {
      expect(formatDestinationAddress(null)).toBe('');
      expect(formatDestinationAddress(undefined)).toBe('');
      expect(formatDestinationAddress('')).toBe('');
      expect(formatDestinationAddress('   ')).toBe('');
      expect(formatDestinationAddress(123 as any)).toBe('');
    });

    it('formats single line address cleanly', () => {
      expect(formatDestinationAddress('100 George St, Sydney NSW 2000')).toBe(
        '100 George St, Sydney NSW 2000'
      );
    });

    it('formats multi-line addresses by joining lines with commas and removing excessive whitespace', () => {
      const rawAddress = `
        Building 5, Level 2
        45 Pirrama Road
        Pyrmont NSW 2009
      `;
      expect(formatDestinationAddress(rawAddress)).toBe(
        'Building 5, Level 2, 45 Pirrama Road, Pyrmont NSW 2009'
      );
    });

    it('handles carriage returns and tabs cleanly', () => {
      const raw = 'Dock 4\r\nConvention Centre\r\nDarling Harbour\tNSW';
      expect(formatDestinationAddress(raw)).toBe(
        'Dock 4, Convention Centre, Darling Harbour NSW'
      );
    });
  });

  describe('buildMapsUrl', () => {
    it('returns empty string when address and destinationName are missing or empty', () => {
      expect(buildMapsUrl(null, null)).toBe('');
      expect(buildMapsUrl(undefined, undefined)).toBe('');
      expect(buildMapsUrl('', '')).toBe('');
      expect(buildMapsUrl('   ', '   ')).toBe('');
    });

    it('builds maps URL from address only', () => {
      const url = buildMapsUrl('100 George St, Sydney NSW');
      expect(url).toBe(
        'https://www.google.com/maps/search/?api=1&query=100%20George%20St%2C%20Sydney%20NSW'
      );
    });

    it('builds maps URL from destinationName only', () => {
      const url = buildMapsUrl(null, 'Sydney Opera House');
      expect(url).toBe(
        'https://www.google.com/maps/search/?api=1&query=Sydney%20Opera%20House'
      );
    });

    it('combines destinationName and address when distinct', () => {
      const url = buildMapsUrl('Bennelong Point, Sydney', 'Sydney Opera House');
      expect(url).toBe(
        'https://www.google.com/maps/search/?api=1&query=Sydney%20Opera%20House%2C%20Bennelong%20Point%2C%20Sydney'
      );
    });

    it('avoids duplicating when address already contains destination name', () => {
      const url = buildMapsUrl('Sydney Opera House, Bennelong Point', 'Sydney Opera House');
      expect(url).toBe(
        'https://www.google.com/maps/search/?api=1&query=Sydney%20Opera%20House%2C%20Bennelong%20Point'
      );
    });

    it('properly encodes special characters and symbols', () => {
      const url = buildMapsUrl('St. Mary & St. John #5/12', 'Venue A & B');
      expect(url).toContain('https://www.google.com/maps/search/?api=1&query=');
      expect(url).toContain(encodeURIComponent('Venue A & B, St. Mary & St. John #5/12'));
    });
  });

  describe('buildPhoneUrl', () => {
    it('returns null for null, undefined, empty, or non-string contact', () => {
      expect(buildPhoneUrl(null)).toBeNull();
      expect(buildPhoneUrl(undefined)).toBeNull();
      expect(buildPhoneUrl('')).toBeNull();
      expect(buildPhoneUrl('   ')).toBeNull();
      expect(buildPhoneUrl(123456 as any)).toBeNull();
    });

    it('returns null when text contains no valid phone number', () => {
      expect(buildPhoneUrl('No contact phone')).toBeNull();
      expect(buildPhoneUrl('Call warehouse on site')).toBeNull();
      expect(buildPhoneUrl('12')).toBeNull(); // Less than 3 digits
    });

    it('sanitizes standard Australian mobile number', () => {
      expect(buildPhoneUrl('0412 345 678')).toBe('tel:0412345678');
      expect(buildPhoneUrl('0412-345-678')).toBe('tel:0412345678');
    });

    it('sanitizes landline with area code and parentheses', () => {
      expect(buildPhoneUrl('(02) 9876 5432')).toBe('tel:0298765432');
    });

    it('sanitizes international format preserving leading plus', () => {
      expect(buildPhoneUrl('+61 412 345 678')).toBe('tel:+61412345678');
      expect(buildPhoneUrl('+1 (555) 019-2834')).toBe('tel:+15550192834');
    });

    it('extracts phone number from labeled contact strings', () => {
      expect(buildPhoneUrl('Site Contact (Dave): 0400 123 456')).toBe('tel:0400123456');
      expect(buildPhoneUrl('Emergency: +61 2 9999 8888')).toBe('tel:+61299998888');
    });
  });

  describe('Job Status Evaluators', () => {
    describe('isJobActive', () => {
      it('recognizes all canonical active statuses', () => {
        expect(isJobActive('In Transit')).toBe(true);
        expect(isJobActive('in transit')).toBe(true);
        expect(isJobActive('in-transit')).toBe(true);
        expect(isJobActive('in_transit')).toBe(true);
        expect(isJobActive('En Route')).toBe(true);
        expect(isJobActive('en-route')).toBe(true);
        expect(isJobActive('In Progress')).toBe(true);
        expect(isJobActive('in-progress')).toBe(true);
        expect(isJobActive('Arrived')).toBe(true);
        expect(isJobActive('Active')).toBe(true);
        expect(isJobActive('Dispatched')).toBe(true);
        expect(isJobActive('Out for Delivery')).toBe(true);
      });

      it('respects role=in-progress from StatusDefinition', () => {
        expect(isJobActive('Custom Active Status', 'in-progress')).toBe(true);
        expect(isJobActive('In Transit', 'completed')).toBe(false);
      });

      it('returns false for scheduled, completed, and invalid statuses', () => {
        expect(isJobActive('Scheduled')).toBe(false);
        expect(isJobActive('Draft')).toBe(false);
        expect(isJobActive('Completed')).toBe(false);
        expect(isJobActive('Cancelled')).toBe(false);
        expect(isJobActive(null)).toBe(false);
        expect(isJobActive(undefined)).toBe(false);
        expect(isJobActive('')).toBe(false);
      });
    });

    describe('isJobCompleted', () => {
      it('recognizes all canonical completed statuses', () => {
        expect(isJobCompleted('Completed')).toBe(true);
        expect(isJobCompleted('completed')).toBe(true);
        expect(isJobCompleted('Delivered')).toBe(true);
        expect(isJobCompleted('Returned')).toBe(true);
        expect(isJobCompleted('Closed')).toBe(true);
        expect(isJobCompleted('Done')).toBe(true);
      });

      it('respects role=completed from StatusDefinition', () => {
        expect(isJobCompleted('Custom Done Status', 'completed')).toBe(true);
        expect(isJobCompleted('Completed', 'in-progress')).toBe(false);
      });

      it('returns false for active, scheduled, and invalid statuses', () => {
        expect(isJobCompleted('In Transit')).toBe(false);
        expect(isJobCompleted('Scheduled')).toBe(false);
        expect(isJobCompleted('Draft')).toBe(false);
        expect(isJobCompleted('Cancelled')).toBe(false);
        expect(isJobCompleted(null)).toBe(false);
        expect(isJobCompleted(undefined)).toBe(false);
      });
    });

    describe('isJobScheduled', () => {
      it('recognizes all canonical scheduled statuses', () => {
        expect(isJobScheduled('Scheduled')).toBe(true);
        expect(isJobScheduled('scheduled')).toBe(true);
        expect(isJobScheduled('Pending')).toBe(true);
        expect(isJobScheduled('Confirmed')).toBe(true);
        expect(isJobScheduled('Draft')).toBe(true);
        expect(isJobScheduled('Ready')).toBe(true);
        expect(isJobScheduled('Assigned')).toBe(true);
      });

      it('returns false when role is defined as in-progress or completed', () => {
        expect(isJobScheduled('Scheduled', 'in-progress')).toBe(false);
        expect(isJobScheduled('Scheduled', 'completed')).toBe(false);
      });

      it('returns false for active and completed statuses', () => {
        expect(isJobScheduled('In Transit')).toBe(false);
        expect(isJobScheduled('Completed')).toBe(false);
        expect(isJobScheduled(null)).toBe(false);
        expect(isJobScheduled('')).toBe(false);
      });
    });
  });

  describe('isValidStatusTransition', () => {
    it('returns true for idempotent same-status transitions', () => {
      expect(isValidStatusTransition('Scheduled', 'Scheduled')).toBe(true);
      expect(isValidStatusTransition('In Transit', 'In Transit')).toBe(true);
      expect(isValidStatusTransition('Completed', 'Completed')).toBe(true);
    });

    it('returns false for null, undefined, or empty values', () => {
      expect(isValidStatusTransition(null, 'In Transit')).toBe(false);
      expect(isValidStatusTransition('Scheduled', null)).toBe(false);
      expect(isValidStatusTransition('', '')).toBe(false);
    });

    it('allows valid progression transitions', () => {
      expect(isValidStatusTransition('Draft', 'Scheduled')).toBe(true);
      expect(isValidStatusTransition('Scheduled', 'In Transit')).toBe(true);
      expect(isValidStatusTransition('In Transit', 'Arrived')).toBe(true);
      expect(isValidStatusTransition('Arrived', 'Completed')).toBe(true);
      expect(isValidStatusTransition('In Transit', 'Completed')).toBe(true);
      expect(isValidStatusTransition('Scheduled', 'Cancelled')).toBe(true);
      expect(isValidStatusTransition('In Transit', 'Cancelled')).toBe(true);
      expect(isValidStatusTransition('Completed', 'Archived')).toBe(true);
    });

    it('allows reopening transitions', () => {
      expect(isValidStatusTransition('Completed', 'In Transit')).toBe(true);
      expect(isValidStatusTransition('Completed', 'Scheduled')).toBe(true);
      expect(isValidStatusTransition('Cancelled', 'Scheduled')).toBe(true);
    });
  });

  describe('filterLogisticsForDriver', () => {
    const mockEntries: LogisticsEntry[] = [
      {
        id: 'job-1',
        tenantId: 'tenant-1',
        driverName: 'Alice Cooper',
        assigneeId: 'user-101',
        eventName: 'Apex Music Festival',
        eventNumber: 501,
        location: 'Sydney Olympic Park',
        notes: 'Main stage setup gear',
        start: new Date('2026-09-01T08:00:00Z'),
        end: new Date('2026-09-01T18:00:00Z'),
        createdBy: 'admin',
        updatedBy: 'admin',
        createdAt: '2026-08-20T00:00:00Z',
        updatedAt: '2026-08-20T00:00:00Z',
        status: 'In Transit',
        destinations: [
          {
            id: 'dest-1',
            type: 'destination',
            destinationName: 'Gate 4 Loading Dock',
            address: 'Olympic Blvd, Sydney Olympic Park NSW',
            contact: 'Dave: 0411 222 333',
            estTravelTime: '45 mins',
            detailNote: 'Enter via security gate',
            distance: '25 km',
          },
        ],
      },
      {
        id: 'job-2',
        tenantId: 'tenant-1',
        driverName: 'Bob Builder',
        assigneeId: 'user-102',
        eventName: 'Harbour Lights Gala',
        eventNumber: 502,
        location: 'Harbour View Hotel',
        notes: 'Audio rig delivery',
        start: new Date('2026-09-02T10:00:00Z'),
        end: new Date('2026-09-02T16:00:00Z'),
        createdBy: 'admin',
        updatedBy: 'admin',
        createdAt: '2026-08-21T00:00:00Z',
        updatedAt: '2026-08-21T00:00:00Z',
        status: 'Scheduled',
        destinations: [
          {
            id: 'dest-2',
            type: 'destination',
            destinationName: 'Main Ballroom Dock',
            address: '100 George St, The Rocks NSW',
            contact: 'Sarah: 0422 333 444',
            estTravelTime: '30 mins',
            detailNote: 'Use freight elevator',
            distance: '15 km',
          },
        ],
      },
      {
        id: 'job-3',
        tenantId: 'tenant-1',
        driverName: 'Alice Cooper',
        assigneeId: 'user-101',
        eventName: 'Corporate Summit',
        eventNumber: 503,
        location: 'ICC Sydney',
        notes: 'LED screens collection',
        start: new Date('2026-08-25T14:00:00Z'),
        end: new Date('2026-08-25T20:00:00Z'),
        createdBy: 'admin',
        updatedBy: 'admin',
        createdAt: '2026-08-19T00:00:00Z',
        updatedAt: '2026-08-25T20:00:00Z',
        status: 'Completed',
      },
      {
        id: 'job-4-archived',
        tenantId: 'tenant-1',
        driverName: 'Alice Cooper',
        assigneeId: 'user-101',
        eventName: 'Old Archived Job',
        eventNumber: 499,
        location: 'Old Warehouse',
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2026-01-01T00:00:00Z'),
        createdBy: 'admin',
        updatedBy: 'admin',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        status: 'Completed',
        archived: true,
      },
    ];

    it('returns empty array when input is null, undefined, or empty', () => {
      expect(filterLogisticsForDriver(null, null)).toEqual([]);
      expect(filterLogisticsForDriver(undefined, null)).toEqual([]);
      expect(filterLogisticsForDriver([], null)).toEqual([]);
    });

    it('excludes archived entries by default', () => {
      const result = filterLogisticsForDriver(mockEntries, null, false, 'all', '');
      expect(result.length).toBe(3);
      expect(result.some((e) => e.id === 'job-4-archived')).toBe(false);
    });

    it('filters by driver assignment when onlyAssigned is true', () => {
      const userAlice = { id: 'user-101', name: 'Alice Cooper', email: 'alice@example.com' };
      const result = filterLogisticsForDriver(mockEntries, userAlice, true, 'all', '');

      expect(result.length).toBe(2);
      expect(result.map((e) => e.id)).toEqual(['job-1', 'job-3']);
    });

    it('matches driver by firstName and lastName when name property is absent', () => {
      const userAlice = { firstName: 'Alice', lastName: 'Cooper' };
      const result = filterLogisticsForDriver(mockEntries, userAlice, true, 'all', '');

      expect(result.length).toBe(2);
      expect(result.map((e) => e.id)).toEqual(['job-1', 'job-3']);
    });

    it('returns empty array when onlyAssigned is true but user is null or empty', () => {
      expect(filterLogisticsForDriver(mockEntries, null, true, 'all', '')).toEqual([]);
      expect(filterLogisticsForDriver(mockEntries, {}, true, 'all', '')).toEqual([]);
    });

    it('filters by status category', () => {
      const activeJobs = filterLogisticsForDriver(mockEntries, null, false, 'active', '');
      expect(activeJobs.length).toBe(1);
      expect(activeJobs[0].id).toBe('job-1');

      const scheduledJobs = filterLogisticsForDriver(mockEntries, null, false, 'scheduled', '');
      expect(scheduledJobs.length).toBe(1);
      expect(scheduledJobs[0].id).toBe('job-2');

      const completedJobs = filterLogisticsForDriver(mockEntries, null, false, 'completed', '');
      expect(completedJobs.length).toBe(1);
      expect(completedJobs[0].id).toBe('job-3');

      const inTransitJobs = filterLogisticsForDriver(mockEntries, null, false, 'in_transit', '');
      expect(inTransitJobs.length).toBe(1);
      expect(inTransitJobs[0].id).toBe('job-1');
    });

    it('filters by search keyword across eventName, location, eventNumber, notes, and driverName', () => {
      expect(filterLogisticsForDriver(mockEntries, null, false, 'all', 'Apex').length).toBe(1);
      expect(filterLogisticsForDriver(mockEntries, null, false, 'all', '502').length).toBe(1);
      expect(filterLogisticsForDriver(mockEntries, null, false, 'all', 'Olympic Park').length).toBe(1);
      expect(filterLogisticsForDriver(mockEntries, null, false, 'all', 'LED screens').length).toBe(1);
      expect(filterLogisticsForDriver(mockEntries, null, false, 'all', 'Bob Builder').length).toBe(1);
    });

    it('filters by search keyword matching destinations and contact info', () => {
      expect(filterLogisticsForDriver(mockEntries, null, false, 'all', 'Gate 4').length).toBe(1);
      expect(filterLogisticsForDriver(mockEntries, null, false, 'all', 'Sarah').length).toBe(1);
      expect(filterLogisticsForDriver(mockEntries, null, false, 'all', 'freight elevator').length).toBe(1);
    });

    it('combines driver filtering, status filtering, and search keyword', () => {
      const userAlice = { id: 'user-101', name: 'Alice Cooper' };
      const result = filterLogisticsForDriver(mockEntries, userAlice, true, 'active', 'Apex');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('job-1');

      const noResult = filterLogisticsForDriver(mockEntries, userAlice, true, 'active', 'Ballroom');
      expect(noResult.length).toBe(0);
    });

    it('is a pure function and does not mutate the source array', () => {
      const originalLength = mockEntries.length;
      const snapshot = JSON.stringify(mockEntries);

      filterLogisticsForDriver(mockEntries, { id: 'user-101' }, true, 'active', 'Apex');

      expect(mockEntries.length).toBe(originalLength);
      expect(JSON.stringify(mockEntries)).toBe(snapshot);
    });
  });

  describe('isJobPending and isJobPlanned', () => {
    it('recognizes pending statuses', () => {
      expect(isJobPending('Pending')).toBe(true);
      expect(isJobPending('Draft')).toBe(true);
      expect(isJobPending('Unassigned')).toBe(true);
      expect(isJobPending('Scheduled')).toBe(false);
      expect(isJobPending('Completed')).toBe(false);
    });

    it('recognizes planned statuses', () => {
      expect(isJobPlanned('Planned')).toBe(true);
      expect(isJobPlanned('Scheduled')).toBe(true);
      expect(isJobPlanned('Confirmed')).toBe(true);
      expect(isJobPlanned('Ready')).toBe(true);
      expect(isJobPlanned('Assigned')).toBe(true);
      expect(isJobPlanned('Pending')).toBe(false);
      expect(isJobPlanned('Completed')).toBe(false);
    });
  });

  describe('computeLogisticsMetrics', () => {
    it('returns zeroed metrics for null, undefined, or empty array', () => {
      const zeroMetrics = {
        total: 0,
        all: 0,
        pending: 0,
        planned: 0,
        inProgress: 0,
        completed: 0,
        active: 0,
        scheduled: 0,
        inTransit: 0,
      };
      expect(computeLogisticsMetrics(null)).toEqual(zeroMetrics);
      expect(computeLogisticsMetrics(undefined)).toEqual(zeroMetrics);
      expect(computeLogisticsMetrics([])).toEqual(zeroMetrics);
    });

    it('accurately tallies total, pending, planned, inProgress, completed, active, scheduled, and inTransit counts ignoring archived entries', () => {
      const entries: LogisticsEntry[] = [
        {
          id: '1',
          tenantId: 't1',
          location: 'Loc 1',
          start: new Date(),
          end: new Date(),
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '',
          updatedAt: '',
          status: 'In Transit',
        },
        {
          id: '2',
          tenantId: 't1',
          location: 'Loc 2',
          start: new Date(),
          end: new Date(),
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '',
          updatedAt: '',
          status: 'En Route',
        },
        {
          id: '3',
          tenantId: 't1',
          location: 'Loc 3',
          start: new Date(),
          end: new Date(),
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '',
          updatedAt: '',
          status: 'Scheduled',
        },
        {
          id: '4',
          tenantId: 't1',
          location: 'Loc 4',
          start: new Date(),
          end: new Date(),
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '',
          updatedAt: '',
          status: 'Pending',
        },
        {
          id: '5',
          tenantId: 't1',
          location: 'Loc 5',
          start: new Date(),
          end: new Date(),
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '',
          updatedAt: '',
          status: 'Completed',
        },
        {
          id: '6-archived',
          tenantId: 't1',
          location: 'Loc 6',
          start: new Date(),
          end: new Date(),
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '',
          updatedAt: '',
          status: 'Completed',
          archived: true,
        },
      ];

      const metrics = computeLogisticsMetrics(entries);
      expect(metrics).toEqual({
        total: 5,
        all: 5,
        pending: 1,    // 'Pending'
        planned: 1,    // 'Scheduled'
        inProgress: 2, // 'In Transit' and 'En Route'
        completed: 1,  // 'Completed' (ignoring archived)
        active: 2,     // 'In Transit' and 'En Route'
        scheduled: 2,  // 'Scheduled' + 'Pending'
        inTransit: 2,  // 'In Transit' and 'En Route'
      });
    });
  });
});
