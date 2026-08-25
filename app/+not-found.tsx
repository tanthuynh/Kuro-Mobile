/**
 * app/+not-found.tsx
 * Fallback screen for unhandled routes
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { AlertCircle } from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';

export default function NotFoundScreen() {
  const { colors, typography, spacing } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Page Not Found', headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.brandGreenScale.green2 }]}>
          <AlertCircle size={48} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground, fontSize: typography.fontSize['2xl'] }]}>
          Screen Not Found
        </Text>
        <Text style={[styles.message, { color: colors.mutedForeground, fontSize: typography.fontSize.base, marginVertical: spacing.md }]}>
          The screen you are looking for does not exist or has been moved.
        </Text>
        <Link href="/(tabs)" asChild>
          <Button variant="primary" size="default" fullWidth>
            Return to Today's Jobs
          </Button>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
  },
});
