/**
 * src/components/ui/modal-sheet.tsx
 * Standardized, accessible Bottom Modal Sheet Primitive for Kuro Mobile.
 * Provides unified backdrop overlays, corner radiuses, standard header with icon & close button,
 * and clean scrollable content wrappers.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  type ViewStyle,
  type DimensionValue,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';

export interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  icon?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: DimensionValue;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const ModalSheet: React.FC<ModalSheetProps> = ({
  visible,
  onClose,
  title,
  icon,
  headerRight,
  children,
  maxHeight = '85%',
  scrollable = true,
  contentStyle,
  style,
  testID = 'modal-sheet',
}) => {
  const { colors, typography, layout, spacing } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss modal backdrop"
          testID={`${testID}-backdrop`}
        />

        <View
          style={[
            styles.sheetContent,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: layout.borderRadius['2xl'],
              maxHeight,
              padding: spacing.lg,
            },
            style,
          ]}
        >
          {/* Header */}
          {title || icon || headerRight ? (
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {icon ? <View style={styles.headerIcon}>{icon}</View> : null}
                {title ? (
                  <Text
                    style={[
                      styles.title,
                      {
                        color: colors.foreground,
                        fontSize: typography.fontSize.lg,
                        lineHeight: typography.lineHeight.lg,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                ) : null}
              </View>

              <View style={styles.headerRightGroup}>
                {headerRight}
                <Pressable
                  onPress={onClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close modal"
                  testID={`${testID}-close-btn`}
                >
                  <X size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Body */}
          {scrollable ? (
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={[{ paddingBottom: 24 }, contentStyle]}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[{ flexShrink: 1 }, contentStyle]}>{children}</View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerIcon: {
    marginRight: 8,
  },
  title: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    flexShrink: 1,
  },
});
