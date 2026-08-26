/**
 * src/components/repair/repair-photo-gallery.tsx
 * Repair Damage Evidence Photo Gallery & Full-Screen Lightbox Modal.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Platform,
} from 'react-native';
import {
  Camera,
  Image as ImageIcon,
  X,
  Trash2,
  Maximize2,
  ZoomIn,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';
import type { RepairAttachment } from '@/types/repair';

export interface RepairPhotoGalleryProps {
  photos: Array<RepairAttachment | { id: string; url: string; uri?: string; fileName?: string }>;
  editable?: boolean;
  onAddPhoto?: () => void;
  onRemovePhoto?: (id: string) => void;
  title?: string;
  testID?: string;
}

export function RepairPhotoGallery({
  photos = [],
  editable = false,
  onAddPhoto,
  onRemovePhoto,
  title = 'Damage Photos & Evidence',
  testID = 'repair-photo-gallery',
}: RepairPhotoGalleryProps) {
  const { colors, typography, spacing, layout } = useTheme();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const getPhotoUri = (photo: any): string => {
    return photo.uri || photo.url || '';
  };

  return (
    <View style={styles.container} testID={testID}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithCount}>
          <ImageIcon size={16} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
            {title}
          </Text>
          <View style={[styles.countBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              {photos.length}
            </Text>
          </View>
        </View>

        {editable && onAddPhoto ? (
          <Button
            variant="outline"
            size="sm"
            icon={<Camera size={14} color={colors.primary} />}
            onPress={onAddPhoto}
            testID="gallery-add-photo-btn"
          >
            Add Photo
          </Button>
        ) : null}
      </View>

      {/* Thumbnails List */}
      {photos.length === 0 ? (
        <View style={[styles.emptyContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Camera size={28} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
            {editable ? 'No damage photos attached. Tap "Add Photo" to capture evidence.' : 'No photos attached to this ticket.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnailsScroll}
        >
          {photos.map((item, index) => {
            const uri = getPhotoUri(item);
            return (
              <View key={item.id || `photo-${index}`} style={styles.thumbnailWrapper}>
                <Pressable
                  onPress={() => setSelectedPhoto(uri)}
                  style={[styles.thumbnailPressable, { borderColor: colors.border }]}
                  testID={`photo-thumb-${index}`}
                >
                  <Image
                    source={{ uri }}
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                  />
                  <View style={styles.zoomOverlay}>
                    <ZoomIn size={14} color="#FFFFFF" />
                  </View>
                </Pressable>

                {editable && onRemovePhoto ? (
                  <Pressable
                    style={[styles.removeBadge, { backgroundColor: colors.destructive }]}
                    onPress={() => onRemovePhoto(item.id)}
                    testID={`photo-remove-${index}`}
                    hitSlop={8}
                  >
                    <X size={12} color="#FFFFFF" />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Full-Screen Lightbox Modal */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.lightboxOverlay}>
          <Pressable
            style={styles.lightboxBackdrop}
            onPress={() => setSelectedPhoto(null)}
          />

          <View style={styles.lightboxHeader}>
            <Text style={[styles.lightboxTitle, { color: '#FFFFFF', fontSize: typography.fontSize.sm }]}>
              Damage Photo Preview
            </Text>
            <Pressable
              style={styles.lightboxCloseBtn}
              onPress={() => setSelectedPhoto(null)}
              testID="lightbox-close-btn"
              hitSlop={12}
            >
              <X size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {selectedPhoto ? (
            <View style={styles.lightboxContent}>
              <Image
                source={{ uri: selectedPhoto }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleWithCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  emptyContainer: {
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
  thumbnailsScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  thumbnailWrapper: {
    position: 'relative',
  },
  thumbnailPressable: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  zoomOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 3,
    borderRadius: 4,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  lightboxHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  lightboxTitle: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  lightboxCloseBtn: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  lightboxContent: {
    width: '90%',
    height: '75%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
});
