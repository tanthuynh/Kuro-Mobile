import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Linking } from 'react-native';
import { FileText, X, ExternalLink, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/date-utils';
import type { RepairAttachment } from '@/types/repair';
import type { ThemeColors, typography } from '@/constants/theme';

export type ThemeTypography = typeof typography;

export interface RepairDocumentViewerModalProps {
  visible: boolean;
  docUrl?: string | null;
  document?: RepairAttachment | null;
  fileName?: string;
  fileType?: string;
  uploadedAt?: string | number | Date;
  onClose: () => void;
  onOpenDocument?: (url: string) => void | Promise<void>;
  onDelete?: (document: RepairAttachment) => void | Promise<void>;
  colors?: ThemeColors;
  typography?: ThemeTypography;
  testID?: string;
}

export const RepairDocumentViewerModal: React.FC<RepairDocumentViewerModalProps> = ({
  visible,
  docUrl,
  document,
  fileName: propFileName,
  fileType: propFileType,
  uploadedAt: propUploadedAt,
  onClose,
  onOpenDocument,
  onDelete,
  colors: propColors,
  typography: propTypography,
  testID = 'doc-viewer-modal',
}) => {
  const theme = useTheme();
  const colors = propColors || theme.colors;
  const typography = propTypography || theme.typography;

  const resolvedUrl = docUrl || document?.url || '';
  const resolvedFileName = propFileName || document?.fileName || 'Document';
  const resolvedType = propFileType || document?.type || 'PDF Document';
  const resolvedUploadedAt = propUploadedAt || document?.uploadedAt;

  const handleOpenDoc = async () => {
    if (!resolvedUrl) return;
    if (onOpenDocument) {
      await onOpenDocument(resolvedUrl);
      return;
    }
    try {
      await Linking.openURL(resolvedUrl);
    } catch (err) {
      console.warn('[DocViewer] openURL error:', err);
    }
  };

  const handleDelete = () => {
    if (document && onDelete) {
      onDelete(document);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]} numberOfLines={1}>
              {resolvedFileName}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} testID="viewer-close-doc-btn">
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <View style={[styles.docPreviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <FileText size={32} color={colors.primary} style={{ marginBottom: 8 }} />
              <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.fontSize.base, textAlign: 'center' }}>
                {resolvedFileName}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: typography.fontSize.sm, marginTop: 4 }}>
                {resolvedType} • {resolvedUploadedAt ? formatDate(resolvedUploadedAt) : 'Attached'}
              </Text>
              {resolvedUrl ? (
                <Text style={{ color: colors.mutedForeground, fontSize: typography.fontSize.xs, marginTop: 6, textAlign: 'center' }} numberOfLines={1}>
                  {resolvedUrl}
                </Text>
              ) : null}
            </View>

            <View style={styles.modalFooterRow}>
              <Button
                variant="primary"
                size="default"
                icon={<ExternalLink size={15} color={colors.primaryForeground} />}
                onPress={handleOpenDoc}
                style={{ flex: 2 }}
                testID="open-document-btn"
              >
                View / Open Document
              </Button>
              {onDelete && document ? (
                <Button
                  variant="destructive"
                  size="default"
                  icon={<Trash2 size={15} color="#FFFFFF" />}
                  onPress={handleDelete}
                  testID="viewer-delete-doc-btn"
                >
                  Delete
                </Button>
              ) : null}
              <Button variant="outline" size="default" onPress={onClose} style={{ flex: 1 }}>
                Close
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  modalBody: {
    gap: 12,
  },
  docPreviewCard: {
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
});
