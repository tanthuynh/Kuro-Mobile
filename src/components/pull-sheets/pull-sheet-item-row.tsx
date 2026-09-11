/**
 * src/components/pull-sheets/pull-sheet-item-row.tsx
 * Actionable Pull Sheet line item row for Kuro Mobile.
 * Displays quantity counters, description, note callouts, tap-to-advance status badge,
 * and expandable swipe-to-scan gesture with reveal plate and slide-off spring-back animation.
 */

import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
} from 'react-native';
import {
  Info,
  CornerDownRight,
  CheckCircle2,
  Check,
  RotateCcw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/theme-context';
import { PullSheetStatusBadge } from './pull-sheet-status-badge';
import {
  isActionablePullsheetItem,
  normalizePullsheetStatus,
  getPreviousPullsheetStatus,
  STATUS_DISPLAY_CONFIG,
} from '@/lib/pull-sheet-engine';
import type { PullsheetItem, PullsheetItemStatus } from '@/types/pull-sheet';
import type { ScanTargetStatus } from '@/types/scanner';

export const TARGET_STATUS_CONFIG: Record<
  ScanTargetStatus,
  { label: string; color: string }
> = {
  prepped_scanned: { label: 'Prepped', color: '#10B981' },
  confirmed: { label: 'Confirmed', color: '#3B82F6' },
  returned: { label: 'Returned', color: '#06B6D4' },
  deprepped: { label: 'Deprepped', color: '#F59E0B' },
};

export const SWIPE_ANIMATION_CONFIG = {
  timingDuration: 160,
  springFriction: 6,
  springTension: 40,
  snapBackFriction: 7,
  snapBackTension: 50,
};

export function createSlideOffSpringAnimation(
  translateX: Animated.Value,
  direction: 'right' | 'left',
  width: number,
  callbacks?: {
    onStart?: () => void;
    onSlideComplete?: (finished: boolean) => void;
    onEnd?: () => void;
    isMounted?: () => boolean;
  }
) {
  const slideOffDistance = (width || 360) + 50;
  const toValue = direction === 'right' ? slideOffDistance : -slideOffDistance;

  callbacks?.onStart?.();
  return Animated.timing(translateX, {
    toValue,
    duration: SWIPE_ANIMATION_CONFIG.timingDuration,
    useNativeDriver: true,
  }).start((result) => {
    callbacks?.onSlideComplete?.(Boolean(result?.finished));
    if (!result?.finished || (callbacks?.isMounted && !callbacks.isMounted())) {
      callbacks?.onEnd?.();
      return;
    }
    Animated.spring(translateX, {
      toValue: 0,
      friction: SWIPE_ANIMATION_CONFIG.springFriction,
      tension: SWIPE_ANIMATION_CONFIG.springTension,
      useNativeDriver: true,
    }).start(() => {
      callbacks?.onEnd?.();
    });
  });
}

export interface PullSheetItemRowProps {
  item: PullsheetItem;
  onAdvanceStatus?: (itemId: string) => void;
  onLongPress?: (item: PullsheetItem) => void;
  onPress?: (item: PullsheetItem) => void;
  testID?: string;
  isScannerOpen?: boolean;
  currentTargetStatus?: ScanTargetStatus;
  onSwipeRight?: (item: PullsheetItem) => void | Promise<void>;
  onSwipeLeft?: (item: PullsheetItem) => void | Promise<void>;
  animateInTest?: boolean;
}

export const PullSheetItemRow: React.FC<PullSheetItemRowProps> = ({
  item,
  onAdvanceStatus,
  onLongPress,
  onPress,
  testID,
  isScannerOpen = false,
  currentTargetStatus = 'prepped_scanned',
  onSwipeRight,
  onSwipeLeft,
  animateInTest = false,
}) => {
  const { colors, typography, spacing, layout } = useTheme();

  const isActionable = isActionablePullsheetItem(item);
  const isSubItem = item.type === 'sub-item';
  const isNote = item.type === 'note';

  const targetQty = Math.max(1, item.quantity || 1);
  const scannedQty = item.scannedQuantity;
  const currentStatus = normalizePullsheetStatus(item.status);
  const isPrepped = currentStatus === 'prepped_scanned';

  const hasPressAction = Boolean(onPress || (onAdvanceStatus && isActionable));
  const isMountedRef = useRef(true);
  const isAnimatingRef = useRef(false);

  const handleRowPress = () => {
    if (isAnimatingRef.current) return;
    if (onPress) onPress(item);
    else if (onAdvanceStatus && isActionable) onAdvanceStatus(item.id);
  };

  const handleLongPress = () => {
    if (isAnimatingRef.current) return;
    if (onLongPress && isActionable) {
      onLongPress(item);
    }
  };

  // Floor at confirmed check
  const isAtConfirmedFloor =
    currentStatus === 'confirmed' || currentStatus === 'pending' || currentStatus === 'none';

  const isSwipeEnabled = Boolean(isScannerOpen && isActionable);

  const targetConfig =
    TARGET_STATUS_CONFIG[currentTargetStatus] || TARGET_STATUS_CONFIG.prepped_scanned;

  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isAnimatingRef.current = false;
      translateX.stopAnimation();
    };
  }, [translateX]);
  const [dragDirection, setDragDirection] = useState<'right' | 'left'>('right');
  const [rowWidth, setRowWidth] = useState<number>(360);

  const isSwipeEnabledRef = useRef(isSwipeEnabled);
  isSwipeEnabledRef.current = isSwipeEnabled;

  const currentTargetStatusRef = useRef(currentTargetStatus);
  currentTargetStatusRef.current = currentTargetStatus;

  const itemRef = useRef(item);
  itemRef.current = item;

  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeRightRef.current = onSwipeRight;

  const onSwipeLeftRef = useRef(onSwipeLeft);
  onSwipeLeftRef.current = onSwipeLeft;

  const isAtConfirmedFloorRef = useRef(isAtConfirmedFloor);
  isAtConfirmedFloorRef.current = isAtConfirmedFloor;

  const rowWidthRef = useRef(rowWidth);
  rowWidthRef.current = rowWidth;

  const dragDirectionRef = useRef(dragDirection);
  dragDirectionRef.current = dragDirection;

  const startSlideOffAnimation = useCallback(
    (direction: 'right' | 'left', onComplete?: () => void) => {
      createSlideOffSpringAnimation(
        translateX,
        direction,
        rowWidthRef.current || 360,
        {
          onStart: () => {
            isAnimatingRef.current = true;
          },
          onEnd: () => {
            if (isMountedRef.current) {
              isAnimatingRef.current = false;
            }
            onComplete?.();
          },
          isMounted: () => isMountedRef.current,
        }
      );
    },
    [translateX]
  );

  const startSnapBackAnimation = useCallback(() => {
    isAnimatingRef.current = true;
    Animated.spring(translateX, {
      toValue: 0,
      friction: SWIPE_ANIMATION_CONFIG.snapBackFriction,
      tension: SWIPE_ANIMATION_CONFIG.snapBackTension,
      useNativeDriver: true,
    }).start(() => {
      if (isMountedRef.current) {
        isAnimatingRef.current = false;
      }
    });
  }, [translateX]);

  const handleRelease = useCallback(
    (dx: number) => {
      if (isAnimatingRef.current) return;
      const width = rowWidthRef.current || 360;
      const threshold = Math.min(120, Math.max(80, width * 0.35));

      if (dx > threshold) {
        // SWIPE RIGHT: Trigger manual scan commit
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onSwipeRightRef.current?.(itemRef.current);

        if (process.env.NODE_ENV === 'test' && !animateInTest) {
          translateX.setValue(0);
          return;
        }

        startSlideOffAnimation('right');
      } else if (dx < -threshold) {
        // SWIPE LEFT: Revert status with floor at Confirmed
        if (isAtConfirmedFloorRef.current) {
          // Already at Confirmed floor: do not demote to pending or none
          if (process.env.NODE_ENV === 'test' && !animateInTest) {
            translateX.setValue(0);
            return;
          }
          startSnapBackAnimation();
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onSwipeLeftRef.current?.(itemRef.current);

          if (process.env.NODE_ENV === 'test' && !animateInTest) {
            translateX.setValue(0);
            return;
          }

          startSlideOffAnimation('left');
        }
      } else {
        // Released below threshold: snap back cleanly with no action
        if (process.env.NODE_ENV === 'test' && !animateInTest) {
          translateX.setValue(0);
          return;
        }
        startSnapBackAnimation();
      }
    },
    [startSlideOffAnimation, startSnapBackAnimation, translateX]
  );

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (!isSwipeEnabledRef.current || isAnimatingRef.current) return false;
        // In unit test runners (e.g. fireEvent in @testing-library/react-native),
        // isEventEnabled checks onMoveShouldSetResponder() without arguments.
        if (!evt && (!gestureState || (gestureState.dx === 0 && gestureState.dy === 0))) {
          return true;
        }
        const dx =
          gestureState && typeof gestureState.dx === 'number' && gestureState.dx !== 0
            ? gestureState.dx
            : (evt?.nativeEvent as any)?.dx ?? 0;
        const dy =
          gestureState && typeof gestureState.dy === 'number' && gestureState.dy !== 0
            ? gestureState.dy
            : (evt?.nativeEvent as any)?.dy ?? 0;
        return Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 8;
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (evt, gestureState) => {
        const dx =
          gestureState && typeof gestureState.dx === 'number' && gestureState.dx !== 0
            ? gestureState.dx
            : (evt?.nativeEvent as any)?.dx ?? 0;

        if (dx > 0) {
          if (dragDirectionRef.current !== 'right') {
            dragDirectionRef.current = 'right';
            setDragDirection('right');
          }
        } else if (dx < 0) {
          if (dragDirectionRef.current !== 'left') {
            dragDirectionRef.current = 'left';
            setDragDirection('left');
          }
        }
        translateX.setValue(dx);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const dx =
          gestureState && typeof gestureState.dx === 'number' && gestureState.dx !== 0
            ? gestureState.dx
            : (evt?.nativeEvent as any)?.dx ?? 0;
        handleRelease(dx);
      },
      onPanResponderTerminate: () => {
        if (process.env.NODE_ENV === 'test' && !animateInTest) {
          translateX.setValue(0);
          isAnimatingRef.current = false;
          return;
        }
        startSnapBackAnimation();
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [handleRelease, startSnapBackAnimation, translateX]);

  const panHandlers = useMemo(() => {
    const rawHandlers = panResponder.panHandlers;
    return {
      ...rawHandlers,
      onResponderMove: (evt: any) => {
        if (!evt?.touchHistory) {
          const dx = (evt?.nativeEvent as any)?.dx ?? 0;
          const dy = (evt?.nativeEvent as any)?.dy ?? 0;
          if (dy !== 0 && Math.abs(dx) <= Math.abs(dy) * 1.2) {
            return;
          }
          if (dx > 0) {
            if (dragDirectionRef.current !== 'right') {
              dragDirectionRef.current = 'right';
              setDragDirection('right');
            }
          } else if (dx < 0) {
            if (dragDirectionRef.current !== 'left') {
              dragDirectionRef.current = 'left';
              setDragDirection('left');
            }
          }
          translateX.setValue(dx);
          return;
        }
        rawHandlers.onResponderMove?.(evt);
      },
      onResponderRelease: (evt: any) => {
        if (!evt?.touchHistory) {
          const dx = (evt?.nativeEvent as any)?.dx ?? 0;
          const dy = (evt?.nativeEvent as any)?.dy ?? 0;
          if (dy !== 0 && Math.abs(dx) <= Math.abs(dy) * 1.2) {
            translateX.setValue(0);
            return;
          }
          handleRelease(dx);
          return;
        }
        rawHandlers.onResponderRelease?.(evt);
      },
    };
  }, [handleRelease, panResponder, translateX]);

  // If item is a note
  if (isNote) {
    return (
      <View
        testID={testID || `pullsheet-note-row-${item.id}`}
        style={[
          styles.noteContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: layout.borderRadius.md,
          },
        ]}
      >
        <Info size={16} color={colors.status.degraded} style={{ marginRight: 8, marginTop: 2 }} />
        <Text
          style={[
            styles.noteBodyText,
            { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
          ]}
        >
          {item.description || item.internalNote}
        </Text>
      </View>
    );
  }

  const revertBgColor = isAtConfirmedFloor ? '#475569' : '#D97706';
  const prevStatus = getPreviousPullsheetStatus(currentStatus);
  const prevConfig = STATUS_DISPLAY_CONFIG[prevStatus];
  const revertLabel = isAtConfirmedFloor
    ? 'Confirmed (Floor)'
    : currentStatus === 'prepped_scanned'
    ? 'Revert to Confirmed'
    : prevConfig?.label
    ? `Revert to ${prevConfig.label}`
    : 'Revert';

  return (
    <View
      style={[
        styles.outerContainer,
        { borderRadius: layout.borderRadius.md },
      ]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setRowWidth(w);
      }}
    >
      {/* Underlying Action Reveal Plate */}
      {isSwipeEnabled ? (
        <View
          testID={`pullsheet-reveal-plate-${item.id}`}
          style={[
            StyleSheet.absoluteFill,
            styles.revealPlate,
            {
              borderRadius: layout.borderRadius.md,
              backgroundColor: dragDirection === 'right' ? targetConfig.color : revertBgColor,
            },
          ]}
        >
          {/* Left Reveal Content (visible when dragging right) */}
          <View
            testID={`pullsheet-reveal-right-${item.id}`}
            style={[
              styles.revealSection,
              styles.revealLeft,
              { opacity: dragDirection === 'right' ? 1 : 0 },
            ]}
          >
            <View testID={`swipe-icon-check-${item.id}`}>
              <Check size={20} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <Text style={styles.revealText} testID={`swipe-label-target-${item.id}`}>
              {targetConfig.label}
            </Text>
          </View>

          {/* Right Reveal Content (visible when dragging left) */}
          <View
            testID={`pullsheet-reveal-left-${item.id}`}
            style={[
              styles.revealSection,
              styles.revealRight,
              { opacity: dragDirection === 'left' ? 1 : 0 },
            ]}
          >
            <Text style={styles.revealText} testID={`swipe-label-revert-${item.id}`}>
              {revertLabel}
            </Text>
            <View testID={`swipe-icon-revert-${item.id}`}>
              <RotateCcw size={20} color="#FFFFFF" strokeWidth={2.5} />
            </View>
          </View>
        </View>
      ) : null}

      {/* Top Moving Card */}
      <Animated.View
        testID={`pullsheet-swipe-row-${item.id}`}
        style={[
          styles.movingCard,
          isSwipeEnabled ? { transform: [{ translateX }] } : undefined,
        ]}
        {...(isSwipeEnabled ? panHandlers : {})}
        accessibilityActions={
          isSwipeEnabled
            ? [
                { name: 'swipeRight', label: `Apply ${targetConfig.label}` },
                { name: 'swipeLeft', label: revertLabel },
              ]
            : undefined
        }
        onAccessibilityAction={(e) => {
          if (!isSwipeEnabled || isAnimatingRef.current) return;
          if (e.nativeEvent.actionName === 'swipeRight') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onSwipeRightRef.current?.(itemRef.current);
          } else if (e.nativeEvent.actionName === 'swipeLeft') {
            if (!isAtConfirmedFloorRef.current) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onSwipeLeftRef.current?.(itemRef.current);
            }
          }
        }}
      >
        <Pressable
          testID={testID || `pullsheet-item-row-${item.id}`}
          onPress={hasPressAction ? handleRowPress : undefined}
          onLongPress={handleLongPress}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.container,
            {
              backgroundColor: hasPressAction && pressed ? colors.surface : colors.card,
              borderColor: isPrepped ? 'rgba(16, 185, 129, 0.3)' : colors.border,
              borderRadius: layout.borderRadius.md,
              paddingLeft: isSubItem ? spacing.xl : spacing.md,
              paddingRight: spacing.md,
              paddingVertical: spacing.sm + 2,
            },
          ]}
        >
          <View style={styles.rowInner}>
            {/* Sub-item tree branch indicator */}
            {isSubItem ? (
              <CornerDownRight size={14} color={colors.mutedForeground} style={{ marginRight: 6 }} />
            ) : null}

            {/* Quantity Badge */}
            <View
              style={[
                styles.qtyBadge,
                {
                  backgroundColor: isPrepped ? colors.brandGreenScale.green2 : colors.surface,
                  borderColor: isPrepped ? colors.brandGreenScale.green4 : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.qtyText,
                  {
                    color: isPrepped ? colors.status.online : colors.foreground,
                    fontSize: typography.fontSize.sm,
                  },
                ]}
              >
                {scannedQty !== undefined ? `${scannedQty}/${targetQty}` : `${targetQty}`}
              </Text>
            </View>

            {/* Description & Technical Notes */}
            <View style={styles.contentCol}>
              <Text
                style={[
                  styles.descriptionText,
                  {
                    color: isPrepped ? colors.foreground : colors.cardForeground,
                    fontSize: typography.fontSize.base,
                    fontWeight: isSubItem ? '500' : '600',
                  },
                ]}
                numberOfLines={2}
              >
                {item.description}
              </Text>

              {item.internalNote ? (
                <Text
                  style={[
                    styles.internalNoteText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                  ]}
                  numberOfLines={1}
                >
                  {item.internalNote}
                </Text>
              ) : null}
            </View>

            {/* Status Badge with Tap-to-Advance */}
            {isActionable ? (
              <View style={styles.statusBadgeWrap}>
                <PullSheetStatusBadge
                  status={item.status}
                  scannedQuantity={item.scannedQuantity}
                  targetQuantity={item.quantity}
                  onAdvance={onAdvanceStatus ? () => onAdvanceStatus(item.id) : undefined}
                />
              </View>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'relative',
    marginBottom: 6,
    overflow: 'hidden',
  },
  revealPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  revealSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  revealLeft: {
    justifyContent: 'flex-start',
  },
  revealRight: {
    justifyContent: 'flex-end',
    marginLeft: 'auto',
  },
  revealText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: 'Calibri',
  },
  movingCard: {
    width: '100%',
  },
  container: {
    borderWidth: 1,
    marginBottom: 0,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 26,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  qtyText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  contentCol: {
    flex: 1,
    marginRight: 8,
  },
  descriptionText: {
    fontFamily: 'Calibri',
    lineHeight: 20,
  },
  internalNoteText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  statusBadgeWrap: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  noteBodyText: {
    fontFamily: 'Calibri',
    flex: 1,
    lineHeight: 20,
  },
});
