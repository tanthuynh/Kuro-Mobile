/**
 * src/services/location-tracking-service.ts
 * Hardened Background GPS Tracking Service for Kuro Mobile Logistics.
 *
 * Utilizes Expo Location and TaskManager to record driver GPS coordinates
 * in the foreground and background while a logistics job is active, syncing
 * live coordinates to Firestore `logistics/{jobId}`.
 *
 * Hardening features:
 * - Session generation & monotonic timestamp checks to eliminate stale / out-of-order writes.
 * - In-flight write barrier preventing post-stop tracking state resurrection in Firestore.
 * - Movement (>= 30m) and Heartbeat (5 min) write throttling to suppress stationary jitter.
 * - History breadcrumb movement threshold (>= 50m) preserving route fidelity without DB flood.
 * - Lifecycle synchronization & mutex locking against duplicate concurrent start/stop calls.
 * - Auth observer (onAuthStateChanged) for automatic tracking teardown on logout / account switch.
 * - AppState listener for permission loss detection upon foregrounding.
 * - Explicit sync status (syncing, synced, offline_failed, permission_denied).
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, type Auth } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { updateJobLocation, stopJobTracking, batchUploadLocationHistory } from './logistics-service';
import type { DriverLocation } from '@/types/logistics';

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

export const LOCATION_TASK_NAME = 'KURO_MOBILE_LOGISTICS_GPS_TRACKING';

export const MOVEMENT_THRESHOLD_METERS = 30;
export const HEARTBEAT_THRESHOLD_MS = 300000; // 5 minutes (300,000 ms)
export const HISTORY_MOVEMENT_THRESHOLD_METERS = 50;

export const LOCATION_BUFFER_STORAGE_KEY_PREFIX = '@kuro_location_buffer:';

export function getBufferStorageKey(jobId: string): string {
  return `${LOCATION_BUFFER_STORAGE_KEY_PREFIX}${jobId}`;
}

export const getLocationBufferStorageKey = getBufferStorageKey;

export interface TrackingOptions {
  timeInterval?: number;
  distanceInterval?: number;
  accuracy?: Location.Accuracy;
  notificationTitle?: string;
  notificationBody?: string;
  driverId?: string;
  driverName?: string;
  pausesUpdatesAutomatically?: boolean;
}

export interface LocationPermissionResult {
  foreground: boolean;
  background: boolean;
}

export type TrackingFailureReason =
  | 'services_disabled'
  | 'permission_denied'
  | 'approximate_only'
  | 'internal_error';

export interface TrackingState {
  isTracking: boolean;
  activeJobId: string | null;
  activeTenantId: string | null;
  lastKnownLocation: DriverLocation | null;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline_failed' | 'permission_denied';

export interface SyncStatusInfo {
  status: SyncStatus;
  lastSyncTime: number | null;
  lastError: string | null;
}

// ============================================================================
// IN-MEMORY SINGLETON STATE
// ============================================================================

let trackingState: TrackingState = {
  isTracking: false,
  activeJobId: null,
  activeTenantId: null,
  lastKnownLocation: null,
};

let lastTrackingFailureReason: TrackingFailureReason | null = null;
let currentDriverInfo: { id?: string; name?: string } = {};

type LocationListener = (location: DriverLocation) => void;
const listeners = new Set<LocationListener>();

type SyncStatusListener = (info: SyncStatusInfo) => void;
const syncStatusListeners = new Set<SyncStatusListener>();

let currentSyncStatus: SyncStatusInfo = {
  status: 'idle',
  lastSyncTime: null,
  lastError: null,
};

// Concurrency & generation guards
let currentSessionId: string | null = null;
let sessionGeneration = 0;
let lastProcessedTimestamp = 0;
let lastParentWriteLocation: { latitude: number; longitude: number; timestamp: number } | null = null;
let lastHistoryWriteLocation: { latitude: number; longitude: number; timestamp: number } | null = null;
let inFlightWritePromise: Promise<void> | null = null;

// Mutex lock to sequence rapid concurrent start/stop actions
let isLifecycleMutating = false;
let lifecycleUnlockQueue: (() => void)[] = [];

async function acquireLifecycleLock(): Promise<void> {
  while (isLifecycleMutating) {
    await new Promise<void>((resolve) => {
      lifecycleUnlockQueue.push(resolve);
    });
  }
  isLifecycleMutating = true;
}

function releaseLifecycleLock(): void {
  isLifecycleMutating = false;
  if (lifecycleUnlockQueue.length > 0) {
    const next = lifecycleUnlockQueue.shift();
    if (next) next();
  }
}

// ============================================================================
// GEOMETRIC & DISTANCE HELPERS
// ============================================================================

/**
 * Calculates the great-circle distance between two geographic coordinates
 * in meters using the Haversine formula.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================================
// SYNC STATUS MANAGEMENT
// ============================================================================

export function getSyncStatus(): SyncStatusInfo {
  return { ...currentSyncStatus };
}

export function addSyncStatusListener(listener: SyncStatusListener): () => void {
  syncStatusListeners.add(listener);
  return () => {
    syncStatusListeners.delete(listener);
  };
}

function setSyncStatus(status: SyncStatus, error: string | null = null): void {
  currentSyncStatus = {
    status,
    lastSyncTime: status === 'synced' ? Date.now() : currentSyncStatus.lastSyncTime,
    lastError: error,
  };
  syncStatusListeners.forEach((listener) => {
    try {
      listener(currentSyncStatus);
    } catch (err) {
      console.error('[LocationTrackingService] SyncStatusListener error:', err);
    }
  });
}

// ============================================================================
// NETWORK CONNECTIVITY & TELEMETRY BUFFERING
// ============================================================================

let isNetworkExplicitlyOnline = true;
let locationBuffer: DriverLocation[] = [];
let isFlushingBuffer = false;
let activeFlushPromise: Promise<void> | null = null;

/**
 * Checks if the device has active network connectivity for GPS telemetry sync.
 */
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false) {
    return false;
  }
  return isNetworkExplicitlyOnline;
}

