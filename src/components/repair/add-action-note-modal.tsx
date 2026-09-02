/**
 * src/components/repair/add-action-note-modal.tsx
 * Technician Action Note Modal in Kuro Mobile.
 * Appends timestamped audit action logs and technician notes without page reloads.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  FileText,
  Activity,
  X,
  Send,
  User,
  Clock,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface AddActionNoteModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (content: string, type: 'action' | 'note') => Promise<void> | void;
  userName?: string;
  isSubmitting?: boolean;
  testID?: string;
}

export function AddActionNoteModal({
  visible,
  onClose,
  onSubmit,
  userName = 'Technician',
  isSubmitting = false,
  testID = 'add-action-note-modal',
}: AddActionNoteModalProps) {
  const { colors, typography, spacing, layout } = useTheme();
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState<'action' | 'note'>('action');
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setContent('');
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Please enter note or action details');
      return;
    }

    try {
      setError(null);
      await onSubmit(trimmed, entryType);
      setContent('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit action note');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      testID={testID}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={[styles.sheetContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Sheet Header */}
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleGroup}>
              {entryType === 'action' ? (
                <Activity size={18} color={colors.primary} />
              ) : (
                <FileText size={18} color={colors.primary} />
              )}
              <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
                {entryType === 'action' ? 'Log Technician Action' : 'Add Technician Note'}
              </Text>
            </View>

            <Pressable
              onPress={handleClose}
              style={[styles.closeBtn, { backgroundColor: colors.surface }]}
              testID="close-action-note-modal"
              hitSlop={8}
            >
              <X size={16} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView style={styles.bodyScroll} contentContainerStyle={{ padding: spacing.base }}>
            {/* Entry Type Toggle Tabs */}
            <View style={[styles.typeToggleContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                onPress={() => setEntryType('action')}
                style={[
                  styles.typeTab,
                  entryType === 'action' && { backgroundColor: colors.primary },
                ]}
                testID="tab-action-type"
              >
                <Activity
                  size={14}
                  color={entryType === 'action' ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.typeTabText,
                    {
                      color: entryType === 'action' ? colors.primaryForeground : colors.mutedForeground,
                      fontSize: typography.fontSize.sm,
                    },
                  ]}
                >
                  Audit Action Log
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setEntryType('note')}
                style={[
                  styles.typeTab,
                  entryType === 'note' && { backgroundColor: colors.primary },
                ]}
                testID="tab-note-type"
              >
                <FileText
                  size={14}
                  color={entryType === 'note' ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.typeTabText,
                    {
                      color: entryType === 'note' ? colors.primaryForeground : colors.mutedForeground,
                      fontSize: typography.fontSize.sm,
                    },
                  ]}
                >
                  General Note
                </Text>
              </Pressable>
            </View>

            {/* Author / Timestamp Metadata */}
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <User size={13} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                  Author: <Text style={{ color: colors.foreground, fontWeight: '600' }}>{userName}</Text>
                </Text>
              </View>

              <View style={styles.metaItem}>
                <Clock size={13} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                  Now
                </Text>
              </View>
            </View>

            {/* Input Box */}
            <View style={styles.inputContainer}>
              <TextInput
                placeholder={entryType === 'action' ? 'Action details...' : 'Add note...'}
                placeholderTextColor={colors.mutedForeground}
                value={content}
                onChangeText={(val: string) => {
                  setContent(val);
                  if (error) setError(null);
                }}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                testID="action-note-input"
                style={[
                  styles.multilineInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: error ? colors.destructive : colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
              {error ? (
                <Text style={[styles.errorText, { color: colors.destructive, fontSize: typography.fontSize.sm, marginTop: 6 }]}>
                  {error}
                </Text>
              ) : null}
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <Button
                variant="outline"
                size="default"
                onPress={handleClose}
                disabled={isSubmitting}
                style={styles.cancelBtn}
                testID="cancel-action-note-btn"
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
                testID="submit-action-note-btn"
              >
                {entryType === 'action' ? 'Log Action' : 'Add Note'}
              </Button>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    maxHeight: 400,
  },
  typeToggleContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
  },
  typeTabText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
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
  inputContainer: {
    marginBottom: 16,
  },
  multilineInput: {
    fontFamily: 'Calibri',
    fontSize: 14,
    minHeight: 100,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    textAlignVertical: 'top',
  },
  errorText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
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
