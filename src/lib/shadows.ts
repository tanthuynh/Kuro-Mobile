import { Platform, ViewStyle } from 'react-native';

interface ShadowProps {
  color?: string;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  radius?: number;
  elevation?: number;
}

/**
 * Cross-platform shadow helper.
 * Uses `boxShadow` on Web to eliminate React Native Web's "shadow* style props are deprecated" warning,
 * and standard iOS `shadow*` + Android `elevation` on native platforms and Jest testing environment.
 */
export function platformShadow({
  color = '#000000',
  offsetX = 0,
  offsetY = 2,
  opacity = 0.1,
  radius = 4,
  elevation = 2,
}: ShadowProps = {}): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px rgba(0, 0, 0, ${opacity})`,
    } as ViewStyle;
  }
  return {
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}
