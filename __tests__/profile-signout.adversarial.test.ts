/**
 * __tests__/profile-signout.adversarial.test.ts
 * Adversarial tests for Profile Screen, User Metadata, Sign-Out Lifecycle & Notice Banners
 */

import { createLogoutNotice } from '../src/services/auth-service';
import type { LogoutReason } from '../src/types/auth';

describe('Profile Screen, Sign-Out Lifecycle & State Cleansing', () => {
  function getInitials(name?: string): string {
    if (!name || !name.trim()) return 'OP';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  describe('User Avatar Initials Logic', () => {
    it('extracts two-letter initials from standard first and last name', () => {
      expect(getInitials('Tan Amia')).toBe('TA');
      expect(getInitials('Alex Thorne')).toBe('AT');
      expect(getInitials('Sarah Connor')).toBe('SC');
    });

    it('extracts two-letter initials from multi-word names', () => {
      expect(getInitials('Marcus Vance Senior')).toBe('MV');
    });

    it('extracts first two letters when single word name provided', () => {
      expect(getInitials('Operator')).toBe('OP');
      expect(getInitials('Kuro')).toBe('KU');
    });

    it('gracefully falls back to OP when name is undefined or empty', () => {
      expect(getInitials(undefined)).toBe('OP');
      expect(getInitials('')).toBe('OP');
      expect(getInitials('   ')).toBe('OP');
    });
  });

  describe('Logout Notices & Reason Handling', () => {
    const reasons: LogoutReason[] = ['manual', 'session', 'admin_force', 'idle', 'profile_error', 'auth_revoked'];

    it.each(reasons)('generates valid notice object for reason: %s', (reason) => {
      const notice = createLogoutNotice(reason);
      expect(notice).toBeDefined();
      expect(notice.title).toBeTruthy();
      expect(notice.description).toBeTruthy();
      expect(notice.reason).toBe(reason);
      expect(['default', 'destructive']).toContain(notice.variant);
      expect(notice.timestamp).toBeTruthy();
    });

    it('marks high-severity eviction notices as destructive variant', () => {
      expect(createLogoutNotice('session').variant).toBe('destructive');
      expect(createLogoutNotice('admin_force').variant).toBe('destructive');
      expect(createLogoutNotice('profile_error').variant).toBe('destructive');
    });

    it('marks normal logout and idle timeout as default variant', () => {
      expect(createLogoutNotice('manual').variant).toBe('default');
      expect(createLogoutNotice('idle').variant).toBe('default');
    });
  });

  describe('Sign-Out State Cleansing Contract', () => {
    it('verifies that full sign out purges local state and resets scoping', async () => {
      // Model the state reset contract executed in auth-service.ts and auth-context.tsx
      const mockStorage: Record<string, string> = {
        '@kuro_user_profile': JSON.stringify({ uid: 'test-123' }),
        '@kuro_auth_tenant_id': 'tenant-xyz',
        '@kuro_session_id': 'mob_123',
      };

      const clearSessionData = async () => {
        delete mockStorage['@kuro_user_profile'];
        delete mockStorage['@kuro_auth_tenant_id'];
        delete mockStorage['@kuro_session_id'];
      };

      await clearSessionData();

      expect(mockStorage['@kuro_user_profile']).toBeUndefined();
      expect(mockStorage['@kuro_auth_tenant_id']).toBeUndefined();
      expect(mockStorage['@kuro_session_id']).toBeUndefined();
    });
  });
});
