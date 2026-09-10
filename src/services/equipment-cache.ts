/**
 * src/services/equipment-cache.ts
 * Real-time shared equipment subscription manager and multi-consumer cache for Kuro Mobile.
 * Implements:
 * - Compound scope identity (uid + tenantId + queryScope)
 * - Consumer reference-counting with 5000ms grace period on same-identity unmounts
 * - Immediate teardown on logout / account switch (grace period never delays logout)
 * - Separated snapshot revision and identity generation guards
 * - Deduplicated in-flight refresh requests
 * - Bounded exponential retry for transient errors with non-transient error isolation
 * - Stable referential identity preservation for unchanged snapshots
 * - Complete O(1) multi-key scanner lookup map caching
 */

import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  type Unsubscribe,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import type { Equipment, SerialNumber } from '@/types/equipment';

export const GRACE_PERIOD_MS = 5000;
export const MAX_RETRY_BUDGET = 3;

export interface SharedEquipmentSubscriber {
  onData: (items: Equipment[], lookupMap: Map<string, Equipment>) => void;
  onError?: (err: Error) => void;
}

export interface EquipmentCacheDiagnostics {
  listenerCreationCount: number;
  mappingCount: number;
  refreshCount: number;
  discardedStaleRefreshCount: number;
  activeListenerCount: number;
  activeScopeCount: number;
  retryCount: number;
}

interface ScopeSubscriptionState {
  scopeKey: string;
  uid: string;
  tenantId: string;
  queryScope: string;
  refCount: number;
  subscribers: Set<SharedEquipmentSubscriber>;
  firestoreUnsubscribe: Unsubscribe | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryCount: number;
  identityGeneration: number;
  snapshotRevision: number;
  cachedEquipment: Equipment[] | null;
  cachedLookupMap: Map<string, Equipment> | null;
  lastError: Error | null;
  inFlightRefresh: Promise<Equipment[]> | null;
  isDisposed: boolean;
}

/// Global scope registry keyed by compound scopeKey: `${uid}::${tenantId}::${queryScope}`
const scopeRegistry = new Map<string, ScopeSubscriptionState>();

// Diagnostics counters
const diagnostics: EquipmentCacheDiagnostics = {
  listenerCreationCount: 0,
  mappingCount: 0,
  refreshCount: 0,
  discardedStaleRefreshCount: 0,
  activeListenerCount: 0,
  activeScopeCount: 0,
  retryCount: 0,
};

export function getEquipmentCacheDiagnostics(): EquipmentCacheDiagnostics {
  return {
    ...diagnostics,
    activeListenerCount: Array.from(scopeRegistry.values()).filter((s) => s.firestoreUnsubscribe !== null).length,
    activeScopeCount: scopeRegistry.size,
  };
}

export function resetEquipmentCacheDiagnostics(): void {
  diagnostics.listenerCreationCount = 0;
  diagnostics.mappingCount = 0;
  diagnostics.refreshCount = 0;
  diagnostics.discardedStaleRefreshCount = 0;
  diagnostics.activeListenerCount = 0;
  diagnostics.activeScopeCount = 0;
  diagnostics.retryCount = 0;
}

/**
 * Maps a raw Firestore document snapshot into an Equipment object.
 * Preserves exact mapping behavior and valid quantity: 0.
 */
export function mapEquipmentDoc(docSnap: any): Equipment {
  diagnostics.mappingCount++;
  if (!docSnap) {
    return {
      id: '',
      tenantId: '',
      name: 'Unnamed Equipment',
    } as Equipment;
  }
  const data = docSnap.data ? docSnap.data() : docSnap;

  const serialNumbers: SerialNumber[] = Array.isArray(data.serialNumbers)
    ? data.serialNumbers.map((sn: any, idx: number) => ({
        id: sn.id || `sn-${idx}`,
        serial: sn.serial || '',
        status: sn.status || 'Available',
        currentLocation: sn.currentLocation,
        notes: sn.notes,
      }))
    : [];

  return {
    id: docSnap.id || data.id,
    tenantId: data.tenantId,
    name: data.name || 'Unnamed Equipment',
    manufacturer: data.manufacturer,
    model: data.model,
    category: data.category || 'General',
    categoryId: data.categoryId,
    barcode: data.barcode,
    assetNumber: data.assetNumber,
    segAssetNumber: data.segAssetNumber,
    serialNumber: data.serialNumber,
    serialNumbers,
    knownLocation: data.knownLocation,
    venue: data.venue,
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    consumedQuantity: typeof data.consumedQuantity === 'number' ? data.consumedQuantity : 0,
    quantityDispatched: typeof data.quantityDispatched === 'number' ? data.quantityDispatched : 0,
    quantityReturned: typeof data.quantityReturned === 'number' ? data.quantityReturned : 0,
    price: data.price,
    subrental_costs: data.subrental_costs,
    maxDiscount: data.maxDiscount,
    powerW: data.powerW,
    weight: data.weight,
    weightWithContents: data.weightWithContents,
    height: data.height,
    width: data.width,
    length: data.length,
    input: data.input,
    output: data.output,
    channels: data.channels,
    caseType: data.caseType,
    itemClass: data.itemClass,
    equipmentType: data.equipmentType,
    serialisation: data.serialisation,
    notes: data.notes,
    archived: data.archived === true,
    manualUrl: data.manualUrl,
    contents: data.contents,
  };
}

