/**
 * app/(auth)/_layout.tsx
 * Auth Stack Navigator Layout (Unauthenticated Flow)
 */

import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/context/theme-context';

export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen
        name="login"
        options={{
          title: 'Sign In',
          headerShown: false,
        }}
      />
    </Stack>
  );
}
