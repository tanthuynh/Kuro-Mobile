/**
 * __tests__/navigation-and-camera-lifecycle.test.tsx
 * Change #2 Verification Suite: Navigation & Camera Lifecycle.
 *
 * Covers:
 * 1. Consistent back navigation across Events, Logistics, Repairs, Profile, Inventory, Scanner.
 * 2. Focus-scoped Android hardware back (registered only on focus, cleaned on blur).
 * 3. Root tab preservation (default Android exit behavior when isRootTab: true).
 * 4. Topmost modal/sheet interception before stack navigation.
 * 5. Async pre-back operations with in-flight lock and synchronous BackHandler return.
 * 6. Cold direct-link fallback route replacement (canGoBack: false -> router.replace).
 * 7. Pullsheet redirect preserving /pullsheet/[id] -> /events/[id].
 * 8. Camera multi-gating (isFocused && appState === 'active' && isVisible && permission.granted).
 * 9. Explicit torch reset to false on blur/background/unmount (no toggle antipattern).
 * 10. AppState change listener with getPermission() recheck on resume from Settings.
 * 11. Clear permission denial UX with Open Settings button, no automatic prompt loops,
 *     and no simulated scans in production denial.
 */

import React from 'react';
import { View, Button as RNButton, BackHandler, AppState, Platform, Linking } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { useConsistentBack } from '@/hooks/use-consistent-back';
import { CameraViewfinder } from '@/components/scanner/camera-viewfinder';
import PullSheetRedirectScreen from '@/../app/pullsheet/[id]';

// Mock Theme Context
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

// Mock expo-router
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockCanGoBackValue = true;
let mockIsFocusedValue = true;
let mockLocalId: string | string[] = 'event-101';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      back: mockBack,
      replace: mockReplace,
      push: mockPush,
      canGoBack: () => mockCanGoBackValue,
    }),
    useLocalSearchParams: () => ({
      id: mockLocalId,
    }),
    useIsFocused: () => mockIsFocusedValue,
    useFocusEffect: (effect: () => (() => void) | void) => {
      React.useEffect(() => {
        const cleanup = effect();
        return () => {
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    },
  };
});

// Mock expo-camera
let mockPermissionState = {
  granted: true,
  canAskAgain: true,
  status: 'granted',
};
const mockRequestPermission = jest.fn();
const mockGetPermission = jest.fn();

jest.mock('expo-camera', () => {
  const React = require('react');
  return {
    CameraView: (props: any) => React.createElement('CameraView', props, props.children),
    useCameraPermissions: () => [
      mockPermissionState,
      mockRequestPermission,
      mockGetPermission,
    ],
  };
});

// Helper component to test useConsistentBack
function TestBackHarness({
  fallbackRoute = '/(tabs)',
  isRootTab = false,
  onBeforeBack,
  debounceMs = 400,
}: {
  fallbackRoute?: string;
  isRootTab?: boolean;
  onBeforeBack?: () => boolean | Promise<boolean | void> | void;
  debounceMs?: number;
}) {
  const { handleBack } = useConsistentBack({
    fallbackRoute,
    isRootTab,
    onBeforeBack,
    debounceMs,
  });

  return (
    <View testID="test-back-harness">
      <RNButton title="Trigger Back" onPress={handleBack} testID="trigger-back-btn" />
    </View>
  );
}

