/**
 * src/services/auth-service.ts
 * Multi-tenant authentication service handling email lookup, tenant scoping,
 * credential verification, user profile hydration, session caching, and password reset.
 */

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type UserCredential,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db, functions } from '../lib/firebase';
import { stopPresence } from './presence-service';
import type {
  User,
  UserProfile,
  Tenant,
  TenantLookupResult,
  Role,
  LogoutReason,
  LogoutNotice,
  UserProfileResult,
} from '../types/auth';
import { STORAGE_KEYS, API_CONFIG } from '../constants/config';

export { STORAGE_KEYS };

/**
 * Sanitized logging helper that strips raw credential objects, tokens, and payloads.
 */
export function logAuthError(context: string, error: any): void {
  const code = error?.code || 'unknown_code';
  let msg = typeof error?.message === 'string' ? error.message : 'Unknown error occurred';
  // Redact potential JWT tokens or credentials embedded in error messages
  msg = msg.replace(/ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, '[REDACTED_JWT]');
  msg = msg.replace(/(password|secret|token|credential)=([^\s&]+)/gi, '$1=[REDACTED]');
  console.error(`[authService] ${context} error (${code}): ${msg}`);
}

/**
 * Step 1: Resolve email address against Singapore Cloud Function / Firestore to determine Identity Platform Tenant ID.
 * Handles Super Admins (project-level authTenantId: null) and Tenant users.
 */
