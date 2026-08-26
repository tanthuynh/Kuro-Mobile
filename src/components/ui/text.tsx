import React, { forwardRef } from 'react';
import {
  Text as RNText,
  StyleSheet,
  type TextProps as RNTextProps,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { useTheme } from '@/context/theme-context';

export type TextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'body'
  | 'body-sm'
  | 'caption'
  | 'label'
  | 'muted';

export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'light';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  weight?: TextWeight;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export const Text = forwardRef<RNText, TextProps>(
  ({ variant = 'body', weight, color, style, children, ...props }, ref) => {
    const { colors, typography } = useTheme();

    const getFontFamily = (): string => {
      if (weight === 'bold' || weight === 'semibold' || variant === 'h1' || variant === 'h2') {
        return typography.fontFamily.bold;
      }
      if (weight === 'light') {
        return typography.fontFamily.light;
      }
      return typography.fontFamily.regular;
    };

    const getVariantStyle = (): TextStyle => {
      switch (variant) {
        case 'h1':
          return {
            fontSize: typography.fontSize.xl,
            lineHeight: typography.lineHeight.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.foreground,
          };
        case 'h2':
          return {
            fontSize: typography.fontSize.md,
            lineHeight: typography.lineHeight.md,
            fontWeight: typography.fontWeight.bold,
            color: colors.foreground,
          };
        case 'h3':
          return {
            fontSize: typography.fontSize.base,
            lineHeight: typography.lineHeight.base,
            fontWeight: typography.fontWeight.bold,
            color: colors.foreground,
          };
        case 'h4':
          return {
            fontSize: typography.fontSize.base,
            lineHeight: typography.lineHeight.base,
            fontWeight: typography.fontWeight.semibold,
            color: colors.foreground,
          };
        case 'body-sm':
          return {
            fontSize: typography.fontSize.sm,
            lineHeight: typography.lineHeight.sm,
            color: colors.foreground,
          };
        case 'caption':
          return {
            fontSize: typography.fontSize.xs,
            lineHeight: typography.lineHeight.xs,
            color: colors.mutedForeground,
          };
        case 'label':
          return {
            fontSize: typography.fontSize.xs,
            lineHeight: typography.lineHeight.xs,
            fontWeight: typography.fontWeight.semibold,
            color: colors.foreground,
          };
        case 'muted':
          return {
            fontSize: typography.fontSize.xs,
            lineHeight: typography.lineHeight.xs,
            color: colors.mutedForeground,
          };
        case 'body':
        default:
          return {
            fontSize: typography.fontSize.base,
            lineHeight: typography.lineHeight.base,
            color: colors.foreground,
          };
      }
    };

    const variantStyle = getVariantStyle();
    const fontFamily = getFontFamily();

    return (
      <RNText
        ref={ref}
        style={[
          styles.base,
          { fontFamily },
          variantStyle,
          color ? { color } : undefined,
          style,
        ]}
        {...props}
      >
        {children}
      </RNText>
    );
  }
);

Text.displayName = 'Text';

const styles = StyleSheet.create({
  base: {
    fontFamily: 'Calibri',
  },
});
