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
  children?: React.ReactNode;
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

  const mergedTextStyle: StyleProp<TextStyle> = [
    styles.badgeText,
    {
      fontSize: typography.fontSize.sm,
      lineHeight: typography.lineHeight.sm,
    },
    variantStyle.text,
    textStyle,
  ];

  return (
    <View
      testID={testID}
      style={[
        styles.badge,
        {
          minHeight: layout.badgeHeight || 26,
          borderRadius: layout.borderRadius.full,
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
        },
        variantStyle.container,
        style,
      ]}
    >
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      {renderBadgeContent(children, mergedTextStyle)}
    </View>
  );
};

function isPrimitiveText(node: React.ReactNode): boolean {
  return typeof node === 'string' || typeof node === 'number';
}

function isPrimitiveOrEmpty(node: React.ReactNode): boolean {
  if (node == null || typeof node === 'boolean') {
    return true;
  }
  if (isPrimitiveText(node)) {
    return true;
  }
  if (Array.isArray(node)) {
    return node.every(isPrimitiveOrEmpty);
  }
  return false;
}

function hasAnyTextContent(node: React.ReactNode): boolean {
  if (isPrimitiveText(node)) {
    return true;
  }
  if (Array.isArray(node)) {
    return node.some(hasAnyTextContent);
  }
  return false;
}

function renderBadgeContent(
  children: React.ReactNode,
  textStyle: StyleProp<TextStyle>
): React.ReactNode {
  if (children == null || typeof children === 'boolean') {
    return null;
  }

  if (isPrimitiveText(children)) {
    return <Text style={textStyle}>{children}</Text>;
  }

  if (Array.isArray(children)) {
    if (isPrimitiveOrEmpty(children)) {
      if (!hasAnyTextContent(children)) {
        return null;
      }
      return <Text style={textStyle}>{children}</Text>;
    }

    // Mixed array of React elements and text primitives:
    // Group consecutive primitives into <Text> blocks while preserving custom React elements
    const result: React.ReactNode[] = [];
    let textBuffer: React.ReactNode[] = [];

    const flushText = () => {
      if (textBuffer.length > 0) {
        result.push(
          <Text key={`badge-text-${result.length}`} style={textStyle}>
            {textBuffer.length === 1 ? textBuffer[0] : [...textBuffer]}
          </Text>
        );
        textBuffer = [];
      }
    };

    const processNodes = (nodes: React.ReactNode[]) => {
      nodes.forEach((node) => {
        if (node == null || typeof node === 'boolean') {
          return;
        }
        if (isPrimitiveText(node)) {
          textBuffer.push(node);
        } else if (Array.isArray(node)) {
          if (isPrimitiveOrEmpty(node)) {
            textBuffer.push(node);
          } else {
            flushText();
            processNodes(node);
          }
        } else {
          flushText();
          const elementKey =
            React.isValidElement(node) && node.key != null
              ? node.key
              : `badge-el-${result.length}`;
          result.push(
            React.isValidElement(node)
              ? React.cloneElement(node, { key: elementKey })
              : node
          );
        }
      });
    };

    processNodes(children);
    flushText();
    return result;
  }

  if (React.isValidElement(children)) {
    return children;
  }

  return children;
}

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
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
});
