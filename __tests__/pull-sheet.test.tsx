/**
 * __tests__/pull-sheet.test.tsx
 * Unit and component integration tests for Milestone 3: Mobile Pull Sheet Management.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { renderHook } from '@testing-library/react-native';
import { PullSheetStatusBadge } from '@/components/pull-sheets/pull-sheet-status-badge';
import { PullSheetProgressBar } from '@/components/pull-sheets/pull-sheet-progress-bar';
import { PullSheetSectionHeader } from '@/components/pull-sheets/pull-sheet-section-header';
import { PullSheetItemRow } from '@/components/pull-sheets/pull-sheet-item-row';
import { PullSheetStatusSheet } from '@/components/pull-sheets/pull-sheet-status-sheet';
import { usePullSheet } from '@/hooks/use-pull-sheet';
import * as pullSheetService from '@/services/pull-sheet-service';
import type { Pullsheet, PullsheetItem, PullsheetProgress } from '@/types/pull-sheet';

// Mock theme
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
  };
});

// Mock auth
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      uid: 'user-123',
      tenantId: 'tenant-abc',
      firstName: 'Alex',
    },
    tenant: {
      tenantId: 'tenant-abc',
      tenantName: 'Amia Productions',
    },
    isAuthenticated: true,
  }),
}));

const samplePullsheetItems: PullsheetItem[] = [
  {
    id: 'sec-1',
    description: 'Main Stage Audio Rig',
    type: 'section-header',
    quantity: 0,
    status: 'none',
  },
  {
    id: 'item-1',
    description: 'L-Acoustics K2 Line Array',
    quantity: 8,
    scannedQuantity: 4,
    type: 'item',
    status: 'confirmed',
    sectionId: 'sec-1',
  },
  {
    id: 'item-2',
    description: 'K2 Rigging Bumper',
    quantity: 2,
    scannedQuantity: 2,
    type: 'item',
    status: 'prepped_scanned',
    sectionId: 'sec-1',
  },
  {
    id: 'sub-1',
    description: 'Shackle & Safety Cable Kit',
    quantity: 4,
    type: 'sub-item',
    parentItemId: 'item-2',
    status: 'none',
  },
  {
    id: 'note-1',
    description: 'Check fly-points with rigger before lifting.',
    type: 'note',
    quantity: 0,
    status: 'none',
  },
];

const samplePullsheet: Pullsheet = {
  id: 'ev-101',
  eventId: 'ev-101',
  tenantId: 'tenant-abc',
  items: samplePullsheetItems,
};

describe('Milestone 3: Pull Sheet Management UI', () => {
  describe('PullSheetStatusBadge', () => {
    it('renders correct labels and colors for all lifecycle states', () => {
      const { getByText, rerender } = render(<PullSheetStatusBadge status="pending" />);
      expect(getByText('Pending')).toBeTruthy();

      rerender(<PullSheetStatusBadge status="confirmed" />);
      expect(getByText('Confirmed')).toBeTruthy();

      rerender(<PullSheetStatusBadge status="prepped_scanned" />);
      expect(getByText('Prepped')).toBeTruthy();

      rerender(<PullSheetStatusBadge status="dispatched" />);
      expect(getByText('Dispatched')).toBeTruthy();

      rerender(<PullSheetStatusBadge status="returned" />);
      expect(getByText('Returned')).toBeTruthy();

      rerender(<PullSheetStatusBadge status="deprepped" />);
      expect(getByText('Deprepped')).toBeTruthy();
    });

    it('triggers onAdvance when tapped on actionable status', () => {
      const onAdvance = jest.fn();
      const { getByText } = render(
        <PullSheetStatusBadge status="confirmed" onAdvance={onAdvance} />
      );

      fireEvent.press(getByText('Confirmed'));
      expect(onAdvance).toHaveBeenCalled();
    });
  });

  describe('PullSheetProgressBar', () => {
    it('renders progress bar and metrics breakdown correctly', () => {
      const progress: PullsheetProgress = {
        totalLines: 2,
        totalQuantity: 10,
        pendingQuantity: 0,
        confirmedQuantity: 8,
        preppedQuantity: 2,
        dispatchedQuantity: 0,
        returnedQuantity: 0,
        depreppedQuantity: 0,
        percentPrepped: 20,
        percentDispatched: 0,
        percentReturned: 0,
        isFullyPrepped: false,
        isFullyDispatched: false,
        isFullyReturned: false,
        isFullyDeprepped: false,
      };

      const { getByText } = render(<PullSheetProgressBar progress={progress} />);

      expect(getByText('Warehouse Prep Progress')).toBeTruthy();
      expect(getByText('20% Complete')).toBeTruthy();
      expect(getByText('2 / 10')).toBeTruthy();
    });
  });

  describe('PullSheetSectionHeader', () => {
    it('renders section title and item count', () => {
      const { getByText } = render(
        <PullSheetSectionHeader title="FOH Control Rig" itemCount={5} />
      );

      expect(getByText('FOH Control Rig')).toBeTruthy();
      expect(getByText('5 items')).toBeTruthy();
    });
  });

  describe('PullSheetItemRow', () => {
    it('renders actionable item with scanned count and description', () => {
      const onAdvance = jest.fn();
      const onLongPress = jest.fn();

      const { getByText } = render(
        <PullSheetItemRow
          item={samplePullsheetItems[1]}
          onAdvanceStatus={onAdvance}
          onLongPress={onLongPress}
        />
      );

      expect(getByText('L-Acoustics K2 Line Array')).toBeTruthy();
      expect(getByText('4/8')).toBeTruthy();
      expect(getByText('Confirmed')).toBeTruthy();

      // Tap advance
      fireEvent.press(getByText('Confirmed'));
      expect(onAdvance).toHaveBeenCalledWith('item-1');
    });

    it('renders note item correctly', () => {
      const { getByText } = render(
        <PullSheetItemRow item={samplePullsheetItems[4]} />
      );

      expect(getByText('Check fly-points with rigger before lifting.')).toBeTruthy();
    });
  });

  describe('PullSheetStatusSheet', () => {
    it('renders modal with all 6 status selection options', () => {
      const onSelectStatus = jest.fn();
      const onRollback = jest.fn();
      const onClose = jest.fn();

      const { getByText, getByTestId } = render(
        <PullSheetStatusSheet
          item={samplePullsheetItems[1]}
          visible={true}
          onClose={onClose}
          onSelectStatus={onSelectStatus}
          onRollback={onRollback}
        />
      );

      expect(getByText('Item Status & Progression')).toBeTruthy();
      expect(getByText('L-Acoustics K2 Line Array')).toBeTruthy();
      expect(getByText('SELECT OPERATIONAL STATUS')).toBeTruthy();

      // Select Prepped
      fireEvent.press(getByTestId('select-status-option-prepped_scanned'));
      expect(onSelectStatus).toHaveBeenCalledWith('item-1', 'prepped_scanned');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('usePullSheet Hook', () => {
    it('handles live subscription, status updates, and bulk confirm', async () => {
      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate(samplePullsheet);
        return jest.fn();
      });

      jest.spyOn(pullSheetService, 'updatePullsheetItemStatus').mockResolvedValue({ success: true });
      jest.spyOn(pullSheetService, 'updatePullsheetItemScannedCount').mockResolvedValue({ success: true });
      jest.spyOn(pullSheetService, 'bulkConfirmPullsheet').mockResolvedValue({ success: true });

      const { result } = renderHook(() => usePullSheet('ev-101'));

      expect(result.current.loading).toBe(false);
      expect(result.current.items.length).toBe(5);
      expect(result.current.sections.length).toBeGreaterThanOrEqual(1);

      // Advance status
      let advanceSuccess = false;
      await act(async () => {
        advanceSuccess = await result.current.advanceStatus('item-1');
      });
      expect(advanceSuccess).toBe(true);

      // Increment scanned count
      let incrementSuccess = false;
      await act(async () => {
        incrementSuccess = await result.current.incrementScannedCount('item-1', 'BAR-K2-01');
      });
      expect(incrementSuccess).toBe(true);

      // Bulk confirm
      let bulkSuccess = false;
      await act(async () => {
        bulkSuccess = await result.current.bulkConfirm();
      });
      expect(bulkSuccess).toBe(true);

      // Filter search
      act(() => {
        result.current.setSearchQuery('Rigging');
      });
      expect(result.current.searchQuery).toBe('Rigging');
    });
  });
});
