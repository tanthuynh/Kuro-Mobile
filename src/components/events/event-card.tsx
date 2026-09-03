/**
 * src/components/events/event-card.tsx
 * High-contrast production event / job card for Kuro Mobile.
 * Displays event number (#1042), title, status badge, timing range,
 * client/venue logistics, and quick action shortcuts to Pull Sheet and Scanner.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarDays,
  Clock,
  MapPin,
  FileSpreadsheet,
  QrCode,
  ChevronRight,
  User,
} from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatEventDateRange, formatStageTime } from '@/lib/date-utils';
import type { Event, EventStatus } from '@/types/events';

export interface EventCardProps {
  event: Event;
  clientName?: string;
  venueName?: string;
  typeName?: string;
  typeColor?: string;
  onPress?: () => void;
  onOpenPullsheet?: () => void;
  onOpenScanner?: () => void;
  testID?: string;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  clientName,
  venueName,
  typeName = 'Production',
  typeColor = '#60A5FA',
  onPress,
  onOpenPullsheet,
  onOpenScanner,
  testID,
}) => {
  const { colors, typography, spacing, layout, isDark } = useTheme();
  const router = useRouter();

  const getStatusColor = (status: EventStatus): string => {
    switch (status) {
      case 'Confirmed':
        return '#10B981';
      case 'Pending':
        return '#F59E0B';
      case 'Inquiry':
        return '#3B82F6';
      case 'Completed':
        return '#8B5CF6';
      case 'Cancelled':
        return '#EF4444';
      default:
        return colors.foreground;
    }
  };

  const statusColor = getStatusColor(event.eventStatusId);
  const statusBg = isDark ? `${statusColor}22` : `${statusColor}15`;

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/events/${event.id}`);
    }
  };

  const handlePullsheetPress = (e: any) => {
    e?.stopPropagation?.();
    if (onOpenPullsheet) {
      onOpenPullsheet();
    } else {
      router.push(`/pullsheet/${event.id}`);
    }
  };

  const handleScannerPress = (e: any) => {
    e?.stopPropagation?.();
    if (onOpenScanner) {
      onOpenScanner();
    } else {
      router.push({
        pathname: '/(tabs)/scanner',
        params: { eventId: event.id },
      });
    }
  };

  const displayDate = formatEventDateRange(
    event.deliveryTime || event.eventStartDate || event.startTime,
    event.packdownTime || event.eventFinishDate || event.finishTime
  );

  const eventNumDisplay =
    event.eventNumber !== undefined && event.eventNumber !== null
      ? `#${event.eventNumber}`
      : event.id
      ? `[#${event.id.substring(0, 6).toUpperCase()}]`
      : '';

  const quoteCount = event.equipmentItems?.length || 0;

  return (
    <Pressable onPress={handleCardPress} testID={testID || `event-card-${event.id}`}>
      <Card style={styles.card}>
        <CardContent style={styles.content}>
          {/* Top Row: Event # + Name (Left) & Status Badge Pill (Right) */}
          <View style={styles.topRow}>
            <View style={styles.eventTitleContainer}>
              {eventNumDisplay ? (
                <Text style={[styles.eventIdText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                  {eventNumDisplay}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.eventName,
                  { color: colors.foreground, fontSize: typography.fontSize.base, flexShrink: 1, marginLeft: eventNumDisplay ? 6 : 0 },
                ]}
                numberOfLines={1}
              >
                {event.eventName}
              </Text>
            </View>

            <View style={styles.statusContainer}>
              {typeName ? (
                <View
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: `${typeColor}20`,
                      borderColor: `${typeColor}40`,
                      marginRight: 6,
                    },
                  ]}
                >
                  <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
                  <Text style={[styles.typeLabel, { color: typeColor }]}>
                    {typeName}
                  </Text>
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
                testID={`event-status-badge-${event.id}`}
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
                  {event.eventStatusId}
                </Text>
              </View>
            </View>
          </View>

          {/* Second Row: Metadata (Date, Venue, Items) | Right: Client */}
          <View style={styles.secondRow}>
            <View style={styles.leftMetaGroup}>
              {displayDate ? (
                <View style={styles.metaItem}>
                  <CalendarDays size={14} color={colors.mutedForeground} />
                  <Text
                    style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                    numberOfLines={1}
                  >
                    {displayDate}
                  </Text>
                </View>
              ) : null}

              {(venueName || event.venueId) && displayDate ? (
                <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
              ) : null}

              {venueName || event.venueId ? (
                <View style={styles.metaItem}>
                  <MapPin size={14} color={colors.mutedForeground} />
                  <Text
                    style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                    numberOfLines={1}
                  >
                    {venueName || 'Venue Assigned'}
                  </Text>
                </View>
              ) : null}

              {quoteCount > 0 ? (
                <>
                  <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
                  <View style={styles.metaItem}>
                    <Text
                      style={[styles.quoteCountText, { color: colors.primary, fontSize: typography.fontSize.sm }]}
                      numberOfLines={1}
                    >
                      {quoteCount} Quote Line Items
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            {clientName || event.clientId ? (
              <View style={styles.rightMetaGroup}>
                <View style={styles.personItem}>
                  <User size={14} color={colors.mutedForeground} />
                  <Text
                    style={[styles.personText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                    numberOfLines={1}
                  >
                    {clientName || 'Client Assigned'}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Action Buttons Row */}
          <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
            <Button
              variant="secondary"
              size="sm"
              icon={<FileSpreadsheet size={15} color={colors.secondaryForeground} />}
              onPress={handlePullsheetPress}
              style={styles.actionBtn}
              testID={`card-pullsheet-btn-${event.id}`}
            >
              Pull Sheet
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={<QrCode size={15} color={colors.primaryForeground} />}
              onPress={handleScannerPress}
              style={styles.actionBtn}
              testID={`card-scan-btn-${event.id}`}
            >
              Scan Gear
            </Button>

            <View style={styles.chevronWrap}>
              <ChevronRight size={18} color={colors.mutedForeground} />
            </View>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: 10,
    overflow: 'hidden',
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
  eventTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  eventIdText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  eventName: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  typePill: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  typeLabel: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
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
  quoteCountText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  separatorDot: {
    fontFamily: 'Calibri',
    fontSize: 13,
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  chevronWrap: {
    paddingLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
