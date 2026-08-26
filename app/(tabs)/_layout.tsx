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
          elevation: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
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
          title: 'Jobs',
          tabBarLabel: 'Jobs',
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
        name="scanner"
        options={{
          title: 'Scanner',
          tabBarLabel: 'Scanner',
          tabBarIcon: ({ color, focused, size }) => (
            <QrCode
              size={size || 22}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Equipment',
          tabBarLabel: 'Equipment',
          tabBarIcon: ({ color, focused, size }) => (
            <Package
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
    </Tabs>
  );
}
