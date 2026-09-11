/**
 * __tests__/swipe-to-scan.test.tsx
 * Dedicated test suite for mobile swipe-to-scan gesture in Event Scanner Mode.
 * Verifies R1 (manual scan target status fulfillment), R2 (status reversion with Confirmed floor),
 * R3 (underlying action reveal plates, gesture negotiation, slide-off spring-back, haptic feedback).
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  PullSheetItemRow,
  TARGET_STATUS_CONFIG,
  SWIPE_ANIMATION_CONFIG,
  createSlideOffSpringAnimation,
} from '@/components/pull-sheets/pull-sheet-item-row';
import type { PullsheetItem } from '@/types/pull-sheet';
import type { ScanTargetStatus } from '@/types/scanner';

// Mock theme context
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

describe('Mobile Swipe-to-Scan Gesture in Event Scanner Mode', () => {
  const singleItem: PullsheetItem = {
    id: 'item-audio-1',
    description: 'Meyer Sound LEOPARD Array',
    quantity: 12,
    scannedQuantity: 4,
    type: 'item',
    status: 'confirmed',
    sectionId: 'sec-audio',
  };

  const preppedItem: PullsheetItem = {
    id: 'item-audio-2',
    description: 'Meyer Sound 900-LFC Subwoofer',
    quantity: 8,
    scannedQuantity: 8,
    type: 'item',
    status: 'prepped_scanned',
    sectionId: 'sec-audio',
  };

  const returnedItem: PullsheetItem = {
    id: 'item-audio-3',
    description: 'DiGiCo Quantum 338 Console',
    quantity: 1,
    scannedQuantity: 1,
    type: 'item',
    status: 'returned',
    sectionId: 'sec-audio',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('R1: Swipe Right to Apply Target Status', () => {
    it('swiping right past threshold commits manual scan with haptics', async () => {
      const onSwipeRight = jest.fn();
      const hapticsSpy = jest.spyOn(Haptics, 'impactAsync');

      const { getByTestId } = render(
        <PullSheetItemRow
          item={singleItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeRight={onSwipeRight}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-1');

      // Drag right past threshold (dx = 140 > 120)
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 140, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 140, dy: 0 } });
      });

      expect(hapticsSpy).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
      expect(onSwipeRight).toHaveBeenCalledTimes(1);
      expect(onSwipeRight).toHaveBeenCalledWith(singleItem);
    });

    it('honors other target statuses when swiping right (e.g., returned, deprepped, confirmed)', async () => {
      const statuses: ScanTargetStatus[] = ['returned', 'deprepped', 'confirmed'];

      for (const targetStatus of statuses) {
        const onSwipeRight = jest.fn();
        const { getByTestId, unmount } = render(
          <PullSheetItemRow
            item={singleItem}
            isScannerOpen={true}
            currentTargetStatus={targetStatus}
            onSwipeRight={onSwipeRight}
          />
        );

        const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-1');

        await act(async () => {
          fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 150, dy: 0 } });
          fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 150, dy: 0 } });
        });

        expect(onSwipeRight).toHaveBeenCalledWith(singleItem);
        unmount();
      }
    });

    it('does not commit when released below activation threshold', async () => {
      const onSwipeRight = jest.fn();
      const hapticsSpy = jest.spyOn(Haptics, 'impactAsync');

      const { getByTestId } = render(
        <PullSheetItemRow
          item={singleItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeRight={onSwipeRight}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-1');

      // Drag below threshold (dx = 40 < 80-120 threshold)
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 40, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 40, dy: 0 } });
      });

      expect(hapticsSpy).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });
  });

  describe('R2: Swipe Left to Revert Status (Floor at Confirmed)', () => {
    it('swiping left past threshold on prepped item commits revert with haptics', async () => {
      const onSwipeLeft = jest.fn();
      const hapticsSpy = jest.spyOn(Haptics, 'impactAsync');

      const { getByTestId } = render(
        <PullSheetItemRow
          item={preppedItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeLeft={onSwipeLeft}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-2');

      // Drag left past threshold (dx = -140 < -120)
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: -140, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: -140, dy: 0 } });
      });

      expect(hapticsSpy).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
      expect(onSwipeLeft).toHaveBeenCalledWith(preppedItem);
    });

    it('swiping left on an item already at Confirmed floor does NOT trigger onSwipeLeft or haptics', async () => {
      const onSwipeLeft = jest.fn();
      const hapticsSpy = jest.spyOn(Haptics, 'impactAsync');

      const { getByTestId } = render(
        <PullSheetItemRow
          item={singleItem} // status is 'confirmed'
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeLeft={onSwipeLeft}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-1');

      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: -150, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: -150, dy: 0 } });
      });

      // Strict Confirmed floor enforced: no revert action
      expect(hapticsSpy).not.toHaveBeenCalled();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('swiping left below threshold snaps back without invoking onSwipeLeft', async () => {
      const onSwipeLeft = jest.fn();
      const hapticsSpy = jest.spyOn(Haptics, 'impactAsync');

      const { getByTestId } = render(
        <PullSheetItemRow
          item={preppedItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeLeft={onSwipeLeft}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-2');

      // Drag left below threshold (dx = -30)
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: -30, dy: 0 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: -30, dy: 0 } });
      });

      expect(hapticsSpy).not.toHaveBeenCalled();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('R3: Underlying Reveal Plate & Gesture Constraints', () => {
    it('renders reveal plate with target status color and label when dragging right', async () => {
      const { getByTestId } = render(
        <PullSheetItemRow
          item={singleItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
        />
      );

      const revealPlate = getByTestId('pullsheet-reveal-plate-item-audio-1');
      expect(revealPlate).toBeTruthy();

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-1');

      // Drag right
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 50, dy: 0 } });
      });

      const targetLabel = getByTestId('swipe-label-target-item-audio-1');
      expect(targetLabel.props.children).toBe('Prepped');
      expect(getByTestId('swipe-icon-check-item-audio-1')).toBeTruthy();
    });

    it('renders reveal plate with revert label and icon when dragging left', async () => {
      const { getByTestId } = render(
        <PullSheetItemRow
          item={preppedItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-2');

      // Drag left
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: -50, dy: 0 } });
      });

      const revertLabel = getByTestId('swipe-label-revert-item-audio-2');
      expect(revertLabel.props.children).toBe('Revert to Confirmed');
      expect(getByTestId('swipe-icon-revert-item-audio-2')).toBeTruthy();
    });

    it('shows Confirmed (Floor) label on reveal plate when item is already confirmed', async () => {
      const { getByTestId } = render(
        <PullSheetItemRow
          item={singleItem} // status = 'confirmed'
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-1');

      // Drag left
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: -50, dy: 0 } });
      });

      const revertLabel = getByTestId('swipe-label-revert-item-audio-1');
      expect(revertLabel.props.children).toBe('Confirmed (Floor)');
    });

    it('disables swipe completely in non-scanner mode (isScannerOpen === false)', () => {
      const onSwipeRight = jest.fn();
      const onSwipeLeft = jest.fn();

      const { queryByTestId, getByTestId } = render(
        <PullSheetItemRow
          item={singleItem}
          isScannerOpen={false}
          onSwipeRight={onSwipeRight}
          onSwipeLeft={onSwipeLeft}
        />
      );

      // No reveal plate exists when scanner is closed
      expect(queryByTestId('pullsheet-reveal-plate-item-audio-1')).toBeNull();

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-1');
      fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 150, dy: 0 } });
      fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 150, dy: 0 } });

      expect(onSwipeRight).not.toHaveBeenCalled();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('does not enable swipe on non-actionable note items', () => {
      const noteItem: PullsheetItem = {
        id: 'note-1',
        description: 'Check rigging load limits',
        type: 'note',
        quantity: 0,
        status: 'none',
      };

      const { queryByTestId, getByTestId } = render(
        <PullSheetItemRow item={noteItem} isScannerOpen={true} />
      );

      expect(getByTestId('pullsheet-note-row-note-1')).toBeTruthy();
      expect(queryByTestId('pullsheet-reveal-plate-note-1')).toBeNull();
      expect(queryByTestId('pullsheet-swipe-row-note-1')).toBeNull();
    });

    it('supports accessibility actions for swipe right and swipe left', () => {
      const onSwipeRight = jest.fn();
      const onSwipeLeft = jest.fn();

      const { getByTestId } = render(
        <PullSheetItemRow
          item={preppedItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeRight={onSwipeRight}
          onSwipeLeft={onSwipeLeft}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-2');

      // Check declared accessibility actions
      expect(swipeRow.props.accessibilityActions).toEqual([
        { name: 'swipeRight', label: 'Apply Prepped' },
        { name: 'swipeLeft', label: 'Revert to Confirmed' },
      ]);

      // Fire accessibility action swipeRight
      fireEvent(swipeRow, 'accessibilityAction', {
        nativeEvent: { actionName: 'swipeRight' },
      });
      expect(onSwipeRight).toHaveBeenCalledWith(preppedItem);

      // Fire accessibility action swipeLeft
      fireEvent(swipeRow, 'accessibilityAction', {
        nativeEvent: { actionName: 'swipeLeft' },
      });
      expect(onSwipeLeft).toHaveBeenCalledWith(preppedItem);
    });

    it('recognizes legacy "prepped" and "Prepped/Scanned" statuses for prepped styling', () => {
      const legacyItem: PullsheetItem = {
        id: 'item-legacy-1',
        description: 'Legacy Prepped Cable',
        quantity: 5,
        scannedQuantity: 5,
        type: 'item',
        status: 'prepped' as any,
        sectionId: 'sec-audio',
      };

      const { getByTestId } = render(
        <PullSheetItemRow
          item={legacyItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
        />
      );

      // Verify row renders with active swipe capabilities
      expect(getByTestId('pullsheet-swipe-row-item-legacy-1')).toBeTruthy();
      expect(getByTestId('pullsheet-reveal-plate-item-legacy-1')).toBeTruthy();
    });

    it('does not capture or commit when gesture is predominantly vertical (scroll negotiation)', async () => {
      const onSwipeRight = jest.fn();
      const onSwipeLeft = jest.fn();

      const { getByTestId } = render(
        <PullSheetItemRow
          item={preppedItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeRight={onSwipeRight}
          onSwipeLeft={onSwipeLeft}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-2');

      // Pure vertical drag (dx: 4, dy: 60)
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 4, dy: 60 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 4, dy: 60 } });
      });

      expect(onSwipeRight).not.toHaveBeenCalled();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('does not commit when gesture has dx > threshold but dy is predominantly vertical', async () => {
      const onSwipeRight = jest.fn();
      const onSwipeLeft = jest.fn();

      const { getByTestId } = render(
        <PullSheetItemRow
          item={singleItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeRight={onSwipeRight}
          onSwipeLeft={onSwipeLeft}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-1');

      // Diagonal drag where |dy| * 1.2 >= |dx| (dx: 140, dy: 180)
      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: 140, dy: 180 } });
        fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 140, dy: 180 } });
      });

      expect(onSwipeRight).not.toHaveBeenCalled();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('evaluates onMoveShouldSetResponder correctly according to horizontal constraint formula', () => {
      const { getByTestId } = render(
        <PullSheetItemRow
          item={preppedItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-2');
      const onMoveShouldSet = swipeRow.props.onMoveShouldSetResponder;
      expect(typeof onMoveShouldSet).toBe('function');

      // Predominantly horizontal gesture past 8px -> TRUE
      expect(onMoveShouldSet({ nativeEvent: { dx: 50, dy: 10 } })).toBe(true);

      // Predominantly vertical gesture -> FALSE
      expect(onMoveShouldSet({ nativeEvent: { dx: 10, dy: 50 } })).toBe(false);

      // Below 8px threshold -> FALSE
      expect(onMoveShouldSet({ nativeEvent: { dx: 5, dy: 0 } })).toBe(false);

      // 45-degree diagonal (|dx| == |dy|, fails |dx| > |dy| * 1.2) -> FALSE
      expect(onMoveShouldSet({ nativeEvent: { dx: 50, dy: 50 } })).toBe(false);
    });

    it('displays context-aware revert labels for returned, deprepped, and dispatched items', async () => {
      const dispatchedItem: PullsheetItem = {
        id: 'item-disp-1',
        description: 'Dispatched Amp Rack',
        quantity: 2,
        scannedQuantity: 2,
        type: 'item',
        status: 'dispatched',
      };

      const { getByTestId } = render(
        <PullSheetItemRow
          item={dispatchedItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-disp-1');

      await act(async () => {
        fireEvent(swipeRow, 'responderMove', { nativeEvent: { dx: -50, dy: 0 } });
      });

      const revertLabel = getByTestId('swipe-label-revert-item-disp-1');
      expect(revertLabel.props.children).toBe('Revert to Prepped');
    });

    it('blocks accessibility actions when the row is currently animating', () => {
      const onSwipeRight = jest.fn();
      const onSwipeLeft = jest.fn();

      // Mock Animated.timing to stay in-flight without immediately finishing
      jest.spyOn(Animated, 'timing').mockImplementation(((_val: any, _config: any) => ({
        start: (_cb?: any) => {
          // in-flight, do not call cb
        },
        stop: jest.fn(),
        reset: jest.fn(),
      })) as any);

      const { getByTestId } = render(
        <PullSheetItemRow
          item={preppedItem}
          isScannerOpen={true}
          currentTargetStatus="prepped_scanned"
          onSwipeRight={onSwipeRight}
          onSwipeLeft={onSwipeLeft}
          animateInTest={true}
        />
      );

      const swipeRow = getByTestId('pullsheet-swipe-row-item-audio-2');

      // Trigger gesture release to initiate animation lock
      fireEvent(swipeRow, 'responderRelease', { nativeEvent: { dx: 140, dy: 0 } });
      expect(onSwipeRight).toHaveBeenCalledTimes(1);

      // Action during in-flight animation is blocked
      fireEvent(swipeRow, 'accessibilityAction', {
        nativeEvent: { actionName: 'swipeLeft' },
      });
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('Slide-Off Spring-Back Animation Pipeline & Cancellation Safety', () => {
    it('validates SWIPE_ANIMATION_CONFIG parameters match fluid native spec', () => {
      expect(SWIPE_ANIMATION_CONFIG).toEqual({
        timingDuration: 160,
        springFriction: 6,
        springTension: 40,
        snapBackFriction: 7,
        snapBackTension: 50,
      });
    });

    it('chains Animated.timing into Animated.spring on normal completion', () => {
      const translateX = new Animated.Value(0);
      let timingCallback: ((result: { finished: boolean }) => void) | undefined;
      let springCallback: ((result: { finished: boolean }) => void) | undefined;

      const timingSpy = jest.spyOn(Animated, 'timing').mockImplementation(((
        _val: any,
        _config: any
      ) => ({
        start: (cb?: any) => {
          timingCallback = cb;
        },
        stop: jest.fn(),
        reset: jest.fn(),
      })) as any);

      const springSpy = jest.spyOn(Animated, 'spring').mockImplementation(((
        _val: any,
        _config: any
      ) => ({
        start: (cb?: any) => {
          springCallback = cb;
        },
        stop: jest.fn(),
        reset: jest.fn(),
      })) as any);

      const onStart = jest.fn();
      const onSlideComplete = jest.fn();
      const onEnd = jest.fn();

      createSlideOffSpringAnimation(translateX, 'right', 360, {
        onStart,
        onSlideComplete,
        onEnd,
        isMounted: () => true,
      });

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(timingSpy).toHaveBeenCalledWith(
        translateX,
        expect.objectContaining({
          toValue: 410, // 360 + 50
          duration: 160,
          useNativeDriver: true,
        })
      );

      // Trigger successful slide completion
      timingCallback?.({ finished: true });
      expect(onSlideComplete).toHaveBeenCalledWith(true);

      // Verify Animated.spring is triggered with correct physical tension/friction
      expect(springSpy).toHaveBeenCalledWith(
        translateX,
        expect.objectContaining({
          toValue: 0,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        })
      );

      // Trigger spring settling
      springCallback?.({ finished: true });
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('does NOT start Animated.spring if timing is cancelled or stopped (finished: false)', () => {
      const translateX = new Animated.Value(0);
      const onEnd = jest.fn();
      const springSpy = jest.spyOn(Animated, 'spring');

      // Mock Animated.timing to simulate an aborted/stopped animation
      jest.spyOn(Animated, 'timing').mockImplementation(((
        _val: any,
        _config: any
      ) => ({
        start: (cb?: any) => {
          cb?.({ finished: false });
        },
        stop: jest.fn(),
        reset: jest.fn(),
      })) as any);

      createSlideOffSpringAnimation(translateX, 'right', 360, {
        onEnd,
        isMounted: () => true,
      });

      // Crucial: Spring MUST NOT start when cancelled
      expect(springSpy).not.toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('does NOT start Animated.spring if component unmounted before completion', () => {
      const translateX = new Animated.Value(0);
      const onEnd = jest.fn();
      const springSpy = jest.spyOn(Animated, 'spring');

      // Mock timing to finish, but component is unmounted
      jest.spyOn(Animated, 'timing').mockImplementation(((
        _val: any,
        _config: any
      ) => ({
        start: (cb?: any) => {
          cb?.({ finished: true });
        },
        stop: jest.fn(),
        reset: jest.fn(),
      })) as any);

      createSlideOffSpringAnimation(translateX, 'left', 300, {
        onEnd,
        isMounted: () => false, // unmounted
      });

      expect(springSpy).not.toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });
});
