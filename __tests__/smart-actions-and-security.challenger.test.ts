/**
 * __tests__/smart-actions-and-security.challenger.test.ts
 * ============================================================================
 * Independent Adversarial Smart Actions & Multi-Tenant Security Verification Suite
 * Kuro Mobile Logistics & Driver Execution
 * ============================================================================
 */

import {
  formatDestinationAddress,
  buildMapsUrl,
  buildPhoneUrl,
  isJobActive,
  isJobCompleted,
  isJobScheduled,
  filterLogisticsForDriver,
  computeLogisticsMetrics,
} from '@/lib/logistics-engine';

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
} from '@/services/logistics-service';

import type { LogisticsEntry, DriverLocation } from '@/types/logistics';
import * as firestore from 'firebase/firestore';

const mockFirestore = firestore as jest.Mocked<any>;

describe('Adversarial Smart Actions & Security Challenger Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. SMART ACTIONS: MAPS URL ENCODING & ADVERSARIAL CASES
  // ==========================================================================
  describe('1. Smart Actions: Maps URL Encoding & Boundary Tests', () => {
    it('CHALLENGE-MAPS-01: Encodes complex addresses with punctuation, commas, hash, and amp', () => {
      const address = 'Unit 4, Level 2 / 100-102 George St & King St, Sydney NSW 2000 #Dock-B';
      const venue = 'Grand Ballroom & Theatre #1';
      const url = buildMapsUrl(address, venue);

      expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
      const queryParam = url.split('?api=1&query=')[1];
      expect(decodeURIComponent(queryParam)).toBe(
        'Grand Ballroom & Theatre #1, Unit 4, Level 2 / 100-102 George St & King St, Sydney NSW 2000 #Dock-B'
      );
      // Ensure no raw unencoded & or ? inside query param
      expect(queryParam).not.toContain('&King');
      expect(queryParam).not.toContain('#Dock');
    });

    it('CHALLENGE-MAPS-02: Handles diverse multi-language Unicode and RTL scripts', () => {
      const cases = [
        {
          venue: '東京国際フォーラム ホールA',
          address: '東京都千代田区丸の内3-5-1',
          expected: '東京国際フォーラム ホールA, 東京都千代田区丸の内3-5-1',
        },
        {
          venue: 'متحف اللوفر أبوظبي',
          address: 'جزيرة السعديات, أبوظبي, الإمارات',
          expected: 'متحف اللوفر أبوظبي, جزيرة السعديات, أبوظبي, الإمارات',
        },
        {
          venue: 'Elbphilharmonie',
          address: 'Platz der Deutschen Einheit 4, 20457 Hamburg',
          expected: 'Elbphilharmonie, Platz der Deutschen Einheit 4, 20457 Hamburg',
        },
      ];

      for (const c of cases) {
        const url = buildMapsUrl(c.address, c.venue);
        const queryParam = url.split('?api=1&query=')[1];
        expect(decodeURIComponent(queryParam)).toBe(c.expected);
      }
    });

    it('CHALLENGE-MAPS-03: Resists XSS and URL injection attempts', () => {
      const attackVectors = [
        '"><script>alert(1)</script>',
        'javascript:alert(document.cookie)',
        'https://phishing.site/login?redirect=',
        '123 Main St&zoom=18&maptype=satellite',
      ];

      for (const vector of attackVectors) {
        const url = buildMapsUrl(vector, 'Target Venue');
        expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
        const queryParam = url.split('?api=1&query=')[1];
        // Ensure malicious characters are safely encoded
        expect(queryParam).not.toContain('<script>');
        expect(queryParam).not.toContain('&zoom=');
      }
    });

    it('CHALLENGE-MAPS-04: Returns empty string when both address and venue are empty, whitespace, or null', () => {
      expect(buildMapsUrl('', '')).toBe('');
      expect(buildMapsUrl('   ', '   ')).toBe('');
      expect(buildMapsUrl(null, null)).toBe('');
      expect(buildMapsUrl(undefined, undefined)).toBe('');
      expect(buildMapsUrl('\n\t\r', ' ')).toBe('');
    });

    it('CHALLENGE-MAPS-05: Normalizes multi-line and carriage-return corrupted addresses', () => {
      const dirty = '  Line 1: Building A \r\n\r\n   Line 2: Loading Dock 3 \n\t 50 Olympic Way \n Sydney ';
      const normalized = formatDestinationAddress(dirty);
      expect(normalized).toBe('Line 1: Building A, Line 2: Loading Dock 3, 50 Olympic Way, Sydney');
    });
  });

  // ==========================================================================
  // 2. SMART ACTIONS: PHONE SANITIZATION & BOUNDARY TESTS
  // ==========================================================================
  describe('2. Smart Actions: Phone Sanitization & Boundary Tests', () => {
    it('CHALLENGE-PHONE-01: Correctly extracts and formats international and domestic numbers', () => {
      const cases = [
        { input: '+61 412 345 678', expected: 'tel:+61412345678' },
        { input: '+1 (800) 555-0199', expected: 'tel:+18005550199' },
        { input: '(02) 9876 5432', expected: 'tel:0298765432' },
        { input: '0412.345.678', expected: 'tel:0412345678' },
        { input: '+44 20 7946 0958', expected: 'tel:+442079460958' },
        { input: '1300 555 666', expected: 'tel:1300555666' },
      ];

      for (const c of cases) {
        expect(buildPhoneUrl(c.input)).toBe(c.expected);
      }
    });

    it('CHALLENGE-PHONE-02: Extracts valid numbers from complex contact strings with names and extensions', () => {
      const cases = [
        { input: 'Site Manager: Bob (+61 400 123 456) - Call on arrival', expected: 'tel:+61400123456' },
        { input: 'Security Gate [02 9123 4567] - Press 2', expected: 'tel:0291234567' },
        { input: 'Dispatch: +1-555-0144 ext 102', expected: 'tel:+15550144' },
        { input: '📞 Mobile: 0499 888 777 🚛', expected: 'tel:0499888777' },
      ];

      for (const c of cases) {
        expect(buildPhoneUrl(c.input)).toBe(c.expected);
      }
    });

    it('CHALLENGE-PHONE-03: Rejects invalid, non-dialable, and malicious inputs', () => {
      const invalidCases = [
        '',
        '   ',
        'No phone number available',
        'Contact via Radio Channel 1',
        'N/A',
        'TBD',
        '12', // Less than 3 digits
        '--++',
        'javascript:alert(1)',
        null,
        undefined,
      ];

      for (const c of invalidCases) {
        expect(buildPhoneUrl(c as any)).toBeNull();
      }
    });

    it('CHALLENGE-PHONE-04: Guarantees output matches strictly tel:+(digits) or tel:(digits)', () => {
      const inputs = [
        '+61 400 111 222',
        '(03) 9000 1234',
        'Dave: +81-3-1234-5678',
      ];

      for (const input of inputs) {
        const res = buildPhoneUrl(input);
        expect(res).not.toBeNull();
        expect(res).toMatch(/^tel:(\+)?\d+$/);
      }
    });
  });

  // ==========================================================================
  // 3. MULTI-TENANT ISOLATION BARRIERS & DATA SECURITY
  // ==========================================================================
  describe('3. Multi-Tenant Isolation Barriers & Data Security', () => {
    it('CHALLENGE-SEC-01: subscribeToLogistics discards foreign tenant records even if returned by listener', (done) => {
      const currentTenantId = 'tenant_alpha';

      mockFirestore.onSnapshot.mockImplementation((_query: any, callback: any) => {
        callback({
          forEach: (fn: (d: any) => void) => {
            // Alpha doc
            fn({
              id: 'job_alpha_1',
              data: () => ({
                id: 'job_alpha_1',
                tenantId: 'tenant_alpha',
                eventName: 'Alpha Event',
                archived: false,
              }),
            });
            // Rogue Beta doc (leak attempt)
            fn({
              id: 'job_beta_rogue',
              data: () => ({
                id: 'job_beta_rogue',
                tenantId: 'tenant_beta',
                eventName: 'Beta Confidential Event',
                archived: false,
              }),
            });
            // Alpha archived doc
            fn({
              id: 'job_alpha_archived',
              data: () => ({
                id: 'job_alpha_archived',
                tenantId: 'tenant_alpha',
                eventName: 'Alpha Archived Event',
                archived: true,
              }),
            });
          },
        });
        return () => {};
      });

      subscribeToLogistics(currentTenantId, (entries) => {
        expect(entries).toHaveLength(1);
        expect(entries[0].id).toBe('job_alpha_1');
        expect(entries[0].tenantId).toBe('tenant_alpha');
        done();
      });
    });

    it('CHALLENGE-SEC-02: subscribeSingleLogisticsEntry yields null on tenant mismatch', (done) => {
      mockFirestore.onSnapshot.mockImplementation((_ref: any, callback: any) => {
        callback({
          exists: () => true,
          id: 'job_foreign_123',
          data: () => ({
            id: 'job_foreign_123',
            tenantId: 'tenant_other',
            eventName: 'Secret Job',
          }),
        });
        return () => {};
      });

      subscribeSingleLogisticsEntry('job_foreign_123', 'tenant_my_org', (entry) => {
        expect(entry).toBeNull();
        done();
      });
    });

    it('CHALLENGE-SEC-03: updateLogisticsStatus refuses update when tenantId mismatches doc owner', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job_secure_01',
          tenantId: 'tenant_owner_org',
          status: 'Scheduled',
        }),
      });

      await expect(
        updateLogisticsStatus('job_secure_01', 'In Progress', {
          tenantId: 'tenant_attacker_org',
          updatedBy: 'Attacker',
        })
      ).rejects.toThrow(/Unauthorized: Tenant isolation mismatch/i);

      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('CHALLENGE-SEC-04: appendLogisticsNote refuses update when tenantId mismatches doc owner', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job_secure_02',
          tenantId: 'tenant_owner_org',
          notes: 'Initial notes',
        }),
      });

      await expect(
        appendLogisticsNote('job_secure_02', 'Malicious note', 'Attacker', 'tenant_attacker_org')
      ).rejects.toThrow(/Unauthorized: Tenant isolation mismatch/i);

      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
    });

    it('CHALLENGE-SEC-05: mapFirestoreLogisticsDoc safely handles null/corrupted fields without throwing', () => {
      const corruptDocs = [
        null,
        undefined,
        {},
        { data: () => null },
        {
          data: () => ({
            currentLocation: { latitude: 'invalid', longitude: null },
            destinations: 'not an array',
            start: 'invalid-date',
            archived: 'not-a-bool',
          }),
        },
      ];

      for (const doc of corruptDocs) {
        expect(() => {
          const mapped = mapFirestoreLogisticsDoc(doc);
          expect(mapped).toBeDefined();
          expect(Array.isArray(mapped.destinations)).toBe(true);
        }).not.toThrow();
      }
    });
  });
});
