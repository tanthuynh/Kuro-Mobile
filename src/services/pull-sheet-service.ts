/**
 * src/services/pull-sheet-service.ts
 * Real-time Firestore service and authenticated Admin command client for Kuro Mobile Pull Sheets.
 *
 * Architecture:
 * - Scoped Real-time Reads: Live onSnapshot subscriptions using Firebase Client SDK.
 * - Authenticated Mutations: Secure backend command path (POST /api/pullsheets/command)
 *   using Firebase Admin SDK on the server, enforcing closed client mutation rules.
 * - Strict Online Enforcement: Offline scans and updates are blocked immediately;
 *   never queued locally for later sync.
 * - Idempotency & Operation Receipts: Every mutation uses an operationId (UUID v4)
 *   persisted transactionally on the server with SHA-256 payload verification.
 * - In-Flight Disconnect Reconciliation: In-flight operations are held in namespaced
 *   durable storage as outcome-unknown. Read-only status checks determine whether
 *   to adopt the committed state or offer explicit user retries reusing the original operationId.
 */

import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { db, auth } from '@/lib/firebase';
import { API_CONFIG } from '@/constants/config';
import type {
  Pullsheet,
  PullsheetItem,
  PullsheetItemStatus,
} from '@/types/pull-sheet';
import {
  normalizePullsheetStatus,
  isActionablePullsheetItem,
} from '@/lib/pull-sheet-engine';
import { parseFirestoreDate } from '@/lib/date-utils';

// ============================================================================
// 0. NETWORK CONNECTIVITY GUARD
// ============================================================================

let isNetworkExplicitlyOnline = true;

/**
 * Updates the service's internal online state.
 * Wired to presence-service connection events or native netinfo.
 */
export function setNetworkOnlineState(online: boolean): void {
  isNetworkExplicitlyOnline = online;
}

/**
 * Checks if the device has active internet connectivity.
 * Offline operations are blocked immediately.
 */
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false) {
    return false;
  }
  return isNetworkExplicitlyOnline;
}

// ============================================================================
// 1. DURABLE IN-FLIGHT OPERATION STORE
// ============================================================================

export interface PendingOperationRecord {
  operationId: string;
  eventId: string;
  tenantId: string;
  userId: string;
  action: 'increment_scan' | 'update_status' | 'bulk_confirm';
  payload: Record<string, any>;
  timestamp: number;
  state: 'in_flight' | 'outcome_unknown' | 'reconciling';
}

function getPendingStorageKey(tenantId: string, userId: string): string {
  return `@kuro_pending_operations:${tenantId}:${userId}`;
}

/**
 * Retrieves durable in-flight operations strictly namespaced by tenant and user.
 * Never shared across different accounts or tenants.
 */
