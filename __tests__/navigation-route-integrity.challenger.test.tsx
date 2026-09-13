/**
 * __tests__/navigation-route-integrity.challenger.test.tsx
 *
 * Adversarial Challenger 1 Test Suite: Milestone 1 Navigation Stacks & Route Integrity
 *
 * Exhaustively stress-tests:
 * 1. Absence of route collisions and file tree structure integrity in Expo Router
 * 2. Nested Stack Layout declarations and headerShown: false enforcement
 * 3. Backward compatibility re-export stubs and static file readers
 * 4. Root Tabs configuration, initial route, and hidden redirect targets
 * 5. Back navigation (useConsistentBack) with history vs deep-link fallback, debouncing, and modal interception
 * 6. Pullsheet redirect aliasing behavior
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Text, View, Button } from 'react-native';

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

// Mock router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react');
  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      canGoBack: () => mockCanGoBack,
    }),
    useLocalSearchParams: () => mockParams,
    useSegments: () => ['(tabs)', 'events'],
    Tabs: Object.assign(
      ({ children }: any) => actualReact.createElement('Tabs', null, children),
      {
        Screen: ({ name, options }: any) =>
          actualReact.createElement('TabsScreen', { name, options }),
      }
    ),
    Stack: Object.assign(
      ({ children, screenOptions }: any) =>
        actualReact.createElement('Stack', { screenOptions }, children),
      {
        Screen: ({ name, options }: any) =>
          actualReact.createElement('StackScreen', { name, options }),
      }
    ),
    Redirect: ({ href }: any) =>
      actualReact.createElement('Redirect', { href }),
  };
});

describe('Challenger 1: Route Integrity & Navigation Stacks Adversarial Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = true;
    mockParams = {};
  });

  // ==========================================================================
  // 1. ROUTE COLLISION & FILE TREE INTEGRITY
  // ==========================================================================
  describe('1. Route Collision Prevention & File Tree Structure', () => {
    const appDir = path.resolve(__dirname, '../app');
    const tabsDir = path.resolve(appDir, '(tabs)');

    it('1.1: confirms complete absence of conflicting flat tab route files', () => {
      // If both (tabs)/events.tsx and (tabs)/events/index.tsx exist, Expo Router emits route collision warnings
      expect(fs.existsSync(path.resolve(tabsDir, 'events.tsx'))).toBe(false);
      expect(fs.existsSync(path.resolve(tabsDir, 'logistics.tsx'))).toBe(false);
      expect(fs.existsSync(path.resolve(tabsDir, 'repairs.tsx'))).toBe(false);
    });

    it('1.2: confirms absence of conflicting top-level non-parameterized route files', () => {
      expect(fs.existsSync(path.resolve(appDir, 'events.tsx'))).toBe(false);
      expect(fs.existsSync(path.resolve(appDir, 'logistics.tsx'))).toBe(false);
      expect(fs.existsSync(path.resolve(appDir, 'repairs.tsx'))).toBe(false);
    });

    it('1.3: confirms required nested directory structures exist with index.tsx feeds', () => {
      expect(fs.existsSync(path.resolve(tabsDir, 'events', 'index.tsx'))).toBe(true);
      expect(fs.existsSync(path.resolve(tabsDir, 'events', '[id].tsx'))).toBe(true);
      expect(fs.existsSync(path.resolve(tabsDir, 'events', '_layout.tsx'))).toBe(true);

      expect(fs.existsSync(path.resolve(tabsDir, 'logistics', 'index.tsx'))).toBe(true);
      expect(fs.existsSync(path.resolve(tabsDir, 'logistics', '[id].tsx'))).toBe(true);
      expect(fs.existsSync(path.resolve(tabsDir, 'logistics', '_layout.tsx'))).toBe(true);

      expect(fs.existsSync(path.resolve(tabsDir, 'repairs', 'index.tsx'))).toBe(true);
      expect(fs.existsSync(path.resolve(tabsDir, 'repairs', '[id].tsx'))).toBe(true);
      expect(fs.existsSync(path.resolve(tabsDir, 'repairs', 'new.tsx'))).toBe(true);
      expect(fs.existsSync(path.resolve(tabsDir, 'repairs', '_layout.tsx'))).toBe(true);
    });
  });

  // ==========================================================================
  // 2. STACK LAYOUT CONTRACT & HEADER INTEGRITY
  // ==========================================================================
  describe('2. Nested Stack Layout Contract (headerShown: false)', () => {
    it('2.1: EventsStackLayout declares headerShown: false and registers index and [id]', () => {
      const EventsStackLayout = require('../app/(tabs)/events/_layout').default;
      const element = EventsStackLayout();

      expect(element.props.screenOptions.headerShown).toBe(false);
      expect(element.props.screenOptions.animation).toBe('default');

      const screens = React.Children.toArray(element.props.children) as React.ReactElement<any>[];
      const screenNames = screens.map((s) => s.props.name);
      expect(screenNames).toContain('index');
      expect(screenNames).toContain('[id]');
    });

    it('2.2: LogisticsStackLayout declares headerShown: false and registers index and [id]', () => {
      const LogisticsStackLayout = require('../app/(tabs)/logistics/_layout').default;
      const element = LogisticsStackLayout();

      expect(element.props.screenOptions.headerShown).toBe(false);
      expect(element.props.screenOptions.animation).toBe('default');

      const screens = React.Children.toArray(element.props.children) as React.ReactElement<any>[];
      const screenNames = screens.map((s) => s.props.name);
      expect(screenNames).toContain('index');
      expect(screenNames).toContain('[id]');
    });

    it('2.3: RepairsStackLayout declares headerShown: false and registers index, new, and [id]', () => {
      const RepairsStackLayout = require('../app/(tabs)/repairs/_layout').default;
      const element = RepairsStackLayout();

      expect(element.props.screenOptions.headerShown).toBe(false);
      expect(element.props.screenOptions.animation).toBe('default');

      const screens = React.Children.toArray(element.props.children) as React.ReactElement<any>[];
      const screenNames = screens.map((s) => s.props.name);
      expect(screenNames).toContain('index');
      expect(screenNames).toContain('new');
      expect(screenNames).toContain('[id]');
    });
  });

  // ==========================================================================
  // 3. BACKWARD COMPATIBILITY RE-EXPORT STUBS
  // ==========================================================================
  describe('3. Backward Compatibility Re-export Stubs', () => {
    it('3.1: app/events/[id].tsx resolves as a valid React component', () => {
      const EventsDetailStub = require('../app/events/[id]').default;
      expect(typeof EventsDetailStub).toBe('function');
    });

    it('3.2: app/logistics/[id].tsx resolves as a valid React component and maintains AST isolation', () => {
      const LogisticsDetailStub = require('../app/logistics/[id]').default;
      expect(typeof LogisticsDetailStub).toBe('function');

      const filePath = path.resolve(__dirname, '../app/logistics/[id].tsx');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toContain('BackgroundLocationDisclosureModal');
      expect(content).toContain("export { default } from '../(tabs)/logistics/[id]'");
    });

    it('3.3: app/repair/[id].tsx resolves as a valid React component', () => {
      const RepairDetailStub = require('../app/repair/[id]').default;
      expect(typeof RepairDetailStub).toBe('function');
    });

    it('3.4: app/repair/new.tsx resolves as a valid React component', () => {
      const NewRepairStub = require('../app/repair/new').default;
      expect(typeof NewRepairStub).toBe('function');
    });

    it('3.5: app/pullsheet/[id].tsx performs seamless redirect to /events/:id', () => {
      mockParams = { id: 'test-event-999' };
      const PullSheetRedirectScreen = require('../app/pullsheet/[id]').default;
      render(React.createElement(PullSheetRedirectScreen));

      expect(mockReplace).toHaveBeenCalledWith('/events/test-event-999');
    });

    it('3.6: app/pullsheet/[id].tsx falls back to /(tabs) when id param is missing', () => {
      mockParams = {};
      const PullSheetRedirectScreen = require('../app/pullsheet/[id]').default;
      render(React.createElement(PullSheetRedirectScreen));

      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  // ==========================================================================
  // 4. ROOT TAB SHELL & REDIRECT CONFIGURATION
  // ==========================================================================
  describe('4. Root Tab Navigation Shell Configuration', () => {
    it('4.1: app/(tabs)/index.tsx redirects to /(tabs)/events', () => {
      const TabIndexRedirect = require('../app/(tabs)/index').default;
      const element = TabIndexRedirect();

      expect(element.props.href).toBe('/(tabs)/events');
    });

    it('4.2: TabsLayout configures 4 primary tabs and hides index, scanner, inventory', () => {
      const TabsLayout = require('../app/(tabs)/_layout').default;
      const element = TabsLayout();

      expect(element.props.initialRouteName).toBe('events');
      const screens = React.Children.toArray(element.props.children) as React.ReactElement<any>[];
      const screenMap = new Map(screens.map((s) => [s.props.name, s.props.options]));

      expect(screenMap.has('events')).toBe(true);
      expect(screenMap.has('logistics')).toBe(true);
      expect(screenMap.has('repairs')).toBe(true);
      expect(screenMap.has('profile')).toBe(true);

      // Hidden screens with href: null
      expect(screenMap.get('index')?.href).toBeNull();
      expect(screenMap.get('scanner')?.href).toBeNull();
      expect(screenMap.get('inventory')?.href).toBeNull();
    });
  });

  // ==========================================================================
  // 5. BACK NAVIGATION (useConsistentBack) ADVERSARIAL CHECKS
  // ==========================================================================
  describe('5. Back Navigation (useConsistentBack) Adversarial Scenarios', () => {
    const { useConsistentBack } = require('@/hooks/use-consistent-back');

    function TestHarness({
      fallbackRoute,
      onBeforeBack,
      debounceMs = 400,
    }: {
      fallbackRoute: string;
      onBeforeBack?: () => boolean | Promise<boolean | void> | void;
      debounceMs?: number;
    }) {
      const { handleBack } = useConsistentBack({ fallbackRoute, onBeforeBack, debounceMs });
      return (
        <View>
          <Button title="Back" onPress={handleBack} testID="test-back-btn" />
        </View>
      );
    }

    it('5.1: pushes router.back() when history stack canGoBack is true', () => {
      mockCanGoBack = true;
      const { getByTestId } = render(<TestHarness fallbackRoute="/(tabs)/events" />);

      fireEvent.press(getByTestId('test-back-btn'));
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('5.2: executes router.replace(fallbackRoute) on direct deep-link where canGoBack is false', () => {
      mockCanGoBack = false;
      const { getByTestId } = render(<TestHarness fallbackRoute="/(tabs)/logistics" />);

      fireEvent.press(getByTestId('test-back-btn'));
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/logistics');
    });

    it('5.3: debounces rapid double-taps (adversarial spam press)', () => {
      mockCanGoBack = true;
      const { getByTestId } = render(
        <TestHarness fallbackRoute="/(tabs)/repairs" debounceMs={400} />
      );

      // Tap 1
      fireEvent.press(getByTestId('test-back-btn'));
      // Immediate Tap 2 within debounce interval
      fireEvent.press(getByTestId('test-back-btn'));

      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('5.4: consumes back action locally when onBeforeBack returns true (e.g. open modal)', () => {
      let modalOpen = true;
      const onBeforeBack = jest.fn(() => {
        if (modalOpen) {
          modalOpen = false;
          return true; // consumed
        }
        return false;
      });

      const { getByTestId } = render(
        <TestHarness fallbackRoute="/(tabs)/events" onBeforeBack={onBeforeBack} />
      );

      // First tap closes modal
      fireEvent.press(getByTestId('test-back-btn'));
      expect(onBeforeBack).toHaveBeenCalledTimes(1);
      expect(modalOpen).toBe(false);
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