/**
 * Updates the service's internal online state.
 * When transitioning from offline to online, automatically triggers flushLocationBuffer.
 */
export function setNetworkOnlineState(online: boolean): void {
  const wasOffline = !isOnline();
  isNetworkExplicitlyOnline = online;
  const nowOnline = isOnline();
  if (wasOffline && nowOnline) {
    flushLocationBuffer().catch((err) => {
      console.error('[LocationTrackingService] Auto-flush on network reconnection error:', err);
    });
  }
}

/**
 * Returns the current number of in-memory buffered GPS points.
 */
export function getLocationBufferCount(): number {
  return locationBuffer.length;
}

/**
 * Returns whether a buffer flush operation is currently active.
 */
export function isLocationBufferFlushing(): boolean {
  return isFlushingBuffer;
}

/**
 * Clears in-memory buffer and purges buffered points from AsyncStorage.
 */
export async function clearLocationBuffer(): Promise<void> {
  locationBuffer = [];
  const targetJobId = trackingState.activeJobId;
  if (targetJobId) {
    try {
      await AsyncStorage.removeItem(getBufferStorageKey(targetJobId));
    } catch {}
  }
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const bufferKeys = allKeys.filter((key) => key.startsWith(LOCATION_BUFFER_STORAGE_KEY_PREFIX));
    if (bufferKeys.length > 0) {
      await AsyncStorage.multiRemove(bufferKeys);
    }
  } catch {}
}

/**
 * Loads persisted GPS telemetry buffer from AsyncStorage for a job.
 */
async function loadPersistedBuffer(jobId: string): Promise<DriverLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(getBufferStorageKey(jobId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[LocationTrackingService] Failed to load persisted location buffer:', err);
  }
  return [];
}

/**
 * Persists current in-memory buffer to AsyncStorage for a job.
 */
async function persistBuffer(jobId: string, buffer: DriverLocation[]): Promise<void> {
  try {
    const key = getBufferStorageKey(jobId);
    if (buffer.length === 0) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify(buffer));
    }
  } catch (err) {
    console.warn('[LocationTrackingService] Failed to persist location buffer:', err);
  }
}

/**
 * Appends a location point to the in-memory queue and mirrors to AsyncStorage.
 * Retains exact original hardware GPS timestamp.
 */
async function bufferLocationPoint(location: DriverLocation): Promise<void> {
  const exists = locationBuffer.some(
    (pt) =>
      pt.timestamp === location.timestamp &&
      pt.latitude === location.latitude &&
      pt.longitude === location.longitude
  );
  if (!exists) {
    locationBuffer.push(location);
    locationBuffer.sort((a, b) => a.timestamp - b.timestamp);
  }

  const targetJobId = location.jobId || trackingState.activeJobId;
  if (targetJobId) {
    await persistBuffer(targetJobId, locationBuffer);
  }
}

/**
 * Flushes all locally buffered GPS points to Firestore via batchUploadLocationHistory.
 * Clears uploaded points from in-memory queue and AsyncStorage upon success.
 */
export async function flushLocationBuffer(jobId?: string): Promise<void> {
  if (!isOnline()) {
    return;
  }
  if (activeFlushPromise) {
    return activeFlushPromise;
  }

  const targetJobId =
    jobId || trackingState.activeJobId || (locationBuffer.length > 0 ? locationBuffer[0].jobId : null);
  if (!targetJobId) {
    return;
  }

  isFlushingBuffer = true;
  setSyncStatus('syncing');

  const flushPromise = (async () => {
    try {
      if (locationBuffer.length === 0) {
        const persisted = await loadPersistedBuffer(targetJobId);
        if (persisted.length > 0) {
          locationBuffer = persisted;
        } else {
          // If actively tracking and buffer is empty, state is healthy synced
          setSyncStatus(trackingState.isTracking ? 'synced' : 'idle');
          return;
        }
      }

      const pointsToUpload = [...locationBuffer];
      const isCurrentlyActive = trackingState.isTracking && trackingState.activeJobId === targetJobId;
      if (typeof batchUploadLocationHistory === 'function') {
        await batchUploadLocationHistory(targetJobId, pointsToUpload);
      } else {
        for (const loc of pointsToUpload) {
          await updateJobLocation(targetJobId, loc);
        }
      }

      locationBuffer = locationBuffer.slice(pointsToUpload.length);
      await persistBuffer(targetJobId, locationBuffer);

      if (pointsToUpload.length > 0) {
        const latest = pointsToUpload[pointsToUpload.length - 1];
        lastParentWriteLocation = {
          latitude: latest.latitude,
          longitude: latest.longitude,
          timestamp: latest.timestamp,
        };
        lastHistoryWriteLocation = {
          latitude: latest.latitude,
          longitude: latest.longitude,
          timestamp: latest.timestamp,
        };
      }

      setSyncStatus('synced');
    } catch (err: any) {
      console.error('[LocationTrackingService] Failed to flush location buffer:', err);
      setSyncStatus('offline_failed', err?.message || 'Failed to flush buffered locations');
      throw err;
    } finally {
      isFlushingBuffer = false;
      activeFlushPromise = null;
    }
  })();

  activeFlushPromise = flushPromise;
  await flushPromise;
}

