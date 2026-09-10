/**
 * src/components/pull-sheets/pull-sheet-status-badge.tsx
 * Color-coded status badge for Pull Sheet items in Kuro Mobile.
 * Supports tap-to-advance for rapid status advancement.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, type ViewStyle } from 'react-native';
import { STATUS_DISPLAY_CONFIG, normalizePullsheetStatus } from '@/lib/pull-sheet-engine';
import { useTheme } from '@/context/theme-context';
import type { PullsheetItemStatus } from '@/types/pull-sheet';

export interface PullSheetStatusBadgeProps {
  status?: string | PullsheetItemStatus;
  scannedQuantity?: number;
  targetQuantity?: number;
  labelOverride?: string;
  onAdvance?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export const PullSheetStatusBadge: React.FC<PullSheetStatusBadgeProps> = ({
  status = 'pending',
  scannedQuantity,
  targetQuantity,
  labelOverride,
  onAdvance,
  style,
  testID,
}) => {
  const { typography } = useTheme();
  const normalized = normalizePullsheetStatus(status);
  const config = STATUS_DISPLAY_CONFIG[normalized] || STATUS_DISPLAY_CONFIG.none;

  let displayLabel = labelOverride || config.label;
  if (!labelOverride && normalized === 'prepped_scanned') {
    const target = targetQuantity !== undefined ? targetQuantity : 1;
    const scanned = scannedQuantity !== undefined ? scannedQuantity : 0;
    if (scanned > 0 && scanned < target) {
      displayLabel = `Prepped ${scanned}/${target}`;
    } else {
      displayLabel = 'Prepped';
    }
  }

  const content = (
    <View
      testID={testID || `pullsheet-status-badge-${normalized}`}
      style={[
        styles.badge,
        {
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          {
            color: config.color,
            fontSize: typography.fontSize.sm,
          },
        ]}
      >
        {displayLabel}
      </Text>
    </View>
  );

  if (onAdvance && normalized !== 'none') {
    return (
      <Pressable
        onPress={(e) => {
          e?.stopPropagation?.();
          onAdvance();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Advance status from ${config.label}`}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 9999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  badgeText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 18,
  },
});
