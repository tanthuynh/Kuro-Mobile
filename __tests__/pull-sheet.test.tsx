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

  describe('PullSheetItemRow Notes', () => {
    it('renders internal note directly without "Note: " prefix', () => {
      const itemWithNote: PullsheetItem = {
        id: 'item-note-test',
        description: 'Microphone Stand Heavy Base',
        quantity: 4,
        type: 'item',
        status: 'confirmed',
        internalNote: 'Inspect rubber feet before loading',
      };
      const { getByText, queryByText } = render(<PullSheetItemRow item={itemWithNote} />);
      expect(getByText('Inspect rubber feet before loading')).toBeTruthy();
      expect(queryByText(/Note:/i)).toBeNull();
    });
  });

  describe('Unified Event Details & Pull Sheet Screen', () => {
    it('renders unified event details screen with compact logistics and start scanning button', () => {
      const mockPush = jest.fn();
      const expoRouter = require('expo-router');
      expoRouter.useRouter = () => ({
        push: mockPush,
        replace: jest.fn(),
        back: jest.fn(),
      });
      expoRouter.useLocalSearchParams = () => ({ id: 'ev-101' });

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate(samplePullsheet);
        return jest.fn();
      });

      const eventService = require('@/services/event-service');
      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((id: any, tenantId: any, onData: any) => {
        onData({
          id: 'ev-101',
          tenantId: 'tenant-abc',
          eventName: 'Neon Horizon Music Festival',
          eventNumber: 1042,
          eventStatusId: 'Confirmed',
          clientId: 'LiveNation APAC',
          venueId: 'Sydney Showground Hall 5',
          startTime: new Date('2026-08-25T08:00:00.000Z'),
          finishTime: new Date('2026-08-25T10:00:00.000Z'),
        });
        return jest.fn();
      });

      const EventDetailsScreen = require('../app/events/[id]').default;
      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Event Details Header & Status
      expect(getByText('Neon Horizon Music Festival')).toBeTruthy();
      expect(getByText('[1042]')).toBeTruthy();

      // Compact Schedule & Logistics Card
      expect(getByTestId('event-client-venue-card')).toBeTruthy();
      expect(getByText('PLANNING')).toBeTruthy();

      // Equipment Section
      expect(getByText('Equipment Pull Sheet')).toBeTruthy();
      expect(getByTestId('pullsheet-progress-card')).toBeTruthy();
      expect(getByText('Main Stage Audio Rig')).toBeTruthy();
      expect(getByText('L-Acoustics K2 Line Array')).toBeTruthy();

      // Sticky Bottom Action Bar
      const scannerBtn = getByTestId('start-scanning-btn');
      expect(scannerBtn).toBeTruthy();
      expect(getByText('Start Scanning')).toBeTruthy();

      // Tap Start Scanning expands in-sheet scanner
      fireEvent.press(scannerBtn);
      expect(getByTestId('scanner-expandable-sheet')).toBeTruthy();

      // Child sub-item (Shackle & Safety Cable Kit) belonging to active prepped parent (K2 Rigging Bumper) is visible
      expect(getByText('K2 Rigging Bumper')).toBeTruthy();
      expect(getByText('Shackle & Safety Cable Kit')).toBeTruthy();
      expect(getByText('L-Acoustics K2 Line Array')).toBeTruthy();
    });

    it('hides child items when parent item status is pending or none in scanner mode', () => {
      const mockPush = jest.fn();
      const expoRouter = require('expo-router');
      expoRouter.useRouter = () => ({
        push: mockPush,
        replace: jest.fn(),
        back: jest.fn(),
      });
      expoRouter.useLocalSearchParams = () => ({ id: 'ev-101' });

      const pendingParentPullsheet: Pullsheet = {
        id: 'ev-101',
        eventId: 'ev-101',
        tenantId: 'tenant-abc',
        items: [
          {
            id: 'sec-1',
            description: 'Staging & Rigging',
            type: 'section-header',
            quantity: 0,
            status: 'none',
          },
          {
            id: 'item-pend-parent',
            description: 'Motor Hoist Distro Box',
            quantity: 1,
            type: 'item',
            status: 'pending',
            sectionId: 'sec-1',
          },
          {
            id: 'sub-pend-child',
            description: 'Pendant Remote Controller',
            quantity: 1,
            type: 'sub-item',
            parentItemId: 'item-pend-parent',
            status: 'none',
            sectionId: 'sec-1',
          },
          {
            id: 'item-conf-standalone',
            description: 'Steel Cable Choker',
            quantity: 4,
            type: 'item',
            status: 'confirmed',
            sectionId: 'sec-1',
          },
        ],
      };

      jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, onUpdate) => {
        onUpdate(pendingParentPullsheet);
        return jest.fn();
      });

      const eventService = require('@/services/event-service');
      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((id: any, tenantId: any, onData: any) => {
        onData({
          id: 'ev-101',
          tenantId: 'tenant-abc',
          eventName: 'Neon Horizon Music Festival',
          eventNumber: 1042,
          eventStatusId: 'Confirmed',
          clientId: 'LiveNation APAC',
          venueId: 'Sydney Showground Hall 5',
          startTime: new Date('2026-08-25T08:00:00.000Z'),
          finishTime: new Date('2026-08-25T10:00:00.000Z'),
        });
        return jest.fn();
      });

      const EventDetailsScreen = require('../app/events/[id]').default;
      const { getByText, getByTestId, queryByText } = render(<EventDetailsScreen />);

      // In regular mode: all items are visible
      expect(getByText('Motor Hoist Distro Box')).toBeTruthy();
      expect(getByText('Pendant Remote Controller')).toBeTruthy();
      expect(getByText('Steel Cable Choker')).toBeTruthy();

      // Enter scanner mode
      fireEvent.press(getByTestId('start-scanning-btn'));

      // Both pending parent and its child are hidden
      expect(queryByText('Motor Hoist Distro Box')).toBeNull();
      expect(queryByText('Pendant Remote Controller')).toBeNull();

      // Standalone confirmed item remains visible
      expect(getByText('Steel Cable Choker')).toBeTruthy();
    });
  });
});
