/**
 * __tests__/services.test.ts
 * Comprehensive test suite for real-time Firestore services, haptics, and audio services.
 */

import {
  mapFirestoreEventDoc,
  subscribeTenantEvents,
  subscribeSingleEvent,
  fetchTenantEvents,
  fetchSingleEvent,
} from '@/services/event-service';
import {
  mapFirestorePullsheetDoc,
  subscribePullsheet,
  fetchPullsheet,
  updatePullsheetItemStatus,
  updatePullsheetItemScannedCount,
  bulkConfirmPullsheet,
} from '@/services/pull-sheet-service';
import {
  mapFirestoreEquipmentDoc,
  subscribeEquipment,
  fetchEquipment,
  searchEquipment,
} from '@/services/equipment-service';
import { HapticService } from '@/services/haptic-service';
import { AudioService } from '@/services/audio-service';
import * as firestore from 'firebase/firestore';

describe('Real-Time Firestore & Feedback Services', () => {
  describe('Event Service', () => {
    it('mapFirestoreEventDoc maps raw document data and timestamps', () => {
      const mockDoc = {
        id: 'ev-101',
        data: () => ({
          tenantId: 'tenant-abc',
          eventName: 'Sydney Opera Gala',
          eventNumber: 1042,
          clientId: 'client-1',
          eventStatusId: 'Confirmed',
          eventTypeId: 'type-gala',
          venueId: 'venue-1',
          assigneeId: 'user-lead',
          startTime: { _seconds: 1787654400, _nanoseconds: 0 },
          deliveryTime: '2026-08-25T08:00:00.000Z',
          packdownTime: new Date(2026, 7, 25, 23, 0),
          archived: false,
        }),
      };

      const event = mapFirestoreEventDoc(mockDoc);
      expect(event.id).toBe('ev-101');
      expect(event.eventName).toBe('Sydney Opera Gala');
      expect(event.eventNumber).toBe(1042);
      expect(event.startTime).toBeInstanceOf(Date);
      expect(event.deliveryTime).toBeInstanceOf(Date);
      expect(event.packdownTime).toBeInstanceOf(Date);
      expect(event.archived).toBe(false);
    });

    it('subscribeTenantEvents handles empty tenantId gracefully', () => {
      const onData = jest.fn();
      const unsub = subscribeTenantEvents('', onData);
      expect(onData).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('subscribeSingleEvent handles empty eventId or tenantId', () => {
      const onData = jest.fn();
      const unsub = subscribeSingleEvent('', '', onData);
      expect(onData).toHaveBeenCalledWith(null);
      unsub();
    });
  });

  describe('Pull Sheet Service', () => {
    it('mapFirestorePullsheetDoc normalizes item statuses and dates', () => {
      const mockDoc = {
        id: 'ev-101',
        data: () => ({
          eventId: 'ev-101',
          tenantId: 'tenant-abc',
          items: [
            { id: 'ps-1', quantity: 2, description: 'Speaker', type: 'item', status: 'Ready' },
            { id: 'ps-2', quantity: 0, description: 'Header', type: 'section-header', status: 'confirmed' },
          ],
        }),
      };

      const pullsheet = mapFirestorePullsheetDoc(mockDoc);
      expect(pullsheet.id).toBe('ev-101');
      expect(pullsheet.items.length).toBe(2);
      // Item row normalized from legacy 'Ready' to 'confirmed'
      expect(pullsheet.items[0].status).toBe('confirmed');
      // Section header forced to 'none'
      expect(pullsheet.items[1].status).toBe('none');
    });

    it('subscribePullsheet handles empty inputs', () => {
      const onUpdate = jest.fn();
      const unsub = subscribePullsheet('', '', onUpdate);
      expect(onUpdate).toHaveBeenCalledWith(null);
      unsub();
    });
  });

  describe('Equipment Service', () => {
    const sampleEquipment = [
      {
        id: 'eq-1',
        tenantId: 'tenant-abc',
        name: 'Robe BMFL Blade',
        manufacturer: 'Robe',
        model: 'BMFL-BLD',
        category: 'Lighting',
        barcode: 'BAR-ROBE-001',
        serialNumber: 'SN-ROBE-100',
        knownLocation: 'Bay 4B',
        quantity: 10,
        consumedQuantity: 4,
        serialNumbers: [
          { id: 's1', serial: 'SN-ROBE-100', status: 'Available' as const },
          { id: 's2', serial: 'SN-ROBE-101', status: 'In Use' as const },
          { id: 's3', serial: 'SN-ROBE-102', status: 'In Repair' as const },
        ],
      },
      {
        id: 'eq-2',
        tenantId: 'tenant-abc',
        name: 'Shure Axient AD4D Receiver',
        manufacturer: 'Shure',
        model: 'AD4D-A',
        category: 'Audio',
        barcode: 'BAR-SHURE-002',
        serialNumber: 'SN-SHURE-200',
        knownLocation: 'Audio Rack QC',
        quantity: 4,
        consumedQuantity: 0,
      },
    ];

    it('mapFirestoreEquipmentDoc correctly maps fields and serial numbers', () => {
      const mockDoc = {
        id: 'eq-1',
        data: () => sampleEquipment[0],
      };

      const eq = mapFirestoreEquipmentDoc(mockDoc);
      expect(eq.id).toBe('eq-1');
      expect(eq.name).toBe('Robe BMFL Blade');
      expect(eq.serialNumbers?.length).toBe(3);
    });

    it('searchEquipment performs multi-field keyword search', () => {
      // By manufacturer
      const byMake = searchEquipment(sampleEquipment, 'Shure');
      expect(byMake.length).toBe(1);
      expect(byMake[0].id).toBe('eq-2');

      // By model
      const byModel = searchEquipment(sampleEquipment, 'BMFL');
      expect(byModel.length).toBe(1);
      expect(byModel[0].id).toBe('eq-1');

      // By barcode
      const byBarcode = searchEquipment(sampleEquipment, 'BAR-SHURE-002');
      expect(byBarcode.length).toBe(1);
      expect(byBarcode[0].id).toBe('eq-2');

      // By serial number inside serialNumbers array
      const bySubSerial = searchEquipment(sampleEquipment, 'SN-ROBE-102');
      expect(bySubSerial.length).toBe(1);
      expect(bySubSerial[0].id).toBe('eq-1');

      // By location
      const byLoc = searchEquipment(sampleEquipment, 'Bay 4B');
      expect(byLoc.length).toBe(1);
      expect(byLoc[0].id).toBe('eq-1');
    });

    it('searchEquipment filters by category', () => {
      const audioOnly = searchEquipment(sampleEquipment, '', 'Audio');
      expect(audioOnly.length).toBe(1);
      expect(audioOnly[0].id).toBe('eq-2');

      const lightingOnly = searchEquipment(sampleEquipment, '', 'Lighting');
      expect(lightingOnly.length).toBe(1);
      expect(lightingOnly[0].id).toBe('eq-1');
    });

    it('searchEquipment filters by availability status', () => {
      const available = searchEquipment(sampleEquipment, '', undefined, 'Available');
      expect(available.length).toBe(2);

      const inRepair = searchEquipment(sampleEquipment, '', undefined, 'In Repair');
      expect(inRepair.length).toBe(1);
      expect(inRepair[0].id).toBe('eq-1');
    });
  });

  describe('Haptic and Audio Feedback Services', () => {
    it('executes HapticService methods without error', async () => {
      await expect(HapticService.scanSuccess()).resolves.not.toThrow();
      await expect(HapticService.scanWarning()).resolves.not.toThrow();
      await expect(HapticService.scanError()).resolves.not.toThrow();
      await expect(HapticService.scanCelebration()).resolves.not.toThrow();
      await expect(HapticService.lightTap()).resolves.not.toThrow();
      await expect(HapticService.mediumTap()).resolves.not.toThrow();
    });

    it('executes AudioService methods and controls mute state', async () => {
      expect(AudioService.isAudioMuted()).toBe(false);

      await expect(AudioService.playScanSuccess()).resolves.not.toThrow();
      await expect(AudioService.playScanWarning()).resolves.not.toThrow();
      await expect(AudioService.playScanError()).resolves.not.toThrow();
      await expect(AudioService.playCelebrationChime()).resolves.not.toThrow();

      AudioService.setMuted(true);
      expect(AudioService.isAudioMuted()).toBe(true);
      await expect(AudioService.playScanSuccess()).resolves.not.toThrow();

      AudioService.setMuted(false);
      expect(AudioService.isAudioMuted()).toBe(false);
    });
  });
});