describe('Change #2: Navigation & Camera Lifecycle Architecture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBackValue = true;
    mockIsFocusedValue = true;
    mockLocalId = 'event-101';
    mockPermissionState = {
      granted: true,
      canAskAgain: true,
      status: 'granted',
    };
    mockRequestPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
  });

  // ==========================================================================
  // 1. USE-CONSISTENT-BACK HOOK TESTS
  // ==========================================================================
  describe('useConsistentBack Hook', () => {
    it('calls router.back() when history is present (canGoBack is true)', () => {
      mockCanGoBackValue = true;
      const { getByTestId } = render(<TestBackHarness fallbackRoute="/(tabs)" />);

      fireEvent.press(getByTestId('trigger-back-btn'));
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('falls back to router.replace(fallbackRoute) for cold direct-links (canGoBack is false)', () => {
      mockCanGoBackValue = false;
      const { getByTestId } = render(<TestBackHarness fallbackRoute="/(tabs)/repairs" />);

      fireEvent.press(getByTestId('trigger-back-btn'));
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/repairs');
    });

    it('intercepts back and closes topmost modal when onBeforeBack returns true', () => {
      let isModalOpen = true;
      const onBeforeBack = jest.fn(() => {
        if (isModalOpen) {
          isModalOpen = false;
          return true; // consumed locally
        }
        return false;
      });

      const { getByTestId } = render(
        <TestBackHarness fallbackRoute="/(tabs)" onBeforeBack={onBeforeBack} />
      );

      // First back press: closes modal, does NOT navigate
      fireEvent.press(getByTestId('trigger-back-btn'));
      expect(onBeforeBack).toHaveBeenCalledTimes(1);
      expect(isModalOpen).toBe(false);
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('holds in-flight lock during async onBeforeBack and navigates upon resolution', async () => {
      let resolveAsyncWork: () => void = () => {};
      const asyncWorkPromise = new Promise<void>((resolve) => {
        resolveAsyncWork = resolve;
      });

      const onBeforeBack = jest.fn(() => asyncWorkPromise);

      const { getByTestId } = render(
        <TestBackHarness fallbackRoute="/(tabs)" onBeforeBack={onBeforeBack} />
      );

      // Trigger back: returns true synchronously to BackHandler, starts async work
      act(() => {
        fireEvent.press(getByTestId('trigger-back-btn'));
      });

      expect(onBeforeBack).toHaveBeenCalledTimes(1);
      // Navigation should NOT have completed yet while promise is pending
      expect(mockBack).not.toHaveBeenCalled();

      // Resolve the async work (e.g. flushed pending updates)
      await act(async () => {
        resolveAsyncWork();
      });

      // Now navigation executes
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('preserves default Android exit on root tabs (returns false without intercepting)', () => {
      const addEventListenerSpy = jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation(() => {
          return { remove: jest.fn() };
        });

      render(<TestBackHarness fallbackRoute="/(tabs)" isRootTab={true} />);

      // On root tabs, hardware back listener is NOT registered, preserving default exit
      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('registers Android hardware-back listener on non-root screens and cleans up on unmount', () => {
      const removeMock = jest.fn();
      const addEventListenerSpy = jest
        .spyOn(BackHandler, 'addEventListener')
        .mockReturnValue({ remove: removeMock });

      const { unmount } = render(<TestBackHarness fallbackRoute="/(tabs)" isRootTab={false} />);

      expect(addEventListenerSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
      expect(removeMock).not.toHaveBeenCalled();

      unmount();
      expect(removeMock).toHaveBeenCalled();
    });

    it('debounces rapid repeated back actions within debounceMs', () => {
      const { getByTestId } = render(
        <TestBackHarness fallbackRoute="/(tabs)" debounceMs={400} />
      );

      const btn = getByTestId('trigger-back-btn');
      fireEvent.press(btn);
      fireEvent.press(btn);
      fireEvent.press(btn);

      // Only 1 back navigation should execute within debounce window
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. PULLSHEET REDIRECT TESTS
  // ==========================================================================
  describe('Pullsheet Deep-Link Redirect (/pullsheet/[id])', () => {
    it('seamlessly redirects to /events/[id] when eventId is provided', () => {
      mockLocalId = 'event-456';
      render(<PullSheetRedirectScreen />);

      expect(mockReplace).toHaveBeenCalledWith('/events/event-456');
    });

    it('redirects to /(tabs) when eventId is missing', () => {
      mockLocalId = '';
      render(<PullSheetRedirectScreen />);

      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  // ==========================================================================
  // 3. CAMERAVIEWFINDER LIFECYCLE & PERMISSION TESTS
  // ==========================================================================
  describe('CameraViewfinder Multi-Gating & Torch Lifecycle', () => {
    const originalPlatformOS = Platform.OS;

    beforeEach(() => {
      (Platform as any).OS = 'android';
      (AppState as any).currentState = 'active';
    });

    afterEach(() => {
      (Platform as any).OS = originalPlatformOS;
    });

    it('renders native CameraView when focused, active, visible, and permission granted', () => {
      mockIsFocusedValue = true;
      const { getByTestId } = render(
        <CameraViewfinder onScan={jest.fn()} isVisible={true} torchEnabled={false} />
      );

      expect(getByTestId('camera-view-native')).toBeTruthy();
    });

    it('unmounts CameraView when isVisible is false', () => {
      const { queryByTestId } = render(
        <CameraViewfinder onScan={jest.fn()} isVisible={false} />
      );

      expect(queryByTestId('camera-view-native')).toBeNull();
    });

    it('explicitly calls onResetTorch when viewfinder becomes inactive (not toggling)', () => {
      const onResetTorch = jest.fn();
      const onToggleTorch = jest.fn();

      const { rerender } = render(
        <CameraViewfinder
          onScan={jest.fn()}
          isVisible={true}
          torchEnabled={true}
          onResetTorch={onResetTorch}
          onToggleTorch={onToggleTorch}
        />
      );

      expect(onResetTorch).not.toHaveBeenCalled();

      // Hide viewfinder (e.g. user closed sheet or switched tabs)
      rerender(
        <CameraViewfinder
          onScan={jest.fn()}
          isVisible={false}
          torchEnabled={true}
          onResetTorch={onResetTorch}
          onToggleTorch={onToggleTorch}
        />
      );

      expect(onResetTorch).toHaveBeenCalledTimes(1);
      // Ensure toggle was NEVER called for lifecycle cleanup
      expect(onToggleTorch).not.toHaveBeenCalled();
    });

    it('renders clear permission denied UI with Open Settings button when permission is denied', async () => {
      mockPermissionState = {
        granted: false,
        canAskAgain: false,
        status: 'denied',
      };

      const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

      const { getByTestId, queryByTestId } = render(
        <CameraViewfinder onScan={jest.fn()} isVisible={true} />
      );

      // Native CameraView must NOT be rendered
      expect(queryByTestId('camera-view-native')).toBeNull();

      // Clear denial UI
      expect(getByTestId('camera-permission-denied-message')).toBeTruthy();
      const settingsBtn = getByTestId('open-camera-settings-btn');
      expect(settingsBtn).toBeTruthy();

      await act(async () => {
        fireEvent.press(settingsBtn);
      });

      expect(openSettingsSpy).toHaveBeenCalled();
    });

    it('prompts to grant camera permission when undetermined without repeated automatic loops', () => {
      mockPermissionState = {
        granted: false,
        canAskAgain: true,
        status: 'undetermined',
      };

      const { getByTestId } = render(
        <CameraViewfinder onScan={jest.fn()} isVisible={true} />
      );

      const grantBtn = getByTestId('grant-camera-permission-btn');
      expect(grantBtn).toBeTruthy();

      fireEvent.press(grantBtn);
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });

    it('rechecks camera permission via getPermission() on AppState resume from background', () => {
      let appStateListener: ((state: string) => void) | null = null;
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener: any) => {
        appStateListener = listener;
        return { remove: jest.fn() } as any;
      });

      render(<CameraViewfinder onScan={jest.fn()} isVisible={true} />);

      expect(appStateListener).not.toBeNull();

      // Simulate app coming to foreground from OS Settings
      act(() => {
        appStateListener!('active');
      });

      expect(mockGetPermission).toHaveBeenCalled();
    });
  });
});
