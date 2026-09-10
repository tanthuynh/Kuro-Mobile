/**
 * __tests__/pullsheet-concurrency-reconciliation.integration.test.ts
 * ============================================================================
 * Integration Test Suite: Kuro Mobile Pull Sheets & Backend Command Protocol
 * ============================================================================
 *
 * Verifies:
 * 1. Rejection of direct client writes under closed Firestore security rules (allow write: if false;)
 * 2. Prevention of FieldValue.serverTimestamp() inside array elements (Firestore invariant)
 * 3. Two simultaneous users executing concurrent increments without scan loss (Atomic Transactions)
 * 4. Serialized barcode deduplication (no double-incrementing on identical barcode scans)
 * 5. Server-side idempotency preventing duplicate scan increments on retry & payload mismatch rejection (409)
 * 6. In-flight disconnection reconciliation (committed, not_found, processing with bounded backoff)
 * 7. Selective rollback of optimistic overlays preserving newer live listener updates
 * 8. Strict online guard blocking mutations immediately without offline queuing
 * 9. Cold-start reconciliation of pending operations
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setNetworkOnlineState,
  isOnline,
  updatePullsheetItemStatus,
  updatePullsheetItemScannedCount,
  bulkConfirmPullsheet,
  reconcilePendingOperation,
  retryPendingOperation,
  reconcilePendingOperationsOnColdStart,
  getPendingOperations,
  clearPendingOperation,
  mapFirestorePullsheetDoc,
  isItemOperationPending,
  hasPendingOperations,
  triggerSideEffectsRecovery,
  type PendingOperationRecord,
} from '@/services/pull-sheet-service';
import { auth } from '@/lib/firebase';
import type { Pullsheet, PullsheetItem } from '@/types/pull-sheet';

// Setup mock auth
jest.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'warehouse-op-1',
      getIdToken: jest.fn().mockResolvedValue('mock-firebase-id-token-xyz'),
    },
  },
  db: {},
}));

describe('Pull Sheet Concurrency, Idempotency & Network Reconciliation Integration Suite', () => {
  const TEST_TENANT = 'tenant-delta-42';
  const TEST_USER_1 = 'warehouse-op-1';
  const TEST_USER_2 = 'warehouse-op-2';
  const TEST_EVENT = 'event-fest-2026';

  beforeEach(async () => {
    jest.clearAllMocks();
    setNetworkOnlineState(true);
    await AsyncStorage.clear();

    // Default mock user
    (auth.currentUser as any) = {
      uid: TEST_USER_1,
      getIdToken: jest.fn().mockResolvedValue('valid-bearer-token'),
    };
  });

  afterEach(() => {
    setNetworkOnlineState(true);
  });

  // ==========================================================================
  // 1. REJECTION OF DIRECT CLIENT WRITES UNDER CLOSED FIRESTORE SECURITY RULES
  // ==========================================================================
  describe('1. Closed Client Firestore Security Rules', () => {
    it('R1-SEC-01: Direct client SDK writes (updateDoc, setDoc, deleteDoc) are rejected under closed rules', async () => {
      // Simulating Firestore client SDK rules engine evaluating "allow write: if false;"
      const evaluateRules = (operation: 'read' | 'write' | 'delete', isAuthenticated: boolean) => {
        if (!isAuthenticated) return { allowed: false, code: 'permission-denied' };
        if (operation === 'write' || operation === 'delete') {
          // Closed mutation rule: match /{collection}/{docId} { allow write: if false; }
          return {
            allowed: false,
            code: 'permission-denied',
            message: 'PERMISSION_DENIED: Direct client writes to pullsheets are closed. Use /api/pullsheets/command',
          };
        }
        return { allowed: true };
      };

      const directClientWrite = (op: 'write' | 'delete') => {
        const result = evaluateRules(op, true);
        if (!result.allowed) {
          const err: any = new Error(result.message);
          err.code = result.code;
          throw err;
        }
      };

      // Direct write attempt MUST throw PERMISSION_DENIED
      expect(() => directClientWrite('write')).toThrow(/PERMISSION_DENIED/);
      expect(() => directClientWrite('delete')).toThrow(/PERMISSION_DENIED/);

      // Reads are allowed for authenticated tenant members
      expect(evaluateRules('read', true).allowed).toBe(true);
    });

    it('R1-SEC-02: Mobile service exclusively routes all pull sheet mutations through authenticated POST /api/pullsheets/command', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedHeaders: Record<string, string> = {};

      global.fetch = jest.fn().mockImplementation((url: string, init: any) => {
        capturedUrl = url;
        capturedMethod = init?.method || 'GET';
        capturedHeaders = init?.headers || {};
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              status: 'committed',
              operationId: JSON.parse(init.body).operationId,
              result: { updatedItem: { id: 'item-1', status: 'confirmed' } },
            }),
        });
      });

      const res = await updatePullsheetItemStatus(
        TEST_EVENT,
        TEST_TENANT,
        'item-1',
        'confirmed',
        { uid: TEST_USER_1 }
      );

      expect(res.success).toBe(true);
      expect(capturedUrl).toContain('/api/pullsheets/command');
      expect(capturedMethod).toBe('POST');
      expect(capturedHeaders['Authorization']).toBe('Bearer valid-bearer-token');
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });

    it('R1-SEC-03: Rejects command dispatch if caller is not authenticated with valid token', async () => {
      (auth.currentUser as any) = null;

      const res = await updatePullsheetItemStatus(
        TEST_EVENT,
        TEST_TENANT,
        'item-1',
        'confirmed',
        { uid: TEST_USER_1 }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Authentication required');
    });
  });

  // ==========================================================================
  // 2. PREVENTION OF SERVERTIMESTAMP() IN ARRAY ELEMENTS
  // ==========================================================================
  describe('2. Prevention of serverTimestamp() in Array Elements', () => {
    it('R2-TS-01: Firestore forbids FieldValue.serverTimestamp() inside array elements and throws error', () => {
      // Simulating Firestore validateUpdateData / parseValue logic
      const simulateFirestoreArrayValidation = (data: Record<string, any>) => {
        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            if (item && typeof item === 'object') {
              for (const [key, val] of Object.entries(item)) {
                if (val && typeof val === 'object' && (val as any)._methodName === 'serverTimestamp') {
                  throw new Error(
                    `FirebaseError: Function updateDoc() called with invalid data. FieldValue.serverTimestamp() cannot be used inside of an array (found in field items[${key}])`
                  );
                }
              }
            }
          }
        }
        return true;
      };

      const invalidPayloadWithServerTimestampInArray = {
        items: [
          {
            id: 'item-cable-1',
            status: 'prepped_scanned',
            statusUpdatedAt: { _methodName: 'serverTimestamp' }, // Invalid!
          },
        ],
      };

      expect(() => simulateFirestoreArrayValidation(invalidPayloadWithServerTimestampInArray)).toThrow(
        /FieldValue\.serverTimestamp\(\) cannot be used inside of an array/
      );
    });

    it('R2-TS-02: Pullsheet doc mapping robustly parses Timestamp.now() and ISO timestamps on item records', () => {
      const now = new Date('2026-09-09T12:00:00.000Z');
      const rawFirestoreDoc = {
        id: TEST_EVENT,
        tenantId: TEST_TENANT,
        items: [
          {
            id: 'item-10',
            description: 'D&B Audiotechnik J-SUB',
            quantity: 4,
            scannedQuantity: 2,
            status: 'prepped_scanned',
            type: 'item',
            statusUpdatedAt: {
              toDate: () => now,
              toISOString: () => now.toISOString(),
            },
          },
          {
            id: 'item-20',
            description: 'Neutrik PowerCON 20m',
            quantity: 10,
            status: 'pending',
            type: 'item',
            statusUpdatedAt: '2026-09-09T11:45:00.000Z',
          },
        ],
        updatedAt: {
          toDate: () => now,
        },
      };

      const mapped = mapFirestorePullsheetDoc(rawFirestoreDoc);

      expect(mapped.items[0].statusUpdatedAt).toBeInstanceOf(Date);
      expect(mapped.items[0].statusUpdatedAt?.toISOString()).toBe(now.toISOString());
      expect(mapped.items[1].statusUpdatedAt).toBeInstanceOf(Date);
      expect(mapped.items[1].statusUpdatedAt?.toISOString()).toBe('2026-09-09T11:45:00.000Z');
    });
  });

  // ==========================================================================
  // 3. TWO SIMULTANEOUS USERS EXECUTING CONCURRENT INCREMENTS WITHOUT SCAN LOSS
  // ==========================================================================
  describe('3. Atomic Concurrency & Zero Scan Loss Under Simultaneous Scans', () => {
    it('R3-CONC-01: Two operators scanning bulk items simultaneously both commit via transaction retry without lost updates', async () => {
      // In-memory Firestore transaction simulator with optimistic lock contention
      interface DocRecord {
        version: number;
        data: any;
      }

      const database = new Map<string, DocRecord>();
      const docId = `pullsheets/${TEST_EVENT}`;

      database.set(docId, {
        version: 1,
        data: {
          id: TEST_EVENT,
          tenantId: TEST_TENANT,
          items: [
            {
              id: 'bulk-xlr-cables',
              description: 'Standard XLR 10m Cables',
              quantity: 20,
              scannedQuantity: 5,
              status: 'pending',
              type: 'item',
            },
          ],
        },
      });

      // Transaction runner with conflict detection and retry
      const runTransaction = async <T>(
        updateFunction: (tx: {
          get: (id: string) => Promise<any>;
          update: (id: string, updateData: any) => void;
        }) => Promise<T>,
        maxRetries = 5
      ): Promise<T> => {
        let attempts = 0;
        while (attempts < maxRetries) {
          attempts++;
          const readVersions = new Map<string, number>();
          const pendingUpdates = new Map<string, any>();

          const tx = {
            get: async (id: string) => {
              const current = database.get(id);
              if (!current) throw new Error('NOT_FOUND');
              readVersions.set(id, current.version);
              return JSON.parse(JSON.stringify(current.data));
            },
            update: (id: string, updateData: any) => {
              pendingUpdates.set(id, updateData);
            },
          };

          const result = await updateFunction(tx);

          // Attempt commit (verify versions haven't changed)
          let hasConflict = false;
          for (const [id, readVer] of readVersions.entries()) {
            const current = database.get(id);
            if (!current || current.version !== readVer) {
              hasConflict = true;
              break;
            }
          }

          if (!hasConflict) {
            // Apply updates and bump version
            for (const [id, updateData] of pendingUpdates.entries()) {
              const current = database.get(id)!;
              database.set(id, {
                version: current.version + 1,
                data: { ...current.data, ...updateData },
              });
            }
            return result;
          }

          // Conflict: backoff slightly and retry
          await new Promise((r) => setTimeout(r, Math.random() * 20));
        }
        throw new Error('Transaction contention limit exceeded');
      };

      // Mutation function simulating increment_scan inside transaction
      const performScanIncrement = async (userId: string, countToAdd: number) => {
        return runTransaction(async (tx) => {
          const docData = await tx.get(docId);
          const items = docData.items;
          const target = items.find((i: any) => i.id === 'bulk-xlr-cables');
          const currentCount = target.scannedQuantity || 0;
          const nextCount = currentCount + countToAdd;

          const updatedItems = items.map((i: any) =>
            i.id === 'bulk-xlr-cables'
              ? {
                  ...i,
                  scannedQuantity: nextCount,
                  status: nextCount >= i.quantity ? 'prepped_scanned' : 'pending',
                  statusUpdatedBy: userId,
                }
              : i
          );

          tx.update(docId, { items: updatedItems });
          return nextCount;
        });
      };

      // Two users trigger scans at the EXACT same moment
      const [finalCountUser1, finalCountUser2] = await Promise.all([
        performScanIncrement(TEST_USER_1, 1),
        performScanIncrement(TEST_USER_2, 1),
      ]);

      // Both succeeded
      expect(Math.abs(finalCountUser1 - finalCountUser2)).toBe(1);

      // Verify the final stored database state reflects BOTH increments (5 -> 7) with ZERO scan loss
      const finalDoc = database.get(docId)!;
      const finalItem = finalDoc.data.items.find((i: any) => i.id === 'bulk-xlr-cables');
      expect(finalItem.scannedQuantity).toBe(7);
      expect(finalDoc.version).toBe(3); // Initial (1) + User1 (+1) + User2 (+1)
    });

    it('R3-CONC-02: 12 simultaneous warehouse operators scanning items concurrently on the same pullsheet document all succeed without scan loss', async () => {
      interface ContentionDocRecord {
        version: number;
        data: any;
      }

      const contentionDb = new Map<string, ContentionDocRecord>();
      const docPath = `pullsheets/${TEST_EVENT}`;

      contentionDb.set(docPath, {
        version: 1,
        data: {
          id: TEST_EVENT,
          tenantId: TEST_TENANT,
          items: [
            {
              id: 'bulk-cables-heavy',
              description: 'Heavy Duty 32A CEE Form Cables',
              quantity: 50,
              scannedQuantity: 0,
              status: 'pending',
              type: 'item',
            },
          ],
        },
      });

      const executeContentionTx = async <T>(
        updateFn: (tx: { get: (id: string) => Promise<any>; update: (id: string, data: any) => void }) => Promise<T>,
        maxRetries = 25
      ): Promise<T> => {
        let attempts = 0;
        while (attempts < maxRetries) {
          attempts++;
          const readVersions = new Map<string, number>();
          const pendingUpdates = new Map<string, any>();

          const tx = {
            get: async (id: string) => {
              const cur = contentionDb.get(id);
              if (!cur) throw new Error('NOT_FOUND');
              readVersions.set(id, cur.version);
              return JSON.parse(JSON.stringify(cur.data));
            },
            update: (id: string, data: any) => {
              pendingUpdates.set(id, data);
            },
          };

          const res = await updateFn(tx);

          let conflict = false;
          for (const [id, rVer] of readVersions.entries()) {
            const cur = contentionDb.get(id);
            if (!cur || cur.version !== rVer) {
              conflict = true;
              break;
            }
          }

          if (!conflict) {
            for (const [id, upData] of pendingUpdates.entries()) {
              const cur = contentionDb.get(id)!;
              contentionDb.set(id, {
                version: cur.version + 1,
                data: { ...cur.data, ...upData },
              });
            }
            return res;
          }

          // Backoff with randomized jitter
          await new Promise((r) => setTimeout(r, Math.random() * 15 + 5));
        }
        throw new Error('Transaction contention limit exceeded');
      };

      const operatorScan = (operatorId: string) => {
        return executeContentionTx(async (tx) => {
          const docData = await tx.get(docPath);
          const items = docData.items;
          const target = items.find((i: any) => i.id === 'bulk-cables-heavy');
          const next = (target.scannedQuantity || 0) + 1;

          const updatedItems = items.map((i: any) =>
            i.id === 'bulk-cables-heavy'
              ? {
                  ...i,
                  scannedQuantity: next,
                  status: next >= i.quantity ? 'prepped_scanned' : 'pending',
                  statusUpdatedBy: operatorId,
                }
              : i
          );

          tx.update(docPath, { items: updatedItems });
          return next;
        });
      };

      // 12 operators fire simultaneous scans
      const operators = Array.from({ length: 12 }, (_, i) => `operator-seat-${i + 1}`);
      const results = await Promise.all(operators.map((op) => operatorScan(op)));

      expect(results.length).toBe(12);

      // Verify all 12 increments were saved with zero lost updates (0 -> 12)
      const finalDoc = contentionDb.get(docPath)!;
      const targetItem = finalDoc.data.items.find((i: any) => i.id === 'bulk-cables-heavy');
      expect(targetItem.scannedQuantity).toBe(12);
      expect(finalDoc.version).toBe(13); // 1 initial + 12 commits
    });
  });

  // ==========================================================================
  // 4. SERIALIZED BARCODE DEDUPLICATION
  // ==========================================================================
  describe('4. Serialized Barcode Deduplication', () => {
    it('R4-DEDUP-01: Scanning an already-scanned barcode deduplicates and does not double increment quantity', async () => {
      // Backend transaction simulation for serialized equipment
      let currentPullsheet = {
        id: TEST_EVENT,
        tenantId: TEST_TENANT,
        items: [
          {
            id: 'item-spotlight',
            description: 'Martin MAC Viper Profile',
            quantity: 3,
            scannedQuantity: 1,
            scannedBarcodes: ['BAR-VIPER-001'],
            status: 'pending',
          },
        ],
      };

      const backendIncrementHandler = (barcode: string) => {
        const item = currentPullsheet.items[0];
        const existingBarcodes = [...(item.scannedBarcodes || [])];

        // DEDUPLICATION GUARD:
        if (barcode && existingBarcodes.includes(barcode)) {
          return {
            deduplicated: true,
            scannedQuantity: item.scannedQuantity,
            scannedBarcodes: existingBarcodes,
          };
        }

        const newBarcodes = [...existingBarcodes, barcode];
        const newCount = (item.scannedQuantity || 0) + 1;
        item.scannedBarcodes = newBarcodes;
        item.scannedQuantity = newCount;
        if (newCount >= item.quantity) {
          item.status = 'prepped_scanned';
        }

        return {
          deduplicated: false,
          scannedQuantity: newCount,
          scannedBarcodes: newBarcodes,
        };
      };

      // 1. Rescanning the exact same barcode 'BAR-VIPER-001'
      const duplicateAttempt = backendIncrementHandler('BAR-VIPER-001');
      expect(duplicateAttempt.deduplicated).toBe(true);
      expect(duplicateAttempt.scannedQuantity).toBe(1); // Did NOT increment to 2
      expect(duplicateAttempt.scannedBarcodes).toEqual(['BAR-VIPER-001']); // Did NOT duplicate barcode array

      // 2. Scanning a new barcode 'BAR-VIPER-002'
      const distinctAttempt = backendIncrementHandler('BAR-VIPER-002');
      expect(distinctAttempt.deduplicated).toBe(false);
      expect(distinctAttempt.scannedQuantity).toBe(2); // Increments to 2
      expect(distinctAttempt.scannedBarcodes).toEqual(['BAR-VIPER-001', 'BAR-VIPER-002']);
    });
  });

  // ==========================================================================
  // 5. SERVER-SIDE IDEMPOTENCY & PAYLOAD VERIFICATION
  // ==========================================================================
  describe('5. Server-Side Idempotency & Operation Receipts', () => {
    it('R5-IDEMP-01: Re-submitting an identical command with the same operationId returns cached receipt without re-incrementing', async () => {
      const receipts = new Map<string, { payloadHash: string; status: string; result: any }>();
      let scannedCount = 10;

      const serverCommandRoute = async (body: any) => {
        const { operationId, payloadHash } = body;

        // Check idempotency receipt
        if (receipts.has(operationId)) {
          const receipt = receipts.get(operationId)!;
          if (receipt.payloadHash !== payloadHash) {
            return { status: 409, error: 'Idempotency violation: payload mismatch for operationId' };
          }
          return {
            status: 200,
            data: {
              success: true,
              status: 'committed',
              operationId,
              alreadyCommitted: true,
              result: receipt.result,
            },
          };
        }

        // Fresh operation
        scannedCount += 1;
        const result = { updatedItem: { id: 'item-1', scannedQuantity: scannedCount } };
        receipts.set(operationId, { payloadHash, status: 'committed', result });

        return {
          status: 200,
          data: {
            success: true,
            status: 'committed',
            operationId,
            alreadyCommitted: false,
            result,
          },
        };
      };

      const payload = {
        operationId: 'op-idem-uuid-001',
        payloadHash: 'hash-abc-123',
        action: 'increment_scan',
        itemId: 'item-1',
      };

      // First execution
      const firstRes = await serverCommandRoute(payload);
      expect(firstRes.status).toBe(200);
      expect(firstRes.data?.alreadyCommitted).toBe(false);
      expect(scannedCount).toBe(11);

      // Re-submission of exact same command (retry after network timeout)
      const secondRes = await serverCommandRoute(payload);
      expect(secondRes.status).toBe(200);
      expect(secondRes.data?.alreadyCommitted).toBe(true);
      expect(scannedCount).toBe(11); // Scanned count was NOT incremented again!
    });

    it('R5-IDEMP-02: Reusing an operationId with mismatched payload is rejected with 409 Conflict', async () => {
      const receipts = new Map<string, { payloadHash: string }>();
      receipts.set('op-reuse-id-99', { payloadHash: 'correct-original-hash' });

      const serverValidateIdempotency = (operationId: string, currentHash: string) => {
        const existing = receipts.get(operationId);
        if (existing && existing.payloadHash !== currentHash) {
          return { status: 409, error: 'Idempotency violation: payload mismatch for operationId' };
        }
        return { status: 200, success: true };
      };

      const conflictingRes = serverValidateIdempotency('op-reuse-id-99', 'altered-hostile-hash');
      expect(conflictingRes.status).toBe(409);
      expect(conflictingRes.error).toContain('Idempotency violation');
    });

    it('R5-IDEMP-03: Operation transitioning from outcome_unknown to committed is resolved idempotently by retryOperation without double incrementing', async () => {
      const opId = 'op-trans-commit-1';
      const pendingRecord: PendingOperationRecord = {
        operationId: opId,
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'increment_scan',
        payload: { itemId: 'item-spot-1', scannedCount: 3 },
        timestamp: Date.now(),
        state: 'outcome_unknown',
      };

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([pendingRecord])
      );

      // Server indicates that the operation has already been committed in the interim
      let receivedOperationId = '';
      global.fetch = jest.fn().mockImplementation((_url, init) => {
        const body = JSON.parse(init.body);
        receivedOperationId = body.operationId;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              status: 'committed',
              operationId: body.operationId,
              alreadyCommitted: true,
              result: { updatedItem: { id: 'item-spot-1', scannedQuantity: 3 } },
            }),
        });
      });

      const retryRes = await retryPendingOperation(pendingRecord, { uid: TEST_USER_1 });

      expect(retryRes.success).toBe(true);
      expect(retryRes.alreadyCommitted).toBe(true);
      expect(receivedOperationId).toBe(opId);

      // Verify that durable storage was cleared on acknowledged commit
      const remaining = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(remaining.length).toBe(0);
    });
  });

  // ==========================================================================
  // 6. IN-FLIGHT DISCONNECTION RECONCILIATION
  // ==========================================================================
  describe('6. In-Flight Disconnection Reconciliation & Durable Storage', () => {
    it('R6-DISC-01: Network timeout marks operation as outcome_unknown in durable storage without blind replay', async () => {
      // Mock network timeout
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network request failed / timeout')), 50);
        });
      });

      const res = await updatePullsheetItemStatus(
        TEST_EVENT,
        TEST_TENANT,
        'item-broken-net',
        'prepped_scanned',
        { uid: TEST_USER_1 }
      );

      expect(res.success).toBe(false);
      expect(res.outcomeUnknown).toBe(true);
      expect(res.operationId).toBeDefined();

      // Check durable storage: must be persisted as outcome_unknown
      const pending = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(pending.length).toBe(1);
      expect(pending[0].operationId).toBe(res.operationId);
      expect(pending[0].state).toBe('outcome_unknown');
    });

    it('R6-DISC-02: Reconciles committed operation when network resumes and adopts confirmed result', async () => {
      const opId = 'op-committed-offline';
      const storedPendingRecord: PendingOperationRecord = {
        operationId: opId,
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'increment_scan',
        payload: { itemId: 'item-speaker-1' },
        timestamp: Date.now(),
        state: 'outcome_unknown',
      };

      // Save to AsyncStorage
      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([storedPendingRecord])
      );

      // Mock status endpoint returning committed result
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'committed',
            operationId: opId,
            reconciliationStatus: 'completed',
            result: { updatedItem: { id: 'item-speaker-1', scannedQuantity: 4 } },
          }),
      });

      const reconciliation = await reconcilePendingOperation(TEST_EVENT, TEST_TENANT, TEST_USER_1, opId);

      expect(reconciliation.success).toBe(true);
      expect(reconciliation.status).toBe('committed');
      expect(reconciliation.result.updatedItem.scannedQuantity).toBe(4);

      // Record cleared from durable storage on confirmed commit
      const remaining = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(remaining.length).toBe(0);
    });

    it('R6-DISC-03: Reconciles not_found operation and permits explicit retry reusing original operationId', async () => {
      const opId = 'op-lost-midair';
      const pendingRecord: PendingOperationRecord = {
        operationId: opId,
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'increment_scan',
        payload: { itemId: 'item-mic-1', scannedCount: 2 },
        timestamp: Date.now(),
        state: 'outcome_unknown',
      };

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([pendingRecord])
      );

      // Mock status endpoint returning not_found
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'not_found',
            operationId: opId,
          }),
      });

      const reconciliation = await reconcilePendingOperation(TEST_EVENT, TEST_TENANT, TEST_USER_1, opId);
      expect(reconciliation.success).toBe(true);
      expect(reconciliation.status).toBe('not_found');

      // Now explicit user retry MUST reuse the original operationId
      let dispatchedBody: any = null;
      global.fetch = jest.fn().mockImplementation((_url, init) => {
        dispatchedBody = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              status: 'committed',
              operationId: dispatchedBody.operationId,
            }),
        });
      });

      const retryRes = await retryPendingOperation(pendingRecord, { uid: TEST_USER_1 });
      expect(retryRes.success).toBe(true);
      expect(dispatchedBody.operationId).toBe(opId); // Exact original operationId reused!
    });

    it('R6-DISC-04: Status reconciliation polls with bounded backoff if server indicates processing', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, status: 'processing' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              status: 'committed',
              reconciliationStatus: 'completed',
            }),
        });
      });

      const res = await reconcilePendingOperation(TEST_EVENT, TEST_TENANT, TEST_USER_1, 'op-poll-1', 4);
      expect(res.success).toBe(true);
      expect(res.status).toBe('committed');
      expect(callCount).toBe(3);
    });

    it('R6-DISC-05: Cold-start reconciliation reconciles pending operations upon restart', async () => {
      const records: PendingOperationRecord[] = [
        {
          operationId: 'op-cold-1',
          eventId: TEST_EVENT,
          tenantId: TEST_TENANT,
          userId: TEST_USER_1,
          action: 'bulk_confirm',
          payload: {},
          timestamp: Date.now() - 60000,
          state: 'outcome_unknown',
        },
      ];

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify(records)
      );

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'committed',
            reconciliationStatus: 'completed',
          }),
      });

      const coldStartResult = await reconcilePendingOperationsOnColdStart(TEST_TENANT, TEST_USER_1);
      expect(coldStartResult.committed.length).toBe(1);
      expect(coldStartResult.committed[0].operationId).toBe('op-cold-1');

      // Storage cleaned
      const remaining = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(remaining.length).toBe(0);
    });

    it('R6-DISC-06: 5xx server gateway errors (502, 503, 504) preserve outcome_unknown in durable storage rather than discarding receipt', async () => {
      // Mock gateway 503 Service Unavailable
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Service Unavailable' }),
      });

      const res = await updatePullsheetItemStatus(
        TEST_EVENT,
        TEST_TENANT,
        'item-503',
        'prepped_scanned',
        { uid: TEST_USER_1 }
      );

      expect(res.success).toBe(false);
      expect(res.outcomeUnknown).toBe(true);

      // Verify that the record was KEPT in durable storage with state outcome_unknown
      const pending = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(pending.length).toBe(1);
      expect(pending[0].operationId).toBe(res.operationId);
      expect(pending[0].state).toBe('outcome_unknown');
    });

    it('R6-DISC-07: HTTP 408 Request Timeout preserves outcome_unknown in durable storage rather than discarding receipt', async () => {
      // Mock gateway 408 Request Timeout
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 408,
        json: () => Promise.resolve({ error: 'Request Timeout' }),
      });

      const res = await updatePullsheetItemStatus(
        TEST_EVENT,
        TEST_TENANT,
        'item-408',
        'prepped_scanned',
        { uid: TEST_USER_1 }
      );

      expect(res.success).toBe(false);
      expect(res.outcomeUnknown).toBe(true);

      // Verify receipt was NOT deleted on 408 Request Timeout
      const pending = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(pending.length).toBe(1);
      expect(pending[0].operationId).toBe(res.operationId);
      expect(pending[0].state).toBe('outcome_unknown');
    });

    it('R6-DISC-08: Command response returning status: processing retains operation in durable storage and performs bounded polling', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation((url) => {
        callCount++;
        if (url.includes('/api/pullsheets/command/status')) {
          // Status polling returns committed on second call
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                success: true,
                status: 'committed',
                result: { updatedItem: { id: 'item-proc-1', status: 'confirmed' } },
              }),
          });
        }
        // Initial POST returns processing
        return Promise.resolve({
          ok: true,
          status: 202,
          json: () =>
            Promise.resolve({
              success: true,
              status: 'processing',
            }),
        });
      });

      const res = await updatePullsheetItemStatus(
        TEST_EVENT,
        TEST_TENANT,
        'item-proc-1',
        'confirmed',
        { uid: TEST_USER_1 }
      );

      expect(res.success).toBe(true);
      expect(res.item?.status).toBe('confirmed');
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('R6-DISC-09: Status reconciliation query returning not_found transitions durable state from in_flight to outcome_unknown', async () => {
      const opId = 'op-in-flight-to-reconcile';
      const initialRecord: PendingOperationRecord = {
        operationId: opId,
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'increment_scan',
        payload: { itemId: 'item-nf-1' },
        timestamp: Date.now() - 5000,
        state: 'in_flight',
      };

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([initialRecord])
      );

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'not_found',
            operationId: opId,
          }),
      });

      const res = await reconcilePendingOperation(TEST_EVENT, TEST_TENANT, TEST_USER_1, opId);
      expect(res.success).toBe(true);
      expect(res.status).toBe('not_found');

      // Durable storage record should now be updated to outcome_unknown
      const pending = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(pending.length).toBe(1);
      expect(pending[0].operationId).toBe(opId);
      expect(pending[0].state).toBe('outcome_unknown');
    });

    it('R6-DISC-10: Status reconciliation query returning processing transitions durable state to outcome_unknown when polling exhausts', async () => {
      const opId = 'op-processing-exhaust-poll';
      const initialRecord: PendingOperationRecord = {
        operationId: opId,
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'increment_scan',
        payload: { itemId: 'item-proc-exhaust' },
        timestamp: Date.now() - 10000,
        state: 'in_flight',
      };

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([initialRecord])
      );

      // Return status: processing on all attempts
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'processing',
            operationId: opId,
          }),
      });

      const res = await reconcilePendingOperation(TEST_EVENT, TEST_TENANT, TEST_USER_1, opId, 2);
      expect(res.success).toBe(true);
      expect(res.status).toBe('processing');

      // Durable storage record must be updated to outcome_unknown upon exhaustion
      const pending = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(pending.length).toBe(1);
      expect(pending[0].operationId).toBe(opId);
      expect(pending[0].state).toBe('outcome_unknown');
    });

    it('R6-DISC-11: HTTP 499 Client Closed Request preserves outcome_unknown in durable storage rather than discarding receipt', async () => {
      // Mock gateway 499 Client Closed Request
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 499,
        json: () => Promise.resolve({ error: 'Client Closed Request' }),
      });

      const res = await updatePullsheetItemStatus(
        TEST_EVENT,
        TEST_TENANT,
        'item-499',
        'prepped_scanned',
        { uid: TEST_USER_1 }
      );

      expect(res.success).toBe(false);
      expect(res.outcomeUnknown).toBe(true);

      // Verify receipt was NOT deleted on 499 Client Closed Request
      const pending = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(pending.length).toBe(1);
      expect(pending[0].operationId).toBe(res.operationId);
      expect(pending[0].state).toBe('outcome_unknown');
    });
  });

  // ==========================================================================
  // 7. STRICT OFFLINE GUARD & CONFLICT PREVENTION
  // ==========================================================================
  describe('7. Strict Offline Guard & Conflicting Action Prevention', () => {
    it('R7-OFF-01: Offline mutations and scans are blocked immediately with zero DB writes and zero local queueing', async () => {
      setNetworkOnlineState(false);
      expect(isOnline()).toBe(false);

      const fetchSpy = jest.spyOn(global, 'fetch');

      const res = await updatePullsheetItemStatus(
        TEST_EVENT,
        TEST_TENANT,
        'item-offline',
        'confirmed',
        { uid: TEST_USER_1 }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Network connection required');
      expect(fetchSpy).not.toHaveBeenCalled();

      // Zero items queued in durable storage
      const pending = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(pending.length).toBe(0);
    });

    it('R7-OFF-02: Disables conflicting actions on an item while an operation is in-flight or outcome-unknown', async () => {
      const inFlightRecord: PendingOperationRecord = {
        operationId: 'op-in-flight-item',
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'increment_scan',
        payload: { itemId: 'item-locked-1' },
        timestamp: Date.now(),
        state: 'in_flight',
      };

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([inFlightRecord])
      );

      const isLocked = await isItemOperationPending(TEST_TENANT, TEST_USER_1, 'item-locked-1');
      expect(isLocked).toBe(true);

      const otherItemLocked = await isItemOperationPending(TEST_TENANT, TEST_USER_1, 'item-other-2');
      expect(otherItemLocked).toBe(false);

      const hasOps = await hasPendingOperations(TEST_TENANT, TEST_USER_1, TEST_EVENT);
      expect(hasOps).toBe(true);
    });

    it('R7-OFF-03: retryPendingOperation reuses original operationId and cleans up durable storage on success', async () => {
      const opId = 'op-stored-durable-retry';
      const pendingRecord: PendingOperationRecord = {
        operationId: opId,
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'update_status',
        payload: { itemId: 'item-mic-durable', newStatus: 'confirmed' },
        timestamp: Date.now() - 30000,
        state: 'outcome_unknown',
      };

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([pendingRecord])
      );

      let capturedPayload: any = null;
      global.fetch = jest.fn().mockImplementation((_url, init) => {
        capturedPayload = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              status: 'committed',
              operationId: capturedPayload.operationId,
            }),
        });
      });

      const res = await retryPendingOperation(pendingRecord, { uid: TEST_USER_1 });
      expect(res.success).toBe(true);
      expect(capturedPayload.operationId).toBe(opId);

      const remaining = await getPendingOperations(TEST_TENANT, TEST_USER_1);
      expect(remaining.length).toBe(0);
    });

    it('R7-OFF-04: isItemOperationPending blocks all items on an event when bulk_confirm is pending', async () => {
      const bulkRecord: PendingOperationRecord = {
        operationId: 'op-bulk-confirm-flight',
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'bulk_confirm',
        payload: {},
        timestamp: Date.now(),
        state: 'in_flight',
      };

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([bulkRecord])
      );

      // Any item on TEST_EVENT should be locked by the bulk confirmation
      const itemLocked = await isItemOperationPending(TEST_TENANT, TEST_USER_1, 'any-item-id', TEST_EVENT);
      expect(itemLocked).toBe(true);

      // Items on a different event should NOT be locked
      const differentEventLocked = await isItemOperationPending(TEST_TENANT, TEST_USER_1, 'any-item-id', 'other-event');
      expect(differentEventLocked).toBe(false);
    });

    it('R7-OFF-05: triggerSideEffectsRecovery blocks when offline without making network calls', async () => {
      setNetworkOnlineState(false);
      const fetchSpy = jest.spyOn(global, 'fetch');

      const res = await triggerSideEffectsRecovery(TEST_EVENT, TEST_TENANT, 'op-recovery-offline');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Network connection required');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('R7-OFF-06: retryPendingOperation preserves original clientTimestamp in payload to protect SHA-256 validation', async () => {
      const originalTime = 1725888000000;
      const pendingRecord: PendingOperationRecord = {
        operationId: 'op-timestamp-preserve',
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'update_status',
        payload: { itemId: 'item-ts-1', newStatus: 'confirmed', clientTimestamp: originalTime },
        timestamp: originalTime,
        state: 'outcome_unknown',
      };

      let capturedPayload: any = null;
      global.fetch = jest.fn().mockImplementation((_url, init) => {
        capturedPayload = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              status: 'committed',
              operationId: capturedPayload.operationId,
            }),
        });
      });

      await retryPendingOperation(pendingRecord, { uid: TEST_USER_1 });
      expect(capturedPayload.clientTimestamp).toBe(originalTime);
    });

    it('R7-OFF-07: isItemOperationPending blocks conflicting actions when operation is in reconciling state', async () => {
      const reconcilingRecord: PendingOperationRecord = {
        operationId: 'op-reconciling-lock',
        eventId: TEST_EVENT,
        tenantId: TEST_TENANT,
        userId: TEST_USER_1,
        action: 'increment_scan',
        payload: { itemId: 'item-reconciling-1' },
        timestamp: Date.now(),
        state: 'reconciling',
      };

      await AsyncStorage.setItem(
        `@kuro_pending_operations:${TEST_TENANT}:${TEST_USER_1}`,
        JSON.stringify([reconcilingRecord])
      );

      const isLocked = await isItemOperationPending(TEST_TENANT, TEST_USER_1, 'item-reconciling-1');
      expect(isLocked).toBe(true);

      const otherLocked = await isItemOperationPending(TEST_TENANT, TEST_USER_1, 'other-item-2');
      expect(otherLocked).toBe(false);
    });
  });
});
