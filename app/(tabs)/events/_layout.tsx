/**
 * app/(tabs)/events/_layout.tsx
 * Events Tab Stack Navigator
 */

import React from 'react';
import { Stack } from 'expo-router';

export default function EventsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Events' }} />
      <Stack.Screen name="[id]" options={{ title: 'Event Details' }} />
    </Stack>
  );
}
