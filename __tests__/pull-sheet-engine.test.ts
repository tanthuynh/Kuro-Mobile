/**
 * __tests__/pull-sheet-engine.test.ts
 * Comprehensive test suite for pull-sheet lifecycle state machine,
 * progress metrics calculator, legacy status normalizer, and section groupers.
 */

import {
  normalizePullsheetStatus,
  isActionablePullsheetItem,
  getNextPullsheetStatus,
  getPreviousPullsheetStatus,
  calculatePullsheetProgress,
  groupPullsheetBySections,
} from '@/lib/pull-sheet-engine';
import type { PullsheetItem } from '@/types/pull-sheet';

describe('pull-sheet-engine', () => {
  describe('normalizePullsheetStatus', () => {
    it('normalizes canonical statuses regardless of casing and whitespace', () => {
      expect(normalizePullsheetStatus('pending')).toBe('pending');
      expect(normalizePullsheetStatus('Pending')).toBe('pending');
      expect(normalizePullsheetStatus('  pending  ')).toBe('pending');
      expect(normalizePullsheetStatus('confirmed')).toBe('confirmed');
      expect(normalizePullsheetStatus('Confirmed')).toBe('confirmed');
      expect(normalizePullsheetStatus('prepped_scanned')).toBe('prepped_scanned');
      expect(normalizePullsheetStatus('Prepped_Scanned')).toBe('prepped_scanned');
      expect(normalizePullsheetStatus('dispatched')).toBe('dispatched');
      expect(normalizePullsheetStatus('Dispatched')).toBe('dispatched');
      expect(normalizePullsheetStatus('returned')).toBe('returned');
      expect(normalizePullsheetStatus('Returned')).toBe('returned');
      expect(normalizePullsheetStatus('deprepped')).toBe('deprepped');
      expect(normalizePullsheetStatus('Deprepped')).toBe('deprepped');
    });

    it('normalizes legacy Kuro Web status strings', () => {
      expect(normalizePullsheetStatus('Ready')).toBe('confirmed');
      expect(normalizePullsheetStatus('Prepped/Scanned')).toBe('prepped_scanned');
      expect(normalizePullsheetStatus('prepped')).toBe('prepped_scanned');
    });

    it('returns "none" for non-actionable, null, empty or invalid strings', () => {
      expect(normalizePullsheetStatus(null)).toBe('none');
      expect(normalizePullsheetStatus(undefined)).toBe('none');
      expect(normalizePullsheetStatus('')).toBe('none');
      expect(normalizePullsheetStatus('none')).toBe('none');
      expect(normalizePullsheetStatus('unknown_status_xyz')).toBe('none');
    });
  });

  describe('Lifecycle State Machine Transitions', () => {
    it('advances forward through complete 6-stage lifecycle', () => {
      expect(getNextPullsheetStatus('pending')).toBe('confirmed');
      expect(getNextPullsheetStatus('confirmed')).toBe('prepped_scanned');
      expect(getNextPullsheetStatus('prepped_scanned')).toBe('dispatched');
      expect(getNextPullsheetStatus('dispatched')).toBe('returned');
      expect(getNextPullsheetStatus('returned')).toBe('deprepped');
      expect(getNextPullsheetStatus('deprepped')).toBe('deprepped'); // idempotent terminal
      expect(getNextPullsheetStatus('none')).toBe('none');
    });

    it('rolls back backward through lifecycle (revert / undo)', () => {
      expect(getPreviousPullsheetStatus('deprepped')).toBe('returned');
      expect(getPreviousPullsheetStatus('returned')).toBe('dispatched');
      expect(getPreviousPullsheetStatus('dispatched')).toBe('prepped_scanned');
      expect(getPreviousPullsheetStatus('prepped_scanned')).toBe('confirmed');
      expect(getPreviousPullsheetStatus('confirmed')).toBe('pending');
      expect(getPreviousPullsheetStatus('pending')).toBe('pending'); // idempotent initial
      expect(getPreviousPullsheetStatus('none')).toBe('none');
    });
  });

  describe('isActionablePullsheetItem', () => {
    it('identifies actionable vs non-actionable rows', () => {
      const itemRow: PullsheetItem = { id: '1', quantity: 2, description: 'Speaker', type: 'item', status: 'pending' };
      const miscRow: PullsheetItem = { id: '2', quantity: 1, description: 'Gaffa Tape', type: 'misc', status: 'pending' };
      const noteRow: PullsheetItem = { id: '3', quantity: 0, description: 'Handle with care', type: 'note', status: 'none' };
      const headerRow: PullsheetItem = { id: '4', quantity: 0, description: 'Audio FOH', type: 'section-header', status: 'none' };
      const subItemRow: PullsheetItem = { id: '5', quantity: 2, description: 'Power Cable', type: 'sub-item', status: 'none' };

      expect(isActionablePullsheetItem(itemRow)).toBe(true);
      expect(isActionablePullsheetItem(miscRow)).toBe(true);
      expect(isActionablePullsheetItem(noteRow)).toBe(false);
      expect(isActionablePullsheetItem(headerRow)).toBe(false);
      expect(isActionablePullsheetItem(subItemRow)).toBe(false);
    });
  });

  describe('calculatePullsheetProgress', () => {
    it('calculates metrics for an empty pullsheet', () => {
      const progress = calculatePullsheetProgress([]);
      expect(progress.totalLines).toBe(0);
      expect(progress.totalQuantity).toBe(0);
      expect(progress.percentPrepped).toBe(0);
      expect(progress.isFullyPrepped).toBe(false);
    });

    it('accurately calculates progress for partially prepped pullsheet', () => {
      const items: PullsheetItem[] = [
        { id: '1', quantity: 4, description: 'K2 Speaker', type: 'item', status: 'prepped_scanned' },
        { id: '2', quantity: 2, description: 'KS28 Sub', type: 'item', status: 'confirmed' },
        { id: '3', quantity: 2, description: 'LA12X Amp', type: 'item', status: 'pending' },
        { id: '4', quantity: 0, description: 'Audio Section', type: 'section-header', status: 'none' },
      ];

      const progress = calculatePullsheetProgress(items);
      expect(progress.totalLines).toBe(3); // 3 actionable items
      expect(progress.totalQuantity).toBe(8); // 4 + 2 + 2
      expect(progress.preppedQuantity).toBe(4);
      expect(progress.confirmedQuantity).toBe(2);
      expect(progress.pendingQuantity).toBe(2);
      expect(progress.percentPrepped).toBe(50); // 4 / 8 = 50%
      expect(progress.isFullyPrepped).toBe(false);
    });

    it('accurately detects fully prepped and dispatched pullsheets', () => {
      const items: PullsheetItem[] = [
        { id: '1', quantity: 4, description: 'K2 Speaker', type: 'item', status: 'prepped_scanned' },
        { id: '2', quantity: 2, description: 'KS28 Sub', type: 'item', status: 'dispatched' },
      ];

      const progress = calculatePullsheetProgress(items);
      expect(progress.totalQuantity).toBe(6);
      expect(progress.percentPrepped).toBe(100);
      expect(progress.isFullyPrepped).toBe(true);
      expect(progress.percentDispatched).toBe(33); // 2 / 6 = 33%
      expect(progress.isFullyDispatched).toBe(false);
    });
  });

  describe('groupPullsheetBySections', () => {
    it('groups items under their corresponding section headers', () => {
      const items: PullsheetItem[] = [
        { id: 'sec-1', quantity: 0, description: 'FOH Audio', type: 'section-header', status: 'none' },
        { id: 'item-1', quantity: 2, description: 'DiGiCo SD12', type: 'item', status: 'confirmed' },
        { id: 'sec-2', quantity: 0, description: 'Lighting Rig', type: 'section-header', status: 'none' },
        { id: 'item-2', quantity: 4, description: 'Robe BMFL', type: 'item', status: 'pending' },
      ];

      const sections = groupPullsheetBySections(items);
      expect(sections.length).toBe(2);
      expect(sections[0].title).toBe('FOH Audio');
      expect(sections[0].items.length).toBe(1);
      expect(sections[0].items[0].id).toBe('item-1');

      expect(sections[1].title).toBe('Lighting Rig');
      expect(sections[1].items.length).toBe(1);
      expect(sections[1].items[0].id).toBe('item-2');
    });

    it('creates default General Equipment section if no leading header exists', () => {
      const items: PullsheetItem[] = [
        { id: 'item-1', quantity: 1, description: 'Work Light', type: 'item', status: 'pending' },
      ];

      const sections = groupPullsheetBySections(items);
      expect(sections.length).toBe(1);
      expect(sections[0].title).toBe('General Equipment');
      expect(sections[0].items.length).toBe(1);
    });

    it('strictly excludes service items from grouped sections', () => {
      const items: any[] = [
        { id: 'item-1', quantity: 1, description: 'Mixer', type: 'item', status: 'pending' },
        { id: 'svc-1', quantity: 1, description: 'Sound Engineer (8 hrs)', type: 'service', status: 'none' },
      ];

      const sections = groupPullsheetBySections(items);
      expect(sections[0].items.length).toBe(1);
      expect(sections[0].items[0].id).toBe('item-1');
    });
  });
});