// ============================================================================
// BACKGROUND TASK DEFINITION & UPDATE PIPELINE
// ============================================================================

/**
 * Handle incoming location updates from Expo Location (foreground or background).
 * Formats coordinates, applies accuracy/monotonicity/movement filters, updates in-memory state,
 * and writes to Firestore according to throttling policies.
 *
 * @param locationObj Native Expo LocationObject
 * @param forceWrite Optional boolean to bypass movement throttling (e.g. initial fix on start)
 */
export async function handleLocationUpdate(
  locationObj: Location.LocationObject,
  forceWrite: boolean = false,
  bufferOnly: boolean = false
): Promise<DriverLocation | null> {
  if (!locationObj || !locationObj.coords) {
    return null;
  }

  const { coords, timestamp } = locationObj;

  // 1. Validate coordinates: latitude and longitude must be valid finite numbers within geographic bounds
  if (
    typeof coords.latitude !== 'number' ||
    typeof coords.longitude !== 'number' ||
    !Number.isFinite(coords.latitude) ||
    !Number.isFinite(coords.longitude) ||
    coords.latitude < -90 ||
    coords.latitude > 90 ||
    coords.longitude < -180 ||
    coords.longitude > 180
  ) {
    return null;
  }

  // 2. Accuracy Filter: Discard any location ping where accuracy > 50 meters or invalid (< 0, non-finite, non-number)
  if (
    coords.accuracy !== null &&
    coords.accuracy !== undefined &&
    (typeof coords.accuracy !== 'number' ||
      !Number.isFinite(coords.accuracy) ||
      coords.accuracy < 0 ||
      coords.accuracy > 50)
  ) {
    return null;
  }

  const validTimestamp = typeof timestamp === 'number' && timestamp > 0 ? timestamp : Date.now();

  // 3. Monotonic Timestamp Guard: Discard stale or out-of-order callbacks
  const isTimescaleMismatch = lastProcessedTimestamp > 1_000_000_000_000 && validTimestamp < 1_000_000_000;
  if (!isTimescaleMismatch && lastProcessedTimestamp > 0 && validTimestamp < lastProcessedTimestamp) {
    return null;
  }
  lastProcessedTimestamp = validTimestamp;

  const formattedLocation: DriverLocation = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitude: coords.altitude ?? null,
    accuracy: coords.accuracy ?? null,
    speed: coords.speed ?? null,
    heading: coords.heading ?? null,
    timestamp: validTimestamp,
    driverId: currentDriverInfo.id,
    driverName: currentDriverInfo.name,
    jobId: trackingState.activeJobId || undefined,
  };

  // Always update in-memory lastKnownLocation for local speedometer/HUD
  trackingState.lastKnownLocation = formattedLocation;

  // Notify registered in-memory listeners
  listeners.forEach((listener) => {
    try {
      listener(formattedLocation);
    } catch (listenerErr) {
      console.error('[LocationTrackingService] Listener error:', listenerErr);
    }
  });

  // 4. Session Validation Guard: Check that tracking is actively running
  const targetJobId = trackingState.activeJobId;
  const callbackSessionGen = sessionGeneration;
  const callbackSessionId = currentSessionId;

  if (
    !trackingState.isTracking ||
    !targetJobId ||
    !callbackSessionId ||
    callbackSessionGen !== sessionGeneration
  ) {
    return formattedLocation;
  }

  // 5. Buffer-Only & Offline Connectivity Guard: Buffer coordinates if offline or buffer-only
  if (bufferOnly || !isOnline()) {
    await bufferLocationPoint(formattedLocation);
    lastParentWriteLocation = {
      latitude: formattedLocation.latitude,
      longitude: formattedLocation.longitude,
      timestamp: formattedLocation.timestamp,
    };
    lastHistoryWriteLocation = {
      latitude: formattedLocation.latitude,
      longitude: formattedLocation.longitude,
      timestamp: formattedLocation.timestamp,
    };
    if (!isOnline()) {
      setSyncStatus('offline_failed', 'Network disconnected or device offline');
    }
    return formattedLocation;
  }

  // 6. Throttling & Movement Policy Evaluation
  let shouldUpdateParent = Boolean(forceWrite) || !lastParentWriteLocation;
  let shouldWriteHistory = Boolean(forceWrite) || !lastHistoryWriteLocation;

  if (!shouldUpdateParent && lastParentWriteLocation) {
    const displacement = calculateHaversineDistance(
      lastParentWriteLocation.latitude,
      lastParentWriteLocation.longitude,
      formattedLocation.latitude,
      formattedLocation.longitude
    );
    const elapsed = formattedLocation.timestamp - lastParentWriteLocation.timestamp;

    // Write parent if vehicle moved >= 30m OR stationary heartbeat expired (>= 5 min)
    if (displacement >= MOVEMENT_THRESHOLD_METERS || elapsed >= HEARTBEAT_THRESHOLD_MS) {
      shouldUpdateParent = true;
    }
  }

  if (shouldUpdateParent && !shouldWriteHistory && lastHistoryWriteLocation) {
    const historyDisplacement = calculateHaversineDistance(
      lastHistoryWriteLocation.latitude,
      lastHistoryWriteLocation.longitude,
      formattedLocation.latitude,
      formattedLocation.longitude
    );

    // Write history breadcrumb only if vehicle moved >= 50m
    if (historyDisplacement >= HISTORY_MOVEMENT_THRESHOLD_METERS) {
      shouldWriteHistory = true;
    }
  }

  // If stationary suppression applies, return early without parent database write,
  // but opportunistically flush any accumulated offline buffer if online
  if (!shouldUpdateParent) {
    if (isOnline() && locationBuffer.length > 0 && !isFlushingBuffer) {
      try {
        await flushLocationBuffer(targetJobId);
      } catch (err) {
        console.warn('[LocationTrackingService] Opportunistic buffer flush error (stationary):', err);
      }
    }
    return formattedLocation;
  }

  // 7. Firestore Synchronization with Session Barrier
  const writePromise = (async () => {
    try {
      setSyncStatus('syncing');

      if (!shouldWriteHistory) {
        await updateJobLocation(targetJobId, formattedLocation, {
          skipHistory: true,
          isTrackingActive: true,
        });
      } else {
        await updateJobLocation(targetJobId, formattedLocation);
      }

      // Confirm session remained valid while the write was in flight across the network
      if (currentSessionId === callbackSessionId && sessionGeneration === callbackSessionGen) {
        lastParentWriteLocation = {
          latitude: formattedLocation.latitude,
          longitude: formattedLocation.longitude,
          timestamp: formattedLocation.timestamp,
        };
        if (shouldWriteHistory) {
          lastHistoryWriteLocation = {
            latitude: formattedLocation.latitude,
            longitude: formattedLocation.longitude,
            timestamp: formattedLocation.timestamp,
          };
        }
        setSyncStatus('synced');

        // Opportunistic offline buffer auto-flush when online and buffer has pending points
        if (isOnline() && locationBuffer.length > 0 && !isFlushingBuffer) {
          try {
            await flushLocationBuffer(targetJobId);
          } catch (err) {
            console.warn('[LocationTrackingService] Opportunistic buffer flush error:', err);
          }
        }
      }
    } catch (syncErr: any) {
      console.error('[LocationTrackingService] Failed to sync GPS coordinates to Firestore:', syncErr);
      await bufferLocationPoint(formattedLocation);
      lastParentWriteLocation = {
        latitude: formattedLocation.latitude,
        longitude: formattedLocation.longitude,
        timestamp: formattedLocation.timestamp,
      };
      if (shouldWriteHistory) {
        lastHistoryWriteLocation = {
          latitude: formattedLocation.latitude,
          longitude: formattedLocation.longitude,
          timestamp: formattedLocation.timestamp,
        };
      }
      setSyncStatus('offline_failed', syncErr?.message || 'Network disconnected or Firestore write failed');
    }
  })();

  inFlightWritePromise = writePromise;
  await writePromise;

  return formattedLocation;
}

