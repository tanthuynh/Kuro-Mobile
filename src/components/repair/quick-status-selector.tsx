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
  AlertOctagon,
  XCircle,
  Clock,
  Truck,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import {
  REPAIR_STATUS_CONFIG,
} from '@/lib/repair-engine';
import type { RepairStatus } from '@/types/repair';

export const FIVE_CANONICAL_STATUSES: RepairStatus[] = [
  'Reported',
  'Pending',
  'Under Repair',
  'Completed',
  'Cancel',
];

export const LOGISTICS_CANONICAL_STATUSES: string[] = [
  'Pending',
  'Scheduled',
  'In Progress',
  'Completed',
  'Cancelled',
];

export const LOGISTICS_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  Pending: {
    label: 'Pending',
    color: '#F59E0B',
  },
  Scheduled: {
    label: 'Scheduled',
    color: '#3B82F6',
  },
  'In Progress': {
    label: 'In Progress',
    color: '#8B5CF6',
  },
  'In Transit': {
    label: 'In Transit',
    color: '#3B82F6',
  },
  Completed: {
    label: 'Completed',
    color: '#10B981',
  },
  Cancelled: {
    label: 'Cancelled',
    color: '#EF4444',
  },
};

export interface QuickStatusSelectorProps<T extends string = string> {
  currentStatus: T;
  onSelectStatus: (newStatus: T) => void | Promise<void>;
  statuses?: T[];
  statusConfigs?: Record<string, { label?: string; color: string; bgColor?: string; borderColor?: string }>;
  disabled?: boolean;
  isUpdating?: boolean;
  showHeader?: boolean;
  headerTitle?: string;
  testID?: string;
}

export function QuickStatusSelector<T extends string = string>({
  currentStatus,
  onSelectStatus,
  statuses,
  statusConfigs,
  disabled = false,
  isUpdating = false,
  showHeader = false,
  headerTitle = 'STATUS',
  testID = 'quick-status-selector',
}: QuickStatusSelectorProps<T>) {
  const { colors, typography, isDark } = useTheme();

  const statusesToRender: T[] = statuses || (FIVE_CANONICAL_STATUSES as unknown as T[]);

  const getStatusConfig = (status: string) => {
    if (statusConfigs && statusConfigs[status]) {
      return statusConfigs[status];
    }
    if (REPAIR_STATUS_CONFIG[status as RepairStatus]) {
      return REPAIR_STATUS_CONFIG[status as RepairStatus];
    }
    if (LOGISTICS_STATUS_CONFIG[status]) {
      return LOGISTICS_STATUS_CONFIG[status];
    }
    return {
      label: status,
      color: colors.foreground,
      bgColor: colors.card,
      borderColor: colors.border,
    };
  };

  const getStatusIcon = (status: string, color: string) => {
    switch (status) {
      case 'Reported':
        return <AlertOctagon size={14} color={color} />;
      case 'Pending':
        return <Package size={14} color={color} />;
      case 'Under Repair':
        return <Wrench size={14} color={color} />;
      case 'Completed':
        return <CheckCircle2 size={14} color={color} />;
      case 'Cancel':
      case 'Cancelled':
        return <XCircle size={14} color={color} />;
      case 'Scheduled':
        return <Clock size={14} color={color} />;
      case 'In Progress':
      case 'In Transit':
        return <Truck size={14} color={color} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      {showHeader ? (
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
            {headerTitle}
          </Text>
          {isUpdating ? (
            <View style={styles.updatingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.updatingText, { color: colors.primary, fontSize: typography.fontSize.sm }]}>
                Updating...
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.buttonsRow}>
        {statusesToRender.map((status) => {
          const config = getStatusConfig(status);

          const isCurrent =
            status === currentStatus ||
            (typeof status === 'string' &&
              typeof currentStatus === 'string' &&
              status.trim().toLowerCase() === currentStatus.trim().toLowerCase());

          const activeBg = isDark
            ? `${config.color}22`
            : `${config.color}15`;

          return (
            <Pressable
              key={status}
              onPress={() => {
                if (!disabled && !isUpdating && !isCurrent) {
                  onSelectStatus(status);
                }
              }}
              disabled={disabled || isUpdating || isCurrent}
              style={({ pressed }) => [
                styles.statusButton,
                {
                  backgroundColor: isCurrent ? activeBg : colors.surface,
                  borderColor: isCurrent ? config.color : colors.border,
                },
                pressed && !isCurrent && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                disabled && !isCurrent && { opacity: 0.4 },
              ]}
              testID={`status-btn-${status.toLowerCase().replace(/\s+/g, '-')}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent, disabled: disabled || isCurrent }}
              accessibilityLabel={`Set status to ${status}`}
            >
              {getStatusIcon(status, isCurrent ? config.color : colors.mutedForeground)}
              <Text
                style={[
                  styles.buttonLabel,
                  {
                    color: isCurrent ? config.color : colors.mutedForeground,
                    fontSize: typography.fontSize.sm,
                    fontWeight: '600',
                  },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {config.label || (status === 'Under Repair' ? 'In Repair' : status)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 18,
  },
  updatingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updatingText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 5,
    width: '100%',
    alignItems: 'center',
  },
  statusButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
  },
  buttonLabel: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
});
