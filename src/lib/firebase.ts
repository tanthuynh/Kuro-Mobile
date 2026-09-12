/**
 * src/lib/firebase.ts
 * Modular Firebase v11 SDK initialization for React Native / Expo with AsyncStorage persistence.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  // @ts-expect-error - getReactNativePersistence is provided by React Native bundle
  getReactNativePersistence,
  getAuth,
  type Auth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  memoryLocalCache,
  type Firestore,
  type FirestoreSettings,
  type FirestoreLocalCache,
} from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, type Functions } from 'firebase/functions';

/**
 * Firebase project credentials configuration.
 * Environment variables use Expo's `EXPO_PUBLIC_` prefix with fallback to Kuro production project.
 */
export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyCw2IfjC8ELczfWtHIOUlbIjXou58SnkHY",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "kurorms.firebaseapp.com",
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || "https://kurorms-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "kurorms",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "kurorms.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "100212012033",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:100212012033:web:c5a6bcd368e93cf2e8bc00",
};

/**
 * Singleton Firebase App instance.
 * Safe across Fast Refresh and hot reload cycles in Metro bundler.
 */
export const app: FirebaseApp = !getApps().length
  ? initializeApp(FIREBASE_CONFIG)
  : getApp();

/**
 * Firebase Auth instance with React Native AsyncStorage persistence.
 * Guarded against "auth/already-initialized" errors during Metro reloads.
 */
let authInstance: Auth;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error: any) {
  // If already initialized during hot reload, retrieve existing instance
  authInstance = getAuth(app);
}

export const auth: Auth = authInstance;

export type FirestoreSettingsInput = number | string | Partial<FirestoreSettings>;

/**
 * Defensive factory for Firestore localCache configuration.
 * Configures persistent local cache with multi-tab synchronization.
 * If persistent cache fails or is unsupported in the current runtime (e.g. Node/SSR/restricted storage),
 * gracefully falls back to memoryLocalCache or undefined.
 */
export function buildDefaultLocalCache(): FirestoreLocalCache | undefined {
  try {
    return persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    });
  } catch (error: any) {
    console.warn(
      '[Firebase] Failed to initialize persistentLocalCache; falling back to memoryLocalCache:',
      error
    );
    try {
      return memoryLocalCache();
    } catch (memError: any) {
      console.warn(
        '[Firebase] memoryLocalCache also failed, proceeding without localCache:',
        memError
      );
      return undefined;
    }
  }
}

/**
 * Helper to compute FirestoreSettings with long-polling transport.
 * Supports:
 *  - Optional timeout interval (between 5 and 30 seconds per Firestore SDK limits)
 *    to resolve premature drops in environments behind aggressive proxy/gateway timeouts.
 *  - Numeric strings (e.g. "25" or "25.5") and floating-point timeouts.
 *  - Custom FirestoreSettings object merging (e.g. host, ssl, cache) while guaranteeing
 *    experimentalForceLongPolling is enforced and mutually exclusive auto-detect flags
 *    are sanitized to prevent SDK runtime exceptions.
 */