export async function lookupAuthTenantId(email: string): Promise<TenantLookupResult> {
  try {
    if (!email || !email.trim()) {
      return { success: false, authTenantId: null, error: 'Email address is required.' };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Primary: Use Singapore Firebase Cloud Function (lookupAuthTenantId)
    if (process.env.NODE_ENV !== 'test') {
      try {
        const lookupAuthTenantFn = httpsCallable<
          { email: string },
          { success?: boolean; authTenantId: string | null; tenantId?: string; tenantName?: string; tenantSlug?: string; error?: string }
        >(functions, 'lookupAuthTenantId');

        const lookupResult = await lookupAuthTenantFn({ email: normalizedEmail });
        const data = lookupResult.data;

        if (data && data.success !== false) {
          const isSuperAdmin = data.authTenantId === null;
          const result: TenantLookupResult = {
            success: true,
            authTenantId: data.authTenantId ?? null,
            tenantId: data.tenantId || (isSuperAdmin ? 'root' : ''),
            tenantName: data.tenantName || (isSuperAdmin ? 'System Administration' : data.tenantSlug || 'Amia Studios'),
            tenantSlug: data.tenantSlug || (isSuperAdmin ? 'admin' : ''),
            isSuperAdmin,
            email: normalizedEmail,
          };
          await AsyncStorage.setItem(STORAGE_KEYS.TENANT_LOOKUP, JSON.stringify(result));
          return result;
        } else if (data?.error) {
          return {
            success: false,
            authTenantId: null,
            error: data.error,
          };
        }
      } catch (fnError: any) {
        console.warn('[authService] Cloud function lookup error:', fnError);
        const formatted = formatAuthError(fnError);
        return {
          success: false,
          authTenantId: null,
          error: formatted.message,
        };
      }
    }

    // 2. Query users collection in Firestore by normalized email
    const usersRef = collection(db, 'users');
    const userQuery = query(usersRef, where('email', '==', normalizedEmail), limit(1));
    const userSnapshot = await getDocs(userQuery);

    if (userSnapshot.empty) {
      return {
        success: false,
        authTenantId: null,
        error: 'User not found. Please check your email or contact your administrator.',
      };
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data() as Partial<User>;

    // 3. Validate account status
    if (userData.status === 'Inactive' || (userData as any).disabled === true) {
      return {
        success: false,
        authTenantId: null,
        error: 'User account is inactive or disabled. Please contact your administrator.',
      };
    }

    // 4. Determine Auth Scope (Super Administrator vs Tenant User)
    let isSuperAdmin = false;

    if (
      userData.roleId === 'super-admin-role' ||
      userData.roleId === '4TJ6V4j41ekGJ7f0HGnp' ||
      userData.accessRights?.includes('Super Administrator')
    ) {
      isSuperAdmin = true;
    } else if (userData.roleId) {
      try {
        const roleDocSnap = await getDoc(doc(db, 'roles', userData.roleId));
        if (roleDocSnap.exists()) {
          const roleData = roleDocSnap.data() as Partial<Role>;
          if (
            roleData.name === 'Super Administrator' ||
            roleData.accessRights?.includes('Super Administrator')
          ) {
            isSuperAdmin = true;
          }
        }
      } catch (roleError) {
        console.warn('[authService] Could not inspect role document during lookup:', roleError);
      }
    }

    // Super Administrators sign in at the root project level (tenantId = null)
    if (isSuperAdmin) {
      const result: TenantLookupResult = {
        success: true,
        authTenantId: null,
        tenantId: userData.tenantId || 'root',
        tenantName: 'System Administration',
        tenantSlug: 'admin',
        isSuperAdmin: true,
        email: normalizedEmail,
      };
      await AsyncStorage.setItem(STORAGE_KEYS.TENANT_LOOKUP, JSON.stringify(result));
      return result;
    }

    // 5. Resolve Tenant Identity Platform ID for regular tenant users
    if (!userData.tenantId) {
      return {
        success: false,
        authTenantId: null,
        error: 'User does not belong to an active organization.',
      };
    }

    const tenantDocSnap = await getDoc(doc(db, 'tenants', userData.tenantId));
    if (!tenantDocSnap.exists()) {
      return {
        success: false,
        authTenantId: null,
        error: 'Organization not found in database.',
      };
    }

    const tenantData = tenantDocSnap.data() as Partial<Tenant>;

    if (tenantData.billingStatus === 'Cancelled') {
      return {
        success: false,
        authTenantId: null,
        error: 'Organization subscription is cancelled. Please contact support.',
      };
    }

    if (!tenantData.authTenantId) {
      return {
        success: false,
        authTenantId: null,
        error: 'Organization is not configured for mobile authentication.',
      };
    }

    const result: TenantLookupResult = {
      success: true,
      authTenantId: tenantData.authTenantId,
      tenantId: userData.tenantId,
      tenantName: tenantData.company || (tenantData as any).name || tenantData.slug || userData.tenantName || 'Amia Studios',
      tenantSlug: tenantData.slug || '',
      isSuperAdmin: false,
      email: normalizedEmail,
    };

    await AsyncStorage.setItem(STORAGE_KEYS.TENANT_LOOKUP, JSON.stringify(result));
    return result;

  } catch (error: any) {
    logAuthError('lookupAuthTenantId', error);
    
    // Map specific Firestore error codes
    if (error.code === 'unavailable' || error.message?.includes('network')) {
      return {
        success: false,
        authTenantId: null,
        error: 'Network connection issue. Please check your internet connection.',
      };
    }
    
    return {
      success: false,
      authTenantId: null,
      error: error.message || 'An error occurred during account lookup. Please try again.',
    };
  }
}

/**
 * Retrieves a cached tenant lookup from AsyncStorage if it matches the normalized email.
 */
export async function getCachedTenantLookup(email: string): Promise<TenantLookupResult | null> {
  try {
    if (!email || !email.trim()) return null;
    const normalized = email.toLowerCase().trim();
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TENANT_LOOKUP);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached && cached.email === normalized && cached.success) {
      return cached as TenantLookupResult;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clears the cached tenant lookup from AsyncStorage.
 */
export async function clearCachedTenantLookup(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.TENANT_LOOKUP);
  } catch {}
}

/**
 * Step 2: Sign in with tenant-scoped Firebase Auth credentials.
 * Scopes `auth.tenantId` to the resolved tenant before calling `signInWithEmailAndPassword`.
 */
export async function signInWithTenant(
  email: string,
  password: string,
  authTenantId?: string | null
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  try {
    if (!email || !password) {
      return { success: false, error: 'Email and password are required.' };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Set the tenant ID on the modular Auth client instance
    auth.tenantId = authTenantId || null;

    // 2. Execute tenant-scoped sign in against Firebase Identity Platform
    const userCredential: UserCredential = await signInWithEmailAndPassword(
      auth,
      normalizedEmail,
      password
    );

    const firebaseUser = userCredential.user;

    // 3. Hydrate complete UserProfile from Firestore
    const profileResult = await getUserProfile(firebaseUser.uid, normalizedEmail);

    if (!profileResult.success || !profileResult.profile) {
      // If profile hydration fails, sign out immediately to prevent orphaned auth session
      await firebaseSignOut(auth);
      return {
        success: false,
        error: profileResult.error || 'User profile could not be loaded from database.',
      };
    }

    // 4. Save hydrated profile and tenant configuration to AsyncStorage
    await AsyncStorage.setItem(
      STORAGE_KEYS.USER_PROFILE,
      JSON.stringify(profileResult.profile)
    );

    if (authTenantId) {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TENANT_ID, authTenantId);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TENANT_ID);
    }

    return {
      success: true,
      user: profileResult.profile,
    };

  } catch (error: any) {
    logAuthError('signInWithTenant', error);

    let friendlyMessage = 'An unexpected error occurred during sign in. Please try again.';

    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        friendlyMessage = 'Invalid email or password.';
        break;
      case 'auth/user-disabled':
        friendlyMessage = 'This user account has been disabled. Contact your administrator.';
        break;
      case 'auth/too-many-requests':
        friendlyMessage = 'Access temporarily locked due to too many failed attempts. Please try again in a few minutes.';
        break;
      case 'auth/network-request-failed':
        friendlyMessage = 'Network connection failed. Please check your internet connection.';
        break;
      case 'auth/invalid-tenant-id':
      case 'auth/tenant-id-mismatch':
        friendlyMessage = 'Organization authentication configuration error. Please try logging in again.';
        break;
      default:
        if (error.message) {
          friendlyMessage = error.message;
        }
    }

    return {
      success: false,
      error: friendlyMessage,
    };
  }
}

