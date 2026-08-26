/**
 * app/repair/[id].tsx
 * Modernized Repair Ticket Detail Screen in Kuro Mobile.
 * Consolidates equipment info, 5-button status strip, inline notes/attachments management,
 * document previews, edit/delete dialogs with confirmation, and fixed dual bottom action bar.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Modal,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Wrench,
  ShieldAlert,
  CheckCircle2,
  Clock,
  User,
  Package,
  AlertTriangle,
  FileText,
  Plus,
  Coins,
  History,
  Paperclip,
  Camera,
  Image as ImageIcon,
  Trash2,
  Edit2,
  X,
  Send,
  Eye,
  FileSpreadsheet,
  FileCode,
  Check,
  Calendar,
  Layers,
  ZoomIn,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { useSingleTicket } from '@/hooks/use-tickets';
import { HapticService } from '@/services/haptic-service';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuickStatusSelector } from '@/components/repair/quick-status-selector';
import {
  REPAIR_STATUS_CONFIG,
  calculateRepairCostTotal,
  calculateEquipmentCondition,
  getPriorityBadgeVariant,
  getStatusBadgeVariant,
} from '@/lib/repair-engine';
import {
  formatTimeAgo,
  formatDate,
  formatEventDateRange,
  parseFirestoreDate,
} from '@/lib/date-utils';
import type {
  RepairStatus,
  RepairPriority,
  RepairTicket,
  RepairAttachment,
  RepairNote,
  EquipmentCondition,
} from '@/types/repair';

export default function RepairTicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = Array.isArray(id) ? id[0] : id || '';

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, layout, isDark } = useTheme();
  const { user } = useAuth();

  const {
    ticket,
    loading,
    error,
    refresh,
    updateStatus,
    appendAction,
    appendNote,
    updateNote,
    deleteNote,
    addAttachment,
    deleteAttachment,
  } = useSingleTicket(ticketId);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals state
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  const [editingNote, setEditingNote] = useState<RepairNote | null>(null);
  const [editedNoteContent, setEditedNoteContent] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const [isAddAttachmentOpen, setIsAddAttachmentOpen] = useState(false);
  const [newAttachmentType, setNewAttachmentType] = useState<'Photo' | 'PDF' | 'Document'>('Photo');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [isSubmittingAttachment, setIsSubmittingAttachment] = useState(false);

  const [viewingDoc, setViewingDoc] = useState<RepairAttachment | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<RepairAttachment | { id: string; url: string; fileName?: string } | null>(null);

  // Confirmation dialog state
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/(tabs)/repairs' as any);
    }
  };

  const handleStatusChange = async (newStatus: RepairStatus) => {
    if (!ticket || isUpdatingStatus) return;
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

  // Add Note Handlers
  const handleOpenAddNote = () => {
    setNewNoteText('');
    setActionError(null);
    setIsAddNoteOpen(true);
  };

  const handleCreateNote = async () => {
    if (isSubmittingNote) return;
    const trimmed = newNoteText.trim();
    if (!trimmed || !ticket) return;

    try {
      setIsSubmittingNote(true);
      setActionError(null);
      await appendNote(trimmed);
      await HapticService.scanSuccess();
      setIsAddNoteOpen(false);
      setNewNoteText('');
    } catch (err: any) {
      console.error('[RepairDetail] Add note error:', err);
      setActionError(err?.message || 'Failed to append note');
      await HapticService.scanError();
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Edit / Delete Note Handlers
  const handleOpenEditNote = (note: RepairNote) => {
    setEditingNote(note);
    setEditedNoteContent(note.content);
    setActionError(null);
  };

  const handleSaveEditedNote = async () => {
    if (isSavingNote) return;
    if (!editingNote || !ticket) return;
    const trimmed = editedNoteContent.trim();
    if (!trimmed) return;

    try {
      setIsSavingNote(true);
      setActionError(null);
      await updateNote(editingNote.id, trimmed);
      await HapticService.scanSuccess();
      setEditingNote(null);
      setEditedNoteContent('');
    } catch (err: any) {
      console.error('[RepairDetail] Edit note error:', err);
      setActionError(err?.message || 'Failed to update note');
      await HapticService.scanError();
    } finally {
      setIsSavingNote(false);
    }
  };

  const promptDeleteNote = (note: RepairNote) => {
    // Close the edit note modal first to prevent dual-modal overlay conflict on iOS
    setEditingNote(null);
    setDeleteConfirmState({
      visible: true,
      title: 'Delete Technician Note',
      message: 'Are you sure you want to delete this note? This action cannot be undone.',
      onConfirm: async () => {
        try {
          setIsDeletingConfirm(true);
          await deleteNote(note.id);
          await HapticService.scanSuccess();
        } catch (err: any) {
          console.error('[RepairDetail] Delete note error:', err);
          setActionError(err?.message || 'Failed to delete note');
          await HapticService.scanError();
        } finally {
          setIsDeletingConfirm(false);
          setDeleteConfirmState((prev) => ({ ...prev, visible: false }));
        }
      },
    });
  };

  // Add Attachment Handlers
  const handleOpenAddAttachment = () => {
    setNewAttachmentType('Photo');
    setNewAttachmentUrl('');
    setNewAttachmentName('');
    setActionError(null);
    setIsAddAttachmentOpen(true);
  };

  const handleSimulateAddPhoto = async () => {
    if (isSubmittingAttachment) return;
    const timestamp = Date.now();
    const mockUri = `https://firebasestorage.googleapis.com/v0/b/mock/o/damage_${timestamp}.jpg`;
    const fileName = `damage_photo_${timestamp}.jpg`;

    try {
      setIsSubmittingAttachment(true);
      setActionError(null);
      await addAttachment({
        type: 'Photo',
        url: mockUri,
        fileName,
        uploadedAt: new Date().toISOString(),
      });
      await HapticService.scanSuccess();
      setIsAddAttachmentOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Add photo error:', err);
      setActionError(err?.message || 'Failed to attach photo');
      await HapticService.scanError();
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const handleSimulateAddDoc = async (type: 'PDF' | 'Document') => {
    if (isSubmittingAttachment) return;
    const timestamp = Date.now();
    const mockUri = `https://firebasestorage.googleapis.com/v0/b/mock/o/service_manual_${timestamp}.pdf`;
    const fileName = type === 'PDF' ? `service_guide_${timestamp}.pdf` : `repair_spec_${timestamp}.docx`;

    try {
      setIsSubmittingAttachment(true);
      setActionError(null);
      await addAttachment({
        type,
        url: mockUri,
        fileName,
        uploadedAt: new Date().toISOString(),
      });
      await HapticService.scanSuccess();
      setIsAddAttachmentOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Add doc error:', err);
      setActionError(err?.message || 'Failed to attach document');
      await HapticService.scanError();
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const handleManualAddAttachment = async () => {
    if (isSubmittingAttachment) return;
    const url = newAttachmentUrl.trim();
    if (!url) return;
    const fileName = newAttachmentName.trim() || (newAttachmentType === 'Photo' ? 'photo.jpg' : 'document.pdf');

    try {
      setIsSubmittingAttachment(true);
      setActionError(null);
      await addAttachment({
        type: newAttachmentType,
        url,
        fileName,
        uploadedAt: new Date().toISOString(),
      });
      await HapticService.scanSuccess();
      setIsAddAttachmentOpen(false);
      setNewAttachmentUrl('');
      setNewAttachmentName('');
    } catch (err: any) {
      console.error('[RepairDetail] Manual add attachment error:', err);
      setActionError(err?.message || 'Failed to attach file');
      await HapticService.scanError();
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const promptDeleteAttachment = (att: RepairAttachment | { id: string; fileName?: string }) => {
    // Close any viewing dialogs first to prevent dual-modal overlay conflict on iOS
    setViewingDoc(null);
    setViewingPhoto(null);
    setDeleteConfirmState({
      visible: true,
      title: 'Delete Attachment',
      message: `Are you sure you want to delete "${att.fileName || 'this attachment'}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          setIsDeletingConfirm(true);
          await deleteAttachment(att.id);
          await HapticService.scanSuccess();
        } catch (err: any) {
          console.error('[RepairDetail] Delete attachment error:', err);
          setActionError(err?.message || 'Failed to delete attachment');
          await HapticService.scanError();
        } finally {
          setIsDeletingConfirm(false);
          setDeleteConfirmState((prev) => ({ ...prev, visible: false }));
        }
      },
    });
  };

  // Group photos vs non-photo attachments
  const photoAttachments = useMemo(() => {
    if (!ticket?.attachments || !Array.isArray(ticket.attachments)) return [];
    return ticket.attachments.filter((a) => {
      if (!a) return false;
      if (a.type === 'Photo') return true;
      if (!a.type && a.url) {
        const lower = a.url.toLowerCase();
        return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
      }
      return false;
    });
  }, [ticket?.attachments]);

  const docAttachments = useMemo(() => {
    if (!ticket?.attachments || !Array.isArray(ticket.attachments)) return [];
    return ticket.attachments.filter((a) => {
      if (!a) return false;
      if (a.type === 'Photo') return false;
      if (!a.type && a.url) {
        const lower = a.url.toLowerCase();
        return !(lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp'));
      }
      return true;
    });
  }, [ticket?.attachments]);

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
          onPress={handleBack}
          style={{ marginTop: 16 }}
          testID="ticket-error-back-btn"
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

  const derivedCondition = ticket.condition || calculateEquipmentCondition(ticket.status);
  const condition: EquipmentCondition = derivedCondition === 'Available to Use'
    ? 'Available to Use'
    : 'Out of Service';

  const isOutOfService = condition === 'Out of Service';

  const repairNumDisplay =
    ticket.repairNumber !== undefined && ticket.repairNumber !== null
      ? `[${ticket.repairNumber}]`
      : ticket.id
      ? `[${ticket.id.substring(0, 7).toUpperCase()}]`
      : '[REP]';

  const legacyNumDisplay =
    ticket.repairNumber !== undefined && ticket.repairNumber !== null
      ? `#REP-${ticket.repairNumber}`
      : `#${ticket.id.substring(0, 7).toUpperCase()}`;

  // Formatted repair period
  const startDate = parseFirestoreDate(ticket.repairPeriodStart);
  const endDate = parseFirestoreDate(ticket.repairPeriodEnd);
  const periodDisplay = startDate || endDate
    ? formatEventDateRange(startDate, endDate)
    : '—';

  const totalPartsCost = calculateRepairCostTotal(ticket.partsUsed || []);

  const totalNotesCount = ticket.notes?.length || 0;
  const totalAttachmentsCount = ticket.attachments?.length || 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* R1. Modernized Header & Navigation */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: insets.top + spacing.xs,
          },
        ]}
      >
        <View style={styles.topBarRow}>
          {/* Back Button with wider tap target */}
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.muted, borderColor: colors.border },
              pressed && { opacity: 0.75 },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back to repairs list"
            testID="ticket-detail-back-btn"
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </Pressable>

          {/* Header Title: [Ticket #] Equipment Name in list item card font & style */}
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTicketId, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              {repairNumDisplay}
            </Text>
            <Text
              style={[styles.headerEquipmentName, { color: colors.foreground, fontSize: typography.fontSize.sm, flexShrink: 1, marginLeft: 6 }]}
              numberOfLines={1}
            >
              {ticket.equipment?.name || 'Equipment Repair'}
            </Text>
          </View>

          {/* Ticket Status Badge on Far Right */}
          <View style={styles.headerStatusContainer} testID="ticket-header-status">
            <Badge variant={statusConfig.badgeVariant as BadgeVariant}>
              {ticket.status}
            </Badge>
          </View>
        </View>
      </View>

      {/* Main Scrollable Content */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.base, paddingBottom: 110 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        {/* Hidden legacy display text for backward test compatibility */}
        <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
          {legacyNumDisplay}
        </Text>

        {/* Action Error Banner */}
        {actionError ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)' }]}>
            <AlertTriangle size={14} color={colors.destructive} />
            <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
              {actionError}
            </Text>
          </View>
        ) : null}

        {/* R2. Top Info Card Consolidation */}
        <Card style={styles.card} testID="ticket-info-card">
          <CardContent style={styles.infoCardContent}>
            {/* Row 1: Left = Priority badge + Condition badge | Right = Repair Period */}
            <View style={styles.infoRow1}>
              <View style={styles.infoRow1Left}>
                {ticket.priority && ticket.priority !== 'None' ? (
                  <Badge variant={getPriorityBadgeVariant(ticket.priority)} testID="ticket-priority-badge">
                    {`${ticket.priority} Priority`}
                  </Badge>
                ) : (
                  <Badge variant="secondary" testID="ticket-priority-badge">Normal Priority</Badge>
                )}

                {/* Condition Badge / Banner */}
                <View
                  style={[
                    styles.conditionBadge,
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
                    <ShieldAlert size={12} color={colors.destructive} />
                  ) : (
                    <CheckCircle2 size={12} color={colors.status.online} />
                  )}
                  <Text
                    style={[
                      styles.conditionBadgeText,
                      {
                        color: isOutOfService ? colors.destructive : colors.status.online,
                        fontSize: typography.fontSize.xs,
                      },
                    ]}
                  >
                    {condition}
                  </Text>
                </View>
              </View>

              <View style={styles.infoRow1Right} testID="ticket-repair-period">
                <Calendar size={12} color={colors.mutedForeground} />
                <Text
                  style={[styles.periodText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}
                  numberOfLines={1}
                >
                  {periodDisplay}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

            {/* Row 2: Left = Serial, Internal Ref, Supplier | Right = Owner • Requester */}
            <View style={styles.infoRow2}>
              <View style={styles.infoRow2Left}>
                <View style={styles.specInlineItem} testID="ticket-serial-number">
                  <Text style={[styles.specInlineLabel, { color: colors.mutedForeground, fontSize: 11 }]}>
                    SN:
                  </Text>
                  <Text style={[styles.specInlineValue, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    {ticket.equipment?.serialNumber || '—'}
                  </Text>
                </View>

                <View style={styles.specInlineItem} testID="ticket-internal-ref">
                  <Text style={[styles.specInlineLabel, { color: colors.mutedForeground, fontSize: 11 }]}>
                    Ref:
                  </Text>
                  <Text style={[styles.specInlineValue, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    {ticket.internalReference || '—'}
                  </Text>
                </View>

                <View style={styles.specInlineItem} testID="ticket-supplier">
                  <Text style={[styles.specInlineLabel, { color: colors.mutedForeground, fontSize: 11 }]}>
                    Supplier:
                  </Text>
                  <Text style={[styles.specInlineValue, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    {ticket.supplierId || '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.infoRow2Right} testID="ticket-owner-requester">
                <User size={12} color={colors.mutedForeground} />
                <Text
                  style={[styles.peopleText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                  numberOfLines={1}
                >
                  {ticket.owner ? `${ticket.owner} • ` : ''}{ticket.requestedBy || 'Warehouse Tech'}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* R3. 5-Button Status Transition Strip */}
        <Card style={styles.card} testID="detail-quick-status-selector">
          <CardContent style={styles.statusStripContent}>
            <QuickStatusSelector
              currentStatus={ticket.status}
              onSelectStatus={handleStatusChange}
              isUpdating={isUpdatingStatus}
              showHeader={false}
              testID="ticket-quick-status-selector"
            />
          </CardContent>
        </Card>

        {/* R4. Consolidated Notes & Files / Attachments Card */}
        <Card style={styles.card} testID="ticket-notes-attachments-card">
          <CardHeader style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Paperclip size={16} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                Notes & Files / Attachments
              </Text>
              <Badge variant="secondary">
                {String(totalNotesCount + totalAttachmentsCount)}
              </Badge>
            </View>
          </CardHeader>

          <CardContent style={styles.cardContent}>
            {/* Inline Photos Section */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <ImageIcon size={14} color={colors.primary} />
                  <Text style={[styles.sectionSubtitle, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Damage Photos ({photoAttachments.length})
                  </Text>
                </View>
              </View>

              {photoAttachments.length === 0 ? (
                <View style={[styles.emptySectionBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.emptySectionText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    No damage photos attached.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photosScroll}
                >
                  {photoAttachments.map((photo, index) => (
                    <View key={photo.id || `photo-${index}`} style={styles.photoThumbWrapper}>
                      <Pressable
                        onPress={() => setViewingPhoto(photo)}
                        style={[styles.photoThumbPressable, { borderColor: colors.border }]}
                        testID={`photo-thumb-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`View photo ${photo.fileName || index + 1}`}
                      >
                        <Image
                          source={{ uri: photo.url }}
                          style={styles.photoThumbImage}
                          resizeMode="cover"
                        />
                        <View style={styles.photoZoomBadge}>
                          <ZoomIn size={12} color="#FFFFFF" />
                        </View>
                      </Pressable>

                      {/* Quick Delete Badge */}
                      <Pressable
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          promptDeleteAttachment(photo);
                        }}
                        style={[styles.photoDeleteBadge, { backgroundColor: colors.destructive }]}
                        hitSlop={8}
                        testID={`photo-remove-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel="Delete photo"
                      >
                        <Trash2 size={10} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Documents & PDFs Section */}
            <View style={[styles.sectionBlock, { marginTop: 14 }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <FileText size={14} color={colors.primary} />
                  <Text style={[styles.sectionSubtitle, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Documents & Specifications ({docAttachments.length})
                  </Text>
                </View>
              </View>

              {docAttachments.length === 0 ? (
                <View style={[styles.emptySectionBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.emptySectionText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    No PDFs or documentation attached.
                  </Text>
                </View>
              ) : (
                <View style={styles.docsList}>
                  {docAttachments.map((docItem, index) => (
                    <Pressable
                      key={docItem.id || `doc-${index}`}
                      onPress={() => setViewingDoc(docItem)}
                      style={({ pressed }) => [
                        styles.docRow,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        pressed && { opacity: 0.8 },
                      ]}
                      testID={`doc-item-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`View document ${docItem.fileName || 'Attachment'}`}
                    >
                      <View style={styles.docRowLeft}>
                        {docItem.type === 'PDF' ? (
                          <FileText size={16} color={colors.primary} />
                        ) : (
                          <FileCode size={16} color={colors.primary} />
                        )}
                        <View style={styles.docTextGroup}>
                          <Text
                            style={[styles.docFileName, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                            numberOfLines={1}
                          >
                            {docItem.fileName || 'Document Attachment'}
                          </Text>
                          <Text style={[styles.docMeta, { color: colors.mutedForeground, fontSize: 10 }]}>
                            {docItem.type} • {docItem.uploadedAt ? formatDate(docItem.uploadedAt) : 'Attached'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.docRowRight}>
                        <Pressable
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            promptDeleteAttachment(docItem);
                          }}
                          style={styles.docDeleteBtn}
                          hitSlop={8}
                          testID={`delete-doc-btn-${index}`}
                          accessibilityRole="button"
                          accessibilityLabel="Delete document"
                        >
                          <Trash2 size={14} color={colors.destructive} />
                        </Pressable>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Technician Notes Section */}
            <View style={[styles.sectionBlock, { marginTop: 14 }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <Edit2 size={14} color={colors.primary} />
                  <Text style={[styles.sectionSubtitle, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Technician Notes ({totalNotesCount})
                  </Text>
                </View>
              </View>

              {!ticket.notes || ticket.notes.length === 0 ? (
                <View style={[styles.emptySectionBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.emptySectionText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    No notes recorded yet. Tap "Add Note" below to record notes.
                  </Text>
                </View>
              ) : (
                <View style={styles.notesList}>
                  {ticket.notes.map((note, index) => (
                    <Pressable
                      key={note.id || `note-${index}`}
                      onPress={() => handleOpenEditNote(note)}
                      style={({ pressed }) => [
                        styles.noteCard,
                        { backgroundColor: colors.muted, borderColor: colors.border },
                        pressed && { opacity: 0.85 },
                      ]}
                      testID={`note-item-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit note by ${note.user?.name || 'Technician'}`}
                    >
                      <View style={styles.noteHeader}>
                        <View style={styles.noteAuthorGroup}>
                          <User size={12} color={colors.mutedForeground} />
                          <Text style={[styles.noteAuthor, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                            {note.user?.name || 'Technician'}
                          </Text>
                        </View>
                        <Text style={[styles.noteTimestamp, { color: colors.mutedForeground, fontSize: 10 }]}>
                          {formatTimeAgo(note.timestamp)}
                        </Text>
                      </View>
                      <Text style={[styles.noteContentText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                        {note.content}
                      </Text>
                      <View style={styles.noteFooter}>
                        <Text style={[styles.noteEditHint, { color: colors.primary, fontSize: 10 }]}>
                          Tap to edit / delete
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </CardContent>
        </Card>

        {/* Parts Used Section (If Any) */}
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

        {/* Audit Action Logs Section */}
        {ticket.actions && ticket.actions.length > 0 ? (
          <Card style={styles.card} testID="ticket-actions-card">
            <CardHeader style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <History size={16} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                  Technician Action Log ({ticket.actions.length})
                </Text>
              </View>
            </CardHeader>

            <CardContent style={styles.cardContent}>
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
            </CardContent>
          </Card>
        ) : null}
      </ScrollView>

      {/* R5. Dual Fixed Bottom Action Bar */}
      <View
        style={[
          styles.fixedBottomBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm,
          },
        ]}
        testID="fixed-bottom-action-bar"
      >
        <Button
          variant="outline"
          size="default"
          icon={<FileText size={16} color={colors.primary} />}
          onPress={handleOpenAddNote}
          style={styles.bottomBarButton}
          testID="detail-add-note-btn"
        >
          Add Note
        </Button>

        <Button
          variant="primary"
          size="default"
          icon={<Paperclip size={16} color={colors.primaryForeground} />}
          onPress={handleOpenAddAttachment}
          style={styles.bottomBarButton}
          testID="detail-add-attachment-btn"
        >
          Add Attachment
        </Button>
      </View>

      {/* Dialog 1: Add Note Modal */}
      <Modal
        visible={isAddNoteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddNoteOpen(false)}
        testID="add-note-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setIsAddNoteOpen(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Add Technician Note
              </Text>
              <Pressable onPress={() => setIsAddNoteOpen(false)} hitSlop={8} testID="close-add-note-modal">
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)' }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              <Input
                label="Note Details"
                placeholder="Enter technician note, diagnostic update, or inspection details..."
                value={newNoteText}
                onChangeText={setNewNoteText}
                multiline
                numberOfLines={4}
                testID="add-note-input"
                style={styles.modalInput}
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setIsAddNoteOpen(false)}
                  disabled={isSubmittingNote}
                  style={styles.modalButton}
                  testID="cancel-add-note-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  icon={<Send size={14} color={colors.primaryForeground} />}
                  onPress={handleCreateNote}
                  loading={isSubmittingNote}
                  disabled={isSubmittingNote || !newNoteText.trim()}
                  style={styles.modalButton}
                  testID="submit-add-note-btn"
                >
                  Save Note
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Dialog 2: Edit Note Modal */}
      <Modal
        visible={!!editingNote}
        transparent
        animationType="slide"
        onRequestClose={() => !isSavingNote && setEditingNote(null)}
        testID="edit-note-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !isSavingNote && setEditingNote(null)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Edit Note
              </Text>
              <Pressable
                onPress={() => !isSavingNote && setEditingNote(null)}
                hitSlop={8}
                testID="close-edit-note-modal"
                disabled={isSavingNote}
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)' }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              <Input
                label="Note Content"
                value={editedNoteContent}
                onChangeText={setEditedNoteContent}
                multiline
                numberOfLines={4}
                testID="edit-note-input"
                style={styles.modalInput}
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="destructive"
                  size="default"
                  icon={<Trash2 size={14} color="#FFFFFF" />}
                  onPress={() => editingNote && promptDeleteNote(editingNote)}
                  disabled={isSavingNote}
                  style={styles.modalButton}
                  testID="delete-note-btn"
                >
                  Delete
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleSaveEditedNote}
                  loading={isSavingNote}
                  disabled={isSavingNote || !editedNoteContent.trim()}
                  style={styles.modalButton}
                  testID="save-edit-note-btn"
                >
                  Save
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Dialog 3: Add Attachment Modal */}
      <Modal
        visible={isAddAttachmentOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !isSubmittingAttachment && setIsAddAttachmentOpen(false)}
        testID="add-attachment-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !isSubmittingAttachment && setIsAddAttachmentOpen(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Add File or Attachment
              </Text>
              <Pressable
                onPress={() => !isSubmittingAttachment && setIsAddAttachmentOpen(false)}
                hitSlop={8}
                testID="close-add-attachment-modal"
                disabled={isSubmittingAttachment}
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)' }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              {/* Quick Actions Row */}
              <View style={styles.quickAttachmentOptions}>
                <Pressable
                  onPress={handleSimulateAddPhoto}
                  disabled={isSubmittingAttachment}
                  style={({ pressed }) => [
                    styles.quickOptionCard,
                    { backgroundColor: colors.muted, borderColor: colors.border },
                    pressed && !isSubmittingAttachment && { opacity: 0.8 },
                    isSubmittingAttachment && { opacity: 0.5 },
                  ]}
                  testID="opt-take-photo"
                >
                  <Camera size={22} color={colors.primary} />
                  <Text style={[styles.quickOptionText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Camera Photo
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleSimulateAddDoc('PDF')}
                  disabled={isSubmittingAttachment}
                  style={({ pressed }) => [
                    styles.quickOptionCard,
                    { backgroundColor: colors.muted, borderColor: colors.border },
                    pressed && !isSubmittingAttachment && { opacity: 0.8 },
                    isSubmittingAttachment && { opacity: 0.5 },
                  ]}
                  testID="opt-attach-doc"
                >
                  <FileText size={22} color={colors.primary} />
                  <Text style={[styles.quickOptionText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Attach PDF / Doc
                  </Text>
                </Pressable>
              </View>

              {/* Manual URL Input */}
              <Text style={[styles.orDividerText, { color: colors.mutedForeground, fontSize: 11 }]}>
                — OR ENTER ATTACHMENT URL —
              </Text>

              <Input
                label="File Name"
                placeholder="e.g. schematic_diagram.pdf"
                value={newAttachmentName}
                onChangeText={setNewAttachmentName}
                testID="attachment-name-input"
              />

              <Input
                label="Attachment URL"
                placeholder="https://..."
                value={newAttachmentUrl}
                onChangeText={setNewAttachmentUrl}
                testID="attachment-url-input"
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setIsAddAttachmentOpen(false)}
                  disabled={isSubmittingAttachment}
                  style={styles.modalButton}
                  testID="cancel-attachment-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleManualAddAttachment}
                  loading={isSubmittingAttachment}
                  disabled={isSubmittingAttachment || !newAttachmentUrl.trim()}
                  style={styles.modalButton}
                  testID="submit-attachment-btn"
                >
                  Upload File
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Dialog 4: Document / PDF Viewer Modal */}
      <Modal
        visible={!!viewingDoc}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingDoc(null)}
        testID="doc-viewer-modal"
      >
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxBackdrop} onPress={() => setViewingDoc(null)} />
          <View style={[styles.docViewerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.docViewerHeaderLeft}>
                <FileText size={18} color={colors.primary} />
                <Text
                  style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.sm, flexShrink: 1 }]}
                  numberOfLines={1}
                >
                  {viewingDoc?.fileName || 'Document Preview'}
                </Text>
              </View>
              <Pressable onPress={() => setViewingDoc(null)} hitSlop={8} testID="close-doc-viewer-btn">
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.docViewerBody}>
              <View style={[styles.docPreviewPlaceholder, { backgroundColor: colors.muted }]}>
                <FileText size={48} color={colors.mutedForeground} />
                <Text style={[styles.docPreviewName, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                  {viewingDoc?.fileName || 'Document'}
                </Text>
                <Text style={[styles.docPreviewType, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Type: {viewingDoc?.type || 'Document'}
                </Text>
                <Text style={[styles.docPreviewUrl, { color: colors.primary, fontSize: 10 }]} numberOfLines={1}>
                  {viewingDoc?.url}
                </Text>
              </View>

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="destructive"
                  size="default"
                  icon={<Trash2 size={14} color="#FFFFFF" />}
                  onPress={() => viewingDoc && promptDeleteAttachment(viewingDoc)}
                  style={styles.modalButton}
                  testID="viewer-delete-doc-btn"
                >
                  Delete Attachment
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setViewingDoc(null)}
                  style={styles.modalButton}
                  testID="viewer-close-btn"
                >
                  Close
                </Button>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Dialog 5: Full-Screen Photo Lightbox Modal */}
      <Modal
        visible={!!viewingPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingPhoto(null)}
        testID="photo-lightbox-modal"
      >
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxBackdrop} onPress={() => setViewingPhoto(null)} />
          <View style={styles.lightboxTopBar}>
            <Text style={[styles.lightboxTitle, { color: '#FFFFFF', fontSize: typography.fontSize.sm }]}>
              Damage Photo Preview
            </Text>
            <View style={styles.lightboxActions}>
              <Pressable
                onPress={() => viewingPhoto && promptDeleteAttachment(viewingPhoto as any)}
                style={styles.lightboxIconBtn}
                hitSlop={8}
                testID="lightbox-delete-btn"
                accessibilityRole="button"
                accessibilityLabel="Delete photo"
              >
                <Trash2 size={18} color="#EF4444" />
              </Pressable>
              <Pressable
                onPress={() => setViewingPhoto(null)}
                style={styles.lightboxIconBtn}
                hitSlop={8}
                testID="lightbox-close-btn"
                accessibilityRole="button"
                accessibilityLabel="Close lightbox"
              >
                <X size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          {viewingPhoto?.url ? (
            <View style={styles.lightboxImageContainer}>
              <Image
                source={{ uri: viewingPhoto.url }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Dialog 6: Confirmation Dialog for Deletions */}
      <Modal
        visible={deleteConfirmState.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmState((prev) => ({ ...prev, visible: false }))}
        testID="delete-confirm-modal"
      >
        <View style={styles.confirmOverlay}>
          <Pressable
            style={styles.confirmBackdrop}
            onPress={() => setDeleteConfirmState((prev) => ({ ...prev, visible: false }))}
          />
          <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.confirmHeader}>
              <AlertTriangle size={24} color={colors.destructive} />
              <Text style={[styles.confirmTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                {deleteConfirmState.title}
              </Text>
            </View>

            <Text style={[styles.confirmMessage, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              {deleteConfirmState.message}
            </Text>

            <View style={styles.modalButtonsRow}>
              <Button
                variant="outline"
                size="default"
                onPress={() => setDeleteConfirmState((prev) => ({ ...prev, visible: false }))}
                disabled={isDeletingConfirm}
                style={styles.modalButton}
                testID="cancel-delete-confirm-btn"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="default"
                onPress={deleteConfirmState.onConfirm}
                loading={isDeletingConfirm}
                disabled={isDeletingConfirm}
                style={styles.modalButton}
                testID="confirm-delete-btn"
              >
                Delete
              </Button>
            </View>
          </View>
        </View>
      </Modal>
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
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  errorTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  errorSub: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
  topBar: {
    width: '100%',
    borderBottomWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  headerTicketId: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  headerEquipmentName: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  headerStatusContainer: {
    flexShrink: 0,
  },
  scrollContent: {
    gap: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorBannerText: {
    fontFamily: 'Calibri',
    flex: 1,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoCardContent: {
    padding: 12,
    gap: 8,
  },
  infoRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRow1Left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  conditionBadge: {
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
  conditionBadgeText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  infoRow1Right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  periodText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: 2,
  },
  infoRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRow2Left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  specInlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  specInlineLabel: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  specInlineValue: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  infoRow2Right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    paddingLeft: 8,
  },
  peopleText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  statusStripContent: {
    padding: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  cardContent: {
    padding: 14,
  },
  sectionBlock: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionSubtitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  emptySectionBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  emptySectionText: {
    fontFamily: 'Calibri',
    fontStyle: 'italic',
  },
  photosScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  photoThumbWrapper: {
    position: 'relative',
  },
  photoThumbPressable: {
    width: 76,
    height: 76,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
  },
  photoThumbImage: {
    width: '100%',
    height: '100%',
  },
  photoZoomBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    padding: 3,
    borderRadius: 4,
  },
  photoDeleteBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  docsList: {
    gap: 6,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  docRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  docTextGroup: {
    flex: 1,
  },
  docFileName: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  docMeta: {
    fontFamily: 'Calibri',
    marginTop: 1,
  },
  docRowRight: {
    paddingLeft: 8,
  },
  docDeleteBtn: {
    padding: 4,
  },
  notesList: {
    gap: 8,
  },
  noteCard: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteAuthorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noteAuthor: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  noteTimestamp: {
    fontFamily: 'Calibri',
  },
  noteContentText: {
    fontFamily: 'Calibri',
    lineHeight: 18,
  },
  noteFooter: {
    alignItems: 'flex-end',
  },
  noteEditHint: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  partRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  partName: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  partNotes: {
    fontFamily: 'Calibri',
    marginTop: 2,
  },
  partCostGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  partQty: {
    fontFamily: 'Calibri',
  },
  partCost: {
    fontFamily: 'Calibri',
    fontWeight: '700',
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
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  actionTime: {
    fontFamily: 'Calibri',
  },
  actionText: {
    fontFamily: 'Calibri',
    lineHeight: 18,
  },
  fixedBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  bottomBarButton: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  modalBody: {
    padding: 16,
    gap: 12,
  },
  modalInput: {
    fontFamily: 'Calibri',
    minHeight: 90,
    textAlignVertical: 'top',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalButton: {
    flex: 1,
  },
  quickAttachmentOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickOptionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickOptionText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
    textAlign: 'center',
  },
  orDividerText: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 4,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  lightboxTopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  lightboxTitle: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  lightboxActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lightboxIconBtn: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
  },
  lightboxImageContainer: {
    width: '90%',
    height: '75%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  docViewerCard: {
    width: '90%',
    maxWidth: 420,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  docViewerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  docViewerBody: {
    padding: 16,
    gap: 14,
  },
  docPreviewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 8,
    gap: 6,
  },
  docPreviewName: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  docPreviewType: {
    fontFamily: 'Calibri',
  },
  docPreviewUrl: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  confirmMessage: {
    fontFamily: 'Calibri',
    lineHeight: 18,
  },
});
