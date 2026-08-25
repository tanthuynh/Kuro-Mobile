import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/context/theme-context';
import { WifiOff, AlertTriangle, RefreshCw } from 'lucide-react-native';
import type { ConnectionStatus } from '@/components/ui/online-indicator';

export interface ConnectionStatusBarProps {
  status: ConnectionStatus;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const ConnectionStatusBar: React.FC<ConnectionStatusBarProps> = ({
  status,
  message,
  onRetry,
  isRetrying = false,
  style,
  testID,
}) => {
  const { colors, typography, spacing } = useTheme();

  if (status === 'online') {
    return null;
  }

  const isOffline = status === 'offline';
  const bgColor = isOffline ? colors.destructive : colors.status.degraded;
  const textColor = '#FFFFFF';
  const defaultMessage = isOffline
    ? 'No internet connection. Some actions may be queued.'
    : 'Degraded connection. Retrying sync with Kuro server...';

  return (
    <View
      testID={testID}
      style={[
        styles.banner,
        {
          backgroundColor: bgColor,
          paddingHorizontal: spacing.base,
          paddingVertical: spacing.sm,
        },
        style,
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {isOffline ? (
            <WifiOff size={18} color={textColor} />
          ) : (
            <AlertTriangle size={18} color={textColor} />
          )}
        </View>
        <Text
          numberOfLines={2}
          style={[
            styles.messageText,
            {
              color: textColor,
              fontSize: typography.fontSize.xs,
              lineHeight: typography.lineHeight.xs,
            },
          ]}
        >
          {message || defaultMessage}
        </Text>
      </View>

      {onRetry ? (
        <Pressable
          disabled={isRetrying}
          onPress={onRetry}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry network connection"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <RefreshCw size={14} color={textColor} />
          <Text style={[styles.retryText, { color: textColor, fontSize: typography.fontSize.xs }]}>
            {isRetrying ? 'Retrying...' : 'Retry'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  iconContainer: {
    marginRight: 8,
  },
  messageText: {
    fontWeight: '500',
    flex: 1,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 4,
    minHeight: 32,
  },
  retryText: {
    fontWeight: '600',
  },
});