/**
 * Hydrate complete UserProfile by combining `users/{uid}`, `roles/{roleId}`, and `tenants/{tenantId}`.
 */
export async function getUserProfile(
  uid: string,
  email?: string
): Promise<UserProfileResult> {
  try {
    if (!uid) {
      return { success: false, error: 'User UID is required.' };
    }

    // 1. Fetch user doc at `users/{uid}`
    const userDocRef = doc(db, 'users', uid);
    let userSnap = await getDoc(userDocRef);

    // Fallback: Query by email if document ID differs from UID
    if (!userSnap.exists() && email) {
      const normalizedEmail = email.toLowerCase().trim();
      const usersRef = collection(db, 'users');
      const emailQuery = query(usersRef, where('email', '==', normalizedEmail), limit(1));
      const emailSnap = await getDocs(emailQuery);

      if (!emailSnap.empty) {
        userSnap = emailSnap.docs[0];
      }
    }

    if (!userSnap.exists()) {
      return {
        success: false,
        isRevoked: true,
        reason: 'profile_error',
        error: 'User profile not found in database.',
      };
    }

    const rawUser = { id: userSnap.id, ...userSnap.data() } as Partial<User>;

    // Enforce account status check: inactive or disabled accounts are immediately rejected
    if (rawUser.status === 'Inactive' || (rawUser as any).disabled === true) {
      return {
        success: false,
        isRevoked: true,
        reason: 'profile_error',
        error: 'User account is inactive or disabled. Please contact your administrator.',
      };
    }

    let roleName = rawUser.role || '';
    let accessRights: string[] = rawUser.accessRights || [];
    let tenantModules: string[] = rawUser.enabledModules || [];

    const isSuperAdmin =
      rawUser.roleId === 'super-admin-role' ||
      rawUser.roleId === '4TJ6V4j41ekGJ7f0HGnp' ||
      accessRights.includes('Super Administrator');

    // 2. Concurrently Resolve Role and Tenant Information via Promise.all
    const rolePromise = (!isSuperAdmin && rawUser.roleId)
      ? getDoc(doc(db, 'roles', rawUser.roleId)).catch((roleErr: any) => {
          console.warn(`[authService] Could not fetch role doc for profile hydration (${roleErr?.code || 'unknown'}): ${roleErr?.message || ''}`);
          return null;
        })
      : Promise.resolve(null);

    const tenantPromise = (!isSuperAdmin && rawUser.tenantId)
      ? getDoc(doc(db, 'tenants', rawUser.tenantId))
      : Promise.resolve(null);

    const [roleSnap, tenantSnap] = await Promise.all([rolePromise, tenantPromise]);

    if (isSuperAdmin) {
      roleName = 'Super Administrator';
      accessRights = Array.from(new Set([...accessRights, 'Super Administrator']));
      tenantModules = [
        'dashboard',
        'events',
        'logistics',
        'dispatch',
        'repair',
        'inventory',
        'contacts',
        'users',
        'reports',
        'logs',
        'settings',
        'forms',
      ];
    } else if (rawUser.roleId) {
      if (roleSnap && roleSnap.exists()) {
        const roleData = roleSnap.data() as Partial<Role>;
        roleName = roleData.name || roleName;
        accessRights = roleData.accessRights || accessRights;
      } else if (rawUser.tenantId && rawUser.roleId === `admin-role_${rawUser.tenantId}`) {
        roleName = 'Administrator';
        accessRights = Array.from(new Set([...accessRights, 'Settings']));
      } else if (rawUser.tenantId && rawUser.roleId === `client-role_${rawUser.tenantId}`) {
        roleName = 'Client';
        accessRights = [];
      }
    }

    // 3. Resolve Tenant Information
    let tenantName = rawUser.tenantName || '';
    let tenantSlug = '';

    if (!isSuperAdmin && rawUser.tenantId) {
      if (!tenantSnap || !tenantSnap.exists()) {
        return {
          success: false,
          isRevoked: true,
          reason: 'profile_error',
          error: 'Organization not found in database.',
        };
      }

      const tenantData = tenantSnap.data() as Partial<Tenant>;
      if (tenantData.billingStatus === 'Cancelled') {
        return {
          success: false,
          isRevoked: true,
          reason: 'profile_error',
          error: 'Organization subscription is cancelled. Please contact support.',
        };
      }

      tenantName = tenantData.company || (tenantData as any).name || tenantData.slug || rawUser.tenantName || 'Amia Studios';
      tenantSlug = tenantData.slug || '';
      tenantModules = tenantData.enabledModules || tenantModules;
    }

    const firstName = rawUser.firstName || '';
    const lastName = rawUser.lastName || '';
    const computedName = `${firstName} ${lastName}`.trim() || rawUser.email || email || 'Kuro User';

    const profile: UserProfile = {
      uid,
      id: uid,
      email: rawUser.email || email || '',
      firstName,
      lastName,
      name: computedName,
      avatarUrl: rawUser.avatarUrl || '',
      position: rawUser.position || '',
      contactNumber: rawUser.contactNumber || '',
      roleId: rawUser.roleId || '',
      role: roleName,
      accessRights,
      tenantId: rawUser.tenantId || (isSuperAdmin ? 'root' : ''),
      tenantName,
      tenantSlug,
      enabledModules: tenantModules,
      authProvider: auth.currentUser?.providerData[0]?.providerId || 'password',
      lastLoggedIn: new Date().toISOString(),
      sessionId: rawUser.sessionId,
      status: rawUser.status || 'Active',
      disabled: rawUser.disabled || false,
    };

    return { success: true, profile };

  } catch (error: any) {
    logAuthError('getUserProfile', error);

    const isTransient =
      error?.code === 'unavailable' ||
      error?.code === 'deadline-exceeded' ||
      error?.message?.toLowerCase().includes('network') ||
      error?.message?.toLowerCase().includes('offline') ||
      error?.message?.toLowerCase().includes('failed to fetch');

    const isRevoked =
      error?.code === 'permission-denied' ||
      error?.code === 'unauthenticated' ||
      error?.code === 'auth/user-disabled' ||
      error?.code === 'auth/user-token-expired';

    return {
      success: false,
      isTransient,
      isRevoked,
      reason: isRevoked ? 'auth_revoked' : undefined,
      error: error?.message || 'Failed to load user profile.',
    };
  }
}

