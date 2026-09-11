import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * App Configuration & Firebase Credentials
 * Sourced directly from Kuro ERP Production specifications
 */

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCw2IfjC8ELczfWtHIOUlbIjXou58SnkHY',
  authDomain: 'kurorms.firebaseapp.com',
  databaseURL: 'https://kurorms-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'kurorms',
  storageBucket: 'kurorms.firebasestorage.app',
  messagingSenderId: '100212012033',
  appId: '1:100212012033:web:c5a6bcd368e93cf2e8bc00',
} as const;

export const STORAGE_KEYS = {
  AUTH_TENANT_ID: '@kuro_auth_tenant_id',
  USER_PROFILE: '@kuro_user_profile',
  TENANT_LOOKUP: '@kuro_tenant_lookup',
  REMEMBERED_EMAIL: '@kuro_remembered_email',
  THEME_PREFERENCE: '@kuro_theme_preference',
  SESSION_ID: '@kuro_session_id',
  LOGOUT_NOTICE: '@kuro_logout_notice',
} as const;

// Auto-detect the API base URL depending on the platform
function getDevApiBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // If accessing via phone browser on LAN (e.g. 192.168.1.26), use the same host
    // (Assuming kuro-web is running on the same machine but port 3000)
    if (window.location.hostname !== 'localhost') {
      return `http://${window.location.hostname}:3000`;
    }
  }

  const debuggerHost = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0]; // Extract IP without port
    return `http://${host}:3000`;
  }

  if (typeof __DEV__ !== 'undefined' && !__DEV__ && process.env.NODE_ENV !== 'test') {
    console.warn(
      '[Config] EXPO_PUBLIC_API_BASE_URL is not set in a standalone release build. Backend commands targeting API endpoints may fail.'
    );
  }

  return 'http://localhost:3000';
}

export const API_CONFIG = {
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || getDevApiBaseUrl(),
} as const;

const resolvedAppVersion = Constants.expoConfig?.version || '0.1.2';

export const APP_CONFIG = {
  name: 'Kuro Mobile',
  version: resolvedAppVersion,
  copyright: `© ${new Date().getFullYear()} KURO version ${resolvedAppVersion}`,
  minTouchTarget: 48,
} as const;


