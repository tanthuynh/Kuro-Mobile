/**
 * src/services/location-tracking-service.ts
 * Background GPS Tracking Service for Kuro Mobile Logistics.
 *
 * Utilizes Expo Location and TaskManager to record driver GPS coordinates
 * in the foreground and background while a logistics job is active, syncing
 * live coordinates to Firestore `logistics/{jobId}`.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { updateJobLocation, stopJobTracking } from './logistics-service';
import type { DriverLocation } from '@/types/logistics';

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

export const LOCATION_TASK_NAME = 'KURO_MOBILE_LOGISTICS_GPS_TRACKING';

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

export interface TrackingState {
  isTracking: boolean;
  activeJobId: string | null;
  activeTenantId: string | null;
  lastKnownLocation: DriverLocation | null;
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

let currentDriverInfo: { id?: string; name?: string } = {};

type LocationListener = (location: DriverLocation) => void;
const listeners = new Set<LocationListener>();

// ============================================================================
// BACKGROUND TASK DEFINITION
// ============================================================================

/**
 * Handle incoming location updates from Expo Location (foreground or background).
 * Formats coordinates and updates in-memory state, invokes listeners, and writes to Firestore.
 */
export async function handleLocationUpdate(
  locationObj: Location.LocationObject
): Promise<DriverLocation | null> {
  if (!locationObj || !locationObj.coords) {
    return null;
  }

  const { coords, timestamp } = locationObj;

  // Validate coordinates: latitude and longitude must be valid finite numbers within geographic bounds
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

  // Accuracy Filter: Discard any location ping where accuracy > 50 meters or invalid (< 0, non-finite, non-number)
  // to prevent GPS jumps and save DB writes
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

  const formattedLocation: DriverLocation = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitude: coords.altitude ?? null,
    accuracy: coords.accuracy ?? null,
    speed: coords.speed ?? null,
    heading: coords.heading ?? null,
    timestamp: typeof timestamp === 'number' && timestamp > 0 ? timestamp : Date.now(),
    driverId: currentDriverInfo.id,
    driverName: currentDriverInfo.name,
    jobId: trackingState.activeJobId || undefined,
  };

  trackingState.lastKnownLocation = formattedLocation;

  // Notify registered in-memory listeners (for UI, HUDs, etc.)
  listeners.forEach((listener) => {
    try {
      listener(formattedLocation);
    } catch (listenerErr) {
      console.error('[LocationTrackingService] Listener error:', listenerErr);
    }
  });

  // Write to Firestore if an active job is being tracked
  if (trackingState.activeJobId) {
    try {
      await updateJobLocation(trackingState.activeJobId, formattedLocation);
    } catch (syncErr) {
      console.error('[LocationTrackingService] Failed to sync GPS coordinates to Firestore:', syncErr);
    }
  }

  return formattedLocation;
}

// Define the global headless background task required by Expo TaskManager
try {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: { data?: any; error?: any }) => {
    if (error) {
      console.error(`[LocationTrackingService] Background task error on ${LOCATION_TASK_NAME}:`, error);
      return;
    }

    if (data) {
      const { locations } = data as { locations?: Location.LocationObject[] };
      if (Array.isArray(locations) && locations.length > 0) {
        // Iterate backwards from newest location to find and process the latest valid ping in the batch
        for (let i = locations.length - 1; i >= 0; i--) {
          const location = locations[i];
          const result = await handleLocationUpdate(location);
          if (result) {
            // Latest valid location updated; break to avoid redundant batch writes to Firestore
            break;
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
  if (!jobId || !jobId.trim() || !tenantId || !tenantId.trim()) {
    console.warn('[LocationTrackingService] startTrackingJob called without valid jobId or tenantId');
    return false;
  }

  // Idempotency: If already tracking this exact job, return true immediately
  if (trackingState.isTracking && trackingState.activeJobId === jobId) {
    return true;
  }

  // If tracking a different job, cleanly stop the previous job tracking first
  if (trackingState.isTracking && trackingState.activeJobId && trackingState.activeJobId !== jobId) {
    await stopTrackingJob(trackingState.activeJobId);
  }

  // Update driver metadata if provided
  if (options?.driverId || options?.driverName) {
    currentDriverInfo = {
      id: options.driverId ?? currentDriverInfo.id,
      name: options.driverName ?? currentDriverInfo.name,
    };
  }

  try {
    // Check/Request permissions
    const perms = await requestLocationPermissions();
    if (!perms.foreground) {
      console.warn('[LocationTrackingService] Foreground location permission denied. Tracking cannot start.');
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

    // Update in-memory state
    trackingState.isTracking = true;
    trackingState.activeJobId = jobId;
    trackingState.activeTenantId = tenantId;

    // Immediately fetch initial position to sync to Firestore without waiting for first interval
    let initialUpdated: DriverLocation | null = null;
    try {
      const initialPos = await Location.getCurrentPositionAsync({
        accuracy: options?.accuracy ?? Location.Accuracy.High,
      });
      if (initialPos) {
        initialUpdated = await handleLocationUpdate(initialPos);
      }
    } catch (posErr) {
      console.warn('[LocationTrackingService] Failed to retrieve initial GPS fix:', posErr);
    }

    // Fallback: try last known position if initial fix was unavailable or discarded due to low accuracy
    if (!initialUpdated) {
      try {
        const lastPos = await Location.getLastKnownPositionAsync();
        if (lastPos) {
          await handleLocationUpdate(lastPos);
        }
      } catch (lastErr) {
        console.warn('[LocationTrackingService] Failed to retrieve last known GPS position:', lastErr);
      }
    }

    return true;
  } catch (err) {
    console.error('[LocationTrackingService] Failed to start tracking job:', err);
    trackingState.isTracking = false;
    trackingState.activeJobId = null;
    trackingState.activeTenantId = null;
    return false;
  }
}

/**
 * Stops background GPS tracking and marks the job's tracking inactive in Firestore.
 * Idempotent: Can be called safely even when tracking is not active.
 *
 * @param jobId Optional job ID. Defaults to the currently active job ID.
 */
export async function stopTrackingJob(jobId?: string): Promise<void> {
  const targetJobId = jobId || trackingState.activeJobId;

  try {
    // Check if background task updates are running
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

  // Deactivate tracking on Firestore job document
  if (targetJobId) {
    try {
      await stopJobTracking(targetJobId);
    } catch (err) {
      console.error(`[LocationTrackingService] Error stopping Firestore tracking for job ${targetJobId}:`, err);
    }
  }

  // Clear in-memory active tracking state
  trackingState.isTracking = false;
  trackingState.activeJobId = null;
  trackingState.activeTenantId = null;
}

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
  trackingState = {
    isTracking: false,
    activeJobId: null,
    activeTenantId: null,
    lastKnownLocation: null,
  };
  currentDriverInfo = {};
  listeners.clear();
}
