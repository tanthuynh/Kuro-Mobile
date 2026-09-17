/**
 * src/components/events/event-scan-status-modal.tsx
 * Decoupled Modal Sheet for selecting operational scan target status.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { ModalSheet } from '@/components/ui/modal-sheet';
import type { ScanTargetStatus } from '@/types/scanner';

export interface EventScanStatusModalProps {
  visible: boolean;
  currentStatus: ScanTargetStatus;
  onSelectStatus: (status: ScanTargetStatus) => void;
  onClose: () => void;
  testID?: string;
}

interface TargetStatusOption {
  status: ScanTargetStatus;
  label: string;
  badgeVariant: BadgeVariant;
  description: string;
}

const TARGET_STATUS_OPTIONS: TargetStatusOption[] = [
  {
    status: 'confirmed',
    label: 'Confirmed',
    badgeVariant: 'secondary',
    description: 'Acknowledge and confirm equipment line item',
  },
  {
    status: 'prepped_scanned',
    label: 'Prepped',
    badgeVariant: 'success',
    description: 'Increment scanned units (Prepped X/Y -> Prepped)',
  },
  {
    status: 'returned',
    label: 'Returned',
    badgeVariant: 'info',
    description: 'Check gear back in upon return from event',
  },
  {
    status: 'deprepped',
    label: 'Deprep',
    badgeVariant: 'warning',
    description: 'Revert gear preparation back to shelf',
  },
];

export function EventScanStatusModal({
  visible,
  currentStatus,
  onSelectStatus,
  onClose,
  testID = 'scanner-status-picker-modal',
}: EventScanStatusModalProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Select Scan Target Status"
      testID={testID}
    >
      <View style={styles.modalContentWrap}>
        <Text
          style={[
            styles.modalHelperText,
            { color: colors.mutedForeground, fontSize: typography.fontSize.sm, marginBottom: spacing.md },
          ]}
        >
          Choose the operational status applied to equipment as barcodes are scanned:
        </Text>

        {TARGET_STATUS_OPTIONS.map((option) => {
          const isSelected = currentStatus === option.status;
          return (
            <Pressable
              key={option.status}
              style={[
                styles.statusOptionRow,
                {
                  backgroundColor: colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
              onPress={() => {
                onSelectStatus(option.status);
                onClose();
              }}
              testID={`status-option-${option.status}`}
            >
              <View style={styles.statusOptionLeft}>
                <View style={styles.statusOptionHeader}>
                  <Badge variant={option.badgeVariant}>{option.label}</Badge>
                  {isSelected ? (
                    <Check size={18} color={colors.primary} style={{ marginLeft: 8 }} />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.statusOptionDesc,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.xs, marginTop: 4 },
                  ]}
                >
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  modalContentWrap: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  modalHelperText: {
    fontFamily: 'Calibri',
  },
  statusOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  statusOptionLeft: {
    flex: 1,
  },
  statusOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusOptionDesc: {
    fontFamily: 'Calibri',
    lineHeight: 16,
  },
});
