import {
  fetchTenantContacts,
  fetchTenantSuppliers,
  fetchTenantOwners,
  invalidateContactsCache,
} from '../src/services/repair-service';
import {
  fetchVehicleById,
  invalidateVehicleCache,
  setVehicleCache,
} from '../src/services/logistics-service';
import {
  FirestoreProfiler,
  runAllBaselineBenchmarks,
  runAllOptimizedBenchmarks,
  formatEfficiencyComparisonReport,
  formatBenchmarkReport,
} from '../scripts/profile-database-efficiency';
import * as firestore from 'firebase/firestore';

// Mock Firestore
jest.mock('firebase/firestore', () => {
  return {
    collection: jest.fn((_db, name) => ({ _mockType: 'collection', name })),
    doc: jest.fn((_db, name, id) => ({ _mockType: 'doc', name, id })),
    query: jest.fn((...args) => ({ _mockType: 'query', args })),
    where: jest.fn((field, op, val) => ({ field, op, val })),
    limit: jest.fn((n) => ({ limit: n })),
    orderBy: jest.fn((field, dir) => ({ field, dir })),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    onSnapshot: jest.fn(),
    getFirestore: jest.fn(() => ({})),
  };
});

const mockFirestore = firestore as jest.Mocked<any>;

describe('Milestone 3 Adversarial Challenge Suite: Caching, Tenant Boundaries & Profiler', () => {
  beforeEach(() => {
    mockFirestore.getDoc.mockReset();
    mockFirestore.getDocs.mockReset();
    invalidateContactsCache();
    invalidateVehicleCache();
  });

  // ==========================================================================
  // 1. ADVERSARIAL STRESS-TESTING: fetchTenantContacts
  // ==========================================================================
  describe('1. fetchTenantContacts Caching & Tenant Isolation', () => {
    it('CHAL-CONT-01: Isolates cache strictly across different tenants (no cross-tenant leakage)', async () => {
      mockFirestore.getDocs
        .mockResolvedValueOnce([
          {
            id: 'c-alpha-1',
            data: () => ({
              name: 'Alpha Supplier Ltd',
              tenantId: 'tenant-alpha',
              isSupplier: true,
              types: ['Supplier'],
            }),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'c-beta-1',
            data: () => ({
              name: 'Beta Production Co',
              tenantId: 'tenant-beta',
              isClient: true,
              types: ['Client'],
            }),
          },
        ]);

      // Fetch tenant-alpha contacts
      const resAlpha1 = await fetchTenantContacts('tenant-alpha');
      expect(resAlpha1.suppliers).toHaveLength(1);
      expect(resAlpha1.suppliers[0].name).toBe('Alpha Supplier Ltd');
      expect(resAlpha1.owners).toHaveLength(0);

      // Fetch tenant-beta contacts
      const resBeta1 = await fetchTenantContacts('tenant-beta');
      expect(resBeta1.suppliers).toHaveLength(0);
      expect(resBeta1.owners).toHaveLength(1);
      expect(resBeta1.owners[0].name).toBe('Beta Production Co');

      // Both should have hit Firestore
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(2);

      // Re-fetch both tenants from cache - NO additional Firestore calls
      const resAlpha2 = await fetchTenantContacts('tenant-alpha');
      const resBeta2 = await fetchTenantContacts('tenant-beta');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(2);

      expect(resAlpha2.suppliers[0].name).toBe('Alpha Supplier Ltd');
      expect(resBeta2.owners[0].name).toBe('Beta Production Co');
    });

    it('CHAL-CONT-02: In-flight deduplication coalesces concurrent calls for same tenant into single network read', async () => {
      let resolveDocs: any;
      const delayedPromise = new Promise((resolve) => {
        resolveDocs = resolve;
      });

      mockFirestore.getDocs.mockReturnValueOnce(delayedPromise);

      // Launch 5 simultaneous requests for the same tenant
      const p1 = fetchTenantContacts('tenant-coalesce');
      const p2 = fetchTenantSuppliers('tenant-coalesce');
      const p3 = fetchTenantOwners('tenant-coalesce');
      const p4 = fetchTenantContacts('tenant-coalesce');
      const p5 = fetchTenantSuppliers('tenant-coalesce');

      // Resolve the single in-flight Firestore query
      resolveDocs([
        {
          id: 'c-sim-1',
          data: () => ({
            name: 'Simultaneous Stage Supplier',
            tenantId: 'tenant-coalesce',
            types: ['supplier'],
          }),
        },
        {
          id: 'c-sim-2',
          data: () => ({
            name: 'Simultaneous Arena Venue',
            tenantId: 'tenant-coalesce',
            types: ['venue'],
          }),
        },
      ]);

      const [r1, r2, r3, r4, r5] = await Promise.all([p1, p2, p3, p4, p5]);

      // Exactly 1 network query occurred despite 5 parallel invocations
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(1);

      expect(r1.suppliers).toHaveLength(1);
      expect(r1.owners).toHaveLength(1);
      expect(r2).toHaveLength(1); // suppliers only
      expect(r3).toHaveLength(1); // owners only
      expect(r4.suppliers).toHaveLength(1);
      expect(r5).toHaveLength(1);
    });

    it('CHAL-CONT-03: forceRefresh bypasses cache and re-queries Firestore', async () => {
      mockFirestore.getDocs
        .mockResolvedValueOnce([
          {
            id: 'c-1',
            data: () => ({ name: 'Supplier Initial', tenantId: 't-1', isSupplier: true, types: ['Supplier'] }),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'c-1',
            data: () => ({ name: 'Supplier Updated', tenantId: 't-1', isSupplier: true, types: ['Supplier'] }),
          },
        ]);

      const initial = await fetchTenantContacts('t-1');
      expect(initial.suppliers[0].name).toBe('Supplier Initial');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(1);

      // Normal call uses cache
      const cached = await fetchTenantContacts('t-1');
      expect(cached.suppliers[0].name).toBe('Supplier Initial');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(1);

      // forceRefresh triggers second getDocs
      const refreshed = await fetchTenantContacts('t-1', { forceRefresh: true });
      expect(refreshed.suppliers[0].name).toBe('Supplier Updated');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(2);
    });

    it('CHAL-CONT-04: Selective invalidation purges target tenant and leaves other tenants cached', async () => {
      mockFirestore.getDocs
        .mockResolvedValueOnce([
          { id: 'c-a', data: () => ({ name: 'Supplier A', tenantId: 't-a', isSupplier: true, types: ['Supplier'] }) },
        ])
        .mockResolvedValueOnce([
          { id: 'c-b', data: () => ({ name: 'Supplier B', tenantId: 't-b', isSupplier: true, types: ['Supplier'] }) },
        ])
        .mockResolvedValueOnce([
          { id: 'c-a-new', data: () => ({ name: 'Supplier A Refetched', tenantId: 't-a', isSupplier: true, types: ['Supplier'] }) },
        ]);

      await fetchTenantContacts('t-a');
      await fetchTenantContacts('t-b');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(2);

      // Invalidate ONLY tenant 't-a'
      invalidateContactsCache('t-a');

      // 't-b' must still be cached (no getDocs call)
      const resB = await fetchTenantContacts('t-b');
      expect(resB.suppliers[0].name).toBe('Supplier B');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(2);

      // 't-a' must hit Firestore again
      const resA = await fetchTenantContacts('t-a');
      expect(resA.suppliers[0].name).toBe('Supplier A Refetched');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(3);
    });

    it('CHAL-CONT-05: Global invalidation (no tenantId) purges all tenants', async () => {
      mockFirestore.getDocs
        .mockResolvedValueOnce([{ id: 'c-1', data: () => ({ name: 'A', tenantId: 't1', isSupplier: true, types: ['Supplier'] }) }])
        .mockResolvedValueOnce([{ id: 'c-2', data: () => ({ name: 'B', tenantId: 't2', isSupplier: true, types: ['Supplier'] }) }])
        .mockResolvedValueOnce([{ id: 'c-1', data: () => ({ name: 'A', tenantId: 't1', isSupplier: true, types: ['Supplier'] }) }])
        .mockResolvedValueOnce([{ id: 'c-2', data: () => ({ name: 'B', tenantId: 't2', isSupplier: true, types: ['Supplier'] }) }]);

      await fetchTenantContacts('t1');
      await fetchTenantContacts('t2');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(2);

      // Global clear
      invalidateContactsCache();

      await fetchTenantContacts('t1');
      await fetchTenantContacts('t2');
      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(4);
    });

    it('CHAL-CONT-06: Defensively discards contacts returned with mismatched tenantId', async () => {
      mockFirestore.getDocs.mockResolvedValueOnce([
        {
          id: 'c-rogue',
          data: () => ({
            name: 'Rogue Injected Contact',
            tenantId: 'tenant-evil', // Different from requested 'tenant-good'
            isSupplier: true,
            types: ['Supplier'],
          }),
        },
        {
          id: 'c-legit',
          data: () => ({
            name: 'Legit Contact',
            tenantId: 'tenant-good',
            isSupplier: true,
            types: ['Supplier'],
          }),
        },
      ]);

      const result = await fetchTenantContacts('tenant-good');
      expect(result.suppliers).toHaveLength(1);
      expect(result.suppliers[0].name).toBe('Legit Contact');
    });

    it('CHAL-CONT-07: Returns empty result for blank, null, or whitespace tenantId without querying Firestore', async () => {
      expect(await fetchTenantContacts('')).toEqual({ suppliers: [], owners: [] });
      expect(await fetchTenantContacts('   ')).toEqual({ suppliers: [], owners: [] });
      expect(await fetchTenantContacts(null as any)).toEqual({ suppliers: [], owners: [] });
      expect(await fetchTenantContacts(undefined as any)).toEqual({ suppliers: [], owners: [] });
      expect(mockFirestore.getDocs).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. ADVERSARIAL STRESS-TESTING: fetchVehicleById
  // ==========================================================================
  describe('2. fetchVehicleById Caching & Tenant Isolation', () => {
    it('CHAL-VEH-01: Returns cached vehicle on second call without Firestore network fetch', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'veh-cache-1',
        data: () => ({
          name: 'Mercedes Sprinter',
          rego: 'ABC-123',
          tenantId: 'tenant-10',
        }),
      });

      const first = await fetchVehicleById('veh-cache-1', 'tenant-10');
      expect(first?.name).toBe('Mercedes Sprinter');
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(1);

      // Second call served from cache
      const second = await fetchVehicleById('veh-cache-1', 'tenant-10');
      expect(second?.name).toBe('Mercedes Sprinter');
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(1);
    });

    it('CHAL-VEH-02: Prevents cross-tenant leak when cached vehicle is requested by another tenant', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'veh-shared-id',
        data: () => ({
          name: 'Confidential Tenant A Van',
          tenantId: 'tenant-A',
        }),
      });

      // Tenant A loads vehicle into cache
      const vehA = await fetchVehicleById('veh-shared-id', 'tenant-A');
      expect(vehA?.name).toBe('Confidential Tenant A Van');
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(1);

      // Tenant B requests same vehicleId -> MUST return null and not leak Tenant A's van
      const vehB = await fetchVehicleById('veh-shared-id', 'tenant-B');
      expect(vehB).toBeNull();
      // Notice: should NOT have queried Firestore either since cached entry exists but mismatch rejected
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(1);
    });

    it('CHAL-VEH-03: Invalidate vehicle cache selectively and globally', async () => {
      mockFirestore.getDoc
        .mockResolvedValueOnce({
          exists: () => true,
          id: 'v1',
          data: () => ({ name: 'V1', tenantId: 't1' }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          id: 'v2',
          data: () => ({ name: 'V2', tenantId: 't1' }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          id: 'v1',
          data: () => ({ name: 'V1 Refetched', tenantId: 't1' }),
        });

      await fetchVehicleById('v1', 't1');
      await fetchVehicleById('v2', 't1');
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(2);

      // Selectively invalidate v1
      invalidateVehicleCache('v1');

      // v2 is still cached
      const v2Cached = await fetchVehicleById('v2', 't1');
      expect(v2Cached?.name).toBe('V2');
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(2);

      // v1 is refetched
      const v1Refetched = await fetchVehicleById('v1', 't1');
      expect(v1Refetched?.name).toBe('V1 Refetched');
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(3);

      // Global invalidation
      invalidateVehicleCache();
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'v2',
        data: () => ({ name: 'V2 Refetched', tenantId: 't1' }),
      });
      const v2New = await fetchVehicleById('v2', 't1');
      expect(v2New?.name).toBe('V2 Refetched');
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(4);
    });

    it('CHAL-VEH-04: setVehicleCache primes cache and respects custom TTL', async () => {
      // First synchronize test boundary
      await fetchVehicleById('');

      setVehicleCache(
        {
          id: 'v-prime',
          name: 'Primed Van',
          rego: 'PRIME-1',
          tenantId: 'tenant-prime',
        },
        50 // 50ms TTL
      );

      // Immediate read served from cache
      const cached = await fetchVehicleById('v-prime', 'tenant-prime');
      expect(cached?.name).toBe('Primed Van');
      expect(mockFirestore.getDoc).not.toHaveBeenCalled();

      // Wait 60ms for expiration
      await new Promise((r) => setTimeout(r, 65));

      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'v-prime',
        data: () => ({ name: 'Network Van After Expiry', tenantId: 'tenant-prime' }),
      });

      const expired = await fetchVehicleById('v-prime', 'tenant-prime');
      expect(expired?.name).toBe('Network Van After Expiry');
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(1);
    });

    it('CHAL-VEH-05: Concurrent in-flight requests for same vehicle and same tenant coalesce into 1 read', async () => {
      let resolveDoc: any;
      const delayed = new Promise((resolve) => {
        resolveDoc = resolve;
      });
      mockFirestore.getDoc.mockReturnValueOnce(delayed);

      const p1 = fetchVehicleById('v-concurrent', 't-same');
      const p2 = fetchVehicleById('v-concurrent', 't-same');
      const p3 = fetchVehicleById('v-concurrent', 't-same');

      resolveDoc({
        exists: () => true,
        id: 'v-concurrent',
        data: () => ({
          name: 'Coalesced Van',
          tenantId: 't-same',
        }),
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(mockFirestore.getDoc).toHaveBeenCalledTimes(1);
      expect(r1?.name).toBe('Coalesced Van');
      expect(r2?.name).toBe('Coalesced Van');
      expect(r3?.name).toBe('Coalesced Van');
    });

    it('CHAL-VEH-06: Concurrent in-flight requests from DIFFERENT tenants', async () => {
      let resolveDoc: any;
      const delayed = new Promise((resolve) => {
        resolveDoc = resolve;
      });
      mockFirestore.getDoc.mockReturnValueOnce(delayed);

      // Tenant A starts fetch
      const pA = fetchVehicleById('v-cross-race', 'tenant-alpha');
      // Tenant B starts fetch simultaneously for the same vehicle ID
      const pB = fetchVehicleById('v-cross-race', 'tenant-beta');

      resolveDoc({
        exists: () => true,
        id: 'v-cross-race',
        data: () => ({
          name: 'Alpha Secret Vehicle',
          tenantId: 'tenant-alpha',
        }),
      });

      const [resA, resB] = await Promise.all([pA, pB]);
      expect(resA?.name).toBe('Alpha Secret Vehicle');
      // What does resB get?
      expect(resB).toBeNull();
    });
  });

  // ==========================================================================
  // 3. ADVERSARIAL STRESS-TESTING: Database Efficiency Profiler
  // ==========================================================================
  describe('3. Database Efficiency Profiler Arithmetic & Stability', () => {
    it('CHAL-PROF-01: Handles completely empty profiler ledger without division by zero or NaN', () => {
      const profiler = new FirestoreProfiler();
      const summary = profiler.getSummary();

      expect(summary.totalReads).toBe(0);
      expect(summary.totalWrites).toBe(0);
      expect(summary.totalBatchOperations).toBe(0);
      expect(summary.duplicateQueries).toBe(0);
      expect(summary.cacheHitRatio).toBe(0);
      expect(Number.isNaN(summary.cacheHitRatio)).toBe(false);
      expect(summary.meanLatencyMs).toBe(0);
      expect(Number.isNaN(summary.meanLatencyMs)).toBe(false);
      expect(summary.p95LatencyMs).toBe(0);
      expect(Number.isNaN(summary.p95LatencyMs)).toBe(false);
      expect(summary.operations).toEqual([]);
    });

    it('CHAL-PROF-02: Formats efficiency report when baseline reads are 0 without division by zero', () => {
      const profiler = new FirestoreProfiler();
      // Scenario with 0 reads
      profiler.recordOperation({
        type: 'updateDoc',
        collection: 'logs',
        target: 'logs/1',
        docCount: 1,
        durationMs: 20,
        fromCache: false,
      });
      const baselineRes = { 'Scenario Zero Reads': profiler.getSummary() };

      profiler.reset();
      profiler.recordOperation({
        type: 'updateDoc',
        collection: 'logs',
        target: 'logs/1',
        docCount: 1,
        durationMs: 10,
        fromCache: false,
      });
      const optimizedRes = { 'Scenario Zero Reads': profiler.getSummary() };

      const report = formatEfficiencyComparisonReport(baselineRes, optimizedRes);
      expect(report).toContain('| Scenario Zero Reads | Reads | 0 | 0 | 0 (0%) |');
      expect(report).not.toContain('NaN');
      expect(report).not.toContain('Infinity');
    });

    it('CHAL-PROF-03: Gracefully handles missing scenarios between baseline and optimized maps', () => {
      const profiler = new FirestoreProfiler();
      profiler.recordOperation({
        type: 'getDoc',
        collection: 'users',
        target: 'users/1',
        docCount: 1,
        durationMs: 50,
        fromCache: false,
      });
      const baseline = { 'Scenario A': profiler.getSummary() };
      const optimized = { 'Scenario B': profiler.getSummary() };

      // Should not throw or crash if keys mismatch
      const report = formatEfficiencyComparisonReport(baseline, optimized);
      expect(typeof report).toBe('string');
      expect(report).toContain('### Database Efficiency: Pre- vs Post-Optimization Benchmark Report');
    });

    it('CHAL-PROF-04: Correctly accumulates duplicate query signatures across multiple executions', () => {
      const profiler = new FirestoreProfiler();
      const sig = 'query:contacts:tenant-1';

      profiler.recordOperation({
        type: 'getDocs',
        collection: 'contacts',
        target: 'target1',
        docCount: 10,
        durationMs: 20,
        fromCache: false,
        querySignature: sig,
      });
      expect(profiler.getSummary().duplicateQueries).toBe(0);

      profiler.recordOperation({
        type: 'getDocs',
        collection: 'contacts',
        target: 'target2',
        docCount: 10,
        durationMs: 20,
        fromCache: false,
        querySignature: sig,
      });
      expect(profiler.getSummary().duplicateQueries).toBe(1);

      profiler.recordOperation({
        type: 'getDocs',
        collection: 'contacts',
        target: 'target3',
        docCount: 10,
        durationMs: 20,
        fromCache: false,
        querySignature: sig,
      });
      expect(profiler.getSummary().duplicateQueries).toBe(2);

      // Reset clears signature counts
      profiler.reset();
      expect(profiler.getSummary().duplicateQueries).toBe(0);
    });

    it('CHAL-PROF-05: runAllBaselineBenchmarks and runAllOptimizedBenchmarks execute without state leakage', () => {
      const profiler = new FirestoreProfiler();
      const baseline = runAllBaselineBenchmarks(profiler);
      const optimized = runAllOptimizedBenchmarks(profiler);

      expect(Object.keys(baseline)).toHaveLength(5);
      expect(Object.keys(optimized)).toHaveLength(5);

      // Verify profiler is reset and independent per scenario
      expect(baseline['Scenario 1: Cold Boot & Auth Hydration'].totalReads).toBe(3);
      expect(baseline['Scenario 2: Events Feed Mount'].totalReads).toBe(180);
      expect(baseline['Scenario 4: GPS Tracking Telemetry'].totalReads).toBe(0);
      expect(baseline['Scenario 4: GPS Tracking Telemetry'].totalWrites).toBe(60);

      expect(optimized['Scenario 1: Cold Boot & Auth Hydration'].cacheHitRatio).toBe(100);
      expect(optimized['Scenario 4: GPS Tracking Telemetry'].totalWrites).toBe(2);
      expect(optimized['Scenario 5: Repair Fault Creation'].duplicateQueries).toBe(0);
    });
  });
});
