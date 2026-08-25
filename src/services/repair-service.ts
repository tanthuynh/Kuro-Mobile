/**
 * src/services/repair-service.ts
 * Multi-tenant Cloud Firestore, RTDB availability ledger, and Firebase Storage operations
 * for Kuro Mobile Repair & Fault Logging.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref as rtdbRef, set as rtdbSet } from 'firebase/database';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

import { db, rtdb, storage } from '@/lib/firebase';
import { parseFirestoreDate } from '@/lib/date-utils';
import {
  calculateEquipmentCondition,
  createActionLogEntry,
  isValidStatusTransition,
  normalizeRepairStatus,
} from '@/lib/repair-engine';
import type {
  RepairTicket,
  RepairStatus,
  EquipmentCondition,
  RepairActionLog,
  RepairNote,
  RepairAttachment,
  RepairPart,
  RepairEquipmentRef,
  CreateRepairTicketInput,
} from '@/types/repair';

// ============================================================================
// 1. DEFENSIVE DOCUMENT MAPPER
// ============================================================================

/**
 * Transforms raw Firestore document data into strongly-typed RepairTicket structures,
 * defending against missing, null, or corrupt fields.
 */
export function mapFirestoreRepairTicketDoc(docSnap: any): RepairTicket {
  const data = docSnap?.data ? docSnap.data() : (docSnap || {});
  const id = docSnap?.id || data?.id || '';

  const rawEquipment = data.equipment || {};
  const equipment: RepairEquipmentRef = {
    id: rawEquipment.id || null,
    name: rawEquipment.name || 'Unnamed Equipment',
    serialNumber: rawEquipment.serialNumber || null,
    category: rawEquipment.category || null,
    categoryId: rawEquipment.categoryId || null,
    knownLocation: rawEquipment.knownLocation || null,
    venue: rawEquipment.venue || null,
    itemUsable: rawEquipment.itemUsable || null,
    quantity: typeof rawEquipment.quantity === 'number' ? rawEquipment.quantity : 1,
    barcode: rawEquipment.barcode || null,
    assetNumber: rawEquipment.assetNumber || null,
    segAssetNumber: rawEquipment.segAssetNumber || null,
  };

  const actions: RepairActionLog[] = Array.isArray(data.actions)
    ? data.actions.map((act: any, idx: number) => ({
        id: act?.id || `act-${idx}`,
        user: {
          id: act?.user?.id || act?.user?.uid,
          name: act?.user?.name || 'Technician',
          email: act?.user?.email,
          avatarUrl: act?.user?.avatarUrl,
          firstName: act?.user?.firstName,
          lastName: act?.user?.lastName,
        },
        action: act?.action || 'Updated ticket',
        timestamp: parseFirestoreDate(act?.timestamp)?.toISOString() || new Date().toISOString(),
        tenantId: act?.tenantId || data.tenantId,
      }))
    : [];

  const notes: RepairNote[] = Array.isArray(data.notes)
    ? data.notes.map((n: any, idx: number) => ({
        id: n?.id || `note-${idx}`,
        content: n?.content || '',
        user: {
          id: n?.user?.id || n?.user?.uid,
          name: n?.user?.name || 'Technician',
          email: n?.user?.email,
          avatarUrl: n?.user?.avatarUrl,
        },
        timestamp: parseFirestoreDate(n?.timestamp)?.toISOString() || new Date().toISOString(),
      }))
    : [];

  const attachments: RepairAttachment[] = Array.isArray(data.attachments)
    ? data.attachments.map((att: any, idx: number) => ({
        id: att?.id || `att-${idx}`,
        type: att?.type || 'Photo',
        url: att?.url || '',
        fileName: att?.fileName,
        notes: att?.notes,
        uploadedAt: parseFirestoreDate(att?.uploadedAt)?.toISOString(),
      }))
    : [];

  const partsUsed: RepairPart[] = Array.isArray(data.partsUsed)
    ? data.partsUsed.map((p: any, idx: number) => ({
        id: p?.id || `part-${idx}`,
        name: p?.name || 'Generic Part',
        quantity: typeof p?.quantity === 'number' ? p.quantity : 1,
        cost: typeof p?.cost === 'number' ? p.cost : 0,
        supplier: p?.supplier,
        notes: p?.notes,
      }))
    : [];

  const rawStatus = data.status || 'Under Repair';
  const status: RepairStatus = normalizeRepairStatus(rawStatus);
  const condition: EquipmentCondition =
    data.condition || calculateEquipmentCondition(status);

  return {
    id,
    tenantId: data.tenantId || '',
    repairNumber: typeof data.repairNumber === 'number' ? data.repairNumber : null,
    rentmanId: data.rentmanId || null,
    equipment,
    repairType: data.repairType || 'Standard Repair',
    priority: data.priority || 'Medium',
    status,
    condition,
    billingStatus: data.billingStatus || 'Internal',
    assignee: data.assignee || null,
    assigneeId: data.assigneeId || null,
    requestedBy: data.requestedBy || 'Technician',
    supplierId: data.supplierId || null,
    repairPeriodStart: parseFirestoreDate(data.repairPeriodStart)?.toISOString() || null,
    repairPeriodEnd: parseFirestoreDate(data.repairPeriodEnd)?.toISOString() || null,
    notes,
    internalNotes: data.internalNotes || '',
    attachments,
    partsUsed,
    actions,
    internalReference: data.internalReference || null,
    costs: typeof data.costs === 'number' ? data.costs : 0,
    source: data.source || 'Internal',
    archived: data.archived === true,
    owner: data.owner || null,
    createdAt: parseFirestoreDate(data.createdAt)?.toISOString() || null,
    updatedAt: parseFirestoreDate(data.updatedAt)?.toISOString() || null,
    logisticsNotes: Array.isArray(data.logisticsNotes) ? data.logisticsNotes : [],
    logisticsOrder: Array.isArray(data.logisticsOrder) ? data.logisticsOrder : [],
  };
}

