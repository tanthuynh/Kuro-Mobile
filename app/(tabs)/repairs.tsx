/**
 * app/(tabs)/repairs.tsx
 * Real-Time Active Repair Tickets Feed & Fault Management in Kuro Mobile.
 * Subscribes live to tenant tickets collection with multi-criteria status/priority filters and search.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Wrench,
  Plus,
  Search,
  X,
  Filter,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Package,
  AlertTriangle,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useTickets } from '@/hooks/use-tickets';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RepairTicketCard } from '@/components/repair/repair-ticket-card';
import type { RepairTicket, RepairStatus, RepairPriority } from '@/types/repair';

const STATUS_TABS = [
  'All',
  'Under Repair',
  'Awaiting Parts',
  'Operational',
  'Completed',
];

const PRIORITY_FILTERS = [
  'All',
  'Critical',
  'High',
  'Medium',
  'Low',
];

export default function RepairsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, layout } = useTheme();
  const router = useRouter();

  const {
    tickets,
    filteredTickets,
    loading,
    error,
    metrics,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    searchQuery,
    setSearchQuery,
  } = useTickets();

  const handleCreateNew = () => {
    router.push('/repair/new');
  };

  const handleTicketPress = (ticket: RepairTicket) => {
    router.push(`/repair/${ticket.id}`);
  };

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
      {/* Metrics Summary Strip */}
      <View style={[styles.metricsContainer, { paddingHorizontal: spacing.base, paddingTop: spacing.xs }]}>
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.metricNumber, { color: colors.destructive, fontSize: typography.fontSize.lg }]}>
              {metrics.underRepair}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              In Repair
            </Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.metricNumber, { color: '#EA580C', fontSize: typography.fontSize.lg }]}>
              {metrics.awaitingParts}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Parts
            </Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.metricNumber, { color: colors.status.online, fontSize: typography.fontSize.lg }]}>
              {metrics.operational}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Fixed
            </Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.metricNumber, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
              {metrics.total}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Total
            </Text>
          </View>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={[styles.searchContainer, { paddingHorizontal: spacing.base, paddingTop: spacing.xs }]}>
        <Input
          placeholder="Search ticket #, equipment, serial, notes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<Search size={16} color={colors.mutedForeground} />}
          rightIcon={
            searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <X size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : undefined
          }
          testID="repair-feed-search-input"
        />
      </View>

      {/* Status Filter Horizontal Tabs */}
      <View style={styles.statusTabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.statusTabsScroll, { paddingHorizontal: spacing.base }]}
        >
          {STATUS_TABS.map((status) => {
            const isSelected = statusFilter === status;
            return (
              <Pressable
                key={status}
                onPress={() => setStatusFilter(status)}
                style={[
                  styles.statusTabPill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                testID={`status-filter-tab-${status.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Text
                  style={[
                    styles.statusTabText,
                    {
                      color: isSelected ? colors.primaryForeground : colors.foreground,
                      fontSize: typography.fontSize.xs,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {status}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Priority Filter Chips */}
      <View style={styles.priorityFilterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.priorityScroll, { paddingHorizontal: spacing.base }]}
        >
          {PRIORITY_FILTERS.map((p) => {
            const isSelected = priorityFilter === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPriorityFilter(p)}
                style={[
                  styles.priorityChip,
                  {
                    backgroundColor: isSelected
                      ? p === 'Critical'
                        ? 'rgba(239, 68, 68, 0.25)'
                        : colors.muted
                      : 'transparent',
                    borderColor: isSelected
                      ? p === 'Critical'
                        ? colors.destructive
                        : colors.primary
                      : colors.border,
                  },
                ]}
                testID={`priority-filter-chip-${p.toLowerCase()}`}
              >
                <Text
                  style={[
                    styles.priorityChipText,
                    {
                      color: isSelected
                        ? p === 'Critical'
                          ? colors.destructive
                          : colors.foreground
                        : colors.mutedForeground,
                      fontSize: 11,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {p === 'All' ? 'All Priorities' : p}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Tickets List */}
      {loading && tickets.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 12 }]}>
            Loading repair tickets...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTickets}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RepairTicketCard
              ticket={item}
              onPress={() => handleTicketPress(item)}
              testID={`feed-ticket-${item.id}`}
            />
          )}
          contentContainerStyle={[styles.listContent, { padding: spacing.base }]}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Wrench size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                No Repair Tickets Found
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                {searchQuery || statusFilter !== 'All' || priorityFilter !== 'All'
                  ? 'Try changing your filters or search keywords.'
                  : 'All fleet equipment is in operational condition.'}
              </Text>

              {searchQuery || statusFilter !== 'All' || priorityFilter !== 'All' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setSearchQuery('');
                    setStatusFilter('All');
                    setPriorityFilter('All');
                  }}
                  style={{ marginTop: 12 }}
                  testID="reset-filters-btn"
                >
                  Reset Filters
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} color={colors.primaryForeground} />}
                  onPress={handleCreateNew}
                  style={{ marginTop: 12 }}
                  testID="empty-report-fault-btn"
                >
                  Report Fault
                </Button>
              )}
            </View>
          }
        />
      )}

      {/* Fixed Bottom Action Pane above Bottom Tab Bar */}
      <View
        style={[
          styles.bottomActionPane,
          {
            paddingHorizontal: spacing.base,
            paddingTop: spacing.xs,
            paddingBottom: spacing.sm,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={<Plus size={18} color={colors.primaryForeground} />}
          onPress={handleCreateNew}
          testID="feed-new-repair-btn"
        >
          Report Equipment Fault
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  bottomActionPane: {
    paddingTop: 8,
  },
  metricsContainer: {
    marginBottom: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  metricNumber: {
    fontWeight: '800',
  },
  metricLabel: {
    fontWeight: '600',
    marginTop: 1,
  },
  searchContainer: {
    marginBottom: 6,
  },
  statusTabsContainer: {
    marginVertical: 4,
  },
  statusTabsScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  statusTabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusTabText: {},
  priorityFilterContainer: {
    marginBottom: 8,
  },
  priorityScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  priorityChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  priorityChipText: {},
  listContent: {
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 6,
  },
  emptyTitle: {
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    textAlign: 'center',
  },
});
