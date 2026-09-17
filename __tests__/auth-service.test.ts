/**
 * __tests__/auth-service.test.ts
 * Unit tests for Kuro Mobile Authentication & Multi-Tenancy Engine
 */

import {
  lookupAuthTenantId,
  signInWithTenant,
  getUserProfile,
  signOutUser,
  restoreSession,
  sendTenantPasswordReset,
  createLogoutNotice,
  STORAGE_KEYS,
  getCachedTenantLookup,
  clearCachedTenantLookup,
} from '../src/services/auth-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../src/lib/firebase';
import * as firestore from 'firebase/firestore';
import * as firebaseAuth from 'firebase/auth';

jest.mock('firebase/firestore');
jest.mock('firebase/auth');

describe('Kuro Mobile Multi-Tenant Authentication Engine', () => {
  const mockEmail = 'tan@amiastudios.com';
  const mockPassword = 'SecurePassword123!';
  const mockTenantId = 'tenant-amia-101';
  const mockAuthTenantId = 'kuro-tenant-amia-xyz';
  const mockUid = 'uid-tan-123';

  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
  });

  describe('createLogoutNotice', () => {
    it('creates accurate notice for session eviction', () => {
      const notice = createLogoutNotice('session');
      expect(notice.title).toBe('Session Terminated');
      expect(notice.variant).toBe('destructive');
      expect(notice.reason).toBe('session');
      expect(notice.description).toContain('signed in from another device');
    });

    it('creates accurate notice for admin force logout', () => {
      const notice = createLogoutNotice('admin_force');
      expect(notice.title).toBe('Session Terminated by Administrator');
      expect(notice.variant).toBe('destructive');
      expect(notice.reason).toBe('admin_force');
    });

    it('creates accurate notice for idle timeout', () => {
      const notice = createLogoutNotice('idle');
      expect(notice.title).toBe('Logged Out Due to Inactivity');
      expect(notice.variant).toBe('default');
    });

    it('creates accurate notice for profile error', () => {
      const notice = createLogoutNotice('profile_error');
      expect(notice.title).toBe('Profile Verification Failed');
      expect(notice.variant).toBe('destructive');
    });
  });

  describe('lookupAuthTenantId', () => {
    it('returns error when email is empty', async () => {
      const result = await lookupAuthTenantId('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Email address is required.');
    });

    it('returns error when user is not found in database', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      const result = await lookupAuthTenantId('unknown@example.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });

    it('rejects inactive or disabled users', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: mockUid,
            data: () => ({
              email: mockEmail,
              status: 'Inactive',
              tenantId: mockTenantId,
            }),
          },
        ],
      });

      const result = await lookupAuthTenantId(mockEmail);
      expect(result.success).toBe(false);
      expect(result.error).toContain('inactive or disabled');
    });

    it('resolves Super Administrator with null authTenantId (project level)', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: mockUid,
            data: () => ({
              email: 'admin@amiastudios.com',
              status: 'Active',
              roleId: 'super-admin-role',
              accessRights: ['Super Administrator'],
            }),
          },
        ],
      });

      const result = await lookupAuthTenantId('admin@amiastudios.com');
      expect(result.success).toBe(true);
      expect(result.authTenantId).toBeNull();
      expect(result.isSuperAdmin).toBe(true);
    });

    it('resolves tenant user with Identity Platform authTenantId', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: mockUid,
            data: () => ({
              email: mockEmail,
              status: 'Active',
              tenantId: mockTenantId,
              roleId: 'technician-role',
            }),
          },
        ],
      });

      // Role doc check (non-super-admin)
      (firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          name: 'Field Technician',
          accessRights: ['events.view', 'inventory.view'],
        }),
      });

      // Tenant doc check
      (firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          company: 'Amia Studios',
          slug: 'amia',
          authTenantId: mockAuthTenantId,
          billingStatus: 'Active',
        }),
      });

      const result = await lookupAuthTenantId(mockEmail);
      expect(result.success).toBe(true);
      expect(result.authTenantId).toBe(mockAuthTenantId);
      expect(result.tenantName).toBe('Amia Studios');
      expect(result.isSuperAdmin).toBe(false);
    });

    it('gracefully handles malformed roleDocSnap without crashing on exists()', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: mockUid,
            data: () => ({
              email: mockEmail,
              status: 'Active',
              tenantId: mockTenantId,
              roleId: 'malformed-role',
            }),
          },
        ],
      });

      // Role doc check with null/undefined exists
      (firestore.getDoc as jest.Mock).mockResolvedValueOnce(null);

      // Tenant doc check
      (firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          company: 'Amia Studios',
          slug: 'amia',
          authTenantId: mockAuthTenantId,
          billingStatus: 'Active',
        }),
      });

      const result = await lookupAuthTenantId(mockEmail);
      expect(result.success).toBe(true);
      expect(result.isSuperAdmin).toBe(false);
    });
  });

  describe('restoreSession', () => {
    it('returns restored: false when no session is cached', async () => {
      const result = await restoreSession();
      expect(result.restored).toBe(false);
    });

    it('restores cached profile and sets auth.tenantId', async () => {
      const mockProfile = {
        uid: mockUid,
        id: mockUid,
        email: mockEmail,
        name: 'Tan Amia',
        firstName: 'Tan',
        lastName: 'Amia',
        avatarUrl: '',
        roleId: 'role-1',
        role: 'Administrator',
        accessRights: ['events'],
        tenantId: mockTenantId,
        tenantName: 'Amia Studios',
        enabledModules: ['events'],
        authProvider: 'password',
        lastLoggedIn: new Date().toISOString(),
        status: 'Active',
      };

      await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(mockProfile));
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TENANT_ID, mockAuthTenantId);

      const result = await restoreSession();
      expect(result.restored).toBe(true);
      expect(result.profile?.name).toBe('Tan Amia');
      expect(result.authTenantId).toBe(mockAuthTenantId);
      expect(auth.tenantId).toBe(mockAuthTenantId);
    });
  });

  describe('signOutUser', () => {
    it('clears AsyncStorage cached session keys and signs out from Firebase', async () => {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify({ uid: '123' }));
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TENANT_ID, mockAuthTenantId);

      await signOutUser('manual');

      const cachedProfile = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      const cachedTenant = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TENANT_ID);

      expect(cachedProfile).toBeNull();
      expect(cachedTenant).toBeNull();
      expect(auth.tenantId).toBeNull();
    });
  });

  describe('getUserProfile (Concurrent Profile Hydration)', () => {
    it('concurrently fetches role and tenant documents via Promise.all', async () => {
      const callLog: string[] = [];

      (firestore.doc as jest.Mock).mockImplementation((_db: any, collectionName: string, docId: string) => {
        return { collectionName, docId };
      });

      (firestore.getDoc as jest.Mock).mockImplementation(async (ref: any) => {
        if (ref?.collectionName === 'users') {
          callLog.push(`users:${ref.docId}`);
          return {
            exists: () => true,
            id: mockUid,
            data: () => ({
              email: mockEmail,
              status: 'Active',
              tenantId: mockTenantId,
              roleId: 'role-tech',
              firstName: 'Tan',
              lastName: 'Amia',
            }),
          };
        }
        if (ref?.collectionName === 'roles') {
          callLog.push(`roles:${ref.docId}`);
          await new Promise((r) => setTimeout(r, 10));
          return {
            exists: () => true,
            data: () => ({
              name: 'Audio Lead',
              accessRights: ['events.view', 'equipment.scan'],
            }),
          };
        }
        if (ref?.collectionName === 'tenants') {
          callLog.push(`tenants:${ref.docId}`);
          await new Promise((r) => setTimeout(r, 10));
          return {
            exists: () => true,
            data: () => ({
              company: 'Amia Studios',
              slug: 'amia',
              billingStatus: 'Active',
              enabledModules: ['events', 'inventory'],
            }),
          };
        }
        return { exists: () => false };
      });

      const result = await getUserProfile(mockUid, mockEmail);

      expect(result.success).toBe(true);
      expect(result.profile?.role).toBe('Audio Lead');
      expect(result.profile?.tenantName).toBe('Amia Studios');
      expect(result.profile?.accessRights).toEqual(['events.view', 'equipment.scan']);
      expect(callLog).toEqual([`users:${mockUid}`, 'roles:role-tech', `tenants:${mockTenantId}`]);
    });

    it('gracefully tolerates role fetch rejection while preserving tenant resolution', async () => {
      (firestore.doc as jest.Mock).mockImplementation((_db: any, collectionName: string, docId: string) => ({
        collectionName,
        docId,
      }));

      (firestore.getDoc as jest.Mock).mockImplementation(async (ref: any) => {
        if (ref?.collectionName === 'users') {
          return {
            exists: () => true,
            id: mockUid,
            data: () => ({
              email: mockEmail,
              status: 'Active',
              tenantId: mockTenantId,
              roleId: 'role-missing',
              role: 'Fallback Role',
            }),
          };
        }
        if (ref?.collectionName === 'roles') {
          throw new Error('Network error reading role doc');
        }
        if (ref?.collectionName === 'tenants') {
          return {
            exists: () => true,
            data: () => ({
              company: 'Amia Studios',
              billingStatus: 'Active',
            }),
          };
        }
        return { exists: () => false };
      });

      const result = await getUserProfile(mockUid, mockEmail);
      expect(result.success).toBe(true);
      expect(result.profile?.role).toBe('Fallback Role');
      expect(result.profile?.tenantName).toBe('Amia Studios');
    });

    it('fails with profile_error if tenant document is missing', async () => {
      (firestore.doc as jest.Mock).mockImplementation((_db: any, collectionName: string, docId: string) => ({
        collectionName,
        docId,
      }));

      (firestore.getDoc as jest.Mock).mockImplementation(async (ref: any) => {
        if (ref?.collectionName === 'users') {
          return {
            exists: () => true,
            id: mockUid,
            data: () => ({
              email: mockEmail,
              status: 'Active',
              tenantId: mockTenantId,
            }),
          };
        }
        if (ref?.collectionName === 'tenants') {
          return { exists: () => false };
        }
        return { exists: () => false };
      });

      const result = await getUserProfile(mockUid, mockEmail);
      expect(result.success).toBe(false);
      expect(result.isRevoked).toBe(true);
      expect(result.reason).toBe('profile_error');
      expect(result.error).toContain('Organization not found');
    });
  });

  describe('Cached Tenant Lookup Fast-Path', () => {
    it('returns null when no tenant lookup is cached', async () => {
      const cached = await getCachedTenantLookup(mockEmail);
      expect(cached).toBeNull();
    });

    it('returns cached result when normalized email matches', async () => {
      const lookupPayload = {
        success: true,
        tenantId: mockTenantId,
        tenantName: 'Amia Studios',
        authTenantId: mockAuthTenantId,
        email: mockEmail.toLowerCase(),
      };
      await AsyncStorage.setItem(STORAGE_KEYS.TENANT_LOOKUP, JSON.stringify(lookupPayload));

      const result = await getCachedTenantLookup('  Tan@AmiaStudios.com ');
      expect(result).not.toBeNull();
      expect(result?.tenantId).toBe(mockTenantId);
      expect(result?.tenantName).toBe('Amia Studios');
      expect(result?.authTenantId).toBe(mockAuthTenantId);
    });

    it('returns null when cached lookup email does not match requested email', async () => {
      const lookupPayload = {
        success: true,
        tenantId: mockTenantId,
        tenantName: 'Amia Studios',
        authTenantId: mockAuthTenantId,
        email: 'other@amiastudios.com',
      };
      await AsyncStorage.setItem(STORAGE_KEYS.TENANT_LOOKUP, JSON.stringify(lookupPayload));

      const result = await getCachedTenantLookup(mockEmail);
      expect(result).toBeNull();
    });

    it('clears cached tenant lookup on demand', async () => {
      await AsyncStorage.setItem(
        STORAGE_KEYS.TENANT_LOOKUP,
        JSON.stringify({ success: true, tenantId: 't-1', email: mockEmail })
      );

      await clearCachedTenantLookup();

      const item = await AsyncStorage.getItem(STORAGE_KEYS.TENANT_LOOKUP);
      expect(item).toBeNull();
    });
  });
});
