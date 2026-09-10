/**
 * src/context/auth-context.tsx
 * Comprehensive React AuthProvider and useAuth hook for Kuro Mobile.
 * Coordinates Firebase Auth, multi-tenant resolution, session restoration,
 * AsyncStorage synchronization, and RTDB presence.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  onIdTokenChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../lib/firebase';
import {
  lookupAuthTenantId,
  signInWithTenant,
  getUserProfile,
  signOutUser,
  restoreSession,
  sendTenantPasswordReset,
  createLogoutNotice,
  STORAGE_KEYS,
} from '../services/auth-service';
import { startPresence } from '../services/presence-service';
import type {
  UserProfile,
  TenantLookupResult,
  Role,
  LogoutReason,
  LogoutNotice,
  AuthContextType,
} from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [tenant, setTenant] = useState<TenantLookupResult | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [isOfflineSession, setIsOfflineSession] = useState<boolean>(false);
  const [pendingRedirectUrl, setPendingRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoutNotice, setLogoutNotice] = useState<LogoutNotice | null>(null);

  // Keep ref for callbacks to avoid closure staleness
  const userRef = useRef<UserProfile | null>(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Track recent hydration to avoid duplicate Firestore reads on sign in
  const lastHydratedRef = useRef<{ uid: string; timestamp: number } | null>(null);

  /**
   * Action: Step 1 Tenant Lookup
   */
  const lookupTenant = useCallback(async (email: string): Promise<TenantLookupResult> => {
    setError(null);
    const result = await lookupAuthTenantId(email);
    if (result.success) {
      setTenant(result);
    } else {
      setError(result.error || 'Failed to lookup account.');
    }
    return result;
  }, []);

  /**
   * Action: Step 2 Credential Sign In
   */
  const signIn = useCallback(
    async (
      email: string,
      password: string,
      authTenantId?: string | null
    ): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
      setIsLoading(true);
      setError(null);

      const tenantIdToUse = authTenantId !== undefined ? authTenantId : tenant?.authTenantId;
      const result = await signInWithTenant(email, password, tenantIdToUse);

      if (result.success && result.user) {
        lastHydratedRef.current = { uid: result.user.uid, timestamp: Date.now() };
        setUser(result.user);
        setIsOfflineSession(false);
        setLogoutNotice(null);
        await AsyncStorage.removeItem(STORAGE_KEYS.LOGOUT_NOTICE);
      } else {
        setError(result.error || 'Sign in failed.');
      }

      setIsLoading(false);
      return result;
    },
    [tenant?.authTenantId]
  );

  /**
   * Action: Complete Sign Out with coordinated reason tracking
   */
  const handleSignOut = useCallback(async (reason: LogoutReason = 'manual'): Promise<void> => {
    setIsLoading(true);
    try {
      if (reason !== 'manual') {
        const notice = createLogoutNotice(reason);
        setLogoutNotice(notice);
      }
      await signOutUser(reason);
      setUser(null);
      setFirebaseUser(null);
      setTenant(null);
      setRole(null);
      setIsOfflineSession(false);
      setPendingRedirectUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Action: Re-hydrate user profile from Firestore
   */
  const refreshProfile = useCallback(async (): Promise<void> => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser) return;

    try {
      const result = await getUserProfile(currentFbUser.uid, currentFbUser.email || undefined);
      if (result.success && result.profile) {
        setUser(result.profile);
        await AsyncStorage.setItem(
          STORAGE_KEYS.USER_PROFILE,
          JSON.stringify(result.profile)
        );
      }
    } catch (err: any) {
      console.warn('[AuthContext] Failed to refresh profile:', err);
    }
  }, []);

  /**
   * Action: Send password reset
   */
  const sendPasswordReset = useCallback(
    async (email: string, authTenantId?: string | null): Promise<{ success: boolean; error?: string }> => {
      const tenantIdToUse = authTenantId !== undefined ? authTenantId : tenant?.authTenantId;
      return sendTenantPasswordReset(email, tenantIdToUse);
    },
    [tenant?.authTenantId]
  );

  /**
   * Action: Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Action: Clear logout notice
   */
  const clearLogoutNotice = useCallback(() => {
    setLogoutNotice(null);
    AsyncStorage.removeItem(STORAGE_KEYS.LOGOUT_NOTICE).catch(() => {});
  }, []);

  // 1. Initial Session Restoration from AsyncStorage on Launch
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        // Check for stored logout notice
        const storedNoticeJson = await AsyncStorage.getItem(STORAGE_KEYS.LOGOUT_NOTICE);
        if (storedNoticeJson && isMounted) {
          try {
            setLogoutNotice(JSON.parse(storedNoticeJson));
          } catch {}
        }

        // Restore cached profile
        const session = await restoreSession();
        if (session.restored && session.profile && isMounted) {
          setUser(session.profile);
        }

        // Restore cached tenant lookup
        const cachedLookupJson = await AsyncStorage.getItem(STORAGE_KEYS.TENANT_LOOKUP);
        if (cachedLookupJson && isMounted) {
          try {
            setTenant(JSON.parse(cachedLookupJson));
          } catch {}
        }
      } catch (err) {
        console.warn('[AuthContext] Session restoration error:', err);
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    }

    initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Firebase Auth State & ID Token Observer
  useEffect(() => {
    const handleAuthObserver = async (fbUser: FirebaseUser | null) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Check if this user was freshly hydrated by signInWithTenant
        const isFreshlyHydrated =
          lastHydratedRef.current &&
          lastHydratedRef.current.uid === fbUser.uid &&
          Date.now() - lastHydratedRef.current.timestamp < 4000;

        if (isFreshlyHydrated && userRef.current) {
          setIsOfflineSession(false);
          setIsLoading(false);
          return;
        }

        const result = await getUserProfile(fbUser.uid, fbUser.email || undefined);

        if (result.success && result.profile) {
          setUser(result.profile);
          setIsOfflineSession(false);
          await AsyncStorage.setItem(
            STORAGE_KEYS.USER_PROFILE,
            JSON.stringify(result.profile)
          );
        } else if (result.isTransient) {
          // Transient network issue: preserve cached profile if already available
          console.warn('[AuthContext] Transient network issue during profile check, preserving session:', result.error);
          setIsOfflineSession(true);
          if (!userRef.current) {
            setError('Network connection issue. Reconnecting...');
          }
        } else {
          // Confirmed revoked, inactive, cancelled tenant, or deleted profile
          console.error('[AuthContext] Confirmed auth/profile failure, signing out:', result.error);
          await handleSignOut(result.reason || 'profile_error');
        }
      } else {
        // User is unauthenticated
        setUser(null);
        setTenant(null);
        setRole(null);
        setIsOfflineSession(false);
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.USER_PROFILE,
          STORAGE_KEYS.AUTH_TENANT_ID,
          STORAGE_KEYS.SESSION_ID,
          STORAGE_KEYS.TENANT_LOOKUP,
        ]);
      }

      setIsLoading(false);
    };

    const unsubscribeAuthState = onAuthStateChanged(auth, handleAuthObserver);
    const unsubscribeTokenState = onIdTokenChanged(auth, async (fbUser) => {
      if (!fbUser && userRef.current) {
        // Token was revoked or expired
        await handleAuthObserver(null);
      }
    });

    return () => {
      unsubscribeAuthState();
      unsubscribeTokenState();
    };
  }, [handleSignOut]);

  // 3. RTDB Presence Management (Active Session, Connection, Admin Signals)
  useEffect(() => {
    if (!user || !firebaseUser) return;

    const cleanupPresence = startPresence(user, {
      onSessionEvicted: () => {
        handleSignOut('session');
      },
      onForceLogout: () => {
        handleSignOut('admin_force');
      },
      onForceRefresh: () => {
        refreshProfile();
      },
    });

    return () => {
      cleanupPresence();
    };
  }, [user?.uid, firebaseUser?.uid, handleSignOut, refreshProfile]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      firebaseUser,
      tenant,
      role,
      isLoading: isLoading || isRestoringSession,
      isAuthenticated: !!user && !!firebaseUser,
      isRestoringSession,
      isOfflineSession,
      pendingRedirectUrl,
      error,
      logoutNotice,
      lookupTenant,
      signIn,
      signOut: handleSignOut,
      refreshProfile,
      sendPasswordReset,
      setPendingRedirectUrl,
      clearError,
      clearLogoutNotice,
    }),
    [
      user,
      firebaseUser,
      tenant,
      role,
      isLoading,
      isRestoringSession,
      isOfflineSession,
      pendingRedirectUrl,
      error,
      logoutNotice,
      lookupTenant,
      signIn,
      handleSignOut,
      refreshProfile,
      sendPasswordReset,
      setPendingRedirectUrl,
      clearError,
      clearLogoutNotice,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Primary authentication hook for functional React components.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
