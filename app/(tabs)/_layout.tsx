/**
 * app/(tabs)/_layout.tsx
 * Authenticated Bottom Tab Navigation Shell
 */

import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, QrCode, Package, User, Wrench, Truck } from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { platformShadow } from '@/lib/shadows';

export default function TabsLayout() {
  const { colors, typography, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const tabBarHeight = layout.tabBarHeight + (Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 8));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 8),
          ...platformShadow({
            color: '#000000',
            offsetY: -2,
            opacity: 0.08,
            radius: 4,
            elevation: 8,
          }),
        },
        tabBarLabelStyle: {
          fontFamily: 'Calibri',
          fontSize: typography.fontSize.xs,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarItemStyle: {
          minHeight: layout.minTouchTarget,
          justifyContent: 'center',
          alignItems: 'center',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Events',
          tabBarLabel: 'Events',
          tabBarIcon: ({ color, focused, size }) => (
            <CalendarDays
              size={size || 22}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="logistics"
        options={{
          title: 'Logistics',
          tabBarLabel: 'Logistics',
          tabBarIcon: ({ color, focused, size }) => (
            <Truck
              size={size || 22}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="repairs"
        options={{
          title: 'Repairs',
          tabBarLabel: 'Repairs',
          tabBarIcon: ({ color, focused, size }) => (
            <Wrench
              size={size || 22}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused, size }) => (
            <User
              size={size || 22}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