/**
 * Builds the complete O(1) multi-key lookup map preserving lowercase normalization
 * and exact collision order for scanner lookup:
 * id, barcode.toLowerCase(), serialNumber.toLowerCase(), assetNumber.toLowerCase(),
 * segAssetNumber.toLowerCase(), sn.serial.toLowerCase().
 */
export function buildEquipmentLookupMap(equipment: Equipment[]): Map<string, Equipment> {
  const map = new Map<string, Equipment>();
  if (!equipment || !Array.isArray(equipment)) return map;
  for (const eq of equipment) {
    if (!eq) continue;
    if (eq.id) map.set(eq.id, eq);
    if (eq.barcode) map.set(eq.barcode.toLowerCase(), eq);
    if (eq.serialNumber) map.set(eq.serialNumber.toLowerCase(), eq);
    if (eq.assetNumber) map.set(eq.assetNumber.toLowerCase(), eq);
    if (eq.segAssetNumber) map.set(eq.segAssetNumber.toLowerCase(), eq);
    if (eq.serialNumbers && Array.isArray(eq.serialNumbers)) {
      for (const sn of eq.serialNumbers) {
        if (sn && sn.serial) map.set(sn.serial.toLowerCase(), eq);
      }
    }
  }
  return map;
}

/**
 * Checks whether two Equipment objects are structurally identical across all catalog fields.
 */
