/**
 * __tests__/m1-challenger-empirical.challenge.test.ts
 * ============================================================================
 * Adversarial Empirical Challenge & Stress-Test Suite for Milestone 1
 * ============================================================================
 *
 * Authored by: teamwork_preview_challenger_m1_1_gen3
 * Role: critic / specialist (empirical-challenger)
 * Target:
 *  1. repair-service.ts error classification and non-offline propagation
 *  2. profile-database-efficiency.ts calculation boundaries, division-by-zero,
 *     duplicate query tracking, and percentile accuracy
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isOfflineError,
  updateEquipmentRepairCondition,
  syncRepairToRtdbLedger,
  createRepairTicket,
  setNetworkOnlineState,
} from '@/services/repair-service';
import {
  FirestoreProfiler,
  profileScenario1ColdBoot,
  profileScenario2EventsFeed,
  profileScenario3LogisticsVehicles,
  profileScenario4GpsTelemetry,
  profileScenario5RepairCreation,
  runAllBaselineBenchmarks,
  formatBenchmarkReport,
} from '../scripts/profile-database-efficiency';
import * as firestore from 'firebase/firestore';
import * as rtdb from 'firebase/database';
import type { CreateRepairTicketInput } from '@/types/repair';

const mockFirestore = firestore as jest.Mocked<any>;
const mockRtdb = rtdb as jest.Mocked<any>;

describe('Milestone 1 Empirical Challenger Stress Suite', () => {
  const tenantId = 'tenant-test-emp';
  const currentUser = {
    id: 'user-emp-1',
    uid: 'user-emp-1',
    name: 'Empirical Tester',
    email: 'tester@amia.com',
    tenantId,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    setNetworkOnlineState(true);
  });

  // ==========================================================================
  // SECTION 1: ADVERSARIAL STRESS-TEST OF isOfflineError
  // ==========================================================================
  describe('Adversarial Matrix: isOfflineError Strictness & Safety', () => {
    describe('Non-Offline Security & Permission Errors MUST ALWAYS return false', () => {
      const securityErrors = [
        { code: 'permission-denied', message: 'Permission denied' },
        { code: 'PERMISSION-DENIED', message: 'Permission denied' },
        { code: 'PERMISSION_DENIED', message: 'Permission denied' },
        { code: 'permission_denied', message: 'Permission denied' },
        { code: 'unauthenticated', message: 'Unauthenticated user' },
        { code: 'auth/user-disabled', message: 'Account disabled' },
        { code: 'auth/user-token-expired', message: 'Session expired' },
        { code: 'auth/operation-not-allowed', message: 'Operation not permitted' },
        new Error('Missing or insufficient permissions.'),
        new Error('FirebaseError: [code=permission-denied]: Missing or insufficient permissions.'),
        new Error('Error: Unauthorized access attempt'),
        new Error('Forbidden: Insufficient privileges to access resource'),
        new Error('Unauthenticated request rejected by security rules'),
      ];

      test.each(securityErrors)('security error (%p) -> false', (err) => {
        expect(isOfflineError(err)).toBe(false);
      });

      it('rejects compound error where offline keyword appears inside permission error', () => {
        // Adversarial attack: an attacker or malformed message contains 'offline' AND 'permission denied'
        const deceptiveError1 = new Error('Failed to get document: permission denied while offline');
        const deceptiveError2 = {
          code: 'permission-denied',
          message: 'The client is offline but permission was denied',
        };
        const deceptiveError3 = new Error('Network error: Missing or insufficient permissions.');

        expect(isOfflineError(deceptiveError1)).toBe(false);
        expect(isOfflineError(deceptiveError2)).toBe(false);
        expect(isOfflineError(deceptiveError3)).toBe(false);
      });
    });

    describe('Non-Offline Validation, Abort & Server Errors MUST ALWAYS return false', () => {
      const serverAndValidationErrors = [
        { code: 'invalid-argument', message: 'Invalid argument provided' },
        { code: 'INVALID_ARGUMENT', message: 'Invalid argument provided' },
        { code: 'not-found', message: 'Document not found' },
        { code: 'already-exists', message: 'Document already exists' },
        { code: 'failed-precondition', message: 'Precondition check failed' },
        { code: 'aborted', message: 'Transaction aborted due to contention' },
        { code: 'ABORTED', message: 'Transaction aborted due to contention' },
        { code: 'out-of-range', message: 'Index out of range' },
        { code: 'unimplemented', message: 'Feature not implemented' },
        { code: 'internal', message: 'Internal server error occurred' },
        { code: 'INTERNAL', message: 'Internal server error occurred' },
        { code: 'data-loss', message: 'Data loss detected in storage' },
        { code: 'resource-exhausted', message: 'Resource quota exceeded' },
        new Error('invalid-argument: Path must be a non-empty string'),
        new Error('already exists: Entity already registered in ledger'),
        new Error('failed precondition: Target document is archived'),
        new Error('resource exhausted: Monthly Firestore read quota reached'),
        new Error('quota exceeded: Rate limit reached'),
      ];

      test.each(serverAndValidationErrors)('non-offline server/validation error (%p) -> false', (err) => {
        expect(isOfflineError(err)).toBe(false);
      });
    });

    describe('Genuine Offline / Network Conditions MUST return true', () => {
      const genuineOfflineErrors = [
        { code: 'unavailable', message: 'Firestore backend unavailable' },
        { code: 'UNAVAILABLE', message: 'Service unavailable' },
        { code: 'deadline-exceeded', message: 'Deadline exceeded on RPC call' },
        { code: 'DEADLINE_EXCEEDED', message: 'Deadline exceeded' },
        { code: 'network-request-failed', message: 'Network request failed' },
        { code: 'disconnected', message: 'Socket disconnected' },
        new Error('Failed to get document because the client is offline.'),
        new Error('TypeError: Failed to fetch'),
        new Error('Network request failed'),
        new Error('The client is offline'),
        new Error('Connection reset by peer'),
        new Error('Connection refused by remote host'),
        new Error('Connection closed prematurely'),
        new Error('Connection aborted by peer'),
      ];

      test.each(genuineOfflineErrors)('genuine offline error (%p) -> true', (err) => {
        expect(isOfflineError(err)).toBe(true);
      });
    });

    describe('Boundary, Falsy, and Arbitrary Runtime Exceptions MUST return false', () => {
      const edgeInputs = [
        null,
        undefined,
        '',
        0,
        false,
        NaN,
        {},
        [],
        new TypeError('Cannot read properties of undefined (reading "foo")'),
        new RangeError('Maximum call stack size exceeded'),
        new SyntaxError('Unexpected token < in JSON at position 0'),
        new Error('Database crashed completely'),
        'random error string',
      ];

      test.each(edgeInputs)('boundary input (%p) -> false', (input) => {
        expect(isOfflineError(input)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // SECTION 2: ADVERSARIAL STRESS-TEST OF REPAIR SERVICE ERROR PROPAGATION
  // ==========================================================================
  describe('Adversarial Stress: Repair Service Partial Failure Propagation', () => {
    describe('updateEquipmentRepairCondition', () => {
      it('STRESS-EQ-01: strictly re-throws getDoc permission-denied', async () => {
        const permError = new Error('Missing or insufficient permissions.');
        (permError as any).code = 'permission-denied';
        mockFirestore.getDoc.mockRejectedValueOnce(permError);

        await expect(
          updateEquipmentRepairCondition('eq-100', tenantId, 'Out of Service', 'Reported')
        ).rejects.toThrow(/insufficient permissions/i);
      });

      it('STRESS-EQ-02: strictly re-throws getDoc internal / aborted error', async () => {
        const internalErr = new Error('Internal Firestore server error');
        (internalErr as any).code = 'internal';
        mockFirestore.getDoc.mockRejectedValueOnce(internalErr);

        await expect(
          updateEquipmentRepairCondition('eq-100', tenantId, 'Out of Service', 'Reported')
        ).rejects.toThrow(/Internal Firestore server error/i);
      });

      it('STRESS-EQ-03: strictly re-throws updateDoc permission-denied or invalid-argument', async () => {
        mockFirestore.getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ tenantId, serialNumbers: [] }),
        });

        const updateErr = new Error('invalid-argument: Document path invalid');
        (updateErr as any).code = 'invalid-argument';
        mockFirestore.updateDoc.mockRejectedValueOnce(updateErr);

        await expect(
          updateEquipmentRepairCondition('eq-100', tenantId, 'Out of Service', 'Reported')
        ).rejects.toThrow(/invalid-argument/i);
      });

      it('STRESS-EQ-04: safely tolerates genuine offline errors on getDoc and updateDoc', async () => {
        // getDoc offline
        const offlineErr1 = new Error('Failed to get document because the client is offline.');
        (offlineErr1 as any).code = 'unavailable';
        mockFirestore.getDoc.mockRejectedValueOnce(offlineErr1);

        await expect(
          updateEquipmentRepairCondition('eq-100', tenantId, 'Out of Service', 'Reported')
        ).resolves.toBeUndefined();

        // updateDoc offline
        mockFirestore.getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ tenantId, serialNumbers: [] }),
        });
        const offlineErr2 = new Error('Network request failed');
        (offlineErr2 as any).code = 'network-request-failed';
        mockFirestore.updateDoc.mockRejectedValueOnce(offlineErr2);

        await expect(
          updateEquipmentRepairCondition('eq-100', tenantId, 'Out of Service', 'Reported')
        ).resolves.toBeUndefined();
      });
    });

    describe('syncRepairToRtdbLedger', () => {
      it('STRESS-RTDB-01: strictly re-throws non-offline codes (PERMISSION_DENIED, ABORTED, INTERNAL)', async () => {
        const permErr = { code: 'PERMISSION_DENIED', message: 'RTDB Permission Denied' };
        mockRtdb.set.mockRejectedValueOnce(permErr);

        await expect(
          syncRepairToRtdbLedger(tenantId, 'ticket-1', 'eq-1', 'Out of Service', 1)
        ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

        const abortedErr = { code: 'ABORTED', message: 'Transaction aborted' };
        mockRtdb.set.mockRejectedValueOnce(abortedErr);

        await expect(
          syncRepairToRtdbLedger(tenantId, 'ticket-1', 'eq-1', 'Out of Service', 1)
        ).rejects.toMatchObject({ code: 'ABORTED' });
      });

      it('STRESS-RTDB-02: safely tolerates genuine offline codes (disconnected, unavailable)', async () => {
        const discErr = { code: 'disconnected', message: 'Client disconnected from RTDB' };
        mockRtdb.set.mockRejectedValueOnce(discErr);

        await expect(
          syncRepairToRtdbLedger(tenantId, 'ticket-1', 'eq-1', 'Out of Service', 1)
        ).resolves.toBeUndefined();
      });
    });

    describe('createRepairTicket End-to-End Propagation Under Adversarial Failures', () => {
      it('STRESS-CRT-01: propagates equipment permission-denied to caller and records outcome_unknown', async () => {
        mockFirestore.setDoc.mockResolvedValueOnce(undefined);
        mockFirestore.addDoc.mockResolvedValueOnce({ id: 'act-1' });

        const permErr = new Error('Missing or insufficient permissions.');
        (permErr as any).code = 'permission-denied';
        mockFirestore.getDoc.mockRejectedValueOnce(permErr);

        const input: CreateRepairTicketInput = {
          equipment: { id: 'eq-forbidden', name: 'Forbidden Equipment' },
          priority: 'High',
          status: 'Reported',
        };

        await expect(
          createRepairTicket(tenantId, input, currentUser, { preferLocalExecution: true })
        ).rejects.toThrow(/insufficient permissions/i);

        // Verify pending record stored with outcome_unknown
        const keys = await AsyncStorage.getAllKeys();
        const pendingKey = keys.find((k) => k.startsWith('@kuro_pending_repair_operations:'));
        expect(pendingKey).toBeTruthy();
        if (pendingKey) {
          const raw = await AsyncStorage.getItem(pendingKey);
          const ops = JSON.parse(raw || '[]');
          expect(ops.length).toBeGreaterThan(0);
          expect(ops[ops.length - 1].state).toBe('outcome_unknown');
        }
      });

      it('STRESS-CRT-02: succeeds when equipment condition sync hits genuine offline error', async () => {
        mockFirestore.setDoc.mockResolvedValueOnce(undefined);
        mockFirestore.addDoc.mockResolvedValueOnce({ id: 'act-1' });

        const offlineErr = new Error('Failed to get document because the client is offline.');
        (offlineErr as any).code = 'unavailable';
        mockFirestore.getDoc.mockRejectedValueOnce(offlineErr);
        mockRtdb.set.mockResolvedValueOnce(undefined);

        const input: CreateRepairTicketInput = {
          equipment: { id: 'eq-offline', name: 'Offline Equipment' },
          priority: 'High',
          status: 'Reported',
        };

        const ticketId = await createRepairTicket(tenantId, input, currentUser, {
          preferLocalExecution: true,
        });
        expect(ticketId).toBeTruthy();
      });
    });
  });

  // ==========================================================================
  // SECTION 3: ADVERSARIAL STRESS-TEST OF DATABASE EFFICIENCY PROFILER
  // ==========================================================================
  describe('Adversarial Stress: Database Efficiency Profiler Logic & Boundaries', () => {
    let profiler: FirestoreProfiler;

    beforeEach(() => {
      profiler = new FirestoreProfiler();
    });

    it('STRESS-PROF-01: Handles completely empty profiler without NaN or division-by-zero errors', () => {
      const summary = profiler.getSummary();
      expect(summary.totalReads).toBe(0);
      expect(summary.totalWrites).toBe(0);
      expect(summary.totalBatchOperations).toBe(0);
      expect(summary.duplicateQueries).toBe(0);
      expect(summary.cacheHitRatio).toBe(0);
      expect(Number.isNaN(summary.cacheHitRatio)).toBe(false);
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.meanLatencyMs).toBe(0);
      expect(Number.isNaN(summary.meanLatencyMs)).toBe(false);
      expect(summary.p95LatencyMs).toBe(0);
      expect(Number.isNaN(summary.p95LatencyMs)).toBe(false);
      expect(summary.operations).toHaveLength(0);
    });

    it('STRESS-PROF-02: Correct boundary calculation for single operation (N=1)', () => {
      profiler.recordOperation({
        type: 'getDoc',
        collection: 'users',
        target: 'users/single',
        docCount: 1,
        durationMs: 42.4,
        fromCache: true,
      });

      const summary = profiler.getSummary();
      expect(summary.totalReads).toBe(1);
      expect(summary.cacheHitRatio).toBe(100);
      expect(summary.meanLatencyMs).toBe(42.4);
      expect(summary.p95LatencyMs).toBe(42.4);
      expect(summary.totalDurationMs).toBe(42);
    });

    it('STRESS-PROF-03: Verifies mathematical correctness of p95 percentile across 100 sorted samples', () => {
      // 100 operations with latencies 1 through 100
      for (let i = 1; i <= 100; i++) {
        profiler.recordOperation({
          type: 'getDoc',
          collection: 'test',
          target: `test/${i}`,
          docCount: 1,
          durationMs: i,
          fromCache: false,
        });
      }

      const summary = profiler.getSummary();
      expect(summary.operations).toHaveLength(100);
      // Math.floor(100 * 0.95) = index 95 -> latency 96
      expect(summary.p95LatencyMs).toBe(96);
      // Mean of 1..100 = 5050 / 100 = 50.5
      expect(summary.meanLatencyMs).toBe(50.5);
    });

    it('STRESS-PROF-04: Cache hit ratio handles all permutations accurately', () => {
      // 1. Only writes, 0 reads -> ratio should be 0 (no NaN)
      profiler.recordOperation({
        type: 'setDoc',
        collection: 'docs',
        target: 'docs/1',
        docCount: 1,
        durationMs: 20,
        fromCache: false,
      });
      expect(profiler.getSummary().cacheHitRatio).toBe(0);

      // 2. 1 cached read + 2 uncached reads -> 1/3 = 33.3%
      profiler.recordOperation({
        type: 'getDoc',
        collection: 'docs',
        target: 'docs/1',
        docCount: 1,
        durationMs: 10,
        fromCache: true,
      });
      profiler.recordOperation({
        type: 'getDoc',
        collection: 'docs',
        target: 'docs/2',
        docCount: 1,
        durationMs: 15,
        fromCache: false,
      });
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'docs',
        target: 'docs/all',
        docCount: 1,
        durationMs: 25,
        fromCache: false,
      });

      const summary = profiler.getSummary();
      expect(summary.totalReads).toBe(3);
      expect(summary.cacheHitRatio).toBe(33.3);
    });

    it('STRESS-PROF-05: Duplicate query detector accurately tallies across complex multi-query topologies', () => {
      // Query A: 3 executions -> 2 duplicates
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colA',
        target: 'colA/1',
        docCount: 1,
        durationMs: 10,
        fromCache: false,
        querySignature: 'query:colA:tenant1',
      });
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colA',
        target: 'colA/2',
        docCount: 1,
        durationMs: 10,
        fromCache: false,
        querySignature: 'query:colA:tenant1',
      });
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colA',
        target: 'colA/3',
        docCount: 1,
        durationMs: 10,
        fromCache: false,
        querySignature: 'query:colA:tenant1',
      });

      // Query B: 2 executions -> 1 duplicate
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colB',
        target: 'colB/1',
        docCount: 1,
        durationMs: 10,
        fromCache: false,
        querySignature: 'query:colB:tenant1',
      });
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colB',
        target: 'colB/2',
        docCount: 1,
        durationMs: 10,
        fromCache: false,
        querySignature: 'query:colB:tenant1',
      });

      // Query C: 1 execution -> 0 duplicates
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colC',
        target: 'colC/1',
        docCount: 1,
        durationMs: 10,
        fromCache: false,
        querySignature: 'query:colC:tenant1',
      });

      // Operations with NO querySignature -> 0 duplicates
      profiler.recordOperation({
        type: 'getDoc',
        collection: 'colD',
        target: 'colD/1',
        docCount: 1,
        durationMs: 5,
        fromCache: false,
      });

      const summary = profiler.getSummary();
      // Total duplicates should be 2 + 1 + 0 = 3
      expect(summary.duplicateQueries).toBe(3);
    });

    it('STRESS-PROF-06: Verifies reset() completely isolates sequential scenario benchmarks', () => {
      // Scenario A
      profiler.startScenario('Scenario A');
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colA',
        target: 'colA',
        docCount: 10,
        durationMs: 50,
        fromCache: false,
        querySignature: 'sig:A',
      });
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colA',
        target: 'colA',
        docCount: 10,
        durationMs: 50,
        fromCache: false,
        querySignature: 'sig:A',
      });

      expect(profiler.getSummary().duplicateQueries).toBe(1);
      expect(profiler.getSummary().totalReads).toBe(20);

      // Reset
      profiler.reset();

      // Scenario B
      profiler.startScenario('Scenario B');
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'colB',
        target: 'colB',
        docCount: 5,
        durationMs: 30,
        fromCache: false,
        querySignature: 'sig:A', // same signature used in fresh scenario
      });

      const summaryB = profiler.getSummary();
      expect(summaryB.duplicateQueries).toBe(0); // must be 0 because ledger was reset
      expect(summaryB.totalReads).toBe(5);
      expect(summaryB.operations).toHaveLength(1);
    });

    it('STRESS-PROF-07: Verifies all 5 baseline simulation runners and markdown formatter', () => {
      const allResults = runAllBaselineBenchmarks(profiler);
      expect(Object.keys(allResults)).toEqual([
        'Scenario 1: Cold Boot & Auth Hydration',
        'Scenario 2: Events Feed Mount',
        'Scenario 3: Logistics Feed N+1 Vehicles',
        'Scenario 4: GPS Tracking Telemetry',
        'Scenario 5: Repair Fault Creation',
      ]);

      const report = formatBenchmarkReport(allResults);
      expect(report).toMatch(/\| Scenario \| Reads \| Writes \| Batch Ops \| Duplicate Queries \| Cache Hit Ratio \| Mean Latency \| p95 Latency \|/);
      expect(report).toContain('Scenario 1: Cold Boot & Auth Hydration');
      expect(report).toContain('Scenario 5: Repair Fault Creation');
    });
  });
});
