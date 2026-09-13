/**
 * app/(tabs)/repairs/_layout.tsx
 * Repairs Tab Stack Navigator
 */

import React from 'react';
import { Stack } from 'expo-router';

export default function RepairsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Repairs' }} />
      <Stack.Screen name="new" options={{ title: 'Report Fault' }} />
      <Stack.Screen name="[id]" options={{ title: 'Repair Detail' }} />
    </Stack>
  );
}