function areEquipmentItemsEqual(a: Equipment, b: Equipment): boolean {
  if (a === b) return true;
  if (
    a.id !== b.id ||
    a.tenantId !== b.tenantId ||
    a.name !== b.name ||
    a.manufacturer !== b.manufacturer ||
    a.model !== b.model ||
    a.category !== b.category ||
    a.categoryId !== b.categoryId ||
    a.barcode !== b.barcode ||
    a.assetNumber !== b.assetNumber ||
    a.segAssetNumber !== b.segAssetNumber ||
    a.serialNumber !== b.serialNumber ||
    a.knownLocation !== b.knownLocation ||
    a.venue !== b.venue ||
    a.quantity !== b.quantity ||
    a.consumedQuantity !== b.consumedQuantity ||
    a.quantityDispatched !== b.quantityDispatched ||
    a.quantityReturned !== b.quantityReturned ||
    a.price !== b.price ||
    a.subrental_costs !== b.subrental_costs ||
    a.maxDiscount !== b.maxDiscount ||
    a.powerW !== b.powerW ||
    a.weight !== b.weight ||
    a.weightWithContents !== b.weightWithContents ||
    a.height !== b.height ||
    a.width !== b.width ||
    a.length !== b.length ||
    a.input !== b.input ||
    a.output !== b.output ||
    a.channels !== b.channels ||
    a.caseType !== b.caseType ||
    a.itemClass !== b.itemClass ||
    a.equipmentType !== b.equipmentType ||
    a.serialisation !== b.serialisation ||
    a.notes !== b.notes ||
    a.archived !== b.archived ||
    a.manualUrl !== b.manualUrl
  ) {
    return false;
  }

  const snA = a.serialNumbers || [];
  const snB = b.serialNumbers || [];
  if (snA.length !== snB.length) return false;
  for (let i = 0; i < snA.length; i++) {
    const s1 = snA[i];
    const s2 = snB[i];
    if (!s1 || !s2) {
      if (s1 !== s2) return false;
      continue;
    }
    if (
      s1.id !== s2.id ||
      s1.serial !== s2.serial ||
      s1.status !== s2.status ||
      s1.currentLocation !== s2.currentLocation ||
      s1.notes !== s2.notes
    ) {
      return false;
    }
  }

  const cA = a.contents || [];
  const cB = b.contents || [];
  if (cA.length !== cB.length) return false;
  for (let i = 0; i < cA.length; i++) {
    const c1 = cA[i];
    const c2 = cB[i];
    if (!c1 || !c2) {
      if (c1 !== c2) return false;
      continue;
    }
    if (
      c1.id !== c2.id ||
      c1.quantity !== c2.quantity ||
      c1.description !== c2.description ||
      c1.cost !== c2.cost ||
      c1.type !== c2.type ||
      c1.internalNote !== c2.internalNote ||
      c1.caseType !== c2.caseType ||
      c1.sectionId !== c2.sectionId ||
      c1.parentItemId !== c2.parentItemId ||
      c1.hasContents !== c2.hasContents ||
      c1.inventoryItemId !== c2.inventoryItemId
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Checks structural equality of two equipment arrays to preserve referential stability
 * without heavy JSON serialization overhead.
 */
export function areEquipmentListsEqual(a: Equipment[] | null, b: Equipment[] | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!areEquipmentItemsEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Checks whether a Firestore error represents identity loss (permission-denied or unauthenticated).
 */
export function isIdentityLossError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || (typeof err === 'string' ? err : '')).toLowerCase();
  return (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code.includes('permission-denied') ||
    code.includes('unauthenticated') ||
    message.includes('permission') ||
    message.includes('unauthenticated') ||
    message.includes('missing or insufficient permissions')
  );
}

/**
 * Checks whether a Firestore error is non-transient (e.g. permission-denied, unauthenticated, invalid-argument).
 */
export function isNonTransientError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || (typeof err === 'string' ? err : '')).toLowerCase();
  return (
    isIdentityLossError(err) ||
    code === 'invalid-argument' ||
    code === 'failed-precondition' ||
    code === 'not-found' ||
    code.includes('invalid-argument') ||
    code.includes('failed-precondition') ||
    code.includes('not-found') ||
    message.includes('invalid-argument') ||
    message.includes('failed-precondition') ||
    message.includes('not-found') ||
    message.includes('index')
  );
}

/**
 * Returns a compound scope key.
 */
export function createScopeKey(uid: string, tenantId: string, queryScope: string = 'active'): string {
  return `${uid || 'anonymous'}::${tenantId || 'no-tenant'}::${queryScope}`;
}

// Track observed auth state
let currentObservedUid: string | null = null;
let authUnsubscribe: Unsubscribe | null = null;

/**
 * Initializes listener to auth state changes to detect signout or user switch immediately.
 */
export function initEquipmentAuthObserver(
  customAuth?: Auth,
  customOnAuthStateChanged?: (auth: any, cb: (user: any) => void) => Unsubscribe
): void {
  const authToUse = customAuth || auth;
  if (!authToUse) return;

  if (authUnsubscribe) {
    try {
      authUnsubscribe();
    } catch {}
    authUnsubscribe = null;
  }

  try {
    currentObservedUid = authToUse.currentUser?.uid || null;
  } catch {}

  const authListenerFn =
    customOnAuthStateChanged ||
    (typeof onAuthStateChanged === 'function' ? onAuthStateChanged : undefined);

  if (!authListenerFn) {
    return;
  }

  try {
    authUnsubscribe = authListenerFn(authToUse, (user: any) => {
      const newUid = user?.uid || null;
      if (newUid !== currentObservedUid) {
        handleAuthIdentityChange(newUid);
      }
    });
  } catch (err) {
    console.warn('[equipmentCache] Could not attach onAuthStateChanged observer:', err);
  }
}

/**
 * Stops the auth state change listener if active.
 */
export function stopEquipmentAuthObserver(): void {
  if (authUnsubscribe) {
    try {
      authUnsubscribe();
    } catch {}
    authUnsubscribe = null;
  }
  currentObservedUid = null;
}

/**
 * Performs immediate teardown on a scope state without waiting for grace period.
 * Cancels timers, detaches listener, invalidates generation, purges cached data,
 * and resets active subscribers.
 */
