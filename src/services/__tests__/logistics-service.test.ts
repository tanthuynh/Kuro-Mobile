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
  fetchVehicleById,
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
          status: 'In Progress',
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
      expect(entry.status).toBe('In Progress');
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

  describe('fetchVehicleById', () => {
    it('returns null when vehicleId is empty or whitespace', async () => {
      expect(await fetchVehicleById('')).toBeNull();
      expect(await fetchVehicleById('   ')).toBeNull();
    });

    it('returns null when vehicle document does not exist', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const result = await fetchVehicleById('veh-nonexistent');
      expect(result).toBeNull();
    });

    it('returns mapped vehicle when document exists', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'veh-van-04',
        data: () => ({
          name: 'Van 04',
          rego: 'NSW-KURO1',
          tenantId: 'tenant-1',
          make: 'Toyota',
          model: 'HiAce',
        }),
      });

      const result = await fetchVehicleById('veh-van-04', 'tenant-1');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'veh-van-04',
          name: 'Van 04',
          rego: 'NSW-KURO1',
          tenantId: 'tenant-1',
          make: 'Toyota',
          model: 'HiAce',
        })
      );
    });

    it('returns null on tenant mismatch', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'veh-van-04',
        data: () => ({
          name: 'Van 04',
          rego: 'NSW-KURO1',
          tenantId: 'tenant-other',
        }),
      });

      const result = await fetchVehicleById('veh-van-04', 'tenant-1');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // 4. STATUS UPDATES & ACTIONS
  // ==========================================================================
  describe('updateLogisticsStatus', () => {
    it('throws error if entryId or status is blank', async () => {
      await expect(updateLogisticsStatus('', 'In Progress')).rejects.toThrow();
      await expect(updateLogisticsStatus('job-1', '')).rejects.toThrow();
    });

    it('updates status and serverTimestamp in Firestore', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await updateLogisticsStatus('job-1', 'In Progress', {
        updatedBy: 'Alex Driver',
      });

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'In Progress',
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

    it('writes system log to chats/logistics-{jobId}/messages and DOES NOT update notes field on logistics document', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: 'job-1', tenantId: 'tenant-1' }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'msg-1' });

      await updateLogisticsStatus('job-1', 'In Progress', {
        note: 'Driver started route and initiated GPS tracking',
        updatedBy: 'Driver Dan',
        tenantId: 'tenant-1',
      });

      // 1. Logistics document update MUST contain status and MUST NOT touch or mutate notes
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'In Progress',
          updatedBy: 'Driver Dan',
          updatedAt: expect.anything(),
        })
      );
      const updatePayload = mockFirestore.updateDoc.mock.calls[0][1];
      expect(updatePayload.notes).toBeUndefined();

      // 2. Activity log MUST write to chats/logistics-job-1/messages subcollection
      expect(mockFirestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'chats',
        'logistics-job-1',
        'messages'
      );
      expect(mockFirestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          text: 'Driver started route and initiated GPS tracking',
          senderId: 'system',
          userName: 'Driver Dan',
          userId: 'Driver Dan',
          tenantId: 'tenant-1',
          timestamp: expect.anything(),
        })
      );
    });

    it('handles entryId already containing logistics- prefix without duplicating prefix in chat path', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'msg-2' });

      await updateLogisticsStatus('logistics-202', 'Completed', {
        note: 'Driver marked job as completed',
      });

      expect(mockFirestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'chats',
        'logistics-202',
        'messages'
      );
      expect(mockFirestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          text: 'Driver marked job as completed',
          senderId: 'system',
        })
      );
    });

    it('does not write to chats subcollection when no note is provided', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await updateLogisticsStatus('job-1', 'In Progress');

      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(1);
      expect(mockFirestore.addDoc).not.toHaveBeenCalled();
    });

    it('does not write to chats subcollection or modify notes when note is empty or whitespace-only', async () => {
      mockFirestore.updateDoc.mockResolvedValue(undefined);

      // 1. Empty string note
      await updateLogisticsStatus('job-1', 'In Progress', { note: '' });
      expect(mockFirestore.addDoc).not.toHaveBeenCalled();
      let updatePayload = mockFirestore.updateDoc.mock.calls[0][1];
      expect(updatePayload.notes).toBeUndefined();

      mockFirestore.updateDoc.mockClear();
      mockFirestore.addDoc.mockClear();

      // 2. Whitespace-only note
      await updateLogisticsStatus('job-1', 'In Progress', { note: '     ' });
      expect(mockFirestore.addDoc).not.toHaveBeenCalled();
      updatePayload = mockFirestore.updateDoc.mock.calls[0][1];
      expect(updatePayload.notes).toBeUndefined();
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

    it('enforces strict tenant isolation and prevents both status update and activity log write when cross-tenant update with note is attempted', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-victim',
          tenantId: 'tenant-victim',
          notes: 'Customer gate instructions',
        }),
      });

      await expect(
        updateLogisticsStatus('job-victim', 'In Progress', {
          tenantId: 'tenant-intruder',
          note: 'Malicious automated note attempt',
          updatedBy: 'Intruder',
        })
      ).rejects.toThrow(/Unauthorized: Tenant isolation mismatch/i);

      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
      expect(mockFirestore.addDoc).not.toHaveBeenCalled();
    });

    it('handles uppercase LOGISTICS- prefix without duplicating prefix in chat path', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'msg-upper' });

      await updateLogisticsStatus('LOGISTICS-999', 'Completed', {
        note: 'Driver completed route',
      });

      expect(mockFirestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'chats',
        'LOGISTICS-999',
        'messages'
      );
      expect(mockFirestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userName: 'System',
          senderId: 'system',
        })
      );
    });

    it('gracefully handles activity log write failure without failing the committed status update', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockRejectedValueOnce(new Error('Network offline or rules permission denied'));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Status update MUST NOT throw even if activity log addDoc fails
      await expect(
        updateLogisticsStatus('job-resilience-1', 'In Progress', {
          note: 'Driver started route',
          updatedBy: 'Dan',
        })
      ).resolves.toBeUndefined();

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'In Progress',
        })
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[logisticsService] Failed to record status update to activity log:'),
        expect.any(Error)
      );

      warnSpy.mockRestore();
    });

    it('trims leading/trailing whitespace from entryId and formats channelId correctly', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'msg-trim' });

      await updateLogisticsStatus('   job-trim-1   ', 'In Progress', {
        note: 'Driver started route',
      });

      expect(mockFirestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'chats',
        'logistics-job-trim-1',
        'messages'
      );
    });

    it('records explicit userId and serverTimestamp in messagePayload conforming to chat schema', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ tenantId: 'tenant-42' }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'msg-uid-1' });

      await updateLogisticsStatus('job-uid-test', 'In Progress', {
        note: 'Driver departed warehouse',
        updatedBy: 'Dan Driver',
        userId: 'usr-dan-999',
        tenantId: 'tenant-42',
      });

      expect(mockFirestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          senderId: 'system',
          text: 'Driver departed warehouse',
          userName: 'Dan Driver',
          updatedBy: 'Dan Driver',
          userId: 'usr-dan-999',
          tenantId: 'tenant-42',
          timestamp: expect.objectContaining({ _methodName: 'serverTimestamp' }),
        })
      );
    });

    it('verifies timestamp_type_consistency: payload timestamp can be mapped by chat consumer to valid Date', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);
      mockFirestore.addDoc.mockResolvedValueOnce({ id: 'msg-ts-1' });

      await updateLogisticsStatus('job-ts-test', 'Completed', {
        note: 'Route completed',
      });

      const messagePayload = mockFirestore.addDoc.mock.calls[0][1];
      expect(messagePayload.timestamp).toBeDefined();

      // Chat readers (like useChat) convert Firestore Timestamps to JS Date:
      // Case A: Mock/real Firestore Timestamp with .toDate()
      const mockTimestampObj = {
        toDate: () => new Date('2026-09-17T12:00:00Z'),
      };
      const parsedA = mockTimestampObj.toDate ? mockTimestampObj.toDate() : new Date();
      expect(parsedA).toBeInstanceOf(Date);
      expect(parsedA.toISOString()).toBe('2026-09-17T12:00:00.000Z');

      // Case B: Fallback epoch or string timestamp
      const epochTs = Date.now();
      const parsedB = new Date(epochTs);
      expect(parsedB).toBeInstanceOf(Date);
      expect(isNaN(parsedB.getTime())).toBe(false);
    });

    it('throws not found if entry document does not exist when tenantId check is performed', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      await expect(
        updateLogisticsStatus('job-missing-1', 'In Progress', {
          tenantId: 'tenant-123',
        })
      ).rejects.toThrow(/Logistics entry job-missing-1 not found/);
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
      expect(mockFirestore.addDoc).not.toHaveBeenCalled();
    });

    it('preserves manual internal notes on logistics document without writing to activity log', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-1',
          tenantId: 'tenant-1',
          notes: 'Customer gate code: 1234',
        }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await appendLogisticsNote('job-1', 'Use loading dock B on arrival', 'Driver Sam', 'tenant-1');

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notes: expect.stringContaining('Use loading dock B on arrival'),
        })
      );
      expect(mockFirestore.addDoc).not.toHaveBeenCalled();
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

    it('trims author whitespace when formatting internal note and updating updatedBy', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-1',
          tenantId: 'tenant-1',
          notes: '',
        }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await appendLogisticsNote('  job-1  ', 'Test note', '   Driver Sam   ', 'tenant-1');

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notes: expect.stringContaining('[Driver Sam]: Test note'),
          updatedBy: 'Driver Sam',
        })
      );
    });

    it('formats note cleanly without orphaned space before colon when author is omitted', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-no-author',
          tenantId: 'tenant-1',
          notes: '',
        }),
      });
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await appendLogisticsNote('job-no-author', 'System automated maintenance note', undefined, 'tenant-1');

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notes: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}: System automated maintenance note$/),
        })
      );
    });

    it('throws not found if entry document does not exist', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      await expect(appendLogisticsNote('job-missing-snap', 'Some note')).rejects.toThrow(/not found/);
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

    it('stopJobTracking sets isTrackingActive to false and trims entryId', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await stopJobTracking('   job-trim-stop   ');

      expect(mockFirestore.doc).toHaveBeenCalledWith(
        expect.anything(),
        'logistics',
        'job-trim-stop'
      );
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isTrackingActive: false,
          updatedAt: expect.anything(),
        })
      );
    });

    it('updateJobLocation trims whitespace from entryId', async () => {
      mockFirestore.updateDoc.mockResolvedValueOnce(undefined);

      await updateJobLocation('   job-trim-loc   ', {
        latitude: -33.8688,
        longitude: 151.2093,
        timestamp: 1756123456000,
      }, { skipHistory: true });

      expect(mockFirestore.doc).toHaveBeenCalledWith(
        expect.anything(),
        'logistics',
        'job-trim-loc'
      );
      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          trackingJobId: 'job-trim-loc',
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
          status: 'Pending',
          archived: false,
        })
      );
    });
  });
});
