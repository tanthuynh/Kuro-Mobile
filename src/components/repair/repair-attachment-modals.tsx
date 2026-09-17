import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Image } from 'react-native';
import { Camera, FileText, X, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';
import type { ThemeColors, typography } from '@/constants/theme';

export type ThemeTypography = typeof typography;

export interface RepairAttachmentModalsProps {
  visible: boolean;
  onClose: () => void;
  onUploadPhoto: () => void | Promise<void>;
  onAddAttachment: (type: 'PDF' | 'Document') => void | Promise<void>;
  isSubmitting?: boolean;

  viewingPhoto?: { id?: string; url: string; fileName?: string } | null;
  onClosePhoto?: () => void;
  onDeletePhoto?: (photo: any) => void;

  colors?: ThemeColors;
  typography?: ThemeTypography;
}

export const RepairAttachmentModals: React.FC<RepairAttachmentModalsProps> = ({
  visible,
  onClose,
  onUploadPhoto,
  onAddAttachment,
  isSubmitting = false,
  viewingPhoto,
  onClosePhoto,
  onDeletePhoto,
  colors: propColors,
  typography: propTypography,
}) => {
  const theme = useTheme();
  const colors = propColors || theme.colors;
  const typography = propTypography || theme.typography;

  return (
    <>
      {/* 1. Add Attachment Action Sheet Modal */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        testID="add-attachment-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={onClose} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
                Add Image or Document
              </Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <View style={{ gap: 10 }}>
                <Button
                  variant="outline"
                  size="default"
                  icon={<Camera size={16} color={colors.primary} />}
                  onPress={onUploadPhoto}
                  loading={isSubmitting}
                  testID="add-photo-evidence-btn"
                >
                  Take / Attach Camera Photo
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  icon={<FileText size={16} color={colors.primary} />}
                  onPress={() => onAddAttachment('PDF')}
                  loading={isSubmitting}
                  testID="add-doc-evidence-btn"
                >
                  Attach Service PDF / Manual
                </Button>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Photo Lightbox Modal */}
      <Modal
        visible={!!viewingPhoto}
        transparent
        animationType="fade"
        onRequestClose={onClosePhoto || (() => {})}
        testID="photo-lightbox-modal"
      >
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxBackdrop} onPress={onClosePhoto} />
          <View style={styles.lightboxHeader}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
              {viewingPhoto?.fileName || 'Image'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {onDeletePhoto && viewingPhoto ? (
                <Pressable
                  onPress={() => onDeletePhoto(viewingPhoto)}
                  testID="lightbox-delete-btn"
                  hitSlop={8}
                >
                  <Trash2 size={20} color="#EF4444" />
                </Pressable>
              ) : null}
              <Pressable onPress={onClosePhoto} hitSlop={8}>
                <X size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          {viewingPhoto?.url ? (
            <View style={styles.lightboxContent}>
              <Image source={{ uri: viewingPhoto.url }} style={styles.lightboxImage} resizeMode="contain" />
            </View>
          ) : null}
        </View>
      </Modal>
    </>
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
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'space-between',
  },
  lightboxBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10,
  },
  lightboxContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
});
