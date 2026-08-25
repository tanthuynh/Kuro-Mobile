import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '@/context/theme-context';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'info'
  | 'brand';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  icon,
  style,
  textStyle,
  testID,
}) => {
  const { colors, typography, layout, spacing } = useTheme();

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (variant) {
      case 'secondary':
        return {
          container: {
            backgroundColor: colors.secondary,
            borderColor: 'transparent',
            borderWidth: 0,
          },
          text: {
            color: colors.secondaryForeground,
          },
        };
      case 'destructive':
        return {
          container: {
            backgroundColor: colors.destructive,
            borderColor: 'transparent',
            borderWidth: 0,
          },
          text: {
            color: colors.destructiveForeground,
          },
        };
      case 'outline':
        return {
          container: {
            backgroundColor: 'transparent',
            borderColor: colors.border,
            borderWidth: 1,
          },
          text: {
            color: colors.foreground,
          },
        };
      case 'success':
        return {
          container: {
            backgroundColor: 'rgba(22, 163, 74, 0.15)',
            borderColor: 'rgba(22, 163, 74, 0.3)',
            borderWidth: 1,
          },
          text: {
            color: colors.status.online,
          },
        };
      case 'warning':
        return {
          container: {
            backgroundColor: 'rgba(234, 179, 8, 0.15)',
            borderColor: 'rgba(234, 179, 8, 0.3)',
            borderWidth: 1,
          },
          text: {
            color: colors.status.degraded,
          },
        };
      case 'info':
        return {
          container: {
            backgroundColor: 'rgba(96, 165, 250, 0.15)',
            borderColor: 'rgba(96, 165, 250, 0.3)',
            borderWidth: 1,
          },
          text: {
            color: colors.status.events,
          },
        };
      case 'brand':
        return {
          container: {
            backgroundColor: colors.brandGreenScale.green2,
            borderColor: colors.brandGreenScale.green4,
            borderWidth: 1,
          },
          text: {
            color: colors.primary,
          },
        };
      case 'default':
      default:
        return {
          container: {
            backgroundColor: colors.primary,
            borderColor: 'transparent',
            borderWidth: 0,
          },
          text: {
            color: colors.primaryForeground,
          },
        };
    }
  };

  const variantStyle = getVariantStyles();

  return (
    <View
      testID={testID}
      style={[
        styles.badge,
        {
          borderRadius: layout.borderRadius.full,
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: spacing.xs - 1,
        },
        variantStyle.container,
        style,
      ]}
    >
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      {typeof children === 'string' ? (
        <Text
          style={[
            styles.badgeText,
            {
              fontSize: typography.fontSize.xs,
              lineHeight: typography.lineHeight.xs,
            },
            variantStyle.text,
            textStyle,
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  iconContainer: {
    marginRight: 4,
  },
  badgeText: {
    fontWeight: '600',
  },
});
