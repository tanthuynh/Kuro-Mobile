/**
 * app/(tabs)/logistics.tsx
 * Real-Time Driver Logistics & Transport Feed in Kuro Mobile.
 * Subscribes live to tenant logistics collection with top-row interactive status metric cards,
 * search filtering, simplified filter structure, and pull-to-refresh.
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
  Truck,
  Search,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useLogistics } from '@/hooks/use-logistics';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { LogisticsJobCard } from '@/components/logistics/LogisticsJobCard';
import { BackgroundLocationDisclosureModal } from '@/components/logistics/BackgroundLocationDisclosureModal';
import { BG_LOCATION_DISCLOSURE_KEY } from '@/services/location-tracking-service';
import type { LogisticsEntry } from '@/types/logistics';

const DISCLOSURE_STORAGE_KEY = BG_LOCATION_DISCLOSURE_KEY || '@kuro_bg_location_disclosure_accepted';

export default function LogisticsFeedScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, isDark } = useTheme();
  const router = useRouter();

  const {
    entries,
    filteredEntries,
    loading,
    metrics,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    refresh,
  } = useLogistics();

  const [showDisclosure, setShowDisclosure] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    const checkDisclosure = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(DISCLOSURE_STORAGE_KEY);
        // Show modal only on initial launch / first install when no preference has been stored
        if ((storedValue === null || storedValue === undefined) && isMounted) {
          setShowDisclosure(true);
        }
      } catch (err) {
        console.warn('[LogisticsFeedScreen] Failed to read background location disclosure state:', err);
      }
    };
    checkDisclosure();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAcceptDisclosure = async () => {
    setShowDisclosure(false);
    try {
      await AsyncStorage.setItem(DISCLOSURE_STORAGE_KEY, 'true');
      if (typeof Location.requestBackgroundPermissionsAsync === 'function') {
        await Location.requestBackgroundPermissionsAsync().catch(() => {});
      }
    } catch (err) {
      console.warn('[LogisticsFeedScreen] Failed to persist disclosure acceptance:', err);
    }
  };

  const handleDeclineDisclosure = async () => {
    setShowDisclosure(false);
    try {
      await AsyncStorage.setItem(DISCLOSURE_STORAGE_KEY, 'declined');
    } catch (err) {
      console.warn('[LogisticsFeedScreen] Failed to persist disclosure decline:', err);
    }
  };

  const handleJobPress = (job: LogisticsEntry) => {
    router.push(`/logistics/${job.id}` as any);
  };

  const metricCards: Array<{
    status: string;
    label: string;
    countKey: 'total' | 'pending' | 'planned' | 'inProgress' | 'completed';
    color: string;
  }> = [
    { status: 'All', label: 'All', countKey: 'total', color: colors.foreground },
    { status: 'Pending', label: 'Pending', countKey: 'pending', color: '#F59E0B' },
    { status: 'Planned', label: 'Planned', countKey: 'planned', color: '#3B82F6' },
    { status: 'In Progress', label: 'In Progress', countKey: 'inProgress', color: '#8B5CF6' },
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
      testID="logistics-feed-screen"
    >
      {/* Top-Row Interactive Status Metric Cards */}
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
                accessibilityLabel={`Filter by ${card.label}, ${count} jobs`}
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

      {/* Main Logistics Jobs List */}
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
                searchQuery || statusFilter.toLowerCase() !== 'all'
                  ? 'Try changing your filters or search keywords.'
                  : 'No active transport runs scheduled for this tenant.'
              }
              actionLabel={
                searchQuery || statusFilter.toLowerCase() !== 'all'
                  ? 'Reset Filters'
                  : undefined
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
              testID="empty-logistics-state"
              actionTestID="reset-logistics-filters-btn"
            />
          }
          testID="logistics-jobs-list"
        />
      )}

      {/* One-Time Background Location Disclosure Modal for Onboarding (R2) */}
      <BackgroundLocationDisclosureModal
        visible={showDisclosure}
        onAccept={handleAcceptDisclosure}
        onDecline={handleDeclineDisclosure}
        testID="onboarding-bg-location-disclosure-modal"
      />
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
