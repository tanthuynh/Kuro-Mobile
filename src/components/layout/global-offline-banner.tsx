/**
 * src/components/layout/global-offline-banner.tsx
 * Unobtrusive Global "Offline Mode" Warning Banner for Kuro Mobile.
 *
 * Mounts at the root application shell above screens to notify users
 * of connection loss. Respects device safe area insets to prevent
 * camera notch / Dynamic Island collisions, and uses warm amber styling
 * to indicate queued offline operations without alarming the user.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { useNetworkStatus } from '@/context/network-context';
import { useTheme } from '@/context/theme-context';

export interface GlobalOfflineBannerProps {
  testID?: string;
}

export function GlobalOfflineBanner({
  testID = 'global-offline-banner',
}: GlobalOfflineBannerProps) {
  const { isOnline } = useNetworkStatus();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const opacityAnim = useRef(new Animated.Value(isOnline ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(opacityAnim, {
      toValue: isOnline ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isOnline, opacityAnim]);

  if (isOnline) {
    return null;
  }

  const topPadding = Math.max(insets.top, 0);

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Offline Mode. Network connection lost. Changes will sync when reconnected."
      style={[
        styles.banner,
        {
          paddingTop: topPadding + 4,
          backgroundColor: isDark ? '#78350F' : '#FEF3C7',
          borderBottomColor: '#F59E0B',
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={styles.contentRow}>
        <WifiOff size={15} color="#F59E0B" style={styles.icon} />
        <Text
          style={[
            styles.text,
            { color: isDark ? '#FEF3C7' : '#78350F' },
          ]}
          numberOfLines={1}
        >
          Offline Mode — Changes will sync when reconnected
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    paddingBottom: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    marginRight: 2,
  },
  text: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
});
