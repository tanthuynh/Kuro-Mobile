import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type GestureResponderEvent,
} from 'react-native';
import { useTheme } from '@/context/theme-context';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
export type ButtonSize = 'sm' | 'default' | 'lg' | 'icon';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children?: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'default',
  loading = false,
  loadingText,
  disabled = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  children,
  onPress,
  accessibilityLabel,
  style,
  textStyle,
  testID,
}) => {
  const { colors, layout, typography, spacing } = useTheme();
  const isDisabled = disabled || loading;

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle; spinnerColor: string } => {
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
          spinnerColor: colors.secondaryForeground,
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
          spinnerColor: colors.foreground,
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
          spinnerColor: colors.destructiveForeground,
        };
      case 'ghost':
        return {
          container: {
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            borderWidth: 0,
          },
          text: {
            color: colors.foreground,
          },
          spinnerColor: colors.foreground,
        };
      case 'primary':
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
          spinnerColor: colors.primaryForeground,
        };
    }
  };

  const getSizeStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (size) {
      case 'sm':
        return {
          container: {
            minHeight: layout.minTouchTarget,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
          text: {
            fontSize: typography.fontSize.sm,
            lineHeight: typography.lineHeight.sm,
          },
        };
      case 'lg':
        return {
          container: {
            minHeight: 52,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
          },
          text: {
            fontSize: typography.fontSize.md,
            lineHeight: typography.lineHeight.md,
          },
        };
      case 'icon':
        return {
          container: {
            minHeight: layout.minTouchTarget,
            minWidth: layout.minTouchTarget,
            paddingHorizontal: 0,
            paddingVertical: 0,
            justifyContent: 'center',
            alignItems: 'center',
          },
          text: {
            fontSize: typography.fontSize.base,
          },
        };
      case 'default':
      default:
        return {
          container: {
            minHeight: layout.minTouchTarget,
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.md,
          },
          text: {
            fontSize: typography.fontSize.base,
            lineHeight: typography.lineHeight.base,
          },
        };
    }
  };

  const variantStyle = getVariantStyles();
  const sizeStyle = getSizeStyles();

  return (
    <Pressable
      testID={testID}
      disabled={isDisabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.baseContainer,
        {
          borderRadius: layout.borderRadius.lg,
          width: fullWidth ? '100%' : undefined,
        },
        variantStyle.container,
        sizeStyle.container,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.contentRow}>
          <ActivityIndicator size="small" color={variantStyle.spinnerColor} style={styles.spinner} />
          {loadingText ? (
            <Text style={[styles.baseText, variantStyle.text, sizeStyle.text, textStyle]}>
              {loadingText}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.contentRow}>
          {icon && iconPosition === 'left' ? <View style={styles.leftIcon}>{icon}</View> : null}
          {typeof children === 'string' ? (
            <Text style={[styles.baseText, variantStyle.text, sizeStyle.text, textStyle]}>
              {children}
            </Text>
          ) : (
            children
          )}
          {icon && iconPosition === 'right' ? <View style={styles.rightIcon}>{icon}</View> : null}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
  spinner: {
    marginRight: 8,
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
});
