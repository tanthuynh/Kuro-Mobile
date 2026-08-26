/**
 * app/(tabs)/index.tsx
 * Real-Time Jobs & Events Feed / Operational Command Dashboard in Kuro Mobile.
 * Connects directly to live Firestore tenant events with date scrubbing,
 * categorization tabs, operational metrics, and fast navigation to Pull Sheets and Scanner.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarDays,
  Truck,
  PackageCheck,
  QrCode,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCw,
  PlusCircle,
  FileSpreadsheet,
  Layers,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { useEvents } from '@/hooks/use-events';
import { EventFilterTabs } from '@/components/events/event-filter-tabs';
import { EventCard } from '@/components/events/event-card';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, layout } = useTheme();
  const { user, tenant } = useAuth();
  const router = useRouter();

  const {
    events,
    categorized,
    displayedEvents,
    selectedTab,
    setSelectedTab,
    targetDateOffset,
    setTargetDateOffset,
    resetDateOffset,
    loading,
    refresh,
    metrics,
  } = useEvents(0);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getFormattedDate = (offsetDays: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
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

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Date Scrubber Navigation Bar */}
        <View style={[styles.dateBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setTargetDateOffset((prev) => prev - 1)}
            style={styles.dateNavButton}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            testID="date-scrubber-prev"
          >
            <ChevronLeft size={20} color={colors.foreground} />
          </Pressable>

          <View style={styles.dateDisplayCenter}>
            <Text style={[styles.dateText, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
              {targetDateOffset === 0 ? 'Today • ' : ''}
              {getFormattedDate(targetDateOffset)}
            </Text>
            {targetDateOffset !== 0 ? (
              <Pressable
                onPress={resetDateOffset}
                style={styles.todayBadge}
                testID="date-scrubber-reset"
              >
                <Text style={{ color: colors.primary, fontSize: typography.fontSize.xs, fontWeight: '600' }}>
                  Jump to Today
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => setTargetDateOffset((prev) => prev + 1)}
            style={styles.dateNavButton}
            accessibilityRole="button"
            accessibilityLabel="Next day"
            testID="date-scrubber-next"
          >
            <ChevronRight size={20} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Operational Metrics 4-Grid */}
        <View style={styles.metricsGrid}>
          <View
            style={[
              styles.metricCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderLeftColor: colors.status.events,
              },
            ]}
          >
            <Text style={[styles.metricCount, { color: colors.status.events, fontSize: typography.fontSize.xl }]}>
              {metrics.totalActive}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Events
            </Text>
          </View>

          <View
            style={[
              styles.metricCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderLeftColor: colors.status.logistics,
              },
            ]}
          >
            <Text style={[styles.metricCount, { color: colors.status.logistics, fontSize: typography.fontSize.xl }]}>
              {metrics.inProgressCount}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              In-Progress
            </Text>
          </View>

          <View
            style={[
              styles.metricCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderLeftColor: colors.status.dispatch,
              },
            ]}
          >
            <Text style={[styles.metricCount, { color: colors.status.dispatch, fontSize: typography.fontSize.xl }]}>
              {metrics.todayCount}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Pull Sheets
            </Text>
          </View>

          <View
            style={[
              styles.metricCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderLeftColor: colors.primary,
              },
            ]}
          >
            <Text style={[styles.metricCount, { color: colors.primary, fontSize: typography.fontSize.xl }]}>
              {metrics.upcomingCount}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Upcoming
            </Text>
          </View>
        </View>

        {/* Quick Action Shortcuts */}
        <View style={styles.quickActionsRow}>
          <Button
            variant="primary"
            size="sm"
            icon={<QrCode size={16} color={colors.primaryForeground} />}
            onPress={() => router.push('/(tabs)/scanner')}
            style={styles.quickActionButton}
            testID="dashboard-fast-scanner-btn"
          >
            Continuous Scanner
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Search size={16} color={colors.secondaryForeground} />}
            onPress={() => router.push('/(tabs)/inventory')}
            style={styles.quickActionButton}
            testID="dashboard-search-gear-btn"
          >
            Equipment Catalog
          </Button>
        </View>

        {/* Category Segment Tabs */}
        <EventFilterTabs
          selectedTab={selectedTab}
          onSelectTab={setSelectedTab}
          counts={{
            today: metrics.todayCount,
            inProgress: metrics.inProgressCount,
            upcoming: metrics.upcomingCount,
            all: metrics.totalActive,
          }}
        />

        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: typography.fontSize.md }]}>
            {selectedTab === 'today'
              ? `Today's Operations (${displayedEvents.length})`
              : selectedTab === 'in_progress'
              ? `In-Progress Operations (${displayedEvents.length})`
              : selectedTab === 'upcoming'
              ? `Upcoming Operations (${displayedEvents.length})`
              : `All Active Events (${displayedEvents.length})`}
          </Text>
          <Pressable onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <RotateCw size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Live Events Feed List */}
        {displayedEvents.length === 0 ? (
          <EmptyState
            icon={<Layers size={40} color={colors.mutedForeground} />}
            title="No Events Scheduled"
            description={
              selectedTab === 'today'
                ? `No jobs match the date window for ${getFormattedDate(targetDateOffset)}.`
                : 'No active production events found in this category.'
            }
            actionLabel={targetDateOffset !== 0 ? 'Back to Today' : undefined}
            onAction={targetDateOffset !== 0 ? resetDateOffset : undefined}
            testID="dashboard-empty-state"
          />
        ) : (
          displayedEvents.map((event) => (
            <EventCard key={event.id} event={event} testID={`event-card-item-${event.id}`} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    minHeight: 48,
    marginBottom: 16,
  },
  dateNavButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateDisplayCenter: {
    alignItems: 'center',
  },
  dateText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  todayBadge: {
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 3,
    alignItems: 'center',
  },
  metricCount: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  metricLabel: {
    fontFamily: 'Calibri',
    marginTop: 2,
    fontWeight: '500',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickActionButton: {
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  emptyContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
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
});
