/**
 * src/components/events/event-overview-card.tsx
 * Decoupled Event Overview Card displaying Client, Venue, and Operational Schedule Windows.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Calendar, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { formatStageTime } from '@/lib/date-utils';
import { isEventWithinOperationalWindow } from '@/services/event-service';
import type { Event } from '@/types/events';

export interface EventOverviewCardProps {
  event: Event;
  clientContact?: { id: string; name: string; fullAddress?: string } | null;
  venueContact?: { id: string; name: string; fullAddress?: string } | null;
  onEdit?: () => void;
  colors?: any;
  testID?: string;
  showOperationalBanner?: boolean;
}

export function EventOverviewCard({
  event,
  clientContact,
  venueContact,
  onEdit,
  colors: propColors,
  testID = 'event-client-venue-card',
  showOperationalBanner = false,
}: EventOverviewCardProps) {
  const theme = useTheme();
  const colors = propColors || theme.colors;
  const { typography } = theme;

  const formatCompactWindow = (start?: Date | null, finish?: Date | null): string => {
    const s = start || null;
    const f = finish || null;
    if (!s && !f) return 'Not scheduled';
    if (s && !f) return formatStageTime(s, 'dateTime');
    if (!s && f) return formatStageTime(f, 'dateTime');

    const startStr = formatStageTime(s, 'dateTime');
    const finishStr = formatStageTime(f, 'dateTime');
    const startDay = formatStageTime(s, 'shortDate');
    const finishDay = formatStageTime(f, 'shortDate');

    if (startDay === finishDay) {
      const finishTime = formatStageTime(f, 'timeOnly');
      return `${startStr} – ${finishTime}`;
    }
    return `${startStr} – ${finishStr}`;
  };

  const isWithinWindow = isEventWithinOperationalWindow(event);

  return (
    <View style={styles.container}>
      {showOperationalBanner && !isWithinWindow && (
        <View style={[styles.warningBanner, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="operational-window-banner">
          <AlertCircle size={14} color={colors.mutedForeground} style={{ marginRight: 6 }} />
          <Text style={[styles.warningText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
            This event is outside the active operational window (archived or past).
          </Text>
        </View>
      )}

      <Card style={styles.compactOverviewCard} testID={testID}>
        <CardContent style={styles.compactCardContent}>
          {/* Top Grid: Client & Venue */}
          <View style={styles.compactGridRow}>
            <View style={styles.compactGridCol}>
              <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                CLIENT
              </Text>
              <Text style={[styles.infoMainText, { color: colors.cardForeground, fontSize: typography.fontSize.sm }]} numberOfLines={1}>
                {clientContact?.name || event.clientId || 'Client Direct'}
              </Text>
            </View>

            <View style={styles.compactGridCol}>
              <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                VENUE
              </Text>
              <Text style={[styles.infoMainText, { color: colors.cardForeground, fontSize: typography.fontSize.sm }]} numberOfLines={1}>
                {venueContact?.name || event.venueName || event.venueId || 'Sydney Showground (Hall 5 & Dock 2)'}
              </Text>
              <Text style={[styles.addressText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]} numberOfLines={1}>
                {venueContact?.fullAddress || '1 Showground Rd, Sydney Olympic Park NSW 2127'}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

          {/* Bottom Grid: Planning & Event Schedule Windows */}
          <View style={styles.compactGridRow}>
            <View style={styles.compactGridCol}>
              <View style={styles.stageLabelRow}>
                <Calendar size={12} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  PLANNING
                </Text>
              </View>
              <Text style={[styles.timeRangeText, { color: colors.cardForeground, fontSize: typography.fontSize.xs }]}>
                {formatCompactWindow(event.startTime, event.finishTime)}
              </Text>
            </View>

            <View style={styles.compactGridCol}>
              <View style={styles.stageLabelRow}>
                <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  EVENT
                </Text>
              </View>
              <Text style={[styles.timeRangeText, { color: colors.cardForeground, fontSize: typography.fontSize.xs }]}>
                {formatCompactWindow(event.eventStartDate, event.eventFinishDate)}
              </Text>
            </View>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  warningText: {
    fontFamily: 'Calibri',
    flex: 1,
  },
  compactOverviewCard: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  compactCardContent: {
    padding: 12,
  },
  compactGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  compactGridCol: {
    flex: 1,
  },
  fieldSubLabel: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoMainText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  addressText: {
    fontFamily: 'Calibri',
    marginTop: 1,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  stageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeRangeText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
});
