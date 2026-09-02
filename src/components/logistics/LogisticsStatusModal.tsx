/**
 * src/components/logistics/LogisticsStatusModal.tsx
 * Driver Job Status Transition Modal in Kuro Mobile.
 * Enables drivers to update the logistics status and optionally provide an accompanying note.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import {
  Truck,
  CheckCircle2,
  Clock,
  Navigation,
  X,
  Send,
  AlertTriangle,
  RotateCcw,
  Ban,
  Check,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { isValidStatusTransition } from '@/lib/logistics-engine';
import type { LogisticsStatus } from '@/types/logistics';

export interface LogisticsStatusModalProps {
  visible: boolean;
  currentStatus?: string;
  onClose: () => void;
  onSubmit: (newStatus: string, note?: string) => Promise<void> | void;
  isSubmitting?: boolean;
  testID?: string;
}

const AVAILABLE_STATUSES: { status: LogisticsStatus; label: string; icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { status: 'In Transit', label: 'In Transit / En Route', icon: Truck },
  { status: 'In Progress', label: 'In Progress / On Site', icon: Navigation },
  { status: 'Completed', label: 'Completed / Delivered', icon: CheckCircle2 },
  { status: 'Scheduled', label: 'Scheduled / Pending', icon: Clock },
  { status: 'Cancelled', label: 'Cancelled', icon: Ban },
];

export function LogisticsStatusModal({
  visible,
  currentStatus = 'Scheduled',
  onClose,
  onSubmit,
  isSubmitting = false,
  testID = 'logistics-status-modal',
}: LogisticsStatusModalProps) {
  const { colors, typography, spacing } = useTheme();
  const [selectedStatus, setSelectedStatus] = useState<string>(currentStatus);
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedStatus(currentStatus);
      setNote('');
      setError(null);
    }
  }, [visible, currentStatus]);

  const handleClose = () => {
    setError(null);
    setNote('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedStatus) {
      setError('Please select a target status');
      return;
    }

    if (!isValidStatusTransition(currentStatus, selectedStatus)) {
      setError(`Cannot transition from ${currentStatus} to ${selectedStatus}`);
      return;
    }

    try {
      setError(null);
      await onSubmit(selectedStatus, note.trim() || undefined);
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update status');
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={handleClose}
      title="Update Job Status"
      icon={<Truck size={18} color={colors.primary} />}
      testID={testID}
    >
      <View>
        {/* Current Status Pill */}
        <View style={styles.currentStatusRow}>
          <Text style={[styles.currentStatusLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
            Current Status:
          </Text>
          <Badge variant="outline">{currentStatus}</Badge>
        </View>

        {/* Error banner if any */}
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: colors.destructive }]}>
            <AlertTriangle size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive, fontSize: typography.fontSize.sm }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Status Options List */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
          Select New Status
        </Text>

        <View style={styles.statusList}>
          {AVAILABLE_STATUSES.map(({ status, label, icon: IconComponent }) => {
            const isSelected = selectedStatus === status;
            const isCurrent = currentStatus === status;

            return (
              <Pressable
                key={status}
                onPress={() => {
                  setSelectedStatus(status);
                  if (error) setError(null);
                }}
                style={[
                  styles.statusOption,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                testID={`status-option-${status.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <View style={styles.optionLeft}>
                  <IconComponent
                    size={16}
                    color={isSelected ? colors.primaryForeground : colors.foreground}
                  />
                  <Text
                    style={[
                      styles.optionLabel,
                      {
                        color: isSelected ? colors.primaryForeground : colors.foreground,
                        fontSize: typography.fontSize.sm,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </View>

                {isCurrent ? (
                  <Badge variant={isSelected ? 'default' : 'secondary'} style={{ paddingHorizontal: 6, paddingVertical: 1 }}>
                    Current
                  </Badge>
                ) : isSelected ? (
                  <Check size={16} color={colors.primaryForeground} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Optional Status Note Input */}
        <View style={styles.inputContainer}>
          <Input
            label="Accompanying Note (Optional)"
            placeholder="e.g. Arrived at loading bay dock 2, customer signed off..."
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            testID="status-note-input"
            style={styles.multilineInput}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <Button
            variant="outline"
            size="default"
            onPress={handleClose}
            disabled={isSubmitting}
            style={styles.cancelBtn}
            testID="cancel-status-btn"
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="default"
            icon={<Send size={15} color={colors.primaryForeground} />}
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting || !selectedStatus}
            style={styles.submitBtn}
            testID="submit-status-btn"
          >
            Update Status
          </Button>
        </View>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
  },
  bodyScroll: {
    maxHeight: 500,
  },
  currentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  currentStatusLabel: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    marginBottom: 8,
  },
  statusList: {
    gap: 8,
    marginBottom: 16,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionLabel: {
    fontFamily: 'Calibri',
  },
  inputContainer: {
    marginBottom: 16,
  },
  multilineInput: {
    fontFamily: 'Calibri',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
  },
  submitBtn: {
    flex: 2,
  },
});