/**
 * Sign out current user, clean up RTDB presence, reset auth.tenantId, and clear AsyncStorage.
 */
export async function signOutUser(reason: LogoutReason = 'manual'): Promise<void> {
  try {
    const currentUid = auth.currentUser?.uid;

    // 1. Teardown RTDB online presence and active connection records
    if (currentUid && reason !== 'session') {
      await stopPresence(currentUid).catch(() => {});
    }

    // 2. Teardown background GPS tracking if active
    try {
      const { stopTrackingJob } = require('./location-tracking-service');
      if (typeof stopTrackingJob === 'function') {
        await stopTrackingJob();
      }
    } catch {}

    // 3. Clear equipment cache and notify identity loss
    try {
      const { clearEquipmentCache, handleAuthIdentityChange } = require('./equipment-cache');
      if (typeof clearEquipmentCache === 'function') {
        clearEquipmentCache();
      }
      if (typeof handleAuthIdentityChange === 'function') {
        handleAuthIdentityChange(null);
      }
    } catch {}

    // 4. Store logout notice for display after navigation
    if (reason !== 'manual') {
      const notice = createLogoutNotice(reason);
      await AsyncStorage.setItem(STORAGE_KEYS.LOGOUT_NOTICE, JSON.stringify(notice));
    }

    // 5. Clear cached profile, tokens, session, and tenant lookup from AsyncStorage
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.AUTH_TENANT_ID,
      STORAGE_KEYS.SESSION_ID,
      STORAGE_KEYS.TENANT_LOOKUP,
    ]);

    // 6. Reset tenant scoping on Firebase Auth
    auth.tenantId = null;

    // 7. Sign out from Firebase Auth
    await firebaseSignOut(auth);

  } catch (error: any) {
    logAuthError('signOutUser', error);
    // Ensure auth tenantId and storage are cleared even on error
    auth.tenantId = null;
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.AUTH_TENANT_ID,
      STORAGE_KEYS.SESSION_ID,
      STORAGE_KEYS.TENANT_LOOKUP,
    ]).catch(() => {});
    await firebaseSignOut(auth).catch(() => {});
  }
}

