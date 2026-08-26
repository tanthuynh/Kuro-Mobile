/**
 * src/services/__tests__/logistics-service.test.ts
 * Comprehensive Integration & Unit Test Suite for Kuro Mobile Logistics Firestore Service.
 * Verifies document mapping, real-time multi-tenant streams, status mutations,
 * note logging, GPS updates, and strict tenant isolation barriers.
 */

import {
  mapFirestoreLogisticsDoc,
  subscribeToLogistics,
  subscribeSingleLogisticsEntry,
  fetchTenantLogistics,
  getLogisticsEntry,
  updateLogisticsStatus,
  appendLogisticsNote,
  updateJobLocation,
  stopJobTracking,
  createLogisticsEntry,
} from '../logistics-service';
import * as firestore from 'firebase/firestore';
import type { LogisticsEntry, DriverLocation } from '@/types/logistics';

// Global Firestore Mock references from jest.setup.js
const mockFirestore = firestore as jest.Mocked<any>;

describe('Logistics Service (Firestore)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. DEFENSIVE DOCUMENT MAPPER
  // ==========================================================================
  describe('mapFirestoreLogisticsDoc', () => {
    it('maps complete Firestore document with Timestamp objects', () => {
      const rawDoc = {
        id: 'job-101',
        data: () => ({
          id: 'job-101',
          tenantId: 'tenant-kuro',
          eventName: 'Midnight Summer Festival',
          eventNumber: 501,
          vehicleId: 'veh-01',
          driverName: 'John Doe',
          assigneeId: 'user-01',
          location: 'Sydney Olympic Park',
          notes: 'Deliver before 10 AM',
          status: 'In Transit',
          start: { _seconds: 1756118400, _nanoseconds: 0 },
          end: { _seconds: 1756204800, _nanoseconds: 0 },
          createdBy: 'user-admin',
          updatedBy: 'user-driver',
          createdAt: { _seconds: 1756118400, _nanoseconds: 0 },
          updatedAt: { _seconds: 1756122000, _nanoseconds: 0 },
          archived: false,
          destinations: [
            {
              id: 'd-1',
              type: 'destination',
              destinationName: 'Main Stage',
              address: '10 Olympic Blvd, Sydney NSW 2127',
              contact: 'Bob: 0412 345 678',
              time: '09:00',
              estTravelTime: '45m',
              detailNote: 'Use Loading Dock B',
              distance: '25km',
            },
          ],
          currentLocation: {
            latitude: -33.847,
            longitude: 151.066,
            heading: 180,
            speed: 15.5,
            accuracy: 4,
            altitude: 20,
            timestamp: 1756122000000,
            driverId: 'user-01',
            driverName: 'John Doe',
            jobId: 'job-101',
          },
          lastLocationUpdate: { _seconds: 1756122000, _nanoseconds: 0 },
          isTrackingActive: true,
          trackingJobId: 'job-101',
        }),
      };

      const entry = mapFirestoreLogisticsDoc(rawDoc);

      expect(entry.id).toBe('job-101');
      expect(entry.tenantId).toBe('tenant-kuro');
      expect(entry.eventName).toBe('Midnight Summer Festival');
      expect(entry.eventNumber).toBe(501);
      expect(entry.status).toBe('In Transit');
      expect(entry.start).toBeInstanceOf(Date);
      expect(entry.end).toBeInstanceOf(Date);
      expect(entry.destinations).toHaveLength(1);
      expect(entry.destinations?.[0].destinationName).toBe('Main Stage');
      expect(entry.destinations?.[0].contact).toBe('Bob: 0412 345 678');
      expect(entry.currentLocation).toBeDefined();
      expect(entry.currentLocation?.latitude).toBe(-33.847);
      expect(entry.currentLocation?.longitude).toBe(151.066);
      expect(entry.isTrackingActive).toBe(true);
      expect(entry.trackingJobId).toBe('job-101');
    });

    it('maps sparse or corrupt document with robust fallbacks', () => {
      const rawDoc = {
        id: 'job-sparse',
        data: () => ({
          tenantId: 'tenant-kuro',
        }),
      };

      const entry = mapFirestoreLogisticsDoc(rawDoc);

      expect(entry.id).toBe('job-sparse');
      expect(entry.tenantId).toBe('tenant-kuro');
      expect(entry.status).toBe('Draft');
      expect(entry.eventName).toBe('');
      expect(entry.location).toBe('');
      expect(entry.notes).toBe('');
      expect(entry.destinations).toEqual([]);
      expect(entry.currentLocation).toBeNull();
      expect(entry.isTrackingActive).toBe(false);
      expect(entry.start).toBeInstanceOf(Date);
      expect(entry.end).toBeInstanceOf(Date);
    });

    it('handles destination notes and string coordinate parsing', () => {
      const rawDoc = {
        id: 'job-dest',
        data: () => ({
          tenantId: 'tenant-kuro',
          destinations: [
            {
              id: 'n-1',
              type: 'note',
              destinationName: 'Rest stop',
              address: '',
              detailNote: 'Lunch break',
            },
          ],
          currentLocation: {
            latitude: '-33.8688',
            longitude: '151.2093',
          },
        }),
      };

      const entry = mapFirestoreLogisticsDoc(rawDoc);
      expect(entry.destinations?.[0].type).toBe('note');
      expect(entry.currentLocation?.latitude).toBe(-33.8688);
      expect(entry.currentLocation?.longitude).toBe(151.2093);
    });
  });

  // ==========================================================================
  // 2. REAL-TIME SUBSCRIPTIONS
  // ==========================================================================
  describe('subscribeToLogistics', () => {
    it('returns empty array and no-op cleanup when tenantId is empty', () => {
      const callback = jest.fn();
      const unsubscribe = subscribeToLogistics('', callback);

      expect(callback).toHaveBeenCalledWith([]);
      expect(typeof unsubscribe).toBe('function');
      expect(mockFirestore.onSnapshot).not.toHaveBeenCalled();
    });

    it('subscribes to tenant logistics collection with non-archived filter', () => {
      const callback = jest.fn();
      const mockUnsub = jest.fn();
      let snapshotCallback: (snap: any) => void = () => {};

      mockFirestore.onSnapshot.mockImplementation((_query: any, onNext: any) => {
        snapshotCallback = onNext;
        return mockUnsub;
      });

      const unsubscribe = subscribeToLogistics('tenant-alpha', callback);

      expect(mockFirestore.collection).toHaveBeenCalledWith(expect.anything(), 'logistics');
      expect(mockFirestore.where).toHaveBeenCalledWith('tenantId', '==', 'tenant-alpha');
      expect(mockFirestore.where).toHaveBeenCalledWith('archived', '==', false);

      // Simulate snapshot emission with mixed tenants
      const mockSnapshot = {
        forEach: (fn: (doc: any) => void) => {
          fn({
            id: 'job-1',
            data: () => ({
              id: 'job-1',
              tenantId: 'tenant-alpha',
              eventName: 'Alpha Gig',
              status: 'Scheduled',
              archived: false,
            }),
          });
          // Rogue document from different tenant
          fn({
            id: 'job-2',
            data: () => ({
              id: 'job-2',
              tenantId: 'tenant-beta',
              eventName: 'Beta Gig',
              status: 'Scheduled',
              archived: false,
            }),
          });
        },
      };

      snapshotCallback(mockSnapshot);

      expect(callback).toHaveBeenCalledTimes(1);
      const emitted = callback.mock.calls[0][0] as LogisticsEntry[];
      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe('job-1');
      expect(emitted[0].tenantId).toBe('tenant-alpha');

      unsubscribe();
      expect(mockUnsub).toHaveBeenCalled();
    });

    it('handles snapshot error and forwards to onError callback', () => {
      const callback = jest.fn();
      const onError = jest.fn();
      const errorObj = new Error('Permission denied');

      mockFirestore.onSnapshot.mockImplementation((_query: any, _onNext: any, onErr: any) => {
        onErr(errorObj);
        return jest.fn();
      });

      subscribeToLogistics('tenant-alpha', callback, onError);
      expect(onError).toHaveBeenCalledWith(errorObj);
    });
  });

  describe('subscribeSingleLogisticsEntry', () => {
    it('calls callback with null if entryId or tenantId is missing', () => {
      const callback = jest.fn();
      const unsub = subscribeSingleLogisticsEntry('', 'tenant-alpha', callback);

      expect(callback).toHaveBeenCalledWith(null);
      expect(typeof unsub).toBe('function');
    });

    it('emits entry when tenantId matches', () => {
      const callback = jest.fn();
      let snapshotCallback: (snap: any) => void = () => {};

      mockFirestore.onSnapshot.mockImplementation((_docRef: any, onNext: any) => {
        snapshotCallback = onNext;
        return jest.fn();
      });

      subscribeSingleLogisticsEntry('job-101', 'tenant-alpha', callback);

      snapshotCallback({
        exists: () => true,
        id: 'job-101',
        data: () => ({
          id: 'job-101',
          tenantId: 'tenant-alpha',
          eventName: 'Job 101',
        }),
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-101',
          tenantId: 'tenant-alpha',
        })
      );
    });

    it('emits null when document belongs to another tenant (isolation barrier)', () => {
      const callback = jest.fn();
      let snapshotCallback: (snap: any) => void = () => {};

      mockFirestore.onSnapshot.mockImplementation((_docRef: any, onNext: any) => {
        snapshotCallback = onNext;
        return jest.fn();
      });

      subscribeSingleLogisticsEntry('job-101', 'tenant-alpha', callback);

      snapshotCallback({
        exists: () => true,
        id: 'job-101',
        data: () => ({
          id: 'job-101',
          tenantId: 'tenant-rogue',
          eventName: 'Rogue Job',
        }),
      });

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  // ==========================================================================
  // 3. ONE-OFF FETCHES
  // ==========================================================================
  describe('fetchTenantLogistics', () => {
    it('returns empty array when tenantId is empty', async () => {
      const result = await fetchTenantLogistics('');
      expect(result).toEqual([]);
      expect(mockFirestore.getDocs).not.toHaveBeenCalled();
    });

    it('fetches and filters non-archived tenant logistics', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce({
        forEach: (fn: (doc: any) => void) => {
          fn({
            id: 'j-1',
            data: () => ({
              id: 'j-1',
              tenantId: 'tenant-1',
              eventName: 'Event 1',
              archived: false,
            }),
          });
        },
      });

      const result = await fetchTenantLogistics('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('j-1');
    });
  });

  describe('getLogisticsEntry', () => {
    it('returns null when entryId is empty', async () => {
      const result = await getLogisticsEntry('');
      expect(result).toBeNull();
    });

    it('returns null when document does not exist', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const result = await getLogisticsEntry('job-404');
      expect(result).toBeNull();
    });

    it('returns entry when tenant matches', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'job-1',
        data: () => ({
          id: 'job-1',
          tenantId: 'tenant-1',
          eventName: 'Valid Job',
        }),
      });

      const result = await getLogisticsEntry('job-1', 'tenant-1');
      expect(result).not.toBeNull();
      expect(result?.eventName).toBe('Valid Job');
    });

    it('returns null when tenantId parameter mismatches document tenant', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'job-1',
        data: () => ({
          id: 'job-1',
          tenantId: 'tenant-other',
          eventName: 'Private Job',
        }),
      });

      const result = await getLogisticsEntry('job-1', 'tenant-1');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // 4. STATUS UPDATES & ACTIONS
  // ==========================================================================
  describe('updateLogisticsStatus', () => {
    it('throws error if entryId or status is blank', async () => {
      await expect(updateLogisticsStatus('', 'In Transit')).rejects.toThrow();
      await expect(updateLogisticsStatus('job-1', '')).rejects.toThrow();
    });

    it('updates status and serverTimestamp in Firestore', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await updateLogisticsStatus('job-1', 'In Transit', {
        updatedBy: 'Alex Driver',
      });

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'In Transit',
          updatedBy: 'Alex Driver',
          updatedAt: expect.anything(),
        })
      );
    });

    it('automatically deactivates tracking when job is Completed', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await updateLogisticsStatus('job-1', 'Completed');

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'Completed',
          isTrackingActive: false,
        })
      );
    });

    it('appends formatted note when note option is provided', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-1',
          tenantId: 'tenant-1',
          notes: 'Initial instruction',
        }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await updateLogisticsStatus('job-1', 'En Route', {
        note: 'Delayed 10 mins in traffic',
        updatedBy: 'Driver Dan',
      });

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'En Route',
          notes: expect.stringContaining('Delayed 10 mins in traffic'),
        })
      );
    });

    it('enforces tenant isolation check if tenantId is provided', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-1',
          tenantId: 'tenant-alpha',
        }),
      });

      await expect(
        updateLogisticsStatus('job-1', 'Completed', {
          tenantId: 'tenant-beta',
        })
      ).rejects.toThrow(/Unauthorized/);
    });
  });

  // ==========================================================================
  // 5. INTERNAL NOTE LOGGING
  // ==========================================================================
  describe('appendLogisticsNote', () => {
    it('throws error if entryId is missing', async () => {
      await expect(appendLogisticsNote('', 'Some note')).rejects.toThrow();
    });

    it('ignores blank note quietly', async () => {
      await appendLogisticsNote('job-1', '   ');
      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('appends note to existing notes with timestamp and author', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-1',
          tenantId: 'tenant-1',
          notes: 'Old note',
        }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await appendLogisticsNote('job-1', 'Delivered to security desk', 'Driver Sam', 'tenant-1');

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notes: expect.stringContaining('Delivered to security desk'),
          updatedBy: 'Driver Sam',
          updatedAt: expect.anything(),
        })
      );
    });

    it('throws error if entry does not exist', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      await expect(appendLogisticsNote('job-404', 'Some note')).rejects.toThrow(/not found/);
    });

    it('throws error on tenant mismatch', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-1',
          tenantId: 'tenant-rogue',
        }),
      });

      await expect(
        appendLogisticsNote('job-1', 'Some note', 'Driver', 'tenant-1')
      ).rejects.toThrow(/Unauthorized/);
    });
  });

  // ==========================================================================
  // 6. GPS LOCATION UPDATES & TRACKING
  // ==========================================================================
  describe('updateJobLocation & stopJobTracking', () => {
    it('throws error if coordinates are missing or invalid', async () => {
      await expect(
        updateJobLocation('job-1', { latitude: NaN, longitude: 151, timestamp: Date.now() })
      ).rejects.toThrow();
    });

    it('writes sanitized driver location and activates tracking flags', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      const location: DriverLocation = {
        latitude: -33.8688,
        longitude: 151.2093,
        heading: 90,
        speed: 12.5,
        accuracy: 3,
        altitude: 15,
        timestamp: 1756123456000,
        driverId: 'd-1',
        driverName: 'Dave',
        jobId: 'job-1',
      };

      await updateJobLocation('job-1', location);

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentLocation: expect.objectContaining({
            latitude: -33.8688,
            longitude: 151.2093,
            heading: 90,
            speed: 12.5,
            accuracy: 3,
            altitude: 15,
            jobId: 'job-1',
          }),
          isTrackingActive: true,
          trackingJobId: 'job-1',
          lastLocationUpdate: expect.anything(),
          updatedAt: expect.anything(),
        })
      );
    });

    it('stopJobTracking sets isTrackingActive to false', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await stopJobTracking('job-1');

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isTrackingActive: false,
          updatedAt: expect.anything(),
        })
      );
    });
  });

  // ==========================================================================
  // 7. ENTRY CREATION
  // ==========================================================================
  describe('createLogisticsEntry', () => {
    it('throws error if tenantId is missing', async () => {
      await expect(createLogisticsEntry('', { eventName: 'Gig' })).rejects.toThrow();
    });

    it('creates document with defaults in Firestore', async () => {
      mockFirestore.setDoc.mockResolvedValueOnce(undefined);

      const id = await createLogisticsEntry('tenant-1', {
        eventName: 'Sydney Opera House Tour',
        location: 'Bennelong Point',
      });

      expect(typeof id).toBe('string');
      expect(mockFirestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-1',
          eventName: 'Sydney Opera House Tour',
          location: 'Bennelong Point',
          status: 'Scheduled',
          archived: false,
        })
      );
    });
  });
});
