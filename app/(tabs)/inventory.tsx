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

import { useTheme } from '@/context/theme-context';
import { useEquipment } from '@/hooks/use-equipment';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CategoryFilterBar } from '@/components/inventory/category-filter-bar';
import { EquipmentCard } from '@/components/inventory/equipment-card';
import type { Equipment } from '@/types/equipment';

const AVAILABILITY_FILTERS = ['All', 'Available', 'In Use', 'In Repair'];

export default function InventoryScreen() {
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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <ScreenHeader
        title="Equipment Inventory"
        subtitle="Live Warehouse & Fleet Catalog"
        showTenantBadge
        rightAction={
          <Button
            variant="primary"
            size="sm"
            icon={<QrCode size={14} color={colors.primaryForeground} />}
            onPress={() => router.push('/(tabs)/scanner')}
            testID="inventory-scan-shortcut-btn"
          >
            Scan
          </Button>
        }
      />

      {/* Search Input Bar */}
      <View style={[styles.searchContainer, { paddingHorizontal: spacing.base, paddingTop: spacing.sm }]}>
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
            <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Package size={48} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
                No Equipment Found
              </Text>
              <Text
                style={[
                  styles.emptySubtitle,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.sm, marginVertical: spacing.sm },
                ]}
              >
                {`No items match "${searchQuery || selectedCategory || availabilityFilter}".`}
              </Text>
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setAvailabilityFilter('All');
                }}
              >
                Reset Filters
              </Button>
            </View>
          }
          renderItem={({ item }) => (
            <EquipmentCard
              item={item}
              onPress={(selected) => setActiveItem(selected)}
            />
          )}
        />
      )}

      {/* Item Detail Inspection Modal */}
      <Modal
        visible={Boolean(activeItem)}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
                Equipment Specifications
              </Text>
              <Pressable
                onPress={() => setActiveItem(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {activeItem ? (
              <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 20 }}>
                {activeItem.manufacturer ? (
                  <Text style={[styles.detailItemManufacturer, { color: colors.primary, fontSize: typography.fontSize.sm }]}>
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
                      <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>{activeItem.model}</Text>
                    </View>
                  ) : null}

                  {activeItem.barcode ? (
                    <View style={styles.specRow}>
                      <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Barcode</Text>
                      <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>{activeItem.barcode}</Text>
                    </View>
                  ) : null}

                  {activeItem.serialNumber ? (
                    <View style={styles.specRow}>
                      <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Primary Serial</Text>
                      <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>{activeItem.serialNumber}</Text>
                    </View>
                  ) : null}

                  {activeItem.knownLocation ? (
                    <View style={styles.specRow}>
                      <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Warehouse Location</Text>
                      <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>{activeItem.knownLocation}</Text>
                    </View>
                  ) : null}

                  <View style={styles.specRow}>
                    <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Fleet Quantity</Text>
                    <Text style={[styles.specValue, { color: colors.status.online, fontSize: typography.fontSize.sm }]}>
                      {Math.max(0, (activeItem.quantity || 1) - (activeItem.consumedQuantity || 0))} available / {activeItem.quantity || 1} total
                    </Text>
                  </View>

                  {activeItem.weight ? (
                    <View style={styles.specRow}>
                      <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Weight</Text>
                      <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>{activeItem.weight} kg</Text>
                    </View>
                  ) : null}

                  {activeItem.powerW ? (
                    <View style={styles.specRow}>
                      <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>Power Draw</Text>
                      <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>{activeItem.powerW} W</Text>
                    </View>
                  ) : null}
                </View>

                {/* Serial Numbers List */}
                {activeItem.serialNumbers && activeItem.serialNumbers.length > 0 ? (
                  <View style={[styles.serialsSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.serialsTitle, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
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
              </ScrollView>
            ) : null}
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
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  availPillText: {},
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
    fontWeight: '700',
  },
  emptySubtitle: {
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
    fontWeight: '700',
  },
  modalBody: {},
  detailItemManufacturer: {
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailItemName: {
    fontWeight: '700',
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
    fontWeight: '500',
  },
  specValue: {
    fontWeight: '600',
  },
  serialsSection: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  serialsTitle: {
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  serialUnitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  serialUnitText: {
    fontFamily: 'monospace',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
});
