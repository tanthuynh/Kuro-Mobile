/**
 * src/hooks/use-consistent-back.ts
 * Focus-scoped back navigation hook with Android hardware-back support,
 * topmost modal/sheet interception, stack vs direct-link fallbacks, in-flight locks,
 * and debouncing against rapid repeated back actions.
 */

import { useCallback, useRef, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

export interface UseConsistentBackOptions {
  /**
   * The destination route to fall back to when the current stack has no back history
   * (e.g. screens opened directly via deep link, external link, or cold start).
   */
  fallbackRoute: string;

  /**
   * Optional callback invoked before performing navigation.
   * - If it returns `true`, the back action was consumed locally (e.g. closing an open modal or scanner sheet)
   *   and route navigation is suppressed.
   * - If it returns a Promise, an in-flight lock is held while the promise resolves before navigating.
   */
  onBeforeBack?: () => boolean | Promise<boolean | void> | void;

  /**
   * Minimum duration in milliseconds between back actions to debounce rapid repeated taps.
   * Defaults to 400ms.
   */
  debounceMs?: number;

  /**
   * Set to `true` for root tabs (e.g. Events, Logistics, Repairs, Profile).
   * When `true`, hardware back is NOT intercepted so Android can execute its
   * default root-exit behavior.
   */
  isRootTab?: boolean;
}

export function useConsistentBack({
  fallbackRoute,
  onBeforeBack,
  debounceMs = 400,
  isRootTab = false,
}: UseConsistentBackOptions) {
  const router = useRouter();
  const lastBackPressTimeRef = useRef<number>(0);
  const isInFlightLockRef = useRef<boolean>(false);
  const onBeforeBackRef = useRef(onBeforeBack);
  onBeforeBackRef.current = onBeforeBack;

  const navigateBack = useCallback(() => {
    try {
      const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : true;
      if (canGoBack && typeof router.back === 'function') {
        router.back();
      } else if (fallbackRoute) {
        router.replace(fallbackRoute as any);
      }
    } catch {
      if (fallbackRoute) {
        router.replace(fallbackRoute as any);
      }
    }
  }, [router, fallbackRoute]);

  const executeBackFlow = useCallback((): boolean => {
    if (isRootTab) {
      return false; // Preserve normal Android root-tab exit behavior
    }

    const now = Date.now();
    if (isInFlightLockRef.current || now - lastBackPressTimeRef.current < debounceMs) {
      // Ignored: repeated back action or in-flight lock active
      return true;
    }
    lastBackPressTimeRef.current = now;

    // Check if the screen handles back locally (e.g. closing open modal/sheet)
    if (onBeforeBackRef.current) {
      try {
        const result = onBeforeBackRef.current();

        if (result && typeof (result as any).then === 'function') {
          // Asynchronous pre-back work (e.g. flushing pending updates)
          // Hold in-flight lock through the asynchronous work
          isInFlightLockRef.current = true;
          (result as Promise<boolean | void>)
            .then((handledLocally) => {
              if (handledLocally !== true) {
                navigateBack();
              }
            })
            .catch((err) => {
              console.warn('[useConsistentBack] Error during async onBeforeBack:', err);
              navigateBack();
            })
            .finally(() => {
              setTimeout(() => {
                isInFlightLockRef.current = false;
              }, debounceMs);
            });

          // Return true SYNCHRONOUSLY to Android BackHandler
          return true;
        }

        if (result === true) {
          // Consumed synchronously (e.g. modal closed)
          return true;
        }
      } catch (err) {
        console.warn('[useConsistentBack] Error in onBeforeBack handler:', err);
      }
    }

    // Synchronous route navigation
    navigateBack();
    return true;
  }, [isRootTab, debounceMs, navigateBack]);

  // Focus-scoped Android hardware-back registration:
  // ONLY active while screen is focused; automatically cleaned up on blur.
  const focusEffect = typeof useFocusEffect === 'function' ? useFocusEffect : useEffect;
  focusEffect(
    useCallback(() => {
      if (isRootTab) {
        // Root tab: preserve default Android exit behavior
        return undefined;
      }

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        // Must return a synchronous boolean to BackHandler
        return executeBackFlow();
      });

      return () => {
        subscription.remove();
        isInFlightLockRef.current = false;
      };
    }, [executeBackFlow, isRootTab])
  );

  return { handleBack: executeBackFlow };
}
