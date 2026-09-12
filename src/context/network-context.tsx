/**
 * src/context/network-context.tsx
 * Centralized Network Connectivity Provider & Hook for Kuro Mobile.
 *
 * Listens to network connectivity using Firebase Realtime Database `.info/connected`
 * with `navigator.onLine` and `window` event fallbacks for web/offline edge cases.
 * Broadcasts online state transitions to domain services:
 * - location-tracking-service.ts (triggers GPS telemetry buffer flush upon reconnection)
 * - repair-service.ts (offline mutation queueing and network guards)
 * - pull-sheet-service.ts (read-only offline event guards)
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { ref, onValue, type Unsubscribe } from 'firebase/database';
import { rtdb } from '@/lib/firebase';
import { setNetworkOnlineState as setLocationTrackingOnlineState } from '@/services/location-tracking-service';
import { setNetworkOnlineState as setRepairOnlineState } from '@/services/repair-service';
import { setNetworkOnlineState as setPullSheetOnlineState } from '@/services/pull-sheet-service';

export interface NetworkStatus {
  isOnline: boolean;
  isConnected: boolean;
  connectionType?: string;
}

const defaultNetworkStatus: NetworkStatus = {
  isOnline: true,
  isConnected: true,
  connectionType: 'wifi',
};

const NetworkContext = createContext<NetworkStatus>(defaultNetworkStatus);

export function useNetworkStatus(): NetworkStatus {
  const context = useContext(NetworkContext);
  return context || defaultNetworkStatus;
}

export interface NetworkProviderProps {
  children: React.ReactNode;
  initialOnline?: boolean;
}

/**
 * Propagates online state across registered domain services.
 */
function syncDomainServices(online: boolean): void {
  try {
    setLocationTrackingOnlineState(online);
  } catch (err) {
    console.warn('[NetworkContext] Failed to sync location tracking online state:', err);
  }

  try {
    setRepairOnlineState(online);
  } catch (err) {
    console.warn('[NetworkContext] Failed to sync repair service online state:', err);
  }

  try {
    setPullSheetOnlineState(online);
  } catch (err) {
    console.warn('[NetworkContext] Failed to sync pull-sheet service online state:', err);
  }
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({
  children,
  initialOnline,
}) => {
  const getInitialOnline = (): boolean => {
    if (initialOnline !== undefined) {
      return initialOnline;
    }
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine !== false;
    }
    return true;
  };

  const [isOnline, setIsOnline] = useState<boolean>(getInitialOnline);
  const [isConnected, setIsConnected] = useState<boolean>(getInitialOnline);
  const isFirstMount = useRef(true);

  // Synchronize domain services whenever isOnline changes
  useEffect(() => {
    syncDomainServices(isOnline);
  }, [isOnline]);

  // If initialOnline prop changes dynamically (e.g. in tests)
  useEffect(() => {
    if (initialOnline !== undefined) {
      setIsOnline(initialOnline);
      setIsConnected(initialOnline);
    }
  }, [initialOnline]);

  // Subscribe to Firebase RTDB `.info/connected` and web online/offline events
  useEffect(() => {
    let unsubRtdb: Unsubscribe | undefined;

    try {
      const connectedRef = ref(rtdb, '.info/connected');
      unsubRtdb = onValue(
        connectedRef,
        (snapshot) => {
          const connected = snapshot ? snapshot.val() === true : false;
          setIsConnected(connected);

          // If navigator.onLine is explicitly false, device is offline regardless of RTDB
          const hasWebOffline = typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false;
          if (hasWebOffline) {
            setIsOnline(false);
            return;
          }

          // If initialOnline was explicitly passed (e.g., test override), preserve it unless RTDB emits true
          if (initialOnline !== undefined && !connected) {
            setIsOnline(initialOnline);
            return;
          }

          setIsOnline(connected);
        },
        (error) => {
          console.warn('[NetworkContext] RTDB .info/connected listener error:', error);
        }
      );
    } catch (err) {
      console.warn('[NetworkContext] Could not attach RTDB .info/connected listener:', err);
    }

    // Web / DOM online/offline event listeners fallback
    const handleOnline = () => {
      setIsOnline(true);
      setIsConnected(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsConnected(false);
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (unsubRtdb) {
        unsubRtdb();
      }
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [initialOnline]);

  const value = useMemo<NetworkStatus>(
    () => ({
      isOnline,
      isConnected,
      connectionType: isOnline ? 'wifi' : 'none',
    }),
    [isOnline, isConnected]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};
