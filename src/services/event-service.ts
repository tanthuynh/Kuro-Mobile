/**
 * src/services/event-service.ts
 * Real-time Firestore service for Events in Kuro Mobile.
 * Subscribes to live multi-tenant event streams with full date parsing
 * and memory-leak-safe unmount cleanup.
 */

import {
  collection,
  doc,
  query,
  where,
  limit,
  onSnapshot,
  getDocs,
  getDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Event, EventType } from '@/types/events';
import { parseFirestoreDate } from '@/lib/date-utils';

export const DEFAULT_EVENTS_QUERY_LIMIT = 150;
export const DEFAULT_HISTORICAL_WINDOW_DAYS = 60;

/**
 * Determines whether an event should be retained under the operational rolling window.
 * Excludes historical completed or cancelled events whose finish date is older than the window (default 60 days).
 * Date-less inquiries and active/upcoming events are always retained.
 */
export function isEventWithinOperationalWindow(
  event: Event,
  windowDays: number = DEFAULT_HISTORICAL_WINDOW_DAYS
): boolean {
  if (event.archived) return false;
  const isHistorical = event.eventStatusId === 'Completed' || event.eventStatusId === 'Cancelled';
  if (!isHistorical) return true;

  const eventEnd = event.finishTime || event.eventFinishDate || event.startTime || event.eventStartDate;
  if (!eventEnd) return true;

  const cutoffTime = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  return eventEnd.getTime() >= cutoffTime;
}

/**
 * Maps a raw Firestore document snapshot into a type-safe Event object.
 */
export function mapFirestoreEventDoc(docSnap: any): Event {
  const data = docSnap.data ? docSnap.data() : docSnap;
  return {
    id: docSnap.id || data.id,
    tenantId: data.tenantId,
    eventName: data.eventName || 'Untitled Event',
    eventNumber: data.eventNumber !== undefined ? data.eventNumber : null,
    clientId: data.clientId || '',
    clientName: data.clientName || (typeof data.client === 'string' ? data.client : null) || null,
    eventStatusId: data.eventStatusId || 'Inquiry',
    eventTypeId: data.eventTypeId || '',
    typeName: data.typeName || data.eventTypeName || (typeof data.eventType === 'string' ? data.eventType : null) || null,
    venueId: data.venueId || null,
    venueName: data.venueName || (typeof data.venue === 'string' ? data.venue : null) || null,
    departmentId: data.departmentId,
    assigneeId: data.assigneeId || '',
    assigneeName: data.assigneeName || data.assignee?.name || (typeof data.assignee === 'string' ? data.assignee : null) || null,
    billingStatus: data.billingStatus || null,
    billingTerms: data.billingTerms || null,
    startTime: parseFirestoreDate(data.startTime),
    finishTime: parseFirestoreDate(data.finishTime),
    deliveryTime: parseFirestoreDate(data.deliveryTime),
    setupTime: parseFirestoreDate(data.setupTime),
    rehearsalTime: parseFirestoreDate(data.rehearsalTime),
    eventStartDate: parseFirestoreDate(data.eventStartDate),
    eventFinishDate: parseFirestoreDate(data.eventFinishDate),
    pickupTime: parseFirestoreDate(data.pickupTime),
    packdownTime: parseFirestoreDate(data.packdownTime),
    notes: data.notes,
    archived: data.archived === true,
    equipmentItems: data.equipmentItems || [],
    logisticsOrder: data.logisticsOrder || [],
    logisticsNotes: data.logisticsNotes || {},
    createdAt: parseFirestoreDate(data.createdAt),
    updatedAt: parseFirestoreDate(data.updatedAt),
  };
}

/**
 * Subscribes to live real-time updates for all non-archived events belonging to the tenant.
 * Safely bounds initial document downloads with a configurable limit (default: 150)
 * and excludes historical completed/cancelled events older than the 60-day operational rolling window.
 */
