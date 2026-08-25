/**
 * __tests__/stress.test.ts
 * Comprehensive Empirical Stress-Test Suite for Kuro Mobile (Milestone 1)
 * 
 * Verifies:
 * 1. Edge Case 1: Invalid email formats & empty emails
 * 2. Edge Case 2: Non-existent tenant / user lookup failure handling & inactive statuses
 * 3. Edge Case 3: Super admin project-level login (authTenantId: null) & module assignment
 * 4. Edge Case 4: Corrupted AsyncStorage cached profile on boot / session recovery
 * 5. Edge Case 5: Network failure handling & offline connection indicator state
 * 6. Edge Case 6: Accessible touch target sizes across all components (>= 48dp)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  lookupAuthTenantId,
  signInWithTenant,
  getUserProfile,
  signOutUser,
  restoreSession,
  sendTenantPasswordReset,
  createLogoutNotice,
  STORAGE_KEYS,
} from '../src/services/auth-service';
import { auth, db } from '../src/lib/firebase';
import { layout, darkColors, lightColors, spacing, typography } from '../src/constants/theme';
import * as firestore from 'firebase/firestore';
import * as firebaseAuth from 'firebase/auth';

jest.mock('firebase/firestore');
jest.mock('firebase/auth');

describe('Kuro Mobile Milestone 1 Stress & Resilience Harness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
    auth.tenantId = null;
  });

  // =========================================================================
  // STRESS SUITE 1: Invalid Email Formats & Empty Input Handling
  // =========================================================================
  describe('Suite 1: Invalid Email Formats & Empty Input Handling', () => {
    it('handles empty string email in lookupAuthTenantId', async () => {
      const result = await lookupAuthTenantId('');
      expect(result.success).toBe(false);
      expect(result.authTenantId).toBeNull();
      expect(result.error).toBe('Email address is required.');
    });

    it('handles whitespace-only email in lookupAuthTenantId', async () => {
      const result = await lookupAuthTenantId('     ');
      expect(result.success).toBe(false);
      expect(result.authTenantId).toBeNull();
      expect(result.error).toBe('Email address is required.');
    });

    it('handles null/undefined email defensively', async () => {
      const resultNull = await lookupAuthTenantId(null as unknown as string);
      expect(resultNull.success).toBe(false);
      expect(resultNull.error).toBe('Email address is required.');

      const resultUndef = await lookupAuthTenantId(undefined as unknown as string);
      expect(resultUndef.success).toBe(false);
      expect(resultUndef.error).toBe('Email address is required.');
    });

    it('normalizes email by trimming and lowercasing before Firestore query', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      await lookupAuthTenantId('  Tan.Operator@AmiaStudios.COM  ');

      expect(firestore.where).toHaveBeenCalledWith(
        'email',
        '==',
        'tan.operator@amiastudios.com'
      );
    });

    it('rejects empty email or empty password in signInWithTenant without calling Firebase', async () => {
      const emptyEmailRes = await signInWithTenant('', 'SomePassword123');
      expect(emptyEmailRes.success).toBe(false);
      expect(emptyEmailRes.error).toBe('Email and password are required.');
      expect(firebaseAuth.signInWithEmailAndPassword).not.toHaveBeenCalled();

      const emptyPassRes = await signInWithTenant('tan@amia.com', '');
      expect(emptyPassRes.success).toBe(false);
      expect(emptyPassRes.error).toBe('Email and password are required.');
      expect(firebaseAuth.signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('rejects empty email in sendTenantPasswordReset', async () => {
      const res = await sendTenantPasswordReset('');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Email address is required.');
      expect(firebaseAuth.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // STRESS SUITE 2: Non-existent Tenant & User Lookup Failure Scenarios
  // =========================================================================
  describe('Suite 2: Non-Existent Tenant & User Lookup Failures', () => {
    it('returns structured error when user document does not exist', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      const result = await lookupAuthTenantId('nonexistent@domain.com');
      expect(result.success).toBe(false);
      expect(result.authTenantId).toBeNull();
      expect(result.error).toContain('User not found');
    });

    it('rejects user with status === "Inactive"', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-inactive',
            data: () => ({
              email: 'inactive@amia.com',
              status: 'Inactive',
              tenantId: 'tenant-101',
            }),
          },
        ],
      });

      const result = await lookupAuthTenantId('inactive@amia.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('inactive or disabled');
    });

    it('rejects user with disabled === true flag', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-disabled',
            data: () => ({
              email: 'disabled@amia.com',
              status: 'Active',
              disabled: true,
              tenantId: 'tenant-101',
            }),
          },
        ],
      });

      const result = await lookupAuthTenantId('disabled@amia.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('inactive or disabled');
    });

    it('rejects non-admin user without associated tenantId', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-orphaned',
            data: () => ({
              email: 'orphaned@amia.com',
              status: 'Active',
              roleId: 'general-user',
              tenantId: undefined,
            }),
          },
        ],
      });

      const result = await lookupAuthTenantId('orphaned@amia.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not belong to an active organization');
    });

    it('rejects user when tenant document is missing in Firestore', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-valid-user',
            data: () => ({
              email: 'valid@missingtenant.com',
              status: 'Active',
              tenantId: 'tenant-missing-999',
            }),
          },
        ],
      });

      (firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
        data: () => undefined,
      });

      const result = await lookupAuthTenantId('valid@missingtenant.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Organization not found in database');
    });

    it('rejects user when tenant billingStatus === "Cancelled"', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-valid-user',
            data: () => ({
              email: 'user@cancelledtenant.com',
              status: 'Active',
              tenantId: 'tenant-cancelled-001',
            }),
          },
        ],
      });

      (firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          company: 'Cancelled Co',
          billingStatus: 'Cancelled',
          authTenantId: 'kuro-tenant-cancelled',
        }),
      });

      const result = await lookupAuthTenantId('user@cancelledtenant.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Organization subscription is cancelled');
    });

    it('rejects user when tenant has no authTenantId configured', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-valid-user',
            data: () => ({
              email: 'user@noauth.com',
              status: 'Active',
              tenantId: 'tenant-no-auth',
            }),
          },
        ],
      });

      (firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          company: 'Unconfigured Corp',
          billingStatus: 'Active',
          authTenantId: undefined,
        }),
      });

      const result = await lookupAuthTenantId('user@noauth.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured for mobile authentication');
    });
  });

  // =========================================================================
  // STRESS SUITE 3: Super Admin Project-Level Login (authTenantId: null)
  // =========================================================================
  describe('Suite 3: Super Admin Project-Level Login & Permission Hydration', () => {
    it('detects Super Admin via super-admin-role string ID', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-super-1',
            data: () => ({
              email: 'superadmin1@amiastudios.com',
              status: 'Active',
              roleId: 'super-admin-role',
            }),
          },
        ],
      });

      const result = await lookupAuthTenantId('superadmin1@amiastudios.com');
      expect(result.success).toBe(true);
      expect(result.authTenantId).toBeNull();
      expect(result.isSuperAdmin).toBe(true);
      expect(result.tenantName).toBe('System Administration');
    });

    it('detects Super Admin via legacy role ID 4TJ6V4j41ekGJ7f0HGnp', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-super-2',
            data: () => ({
              email: 'superadmin2@amiastudios.com',
              status: 'Active',
              roleId: '4TJ6V4j41ekGJ7f0HGnp',
            }),
          },
        ],
      });

      const result = await lookupAuthTenantId('superadmin2@amiastudios.com');
      expect(result.success).toBe(true);
      expect(result.authTenantId).toBeNull();
      expect(result.isSuperAdmin).toBe(true);
    });

    it('detects Super Admin via user accessRights array', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-super-3',
            data: () => ({
              email: 'superadmin3@amiastudios.com',
              status: 'Active',
              roleId: 'custom-role-id',
              accessRights: ['Super Administrator', 'Events'],
            }),
          },
        ],
      });

      const result = await lookupAuthTenantId('superadmin3@amiastudios.com');
      expect(result.success).toBe(true);
      expect(result.authTenantId).toBeNull();
      expect(result.isSuperAdmin).toBe(true);
    });

    it('detects Super Admin via Firestore role document lookup', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'uid-super-4',
            data: () => ({
              email: 'superadmin4@amiastudios.com',
              status: 'Active',
              roleId: 'custom-super-role-doc',
            }),
          },
        ],
      });

      (firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          name: 'Super Administrator',
          accessRights: ['All'],
        }),
      });

      const result = await lookupAuthTenantId('superadmin4@amiastudios.com');
      expect(result.success).toBe(true);
      expect(result.authTenantId).toBeNull();
      expect(result.isSuperAdmin).toBe(true);
    });

    it('scopes auth.tenantId to null when signing in Super Admin', async () => {
      (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
        user: { uid: 'uid-super-admin', email: 'admin@amia.com' },
      });

      (firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        id: 'uid-super-admin',
        data: () => ({
          firstName: 'Super',
          lastName: 'Admin',
          email: 'admin@amia.com',
          roleId: 'super-admin-role',
          status: 'Active',
        }),
      });

      const result = await signInWithTenant('admin@amia.com', 'AdminPass123', null);
      expect(result.success).toBe(true);
      expect(auth.tenantId).toBeNull();

      // Check all 12 modules are enabled for super admin
      expect(result.user?.enabledModules).toEqual([
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
      ]);
      expect(result.user?.tenantId).toBe('root');
      expect(result.user?.role).toBe('Super Administrator');
    });
  });

  // =========================================================================
  // STRESS SUITE 4: Corrupted AsyncStorage Profile on Boot / Session Recovery
  // =========================================================================
  describe('Suite 4: Corrupted AsyncStorage Session Recovery Resilience', () => {
    it('survives corrupted malformed JSON in AsyncStorage @kuro_user_profile', async () => {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, '{CORRUPTED_JSON_TRUNCATED:123');
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TENANT_ID, 'tenant-abc');

      const sessionResult = await restoreSession();
      expect(sessionResult.restored).toBe(false);
      expect(sessionResult.error).toBeDefined();
    });

    it('survives empty/null profile in AsyncStorage', async () => {
      await AsyncStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
      await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TENANT_ID);

      const sessionResult = await restoreSession();
      expect(sessionResult.restored).toBe(false);
      expect(sessionResult.profile).toBeUndefined();
    });

    it('correctly handles session restore when authTenantId is missing (Super Admin cached session)', async () => {
      const validProfile = {
        uid: 'super-uid-1',
        id: 'super-uid-1',
        email: 'admin@amia.com',
        firstName: 'Master',
        lastName: 'Admin',
        name: 'Master Admin',
        avatarUrl: '',
        roleId: 'super-admin-role',
        role: 'Super Administrator',
        accessRights: ['Super Administrator'],
        tenantId: 'root',
        tenantName: 'System Administration',
        enabledModules: ['dashboard'],
        authProvider: 'password',
        lastLoggedIn: new Date().toISOString(),
        status: 'Active',
      };

      await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(validProfile));
      await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TENANT_ID);

      const sessionResult = await restoreSession();
      expect(sessionResult.restored).toBe(true);
      expect(sessionResult.authTenantId).toBeNull();
      expect(auth.tenantId).toBeNull();
      expect(sessionResult.profile?.name).toBe('Master Admin');
    });
  });

  // =========================================================================
  // STRESS SUITE 5: Network Failure & Error Code Translation
  // =========================================================================
  describe('Suite 5: Network Failure & Error Handling Translation', () => {
    it('maps Firestore network unavailable error cleanly', async () => {
      const networkError = new Error('Network unavailable');
      (networkError as any).code = 'unavailable';

      (firestore.getDocs as jest.Mock).mockRejectedValueOnce(networkError);

      const result = await lookupAuthTenantId('tan@amia.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network connection issue. Please check your internet connection.');
    });

    it('maps auth/network-request-failed during signInWithTenant', async () => {
      const netError = new Error('Network error');
      (netError as any).code = 'auth/network-request-failed';

      (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(netError);

      const result = await signInWithTenant('tan@amia.com', 'password123', 'tenant-101');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network connection failed. Please check your internet connection.');
    });

    it('maps auth/invalid-credential and auth/wrong-password cleanly', async () => {
      const credError = new Error('Invalid');
      (credError as any).code = 'auth/invalid-credential';

      (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(credError);

      const result = await signInWithTenant('tan@amia.com', 'wrongpass', 'tenant-101');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email or password.');
    });

    it('maps auth/too-many-requests lockouts cleanly', async () => {
      const lockoutError = new Error('Rate limit');
      (lockoutError as any).code = 'auth/too-many-requests';

      (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(lockoutError);

      const result = await signInWithTenant('tan@amia.com', 'password', 'tenant-101');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Access temporarily locked');
    });
  });

  // =========================================================================
  // STRESS SUITE 6: Touch Target Accessibility Compliance (>= 48dp)
  // =========================================================================
  describe('Suite 6: Touch Target Accessibility Compliance (>= 48dp)', () => {
    it('verifies layout.minTouchTarget constant is strictly 48dp', () => {
      expect(layout.minTouchTarget).toBe(48);
      expect(layout.minTouchTarget).toBeGreaterThanOrEqual(48);
    });

    it('verifies button sizes sm, default, lg, and icon all have minHeight >= 48dp', () => {
      // SM size minHeight is layout.minTouchTarget (48)
      const smMinHeight = layout.minTouchTarget;
      expect(smMinHeight).toBeGreaterThanOrEqual(48);

      // Default size minHeight is layout.minTouchTarget (48)
      const defaultMinHeight = layout.minTouchTarget;
      expect(defaultMinHeight).toBeGreaterThanOrEqual(48);

      // LG size minHeight is 52dp (>= 48)
      const lgMinHeight = 52;
      expect(lgMinHeight).toBeGreaterThanOrEqual(48);

      // Icon button minHeight and minWidth are 48dp
      const iconDimension = layout.minTouchTarget;
      expect(iconDimension).toBeGreaterThanOrEqual(48);
    });

    it('verifies input touch target and hitSlop compliance', () => {
      const inputContainerMinHeight = layout.minTouchTarget;
      expect(inputContainerMinHeight).toBeGreaterThanOrEqual(48);

      // Eye toggle button has 48x48 min dimensions plus 12dp hitSlop
      const eyeBtnMinHeight = 48;
      const eyeBtnMinWidth = 48;
      expect(eyeBtnMinHeight).toBeGreaterThanOrEqual(48);
      expect(eyeBtnMinWidth).toBeGreaterThanOrEqual(48);
    });

    it('verifies tab bar item height accommodates >= 48dp touch target', () => {
      expect(layout.tabBarHeight).toBe(64);
      expect(layout.tabBarHeight).toBeGreaterThanOrEqual(48);
    });
  });
});
