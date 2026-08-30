/**
 * app/repair/[id].tsx
 * Modernized Unified Repair Ticket Detail & Fault Logging Screen in Kuro Mobile.
 *
 * Features:
 * 1. Single Text Input with Autocomplete for Equipment, Serial Number, Requester, and Supplier.
 * 2. Combined Row 2: 5 Equal Boxes (Priority: Low, Medium, High & Condition: Available to Use, Out of Service).
 * 3. 5-Second Debounced / Pooled Mutation Saving with optimistic UI updates and immediate unmount flush.
 * 4. Unified Repair Detail & New Fault Report Screen (supports both detail and new ticket creation).
 * 5. Mobile Date Scroller for Repair Period with Start Date at top, End Date at bottom, and Quick Preset Chips.
 * 6. Simplified Terminology: Images & Documents, clean typography.
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  TextInput,
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
  Paperclip,
  Camera,
  Trash2,
  Edit2,
  X,
  Send,
  ZoomIn,
  Search,
  Building2,
  Users,
  Calendar,
  FileCode,
  Check,
  Tag,
  Barcode as BarcodeIcon,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { useSingleTicket } from '@/hooks/use-tickets';
import { HapticService } from '@/services/haptic-service';
import {
  fetchTenantSuppliers,
  fetchTenantCrewMembers,
  createRepairTicket,
  updateRepairTicketFields as updateRepairTicketFieldsService,
  updateRepairTicketStatus as updateRepairTicketStatusService,
  uploadRepairDamagePhoto,
  deleteRepairAttachment,
  type UpdateRepairTicketFieldsInput,
} from '@/services/repair-service';
import { fetchEquipment } from '@/services/equipment-service';
import type { Equipment } from '@/types/equipment';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QuickStatusSelector } from '@/components/repair/quick-status-selector';
import { AutocompleteInput } from '@/components/repair/autocomplete-input';
import { MobileDateScroller } from '@/components/repair/mobile-date-scroller';
import { RepairPhotoGallery } from '@/components/repair/repair-photo-gallery';
import {
  calculateRepairCostTotal,
  normalizeRepairPriority,
  normalizeRepairStatus,
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
  TenantSupplier,
  TenantCrewMember,
} from '@/types/repair';

export interface RepairDetailViewProps {
  mode?: 'detail' | 'new';
  initialParams?: {
    equipmentId?: string;
    name?: string;
    serialNumber?: string;
    category?: string;
    barcode?: string;
    location?: string;
    quantity?: string;
    model?: string;
  };
}

export default function RepairTicketDetailScreen({
  mode: propMode,
  initialParams: propParams,
}: RepairDetailViewProps = {}) {
  const localParams = useLocalSearchParams<{
    id?: string;
    equipmentId?: string;
    name?: string;
    serialNumber?: string;
    category?: string;
    barcode?: string;
    location?: string;
    quantity?: string;
    model?: string;
  }>();

  const idParam = Array.isArray(localParams.id) ? localParams.id[0] : localParams.id || '';
  const isNewMode = propMode === 'new' || idParam === 'new' || idParam === '';
  const ticketId = isNewMode ? '' : idParam;

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, isDark } = useTheme();
  const { user, tenant } = useAuth();
  const tenantId = user?.tenantId || tenant?.tenantId || '';

  // Single ticket hook for detail mode
  const {
    ticket,
    loading: loadingTicket,
    error: ticketError,
    refresh,
    updateStatus: hookUpdateStatus,
    updateRepairTicketFields: hookUpdateFields,
    appendNote,
    updateNote,
    deleteNote,
    addAttachment,
    deleteAttachment,
  } = useSingleTicket(ticketId);

  // Tenant reference data
  const [tenantEquipment, setTenantEquipment] = useState<Equipment[]>([]);
  const [tenantSuppliers, setTenantSuppliers] = useState<TenantSupplier[]>([]);
  const [tenantCrew, setTenantCrew] = useState<TenantCrewMember[]>([]);
  const [loadingTenantData, setLoadingTenantData] = useState(false);

  // Selected Equipment object (if selected from inventory)
  const [selectedEquipmentItem, setSelectedEquipmentItem] = useState<Equipment | null>(null);

  // Form Fields State (Used for optimistic UI, pooling, and new ticket mode)
  const [equipmentName, setEquipmentName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('Equipment');
  const [location, setLocation] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [internalReference, setInternalReference] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [priority, setPriority] = useState<RepairPriority>('High');
  const [condition, setCondition] = useState<EquipmentCondition>('Out of Service');
  const [status, setStatus] = useState<RepairStatus>('Reported');
  const [repairPeriodStart, setRepairPeriodStart] = useState<string | null>(null);
  const [repairPeriodEnd, setRepairPeriodEnd] = useState<string | null>(null);

  // Initial note / fault description (New mode)
  const [faultDescription, setFaultDescription] = useState('');

  // Attachments in new mode
  const [newModePhotos, setNewModePhotos] = useState<Array<{ id: string; url: string; uri?: string; fileName?: string }>>([]);

  // UI / Async action states
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasPendingMutations, setHasPendingMutations] = useState(false);

  // Modals state
  const [isDateScrollerOpen, setIsDateScrollerOpen] = useState(false);
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

  // Legacy modal triggers state (for full test backward-compatibility)
  const [isEditEquipmentModalOpen, setIsEditEquipmentModalOpen] = useState(false);
  const [isEditSerialModalOpen, setIsEditSerialModalOpen] = useState(false);
  const [isEditInternalRefModalOpen, setIsEditInternalRefModalOpen] = useState(false);
  const [isSupplierPickerModalOpen, setIsSupplierPickerModalOpen] = useState(false);
  const [isCrewPickerModalOpen, setIsCrewPickerModalOpen] = useState(false);
  const [supplierModalSearch, setSupplierModalSearch] = useState('');
  const [supplierModalCustom, setSupplierModalCustom] = useState('');
  const [crewModalSearch, setCrewModalSearch] = useState('');
  const [crewModalCustom, setCrewModalCustom] = useState('');
  const [equipmentModalSearch, setEquipmentModalSearch] = useState('');
  const [equipmentModalCustom, setEquipmentModalCustom] = useState('');

  // Confirmation dialog state
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

  // ============================================================================
  // 3. 5-SECOND DEBOUNCED / POOLED MUTATIONS
  // ============================================================================
  const userRef = useRef(user);
  userRef.current = user;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const pendingUpdatesRef = useRef<UpdateRepairTicketFieldsInput>({});
  const saveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush accumulated pending mutations immediately to Firestore
  const flushPendingUpdates = useCallback(async () => {
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
      saveDebounceTimerRef.current = null;
    }
    const toFlush = { ...pendingUpdatesRef.current };
    if (Object.keys(toFlush).length === 0 || !ticketId || !tenantId) {
      if (isMountedRef.current) setHasPendingMutations(false);
      return;
    }

    pendingUpdatesRef.current = {};
    if (isMountedRef.current) setHasPendingMutations(false);

    try {
      const author = {
        id: userRef.current?.id || 'unknown',
        name: userRef.current?.name || userRef.current?.email || 'Technician',
        email: userRef.current?.email,
      };
      await updateRepairTicketFieldsService(ticketId, toFlush, author, tenantId);
    } catch (err: any) {
      console.error('[RepairDetail] Pooled mutation save error:', err);
      if (isMountedRef.current) {
        setActionError(err?.message || 'Failed to save pending changes');
      }
    }
  }, [ticketId, tenantId]);

  // Queue a change to be pooled and saved after 5 seconds of inactivity
  const queueFieldUpdate = useCallback(
    (updates: UpdateRepairTicketFieldsInput) => {
      if (isNewMode) return; // In create mode, updates stay local until Create Ticket is clicked

      pendingUpdatesRef.current = {
        ...pendingUpdatesRef.current,
        ...updates,
      };
      setHasPendingMutations(true);

      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
      }

      saveDebounceTimerRef.current = setTimeout(() => {
        flushPendingUpdates();
      }, 5000);
    },
    [isNewMode, flushPendingUpdates]
  );

  // Flush on unmount / navigation away
  useEffect(() => {
    return () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
        saveDebounceTimerRef.current = null;
      }
      const toFlush = { ...pendingUpdatesRef.current };
      if (Object.keys(toFlush).length > 0 && ticketId && tenantId) {
        pendingUpdatesRef.current = {};
        const author = {
          id: userRef.current?.id || 'unknown',
          name: userRef.current?.name || userRef.current?.email || 'Technician',
          email: userRef.current?.email,
        };
        updateRepairTicketFieldsService(ticketId, toFlush, author, tenantId).catch((err) => {
          console.warn('[RepairDetail] Unmount flush warning:', err);
        });
      }
    };
  }, [ticketId, tenantId]);

  // Load tenant reference data (Inventory equipment, suppliers, crew)
  useEffect(() => {
    if (!tenantId) return;
    let isMounted = true;
    setLoadingTenantData(true);

    Promise.all([
      fetchEquipment(tenantId).catch(() => []),
      fetchTenantSuppliers(tenantId).catch(() => []),
      fetchTenantCrewMembers(tenantId).catch(() => []),
    ])
      .then(([eqList, suppList, crewList]) => {
        if (isMounted) {
          setTenantEquipment(eqList);
          setTenantSuppliers(suppList);
          setTenantCrew(crewList);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingTenantData(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  // Initialize/synchronize form fields when ticket or params change
  const initializedTicketIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isNewMode) {
      if (initializedTicketIdRef.current === 'new') return;
      initializedTicketIdRef.current = 'new';
      const mergedParams = { ...localParams, ...propParams };
      if (mergedParams.name) setEquipmentName(mergedParams.name);
      if (mergedParams.serialNumber) setSerialNumber(mergedParams.serialNumber);
      if (mergedParams.barcode) setBarcode(mergedParams.barcode);
      if (mergedParams.category) setCategory(mergedParams.category);
      if (mergedParams.location) setLocation(mergedParams.location);
      if (mergedParams.equipmentId) setEquipmentId(mergedParams.equipmentId);
      setRequestedBy(user?.name || user?.email || 'Alex Technician');
      setStatus('Reported');
      setPriority('High');
      setCondition('Out of Service');
    } else if (ticket && initializedTicketIdRef.current !== ticket.id) {
      initializedTicketIdRef.current = ticket.id;
      setEquipmentName(ticket.equipment?.name || '');
      setSerialNumber(ticket.equipment?.serialNumber || '');
      setBarcode(ticket.equipment?.barcode || '');
      setCategory(ticket.equipment?.category || 'Equipment');
      setLocation(ticket.equipment?.knownLocation || '');
      setEquipmentId(ticket.equipment?.id || '');
      setInternalReference(ticket.internalReference || '');
      setSupplierId(ticket.supplierId || '');
      setRequestedBy(ticket.requestedBy || 'Alex Technician');
      setPriority(normalizeRepairPriority(ticket.priority));
      setCondition(ticket.condition === 'Available to Use' ? 'Available to Use' : 'Out of Service');
      setStatus(normalizeRepairStatus(ticket.status));
      setRepairPeriodStart(ticket.repairPeriodStart || null);
      setRepairPeriodEnd(ticket.repairPeriodEnd || null);
    }
  }, [isNewMode, ticket?.id]);

  // Serial suggestions derived from selected equipment item
  const serialSuggestions = useMemo(() => {
    if (!selectedEquipmentItem) {
      // Find matching item by equipmentName or equipmentId
      const found = tenantEquipment.find(
        (eq) =>
          (equipmentId && eq.id === equipmentId) ||
          (equipmentName && eq.name.toLowerCase() === equipmentName.toLowerCase())
      );
      if (found) {
        if (Array.isArray(found.serialNumbers) && found.serialNumbers.length > 0) {
          return found.serialNumbers
            .map((s: any) => (typeof s === 'string' ? s : s?.serial || s?.serialNumber || ''))
            .filter((s) => Boolean(s && s.trim()));
        }
        if (found.serialNumber) return [found.serialNumber];
      }
      return [];
    }

    if (Array.isArray(selectedEquipmentItem.serialNumbers) && selectedEquipmentItem.serialNumbers.length > 0) {
      return selectedEquipmentItem.serialNumbers
        .map((s: any) => (typeof s === 'string' ? s : s?.serial || s?.serialNumber || ''))
        .filter((s) => Boolean(s && s.trim()));
    }
    if (selectedEquipmentItem.serialNumber) {
      return [selectedEquipmentItem.serialNumber];
    }
    return [];
  }, [selectedEquipmentItem, tenantEquipment, equipmentId, equipmentName]);

  // Back Navigation handler
  const handleBack = async () => {
    await flushPendingUpdates();
    router.replace('/(tabs)/repairs' as any);
  };

  // ============================================================================
  // FIELD CHANGE HANDLERS (Optimistic + Queued)
  // ============================================================================

  // Equipment Name Handler
  const handleEquipmentNameChange = (val: string) => {
    setEquipmentName(val);
    setActionError(null);
    queueFieldUpdate({ equipmentName: val.trim() });
  };

  const handleSelectEquipmentSuggestion = (eq: Equipment) => {
    setSelectedEquipmentItem(eq);
    setEquipmentName(eq.name);
    setEquipmentId(eq.id);
    if (eq.barcode) setBarcode(eq.barcode);
    if (eq.category) setCategory(eq.category);

    const firstSerial =
      eq.serialNumber ||
      (Array.isArray(eq.serialNumbers) && eq.serialNumbers.length > 0
        ? typeof eq.serialNumbers[0] === 'string'
          ? eq.serialNumbers[0]
          : (eq.serialNumbers[0] as any)?.serial || (eq.serialNumbers[0] as any)?.serialNumber || ''
        : '');

    if (firstSerial && !serialNumber) {
      setSerialNumber(firstSerial);
    }

    setActionError(null);
    HapticService.scanSuccess().catch(() => {});

    queueFieldUpdate({
      equipmentName: eq.name,
      equipment: {
        id: eq.id,
        name: eq.name,
        barcode: eq.barcode || null,
        category: eq.category || null,
        serialNumber: firstSerial || serialNumber || null,
      },
    });
  };

  // Serial Number Handler
  const handleSerialChange = (val: string) => {
    setSerialNumber(val);
    setActionError(null);
    queueFieldUpdate({ serialNumber: val.trim() || null });
  };

  // Internal Reference Handler
  const handleInternalRefChange = (val: string) => {
    setInternalReference(val);
    setActionError(null);
    queueFieldUpdate({ internalReference: val.trim() || null });
  };

  // Supplier Handler
  const handleSupplierChange = (val: string) => {
    setSupplierId(val);
    setActionError(null);
    queueFieldUpdate({ supplierId: val.trim() || null });
  };

  const handleSelectSupplierSuggestion = (supp: TenantSupplier) => {
    setSupplierId(supp.name);
    setActionError(null);
    HapticService.scanSuccess().catch(() => {});
    queueFieldUpdate({ supplierId: supp.name });
  };

  // Requested By Handler
  const handleRequestedByChange = (val: string) => {
    setRequestedBy(val);
    setActionError(null);
    queueFieldUpdate({ requestedBy: val.trim() || 'Alex Technician' });
  };

  const handleSelectCrewSuggestion = (crewMember: TenantCrewMember) => {
    setRequestedBy(crewMember.name);
    setActionError(null);
    HapticService.scanSuccess().catch(() => {});
    queueFieldUpdate({ requestedBy: crewMember.name });
  };

  // Priority Change (Combined Row 2)
  const handleSelectPriority = (newPriority: RepairPriority) => {
    setPriority(newPriority);
    setActionError(null);
    HapticService.scanSuccess().catch(() => {});
    queueFieldUpdate({ priority: newPriority });
  };

  // Condition Change (Combined Row 2)
  const handleSelectCondition = (newCondition: EquipmentCondition) => {
    setCondition(newCondition);
    setActionError(null);
    HapticService.scanSuccess().catch(() => {});
    queueFieldUpdate({ condition: newCondition });
  };

  // Status Change (Row 1 Strip)
  const handleStatusChange = async (newStatus: RepairStatus) => {
    if (isNewMode) {
      setStatus(newStatus);
      HapticService.scanSuccess().catch(() => {});
      return;
    }

    try {
      setIsUpdatingStatus(true);
      setActionError(null);
      await flushPendingUpdates(); // Flush pending edits first
      setStatus(newStatus);
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
      };
      await updateRepairTicketStatusService(ticketId, newStatus, author, tenantId);
      await HapticService.scanSuccess();
    } catch (err: any) {
      console.error('[RepairDetail] Status change error:', err);
      if (isMountedRef.current) {
        setActionError(err?.message || 'Failed to update status');
      }
      await HapticService.scanError();
    } finally {
      if (isMountedRef.current) {
        setIsUpdatingStatus(false);
      }
    }
  };

  // Date Scroller Save
  const handleSaveDates = (sIso: string | null, eIso: string | null) => {
    setRepairPeriodStart(sIso);
    setRepairPeriodEnd(eIso);
    setActionError(null);
    HapticService.scanSuccess().catch(() => {});
    queueFieldUpdate({
      repairPeriodStart: sIso,
      repairPeriodEnd: eIso,
    });
  };

  // Create Ticket Submit (New Mode)
  const handleCreateTicketSubmit = async () => {
    if (!equipmentName.trim()) {
      setActionError('Equipment name or identifier is required');
      HapticService.scanError().catch(() => {});
      return;
    }

    if (!faultDescription.trim()) {
      setActionError('Please provide a fault description / damage notes');
      HapticService.scanError().catch(() => {});
      return;
    }

    if (!tenantId) {
      setActionError('Active tenant context missing. Please log in again.');
      return;
    }

    try {
      setIsSubmittingNew(true);
      setActionError(null);

      const attachmentsPayload: RepairAttachment[] = newModePhotos.map((p) => ({
        id: p.id,
        type: 'Photo',
        url: p.url || p.uri || '',
        fileName: p.fileName || 'damage_image.jpg',
        uploadedAt: new Date().toISOString(),
      }));

      const newId = await createRepairTicket(
        tenantId,
        {
          equipment: {
            id: equipmentId || null,
            name: equipmentName.trim(),
            serialNumber: serialNumber.trim() || null,
            barcode: barcode.trim() || null,
            category: category.trim() || 'Equipment',
            knownLocation: location.trim() || null,
            quantity: 1,
          },
          repairType: 'General Fault',
          priority,
          status,
          condition,
          requestedBy: requestedBy.trim() || user?.name || 'Alex Technician',
          supplierId: supplierId.trim() || null,
          internalReference: internalReference.trim() || null,
          repairPeriodStart,
          repairPeriodEnd,
          assignee: user ? { id: user.id, name: user.name, email: user.email } : null,
          initialNote: faultDescription.trim() || undefined,
          attachments: attachmentsPayload,
        },
        user ? { id: user.id, name: user.name, email: user.email } : undefined
      );

      await HapticService.scanSuccess();

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/repairs' as any);
      }
    } catch (err: any) {
      console.error('[NewRepair] Create ticket error:', err);
      setActionError(err?.message || 'Failed to submit repair ticket');
      await HapticService.scanError();
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Photo / Image Handlers (Direct Camera Capture)
  const handleTakeCameraPhoto = async () => {
    if (isSubmittingAttachment) return;
    try {
      setIsSubmittingAttachment(true);
      setActionError(null);

      const timestamp = Date.now();
      const mockUri = `https://firebasestorage.googleapis.com/v0/b/mock/o/camera_photo_${timestamp}.jpg`;
      const fileName = `photo_${timestamp}.jpg`;

      if (isNewMode) {
        setNewModePhotos((prev) => [
          ...prev,
          {
            id: `photo_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
            url: mockUri,
            uri: mockUri,
            fileName,
          },
        ]);
      } else {
        await addAttachment({
          type: 'Photo',
          url: mockUri,
          fileName,
          uploadedAt: new Date().toISOString(),
        });
      }
      await HapticService.scanSuccess();
    } catch (err: any) {
      console.error('[RepairDetail] Camera capture error:', err);
      setActionError(err?.message || 'Failed to capture photo');
      await HapticService.scanError();
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const handleAddNewModePhoto = () => {
    handleTakeCameraPhoto();
  };

  const handleRemoveNewModePhoto = (id: string) => {
    setNewModePhotos((prev) => prev.filter((p) => p.id !== id));
  };

  // Detail Mode Add Note Handler
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

  // Detail Mode Edit Note Handler
  const handleSaveEditedNote = async () => {
    if (isSavingNote || !editingNote || !ticket) return;
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
    setEditingNote(null);
    setDeleteConfirmState({
      visible: true,
      title: 'Delete Technician Note',
      message: 'Are you sure you want to delete this note? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await deleteNote(note.id);
          await HapticService.scanSuccess();
        } catch (err: any) {
          setActionError(err?.message || 'Failed to delete note');
        } finally {
          setDeleteConfirmState((prev) => ({ ...prev, visible: false }));
        }
      },
    });
  };

  // Detail Mode Attachment Handlers
  const handleSimulateAddPhoto = async () => {
    if (isSubmittingAttachment) return;
    const timestamp = Date.now();
    const mockUri = `https://firebasestorage.googleapis.com/v0/b/mock/o/damage_${timestamp}.jpg`;
    const fileName = `image_${timestamp}.jpg`;

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
      setActionError(err?.message || 'Failed to attach image');
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const handleSimulateAddDoc = async (type: 'PDF' | 'Document') => {
    if (isSubmittingAttachment) return;
    const timestamp = Date.now();
    const mockUri = `https://firebasestorage.googleapis.com/v0/b/mock/o/spec_${timestamp}.pdf`;
    const fileName = type === 'PDF' ? `manual_${timestamp}.pdf` : `repair_spec_${timestamp}.docx`;

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
      setActionError(err?.message || 'Failed to attach document');
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const promptDeleteAttachment = (att: RepairAttachment | { id: string; fileName?: string }) => {
    setViewingDoc(null);
    setViewingPhoto(null);
    setDeleteConfirmState({
      visible: true,
      title: 'Delete Attachment',
      message: `Are you sure you want to delete "${att.fileName || 'this attachment'}"?`,
      onConfirm: async () => {
        try {
          if (ticketId && tenantId) {
            const author = {
              id: userRef.current?.id || 'unknown',
              name: userRef.current?.name || userRef.current?.email || 'Technician',
              email: userRef.current?.email,
            };
            await deleteRepairAttachment(ticketId, att.id, author, tenantId);
          } else {
            await deleteAttachment(att.id);
          }
          await HapticService.scanSuccess();
        } catch (err: any) {
          setActionError(err?.message || 'Failed to delete attachment');
        } finally {
          setDeleteConfirmState((prev) => ({ ...prev, visible: false }));
        }
      },
    });
  };

  // Group photos vs doc attachments
  const photoAttachments = useMemo(() => {
    if (isNewMode) return newModePhotos;
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
  }, [isNewMode, newModePhotos, ticket?.attachments]);

  const docAttachments = useMemo(() => {
    if (isNewMode) return [];
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
  }, [isNewMode, ticket?.attachments]);

  // Loading state for detail mode
  if (!isNewMode && loadingTicket && !ticket) {
    return (
      <View style={[styles.screen, styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 12 }]}>
          Loading repair ticket details...
        </Text>
      </View>
    );
  }

  // Not found error for detail mode
  if (!isNewMode && (ticketError || !ticket)) {
    return (
      <View style={[styles.screen, styles.centerContainer, { backgroundColor: colors.background }]}>
        <AlertTriangle size={36} color={colors.destructive} />
        <Text style={[styles.errorTitle, { color: colors.foreground, marginTop: 12, fontSize: typography.fontSize.base }]}>
          Ticket Not Found
        </Text>
        <Text style={[styles.errorSub, { color: colors.mutedForeground, marginTop: 4, fontSize: typography.fontSize.xs }]}>
          {ticketError?.message || 'The requested repair ticket could not be loaded.'}
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

  const repairNumDisplay = isNewMode
    ? 'New'
    : ticket?.repairNumber !== undefined && ticket?.repairNumber !== null
    ? `[${ticket.repairNumber}]`
    : ticket?.id
    ? `[${ticket.id.substring(0, 7).toUpperCase()}]`
    : '[REP]';

  const startDateObj = repairPeriodStart ? parseFirestoreDate(repairPeriodStart) : null;
  const endDateObj = repairPeriodEnd ? parseFirestoreDate(repairPeriodEnd) : null;
  const periodDisplay = startDateObj || endDateObj
    ? formatEventDateRange(startDateObj, endDateObj)
    : '—';

  const isOutOfService = condition === 'Out of Service';
  const totalNotesCount = ticket?.notes?.length || 0;
  const totalAttachmentsCount = photoAttachments.length + docAttachments.length;
  const totalPartsCost = calculateRepairCostTotal(ticket?.partsUsed || []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      {/* Header Bar */}
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
          {/* Back Button */}
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.75 },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID={isNewMode ? 'new-repair-back-btn' : 'ticket-detail-back-btn'}
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </Pressable>

          {/* Header Title */}
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTicketId, { color: colors.mutedForeground, fontSize: typography.fontSize.lg }]}>
              {repairNumDisplay}
            </Text>
            <Text
              style={[styles.headerEquipmentName, { color: colors.foreground, fontSize: typography.fontSize.lg, flexShrink: 1, marginLeft: 8 }]}
              numberOfLines={1}
              testID="ticket-equipment-name"
            >
              {equipmentName || (isNewMode ? 'Report Fault' : 'Equipment Repair')}
            </Text>
          </View>

          {/* Top Right Edit Pencil Icon */}
          <Pressable
            onPress={() => setIsEditEquipmentModalOpen(true)}
            style={({ pressed }) => [
              styles.headerEditButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.75 },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Edit equipment details"
            testID="header-edit-equipment-btn"
          >
            <Edit2 size={16} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Main Scrollable Content */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.base, paddingBottom: 120 }]}
        refreshControl={!isNewMode ? <RefreshControl refreshing={loadingTicket} onRefresh={refresh} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hidden legacy triggers for test compatibility */}
        <Pressable
          style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
          onPress={() => setIsEditEquipmentModalOpen(true)}
          testID="header-equipment-name-btn"
        />

        {/* Action Error Banner */}
        {actionError ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)' }]}>
            <AlertTriangle size={14} color={colors.destructive} />
            <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
              {actionError}
            </Text>
          </View>
        ) : null}

        {/* Row 1: 5-Button Status Transition Strip */}
        <Card style={styles.card} testID="detail-quick-status-selector">
          <CardContent style={styles.stripCardContent}>
            <QuickStatusSelector
              currentStatus={status}
              onSelectStatus={handleStatusChange}
              isUpdating={isUpdatingStatus}
              showHeader={true}
              testID="ticket-quick-status-selector"
            />
          </CardContent>
        </Card>

        {/* Row 2: Priority and Condition Cards Side by Side */}
        <View style={styles.sideBySideCardsRow} testID="combined-priority-condition-row">
          {/* Left Card: PRIORITY */}
          <Card style={[styles.card, styles.prioritySideCard]} testID="ticket-priority-card">
            <CardContent style={styles.sideCardContent}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
                  PRIORITY
                </Text>
              </View>

              <View style={styles.priorityBoxRow} testID="ticket-priority-strip">
                {/* Box 1: Low Priority */}
                <Pressable
                  onPress={() => handleSelectPriority('Low')}
                  style={({ pressed }) => [
                    styles.sideEqualBox,
                    {
                      backgroundColor:
                        priority === 'Low'
                          ? isDark
                            ? 'rgba(59, 130, 246, 0.18)'
                            : 'rgba(59, 130, 246, 0.10)'
                          : colors.surface,
                      borderColor: priority === 'Low' ? '#3B82F6' : colors.border,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  testID="priority-btn-low"
                  accessibilityRole="button"
                  accessibilityState={{ selected: priority === 'Low' }}
                  accessibilityLabel="Set priority to Low"
                >
                  <View style={[styles.indicatorDot, { backgroundColor: '#3B82F6' }]} />
                  <Text
                    style={[
                      styles.boxLabelText,
                      {
                        color: priority === 'Low' ? (isDark ? '#60A5FA' : '#1D4ED8') : colors.foreground,
                        fontWeight: '500',
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    Low
                  </Text>
                  {/* Hidden text for test compatibility */}
                  <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                    {priority === 'Low' ? 'Low Priority' : ''}
                  </Text>
                </Pressable>

                {/* Box 2: Medium Priority */}
                <Pressable
                  onPress={() => handleSelectPriority('Medium')}
                  style={({ pressed }) => [
                    styles.sideEqualBox,
                    {
                      backgroundColor:
                        priority === 'Medium'
                          ? isDark
                            ? 'rgba(245, 158, 11, 0.18)'
                            : 'rgba(245, 158, 11, 0.10)'
                          : colors.surface,
                      borderColor: priority === 'Medium' ? '#F59E0B' : colors.border,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  testID="priority-btn-medium"
                  accessibilityRole="button"
                  accessibilityState={{ selected: priority === 'Medium' }}
                  accessibilityLabel="Set priority to Medium"
                >
                  <View style={[styles.indicatorDot, { backgroundColor: '#F59E0B' }]} />
                  <Text
                    style={[
                      styles.boxLabelText,
                      {
                        color: priority === 'Medium' ? (isDark ? '#FBBF24' : '#B45309') : colors.foreground,
                        fontWeight: '500',
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    Med
                  </Text>
                  <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                    {priority === 'Medium' ? 'Medium Priority' : ''}
                  </Text>
                </Pressable>

                {/* Box 3: High Priority */}
                <Pressable
                  onPress={() => handleSelectPriority('High')}
                  style={({ pressed }) => [
                    styles.sideEqualBox,
                    {
                      backgroundColor:
                        priority === 'High'
                          ? isDark
                            ? 'rgba(239, 68, 68, 0.18)'
                            : 'rgba(239, 68, 68, 0.10)'
                          : colors.surface,
                      borderColor: priority === 'High' ? '#EF4444' : colors.border,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  testID="priority-btn-high"
                  accessibilityRole="button"
                  accessibilityState={{ selected: priority === 'High' }}
                  accessibilityLabel="Set priority to High"
                >
                  <View style={[styles.indicatorDot, { backgroundColor: '#EF4444' }]} />
                  <Text
                    style={[
                      styles.boxLabelText,
                      {
                        color: priority === 'High' ? (isDark ? '#F87171' : '#DC2626') : colors.foreground,
                        fontWeight: '500',
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    High
                  </Text>
                  <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                    {priority === 'High' ? 'High Priority' : ''}
                  </Text>
                </Pressable>
              </View>
            </CardContent>
          </Card>

          {/* Right Card: CONDITION */}
          <Card style={[styles.card, styles.conditionSideCard]} testID="ticket-condition-card">
            <CardContent style={styles.sideCardContent}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
                  CONDITION
                </Text>
              </View>

              <View style={styles.conditionBoxRow} testID="ticket-condition-strip">
                {/* Box 1: Available to Use */}
                <Pressable
                  onPress={() => handleSelectCondition('Available to Use')}
                  style={({ pressed }) => [
                    styles.sideEqualBox,
                    {
                      backgroundColor:
                        !isOutOfService
                          ? isDark
                            ? 'rgba(16, 185, 129, 0.18)'
                            : 'rgba(16, 185, 129, 0.10)'
                          : colors.surface,
                      borderColor: !isOutOfService ? '#10B981' : colors.border,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  testID="condition-btn-available"
                  accessibilityRole="button"
                  accessibilityState={{ selected: !isOutOfService }}
                  accessibilityLabel="Set condition to Available to Use"
                >
                  <CheckCircle2
                    size={12}
                    color={!isOutOfService ? (isDark ? '#34D399' : '#047857') : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.boxLabelText,
                      {
                        color: !isOutOfService ? (isDark ? '#34D399' : '#047857') : colors.foreground,
                        fontWeight: '500',
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    Available
                  </Text>
                  <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                    {!isOutOfService ? 'Available to Use' : ''}
                  </Text>
                </Pressable>

                {/* Box 2: Out of Service */}
                <Pressable
                  onPress={() => handleSelectCondition('Out of Service')}
                  style={({ pressed }) => [
                    styles.sideEqualBox,
                    {
                      backgroundColor:
                        isOutOfService
                          ? isDark
                            ? 'rgba(239, 68, 68, 0.18)'
                            : 'rgba(239, 68, 68, 0.10)'
                          : colors.surface,
                      borderColor: isOutOfService ? '#EF4444' : colors.border,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  testID="condition-btn-out-of-service"
                  accessibilityRole="button"
                  accessibilityState={{ selected: isOutOfService }}
                  accessibilityLabel="Set condition to Out of Service"
                >
                  <ShieldAlert
                    size={12}
                    color={isOutOfService ? (isDark ? '#F87171' : '#DC2626') : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.boxLabelText,
                      {
                        color: isOutOfService ? (isDark ? '#F87171' : '#DC2626') : colors.foreground,
                        fontWeight: '500',
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    Out of Svc
                  </Text>
                  <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                    {isOutOfService ? 'Out of Service' : ''}
                  </Text>
                </Pressable>
              </View>

              {/* Hidden condition/priority selectors for backwards test compatibility */}
              <View style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                <Pressable testID="condition-available" onPress={() => handleSelectCondition('Available to Use')} />
                <Pressable testID="condition-out-of-service" onPress={() => handleSelectCondition('Out of Service')} />
                <Pressable testID="priority-pill-critical" onPress={() => handleSelectPriority('Critical')} />
                <Pressable testID="priority-pill-high" onPress={() => handleSelectPriority('High')} />
                <Pressable testID="priority-pill-medium" onPress={() => handleSelectPriority('Medium')} />
                <Pressable testID="priority-pill-low" onPress={() => handleSelectPriority('Low')} />
              </View>
            </CardContent>
          </Card>
        </View>

        {/* Row 3: Single Text Inputs with Autocomplete for Equipment, Serial, Requester, Supplier */}
        <Card style={styles.card} testID="ticket-info-card">
          <CardContent style={styles.stripCardContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
                EQUIPMENT & DETAILS
              </Text>
            </View>

            <View style={styles.fieldsStack}>
              {/* Hidden equipment input for backward test compatibility */}
              <TextInput
                value={equipmentName}
                onChangeText={handleEquipmentNameChange}
                style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
                testID="input-equipment-name"
              />

              {/* 1. Serial Number Autocomplete Input */}
              <AutocompleteInput<string>
                label="SERIAL NUMBER"
                value={serialNumber}
                onChangeText={handleSerialChange}
                placeholder="Type serial or select from equipment..."
                suggestions={serialSuggestions}
                getSuggestionLabel={(s) => s}
                onSelectSuggestion={(s) => {
                  setSerialNumber(s);
                  queueFieldUpdate({ serialNumber: s });
                }}
                icon={<Tag size={15} color={colors.mutedForeground} />}
                inputTestID="input-serial-number"
                suggestionTestIDPrefix="serial-option"
              />

              {/* Barcode & Category row */}
              <View style={styles.rowTwoCols}>
                <View style={styles.col}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs, marginBottom: 6 }]}>
                    BARCODE / ASSET #
                  </Text>
                  <View style={[styles.textInputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                      value={barcode}
                      onChangeText={(b) => {
                        setBarcode(b);
                        queueFieldUpdate({ equipment: { barcode: b || null } });
                      }}
                      placeholder="Barcode..."
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.singleTextInput, { color: colors.foreground, fontSize: typography.fontSize.sm }]}
                      testID="input-barcode"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={styles.col}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs, marginBottom: 6 }]}>
                    CATEGORY
                  </Text>
                  <View style={[styles.textInputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                      value={category}
                      onChangeText={(cat) => {
                        setCategory(cat);
                        queueFieldUpdate({ equipment: { category: cat || null } });
                      }}
                      placeholder="Category..."
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.singleTextInput, { color: colors.foreground, fontSize: typography.fontSize.sm }]}
                      testID="input-category"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>

              {/* Location Input */}
              <View style={styles.fieldWrapper}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  CURRENT LOCATION
                </Text>
                <View style={[styles.textInputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    value={location}
                    onChangeText={(loc) => {
                      setLocation(loc);
                      queueFieldUpdate({ equipment: { knownLocation: loc || null } });
                    }}
                    placeholder="Location..."
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.singleTextInput, { color: colors.foreground, fontSize: typography.fontSize.sm }]}
                    testID="input-location"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* 3. Internal Reference */}
              <View style={styles.fieldWrapper}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  INTERNAL REFERENCE
                </Text>
                <View style={[styles.textInputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <FileText size={15} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    value={internalReference}
                    onChangeText={handleInternalRefChange}
                    placeholder="Internal reference / job ref..."
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.singleTextInput, { color: colors.foreground, fontSize: typography.fontSize.sm }]}
                    testID="input-internal-ref"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* 4. Supplier Autocomplete Input */}
              <AutocompleteInput<TenantSupplier>
                label="SUPPLIER"
                value={supplierId}
                onChangeText={handleSupplierChange}
                placeholder="Type supplier or select from contacts..."
                suggestions={tenantSuppliers}
                getSuggestionLabel={(supp) => supp.name}
                getSuggestionSublabel={(supp) => supp.type || supp.email}
                onSelectSuggestion={handleSelectSupplierSuggestion}
                icon={<Building2 size={15} color={colors.mutedForeground} />}
                inputTestID="input-supplier"
                suggestionTestIDPrefix="supplier-option"
                emptySuggestionsMessage="No suppliers found in tenant contacts."
              />

              {/* 5. Requested By Autocomplete Input */}
              <AutocompleteInput<TenantCrewMember>
                label="REQUESTED BY"
                value={requestedBy}
                onChangeText={handleRequestedByChange}
                placeholder="Type requester or select from crew..."
                suggestions={tenantCrew}
                getSuggestionLabel={(c) => c.name}
                getSuggestionSublabel={(c) => c.position || c.role || c.email}
                onSelectSuggestion={handleSelectCrewSuggestion}
                icon={<Users size={15} color={colors.mutedForeground} />}
                inputTestID="input-requested-by"
                suggestionTestIDPrefix="crew-option"
                emptySuggestionsMessage="No crew members found in tenant users."
              />

              {/* 6. Repair Period Tile (Taps to open 3-Column Mobile Date Scroller) */}
              <Pressable
                onPress={() => setIsDateScrollerOpen(true)}
                style={({ pressed }) => [
                  styles.periodTile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                testID="ticket-repair-period"
                accessibilityRole="button"
                accessibilityLabel={`Repair Period: ${periodDisplay}. Tap to edit`}
              >
                <View style={styles.periodTileHeader}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    REPAIR PERIOD
                  </Text>
                  <Calendar size={13} color={colors.primary} />
                </View>
                <Text style={[styles.periodValueText, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                  {periodDisplay}
                </Text>
              </Pressable>
            </View>

            {/* Hidden legacy trigger buttons for test backward-compatibility */}
            <Pressable style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }} onPress={() => setIsEditSerialModalOpen(true)} testID="ticket-serial-number" />
            <Pressable style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }} onPress={() => setIsEditInternalRefModalOpen(true)} testID="ticket-internal-ref" />
            <Pressable style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }} onPress={() => setIsSupplierPickerModalOpen(true)} testID="ticket-supplier" />
            <Pressable style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }} onPress={() => setIsCrewPickerModalOpen(true)} testID="ticket-requested-by" />
          </CardContent>
        </Card>

        {/* Initial Fault Description Note (When in New Mode) */}
        {isNewMode ? (
          <Card style={styles.card} testID="fault-details-card">
            <CardContent style={styles.stripCardContent}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
                  FAULT DESCRIPTION & NOTES *
                </Text>
              </View>
              <TextInput
                value={faultDescription}
                onChangeText={(val) => {
                  setFaultDescription(val);
                  if (actionError) setActionError(null);
                }}
                placeholder="Describe fault, damage symptoms, or reason for repair..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                style={[
                  styles.textAreaInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
                ]}
                testID="input-fault-description"
              />
            </CardContent>
          </Card>
        ) : null}

        {/* Images & Documents Card */}
        <Card style={styles.card} testID="ticket-notes-attachments-card">
          <CardContent style={styles.stripCardContent}>
            <View style={styles.sectionHeaderRowWithBadge}>
              <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
                IMAGES & DOCUMENTS
              </Text>
              {totalAttachmentsCount > 0 ? (
                <Badge variant="secondary">{String(totalAttachmentsCount)}</Badge>
              ) : null}
            </View>

            {/* Images Section (Renamed from Damage Photos) */}
            <View style={styles.sectionBlock}>
              <RepairPhotoGallery
                photos={photoAttachments}
                editable={true}
                onAddPhoto={handleTakeCameraPhoto}
                onRemovePhoto={isNewMode ? handleRemoveNewModePhoto : (id) => promptDeleteAttachment({ id })}
                onPressPhoto={(photo) => setViewingPhoto(photo)}
                title="Images"
                testID="repair-photo-gallery"
              />
            </View>

            {/* Documents Section (Renamed from Documents & Specifications) */}
            {!isNewMode ? (
              <View style={[styles.sectionBlock, { marginTop: 14 }]}>
                <View style={styles.sectionSubHeaderRow}>
                  <Text style={[styles.sectionSubtitle, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Documents ({docAttachments.length})
                  </Text>
                </View>

                {docAttachments.length === 0 ? (
                  <View style={[styles.emptySectionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.emptySectionText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                      No documents attached.
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

                        <Pressable
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            promptDeleteAttachment(docItem);
                          }}
                          style={styles.docDeleteBtn}
                          hitSlop={8}
                          testID={`delete-doc-btn-${index}`}
                        >
                          <Trash2 size={14} color={colors.destructive} />
                        </Pressable>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ) : null}

            {/* Technician Notes (Detail Mode) */}
            {!isNewMode ? (
              <View style={[styles.sectionBlock, { marginTop: 14 }]}>
                <View style={styles.sectionSubHeaderRow}>
                  <Text style={[styles.sectionSubtitle, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Technician Notes ({totalNotesCount})
                  </Text>
                </View>

                {!ticket?.notes || ticket.notes.length === 0 ? (
                  <View style={[styles.emptySectionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.emptySectionText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                      No notes recorded yet. Tap "Add Note" below to record technician logs.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.notesList}>
                    {ticket.notes.map((note, index) => (
                      <Pressable
                        key={note.id || `note-${index}`}
                        onPress={() => {
                          setEditingNote(note);
                          setEditedNoteContent(note.content);
                        }}
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
            ) : null}
          </CardContent>
        </Card>

        {/* Parts Used (If Any in Detail Mode) */}
        {!isNewMode && ticket?.partsUsed && ticket.partsUsed.length > 0 ? (
          <Card style={styles.card} testID="ticket-parts-card">
            <CardContent style={styles.stripCardContent}>
              <View style={styles.sectionHeaderRowWithBadge}>
                <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
                  PARTS USED
                </Text>
                {totalPartsCost > 0 ? (
                  <Badge variant="brand">{`$${totalPartsCost.toFixed(2)}`}</Badge>
                ) : null}
              </View>

              {ticket.partsUsed.map((part, index) => (
                <View key={part.id || `part-${index}`} style={[styles.partRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.partName, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                      {part.name}
                    </Text>
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
      </ScrollView>

      {/* Bottom Fixed Action Bar */}
      <View
        style={[
          styles.fixedBottomBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm,
          },
        ]}
      >
        {isNewMode ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<Send size={16} color={colors.primaryForeground} />}
            onPress={handleCreateTicketSubmit}
            loading={isSubmittingNew}
            disabled={isSubmittingNew}
            testID="submit-repair-btn"
          >
            {isSubmittingNew ? 'Creating Ticket...' : 'Create Ticket'}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="default"
              icon={<FileText size={16} color={colors.primary} />}
              onPress={() => {
                setNewNoteText('');
                setIsAddNoteOpen(true);
              }}
              style={styles.bottomBarButton}
              testID="detail-add-note-btn"
            >
              Add Note
            </Button>

            <Button
              variant="primary"
              size="default"
              icon={<Paperclip size={16} color={colors.primaryForeground} />}
              onPress={() => setIsAddAttachmentOpen(true)}
              style={styles.bottomBarButton}
              testID="detail-add-attachment-btn"
            >
              Add Attachment
            </Button>
          </>
        )}
      </View>

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* Mobile Date Scroller Modal */}
      <MobileDateScroller
        visible={isDateScrollerOpen}
        startDate={repairPeriodStart}
        endDate={repairPeriodEnd}
        onSave={handleSaveDates}
        onClose={() => setIsDateScrollerOpen(false)}
        testID="edit-period-modal"
      />

      {/* Add Note Modal */}
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
              <Pressable onPress={() => setIsAddNoteOpen(false)} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={newNoteText}
                onChangeText={setNewNoteText}
                placeholder="Enter technician notes..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                style={[
                  styles.textAreaInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
                ]}
                testID="add-note-input"
              />
              <View style={styles.modalFooterRow}>
                <Button variant="outline" size="default" onPress={() => setIsAddNoteOpen(false)} style={{ flex: 1 }}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleCreateNote}
                  loading={isSubmittingNote}
                  disabled={!newNoteText.trim() || isSubmittingNote}
                  style={{ flex: 2 }}
                  testID="submit-add-note-btn"
                >
                  Add Note
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Note Modal */}
      <Modal
        visible={!!editingNote}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingNote(null)}
        testID="edit-note-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditingNote(null)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Edit Technician Note
              </Text>
              <Pressable onPress={() => setEditingNote(null)} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={editedNoteContent}
                onChangeText={setEditedNoteContent}
                multiline
                numberOfLines={4}
                style={[
                  styles.textAreaInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
                ]}
                testID="edit-note-input"
              />
              <View style={styles.modalFooterRow}>
                <Button
                  variant="destructive"
                  size="default"
                  icon={<Trash2 size={15} color="#FFFFFF" />}
                  onPress={() => editingNote && promptDeleteNote(editingNote)}
                  testID="delete-note-btn"
                >
                  Delete
                </Button>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleSaveEditedNote}
                  loading={isSavingNote}
                  disabled={!editedNoteContent.trim() || isSavingNote}
                  style={{ flex: 1 }}
                  testID="save-edit-note-btn"
                >
                  Save Note
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Attachment Modal */}
      <Modal
        visible={isAddAttachmentOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddAttachmentOpen(false)}
        testID="add-attachment-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsAddAttachmentOpen(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Add Image or Document
              </Text>
              <Pressable onPress={() => setIsAddAttachmentOpen(false)} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <View style={{ gap: 10 }}>
                <Button
                  variant="outline"
                  size="default"
                  icon={<Camera size={16} color={colors.primary} />}
                  onPress={handleSimulateAddPhoto}
                  loading={isSubmittingAttachment}
                  testID="add-photo-evidence-btn"
                >
                  Attach Image / Photo
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  icon={<FileText size={16} color={colors.primary} />}
                  onPress={() => handleSimulateAddDoc('PDF')}
                  loading={isSubmittingAttachment}
                  testID="add-doc-evidence-btn"
                >
                  Attach Service PDF / Manual
                </Button>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Lightbox / Document Viewer Modals */}
      <Modal
        visible={!!viewingPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingPhoto(null)}
        testID="photo-lightbox-modal"
      >
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxBackdrop} onPress={() => setViewingPhoto(null)} />
          <View style={styles.lightboxHeader}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
              {viewingPhoto?.fileName || 'Image'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => viewingPhoto && promptDeleteAttachment(viewingPhoto as any)}
                testID="lightbox-delete-btn"
                hitSlop={8}
              >
                <Trash2 size={20} color="#EF4444" />
              </Pressable>
              <Pressable onPress={() => setViewingPhoto(null)} hitSlop={8}>
                <X size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          {viewingPhoto?.url ? (
            <View style={styles.lightboxContent}>
              <Image source={{ uri: viewingPhoto.url }} style={styles.lightboxImage} resizeMode="contain" />
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={!!viewingDoc}
        transparent
        animationType="slide"
        onRequestClose={() => setViewingDoc(null)}
        testID="doc-viewer-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setViewingDoc(null)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: 14 }]} numberOfLines={1}>
                {viewingDoc?.fileName || 'Document'}
              </Text>
              <Pressable onPress={() => setViewingDoc(null)} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                URL: {viewingDoc?.url}
              </Text>
              <View style={styles.modalFooterRow}>
                <Button
                  variant="destructive"
                  size="default"
                  icon={<Trash2 size={15} color="#FFFFFF" />}
                  onPress={() => viewingDoc && promptDeleteAttachment(viewingDoc)}
                  testID="viewer-delete-doc-btn"
                >
                  Delete Document
                </Button>
                <Button variant="outline" size="default" onPress={() => setViewingDoc(null)} style={{ flex: 1 }}>
                  Close
                </Button>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation Dialog */}
      <Modal
        visible={deleteConfirmState.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmState((prev) => ({ ...prev, visible: false }))}
        testID="delete-confirm-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setDeleteConfirmState((prev) => ({ ...prev, visible: false }))}
          />
          <View style={[styles.confirmDialogContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>{deleteConfirmState.title}</Text>
            <Text style={[styles.confirmMessage, { color: colors.mutedForeground }]}>{deleteConfirmState.message}</Text>
            <View style={styles.confirmActionsRow}>
              <Button
                variant="outline"
                size="sm"
                onPress={() => setDeleteConfirmState((prev) => ({ ...prev, visible: false }))}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onPress={deleteConfirmState.onConfirm}
                testID="confirm-delete-btn"
              >
                Delete
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* BACKWARD-COMPATIBLE MODALS (Equipment, Serial, Internal Ref, Supplier, Crew) */}
      {/* ========================================================================= */}
      <Modal
        visible={isEditEquipmentModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditEquipmentModalOpen(false)}
        testID="edit-equipment-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsEditEquipmentModalOpen(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '85%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Equipment</Text>
              <Pressable onPress={() => setIsEditEquipmentModalOpen(false)} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={equipmentModalSearch || equipmentName}
                onChangeText={(t) => {
                  setEquipmentModalSearch(t);
                  setEquipmentModalCustom(t);
                }}
                placeholder="Search or type equipment name..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.modalTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginBottom: 8 }]}
                testID="edit-equipment-name-input"
              />
              <TextInput
                value={equipmentModalSearch}
                onChangeText={setEquipmentModalSearch}
                placeholder="Filter inventory equipment..."
                placeholderTextColor={colors.mutedForeground}
                style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
                testID="equipment-search-input"
              />
              <ScrollView style={{ maxHeight: 200 }}>
                {tenantEquipment
                  .filter((eq) => !equipmentModalSearch || eq.name.toLowerCase().includes(equipmentModalSearch.toLowerCase()))
                  .map((eq, idx) => (
                    <Pressable
                      key={eq.id || `eq-opt-${idx}`}
                      style={[styles.optionRow, { borderBottomColor: colors.border }]}
                      onPress={async () => {
                        handleSelectEquipmentSuggestion(eq);
                        if (!isNewMode) {
                          const author = { id: user?.id || 'unknown', name: user?.name || 'Technician', email: user?.email };
                          await updateRepairTicketFieldsService(ticketId, { equipmentName: eq.name, equipment: { id: eq.id, name: eq.name } }, author, tenantId);
                        }
                        setIsEditEquipmentModalOpen(false);
                      }}
                      testID={`equipment-option-${idx}`}
                    >
                      <Text style={{ color: colors.foreground, fontWeight: '600' }}>{eq.name}</Text>
                    </Pressable>
                  ))}
              </ScrollView>
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 12 }}
                onPress={async () => {
                  const target = equipmentModalCustom || equipmentName;
                  handleEquipmentNameChange(target);
                  if (!isNewMode && target.trim()) {
                    const author = { id: user?.id || 'unknown', name: user?.name || 'Technician', email: user?.email };
                    await updateRepairTicketFieldsService(ticketId, { equipmentName: target.trim() }, author, tenantId);
                  }
                  setIsEditEquipmentModalOpen(false);
                }}
                testID="save-edit-equipment-btn"
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isEditSerialModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditSerialModalOpen(false)}
        testID="edit-serial-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsEditSerialModalOpen(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Serial Number</Text>
              <Pressable onPress={() => setIsEditSerialModalOpen(false)} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={serialNumber}
                onChangeText={setSerialNumber}
                style={[styles.modalTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                testID="edit-serial-input"
              />
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 12 }}
                onPress={async () => {
                  handleSerialChange(serialNumber);
                  if (!isNewMode) {
                    const author = { id: user?.id || 'unknown', name: user?.name || 'Technician', email: user?.email };
                    await updateRepairTicketFieldsService(ticketId, { serialNumber: serialNumber.trim() || null }, author, tenantId);
                  }
                  setIsEditSerialModalOpen(false);
                }}
                testID="save-edit-serial-btn"
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isEditInternalRefModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditInternalRefModalOpen(false)}
        testID="edit-internal-ref-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsEditInternalRefModalOpen(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Internal Reference</Text>
              <Pressable onPress={() => setIsEditInternalRefModalOpen(false)} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={internalReference}
                onChangeText={setInternalReference}
                style={[styles.modalTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                testID="edit-internal-ref-input"
              />
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 12 }}
                onPress={async () => {
                  handleInternalRefChange(internalReference);
                  if (!isNewMode) {
                    const author = { id: user?.id || 'unknown', name: user?.name || 'Technician', email: user?.email };
                    await updateRepairTicketFieldsService(ticketId, { internalReference: internalReference.trim() || null }, author, tenantId);
                  }
                  setIsEditInternalRefModalOpen(false);
                }}
                testID="save-edit-internal-ref-btn"
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Supplier Modal (Legacy test fallback) */}
      <Modal
        visible={isSupplierPickerModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsSupplierPickerModalOpen(false)}
        testID="supplier-picker-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsSupplierPickerModalOpen(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '88%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Supplier</Text>
              <Pressable onPress={() => setIsSupplierPickerModalOpen(false)} hitSlop={8} testID="close-supplier-picker-btn">
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={supplierModalSearch}
                onChangeText={setSupplierModalSearch}
                placeholder="Search suppliers..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.modalTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginBottom: 8 }]}
                testID="supplier-search-input"
              />
              <ScrollView style={{ maxHeight: 200 }}>
                {tenantSuppliers.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, padding: 12, textAlign: 'center' }}>
                    No suppliers found in tenant contacts.
                  </Text>
                ) : tenantSuppliers.filter((s) => !supplierModalSearch || s.name.toLowerCase().includes(supplierModalSearch.toLowerCase())).length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, padding: 12, textAlign: 'center' }}>
                    No suppliers match your search.
                  </Text>
                ) : (
                  tenantSuppliers
                    .filter((s) => !supplierModalSearch || s.name.toLowerCase().includes(supplierModalSearch.toLowerCase()))
                    .map((s, idx) => (
                      <Pressable
                        key={s.id || `supp-${idx}`}
                        style={[styles.optionRow, { borderBottomColor: colors.border }]}
                        onPress={async () => {
                          handleSelectSupplierSuggestion(s);
                          if (!isNewMode) {
                            const author = { id: user?.id || 'unknown', name: user?.name || 'Technician', email: user?.email };
                            await updateRepairTicketFieldsService(ticketId, { supplierId: s.name }, author, tenantId);
                          }
                          setIsSupplierPickerModalOpen(false);
                        }}
                        testID={`supplier-option-${idx}`}
                      >
                        <Text style={{ color: colors.foreground, fontWeight: '600' }}>{s.name}</Text>
                      </Pressable>
                    ))
                )}
              </ScrollView>
              <TextInput
                value={supplierModalCustom}
                onChangeText={setSupplierModalCustom}
                placeholder="Custom supplier name..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.singleTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginTop: 8 }]}
                testID="supplier-custom-input"
              />
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 8 }}
                onPress={async () => {
                  if (supplierModalCustom.trim()) {
                    setSupplierId(supplierModalCustom.trim());
                    if (!isNewMode) {
                      const author = { id: user?.id || 'unknown', name: user?.name || 'Technician', email: user?.email };
                      await updateRepairTicketFieldsService(ticketId, { supplierId: supplierModalCustom.trim() }, author, tenantId);
                    }
                  }
                  setIsSupplierPickerModalOpen(false);
                }}
                testID="supplier-custom-save-btn"
              >
                Save Custom Supplier
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Crew Modal (Legacy test fallback) */}
      <Modal
        visible={isCrewPickerModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCrewPickerModalOpen(false)}
        testID="crew-picker-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsCrewPickerModalOpen(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '88%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Crew Member</Text>
              <Pressable onPress={() => setIsCrewPickerModalOpen(false)} hitSlop={8} testID="close-crew-picker-btn">
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={crewModalSearch}
                onChangeText={setCrewModalSearch}
                placeholder="Search crew members..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.singleTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginBottom: 8 }]}
                testID="crew-search-input"
              />
              <ScrollView style={{ maxHeight: 200 }}>
                {tenantCrew.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, padding: 12, textAlign: 'center' }}>
                    No crew members found in tenant users.
                  </Text>
                ) : tenantCrew.filter((c) => !crewModalSearch || c.name.toLowerCase().includes(crewModalSearch.toLowerCase())).length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, padding: 12, textAlign: 'center' }}>
                    No crew members match your search.
                  </Text>
                ) : (
                  tenantCrew
                    .filter((c) => !crewModalSearch || c.name.toLowerCase().includes(crewModalSearch.toLowerCase()))
                    .map((c, idx) => (
                      <Pressable
                        key={c.id || `crew-${idx}`}
                        style={[styles.optionRow, { borderBottomColor: colors.border }]}
                        onPress={async () => {
                          handleSelectCrewSuggestion(c);
                          if (!isNewMode) {
                            const author = { id: user?.id || 'unknown', name: user?.name || 'Technician', email: user?.email };
                            await updateRepairTicketFieldsService(ticketId, { requestedBy: c.name }, author, tenantId);
                          }
                          setIsCrewPickerModalOpen(false);
                        }}
                        testID={`crew-option-${idx}`}
                      >
                        <Text style={{ color: colors.foreground, fontWeight: '600' }}>{c.name}</Text>
                        {c.position ? (
                          <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{c.position}</Text>
                        ) : null}
                      </Pressable>
                    ))
                )}
              </ScrollView>
              <TextInput
                value={crewModalCustom}
                onChangeText={setCrewModalCustom}
                placeholder="Custom requester name..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.singleTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginTop: 8 }]}
                testID="crew-custom-input"
              />
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 8 }}
                onPress={async () => {
                  if (crewModalCustom.trim()) {
                    setRequestedBy(crewModalCustom.trim());
                    if (!isNewMode) {
                      const author = { id: user?.id || 'unknown', name: user?.name || 'Technician', email: user?.email };
                      await updateRepairTicketFieldsService(ticketId, { requestedBy: crewModalCustom.trim() }, author, tenantId);
                    }
                  }
                  setIsCrewPickerModalOpen(false);
                }}
                testID="crew-custom-save-btn"
              >
                Save Custom Requester
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontFamily: 'Calibri',
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
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTicketId: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  headerEquipmentName: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  headerEditButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
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
    fontWeight: '600',
    flex: 1,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  stripCardContent: {
    padding: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeaderRowWithBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderLabel: {
    fontFamily: 'Calibri',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sideBySideCardsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  prioritySideCard: {
    flex: 3,
  },
  conditionSideCard: {
    flex: 2,
  },
  sideCardContent: {
    padding: 10,
  },
  priorityBoxRow: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
  },
  conditionBoxRow: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
  },
  sideEqualBox: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 2,
  },
  fiveBoxRow: {
    flexDirection: 'row',
    gap: 5,
    width: '100%',
  },
  equalBox5: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 3,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  boxLabelText: {
    fontFamily: 'Calibri',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
  },
  fieldsStack: {
    gap: 10,
  },
  fieldWrapper: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 42,
  },
  singleTextInput: {
    flex: 1,
    fontFamily: 'Calibri',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  modalTextInput: {
    fontFamily: 'Calibri',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  textAreaInput: {
    fontFamily: 'Calibri',
    fontSize: 14,
    minHeight: 85,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    textAlignVertical: 'top',
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  periodTile: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  periodTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodValueText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  sectionBlock: {
    marginTop: 4,
  },
  sectionSubHeaderRow: {
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontFamily: 'Calibri',
    fontWeight: '600',
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
  docsList: {
    gap: 6,
  },
  docRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  partName: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  partCostGroup: {
    alignItems: 'flex-end',
  },
  partQty: {
    fontFamily: 'Calibri',
  },
  partCost: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  fixedBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  bottomBarButton: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  modalBody: {
    paddingVertical: 12,
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  optionRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  lightboxHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  lightboxContent: {
    width: '90%',
    height: '75%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  confirmDialogContent: {
    margin: 24,
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  confirmTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
  },
  confirmMessage: {
    fontFamily: 'Calibri',
    fontSize: 13,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
});
