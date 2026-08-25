/**
 * app/repair/[id].tsx
 * Repair Ticket Detail Screen in Kuro Mobile.
 * Displays comprehensive equipment specs, photo evidence gallery, parts used,
 * 1-tap quick status transitions, and chronological audit action logs.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Wrench,
  ShieldAlert,
  CheckCircle2,
  Clock,
  User,
  Package,
  Layers,
  MapPin,
  AlertTriangle,
  FileText,
  Activity,
  Plus,
  Coins,
  History,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { useSingleTicket } from '@/hooks/use-tickets';
import { HapticService } from '@/services/haptic-service';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RepairPhotoGallery } from '@/components/repair/repair-photo-gallery';
import { QuickStatusSelector } from '@/components/repair/quick-status-selector';
import { AddActionNoteModal } from '@/components/repair/add-action-note-modal';
import { REPAIR_STATUS_CONFIG, calculateRepairCostTotal } from '@/lib/repair-engine';
import { formatTimeAgo, formatDate } from '@/lib/date-utils';
import type { RepairStatus, RepairPriority, RepairTicket } from '@/types/repair';

export default function RepairTicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = Array.isArray(id) ? id[0] : id || '';

  const router = useRouter();
  const { colors, typography, spacing, layout } = useTheme();
  const { user } = useAuth();

  const {
    ticket,
    loading,
    error,
    refresh,
    updateStatus,
    appendAction,
    appendNote,
  } = useSingleTicket(ticketId);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStatusChange = async (newStatus: RepairStatus) => {
    if (!ticket) return;
    try {
      setIsUpdatingStatus(true);
      setActionError(null);
      await updateStatus(newStatus);
      await HapticService.scanSuccess();
    } catch (err: any) {
      console.error('[RepairDetail] Status update error:', err);
      setActionError(err?.message || 'Failed to update status');
      await HapticService.scanError();
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAddActionNote = async (content: string, type: 'action' | 'note') => {
    if (!ticket) return;
    try {
      setIsSubmittingNote(true);
      setActionError(null);
      if (type === 'action') {
        await appendAction(content);
      } else {
        await appendNote(content);
      }
      await HapticService.scanSuccess();
    } catch (err: any) {
      console.error('[RepairDetail] Add note error:', err);
      setActionError(err?.message || 'Failed to append note/action');
      await HapticService.scanError();
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const getPriorityVariant = (priority?: RepairPriority): BadgeVariant => {
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

  if (loading && !ticket) {
    return (
      <View style={[styles.screen, styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 12 }]}>
          Loading repair ticket details...
        </Text>
      </View>
    );
  }

  if (error || !ticket) {
    return (
      <View style={[styles.screen, styles.centerContainer, { backgroundColor: colors.background }]}>
        <AlertTriangle size={36} color={colors.destructive} />
        <Text style={[styles.errorTitle, { color: colors.foreground, marginTop: 12, fontSize: typography.fontSize.base }]}>
          Ticket Not Found
        </Text>
        <Text style={[styles.errorSub, { color: colors.mutedForeground, marginTop: 4, fontSize: typography.fontSize.xs }]}>
          {error?.message || 'The requested repair ticket could not be loaded.'}
        </Text>
        <Button
          variant="outline"
          size="default"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
        >
          Go Back
        </Button>
      </View>
    );
  }

  const statusConfig = REPAIR_STATUS_CONFIG[ticket.status] || {
    label: ticket.status,
    badgeVariant: 'secondary',
  };

  const isOutOfService =
    ticket.condition === 'Out of Service' ||
    ticket.status === 'Under Repair' ||
    ticket.status === 'Awaiting Parts';

  const repairNumDisplay = ticket.repairNumber
    ? `#REP-${ticket.repairNumber}`
    : `#${ticket.id.substring(0, 7).toUpperCase()}`;

  const totalPartsCost = calculateRepairCostTotal(ticket.partsUsed || []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <ScreenHeader
        title={repairNumDisplay}
        subtitle={ticket.equipment?.name || 'Equipment Repair'}
        leftAction={
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            testID="ticket-detail-back-btn"
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </Pressable>
        }
        rightAction={
          <Button
            variant="outline"
            size="sm"
            icon={<Plus size={14} color={colors.primary} />}
            onPress={() => setIsModalOpen(true)}
            testID="detail-add-action-btn"
          >
            Add Log
          </Button>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        {/* Top Status & Priority Hero Card */}
        <Card style={styles.card} testID="ticket-hero-card">
          <CardContent style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroLeft}>
                <Text style={[styles.heroEquipmentName, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
                  {ticket.equipment?.name || 'Unknown Equipment'}
                </Text>
                <Text style={[styles.heroSubText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Created {formatDate(ticket.createdAt || new Date())} ({formatTimeAgo(ticket.createdAt || new Date())})
                </Text>
              </View>

              <View style={styles.heroBadges}>
                {ticket.priority && ticket.priority !== 'None' ? (
                  <Badge variant={getPriorityVariant(ticket.priority)}>
                    {ticket.priority} Priority
                  </Badge>
                ) : null}

                <Badge variant={statusConfig.badgeVariant as BadgeVariant}>
                  {ticket.status}
                </Badge>
              </View>
            </View>

            {/* Condition Banner */}
            <View
              style={[
                styles.conditionBanner,
                {
                  backgroundColor: isOutOfService
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(16, 185, 129, 0.15)',
                  borderColor: isOutOfService
                    ? 'rgba(239, 68, 68, 0.35)'
                    : 'rgba(16, 185, 129, 0.35)',
                },
              ]}
              testID="ticket-condition-banner"
            >
              {isOutOfService ? (
                <ShieldAlert size={16} color={colors.destructive} />
              ) : (
                <CheckCircle2 size={16} color={colors.status.online} />
              )}
              <View style={styles.conditionBannerText}>
                <Text
                  style={[
                    styles.conditionBannerTitle,
                    {
                      color: isOutOfService ? colors.destructive : colors.status.online,
                      fontSize: typography.fontSize.xs,
                    },
                  ]}
                >
                  Operational Condition: {isOutOfService ? 'Out of Service' : 'Available to Use'}
                </Text>
                <Text style={[styles.conditionBannerSub, { color: colors.mutedForeground, fontSize: 10 }]}>
                  {isOutOfService
                    ? 'Locked from prep & dispatch in inventory availability ledger'
                    : 'Asset marked operational and cleared for event allocation'}
                </Text>
              </View>
            </View>

            {/* 1-Tap Quick Status Transitions */}
            <QuickStatusSelector
              currentStatus={ticket.status}
              onSelectStatus={handleStatusChange}
              isUpdating={isUpdatingStatus}
              testID="detail-quick-status-selector"
            />
          </CardContent>
        </Card>

        {/* Equipment Specifications Card */}
        <Card style={styles.card} testID="equipment-specs-card">
          <CardHeader style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Package size={16} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                Equipment Specifications
              </Text>
            </View>
          </CardHeader>

          <CardContent style={styles.specsGrid}>
            {ticket.equipment?.category ? (
              <View style={styles.specItem}>
                <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Category
                </Text>
                <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                  {ticket.equipment.category}
                </Text>
              </View>
            ) : null}

            {ticket.equipment?.serialNumber ? (
              <View style={styles.specItem}>
                <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Serial Number
                </Text>
                <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                  {ticket.equipment.serialNumber}
                </Text>
              </View>
            ) : null}

            {ticket.equipment?.barcode ? (
              <View style={styles.specItem}>
                <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Barcode / Asset #
                </Text>
                <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                  {`#${ticket.equipment.barcode}`}
                </Text>
              </View>
            ) : null}

            {ticket.equipment?.knownLocation ? (
              <View style={styles.specItem}>
                <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Warehouse Location
                </Text>
                <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                  {ticket.equipment.knownLocation}
                </Text>
              </View>
            ) : null}

            <View style={styles.specItem}>
              <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Assignee
              </Text>
              <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {ticket.assignee?.name || 'Unassigned'}
              </Text>
            </View>

            <View style={styles.specItem}>
              <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Reported By
              </Text>
              <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {ticket.requestedBy || 'Warehouse Tech'}
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Damage Photos & Gallery Card */}
        <Card style={styles.card} testID="ticket-photos-card">
          <CardContent style={styles.cardContent}>
            <RepairPhotoGallery
              photos={ticket.attachments || []}
              editable={false}
              title="Damage Photos & Evidence"
              testID="ticket-photo-gallery"
            />
          </CardContent>
        </Card>

        {/* Parts Used Section */}
        {ticket.partsUsed && ticket.partsUsed.length > 0 ? (
          <Card style={styles.card} testID="ticket-parts-card">
            <CardHeader style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Coins size={16} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                  Parts Used ({ticket.partsUsed.length})
                </Text>
              </View>
              {totalPartsCost > 0 ? (
                <Badge variant="brand">{`$${totalPartsCost.toFixed(2)}`}</Badge>
              ) : null}
            </CardHeader>

            <CardContent style={styles.cardContent}>
              {ticket.partsUsed.map((part, index) => (
                <View key={part.id || `part-${index}`} style={[styles.partRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.partName, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                      {part.name}
                    </Text>
                    {part.notes ? (
                      <Text style={[styles.partNotes, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                        {part.notes}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.partCostGroup}>
                    <Text style={[styles.partQty, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                      {`Qty: ${part.quantity}`}
                    </Text>
                    <Text style={[styles.partCost, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                      {`$${((part.cost || 0) * (part.quantity || 1)).toFixed(2)}`}
                    </Text>
                  </View>
                </View>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Audit Action Logs & Notes */}
        <Card style={styles.card} testID="ticket-actions-card">
          <CardHeader style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <History size={16} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                Technician Action Log & Audit Trail ({ticket.actions?.length || 0})
              </Text>
            </View>
          </CardHeader>

          <CardContent style={styles.cardContent}>
            {!ticket.actions || ticket.actions.length === 0 ? (
              <View style={styles.emptyActions}>
                <Text style={[styles.emptyActionsText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  No action logs recorded yet.
                </Text>
              </View>
            ) : (
              <View style={styles.timeline}>
                {ticket.actions.map((act, index) => {
                  const isLast = index === ticket.actions!.length - 1;
                  return (
                    <View key={act.id || `act-${index}`} style={styles.timelineItem}>
                      <View style={styles.timelineLeftCol}>
                        <View style={[styles.timelineNode, { backgroundColor: colors.primary }]} />
                        {!isLast ? (
                          <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
                        ) : null}
                      </View>

                      <View style={[styles.timelineContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.timelineHeader}>
                          <Text style={[styles.actionAuthor, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                            {act.user?.name || 'Technician'}
                          </Text>
                          <Text style={[styles.actionTime, { color: colors.mutedForeground, fontSize: 10 }]}>
                            {formatTimeAgo(act.timestamp)}
                          </Text>
                        </View>
                        <Text style={[styles.actionText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                          {act.action}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </CardContent>
        </Card>
      </ScrollView>

      {/* Add Action Note Modal Sheet */}
      <AddActionNoteModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddActionNote}
        userName={user?.name || 'Technician'}
        isSubmitting={isSubmittingNote}
        testID="ticket-action-note-modal"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontWeight: '500',
  },
  errorTitle: {
    fontWeight: '700',
  },
  errorSub: {
    textAlign: 'center',
  },
  backBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    borderRadius: 12,
  },
  heroContent: {
    padding: 14,
    gap: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLeft: {
    flex: 1,
    marginRight: 8,
  },
  heroEquipmentName: {
    fontWeight: '800',
  },
  heroSubText: {
    marginTop: 2,
  },
  heroBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  conditionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  conditionBannerText: {
    flex: 1,
  },
  conditionBannerTitle: {
    fontWeight: '700',
  },
  conditionBannerSub: {
    marginTop: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontWeight: '700',
  },
  cardContent: {
    padding: 14,
  },
  specsGrid: {
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  specItem: {
    width: '46%',
  },
  specLabel: {
    fontWeight: '500',
  },
  specValue: {
    fontWeight: '600',
    marginTop: 1,
  },
  partRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  partName: {
    fontWeight: '600',
  },
  partNotes: {
    marginTop: 2,
  },
  partCostGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  partQty: {},
  partCost: {
    fontWeight: '700',
  },
  emptyActions: {
    paddingVertical: 8,
  },
  emptyActionsText: {
    fontStyle: 'italic',
  },
  timeline: {
    gap: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineLeftCol: {
    alignItems: 'center',
    width: 14,
  },
  timelineNode: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  actionAuthor: {
    fontWeight: '700',
  },
  actionTime: {},
  actionText: {
    lineHeight: 18,
  },
});