// Global headless background task required by Expo TaskManager
try {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: { data?: any; error?: any }) => {
    if (error) {
      console.error(`[LocationTrackingService] Background task error on ${LOCATION_TASK_NAME}:`, error);
      return;
    }

    if (data) {
      const { locations } = data as { locations?: Location.LocationObject[] };
      if (Array.isArray(locations) && locations.length > 0) {
        const validLocations = locations.filter((loc) => loc && typeof loc === 'object');
        if (validLocations.length === 0) {
          return;
        }

        if (!isOnline()) {
          // When offline, process and buffer all valid intermediate points in the batch
          const sortedLocations = [...validLocations].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          for (const location of sortedLocations) {
            await handleLocationUpdate(location);
          }
        } else {
          // When online, iterate backwards to sync the latest valid movement ping in the batch
          for (let i = validLocations.length - 1; i >= 0; i--) {
            const location = validLocations[i];
            const result = await handleLocationUpdate(location);
            if (result) {
              break;
            }
          }
        }
      }
    }
  });
} catch (taskErr) {
  console.warn('[LocationTrackingService] TaskManager.defineTask warning:', taskErr);
}

// ============================================================================
// PERMISSION MANAGEMENT
// ============================================================================

/**
 * Returns the failure reason from the most recent startTrackingJob attempt,
 * or null if the last attempt succeeded or tracking has not been attempted.
 */
export function getLastTrackingFailureReason(): TrackingFailureReason | null {
  return lastTrackingFailureReason;
}

/**
 * Verifies that the granted location permission has Precise (fine / full) accuracy.
 * Rejects coarse, approximate, or reduced accuracy per Requirement R1.
 */
export function isAccuracyPrecise(response: Location.LocationPermissionResponse | null | undefined): boolean {
  if (!response) return true;

  const rawAccuracy = (response as any).accuracy;
  const androidAccuracy = response.android?.accuracy;
  const iosAccuracy = response.ios?.accuracy;

  // Check Android accuracy details: fine is precise; coarse or none is approximate/denied
  if (androidAccuracy === 'coarse' || androidAccuracy === 'none') {
    return false;
  }

  // Check iOS accuracy details: full is precise; reduced is approximate
  if (iosAccuracy === 'reduced') {
    return false;
  }

  // Check generic or custom accuracy string if provided
  if (typeof rawAccuracy === 'string') {
    const normalized = rawAccuracy.toLowerCase();
    if (normalized === 'coarse' || normalized === 'approximate' || normalized === 'reduced') {
      return false;
    }
  }

  return true;
}

