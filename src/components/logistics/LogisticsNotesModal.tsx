/**
 * src/components/logistics/LogisticsNotesModal.tsx
 * Driver Internal Notes Modal in Kuro Mobile.
 * Enables drivers to append internal timestamped notes to a logistics job.
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
  TextInput,
} from 'react-native';
import {
  FileText,
  X,
  Send,
  User,
  Clock,
  AlertTriangle,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ModalSheet } from '@/components/ui/modal-sheet';

export interface LogisticsNotesModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void> | void;
  authorName?: string;
  isSubmitting?: boolean;
  testID?: string;
}

export function LogisticsNotesModal({
  visible,
  onClose,
  onSubmit,
  authorName = 'Driver',
  isSubmitting = false,
  testID = 'logistics-notes-modal',
}: LogisticsNotesModalProps) {
  const { colors, typography, spacing } = useTheme();
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setContent('');
      setError(null);
    }
  }, [visible]);

  const handleClose = () => {
    setContent('');
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Please enter note content');
      return;
    }

    try {
      setError(null);
      await onSubmit(trimmed);
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to append note');
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={handleClose}
      title="Add Internal Note"
      icon={<FileText size={18} color={colors.primary} />}
      testID={testID}
    >
      <View>
        {/* Author and Time Metadata Row */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <User size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              Author: <Text style={{ color: colors.foreground, fontWeight: '600' }}>{authorName}</Text>
            </Text>
          </View>

          <View style={styles.metaItem}>
            <Clock size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              Now
            </Text>
          </View>
        </View>

        {/* Error Banner */}
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: colors.destructive }]}>
            <AlertTriangle size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive, fontSize: typography.fontSize.sm }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Multiline Note Input */}
        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
            Note Content
          </Text>
          <TextInput
            placeholder="Type your internal note..."
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={(val) => {
              setContent(val);
              if (error) setError(null);
            }}
            multiline
            numberOfLines={4}
            testID="logistics-note-input"
            style={[
              styles.multilineInput,
              {
                color: colors.foreground,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                fontSize: typography.fontSize.base,
              }
            ]}
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
            testID="cancel-notes-btn"
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="default"
            icon={<Send size={15} color={colors.primaryForeground} />}
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting || !content.trim()}
            style={styles.submitBtn}
            testID="submit-notes-btn"
          >
            Save Note
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
    ...StyleSheet.absoluteFill,
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
    maxHeight: 450,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontFamily: 'Calibri',
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
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: 'Calibri',
    fontWeight: '500',
    marginBottom: 6,
  },
  multilineInput: {
    fontFamily: 'Calibri',
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
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
