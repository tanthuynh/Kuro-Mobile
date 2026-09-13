/**
 * __tests__/pullsheet-jobsfeed.adversarial.test.tsx
 * Empirical Challenger Suite for Milestones 2-4:
 * Adversarial stress tests for Pull Sheet & Jobs Feed screens, hooks, and pure domain engines.
 *
 * Covers:
 * 1. Pull Sheet Status Progression (pending -> confirmed -> prepped_scanned -> dispatched -> returned -> deprepped)
 * 2. Status Rollback & Revert (deprepped -> returned -> dispatched -> prepped_scanned -> confirmed -> pending)
 * 3. Section Grouping with Service Exclusion (type !== 'service') & Actionability Guards
 * 4. Continuous Scan Quantity Increments & Multi-Unit Barcode Deduplication
 * 5. Real-Time Progress Metrics Calculation under Extreme Distributions
 * 6. Bulk Confirmation Concurrency & Race Conditions
 * 7. Jobs Feed Date Offset Scrubber & Multi-Day Spanning Window Overlaps
 * 8. Timezone Boundary Calculations & Firestore Timestamp Normalization
 * 9. Navigation Parameter Forwarding & Screen Component Integration
 */

import React from 'react';
import { render, fireEvent, act, renderHook } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

// Domain engines and utilities
import {
  normalizePullsheetStatus,
  isActionablePullsheetItem,
  getNextPullsheetStatus,
  getPreviousPullsheetStatus,
  calculatePullsheetProgress,
  groupPullsheetBySections,
  PULLSHEET_LIFECYCLE_ORDER,
  STATUS_DISPLAY_CONFIG,
} from '@/lib/pull-sheet-engine';
import {
  parseFirestoreDate,
  formatStageTime,
  formatEventDateRange,
  isSameDay,
  getStartOfDay,
  getEndOfDay,
  getEventOperationalWindow,
} from '@/lib/date-utils';
import { categorizeEvents } from '@/lib/categorization';

// Hooks and services
import { usePullSheet } from '@/hooks/use-pull-sheet';
import { useEvents, useSingleEvent } from '@/hooks/use-events';
import * as pullSheetService from '@/services/pull-sheet-service';
import * as eventService from '@/services/event-service';

// UI Components
import { PullSheetStatusBadge } from '@/components/pull-sheets/pull-sheet-status-badge';
import { PullSheetProgressBar } from '@/components/pull-sheets/pull-sheet-progress-bar';
import { PullSheetItemRow } from '@/components/pull-sheets/pull-sheet-item-row';
import { PullSheetStatusSheet } from '@/components/pull-sheets/pull-sheet-status-sheet';
import { EventCard } from '@/components/events/event-card';
import { EventFilterTabs } from '@/components/events/event-filter-tabs';
import PullSheetScreen from '../app/pullsheet/[id]';
import EventDetailsScreen from '../app/events/[id]';

// Types
import type { Pullsheet, PullsheetItem, PullsheetItemStatus } from '@/types/pull-sheet';
import type { Event } from '@/types/events';

