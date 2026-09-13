/**
 * __tests__/logistics-smart-actions-fuzzing.adversarial.test.tsx
 *
 * EMPIRICAL ADVERSARIAL STRESS & FUZZING TEST HARNESS
 * Kuro Mobile — Logistics Smart Actions, URL Builders & Input Security
 *
 * Thorough testing of:
 * 1. buildMapsUrl: Fuzzing, XSS, Parameter Injection, Path Traversal, Whitespace & Multi-language Unicode/RTL
 * 2. buildPhoneUrl: International Formats, Domestic Variations, Extensions, Dialable Bounds & Protocol Injections
 * 3. LogisticsDestinationCard: 1-Tap Action Handlers, Linking Interactions, and Exception Isolation
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import {
  formatDestinationAddress,
  buildMapsUrl,
  buildPhoneUrl,
} from '@/lib/logistics-engine';
import { LogisticsDestinationCard } from '@/components/logistics/LogisticsDestinationCard';
import type { LogisticsDestination } from '@/types/logistics';

// Mock Theme
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => ({
      colors: actualTheme.darkColors,
      typography: actualTheme.typography,
      spacing: actualTheme.spacing,
      layout: actualTheme.layout,
      isDark: true,
    }),
    ThemeProvider: ({ children }: any) => children,
  };
});

// Mock expo-linking
jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(true),
  canOpenURL: jest.fn().mockResolvedValue(true),
}));

describe('Adversarial Fuzzing & Input Security Harness for Smart Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // SECTION 1: MAPS URL BUILDER DEEP ADVERSARIAL FUZZING
  // ==========================================================================
  describe('1. buildMapsUrl Deep Adversarial Fuzzing & Security Tests', () => {
    it('FUZZ-MAPS-01: Correctly generates encoded Google Maps search URLs', () => {
      const url = buildMapsUrl('100 George St, Sydney NSW 2000', 'Sydney Opera House');
      expect(url).toBe(
        'https://www.google.com/maps/search/?api=1&query=' +
          encodeURIComponent('Sydney Opera House, 100 George St, Sydney NSW 2000')
      );
    });

    it('FUZZ-MAPS-02: Returns empty string on all falsy, blank, and nullish combinations', () => {
      const blankInputs: Array<[string | null | undefined, string | null | undefined]> = [
        [null, null],
        [undefined, undefined],
        ['', ''],
        ['   ', '   '],
        ['\t\n\r', '\r\n'],
        [null, ''],
        ['', null],
        [undefined, '   '],
        ['   ', undefined],
      ];

      for (const [addr, name] of blankInputs) {
        expect(buildMapsUrl(addr, name)).toBe('');
      }
    });

    it('FUZZ-MAPS-03: Resists XSS, HTML tag injections, and script payloads', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        '"><svg/onload=alert(1)>',
        'javascript:alert(document.cookie)',
        '\' onfocus=\'alert(1)',
        '<iframe src="http://evil.com"></iframe>',
      ];

      for (const payload of xssPayloads) {
        const url = buildMapsUrl(payload, payload);
        expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);

        const rawQueryPart = url.replace('https://www.google.com/maps/search/?api=1&query=', '');
        // Must be URI encoded
        expect(rawQueryPart).not.toContain('<script>');
        expect(rawQueryPart).not.toContain('"><');
        expect(rawQueryPart).not.toContain('onerror=');
        expect(decodeURIComponent(rawQueryPart)).toBe(payload);
      }
    });

    it('FUZZ-MAPS-04: Prevents URL query parameter pollution and delimiter injection', () => {
      const injectionPayloads = [
        '100 Main St&api=2&zoom=21&layer=c',
        'Venue?ref=evil.com#danger',
        'Pier 1 & Pier 2 && zoom=100',
        '123 Fake St; drop table users; --',
        'Address\u0000NullByteInjected',
        'https://phishing.site/redirect?to=',
      ];

      for (const payload of injectionPayloads) {
        const url = buildMapsUrl(payload, 'Test Location');
        const parsedUrl = new URL(url);

        // Security assertion: There must only be exactly 2 query parameters on the top-level URL: api and query
        const paramKeys = Array.from(parsedUrl.searchParams.keys());
        expect(paramKeys).toEqual(['api', 'query']);
        expect(parsedUrl.searchParams.get('api')).toBe('1');
        expect(parsedUrl.searchParams.get('zoom')).toBeNull();
        expect(parsedUrl.searchParams.get('layer')).toBeNull();
      }
    });

    it('FUZZ-MAPS-05: Handles global multi-lingual scripts (RTL Arabic, Hebrew, CJK, Cyrillic, Greek, Hindi, Thai)', () => {
      const multiLingual = [
        {
          name: 'شارع الشيخ زايد',
          addr: 'دبي، الإمارات العربية المتحدة',
          expected: 'شارع الشيخ زايد, دبي، الإمارات العربية المتحدة',
        },
        {
          name: 'בית האופרה של סידני',
          addr: 'רחוב יפו 1, ירושלים',
          expected: 'בית האופרה של סידני, רחוב יפו 1, ירושלים',
        },
        {
          name: '北京市海淀区',
          addr: '中关村南大街5号',
          expected: '北京市海淀区, 中关村南大街5号',
        },
        {
          name: '渋谷スクランブルスクエア',
          addr: '東京都渋谷区渋谷2-24-12',
          expected: '渋谷スクランブルスクエア, 東京都渋谷区渋谷2-24-12',
        },
        {
          name: '롯데월드타워',
          addr: '서울특별시 송파구 올림픽로 300',
          expected: '롯데월드타워, 서울특별시 송파구 올림픽로 300',
        },
        {
          name: 'Эрмитаж',
          addr: 'Санкт-Петербург, Дворцовая наб., 34',
          expected: 'Эрмитаж, Санкт-Петербург, Дворцовая наб., 34',
        },
        {
          name: 'Ακρόπολη Αθηνών',
          addr: 'Διονυσίου Αρεοπαγίτου, Αθήνα 105 58',
          expected: 'Ακρόπολη Αθηνών, Διονυσίου Αρεοπαγίτου, Αθήνα 105 58',
        },
        {
          name: 'ताज महल',
          addr: 'धर्मपुरी, ताजगंज, आगरा, उत्तर प्रदेश 282001',
          expected: 'ताज महल, धर्मपुरी, ताजगंज, आगरा, उत्तर प्रदेश 282001',
        },
        {
          name: 'วัดพระแก้ว',
          addr: 'ถนนหน้าพระลาน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร 10200',
          expected: 'วัดพระแก้ว, ถนนหน้าพระลาน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร 10200',
        },
      ];

      for (const item of multiLingual) {
        const url = buildMapsUrl(item.addr, item.name);
        expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
        const query = url.replace('https://www.google.com/maps/search/?api=1&query=', '');
        expect(decodeURIComponent(query)).toBe(item.expected);
      }
    });

    it('FUZZ-MAPS-06: Handles emoji, special typography, and symbols in addresses', () => {
      const emojiAddresses = [
        {
          name: '🏢 Kuro Head Office',
          addr: '📍 456 Innovation Way, Tech Hub 🚀',
          expected: '🏢 Kuro Head Office, 📍 456 Innovation Way, Tech Hub 🚀',
        },
        {
          name: '🎪 Big Top Circus',
          addr: '🎭 Entertainment Quarter, Moore Park NSW',
          expected: '🎪 Big Top Circus, 🎭 Entertainment Quarter, Moore Park NSW',
        },
      ];

      for (const item of emojiAddresses) {
        const url = buildMapsUrl(item.addr, item.name);
        const query = url.replace('https://www.google.com/maps/search/?api=1&query=', '');
        expect(decodeURIComponent(query)).toBe(item.expected);
      }
    });

    it('FUZZ-MAPS-07: Normalized multi-line strings with mixed linefeed types', () => {
      const multiLine = 'Unit 4\r\nBuilding B\nLevel 2\r100 Miller St\r\n\r\nNorth Sydney NSW 2060';
      const formatted = formatDestinationAddress(multiLine);
      expect(formatted).toBe('Unit 4, Building B, Level 2, 100 Miller St, North Sydney NSW 2060');

      const url = buildMapsUrl(multiLine);
      expect(url).toBe(
        'https://www.google.com/maps/search/?api=1&query=' +
          encodeURIComponent('Unit 4, Building B, Level 2, 100 Miller St, North Sydney NSW 2060')
      );
    });

    it('FUZZ-MAPS-08: High-volume stress fuzzing with 10,000 character payload without performance degradation', () => {
      const longName = 'A'.repeat(5000);
      const longAddress = 'B'.repeat(5000);

      const startTime = performance.now();
      const url = buildMapsUrl(longAddress, longName);
      const duration = performance.now() - startTime;

      expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
      expect(duration).toBeLessThan(50); // Under 50ms
    });
  });

  // ==========================================================================
  // SECTION 2: PHONE CALL URL BUILDER DEEP ADVERSARIAL FUZZING
  // ==========================================================================
  describe('2. buildPhoneUrl Deep Adversarial Fuzzing & Security Tests', () => {
    it('FUZZ-PHONE-01: Successfully parses international E.164 phone formats with leading +', () => {
      const e164Cases = [
        { input: '+1 800 555 0199', expected: 'tel:+18005550199' },
        { input: '+44 20 7946 0958', expected: 'tel:+442079460958' },
        { input: '+61 412 345 678', expected: 'tel:+61412345678' },
        { input: '+81 3 1234 5678', expected: 'tel:+81312345678' },
        { input: '+86 10 8888 8888', expected: 'tel:+861088888888' },
        { input: '+49 30 123456', expected: 'tel:+4930123456' },
        { input: '+33 1 42 68 55 55', expected: 'tel:+33142685555' },
        { input: '+91 98765 43210', expected: 'tel:+919876543210' },
        { input: '+55 11 98765-4321', expected: 'tel:+5511987654321' },
      ];

      for (const item of e164Cases) {
        expect(buildPhoneUrl(item.input)).toBe(item.expected);
      }
    });

    it('FUZZ-PHONE-02: Successfully parses domestic Australian numbers with standard prefixes', () => {
      const domesticCases = [
        { input: '0412 345 678', expected: 'tel:0412345678' },
        { input: '0412-345-678', expected: 'tel:0412345678' },
        { input: '0412.345.678', expected: 'tel:0412345678' },
        { input: '0412/345/678', expected: 'tel:0412345678' },
        { input: '(02) 9876 5432', expected: 'tel:0298765432' },
        { input: '(03) 9123 4567', expected: 'tel:0391234567' },
        { input: '(07) 3123 4567', expected: 'tel:0731234567' },
        { input: '(08) 8123 4567', expected: 'tel:0881234567' },
        { input: '1300 000 000', expected: 'tel:1300000000' },
        { input: '1800 123 456', expected: 'tel:1800123456' },
      ];

      for (const item of domesticCases) {
        expect(buildPhoneUrl(item.input)).toBe(item.expected);
      }
    });

    it('FUZZ-PHONE-03: Extracts valid numbers from annotated supervisor and desk contact strings', () => {
      const complexContacts = [
        {
          input: 'Warehouse Supervisor John: +61 400 123 456 (After hours)',
          expected: 'tel:+61400123456',
        },
        {
          input: 'Reception Desk: (02) 9000 1111 (Ext 401)',
          expected: 'tel:0290001111',
        },
        {
          input: 'Gate Security: 0499 888 777 - Ring upon arrival at Gate 3',
          expected: 'tel:0499888777',
        },
        {
          input: 'Primary: +1 (555) 019-2834 | Backup: (555) 019-5678',
          expected: 'tel:+15550192834',
        },
      ];

      for (const item of complexContacts) {
        expect(buildPhoneUrl(item.input)).toBe(item.expected);
      }
    });

    it('FUZZ-PHONE-04: Returns null for non-dialable text, malformed strings, and sub-length inputs', () => {
      const invalidInputs = [
        null,
        undefined,
        '',
        '   ',
        '\n\t',
        'N/A',
        'TBD',
        'None',
        'Ask at security desk',
        'No phone number available',
        'Contact via Teams/Slack',
        '1',
        '12',
        '+1',
        '++--',
        '() - . /',
      ];

      for (const item of invalidInputs) {
        expect(buildPhoneUrl(item as any)).toBeNull();
      }
    });

    it('FUZZ-PHONE-05: Defends against protocol injection, CRLF injection, and query tampering', () => {
      const maliciousPhoneInputs = [
        'javascript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD4=',
        'http://evil.com/dial',
        'tel:+61412345678;postd=1234',
        '+61412345678\r\nInjected-Header: true',
        '+61412345678%0a%0dSet-Cookie: evil',
        'tel://+61412345678?body=sms_attack',
      ];

      for (const bad of maliciousPhoneInputs) {
        const result = buildPhoneUrl(bad);
        if (result !== null) {
          // Invariant: Result must strictly match `tel:<optional +><digits only>`
          expect(result).toMatch(/^tel:(\+)?\d+$/);
          expect(result).not.toContain('javascript');
          expect(result).not.toContain('http');
          expect(result).not.toContain('\r');
          expect(result).not.toContain('\n');
          expect(result).not.toContain(';');
          expect(result).not.toContain('?');
        }
      }
    });
  });

  // ==========================================================================
  // SECTION 3: UI INTEGRATION & 1-TAP ACTION TRIGGER VERIFICATION
  // ==========================================================================
  describe('3. LogisticsDestinationCard 1-Tap UI Trigger Verification', () => {
    const sampleDestination: LogisticsDestination = {
      id: 'dest-sydney-opera',
      type: 'destination',
      destinationName: 'Sydney Opera House',
      address: 'Bennelong Point, Sydney NSW 2000',
      contact: 'Stage Door: +61 2 9250 7111',
      time: '09:00 AM',
      distance: '12.4 km',
      estTravelTime: '25 mins',
      detailNote: 'Use underground loading dock entrance via Macquarie St.',
    };

    it('CARD-01: Renders destination details, stop badge, address, and contact info', () => {
      const { getByText } = render(
        <LogisticsDestinationCard destination={sampleDestination} index={1} />
      );

      expect(getByText('Stop 1')).toBeTruthy();
      expect(getByText('Sydney Opera House')).toBeTruthy();
      expect(getByText('Bennelong Point, Sydney NSW 2000')).toBeTruthy();
      expect(getByText('Stage Door: +61 2 9250 7111')).toBeTruthy();
      expect(getByText('09:00 AM')).toBeTruthy();
      expect(getByText('12.4 km • 25 mins')).toBeTruthy();
      expect(getByText('Use underground loading dock entrance via Macquarie St.')).toBeTruthy();
    });

    it('CARD-02: Pressing "Open in Maps" button invokes Linking.openURL with encoded Maps URL', async () => {
      const { getByTestId } = render(
        <LogisticsDestinationCard destination={sampleDestination} index={1} />
      );

      const mapsBtn = getByTestId('open-maps-btn-dest-sydney-opera');
      await act(async () => {
        fireEvent.press(mapsBtn);
      });

      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith(
          'https://www.google.com/maps/search/?api=1&query=' +
            encodeURIComponent('Sydney Opera House, Bennelong Point, Sydney NSW 2000')
        );
      });
    });

    it('CARD-03: Pressing "Call Contact" button invokes Linking.openURL with sanitized tel: URI', async () => {
      const { getByTestId } = render(
        <LogisticsDestinationCard destination={sampleDestination} index={1} />
      );

      const phoneBtn = getByTestId('call-contact-btn-dest-sydney-opera');
      await act(async () => {
        fireEvent.press(phoneBtn);
      });

      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith('tel:+61292507111');
      });
    });

    it('CARD-04: Disables buttons when address and contact are absent/invalid', async () => {
      const blankDestination: LogisticsDestination = {
        id: 'dest-blank',
        type: 'destination',
        destinationName: '',
        address: '',
        contact: 'No phone available',
      };

      const { getByTestId } = render(
        <LogisticsDestinationCard destination={blankDestination} index={1} />
      );

      const mapsBtn = getByTestId('open-maps-btn-dest-blank');
      const callBtn = getByTestId('call-contact-btn-dest-blank');

      expect(mapsBtn.props.accessibilityState?.disabled).toBe(true);
      expect(callBtn.props.accessibilityState?.disabled).toBe(true);

      await act(async () => {
        fireEvent.press(mapsBtn);
        fireEvent.press(callBtn);
      });

      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('CARD-05: Gracefully catches and logs errors when Linking.openURL rejects', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('Unable to open URL'));

      const { getByTestId } = render(
        <LogisticsDestinationCard destination={sampleDestination} index={1} />
      );

      const mapsBtn = getByTestId('open-maps-btn-dest-sydney-opera');
      await act(async () => {
        fireEvent.press(mapsBtn);
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[LogisticsDestinationCard] Failed to open maps URL:'),
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
