/**
 * app/(tabs)/logistics/_layout.tsx
 * Logistics Tab Stack Navigator
 */

import React from 'react';
import { Stack } from 'expo-router';

export default function LogisticsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Logistics' }} />
      <Stack.Screen name="[id]" options={{ title: 'Job Details' }} />
    </Stack>
  );
}
