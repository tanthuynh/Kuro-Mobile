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

export interface QuickStatusSelectorProps {
  currentStatus: RepairStatus;
  onSelectStatus: (newStatus: RepairStatus) => void | Promise<void>;
  disabled?: boolean;
  isUpdating?: boolean;
  showHeader?: boolean;
  testID?: string;
}

export function QuickStatusSelector({
  currentStatus,
  onSelectStatus,
  disabled = false,
  isUpdating = false,
  showHeader = false,
  testID = 'quick-status-selector',
}: QuickStatusSelectorProps) {
  const { colors, typography } = useTheme();

  const getStatusIcon = (status: RepairStatus, color: string) => {
    switch (status) {
      case 'Reported':
        return <AlertOctagon size={13} color={color} />;
      case 'Pending':
        return <Package size={13} color={color} />;
      case 'Under Repair':
        return <Wrench size={13} color={color} />;
      case 'Completed':
        return <CheckCircle2 size={13} color={color} />;
      case 'Cancel':
        return <XCircle size={13} color={color} />;
      default:
        return <Wrench size={13} color={color} />;
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      {showHeader ? (
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: typography.fontSize.md }]}>
            Status Updates
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
      ) : null}

      <View style={styles.buttonsRow}>
        {FIVE_CANONICAL_STATUSES.map((status) => {
          const config = REPAIR_STATUS_CONFIG[status] || {
            label: status,
            color: colors.foreground,
            bgColor: colors.card,
            borderColor: colors.border,
          };

          const isCurrent = status === currentStatus;

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
                  backgroundColor: isCurrent ? config.color : config.bgColor,
                  borderColor: isCurrent ? config.color : config.borderColor,
                },
                pressed && !isCurrent && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                disabled && !isCurrent && { opacity: 0.4 },
              ]}
              testID={`status-btn-${status.toLowerCase().replace(/\s+/g, '-')}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent, disabled: disabled || isCurrent }}
              accessibilityLabel={`Set status to ${status}`}
            >
              {getStatusIcon(status, isCurrent ? '#FFFFFF' : config.color)}
              <Text
                style={[
                  styles.buttonLabel,
                  {
                    color: isCurrent ? '#FFFFFF' : config.color,
                    fontSize: 11,
                    fontWeight: isCurrent ? '700' : '600',
                  },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {status === 'Under Repair' ? 'In Repair' : status}
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
    marginVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  updatingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updatingText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
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
    minHeight: 42,
  },
  buttonLabel: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
});
