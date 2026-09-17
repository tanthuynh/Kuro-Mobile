/**
 * app/(tabs)/repairs.tsx
 * Real-Time Active Repair Tickets Feed & Fault Management in Kuro Mobile.
 * Subscribes live to tenant tickets collection with interactive status metric cards and search.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Wrench,
  Plus,
  Search,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useTickets } from '@/hooks/use-tickets';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RepairTicketCard } from '@/components/repair/repair-ticket-card';
import type { RepairTicket } from '@/types/repair';

export default function RepairsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, isDark } = useTheme();
  const router = useRouter();

  const {
    tickets,
    filteredTickets,
    loading,
    metrics,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
  } = useTickets();

  const handleCreateNew = () => {
    router.push('/repairs/new');
  };

  const handleTicketPress = useCallback((ticket: RepairTicket) => {
    router.push(`/repairs/${ticket.id}` as any);
  }, [router]);

  const keyExtractor = useCallback((item: RepairTicket) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: RepairTicket }) => (
      <RepairTicketCard
        ticket={item}
        onPress={handleTicketPress}
        testID={`feed-ticket-${item.id}`}
      />
    ),
    [handleTicketPress]
  );

  const metricCards: Array<{
    status: string;
    label: string;
    countKey: 'total' | 'reported' | 'pending' | 'underRepair' | 'completed';
    color: string;
  }> = [
    { status: 'All', label: 'All', countKey: 'total', color: colors.foreground },
    { status: 'Reported', label: 'Reported', countKey: 'reported', color: '#3B82F6' },
    { status: 'Pending', label: 'Pending', countKey: 'pending', color: '#F59E0B' },
    { status: 'Under Repair', label: 'Under Repair', countKey: 'underRepair', color: '#EF4444' },
    { status: 'Completed', label: 'Completed', countKey: 'completed', color: '#10B981' },
  ];

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
      {/* Interactive Status Metric Cards */}
      <View style={[styles.metricsContainer, { paddingHorizontal: spacing.base, paddingTop: spacing.xs }]}>
        <View style={styles.metricsGrid}>
          {metricCards.map((card) => {
            const isSelected = statusFilter === card.status;
            const count = metrics[card.countKey] ?? 0;

            return (
              <Pressable
                key={card.status}
                onPress={() => setStatusFilter(card.status)}
                style={({ pressed }) => [
                  styles.metricCard,
                  {
                    backgroundColor: isSelected
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.18)'
                        : 'rgba(59, 130, 246, 0.12)'
                      : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                  pressed && { opacity: 0.8 },
                ]}
                testID={`metric-card-${card.status.toLowerCase().replace(/\s+/g, '-')}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Filter by ${card.label}, ${count} tickets`}
              >
                <Text
                  style={[
                    styles.metricNumber,
                    {
                      color: card.color,
                      fontSize: typography.fontSize.lg,
                    },
                  ]}
                >
                  {count}
                </Text>
                <Text
                  style={[
                    styles.metricLabel,
                    {
                      color: isSelected ? colors.foreground : colors.mutedForeground,
                      fontSize: typography.fontSize.sm,
                      fontWeight: isSelected ? '700' : '600',
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {card.label}
                </Text>
              </Pressable>
            );
          })}
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
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          contentContainerStyle={[styles.listContent, { padding: spacing.base }]}
          ListEmptyComponent={
            <EmptyState
              icon={<Wrench size={40} color={colors.mutedForeground} />}
              title="No Repair Tickets Found"
              description={
                searchQuery || statusFilter !== 'All'
                  ? 'Try changing your filters or search keywords.'
                  : 'All fleet equipment is in operational condition.'
              }
              actionLabel={
                searchQuery || statusFilter !== 'All' ? 'Reset Filters' : 'Report Fault'
              }
              actionVariant={searchQuery || statusFilter !== 'All' ? 'outline' : 'primary'}
              actionIcon={searchQuery || statusFilter !== 'All' ? undefined : <Plus size={14} color={colors.primaryForeground} />}
              onAction={
                searchQuery || statusFilter !== 'All'
                  ? () => {
                      setSearchQuery('');
                      setStatusFilter('All');
                    }
                  : handleCreateNew
              }
              testID="empty-repairs-state"
              actionTestID={searchQuery || statusFilter !== 'All' ? 'reset-filters-btn' : 'feed-new-repair-empty-btn'}
            />
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
            paddingBottom: 18,
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
          style={{ backgroundColor: colors.brandGreen }}
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
    paddingBottom: 18,
  },
  metricsContainer: {
    marginBottom: 6,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 4,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    minHeight: 48,
  },
  metricNumber: {
    fontFamily: 'Calibri',
    fontSize: 20,
    fontWeight: '700',
  },
  metricLabel: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  searchContainer: {
    marginBottom: 6,
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
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
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
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: 'Calibri',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
