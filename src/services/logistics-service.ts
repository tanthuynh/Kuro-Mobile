/**
 * src/services/logistics-service.ts
 * Real-time Firestore service for Logistics & Driver domain in Kuro Mobile.
 * Provides multi-tenant subscriptions, single-job live streams, status updates,
 * note logging, and GPS location syncing.
 */

import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseFirestoreDate } from '@/lib/date-utils';
import type {
  LogisticsEntry,
  LogisticsDestination,
  DriverLocation,
  LogisticsStatus,
  Vehicle,
} from '@/types/logistics';

// ============================================================================
// 1. DEFENSIVE DOCUMENT MAPPER
// ============================================================================

/**
 * Transforms a raw Firestore document snapshot into a strongly-typed,
 * defensively-parsed LogisticsEntry.
 *
 * @param docSnap Firestore DocumentSnapshot or raw data object.
 * @returns Clean, type-safe LogisticsEntry.
 */
export function mapFirestoreLogisticsDoc(docSnap: any): LogisticsEntry {
  const data = docSnap?.data ? docSnap.data() : (docSnap || {});
  const id = docSnap?.id || data?.id || '';

  // 1. Parse Schedule Dates
  const parsedStart = parseFirestoreDate(data?.start) || new Date();
  const parsedEnd = parseFirestoreDate(data?.end) || new Date();

  // 2. Parse Destinations List
  const rawDestinations = Array.isArray(data?.destinations) ? data.destinations : [];
  const destinations: LogisticsDestination[] = rawDestinations.map((d: any, idx: number) => ({
    id: String(d?.id || `dest-${idx}`),
    type: d?.type === 'note' ? 'note' : 'destination',
    destinationName: String(d?.destinationName || ''),
    address: String(d?.address || ''),
    contact: d?.contact ? String(d.contact) : undefined,
    time: d?.time ? String(d.time) : undefined,
    estTravelTime: d?.estTravelTime ? String(d.estTravelTime) : undefined,
    detailNote: d?.detailNote ? String(d.detailNote) : undefined,
    distance: d?.distance ? String(d.distance) : undefined,
  }));

  // 3. Parse Current GPS Location
  let currentLocation: DriverLocation | null = null;
  if (data?.currentLocation && typeof data.currentLocation === 'object') {
    const rawLoc = data.currentLocation;
    const lat = typeof rawLoc.latitude === 'number' ? rawLoc.latitude : Number(rawLoc.latitude);
    const lng = typeof rawLoc.longitude === 'number' ? rawLoc.longitude : Number(rawLoc.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      currentLocation = {
        latitude: lat,
        longitude: lng,
        heading: typeof rawLoc.heading === 'number' ? rawLoc.heading : null,
        speed: typeof rawLoc.speed === 'number' ? rawLoc.speed : null,
        accuracy: typeof rawLoc.accuracy === 'number' ? rawLoc.accuracy : null,
        altitude: typeof rawLoc.altitude === 'number' ? rawLoc.altitude : null,
        timestamp: typeof rawLoc.timestamp === 'number' ? rawLoc.timestamp : Date.now(),
        driverId: rawLoc.driverId ? String(rawLoc.driverId) : undefined,
        driverName: rawLoc.driverName ? String(rawLoc.driverName) : undefined,
        jobId: rawLoc.jobId ? String(rawLoc.jobId) : id,
      };
    }
  }

  // 4. Parse Timestamps
  const createdAt = parseFirestoreDate(data?.createdAt)?.toISOString() ||
    (typeof data?.createdAt === 'string' ? data.createdAt : new Date().toISOString());
  const updatedAt = parseFirestoreDate(data?.updatedAt)?.toISOString() ||
    (typeof data?.updatedAt === 'string' ? data.updatedAt : new Date().toISOString());
  const lastLocationUpdate = parseFirestoreDate(data?.lastLocationUpdate)?.toISOString() ||
    (typeof data?.lastLocationUpdate === 'number' ? data.lastLocationUpdate : data?.lastLocationUpdate ?? null);

  return {
    id,
    tenantId: String(data?.tenantId || ''),
    vehicleId: data?.vehicleId !== undefined ? data.vehicleId : null,
    vehicleName: data?.vehicleName ? String(data.vehicleName) : undefined,
    driverName: data?.driverName ? String(data.driverName) : undefined,
    assigneeId: data?.assigneeId !== undefined ? data.assigneeId : null,
    eventName: data?.eventName ? String(data.eventName) : '',
    eventNumber: data?.eventNumber !== undefined ? data.eventNumber : null,
    location: String(data?.location || ''),
    notes: data?.notes !== undefined ? String(data.notes) : '',
    start: parsedStart,
    end: parsedEnd,
    createdBy: String(data?.createdBy || ''),
    updatedBy: String(data?.updatedBy || ''),
    createdAt,
    updatedAt,
    status: (data?.status || 'Draft') as LogisticsStatus,
    destinations,
    archived: data?.archived === true,
    currentLocation,
    lastLocationUpdate,
    isTrackingActive: Boolean(data?.isTrackingActive),
    trackingJobId: data?.trackingJobId ? String(data.trackingJobId) : undefined,
  };
}

