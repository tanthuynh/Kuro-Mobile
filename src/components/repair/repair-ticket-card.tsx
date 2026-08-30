/**
 * src/components/repair/repair-ticket-card.tsx
 * High-Contrast Repair Ticket Feed Item Card in Kuro Mobile.
 * Displays Priority and Condition as clean normal text instead of badge pills.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Image as ImageIcon,
  Users,
  UserCheck,
  LayoutGrid,
  Activity,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { REPAIR_STATUS_CONFIG } from '@/lib/repair-engine';
import type { RepairTicket, RepairPriority, EquipmentCondition } from '@/types/repair';

export interface RepairTicketCardProps {
  ticket: RepairTicket;
  onPress?: (ticket: RepairTicket) => void;
  testID?: string;
}

export function RepairTicketCard({
  ticket,
  onPress,
  testID = `repair-card-${ticket.id}`,
}: RepairTicketCardProps) {
  const { colors, typography, isDark } = useTheme();
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress(ticket);
    } else {
      router.push(`/repair/${ticket.id}`);
    }
  };

  const statusConfig = REPAIR_STATUS_CONFIG[ticket.status] || {
    label: ticket.status,
    color: colors.foreground,
    bgColor: colors.surface,
    borderColor: colors.border,
  };

  const statusBg = isDark
    ? `${statusConfig.color}22`
    : `${statusConfig.color}15`;

  const condition: EquipmentCondition = ticket.condition === 'Available to Use'
    ? 'Available to Use'
    : 'Out of Service';

  const isOutOfService = condition === 'Out of Service';

  const repairNumDisplay =
    ticket.repairNumber !== undefined && ticket.repairNumber !== null
      ? `[${ticket.repairNumber}]`
      : ticket.id
      ? `[${ticket.id.substring(0, 7).toUpperCase()}]`
      : '[REP]';

  const photoCount = Array.isArray(ticket.attachments) ? ticket.attachments.length : 0;

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
        accessibilityLabel={`Repair ticket ${repairNumDisplay} for ${ticket.equipment?.name || 'Equipment'}`}
      >
        <CardContent style={styles.content}>
          {/* Top Row: [Ticket Number] Equipment Name & Status Badge on right */}
          <View style={styles.topRow}>
            <View style={styles.ticketTitleContainer}>
              <Text style={[styles.ticketIdText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                {repairNumDisplay}
              </Text>
              <Text 
                style={[styles.equipmentName, { color: colors.foreground, fontSize: typography.fontSize.sm, flexShrink: 1, marginLeft: 6 }]} 
                numberOfLines={1}
              >
                {ticket.equipment?.name || 'Unknown Asset'}
              </Text>
            </View>

            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: statusBg,
                    borderColor: statusConfig.color,
                  },
                ]}
                testID={`card-status-badge-${ticket.status.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color: statusConfig.color,
                    },
                  ]}
                >
                  {ticket.status}
                </Text>
              </View>
            </View>
          </View>

          {/* 2nd Row: Priority (grey text with icon), Condition (grey text with icon), Images Count | Owner & Requested By with icons */}
          <View style={styles.secondRow}>
            <View style={styles.cleanTextMetaGroup}>
              {ticket.priority && ticket.priority !== 'None' ? (
                <View style={styles.metaItem}>
                  <LayoutGrid size={12} color={colors.mutedForeground} />
                  <Text
                    style={[
                      styles.priorityText,
                      { color: colors.mutedForeground, fontSize: typography.fontSize.xs },
                    ]}
                    testID={`card-priority-${ticket.priority.toLowerCase()}`}
                  >
                    {ticket.priority}
                  </Text>
                </View>
              ) : null}

              {ticket.priority && ticket.priority !== 'None' ? (
                <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
              ) : null}

              {/* Operational Condition Clean Grey Text with Icon */}
              <View
                style={styles.conditionTextGroup}
                testID={`card-condition-${isOutOfService ? 'out-of-service' : 'available'}`}
              >
                <Activity size={12} color={colors.mutedForeground} />
                <Text
                  style={[
                    styles.conditionText,
                    {
                      color: colors.mutedForeground,
                      fontSize: typography.fontSize.xs,
                    },
                  ]}
                >
                  {condition}
                </Text>
              </View>

              {/* Photo / Images indicator */}
              {photoCount > 0 ? (
                <>
                  <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
                  <View style={styles.imagesCountGroup}>
                    <ImageIcon size={11} color={colors.mutedForeground} />
                    <Text style={[styles.imagesCountText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                      {photoCount}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            {/* Owner & Requested By with Web-App Matched Icons */}
            <View style={styles.peopleGroup}>
              {ticket.owner ? (
                <View style={styles.personItem}>
                  <Users size={12} color={colors.mutedForeground} />
                  <Text
                    style={[styles.personText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}
                    numberOfLines={1}
                  >
                    {ticket.owner}
                  </Text>
                </View>
              ) : null}

              {ticket.owner && ticket.requestedBy ? (
                <Text style={[styles.separatorDot, { color: colors.border }]}>•</Text>
              ) : null}

              <View style={styles.personItem}>
                <UserCheck size={12} color={colors.mutedForeground} />
                <Text
                  style={[styles.personText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}
                  numberOfLines={1}
                >
                  {ticket.requestedBy || 'Unknown'}
                </Text>
              </View>
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
  ticketTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  ticketIdText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  equipmentName: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  statusContainer: {
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
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  secondRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cleanTextMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  priorityText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
    lineHeight: 16,
  },
  separatorDot: {
    fontSize: 11,
  },
  conditionTextGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  conditionText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
    lineHeight: 16,
  },
  imagesCountGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  imagesCountText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
    lineHeight: 16,
  },
  peopleGroup: {
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
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
});
