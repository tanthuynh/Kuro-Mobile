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
  committed?: boolean;
  reconciliationStatus?: 'completed' | 'pending' | 'failed';
}

function getPendingStorageKey(tenantId: string, userId: string): string {
  return `@kuro_pending_operations:${tenantId}:${userId}`;
}

/**
 * Retrieves durable in-flight operations strictly namespaced by tenant and user.
 * Never shared across different accounts or tenants.
 */
const storageWrites = new Map<string, Promise<void>>();
const pendingListeners = new Map<string, Set<(records: PendingOperationRecord[]) => void>>();

export function subscribePendingOperations(tenantId: string, userId: string,
  listener: (records: PendingOperationRecord[]) => void): () => void {
  const key = getPendingStorageKey(tenantId, userId);
  const listeners = pendingListeners.get(key) || new Set();
  listeners.add(listener);
  pendingListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) pendingListeners.delete(key);
  };
}

async function mutatePendingOperations(
  tenantId: string,
  userId: string,
  mutate: (records: PendingOperationRecord[]) => PendingOperationRecord[]
): Promise<void> {
  const key = getPendingStorageKey(tenantId, userId);
  const previous = storageWrites.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const records = await readPendingOperations(tenantId, userId);
    const next = mutate(records);
    if (next.length) await AsyncStorage.setItem(key, JSON.stringify(next));
    else await AsyncStorage.removeItem(key);
    pendingListeners.get(key)?.forEach((listener) => {
      try { listener(next); } catch { /* A view cannot invalidate a persisted save. */ }
    });
  });
  storageWrites.set(key, task);
  try { await task; }
  finally { if (storageWrites.get(key) === task) storageWrites.delete(key); }
}

async function readPendingOperations(tenantId: string, userId: string): Promise<PendingOperationRecord[]> {
  const raw = await AsyncStorage.getItem(getPendingStorageKey(tenantId, userId));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((op) =>
    !op || typeof op.operationId !== 'string' || !op.eventId ||
    op.tenantId !== tenantId || op.userId !== userId || !op.payload
  )) throw new Error('Pending save records could not be verified. Recovery is required before saving.');
  return parsed;
}

export async function getPendingOperations(tenantId: string, userId: string): Promise<PendingOperationRecord[]> {
  if (!tenantId || !userId) return [];
  await storageWrites.get(getPendingStorageKey(tenantId, userId));
  return readPendingOperations(tenantId, userId);
}

async function savePendingOperation(record: PendingOperationRecord): Promise<void> {
  await mutatePendingOperations(record.tenantId, record.userId, (records) => [
    ...records.filter((op) => op.operationId !== record.operationId), record,
  ]);
}

export async function clearPendingOperation(tenantId: string, userId: string, operationId: string): Promise<void> {
  await mutatePendingOperations(tenantId, userId, (records) =>
    records.filter((op) => op.operationId !== operationId));
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

export const COMMAND_TIMEOUT_MS = 12000;

type CommandDetails = {
  itemId?: string;
  barcode?: string;
  newStatus?: PullsheetItemStatus;
  scannedCount?: number;
  autoTransitionToPrepped?: boolean;
  clientTimestamp?: number;
};

const activeCommands = new Set<{ tenantId: string; userId: string; eventId: string; itemId?: string }>();

function sameCaller(userId: string, caller: typeof auth.currentUser): boolean {
  return !!caller && auth.currentUser === caller && caller.uid === userId;
}

async function withDeadline<T>(work: Promise<T>, abort?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort?.();
          reject(new Error('Request timed out. The save may still have completed.'));
        }, COMMAND_TIMEOUT_MS);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function requestJson(url: string, init: RequestInit): Promise<{ response: Response; data: any }> {
  const controller = new AbortController();
  return withDeadline((async () => {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { /* An HTML/error body is not an acknowledgement. */ }
    return { response, data };
  })(), () => controller.abort());
}

async function acknowledgeOperation(record: PendingOperationRecord, status?: string): Promise<void> {
  if (status !== undefined && !['completed', 'pending', 'failed'].includes(status)) {
    throw new Error('Unknown inventory synchronization state. Check status before retrying.');
  }
  if (status === 'pending' || status === 'failed') {
    await savePendingOperation({ ...record, state: 'reconciling', committed: true, reconciliationStatus: status });
  } else {
    await clearPendingOperation(record.tenantId, record.userId, record.operationId);
  }
}

