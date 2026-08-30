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
  const { colors, typography, isDark } = useTheme();

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
        return null;
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      {showHeader ? (
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            STATUS
          </Text>
          {isUpdating ? (
            <View style={styles.updatingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.updatingText, { color: colors.primary, fontSize: 10 }]}>
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
                    fontSize: 11,
                    fontWeight: '500',
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  updatingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updatingText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
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