// ============================================================================
// 2. REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribes to live real-time updates for all non-archived logistics jobs
 * belonging strictly to the specified tenant.
 *
 * @param tenantId Target tenant document ID.
 * @param callback Callback receiving mapped logistics entries on change.
 * @param onError Optional error handler callback.
 * @returns Unsubscribe function to release Firestore listener.
 */
export function subscribeToLogistics(
  tenantId: string,
  callback: (entries: LogisticsEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    callback([]);
    return () => {};
  }

  try {
    const q = query(
      collection(db, 'logistics'),
      where('tenantId', '==', tenantId),
      where('archived', '==', false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const entries: LogisticsEntry[] = [];
        snapshot.forEach((docSnap) => {
          const entry = mapFirestoreLogisticsDoc(docSnap);
          // Strict tenant isolation guard
          if (entry.tenantId === tenantId && !entry.archived) {
            entries.push(entry);
          }
        });
        callback(entries);
      },
      (err) => {
        console.error('[logisticsService] subscribeToLogistics error:', err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.error('[logisticsService] Failed to establish logistics listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Subscribes to live real-time updates for a single logistics job document.
 *
 * @param entryId Target logistics document ID.
 * @param tenantId Expected tenant ID for authorization check.
 * @param callback Callback receiving mapped entry or null if not found/unauthorized.
 * @param onError Optional error handler callback.
 * @returns Unsubscribe function to release Firestore listener.
 */
export function subscribeSingleLogisticsEntry(
  entryId: string,
  tenantId: string,
  callback: (entry: LogisticsEntry | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!entryId || !tenantId) {
    callback(null);
    return () => {};
  }

  try {
    const docRef = doc(db, 'logistics', entryId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }

        const entry = mapFirestoreLogisticsDoc(snapshot);
        if (entry.tenantId !== tenantId) {
          console.warn('[logisticsService] Tenant mismatch on single logistics entry fetch');
          callback(null);
          return;
        }

        callback(entry);
      },
      (err) => {
        console.error('[logisticsService] subscribeSingleLogisticsEntry error:', err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.error('[logisticsService] Failed to establish single logistics listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

// ============================================================================
// 3. ONE-OFF QUERIES & GETTERS
// ============================================================================

/**
 * Fetches all non-archived logistics jobs for a tenant once.
 *
 * @param tenantId Target tenant document ID.
 * @returns Array of mapped LogisticsEntry objects.
 */
export async function fetchTenantLogistics(tenantId: string): Promise<LogisticsEntry[]> {
  if (!tenantId) return [];

  const q = query(
    collection(db, 'logistics'),
    where('tenantId', '==', tenantId),
    where('archived', '==', false)
  );

  const snapshot = await getDocs(q);
  const entries: LogisticsEntry[] = [];
  snapshot.forEach((docSnap) => {
    const entry = mapFirestoreLogisticsDoc(docSnap);
    if (entry.tenantId === tenantId && !entry.archived) {
      entries.push(entry);
    }
  });

  return entries;
}

/**
 * Fetches a single logistics job document by ID with optional tenant isolation check.
 *
 * @param entryId Target logistics document ID.
 * @param tenantId Optional tenant ID to enforce isolation.
 * @returns Mapped LogisticsEntry or null if not found/unauthorized.
 */
export async function getLogisticsEntry(
  entryId: string,
  tenantId?: string
): Promise<LogisticsEntry | null> {
  if (!entryId) return null;

  const docRef = doc(db, 'logistics', entryId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  const entry = mapFirestoreLogisticsDoc(snapshot);
  if (tenantId && entry.tenantId !== tenantId) {
    console.warn('[logisticsService] Tenant mismatch on getLogisticsEntry');
    return null;
  }

  return entry;
}

/**
 * Fetches a single vehicle document by ID with optional tenant isolation check.
 *
 * @param vehicleId Target vehicle document ID.
 * @param tenantId Optional tenant ID to enforce isolation.
 * @returns Mapped Vehicle or null if not found/unauthorized.
 */
export async function fetchVehicleById(
  vehicleId: string,
  tenantId?: string
): Promise<Vehicle | null> {
  if (!vehicleId || !vehicleId.trim()) return null;

  try {
    const docRef = doc(db, 'vehicles', vehicleId.trim());
    const snap = await getDoc(docRef);

    if (!snap || typeof snap.exists !== 'function' || !snap.exists()) {
      return null;
    }

    const data = snap.data();
    if (tenantId && data?.tenantId && data.tenantId !== tenantId) {
      console.warn('[logisticsService] Tenant mismatch on fetchVehicleById');
      return null;
    }

    return {
      id: snap.id,
      name: String(data?.name || ''),
      rego: String(data?.rego || ''),
      color: data?.color ? String(data.color) : undefined,
      size: data?.size ? String(data.size) : undefined,
      make: data?.make ? String(data.make) : undefined,
      model: data?.model ? String(data.model) : undefined,
      notes: data?.notes ? String(data.notes) : undefined,
      tenantId: data?.tenantId ? String(data.tenantId) : undefined,
      order: typeof data?.order === 'number' ? data.order : undefined,
    } as Vehicle;
  } catch (err) {
    console.warn('[logisticsService] fetchVehicleById error:', err);
    return null;
  }
}

/**
 * Formats a user-friendly vehicle display string (e.g. "Van 04 (NSW-KURO1)", "Van 04", or "NSW-KURO1").
 *
 * @param vehicle Vehicle document or partial vehicle object.
 * @param fallback Optional fallback string (typically vehicleId) if vehicle is null.
 * @returns Formatted human-readable vehicle name string.
 */
export function formatVehicleDisplayName(
  vehicle?: Partial<Vehicle> | null,
  fallback?: string | null
): string {
  if (!vehicle) return fallback || '';
  if (vehicle.name) {
    return vehicle.rego && !vehicle.name.includes(vehicle.rego)
      ? `${vehicle.name} (${vehicle.rego})`
      : vehicle.name;
  }
  if (vehicle.rego) {
    return vehicle.rego;
  }
  return fallback || vehicle.id || '';
}

// ============================================================================
// 4. MUTATIONS & ACTIONS
// ============================================================================

/**
 * Updates the lifecycle status of a logistics job.
 * Optionally logs an accompanying note and attribution.
 *
 * @param entryId Target logistics document ID.
 * @param status New status string (e.g. 'In Transit', 'Completed').
 * @param options Optional note, author identifier, and tenant isolation ID.
 */
export async function updateLogisticsStatus(
  entryId: string,
  status: string,
  options?: { note?: string; updatedBy?: string; tenantId?: string }
): Promise<void> {
  if (!entryId || !entryId.trim()) {
    throw new Error('Logistics entry ID is required for status update');
  }
  if (!status || !status.trim()) {
    throw new Error('Status string is required for status update');
  }

  const docRef = doc(db, 'logistics', entryId);

  // If tenantId is specified, verify ownership before update
  if (options?.tenantId) {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Logistics entry ${entryId} not found`);
    }
    const data = snap.data();
    if (data?.tenantId && data.tenantId !== options.tenantId) {
      throw new Error('Unauthorized: Tenant isolation mismatch');
    }
  }

  const updatePayload: Record<string, any> = {
    status: status.trim(),
    updatedAt: serverTimestamp(),
  };

  if (options?.updatedBy) {
    updatePayload.updatedBy = options.updatedBy.trim();
  }

  // If status is transitioning to Completed, automatically deactivate tracking flag
  const isCompleted = ['completed', 'delivered', 'returned', 'closed'].includes(status.trim().toLowerCase());
  if (isCompleted) {
    updatePayload.isTrackingActive = false;
  }

  // If an accompanying note was provided, read existing notes and append
  if (options?.note && options.note.trim()) {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const currentNotes = String(snap.data()?.notes || '');
      const authorStr = options.updatedBy ? `[${options.updatedBy}]` : '';
      const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
      const noteLine = `${dateStr} ${authorStr} (Status -> ${status}): ${options.note.trim()}`;
      updatePayload.notes = currentNotes ? `${currentNotes}\n${noteLine}` : noteLine;
    }
  }

  await updateDoc(docRef, updatePayload);
}

/**
 * Appends a timestamped internal note to a logistics job.
 *
 * @param entryId Target logistics document ID.
 * @param note Text content of the note.
 * @param author Optional name or email of the author.
 * @param tenantId Optional tenant ID to enforce isolation.
 */
export async function appendLogisticsNote(
  entryId: string,
  note: string,
  author?: string,
  tenantId?: string
): Promise<void> {
  if (!entryId || !entryId.trim()) {
    throw new Error('Logistics entry ID is required to append note');
  }
  if (!note || !note.trim()) {
    return;
  }

  const docRef = doc(db, 'logistics', entryId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Logistics entry ${entryId} not found`);
  }

  const data = snap.data();
  if (tenantId && data?.tenantId && data.tenantId !== tenantId) {
    throw new Error('Unauthorized: Tenant isolation mismatch');
  }

  const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const authorStr = author ? `[${author}]` : '';
  const noteLine = `${dateStr} ${authorStr}: ${note.trim()}`;

  const currentNotes = String(data?.notes || '');
  const updatedNotes = currentNotes ? `${currentNotes}\n${noteLine}` : noteLine;

  await updateDoc(docRef, {
    notes: updatedNotes,
    updatedAt: serverTimestamp(),
    ...(author ? { updatedBy: author } : {}),
  });
}

export interface UpdateJobLocationOptions {
  skipHistory?: boolean;
  isTrackingActive?: boolean;
}

/**
 * Syncs the driver's real-time GPS coordinates and tracking state to Firestore.
 *
 * @param entryId Target logistics document ID.
 * @param location Latest DriverLocation payload.
 * @param options Optional flags to control history subcollection writes and tracking flag.
 */
export async function updateJobLocation(
  entryId: string,
  location: DriverLocation,
  options?: UpdateJobLocationOptions
): Promise<void> {
  if (!entryId || !entryId.trim()) {
    throw new Error('Logistics entry ID is required to update location');
  }
  if (
    !location ||
    typeof location.latitude !== 'number' ||
    isNaN(location.latitude) ||
    typeof location.longitude !== 'number' ||
    isNaN(location.longitude)
  ) {
    throw new Error('Valid latitude and longitude coordinates are required');
  }

  const docRef = doc(db, 'logistics', entryId);

  const payloadLocation: Record<string, any> = {
    latitude: location.latitude,
    longitude: location.longitude,
    heading: location.heading ?? null,
    speed: location.speed ?? null,
    accuracy: location.accuracy ?? null,
    altitude: location.altitude ?? null,
    timestamp: location.timestamp || Date.now(),
    jobId: entryId,
  };

  if (location.driverId) payloadLocation.driverId = location.driverId;
  if (location.driverName) payloadLocation.driverName = location.driverName;

  const updatePayload: Record<string, any> = {
    currentLocation: payloadLocation,
    lastLocationUpdate: serverTimestamp(),
    isTrackingActive: options?.isTrackingActive !== undefined ? options.isTrackingActive : true,
    trackingJobId: entryId,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(docRef, updatePayload);

  // Breadcrumb tracking: Add location to history subcollection if not suppressed by movement policy
  if (!options?.skipHistory) {
    try {
      const historyRef = collection(docRef, 'location_history');
      const historyDocRef = doc(historyRef, String(payloadLocation.timestamp));
      await setDoc(historyDocRef, {
        ...payloadLocation,
        savedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to log location history breadcrumb', err);
    }
  }
}

/**
 * Stops background GPS tracking for a logistics job.
 *
 * @param entryId Target logistics document ID.
 */
export async function stopJobTracking(entryId: string): Promise<void> {
  if (!entryId || !entryId.trim()) {
    return;
  }

  const docRef = doc(db, 'logistics', entryId);
  await updateDoc(docRef, {
    isTrackingActive: false,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Creates or overwrites a logistics entry in Firestore.
 * Useful for test fixtures and data initialization.
 *
 * @param tenantId Tenant ID for the entry.
 * @param entry Partial logistics entry data.
 * @returns ID of the saved document.
 */
export async function createLogisticsEntry(
  tenantId: string,
  entry: Partial<LogisticsEntry>
): Promise<string> {
  if (!tenantId) {
    throw new Error('tenantId is required to create a logistics entry');
  }

  const docId =
    entry.id || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const targetDocRef = doc(db, 'logistics', docId);
  const id = docId;

  const payload: Record<string, any> = {
    ...entry,
    id,
    tenantId,
    status: entry.status || 'Scheduled',
    archived: entry.archived ?? false,
    location: entry.location || '',
    eventName: entry.eventName || '',
    start: entry.start || new Date(),
    end: entry.end || new Date(),
    createdAt: entry.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(targetDocRef, payload);
  return id;
}

