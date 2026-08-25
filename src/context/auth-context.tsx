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
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
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
  const [error, setError] = useState<string | null>(null);
  const [logoutNotice, setLogoutNotice] = useState<LogoutNotice | null>(null);

  // Keep ref for callbacks to avoid closure staleness
  const userRef = useRef<UserProfile | null>(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

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
        setUser(result.user);
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
   * Action: Complete Sign Out with reason tracking
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

  // 2. Firebase Auth State Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // User is authenticated with Firebase
        const result = await getUserProfile(fbUser.uid, fbUser.email || undefined);

        if (result.success && result.profile) {
          setUser(result.profile);
          await AsyncStorage.setItem(
            STORAGE_KEYS.USER_PROFILE,
            JSON.stringify(result.profile)
          );
        } else {
          // If profile does not exist in Firestore, sign out
          console.error('[AuthContext] Failed to load user profile for authenticated UID:', result.error);
          await handleSignOut('profile_error');
        }
      } else {
        // User is unauthenticated
        setUser(null);
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.USER_PROFILE,
          STORAGE_KEYS.AUTH_TENANT_ID,
          STORAGE_KEYS.SESSION_ID,
        ]);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
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
      error,
      logoutNotice,
      lookupTenant,
      signIn,
      signOut: handleSignOut,
      refreshProfile,
      sendPasswordReset,
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
      error,
      logoutNotice,
      lookupTenant,
      signIn,
      handleSignOut,
      refreshProfile,
      sendPasswordReset,
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
