/**
 * app/pullsheet/[id].tsx
 * Route Aliasing & Seamless Redirection to Unified Event Details (/events/[id]).
 * Ensures any direct link or deep link to /pullsheet/[id] seamlessly routes to /events/[id].
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/theme-context';

export default function PullSheetRedirectScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const router = useRouter();
  const { colors } = useTheme();

  const eventId = Array.isArray(id) ? id[0] : id || '';

  useEffect(() => {
    try {
      if (typeof router.replace === 'function') {
        if (eventId) {
          router.replace(`/events/${eventId}` as any);
        } else {
          router.replace('/(tabs)' as any);
        }
      } else if (typeof router.push === 'function') {
        if (eventId) {
          router.push(`/events/${eventId}` as any);
        } else {
          router.push('/(tabs)' as any);
        }
      }
    } catch (err) {
      console.warn('[PullSheetRedirectScreen] Navigation redirect error:', err);
    }
  }, [eventId, router]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      testID="pullsheet-redirect-screen"
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
