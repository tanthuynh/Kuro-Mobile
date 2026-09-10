/**
 * src/components/pull-sheets/pull-sheet-item-row.tsx
 * Actionable Pull Sheet line item row for Kuro Mobile.
 * Displays quantity counters, description, note callouts, tap-to-advance status badge,
 * and long-press bottom sheet trigger.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Info, CornerDownRight, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { PullSheetStatusBadge } from './pull-sheet-status-badge';
import { isActionablePullsheetItem } from '@/lib/pull-sheet-engine';
import type { PullsheetItem, PullsheetItemStatus } from '@/types/pull-sheet';

export interface PullSheetItemRowProps {
  item: PullsheetItem;
  onAdvanceStatus?: (itemId: string) => void;
  onLongPress?: (item: PullsheetItem) => void;
  onPress?: (item: PullsheetItem) => void;
  testID?: string;
}

export const PullSheetItemRow: React.FC<PullSheetItemRowProps> = ({
  item,
  onAdvanceStatus,
  onLongPress,
  onPress,
  testID,
}) => {
  const { colors, typography, spacing, layout } = useTheme();

  const isActionable = isActionablePullsheetItem(item);
  const isSubItem = item.type === 'sub-item';
  const isNote = item.type === 'note';

  const targetQty = Math.max(1, item.quantity || 1);
  const scannedQty = item.scannedQuantity;
  const isPrepped = item.status === 'prepped_scanned';

  const hasPressAction = Boolean(onPress || (onAdvanceStatus && isActionable));

  const handleRowPress = () => {
    if (onPress) onPress(item);
    else if (onAdvanceStatus && isActionable) onAdvanceStatus(item.id);
  };

  const handleLongPress = () => {
    if (onLongPress && isActionable) {
      onLongPress(item);
    }
  };

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

  return (
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
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    marginBottom: 6,
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
