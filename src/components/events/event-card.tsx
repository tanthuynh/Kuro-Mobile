/**
 * src/components/events/event-card.tsx
 * High-contrast production event / job card for Kuro Mobile.
 * Displays event number (#1042), title, status badge, timing range,
 * client/venue logistics, and line items count.
 * Navigates directly to the unified Event Details screen on tap.
 */

import React, { memo } from 'react';
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
import { isRawIdentifier } from '@/lib/events-engine';
import type { Event, EventStatus } from '@/types/events';

export interface EventCardProps {
  event: Event;
  clientName?: string;
  venueName?: string;
  assigneeName?: string;
  typeName?: string;
  typeColor?: string;
  onPress?: (event?: Event) => void;
  onOpenPullsheet?: () => void;
  onOpenScanner?: () => void;
  testID?: string;
}

/**
 * Normalizes and compares date/timestamp representations (Date, Firestore Timestamp, ISO string, epoch ms).
 */
export function areDatesOrTimestampsEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (typeof a === 'object' && typeof b === 'object') {
    if (a.seconds !== undefined && b.seconds !== undefined) {
      return a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
    }
    if (typeof a.toDate === 'function' && typeof b.toDate === 'function') {
      return a.toDate().getTime() === b.toDate().getTime();
    }
  }
  return String(a) === String(b);
}

export function areEventCardPropsEqual(
  prevProps: Readonly<EventCardProps>,
  nextProps: Readonly<EventCardProps>
): boolean {
  if (prevProps === nextProps) return true;

  if (prevProps.testID !== nextProps.testID) return false;
  if (prevProps.venueName !== nextProps.venueName) return false;
  if (prevProps.assigneeName !== nextProps.assigneeName) return false;
  if (prevProps.clientName !== nextProps.clientName) return false;
  if (prevProps.typeName !== nextProps.typeName) return false;
  if (prevProps.typeColor !== nextProps.typeColor) return false;
  if (prevProps.onPress !== nextProps.onPress) return false;

  const prev = prevProps.event;
  const next = nextProps.event;
  if (prev === next) return true;
  if (!prev || !next) return false;

  if (prev.id !== next.id) return false;
  if (prev.eventName !== next.eventName) return false;
  if (prev.eventNumber !== next.eventNumber) return false;
  if (prev.eventStatusId !== next.eventStatusId) return false;
  if (prev.eventTypeId !== next.eventTypeId) return false;
  if (prev.venueId !== next.venueId) return false;
  if ((prev as any).venueName !== (next as any).venueName) return false;
  if (prev.assigneeId !== next.assigneeId) return false;
  if ((prev as any).assigneeName !== (next as any).assigneeName) return false;
  if ((prev as any).assignee?.name !== (next as any).assignee?.name) return false;

  if (!areDatesOrTimestampsEqual(prev.deliveryTime, next.deliveryTime)) return false;
  if (!areDatesOrTimestampsEqual(prev.eventStartDate, next.eventStartDate)) return false;
  if (!areDatesOrTimestampsEqual(prev.startTime, next.startTime)) return false;
  if (!areDatesOrTimestampsEqual(prev.packdownTime, next.packdownTime)) return false;
  if (!areDatesOrTimestampsEqual(prev.eventFinishDate, next.eventFinishDate)) return false;
  if (!areDatesOrTimestampsEqual(prev.finishTime, next.finishTime)) return false;
  if (!areDatesOrTimestampsEqual(prev.updatedAt, next.updatedAt)) return false;

  return true;
}

const EventCardBase: React.FC<EventCardProps> = ({
  event,
  clientName,
  venueName,
  assigneeName,
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
      onPress(event);
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

  const rawVenue =
    (venueName && !isRawIdentifier(venueName) ? venueName : null) ||
    ((event as any).venueName && !isRawIdentifier((event as any).venueName) ? (event as any).venueName : null) ||
    (event.venueId && !isRawIdentifier(event.venueId) ? event.venueId : null);
  const displayVenue = rawVenue || '';

  const rawAssignee =
    (assigneeName && !isRawIdentifier(assigneeName) ? assigneeName : null) ||
    ((event as any).assigneeName && !isRawIdentifier((event as any).assigneeName) ? (event as any).assigneeName : null) ||
    ((event as any).assignee?.name && !isRawIdentifier((event as any).assignee?.name) ? (event as any).assignee?.name : null) ||
    (typeof (event as any).assignee === 'string' && !isRawIdentifier((event as any).assignee) ? (event as any).assignee : null) ||
    (clientName && !isRawIdentifier(clientName) ? clientName : null) ||
    (event.assigneeId && !isRawIdentifier(event.assigneeId) ? event.assigneeId : null);
  const displayAssignee = rawAssignee || '';

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

          {/* Second Row: Type Badge on the very left, left of the date */}
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
          </View>

          {/* Third Row: Venue (Left) & Assignee (Right) */}
          {(displayVenue || displayAssignee) ? (
            <View style={styles.thirdRow}>
              {displayVenue ? (
                <View style={styles.metaItem}>
                  <MapPin size={14} color={colors.mutedForeground} />
                  <Text
                    style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                    numberOfLines={1}
                  >
                    {displayVenue}
                  </Text>
                </View>
              ) : (
                <View />
              )}

              {displayAssignee ? (
                <View style={styles.rightMetaGroup}>
                  <View style={styles.personItem}>
                    <User size={14} color={colors.mutedForeground} />
                    <Text
                      style={[styles.personText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}
                      numberOfLines={1}
                    >
                      {displayAssignee}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
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
    gap: 4,
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
  thirdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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

export const EventCard = memo(EventCardBase, areEventCardPropsEqual);

