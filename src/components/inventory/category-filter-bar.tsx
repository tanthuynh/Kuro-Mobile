/**
 * src/components/inventory/category-filter-bar.tsx
 * Horizontal scrollable category filter pills for equipment inventory in Kuro Mobile.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useTheme } from '@/context/theme-context';

export const INVENTORY_CATEGORIES = [
  'All',
  'Audio',
  'Lighting',
  'Video',
  'Rigging',
  'Staging',
  'Cables',
  'Comms',
  'Power',
];

export interface CategoryFilterBarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categories?: string[];
  testID?: string;
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  selectedCategory,
  onSelectCategory,
  categories = INVENTORY_CATEGORIES,
  testID,
}) => {
  const { colors, typography, spacing, layout } = useTheme();

  return (
    <View testID={testID || 'category-filter-bar'} style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base, gap: spacing.xs }]}
      >
        {categories.map((cat) => {
          const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
          return (
            <Pressable
              key={cat}
              onPress={() => onSelectCategory(cat)}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderRadius: layout.borderRadius.full,
                },
              ]}
              testID={`inventory-cat-chip-${cat.toLowerCase()}`}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isSelected ? colors.primaryForeground : colors.foreground,
                    fontSize: typography.fontSize.sm,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  scrollContent: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
  },
});
