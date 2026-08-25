/**
 * app/_layout.tsx
 * Kuro Mobile Root Layout & Auth Gate
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from '@/context/theme-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ScannerProvider } from '@/context/scanner-context';

// Prevent splash screen from auto-hiding before auth state is determined
SplashScreen.preventAutoHideAsync().catch(() => {
  /* Ignore error in development/web */
});

/**
 * Route Guard Component
 * Monitors authentication state and enforces route access boundaries.
 */
function RouteGuard() {
  const { isAuthenticated, isLoading, isRestoringSession } = useAuth();
  const { isDark, colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  const isAuthReady = !isLoading && !isRestoringSession;

  useEffect(() => {
    if (!isAuthReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect unauthenticated user to login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect authenticated user to tabs
      router.replace('/(tabs)');
    }

    // Hide native splash screen once initial routing is resolved
    SplashScreen.hideAsync().catch(() => {});
  }, [isAuthenticated, isAuthReady, segments, router]);

  if (!isAuthReady) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}

/**
 * App Root Layout
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ScannerProvider>
            <RouteGuard />
          </ScannerProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
