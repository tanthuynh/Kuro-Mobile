/**
 * __tests__/global-offline-banner.test.tsx
 * Comprehensive Test Suite for Global Offline UX Indicator Banner.
 *
 * Verifies:
 * 1. Banner renders with "Offline Mode", WifiOff icon, alert accessibilityRole, and warm amber styling when offline.
 * 2. Banner is completely hidden (null) when device is online.
 * 3. Banner accounts for safe area insets (insets.top) to avoid device notch/Dynamic Island collisions.
 * 4. Banner responds reactively to online/offline network transitions.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import { GlobalOfflineBanner } from '@/components/layout/global-offline-banner';
import { NetworkProvider } from '@/context/network-context';
import * as safeArea from 'react-native-safe-area-context';
import * as database from 'firebase/database';

// Mock Theme Context
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => ({
      colors: actualTheme.darkColors,
      typography: actualTheme.typography,
      spacing: actualTheme.spacing,
      layout: actualTheme.layout,
      isDark: false,
    }),
    ThemeProvider: ({ children }: any) => children,
  };
});

describe('GlobalOfflineBanner Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Offline Mode", WifiOff icon, alert role, and amber warning style when offline', () => {
    const { getByTestId, getByText } = render(
      <NetworkProvider initialOnline={false}>
        <GlobalOfflineBanner />
      </NetworkProvider>
    );

    const banner = getByTestId('global-offline-banner');
    expect(banner).toBeTruthy();

    // Verify accessibility attributes
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLabel).toMatch(/Offline Mode/i);

    // Verify banner text content
    const textElement = getByText(/Offline Mode/i);
    expect(textElement).toBeTruthy();
    expect(textElement.props.children).toContain('Offline Mode');

    // Verify warm amber styling (#FEF3C7 background and #F59E0B border in light mode)
    const flattenedStyle = banner.props.style;
    const styleObj = Array.isArray(flattenedStyle)
      ? Object.assign({}, ...flattenedStyle)
      : flattenedStyle;

    expect(styleObj.backgroundColor).toBe('#FEF3C7');
    expect(styleObj.borderBottomColor).toBe('#F59E0B');
  });

  it('renders nothing (is hidden) when device is online', () => {
    const { queryByTestId, queryByText } = render(
      <NetworkProvider initialOnline={true}>
        <GlobalOfflineBanner />
      </NetworkProvider>
    );

    expect(queryByTestId('global-offline-banner')).toBeNull();
    expect(queryByText(/Offline Mode/i)).toBeNull();
  });

  it('respects safe area insets.top to avoid device camera notch / Dynamic Island overlap', () => {
    // In jest.setup.js, inset.top is mocked to 44
    const { getByTestId } = render(
      <NetworkProvider initialOnline={false}>
        <GlobalOfflineBanner />
      </NetworkProvider>
    );

    const banner = getByTestId('global-offline-banner');
    const flattenedStyle = banner.props.style;
    const styleObj = Array.isArray(flattenedStyle)
      ? Object.assign({}, ...flattenedStyle)
      : flattenedStyle;

    // paddingTop should be insets.top (44) + 4 = 48
    expect(styleObj.paddingTop).toBe(48);
  });

  it('dynamically toggles visibility when network connection changes from offline to online', () => {
    let rtdbListenerCallback: (snap: any) => void = () => {};
    (database.onValue as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      rtdbListenerCallback = callback;
      return jest.fn();
    });

    const { queryByTestId, rerender } = render(
      <NetworkProvider initialOnline={false}>
        <GlobalOfflineBanner />
      </NetworkProvider>
    );

    // Initially offline -> banner visible
    expect(queryByTestId('global-offline-banner')).toBeTruthy();

    // Simulate network reconnection via RTDB .info/connected
    act(() => {
      rtdbListenerCallback({ val: () => true });
    });

    // Re-render with updated state
    rerender(
      <NetworkProvider initialOnline={true}>
        <GlobalOfflineBanner />
      </NetworkProvider>
    );

    expect(queryByTestId('global-offline-banner')).toBeNull();
  });

  it('renders rich dark amber styling when in dark mode', () => {
    const themeContext = require('@/context/theme-context');
    const spy = jest.spyOn(themeContext, 'useTheme').mockReturnValue({
      colors: {},
      typography: { fontSize: { sm: 13 } },
      spacing: {},
      layout: {},
      isDark: true,
    });

    const { getByTestId } = render(
      <NetworkProvider initialOnline={false}>
        <GlobalOfflineBanner />
      </NetworkProvider>
    );

    const banner = getByTestId('global-offline-banner');
    const flattenedStyle = banner.props.style;
    const styleObj = Array.isArray(flattenedStyle)
      ? Object.assign({}, ...flattenedStyle)
      : flattenedStyle;

    expect(styleObj.backgroundColor).toBe('#78350F');
    expect(styleObj.borderBottomColor).toBe('#F59E0B');

    spy.mockRestore();
  });
});
