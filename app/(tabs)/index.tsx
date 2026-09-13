/**
 * app/(tabs)/index.tsx
 * Root Tab Redirect to Events Tab Stack
 */

import React from 'react';
import { Redirect } from 'expo-router';

export default function TabIndexRedirect() {
  return <Redirect href={'/(tabs)/events' as any} />;
}
