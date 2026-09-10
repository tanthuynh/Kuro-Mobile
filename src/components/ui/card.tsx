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
import { platformShadow } from '@/lib/shadows';

export interface CardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Card: React.FC<CardProps> = ({ children, style, testID }) => {
  const { colors, layout } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: layout.borderRadius.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export interface CardHeaderProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, style }) => {
  const { spacing } = useTheme();
  return <View style={[styles.header, { padding: spacing.base }, style]}>{children}</View>;
};

export interface CardTitleProps {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
}

export const CardTitle: React.FC<CardTitleProps> = ({ children, style }) => {
  const { colors, typography } = useTheme();
  return (
    <Text
      style={[
        styles.title,
        {
          color: colors.cardForeground,
          fontSize: typography.fontSize.lg,
          lineHeight: typography.lineHeight.lg,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
};

export interface CardDescriptionProps {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
}

export const CardDescription: React.FC<CardDescriptionProps> = ({ children, style }) => {
  const { colors, typography } = useTheme();
  return (
    <Text
      style={[
        styles.description,
        {
          color: colors.mutedForeground,
          fontSize: typography.fontSize.sm,
          lineHeight: typography.lineHeight.sm,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
};

export interface CardContentProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const CardContent: React.FC<CardContentProps> = ({ children, style }) => {
  const { spacing } = useTheme();
  return <View style={[styles.content, { paddingHorizontal: spacing.base, paddingBottom: spacing.base }, style]}>{children}</View>;
};

export interface CardFooterProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, style }) => {
  const { spacing, colors } = useTheme();
  return (
    <View
      style={[
        styles.footer,
        {
          padding: spacing.base,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    ...platformShadow({
      color: '#000000',
      offsetY: 2,
      opacity: 0.05,
      radius: 4,
      elevation: 2,
    }),
    marginVertical: 6,
  },
  header: {
    flexDirection: 'column',
    gap: 4,
  },
  title: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  description: {
    fontFamily: 'Calibri',
    fontWeight: '400',
  },
  content: {},
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});
