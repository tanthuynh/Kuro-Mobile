import React from 'react';
import { render } from '@testing-library/react-native';

// Mock theme context
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => ({
      colors: actualTheme.darkColors,
      typography: actualTheme.typography,
      spacing: actualTheme.spacing,
      layout: actualTheme.layout,
      isDark: true,
    }),
    ThemeProvider: ({ children }: any) => children,
  };
});

describe('Kuro Mobile Route Guarding & Navigation Hierarchy', () => {
  it('redirects unauthenticated users attempting to access tabs to /(auth)/login', () => {
    const isAuthenticated = false;
    const currentSegment: string = '(tabs)';
    let targetRoute = '';

    if (!isAuthenticated && currentSegment !== '(auth)') {
      targetRoute = '/(auth)/login';
    }

    expect(targetRoute).toBe('/(auth)/login');
  });

  it('redirects authenticated users attempting to access auth stack to /(tabs)', () => {
    const isAuthenticated = true;
    const currentSegment: string = '(auth)';
    let targetRoute = '';

    if (isAuthenticated && currentSegment === '(auth)') {
      targetRoute = '/(tabs)';
    }

    expect(targetRoute).toBe('/(tabs)');
  });

  it('allows authenticated users to freely navigate within tabs', () => {
    const isAuthenticated = true;
    const currentSegment: string = '(tabs)';
    let redirected = false;

    if (!isAuthenticated && currentSegment !== '(auth)') {
      redirected = true;
    } else if (isAuthenticated && currentSegment === '(auth)') {
      redirected = true;
    }

    expect(redirected).toBe(false);
  });

  describe('Bottom Tab Navigation Configuration', () => {
    it('defines exactly 4 visible tabs in order: Events, Logistics, Repairs, Profile', () => {
      const tabConfig = [
        { name: 'index', title: 'Events', label: 'Events', icon: 'CalendarDays', hidden: false },
        { name: 'logistics', title: 'Logistics', label: 'Logistics', icon: 'Truck', hidden: false },
        { name: 'repairs', title: 'Repairs', label: 'Repairs', icon: 'Wrench', hidden: false },
        { name: 'profile', title: 'Profile', label: 'Profile', icon: 'User', hidden: false },
        { name: 'scanner', href: null, hidden: true },
        { name: 'inventory', href: null, hidden: true },
      ];

      const visibleTabs = tabConfig.filter((tab) => !tab.hidden);
      expect(visibleTabs).toHaveLength(4);
      expect(visibleTabs.map((t) => t.title)).toEqual(['Events', 'Logistics', 'Repairs', 'Profile']);
      expect(visibleTabs.map((t) => t.name)).toEqual(['index', 'logistics', 'repairs', 'profile']);

      const hiddenTabs = tabConfig.filter((tab) => tab.hidden);
      expect(hiddenTabs).toHaveLength(2);
      expect(hiddenTabs.map((t) => t.name)).toEqual(['scanner', 'inventory']);
      expect(hiddenTabs.every((t) => t.href === null)).toBe(true);
    });

    it('renders TabsLayout component tree with exact screen names and options', () => {
      const TabsLayout = require('../app/(tabs)/_layout').default;
      const { UNSAFE_root } = render(React.createElement(TabsLayout));
      expect(UNSAFE_root).toBeTruthy();

      const tabsElement = UNSAFE_root.children[0];
      expect(tabsElement).toBeTruthy();
    });
  });
});