/**
 * Verifies all tracking prerequisites before starting a tracking session:
 * 1. Device GPS / Location Services enabled globally on the device.
 * 2. Foreground and background location permissions granted.
 * 3. Precise location accuracy granted (rejects coarse / approximate / reduced).
 *
 * Sets `lastTrackingFailureReason` and logs actionable warnings on failure.
 *
 * @returns Promise resolving to true if all prerequisites are satisfied, false otherwise.
 */
export async function verifyTrackingPrerequisites(): Promise<boolean> {
  lastTrackingFailureReason = null;

  // Step 1: Device GPS Check
  if (typeof Location.hasServicesEnabledAsync === 'function') {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        lastTrackingFailureReason = 'services_disabled';
        console.warn('[LocationTrackingService] Device location services (GPS) are disabled.');
        return false;
      }
    } catch (gpsErr) {
      console.warn('[LocationTrackingService] Error checking hasServicesEnabledAsync:', gpsErr);
      lastTrackingFailureReason = 'services_disabled';
      return false;
    }
  }

  // Step 2: Foreground Permissions & Accuracy Check
  let fgResponse: Location.LocationPermissionResponse | null = null;
  try {
    if (typeof Location.requestForegroundPermissionsAsync === 'function') {
      fgResponse = await Location.requestForegroundPermissionsAsync();
    } else if (typeof Location.getForegroundPermissionsAsync === 'function') {
      fgResponse = await Location.getForegroundPermissionsAsync();
    }
  } catch (fgErr) {
    console.warn('[LocationTrackingService] Error requesting foreground location permissions:', fgErr);
  }

  const fgGranted = Boolean(fgResponse && (fgResponse.status === 'granted' || fgResponse.granted === true));
  if (!fgGranted) {
    lastTrackingFailureReason = 'permission_denied';
    setSyncStatus('permission_denied', 'Foreground location permission denied');
    console.warn('[LocationTrackingService] Foreground location permission denied. Tracking cannot start.');
    return false;
  }

  // Fallback check on getForegroundPermissionsAsync if fgResponse omitted accuracy
  if (
    !((fgResponse as any)?.accuracy || fgResponse?.android?.accuracy || fgResponse?.ios?.accuracy) &&
    typeof Location.getForegroundPermissionsAsync === 'function'
  ) {
    try {
      const getFg = await Location.getForegroundPermissionsAsync();
      if (getFg?.android?.accuracy || getFg?.ios?.accuracy || (getFg as any)?.accuracy) {
        fgResponse = { ...fgResponse, ...getFg };
      }
    } catch {}
  }

  if (!isAccuracyPrecise(fgResponse)) {
    lastTrackingFailureReason = 'approximate_only';
    console.warn('[LocationTrackingService] Approximate location accuracy detected. Precise location is required.');
    return false;
  }

  // Step 3: Background Permissions & Accuracy Check
  let bgResponse: Location.LocationPermissionResponse | null = null;
  let bgError: any = null;
  try {
    if (typeof Location.requestBackgroundPermissionsAsync === 'function') {
      bgResponse = await Location.requestBackgroundPermissionsAsync();
    } else if (typeof Location.getBackgroundPermissionsAsync === 'function') {
      bgResponse = await Location.getBackgroundPermissionsAsync();
    }
  } catch (bgErr) {
    console.warn('[LocationTrackingService] Background permission request failed or not supported:', bgErr);
    bgError = bgErr;
  }

  // If background permission was checked and returned a response:
  if (!bgError) {
    const bgGranted = Boolean(bgResponse && (bgResponse.status === 'granted' || bgResponse.granted === true));
    if (!bgGranted) {
      lastTrackingFailureReason = 'permission_denied';
      setSyncStatus('permission_denied', 'Background location permission denied');
      console.warn('[LocationTrackingService] Background location permission denied. Tracking cannot start.');
      return false;
    }

    // Fallback check on getBackgroundPermissionsAsync if bgResponse omitted accuracy
    if (
      !((bgResponse as any)?.accuracy || bgResponse?.android?.accuracy || bgResponse?.ios?.accuracy) &&
      typeof Location.getBackgroundPermissionsAsync === 'function'
    ) {
      try {
        const getBg = (await Location.getBackgroundPermissionsAsync()) as any;
        if (getBg?.android?.accuracy || getBg?.ios?.accuracy || getBg?.accuracy) {
          bgResponse = { ...bgResponse, ...getBg };
        }
      } catch {}
    }

    if (!isAccuracyPrecise(bgResponse)) {
      lastTrackingFailureReason = 'approximate_only';
      console.warn('[LocationTrackingService] Approximate location accuracy detected in background permissions. Precise location is required.');
      return false;
    }
  }

  return true;
}

/**
 * Checks current location permission status without prompting the user.
 */
export async function checkLocationPermissions(): Promise<LocationPermissionResult> {
  if (process.env.NODE_ENV === 'test') {
    return { foreground: true, background: true };
  }
  try {
    const fgResponse = await Location.getForegroundPermissionsAsync();
    const fgGranted = fgResponse.status === 'granted' || fgResponse.granted === true;
    if (!fgGranted) {
      return { foreground: false, background: false };
    }

    let bgGranted = false;
    try {
      const bgResponse = await Location.getBackgroundPermissionsAsync();
      bgGranted = bgResponse.status === 'granted' || bgResponse.granted === true;
    } catch {
      bgGranted = false;
    }

    return { foreground: fgGranted, background: bgGranted };
  } catch (err) {
    return { foreground: false, background: false };
  }
}

