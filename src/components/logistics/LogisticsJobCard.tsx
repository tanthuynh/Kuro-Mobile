/**
 * src/components/logistics/LogisticsJobCard.tsx
 * High-Contrast Logistics Job Feed Item Card in Kuro Mobile.
 * Displays event name, status badge, vehicle name/rego, driver name,
 * schedule times, destination count, location, and active tracking indicator.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Truck,
  MapPin,
  Calendar,
  Clock,
  User,
  Navigation,
  ChevronRight,
  Radio,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { parseFirestoreDate, formatStageTime, formatEventDateRange } from '@/lib/date-utils';
import { isJobActive, isJobCompleted, isJobScheduled } from '@/lib/logistics-engine';
import type { LogisticsEntry, LogisticsStatus } from '@/types/logistics';

export interface LogisticsJobCardProps {
  job: LogisticsEntry;
  onPress?: (job: LogisticsEntry) => void;
  testID?: string;
}

export function LogisticsJobCard({
  job,
  onPress,
  testID = `logistics-job-card-${job.id}`,
}: LogisticsJobCardProps) {
  const { colors, typography, spacing, layout } = useTheme();
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress(job);
    } else {
      router.push(`/logistics/${job.id}` as any);
    }
  };

  const getStatusBadgeVariant = (status?: LogisticsStatus): BadgeVariant => {
    if (!status) return 'secondary';
    const s = status.trim().toLowerCase();

    if (isJobActive(status)) {
      return 'brand';
    }
    if (isJobCompleted(status)) {
      return 'success';
    }
    if (isJobScheduled(status)) {
      return 'warning';
    }
    if (s === 'cancelled' || s === 'canceled') {
      return 'destructive';
    }
    return 'secondary';
  };

  const startDate = parseFirestoreDate(job.start);
  const endDate = parseFirestoreDate(job.end);
  const dateRangeStr = formatEventDateRange(startDate, endDate);
  const startTimeStr = startDate ? formatStageTime(startDate, 'timeOnly') : '';
  const endTimeStr = endDate ? formatStageTime(endDate, 'timeOnly') : '';
  const timeWindowStr = startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : startTimeStr || 'Not scheduled';

  const destinationCount = Array.isArray(job.destinations) ? job.destinations.length : 0;
  const eventNumDisplay = job.eventNumber ? `#${job.eventNumber}` : null;
  const titleDisplay = job.eventName || job.location || `Job #${job.id.substring(0, 7).toUpperCase()}`;

  const isTracking = Boolean(job.isTrackingActive);

  return (
    <Card style={styles.card}>
      <Pressable
        testID={testID}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Logistics job ${titleDisplay}, status ${job.status}`}
      >
        <CardContent style={styles.content}>
          {/* Top Row: Event Number & Status Badge / Tracking indicator */}
          <View style={styles.topRow}>
            <View style={styles.topLeft}>
              <Truck size={15} color={colors.primary} />
              {eventNumDisplay ? (
                <Text style={[styles.eventNumText, { color: colors.primary, fontSize: typography.fontSize.xs }]}>
                  {eventNumDisplay}
                </Text>
              ) : (
                <Text style={[styles.eventNumText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  #{job.id.substring(0, 6).toUpperCase()}
                </Text>
              )}

              {isTracking ? (
                <View
                  style={[styles.liveTrackingPill, { backgroundColor: colors.brandGreenScale.green2, borderColor: colors.brandGreenScale.green4 }]}
                  testID={`job-live-tracking-pill-${job.id}`}
                >
                  <Radio size={11} color={colors.primary} />
                  <Text style={[styles.liveTrackingText, { color: colors.primary }]}>
                    LIVE GPS
                  </Text>
                </View>
              ) : null}
            </View>

            <Badge variant={getStatusBadgeVariant(job.status)} testID={`job-status-badge-${job.id}`}>
              {job.status}
            </Badge>
          </View>

          {/* Job Title / Event Name */}
          <View style={styles.titleSection}>
            <Text
              style={[styles.jobTitle, { color: colors.foreground }]}
              numberOfLines={2}
            >
              {titleDisplay}
            </Text>
          </View>

          {/* Location & Schedule Info */}
          <View style={styles.metaSection}>
            {job.location ? (
              <View style={styles.metaRow}>
                <MapPin size={13} color={colors.mutedForeground} />
                <Text
                  style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}
                  numberOfLines={1}
                >
                  {job.location}
                </Text>
              </View>
            ) : null}

            <View style={styles.metaRow}>
              <Calendar size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                {dateRangeStr} {timeWindowStr !== 'Not scheduled' ? `• ${timeWindowStr}` : ''}
              </Text>
            </View>
          </View>

          {/* Bottom Row: Driver, Vehicle, Stops Count & Chevron */}
          <View style={[styles.bottomRow, { borderTopColor: colors.border }]}>
            <View style={styles.bottomLeft}>
              {/* Driver */}
              <View style={styles.infoChip}>
                <User size={12} color={colors.mutedForeground} />
                <Text
                  style={[styles.infoChipText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                  numberOfLines={1}
                >
                  {job.driverName || 'Unassigned'}
                </Text>
              </View>

              {/* Vehicle */}
              {job.vehicleId ? (
                <View style={styles.infoChip}>
                  <Truck size={12} color={colors.mutedForeground} />
                  <Text
                    style={[styles.infoChipText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                    numberOfLines={1}
                  >
                    {job.vehicleId}
                  </Text>
                </View>
              ) : null}

              {/* Stops Count */}
              <View style={[styles.stopsPill, { backgroundColor: colors.muted }]}>
                <Navigation size={11} color={colors.foreground} />
                <Text style={[styles.stopsText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                  {destinationCount} {destinationCount === 1 ? 'stop' : 'stops'}
                </Text>
              </View>
            </View>

            <ChevronRight size={16} color={colors.mutedForeground} />
          </View>
        </CardContent>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  pressable: {
    width: '100%',
  },
  content: {
    padding: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventNumText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  liveTrackingPill: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
    marginLeft: 4,
  },
  liveTrackingText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  titleSection: {
    marginTop: 2,
  },
  jobTitle: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  metaSection: {
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    flex: 1,
    fontWeight: '400',
    lineHeight: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoChipText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  stopsPill: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  stopsText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
});
