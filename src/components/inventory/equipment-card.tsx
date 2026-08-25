/**
 * src/components/inventory/equipment-card.tsx
 * Live equipment inventory card for Kuro Mobile.
 * Displays manufacturer, model, category, operational stock levels, location,
 * technical specs (power, weight), barcode, and serial number breakdown.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  Package,
  MapPin,
  Barcode,
  Zap,
  Scale,
  DollarSign,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Equipment } from '@/types/equipment';

export interface EquipmentCardProps {
  item: Equipment;
  onPress?: (item: Equipment) => void;
  testID?: string;
}

export const EquipmentCard: React.FC<EquipmentCardProps> = ({
  item,
  onPress,
  testID,
}) => {
  const { colors, typography, spacing, layout } = useTheme();

  const total = item.quantity || 1;
  const consumed = item.consumedQuantity || 0;
  const available = Math.max(0, total - consumed);

  const getStatusInfo = () => {
    if (available > 0) {
      return { label: 'Available', variant: 'success' as const };
    }
    if (consumed > 0) {
      return { label: 'In Use', variant: 'warning' as const };
    }
    return { label: 'In Repair', variant: 'destructive' as const };
  };

  const status = getStatusInfo();

  return (
    <Pressable
      testID={testID || `equipment-card-${item.id}`}
      onPress={() => onPress?.(item)}
    >
      <Card style={styles.card}>
        <CardContent style={{ paddingTop: spacing.base }}>
          {/* Header Row: Make, Model, Status Pill */}
          <View style={styles.headerRow}>
            <View style={styles.titleCol}>
              {item.manufacturer ? (
                <Text
                  style={[
                    styles.manufacturerText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.xs },
                  ]}
                >
                  {item.manufacturer}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.nameText,
                  { color: colors.cardForeground, fontSize: typography.fontSize.base },
                ]}
                numberOfLines={2}
              >
                {item.name}
              </Text>
            </View>

            <Badge variant={status.variant}>{status.label}</Badge>
          </View>

          {/* Model & Category */}
          <View style={styles.chipsRow}>
            {item.category ? (
              <Badge variant="brand">{item.category}</Badge>
            ) : null}
            {item.model ? (
              <Badge variant="outline">{item.model}</Badge>
            ) : null}
            {item.barcode ? (
              <Text
                style={[
                  styles.barcodeText,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.xs },
                ]}
              >
                {item.barcode}
              </Text>
            ) : null}
          </View>

          {/* Specs & Location Row */}
          <View style={styles.specsRow}>
            {item.knownLocation ? (
              <View style={styles.specItem}>
                <MapPin size={13} color={colors.mutedForeground} style={{ marginRight: 4 }} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.specText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.xs, maxWidth: 140 },
                  ]}
                >
                  {item.knownLocation}
                </Text>
              </View>
            ) : null}

            {item.powerW ? (
              <View style={styles.specItem}>
                <Zap size={13} color={colors.mutedForeground} style={{ marginRight: 4 }} />
                <Text
                  style={[
                    styles.specText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.xs },
                  ]}
                >
                  {item.powerW} W
                </Text>
              </View>
            ) : null}

            {item.weight ? (
              <View style={styles.specItem}>
                <Scale size={13} color={colors.mutedForeground} style={{ marginRight: 4 }} />
                <Text
                  style={[
                    styles.specText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.xs },
                  ]}
                >
                  {item.weight} kg
                </Text>
              </View>
            ) : null}
          </View>

          {/* Footer: Availability stock & Serials count */}
          <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
            <View style={styles.stockCol}>
              <Text style={[styles.stockLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Fleet Stock:
              </Text>
              <Text
                style={[
                  styles.stockValue,
                  {
                    color: available > 0 ? colors.status.online : colors.destructive,
                    fontSize: typography.fontSize.xs,
                  },
                ]}
              >
                {available} / {total} units available
              </Text>
            </View>

            {item.serialNumbers && item.serialNumbers.length > 0 ? (
              <Text
                style={[
                  styles.serialsCount,
                  { color: colors.primary, fontSize: typography.fontSize.xs },
                ]}
              >
                {item.serialNumbers.length} Serials
              </Text>
            ) : null}
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  titleCol: {
    flex: 1,
    marginRight: 8,
  },
  manufacturerText: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  nameText: {
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  barcodeText: {
    fontFamily: 'monospace',
    marginLeft: 4,
  },
  specsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  specText: {},
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  stockCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stockLabel: {},
  stockValue: {
    fontWeight: '700',
  },
  serialsCount: {
    fontWeight: '600',
  },
});
