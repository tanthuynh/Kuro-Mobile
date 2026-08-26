/**
 * src/components/ui/empty-state.tsx
 * Standardized, accessible Empty / Zero-State Component for Kuro Mobile.
 * Provides unified visual framing, hero icon presentation, heading/subtitle typography,
 * and optional action / reset buttons across all tab feeds and detail screens.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/context/theme-context';
import { Button, type ButtonVariant } from '@/components/ui/button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: ButtonVariant;
  actionIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  actionTestID?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = 'outline',
  actionIcon,
  style,
  testID,
  actionTestID,
}) => {
  const { colors, typography, layout, spacing } = useTheme();

  return (
    <View
      testID={testID || 'empty-state-container'}
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: layout.borderRadius.xl,
          padding: spacing.xl,
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${description || ''}`}
    >
      {icon ? <View style={styles.iconWrapper}>{icon}</View> : null}

      <Text
        style={[
          styles.title,
          {
            color: colors.foreground,
            fontSize: typography.fontSize.md,
            lineHeight: typography.lineHeight.md,
          },
        ]}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={[
            styles.description,
            {
              color: colors.mutedForeground,
              fontSize: typography.fontSize.xs,
              lineHeight: 16,
              marginVertical: spacing.xs,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          variant={actionVariant}
          size="sm"
          icon={actionIcon}
          onPress={onAction}
          style={[styles.actionButton, { marginTop: spacing.sm }]}
          testID={actionTestID || (testID ? `${testID}-action-btn` : 'empty-state-action-btn')}
        >
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    width: '100%',
  },
  iconWrapper: {
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
  actionButton: {
    minWidth: 120,
  },
});