/**
 * Restore user session from AsyncStorage on cold boot.
 */
export async function restoreSession(): Promise<{
  restored: boolean;
  profile?: UserProfile;
  authTenantId?: string | null;
  error?: string;
}> {
  try {
    const [cachedProfileJson, cachedTenantId] = await AsyncStorage.multiGet([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.AUTH_TENANT_ID,
    ]);

    if (!cachedProfileJson[1]) {
      return { restored: false };
    }

    const profile = JSON.parse(cachedProfileJson[1]) as UserProfile;
    const authTenantId = cachedTenantId[1] || null;

    // Restore tenantId on auth instance
    auth.tenantId = authTenantId;

    return {
      restored: true,
      profile,
      authTenantId,
    };
  } catch (error: any) {
    console.warn('[authService] Failed to restore session from cache:', error);
    return { restored: false, error: error.message };
  }
}

/**
 * Send password reset email with proper tenant scoping.
 */
export async function sendTenantPasswordReset(
  email: string,
  authTenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!email || !email.trim()) {
      return { success: false, error: 'Email address is required.' };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // If authTenantId not provided, attempt lookup first
    let resolvedTenantId = authTenantId;
    if (resolvedTenantId === undefined) {
      const lookup = await lookupAuthTenantId(normalizedEmail);
      resolvedTenantId = lookup.authTenantId;
    }

    auth.tenantId = resolvedTenantId || null;
    await sendPasswordResetEmail(auth, normalizedEmail);

    return { success: true };
  } catch (error: any) {
    logAuthError('sendTenantPasswordReset', error);
    return {
      success: false,
      error: error.message || 'Failed to send password reset email.',
    };
  }
}

