/**
 * src/components/logistics/logistics-tracking-card.tsx
 * Modular GPS Tracking & Route Control Card for Logistics Job Detail.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Play, Pause, CheckCircle2, Navigation } from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { LogisticsDestination } from '@/types/logistics';

export interface LogisticsTrackingCardProps {
  /** Whether GPS location tracking is actively recording and transmitting */
  isTracking: boolean;
  /** Whether the start tracking async initialization is in progress */
  isStartingTracking?: boolean;
  /** Whether the pause tracking async operation is in progress */
  isPausingTracking?: boolean;
  /** Whether the job completion operation is in progress */
  isCompleting?: boolean;
  /** Whether the job is already in Completed state */
  isCompleted?: boolean;
  /** Whether the authenticated user is the assigned driver */
  isAssignedDriver?: boolean;
  /** Action callback when driver presses Start */
  onPlay: () => void | Promise<void>;
  /** Action callback when driver presses Pause */
  onPause: () => void | Promise<void>;
  /** Action callback when driver presses Finish */
  onFinish: () => void | Promise<void>;
  /** Optional next destination stop metadata for live ETA and telemetry display */
  nextDestination?: LogisticsDestination | null;
  /** Optional custom testID (defaults to 'job-controls-card') */
  testID?: string;
}

export function LogisticsTrackingCard({
  isTracking,
  isStartingTracking = false,
  isPausingTracking = false,
  isCompleting = false,
  isCompleted = false,
  isAssignedDriver = true,
  onPlay,
  onPause,
  onFinish,
  nextDestination,
  testID = 'job-controls-card',
}: LogisticsTrackingCardProps) {
  const { colors, typography } = useTheme();

  return (
    <Card style={styles.card} testID={testID}>
      <CardContent style={styles.cardContent}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
            TRACKING
          </Text>
        </View>

        {nextDestination && isTracking ? (
          <View style={styles.telemetryRow}>
            <Navigation size={13} color={colors.primary} />
            <Text
              style={[styles.telemetryText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}
              numberOfLines={1}
            >
              Next Stop: {nextDestination.destinationName || nextDestination.address}
              {nextDestination.estTravelTime ? ` · ETA ${nextDestination.estTravelTime}` : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          {/* Start / Pause Toggle Button */}
          <Button
            variant={isTracking ? 'outline' : 'primary'}
            size="default"
            icon={
              isTracking ? (
                <Pause size={16} color={colors.foreground} />
              ) : (
                <Play size={16} color={colors.primaryForeground} />
              )
            }
            onPress={isTracking ? onPause : onPlay}
            loading={isTracking ? isPausingTracking : isStartingTracking}
            disabled={(isTracking ? isPausingTracking : isStartingTracking) || !isAssignedDriver}
            style={styles.controlBtn}
            testID={isTracking ? 'pause-job-btn' : 'play-job-btn'}
            accessibilityLabel={isTracking ? 'Pause tracking' : 'Start tracking'}
          >
            {isTracking ? 'Pause' : 'Start'}
          </Button>

          {/* Finish Button */}
          <Button
            variant="primary"
            size="default"
            icon={<CheckCircle2 size={16} color={colors.primaryForeground} />}
            onPress={onFinish}
            loading={isCompleting}
            disabled={isCompleting || isCompleted || !isAssignedDriver}
            style={[styles.controlBtn, { backgroundColor: colors.status.online }]}
            testID="finish-job-btn"
            accessibilityLabel="Finish and complete job"
          >
            Finish
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 14,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionHeaderLabel: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 18,
  },
  telemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  telemetryText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  controlBtn: {
    flex: 1,
    minHeight: 48,
  },
});
