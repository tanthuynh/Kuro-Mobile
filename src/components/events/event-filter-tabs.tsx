/**
 * src/components/events/event-filter-tabs.tsx
 * Segmented filter tabs for Today's Jobs, In-Progress, Upcoming, and All Active events.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useTheme } from '@/context/theme-context';
import type { EventTabType } from '@/hooks/use-events';

export interface EventFilterTabsProps {
  selectedTab: EventTabType;
  onSelectTab: (tab: EventTabType) => void;
  counts: {
    today: number;
    inProgress: number;
    upcoming: number;
    all: number;
  };
}

export const EventFilterTabs: React.FC<EventFilterTabsProps> = ({
  selectedTab,
  onSelectTab,
  counts,
}) => {
  const { colors, typography, spacing, layout } = useTheme();

  const tabs: { key: EventTabType; label: string; count: number }[] = [
    { key: 'today', label: "Today's Jobs", count: counts.today },
    { key: 'in_progress', label: 'In-Progress', count: counts.inProgress },
    { key: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { key: 'all', label: 'All Active', count: counts.all },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { gap: spacing.sm }]}
      >
        {tabs.map((tab) => {
          const isActive = selectedTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelectTab(tab.key)}
              style={[
                styles.tabButton,
                {
                  backgroundColor: isActive ? colors.primary : colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                  borderRadius: layout.borderRadius.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              testID={`event-tab-${tab.key}`}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? colors.primaryForeground : colors.foreground,
                    fontSize: typography.fontSize.sm,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {tab.label}
              </Text>
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: isActive
                      ? 'rgba(255, 255, 255, 0.25)'
                      : colors.card,
                    borderColor: isActive ? 'transparent' : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    {
                      color: isActive ? colors.primaryForeground : colors.mutedForeground,
                      fontSize: typography.fontSize.sm,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {tab.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 48,
  },
  tabLabel: {
    fontFamily: 'Calibri',
    marginRight: 6,
  },
  countBadge: {
    minHeight: 26,
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