function teardownScopeImmediately(state: ScopeSubscriptionState): void {
  state.isDisposed = true;
  state.identityGeneration++;

  if (state.graceTimer) {
    clearTimeout(state.graceTimer);
    state.graceTimer = null;
  }
  if (state.retryTimer) {
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
  }
  if (state.firestoreUnsubscribe) {
    try {
      state.firestoreUnsubscribe();
    } catch (e) {
      console.warn('[equipmentCache] Error detaching listener:', e);
    }
    state.firestoreUnsubscribe = null;
  }

  state.cachedEquipment = null;
  state.cachedLookupMap = null;
  state.inFlightRefresh = null;
  state.lastError = null;

  const activeSubs = Array.from(state.subscribers);
  state.subscribers.clear();
  state.refCount = 0;

  // Delete from scope registry BEFORE notifying subscribers to prevent zombie scope reacquisition
  scopeRegistry.delete(state.scopeKey);

  for (const sub of activeSubs) {
    try {
      sub.onData([], new Map());
    } catch {}
  }
}

/**
 * Handles auth identity changes: immediately purges previous identity scopes,
 * cancels timers, unsubscribes Firestore listeners, and resets subscribers.
 */
export function handleAuthIdentityChange(newUid: string | null): void {
  if (newUid !== null && newUid === currentObservedUid) {
    return;
  }
  currentObservedUid = newUid;

  if (!newUid) {
    // User signed out: immediately purge all scopes
    clearEquipmentCache();
    return;
  }

  for (const [scopeKey, state] of Array.from(scopeRegistry.entries())) {
    if (state.uid !== newUid) {
      teardownScopeImmediately(state);
    }
  }
}

/**
 * Handles application tenant changes: immediately purges scopes belonging to old tenant,
 * cancels timers, unsubscribes Firestore listeners, and resets subscribers without grace period delay.
 */
export function handleTenantChange(newTenantId: string | null, oldTenantId?: string): void {
  if (oldTenantId !== undefined && newTenantId === oldTenantId) {
    return;
  }
  for (const [scopeKey, state] of Array.from(scopeRegistry.entries())) {
    const isOld = oldTenantId !== undefined ? state.tenantId === oldTenantId : (!newTenantId || state.tenantId !== newTenantId);
    if (isOld) {
      teardownScopeImmediately(state);
    }
  }
}

/**
 * Internal helper to retrieve or create scope state.
 */
function getOrCreateScopeState(uid: string, tenantId: string, queryScope: string = 'active'): ScopeSubscriptionState {
  const scopeKey = createScopeKey(uid, tenantId, queryScope);
  let state = scopeRegistry.get(scopeKey);

  if (!state) {
    state = {
      scopeKey,
      uid: uid || 'anonymous',
      tenantId,
      queryScope,
      refCount: 0,
      subscribers: new Set(),
      firestoreUnsubscribe: null,
      graceTimer: null,
      retryTimer: null,
      retryCount: 0,
      identityGeneration: 0,
      snapshotRevision: 0,
      cachedEquipment: null,
      cachedLookupMap: null,
      lastError: null,
      inFlightRefresh: null,
      isDisposed: false,
    };
    scopeRegistry.set(scopeKey, state);
  }

  return state;
}

/**
 * Raw Firestore query adapter: fetches documents once without maintaining a live listener.
 */
export async function rawFetchEquipmentDocs(
  tenantId: string,
  queryScope: string = 'active'
): Promise<Equipment[]> {
  if (!tenantId) return [];

  const q = query(collection(db, 'equipment'), where('tenantId', '==', tenantId));
  const snapshot = await getDocs(q);
  const equipment: Equipment[] = [];
  snapshot.forEach((docSnap) => {
    const item = mapEquipmentDoc(docSnap);
    if (item.tenantId === tenantId) {
      if (queryScope === 'all') {
        equipment.push(item);
      } else if (queryScope === 'archived') {
        if (item.archived) equipment.push(item);
      } else {
        if (!item.archived) equipment.push(item);
      }
    }
  });
  return equipment;
}

/**
 * Raw Firestore listener adapter: creates a live onSnapshot listener.
 */
export function rawAttachEquipmentListener(
  tenantId: string,
  onSnapshotData: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  diagnostics.listenerCreationCount++;
  const q = query(collection(db, 'equipment'), where('tenantId', '==', tenantId));
  return onSnapshot(q, onSnapshotData, onError);
}

