/**
 * app/events/[id].tsx
 * Unified Event Details & Mobile Equipment Pull Sheet Screen in Kuro Mobile.
 * Combines compact operational schedule & client/venue summary, notes,
 * equipment preparation progress, real-time search, interactive line items,
 * and expandable in-sheet continuous camera scanner with 4-way status selection.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  Calendar,
  Clock,
  FileText,
  QrCode,
  MapPin,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  SlidersHorizontal,
  Zap,
  ZapOff,
  Check,
  Search,
  X,
  CheckCheck,
  Layers,
  Barcode,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useSingleEvent } from '@/hooks/use-events';
import { useTenantOwners } from '@/hooks/use-tickets';
import { usePullSheet } from '@/hooks/use-pull-sheet';
import { useScanner } from '@/context/scanner-context';
import { useConsistentBack } from '@/hooks/use-consistent-back';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { CameraViewfinder } from '@/components/scanner/camera-viewfinder';
import { ScanHudOverlay } from '@/components/scanner/scan-hud-overlay';
import { PullSheetProgressBar } from '@/components/pull-sheets/pull-sheet-progress-bar';
import { PullSheetSectionHeader } from '@/components/pull-sheets/pull-sheet-section-header';
import { PullSheetItemRow } from '@/components/pull-sheets/pull-sheet-item-row';
import { PullSheetStatusSheet } from '@/components/pull-sheets/pull-sheet-status-sheet';
import { formatStageTime } from '@/lib/date-utils';
import {
  normalizePullsheetStatus,
  getPreviousPullsheetStatus,
} from '@/lib/pull-sheet-engine';
import type { EventStatus } from '@/types/events';
import type { PullsheetItem } from '@/types/pull-sheet';
import type { ScanTargetStatus } from '@/types/scanner';

interface TargetStatusOption {
  status: ScanTargetStatus;
  label: string;
  badgeVariant: BadgeVariant;
  description: string;
}

const TARGET_STATUS_OPTIONS: TargetStatusOption[] = [
  {
    status: 'confirmed',
    label: 'Confirmed',
    badgeVariant: 'secondary',
    description: 'Acknowledge and confirm equipment line item',
  },
  {
    status: 'prepped_scanned',
    label: 'Prepped',
    badgeVariant: 'success',
    description: 'Increment scanned units (Prepped X/Y -> Prepped)',
  },
  {
    status: 'returned',
    label: 'Returned',
    badgeVariant: 'info',
    description: 'Check gear back in upon return from event',
  },
  {
    status: 'deprepped',
    label: 'Deprep',
    badgeVariant: 'warning',
    description: 'Revert gear preparation back to shelf',
  },
];

export default function EventDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing } = useTheme();

  const eventId = Array.isArray(id) ? id[0] : id || '';
  const { event, loading: eventLoading, error: eventError } = useSingleEvent(eventId);
  const { owners } = useTenantOwners();

  const {
    pullsheet,
    filteredSections,
    progress,
    loading: pullsheetLoading,
    searchQuery,
    setSearchQuery,
    updateStatus,
    rollbackStatus,
    bulkConfirm,
    error: pullsheetError,
    pendingOperations,
    reconcileOperation,
    retryOperation,
  } = usePullSheet(eventId);

  const {
    activeEventId,
    setActiveEventId,
    scanTargetStatus,
    setScanTargetStatus,
    torchEnabled,
    toggleTorch,
    lastResult,
    hudVisible,
    dismissHud,
    processScan,
  } = useScanner();

  // Sync active event in scanner context
  useEffect(() => {
    if (eventId && activeEventId !== eventId) {
      setActiveEventId(eventId);
    }
  }, [eventId, activeEventId, setActiveEventId]);

  const [activeStatusItem, setActiveStatusItem] = useState<PullsheetItem | null>(null);
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'barcode' | 'qr'>('barcode');
  const [localTargetStatus, setLocalTargetStatus] = useState<ScanTargetStatus>(
    scanTargetStatus || 'prepped_scanned'
  );

  const currentTargetStatus = localTargetStatus || scanTargetStatus || 'prepped_scanned';

  const handleSelectTargetStatus = (newStatus: ScanTargetStatus) => {
    setLocalTargetStatus(newStatus);
    setScanTargetStatus(newStatus);
    setIsStatusModalOpen(false);
  };

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

  const formatCompactWindow = (start?: Date | null, finish?: Date | null): string => {
    const s = start || null;
    const f = finish || null;
    if (!s && !f) return 'Not scheduled';
    if (s && !f) return formatStageTime(s, 'dateTime');
    if (!s && f) return formatStageTime(f, 'dateTime');

    const startStr = formatStageTime(s, 'dateTime');
    const finishStr = formatStageTime(f, 'dateTime');
    const startDay = formatStageTime(s, 'shortDate');
    const finishDay = formatStageTime(f, 'shortDate');

    if (startDay === finishDay) {
      const finishTime = formatStageTime(f, 'timeOnly');
      return `${startStr} – ${finishTime}`;
    }
    return `${startStr} – ${finishStr}`;
  };

  const handleBulkConfirm = async () => {
    try {
      setIsBulkConfirming(true);
      await bulkConfirm();
    } catch (err) {
      console.warn('[EventDetailsScreen] Bulk confirm error:', err);
    } finally {
      setIsBulkConfirming(false);
    }
  };

  const handleSwipeRight = useCallback(
    async (item: PullsheetItem) => {
      const targetStatus = currentTargetStatus;
      const targetQty = Math.max(1, item.quantity || 1);
      const newScannedQty =
        targetStatus === 'prepped_scanned'
          ? targetQty
          : targetStatus === 'confirmed' || targetStatus === 'deprepped'
          ? 0
          : item.scannedQuantity && item.scannedQuantity > 0
          ? item.scannedQuantity
          : targetQty;
      await updateStatus(item.id, targetStatus, { scannedQuantity: newScannedQty });
    },
    [currentTargetStatus, updateStatus]
  );

  const handleSwipeLeft = useCallback(
    async (item: PullsheetItem) => {
      const currentStatus = normalizePullsheetStatus(item.status);
      // Strict floor at confirmed: do not revert if confirmed, pending, or none
      if (currentStatus === 'confirmed' || currentStatus === 'pending' || currentStatus === 'none') {
        return;
      }
      const prevStatus = getPreviousPullsheetStatus(currentStatus);
      const targetQty = Math.max(1, item.quantity || 1);
      const newScannedQty =
        currentStatus === 'prepped_scanned'
          ? 0
          : prevStatus === 'prepped_scanned'
          ? targetQty
          : item.scannedQuantity;
      await updateStatus(item.id, prevStatus, { scannedQuantity: newScannedQty });
    },
    [updateStatus]
  );

  const currentActiveItem = useMemo(() => {
    if (!activeStatusItem) return null;
    return (
      pullsheet?.items?.find((i) => i.id === activeStatusItem.id) || activeStatusItem
    );
  }, [activeStatusItem, pullsheet?.items]);

  // Helper to test if a pullsheet item status is pending or none
  const isStatusPendingOrNone = (status?: string | null): boolean => {
    if (!status) return true;
    const s = status.toLowerCase();
    return s === 'none' || s === 'pending';
  };

  // Check if scanning is available: strictly when event status is Confirmed
  const rawEventStatus = (event as any)?.status || event?.eventStatusId;
  const isScanningAvailable =
    typeof rawEventStatus === 'string' && rawEventStatus.toLowerCase() === 'confirmed';

  // If scanning availability is revoked (e.g. status changed from Confirmed to Pending), close scanner
  useEffect(() => {
    if (!isScanningAvailable && isScannerOpen) {
      setIsScannerOpen(false);
    }
  }, [isScanningAvailable, isScannerOpen]);

  // In scanner mode: hide items with status 'none' and 'pending',
  // but keep child items (linked via parentItemId or type 'sub-item') visible alongside
  // their parent if the parent item has an active/confirmed status (e.g. confirmed or prepped_scanned).
  // A parent item and its child items must only be hidden if the parent's status is pending or none.
  // Standalone items with pending or none status continue to be hidden in scan mode.
  const displayedSections = useMemo(() => {
    if (!isScannerOpen) {
      return filteredSections;
    }

    // Index all items across the pullsheet and filteredSections
    const itemMap = new Map<string, PullsheetItem>();
    if (pullsheet?.items) {
      for (const it of pullsheet.items) {
        itemMap.set(it.id, it);
      }
    }
    for (const section of filteredSections) {
      for (const it of section.items) {
        itemMap.set(it.id, it);
      }
    }

    // Map each child item to its parent item and track parent-to-children relationships
    const childToParentMap = new Map<string, PullsheetItem>();
    const parentToChildrenMap = new Map<string, Set<string>>();

    // Establish relationships across complete pullsheet items first to resolve implicit sequential ordering
    let lastParentInPullsheet: PullsheetItem | null = null;
    if (pullsheet?.items) {
      for (const it of pullsheet.items) {
        if (it.type === 'section-header') {
          lastParentInPullsheet = null;
          continue;
        }
        if (it.type === 'note' || it.type === 'section-footer') continue;

        const isChildType = it.type === 'sub-item' || Boolean(it.parentItemId);
        if (it.parentItemId && itemMap.has(it.parentItemId)) {
          const p = itemMap.get(it.parentItemId)!;
          childToParentMap.set(it.id, p);
          if (!parentToChildrenMap.has(p.id)) parentToChildrenMap.set(p.id, new Set());
          parentToChildrenMap.get(p.id)!.add(it.id);
        } else if (isChildType && lastParentInPullsheet) {
          childToParentMap.set(it.id, lastParentInPullsheet);
          if (!parentToChildrenMap.has(lastParentInPullsheet.id)) {
            parentToChildrenMap.set(lastParentInPullsheet.id, new Set());
          }
          parentToChildrenMap.get(lastParentInPullsheet.id)!.add(it.id);
        }

        if (it.type !== 'sub-item' && !it.parentItemId) {
          lastParentInPullsheet = it;
        }
      }
    }

    // Also fallback/augment from filteredSections
    for (const section of filteredSections) {
      let lastParentInSec: PullsheetItem | null = null;
      for (const it of section.items) {
        if (!childToParentMap.has(it.id)) {
          const isChildType = it.type === 'sub-item' || Boolean(it.parentItemId);
          if (it.parentItemId && itemMap.has(it.parentItemId)) {
            const p = itemMap.get(it.parentItemId)!;
            childToParentMap.set(it.id, p);
            if (!parentToChildrenMap.has(p.id)) parentToChildrenMap.set(p.id, new Set());
            parentToChildrenMap.get(p.id)!.add(it.id);
          } else if (isChildType && lastParentInSec) {
            childToParentMap.set(it.id, lastParentInSec);
            if (!parentToChildrenMap.has(lastParentInSec.id)) {
              parentToChildrenMap.set(lastParentInSec.id, new Set());
            }
            parentToChildrenMap.get(lastParentInSec.id)!.add(it.id);
          }
        }

        if (it.type !== 'sub-item' && it.type !== 'note' && !it.parentItemId) {
          lastParentInSec = it;
        }
      }
    }

    const isItemVisibleInScanner = (it: PullsheetItem): boolean => {
      // If item is a parent item (has children): must NOT have status pending or none
      const isParent = parentToChildrenMap.has(it.id) && parentToChildrenMap.get(it.id)!.size > 0;
      if (isParent && isStatusPendingOrNone(it.status)) {
        return false;
      }

      // Check ancestor chain: if ANY ancestor is pending or none, this item must be hidden
      let curr = childToParentMap.get(it.id);
      const visited = new Set<string>();
      let hasParent = false;
      while (curr && !visited.has(curr.id)) {
        hasParent = true;
        visited.add(curr.id);
        if (isStatusPendingOrNone(curr.status)) {
          return false;
        }
        curr = childToParentMap.get(curr.id);
      }

      // If item is a child item and all its ancestors are active/confirmed:
      if (hasParent) {
        return true;
      }

      // Standalone item: hidden if status is pending or none
      return !isStatusPendingOrNone(it.status);
    };

    return filteredSections
      .map((section) => ({
        ...section,
        items: section.items.filter(isItemVisibleInScanner),
      }))
      .filter((section) => section.items.length > 0);
  }, [filteredSections, isScannerOpen, pullsheet?.items]);

  const getTargetStatusLabel = (status: ScanTargetStatus): string => {
    const found = TARGET_STATUS_OPTIONS.find((opt) => opt.status === status);
    return found ? found.label : 'Prepped';
  };

  const { handleBack } = useConsistentBack({
    fallbackRoute: '/(tabs)',
    onBeforeBack: () => {
      if (isStatusModalOpen) {
        setIsStatusModalOpen(false);
        return true;
      }
      if (activeStatusItem) {
        setActiveStatusItem(null);
        return true;
      }
      if (isScanningAvailable && isScannerOpen) {
        setIsScannerOpen(false);
        return true;
      }
      return false;
    },
  });

  if (eventLoading && !event) {
    return (
      <View style={[styles.centerScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: spacing.md }]}>
          Loading Event Details...
        </Text>
      </View>
    );
  }

  if (eventError || !event) {
    return (
      <View style={[styles.centerScreen, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <Text style={[styles.errorTitle, { color: colors.destructive, fontSize: typography.fontSize.lg }]}>
          Event Not Found
        </Text>
        <Text style={[styles.errorSubtitle, { color: colors.mutedForeground, marginVertical: spacing.md, textAlign: 'center' }]}>
          {eventError?.message || (eventId ? `Unable to load event #${eventId}. It may have been archived or removed.` : 'No Event ID was provided in the route.')}
        </Text>
        <Button variant="outline" onPress={handleBack} testID="event-not-found-back-btn">
          Return to Events
        </Button>
      </View>
    );
  }

  const scrollBottomPadding = isScanningAvailable
    ? (isScannerOpen
        ? 330 + Math.max(insets.bottom, spacing.base)
        : 90 + Math.max(insets.bottom, spacing.base))
    : Math.max(insets.bottom, spacing.base);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <ScreenHeader
        title={event.eventName}
        idBadge={
          event.eventNumber !== undefined && event.eventNumber !== null
            ? `[${event.eventNumber}]`
            : event.id
            ? `[${event.id.substring(0, 6).toUpperCase()}]`
            : undefined
        }
        onBack={handleBack}
        backTestID="event-details-back-btn"
        backAccessibilityLabel="Go back to Events Feed"
        rightAction={
          <View style={styles.headerRightActions}>
            {progress.pendingQuantity > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                loading={isBulkConfirming}
                icon={<CheckCheck size={14} color={colors.secondaryForeground} />}
                onPress={handleBulkConfirm}
                testID="bulk-confirm-header-btn"
              >
                Confirm All
              </Button>
            ) : null}
            <Badge variant={getStatusVariant(event.eventStatusId)}>
              {event.eventStatusId}
            </Badge>
          </View>
        }
      />

      <ScrollView
        testID="event-details-scrollview"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: spacing.base,
            paddingTop: spacing.base,
            paddingBottom: scrollBottomPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Compact Combined Overview Card: Client, Venue & Schedule */}
        <Card style={styles.compactOverviewCard} testID="event-client-venue-card">
          <CardContent style={styles.compactCardContent}>
            {/* Top Grid: Client & Venue */}
            <View style={styles.compactGridRow}>
              <View style={styles.compactGridCol}>
                <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  CLIENT
                </Text>
                <Text style={[styles.infoMainText, { color: colors.cardForeground, fontSize: typography.fontSize.sm }]} numberOfLines={1}>
                  {clientContact?.name || event.clientId || 'Client Direct'}
                </Text>
              </View>

              <View style={styles.compactGridCol}>
                <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  VENUE
                </Text>
                <Text style={[styles.infoMainText, { color: colors.cardForeground, fontSize: typography.fontSize.sm }]} numberOfLines={1}>
                  {venueContact?.name || event.venueName || event.venueId || 'Sydney Showground (Hall 5 & Dock 2)'}
                </Text>
                <Text style={[styles.addressText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]} numberOfLines={1}>
                  {venueContact?.fullAddress || '1 Showground Rd, Sydney Olympic Park NSW 2127'}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

            {/* Bottom Grid: Planning & Event Schedule Windows */}
            <View style={styles.compactGridRow}>
              <View style={styles.compactGridCol}>
                <View style={styles.stageLabelRow}>
                  <Calendar size={12} color={colors.primary} style={{ marginRight: 4 }} />
                  <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    PLANNING
                  </Text>
                </View>
                <Text style={[styles.timeRangeText, { color: colors.cardForeground, fontSize: typography.fontSize.xs }]}>
                  {formatCompactWindow(event.startTime, event.finishTime)}
                </Text>
              </View>

              <View style={styles.compactGridCol}>
                <View style={styles.stageLabelRow}>
                  <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    EVENT
                  </Text>
                </View>
                <Text style={[styles.timeRangeText, { color: colors.cardForeground, fontSize: typography.fontSize.xs }]}>
                  {formatCompactWindow(event.eventStartDate, event.eventFinishDate)}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Pull Sheet Equipment Section */}
        <View style={styles.equipmentSectionHeaderRow}>
          <Text style={[styles.equipmentSectionTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
            Equipment Pull Sheet
          </Text>
          {isScannerOpen ? (
            <Badge variant="brand" testID="scanner-active-badge">
              {`Scanner Active (${displayedSections.reduce((acc, sec) => acc + sec.items.length, 0)} items)`}
            </Badge>
          ) : null}
        </View>

        {pullsheetError ? <Text accessibilityRole="alert" style={{ color: colors.foreground, marginBottom: 12 }}>
          {pullsheetError.message}
        </Text> : null}
        {pendingOperations?.map((operation) => (
          <View key={operation.operationId} style={{ marginBottom: 12, gap: 8 }} testID="pullsheet-save-recovery">
            <Text style={{ color: colors.foreground }}>
              {operation.committed ? 'Saved. Inventory synchronization needs attention.' :
                operation.state === 'in_flight' ? 'Saving changes…' : 'Save outcome unknown. Check status before retrying.'}
            </Text>
            {operation.state !== 'in_flight' ? <View style={{ flexDirection: 'row', gap: 20 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Check save status"
                onPress={() => reconcileOperation(operation.operationId)}>
                <Text style={{ color: colors.primary, paddingVertical: 8 }}>Check status</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry original save"
                onPress={() => retryOperation(operation.operationId)}>
                <Text style={{ color: colors.primary, paddingVertical: 8 }}>Retry original save</Text>
              </Pressable>
            </View> : null}
          </View>
        ))}
        {/* Search Bar */}
        <View style={styles.searchWrap}>
          <Input
            placeholder="Search equipment, note, barcode..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={<Search size={16} color={colors.mutedForeground} />}
            rightIcon={
              searchQuery ? (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID="pullsheet-search-clear"
                >
                  <X size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : undefined
            }
            testID="pullsheet-search-input"
          />
        </View>

        {/* Grouped Sections List */}
        {pullsheetLoading && !pullsheet ? (
          <View style={styles.pullsheetLoadingWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 8 }]}>
              Loading equipment...
            </Text>
          </View>
        ) : displayedSections.length === 0 ? (
          <EmptyState
            icon={<Layers size={40} color={colors.mutedForeground} />}
            title={isScannerOpen ? 'No Scannable Items' : 'No Equipment Matches'}
            description={
              isScannerOpen
                ? 'Pending and unassigned items are hidden in scanner mode. Close scanner or confirm items to view.'
                : searchQuery
                ? 'No line items match your active search query.'
                : 'No equipment items listed on this pull sheet.'
            }
            actionLabel={searchQuery ? 'Clear Search' : undefined}
            onAction={searchQuery ? () => setSearchQuery('') : undefined}
            testID="pullsheet-empty-state"
          />
        ) : (
          displayedSections.map((section) => (
            <View key={section.id} style={styles.sectionBlock}>
              <PullSheetSectionHeader
                title={section.title}
                itemCount={section.items.length}
              />

              {section.items.map((item) => (
                <PullSheetItemRow
                  key={item.id}
                  item={item}
                  onLongPress={(it) => setActiveStatusItem(it)}
                  isScannerOpen={isScannerOpen}
                  currentTargetStatus={currentTargetStatus}
                  onSwipeRight={handleSwipeRight}
                  onSwipeLeft={handleSwipeLeft}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Expandable Bottom Scanner Section */}
      {isScanningAvailable && isScannerOpen ? (
        <View
          style={[
            styles.scannerExpandableContainer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}
          testID="scanner-expandable-sheet"
        >
          {/* Scanner Reticle Top Controls */}
          <View style={styles.scannerTopToolbar}>
            <View style={styles.scannerTargetInfo}>
              <Text style={[styles.targetStatusLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                SCANNING STATUS:
              </Text>
              <Badge variant={TARGET_STATUS_OPTIONS.find((o) => o.status === currentTargetStatus)?.badgeVariant || 'brand'}>
                {getTargetStatusLabel(currentTargetStatus)}
              </Badge>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={() => setScanMode('barcode')}
                style={[
                  styles.modeButton,
                  { backgroundColor: scanMode === 'barcode' ? colors.primary : colors.card, borderColor: colors.border }
                ]}
              >
                <Barcode size={14} color={scanMode === 'barcode' ? colors.primaryForeground : colors.mutedForeground} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: typography.fontSize.xs, color: scanMode === 'barcode' ? colors.primaryForeground : colors.mutedForeground, fontFamily: typography.fontFamily.bold }}>1D</Text>
              </Pressable>

              <Pressable
                onPress={() => setScanMode('qr')}
                style={[
                  styles.modeButton,
                  { backgroundColor: scanMode === 'qr' ? colors.primary : colors.card, borderColor: colors.border }
                ]}
              >
                <QrCode size={14} color={scanMode === 'qr' ? colors.primaryForeground : colors.mutedForeground} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: typography.fontSize.xs, color: scanMode === 'qr' ? colors.primaryForeground : colors.mutedForeground, fontFamily: typography.fontFamily.bold }}>QR</Text>
              </Pressable>

              <Pressable
                onPress={toggleTorch}
                style={[
                  styles.torchToggleBtn,
                  {
                    backgroundColor: torchEnabled ? colors.primary : colors.card,
                    borderColor: colors.border,
                  },
                ]}
                testID="scanner-torch-toggle-btn"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {torchEnabled ? (
                  <Zap size={16} color={colors.primaryForeground} />
                ) : (
                  <ZapOff size={16} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>
          </View>

          {/* Camera Viewfinder */}
          <View style={styles.viewfinderWrapper}>
            <CameraViewfinder
              onScan={(code) => processScan(code, currentTargetStatus)}
              torchEnabled={torchEnabled}
              onToggleTorch={toggleTorch}
              showTorchControl={false}
              isVisible={isScannerOpen}
            />

            {/* Non-blocking Floating HUD Overlay */}
            <ScanHudOverlay
              result={lastResult}
              visible={hudVisible}
              onDismiss={dismissHud}
            />
          </View>
        </View>
      ) : null}

      {/* Sticky Bottom Action Bar */}
      {isScanningAvailable ? (
        <View
          style={[
            styles.bottomActionBar,
            {
              paddingHorizontal: spacing.base,
              paddingTop: spacing.xs,
              paddingBottom: 18,
              backgroundColor: colors.background,
            },
          ]}
        >
          {isScannerOpen ? (
            <View style={styles.scannerOpenButtonsRow}>
              {/* Status Selector Button */}
              <Button
                variant="outline"
                size="lg"
                icon={<SlidersHorizontal size={16} color={colors.foreground} />}
                onPress={() => setIsStatusModalOpen(true)}
                style={styles.statusSelectorBtn}
                testID="scanner-status-selector-btn"
              >
                {`Status: ${getTargetStatusLabel(currentTargetStatus)}`}
              </Button>

              {/* Close Scanner Button */}
              <Button
                variant="secondary"
                size="lg"
                icon={<X size={16} color={colors.secondaryForeground} />}
                onPress={() => {
                  setIsScannerOpen(false);
                }}
                style={styles.closeScannerBtn}
                testID="close-scanner-btn"
              >
                Close Scanner
              </Button>
            </View>
          ) : (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              icon={<QrCode size={18} color={colors.primaryForeground} />}
              onPress={() => setIsScannerOpen(true)}
              style={[styles.bottomBarBtn, { backgroundColor: colors.brandGreen }]}
              testID="start-scanning-btn"
              accessibilityLabel="Start Scanning"
            >
              Start Scanning
            </Button>
          )}
        </View>
      ) : null}

      {/* Status Selection Modal Sheet */}
      <ModalSheet
        visible={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Select Scan Target Status"
        testID="scanner-status-picker-modal"
      >
        <View style={styles.modalContentWrap}>
          <Text style={[styles.modalHelperText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm, marginBottom: spacing.md }]}>
            Choose the operational status applied to equipment as barcodes are scanned:
          </Text>

          {TARGET_STATUS_OPTIONS.map((option) => {
            const isSelected = currentTargetStatus === option.status;
            return (
              <Pressable
                key={option.status}
                style={[
                  styles.statusOptionRow,
                  {
                    backgroundColor: isSelected ? colors.card : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => {
                  handleSelectTargetStatus(option.status);
                }}
                testID={`status-option-${option.status}`}
              >
                <View style={styles.statusOptionLeft}>
                  <View style={styles.statusOptionHeader}>
                    <Badge variant={option.badgeVariant}>{option.label}</Badge>
                    {isSelected ? (
                      <Check size={18} color={colors.primary} style={{ marginLeft: 8 }} />
                    ) : null}
                  </View>
                  <Text style={[styles.statusOptionDesc, { color: colors.mutedForeground, fontSize: typography.fontSize.xs, marginTop: 4 }]}>
                    {option.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ModalSheet>

      {/* Long-Press Status Modal Sheet */}
      <PullSheetStatusSheet
        item={currentActiveItem}
        visible={Boolean(currentActiveItem)}
        onClose={() => setActiveStatusItem(null)}
        onSelectStatus={(itemId, newStatus) => updateStatus(itemId, newStatus)}
        onRollback={(itemId) => rollbackStatus(itemId)}
      />
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
    paddingBottom: 110,
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
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactOverviewCard: {
    marginBottom: 12,
  },
  compactCardHeader: {
    paddingBottom: 4,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  compactCardContent: {
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  compactGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compactGridCol: {
    flex: 1,
    gap: 2,
  },
  fieldSubLabel: {
    fontFamily: 'Calibri',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  infoMainText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  addressText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
  },
  stageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  timeRangeText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  sectionCard: {
    marginBottom: 12,
  },
  sectionHeader: {
    paddingBottom: 6,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  cardContentNoTop: {
    paddingTop: 2,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  notesText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
  },
  equipmentSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 4,
  },
  equipmentSectionTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  progressCard: {
    marginBottom: 10,
  },
  searchWrap: {
    marginBottom: 10,
  },
  sectionBlock: {
    marginBottom: 8,
  },
  pullsheetLoadingWrap: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerExpandableContainer: {
    position: 'absolute',
    bottom: 78,
    left: 0,
    right: 0,
    height: 250,
    borderTopWidth: 1,
    zIndex: 20,
    overflow: 'hidden',
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 32,
  },
  scannerTopToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scannerTargetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  targetStatusLabel: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  torchToggleBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  viewfinderWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    paddingBottom: 18,
    zIndex: 30,
  },
  bottomBarBtn: {
    width: '100%',
  },
  scannerOpenButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  statusSelectorBtn: {
    flex: 1,
  },
  closeScannerBtn: {
    flex: 1,
  },
  modalContentWrap: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  modalHelperText: {
    fontFamily: 'Calibri',
  },
  statusOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  statusOptionLeft: {
    flex: 1,
  },
  statusOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusOptionDesc: {
    fontFamily: 'Calibri',
    lineHeight: 16,
  },
});
