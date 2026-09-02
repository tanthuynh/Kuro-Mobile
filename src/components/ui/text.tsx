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
  | 'subheading'
  | 'body'
  | 'body-sm'
  | 'caption'
  | 'label'
  | 'overline'
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
            fontSize: typography.fontSize['2xl'],
            lineHeight: typography.lineHeight['2xl'],
            fontWeight: typography.fontWeight.bold,
            color: colors.foreground,
          };
        case 'h2': // standard headings (e.g. sectionTitle)
          return {
            fontSize: typography.fontSize.lg, // 18
            lineHeight: typography.lineHeight.lg, // 24
            fontWeight: typography.fontWeight.bold,
            color: colors.foreground,
          };
        case 'h3': // e.g. modalTitle
          return {
            fontSize: typography.fontSize.md, // 16
            lineHeight: typography.lineHeight.md, // 22
            fontWeight: typography.fontWeight.bold,
            color: colors.foreground,
          };
        case 'h4':
          return {
            fontSize: typography.fontSize.base, // 14
            lineHeight: typography.lineHeight.base, // 20
            fontWeight: typography.fontWeight.semibold,
            color: colors.foreground,
          };
        case 'subheading': // e.g. sectionSubtitle
          return {
            fontSize: typography.fontSize.base, // 14
            lineHeight: typography.lineHeight.base, // 20
            fontWeight: typography.fontWeight.semibold,
            color: colors.foreground,
          };
        case 'body': // standard normal text (e.g. fieldValue)
          return {
            fontSize: typography.fontSize.base, // 14
            lineHeight: typography.lineHeight.base, // 20
            color: colors.foreground,
          };
        case 'body-sm':
          return {
            fontSize: typography.fontSize.sm, // 13
            lineHeight: typography.lineHeight.sm, // 18
            color: colors.foreground,
          };
        case 'caption':
          return {
            fontSize: typography.fontSize.sm, // 13
            lineHeight: typography.lineHeight.sm, // 18
            color: colors.mutedForeground,
          };
        case 'label': // standard field labels (e.g. fieldLabel)
          return {
            fontSize: typography.fontSize.sm, // 13
            lineHeight: typography.lineHeight.sm, // 18
            fontWeight: typography.fontWeight.semibold,
            letterSpacing: 0.2,
            textTransform: 'uppercase',
            color: colors.mutedForeground,
          };
        case 'overline': // e.g. sectionHeaderLabel
          return {
            fontSize: typography.fontSize.xs, // 12
            lineHeight: typography.lineHeight.xs, // 16
            fontWeight: typography.fontWeight.bold,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: colors.mutedForeground,
          };
        case 'muted':
          return {
            fontSize: typography.fontSize.sm, // 13
            lineHeight: typography.lineHeight.sm, // 18
            color: colors.mutedForeground,
          };
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
