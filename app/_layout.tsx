/**
 * app/_layout.tsx
 * Kuro Mobile Root Layout & Auth Gate
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from '@/context/theme-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ScannerProvider } from '@/context/scanner-context';

// Prevent splash screen from auto-hiding before auth state and fonts are determined
SplashScreen.preventAutoHideAsync().catch(() => {
  /* Ignore error in development/web */
});

/**
 * Route Guard Component
 * Monitors authentication state and enforces route access boundaries.
 */
function RouteGuard({ isFontsReady }: { isFontsReady: boolean }) {
  const {
    isAuthenticated,
    isLoading,
    isRestoringSession,
    pendingRedirectUrl,
    setPendingRedirectUrl,
  } = useAuth();
  const { isDark, colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  const isAuthReady = !isLoading && !isRestoringSession;
  const isReady = isAuthReady && isFontsReady;

  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Capture attempted deep link path if unauthenticated outside auth group
      if (segments.length > 0) {
        const fullPath = `/${segments.join('/')}`;
        if (fullPath !== '/' && fullPath !== '/(tabs)') {
          setPendingRedirectUrl(fullPath);
        }
      }
      // Redirect unauthenticated user to login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect authenticated user to pending deep link target or tabs
      if (pendingRedirectUrl) {
        const target = pendingRedirectUrl;
        setPendingRedirectUrl(null);
        router.replace(target as any);
      } else {
        router.replace('/(tabs)');
      }
    }

    // Hide native splash screen once initial routing and fonts are resolved
    SplashScreen.hideAsync().catch(() => {});
  }, [isAuthenticated, isReady, segments, router, pendingRedirectUrl, setPendingRedirectUrl]);

  if (!isReady) {
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
  const [fontsLoaded, fontError] = useFonts({
    Calibri: require('../assets/fonts/Calibri.ttf'),
    'Calibri-Regular': require('../assets/fonts/Calibri-Regular.ttf'),
    'Calibri-Bold': require('../assets/fonts/Calibri-Bold.ttf'),
    'Calibri-Italic': require('../assets/fonts/Calibri-Italic.ttf'),
    'Calibri-BoldItalic': require('../assets/fonts/Calibri-BoldItalic.ttf'),
    'Calibri-Light': require('../assets/fonts/Calibri-Light.ttf'),
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'kuro-calibri-web-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          * {
            font-family: 'Calibri', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  const isFontsReady = fontsLoaded || !!fontError;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ScannerProvider>
            <RouteGuard isFontsReady={isFontsReady} />
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