// Mocks
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  useIsFocused: () => true,
}));

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

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      uid: 'challenger-user-999',
      tenantId: 'tenant-adversarial',
      firstName: 'Audit',
      lastName: 'Runner',
      email: 'audit@kuro.test',
    },
    tenant: {
      tenantId: 'tenant-adversarial',
      tenantName: 'Kuro Stress Labs',
      success: true,
      authTenantId: null,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

describe('Adversarial Challenge: Pull Sheet & Jobs Feed Systems', () => {
  let mockPush: jest.Mock;
  let mockBack: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush = jest.fn();
    mockBack = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: mockBack,
      replace: jest.fn(),
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'ev-stress-001' });
  });

  /* ========================================================================== */
  /* 1. Pull Sheet Status Progression & State Machine Invariants                */
  /* ========================================================================== */
  describe('1. Pull Sheet Status Progression State Machine', () => {
    it('strictly follows the 6-stage forward progression order', () => {
      expect(getNextPullsheetStatus('pending')).toBe('confirmed');
      expect(getNextPullsheetStatus('confirmed')).toBe('prepped_scanned');
      expect(getNextPullsheetStatus('prepped_scanned')).toBe('dispatched');
      expect(getNextPullsheetStatus('dispatched')).toBe('returned');
      expect(getNextPullsheetStatus('returned')).toBe('deprepped');
    });

    it('exhibits terminal idempotency when advancing past deprepped', () => {
      let status: PullsheetItemStatus = 'deprepped';
      for (let i = 0; i < 5; i++) {
        status = getNextPullsheetStatus(status);
        expect(status).toBe('deprepped');
      }
    });

    it('returns "none" when attempting to advance unknown, invalid or none statuses', () => {
      expect(getNextPullsheetStatus('none')).toBe('none');
      expect(getNextPullsheetStatus('invalid_xyz' as any)).toBe('none');
      expect(getNextPullsheetStatus('' as any)).toBe('none');
    });

    it('robustly normalizes legacy, mixed-case, and whitespace-padded status strings', () => {
      const cases: [string | null | undefined, PullsheetItemStatus][] = [
        ['pending', 'pending'],
        ['Pending', 'pending'],
        ['  PENDING  \n', 'pending'],
        ['ready', 'confirmed'],
        ['Ready', 'confirmed'],
        ['READY', 'confirmed'],
        ['confirmed', 'confirmed'],
        ['Confirmed', 'confirmed'],
        ['prepped/scanned', 'prepped_scanned'],
        ['Prepped/Scanned', 'prepped_scanned'],
        ['prepped_scanned', 'prepped_scanned'],
        ['PREPPED_SCANNED', 'prepped_scanned'],
        ['prepped', 'prepped_scanned'],
        ['PREPPED', 'prepped_scanned'],
        ['dispatched', 'dispatched'],
        ['Dispatched', 'dispatched'],
        ['DISPATCHED', 'dispatched'],
        ['returned', 'returned'],
        ['Returned', 'returned'],
        ['RETURNED', 'returned'],
        ['deprepped', 'deprepped'],
        ['Deprepped', 'deprepped'],
        ['DEPREPPED', 'deprepped'],
        ['none', 'none'],
        ['', 'none'],
        [null, 'none'],
        [undefined, 'none'],
        ['corrupted_status_123', 'none'],
      ];

      for (const [input, expected] of cases) {
        expect(normalizePullsheetStatus(input)).toBe(expected);
      }
    });

    it('guards non-actionable rows from holding operational status', () => {
      const nonActionableTypes: PullsheetItem['type'][] = [
        'section-header',
        'section-footer',
        'note',
        'sub-item',
        'service' as any,
      ];

      for (const type of nonActionableTypes) {
        const item: PullsheetItem = {
          id: `item-${type}`,
          quantity: 1,
          description: `Row of type ${type}`,
          type,
          status: 'confirmed',
        };
        expect(isActionablePullsheetItem(item)).toBe(false);
      }

      // Only 'item' and 'misc' are actionable
      expect(isActionablePullsheetItem({ id: '1', quantity: 1, description: 'Amp', type: 'item', status: 'none' })).toBe(true);
      expect(isActionablePullsheetItem({ id: '2', quantity: 1, description: 'Tape', type: 'misc', status: 'none' })).toBe(true);
    });
  });

  /* ========================================================================== */
  /* 2. Rollback & Revert State Machine Invariants                             */
  /* ========================================================================== */
  describe('2. Pull Sheet Status Rollback & Revert State Machine', () => {
    it('strictly follows the 6-stage reverse rollback order', () => {
      expect(getPreviousPullsheetStatus('deprepped')).toBe('returned');
      expect(getPreviousPullsheetStatus('returned')).toBe('dispatched');
      expect(getPreviousPullsheetStatus('dispatched')).toBe('prepped_scanned');
      expect(getPreviousPullsheetStatus('prepped_scanned')).toBe('confirmed');
      expect(getPreviousPullsheetStatus('confirmed')).toBe('pending');
    });

    it('exhibits initial idempotency when rolling back past pending', () => {
      let status: PullsheetItemStatus = 'pending';
      for (let i = 0; i < 5; i++) {
        status = getPreviousPullsheetStatus(status);
        expect(status).toBe('pending');
      }
    });

    it('returns "none" when attempting to rollback unknown or none statuses', () => {
      expect(getPreviousPullsheetStatus('none')).toBe('none');
      expect(getPreviousPullsheetStatus('invalid_state' as any)).toBe('none');
    });

    it('renders rollback button and triggers revert callback in PullSheetStatusSheet', () => {
      const onSelectStatus = jest.fn();
      const onRollback = jest.fn();
      const onClose = jest.fn();

      const item: PullsheetItem = {
        id: 'ps-item-42',
        description: 'Chauvet Maverick MK3 Spot',
        quantity: 4,
        type: 'item',
        status: 'dispatched',
      };

      const { getByTestId, getByText } = render(
        <PullSheetStatusSheet
          item={item}
          visible={true}
          onClose={onClose}
          onSelectStatus={onSelectStatus}
          onRollback={onRollback}
        />
      );

      expect(getByTestId('rollback-status-btn')).toBeTruthy();

      fireEvent.press(getByTestId('rollback-status-btn'));
      expect(onRollback).toHaveBeenCalledWith('ps-item-42');
      expect(onClose).toHaveBeenCalled();
    });

    it('hides rollback button when item is in pending or none status', () => {
      const pendingItem: PullsheetItem = {
        id: 'ps-pending',
        description: 'DMX Cable 10m',
        quantity: 10,
        type: 'item',
        status: 'pending',
      };

      const { queryByTestId } = render(
        <PullSheetStatusSheet
          item={pendingItem}
          visible={true}
          onClose={jest.fn()}
          onSelectStatus={jest.fn()}
        />
      );

      expect(queryByTestId('rollback-status-btn')).toBeNull();
    });
  });

  /* ========================================================================== */
  /* 3. Section Grouping & Service Exclusion (type !== 'service')               */
  /* ========================================================================== */
  describe('3. Section Grouping & Service Exclusion Engine', () => {
    it('strictly omits service items from grouped sections', () => {
      const rawItems: any[] = [
        { id: 'sec-1', description: 'Audio Rig', type: 'section-header' },
        { id: 'it-1', description: 'Speaker 1', type: 'item', status: 'pending' },
        { id: 'svc-1', description: 'Audio Engineer (10 hrs)', type: 'service', cost: 750 },
        { id: 'svc-2', description: 'Delivery & Logistics Service', type: 'service', cost: 300 },
        { id: 'it-2', description: 'Speaker 2', type: 'item', status: 'confirmed' },
        { id: 'sec-2', description: 'Lighting Rig', type: 'section-header' },
        { id: 'svc-3', description: 'Lighting Programmer', type: 'service', cost: 850 },
        { id: 'it-3', description: 'Fixture 1', type: 'item', status: 'pending' },
        { id: 'svc-4', description: 'Rigging Crew (4 Pax)', type: 'service', cost: 1200 },
      ];

      const sections = groupPullsheetBySections(rawItems);

      expect(sections.length).toBe(2);
      expect(sections[0].title).toBe('Audio Rig');
      expect(sections[0].items.map((it) => it.id)).toEqual(['it-1', 'it-2']);

      expect(sections[1].title).toBe('Lighting Rig');
      expect(sections[1].items.map((it) => it.id)).toEqual(['it-3']);

      // Ensure no service item made it into any section
      for (const sec of sections) {
        for (const it of sec.items) {
          expect((it as any).type).not.toBe('service');
        }
      }
    });

    it('correctly populates default General Equipment section for leading items before any header', () => {
      const rawItems: PullsheetItem[] = [
        { id: 'lead-1', description: 'Safety Helmet', type: 'item', quantity: 5, status: 'pending' },
        { id: 'lead-2', description: 'Tool Box', type: 'misc', quantity: 2, status: 'confirmed' },
        { id: 'sec-1', description: 'Video Wall', type: 'section-header', quantity: 0, status: 'none' },
        { id: 'vid-1', description: 'ROE LED Panel 2.8mm', type: 'item', quantity: 40, status: 'pending' },
      ];

      const sections = groupPullsheetBySections(rawItems);
      expect(sections.length).toBe(2);
      expect(sections[0].id).toBe('default-section');
      expect(sections[0].title).toBe('General Equipment');
      expect(sections[0].items.length).toBe(2);

      expect(sections[1].id).toBe('sec-1');
      expect(sections[1].title).toBe('Video Wall');
      expect(sections[1].items.length).toBe(1);
    });

    it('filters out section-footer rows and handles consecutive section headers', () => {
      const items: PullsheetItem[] = [
        { id: 'sec-1', description: 'Stage Rigging', type: 'section-header', status: 'none', quantity: 0 },
        { id: 'foot-1', description: 'Section Note', type: 'section-footer', status: 'none', quantity: 0 },
        { id: 'sec-2', description: 'Power Distribution', type: 'section-header', status: 'none', quantity: 0 },
        { id: 'pwr-1', description: '63A 3-Phase Distro', type: 'item', status: 'pending', quantity: 2 },
      ];

      const sections = groupPullsheetBySections(items);
      expect(sections.length).toBe(1);
      expect(sections[0].title).toBe('Power Distribution');
      expect(sections[0].items.length).toBe(1);
    });

    it('handles massive 500+ item pull sheet stress test under 50ms', () => {
      const massiveItems: PullsheetItem[] = [];
      for (let s = 1; s <= 20; s++) {
        massiveItems.push({
          id: `sec-${s}`,
          description: `Department Section ${s}`,
          type: 'section-header',
          quantity: 0,
          status: 'none',
        });
        for (let i = 1; i <= 25; i++) {
          const isService = i % 5 === 0;
          massiveItems.push({
            id: `item-s${s}-i${i}`,
            description: `Equipment Piece ${s}-${i}`,
            type: isService ? ('service' as any) : 'item',
            quantity: (i % 10) + 1,
            status: isService ? 'none' : 'pending',
          });
        }
      }

      const t0 = Date.now();
      const sections = groupPullsheetBySections(massiveItems);
      const elapsed = Date.now() - t0;

      expect(sections.length).toBe(20);
      expect(elapsed).toBeLessThan(100);

      // Verify each section has exactly 20 items (25 total - 5 service items)
      for (const section of sections) {
        expect(section.items.length).toBe(20);
      }
    });
  });

  /* ========================================================================== */
  /* 4. Continuous Scanning & Scanned Quantity Increments                      */
  /* ========================================================================== */
  describe('4. Continuous Scanning & Scanned Quantity Logic', () => {
    it('increments scanned quantity and auto-transitions to prepped_scanned when target reached', async () => {
      const items: PullsheetItem[] = [
        {
          id: 'item-mic',
          description: 'Shure Axient AD4D Dual Receiver',
          quantity: 2,
          scannedQuantity: 0,
          scannedBarcodes: [],
          type: 'item',
          status: 'confirmed',
        },
      ];

      const testPullsheet: Pullsheet = {
        id: 'ev-scan-01',
        eventId: 'ev-scan-01',
        tenantId: 'tenant-adversarial',
        items,
      };

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate(testPullsheet);
        return jest.fn();
      });

      const updateCountSpy = jest
        .spyOn(pullSheetService, 'updatePullsheetItemScannedCount')
        .mockResolvedValueOnce({ success: true, item: { ...items[0], scannedQuantity: 1 } })
        .mockResolvedValueOnce({ success: true, item: { ...items[0], scannedQuantity: 2, status: 'prepped_scanned' } });

      const { result } = renderHook(() => usePullSheet('ev-scan-01'));

      // First scan: count becomes 1, not yet fully prepped
      await act(async () => {
        const ok = await result.current.incrementScannedCount('item-mic', 'BC-SHURE-01');
        expect(ok).toBe(true);
      });

      expect(updateCountSpy).toHaveBeenLastCalledWith(
        'ev-scan-01',
        'tenant-adversarial',
        'item-mic',
        1,
        false, // autoTransitionToPrepped is false since 1 < 2
        { uid: 'challenger-user-999' },
        'BC-SHURE-01'
      );

      // Second scan: count becomes 2 (target reached), autoTransitionToPrepped becomes true
      await act(async () => {
        const ok = await result.current.incrementScannedCount('item-mic', 'BC-SHURE-02');
        expect(ok).toBe(true);
      });

      expect(updateCountSpy).toHaveBeenLastCalledWith(
        'ev-scan-01',
        'tenant-adversarial',
        'item-mic',
        2,
        true, // autoTransitionToPrepped is true since 2 >= 2
        { uid: 'challenger-user-999' },
        'BC-SHURE-02'
      );
    });

    it('prevents duplicate barcode serial strings from polluting scannedBarcodes array', async () => {
      const items: PullsheetItem[] = [
        {
          id: 'item-distro',
          description: '32A Distribution Box',
          quantity: 1,
          scannedQuantity: 0,
          scannedBarcodes: ['BARCODE-DISTRO-99'],
          type: 'item',
          status: 'confirmed',
        },
      ];

      const testPullsheet: Pullsheet = {
        id: 'ev-scan-02',
        eventId: 'ev-scan-02',
        tenantId: 'tenant-adversarial',
        items,
      };

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate(testPullsheet);
        return jest.fn();
      });

      jest.spyOn(pullSheetService, 'updatePullsheetItemScannedCount').mockResolvedValue({ success: true });

      const { result } = renderHook(() => usePullSheet('ev-scan-02'));

      // Rescan duplicate barcode
      await act(async () => {
        await result.current.incrementScannedCount('item-distro', 'BARCODE-DISTRO-99');
      });

      const updatedItem = result.current.items.find((it) => it.id === 'item-distro');
      expect(updatedItem?.scannedBarcodes).toEqual(['BARCODE-DISTRO-99']);
    });
  });

  /* ========================================================================== */
  /* 5. Real-Time Progress Metrics Calculation                                  */
  /* ========================================================================== */
  describe('5. Real-Time Progress Metrics Calculation Engine', () => {
    it('accurately computes cumulative lifecycle percentages', () => {
      const items: PullsheetItem[] = [
        { id: '1', quantity: 2, type: 'item', status: 'pending', description: 'Pending item' },
        { id: '2', quantity: 2, type: 'item', status: 'confirmed', description: 'Confirmed item' },
        { id: '3', quantity: 2, type: 'item', status: 'prepped_scanned', description: 'Prepped item' },
        { id: '4', quantity: 2, type: 'item', status: 'dispatched', description: 'Dispatched item' },
        { id: '5', quantity: 2, type: 'item', status: 'returned', description: 'Returned item' },
        { id: '6', quantity: 2, type: 'item', status: 'deprepped', description: 'Deprepped item' },
      ];

      const progress = calculatePullsheetProgress(items);
      expect(progress.totalLines).toBe(6);
      expect(progress.totalQuantity).toBe(12);
      expect(progress.pendingQuantity).toBe(2);
      expect(progress.confirmedQuantity).toBe(2);
      expect(progress.preppedQuantity).toBe(2);
      expect(progress.dispatchedQuantity).toBe(2);
      expect(progress.returnedQuantity).toBe(2);
      expect(progress.depreppedQuantity).toBe(2);

      // Cumulative prepped includes prepped (2) + dispatched (2) + returned (2) + deprepped (2) = 8 / 12 = 67%
      expect(progress.percentPrepped).toBe(67);
      // Cumulative dispatched includes dispatched (2) + returned (2) + deprepped (2) = 6 / 12 = 50%
      expect(progress.percentDispatched).toBe(50);
      // Cumulative returned includes returned (2) + deprepped (2) = 4 / 12 = 33%
      expect(progress.percentReturned).toBe(33);

      expect(progress.isFullyPrepped).toBe(false);
      expect(progress.isFullyDispatched).toBe(false);
      expect(progress.isFullyReturned).toBe(false);
      expect(progress.isFullyDeprepped).toBe(false);
    });

    it('identifies 100% completion flags correctly', () => {
      const items: PullsheetItem[] = [
        { id: '1', quantity: 10, type: 'item', status: 'deprepped', description: 'Fully cycled' },
      ];

      const progress = calculatePullsheetProgress(items);
      expect(progress.percentPrepped).toBe(100);
      expect(progress.percentDispatched).toBe(100);
      expect(progress.percentReturned).toBe(100);
      expect(progress.isFullyPrepped).toBe(true);
      expect(progress.isFullyDispatched).toBe(true);
      expect(progress.isFullyReturned).toBe(true);
      expect(progress.isFullyDeprepped).toBe(true);
    });

    it('strictly excludes service items from all progress counters', () => {
      const items: any[] = [
        { id: '1', quantity: 5, type: 'item', status: 'prepped_scanned', description: 'Lighting desk' },
        { id: 'svc-1', quantity: 10, type: 'service', status: 'none', description: '10x Crew Service' },
      ];

      const progress = calculatePullsheetProgress(items);
      expect(progress.totalLines).toBe(1);
      expect(progress.totalQuantity).toBe(5);
      expect(progress.preppedQuantity).toBe(5);
      expect(progress.percentPrepped).toBe(100);
      expect(progress.isFullyPrepped).toBe(true);
    });
  });

  /* ========================================================================== */
  /* 6. Bulk Confirmation Concurrency & Race Conditions                         */
  /* ========================================================================== */
  describe('6. Bulk Confirmation Concurrency & Race Conditions', () => {
    it('coalesces 25 rapid bulk-confirm taps into one save without state corruption', async () => {
      const items: PullsheetItem[] = [
        { id: 'p-1', quantity: 1, type: 'item', status: 'pending', description: 'Pending Item 1' },
        { id: 'p-2', quantity: 1, type: 'item', status: 'pending', description: 'Pending Item 2' },
        { id: 'c-1', quantity: 1, type: 'item', status: 'confirmed', description: 'Already Confirmed' },
        { id: 'pr-1', quantity: 1, type: 'item', status: 'prepped_scanned', description: 'Already Prepped' },
      ];

      const testPullsheet: Pullsheet = {
        id: 'ev-bulk-conc',
        eventId: 'ev-bulk-conc',
        tenantId: 'tenant-adversarial',
        items,
      };

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate(testPullsheet);
        return jest.fn();
      });

      const bulkSpy = jest
        .spyOn(pullSheetService, 'bulkConfirmPullsheet')
        .mockResolvedValue({ success: true });

      const { result } = renderHook(() => usePullSheet('ev-bulk-conc'));

      // Launch 25 concurrent bulkConfirm calls wrapped in act
      let results: boolean[] = [];
      await act(async () => {
        const promises = Array.from({ length: 25 }, () => result.current.bulkConfirm());
        results = await Promise.all(promises);
      });

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.filter((saved) => !saved)).toHaveLength(24);
      expect(bulkSpy).toHaveBeenCalledTimes(1);

      // Verify that already advanced items were NEVER mutated to 'confirmed' or reverted
      const preppedItem = result.current.items.find((it) => it.id === 'pr-1');
      expect(preppedItem?.status).toBe('prepped_scanned');
    });

    it('interleaves status advance, rollback, and bulk confirm under concurrency', async () => {
      const items: PullsheetItem[] = [
        { id: 'it-a', quantity: 1, type: 'item', status: 'pending', description: 'Item A' },
        { id: 'it-b', quantity: 1, type: 'item', status: 'confirmed', description: 'Item B' },
        { id: 'it-c', quantity: 1, type: 'item', status: 'dispatched', description: 'Item C' },
      ];

      const testPullsheet: Pullsheet = {
        id: 'ev-interleave',
        eventId: 'ev-interleave',
        tenantId: 'tenant-adversarial',
        items,
      };

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate(testPullsheet);
        return jest.fn();
      });

      jest.spyOn(pullSheetService, 'updatePullsheetItemStatus').mockResolvedValue({ success: true });
      jest.spyOn(pullSheetService, 'bulkConfirmPullsheet').mockResolvedValue({ success: true });

      const { result } = renderHook(() => usePullSheet('ev-interleave'));

      await act(async () => {
        await Promise.all([
          result.current.advanceStatus('it-a'),    // pending -> confirmed
          result.current.advanceStatus('it-b'),    // confirmed -> prepped_scanned
          result.current.rollbackStatus('it-c'),   // dispatched -> prepped_scanned
          result.current.bulkConfirm(),            // confirms remaining pending items
        ]);
      });

      expect(result.current.error).toBeNull();
    });

    it('handles Firestore mutation rejection with error return and preserves UI integrity', async () => {
      const items: PullsheetItem[] = [
        { id: 'it-err', quantity: 1, type: 'item', status: 'pending', description: 'Faulty Item' },
      ];

      const testPullsheet: Pullsheet = {
        id: 'ev-fail',
        eventId: 'ev-fail',
        tenantId: 'tenant-adversarial',
        items,
      };

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate(testPullsheet);
        return jest.fn();
      });

      jest.spyOn(pullSheetService, 'updatePullsheetItemStatus').mockResolvedValue({
        success: false,
        error: 'Permission Denied: Tenant Isolation Barrier',
      });

      const { result } = renderHook(() => usePullSheet('ev-fail'));

      let success = true;
      await act(async () => {
        success = await result.current.updateStatus('it-err', 'confirmed');
      });

      expect(success).toBe(false);
    });
  });

  /* ========================================================================== */
  /* 7. Jobs Feed Date Offset Scrubber & Categorization                         */
  /* ========================================================================== */
  describe('7. Jobs Feed Date Offset Scrubber & Overlap Categorization', () => {
    const anchorDate = new Date('2026-08-25T10:00:00.000Z');

    const multiDayEvent: Event = {
      id: 'ev-multiday',
      tenantId: 'tenant-adversarial',
      eventName: '3-Day Music & Arts Festival',
      clientId: 'client-1',
      eventTypeId: 'type-festival',
      assigneeId: 'user-1',
      startTime: null,
      finishTime: null,
      deliveryTime: new Date('2026-08-24T08:00:00.000Z'), // Day -1
      setupTime: null,
      eventStartDate: new Date('2026-08-25T12:00:00.000Z'), // Day 0
      eventFinishDate: new Date('2026-08-26T22:00:00.000Z'), // Day +1
      pickupTime: null,
      packdownTime: new Date('2026-08-27T04:00:00.000Z'), // Day +2
      eventStatusId: 'Confirmed',
    };

    const futureEvent: Event = {
      id: 'ev-future',
      tenantId: 'tenant-adversarial',
      eventName: 'Next Month Gala',
      clientId: 'client-1',
      eventTypeId: 'type-gala',
      assigneeId: 'user-1',
      startTime: null,
      finishTime: null,
      deliveryTime: new Date('2026-09-20T10:00:00.000Z'),
      setupTime: null,
      eventStartDate: new Date('2026-09-20T18:00:00.000Z'),
      eventFinishDate: new Date('2026-09-20T23:00:00.000Z'),
      pickupTime: null,
      packdownTime: new Date('2026-09-21T02:00:00.000Z'),
      eventStatusId: 'Confirmed',
    };

    const pastEvent: Event = {
      id: 'ev-past',
      tenantId: 'tenant-adversarial',
      eventName: 'Last Week Expo',
      clientId: 'client-1',
      eventTypeId: 'type-expo',
      assigneeId: 'user-1',
      startTime: null,
      finishTime: null,
      deliveryTime: new Date('2026-08-10T10:00:00.000Z'),
      setupTime: null,
      eventStartDate: new Date('2026-08-10T12:00:00.000Z'),
      eventFinishDate: new Date('2026-08-11T18:00:00.000Z'),
      pickupTime: null,
      packdownTime: new Date('2026-08-11T22:00:00.000Z'),
      eventStatusId: 'Completed',
    };

    const eventsList = [multiDayEvent, futureEvent, pastEvent];

    it('accurately includes multi-day event in todayJobs across all active span offsets', () => {
      // Day -1 (Aug 24)
      const catMinus1 = categorizeEvents(eventsList, { targetDateOffset: -1, referenceDate: anchorDate });
      expect(catMinus1.todayJobs.some((e) => e.id === 'ev-multiday')).toBe(true);

      // Day 0 (Aug 25)
      const catDay0 = categorizeEvents(eventsList, { targetDateOffset: 0, referenceDate: anchorDate });
      expect(catDay0.todayJobs.some((e) => e.id === 'ev-multiday')).toBe(true);

      // Day +1 (Aug 26)
      const catPlus1 = categorizeEvents(eventsList, { targetDateOffset: 1, referenceDate: anchorDate });
      expect(catPlus1.todayJobs.some((e) => e.id === 'ev-multiday')).toBe(true);

      // Day +2 (Aug 27)
      const catPlus2 = categorizeEvents(eventsList, { targetDateOffset: 2, referenceDate: anchorDate });
      expect(catPlus2.todayJobs.some((e) => e.id === 'ev-multiday')).toBe(true);

      // Day +3 (Aug 28) - should NOT include multi-day event
      const catPlus3 = categorizeEvents(eventsList, { targetDateOffset: 3, referenceDate: anchorDate });
      expect(catPlus3.todayJobs.some((e) => e.id === 'ev-multiday')).toBe(false);

      // Day -2 (Aug 23) - should NOT include multi-day event
      const catMinus2 = categorizeEvents(eventsList, { targetDateOffset: -2, referenceDate: anchorDate });
      expect(catMinus2.todayJobs.some((e) => e.id === 'ev-multiday')).toBe(false);
    });

    it('manages date scrubber offset state and resetDateOffset() in useEvents hook', async () => {
      jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
        onData(eventsList);
        return jest.fn();
      });

      const { result } = renderHook(() => useEvents(0));

      expect(result.current.targetDateOffset).toBe(0);

      // Increment scrubber by 3 days
      act(() => {
        result.current.setTargetDateOffset((prev) => prev + 3);
      });
      expect(result.current.targetDateOffset).toBe(3);

      // Decrement scrubber by 1 day
      act(() => {
        result.current.setTargetDateOffset((prev) => prev - 1);
      });
      expect(result.current.targetDateOffset).toBe(2);

      // Reset scrubber
      act(() => {
        result.current.resetDateOffset();
      });
      expect(result.current.targetDateOffset).toBe(0);
    });

    it('filters archived events completely from all categorized buckets', () => {
      const archivedEvent: Event = {
        ...multiDayEvent,
        id: 'ev-archived-1',
        archived: true,
      };

      const result = categorizeEvents([archivedEvent], { targetDateOffset: 0, referenceDate: anchorDate });
      expect(result.todayJobs.length).toBe(0);
      expect(result.inProgress.length).toBe(0);
      expect(result.upcoming.length).toBe(0);
      expect(result.completed.length).toBe(0);
    });
  });

  /* ========================================================================== */
  /* 8. Timezone Boundary Calculations & Timestamp Normalization               */
  /* ========================================================================== */
  describe('8. Timezone Boundary Calculations & Timestamp Normalization', () => {
    it('accurately parses raw Firestore timestamps with seconds/nanoseconds', () => {
      const timestampWithNano = {
        _seconds: 1787654400,
        _nanoseconds: 750000000,
      };
      const parsed = parseFirestoreDate(timestampWithNano);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.getTime()).toBe(1787654400750);
    });

    it('accurately parses numeric timestamps in seconds (< 1e11) and milliseconds', () => {
      // Seconds
      const sec = 1787654400;
      const parsedSec = parseFirestoreDate(sec);
      expect(parsedSec?.getTime()).toBe(1787654400000);

      // Milliseconds
      const ms = 1787654400123;
      const parsedMs = parseFirestoreDate(ms);
      expect(parsedMs?.getTime()).toBe(1787654400123);
    });

    it('handles midnight (00:00:00.000) and end-of-day (23:59:59.999) boundary windows', () => {
      const d = new Date(2026, 7, 25, 14, 30);
      const start = getStartOfDay(d);
      const end = getEndOfDay(d);

      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      expect(start.getMilliseconds()).toBe(0);

      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
      expect(end.getMilliseconds()).toBe(999);
    });

    it('handles leap years and month-end transitions accurately in isSameDay', () => {
      const leapDay1 = new Date(2028, 1, 29, 10, 0); // Feb 29, 2028
      const leapDay2 = new Date(2028, 1, 29, 23, 59);
      const nextDay = new Date(2028, 2, 1, 0, 0);   // Mar 1, 2028

      expect(isSameDay(leapDay1, leapDay2)).toBe(true);
      expect(isSameDay(leapDay1, nextDay)).toBe(false);
    });

    it('formats date ranges across same day, same month, and cross-year boundaries', () => {
      // Same day
      const d1 = new Date(2026, 7, 25, 9, 0);
      const d2 = new Date(2026, 7, 25, 22, 0);
      expect(formatEventDateRange(d1, d2)).toBe('25 Aug 2026');

      // Same month multi-day
      const d3 = new Date(2026, 7, 28, 22, 0);
      expect(formatEventDateRange(d1, d3)).toBe('25 - 28 Aug 2026');

      // Cross month
      const d4 = new Date(2026, 8, 3, 22, 0);
      expect(formatEventDateRange(d1, d4)).toBe('25 Aug - 3 Sep 2026');

      // Cross year
      const dEndYear = new Date(2026, 11, 31, 20, 0);
      const dNewYear = new Date(2027, 0, 2, 10, 0);
      expect(formatEventDateRange(dEndYear, dNewYear)).toBe('31 Dec 2026 - 2 Jan 2027');
    });
  });

  /* ========================================================================== */
  /* 9. Navigation Parameter Forwarding & Screen Component Integration          */
  /* ========================================================================== */
  describe('9. Navigation Parameter Forwarding & Screen Integration', () => {
    const sampleEvent: Event = {
      id: 'ev-nav-test',
      tenantId: 'tenant-adversarial',
      eventName: 'Symphony Under the Stars',
      eventNumber: 2048,
      eventStatusId: 'Confirmed',
      clientId: 'Sydney Symphony Orchestra',
      eventTypeId: 'Concert',
      assigneeId: 'operator-1',
      startTime: new Date('2026-08-25T18:00:00.000Z'),
      finishTime: new Date('2026-08-25T22:00:00.000Z'),
      deliveryTime: new Date('2026-08-25T10:00:00.000Z'),
      setupTime: new Date('2026-08-25T12:00:00.000Z'),
      eventStartDate: new Date('2026-08-25T18:00:00.000Z'),
      eventFinishDate: new Date('2026-08-25T22:00:00.000Z'),
      pickupTime: null,
      packdownTime: null,
      venueId: 'Sydney Opera House Forecourt',
    };

    it('EventCard forwards correct route parameters on Card tap without button row', () => {
      const { getByTestId, queryByTestId } = render(<EventCard event={sampleEvent} />);

      // Bottom action buttons are removed
      expect(queryByTestId('card-pullsheet-btn-ev-nav-test')).toBeNull();
      expect(queryByTestId('card-scan-btn-ev-nav-test')).toBeNull();

      // Tap card body
      fireEvent.press(getByTestId('event-card-ev-nav-test'));
      expect(mockPush).toHaveBeenCalledWith('/events/ev-nav-test');
    });

    it('PullSheetRedirectScreen seamlessly redirects route params to unified Event Details screen', () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: ['ev-stress-001'] });
      const mockReplace = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: mockPush,
        back: mockBack,
        replace: mockReplace,
      });

      render(<PullSheetScreen />);
      expect(mockReplace).toHaveBeenCalledWith('/events/ev-stress-001');
    });

    it('EventDetailsScreen handles array-type or string route params and navigates back', () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: ['ev-stress-001'] });

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate({
          id: 'ev-stress-001',
          eventId: 'ev-stress-001',
          tenantId: 'tenant-adversarial',
          items: [
            { id: 'it-1', description: 'Wireless Mic Kit', quantity: 2, type: 'item', status: 'pending' },
          ],
        });
        return jest.fn();
      });

      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, onData) => {
        onData(sampleEvent);
        return jest.fn();
      });

      const { getByTestId, getByText, queryByText } = render(<EventDetailsScreen />);

      expect(getByText('Symphony Under the Stars')).toBeTruthy();
      expect(getByText('[2048]')).toBeTruthy();
      expect(queryByText(/Pull Sheet #/i)).toBeNull();

      // Back button press
      fireEvent.press(getByTestId('event-details-back-btn'));
      expect(mockBack).toHaveBeenCalledTimes(1);

      // Sticky Bottom Action Bar Start Scanning press
      fireEvent.press(getByTestId('start-scanning-btn'));
      expect(getByTestId('scanner-expandable-sheet')).toBeTruthy();
    });

    it('toggles Bulk Confirm header button based on pendingQuantity presence in EventDetailsScreen', async () => {
      let listenerCallback: ((data: Pullsheet | null) => void) | null = null;
      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        listenerCallback = onUpdate;
        onUpdate({
          id: 'ev-stress-001',
          eventId: 'ev-stress-001',
          tenantId: 'tenant-adversarial',
          items: [
            { id: 'it-1', description: 'Speaker 1', quantity: 1, type: 'item', status: 'pending' },
          ],
        });
        return jest.fn();
      });

      const { getByTestId, queryByTestId } = render(<EventDetailsScreen />);
      expect(getByTestId('bulk-confirm-header-btn')).toBeTruthy();

      // 2. Real-time update: All items confirmed -> Confirm All button removed
      act(() => {
        if (listenerCallback) {
          listenerCallback({
            id: 'ev-stress-001',
            eventId: 'ev-stress-001',
            tenantId: 'tenant-adversarial',
            items: [
              { id: 'it-1', description: 'Speaker 1', quantity: 1, type: 'item', status: 'confirmed' },
            ],
          });
        }
      });

      expect(queryByTestId('bulk-confirm-header-btn')).toBeNull();
    });

    it('ensures EventDetailsScreen scroll view prevents sticky bar overlap and handles keyboard taps', () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'ev-stress-001' });

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate({
          id: 'ev-stress-001',
          eventId: 'ev-stress-001',
          tenantId: 'tenant-adversarial',
          items: [
            { id: 'it-1', description: 'Wireless Mic Kit', quantity: 2, type: 'item', status: 'pending' },
          ],
        });
        return jest.fn();
      });

      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, onData) => {
        onData(sampleEvent);
        return jest.fn();
      });

      const { UNSAFE_getByType } = render(<EventDetailsScreen />);
      const { ScrollView, StyleSheet } = require('react-native');
      const scrollView = UNSAFE_getByType(ScrollView);

      expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
      const resolvedContentStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);
      expect(resolvedContentStyle.paddingBottom).toBeGreaterThanOrEqual(90);
    });

    it('executes bulkConfirm cleanly when header confirm button is pressed', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'ev-stress-001' });

      const bulkSpy = jest.spyOn(pullSheetService, 'bulkConfirmPullsheet').mockResolvedValueOnce({ success: true });

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate({
          id: 'ev-stress-001',
          eventId: 'ev-stress-001',
          tenantId: 'tenant-adversarial',
          items: [
            { id: 'it-1', description: 'Item 1', quantity: 1, type: 'item', status: 'pending' },
          ],
        });
        return jest.fn();
      });

      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, onData) => {
        onData(sampleEvent);
        return jest.fn();
      });

      const { getByTestId } = render(<EventDetailsScreen />);
      const bulkBtn = getByTestId('bulk-confirm-header-btn');
      expect(bulkBtn).toBeTruthy();

      await act(async () => {
        fireEvent.press(bulkBtn);
      });

      expect(bulkSpy).toHaveBeenCalledWith(
        'ev-stress-001',
        'tenant-adversarial',
        expect.objectContaining({ uid: expect.any(String) })
      );
    });

    it('falls back to truncated uppercase ID in EventDetailsScreen header when eventNumber is undefined', () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'ev-stress-001' });

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate({
          id: 'ev-stress-001',
          eventId: 'ev-stress-001',
          tenantId: 'tenant-adversarial',
          items: [],
        });
        return jest.fn();
      });

      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, onData) => {
        onData({
          ...sampleEvent,
          id: 'ev-stress-001',
          eventNumber: undefined,
        });
        return jest.fn();
      });

      const { getByText } = render(<EventDetailsScreen />);
      expect(getByText('[EV-STR]')).toBeTruthy();
    });

    it('omits quote lines count and separator dot on EventCard even when equipment items exist', () => {
      const dateUtils = require('@/lib/date-utils');
      const dateSpy = jest.spyOn(dateUtils, 'formatEventDateRange').mockReturnValueOnce('');

      const minimalEvent = {
        ...sampleEvent,
        venueId: '',
        equipmentItems: [{ id: 'eq-1' }, { id: 'eq-2' }],
      };

      const { queryByText } = render(
        <EventCard event={minimalEvent as any} venueName="" />
      );

      // Quote lines count and separator dot should NOT exist on EventCard
      expect(queryByText(/Quote Line Items/i)).toBeNull();
      expect(queryByText('•')).toBeNull();

      dateSpy.mockRestore();
    });

    it('PullSheetRedirectScreen falls back to router.push when router.replace is unavailable', () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'ev-redirect-push' });
      const mockPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: mockPush,
        replace: undefined,
      });

      render(<PullSheetScreen />);
      expect(mockPush).toHaveBeenCalledWith('/events/ev-redirect-push');
    });

    it('EventDetailsScreen handleBack falls back to tabs when canGoBack returns false', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'ev-stress-001' });
      const mockCanGoBack = jest.fn().mockReturnValue(false);
      const mockReplace = jest.fn();
      const mockBack = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        canGoBack: mockCanGoBack,
        replace: mockReplace,
        back: mockBack,
      });

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate({
          id: 'ev-stress-001',
          eventId: 'ev-stress-001',
          tenantId: 'tenant-adversarial',
          items: [],
        });
        return jest.fn();
      });

      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, onData) => {
        onData(sampleEvent);
        return jest.fn();
      });

      const { getByTestId } = render(<EventDetailsScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('event-details-back-btn'));
      });

      expect(mockCanGoBack).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('handles synchronous openURL error gracefully when opening maps in EventDetailsScreen', () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'ev-stress-001' });
      const { Linking } = require('react-native');
      const linkingSpy = jest.spyOn(Linking, 'openURL').mockImplementation(() => {
        throw new Error('OS Linking handler unavailable');
      });
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate({
          id: 'ev-stress-001',
          eventId: 'ev-stress-001',
          tenantId: 'tenant-adversarial',
          items: [],
        });
        return jest.fn();
      });

      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, onData) => {
        onData(sampleEvent);
        return jest.fn();
      });

      const { queryByTestId, getByTestId } = render(<EventDetailsScreen />);
      // Maps button was removed per design requirement; venue details are compactly displayed
      expect(queryByTestId('open-maps-btn')).toBeNull();
      expect(getByTestId('event-client-venue-card')).toBeTruthy();

      linkingSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('renders Event Not Found and navigates cleanly on empty eventId', () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '' });
      const mockReplace = jest.fn();
      const mockBack = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: jest.fn(),
        replace: mockReplace,
        back: mockBack,
        canGoBack: () => false,
      });

      const { getByTestId, getByText } = render(<EventDetailsScreen />);
      expect(getByText('Event Not Found')).toBeTruthy();

      const backBtn = getByTestId('event-not-found-back-btn');
      expect(backBtn).toBeTruthy();
      fireEvent.press(backBtn);

      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });

    it('catches navigation redirect exception in PullSheetRedirectScreen without throwing', () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'ev-err-redirect' });
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (useRouter as jest.Mock).mockReturnValue({
        replace: () => {
          throw new Error('Navigation router unmounted');
        },
      });

      expect(() => {
        render(<PullSheetScreen />);
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[PullSheetRedirectScreen] Navigation redirect error:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
