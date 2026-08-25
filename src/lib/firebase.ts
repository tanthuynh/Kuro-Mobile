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
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

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

/**
 * Cloud Firestore modular database instance.
 */
export const db: Firestore = getFirestore(app);

/**
 * Firebase Realtime Database instance configured for Singapore region (asia-southeast1).
 */
export const rtdb: Database = getDatabase(app, FIREBASE_CONFIG.databaseURL);

/**
 * Firebase Cloud Storage instance.
 */
export const storage: FirebaseStorage = getStorage(app, `gs://${FIREBASE_CONFIG.storageBucket}`);

export default {
  app,
  auth,
  db,
  rtdb,
  storage,
  FIREBASE_CONFIG,
};
