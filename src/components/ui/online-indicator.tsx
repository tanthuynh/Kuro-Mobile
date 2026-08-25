import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/context/theme-context';

export type ConnectionStatus = 'online' | 'offline' | 'degraded';

export interface OnlineIndicatorProps {
  status?: ConnectionStatus;
  showLabel?: boolean;
  label?: string;
  size?: number;
  pulse?: boolean;
  latencyMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const OnlineIndicator: React.FC<OnlineIndicatorProps> = ({
  status = 'online',
  showLabel = false,
  label,
  size = 10,
  pulse = true,
  latencyMs,
  style,
  testID,
}) => {
  const { colors, typography, spacing } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (pulse && status === 'online') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.6,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pulse, status, pulseAnim]);

  const getStatusColor = (): string => {
    switch (status) {
      case 'offline':
        return colors.status.offline;
      case 'degraded':
        return colors.status.degraded;
      case 'online':
      default:
        return colors.status.online;
    }
  };

  const getDisplayLabel = (): string => {
    if (label) return label;
    if (latencyMs !== undefined) return `${latencyMs}ms`;
    switch (status) {
      case 'offline':
        return 'Offline';
      case 'degraded':
        return 'Degraded';
      case 'online':
      default:
        return 'Online';
    }
  };

  const statusColor = getStatusColor();

  return (
    <View testID={testID} style={[styles.container, style]}>
      <View style={[styles.dotWrapper, { width: size * 2, height: size * 2 }]}>
        {pulse && status === 'online' ? (
          <Animated.View
            style={[
              styles.pulseRing,
              {
                width: size * 1.8,
                height: size * 1.8,
                borderRadius: (size * 1.8) / 2,
                backgroundColor: statusColor,
                transform: [{ scale: pulseAnim }],
                opacity: 0.35,
              },
            ]}
          />
        ) : null}
        <View
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: statusColor,
            },
          ]}
        />
      </View>

      {showLabel ? (
        <Text
          style={[
            styles.label,
            {
              color: colors.mutedForeground,
              fontSize: typography.fontSize.xs,
              marginLeft: spacing.xs,
            },
          ]}
        >
          {getDisplayLabel()}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
  },
  dot: {},
  label: {
    fontWeight: '500',
  },
});
