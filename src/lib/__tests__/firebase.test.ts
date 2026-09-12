/**
 * src/lib/__tests__/firebase.test.ts
 * Unit and integration tests for Firebase v11 SDK initialization, Firestore long-polling transport settings,
 * Metro Fast Refresh / hot reload resilience, and deep verification against unmocked Firebase JS SDK.
 */

import * as firestoreModule from 'firebase/firestore';
import * as authModule from 'firebase/auth';
import {
  app,
  auth,
  db,
  rtdb,
  storage,
  functions,
  FIREBASE_CONFIG,
  FIRESTORE_SETTINGS,
  buildFirestoreSettings,
  buildDefaultLocalCache,
} from '../firebase';
import firebaseDefaultExport from '../firebase';

describe('src/lib/firebase.ts initialization and network transport', () => {
  it('R1: exports FIRESTORE_SETTINGS with experimentalForceLongPolling and persistent localCache enabled for React Native', () => {
    expect(FIRESTORE_SETTINGS).toBeDefined();
    expect(FIRESTORE_SETTINGS.experimentalForceLongPolling).toBe(true);
    expect(FIRESTORE_SETTINGS.localCache).toBeDefined();
    expect((FIRESTORE_SETTINGS.localCache as any).kind).toBe('persistent');
    expect((FIRESTORE_SETTINGS.localCache as any).tabManager).toBeDefined();
    expect((FIRESTORE_SETTINGS.localCache as any).tabManager.kind).toBe('PersistentMultipleTab');
  });

  it('R1: exports a valid db instance initialized with Firestore settings', () => {
    expect(db).toBeDefined();
    expect(firebaseDefaultExport.db).toBe(db);
    expect(firebaseDefaultExport.FIRESTORE_SETTINGS).toEqual(FIRESTORE_SETTINGS);
    expect(firebaseDefaultExport.buildFirestoreSettings).toBe(buildFirestoreSettings);
    expect(firebaseDefaultExport.buildDefaultLocalCache).toBe(buildDefaultLocalCache);
  });

  it('R1: buildFirestoreSettings creates default long-polling configuration when timeout is omitted', () => {
    const settings = buildFirestoreSettings();
    expect(settings).toEqual({
      experimentalForceLongPolling: true,
      localCache: expect.objectContaining({
        kind: 'persistent',
        tabManager: expect.objectContaining({
          kind: 'PersistentMultipleTab',
        }),
      }),
    });
    expect(settings.experimentalLongPollingOptions).toBeUndefined();
  });

  it('R1: buildFirestoreSettings configures and clamps timeoutSeconds within Firestore valid range [5, 30]', () => {
    // Normal valid timeout (e.g. 25 seconds for corporate reverse proxies)
    const settings25 = buildFirestoreSettings(25);
    expect(settings25).toEqual({
      experimentalForceLongPolling: true,
      experimentalLongPollingOptions: { timeoutSeconds: 25 },
      localCache: expect.objectContaining({
        kind: 'persistent',
        tabManager: expect.objectContaining({
          kind: 'PersistentMultipleTab',
        }),
      }),
    });

    // Below minimum (4s -> clamped to 5s)
    const settingsLow = buildFirestoreSettings(2);
    expect(settingsLow.experimentalLongPollingOptions?.timeoutSeconds).toBe(5);

    // Above maximum (60s -> clamped to 30s)
    const settingsHigh = buildFirestoreSettings(60);
    expect(settingsHigh.experimentalLongPollingOptions?.timeoutSeconds).toBe(30);

    // Decimal float values (preserved for millisecond precision per Firestore SDK)
    const settingsFloat = buildFirestoreSettings(25.5);
    expect(settingsFloat.experimentalLongPollingOptions?.timeoutSeconds).toBe(25.5);

    // Invalid NaN / Infinity / -Infinity -> omitted without throwing
    expect(buildFirestoreSettings(NaN).experimentalLongPollingOptions).toBeUndefined();
    expect(buildFirestoreSettings(Infinity).experimentalLongPollingOptions).toBeUndefined();
    expect(buildFirestoreSettings(-Infinity).experimentalLongPollingOptions).toBeUndefined();

    // null / empty string / boolean / invalid strings -> omitted without setting unwanted 5s timeout
    expect(buildFirestoreSettings(null as any).experimentalLongPollingOptions).toBeUndefined();
    expect(buildFirestoreSettings('' as any).experimentalLongPollingOptions).toBeUndefined();
    expect(buildFirestoreSettings('invalid' as any).experimentalLongPollingOptions).toBeUndefined();
    expect(buildFirestoreSettings(false as any).experimentalLongPollingOptions).toBeUndefined();

    // Valid numeric strings -> parsed and clamped correctly
    expect(buildFirestoreSettings('25' as any).experimentalLongPollingOptions?.timeoutSeconds).toBe(25);
    expect(buildFirestoreSettings('25.5' as any).experimentalLongPollingOptions?.timeoutSeconds).toBe(25.5);
    expect(buildFirestoreSettings('2' as any).experimentalLongPollingOptions?.timeoutSeconds).toBe(5);
    expect(buildFirestoreSettings('60' as any).experimentalLongPollingOptions?.timeoutSeconds).toBe(30);
  });

  it('R1: buildFirestoreSettings supports merging custom FirestoreSettings objects and sanitizes mutual exclusion', () => {
    // Custom host, ssl, cache while guaranteeing long-polling
    const custom = buildFirestoreSettings({
      host: 'localhost:8080',
      ssl: false,
      ignoreUndefinedProperties: true,
    });
    expect(custom).toEqual({
      host: 'localhost:8080',
      ssl: false,
      ignoreUndefinedProperties: true,
      experimentalForceLongPolling: true,
      localCache: expect.objectContaining({
        kind: 'persistent',
        tabManager: expect.objectContaining({
          kind: 'PersistentMultipleTab',
        }),
      }),
    });

    // Custom object with out-of-range timeout
    const customTimeout = buildFirestoreSettings({
      host: 'localhost:8080',
      experimentalLongPollingOptions: { timeoutSeconds: 60 },
    });
    expect(customTimeout.experimentalLongPollingOptions?.timeoutSeconds).toBe(30);

    // Custom object with invalid non-numeric timeout
    const customInvalidTimeout = buildFirestoreSettings({
      host: 'localhost:8080',
      experimentalLongPollingOptions: { timeoutSeconds: NaN },
    });
    expect(customInvalidTimeout.experimentalLongPollingOptions).toBeUndefined();

    // Mutual exclusion sanitization: autoDetectLongPolling must be stripped when forceLongPolling is active
    const sanitizedMutual = buildFirestoreSettings({
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: true,
    });
    expect(sanitizedMutual.experimentalForceLongPolling).toBe(true);
    expect(sanitizedMutual.experimentalAutoDetectLongPolling).toBeUndefined();

    // If forceLongPolling is explicitly disabled, autoDetectLongPolling is preserved
    const explicitNoForce = buildFirestoreSettings({
      experimentalForceLongPolling: false,
      experimentalAutoDetectLongPolling: true,
    });
    expect(explicitNoForce.experimentalForceLongPolling).toBe(false);
    expect(explicitNoForce.experimentalAutoDetectLongPolling).toBe(true);

    // Array sanitization: arrays should never contaminate settings with indexed keys
    const arrayInput = buildFirestoreSettings(['invalid', 123] as any);
    expect(arrayInput).toEqual({
      experimentalForceLongPolling: true,
      localCache: expect.objectContaining({
        kind: 'persistent',
        tabManager: expect.objectContaining({
          kind: 'PersistentMultipleTab',
        }),
      }),
    });
    expect((arrayInput as any)['0']).toBeUndefined();

    // Nested string timeoutSeconds in experimentalLongPollingOptions
    const stringTimeoutObj = buildFirestoreSettings({
      experimentalLongPollingOptions: { timeoutSeconds: '22.5' as any },
    });
    expect(stringTimeoutObj.experimentalLongPollingOptions?.timeoutSeconds).toBe(22.5);

    // Direct numeric / string timeout passed directly to experimentalLongPollingOptions
    const directTimeoutObj = buildFirestoreSettings({
      experimentalLongPollingOptions: 25 as any,
    });
    expect(directTimeoutObj.experimentalLongPollingOptions?.timeoutSeconds).toBe(25);

    // Local cache conflict sanitization: localCache takes precedence, omitting deprecated cacheSizeBytes
    const cacheSanitized = buildFirestoreSettings({
      localCache: { kind: 'memory' } as any,
      cacheSizeBytes: 1048576,
    });
    expect(cacheSanitized.localCache).toEqual({ kind: 'memory' });
    expect(cacheSanitized.cacheSizeBytes).toBeUndefined();

    // When legacy cacheSizeBytes is provided without localCache, do not inject default localCache
    const legacyCacheOnly = buildFirestoreSettings({
      cacheSizeBytes: 2097152,
    });
    expect(legacyCacheOnly.cacheSizeBytes).toBe(2097152);
    expect(legacyCacheOnly.localCache).toBeUndefined();
  });

  it('R1: respects EXPO_PUBLIC_FIRESTORE_LONG_POLLING_TIMEOUT_SECONDS when reloading module', () => {
    const originalEnv = process.env.EXPO_PUBLIC_FIRESTORE_LONG_POLLING_TIMEOUT_SECONDS;
    process.env.EXPO_PUBLIC_FIRESTORE_LONG_POLLING_TIMEOUT_SECONDS = '25.5';

    let reloadedFirebase: typeof import('../firebase');
    jest.isolateModules(() => {
      reloadedFirebase = require('../firebase');
    });

    expect(reloadedFirebase!.FIRESTORE_SETTINGS).toEqual({
      experimentalForceLongPolling: true,
      experimentalLongPollingOptions: { timeoutSeconds: 25.5 },
      localCache: expect.objectContaining({
        kind: 'persistent',
        tabManager: expect.objectContaining({
          kind: 'PersistentMultipleTab',
        }),
      }),
    });

    if (originalEnv !== undefined) {
      process.env.EXPO_PUBLIC_FIRESTORE_LONG_POLLING_TIMEOUT_SECONDS = originalEnv;
    } else {
      delete process.env.EXPO_PUBLIC_FIRESTORE_LONG_POLLING_TIMEOUT_SECONDS;
    }
  });

  it('R2: exports all required Firebase services and configuration keys', () => {
    expect(app).toBeDefined();
    expect(auth).toBeDefined();
    expect(rtdb).toBeDefined();
    expect(storage).toBeDefined();
    expect(functions).toBeDefined();

    expect(FIREBASE_CONFIG).toHaveProperty('apiKey');
    expect(FIREBASE_CONFIG).toHaveProperty('authDomain');
    expect(FIREBASE_CONFIG).toHaveProperty('databaseURL');
    expect(FIREBASE_CONFIG).toHaveProperty('projectId');
    expect(FIREBASE_CONFIG).toHaveProperty('storageBucket');
    expect(FIREBASE_CONFIG).toHaveProperty('messagingSenderId');
    expect(FIREBASE_CONFIG).toHaveProperty('appId');
  });

  it('R1/R2: gracefully falls back to getFirestore if initializeFirestore throws on hot reload', () => {
    const fallbackDb = { _isFallback: true };
    const mockInitializeFirestore = jest.spyOn(firestoreModule, 'initializeFirestore')
      .mockImplementationOnce(() => {
        throw new Error('initializeFirestore() has already been called with different options.');
      });
    const mockGetFirestore = jest.spyOn(firestoreModule, 'getFirestore')
      .mockReturnValueOnce(fallbackDb as any);

    let reloadedFirebase: typeof import('../firebase');
    jest.isolateModules(() => {
      reloadedFirebase = require('../firebase');
    });

    expect(mockInitializeFirestore).toHaveBeenCalled();
    expect(mockGetFirestore).toHaveBeenCalled();
    expect(reloadedFirebase!.db).toBe(fallbackDb);

    mockInitializeFirestore.mockRestore();
    mockGetFirestore.mockRestore();
  });

  it('R1/R2: initializes successfully when initializeFirestore succeeds', () => {
    const freshDb = { _isFresh: true };
    const mockInitializeFirestore = jest.spyOn(firestoreModule, 'initializeFirestore')
      .mockReturnValueOnce(freshDb as any);

    let reloadedFirebase: typeof import('../firebase');
    jest.isolateModules(() => {
      reloadedFirebase = require('../firebase');
    });

    expect(mockInitializeFirestore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        experimentalForceLongPolling: true,
        localCache: expect.objectContaining({
          kind: 'persistent',
        }),
      })
    );
    expect(reloadedFirebase!.db).toBe(freshDb);

    mockInitializeFirestore.mockRestore();
  });

  it('R2: gracefully falls back to getAuth if initializeAuth throws on hot reload', () => {
    const fallbackAuth = { _isFallbackAuth: true };
    const mockInitializeAuth = jest.spyOn(authModule, 'initializeAuth')
      .mockImplementationOnce(() => {
        throw new Error('auth/already-initialized');
      });
    const mockGetAuth = jest.spyOn(authModule, 'getAuth')
      .mockReturnValueOnce(fallbackAuth as any);

    let reloadedFirebase: typeof import('../firebase');
    jest.isolateModules(() => {
      reloadedFirebase = require('../firebase');
    });

    expect(mockInitializeAuth).toHaveBeenCalled();
    expect(mockGetAuth).toHaveBeenCalled();
    expect(reloadedFirebase!.auth).toBe(fallbackAuth);

    mockInitializeAuth.mockRestore();
    mockGetAuth.mockRestore();
  });

  describe('Firestore localCache and error resilience', () => {
    it('buildDefaultLocalCache creates persistent cache with multi-tab manager', () => {
      const cache = buildDefaultLocalCache();
      expect(cache).toBeDefined();
      expect((cache as any).kind).toBe('persistent');
      expect((cache as any).tabManager?.kind).toBe('PersistentMultipleTab');
    });

    it('buildDefaultLocalCache defensively falls back to memoryLocalCache when persistentLocalCache throws', () => {
      (firestoreModule.persistentLocalCache as jest.Mock).mockImplementationOnce(() => {
        throw new Error('IndexedDB is not supported');
      });

      const cache = buildDefaultLocalCache();
      expect(cache).toEqual(expect.objectContaining({ kind: 'memory' }));
    });

    it('buildDefaultLocalCache returns undefined when both persistent and memory cache throw', () => {
      (firestoreModule.persistentLocalCache as jest.Mock).mockImplementationOnce(() => {
        throw new Error('IndexedDB failure');
      });
      (firestoreModule.memoryLocalCache as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Memory allocation failure');
      });

      const cache = buildDefaultLocalCache();
      expect(cache).toBeUndefined();
    });

    it('gracefully falls back to memory cache if initializeFirestore throws on fresh init and getFirestore fails', () => {
      const memoryFallbackDb = { _isMemoryFallback: true };
      const spyInit = jest.spyOn(firestoreModule, 'initializeFirestore');
      spyInit.mockClear();
      spyInit
        .mockImplementationOnce(() => {
          throw new Error('Persistent storage unavailable');
        })
        .mockReturnValueOnce(memoryFallbackDb as any);

      const spyGet = jest.spyOn(firestoreModule, 'getFirestore');
      spyGet.mockClear();
      spyGet.mockImplementationOnce(() => {
        throw new Error('No Firestore instance has been initialized');
      });

      let reloadedFirebase: typeof import('../firebase');
      jest.isolateModules(() => {
        reloadedFirebase = require('../firebase');
      });

      expect(spyInit).toHaveBeenCalledTimes(2);
      expect(spyInit).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          localCache: expect.objectContaining({ kind: 'memory' }),
        })
      );
      expect(reloadedFirebase!.db).toBe(memoryFallbackDb);

      spyInit.mockRestore();
      spyGet.mockRestore();
    });

    it('verifies writeBatch mock functionality in Jest environment', async () => {
      const batch = firestoreModule.writeBatch(db);
      expect(batch).toBeDefined();
      expect(typeof batch.set).toBe('function');
      expect(typeof batch.update).toBe('function');
      expect(typeof batch.delete).toBe('function');
      expect(typeof batch.commit).toBe('function');

      const dummyDoc = firestoreModule.doc(db, 'logistics', 'job-123');
      batch.set(dummyDoc, { status: 'in_progress' })
        .update(dummyDoc, { updatedAt: '2026-09-11' })
        .delete(dummyDoc);

      await expect(batch.commit()).resolves.toBeUndefined();
    });
  });
});

