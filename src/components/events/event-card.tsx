/**
 * src/components/events/event-card.tsx
 * High-contrast production event / job card for Kuro Mobile.
 * Displays event number (#1042), title, status badge, timing range,
 * client/venue logistics, and line items count.
 * Navigates directly to the unified Event Details screen on tap.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarDays,
  MapPin,
  User,
} from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { formatEventDateRange } from '@/lib/date-utils';
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
  testID,
}) => {
  const { colors, typography, isDark } = useTheme();
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

  const displayDate = formatEventDateRange(
    event.deliveryTime || event.eventStartDate || event.startTime,
    event.packdownTime || event.eventFinishDate || event.finishTime
  );

  const eventNumDisplay =
    event.eventNumber !== undefined && event.eventNumber !== null
      ? `[${event.eventNumber}]`
      : event.id
      ? `[${event.id.substring(0, 6).toUpperCase()}]`
      : '';

  const quoteCount = event.equipmentItems?.length || 0;

  return (
    <Pressable onPress={handleCardPress} testID={testID || `event-card-${event.id}`}>
      <Card style={styles.card}>
        <CardContent style={styles.content}>
          {/* Top Row: Event # + Name + Date (Left) & Status Badge Pill (Right) */}
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
              {displayDate ? (
                <View style={styles.dateContainer}>
                  <CalendarDays size={14} color={colors.mutedForeground} />
                  <Text
                    style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                    numberOfLines={1}
                  >
                    {displayDate}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.statusContainer}>
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

          {/* Second Row: Type Badge + Venue + Items | Right: Client */}
          <View style={styles.secondRow}>
            <View style={styles.leftMetaGroup}>
              {typeName ? (
                <View
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: `${typeColor}20`,
                      borderColor: `${typeColor}40`,
                    },
                  ]}
                >
                  <Text style={[styles.typeLabel, { color: typeColor, fontSize: typography.fontSize.sm }]}>
                    {typeName}
                  </Text>
                </View>
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
                  {venueName || event.venueId ? (
                    <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
                  ) : null}
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
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 8,
    flexShrink: 0,
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
  typeLabel: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
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
});
