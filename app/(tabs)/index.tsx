/**
 * app/(tabs)/index.tsx
 * Real-Time Production Events Feed in Kuro Mobile.
 * Features 5 interactive status metric cards, real-time search filtering,
 * 30-day forward rolling window filtering, FlatList with pull-to-refresh,
 * and direct navigation to Event Details, Pull Sheets, and continuous barcode scanner.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarDays,
  Search,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useEvents } from '@/hooks/use-events';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { EventCard } from '@/components/events/event-card';
import type { Event } from '@/types/events';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, isDark } = useTheme();
  const router = useRouter();

  const {
    events,
    filteredEvents,
    loading,
    metrics,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    refresh,
  } = useEvents();

  const handleEventPress = (event: Event) => {
    router.push(`/events/${event.id}`);
  };

  const metricCards: Array<{
    status: string;
    label: string;
    countKey: 'total' | 'inquiry' | 'pending' | 'confirmed' | 'completed';
    color: string;
  }> = [
    { status: 'All', label: 'All', countKey: 'total', color: colors.foreground },
    { status: 'Inquiry', label: 'Inquiry', countKey: 'inquiry', color: '#3B82F6' },
    { status: 'Pending', label: 'Pending', countKey: 'pending', color: '#F59E0B' },
    { status: 'Confirmed', label: 'Confirmed', countKey: 'confirmed', color: '#10B981' },
    { status: 'Completed', label: 'Completed', countKey: 'completed', color: '#8B5CF6' },
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
      testID="events-feed-screen"
    >
      {/* Top Status Metric Cards */}
      <View style={[styles.metricsContainer, { paddingHorizontal: spacing.base, paddingTop: spacing.xs }]}>
        <View style={styles.metricsGrid}>
          {metricCards.map((card) => {
            const isSelected = statusFilter.toLowerCase() === card.status.toLowerCase();
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
                accessibilityLabel={`Filter by ${card.label}, ${count} events`}
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
          placeholder="Search event name, #, client, venue, notes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<Search size={16} color={colors.mutedForeground} />}
          rightIcon={
            searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8} testID="events-feed-search-clear">
                <X size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : undefined
          }
          testID="events-feed-search-input"
        />
      </View>

      {/* Main Events List */}
      {loading && events.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 12 }]}>
            Loading events...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() => handleEventPress(item)}
              testID={`feed-event-${item.id}`}
            />
          )}
          contentContainerStyle={[styles.listContent, { padding: spacing.base }]}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<CalendarDays size={40} color={colors.mutedForeground} />}
              title="No Events Found"
              description={
                searchQuery || statusFilter.toLowerCase() !== 'all'
                  ? 'Try changing your filters or search keywords.'
                  : 'No upcoming production events scheduled in the next 2 months.'
              }
              actionLabel={
                searchQuery || statusFilter.toLowerCase() !== 'all' ? 'Reset Filters' : undefined
              }
              actionVariant="outline"
              onAction={
                searchQuery || statusFilter.toLowerCase() !== 'all'
                  ? () => {
                      setSearchQuery('');
                      setStatusFilter('All');
                    }
                  : undefined
              }
              testID="empty-events-state"
              actionTestID="reset-filters-btn"
            />
          }
          testID="events-flatlist"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
});
