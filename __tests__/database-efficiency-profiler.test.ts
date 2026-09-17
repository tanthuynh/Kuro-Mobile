import {
  FirestoreProfiler,
  profileScenario1ColdBoot,
  profileScenario2EventsFeed,
  profileScenario3LogisticsVehicles,
  profileScenario4GpsTelemetry,
  profileScenario5RepairCreation,
  runAllBaselineBenchmarks,
  formatBenchmarkReport,
  profileScenario1ColdBootOptimized,
  profileScenario2EventsFeedOptimized,
  profileScenario3LogisticsVehiclesOptimized,
  profileScenario4GpsTelemetryOptimized,
  profileScenario5RepairCreationOptimized,
  runAllOptimizedBenchmarks,
  formatEfficiencyComparisonReport,
} from '../scripts/profile-database-efficiency';

describe('Database Efficiency Profiler & Baseline Harness', () => {
  let profiler: FirestoreProfiler;

  beforeEach(() => {
    profiler = new FirestoreProfiler();
  });

  describe('FirestoreProfiler Core Functionality', () => {
    it('records and summarizes read and write operations accurately', () => {
      profiler.startScenario('test-scenario');

      profiler.recordOperation({
        type: 'getDoc',
        collection: 'users',
        target: 'users/123',
        docCount: 1,
        durationMs: 40,
        fromCache: false,
      });

      profiler.recordOperation({
        type: 'getDocs',
        collection: 'events',
        target: 'events/all',
        docCount: 25,
        durationMs: 80,
        fromCache: false,
      });

      profiler.recordOperation({
        type: 'setDoc',
        collection: 'tickets',
        target: 'tickets/t1',
        docCount: 1,
        durationMs: 50,
        fromCache: false,
      });

      profiler.recordOperation({
        type: 'updateDoc',
        collection: 'equipment',
        target: 'equipment/eq1',
        docCount: 1,
        durationMs: 30,
        fromCache: false,
      });

      profiler.recordOperation({
        type: 'writeBatch',
        collection: 'batch',
        target: 'batch/ops',
        docCount: 5,
        durationMs: 90,
        fromCache: false,
      });

      const summary = profiler.getSummary();
      expect(summary.totalReads).toBe(26);
      expect(summary.totalWrites).toBe(2);
      expect(summary.totalBatchOperations).toBe(5);
      expect(summary.cacheHitRatio).toBe(0);
      expect(summary.meanLatencyMs).toBe(58);
      expect(summary.p95LatencyMs).toBe(90);
    });

    it('calculates cache hit ratio correctly', () => {
      profiler.recordOperation({
        type: 'getDoc',
        collection: 'contacts',
        target: 'contacts/c1',
        docCount: 1,
        durationMs: 5,
        fromCache: true,
      });

      profiler.recordOperation({
        type: 'getDoc',
        collection: 'contacts',
        target: 'contacts/c2',
        docCount: 1,
        durationMs: 45,
        fromCache: false,
      });

      const summary = profiler.getSummary();
      expect(summary.totalReads).toBe(2);
      expect(summary.cacheHitRatio).toBe(50);
    });

    it('detects duplicate queries with identical signatures', () => {
      profiler.recordOperation({
        type: 'getDocs',
        collection: 'contacts',
        target: 'contacts/suppliers',
        docCount: 10,
        durationMs: 50,
        fromCache: false,
        querySignature: 'query:contacts:tenant-1:suppliers',
      });

      profiler.recordOperation({
        type: 'getDocs',
        collection: 'contacts',
        target: 'contacts/suppliers-dup',
        docCount: 10,
        durationMs: 48,
        fromCache: false,
        querySignature: 'query:contacts:tenant-1:suppliers',
      });

      const summary = profiler.getSummary();
      expect(summary.duplicateQueries).toBe(1);
    });

    it('resets ledger and query signatures correctly', () => {
      profiler.recordOperation({
        type: 'getDoc',
        collection: 'test',
        target: 'test/doc',
        docCount: 1,
        durationMs: 10,
        fromCache: false,
      });
      expect(profiler.getOperations().length).toBe(1);

      profiler.reset();
      expect(profiler.getOperations().length).toBe(0);
      expect(profiler.getSummary().totalReads).toBe(0);
    });
  });

  describe('Baseline Benchmark Scenarios (Survey 3 Section 3.4)', () => {
    it('executes Scenario 1 (Cold Boot & Auth Hydration) and captures baseline metrics', () => {
      const result = profileScenario1ColdBoot(profiler);
      expect(result.scenarioName).toBe('Scenario 1: Cold Boot & Auth Hydration');
      expect(result.totalReads).toBe(3);
      expect(result.totalWrites).toBe(0);
      expect(result.duplicateQueries).toBe(0);
      expect(result.cacheHitRatio).toBe(0);
      expect(result.meanLatencyMs).toBeGreaterThan(60);
    });

    it('executes Scenario 2 (Events Feed Mount) and records ~180 document reads across 4 queries', () => {
      const result = profileScenario2EventsFeed(profiler);
      expect(result.scenarioName).toBe('Scenario 2: Events Feed Mount');
      expect(result.totalReads).toBe(180);
      expect(result.totalWrites).toBe(0);
      expect(result.cacheHitRatio).toBe(0);
      expect(result.operations.length).toBe(4);
    });

    it('executes Scenario 3 (Logistics Feed N+1 Vehicles) and captures N+1 reads', () => {
      const result = profileScenario3LogisticsVehicles(profiler);
      expect(result.scenarioName).toBe('Scenario 3: Logistics Feed N+1 Vehicles');
      expect(result.totalReads).toBe(40);
      expect(result.operations.length).toBe(21); // 1 job query + 20 individual getDoc calls
    });

    it('executes Scenario 4 (GPS Tracking Telemetry) and captures 60 writes/min', () => {
      const result = profileScenario4GpsTelemetry(profiler);
      expect(result.scenarioName).toBe('Scenario 4: GPS Tracking Telemetry');
      expect(result.totalWrites).toBe(60);
      expect(result.totalReads).toBe(0);
    });

    it('executes Scenario 5 (Repair Fault Creation) and identifies duplicate queries and 100-doc scan', () => {
      const result = profileScenario5RepairCreation(profiler);
      expect(result.scenarioName).toBe('Scenario 5: Repair Fault Creation');
      expect(result.duplicateQueries).toBe(1);
      expect(result.totalReads).toBe(180); // 40 + 40 + 100
      expect(result.totalWrites).toBe(4);
    });

    it('runs all baseline scenarios and generates formatted markdown report', () => {
      const results = runAllBaselineBenchmarks(profiler);
      expect(Object.keys(results)).toHaveLength(5);

      const markdown = formatBenchmarkReport(results);
      expect(markdown).toContain('| Scenario | Reads | Writes |');
      expect(markdown).toContain('Scenario 1: Cold Boot & Auth Hydration');
      expect(markdown).toContain('Scenario 2: Events Feed Mount');
      expect(markdown).toContain('Scenario 3: Logistics Feed N+1 Vehicles');
      expect(markdown).toContain('Scenario 4: GPS Tracking Telemetry');
      expect(markdown).toContain('Scenario 5: Repair Fault Creation');
    });
  });

  describe('Post-Optimization Benchmark Scenarios (Feature 12)', () => {
    it('executes Scenario 1 Optimized (Cold Boot & Auth Hydration) with 100% cache hit and ultra-low latency', () => {
      const result = profileScenario1ColdBootOptimized(profiler);
      expect(result.scenarioName).toBe('Scenario 1: Cold Boot & Auth Hydration (Optimized)');
      expect(result.totalReads).toBe(3);
      expect(result.totalWrites).toBe(0);
      expect(result.duplicateQueries).toBe(0);
      expect(result.cacheHitRatio).toBe(100);
      expect(result.meanLatencyMs).toBeLessThanOrEqual(5);
    });

    it('executes Scenario 2 Optimized (Events Feed Mount) with 75% metadata cache hit ratio', () => {
      const result = profileScenario2EventsFeedOptimized(profiler);
      expect(result.scenarioName).toBe('Scenario 2: Events Feed Mount (Optimized)');
      expect(result.totalReads).toBe(180);
      expect(result.cacheHitRatio).toBe(75);
      const networkReads = result.operations.filter((o) => !o.fromCache).reduce((sum, o) => sum + o.docCount, 0);
      expect(networkReads).toBe(30); // 83.3% reduction in network-fetched documents
    });

    it('executes Scenario 3 Optimized (Logistics Feed N+1 Vehicles) with 80% vehicle cache hit ratio', () => {
      const result = profileScenario3LogisticsVehiclesOptimized(profiler);
      expect(result.scenarioName).toBe('Scenario 3: Logistics Feed N+1 Vehicles (Optimized)');
      expect(result.totalReads).toBe(40);
      // 1 query (20 docs) + 4 cold vehicle lookups (4 docs) + 16 cached vehicle lookups (16 docs) = 21 operations
      expect(result.operations.length).toBe(21);
      const vehicleOps = result.operations.filter((o) => o.collection === 'vehicles');
      const cachedVehicles = vehicleOps.filter((o) => o.fromCache);
      expect(cachedVehicles.length).toBe(16);
      expect(vehicleOps.length).toBe(20);
      expect(cachedVehicles.length / vehicleOps.length).toBe(0.8); // 80% vehicle hit ratio
      expect(result.meanLatencyMs).toBeLessThan(20);
    });

    it('executes Scenario 4 Optimized (GPS Tracking Telemetry) with 96.7% write reduction', () => {
      const result = profileScenario4GpsTelemetryOptimized(profiler);
      expect(result.scenarioName).toBe('Scenario 4: GPS Tracking Telemetry (Optimized)');
      expect(result.totalWrites).toBe(2); // Reduced from 60 to 2
      expect(result.totalReads).toBe(0);
    });

    it('executes Scenario 5 Optimized (Repair Fault Creation) with 0 duplicate queries and atomic batching', () => {
      const result = profileScenario5RepairCreationOptimized(profiler);
      expect(result.scenarioName).toBe('Scenario 5: Repair Fault Creation (Optimized)');
      expect(result.duplicateQueries).toBe(0); // 100% duplicate elimination
      expect(result.totalReads).toBe(41); // 40 deduplicated contacts + 1 indexed repair number (77.2% reduction from 180)
      expect(result.totalWrites).toBe(0); // 0 individual writes
      expect(result.totalBatchOperations).toBe(4); // Consolidated into 1 atomic batch
    });

    it('runs all optimized benchmarks and generates efficiency comparison report against baseline', () => {
      const baseline = runAllBaselineBenchmarks(profiler);
      const optimized = runAllOptimizedBenchmarks(profiler);

      expect(Object.keys(baseline)).toHaveLength(5);
      expect(Object.keys(optimized)).toHaveLength(5);

      const comparisonReport = formatEfficiencyComparisonReport(baseline, optimized);
      expect(comparisonReport).toContain('### Database Efficiency: Pre- vs Post-Optimization Benchmark Report');
      expect(comparisonReport).toContain('Scenario 1: Cold Boot & Auth Hydration');
      expect(comparisonReport).toContain('Scenario 2: Events Feed Mount');
      expect(comparisonReport).toContain('Scenario 3: Logistics Feed N+1 Vehicles');
      expect(comparisonReport).toContain('Scenario 4: GPS Tracking Telemetry');
      expect(comparisonReport).toContain('Scenario 5: Repair Fault Creation');
      expect(comparisonReport).toContain('Cache Hit Ratio');
      expect(comparisonReport).toContain('Duplicate Queries');
    });
  });
});

