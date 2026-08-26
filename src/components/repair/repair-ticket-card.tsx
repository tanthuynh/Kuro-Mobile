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
  Image as ImageIcon,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { REPAIR_STATUS_CONFIG } from '@/lib/repair-engine';
import type { RepairTicket, RepairStatus, RepairPriority, EquipmentCondition } from '@/types/repair';

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
          {/* Top Row: [Ticket Number] Inventory Name & Status on right */}
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
              <Badge variant={statusConfig.badgeVariant as BadgeVariant}>
                {ticket.status}
              </Badge>
            </View>
          </View>

          {/* 2nd Row: Priority, Condition, Photos | Owner, Requester */}
          <View style={styles.secondRow}>
            <View style={styles.badgesGroup}>
              {ticket.priority && ticket.priority !== 'None' ? (
                <Badge variant={getPriorityVariant(ticket.priority)}>
                  {ticket.priority}
                </Badge>
              ) : null}

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
                  {condition}
                </Text>
              </View>

              {/* Photo indicator */}
              {photoCount > 0 ? (
                <View style={styles.metaPill}>
                  <ImageIcon size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaPillText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    {photoCount}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.peopleGroup}>
              <Text
                style={[styles.personText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}
                numberOfLines={1}
              >
                {ticket.owner ? `${ticket.owner} • ` : ''}{ticket.requestedBy || 'Unknown'}
              </Text>
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
  secondRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgesGroup: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  conditionPill: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
  },
  conditionText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  metaPill: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  metaPillText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  peopleGroup: {
    flex: 1,
    alignItems: 'flex-end',
    paddingLeft: 12,
  },
  personText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
});