/**
 * Establishes or retries the Firestore listener for a given scope state.
 */
function attachListenerForScope(state: ScopeSubscriptionState): void {
  // At most one listener and one retry timer per scope
  if (state.retryTimer) {
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
  }

  // Ensure no duplicate listener is attached
  if (state.firestoreUnsubscribe) {
    try {
      state.firestoreUnsubscribe();
    } catch {}
    state.firestoreUnsubscribe = null;
  }

  if (!state.tenantId || state.isDisposed) {
    return;
  }

  const currentGen = state.identityGeneration;

  try {
    state.firestoreUnsubscribe = rawAttachEquipmentListener(
      state.tenantId,
      (snapshot) => {
        // Guard against stale callbacks from superseded identities
        if (state.identityGeneration !== currentGen || state.isDisposed) {
          return;
        }

        // Retry budget resets ONLY on a successful snapshot payload
        state.retryCount = 0;
        state.lastError = null;

        const items: Equipment[] = [];
        snapshot.forEach((docSnap) => {
          const item = mapEquipmentDoc(docSnap);
          if (item.tenantId === state.tenantId) {
            if (state.queryScope === 'all') {
              items.push(item);
            } else if (state.queryScope === 'archived') {
              if (item.archived) items.push(item);
            } else {
              if (!item.archived) items.push(item);
            }
          }
        });

        // Increment snapshot revision so any in-flight refresh will be recognized as stale
        state.snapshotRevision++;

        // Structural equality check for referential stability
        if (!state.cachedEquipment || !state.cachedLookupMap || !areEquipmentListsEqual(state.cachedEquipment, items)) {
          state.cachedEquipment = items;
          state.cachedLookupMap = buildEquipmentLookupMap(items);
        }

        // Emit stable cached references to all active subscribers
        for (const sub of Array.from(state.subscribers)) {
          try {
            sub.onData(state.cachedEquipment, state.cachedLookupMap);
          } catch (e) {
            console.error('[equipmentCache] Error in subscriber onData callback:', e);
          }
        }
      },
      (err: Error) => {
        if (state.identityGeneration !== currentGen || state.isDisposed) {
          return;
        }

        console.error(`[equipmentCache] Firestore error for scope ${state.scopeKey}:`, err);
        state.lastError = err;

        // Clean up failed listener handle
        if (state.firestoreUnsubscribe) {
          try {
            state.firestoreUnsubscribe();
          } catch {}
          state.firestoreUnsubscribe = null;
        }

        // Expose error to all active subscribers (preserving cached data as stale unless identity loss)
        for (const sub of Array.from(state.subscribers)) {
          if (sub.onError) {
            try {
              sub.onError(err);
            } catch (e) {
              console.error('[equipmentCache] Error in subscriber onError callback:', e);
            }
          }
        }

        // Non-transient errors (permission-denied, unauthenticated, invalid queries)
        if (isNonTransientError(err)) {
          console.warn(`[equipmentCache] Non-transient error encountered for scope ${state.scopeKey}, awaiting valid auth/scope or manual refresh.`);

          // On identity loss (permission-denied / unauthenticated): clear cached data immediately
          if (isIdentityLossError(err)) {
            state.cachedEquipment = null;
            state.cachedLookupMap = null;
            for (const sub of Array.from(state.subscribers)) {
              try {
                sub.onData([], new Map());
              } catch {}
            }
          }
          return;
        }

        // Transient error bounded retry with exponential backoff + jitter
        if (state.subscribers.size > 0 && state.retryCount < MAX_RETRY_BUDGET) {
          state.retryCount++;
          diagnostics.retryCount++;

          const backoff = Math.min(5000, 1000 * Math.pow(2, state.retryCount - 1)) + Math.floor(Math.random() * 200);

          if (state.retryTimer) {
            clearTimeout(state.retryTimer);
          }

          state.retryTimer = setTimeout(() => {
            state.retryTimer = null;
            if (
              state.subscribers.size > 0 &&
              state.identityGeneration === currentGen &&
              !state.isDisposed &&
              !(state.lastError && isNonTransientError(state.lastError))
            ) {
              attachListenerForScope(state);
            }
          }, backoff);
        }
      }
    );
  } catch (attachErr: any) {
    console.error('[equipmentCache] Exception establishing listener:', attachErr);
    state.lastError = attachErr;
    if (state.firestoreUnsubscribe) {
      try {
        state.firestoreUnsubscribe();
      } catch {}
      state.firestoreUnsubscribe = null;
    }
    for (const sub of Array.from(state.subscribers)) {
      if (sub.onError) {
        try {
          sub.onError(attachErr);
        } catch {}
      }
    }
    if (isIdentityLossError(attachErr)) {
      state.cachedEquipment = null;
      state.cachedLookupMap = null;
      for (const sub of Array.from(state.subscribers)) {
        try {
          sub.onData([], new Map());
        } catch {}
      }
    }
  }
}