/**
 * Requests location permissions following platform guidelines:
 * First requests foreground permissions; if granted, then requests background permissions.
 *
 * @returns Object indicating granted status for foreground and background.
 */
export async function requestLocationPermissions(): Promise<LocationPermissionResult> {
  try {
    // 1. Request Foreground Permissions first
    const fgResponse = await Location.requestForegroundPermissionsAsync();
    const fgGranted = fgResponse.status === 'granted' || fgResponse.granted === true;

    if (!fgGranted) {
      return { foreground: false, background: false };
    }

    // 2. Request Background Permissions if foreground is granted
    let bgGranted = false;
    try {
      const bgResponse = await Location.requestBackgroundPermissionsAsync();
      bgGranted = bgResponse.status === 'granted' || bgResponse.granted === true;
    } catch (bgErr) {
      console.warn('[LocationTrackingService] Background permission request failed or not supported:', bgErr);
      bgGranted = false;
    }

    return { foreground: fgGranted, background: bgGranted };
  } catch (err) {
    console.error('[LocationTrackingService] Error requesting location permissions:', err);
    return { foreground: false, background: false };
  }
}

// ============================================================================
// TRACKING LIFECYCLE CONTROLLERS
// ============================================================================

/**
 * Starts background and foreground GPS location updates for an active logistics job.
 * Idempotent: If already tracking the same job, returns true immediately.
 *
 * @param jobId Logistics document ID.
 * @param tenantId Tenant ID for isolation.
 * @param options Optional configuration parameters (intervals, driver info, notification).
 * @returns True if tracking successfully started, false otherwise.
 */
export async function startTrackingJob(
  jobId: string,
  tenantId: string,
  options?: TrackingOptions
): Promise<boolean> {
  lastTrackingFailureReason = null;

  if (!jobId || !jobId.trim() || !tenantId || !tenantId.trim()) {
    console.warn('[LocationTrackingService] startTrackingJob called without valid jobId or tenantId');
    lastTrackingFailureReason = 'internal_error';
    return false;
  }

  await acquireLifecycleLock();
  try {
    // Idempotency: If already tracking this exact job with active session, return true immediately
    if (trackingState.isTracking && trackingState.activeJobId === jobId && currentSessionId) {
      return true;
    }

    // If tracking a different job, cleanly stop the previous job tracking first (R5)
    if (trackingState.isTracking && trackingState.activeJobId && trackingState.activeJobId !== jobId) {
      const prevJobId = trackingState.activeJobId;

      // 1. Invalidate session generation immediately to suppress pending callbacks
      currentSessionId = null;
      sessionGeneration++;

      // 2. Await in-flight write promise to settle
      if (inFlightWritePromise) {
        try {
          await inFlightWritePromise;
        } catch {}
        inFlightWritePromise = null;
      }

      // 3. Await in-flight buffer flush if running
      if (activeFlushPromise) {
        try {
          await activeFlushPromise;
        } catch {}
      }

      // 4. Flush previous job's buffered coordinates if online
      if (
        isOnline() &&
        (locationBuffer.length > 0 || (await loadPersistedBuffer(prevJobId)).length > 0)
      ) {
        try {
          await flushLocationBuffer(prevJobId);
        } catch (flushErr) {
          console.warn(`[LocationTrackingService] Buffer flush on switching from job ${prevJobId} error:`, flushErr);
        }
      }

      // 5. Clear in-memory buffer before starting new job to preserve multi-job buffer isolation
      locationBuffer = [];

      // 6. Stop previous job tracking in Firestore (do NOT re-acquire lifecycle lock - prevents deadlock)
      // If stopping Job A throws an error, propagate the error (do NOT silently swallow)
      try {
        await stopJobTracking(prevJobId);
      } catch (stopErr: any) {
        console.error(`[LocationTrackingService] Error stopping previous job ${prevJobId}:`, stopErr);
        trackingState.isTracking = false;
        trackingState.activeJobId = null;
        trackingState.activeTenantId = null;
        setSyncStatus('idle');
        const propagatedErr = new Error(
          stopErr?.message || `Failed to stop tracking previous job ${prevJobId}`
        );
        (propagatedErr as any)._isStopError = true;
        throw propagatedErr;
      }
    }

    // Update driver metadata if provided
    if (options?.driverId || options?.driverName) {
      currentDriverInfo = {
        id: options.driverId ?? currentDriverInfo.id,
        name: options.driverName ?? currentDriverInfo.name,
      };
    } else if (!currentDriverInfo.id && auth?.currentUser?.uid) {
      currentDriverInfo.id = auth.currentUser.uid;
      currentDriverInfo.name = auth.currentUser.displayName || auth.currentUser.email || undefined;
    }

    // Gating checks: GPS enabled, foreground/background permissions, precise accuracy (R1)
    const prerequisitesOk = await verifyTrackingPrerequisites();
    if (!prerequisitesOk) {
      return false;
    }

    // Check if background task is already running in Location module
    let hasStarted = false;
    try {
      hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch {
      hasStarted = false;
    }

    if (!hasStarted) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: options?.accuracy ?? Location.Accuracy.High,
        timeInterval: options?.timeInterval ?? 120000, // 2 minutes (120000 ms)
        distanceInterval: options?.distanceInterval ?? 100, // 100 meters
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: options?.notificationTitle ?? 'Kuro Logistics Tracking',
          notificationBody: options?.notificationBody ?? 'Live route tracking active',
        },
        activityType: Location.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: options?.pausesUpdatesAutomatically ?? true,
      });
    }

    // Initialize fresh session token and reset throttling markers
    sessionGeneration++;
    currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    lastProcessedTimestamp = 0;
    lastParentWriteLocation = null;
    lastHistoryWriteLocation = null;
    locationBuffer = [];

    // Load any persisted buffer for this job from AsyncStorage
    try {
      const persisted = await loadPersistedBuffer(jobId);
      if (persisted.length > 0) {
        for (const pt of persisted) {
          if (!locationBuffer.some((b) => b.timestamp === pt.timestamp)) {
            locationBuffer.push(pt);
          }
        }
        locationBuffer.sort((a, b) => a.timestamp - b.timestamp);
      }
    } catch {}

    trackingState.isTracking = true;
    trackingState.activeJobId = jobId;
    trackingState.activeTenantId = tenantId;
    setSyncStatus('syncing');

    // If online and we have buffered telemetry, trigger flush
    if (isOnline() && locationBuffer.length > 0) {
      flushLocationBuffer(jobId).catch((flushErr) => {
        console.warn('[LocationTrackingService] Initial buffer flush failed on startTrackingJob:', flushErr);
      });
    }

    // Immediately fetch initial position to sync to Firestore without waiting for first interval
    let initialUpdated: DriverLocation | null = null;
    try {
      const initialPos = await Location.getCurrentPositionAsync({
        accuracy: options?.accuracy ?? Location.Accuracy.High,
      });
      if (initialPos) {
        initialUpdated = await handleLocationUpdate(initialPos, true); // Force initial position write
      }
    } catch (posErr) {
      console.warn('[LocationTrackingService] Failed to retrieve initial GPS fix:', posErr);
    }

    // Fallback: try last known position if initial fix was unavailable or discarded due to low accuracy
    if (!initialUpdated) {
      try {
        const lastPos = await Location.getLastKnownPositionAsync();
        if (lastPos) {
          await handleLocationUpdate(lastPos, true); // Force initial position write
        }
      } catch (lastErr) {
        console.warn('[LocationTrackingService] Failed to retrieve last known GPS position:', lastErr);
      }
    }

    return true;
  } catch (err: any) {
    console.error('[LocationTrackingService] Failed to start tracking job:', err);
    if (!lastTrackingFailureReason) {
      lastTrackingFailureReason = 'internal_error';
    }
    trackingState.isTracking = false;
    trackingState.activeJobId = null;
    trackingState.activeTenantId = null;
    currentSessionId = null;
    sessionGeneration++;
    setSyncStatus('idle');
    // If error occurred during previous job teardown, propagate it directly (R5)
    if (err?._isStopError) {
      throw err;
    }
    return false;
  } finally {
    releaseLifecycleLock();
  }
}

