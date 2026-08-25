/**
 * src/components/repair/repair-ticket-card.tsx
 * High-Contrast Repair Ticket Feed Item Card in Kuro Mobile.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Wrench,
  AlertTriangle,
  Clock,
  User,
  Image as ImageIcon,
  ChevronRight,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { formatTimeAgo } from '@/lib/date-utils';
import { REPAIR_STATUS_CONFIG } from '@/lib/repair-engine';
import type { RepairTicket, RepairStatus, RepairPriority } from '@/types/repair';

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
  const { colors, typography, spacing, layout } = useTheme();
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
    badgeVariant: 'secondary',
  };

  const getPriorityVariant = (priority: RepairPriority): BadgeVariant => {
    switch (priority) {
      case 'Critical':
        return 'destructive';
      case 'High':
        return 'destructive';
      case 'Medium':
        return 'warning';
      case 'Low':
        return 'info';
      case 'Deferred':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const isOutOfService = ticket.condition === 'Out of Service' ||
    ticket.status === 'Under Repair' ||
    ticket.status === 'Awaiting Parts';

  const repairNumDisplay = ticket.repairNumber
    ? `#REP-${ticket.repairNumber}`
    : ticket.id
    ? `#${ticket.id.substring(0, 7).toUpperCase()}`
    : '#REP';

  const timeAgo = formatTimeAgo(ticket.createdAt || ticket.updatedAt || new Date());
  const photoCount = Array.isArray(ticket.attachments) ? ticket.attachments.length : 0;
  const actionsCount = Array.isArray(ticket.actions) ? ticket.actions.length : 0;

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
          {/* Top Row: Ticket Number & Status / Priority */}
          <View style={styles.topRow}>
            <View style={styles.ticketIdBadge}>
              <Wrench size={13} color={colors.primary} />
              <Text style={[styles.ticketIdText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                {repairNumDisplay}
              </Text>
            </View>

            <View style={styles.badgesGroup}>
              {ticket.priority && ticket.priority !== 'None' ? (
                <Badge variant={getPriorityVariant(ticket.priority)}>
                  {ticket.priority}
                </Badge>
              ) : null}

              <Badge variant={statusConfig.badgeVariant as BadgeVariant}>
                {ticket.status}
              </Badge>
            </View>
          </View>

          {/* Equipment Name & Serial */}
          <View style={styles.equipmentSection}>
            <Text
              style={[styles.equipmentName, { color: colors.foreground, fontSize: typography.fontSize.base }]}
              numberOfLines={1}
            >
              {ticket.equipment?.name || 'Unknown Asset'}
            </Text>

            <View style={styles.equipmentMetaRow}>
              {ticket.equipment?.category ? (
                <Text style={[styles.categoryText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  {ticket.equipment.category}
                </Text>
              ) : null}

              {ticket.equipment?.serialNumber ? (
                <Text style={[styles.serialText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  • SN: {ticket.equipment.serialNumber}
                </Text>
              ) : ticket.equipment?.barcode ? (
                <Text style={[styles.serialText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  • #{ticket.equipment.barcode}
                </Text>
              ) : null}

              {ticket.equipment?.knownLocation ? (
                <Text style={[styles.serialText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  • Loc: {ticket.equipment.knownLocation}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Fault / Problem Description Preview */}
          {ticket.repairType || (ticket.notes && ticket.notes.length > 0) ? (
            <View style={[styles.faultPreviewBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text
                style={[styles.faultText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                numberOfLines={2}
              >
                {ticket.repairType ? `[${ticket.repairType}] ` : ''}
                {ticket.notes && ticket.notes.length > 0
                  ? ticket.notes[ticket.notes.length - 1].content
                  : 'Fault logged'}
              </Text>
            </View>
          ) : null}

          {/* Bottom Row: Condition, Photos, Assignee & Time */}
          <View style={styles.bottomRow}>
            <View style={styles.bottomLeft}>
              {/* Operational Condition Pill */}
              <View
                style={[
                  styles.conditionPill,
                  {
                    backgroundColor: isOutOfService
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(16, 185, 129, 0.15)',
                    borderColor: isOutOfService
                      ? 'rgba(239, 68, 68, 0.35)'
                      : 'rgba(16, 185, 129, 0.35)',
                  },
                ]}
              >
                {isOutOfService ? (
                  <ShieldAlert size={11} color={colors.destructive} />
                ) : (
                  <CheckCircle2 size={11} color={colors.status.online} />
                )}
                <Text
                  style={[
                    styles.conditionText,
                    {
                      color: isOutOfService ? colors.destructive : colors.status.online,
                      fontSize: typography.fontSize.xs,
                    },
                  ]}
                >
                  {isOutOfService ? 'Out of Service' : 'Available'}
                </Text>
              </View>

              {/* Photo indicator */}
              {photoCount > 0 ? (
                <View style={styles.metaPill}>
                  <ImageIcon size={12} color={colors.mutedForeground} />
                  <Text style={[styles.metaPillText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    {photoCount}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.bottomRight}>
              <View style={styles.assigneeRow}>
                <User size={12} color={colors.mutedForeground} />
                <Text
                  style={[styles.assigneeText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}
                  numberOfLines={1}
                >
                  {ticket.assignee?.name || ticket.requestedBy || 'Unassigned'}
                </Text>
              </View>

              <View style={styles.timeRow}>
                <Clock size={11} color={colors.mutedForeground} />
                <Text style={[styles.timeText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  {timeAgo}
                </Text>
              </View>

              <ChevronRight size={14} color={colors.mutedForeground} />
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
  ticketIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ticketIdText: {
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  badgesGroup: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  equipmentSection: {
    marginTop: 2,
  },
  equipmentName: {
    fontWeight: '700',
  },
  equipmentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
    gap: 4,
  },
  categoryText: {
    fontWeight: '500',
  },
  serialText: {
    fontWeight: '400',
  },
  faultPreviewBox: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 2,
  },
  faultText: {
    fontStyle: 'italic',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  bottomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  conditionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  conditionText: {
    fontWeight: '600',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaPillText: {
    fontWeight: '500',
  },
  bottomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 90,
  },
  assigneeText: {
    fontWeight: '500',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  timeText: {},
});
