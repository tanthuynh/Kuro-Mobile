/**
 * src/components/logistics/LogisticsDestinationCard.tsx
 * Interactive Destination Stop Card in Kuro Mobile.
 * Displays stop sequence badge, venue name, address, contact, distance/time,
 * and 1-tap smart action buttons: "Open in Maps" and "Call Contact".
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import * as Linking from 'expo-linking';
import {
  MapPin,
  Phone,
  Clock,
  FileText,
  ExternalLink,
  Navigation,
  Compass,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildMapsUrl, buildPhoneUrl } from '@/lib/logistics-engine';
import type { LogisticsDestination } from '@/types/logistics';

export interface LogisticsDestinationCardProps {
  destination: LogisticsDestination;
  index: number;
  totalStops?: number;
  testID?: string;
}

export function LogisticsDestinationCard({
  destination,
  index,
  totalStops,
  testID = `destination-card-${destination.id || index}`,
}: LogisticsDestinationCardProps) {
  const { colors, typography, spacing, layout } = useTheme();

  const isNoteType = destination.type === 'note';
  const stopLabel = isNoteType ? 'Itinerary Note' : `Stop ${index + 1}`;

  const mapsUrl = buildMapsUrl(destination.address, destination.destinationName);
  const phoneUrl = buildPhoneUrl(destination.contact);

  const handleOpenMaps = async () => {
    if (mapsUrl) {
      try {
        await Linking.openURL(mapsUrl);
      } catch (err) {
        console.error('[LogisticsDestinationCard] Failed to open maps URL:', err);
      }
    }
  };

  const handleCallContact = async () => {
    if (phoneUrl) {
      try {
        await Linking.openURL(phoneUrl);
      } catch (err) {
        console.error('[LogisticsDestinationCard] Failed to open dialer URL:', err);
      }
    }
  };

  return (
    <Card style={styles.card} testID={testID}>
      <CardContent style={styles.content}>
        {/* Header Row: Stop Sequence & Timing */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Badge
              variant={isNoteType ? 'secondary' : 'brand'}
              icon={isNoteType ? <FileText size={11} color={colors.secondaryForeground} /> : <MapPin size={11} color={colors.primary} />}
              testID={`stop-badge-${destination.id || index}`}
            >
              {stopLabel}
            </Badge>

            {destination.time ? (
              <View style={styles.timeTag}>
                <Clock size={12} color={colors.mutedForeground} />
                <Text style={[styles.timeTagText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                  {destination.time}
                </Text>
              </View>
            ) : null}
          </View>

          {destination.distance || destination.estTravelTime ? (
            <View style={styles.distanceBadge}>
              <Compass size={11} color={colors.mutedForeground} />
              <Text style={[styles.distanceText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                {[destination.distance, destination.estTravelTime].filter(Boolean).join(' • ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Destination Name */}
        <View style={styles.nameSection}>
          <Text style={[styles.destinationName, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
            {destination.destinationName || destination.address || 'Destination'}
          </Text>
        </View>

        {/* Address */}
        {destination.address ? (
          <View style={styles.addressRow}>
            <MapPin size={14} color={colors.primary} style={{ marginTop: 2 }} />
            <Text style={[styles.addressText, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
              {destination.address}
            </Text>
          </View>
        ) : null}

        {/* Contact Info */}
        {destination.contact ? (
          <View style={styles.contactRow}>
            <Phone size={13} color={colors.mutedForeground} style={{ marginTop: 2 }} />
            <Text style={[styles.contactText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              {destination.contact}
            </Text>
          </View>
        ) : null}

        {/* Detail Note */}
        {destination.detailNote ? (
          <View style={[styles.noteBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.noteText, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
              {destination.detailNote}
            </Text>
          </View>
        ) : null}

        {/* 1-Tap Smart Actions Bar */}
        <View style={[styles.actionsBar, { borderTopColor: colors.border }]}>
          {/* 1-Tap Open in Maps */}
          <Button
            variant="outline"
            size="sm"
            icon={<Navigation size={14} color={mapsUrl ? colors.primary : colors.mutedForeground} />}
            onPress={handleOpenMaps}
            disabled={!mapsUrl}
            style={styles.actionButton}
            testID={`open-maps-btn-${destination.id || index}`}
            accessibilityLabel={`Open ${destination.destinationName || 'destination'} in Google Maps`}
          >
            Open in Maps
          </Button>

          {/* 1-Tap Call Contact */}
          <Button
            variant="outline"
            size="sm"
            icon={<Phone size={14} color={phoneUrl ? colors.status.online : colors.mutedForeground} />}
            onPress={handleCallContact}
            disabled={!phoneUrl}
            style={styles.actionButton}
            testID={`call-contact-btn-${destination.id || index}`}
            accessibilityLabel={`Call contact ${destination.contact || ''}`}
          >
            Call Contact
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: 10,
  },
  content: {
    padding: 14,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeTagText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  nameSection: {
    marginTop: 2,
  },
  destinationName: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  addressText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  contactText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
    lineHeight: 18,
  },
  noteBox: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 2,
  },
  noteText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  actionsBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    flex: 1,
  },
});
