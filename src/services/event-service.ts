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
  onSnapshot,
  getDocs,
  getDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Event } from '@/types/events';
import { parseFirestoreDate } from '@/lib/date-utils';

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
    eventStatusId: data.eventStatusId || 'Inquiry',
    eventTypeId: data.eventTypeId || '',
    venueId: data.venueId || null,
    departmentId: data.departmentId,
    assigneeId: data.assigneeId || '',
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
 */
export function subscribeTenantEvents(
  tenantId: string,
  onData: (events: Event[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!tenantId) {
    onData([]);
    return () => {};
  }

  try {
    const q = query(
      collection(db, 'events'),
      where('tenantId', '==', tenantId),
      where('archived', '==', false)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const events: Event[] = [];
        snapshot.forEach((docSnap) => {
          const event = mapFirestoreEventDoc(docSnap);
          if (event.tenantId === tenantId && !event.archived) {
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
 */
export async function fetchTenantEvents(tenantId: string): Promise<Event[]> {
  if (!tenantId) return [];

  const q = query(
    collection(db, 'events'),
    where('tenantId', '==', tenantId),
    where('archived', '==', false)
  );

  const snapshot = await getDocs(q);
  const events: Event[] = [];
  snapshot.forEach((docSnap) => {
    const event = mapFirestoreEventDoc(docSnap);
    if (event.tenantId === tenantId) {
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
