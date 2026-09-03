/**
 * app/events/[id].tsx
 * Event Details Screen in Kuro Mobile.
 * Full operational view including stage schedule timeline, client/venue details,
 * notes, and direct entry into Mobile Pull Sheet & Prep Continuous Scanner.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Building2,
  User,
  ExternalLink,
  FileSpreadsheet,
  QrCode,
  FileText,
  Package,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useSingleEvent } from '@/hooks/use-events';
import { useTenantOwners } from '@/hooks/use-tickets';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EventScheduleCard } from '@/components/events/event-schedule-card';
import { formatEventDateRange } from '@/lib/date-utils';
import type { EventStatus } from '@/types/events';

export default function EventDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, typography, spacing, layout } = useTheme();

  const eventId = Array.isArray(id) ? id[0] : id || '';
  const { event, loading, error, refresh } = useSingleEvent(eventId);
  const { owners } = useTenantOwners();

  const clientContact = useMemo(() => {
    if (!event?.clientId) return null;
    return owners.find(
      (o) => o.id === event.clientId || o.name.toLowerCase() === event.clientId.toLowerCase()
    );
  }, [owners, event?.clientId]);

  const venueContact = useMemo(() => {
    const vId = event?.venueId;
    if (!vId) return null;
    return owners.find(
      (o) => o.id === vId || (o.name && o.name.toLowerCase() === vId.toLowerCase())
    );
  }, [owners, event?.venueId]);

  const getStatusVariant = (status?: EventStatus): BadgeVariant => {
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



  const handleOpenMaps = (address?: string) => {
    if (!address) return;
    const query = encodeURIComponent(address);
    Linking.openURL(`https://maps.google.com/?q=${query}`).catch((err) => {
      console.warn('Could not open maps:', err);
    });
  };

  const handleBack = () => {
    router.replace('/(tabs)' as any);
  };

  if (loading && !event) {
    return (
      <View style={[styles.centerScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: spacing.md }]}>
          Loading Event Details...
        </Text>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={[styles.centerScreen, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <Text style={[styles.errorTitle, { color: colors.destructive, fontSize: typography.fontSize.lg }]}>
          Event Not Found
        </Text>
        <Text style={[styles.errorSubtitle, { color: colors.mutedForeground, marginVertical: spacing.md, textAlign: 'center' }]}>
          {error?.message || `Unable to load event #${eventId}. It may have been archived or removed.`}
        </Text>
        <Button variant="outline" onPress={handleBack} testID="event-not-found-back-btn">
          Back to Jobs Feed
        </Button>
      </View>
    );
  }

  const dateRangeText = formatEventDateRange(
    event.deliveryTime || event.eventStartDate || event.startTime,
    event.packdownTime || event.eventFinishDate || event.finishTime
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <ScreenHeader
        title={event.eventName}
        idBadge={event.eventNumber ? `[${event.eventNumber}]` : undefined}
        onBack={handleBack}
        backTestID="event-details-back-btn"
        backAccessibilityLabel="Go back to Events Feed"
        rightAction={
          <Badge variant={getStatusVariant(event.eventStatusId)}>
            {event.eventStatusId}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}>
        {/* Schedule Timeline Stepper */}
        <EventScheduleCard event={event} />

        {/* Combined Client & Venue Details Card */}
        <Card style={styles.sectionCard} testID="event-client-venue-card">
          <CardHeader style={styles.sectionHeader}>
            <View style={styles.headerTitleRow}>
              <Building2 size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: typography.fontSize.md }]}>
                Client & Venue
              </Text>
            </View>
          </CardHeader>
          <CardContent style={styles.cardContentNoTop}>
            {/* Client Section */}
            <View style={styles.combinedFieldGroup}>
              <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                CLIENT
              </Text>
              <Text style={[styles.infoMainText, { color: colors.cardForeground, fontSize: typography.fontSize.base }]}>
                {clientContact?.name || event.clientId || 'Client Direct'}
              </Text>
            </View>

            {/* Divider */}
            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

            {/* Venue Section */}
            <View style={styles.combinedFieldGroup}>
              <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                VENUE
              </Text>
              <Text style={[styles.infoMainText, { color: colors.cardForeground, fontSize: typography.fontSize.base }]}>
                {venueContact?.name || event.venueId || 'Sydney Showground (Hall 5 & Dock 2)'}
              </Text>
              <Text style={[styles.addressText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm, marginVertical: 4 }]}>
                {venueContact?.fullAddress || '1 Showground Rd, Sydney Olympic Park NSW 2127'}
              </Text>

              <Button
                variant="outline"
                size="sm"
                icon={<ExternalLink size={14} color={colors.foreground} />}
                onPress={() => handleOpenMaps(venueContact?.fullAddress || '1 Showground Rd, Sydney Olympic Park NSW 2127')}
                style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }}
                testID="open-maps-btn"
              >
                Open in Maps
              </Button>
            </View>
          </CardContent>
        </Card>

        {/* Operational Notes Card */}
        {event.notes ? (
          <Card style={styles.sectionCard}>
            <CardHeader style={styles.sectionHeader}>
              <View style={styles.headerTitleRow}>
                <FileText size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: typography.fontSize.md }]}>
                  Production Notes
                </Text>
              </View>
            </CardHeader>
            <CardContent style={styles.cardContentNoTop}>
              <Text style={[styles.notesText, { color: colors.cardForeground, fontSize: typography.fontSize.sm }]}>
                {event.notes}
              </Text>
            </CardContent>
          </Card>
        ) : null}
      </ScrollView>

      {/* Persistent Bottom Action Bar */}
      <View style={[styles.bottomActionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Button
          variant="secondary"
          size="default"
          icon={<FileSpreadsheet size={16} color={colors.secondaryForeground} />}
          onPress={() => router.push(`/pullsheet/${event.id}`)}
          style={styles.bottomBarBtn}
          testID="event-details-pullsheet-btn"
        >
          Pull Sheet
        </Button>

        <Button
          variant="primary"
          size="default"
          icon={<QrCode size={16} color={colors.primaryForeground} />}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/scanner',
              params: { eventId: event.id },
            })
          }
          style={styles.bottomBarBtn}
          testID="event-details-scan-btn"
        >
          Scan Gear
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  errorTitle: {
    fontFamily: 'Calibri',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  errorSubtitle: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    marginBottom: 16,
  },
  sectionHeader: {
    paddingBottom: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  cardContentNoTop: {
    paddingTop: 4,
  },
  combinedFieldGroup: {
    gap: 2,
  },
  fieldSubLabel: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  infoMainText: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  addressText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
  },
  notesText: {
    fontFamily: 'Calibri',
    fontSize: 14,
    lineHeight: 20,
  },
  bottomActionBar: {
    padding: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
  },
  bottomBarBtn: {
    flex: 1,
    minHeight: 48,
  },
});