/** One authoritative write path. Unknown outcomes always retain the original receipt identity. */
async function executePullsheetCommand(
  action: PendingOperationRecord['action'],
  eventId: string,
  tenantId: string,
  user: { uid: string },
  details: CommandDetails,
  existingOperationId?: string
): Promise<CommandExecutionResult> {
  if (!isOnline()) return { success: false, error: 'Network connection required. Offline scanning is disabled.' };
  const caller = auth.currentUser;
  if (!eventId || !tenantId || !sameCaller(user.uid, caller)) {
    return { success: false, error: 'Authentication required, with a valid tenant and event.' };
  }
  const lock = { tenantId, userId: user.uid, eventId, itemId: action === 'bulk_confirm' ? undefined : details.itemId };
  if ([...activeCommands].some((op) => op.tenantId === tenantId && op.userId === user.uid &&
    op.eventId === eventId && (!op.itemId || !lock.itemId || op.itemId === lock.itemId))) {
    return { success: false, error: 'A save is already in-flight. Please wait.' };
  }
  activeCommands.add(lock);
  let pendingRecord: PendingOperationRecord | undefined;
  let dispatched = false;
  try {
    const idToken = await withDeadline(caller!.getIdToken());
    if (!idToken || !sameCaller(user.uid, caller)) throw new Error('Account changed. Please sign in again.');
    const records = await getPendingOperations(tenantId, user.uid);
    const original = existingOperationId ? records.find((op) => op.operationId === existingOperationId) : undefined;
    if (existingOperationId && !original) throw new Error('Original save record not found. Check status first.');
    if (original && (original.eventId !== eventId || original.action !== action ||
        original.payload.operationId !== existingOperationId || original.payload.eventId !== eventId ||
        original.payload.tenantId !== tenantId || original.payload.action !== action ||
        original.payload.itemId !== details.itemId)) {
      throw new Error('Stored operation does not match this request.');
    }
    const conflicting = records.some((op) => op.operationId !== existingOperationId &&
      op.eventId === eventId && (action === 'bulk_confirm' || op.action === 'bulk_confirm' || op.payload.itemId === details.itemId));
    if (conflicting) throw new Error('A previous save needs reconciliation before this item can be changed.');
    const operationId = existingOperationId || uuidv4();
    const payload = original?.payload || {
      operationId, eventId, tenantId, action, ...details,
      clientTimestamp: details.clientTimestamp ?? Date.now(),
    };
    pendingRecord = original || {
      operationId, eventId, tenantId, userId: user.uid, action, payload,
      timestamp: payload.clientTimestamp, state: 'in_flight',
    };
    // Storage failures stop dispatch; never silently lose the recovery record.
    await savePendingOperation(pendingRecord);
    if (!sameCaller(user.uid, caller) || !isOnline()) throw new Error('Session or connection changed before saving.');
    dispatched = true;
    const { response, data } = await requestJson(`${API_CONFIG.baseUrl}/api/pullsheets/command`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    });
    if (!sameCaller(user.uid, caller)) throw new Error('Account changed while saving. Check the original account for the result.');
    if (response.ok && data?.success === true && data.status === 'committed' && data.operationId === operationId) {
      await acknowledgeOperation(pendingRecord, data.reconciliationStatus);
      return {
        success: true, operationId, alreadyCommitted: data.alreadyCommitted === true,
        item: data.result?.updatedItem, pullsheetSummary: data.result?.pullsheetSummary,
        reconciliationStatus: data.reconciliationStatus,
      };
    }
    if (response.ok && data?.success === true && data.status === 'processing' && data.operationId === operationId) {
      await savePendingOperation({ ...pendingRecord, state: 'reconciling' });
      const polled = await reconcilePendingOperation(eventId, tenantId, user.uid, operationId);
      if (polled.success && polled.status === 'committed') return {
        success: true, operationId, item: polled.result?.updatedItem, reconciliationStatus: polled.reconciliationStatus,
      };
    }
    // Only a new, definitively rejected command can be discarded. A rejected retry
    // does not establish that its earlier request failed to commit.
    if (!existingOperationId && response.status >= 400 && response.status < 500 &&
      ![408, 409, 499].includes(response.status)) {
      await clearPendingOperation(tenantId, user.uid, operationId);
      return { success: false, operationId, error: data?.error ||
        (response.status === 404 ? 'The save endpoint is unavailable. No direct database fallback is allowed.' : `Save rejected (${response.status}).`) };
    }
    throw new Error(data?.error || 'Save not acknowledged. Check status before retrying.');
  } catch (err: any) {
    if (pendingRecord && dispatched) {
      await savePendingOperation({ ...pendingRecord, state: pendingRecord.committed ? 'reconciling' : 'outcome_unknown' })
        .catch(() => { /* The original durable in-flight record still supports recovery. */ });
    } else if (pendingRecord && !existingOperationId) {
      await clearPendingOperation(tenantId, user.uid, pendingRecord.operationId).catch(() => {});
    }
    return { success: false, error: err?.message || 'Unable to save.', outcomeUnknown: dispatched || undefined,
      operationId: pendingRecord?.operationId };
  } finally { activeCommands.delete(lock); }
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
  _newScannedCount: number,
  _autoTransitionToPrepped: boolean,
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
      // The existing server computes the increment and completion from current data.
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
  eventId: string, tenantId: string, userId: string, operationId: string, maxPollAttempts: number = 3
): Promise<StatusReconciliationResult> {
  const caller = auth.currentUser;
  if (!isOnline() || !sameCaller(userId, caller)) {
    return { success: false, status: 'error', error: 'Network connection and the original account are required.', operationId };
  }
  try {
    const idToken = await withDeadline(caller!.getIdToken());
    const url = `${API_CONFIG.baseUrl}/api/pullsheets/command/status?eventId=${encodeURIComponent(eventId)}&operationId=${encodeURIComponent(operationId)}`;
    for (let attempt = 0; attempt < Math.min(3, Math.max(1, maxPollAttempts)); attempt++) {
      if (!sameCaller(userId, caller)) throw new Error('Account changed during reconciliation.');
      const { response, data } = await requestJson(url, {
        method: 'GET', headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!sameCaller(userId, caller)) throw new Error('Account changed during reconciliation.');
      if (!response.ok || data?.success !== true || data.operationId !== operationId) {
        throw new Error(data?.error || 'Unverified status response. The save is still unresolved.');
      }
      if (data.status === 'committed') {
        const stored = (await getPendingOperations(tenantId, userId)).find((op) =>
          op.operationId === operationId && op.eventId === eventId);
        if (stored) await acknowledgeOperation(stored, data.reconciliationStatus);
        return { success: true, status: 'committed', operationId, result: data.result,
          reconciliationStatus: data.reconciliationStatus };
      }
      if (data.status === 'not_found' || data.status === 'processing') {
        await mutatePendingOperations(tenantId, userId, (records) => records.map((op) =>
          op.operationId === operationId && op.eventId === eventId && !op.committed
            ? { ...op, state: 'outcome_unknown' } : op));
        if (data.status === 'not_found') return { success: true, status: 'not_found', operationId };
        if (attempt + 1 < Math.min(3, Math.max(1, maxPollAttempts))) {
          await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
          continue;
        }
        return { success: true, status: 'processing', operationId };
      }
      throw new Error('Unknown receipt status. The save is still unresolved.');
    }
  } catch (err: any) {
    return { success: false, status: 'error', error: err?.message || 'Status check failed.', operationId };
  }
  return { success: false, status: 'error', error: 'Status check failed.', operationId };
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
      (!eventId || op.eventId === eventId) &&
      (op.payload?.itemId === itemId || op.action === 'bulk_confirm')
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
  if (pendingOp.userId !== user.uid || auth.currentUser?.uid !== user.uid) {
    return { success: false, error: 'Only the original account can retry this save.' };
  }
  const { operationId, eventId, tenantId, action, payload } = pendingOp;
  if (payload.operationId !== operationId || payload.eventId !== eventId ||
      payload.tenantId !== tenantId || payload.action !== action) {
    return { success: false, error: 'The original operation payload could not be verified.' };
  }
  // Replay the exact stored payload, including legacy absolute-count commands.
  try {
    const stored = (await getPendingOperations(tenantId, user.uid)).find((op) => op.operationId === operationId);
    if (!stored) return { success: false, error: 'Original save record not found. Check status first.' };
  } catch (err: any) { return { success: false, error: err.message }; }
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
  eventId: string, tenantId: string, operationId: string
): Promise<{ success: boolean; reconciliationStatus?: string; error?: string }> {
  if (!isOnline()) return { success: false, error: 'Network connection required.' };
  const uid = auth.currentUser?.uid;
  if (!uid) return { success: false, error: 'Not authenticated' };
  try {
    const record = (await getPendingOperations(tenantId, uid)).find((op) =>
      op.eventId === eventId && op.operationId === operationId && op.committed);
    if (!record) return { success: false, error: 'Original committed save record is required for recovery.' };
    // The fixed server retries side effects when the original command is replayed.
    return retryPendingOperation(record, { uid });
  } catch (err: any) { return { success: false, error: err.message }; }
}
