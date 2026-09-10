/**
 * src/types/auth.ts
 * Authoritative TypeScript interfaces for Kuro Mobile Authentication, Multi-Tenancy,
 * User Profiles, Roles, and Session Management.
 */

import type { User as FirebaseUser } from 'firebase/auth';

/**
 * Base User document representation from Firestore `users/{uid}` collection.
 */
export interface User {
  id: string;                      // Firestore Document ID & Firebase Auth UID
  rentmanId?: string | null;       // Legacy Rentman integration ID
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string;
  roleId: string;                  // References `roles/{roleId}` or system role ID
  role?: string;                   // Populated display role name (e.g. 'Administrator', 'Technician')
  accessRights?: string[];         // Resolved granular permission strings
  position?: string;               // Job title / position
  contactNumber?: string;          // Contact telephone
  tenantId?: string;               // Firestore tenant document ID
  tenantName?: string;             // Display name of associated Tenant
  enabledModules?: string[];       // Tenant-level enabled modules
  lastLoggedIn?: string;           // ISO 8601 timestamp string
  sessionId?: string;              // Single-session enforcement ID
  name?: string;                   // Computed full name: `${firstName} ${lastName}`
  contactClientId?: string;        // Assigned Contact ID for client roles
  authProvider?: string;           // 'password', 'google.com', etc.
  status?: 'Active' | 'Inactive' | 'Pending';
  disabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Enriched User Profile state stored in memory and cached in AsyncStorage.
 */
export interface UserProfile {
  uid: string;                     // Primary Auth UID
  id: string;                      // Alias to UID
  email: string;
  firstName: string;
  lastName: string;
  name: string;                    // Full display name
  avatarUrl: string;
  position?: string;
  contactNumber?: string;
  roleId: string;
  role: string;                    // Display role name
  accessRights: string[];          // Permission flags
  tenantId: string;                // Firestore Tenant Document ID
  tenantName?: string;             // Display company name
  tenantSlug?: string;             // Subdomain / identifier slug
  enabledModules: string[];        // Active modules allowed for this tenant
  authProvider: string;            // Primary login provider ID
  lastLoggedIn: string;            // ISO timestamp
  sessionId?: string;              // Current active session UUID
  status: string;                  // 'Active' | 'Inactive' | 'Pending'
  disabled?: boolean;
}

/**
 * Tenant document representation from Firestore `tenants/{tenantId}` collection.
 */
export interface Tenant {
  id: string;                      // Firestore Document ID
  company: string;                 // Company Name
  slug: string;                    // Subdomain / identifier slug
  adminUserId: string;             // UID of primary administrator
  email: string;                   // Billing / contact email
  phone?: string;
  website?: string;
  timeZone?: string;
  createdAt: string;
  updatedAt: string;
  planId?: string;
  subscriptionEndDate?: Date | string | null;
  billingStatus: 'Active' | 'Trial' | 'Past Due' | 'Cancelled';
  street?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
  enabledModules?: string[];       // e.g. ['dashboard', 'events', 'logistics', 'dispatch', 'repair', 'inventory', 'contacts', 'users', 'settings']
  authTenantId?: string;           // Google Cloud Identity Platform Tenant ID (e.g. 'kuro-tenant-xxxx')
  internalNotes?: string;
  storageUsageMB?: number;
  logoUrl?: string;
  taxId?: string;
  lastLedgerAuditAt?: string | null;
}

/**
 * Result returned by Step 1 email lookup for tenant resolution.
 */
export interface TenantLookupResult {
  success: boolean;
  authTenantId: string | null;     // null indicates Project-Level Auth (Super Admin), string indicates Identity Platform Tenant
  tenantId?: string;               // Firestore Tenant Doc ID
  tenantName?: string;             // Human-readable company name for UI badge
  tenantSlug?: string;             // Slug identifier
  isSuperAdmin?: boolean;          // True if user belongs to project-level root auth
  error?: string;
}

/**
 * Role document representation from Firestore `roles/{roleId}` collection.
 */
export interface Role {
  id: string;                      // Role doc ID or synthesized ID (`admin-role_${tenantId}`)
  name: string;                    // Role display name (e.g., 'Administrator', 'Technician', 'Warehouse Lead')
  notes?: string;
  accessRights?: string[];         // Granular permission keys
  tenantId?: string;               // Associated tenant ID
  displayInSelection?: boolean;
  displayInTree?: boolean;
  canCreateUsers?: boolean;
  order?: number;
}

/**
 * Reason for session termination.
 */
export type LogoutReason = 
  | 'manual'                       // User tapped sign out
  | 'session'                      // Evicted due to sign-in on another device
  | 'admin_force'                  // Force kicked by system administrator via RTDB
  | 'idle'                         // Inactivity timeout
  | 'profile_error'                // User profile verification failed in Firestore
  | 'auth_revoked'                 // Firebase auth token revoked / expired
  | 'auth_required';               // Navigation to protected route without session

/**
 * Persistent or transient notification banner shown upon logout.
 */
export interface LogoutNotice {
  title: string;
  description: string;
  variant: 'default' | 'destructive';
  reason: LogoutReason;
  timestamp: string;
}

/**
 * Realtime presence state tracked in RTDB `/presence/${uid}`.
 */
export interface PresenceState {
  isOnline: boolean;
  lastChanged: number;
  activeSessionId: string | null;
  connectionsCount: number;
}

/**
 * Result returned by profile hydration.
 */
export interface UserProfileResult {
  success: boolean;
  profile?: UserProfile;
  isTransient?: boolean;
  isRevoked?: boolean;
  reason?: LogoutReason;
  error?: string;
}

/**
 * Internal Auth Context State.
 */
export interface AuthState {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  tenant: TenantLookupResult | null;
  role: Role | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  isOfflineSession: boolean;
  pendingRedirectUrl: string | null;
  error: string | null;
  logoutNotice: LogoutNotice | null;
}

/**
 * Public contract exposed by `useAuth()` hook.
 */
export interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  tenant: TenantLookupResult | null;
  role: Role | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  isOfflineSession: boolean;
  pendingRedirectUrl: string | null;
  error: string | null;
  logoutNotice: LogoutNotice | null;
  
  // Actions
  lookupTenant: (email: string) => Promise<TenantLookupResult>;
  signIn: (email: string, password: string, authTenantId?: string | null) => Promise<{ success: boolean; user?: UserProfile; error?: string }>;
  signOut: (reason?: LogoutReason) => Promise<void>;
  refreshProfile: () => Promise<void>;
  sendPasswordReset: (email: string, authTenantId?: string | null) => Promise<{ success: boolean; error?: string }>;
  setPendingRedirectUrl: (url: string | null) => void;
  clearError: () => void;
  clearLogoutNotice: () => void;
}