/**
 * Tears down a scope when grace period expires with zero active consumers.
 */
function teardownScope(scopeKey: string, expectedState?: ScopeSubscriptionState): void {
  const state = scopeRegistry.get(scopeKey);
  if (!state) return;
  if (expectedState && state !== expectedState) return;

  if (state.refCount > 0) {
    // A consumer re-subscribed during grace period
    return;
  }

  teardownScopeImmediately(state);
}

/**
 * Subscribes a consumer to the shared equipment cache for the given compound scope.
 * Handles reference counting and grace period cancellation.
 */
export function subscribeSharedEquipment(
  tenantId: string,
  subscriber: SharedEquipmentSubscriber,
  options?: { uid?: string; queryScope?: string }
): Unsubscribe {
  if (!tenantId) {
    subscriber.onData([], new Map());
    return () => {};
  }

  const effectiveUid = options?.uid || auth.currentUser?.uid || 'anonymous';
  const queryScope = options?.queryScope || 'active';
  const state = getOrCreateScopeState(effectiveUid, tenantId, queryScope);

  // If a grace period timer was pending for this scope, cancel it
  if (state.graceTimer) {
    clearTimeout(state.graceTimer);
    state.graceTimer = null;
  }

  state.refCount++;
  state.subscribers.add(subscriber);

  // If cached data is already available, emit immediately
  if (state.cachedEquipment && state.cachedLookupMap) {
    try {
      subscriber.onData(state.cachedEquipment, state.cachedLookupMap);
    } catch (e) {
      console.error('[equipmentCache] Error emitting cached data to new subscriber:', e);
    }
  }

  // If previous error exists, inform new subscriber so they are aware of stale data
  if (state.lastError && subscriber.onError) {
    try {
      subscriber.onError(state.lastError);
    } catch (e) {
      console.error('[equipmentCache] Error emitting last error to new subscriber:', e);
    }
  }

  // If listener is not currently attached and no retry timer pending, attach now
  // Guard: if scope has an active non-transient error or retry budget exhausted, await valid auth/scope or explicit refresh
  if (
    !state.firestoreUnsubscribe &&
    !state.retryTimer &&
    state.retryCount < MAX_RETRY_BUDGET &&
    !(state.lastError && isNonTransientError(state.lastError))
  ) {
    attachListenerForScope(state);
  }

  let unsubscribed = false;

  return () => {
    if (unsubscribed) return;
    unsubscribed = true;

    if (state.isDisposed) {
      return;
    }

    state.subscribers.delete(subscriber);
    state.refCount = Math.max(0, state.refCount - 1);

    if (state.refCount === 0) {
      // Start grace period timer for ordinary same-identity unmounts
      if (state.graceTimer) {
        clearTimeout(state.graceTimer);
      }
      state.graceTimer = setTimeout(() => {
        teardownScope(state.scopeKey, state);
      }, GRACE_PERIOD_MS);
    }
  };
}

/**
 * Deduplicated refresh for a shared scope.
 * Coalesces concurrent calls and guards against stale async results.
 */