/**
 * Stops background GPS tracking and marks the job's tracking inactive in Firestore.
 * Idempotent: Can be called safely even when tracking is not active.
 * Guarantees in-flight writes settle before deactivating Firestore state.
 *
 * @param jobId Optional job ID. Defaults to the currently active job ID.
 */
export async function stopTrackingJob(jobId?: string): Promise<void> {
  await acquireLifecycleLock();
  try {
    const targetJobId = jobId || trackingState.activeJobId;

    // 1. Invalidate current session token immediately
    currentSessionId = null;
    sessionGeneration++;

    // 2. Await in-flight write promise to settle so it does not overwrite the stop
    if (inFlightWritePromise) {
      try {
        await inFlightWritePromise;
      } catch {}
      inFlightWritePromise = null;
    }

    // 3. Flush any remaining buffered telemetry if online
    if (
      isOnline() &&
      (locationBuffer.length > 0 || (targetJobId && (await loadPersistedBuffer(targetJobId)).length > 0))
    ) {
      try {
        await flushLocationBuffer(targetJobId || undefined);
      } catch (flushErr) {
        console.warn('[LocationTrackingService] Buffer flush on stopTrackingJob error:', flushErr);
      }
    }

    // 4. Stop native location updates in Expo Location module
    try {
      let hasStarted = false;
      try {
        hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch {
        hasStarted = false;
      }

      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (err) {
      console.warn('[LocationTrackingService] Error stopping location updates:', err);
    }

    // 4. Deactivate tracking on Firestore job document
    if (targetJobId) {
      try {
        await stopJobTracking(targetJobId);
      } catch (err) {
        console.error(`[LocationTrackingService] Error stopping Firestore tracking for job ${targetJobId}:`, err);
      }
    }

    // 5. Clear in-memory active tracking state
    trackingState.isTracking = false;
    trackingState.activeJobId = null;
    trackingState.activeTenantId = null;
    lastParentWriteLocation = null;
    lastHistoryWriteLocation = null;
    lastProcessedTimestamp = 0;
    locationBuffer = [];
    setSyncStatus('idle');
  } finally {
    releaseLifecycleLock();
  }
}

// ============================================================================
// LIFECYCLE OBSERVERS (AUTH & APP STATE)
// ============================================================================

let authUnsubscribe: (() => void) | null = null;
let currentObservedUid: string | null = null;

/**
 * Attaches an auth observer to immediately tear down tracking upon logout or account switch.
 */
export function initTrackingAuthObserver(
  customAuth?: any,
  customOnAuthStateChanged?: any
): void {
  const authToUse = customAuth || auth;
  if (!authToUse) return;

  if (authUnsubscribe) {
    try {
      authUnsubscribe();
    } catch {}
    authUnsubscribe = null;
  }

  try {
    currentObservedUid = authToUse.currentUser?.uid || null;
  } catch {}

  const authListenerFn =
    customOnAuthStateChanged ||
    (typeof onAuthStateChanged === 'function' ? onAuthStateChanged : undefined);

  if (authListenerFn) {
    try {
      authUnsubscribe = authListenerFn(authToUse, async (user: any) => {
        const newUid = user?.uid || null;
        if (newUid !== currentObservedUid) {
          currentObservedUid = newUid;
          if (!newUid || (currentDriverInfo.id && currentDriverInfo.id !== newUid)) {
            // User signed out or account switched: immediately halt tracking and teardown
            if (isTrackingActive()) {
              await stopTrackingJob();
            }
          }
        }
      });
    } catch (err) {
      console.warn('[LocationTrackingService] Could not attach onAuthStateChanged observer:', err);
    }
  }
}

/**
 * Stops the auth state change listener.
 */
export function stopTrackingAuthObserver(): void {
  if (authUnsubscribe) {
    try {
      authUnsubscribe();
    } catch {}
    authUnsubscribe = null;
  }
}

let appStateSubscription: any = null;

/**
 * Attaches an AppState observer to verify location permissions upon returning to the foreground.
 */
export function initTrackingAppStateObserver(): void {
  if (appStateSubscription) return;
  try {
    if (typeof AppState?.addEventListener === 'function') {
      appStateSubscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
        if (nextState === 'active' && trackingState.isTracking) {
          try {
            const fg = await Location.getForegroundPermissionsAsync();
            if (fg && !fg.granted) {
              console.warn('[LocationTrackingService] Permission revoked while backgrounded. Halting tracking.');
              await stopTrackingJob();
              setSyncStatus('permission_denied', 'Permission revoked');
            }
          } catch {}
        }
      });
    }
  } catch {}
}

