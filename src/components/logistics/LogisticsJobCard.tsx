/**
 * src/components/logistics/LogisticsJobCard.tsx
 * High-Contrast Logistics Job Feed Item Card in Kuro Mobile.
 * Clean 2-row layout matching Kuro Mobile Repairs tab standard.
 *
 * Top row: Left [Job/Event ID] + Name/Title; Right: tinted status badge pill with 1px border.
 * Second row: Left meta (Location with MapPin size 14, Date/Schedule with Calendar size 14,
 * Stops count with Navigation size 14, Live GPS indicator); Right driver name with UserCheck size 14,
 * Vehicle name/rego with Truck size 14.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Truck,
  MapPin,
  Calendar,
  Navigation,
  Radio,
  UserCheck,
  CloudUpload,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { parseFirestoreDate, formatStageTime, formatEventDateRange } from '@/lib/date-utils';
import {
  isJobActive,
  isJobCompleted,
  isJobPending,
  isJobPlanned,
  isJobScheduled,
} from '@/lib/logistics-engine';
import { fetchVehicleById, formatVehicleDisplayName } from '@/services/logistics-service';
import type { LogisticsEntry } from '@/types/logistics';

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
  const { colors, typography, isDark } = useTheme();
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress(job);
    } else {
      router.push(`/logistics/${job.id}` as any);
    }
  };

  // Resolve human-readable vehicle name from vehicleId if vehicleName not present
  const [resolvedVehicleName, setResolvedVehicleName] = useState<string | null>(
    job.vehicleName || null
  );

  useEffect(() => {
    let isMounted = true;

    if (job.vehicleName || !job.vehicleId || !job.vehicleId.trim()) {
      return;
    }

    fetchVehicleById(job.vehicleId, job.tenantId)
      .then((vehicle) => {
        if (!isMounted) return;
        setResolvedVehicleName(formatVehicleDisplayName(vehicle, job.vehicleId));
      })
      .catch(() => {
        if (isMounted) setResolvedVehicleName(job.vehicleId || null);
      });

    return () => {
      isMounted = false;
    };
  }, [job.vehicleId, job.vehicleName, job.tenantId]);

  const vehicleDisplay = job.vehicleName || resolvedVehicleName || job.vehicleId;

  const getStatusColor = (status?: string): string => {
    if (!status) return colors.mutedForeground;
    const s = status.trim().toLowerCase();
    if (isJobPending(status)) return '#F59E0B';
    if (isJobPlanned(status)) return '#3B82F6';
    if (isJobActive(status)) return '#8B5CF6';
    if (isJobCompleted(status)) return '#10B981';
    if (s === 'cancelled' || s === 'canceled') return '#EF4444';
    return colors.mutedForeground;
  };

  const statusColor = getStatusColor(job.status);
  const statusBg = isDark ? `${statusColor}22` : `${statusColor}15`;

  const jobNumDisplay =
    job.eventNumber !== undefined && job.eventNumber !== null
      ? `[${job.eventNumber}]`
      : job.id
      ? `[${job.id.substring(0, 6).toUpperCase()}]`
      : '[JOB]';

  const titleDisplay = job.eventName || job.location || `Job ${job.id.substring(0, 7).toUpperCase()}`;

  const startDate = parseFirestoreDate(job.start);
  const endDate = parseFirestoreDate(job.end);
  const dateRangeStr = formatEventDateRange(startDate, endDate);
  const startTimeStr = startDate ? formatStageTime(startDate, 'timeOnly') : '';
  const endTimeStr = endDate ? formatStageTime(endDate, 'timeOnly') : '';
  const timeWindowStr = startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : startTimeStr;
  const scheduleDisplay = dateRangeStr || timeWindowStr || '';

  const destinationCount = Array.isArray(job.destinations) ? job.destinations.length : 0;
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
        accessibilityLabel={`Logistics job ${jobNumDisplay} ${titleDisplay}, status ${job.status}`}
      >
        <CardContent style={styles.content}>
          {/* Top Row: [Job/Event ID] + Name/Title (Left) & Tinted Status Badge (Right) */}
          <View style={styles.topRow}>
            <View style={styles.jobTitleContainer}>
              <Text style={[styles.jobIdText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                {jobNumDisplay}
              </Text>
              <Text
                style={[
                  styles.jobName,
                  { color: colors.foreground, fontSize: typography.fontSize.base, flexShrink: 1, marginLeft: 6 },
                ]}
                numberOfLines={1}
              >
                {titleDisplay}
              </Text>
            </View>

            <View style={styles.statusContainer}>
              {job.hasPendingWrites ? (
                <View
                  testID={`job-pending-sync-${job.id}`}
                  accessibilityRole="image"
                  accessibilityLabel="Changes pending sync"
                >
                  <CloudUpload size={16} color="#F59E0B" />
                </View>
              ) : null}
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: statusBg,
                    borderColor: statusColor,
                  },
                ]}
                testID={`job-status-badge-${job.id}`}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color: statusColor,
                      fontSize: typography.fontSize.sm,
                    },
                  ]}
                >
                  {job.status}
                </Text>
              </View>
            </View>
          </View>

          {/* Second Row: Left Meta (Date, Location, Stops, Live GPS) | Right Meta (Driver, Vehicle) */}
          <View style={styles.secondRow}>
            <View style={styles.leftMetaGroup}>
              {scheduleDisplay ? (
                <View style={styles.metaItem}>
                  <Calendar size={14} color={colors.mutedForeground} />
                  <Text
                    style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                    numberOfLines={1}
                  >
                    {scheduleDisplay}
                  </Text>
                </View>
              ) : null}

              {scheduleDisplay && job.location ? (
                <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
              ) : null}

              {job.location ? (
                <View style={styles.metaItem}>
                  <MapPin size={14} color={colors.mutedForeground} />
                  <Text
                    style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                    numberOfLines={1}
                  >
                    {job.location}
                  </Text>
                </View>
              ) : null}

              {(scheduleDisplay || job.location) && destinationCount > 0 ? (
                <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
              ) : null}

              {destinationCount > 0 ? (
                <View style={styles.metaItem}>
                  <Navigation size={14} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                    {destinationCount} {destinationCount === 1 ? 'stop' : 'stops'}
                  </Text>
                </View>
              ) : null}

              {(scheduleDisplay || job.location || destinationCount > 0) && isTracking ? (
                <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
              ) : null}

              {isTracking ? (
                <View
                  style={[
                    styles.liveTrackingPill,
                    {
                      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.12)',
                      borderColor: '#22C55E',
                    },
                  ]}
                  testID={`job-live-tracking-pill-${job.id}`}
                >
                  <Radio size={11} color="#22C55E" />
                  <Text style={[styles.liveTrackingText, { color: '#22C55E' }]}>
                    LIVE GPS
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.rightMetaGroup}>
              <View style={styles.personItem}>
                <UserCheck size={14} color={colors.mutedForeground} />
                <Text
                  style={[styles.personText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                  numberOfLines={1}
                >
                  {job.driverName || 'Unassigned'}
                </Text>
              </View>

              {job.vehicleId ? (
                <>
                  <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
                  <View style={styles.personItem}>
                    <Truck size={14} color={colors.mutedForeground} />
                    <Text
                      style={[styles.personText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                      numberOfLines={1}
                      testID={`job-vehicle-name-${job.id}`}
                    >
                      {vehicleDisplay}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
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
    padding: 12,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  jobIdText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  jobName: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  dateMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  dateText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  secondRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  metaText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  separatorDot: {
    fontFamily: 'Calibri',
    fontSize: 13,
  },
  liveTrackingPill: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
  },
  liveTrackingText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  rightMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 1,
    paddingLeft: 8,
  },
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  personText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});
