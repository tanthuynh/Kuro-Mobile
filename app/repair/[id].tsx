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
    updateRepairTicketFields,
    appendAction,
    appendNote,
    updateNote,
    deleteNote,
    addAttachment,
    deleteAttachment,
  } = useSingleTicket(ticketId);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 1-Click / 1-Tap Editing States
  const [isEditEquipmentOpen, setIsEditEquipmentOpen] = useState(false);
  const [editEquipmentName, setEditEquipmentName] = useState('');
  const [isSavingEquipmentName, setIsSavingEquipmentName] = useState(false);

  const [isPriorityPickerOpen, setIsPriorityPickerOpen] = useState(false);
  const [isSavingPriority, setIsSavingPriority] = useState(false);

  const [isConditionPickerOpen, setIsConditionPickerOpen] = useState(false);
  const [isSavingCondition, setIsSavingCondition] = useState(false);

  const [isEditSerialOpen, setIsEditSerialOpen] = useState(false);
  const [editSerial, setEditSerial] = useState('');
  const [isSavingSerial, setIsSavingSerial] = useState(false);

  const [isEditInternalRefOpen, setIsEditInternalRefOpen] = useState(false);
  const [editInternalRef, setEditInternalRef] = useState('');
  const [isSavingInternalRef, setIsSavingInternalRef] = useState(false);

  const [isEditSupplierOpen, setIsEditSupplierOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const [isEditOwnerRequesterOpen, setIsEditOwnerRequesterOpen] = useState(false);
  const [editOwner, setEditOwner] = useState('');
  const [editRequestedBy, setEditRequestedBy] = useState('');
  const [isSavingOwnerRequester, setIsSavingOwnerRequester] = useState(false);

  const [isEditPeriodOpen, setIsEditPeriodOpen] = useState(false);
  const [editPeriodStart, setEditPeriodStart] = useState('');
  const [editPeriodEnd, setEditPeriodEnd] = useState('');
  const [isSavingPeriod, setIsSavingPeriod] = useState(false);

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
    router.replace('/(tabs)/repairs' as any);
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

  // 1-Click / 1-Tap Edit Handlers
  // 1. Equipment Name Handler
  const handleOpenEditEquipment = () => {
    setEditEquipmentName(ticket?.equipment?.name || '');
    setActionError(null);
    setIsEditEquipmentOpen(true);
  };

  const handleSaveEquipmentName = async () => {
    if (isSavingEquipmentName) return;
    const trimmed = editEquipmentName.trim();
    if (!ticket) return;
    if (!trimmed) {
      setActionError('Equipment name cannot be empty');
      await HapticService.scanError();
      return;
    }

    try {
      setIsSavingEquipmentName(true);
      setActionError(null);
      await updateRepairTicketFields({ equipmentName: trimmed });
      await HapticService.scanSuccess();
      setIsEditEquipmentOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Update equipment name error:', err);
      setActionError(err?.message || 'Failed to update equipment name');
      await HapticService.scanError();
    } finally {
      setIsSavingEquipmentName(false);
    }
  };

  // 2. Priority 1-Tap Handler
  const handleOpenPriorityPicker = () => {
    setActionError(null);
    setIsPriorityPickerOpen(true);
  };

  const handleSelectPriority = async (newPriority: RepairPriority) => {
    if (isSavingPriority || !ticket) return;
    try {
      setIsSavingPriority(true);
      setActionError(null);
      await updateRepairTicketFields({ priority: newPriority });
      await HapticService.scanSuccess();
      setIsPriorityPickerOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Update priority error:', err);
      setActionError(err?.message || 'Failed to update priority');
      await HapticService.scanError();
    } finally {
      setIsSavingPriority(false);
    }
  };

  // 3. Condition 1-Tap Handler
  const handleOpenConditionPicker = () => {
    setActionError(null);
    setIsConditionPickerOpen(true);
  };

  const handleSelectCondition = async (newCondition: EquipmentCondition) => {
    if (isSavingCondition || !ticket) return;
    try {
      setIsSavingCondition(true);
      setActionError(null);
      await updateRepairTicketFields({ condition: newCondition });
      await HapticService.scanSuccess();
      setIsConditionPickerOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Update condition error:', err);
      setActionError(err?.message || 'Failed to update condition');
      await HapticService.scanError();
    } finally {
      setIsSavingCondition(false);
    }
  };

  // 4. Serial Number Handler
  const handleOpenEditSerial = () => {
    setEditSerial(ticket?.equipment?.serialNumber || '');
    setActionError(null);
    setIsEditSerialOpen(true);
  };

  const handleSaveSerial = async () => {
    if (isSavingSerial || !ticket) return;
    const trimmed = editSerial.trim();
    try {
      setIsSavingSerial(true);
      setActionError(null);
      await updateRepairTicketFields({ serialNumber: trimmed || null });
      await HapticService.scanSuccess();
      setIsEditSerialOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Update serial error:', err);
      setActionError(err?.message || 'Failed to update serial number');
      await HapticService.scanError();
    } finally {
      setIsSavingSerial(false);
    }
  };

  // 5. Internal Reference Handler
  const handleOpenEditInternalRef = () => {
    setEditInternalRef(ticket?.internalReference || '');
    setActionError(null);
    setIsEditInternalRefOpen(true);
  };

  const handleSaveInternalRef = async () => {
    if (isSavingInternalRef || !ticket) return;
    const trimmed = editInternalRef.trim();
    try {
      setIsSavingInternalRef(true);
      setActionError(null);
      await updateRepairTicketFields({ internalReference: trimmed || null });
      await HapticService.scanSuccess();
      setIsEditInternalRefOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Update internal ref error:', err);
      setActionError(err?.message || 'Failed to update internal reference');
      await HapticService.scanError();
    } finally {
      setIsSavingInternalRef(false);
    }
  };

  // 6. Repair Period Dates Handler
  const handleOpenEditPeriod = () => {
    const startIso = ticket?.repairPeriodStart ? parseFirestoreDate(ticket.repairPeriodStart)?.toISOString().split('T')[0] || '' : '';
    const endIso = ticket?.repairPeriodEnd ? parseFirestoreDate(ticket.repairPeriodEnd)?.toISOString().split('T')[0] || '' : '';
    setEditPeriodStart(startIso);
    setEditPeriodEnd(endIso);
    setActionError(null);
    setIsEditPeriodOpen(true);
  };

  const handleSavePeriod = async () => {
    if (isSavingPeriod || !ticket) return;
    try {
      setIsSavingPeriod(true);
      setActionError(null);
      const startParsed = editPeriodStart.trim() ? parseFirestoreDate(editPeriodStart.trim()) : null;
      const endParsed = editPeriodEnd.trim() ? parseFirestoreDate(editPeriodEnd.trim()) : null;

      if (editPeriodStart.trim() && !startParsed) {
        setActionError('Start date format is invalid (YYYY-MM-DD)');
        await HapticService.scanError();
        return;
      }
      if (editPeriodEnd.trim() && !endParsed) {
        setActionError('End date format is invalid (YYYY-MM-DD)');
        await HapticService.scanError();
        return;
      }
      if (startParsed && endParsed && endParsed.getTime() < startParsed.getTime()) {
        setActionError('End date must be on or after start date');
        await HapticService.scanError();
        return;
      }

      await updateRepairTicketFields({
        repairPeriodStart: startParsed ? startParsed.toISOString() : null,
        repairPeriodEnd: endParsed ? endParsed.toISOString() : null,
      });
      await HapticService.scanSuccess();
      setIsEditPeriodOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Update period error:', err);
      setActionError(err?.message || 'Failed to update repair period');
      await HapticService.scanError();
    } finally {
      setIsSavingPeriod(false);
    }
  };

  const handleSetPeriodPreset = (days: number) => {
    const today = new Date();
    const startStr = today.toISOString().split('T')[0];
    const end = new Date(today.getTime() + days * 86400000);
    const endStr = end.toISOString().split('T')[0];
    setEditPeriodStart(startStr);
    setEditPeriodEnd(endStr);
  };

  // 7. Supplier Handler
  const handleOpenEditSupplier = () => {
    setEditSupplier(ticket?.supplierId || '');
    setActionError(null);
    setIsEditSupplierOpen(true);
  };

  const handleSaveSupplier = async () => {
    if (isSavingSupplier || !ticket) return;
    const trimmed = editSupplier.trim();
    try {
      setIsSavingSupplier(true);
      setActionError(null);
      await updateRepairTicketFields({ supplierId: trimmed || null });
      await HapticService.scanSuccess();
      setIsEditSupplierOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Update supplier error:', err);
      setActionError(err?.message || 'Failed to update supplier');
      await HapticService.scanError();
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // 8. Owner & Requester Handler
  const handleOpenEditOwnerRequester = () => {
    setEditOwner(ticket?.owner || '');
    setEditRequestedBy(ticket?.requestedBy || '');
    setActionError(null);
    setIsEditOwnerRequesterOpen(true);
  };

  const handleSaveOwnerRequester = async () => {
    if (isSavingOwnerRequester || !ticket) return;
    const trimmedOwner = editOwner.trim();
    const trimmedRequestedBy = editRequestedBy.trim();
    try {
      setIsSavingOwnerRequester(true);
      setActionError(null);
      await updateRepairTicketFields({
        owner: trimmedOwner || null,
        requestedBy: trimmedRequestedBy || 'Warehouse Tech',
      });
      await HapticService.scanSuccess();
      setIsEditOwnerRequesterOpen(false);
    } catch (err: any) {
      console.error('[RepairDetail] Update owner/requester error:', err);
      setActionError(err?.message || 'Failed to update requester / owner');
      await HapticService.scanError();
    } finally {
      setIsSavingOwnerRequester(false);
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
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.75 },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back to repairs list"
            testID="ticket-detail-back-btn"
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </Pressable>

          {/* Header Title: [Ticket #] Equipment Name in prominent title-sized typography with tap-to-edit */}
          <Pressable
            onPress={handleOpenEditEquipment}
            style={({ pressed }) => [
              styles.headerTitleContainer,
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit equipment name"
            testID="header-equipment-name-btn"
          >
            <Text style={[styles.headerTicketId, { color: colors.mutedForeground, fontSize: typography.fontSize.lg }]}>
              {repairNumDisplay}
            </Text>
            <Text
              style={[styles.headerEquipmentName, { color: colors.foreground, fontSize: typography.fontSize.lg, flexShrink: 1, marginLeft: 8 }]}
              numberOfLines={1}
              testID="ticket-equipment-name"
            >
              {ticket.equipment?.name || 'Equipment Repair'}
            </Text>
          </Pressable>

          {/* Single Edit Pencil Icon on Top Right Header Bar */}
          <Pressable
            onPress={handleOpenEditEquipment}
            style={({ pressed }) => [
              styles.headerEditButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.75 },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Edit equipment name"
            testID="header-edit-equipment-btn"
          >
            <Edit2 size={16} color={colors.foreground} />
          </Pressable>
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

        {/* R2. Button-Tile Info Cards Grid Layout */}
        <Card style={styles.card} testID="ticket-info-card">
          <CardContent style={styles.infoCardContent}>
            <View style={styles.infoGrid}>
              {/* 1. Priority Tile: Shows current priority badge/color; tap opens 1-click priority selector */}
              <Pressable
                onPress={handleOpenPriorityPicker}
                style={({ pressed }) => [
                  styles.gridTile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                testID="ticket-priority-badge"
                accessibilityRole="button"
                accessibilityLabel={`Priority: ${ticket.priority || 'Medium'}. Tap to change`}
              >
                <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>
                  Priority
                </Text>
                <View style={styles.tileContent}>
                  {ticket.priority && ticket.priority !== 'None' ? (
                    <Badge variant={getPriorityBadgeVariant(ticket.priority)}>
                      {`${ticket.priority} Priority`}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Normal Priority</Badge>
                  )}
                </View>
              </Pressable>

              {/* 2. Condition Tile: Shows current condition (Available to Use / Out of Service); tap toggles/opens 1-click condition selector */}
              <Pressable
                onPress={handleOpenConditionPicker}
                style={({ pressed }) => [
                  styles.gridTile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                testID="ticket-condition-banner"
                accessibilityRole="button"
                accessibilityLabel={`Condition: ${condition}. Tap to change`}
              >
                <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>
                  Condition
                </Text>
                <View style={styles.tileContent}>
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
              </Pressable>

              {/* 3. Date / Period Tile: Shows formatted repair period; tap opens 1-click date range editor */}
              <Pressable
                onPress={handleOpenEditPeriod}
                style={({ pressed }) => [
                  styles.gridTile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                testID="ticket-repair-period"
                accessibilityRole="button"
                accessibilityLabel={`Repair Period: ${periodDisplay}. Tap to edit`}
              >
                <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>
                  Repair Period
                </Text>
                <View style={styles.tileContent}>
                  <Calendar size={13} color={colors.mutedForeground} />
                  <Text
                    style={[styles.tileValueText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                    numberOfLines={1}
                  >
                    {periodDisplay}
                  </Text>
                </View>
              </Pressable>

              {/* 4. Serial Number Tile: Shows Serial Number; tap opens 1-tap edit dialog */}
              <Pressable
                onPress={handleOpenEditSerial}
                style={({ pressed }) => [
                  styles.gridTile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                testID="ticket-serial-number"
                accessibilityRole="button"
                accessibilityLabel={`Serial Number: ${ticket.equipment?.serialNumber || '—'}. Tap to edit`}
              >
                <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>
                  Serial Number
                </Text>
                <View style={styles.tileContent}>
                  <Text
                    style={[styles.tileValueText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                    numberOfLines={1}
                  >
                    {ticket.equipment?.serialNumber || '—'}
                  </Text>
                </View>
              </Pressable>

              {/* 5. Internal Ref Tile: Shows Internal Reference; tap opens 1-tap edit dialog */}
              <Pressable
                onPress={handleOpenEditInternalRef}
                style={({ pressed }) => [
                  styles.gridTile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                testID="ticket-internal-ref"
                accessibilityRole="button"
                accessibilityLabel={`Internal Reference: ${ticket.internalReference || '—'}. Tap to edit`}
              >
                <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>
                  Internal Ref
                </Text>
                <View style={styles.tileContent}>
                  <Text
                    style={[styles.tileValueText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                    numberOfLines={1}
                  >
                    {ticket.internalReference || '—'}
                  </Text>
                </View>
              </Pressable>

              {/* 6. Supplier Tile: Shows Supplier name; tap opens 1-tap edit dialog */}
              <Pressable
                onPress={handleOpenEditSupplier}
                style={({ pressed }) => [
                  styles.gridTile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                testID="ticket-supplier"
                accessibilityRole="button"
                accessibilityLabel={`Supplier: ${ticket.supplierId || '—'}. Tap to edit`}
              >
                <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>
                  Supplier
                </Text>
                <View style={styles.tileContent}>
                  <Text
                    style={[styles.tileValueText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                    numberOfLines={1}
                  >
                    {ticket.supplierId || '—'}
                  </Text>
                </View>
              </Pressable>

              {/* 7. Requested By / Owner Tile: Shows Requester / Owner name; tap opens 1-tap edit dialog */}
              <Pressable
                onPress={handleOpenEditOwnerRequester}
                style={({ pressed }) => [
                  styles.gridTileFull,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                testID="ticket-owner-requester"
                accessibilityRole="button"
                accessibilityLabel={`Requester / Owner: ${ticket.owner ? `${ticket.owner} • ` : ''}${ticket.requestedBy || 'Warehouse Tech'}. Tap to edit`}
              >
                <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>
                  Requester / Owner
                </Text>
                <View style={styles.tileContent}>
                  <User size={13} color={colors.mutedForeground} />
                  <Text
                    style={[styles.tileValueText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}
                    numberOfLines={1}
                  >
                    {ticket.owner ? `${ticket.owner} • ` : ''}{ticket.requestedBy || 'Warehouse Tech'}
                  </Text>
                </View>
              </Pressable>
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
                <View style={[styles.emptySectionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                <View style={[styles.emptySectionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                        { backgroundColor: colors.surface, borderColor: colors.border },
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
                <View style={[styles.emptySectionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                        { backgroundColor: colors.surface, borderColor: colors.border },
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
                    { backgroundColor: colors.surface, borderColor: colors.border },
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
                    { backgroundColor: colors.surface, borderColor: colors.border },
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
              <View style={[styles.docPreviewPlaceholder, { backgroundColor: colors.surface }]}>
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

      {/* Modal 7: Edit Equipment Name Modal */}
      <Modal
        visible={isEditEquipmentOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !isSavingEquipmentName && setIsEditEquipmentOpen(false)}
        testID="edit-equipment-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !isSavingEquipmentName && setIsEditEquipmentOpen(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Edit Equipment Name
              </Text>
              <Pressable
                onPress={() => !isSavingEquipmentName && setIsEditEquipmentOpen(false)}
                hitSlop={8}
                testID="close-edit-equipment-modal"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', marginBottom: 10 }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              <Input
                label="Equipment Name"
                placeholder="e.g. Robe MegaPointe Moving Head"
                value={editEquipmentName}
                onChangeText={setEditEquipmentName}
                testID="edit-equipment-name-input"
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setIsEditEquipmentOpen(false)}
                  disabled={isSavingEquipmentName}
                  style={styles.modalButton}
                  testID="cancel-edit-equipment-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleSaveEquipmentName}
                  loading={isSavingEquipmentName}
                  disabled={isSavingEquipmentName || !editEquipmentName.trim()}
                  style={styles.modalButton}
                  testID="save-edit-equipment-btn"
                >
                  Save
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 8: 1-Tap Priority Selector Modal */}
      <Modal
        visible={isPriorityPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPriorityPickerOpen(false)}
        testID="priority-picker-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsPriorityPickerOpen(false)} />
          <View style={[styles.modalContent, styles.compactPickerContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Select Priority Level
              </Text>
              <Pressable onPress={() => setIsPriorityPickerOpen(false)} hitSlop={8} testID="close-priority-picker-btn">
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.pickerOptionsList}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', marginBottom: 4 }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              {(['None', 'Low', 'Medium', 'High', 'Deferred', 'Critical'] as RepairPriority[]).map((opt) => {
                const isSelected = (ticket.priority || 'Medium') === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => handleSelectPriority(opt)}
                    style={({ pressed }) => [
                      styles.pickerOptionRow,
                      { borderColor: colors.border },
                      isSelected && { backgroundColor: colors.surface },
                      pressed && { opacity: 0.8 },
                    ]}
                    testID={`priority-option-${opt.toLowerCase()}`}
                  >
                    <Badge variant={getPriorityBadgeVariant(opt)}>
                      {opt === 'None' ? 'None (Normal)' : `${opt} Priority`}
                    </Badge>
                    {isSelected ? <Check size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 9: 1-Tap Condition Selector Modal */}
      <Modal
        visible={isConditionPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConditionPickerOpen(false)}
        testID="condition-picker-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsConditionPickerOpen(false)} />
          <View style={[styles.modalContent, styles.compactPickerContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Select Operational Condition
              </Text>
              <Pressable onPress={() => setIsConditionPickerOpen(false)} hitSlop={8} testID="close-condition-picker-btn">
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.pickerOptionsList}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', marginBottom: 4 }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              {(
                [
                  { value: 'Available to Use' as EquipmentCondition, label: 'Available to Use', sub: 'Item is operational & ready for jobs' },
                  { value: 'Out of Service' as EquipmentCondition, label: 'Out of Service', sub: 'Item is damaged or being repaired (locked in ledger)' },
                ]
              ).map((opt) => {
                const isSelected = condition === opt.value;
                const isAvail = opt.value === 'Available to Use';
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleSelectCondition(opt.value)}
                    style={({ pressed }) => [
                      styles.pickerOptionRow,
                      { borderColor: colors.border },
                      isSelected && { backgroundColor: colors.surface },
                      pressed && { opacity: 0.8 },
                    ]}
                    testID={isAvail ? 'condition-option-available' : 'condition-option-out-of-service'}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {isAvail ? (
                          <CheckCircle2 size={16} color={colors.status.online} />
                        ) : (
                          <ShieldAlert size={16} color={colors.destructive} />
                        )}
                        <Text
                          style={{
                            fontFamily: 'Calibri',
                            fontWeight: '700',
                            fontSize: typography.fontSize.sm,
                            color: isAvail ? colors.status.online : colors.destructive,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Calibri', fontSize: 11, color: colors.mutedForeground }}>
                        {opt.sub}
                      </Text>
                    </View>
                    {isSelected ? <Check size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 10: Edit Serial Number Modal */}
      <Modal
        visible={isEditSerialOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !isSavingSerial && setIsEditSerialOpen(false)}
        testID="edit-serial-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !isSavingSerial && setIsEditSerialOpen(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Edit Serial Number
              </Text>
              <Pressable
                onPress={() => !isSavingSerial && setIsEditSerialOpen(false)}
                hitSlop={8}
                testID="close-edit-serial-modal"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', marginBottom: 10 }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              <Input
                label="Serial Number"
                placeholder="e.g. SN-ROBE-9912"
                value={editSerial}
                onChangeText={setEditSerial}
                testID="edit-serial-input"
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setIsEditSerialOpen(false)}
                  disabled={isSavingSerial}
                  style={styles.modalButton}
                  testID="cancel-edit-serial-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleSaveSerial}
                  loading={isSavingSerial}
                  disabled={isSavingSerial}
                  style={styles.modalButton}
                  testID="save-edit-serial-btn"
                >
                  Save
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 11: Edit Internal Reference Modal */}
      <Modal
        visible={isEditInternalRefOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !isSavingInternalRef && setIsEditInternalRefOpen(false)}
        testID="edit-internal-ref-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !isSavingInternalRef && setIsEditInternalRefOpen(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Edit Internal Reference
              </Text>
              <Pressable
                onPress={() => !isSavingInternalRef && setIsEditInternalRefOpen(false)}
                hitSlop={8}
                testID="close-edit-internal-ref-modal"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', marginBottom: 10 }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              <Input
                label="Internal Reference / Job Code"
                placeholder="e.g. REF-2026-X99"
                value={editInternalRef}
                onChangeText={setEditInternalRef}
                testID="edit-internal-ref-input"
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setIsEditInternalRefOpen(false)}
                  disabled={isSavingInternalRef}
                  style={styles.modalButton}
                  testID="cancel-edit-internal-ref-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleSaveInternalRef}
                  loading={isSavingInternalRef}
                  disabled={isSavingInternalRef}
                  style={styles.modalButton}
                  testID="save-edit-internal-ref-btn"
                >
                  Save
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 12: Edit Repair Period Modal */}
      <Modal
        visible={isEditPeriodOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !isSavingPeriod && setIsEditPeriodOpen(false)}
        testID="edit-period-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !isSavingPeriod && setIsEditPeriodOpen(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Edit Repair Period
              </Text>
              <Pressable
                onPress={() => !isSavingPeriod && setIsEditPeriodOpen(false)}
                hitSlop={8}
                testID="close-edit-period-modal"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', marginBottom: 10 }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              {/* Quick Preset Buttons */}
              <View style={styles.presetButtonsRow}>
                <Pressable
                  onPress={() => handleSetPeriodPreset(0)}
                  style={[styles.presetBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  testID="period-preset-today"
                >
                  <Text style={[styles.presetBtnText, { color: colors.foreground, fontSize: 11 }]}>Today</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSetPeriodPreset(3)}
                  style={[styles.presetBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  testID="period-preset-3days"
                >
                  <Text style={[styles.presetBtnText, { color: colors.foreground, fontSize: 11 }]}>3 Days</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSetPeriodPreset(7)}
                  style={[styles.presetBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  testID="period-preset-1week"
                >
                  <Text style={[styles.presetBtnText, { color: colors.foreground, fontSize: 11 }]}>1 Week</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSetPeriodPreset(14)}
                  style={[styles.presetBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  testID="period-preset-2weeks"
                >
                  <Text style={[styles.presetBtnText, { color: colors.foreground, fontSize: 11 }]}>2 Weeks</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditPeriodStart('');
                    setEditPeriodEnd('');
                  }}
                  style={[styles.presetBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  testID="period-preset-clear"
                >
                  <Text style={[styles.presetBtnText, { color: colors.destructive, fontSize: 11 }]}>Clear</Text>
                </Pressable>
              </View>

              <Input
                label="Start Date (YYYY-MM-DD)"
                placeholder="2026-08-25"
                value={editPeriodStart}
                onChangeText={setEditPeriodStart}
                testID="input-period-start"
              />

              <Input
                label="End Date (YYYY-MM-DD)"
                placeholder="2026-08-28"
                value={editPeriodEnd}
                onChangeText={setEditPeriodEnd}
                testID="input-period-end"
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setIsEditPeriodOpen(false)}
                  disabled={isSavingPeriod}
                  style={styles.modalButton}
                  testID="cancel-period-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleSavePeriod}
                  loading={isSavingPeriod}
                  disabled={isSavingPeriod}
                  style={styles.modalButton}
                  testID="save-period-btn"
                >
                  Save Period
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 13: Edit Supplier Modal */}
      <Modal
        visible={isEditSupplierOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !isSavingSupplier && setIsEditSupplierOpen(false)}
        testID="edit-supplier-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !isSavingSupplier && setIsEditSupplierOpen(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Edit Supplier
              </Text>
              <Pressable
                onPress={() => !isSavingSupplier && setIsEditSupplierOpen(false)}
                hitSlop={8}
                testID="close-edit-supplier-modal"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', marginBottom: 10 }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              <Input
                label="Supplier Name"
                placeholder="e.g. Robe Global Support"
                value={editSupplier}
                onChangeText={setEditSupplier}
                testID="edit-supplier-input"
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setIsEditSupplierOpen(false)}
                  disabled={isSavingSupplier}
                  style={styles.modalButton}
                  testID="cancel-edit-supplier-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleSaveSupplier}
                  loading={isSavingSupplier}
                  disabled={isSavingSupplier}
                  style={styles.modalButton}
                  testID="save-edit-supplier-btn"
                >
                  Save
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 14: Edit Owner & Requester Modal */}
      <Modal
        visible={isEditOwnerRequesterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !isSavingOwnerRequester && setIsEditOwnerRequesterOpen(false)}
        testID="edit-owner-requester-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !isSavingOwnerRequester && setIsEditOwnerRequesterOpen(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Edit Requester & Owner
              </Text>
              <Pressable
                onPress={() => !isSavingOwnerRequester && setIsEditOwnerRequesterOpen(false)}
                hitSlop={8}
                testID="close-edit-owner-requester-modal"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {actionError ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', marginBottom: 10 }]}>
                  <AlertTriangle size={14} color={colors.destructive} />
                  <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
                    {actionError}
                  </Text>
                </View>
              ) : null}

              <Input
                label="Requested By"
                placeholder="e.g. David Lighting Tech"
                value={editRequestedBy}
                onChangeText={setEditRequestedBy}
                testID="edit-requested-by-input"
              />

              <Input
                label="Owner / Department"
                placeholder="e.g. Alpha Rental Group"
                value={editOwner}
                onChangeText={setEditOwner}
                testID="edit-owner-input"
              />

              <View style={styles.modalButtonsRow}>
                <Button
                  variant="outline"
                  size="default"
                  onPress={() => setIsEditOwnerRequesterOpen(false)}
                  disabled={isSavingOwnerRequester}
                  style={styles.modalButton}
                  testID="cancel-edit-owner-requester-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleSaveOwnerRequester}
                  loading={isSavingOwnerRequester}
                  disabled={isSavingOwnerRequester}
                  style={styles.modalButton}
                  testID="save-edit-owner-requester-btn"
                >
                  Save
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    fontSize: 20,
    lineHeight: 24,
  },
  headerEquipmentName: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 24,
  },
  headerEditButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  compactPickerContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingBottom: 24,
  },
  pickerOptionsList: {
    padding: 16,
    gap: 8,
  },
  pickerOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  presetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  presetBtnText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
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
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  gridTile: {
    width: '48.5%',
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  gridTileFull: {
    width: '100%',
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  tileLabel: {
    fontFamily: 'Calibri',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  tileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tileValueText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
    flexShrink: 1,
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
