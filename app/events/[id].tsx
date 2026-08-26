/**
 * app/events/[id].tsx
 * Event Details Screen in Kuro Mobile.
 * Full operational view including stage schedule timeline, client/venue details,
 * notes, and direct entry into Mobile Pull Sheet & Prep Continuous Scanner.
 */

import React from 'react';
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
  Phone,
  Mail,
  User,
  ExternalLink,
  FileSpreadsheet,
  QrCode,
  FileText,
  Package,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useSingleEvent } from '@/hooks/use-events';
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

  const handleCall = (phone?: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch((err) => {
      console.warn('Could not open phone dialer:', err);
    });
  };

  const handleEmail = (email?: string) => {
    if (!email) return;
    Linking.openURL(`mailto:${email}`).catch((err) => {
      console.warn('Could not open mail client:', err);
    });
  };

  const handleOpenMaps = (address?: string) => {
    if (!address) return;
    const query = encodeURIComponent(address);
    Linking.openURL(`https://maps.google.com/?q=${query}`).catch((err) => {
      console.warn('Could not open maps:', err);
    });
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
        <Button variant="outline" onPress={() => router.back()}>
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
        subtitle={event.eventNumber ? `Event #${event.eventNumber}` : 'Production Event'}
        leftAction={
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="event-details-back-btn"
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
        }
        rightAction={
          <Badge variant={getStatusVariant(event.eventStatusId)}>
            {event.eventStatusId}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}>
        {/* Main CTA Banner: Open Pull Sheet & Continuous Scanner */}
        <Card style={[styles.ctaCard, { backgroundColor: colors.brandGreenScale.green2, borderColor: colors.brandGreenScale.green4 }]}>
          <CardContent style={styles.ctaCardContent}>
            <View style={styles.ctaTextCol}>
              <Text style={[styles.ctaTitle, { color: colors.foreground, fontSize: typography.fontSize.md }]}>
                Warehouse Operations
              </Text>
              <Text style={[styles.ctaSubtitle, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                {event.equipmentItems?.length || 0} line items listed on quote
              </Text>
            </View>

            <View style={styles.ctaButtonsRow}>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileSpreadsheet size={16} color={colors.secondaryForeground} />}
                onPress={() => router.push(`/pullsheet/${event.id}`)}
                style={styles.ctaBtn}
                testID="event-details-pullsheet-btn"
              >
                Pull Sheet
              </Button>

              <Button
                variant="primary"
                size="sm"
                icon={<QrCode size={16} color={colors.primaryForeground} />}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/scanner',
                    params: { eventId: event.id },
                  })
                }
                style={styles.ctaBtn}
                testID="event-details-scan-btn"
              >
                Scan Gear
              </Button>
            </View>
          </CardContent>
        </Card>

        {/* Schedule Timeline Stepper */}
        <EventScheduleCard event={event} />

        {/* Client Contact Details Card */}
        <Card style={styles.sectionCard}>
          <CardHeader style={styles.sectionHeader}>
            <View style={styles.headerTitleRow}>
              <User size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: typography.fontSize.md }]}>
                Client & Production Lead
              </Text>
            </View>
          </CardHeader>
          <CardContent style={styles.cardContentNoTop}>
            <Text style={[styles.infoMainText, { color: colors.cardForeground, fontSize: typography.fontSize.base }]}>
              {event.clientId || 'Client Direct'}
            </Text>

            <View style={styles.actionRow}>
              <Button
                variant="outline"
                size="sm"
                icon={<Phone size={14} color={colors.foreground} />}
                onPress={() => handleCall('+61 2 9000 1234')}
                style={styles.contactActionBtn}
              >
                Call Lead
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon={<Mail size={14} color={colors.foreground} />}
                onPress={() => handleEmail('production@kuroevent.io')}
                style={styles.contactActionBtn}
              >
                Email
              </Button>
            </View>
          </CardContent>
        </Card>

        {/* Venue & Location Logistics Card */}
        <Card style={styles.sectionCard}>
          <CardHeader style={styles.sectionHeader}>
            <View style={styles.headerTitleRow}>
              <MapPin size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: typography.fontSize.md }]}>
                Venue & Dock Location
              </Text>
            </View>
          </CardHeader>
          <CardContent style={styles.cardContentNoTop}>
            <Text style={[styles.infoMainText, { color: colors.cardForeground, fontSize: typography.fontSize.base }]}>
              {event.venueId || 'Sydney Showground (Hall 5 & Dock 2)'}
            </Text>
            <Text style={[styles.addressText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs, marginVertical: 4 }]}>
              1 Showground Rd, Sydney Olympic Park NSW 2127
            </Text>

            <Button
              variant="outline"
              size="sm"
              icon={<ExternalLink size={14} color={colors.foreground} />}
              onPress={() => handleOpenMaps('1 Showground Rd, Sydney Olympic Park NSW 2127')}
              style={{ marginTop: spacing.sm }}
            >
              Open in Maps
            </Button>
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

        {/* Primary Bottom Action */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={<FileSpreadsheet size={18} color={colors.primaryForeground} />}
          onPress={() => router.push(`/pullsheet/${event.id}`)}
          style={{ marginTop: spacing.md }}
          testID="open-pullsheet-bottom-btn"
        >
          Open Pull Sheet & Scan Gear
        </Button>
      </ScrollView>
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
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  errorSubtitle: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
  },
  ctaCard: {
    marginBottom: 16,
    borderWidth: 1,
  },
  ctaCardContent: {
    gap: 12,
  },
  ctaTextCol: {},
  ctaTitle: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  ctaSubtitle: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  ctaButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ctaBtn: {
    flex: 1,
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
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  cardContentNoTop: {
    paddingTop: 4,
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
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  contactActionBtn: {
    flex: 1,
  },
  notesText: {
    fontFamily: 'Calibri',
    fontSize: 14,
    lineHeight: 20,
  },
});
