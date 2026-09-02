/**
 * src/components/pull-sheets/pull-sheet-progress-bar.tsx
 * Multi-stage visual progress bar for Pull Sheets in Kuro Mobile.
 * Shows Prepped %, Dispatched %, and item counts.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/theme-context';
import type { PullsheetProgress } from '@/types/pull-sheet';

export interface PullSheetProgressBarProps {
  progress: PullsheetProgress;
  testID?: string;
}

export const PullSheetProgressBar: React.FC<PullSheetProgressBarProps> = ({
  progress,
  testID,
}) => {
  const { colors, typography, layout } = useTheme();

  const total = Math.max(1, progress.totalQuantity);
  const preppedPct = progress.percentPrepped;
  const dispatchedPct = progress.percentDispatched;

  return (
    <View testID={testID || 'pullsheet-progress-bar'} style={styles.container}>
      {/* Top Header Labels */}
      <View style={styles.headerRow}>
        <Text style={[styles.progressTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
          Warehouse Prep Progress
        </Text>
        <Text style={[styles.progressPct, { color: colors.primary, fontSize: typography.fontSize.sm }]}>
          {preppedPct}% Complete
        </Text>
      </View>

      {/* Segmented Progress Track */}
      <View
        style={[
          styles.track,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: layout.borderRadius.full,
          },
        ]}
      >
        <View
          style={[
            styles.fillBar,
            {
              width: `${Math.min(100, Math.max(0, preppedPct))}%`,
              backgroundColor: colors.primary,
              borderRadius: layout.borderRadius.full,
            },
          ]}
        />
      </View>

      {/* Metric Breakdown Badges */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
            Total Lines:
          </Text>
          <Text style={[styles.metricValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
            {progress.totalLines}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
            Prepped:
          </Text>
          <Text style={[styles.metricValue, { color: colors.status.online, fontSize: typography.fontSize.sm }]}>
            {progress.preppedQuantity} / {progress.totalQuantity}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
            Pending:
          </Text>
          <Text style={[styles.metricValue, { color: colors.status.degraded, fontSize: typography.fontSize.sm }]}>
            {progress.pendingQuantity}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
            Dispatched:
          </Text>
          <Text style={[styles.metricValue, { color: '#8B5CF6', fontSize: typography.fontSize.sm }]}>
            {progress.dispatchedQuantity}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressTitle: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  progressPct: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  fillBar: {
    height: '100%',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontFamily: 'Calibri',
  },
  metricValue: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
});
