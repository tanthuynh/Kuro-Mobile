/**
 * src/components/repair/quick-status-selector.tsx
 * 1-Tap Technician Quick Status Transition Selector in Kuro Mobile.
 * Synchronizes repair ticket status with equipment operational condition.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  Wrench,
  Package,
  CheckCircle2,
  Check,
  Truck,
  RotateCcw,
  Archive,
  AlertOctagon,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import {
  REPAIR_STATUS_CONFIG,
  getQuickStatusOptions,
  isValidStatusTransition,
} from '@/lib/repair-engine';
import type { RepairStatus } from '@/types/repair';

export interface QuickStatusSelectorProps {
  currentStatus: RepairStatus;
  onSelectStatus: (newStatus: RepairStatus) => void | Promise<void>;
  disabled?: boolean;
  isUpdating?: boolean;
  testID?: string;
}

export function QuickStatusSelector({
  currentStatus,
  onSelectStatus,
  disabled = false,
  isUpdating = false,
  testID = 'quick-status-selector',
}: QuickStatusSelectorProps) {
  const { colors, typography, spacing, layout } = useTheme();

  // Determine available quick status transition options
  const quickOptions = getQuickStatusOptions(currentStatus);

  const getStatusIcon = (status: RepairStatus, color: string) => {
    switch (status) {
      case 'Under Repair':
        return <Wrench size={15} color={color} />;
      case 'Awaiting Parts':
        return <Package size={15} color={color} />;
      case 'Operational':
        return <CheckCircle2 size={15} color={color} />;
      case 'Completed':
        return <Check size={15} color={color} />;
      case 'Collected':
        return <Truck size={15} color={color} />;
      case 'Returned':
        return <RotateCcw size={15} color={color} />;
      case 'Decommissioned':
        return <AlertOctagon size={15} color={color} />;
      case 'Archived':
        return <Archive size={15} color={color} />;
      default:
        return <Wrench size={15} color={color} />;
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
          1-Tap Status Updates
        </Text>
        {isUpdating ? (
          <View style={styles.updatingIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.updatingText, { color: colors.primary, fontSize: typography.fontSize.xs }]}>
              Updating...
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.buttonsGrid}>
        {quickOptions.map((status) => {
          const config = REPAIR_STATUS_CONFIG[status] || {
            label: status,
            color: colors.foreground,
            bgColor: colors.card,
            borderColor: colors.border,
          };

          const isCurrent = status === currentStatus;
          const isValid = isValidStatusTransition(currentStatus, status);

          return (
            <Pressable
              key={status}
              onPress={() => {
                if (!disabled && !isUpdating && !isCurrent && isValid) {
                  onSelectStatus(status);
                }
              }}
              disabled={disabled || isUpdating || isCurrent || !isValid}
              style={({ pressed }) => [
                styles.statusButton,
                {
                  backgroundColor: isCurrent ? config.color : config.bgColor,
                  borderColor: config.borderColor,
                },
                pressed && !isCurrent && isValid && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                (!isValid || disabled) && !isCurrent && { opacity: 0.45 },
              ]}
              testID={`status-btn-${status.toLowerCase().replace(/\s+/g, '-')}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent, disabled: disabled || !isValid }}
              accessibilityLabel={`Set status to ${status}`}
            >
              {getStatusIcon(status, isCurrent ? '#FFFFFF' : config.color)}
              <Text
                style={[
                  styles.buttonLabel,
                  {
                    color: isCurrent ? '#FFFFFF' : config.color,
                    fontSize: typography.fontSize.xs,
                  },
                ]}
                numberOfLines={1}
              >
                {status}
              </Text>
              {isCurrent ? (
                <View style={styles.activeDot} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  updatingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updatingText: {
    fontWeight: '600',
  },
  buttonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    flexGrow: 1,
    flexBasis: '47%',
  },
  buttonLabel: {
    fontWeight: '700',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginLeft: 2,
  },
});
