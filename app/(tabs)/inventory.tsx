/**
 * app/(tabs)/inventory.tsx
 * Real-Time Equipment & Fleet Inventory Lookup Screen in Kuro Mobile.
 * Connects directly to Firestore equipment catalog with multi-field search,
 * category filtering, availability states, and detailed asset specification modals.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Search,
  X,
  Package,
  QrCode,
  Layers,
  Wrench,
  CheckCircle,
  Clock,
  ExternalLink,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useEquipment } from '@/hooks/use-equipment';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { CategoryFilterBar } from '@/components/inventory/category-filter-bar';
import { EquipmentCard } from '@/components/inventory/equipment-card';
import type { Equipment } from '@/types/equipment';

const AVAILABILITY_FILTERS = ['All', 'Available', 'In Use', 'In Repair'];

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, layout } = useTheme();
  const router = useRouter();

  const {
    equipment,
    filteredEquipment,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    availabilityFilter,
    setAvailabilityFilter,
    refresh,
    metrics,
  } = useEquipment();

  const [activeItem, setActiveItem] = useState<Equipment | null>(null);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.sm,
        },
      ]}
    >
      {/* Search Input Bar */}
      <View style={[styles.searchContainer, { paddingHorizontal: spacing.base, paddingTop: spacing.xs }]}>
        <Input
          placeholder="Search by equipment, make, model, barcode..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<Search size={16} color={colors.mutedForeground} />}
          rightIcon={
            searchQuery ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="clear-inventory-search-btn"
              >
                <X size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : undefined
          }
        />
      </View>

      {/* Category Pills Bar */}
      <CategoryFilterBar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {/* Availability Status Pills */}
      <View style={[styles.availFilterRow, { paddingHorizontal: spacing.base }]}>
        {AVAILABILITY_FILTERS.map((avail) => {
          const isSelected = availabilityFilter.toLowerCase() === avail.toLowerCase();
          return (
            <Pressable
              key={avail}
              onPress={() => setAvailabilityFilter(avail)}
              style={[
                styles.availPill,
                {
                  backgroundColor: isSelected ? colors.secondary : 'transparent',
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              testID={`avail-filter-${avail.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Text
                style={[
                  styles.availPillText,
                  {
                    color: isSelected ? colors.foreground : colors.mutedForeground,
                    fontSize: typography.fontSize.xs,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {avail}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Equipment List */}
      {loading && equipment.length === 0 ? (
        <View style={[styles.centerScreen, { padding: spacing.xl }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: spacing.md }]}>
            Loading Equipment Catalog...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEquipment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { padding: spacing.base }]}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Package size={40} color={colors.mutedForeground} />}
              title="No Equipment Found"
              description={`No items match "${searchQuery || selectedCategory || availabilityFilter}".`}
              actionLabel="Reset Filters"
              onAction={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setAvailabilityFilter('All');
              }}
              testID="inventory-empty-state"
            />
          }
          renderItem={({ item }) => (
            <EquipmentCard
              item={item}
              onPress={(selected) => setActiveItem(selected)}
            />
          )}
        />
      )}

      {/* Item Detail Inspection Modal Sheet */}
      <ModalSheet
        visible={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
        title="Equipment Specifications"
        testID="inventory-spec-modal"
      >
        {activeItem ? (
          <View>
            {activeItem.manufacturer ? (
              <Text style={[styles.detailItemManufacturer, { color: colors.primary, fontSize: typography.fontSize.xs }]}>
                {activeItem.manufacturer}
              </Text>
            ) : null}
            <Text style={[styles.detailItemName, { color: colors.foreground, fontSize: typography.fontSize.xl }]}>
              {activeItem.name}
            </Text>

            <View style={styles.detailChipsRow}>
              {activeItem.category ? <Badge variant="brand">{activeItem.category}</Badge> : null}
              {activeItem.caseType ? <Badge variant="outline">{activeItem.caseType}</Badge> : null}
            </View>

            {/* Specification Grid */}
            <View style={[styles.specGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {activeItem.model ? (
                <View style={styles.specRow}>
                  <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Model</Text>
                  <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>{activeItem.model}</Text>
                </View>
              ) : null}

              {activeItem.barcode ? (
                <View style={styles.specRow}>
                  <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Barcode</Text>
                  <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>{activeItem.barcode}</Text>
                </View>
              ) : null}

              {activeItem.serialNumber ? (
                <View style={styles.specRow}>
                  <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Primary Serial</Text>
                  <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>{activeItem.serialNumber}</Text>
                </View>
              ) : null}

              {activeItem.knownLocation ? (
                <View style={styles.specRow}>
                  <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Warehouse Location</Text>
                  <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>{activeItem.knownLocation}</Text>
                </View>
              ) : null}

              <View style={styles.specRow}>
                <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Fleet Quantity</Text>
                <Text style={[styles.specValue, { color: colors.status.online, fontSize: typography.fontSize.base }]}>
                  {Math.max(0, (activeItem.quantity || 1) - (activeItem.consumedQuantity || 0))} available / {activeItem.quantity || 1} total
                </Text>
              </View>

              {activeItem.weight ? (
                <View style={styles.specRow}>
                  <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Weight</Text>
                  <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>{activeItem.weight} kg</Text>
                </View>
              ) : null}

              {activeItem.powerW ? (
                <View style={styles.specRow}>
                  <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Power Draw</Text>
                  <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>{activeItem.powerW} W</Text>
                </View>
              ) : null}
            </View>

            {/* Serial Numbers List */}
            {activeItem.serialNumbers && activeItem.serialNumbers.length > 0 ? (
              <View style={[styles.serialsSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.serialsTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                  Individual Serialized Units ({activeItem.serialNumbers.length}):
                </Text>
                {activeItem.serialNumbers.map((sn, i) => (
                  <View key={sn.id || i} style={[styles.serialUnitRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.serialUnitText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                      #{i + 1}: {sn.serial}
                    </Text>
                    <Badge
                      variant={
                        sn.status === 'Available'
                          ? 'success'
                          : sn.status === 'In Use'
                          ? 'warning'
                          : 'destructive'
                      }
                    >
                      {sn.status}
                    </Badge>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.modalActionRow}>
              <Button
                variant="destructive"
                size="default"
                icon={<Wrench size={15} color="#FFFFFF" />}
                style={{ flex: 1 }}
                onPress={() => {
                  const item = activeItem;
                  setActiveItem(null);
                  router.push({
                    pathname: '/repair/new',
                    params: {
                      equipmentId: item.id || '',
                      name: item.name,
                      serialNumber: item.serialNumber || '',
                      barcode: item.barcode || '',
                      category: item.category || '',
                      location: item.knownLocation || '',
                    },
                  });
                }}
                testID="inventory-report-fault-btn"
              >
                Report Fault
              </Button>

              <Button
                variant="outline"
                size="default"
                style={{ flex: 1 }}
                onPress={() => setActiveItem(null)}
                testID="inventory-close-inspection-btn"
              >
                Close
              </Button>
            </View>
          </View>
        ) : null}
      </ModalSheet>
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
  loadingText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  searchContainer: {
    marginBottom: 8,
  },
  availFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  availPill: {
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  availPillText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
  },
  listContent: {
    paddingBottom: 32,
  },
  emptyContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  emptyTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  emptySubtitle: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  modalBody: {},
  detailItemManufacturer: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    lineHeight: 16,
  },
  detailItemName: {
    fontFamily: 'Calibri',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: 8,
  },
  detailChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  specGrid: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  specLabel: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  specValue: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  serialsSection: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  serialsTitle: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  serialUnitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  serialUnitText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
});
