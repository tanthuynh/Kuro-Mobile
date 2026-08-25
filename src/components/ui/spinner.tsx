import React from 'react';
import {
  ActivityIndicator,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/context/theme-context';

export interface SpinnerProps {
  size?: 'small' | 'large' | number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'small',
  color,
  style,
  accessibilityLabel = 'Loading...',
  testID,
}) => {
  const { colors } = useTheme();
  const indicatorColor = color || colors.primary;

  return (
    <View
      testID={testID}
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      <ActivityIndicator size={size as any} color={indicatorColor} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
});