/**
 * Stops the AppState observer.
 */
export function stopTrackingAppStateObserver(): void {
  if (appStateSubscription) {
    try {
      if (typeof appStateSubscription.remove === 'function') {
        appStateSubscription.remove();
      }
    } catch {}
    appStateSubscription = null;
  }
}

// Auto-initialize observers
try {
  initTrackingAuthObserver();
} catch {}

try {
  initTrackingAppStateObserver();
} catch {}

// ============================================================================
// GETTERS & UTILITIES
// ============================================================================

/**
 * Returns whether GPS tracking is currently active.
 */
export function isTrackingActive(): boolean {
  return trackingState.isTracking;
}

/**
 * Returns the currently active tracked job ID, or null if idle.
 */
export function getActiveTrackingJobId(): string | null {
  return trackingState.activeJobId;
}

/**
 * Returns the currently active tenant ID, or null if idle.
 */
export function getActiveTenantId(): string | null {
  return trackingState.activeTenantId;
}

/**
 * Returns the latest recorded GPS location payload.
 */
export function getLastKnownLocation(): DriverLocation | null {
  return trackingState.lastKnownLocation;
}

/**
 * Returns a snapshot of the full tracking status.
 */
export function getTrackingStatus(): TrackingState {
  return { ...trackingState };
}

/**
 * Sets or updates current driver metadata for coordinate tagging.
 */
export function setTrackingDriverInfo(driver: { id?: string; name?: string }): void {
  currentDriverInfo = { ...driver };
}

/**
 * Subscribes a listener to live GPS location updates.
 *
 * @param listener Callback receiving DriverLocation on every update.
 * @returns Unsubscribe cleanup function.
 */
export function addLocationListener(listener: LocationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Resets the in-memory singleton tracking state.
 * Strictly for test environment isolation.
 */
export function _resetTrackingStateForTesting(): void {
  // Release any pending lock waiters so promises do not hang
  while (lifecycleUnlockQueue.length > 0) {
    const waiter = lifecycleUnlockQueue.shift();
    if (waiter) waiter();
  }
  isLifecycleMutating = false;

  // Clean up observers if active
  if (authUnsubscribe) {
    try {
      authUnsubscribe();
    } catch {}
    authUnsubscribe = null;
  }
  currentObservedUid = null;

  if (appStateSubscription) {
    try {
      if (typeof appStateSubscription.remove === 'function') {
        appStateSubscription.remove();
      }
    } catch {}
    appStateSubscription = null;
  }

  trackingState = {
    isTracking: false,
    activeJobId: null,
    activeTenantId: null,
    lastKnownLocation: null,
  };
  currentDriverInfo = {};
  lastTrackingFailureReason = null;
  currentSessionId = null;
  sessionGeneration = 0;
  lastProcessedTimestamp = 0;
  lastParentWriteLocation = null;
  lastHistoryWriteLocation = null;
  inFlightWritePromise = null;
  listeners.clear();
  syncStatusListeners.clear();
  currentSyncStatus = {
    status: 'idle',
    lastSyncTime: null,
    lastError: null,
  };
  locationBuffer = [];
  isFlushingBuffer = false;
  activeFlushPromise = null;
  isNetworkExplicitlyOnline = true;
}