export async function refreshSharedEquipment(
  tenantId: string,
  options?: { uid?: string; queryScope?: string }
): Promise<Equipment[]> {
  if (!tenantId) return [];

  const effectiveUid = options?.uid || auth.currentUser?.uid || 'anonymous';
  const queryScope = options?.queryScope || 'active';
  const state = getOrCreateScopeState(effectiveUid, tenantId, queryScope);

  // Coalesce concurrent requests into the active in-flight Promise
  if (state.inFlightRefresh) {
    return state.inFlightRefresh;
  }

  diagnostics.refreshCount++;
  const reqScopeGen = state.identityGeneration;
  const reqRevision = state.snapshotRevision;

  const refreshPromise = (async () => {
    try {
      const items = await rawFetchEquipmentDocs(tenantId, queryScope);

      // Generation guard: scope identity changed while fetch was running -> discard
      if (state.identityGeneration !== reqScopeGen || state.isDisposed) {
        diagnostics.discardedStaleRefreshCount++;
        return state.cachedEquipment || [];
      }

      // Revision guard: a live snapshot arrived while fetch was in flight -> discard slower refresh
      if (state.snapshotRevision > reqRevision) {
        diagnostics.discardedStaleRefreshCount++;
        return state.cachedEquipment || [];
      }

      state.snapshotRevision++;

      if (!state.cachedEquipment || !state.cachedLookupMap || !areEquipmentListsEqual(state.cachedEquipment, items)) {
        state.cachedEquipment = items;
        state.cachedLookupMap = buildEquipmentLookupMap(items);
      }

      state.lastError = null;
      state.retryCount = 0;

      // Re-attach live listener if active subscribers exist and listener was detached (e.g. after error recovery)
      if (state.subscribers.size > 0 && !state.firestoreUnsubscribe && !state.isDisposed) {
        attachListenerForScope(state);
      }

      // Notify all active subscribers with fresh data
      for (const sub of Array.from(state.subscribers)) {
        try {
          sub.onData(state.cachedEquipment, state.cachedLookupMap);
        } catch (e) {
          console.error('[equipmentCache] Error notifying subscriber on refresh:', e);
        }
      }

      return state.cachedEquipment || [];
    } catch (err: any) {
      // If scope identity changed or a live snapshot arrived while fetch was running, discard quietly
      if (
        state.identityGeneration !== reqScopeGen ||
        state.isDisposed ||
        state.snapshotRevision > reqRevision
      ) {
        diagnostics.discardedStaleRefreshCount++;
        return state.cachedEquipment || [];
      }

      console.error(`[equipmentCache] Refresh error for tenant ${tenantId}:`, err);
      state.lastError = err;

      if (isNonTransientError(err)) {
        if (state.retryTimer) {
          clearTimeout(state.retryTimer);
          state.retryTimer = null;
        }
        if (isIdentityLossError(err)) {
          state.cachedEquipment = null;
          state.cachedLookupMap = null;
          for (const sub of Array.from(state.subscribers)) {
            try {
              sub.onData([], new Map());
            } catch {}
          }
        }
      }

      for (const sub of Array.from(state.subscribers)) {
        if (sub.onError) {
          try {
            sub.onError(err);
          } catch {}
        }
      }
      throw err;
    } finally {
      state.inFlightRefresh = null;
    }
  })();

  state.inFlightRefresh = refreshPromise;
  return refreshPromise;
}

/**
 * Returns the currently cached equipment items for a given scope, or null.
 */
export function getCachedEquipment(
  tenantId: string,
  options?: { uid?: string; queryScope?: string }
): Equipment[] | null {
  if (!tenantId) return null;
  const effectiveUid = options?.uid || auth.currentUser?.uid || 'anonymous';
  const queryScope = options?.queryScope || 'active';
  const scopeKey = createScopeKey(effectiveUid, tenantId, queryScope);
  return scopeRegistry.get(scopeKey)?.cachedEquipment || null;
}

/**
 * Returns the currently cached lookup map for a given scope, or null.
 */
export function getCachedLookupMap(
  tenantId: string,
  options?: { uid?: string; queryScope?: string }
): Map<string, Equipment> | null {
  if (!tenantId) return null;
  const effectiveUid = options?.uid || auth.currentUser?.uid || 'anonymous';
  const queryScope = options?.queryScope || 'active';
  const scopeKey = createScopeKey(effectiveUid, tenantId, queryScope);
  return scopeRegistry.get(scopeKey)?.cachedLookupMap || null;
}

/**
 * Clears and detaches subscriptions.
 * If tenantId is specified, clears scopes matching that tenant.
 * If tenantId is omitted, purges ALL scopes immediately.
 */
export function clearEquipmentCache(tenantId?: string): void {
  for (const [scopeKey, state] of Array.from(scopeRegistry.entries())) {
    if (!tenantId || state.tenantId === tenantId) {
      teardownScopeImmediately(state);
    }
  }
}

// Auto-initialize auth observer
initEquipmentAuthObserver();