export function subscribeTenantEvents(
  tenantId: string,
  onData: (events: Event[]) => void,
  onError?: (error: Error) => void,
  options?: { limitCount?: number; windowDays?: number }
): Unsubscribe {
  if (!tenantId) {
    onData([]);
    return () => {};
  }

  try {
    const docLimit = options?.limitCount ?? DEFAULT_EVENTS_QUERY_LIMIT;
    const windowDays = options?.windowDays ?? DEFAULT_HISTORICAL_WINDOW_DAYS;
    const q = query(
      collection(db, 'events'),
      where('tenantId', '==', tenantId),
      where('archived', '==', false),
      limit(docLimit)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const events: Event[] = [];
        snapshot.forEach((docSnap) => {
          const event = mapFirestoreEventDoc(docSnap);
          if (event.tenantId === tenantId && isEventWithinOperationalWindow(event, windowDays)) {
            events.push(event);
          }
        });
        onData(events);
      },
      (err) => {
        console.error('[eventService] subscribeTenantEvents error:', err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.error('[eventService] Failed to establish listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Subscribes to live real-time updates for a single event document.
 */
export function subscribeSingleEvent(
  eventId: string,
  tenantId: string,
  onData: (event: Event | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!eventId || !tenantId) {
    onData(null);
    return () => {};
  }

  try {
    const docRef = doc(db, 'events', eventId);

    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onData(null);
          return;
        }

        const event = mapFirestoreEventDoc(snapshot);
        if (event.tenantId !== tenantId) {
          console.warn('[eventService] Tenant mismatch on single event fetch');
          onData(null);
          return;
        }

        onData(event);
      },
      (err) => {
        console.error('[eventService] subscribeSingleEvent error:', err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.error('[eventService] Failed to establish single event listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetches tenant events once without maintaining a listener.
 * Safely bounds document downloads with a configurable limit (default: 150)
 * and excludes historical completed/cancelled events older than the 60-day operational rolling window.
 */
export async function fetchTenantEvents(
  tenantId: string,
  options?: { limitCount?: number; windowDays?: number }
): Promise<Event[]> {
  if (!tenantId) return [];

  const docLimit = options?.limitCount ?? DEFAULT_EVENTS_QUERY_LIMIT;
  const windowDays = options?.windowDays ?? DEFAULT_HISTORICAL_WINDOW_DAYS;
  const q = query(
    collection(db, 'events'),
    where('tenantId', '==', tenantId),
    where('archived', '==', false),
    limit(docLimit)
  );

  const snapshot = await getDocs(q);
  const events: Event[] = [];
  snapshot.forEach((docSnap) => {
    const event = mapFirestoreEventDoc(docSnap);
    if (event.tenantId === tenantId && isEventWithinOperationalWindow(event, windowDays)) {
      events.push(event);
    }
  });

  return events;
}

/**
 * Fetches a single event once without maintaining a listener.
 */
export async function fetchSingleEvent(eventId: string, tenantId: string): Promise<Event | null> {
  if (!eventId || !tenantId) return null;

  const docRef = doc(db, 'events', eventId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  const event = mapFirestoreEventDoc(snapshot);
  if (event.tenantId !== tenantId) return null;

  return event;
}

/**
 * Fetches all event types belonging to the tenant from Firestore `event-types`.
 */
export async function fetchTenantEventTypes(tenantId: string): Promise<EventType[]> {
  if (!tenantId || !tenantId.trim()) return [];

  try {
    const q = query(
      collection(db, 'event-types'),
      where('tenantId', '==', tenantId)
    );

    const snapshot = await getDocs(q);
    const types: EventType[] = [];

    if (snapshot && typeof (snapshot as any).forEach === 'function') {
      snapshot.forEach((docSnap) => {
        const data = docSnap && typeof docSnap.data === 'function' ? docSnap.data() : (docSnap as any)?.data || docSnap || {};
        if (data.tenantId && data.tenantId !== tenantId) return;
        types.push({
          id: docSnap.id || data.id,
          name: data.name || data.title || 'Production',
          colour: data.colour || data.color || '#60A5FA',
          order: data.order ?? 0,
          tenantId: data.tenantId,
          isDefault: data.isDefault === true,
        });
      });
    }

    types.sort((a, b) => (a.order || 0) - (b.order || 0));
    return types;
  } catch (err) {
    console.warn('[eventService] fetchTenantEventTypes error:', err);
    return [];
  }
}
