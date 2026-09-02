/**
 * src/components/pull-sheets/pull-sheet-section-header.tsx
 * Visual section header separating equipment by rig/room in Kuro Mobile.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Folder } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';

export interface PullSheetSectionHeaderProps {
  title: string;
  itemCount?: number;
  testID?: string;
}

export const PullSheetSectionHeader: React.FC<PullSheetSectionHeaderProps> = ({
  title,
  itemCount,
  testID,
}) => {
  const { colors, typography, spacing, layout } = useTheme();

  return (
    <View
      testID={testID || `section-header-${title.replace(/\s+/g, '-').toLowerCase()}`}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.borderRadius.md,
        },
      ]}
    >
      <View style={styles.leftCol}>
        <Folder size={16} color={colors.primary} style={{ marginRight: 8 }} />
        <Text
          style={[
            styles.titleText,
            { color: colors.foreground, fontSize: typography.fontSize.sm },
          ]}
        >
          {title}
        </Text>
      </View>

      {itemCount !== undefined ? (
        <View
          style={[
            styles.countBadge,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.countText,
              { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
            ]}
          >
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 8,
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  titleText: {
    fontFamily: 'Calibri',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 24,
  },
  countBadge: {
    minHeight: 26,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
