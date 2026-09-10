/**
 * __tests__/equipment-cache.test.ts
 * Comprehensive test suite for Equipment Realtime Read Efficiency in Kuro Mobile.
 * Validates:
 * 1. Two consumers share one Firestore listener.
 * 2. Release / grace / reacquire lifecycle cleanup (5000ms grace period).
 * 3. Error retry does not leak listeners and isolates non-transient errors.
 * 4. Concurrent refresh calls coalesce into a single deduplicated fetch.
 * 5. Live snapshot beats slower stale in-flight refresh (generation / revision guard).
 * 6. Logout / account / tenant switch prevents stale delivery and detaches immediately.
 * 7. Identical data preserves referential equality of equipment array and lookup map.
 * 8. Scanner multi-key lookup map stays complete (IDs, barcodes, serials, assets).
 * 9. Valid quantity: 0 is preserved in availability filtering and metrics.
 * 10. Accurate measurement of listener creation, mapping, and refresh counts.
 */

import {
  subscribeSharedEquipment,
  refreshSharedEquipment,
  rawFetchEquipmentDocs,
  getCachedEquipment,
  getCachedLookupMap,
  clearEquipmentCache,
  getEquipmentCacheDiagnostics,
  resetEquipmentCacheDiagnostics,
  mapEquipmentDoc,
  buildEquipmentLookupMap,
  isNonTransientError,
  isIdentityLossError,
  handleAuthIdentityChange,
  handleTenantChange,
  initEquipmentAuthObserver,
  stopEquipmentAuthObserver,
  areEquipmentListsEqual,
  GRACE_PERIOD_MS,
  MAX_RETRY_BUDGET,
} from '@/services/equipment-cache';
import {
  subscribeEquipment,
  fetchEquipment,
  searchEquipment,
  mapFirestoreEquipmentDoc,
} from '@/services/equipment-service';
import { useEquipment } from '@/hooks/use-equipment';
import { renderHook, act } from '@testing-library/react-native';
import * as firestore from 'firebase/firestore';
import * as firebaseAuth from 'firebase/auth';
import type { Equipment } from '@/types/equipment';

