/**
 * app/(tabs)/logistics.tsx
 * Driver Logistics & Transport Feed in Kuro Mobile.
 * Displays real-time tenant logistics jobs, summary metrics, driver assignment filters,
 * status filter chips, and full search filtering with pull-to-refresh.
 */

import React from 'react';
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
  Truck,
  Search,
  X,
  Radio,
  UserCheck,
  Users,
  CheckCircle2,
  Clock,
  Navigation,
  AlertTriangle,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useLogistics } from '@/hooks/use-logistics';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LogisticsJobCard } from '@/components/logistics/LogisticsJobCard';
import type { LogisticsEntry } from '@/types/logistics';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'completed', label: 'Completed' },
];

export default function LogisticsFeedScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, layout } = useTheme();
  const router = useRouter();

  const {
    entries,
    filteredEntries,
    loading,
    error,
    metrics,
    onlyAssigned,
    setOnlyAssigned,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    refresh,
  } = useLogistics();

  const handleJobPress = (job: LogisticsEntry) => {
    router.push(`/logistics/${job.id}` as any);
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
      testID="logistics-feed-screen"
    >
      {/* Header Title */}
      <View style={[styles.headerContainer, { paddingHorizontal: spacing.base }]}>
        <View style={styles.titleRow}>
          <Truck size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: typography.fontSize.xl }]}>
            Logistics & Transport
          </Text>
        </View>
      </View>

      {/* Metrics Summary Strip */}
      <View style={[styles.metricsContainer, { paddingHorizontal: spacing.base }]}>
        <View style={styles.metricsGrid}>
          {/* Active */}
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID="metric-card-active">
            <Text style={[styles.metricNumber, { color: colors.primary, fontSize: typography.fontSize.lg }]}>
              {metrics.active}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Active
            </Text>
          </View>

          {/* Scheduled */}
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID="metric-card-scheduled">
            <Text style={[styles.metricNumber, { color: '#EAB308', fontSize: typography.fontSize.lg }]}>
              {metrics.scheduled}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Scheduled
            </Text>
          </View>

          {/* Completed */}
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID="metric-card-completed">
            <Text style={[styles.metricNumber, { color: colors.status.online, fontSize: typography.fontSize.lg }]}>
              {metrics.completed}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Completed
            </Text>
          </View>

          {/* Total */}
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID="metric-card-total">
            <Text style={[styles.metricNumber, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
              {metrics.total}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Total
            </Text>
          </View>
        </View>
      </View>

      {/* Assignment Toggle & Search */}
      <View style={[styles.controlsContainer, { paddingHorizontal: spacing.base }]}>
        {/* Assigned to Me / All Jobs Toggle */}
        <View style={[styles.toggleContainer, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setOnlyAssigned(false)}
            style={[
              styles.toggleTab,
              !onlyAssigned && { backgroundColor: colors.card },
            ]}
            testID="toggle-all-jobs"
          >
            <Users size={13} color={!onlyAssigned ? colors.foreground : colors.mutedForeground} />
            <Text
              style={[
                styles.toggleText,
                {
                  color: !onlyAssigned ? colors.foreground : colors.mutedForeground,
                  fontSize: typography.fontSize.xs,
                  fontWeight: !onlyAssigned ? '700' : '500',
                },
              ]}
            >
              All Jobs
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setOnlyAssigned(true)}
            style={[
              styles.toggleTab,
              onlyAssigned && { backgroundColor: colors.primary },
            ]}
            testID="toggle-assigned-me"
          >
            <UserCheck size={13} color={onlyAssigned ? colors.primaryForeground : colors.mutedForeground} />
            <Text
              style={[
                styles.toggleText,
                {
                  color: onlyAssigned ? colors.primaryForeground : colors.mutedForeground,
                  fontSize: typography.fontSize.xs,
                  fontWeight: onlyAssigned ? '700' : '500',
                },
              ]}
            >
              Assigned to Me
            </Text>
          </Pressable>
        </View>

        {/* Search Input Bar */}
        <View style={styles.searchRow}>
          <Input
            placeholder="Search venue, event, driver, notes..."
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
            testID="logistics-search-input"
          />
        </View>
      </View>

      {/* Status Filter Chips */}
      <View style={styles.statusChipsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.statusChipsScroll, { paddingHorizontal: spacing.base }]}
        >
          {STATUS_FILTERS.map((filter) => {
            const isSelected = statusFilter.toLowerCase() === filter.id.toLowerCase();
            return (
              <Pressable
                key={filter.id}
                onPress={() => setStatusFilter(filter.id)}
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                testID={`status-filter-${filter.id}`}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    {
                      color: isSelected ? colors.primaryForeground : colors.foreground,
                      fontSize: typography.fontSize.xs,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Jobs FlatList */}
      {loading && entries.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 12 }]}>
            Loading logistics jobs...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LogisticsJobCard
              job={item}
              onPress={() => handleJobPress(item)}
              testID={`logistics-job-${item.id}`}
            />
          )}
          contentContainerStyle={[styles.listContent, { padding: spacing.base }]}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Truck size={40} color={colors.mutedForeground} />}
              title="No Logistics Jobs Found"
              description={
                searchQuery || statusFilter !== 'all' || onlyAssigned
                  ? 'Try adjusting your filters or search keywords.'
                  : 'No active transport runs scheduled for this tenant.'
              }
              actionLabel={
                searchQuery || statusFilter !== 'all' || onlyAssigned
                  ? 'Reset Filters'
                  : undefined
              }
              onAction={
                searchQuery || statusFilter !== 'all' || onlyAssigned
                  ? () => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setOnlyAssigned(false);
                    }
                  : undefined
              }
              testID="empty-logistics-state"
              actionTestID="reset-logistics-filters-btn"
            />
          }
          testID="logistics-jobs-list"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerContainer: {
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'Calibri',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  metricsContainer: {
    marginBottom: 8,
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
    fontFamily: 'Calibri',
    fontSize: 20,
    fontWeight: '700',
  },
  metricLabel: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 1,
  },
  controlsContainer: {
    gap: 8,
    marginBottom: 6,
  },
  toggleContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 6,
  },
  toggleText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
  },
  searchRow: {},
  statusChipsContainer: {
    marginBottom: 6,
  },
  statusChipsScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  statusChip: {
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusChipText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
  },
  listContent: {
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'Calibri',
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
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});
