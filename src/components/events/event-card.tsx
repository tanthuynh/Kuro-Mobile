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
  const { colors, typography, spacing, layout } = useTheme();
  const router = useRouter();

  const getStatusVariant = (status: EventStatus): BadgeVariant => {
    switch (status) {
      case 'Confirmed':
        return 'success';
      case 'Pending':
        return 'warning';
      case 'Inquiry':
        return 'info';
      case 'Completed':
        return 'secondary';
      case 'Cancelled':
        return 'destructive';
      default:
        return 'default';
    }
  };

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

  // Build timing string
  const timingString = event.eventStartDate && event.eventFinishDate
    ? `${formatStageTime(event.eventStartDate, 'timeOnly')} - ${formatStageTime(event.eventFinishDate, 'timeOnly')}`
    : event.deliveryTime && event.setupTime
    ? `Setup: ${formatStageTime(event.deliveryTime, 'timeOnly')}`
    : formatEventDateRange(event.eventStartDate || event.startTime, event.eventFinishDate || event.finishTime);

  const displayDate = formatEventDateRange(
    event.deliveryTime || event.eventStartDate || event.startTime,
    event.packdownTime || event.eventFinishDate || event.finishTime
  );

  return (
    <Pressable onPress={handleCardPress} testID={testID || `event-card-${event.id}`}>
      <Card
        style={[
          styles.card,
          {
            borderLeftColor: typeColor || colors.status.events,
            borderLeftWidth: 4,
          },
        ]}
      >
        <CardContent style={{ paddingTop: spacing.base }}>
          {/* Header Row: Event #, Type pill, Status Badge */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              {event.eventNumber ? (
                <View
                  style={[
                    styles.eventNumberBadge,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.eventNumberText,
                      { color: colors.foreground, fontSize: typography.fontSize.sm },
                    ]}
                  >
                    #{event.eventNumber}
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.typePill,
                  {
                    backgroundColor: `${typeColor}20`,
                    borderColor: `${typeColor}40`,
                  },
                ]}
              >
                <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
                <Text
                  style={[
                    styles.typeLabel,
                    { color: typeColor, fontSize: typography.fontSize.sm },
                  ]}
                >
                  {typeName}
                </Text>
              </View>
            </View>

            <Badge variant={getStatusVariant(event.eventStatusId)}>
              {event.eventStatusId}
            </Badge>
          </View>

          {/* Event Title */}
          <Text
            style={[
              styles.eventName,
              { color: colors.cardForeground, fontSize: typography.fontSize.base },
            ]}
            numberOfLines={2}
          >
            {event.eventName}
          </Text>

          {/* Date & Time Row */}
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <CalendarDays size={14} color={colors.mutedForeground} style={{ marginRight: 5 }} />
              <Text
                style={[
                  styles.metaText,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                ]}
              >
                {displayDate}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Clock size={14} color={colors.mutedForeground} style={{ marginRight: 5 }} />
              <Text
                style={[
                  styles.metaText,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                ]}
              >
                {timingString}
              </Text>
            </View>
          </View>

          {/* Venue & Client Row */}
          <View style={styles.logisticsRow}>
            {venueName || event.venueId ? (
              <View style={styles.metaItem}>
                <MapPin size={14} color={colors.mutedForeground} style={{ marginRight: 5 }} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.metaText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.sm, maxWidth: 160 },
                  ]}
                >
                  {venueName || 'Venue Assigned'}
                </Text>
              </View>
            ) : null}

            {clientName || event.clientId ? (
              <View style={styles.metaItem}>
                <User size={14} color={colors.mutedForeground} style={{ marginRight: 5 }} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.metaText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.sm, maxWidth: 160 },
                  ]}
                >
                  {clientName || 'Client Assigned'}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Equipment Count if items exist */}
          {event.equipmentItems && event.equipmentItems.length > 0 ? (
            <View style={[styles.equipmentSummary, { borderTopColor: colors.border }]}>
              <Text
                style={[
                  styles.equipmentCountText,
                  { color: colors.primary, fontSize: typography.fontSize.sm },
                ]}
              >
                {event.equipmentItems.length} Quote Line Items
              </Text>
            </View>
          ) : null}

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
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventNumberBadge: {
    minHeight: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventNumberText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  typePill: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
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
    fontWeight: '700',
    textTransform: 'uppercase',
    lineHeight: 18,
  },
  eventName: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 6,
  },
  logisticsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  equipmentSummary: {
    paddingTop: 6,
    marginBottom: 8,
    borderTopWidth: 1,
  },
  equipmentCountText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
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
