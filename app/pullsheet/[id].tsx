/**
 * app/pullsheet/[id].tsx
 * Mobile Pull Sheet Screen in Kuro Mobile.
 * Full warehouse equipment preparation view with real-time status machines,
 * section grouping, category filters, progress indicators, bulk confirm,
 * and quick entry to Continuous Camera Scanner.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Search,
  X,
  CheckCheck,
  QrCode,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { usePullSheet } from '@/hooks/use-pull-sheet';
import { useSingleEvent } from '@/hooks/use-events';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { PullSheetProgressBar } from '@/components/pull-sheets/pull-sheet-progress-bar';
import { PullSheetSectionHeader } from '@/components/pull-sheets/pull-sheet-section-header';
import { PullSheetItemRow } from '@/components/pull-sheets/pull-sheet-item-row';
import { PullSheetStatusSheet } from '@/components/pull-sheets/pull-sheet-status-sheet';
import type { PullsheetItem } from '@/types/pull-sheet';

export default function PullSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, typography, spacing, layout } = useTheme();

  const eventId = Array.isArray(id) ? id[0] : id || '';

  const { event } = useSingleEvent(eventId);
  const {
    pullsheet,
    filteredSections,
    progress,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    updateStatus,
    advanceStatus,
    rollbackStatus,
    bulkConfirm,
  } = usePullSheet(eventId);

  const [activeStatusItem, setActiveStatusItem] = useState<PullsheetItem | null>(null);
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);

  const handleBulkConfirm = async () => {
    setIsBulkConfirming(true);
    await bulkConfirm();
    setIsBulkConfirming(false);
  };

  const handleOpenScanner = () => {
    router.push({
      pathname: '/(tabs)/scanner',
      params: { eventId },
    });
  };

  if (loading && !pullsheet) {
    return (
      <View style={[styles.centerScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: spacing.md }]}>
          Loading Pull Sheet...
        </Text>
      </View>
    );
  }

  const handleBack = () => {
    if (typeof router.back === 'function') {
      router.back();
    } else if (eventId) {
      router.replace(`/events/${eventId}` as any);
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Screen Header */}
      <ScreenHeader
        title={event ? event.eventName : 'Pull Sheet'}
        idBadge={event?.eventNumber ? `[${event.eventNumber}]` : undefined}
        onBack={handleBack}
        backTestID="pullsheet-back-btn"
        backAccessibilityLabel="Go back to Event"
        rightAction={
          progress.pendingQuantity > 0 ? (
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
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}>
        {/* Progress Overview Card */}
        <Card style={styles.progressCard}>
          <CardContent style={{ paddingTop: spacing.base }}>
            <PullSheetProgressBar progress={progress} />
          </CardContent>
        </Card>

        {/* Search Bar */}
        <View style={styles.searchWrap}>
          <Input
            placeholder="Search equipment, note, barcode..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={<Search size={16} color={colors.mutedForeground} />}
            rightIcon={
              searchQuery ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : undefined
            }
          />
        </View>

        {/* Grouped Sections List */}
        {filteredSections.length === 0 ? (
          <EmptyState
            icon={<Layers size={40} color={colors.mutedForeground} />}
            title="No Equipment Matches"
            description={
              searchQuery
                ? 'No line items match your active search query.'
                : 'No equipment items listed on this pull sheet.'
            }
            actionLabel={searchQuery ? 'Clear Search' : undefined}
            onAction={searchQuery ? () => setSearchQuery('') : undefined}
            testID="pullsheet-empty-state"
          />
        ) : (
          filteredSections.map((section) => (
            <View key={section.id} style={styles.sectionBlock}>
              <PullSheetSectionHeader
                title={section.title}
                itemCount={section.items.length}
              />

              {section.items.map((item) => (
                <PullSheetItemRow
                  key={item.id}
                  item={item}
                  onAdvanceStatus={(itemId) => advanceStatus(itemId)}
                  onLongPress={(it) => setActiveStatusItem(it)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Floating Action Button (FAB) for Continuous Scanner */}
      <View style={styles.fabContainer}>
        <Button
          variant="primary"
          size="lg"
          icon={<QrCode size={20} color={colors.primaryForeground} />}
          onPress={handleOpenScanner}
          style={styles.fabButton}
          testID="open-continuous-scanner-fab"
        >
          Open Continuous Scanner
        </Button>
      </View>

      {/* Long-Press Status Modal Sheet */}
      <PullSheetStatusSheet
        item={activeStatusItem}
        visible={Boolean(activeStatusItem)}
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
    paddingBottom: 90, // Leave room for FAB
  },
  loadingText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  progressCard: {
    marginBottom: 12,
  },
  searchWrap: {
    marginBottom: 10,
  },
  sectionBlock: {
    marginBottom: 8,
  },
  emptyContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  emptyTitle: {
    fontFamily: 'Calibri',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  emptySubtitle: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  fabButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