let mockAuthState = {
  user: { uid: 'user-1', tenantId: 'tenant-1' } as any,
  tenant: { tenantId: 'tenant-1' } as any,
  isAuthenticated: true,
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

describe('Equipment Realtime Cache & Subscription Management', () => {
  let mockOnSnapshotCallbacks: {
    next: (snapshot: any) => void;
    error: (err: any) => void;
  }[] = [];
  let mockUnsubscribes: jest.Mock[] = [];
  let mockGetDocsResolvers: Array<(docs: any[]) => void> = [];

  const sampleDocData1 = {
    id: 'eq-100',
    tenantId: 'tenant-1',
    name: 'Sony FX6 Cinema Camera',
    barcode: 'BAR-FX6-001',
    serialNumber: 'SN-FX6-100',
    assetNumber: 'AST-FX6-01',
    segAssetNumber: 'SEG-FX6-001',
    quantity: 5,
    consumedQuantity: 2,
    archived: false,
    serialNumbers: [
      { id: 's1', serial: 'SN-FX6-A', status: 'Available' },
      { id: 's2', serial: 'SN-FX6-B', status: 'In Use' },
    ],
  };

  const sampleDocDataZeroQty = {
    id: 'eq-200',
    tenantId: 'tenant-1',
    name: 'Zero Stock Audio Cable',
    barcode: 'BAR-CBL-000',
    serialNumber: 'SN-CBL-000',
    quantity: 0,
    consumedQuantity: 0,
    archived: false,
  };

  function createMockSnapshot(docsData: any[]) {
    return {
      forEach: (cb: (doc: any) => void) => {
        docsData.forEach((d) =>
          cb({
            id: d.id,
            data: () => d,
          })
        );
      },
      docs: docsData.map((d) => ({
        id: d.id,
        data: () => d,
      })),
      size: docsData.length,
      empty: docsData.length === 0,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetEquipmentCacheDiagnostics();
    clearEquipmentCache();
    initEquipmentAuthObserver();
    mockOnSnapshotCallbacks = [];
    mockUnsubscribes = [];
    mockGetDocsResolvers = [];
    mockAuthState = {
      user: { uid: 'user-1', tenantId: 'tenant-1' } as any,
      tenant: { tenantId: 'tenant-1' } as any,
      isAuthenticated: true,
    };

    // Setup Firestore mock overrides
    jest.spyOn(firestore, 'onSnapshot').mockImplementation((_query: any, next: any, error: any) => {
      const unsub = jest.fn();
      mockUnsubscribes.push(unsub);
      mockOnSnapshotCallbacks.push({ next, error });
      return unsub;
    });

    jest.spyOn(firestore, 'getDocs').mockImplementation((_query: any) => {
      return new Promise<any>((resolve) => {
        mockGetDocsResolvers.push((docsData: any[]) => {
          resolve(createMockSnapshot(docsData));
        });
      });
    });
  });

  afterEach(() => {
    clearEquipmentCache();
    stopEquipmentAuthObserver();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('1. Shared Listener Multiplexing', () => {
    it('multiple concurrent consumers share exactly one Firestore listener', () => {
      const consumerAData = jest.fn();
      const consumerBData = jest.fn();

      // Consumer 1 subscribes (e.g. ScannerProvider)
      const unsubA = subscribeSharedEquipment('tenant-1', { onData: consumerAData }, { uid: 'user-1' });

      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
      expect(mockOnSnapshotCallbacks.length).toBe(1);

      // Consumer 2 subscribes (e.g. Inventory screen)
      const unsubB = subscribeSharedEquipment('tenant-1', { onData: consumerBData }, { uid: 'user-1' });

      // Still only 1 Firestore listener attached!
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
      const diagnostics = getEquipmentCacheDiagnostics();
      expect(diagnostics.listenerCreationCount).toBe(1);

      // Emit live Firestore snapshot
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));

      // Both consumers receive the exact same mapped data and lookup map
      expect(consumerAData).toHaveBeenCalledTimes(1);
      expect(consumerBData).toHaveBeenCalledTimes(1);

      const itemsA = consumerAData.mock.calls[0][0];
      const itemsB = consumerBData.mock.calls[0][0];
      expect(itemsA).toBe(itemsB); // Referential equality

      const mapA = consumerAData.mock.calls[0][1];
      const mapB = consumerBData.mock.calls[0][1];
      expect(mapA).toBe(mapB); // Referential equality

      unsubA();
      unsubB();
    });

    it('subscribing via public subscribeEquipment also shares the cached listener', () => {
      const dataCallback1 = jest.fn();
      const dataCallback2 = jest.fn();

      const unsub1 = subscribeEquipment('tenant-1', dataCallback1);
      const unsub2 = subscribeEquipment('tenant-1', dataCallback2);

      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);

      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));

      expect(dataCallback1).toHaveBeenCalledTimes(1);
      expect(dataCallback2).toHaveBeenCalledTimes(1);

      unsub1();
      unsub2();
    });
  });

  describe('2. Lifecycle, Grace Period, and Reacquisition', () => {
    it('grace period keeps listener alive on unmount; re-subscribing within grace period reuses listener', () => {
      const consumerData1 = jest.fn();
      const unsub1 = subscribeSharedEquipment('tenant-1', { onData: consumerData1 }, { uid: 'user-1' });

      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      // Consumer 1 unmounts -> ref count hits 0 -> grace period begins
      unsub1();
      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      // Advance time by 2000ms (grace period is 5000ms)
      jest.advanceTimersByTime(2000);
      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      // Consumer 2 mounts before grace expires -> reuses the active listener!
      const consumerData2 = jest.fn();
      const unsub2 = subscribeSharedEquipment('tenant-1', { onData: consumerData2 }, { uid: 'user-1' });

      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1); // No new listener created!

      // Advance time past original 5000ms: listener should still be alive because consumer 2 cancelled grace
      jest.advanceTimersByTime(4000);
      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      // Consumer 2 unmounts -> starts new grace period
      unsub2();
      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      // Advance past 5000ms: listener is now cleaned up
      jest.advanceTimersByTime(GRACE_PERIOD_MS + 10);
      expect(mockUnsubscribes[0]).toHaveBeenCalledTimes(1);
      expect(getEquipmentCacheDiagnostics().activeScopeCount).toBe(0);
    });
  });

  describe('3. Error Recovery and Guardrails', () => {
    it('non-transient errors (permission-denied) do not loop into retries', () => {
      const onData = jest.fn();
      const onError = jest.fn();

      const unsub = subscribeSharedEquipment('tenant-1', { onData, onError }, { uid: 'user-1' });
      expect(mockOnSnapshotCallbacks.length).toBe(1);

      const permError = new Error('Missing or insufficient permissions');
      (permError as any).code = 'permission-denied';

      // Trigger error
      mockOnSnapshotCallbacks[0].error(permError);

      expect(onError).toHaveBeenCalledWith(permError);
      expect(isNonTransientError(permError)).toBe(true);

      // Fast-forward timers: no retries should have been scheduled
      jest.runAllTimers();
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1); // Still only 1 attempt
      expect(getEquipmentCacheDiagnostics().retryCount).toBe(0);

      unsub();
    });

    it('identity loss error (permission-denied) clears cached data and notifies subscribers with empty data', () => {
      const onData = jest.fn();
      const onError = jest.fn();

      const unsub = subscribeSharedEquipment('tenant-1', { onData, onError }, { uid: 'user-1' });

      // Successfully load data first
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));
      expect(getCachedEquipment('tenant-1', { uid: 'user-1' })).toHaveLength(1);

      // Permission denied error arrives (revoked access)
      const permError = new Error('permission-denied');
      (permError as any).code = 'permission-denied';
      expect(isIdentityLossError(permError)).toBe(true);

      mockOnSnapshotCallbacks[0].error(permError);

      expect(onError).toHaveBeenCalledWith(permError);
      // Cached data must be purged on identity loss
      expect(getCachedEquipment('tenant-1', { uid: 'user-1' })).toBeNull();
      // Subscriber is notified of empty data
      expect(onData).toHaveBeenLastCalledWith([], expect.any(Map));

      unsub();
    });

    it('transient errors retain cached data as stale with error set', () => {
      const onData = jest.fn();
      const onError = jest.fn();

      const unsub = subscribeSharedEquipment('tenant-1', { onData, onError }, { uid: 'user-1' });

      // First snapshot loads data
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));
      expect(getCachedEquipment('tenant-1', { uid: 'user-1' })).toHaveLength(1);

      // Transient network error arrives
      const transientError = new Error('network-timeout');
      (transientError as any).code = 'unavailable';

      mockOnSnapshotCallbacks[0].error(transientError);

      expect(onError).toHaveBeenCalledWith(transientError);
      // Data is NOT purged; preserved as stale
      expect(getCachedEquipment('tenant-1', { uid: 'user-1' })).toHaveLength(1);

      unsub();
    });

    it('transient errors trigger bounded retry up to MAX_RETRY_BUDGET and do not leak listeners', () => {
      const onData = jest.fn();
      const onError = jest.fn();

      const unsub = subscribeSharedEquipment('tenant-1', { onData, onError }, { uid: 'user-1' });
      expect(mockOnSnapshotCallbacks.length).toBe(1);

      const transientError = new Error('Unavailable / Network timeout');
      (transientError as any).code = 'unavailable';

      // First error -> schedules retry 1
      mockOnSnapshotCallbacks[0].error(transientError);
      expect(onError).toHaveBeenCalledWith(transientError);
      expect(mockUnsubscribes[0]).toHaveBeenCalled();

      // Advance timers for backoff retry 1
      jest.advanceTimersByTime(2000);
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);
      expect(getEquipmentCacheDiagnostics().retryCount).toBe(1);

      // Second error -> schedules retry 2
      mockOnSnapshotCallbacks[1].error(transientError);
      jest.advanceTimersByTime(3000);
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(3);
      expect(getEquipmentCacheDiagnostics().retryCount).toBe(2);

      // Third error -> schedules retry 3 (MAX_RETRY_BUDGET is 3)
      mockOnSnapshotCallbacks[2].error(transientError);
      jest.advanceTimersByTime(5000);
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(4);
      expect(getEquipmentCacheDiagnostics().retryCount).toBe(3);

      // Fourth error -> retry budget exhausted, no further retry scheduled
      mockOnSnapshotCallbacks[3].error(transientError);
      jest.runAllTimers();
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(4); // No new listener created
      expect(getEquipmentCacheDiagnostics().retryCount).toBe(3);

      unsub();
    });

    it('retry budget resets ONLY upon receiving a successful snapshot payload', () => {
      const onData = jest.fn();
      const onError = jest.fn();

      const unsub = subscribeSharedEquipment('tenant-1', { onData, onError }, { uid: 'user-1' });

      const transientError = new Error('unavailable');
      (transientError as any).code = 'unavailable';

      // Exhaust 1 retry
      mockOnSnapshotCallbacks[0].error(transientError);
      jest.advanceTimersByTime(2000);
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);

      // Attaching another consumer does NOT reset retry budget
      const unsub2 = subscribeSharedEquipment('tenant-1', { onData: jest.fn() }, { uid: 'user-1' });
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);

      // Snapshot succeeds -> NOW retry budget resets
      mockOnSnapshotCallbacks[1].next(createMockSnapshot([sampleDocData1]));

      // Subsequent error can retry again because budget was reset
      mockOnSnapshotCallbacks[1].error(transientError);
      jest.advanceTimersByTime(2000);
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(3);

      unsub();
      unsub2();
    });
  });

  describe('4. Deduplicated Refresh', () => {
    it('coalesces concurrent refresh calls into a single network query', async () => {
      const p1 = refreshSharedEquipment('tenant-1', { uid: 'user-1' });
      const p2 = refreshSharedEquipment('tenant-1', { uid: 'user-1' });

      expect(firestore.getDocs).toHaveBeenCalledTimes(1);
      expect(mockGetDocsResolvers.length).toBe(1);

      // Resolve the single in-flight fetch
      mockGetDocsResolvers[0]([sampleDocData1]);

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toBe(res2);
      expect(res1.length).toBe(1);
      expect(res1[0].id).toBe('eq-100');
      expect(getEquipmentCacheDiagnostics().refreshCount).toBe(1);
    });
  });

  describe('5. Live Snapshot Beats Stale In-Flight Refresh & Generation Guards', () => {
    it('discards slower in-flight refresh when a live snapshot increments revision', async () => {
      const subscriberData = jest.fn();
      subscribeSharedEquipment('tenant-1', { onData: subscriberData }, { uid: 'user-1' });

      // Start an async refresh
      const refreshPromise = refreshSharedEquipment('tenant-1', { uid: 'user-1' });
      expect(mockGetDocsResolvers.length).toBe(1);

      // Live snapshot arrives while refresh is in flight (with updated name)
      const liveData = { ...sampleDocData1, name: 'Live Updated Sony FX6' };
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([liveData]));

      expect(subscriberData).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'Live Updated Sony FX6' })]),
        expect.any(Map)
      );

      // Now the slower refresh finishes with older data
      const staleData = { ...sampleDocData1, name: 'Stale Sony FX6' };
      mockGetDocsResolvers[0]([staleData]);

      await refreshPromise;

      // Stale refresh was discarded! Live snapshot data remains active in cache
      const cached = getCachedEquipment('tenant-1', { uid: 'user-1' });
      expect(cached?.[0].name).toBe('Live Updated Sony FX6');
      expect(getEquipmentCacheDiagnostics().discardedStaleRefreshCount).toBe(1);
    });

    it('discards slower in-flight refresh when scope identity generation changes', async () => {
      const refreshPromise = refreshSharedEquipment('tenant-1', { uid: 'user-1' });
      expect(mockGetDocsResolvers.length).toBe(1);

      // Scope identity changes (signout/tenant switch) while fetch was running
      handleAuthIdentityChange('user-2');

      // Refresh resolves later
      mockGetDocsResolvers[0]([sampleDocData1]);
      await refreshPromise;

      // Discarded because generation changed
      expect(getEquipmentCacheDiagnostics().discardedStaleRefreshCount).toBe(1);
    });
  });

  describe('6. Account & Tenant Switch Teardown', () => {
    it('switching tenant or user immediately cleans up listeners and prevents stale delivery', () => {
      const tenantAData = jest.fn();
      const unsubA = subscribeSharedEquipment('tenant-A', { onData: tenantAData }, { uid: 'user-A' });

      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));
      expect(tenantAData).toHaveBeenCalledTimes(1);

      // Simulate signout / auth change
      handleAuthIdentityChange('user-B');

      // Previous listener must be immediately unsubscribed
      expect(mockUnsubscribes[0]).toHaveBeenCalled();

      // Cached data for user-A is purged
      expect(getCachedEquipment('tenant-A', { uid: 'user-A' })).toBeNull();

      // User B subscribes to tenant-B
      const tenantBData = jest.fn();
      const unsubB = subscribeSharedEquipment('tenant-B', { onData: tenantBData }, { uid: 'user-B' });

      // User B never receives tenant A data
      expect(tenantBData).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ tenantId: 'tenant-1' })]),
        expect.any(Map)
      );

      unsubA();
      unsubB();
    });

    it('signout (newUid = null) immediately detaches listener, cancels timers, and purges all scopes', () => {
      const onData = jest.fn();
      subscribeSharedEquipment('tenant-1', { onData }, { uid: 'user-1' });

      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));
      expect(getCachedEquipment('tenant-1', { uid: 'user-1' })).toHaveLength(1);

      // Sign out
      handleAuthIdentityChange(null);

      expect(mockUnsubscribes[0]).toHaveBeenCalled();
      expect(getCachedEquipment('tenant-1', { uid: 'user-1' })).toBeNull();
      expect(getEquipmentCacheDiagnostics().activeScopeCount).toBe(0);
    });

    it('tenant switch (handleTenantChange) immediately detaches listener, cancels timers, and purges old tenant', () => {
      const onData = jest.fn();
      const unsub = subscribeSharedEquipment('tenant-old', { onData }, { uid: 'user-1' });

      mockOnSnapshotCallbacks[0].next(createMockSnapshot([{ ...sampleDocData1, tenantId: 'tenant-old' }]));
      expect(getCachedEquipment('tenant-old', { uid: 'user-1' })).toHaveLength(1);

      // Tenant switch: old tenant is immediately invalidated without grace period delay
      handleTenantChange('tenant-new', 'tenant-old');

      expect(mockUnsubscribes[0]).toHaveBeenCalled();
      expect(getCachedEquipment('tenant-old', { uid: 'user-1' })).toBeNull();

      unsub();
    });
  });

  describe('7. Referential Stability for Identical Data', () => {
    it('preserves array and lookup map references when doc contents have not changed', () => {
      const onData = jest.fn();
      const unsub = subscribeSharedEquipment('tenant-1', { onData }, { uid: 'user-1' });

      // First snapshot
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));
      expect(onData).toHaveBeenCalledTimes(1);
      const firstArray = onData.mock.calls[0][0];
      const firstMap = onData.mock.calls[0][1];

      // Second snapshot with identical contents
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([{ ...sampleDocData1 }]));
      expect(onData).toHaveBeenCalledTimes(2);
      const secondArray = onData.mock.calls[1][0];
      const secondMap = onData.mock.calls[1][1];

      // Exact reference equality preserved!
      expect(secondArray).toBe(firstArray);
      expect(secondMap).toBe(firstMap);

      unsub();
    });
  });

  describe('8. Scanner Lookup Map Completeness and Collision Order', () => {
    it('builds complete O(1) case-insensitive lookup map for all identifiers', () => {
      const items: Equipment[] = [
        mapEquipmentDoc({
          id: 'eq-abc',
          data: () => ({
            id: 'eq-abc',
            tenantId: 'tenant-1',
            name: 'Lighting Bar',
            barcode: 'BAR-UPPER-123',
            serialNumber: 'SN-ABC-999',
            assetNumber: 'AST-777',
            segAssetNumber: 'SEG-888',
            serialNumbers: [{ id: 's-1', serial: 'CHILD-SN-456', status: 'Available' }],
          }),
        }),
      ];

      const lookup = buildEquipmentLookupMap(items);

      expect(lookup.get('eq-abc')?.name).toBe('Lighting Bar');
      expect(lookup.get('bar-upper-123')?.name).toBe('Lighting Bar');
      expect(lookup.get('sn-abc-999')?.name).toBe('Lighting Bar');
      expect(lookup.get('ast-777')?.name).toBe('Lighting Bar');
      expect(lookup.get('seg-888')?.name).toBe('Lighting Bar');
      expect(lookup.get('child-sn-456')?.name).toBe('Lighting Bar');
    });

    it('retains exact collision order: id < barcode < serialNumber < assetNumber < segAssetNumber < sn.serial', () => {
      const collidingItem1 = mapEquipmentDoc({
        id: 'COLLIDE-KEY',
        data: () => ({
          id: 'COLLIDE-KEY',
          tenantId: 'tenant-1',
          name: 'Item 1 By ID',
          barcode: 'bar-diff',
        }),
      });

      const collidingItem2 = mapEquipmentDoc({
        id: 'other-id',
        data: () => ({
          id: 'other-id',
          tenantId: 'tenant-1',
          name: 'Item 2 By Barcode',
          barcode: 'COLLIDE-KEY',
        }),
      });

      // Item 2 barcode (lowercased) should overwrite Item 1 id if collision occurs on lowercased key
      const map = buildEquipmentLookupMap([collidingItem1, collidingItem2]);
      expect(map.get('collide-key')?.name).toBe('Item 2 By Barcode');
    });
  });

  describe('9. Zero-Quantity Preservation', () => {
    it('searchEquipment treats quantity: 0 as valid zero instead of defaulting to 1', () => {
      const zeroItem = mapEquipmentDoc({
        id: 'eq-zero',
        data: () => sampleDocDataZeroQty,
      });

      expect(zeroItem.quantity).toBe(0);

      // Search with availabilityFilter: 'Available'
      // Quantity 0 with 0 consumed: availableQty = 0, no available serials -> must NOT match 'Available'
      const availableResults = searchEquipment([zeroItem], '', undefined, 'Available');
      expect(availableResults.length).toBe(0);

      // Quantity 0 item is still returned when filtering with 'All'
      const allResults = searchEquipment([zeroItem], '', undefined, 'All');
      expect(allResults.length).toBe(1);
    });
  });

  describe('10. Auth Observer Lifecycle', () => {
    it('initEquipmentAuthObserver attaches listener if onAuthStateChanged is available', () => {
      const authCallbackHolder: { cb?: (user: any) => void } = {};
      const mockUnsub = jest.fn();

      const mockOnAuthStateChanged = jest.fn((_auth: any, cb: any) => {
        authCallbackHolder.cb = cb;
        return mockUnsub;
      });

      const mockCustomAuth = { currentUser: { uid: 'user-init' } } as any;
      initEquipmentAuthObserver(mockCustomAuth, mockOnAuthStateChanged);

      // Subscribe under user-init
      subscribeSharedEquipment('tenant-1', { onData: jest.fn() }, { uid: 'user-init' });

      // Trigger auth state change to new user
      if (authCallbackHolder.cb) {
        authCallbackHolder.cb({ uid: 'user-switched' });
      }

      // Stop observer
      stopEquipmentAuthObserver();
      expect(mockUnsub).toHaveBeenCalled();
    });
  });

  describe('11. Adversarial Edge Cases & Regression Protection', () => {
    it('rapid sub-100ms multi-tenant switching under high latency network emulation discards stale async fetches', async () => {
      // 1. Start on tenant-A with an in-flight refresh
      const pTenantA = refreshSharedEquipment('tenant-A', { uid: 'user-1' });
      expect(mockGetDocsResolvers.length).toBe(1);

      // 2. Rapid switch to tenant-B (10ms later)
      handleTenantChange('tenant-B', 'tenant-A');

      // 3. Launch refresh on tenant-B
      const pTenantB = refreshSharedEquipment('tenant-B', { uid: 'user-1' });
      expect(mockGetDocsResolvers.length).toBe(2);

      // 4. Rapid switch back to tenant-A (20ms later)
      handleTenantChange('tenant-A', 'tenant-B');

      // 5. New active subscription on tenant-A
      const tenantAData = jest.fn();
      const unsubA = subscribeSharedEquipment('tenant-A', { onData: tenantAData }, { uid: 'user-1' });

      // 6. Old tenant-A fetch resolves with obsolete data
      mockGetDocsResolvers[0]([{ ...sampleDocData1, name: 'Old Tenant A Data' }]);
      const resA = await pTenantA;
      // Stale fetch result was discarded because generation changed
      expect(resA).toEqual([]);
      expect(getEquipmentCacheDiagnostics().discardedStaleRefreshCount).toBeGreaterThanOrEqual(1);

      // 7. Tenant-B fetch resolves with tenant-B data
      mockGetDocsResolvers[1]([{ ...sampleDocData1, tenantId: 'tenant-B', name: 'Tenant B Data' }]);
      const resB = await pTenantB;
      // Stale fetch for tenant-B discarded
      expect(resB).toEqual([]);

      // Subscriber on tenant-A NEVER received old tenant-A data or tenant-B data
      expect(tenantAData).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'Old Tenant A Data' })]),
        expect.any(Map)
      );

      unsubA();
    });

    it('immediate teardown prevents unmounting consumer from scheduling ghost grace timers', () => {
      const onData = jest.fn();
      const unsub = subscribeSharedEquipment('tenant-1', { onData }, { uid: 'user-1' });

      // Tenant switch tears down scope immediately
      handleTenantChange('tenant-2', 'tenant-1');
      expect(mockUnsubscribes[0]).toHaveBeenCalled();

      // Consumer unmounts (cleanup runs)
      unsub();

      // No timer should be scheduled by unmount of a destroyed scope
      expect(jest.getTimerCount()).toBe(0);

      // Re-subscribing creates a brand new scope
      const onData2 = jest.fn();
      const unsub2 = subscribeSharedEquipment('tenant-1', { onData: onData2 }, { uid: 'user-1' });
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);

      // Advancing time past 5000ms does NOT kill the new scope
      jest.advanceTimersByTime(GRACE_PERIOD_MS + 500);
      expect(mockUnsubscribes[1]).not.toHaveBeenCalled();

      unsub2();
    });

    it('non-transient error halts auto-attaching on new subscriptions; explicit refresh restores live listener', async () => {
      const onData1 = jest.fn();
      const onError1 = jest.fn();
      const unsub1 = subscribeSharedEquipment('tenant-1', { onData: onData1, onError: onError1 }, { uid: 'user-1' });

      const permError = new Error('permission-denied');
      (permError as any).code = 'permission-denied';
      mockOnSnapshotCallbacks[0].error(permError);

      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);

      // A second consumer subscribes while non-transient error is active
      const onData2 = jest.fn();
      const onError2 = jest.fn();
      const unsub2 = subscribeSharedEquipment('tenant-1', { onData: onData2, onError: onError2 }, { uid: 'user-1' });

      // Must NOT blindly re-attach failing listener!
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
      // Consumer 2 receives the error immediately
      expect(onError2).toHaveBeenCalledWith(permError);

      // Explicit refresh is triggered
      const refreshP = refreshSharedEquipment('tenant-1', { uid: 'user-1' });
      expect(mockGetDocsResolvers.length).toBe(1);

      // Refresh succeeds
      mockGetDocsResolvers[0]([sampleDocData1]);
      await refreshP;

      // Because refresh succeeded and subscribers are active, live listener is re-attached!
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);

      unsub1();
      unsub2();
    });

    it('in-flight refresh completion during generation change is discarded without notifying subscribers', async () => {
      const onError = jest.fn();
      subscribeSharedEquipment('tenant-1', { onData: jest.fn(), onError }, { uid: 'user-1' });

      // Start refresh
      const refreshP = refreshSharedEquipment('tenant-1', { uid: 'user-1' });

      // User signs out while network fetch is in flight
      handleAuthIdentityChange(null);

      mockGetDocsResolvers[0]([]);
      await refreshP;

      expect(getEquipmentCacheDiagnostics().discardedStaleRefreshCount).toBeGreaterThanOrEqual(1);
    });

    it('redundant handleTenantChange with same tenant does not tear down active scope', () => {
      const onData = jest.fn();
      const unsub = subscribeSharedEquipment('tenant-1', { onData }, { uid: 'user-1' });

      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      // Redundant tenant change with identical new and old IDs
      handleTenantChange('tenant-1', 'tenant-1');

      // Scope remains alive
      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();
      expect(getEquipmentCacheDiagnostics().activeScopeCount).toBe(1);

      unsub();
    });

    it('areEquipmentListsEqual detects item field and serial number changes', () => {
      const itemA = mapEquipmentDoc({ id: 'e1', data: () => sampleDocData1 });
      const itemB = mapEquipmentDoc({ id: 'e1', data: () => ({ ...sampleDocData1 }) });

      expect(areEquipmentListsEqual([itemA], [itemB])).toBe(true);

      // Modifying quantity
      const itemModifiedQty = mapEquipmentDoc({ id: 'e1', data: () => ({ ...sampleDocData1, quantity: 99 }) });
      expect(areEquipmentListsEqual([itemA], [itemModifiedQty])).toBe(false);

      // Modifying serial number status
      const itemModifiedSerial = mapEquipmentDoc({
        id: 'e1',
        data: () => ({
          ...sampleDocData1,
          serialNumbers: [{ id: 's1', serial: 'SN-FX6-A', status: 'In Repair' }],
        }),
      });
      expect(areEquipmentListsEqual([itemA], [itemModifiedSerial])).toBe(false);
    });

    it('subscribeEquipment forwards empty lookupMap when catalog transitions to 0 items', () => {
      const onData = jest.fn();
      const unsub = subscribeEquipment('tenant-1', onData, undefined, { uid: 'user-1' });

      // First snapshot with 1 item
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));
      expect(onData).toHaveBeenCalledTimes(1);
      const [data1, map1] = onData.mock.calls[0];
      expect(data1.length).toBe(1);
      expect(map1.size).toBeGreaterThan(0);

      // Second snapshot with 0 items (e.g. wiped or empty collection)
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([]));
      expect(onData).toHaveBeenCalledTimes(2);
      const [data2, map2] = onData.mock.calls[1];
      expect(data2.length).toBe(0);
      expect(map2.size).toBe(0);

      unsub();
    });
  });

  describe('12. Adversarial Stress, Deep Robustness & Multi-Tenant Hook Isolation', () => {
    it('areEquipmentListsEqual detects item contents (package/kit items) changes', () => {
      const itemWithContentsA = mapEquipmentDoc({
        id: 'eq-kit-1',
        data: () => ({
          ...sampleDocData1,
          contents: [
            { id: 'c1', quantity: 2, description: 'Power Cable', cost: 15, type: 'item' },
          ],
        }),
      });
      const itemWithContentsB = mapEquipmentDoc({
        id: 'eq-kit-1',
        data: () => ({
          ...sampleDocData1,
          contents: [
            { id: 'c1', quantity: 2, description: 'Power Cable', cost: 15, type: 'item' },
          ],
        }),
      });
      expect(areEquipmentListsEqual([itemWithContentsA], [itemWithContentsB])).toBe(true);

      const itemWithModifiedContents = mapEquipmentDoc({
        id: 'eq-kit-1',
        data: () => ({
          ...sampleDocData1,
          contents: [
            { id: 'c1', quantity: 3, description: 'Power Cable', cost: 15, type: 'item' },
          ],
        }),
      });
      expect(areEquipmentListsEqual([itemWithContentsA], [itemWithModifiedContents])).toBe(false);

      const itemWithExtraContent = mapEquipmentDoc({
        id: 'eq-kit-1',
        data: () => ({
          ...sampleDocData1,
          contents: [
            { id: 'c1', quantity: 2, description: 'Power Cable', cost: 15, type: 'item' },
            { id: 'c2', quantity: 1, description: 'Lens Hood', cost: 25, type: 'item' },
          ],
        }),
      });
      expect(areEquipmentListsEqual([itemWithContentsA], [itemWithExtraContent])).toBe(false);
    });

    it('synchronous exception during listener attachment notifies subscribers and clears cache on identity loss', () => {
      const onData = jest.fn();
      const onError = jest.fn();

      // Seed cache first
      const unsubSeed = subscribeSharedEquipment('tenant-sync-err', { onData: jest.fn() }, { uid: 'user-sync' });
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([{ ...sampleDocData1, tenantId: 'tenant-sync-err' }]));
      expect(getCachedEquipment('tenant-sync-err', { uid: 'user-sync' })).toHaveLength(1);
      unsubSeed();

      // Make onSnapshot throw synchronously
      const syncErr = new Error('permission-denied: sync throw');
      (syncErr as any).code = 'permission-denied';
      jest.spyOn(firestore, 'onSnapshot').mockImplementationOnce(() => {
        throw syncErr;
      });

      // Clear listener to force re-attach
      clearEquipmentCache('tenant-sync-err');

      // Now subscribe
      const unsub = subscribeSharedEquipment('tenant-sync-err', { onData, onError }, { uid: 'user-sync' });
      expect(onError).toHaveBeenCalledWith(syncErr);
      expect(getCachedEquipment('tenant-sync-err', { uid: 'user-sync' })).toBeNull();
      expect(onData).toHaveBeenCalledWith([], expect.any(Map));
      unsub();
    });

    it('refresh failure with permission-denied clears cached data immediately and halts retry timers', async () => {
      const onData = jest.fn();
      const onError = jest.fn();
      const unsub = subscribeSharedEquipment('tenant-1', { onData, onError }, { uid: 'user-1' });

      // First snapshot loads data
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));
      expect(getCachedEquipment('tenant-1', { uid: 'user-1' })).toHaveLength(1);

      // Transient error happens -> schedules retry timer
      const transientErr = new Error('unavailable');
      (transientErr as any).code = 'unavailable';
      mockOnSnapshotCallbacks[0].error(transientErr);

      // Now explicit refresh fails with permission-denied
      const permErr = new Error('permission-denied');
      (permErr as any).code = 'permission-denied';
      jest.spyOn(firestore, 'getDocs').mockRejectedValueOnce(permErr);

      await expect(refreshSharedEquipment('tenant-1', { uid: 'user-1' })).rejects.toThrow('permission-denied');

      // Cached data must be purged immediately
      expect(getCachedEquipment('tenant-1', { uid: 'user-1' })).toBeNull();
      expect(onData).toHaveBeenLastCalledWith([], expect.any(Map));

      // Timer should NOT trigger any new listeners
      jest.runAllTimers();
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);

      unsub();
    });

    it('rapid 50-cycle unmount and remount loop maintains strict single listener and zero ghost timers', () => {
      for (let i = 0; i < 50; i++) {
        const unsub = subscribeSharedEquipment('tenant-churn', { onData: jest.fn() }, { uid: 'user-churn' });
        unsub();
      }

      // Despite 50 cycles, exactly 1 Firestore onSnapshot listener was attached
      expect(getEquipmentCacheDiagnostics().listenerCreationCount).toBe(1);

      // Exactly 1 grace timer pending
      expect(jest.getTimerCount()).toBe(1);

      // Advance time past grace period
      jest.advanceTimersByTime(GRACE_PERIOD_MS + 100);

      // Listener cleanly disposed
      expect(mockUnsubscribes[0]).toHaveBeenCalledTimes(1);
      expect(getEquipmentCacheDiagnostics().activeScopeCount).toBe(0);
    });

    it('redundant handleTenantChange with empty or identical tenant IDs preserves active scopes', () => {
      const unsub = subscribeSharedEquipment('tenant-keep', { onData: jest.fn() }, { uid: 'user-1' });

      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      // Redundant calls with identical empty strings
      handleTenantChange('', '');
      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      // Redundant call with identical tenant
      handleTenantChange('tenant-keep', 'tenant-keep');
      expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

      unsub();
    });

    it('mapFirestoreEquipmentDoc in equipment-service delegates to mapEquipmentDoc and tracks mapping diagnostics', () => {
      resetEquipmentCacheDiagnostics();
      const mockDoc = {
        id: 'eq-delegated-1',
        data: () => sampleDocData1,
      };

      const mapped = mapFirestoreEquipmentDoc(mockDoc);
      expect(mapped.id).toBe('eq-delegated-1');
      expect(mapped.name).toBe('Sony FX6 Cinema Camera');
      expect(getEquipmentCacheDiagnostics().mappingCount).toBe(1);
    });

    it('useEquipment hook immediately wipes old tenant equipment and lookup map on tenant switch when new tenant has no cache', () => {
      // Pre-seed tenant-1 data
      const unsub1 = subscribeSharedEquipment('tenant-1', { onData: jest.fn() }, { uid: 'user-1' });
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([sampleDocData1]));
      unsub1();

      mockAuthState = {
        user: { uid: 'user-1', tenantId: 'tenant-1' } as any,
        tenant: { tenantId: 'tenant-1' } as any,
        isAuthenticated: true,
      };

      const { result, rerender, unmount } = renderHook(() => useEquipment());

      expect(result.current.equipment.length).toBe(1);
      expect(result.current.equipmentLookupMap.has('bar-fx6-001')).toBe(true);

      // Now switch auth to tenant-2 (which has no cached data)
      act(() => {
        mockAuthState = {
          user: { uid: 'user-1', tenantId: 'tenant-2' } as any,
          tenant: { tenantId: 'tenant-2' } as any,
          isAuthenticated: true,
        };
        rerender({});
      });

      // Tenant 1 data must NOT leak into tenant 2 state!
      expect(result.current.equipment.length).toBe(0);
      expect(result.current.equipmentLookupMap.size).toBe(0);
      expect(result.current.metrics.totalItems).toBe(0);
      expect(result.current.loading).toBe(true);

      act(() => {
        unmount();
      });
    });

    it('useEquipment hook preserves referential stability of equipmentLookupMap when inventory is empty', () => {
      mockAuthState = {
        user: { uid: 'user-empty', tenantId: 'tenant-empty' } as any,
        tenant: { tenantId: 'tenant-empty' } as any,
        isAuthenticated: true,
      };

      const { result, unmount } = renderHook(() => useEquipment());

      const initialMap = result.current.equipmentLookupMap;
      expect(initialMap.size).toBe(0);

      // Trigger re-render by changing search query
      act(() => {
        result.current.setSearchQuery('non-existent');
      });

      // Stable Map reference preserved!
      expect(result.current.equipmentLookupMap).toBe(initialMap);

      act(() => {
        unmount();
      });
    });
  });

  describe('13. Adversarial Edge Cases: Prefix Classification, Race Isolation & Scope Correctness', () => {
    it('discards failed in-flight refresh when a live snapshot increments revision', async () => {
      const onData = jest.fn();
      const onError = jest.fn();
      subscribeSharedEquipment('tenant-1', { onData, onError }, { uid: 'user-1' });

      // Start in-flight refresh
      let refreshPromise: Promise<Equipment[]>;
      // Mock getDocs to hang until we reject it
      let rejectGetDocs: (err: any) => void;
      jest.spyOn(firestore, 'getDocs').mockImplementationOnce(() => {
        return new Promise((_resolve, reject) => {
          rejectGetDocs = reject;
        });
      });

      refreshPromise = refreshSharedEquipment('tenant-1', { uid: 'user-1' });

      // Live snapshot arrives while refresh is in flight
      const freshDoc = { ...sampleDocData1, name: 'Live Fresh FX6' };
      mockOnSnapshotCallbacks[0].next(createMockSnapshot([freshDoc]));

      expect(onData).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'Live Fresh FX6' })]),
        expect.any(Map)
      );

      // Now slower in-flight refresh fails
      const staleFetchErr = new Error('network timeout on slow refresh');
      (staleFetchErr as any).code = 'unavailable';
      rejectGetDocs!(staleFetchErr);

      // Slower refresh failure is discarded quietly because snapshotRevision > reqRevision
      const res = await refreshPromise;
      expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Live Fresh FX6' })]));

      // Stale refresh error was discarded quietly: onError was NOT called
      expect(onError).not.toHaveBeenCalled();
      expect(getEquipmentCacheDiagnostics().discardedStaleRefreshCount).toBeGreaterThanOrEqual(1);
    });

    it('correctly classifies Firebase modular prefix error codes and string errors as non-transient', () => {
      const permErrWithPrefix = { code: 'firestore/permission-denied', message: 'Missing permissions' };
      const authErrWithPrefix = { code: 'auth/unauthenticated', message: 'Auth required' };
      const invalidArgErr = { code: 'firestore/invalid-argument', message: 'Bad param' };
      const notFoundErr = { code: 'firestore/not-found', message: 'No document' };
      const preconditionErr = { code: 'firestore/failed-precondition', message: 'Query requires index' };
      const stringErr = 'permission-denied';

      expect(isIdentityLossError(permErrWithPrefix)).toBe(true);
      expect(isIdentityLossError(authErrWithPrefix)).toBe(true);
      expect(isIdentityLossError(stringErr)).toBe(true);

      expect(isNonTransientError(permErrWithPrefix)).toBe(true);
      expect(isNonTransientError(invalidArgErr)).toBe(true);
      expect(isNonTransientError(notFoundErr)).toBe(true);
      expect(isNonTransientError(preconditionErr)).toBe(true);
      expect(isNonTransientError(stringErr)).toBe(true);

      const transientErr = { code: 'firestore/unavailable', message: 'Service unavailable' };
      expect(isNonTransientError(transientErr)).toBe(false);
    });

    it('exhausted retry budget prevents new subscribers from blindly attaching listener until explicit refresh', () => {
      const onData1 = jest.fn();
      const onError1 = jest.fn();
      const unsub1 = subscribeSharedEquipment('tenant-budget', { onData: onData1, onError: onError1 }, { uid: 'user-budget' });

      const transientError = new Error('Unavailable');
      (transientError as any).code = 'unavailable';

      // Exhaust all 3 retries
      for (let i = 0; i < MAX_RETRY_BUDGET; i++) {
        mockOnSnapshotCallbacks[mockOnSnapshotCallbacks.length - 1].error(transientError);
        jest.runOnlyPendingTimers();
      }

      expect(getEquipmentCacheDiagnostics().retryCount).toBe(MAX_RETRY_BUDGET);
      const listenerCallsSoFar = (firestore.onSnapshot as jest.Mock).mock.calls.length;

      // New subscriber joins after retry budget is exhausted
      const onData2 = jest.fn();
      const onError2 = jest.fn();
      const unsub2 = subscribeSharedEquipment('tenant-budget', { onData: onData2, onError: onError2 }, { uid: 'user-budget' });

      // Must NOT blindly create a new listener!
      expect((firestore.onSnapshot as jest.Mock).mock.calls.length).toBe(listenerCallsSoFar);
      // Receives last error so consumer knows it failed
      expect(onError2).toHaveBeenCalledWith(transientError);

      unsub1();
      unsub2();
    });

    it('explicit refreshSharedEquipment resets retryCount and restores live listener after budget exhaustion', async () => {
      const onData = jest.fn();
      const unsub = subscribeSharedEquipment('tenant-restore', { onData }, { uid: 'user-restore' });

      const transientError = new Error('Unavailable');
      (transientError as any).code = 'unavailable';

      // Exhaust all 3 retries
      for (let i = 0; i < MAX_RETRY_BUDGET; i++) {
        mockOnSnapshotCallbacks[mockOnSnapshotCallbacks.length - 1].error(transientError);
        jest.runOnlyPendingTimers();
      }

      // Now trigger explicit refresh
      const refreshP = refreshSharedEquipment('tenant-restore', { uid: 'user-restore' });
      mockGetDocsResolvers[mockGetDocsResolvers.length - 1]([sampleDocData1]);
      await refreshP;

      // Listener re-attached because refresh succeeded
      const currentListenerIndex = mockOnSnapshotCallbacks.length - 1;
      expect(currentListenerIndex).toBeGreaterThan(0);

      // Reset cumulative diagnostics counter to measure subsequent retry attempts cleanly
      resetEquipmentCacheDiagnostics();

      // Subsequent transient error can retry again because retryCount was reset to 0!
      mockOnSnapshotCallbacks[currentListenerIndex].error(transientError);
      jest.advanceTimersByTime(2000);

      // Successfully scheduled retry: budget was fully restored
      expect(getEquipmentCacheDiagnostics().retryCount).toBe(1);

      unsub();
    });

    it('rawFetchEquipmentDocs and snapshot listener correctly filter items by queryScope', async () => {
      const sampleArchived = { ...sampleDocData1, id: 'eq-archived', tenantId: 'tenant-scope', archived: true };
      const sampleActive = { ...sampleDocData1, id: 'eq-active', tenantId: 'tenant-scope', archived: false };

      // rawFetchEquipmentDocs with 'archived'
      const pArchived = rawFetchEquipmentDocs('tenant-scope', 'archived');
      mockGetDocsResolvers[mockGetDocsResolvers.length - 1]([sampleArchived, sampleActive]);
      const resArchived = await pArchived;
      expect(resArchived.length).toBe(1);
      expect(resArchived[0].id).toBe('eq-archived');

      // rawFetchEquipmentDocs with 'all'
      const pAll = rawFetchEquipmentDocs('tenant-scope', 'all');
      mockGetDocsResolvers[mockGetDocsResolvers.length - 1]([sampleArchived, sampleActive]);
      const resAll = await pAll;
      expect(resAll.length).toBe(2);

      // Snapshot listener with 'archived' queryScope
      const onDataArchived = jest.fn();
      const unsub = subscribeSharedEquipment('tenant-scope', { onData: onDataArchived }, { uid: 'user-1', queryScope: 'archived' });

      mockOnSnapshotCallbacks[mockOnSnapshotCallbacks.length - 1].next(createMockSnapshot([sampleArchived, sampleActive]));
      expect(onDataArchived).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'eq-archived' })]),
        expect.any(Map)
      );
      const passedItems = onDataArchived.mock.calls[0][0];
      expect(passedItems.length).toBe(1);

      unsub();
    });

    it('atomic teardownScopeImmediately deletes from registry before notifying subscribers, enabling clean re-subscription', () => {
      let subAttemptedState: any = 'not-null';
      const onData1 = jest.fn(() => {
        // Synchronously during teardown notification, check or subscribe
        subAttemptedState = getCachedEquipment('tenant-reenter', { uid: 'user-reenter' });
      });

      subscribeSharedEquipment('tenant-reenter', { onData: onData1 }, { uid: 'user-reenter' });
      mockOnSnapshotCallbacks[mockOnSnapshotCallbacks.length - 1].next(createMockSnapshot([sampleDocData1]));

      // Trigger identity switch
      handleAuthIdentityChange('user-new-id');

      // During onData([], Map), getCachedEquipment should see null, not the zombie scope
      expect(subAttemptedState).toBeNull();
    });

    it('buildEquipmentLookupMap and mapEquipmentDoc safely handle null and malformed inputs', () => {
      // buildEquipmentLookupMap with null/empty
      expect(buildEquipmentLookupMap(null as any).size).toBe(0);
      expect(buildEquipmentLookupMap([null as any, undefined as any]).size).toBe(0);

      // mapEquipmentDoc with null
      const mappedNull = mapEquipmentDoc(null);
      expect(mappedNull.id).toBe('');
      expect(mappedNull.name).toBe('Unnamed Equipment');
    });

    it('useEquipment refresh ignores completion if tenant changed while refresh was in flight', async () => {
      mockAuthState = {
        user: { uid: 'user-1', tenantId: 'tenant-flight-1' } as any,
        tenant: { tenantId: 'tenant-flight-1' } as any,
        isAuthenticated: true,
      };

      const { result, rerender, unmount } = renderHook(() => useEquipment());

      // Start refresh on tenant-flight-1
      let refreshPromise: Promise<void>;
      act(() => {
        refreshPromise = result.current.refresh();
      });

      // Switch to tenant-flight-2 before fetch completes
      act(() => {
        mockAuthState = {
          user: { uid: 'user-1', tenantId: 'tenant-flight-2' } as any,
          tenant: { tenantId: 'tenant-flight-2' } as any,
          isAuthenticated: true,
        };
        rerender({});
      });

      // Resolve the old refresh fetch
      mockGetDocsResolvers[mockGetDocsResolvers.length - 1]([sampleDocData1]);
      await act(async () => {
        await refreshPromise!;
      });

      // Tenant flight 2 should NOT have error or have its loading status corrupted by old refresh
      expect(result.current.error).toBeNull();

      act(() => {
        unmount();
      });
    });
  });
});