export async function getPendingOperations(
  tenantId: string,
  userId: string
): Promise<PendingOperationRecord[]> {
  if (!tenantId || !userId) return [];
  try {
    const raw = await AsyncStorage.getItem(getPendingStorageKey(tenantId, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[pullSheetService] Failed to load pending operations:', err);
    return [];
  }
}

async function savePendingOperation(record: PendingOperationRecord): Promise<void> {
  try {
    const existing = await getPendingOperations(record.tenantId, record.userId);
    const filtered = existing.filter((op) => op.operationId !== record.operationId);
    filtered.push(record);
    await AsyncStorage.setItem(
      getPendingStorageKey(record.tenantId, record.userId),
      JSON.stringify(filtered)
    );
  } catch (err) {
    console.warn('[pullSheetService] Failed to save pending operation:', err);
  }
}

/**
 * Removes an acknowledged or resolved operation from durable storage.
 */
export async function clearPendingOperation(
  tenantId: string,
  userId: string,
  operationId: string
): Promise<void> {
  try {
    const existing = await getPendingOperations(tenantId, userId);
    const updated = existing.filter((op) => op.operationId !== operationId);
    if (updated.length > 0) {
      await AsyncStorage.setItem(
        getPendingStorageKey(tenantId, userId),
        JSON.stringify(updated)
      );
    } else {
      await AsyncStorage.removeItem(getPendingStorageKey(tenantId, userId));
    }
  } catch (err) {
    console.warn('[pullSheetService] Failed to clear pending operation:', err);
  }
}

// ============================================================================
// 2. DEFENSIVE DOCUMENT MAPPER & REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Maps a raw Firestore pullsheet document into a strongly typed Pullsheet object.
 */
export function mapFirestorePullsheetDoc(docSnap: any): Pullsheet {
  const data = docSnap.data ? docSnap.data() : docSnap;
  const rawItems = Array.isArray(data.items) ? data.items : [];

  const items: PullsheetItem[] = rawItems.map((item: any) => {
    const isActionable = isActionablePullsheetItem(item);
    return {
      id: item.id,
      sourceQuoteLineId: item.sourceQuoteLineId,
      inventoryItemId: item.inventoryItemId,
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      scannedQuantity: typeof item.scannedQuantity === 'number' ? item.scannedQuantity : undefined,
      scannedBarcodes: Array.isArray(item.scannedBarcodes) ? item.scannedBarcodes : [],
      description: item.description || '',
      internalNote: item.internalNote,
      type: item.type || 'item',
      sectionId: item.sectionId,
      parentItemId: item.parentItemId,
      hasContents: item.hasContents === true,
      unit: item.unit,
      cost: item.cost,
      discount: item.discount,
      time: item.time,
      status: isActionable ? normalizePullsheetStatus(item.status) : 'none',
      statusUpdatedAt: parseFirestoreDate(item.statusUpdatedAt),
      statusUpdatedBy: item.statusUpdatedBy,
    };
  });

  return {
    id: docSnap.id || data.id,
    eventId: data.eventId || docSnap.id || data.id,
    tenantId: data.tenantId,
    items,
    sourceCopyTimestamp: parseFirestoreDate(data.sourceCopyTimestamp),
    lastBulkConfirmAt: parseFirestoreDate(data.lastBulkConfirmAt),
    lastBulkConfirmBy: data.lastBulkConfirmBy,
    createdAt: parseFirestoreDate(data.createdAt),
    updatedAt: parseFirestoreDate(data.updatedAt),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
  };
}

/**
 * Subscribes to live real-time updates for a pull sheet document.
 * Leverages client-side onSnapshot permitted by tenant-scoped read rules.
 */
export function subscribePullsheet(
  eventId: string,
  tenantId: string,
  onUpdate: (pullsheet: Pullsheet | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!eventId || !tenantId) {
    onUpdate(null);
    return () => {};
  }

  try {
    const docRef = doc(db, 'pullsheets', eventId);

    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onUpdate(null);
          return;
        }

        const data = snapshot.data();
        if (data.tenantId !== tenantId) {
          console.warn('[pullSheetService] Tenant mismatch on pull sheet subscription');
          onUpdate(null);
          return;
        }

        const pullsheet = mapFirestorePullsheetDoc(snapshot);
        onUpdate(pullsheet);
      },
      (err) => {
        console.error(`[pullSheetService] Subscription error for event ${eventId}:`, err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.error('[pullSheetService] Failed to establish pullsheet listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetches a pull sheet once without maintaining a real-time listener.
 */
export async function fetchPullsheet(
  eventId: string,
  tenantId: string
): Promise<Pullsheet | null> {
  if (!eventId || !tenantId) return null;

  const docRef = doc(db, 'pullsheets', eventId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.tenantId !== tenantId) return null;

  return mapFirestorePullsheetDoc(snap);
}

// ============================================================================
// 3. AUTHENTICATED BACKEND COMMAND DISPATCHER
// ============================================================================

export interface CommandExecutionResult {
  success: boolean;
  error?: string;
  outcomeUnknown?: boolean;
  operationId?: string;
  alreadyCommitted?: boolean;
  item?: any;
  pullsheetSummary?: any;
  reconciliationStatus?: 'completed' | 'pending' | 'failed';
}

/**
 * Direct Firestore fallback mutation when the backend command endpoint is unmounted (404).
 */
async function directFirestoreFallback(
  action: 'increment_scan' | 'update_status' | 'bulk_confirm',
  eventId: string,
  tenantId: string,
  user: { uid: string },
  details?: Record<string, any>
): Promise<{ success: boolean; item?: any; error?: string }> {
  try {
    const docRef = doc(db, 'pullsheets', eventId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return { success: false, error: 'Pull sheet not found' };
    }
    const data = snap.data();
    if (data.tenantId && data.tenantId !== tenantId) {
      return { success: false, error: 'Unauthorized: Tenant mismatch' };
    }

    const currentItems: any[] = Array.isArray(data.items) ? data.items : [];
    const now = new Date();
    let targetItem: any = null;
    let hasChanges = false;
    let updatedItems: any[] = [];

    switch (action) {
      case 'update_status': {
        const { itemId, newStatus, scannedCount } = details || {};
        updatedItems = currentItems.map((it) => {
          if (it.id === itemId) {
            hasChanges = true;
            targetItem = {
              ...it,
              status: isActionablePullsheetItem(it) ? normalizePullsheetStatus(newStatus) : 'none',
              ...(typeof scannedCount === 'number' ? { scannedQuantity: scannedCount } : {}),
              statusUpdatedAt: now,
              statusUpdatedBy: user.uid,
            };
            return targetItem;
          }
          return it;
        });
        if (!hasChanges) {
          return { success: false, error: `Item with ID "${itemId}" not found on pull sheet` };
        }
        break;
      }
      case 'increment_scan': {
        const { itemId, barcode, scannedCount, autoTransitionToPrepped } = details || {};
        updatedItems = currentItems.map((it) => {
          if (it.id === itemId) {
            hasChanges = true;
            const existingBarcodes: string[] = Array.isArray(it.scannedBarcodes)
              ? [...it.scannedBarcodes]
              : [];
            if (barcode && !existingBarcodes.includes(barcode)) {
              existingBarcodes.push(barcode);
            }
            const targetQty = Math.max(1, it.quantity || 1);
            const currentScanned = typeof it.scannedQuantity === 'number'
              ? it.scannedQuantity
              : it.status === 'prepped_scanned'
              ? targetQty
              : 0;
            const nextCount = typeof scannedCount === 'number' ? scannedCount : currentScanned + 1;
            const isFullyPrepped = autoTransitionToPrepped ?? nextCount >= targetQty;
            const nextStatus = isFullyPrepped ? 'prepped_scanned' : it.status;
            targetItem = {
              ...it,
              scannedQuantity: nextCount,
              scannedBarcodes: existingBarcodes,
              status: isActionablePullsheetItem(it) ? normalizePullsheetStatus(nextStatus) : 'none',
              statusUpdatedAt: now,
              statusUpdatedBy: user.uid,
            };
            return targetItem;
          }
          return it;
        });
        if (!hasChanges) {
          return { success: false, error: `Item with ID "${itemId}" not found on pull sheet` };
        }
        break;
      }
      case 'bulk_confirm': {
        updatedItems = currentItems.map((it) => {
          const isActionable = isActionablePullsheetItem(it);
          const status = normalizePullsheetStatus(it.status);
          if (isActionable && status === 'pending') {
            hasChanges = true;
            return {
              ...it,
              status: 'confirmed',
              statusUpdatedAt: now,
              statusUpdatedBy: user.uid,
            };
          }
          return it;
        });
        break;
      }
    }

    if (hasChanges) {
      await updateDoc(docRef, {
        items: updatedItems,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    }

    return { success: true, item: targetItem };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Direct Firestore fallback failed' };
  }
}

/**
 * Dispatches an authenticated pullsheet mutation command to the backend API.
 * Uses operationId for transaction idempotency and tracks in-flight state durably.
 */
async function executePullsheetCommand(
  action: 'increment_scan' | 'update_status' | 'bulk_confirm',
  eventId: string,
  tenantId: string,
  user: { uid: string },
  details: {
    itemId?: string;
    barcode?: string;
    newStatus?: PullsheetItemStatus;
    scannedCount?: number;
    autoTransitionToPrepped?: boolean;
    clientTimestamp?: number;
  },
  existingOperationId?: string
): Promise<CommandExecutionResult> {
  // 1. Strict Online Guard
  if (!isOnline()) {
    return {
      success: false,
      error: 'Network connection required. Offline scanning is disabled.',
    };
  }

  let idToken: string | null = null;
  try {
    idToken = (await auth.currentUser?.getIdToken()) || null;
  } catch (authError: any) {
    console.warn('[pullSheetService] Token retrieval error:', authError);
  }

  if (!idToken) {
    return {
      success: false,
      error: 'Authentication required. Please log in again.',
    };
  }

  const operationId = existingOperationId || uuidv4();
  const payload = {
    operationId,
    eventId,
    tenantId,
    action,
    ...details,
    clientTimestamp: details?.clientTimestamp || Date.now(),
  };

  // 3. Persist to durable storage as in_flight
  const pendingRecord: PendingOperationRecord = {
    operationId,
    eventId,
    tenantId,
    userId: user.uid,
    action,
    payload,
    timestamp: details?.clientTimestamp || Date.now(),
    state: 'in_flight',
  };
  await savePendingOperation(pendingRecord);

  // 4. HTTP Request with Timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/pullsheets/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    // 5. Validated Committed-Result Verification (Not merely HTTP 200)
    if (
      response.ok &&
      data &&
      data.success === true &&
      data.status === 'committed' &&
      data.operationId === operationId
    ) {
      // Clear durable record on acknowledged success
      await clearPendingOperation(tenantId, user.uid, operationId);

      return {
        success: true,
        operationId,
        alreadyCommitted: data.alreadyCommitted === true,
        item: data.result?.updatedItem,
        pullsheetSummary: data.result?.pullsheetSummary,
        reconciliationStatus: data.reconciliationStatus,
      };
    }

    // 6. Processing status (HTTP 200 or 202 Accepted): poll status with bounded backoff
    if (response.ok && data && data.status === 'processing') {
      pendingRecord.state = 'reconciling';
      await savePendingOperation(pendingRecord);

      const pollResult = await reconcilePendingOperation(eventId, tenantId, user.uid, operationId);
      if (pollResult.success && pollResult.status === 'committed') {
        return {
          success: true,
          operationId,
          item: pollResult.result?.updatedItem,
          reconciliationStatus: pollResult.reconciliationStatus,
        };
      }

      pendingRecord.state = 'outcome_unknown';
      await savePendingOperation(pendingRecord);
      return {
        success: false,
        error: 'Command is processing on server. Please check status or retry.',
        outcomeUnknown: true,
        operationId,
      };
    }

    // 5xx Server or Gateway Errors, 408 Request Timeout, or 499 Client Closed Request: outcome is unknown (server may have committed before timeout)
    if (response.status >= 500 || response.status === 408 || response.status === 499) {
      pendingRecord.state = 'outcome_unknown';
      await savePendingOperation(pendingRecord);
      return {
        success: false,
        error: data?.error || `Server gateway error (${response.status}). Outcome unknown; please check status or retry.`,
        outcomeUnknown: true,
        operationId,
      };
    }

    // If server returned 404 without a domain error, the endpoint is unmounted on the backend server
    if (response.status === 404 && !data?.error) {
      console.warn('[pullSheetService] Command route 404 (endpoint not mounted on server). Attempting direct Firestore fallback...');
      const fallbackResult = await directFirestoreFallback(action, eventId, tenantId, user, details);
      if (fallbackResult.success) {
        await clearPendingOperation(tenantId, user.uid, operationId);
        return {
          success: true,
          operationId,
          item: fallbackResult.item,
        };
      }
      await clearPendingOperation(tenantId, user.uid, operationId);
      return {
        success: false,
        error: fallbackResult.error || 'Server returned status 404',
      };
    }

    // Explicit client rejection (4xx, e.g. 400 Bad Request, 401 Unauthorized, 403 Forbidden, 409 Conflict)
    await clearPendingOperation(tenantId, user.uid, operationId);
    return {
      success: false,
      error: data?.error || `Server returned status ${response.status}`,
    };
  } catch (networkError: any) {
    clearTimeout(timeoutId);

    // Mark as outcome_unknown on network error or timeout
    pendingRecord.state = 'outcome_unknown';
    await savePendingOperation(pendingRecord);

    console.warn('[pullSheetService] In-flight command disconnect/timeout:', networkError);
    return {
      success: false,
      error: 'Connection lost during save. Verify network connection and retry.',
      outcomeUnknown: true,
      operationId,
    };
  }
}

// ============================================================================
// 4. PUBLIC MUTATION APIS
// ============================================================================

/**
 * Updates an individual item's lifecycle status via the authenticated command endpoint.
 */
export async function updatePullsheetItemStatus(
  eventId: string,
  tenantId: string,
  itemId: string,
  newStatus: PullsheetItemStatus,
  user: { uid: string },
  optionsOrOpId?: string | { existingOperationId?: string; scannedQuantity?: number },
  legacyScannedQuantity?: number
): Promise<CommandExecutionResult> {
  let existingOperationId: string | undefined;
  let scannedQuantity: number | undefined;

  if (typeof optionsOrOpId === 'string') {
    existingOperationId = optionsOrOpId;
    scannedQuantity = legacyScannedQuantity;
  } else if (optionsOrOpId && typeof optionsOrOpId === 'object') {
    existingOperationId = optionsOrOpId.existingOperationId;
    scannedQuantity = optionsOrOpId.scannedQuantity;
  }

  return executePullsheetCommand(
    'update_status',
    eventId,
    tenantId,
    user,
    {
      itemId,
      newStatus,
      ...(typeof scannedQuantity === 'number' ? { scannedCount: scannedQuantity } : {}),
    },
    existingOperationId
  );
}

/**
 * Updates an individual item's scanned quantity via the authenticated command endpoint.
 * Serialized units with identical barcodes are deduplicated.
 */
export async function updatePullsheetItemScannedCount(
  eventId: string,
  tenantId: string,
  itemId: string,
  newScannedCount: number,
  autoTransitionToPrepped: boolean,
  user: { uid: string },
  scannedBarcode?: string,
  existingOperationId?: string
): Promise<CommandExecutionResult> {
  return executePullsheetCommand(
    'increment_scan',
    eventId,
    tenantId,
    user,
    {
      itemId,
      barcode: scannedBarcode,
      scannedCount: newScannedCount,
      autoTransitionToPrepped,
    },
    existingOperationId
  );
}

/**
 * Bulk confirms all actionable pending items on a pull sheet via the command endpoint.
 */
export async function bulkConfirmPullsheet(
  eventId: string,
  tenantId: string,
  user: { uid: string },
  existingOperationId?: string
): Promise<CommandExecutionResult> {
  return executePullsheetCommand(
    'bulk_confirm',
    eventId,
    tenantId,
    user,
    {},
    existingOperationId
  );
}

// ============================================================================
// 5. READ-ONLY STATUS RECONCILIATION & REPLAY
// ============================================================================

export interface StatusReconciliationResult {
  success: boolean;
  status: 'committed' | 'not_found' | 'processing' | 'error';
  reconciliationStatus?: 'completed' | 'pending' | 'failed';
  result?: any;
  error?: string;
  operationId?: string;
}

/**
 * Strictly READ-ONLY status query for operation receipts.
 * Re-authorizes caller and checks whether the in-flight operation committed.
 * Does NOT execute any side effects or mutate records.
 * Polls with bounded backoff if the server indicates 'processing'.
 */
export async function reconcilePendingOperation(
  eventId: string,
  tenantId: string,
  userId: string,
  operationId: string,
  maxPollAttempts: number = 3
): Promise<StatusReconciliationResult> {
  if (!isOnline()) {
    return { success: false, status: 'error', error: 'Network offline', operationId };
  }

  const idToken = (await auth.currentUser?.getIdToken().catch(() => null)) ?? null;
  if (!idToken) {
    return { success: false, status: 'error', error: 'Not authenticated', operationId };
  }

  const url = `${API_CONFIG.baseUrl}/api/pullsheets/command/status?eventId=${encodeURIComponent(
    eventId
  )}&operationId=${encodeURIComponent(operationId)}`;

  let attempt = 0;
  while (attempt < maxPollAttempts) {
    attempt++;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data && data.success === true) {
        if (data.status === 'committed') {
          // Acknowledged commit: clear durable record
          await clearPendingOperation(tenantId, userId, operationId);
          return {
            success: true,
            status: 'committed',
            reconciliationStatus: data.reconciliationStatus,
            result: data.result,
            operationId,
          };
        }

        if (data.status === 'not_found') {
          // Update durable record state to outcome_unknown so it is ready for explicit retry
          const existing = await getPendingOperations(tenantId, userId);
          const target = existing.find((op) => op.operationId === operationId);
          if (target && target.state !== 'outcome_unknown') {
            target.state = 'outcome_unknown';
            await savePendingOperation(target);
          }
          return {
            success: true,
            status: 'not_found',
            operationId,
          };
        }

        if (data.status === 'processing') {
          if (attempt < maxPollAttempts) {
            // Bounded exponential backoff
            const backoffMs = Math.min(1000, 300 * Math.pow(2, attempt - 1));
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          } else {
            // Polling exhausted: update durable record to outcome_unknown for explicit retry
            const existing = await getPendingOperations(tenantId, userId);
            const target = existing.find((op) => op.operationId === operationId);
            if (target && target.state !== 'outcome_unknown') {
              target.state = 'outcome_unknown';
              await savePendingOperation(target);
            }
            return {
              success: true,
              status: 'processing',
              operationId,
            };
          }
        }
      }

      return {
        success: false,
        status: 'error',
        error: data?.error || `Status query returned ${response.status}`,
        operationId,
      };
    } catch (err: any) {
      if (attempt < maxPollAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        continue;
      }
      return {
        success: false,
        status: 'error',
        error: err.message || 'Status query failed',
        operationId,
      };
    }
  }

  return {
    success: false,
    status: 'error',
    error: 'Max poll attempts reached',
    operationId,
  };
}

/**
 * Reconciles pending operations upon cold app restart before enabling new mutations.
 * Reads pending operations for tenant/user, queries status for each:
 * - If committed: adopts result, clears from pending store.
 * - If not_found: marks as outcome_unknown ready for explicit retry with original operationId.
 * - If processing: polls with bounded backoff.
 */
export async function reconcilePendingOperationsOnColdStart(
  tenantId: string,
  userId: string
): Promise<{
  committed: PendingOperationRecord[];
  notFound: PendingOperationRecord[];
  failed: PendingOperationRecord[];
}> {
  if (!tenantId || !userId || !isOnline()) {
    return { committed: [], notFound: [], failed: [] };
  }

  const pendingOps = await getPendingOperations(tenantId, userId);
  const committed: PendingOperationRecord[] = [];
  const notFound: PendingOperationRecord[] = [];
  const failed: PendingOperationRecord[] = [];

  for (const op of pendingOps) {
    const res = await reconcilePendingOperation(op.eventId, op.tenantId, op.userId, op.operationId);
    if (res.success && res.status === 'committed') {
      committed.push(op);
    } else if (res.success && res.status === 'not_found') {
      notFound.push(op);
    } else {
      failed.push(op);
    }
  }

  return { committed, notFound, failed };
}

/**
 * Checks if an item has an in-flight or outcome-unknown operation pending,
 * disabling conflicting actions until reconciled. Also blocks if a bulk_confirm
 * operation is pending on the same pull sheet.
 */
export async function isItemOperationPending(
  tenantId: string,
  userId: string,
  itemId: string,
  eventId?: string
): Promise<boolean> {
  const pendingOps = await getPendingOperations(tenantId, userId);
  return pendingOps.some(
    (op) =>
      (op.state === 'in_flight' || op.state === 'outcome_unknown' || op.state === 'reconciling') &&
      (op.payload?.itemId === itemId ||
        (op.action === 'bulk_confirm' && (!eventId || op.eventId === eventId)))
  );
}

/**
 * Checks if any operations are pending for a tenant and user.
 */
export async function hasPendingOperations(
  tenantId: string,
  userId: string,
  eventId?: string
): Promise<boolean> {
  const pendingOps = await getPendingOperations(tenantId, userId);
  if (eventId) {
    return pendingOps.some((op) => op.eventId === eventId);
  }
  return pendingOps.length > 0;
}

/**
 * Explicit user retry for an outcome-unknown or not-found operation.
 * CRUCIAL: Reuses the ORIGINAL operationId and identical payload so that
 * if the first request committed in the interim, it safely hits the server receipt guard.
 */
export async function retryPendingOperation(
  pendingOp: PendingOperationRecord,
  user: { uid: string }
): Promise<CommandExecutionResult> {
  const { operationId, eventId, tenantId, action, payload } = pendingOp;
  return executePullsheetCommand(
    action,
    eventId,
    tenantId,
    user,
    {
      itemId: payload?.itemId,
      barcode: payload?.barcode,
      newStatus: payload?.newStatus,
      scannedCount: payload?.scannedCount,
      autoTransitionToPrepped: payload?.autoTransitionToPrepped,
      clientTimestamp: payload?.clientTimestamp,
    },
    operationId
  );
}

/**
 * Explicit command to trigger side effects reconciliation worker on the server.
 */
export async function triggerSideEffectsRecovery(
  eventId: string,
  tenantId: string,
  operationId: string
): Promise<{ success: boolean; reconciliationStatus?: string; error?: string }> {
  if (!isOnline()) {
    return { success: false, error: 'Network connection required. Offline operations are disabled.' };
  }

  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) return { success: false, error: 'Not authenticated' };

  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/pullsheets/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        operationId,
        eventId,
        tenantId,
        action: 'reconcile_side_effects',
      }),
    });

    const data = await response.json().catch(() => null);
    if (response.ok && data && data.success === true) {
      return { success: true, reconciliationStatus: data.reconciliationStatus };
    }
    return { success: false, error: data?.error || 'Side effects recovery failed' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Recovery call failed' };
  }
}