/**
 * Generate human-readable logout notice details based on reason.
 */
export function createLogoutNotice(reason: LogoutReason): LogoutNotice {
  const timestamp = new Date().toLocaleTimeString();
  switch (reason) {
    case 'idle':
      return {
        title: 'Logged Out Due to Inactivity',
        description: 'You have been automatically logged out due to inactivity.',
        variant: 'default',
        reason,
        timestamp,
      };
    case 'session':
      return {
        title: 'Session Terminated',
        description: 'Your account was signed in from another device or browser tab.',
        variant: 'destructive',
        reason,
        timestamp,
      };
    case 'admin_force':
      return {
        title: 'Session Terminated by Administrator',
        description: 'A system administrator has terminated your active session.',
        variant: 'destructive',
        reason,
        timestamp,
      };
    case 'profile_error':
      return {
        title: 'Profile Verification Failed',
        description: 'Your user profile could not be verified in the database. Please sign in again.',
        variant: 'destructive',
        reason,
        timestamp,
      };
    case 'auth_revoked':
      return {
        title: 'Session Expired',
        description: 'Your authentication token has expired. Please sign in again.',
        variant: 'default',
        reason,
        timestamp,
      };
    default:
      return {
        title: 'Logged Out',
        description: 'You have been logged out successfully.',
        variant: 'default',
        reason,
        timestamp,
      };
  }
}

/**
 * Formats Firebase / Cloud Function / Auth errors into clean, user-friendly messages
 */
export function formatAuthError(error: any): Error {
  const code = error?.code || '';
  let message = 'An unexpected error occurred. Please try again.';
  switch (code) {
    case 'functions/invalid-argument':
      message = 'Please enter a valid email address.';
      break;
    case 'functions/not-found':
      message = 'No account found with this email address.';
      break;
    case 'functions/permission-denied':
      message = 'Your account has been deactivated. Please contact your administrator.';
      break;
    case 'functions/failed-precondition':
      message = 'Your organization is not configured for mobile login.';
      break;
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      message = 'Invalid email or password.';
      break;
    case 'auth/user-disabled':
      message = 'This user account has been disabled.';
      break;
    case 'auth/too-many-requests':
      message = 'Too many failed attempts. Please try again later.';
      break;
    case 'auth/network-request-failed':
    case 'functions/unavailable':
      message = 'Network error. Please check your internet connection.';
      break;
    default:
      if (error?.message) message = error.message;
      break;
  }
  return new Error(message);
}

/**
 * Helper: Complete multi-tenant login handler
 * 1. Resolves tenant ID via Cloud Function
 * 2. Sets auth.tenantId
 * 3. Authenticates with email & password
 */
export async function loginWithTenant(email: string, password: string): Promise<UserProfile> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error('Please enter both email and password.');
  }

  const lookupResult = await lookupAuthTenantId(normalizedEmail);
  if (!lookupResult.success) {
    throw new Error(lookupResult.error || 'User not found.');
  }

  const result = await signInWithTenant(normalizedEmail, password, lookupResult.authTenantId);
  if (!result.success || !result.user) {
    throw new Error(result.error || 'Authentication failed.');
  }

  return result.user;
}

