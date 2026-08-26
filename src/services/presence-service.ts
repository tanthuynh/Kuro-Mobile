/**
 * src/services/presence-service.ts
 * Realtime Database (RTDB) presence tracking, single-session takeover detection,
 * and remote admin signal listener for Kuro Mobile.
 */

import {
  ref,
  onValue,
  set,
  remove,
  onDisconnect,
  serverTimestamp,
  push,
  type Unsubscribe,
} from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { rtdb, auth } from '../lib/firebase';
import type { UserProfile } from '../types/auth';

export interface PresenceCallbacks {
  onSessionEvicted?: () => void;
  onForceLogout?: () => void;
  onForceRefresh?: () => void;
  onConnectionChange?: (isConnected: boolean) => void;
}

/**
 * Generate a unique session identifier for this mobile client.
 */
async function getOrCreateMobileSessionId(): Promise<string> {
  const STORAGE_KEY = 'mobileSessionId';
  try {
    let sessionId = await AsyncStorage.getItem(STORAGE_KEY);
    if (!sessionId) {
      sessionId = uuidv4();
      await AsyncStorage.setItem(STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return uuidv4();
  }
}

let globalMobileConRef: any = null;

/**
 * Start tracking presence for an authenticated user in Realtime Database.
 * Returns an unsubscribe teardown function.
 */
export function startPresence(
  user: UserProfile,
  callbacks?: PresenceCallbacks
): () => void {
  const uid = user.uid || user.id;
  if (!uid || !auth.currentUser) {
    return () => {};
  }

  let hasClaimedSession = false;
  let mobileSessionId = '';

  const myConnectionsRef = ref(rtdb, `/presence/${uid}/connections`);
  const lastOnlineRef = ref(rtdb, `/presence/${uid}/lastChanged`);
  const lastOnlineMobileRef = ref(rtdb, `/presence/${uid}/lastChanged_mobile`);
  const profileRef = ref(rtdb, `/presence/${uid}/profile`);
  const activeSessionRef = ref(rtdb, `/presence/${uid}/activeSessions/mobile`);
  const legacyActiveSessionRef = ref(rtdb, `/presence/${uid}/activeSessionId`);
  const forceLogoutRef = ref(rtdb, `/presence/${uid}/forceLogout`);
  const forceRefreshRef = ref(rtdb, `/presence/${uid}/forceRefresh`);
  const connectedRef = ref(rtdb, '.info/connected');

  // Initialize session ID and claim active session node
  getOrCreateMobileSessionId().then((sessionId) => {
    mobileSessionId = sessionId;
    if (auth.currentUser?.uid === uid) {
      set(activeSessionRef, sessionId)
        .then(() => {
          hasClaimedSession = true;
        })
        .catch(() => {});
    }
  });

  // 1. Single Session Enforcement: Listen for takeover by another client
  const unsubActiveSession: Unsubscribe = onValue(
    activeSessionRef,
    (snapshot) => {
      const activeSessionId = snapshot.val();
      if (!activeSessionId || !mobileSessionId) return;

      if (activeSessionId === mobileSessionId) {
        hasClaimedSession = true;
      } else if (hasClaimedSession && activeSessionId !== mobileSessionId) {
        // Eviction: another browser or device claimed the active session
        console.warn('[presenceService] Session evicted by another client');
        if (callbacks?.onSessionEvicted) {
          callbacks.onSessionEvicted();
        }
      }
    },
    (error) => {
      // Silence permission denied during sign-out transitions
      const msg = error?.message?.toLowerCase() || '';
      if (!msg.includes('permission_denied') && !msg.includes('permission denied')) {
        console.warn('[presenceService] Active session listener error:', error);
      }
    }
  );

  // 2. Admin Force Logout Signal Listener
  const unsubForceLogout: Unsubscribe = onValue(
    forceLogoutRef,
    (snapshot) => {
      if (snapshot.exists()) {
        remove(forceLogoutRef).catch(() => {});
        console.warn('[presenceService] Admin force logout signal received');
        if (callbacks?.onForceLogout) {
          callbacks.onForceLogout();
        }
      }
    },
    () => {}
  );

  // 3. Admin Force Refresh Signal Listener
  const unsubForceRefresh: Unsubscribe = onValue(
    forceRefreshRef,
    (snapshot) => {
      if (snapshot.exists()) {
        remove(forceRefreshRef).catch(() => {});
        if (callbacks?.onForceRefresh) {
          callbacks.onForceRefresh();
        }
      }
    },
    () => {}
  );

  // 4. Connection State Tracking via `.info/connected`
  const unsubConnected: Unsubscribe = onValue(
    connectedRef,
    async (snapshot) => {
      const isConnected = snapshot.val() === true;
      if (callbacks?.onConnectionChange) {
        callbacks.onConnectionChange(isConnected);
      }

      if (!isConnected || !auth.currentUser) {
        return;
      }

      // Cleanup prior connection node on reconnect
      if (globalMobileConRef) {
        try {
          await onDisconnect(globalMobileConRef).cancel();
          await remove(globalMobileConRef);
        } catch {
          // Ignore if already deleted
        }
      }

      // Push new connection record
      const conRef = push(myConnectionsRef);
      globalMobileConRef = conRef;

      try {
        // Configure onDisconnect handlers
        await onDisconnect(conRef).remove();
        await onDisconnect(lastOnlineRef).set(serverTimestamp());
        await onDisconnect(lastOnlineMobileRef).set(serverTimestamp());

        // Write connection node
        await set(conRef, {
          sessionId: mobileSessionId,
          deviceType: 'mobile',
          connectedAt: serverTimestamp(),
        });

        // Affirm active session & update last changed
        if (mobileSessionId) {
          await set(activeSessionRef, mobileSessionId);
          hasClaimedSession = true;
          // Clean up legacy single-session field if it exists
          await remove(legacyActiveSessionRef).catch(() => {});
        }
        await set(lastOnlineRef, serverTimestamp());
        await set(lastOnlineMobileRef, serverTimestamp());

        // Update public user profile card in RTDB for roster view
        await set(profileRef, {
          name: user.name || `${user.firstName} ${user.lastName}`.trim(),
          initials: (user.firstName?.[0] || 'U') + (user.lastName?.[0] || ''),
          avatarUrl: user.avatarUrl || '',
          role: user.role || '',
          tenantId: user.tenantId || '',
          platform: 'mobile',
        });

      } catch (err: any) {
        const msg = err?.message?.toLowerCase() || '';
        if (!msg.includes('permission_denied') && !msg.includes('permission denied')) {
          console.warn('[presenceService] Error updating presence nodes:', err);
        }
      }
    },
    (error) => {
      console.warn('[presenceService] Connected listener error:', error);
    }
  );

  // Return comprehensive cleanup function
  return () => {
    unsubActiveSession();
    unsubForceLogout();
    unsubForceRefresh();
    unsubConnected();

    if (globalMobileConRef) {
      onDisconnect(globalMobileConRef).cancel().catch(() => {});
      if (auth.currentUser) {
        remove(globalMobileConRef).catch(() => {});
      }
      globalMobileConRef = null;
    }
  };
}

/**
 * Explicitly tear down RTDB connection records upon manual logout.
 */
export async function stopPresence(uid?: string): Promise<void> {
  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) return;

  try {
    const lastOnlineRef = ref(rtdb, `/presence/${targetUid}/lastChanged`);
    const lastOnlineMobileRef = ref(rtdb, `/presence/${targetUid}/lastChanged_mobile`);
    const mobileSessionRef = ref(rtdb, `/presence/${targetUid}/activeSessions/mobile`);

    await set(lastOnlineRef, serverTimestamp()).catch(() => {});
    await set(lastOnlineMobileRef, serverTimestamp()).catch(() => {});
    
    // ONLY clear the mobile session slot! Do not touch web.
    await remove(mobileSessionRef).catch(() => {});

    // Instantly remove the specific mobile connection node
    if (globalMobileConRef) {
      await onDisconnect(globalMobileConRef).cancel().catch(() => {});
      await remove(globalMobileConRef).catch(() => {});
      globalMobileConRef = null;
    }
  } catch (error) {
    console.warn('[presenceService] stopPresence error:', error);
  }
}

/**
 * Subscribe to a specific user's live online status.
 */
export function listenUserOnlineStatus(
  uid: string,
  onChange: (isOnline: boolean, lastChanged?: number) => void
): () => void {
  if (!uid) return () => {};

  const userConnectionsRef = ref(rtdb, `/presence/${uid}/connections`);
  const lastOnlineRef = ref(rtdb, `/presence/${uid}/lastChanged`);

  let isOnline = false;
  let lastChanged: number | undefined;

  const unsubConnections = onValue(userConnectionsRef, (snapshot) => {
    isOnline = snapshot.exists() && Object.keys(snapshot.val() || {}).length > 0;
    onChange(isOnline, lastChanged);
  });

  const unsubLastOnline = onValue(lastOnlineRef, (snapshot) => {
    lastChanged = snapshot.val() || undefined;
    onChange(isOnline, lastChanged);
  });

  return () => {
    unsubConnections();
    unsubLastOnline();
  };
}