export function buildFirestoreSettings(
  optionsOrTimeout?: FirestoreSettingsInput
): FirestoreSettings {
  // If undefined, null, or empty, return clean default long-polling settings with persistent cache
  if (optionsOrTimeout === undefined || optionsOrTimeout === null) {
    const settings: FirestoreSettings = {
      experimentalForceLongPolling: true,
    };
    const defaultCache = buildDefaultLocalCache();
    if (defaultCache) {
      settings.localCache = defaultCache;
    }
    return settings;
  }

  // If a number was passed
  if (typeof optionsOrTimeout === 'number') {
    const settings: FirestoreSettings = {
      experimentalForceLongPolling: true,
    };
    if (Number.isFinite(optionsOrTimeout)) {
      const clamped = Math.min(30, Math.max(5, optionsOrTimeout));
      settings.experimentalLongPollingOptions = {
        timeoutSeconds: clamped,
      };
    }
    const defaultCache = buildDefaultLocalCache();
    if (defaultCache) {
      settings.localCache = defaultCache;
    }
    return settings;
  }

  // If a numeric string was passed (e.g. from environment variables or configs)
  if (typeof optionsOrTimeout === 'string') {
    const settings: FirestoreSettings = {
      experimentalForceLongPolling: true,
    };
    const parsed = parseFloat(optionsOrTimeout);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(30, Math.max(5, parsed));
      settings.experimentalLongPollingOptions = {
        timeoutSeconds: clamped,
      };
    }
    const defaultCache = buildDefaultLocalCache();
    if (defaultCache) {
      settings.localCache = defaultCache;
    }
    return settings;
  }

  // If an options object was passed (excluding arrays)
  if (typeof optionsOrTimeout === 'object' && !Array.isArray(optionsOrTimeout)) {
    const {
      experimentalForceLongPolling = true,
      experimentalAutoDetectLongPolling,
      experimentalLongPollingOptions,
      cacheSizeBytes,
      localCache,
      ...rest
    } = optionsOrTimeout;

    const settings: FirestoreSettings = {
      ...rest,
      experimentalForceLongPolling,
    };

    // Firebase JS SDK throws if both localCache and cacheSizeBytes are set.
    // 1. If localCache is explicitly provided, it takes precedence.
    // 2. If legacy cacheSizeBytes is provided without localCache, preserve cacheSizeBytes and omit default localCache.
    // 3. Otherwise, configure default persistent local cache.
    if (localCache !== undefined) {
      settings.localCache = localCache;
    } else if (cacheSizeBytes !== undefined) {
      settings.cacheSizeBytes = cacheSizeBytes;
    } else {
      const defaultCache = buildDefaultLocalCache();
      if (defaultCache) {
        settings.localCache = defaultCache;
      }
    }

    // Firebase JS SDK throws if both experimentalForceLongPolling and experimentalAutoDetectLongPolling are enabled.
    // Sanitize and only allow auto-detect when force long polling is explicitly false.
    if (!experimentalForceLongPolling && experimentalAutoDetectLongPolling !== undefined) {
      settings.experimentalAutoDetectLongPolling = experimentalAutoDetectLongPolling;
    }

    if (experimentalLongPollingOptions) {
      let timeout: any;
      let otherOptions: Record<string, any> = {};

      if (
        typeof experimentalLongPollingOptions === 'number' ||
        typeof experimentalLongPollingOptions === 'string'
      ) {
        timeout = experimentalLongPollingOptions;
      } else if (
        typeof experimentalLongPollingOptions === 'object' &&
        experimentalLongPollingOptions !== null &&
        !Array.isArray(experimentalLongPollingOptions)
      ) {
        const { timeoutSeconds, ...restPolling } = experimentalLongPollingOptions;
        timeout = timeoutSeconds;
        otherOptions = restPolling;
      }

      let numericTimeout: number | undefined;
      if (typeof timeout === 'number') {
        if (Number.isFinite(timeout)) {
          numericTimeout = timeout;
        }
      } else if (typeof timeout === 'string') {
        const parsed = parseFloat(timeout);
        if (Number.isFinite(parsed)) {
          numericTimeout = parsed;
        }
      }

      if (numericTimeout !== undefined) {
        const clamped = Math.min(30, Math.max(5, numericTimeout));
        settings.experimentalLongPollingOptions = {
          ...otherOptions,
          timeoutSeconds: clamped,
        };
      } else if (Object.keys(otherOptions).length > 0) {
        settings.experimentalLongPollingOptions = otherOptions;
      }
    }

    return settings;
  }

  const fallbackSettings: FirestoreSettings = {
    experimentalForceLongPolling: true,
  };
  const defaultCache = buildDefaultLocalCache();
  if (defaultCache) {
    fallbackSettings.localCache = defaultCache;
  }
  return fallbackSettings;
}

const envTimeout = process.env.EXPO_PUBLIC_FIRESTORE_LONG_POLLING_TIMEOUT_SECONDS
  ? parseFloat(process.env.EXPO_PUBLIC_FIRESTORE_LONG_POLLING_TIMEOUT_SECONDS)
  : undefined;

/**
 * Cloud Firestore client configuration for React Native / Expo.
 * Forces long-polling transport to eliminate WebChannelConnection RPC 'Listen'
 * stream transport errors caused by React Native network stack limitations.
 */
export const FIRESTORE_SETTINGS: FirestoreSettings = buildFirestoreSettings(envTimeout);

/**
 * Cloud Firestore modular database instance.
 * Guarded against "already initialized" errors during Fast Refresh and hot reload cycles,
 * with multi-tier fallback to in-memory cache or standard settings if persistent cache fails.
 */
let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(app, FIRESTORE_SETTINGS);
} catch (error: any) {
  try {
    // 1. If already initialized during hot reload or testing, retrieve existing instance
    dbInstance = getFirestore(app);
  } catch (getDbError: any) {
    // 2. If getFirestore failed, initializeFirestore crashed on first run (e.g., persistent cache unsupported)
    console.warn(
      '[Firebase] initializeFirestore failed with persistent cache; attempting fallback to memory cache:',
      error
    );
    try {
      dbInstance = initializeFirestore(app, {
        ...FIRESTORE_SETTINGS,
        localCache: memoryLocalCache(),
      });
    } catch (fallbackError: any) {
      console.warn(
        '[Firebase] initializeFirestore failed with memory cache; initializing without localCache:',
        fallbackError
      );
      dbInstance = initializeFirestore(app, {
        ...FIRESTORE_SETTINGS,
        localCache: undefined,
      });
    }
  }
}

// Suppress non-fatal WebChannel connection / stream transport warnings in React Native
try {
  setLogLevel('error');
} catch {
  // Ignore in mock or restricted environments
}

export const db: Firestore = dbInstance;

/**
 * Firebase Realtime Database instance configured for Singapore region (asia-southeast1).
 */
export const rtdb: Database = getDatabase(app, FIREBASE_CONFIG.databaseURL);

/**
 * Firebase Cloud Storage instance.
 */
export const storage: FirebaseStorage = getStorage(app, `gs://${FIREBASE_CONFIG.storageBucket}`);

/**
 * Firebase Cloud Functions instance configured for Singapore region (asia-southeast1).
 */
export const functions: Functions = getFunctions(app, 'asia-southeast1');

export default {
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
};
