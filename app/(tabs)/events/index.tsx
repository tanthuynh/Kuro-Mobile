/**
 * app/(tabs)/index.tsx
 * Real-Time Production Events Feed in Kuro Mobile.
 * Features 5 interactive status metric cards, real-time search filtering,
 * 30-day forward rolling window filtering, FlatList with pull-to-refresh,
 * and direct navigation to the unified Event Details screen.
 */

import React, { useMemo, useCallback } from 'react';
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
import { useEvents, useTenantEventTypes } from '@/hooks/use-events';
import { useTenantOwners, useTenantCrew } from '@/hooks/use-tickets';
import { isRawIdentifier } from '@/lib/events-engine';
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

  const { owners, refresh: refreshOwners } = useTenantOwners();
  const { crew, refresh: refreshCrew } = useTenantCrew();
  const { eventTypes, refresh: refreshTypes } = useTenantEventTypes();

  const venuesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of owners) {
      if (o.id) {
        map.set(o.id.toLowerCase(), o.name);
      }
      if ((o as any).contactId) {
        map.set((o as any).contactId.toLowerCase(), o.name);
      }
      if (o.name) {
        map.set(o.name.toLowerCase(), o.name);
      }
    }
    return map;
  }, [owners]);

  const crewMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of crew) {
      if (c.id) {
        map.set(c.id.toLowerCase(), c.name);
      }
      if ((c as any).uid) {
        map.set((c as any).uid.toLowerCase(), c.name);
      }
      if (c.name) {
        map.set(c.name.toLowerCase(), c.name);
      }
    }
    return map;
  }, [crew]);

  const typesMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const t of eventTypes) {
      if (t.id) {
        map.set(t.id.toLowerCase(), { name: t.name, color: t.colour || '#60A5FA' });
      }
      if (t.name) {
        map.set(t.name.toLowerCase(), { name: t.name, color: t.colour || '#60A5FA' });
      }
    }
    return map;
  }, [eventTypes]);

  const handleRefresh = useCallback(async () => {
    const promises: Promise<any>[] = [refresh()];
    try {
      const p1 = refreshOwners?.();
      if (p1 && typeof p1.catch === 'function') promises.push(p1.catch(() => {}));
    } catch (_) {}
    try {
      const p2 = refreshCrew?.();
      if (p2 && typeof p2.catch === 'function') promises.push(p2.catch(() => {}));
    } catch (_) {}
    try {
      const p3 = refreshTypes?.();
      if (p3 && typeof p3.catch === 'function') promises.push(p3.catch(() => {}));
    } catch (_) {}
    await Promise.all(promises);
  }, [refresh, refreshOwners, refreshCrew, refreshTypes]);

  const handleEventPress = useCallback(
    (event?: Event) => {
      if (event?.id) {
        router.push(`/events/${event.id}`);
      }
    },
    [router]
  );

  const keyExtractor = useCallback((item: Event) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Event }) => {
      const rawVenue = (item.venueName || item.venueId || '').trim();
      const venueName = rawVenue
        ? venuesMap.get(rawVenue.toLowerCase()) || (isRawIdentifier(rawVenue) ? '' : rawVenue)
        : '';

      const rawAssignee = (item.assigneeName || item.assigneeId || '').trim();
      const assigneeName = rawAssignee
        ? crewMap.get(rawAssignee.toLowerCase()) || venuesMap.get(rawAssignee.toLowerCase()) || (isRawIdentifier(rawAssignee) ? '' : rawAssignee)
        : '';

      const typeInfo = item.eventTypeId ? typesMap.get(item.eventTypeId.toLowerCase()) : undefined;

      return (
        <EventCard
          event={item}
          venueName={venueName}
          assigneeName={assigneeName}
          typeName={typeInfo?.name}
          typeColor={typeInfo?.color}
          onPress={handleEventPress}
          testID={`feed-event-${item.id}`}
        />
      );
    },
    [venuesMap, crewMap, typesMap, handleEventPress]
  );

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
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          contentContainerStyle={[styles.listContent, { padding: spacing.base }]}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={handleRefresh}
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
