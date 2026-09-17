/**
 * app/events/[id].tsx (Proposed Virtualized Implementation)
 * Unified Event Details & Mobile Equipment Pull Sheet Screen in Kuro Mobile.
 * Combines compact operational schedule & client/venue summary, notes,
 * equipment preparation progress, real-time search, interactive line items,
 * and expandable in-sheet continuous camera scanner with 4-way status selection.
 *
 * Feature 9 Optimization:
 * Replaces un-virtualized ScrollView with high-performance SectionList virtualization,
 * providing sticky section headers, bounded memory footprint, stabilized callbacks,
 * and 60fps scrolling across 1,000+ line item pull sheets.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
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
import { EventOverviewCard } from '@/components/events/event-overview-card';
import { EventScannerDrawer } from '@/components/events/event-scanner-drawer';
import { EventScannerBottomBar } from '@/components/events/event-scanner-bottom-bar';
import { EventScanStatusModal } from '@/components/events/event-scan-status-modal';
import { formatStageTime } from '@/lib/date-utils';
import {
  normalizePullsheetStatus,
  getPreviousPullsheetStatus,
} from '@/lib/pull-sheet-engine';
import type { EventStatus } from '@/types/events';
import type { PullsheetItem, PullsheetSection } from '@/types/pull-sheet';
import type { ScanTargetStatus } from '@/types/scanner';

interface SectionListData extends PullsheetSection {
  data: PullsheetItem[];
}

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
    refresh,
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
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } catch (err) {
      console.warn('[EventDetailsScreen] Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

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
      const isParent = parentToChildrenMap.has(it.id) && parentToChildrenMap.get(it.id)!.size > 0;
      if (isParent && isStatusPendingOrNone(it.status)) {
        return false;
      }

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

      if (hasParent) {
        return true;
      }

      return !isStatusPendingOrNone(it.status);
    };

    return filteredSections
      .map((section) => ({
        ...section,
        items: section.items.filter(isItemVisibleInScanner),
      }))
      .filter((section) => section.items.length > 0);
  }, [filteredSections, isScannerOpen, pullsheet?.items]);

  // Transform filteredSections into SectionList data structure
  const sectionListData = useMemo<SectionListData[]>(() => {
    return displayedSections.map((sec) => ({
      ...sec,
      key: sec.id,
      data: sec.items,
    }));
  }, [displayedSections]);

  const handleLongPressItem = useCallback((it: PullsheetItem) => {
    setActiveStatusItem(it);
  }, []);

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData }) => (
      <View style={[styles.stickyHeaderContainer, { backgroundColor: colors.background }]}>
        <PullSheetSectionHeader
          title={section.title}
          itemCount={section.data.length}
        />
      </View>
    ),
    [colors.background]
  );

  const renderPullSheetItem = useCallback(
    ({ item }: { item: PullsheetItem }) => (
      <PullSheetItemRow
        key={item.id}
        item={item}
        onLongPress={handleLongPressItem}
        isScannerOpen={isScannerOpen}
        currentTargetStatus={currentTargetStatus}
        onSwipeRight={handleSwipeRight}
        onSwipeLeft={handleSwipeLeft}
      />
    ),
    [handleLongPressItem, isScannerOpen, currentTargetStatus, handleSwipeRight, handleSwipeLeft]
  );

  const pullSheetKeyExtractor = useCallback(
    (item: PullsheetItem, index: number) => item.id || `item-${index}`,
    []
  );

  const renderListHeader = useMemo(() => {
    if (!event) return null;
    return (
      <View style={styles.listHeaderWrap}>
        {/* Compact Combined Overview Card: Client, Venue & Schedule */}
        <EventOverviewCard
          event={event}
          clientContact={clientContact}
          venueContact={venueContact}
        />

      {/* Pull Sheet Equipment Section Title */}
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

      {pullsheetError ? (
        <Text accessibilityRole="alert" style={{ color: colors.foreground, marginBottom: 12 }}>
          {pullsheetError.message}
        </Text>
      ) : null}

      {pendingOperations?.map((operation) => (
        <View key={operation.operationId} style={{ marginBottom: 12, gap: 8 }} testID="pullsheet-save-recovery">
          <Text style={{ color: colors.foreground }}>
            {operation.committed ? 'Saved. Inventory synchronization needs attention.' :
              operation.state === 'in_flight' ? 'Saving changes…' : 'Save outcome unknown. Check status before retrying.'}
          </Text>
          {operation.state !== 'in_flight' ? (
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Check save status"
                onPress={() => reconcileOperation(operation.operationId)}>
                <Text style={{ color: colors.primary, paddingVertical: 8 }}>Check status</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry original save"
                onPress={() => retryOperation(operation.operationId)}>
                <Text style={{ color: colors.primary, paddingVertical: 8 }}>Retry original save</Text>
              </Pressable>
            </View>
          ) : null}
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
    </View>
  );
}, [
    event,
    clientContact,
    venueContact,
    colors,
    typography,
    isScannerOpen,
    displayedSections,
    pullsheetError,
    pendingOperations,
    reconcileOperation,
    retryOperation,
    searchQuery,
    setSearchQuery,
  ]);

  const renderListEmpty = useCallback(() => {
    if (pullsheetLoading && !pullsheet) {
      return (
        <View style={styles.pullsheetLoadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 8 }]}>
            Loading equipment...
          </Text>
        </View>
      );
    }
    return (
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
    );
  }, [pullsheetLoading, pullsheet, colors, isScannerOpen, searchQuery, setSearchQuery]);

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

      {/* Virtualized SectionList */}
      <SectionList
        testID="event-details-scrollview"
        sections={sectionListData}
        keyExtractor={pullSheetKeyExtractor}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderPullSheetItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderListEmpty}
        stickySectionHeadersEnabled={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: spacing.base,
            paddingTop: spacing.base,
            paddingBottom: scrollBottomPadding,
          },
        ]}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

      {/* Expandable Bottom Scanner Section */}
      <EventScannerDrawer
        isOpen={isScanningAvailable && isScannerOpen}
        currentTargetStatus={currentTargetStatus}
        scanMode={scanMode}
        onToggleScanMode={setScanMode}
        torchEnabled={torchEnabled}
        onToggleTorch={toggleTorch}
        onScan={(code) => processScan(code, currentTargetStatus)}
        lastResult={lastResult}
        hudVisible={hudVisible}
        onDismissHud={dismissHud}
      />

      {/* Sticky Bottom Action Bar */}
      <EventScannerBottomBar
        isScanningAvailable={isScanningAvailable}
        isScannerOpen={isScannerOpen}
        currentTargetStatus={currentTargetStatus}
        onStartScan={() => setIsScannerOpen(true)}
        onCloseScan={() => setIsScannerOpen(false)}
        onOpenStatusPicker={() => setIsStatusModalOpen(true)}
      />

      {/* Status Selection Modal Sheet */}
      <EventScanStatusModal
        visible={isStatusModalOpen}
        currentStatus={currentTargetStatus}
        onSelectStatus={handleSelectTargetStatus}
        onClose={() => setIsStatusModalOpen(false)}
      />

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
  listHeaderWrap: {
    width: '100%',
  },
  stickyHeaderContainer: {
    paddingTop: 4,
    paddingBottom: 4,
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
});