/**
 * Alias for mapFirestoreRepairTicketDoc for backward compatibility.
 */
export const mapFirestoreRepairDoc = mapFirestoreRepairTicketDoc;

// ============================================================================
// 2. REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribes to live real-time updates for all non-archived repair tickets belonging to the tenant.
 */
export function subscribeTenantRepairTickets(
  tenantId: string,
  onUpdate: (tickets: RepairTicket[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!tenantId) {
    onUpdate([]);
    return () => {};
  }

  try {
    const q = query(
      collection(db, 'tickets'),
      where('tenantId', '==', tenantId)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const tickets: RepairTicket[] = [];
        snapshot.forEach((docSnap) => {
          const ticket = mapFirestoreRepairTicketDoc(docSnap);
          if (ticket.tenantId === tenantId && !ticket.archived) {
            tickets.push(ticket);
          }
        });

        // Sort descending by createdAt (or fallback to repairNumber/id)
        tickets.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (timeB !== timeA) return timeB - timeA;
          return (b.repairNumber || 0) - (a.repairNumber || 0);
        });

        onUpdate(tickets);
      },
      (err) => {
        console.error('[repairService] subscribeTenantRepairTickets error:', err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.error('[repairService] Failed to establish repair tickets listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Subscribes to live updates for a single repair ticket by ID with tenant isolation guard.
 */
export function subscribeSingleRepairTicket(
  ticketId: string,
  tenantId: string,
  onUpdate: (ticket: RepairTicket | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!ticketId || !tenantId) {
    onUpdate(null);
    return () => {};
  }

  try {
    const docRef = doc(db, 'tickets', ticketId);

    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onUpdate(null);
          return;
        }

        const data = snapshot.data();
        if (data.tenantId !== tenantId) {
          console.warn('[repairService] Tenant mismatch on single repair ticket subscription');
          onUpdate(null);
          return;
        }

        const ticket = mapFirestoreRepairTicketDoc(snapshot);
        onUpdate(ticket);
      },
      (err) => {
        console.error(`[repairService] Subscription error for ticket ${ticketId}:`, err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.error('[repairService] Failed to establish single ticket listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Alias for subscribeSingleRepairTicket.
 */
export const subscribeRepairTicket = subscribeSingleRepairTicket;

// ============================================================================
// 3. ONE-OFF FETCH OPERATIONS
// ============================================================================

/**
 * Fetches all active tenant tickets once without keeping an open connection.
 */
export async function fetchTenantRepairTickets(tenantId: string): Promise<RepairTicket[]> {
  if (!tenantId) return [];

  const q = query(
    collection(db, 'tickets'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);
  const tickets: RepairTicket[] = [];
  snapshot.forEach((docSnap) => {
    const ticket = mapFirestoreRepairTicketDoc(docSnap);
    if (ticket.tenantId === tenantId && !ticket.archived) {
      tickets.push(ticket);
    }
  });

  tickets.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return (b.repairNumber || 0) - (a.repairNumber || 0);
  });

  return tickets;
}

/**
 * Retrieves a single repair ticket document and validates optional tenant authorization.
 */
export async function getRepairTicket(
  ticketId: string,
  tenantId?: string
): Promise<RepairTicket | null> {
  if (!ticketId) return null;

  try {
    const ticketRef = doc(db, 'tickets', ticketId);
    const snap = await getDoc(ticketRef);

    if (!snap.exists()) return null;

    const data = snap.data();
    if (tenantId && data.tenantId !== tenantId) {
      return null;
    }

    return mapFirestoreRepairTicketDoc(snap);
  } catch (err) {
    console.error(`[repairService] getRepairTicket error for ${ticketId}:`, err);
    return null;
  }
}

// ============================================================================
// 4. SEQUENTIAL NUMBER GENERATION
// ============================================================================

/**
 * Generates next sequential repairNumber for the tenant.
 */
export async function generateRepairNumber(tenantId: string): Promise<number> {
  if (!tenantId) return 1001;

  try {
    const q = query(
      collection(db, 'tickets'),
      where('tenantId', '==', tenantId),
      orderBy('repairNumber', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const topDoc = snapshot.docs[0].data();
      const highestNum = topDoc.repairNumber;
      if (typeof highestNum === 'number' && !isNaN(highestNum)) {
        return highestNum + 1;
      }
    }

    // Fallback: If orderBy index isn't ready, scan recent tickets
    const fallbackQuery = query(
      collection(db, 'tickets'),
      where('tenantId', '==', tenantId),
      limit(50)
    );
    const fallbackSnap = await getDocs(fallbackQuery);
    let maxNum = 1000;
    fallbackSnap.forEach((d) => {
      const num = d.data().repairNumber;
      if (typeof num === 'number' && num > maxNum) {
        maxNum = num;
      }
    });

    return maxNum + 1;
  } catch (err) {
    console.warn('[repairService] generateRepairNumber fallback:', err);
    return 1001;
  }
}

// ============================================================================
// 5. TICKET CREATION & MUTATION
// ============================================================================

/**
 * Creates a new repair ticket in Firestore `tickets`, updates `/equipment` condition,
 * and sets RTDB availability ledger lock.
 */
export async function createRepairTicket(
  tenantId: string,
  ticketData: CreateRepairTicketInput | Omit<RepairTicket, 'id' | 'createdAt' | 'updatedAt'>,
  currentUser?: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string; firstName?: string; lastName?: string }
): Promise<string> {
  if (!tenantId || !tenantId.trim()) {
    throw new Error('Tenant ID is required to create a repair ticket');
  }
  if (!ticketData.equipment?.name || !ticketData.equipment.name.trim()) {
    throw new Error('Equipment name is required');
  }

  const ticketRef = doc(collection(db, 'tickets'));
  const ticketId = ticketRef.id;

  const repairNumber =
    typeof ticketData.repairNumber === 'number'
      ? ticketData.repairNumber
      : await generateRepairNumber(tenantId);

  const status: RepairStatus = normalizeRepairStatus(ticketData.status || 'Under Repair');
  const condition: EquipmentCondition =
    ticketData.condition || calculateEquipmentCondition(status);

  const userName =
    currentUser?.name ||
    `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() ||
    currentUser?.email ||
    ticketData.requestedBy ||
    'Technician';

  const userId = currentUser?.uid || currentUser?.id || 'system';

  const initialAction = createActionLogEntry(
    {
      id: userId,
      name: userName,
      email: currentUser?.email,
      avatarUrl: currentUser?.avatarUrl,
    },
    `Created repair ticket #${repairNumber} for ${ticketData.equipment.name} (Status: ${status}, Condition: ${condition})`,
    tenantId
  );

  const initialNotes: RepairNote[] = Array.isArray(ticketData.notes) ? [...ticketData.notes] : [];
  const anyTicketData = ticketData as any;
  if (anyTicketData.initialNote && anyTicketData.initialNote.trim()) {
    initialNotes.push({
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      content: anyTicketData.initialNote.trim(),
      user: {
        id: userId,
        name: userName,
        email: currentUser?.email,
        avatarUrl: currentUser?.avatarUrl,
      },
      timestamp: new Date().toISOString(),
    });
  }

  const payload: any = {
    id: ticketId,
    tenantId,
    repairNumber,
    rentmanId: anyTicketData.rentmanId || null,
    equipment: ticketData.equipment,
    repairType: ticketData.repairType || 'Standard Repair',
    priority: ticketData.priority || 'Medium',
    status,
    condition,
    billingStatus: ticketData.billingStatus || 'Internal',
    assignee: ticketData.assignee || null,
    assigneeId: ticketData.assigneeId || null,
    requestedBy: ticketData.requestedBy || userName,
    supplierId: ticketData.supplierId || null,
    repairPeriodStart: ticketData.repairPeriodStart ? parseFirestoreDate(ticketData.repairPeriodStart)?.toISOString() : null,
    repairPeriodEnd: ticketData.repairPeriodEnd ? parseFirestoreDate(ticketData.repairPeriodEnd)?.toISOString() : null,
    notes: initialNotes,
    internalNotes: ticketData.internalNotes || '',
    attachments: Array.isArray(ticketData.attachments) ? ticketData.attachments : [],
    partsUsed: Array.isArray(ticketData.partsUsed) ? ticketData.partsUsed : [],
    actions: [initialAction, ...(ticketData.actions || [])],
    internalReference: ticketData.internalReference || '',
    costs: ticketData.costs || 0,
    source: ticketData.source || 'Internal',
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 1. Write Ticket Document to Firestore
  await setDoc(ticketRef, payload);

  // 2. Synchronize Equipment Condition & Serial Status in /equipment
  if (ticketData.equipment?.id) {
    try {
      await updateEquipmentRepairCondition(
        ticketData.equipment.id,
        tenantId,
        condition,
        status,
        ticketData.equipment.serialNumber
      );
    } catch (err) {
      console.warn('[repairService] Non-fatal equipment condition sync error:', err);
    }
  }

  // 3. Synchronize RTDB Availability Ledger Lock
  try {
    await syncRepairToRtdbLedger(
      tenantId,
      ticketId,
      ticketData.equipment?.id,
      condition,
      ticketData.equipment?.quantity || 1
    );
  } catch (err) {
    console.warn('[repairService] Non-fatal RTDB availability sync error:', err);
  }

  return ticketId;
}

/**
 * Updates repair ticket status and triggers synchronized equipment & RTDB updates.
 */
export async function updateRepairTicketStatus(
  ticketId: string,
  newStatus: RepairStatus,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string,
  reason?: string,
  updatedCondition?: EquipmentCondition
): Promise<{ success: boolean; error?: string }> {
  if (!ticketId || !tenantId) {
    return { success: false, error: 'Ticket ID and Tenant ID are required' };
  }

  try {
    const ticketRef = doc(db, 'tickets', ticketId);
    const snap = await getDoc(ticketRef);

    if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
      return { success: false, error: 'Repair ticket not found or unauthorized' };
    }

    const currentData = snap.data();
    const oldStatus: RepairStatus = normalizeRepairStatus(currentData.status || 'Under Repair');

    if (!isValidStatusTransition(oldStatus, newStatus)) {
      return { success: false, error: 'Invalid status transition' };
    }

    const newCondition: EquipmentCondition =
      updatedCondition || calculateEquipmentCondition(newStatus);

    const actionText = reason && reason.trim()
      ? `Changed status from "${oldStatus}" to "${newStatus}" (${reason.trim()})`
      : `Changed status from "${oldStatus}" to "${newStatus}"`;

    const actionEntry = createActionLogEntry(user, actionText, tenantId);

    // Atomic Firestore update
    await updateDoc(ticketRef, {
      status: newStatus,
      condition: newCondition,
      actions: arrayUnion(actionEntry),
      updatedAt: serverTimestamp(),
    });

    // Sync /equipment condition
    if (currentData.equipment?.id) {
      try {
        await updateEquipmentRepairCondition(
          currentData.equipment.id,
          tenantId,
          newCondition,
          newStatus,
          currentData.equipment.serialNumber
        );
      } catch (err) {
        console.warn('[repairService] Equipment status sync warning:', err);
      }
    }

    // Sync RTDB ledger node
    try {
      await syncRepairToRtdbLedger(
        tenantId,
        ticketId,
        currentData.equipment?.id,
        newCondition,
        currentData.equipment?.quantity || 1
      );
    } catch (err) {
      console.warn('[repairService] RTDB ledger sync warning:', err);
    }

    return { success: true };
  } catch (err: any) {
    console.error('[repairService] updateRepairTicketStatus error:', err);
    return { success: false, error: err.message || 'Failed to update status' };
  }
}

/**
 * Appends a custom technician audit log to the ticket.
 */
export async function appendRepairAction(
  ticketId: string,
  actionText: string,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string
): Promise<RepairActionLog> {
  if (!ticketId || !tenantId) throw new Error('Ticket ID and Tenant ID are required');
  if (!actionText || !actionText.trim()) throw new Error('Action text cannot be empty');

  const ticketRef = doc(db, 'tickets', ticketId);
  const snap = await getDoc(ticketRef);

  if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
    throw new Error('Repair ticket not found or unauthorized');
  }

  const actionEntry = createActionLogEntry(user, actionText.trim(), tenantId);

  await updateDoc(ticketRef, {
    actions: arrayUnion(actionEntry),
    updatedAt: serverTimestamp(),
  });

  return actionEntry;
}

/**
 * Appends a technician note to `notes` and simultaneously writes an audit record into `actions`.
 */
export async function appendRepairNote(
  ticketId: string,
  content: string,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string
): Promise<RepairNote> {
  if (!ticketId || !tenantId) throw new Error('Ticket ID and Tenant ID are required');
  if (!content || !content.trim()) throw new Error('Note content cannot be empty');

  const ticketRef = doc(db, 'tickets', ticketId);
  const snap = await getDoc(ticketRef);

  if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
    throw new Error('Repair ticket not found or unauthorized');
  }

  const userId = user.uid || user.id || 'system';
  const userName = user.name || 'Technician';

  const noteEntry: RepairNote = {
    id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    content: content.trim(),
    user: {
      id: userId,
      name: userName,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    timestamp: new Date().toISOString(),
  };

  const actionSnippet =
    content.trim().length > 60 ? `${content.trim().substring(0, 57)}...` : content.trim();

  const actionEntry = createActionLogEntry(user, `Added note: "${actionSnippet}"`, tenantId);

  await updateDoc(ticketRef, {
    notes: arrayUnion(noteEntry),
    actions: arrayUnion(actionEntry),
    updatedAt: serverTimestamp(),
  });

  return noteEntry;
}

/**
 * Attaches a media attachment to `attachments` and logs in `actions`.
 */
export async function appendRepairAttachment(
  ticketId: string,
  attachment: RepairAttachment,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string
): Promise<void> {
  if (!ticketId || !tenantId) throw new Error('Ticket ID and Tenant ID are required');

  const ticketRef = doc(db, 'tickets', ticketId);
  const snap = await getDoc(ticketRef);

  if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
    throw new Error('Repair ticket not found or unauthorized');
  }

  const actionEntry = createActionLogEntry(
    user,
    `Attached ${attachment.type.toLowerCase()}: ${attachment.fileName || 'Damage photo'}`,
    tenantId
  );

  await updateDoc(ticketRef, {
    attachments: arrayUnion(attachment),
    actions: arrayUnion(actionEntry),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Adds an attachment to a repair ticket and returns a result status.
 */
export async function addRepairAttachment(
  ticketId: string,
  attachment: Omit<RepairAttachment, 'id'>,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string
): Promise<{ success: boolean; attachmentId: string; error?: string }> {
  try {
    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullAttachment: RepairAttachment = {
      id: attachmentId,
      ...attachment,
      uploadedAt: attachment.uploadedAt || new Date().toISOString(),
    };

    await appendRepairAttachment(ticketId, fullAttachment, user, tenantId);
    return { success: true, attachmentId };
  } catch (err: any) {
    return { success: false, attachmentId: '', error: err.message };
  }
}

// ============================================================================
// 6. PHOTO STORAGE UPLOADER
// ============================================================================

/**
 * Converts a local image URI to Blob, uploads to Firebase Storage,
 * and returns the download URL and constructed RepairAttachment.
 */
export async function uploadRepairDamagePhoto(
  tenantId: string,
  ticketId: string,
  localUri: string,
  fileName?: string
): Promise<{ url: string; attachment: RepairAttachment }> {
  if (!tenantId || !ticketId || !localUri || !localUri.trim()) {
    throw new Error('Tenant ID, Ticket ID, and local image URI are required for photo upload');
  }

  const cleanUri = localUri.split('?')[0];
  const extMatch = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch ? extMatch[1] : 'jpg').toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const safeFileName =
    fileName ||
    `damage_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

  const storagePath = `tenants/${tenantId}/repairs/${ticketId}/attachments/${safeFileName}`;

  // Fetch local URI into Blob for upload
  const response = await fetch(localUri);
  const blob = await response.blob();

  const fileRef = storageRef(storage, storagePath);
  await uploadBytes(fileRef, blob, {
    contentType: mimeType,
    customMetadata: {
      tenantId,
      ticketId,
      uploadedAt: new Date().toISOString(),
    },
  });

  const downloadUrl = await getDownloadURL(fileRef);

  const attachment: RepairAttachment = {
    id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'Photo',
    url: downloadUrl,
    fileName: safeFileName,
    uploadedAt: new Date().toISOString(),
  };

  return { url: downloadUrl, attachment };
}

// ============================================================================
// 7. RTDB AVAILABILITY LEDGER & EQUIPMENT CONDITION SYNC
// ============================================================================

/**
 * Synchronizes reservation lock in RTDB availability ledger (`availability/{tenantId}/r/{ticketId}`).
 */
export async function syncRepairToRtdbLedger(
  tenantId: string,
  ticketId: string,
  equipmentId?: string | null,
  condition?: EquipmentCondition | null,
  quantity: number = 1
): Promise<void> {
  if (!tenantId || !ticketId) return;

  try {
    const ledgerRef = rtdbRef(rtdb, `availability/${tenantId}/r/${ticketId}`);

    if (!equipmentId || condition !== 'Out of Service') {
      await rtdbSet(ledgerRef, null);
      return;
    }

    const nodePayload = {
      i: {
        [equipmentId]: {
          q: typeof quantity === 'number' && quantity > 0 ? quantity : 1,
        },
      },
    };

    await rtdbSet(ledgerRef, nodePayload);
  } catch (error) {
    console.error('[repairService] Failed to sync repair to RTDB ledger:', error);
  }
}

/**
 * Synchronizes equipment condition and serial number status in Firestore `/equipment/{equipmentId}`.
 */
export async function updateEquipmentRepairCondition(
  equipmentId: string,
  tenantId: string,
  condition: EquipmentCondition,
  status: RepairStatus,
  serialNumber?: string | null
): Promise<void> {
  if (!equipmentId || !tenantId) return;

  try {
    const equipRef = doc(db, 'equipment', equipmentId);
    const snap = await getDoc(equipRef);

    if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
      console.warn('[repairService] Equipment document not found or unauthorized for condition sync');
      return;
    }

    const eqData = snap.data();
    const updates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (Array.isArray(eqData.serialNumbers) && serialNumber) {
      const cleanTargetSerial = serialNumber.trim().toLowerCase();
      const updatedSerials = eqData.serialNumbers.map((sn: any) => {
        if (sn.serial && sn.serial.trim().toLowerCase() === cleanTargetSerial) {
          return {
            ...sn,
            status: condition === 'Out of Service' ? 'In Repair' : 'Available',
          };
        }
        return sn;
      });

      updates.serialNumbers = updatedSerials;
    }

    await updateDoc(equipRef, updates);
  } catch (error) {
    console.error('[repairService] Failed to update equipment repair condition:', error);
  }
}
