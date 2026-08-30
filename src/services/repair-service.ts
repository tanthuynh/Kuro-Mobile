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
  CANONICAL_REPAIR_STATUSES,
  calculateEquipmentCondition,
  createActionLogEntry,
  isValidStatusTransition,
  normalizeRepairStatus,
} from '@/lib/repair-engine';
import type {
  RepairTicket,
  RepairStatus,
  EquipmentCondition,
  RepairPriority,
  RepairActionLog,
  RepairNote,
  RepairAttachment,
  RepairPart,
  RepairEquipmentRef,
  CreateRepairTicketInput,
  TenantSupplier,
  TenantCrewMember,
} from '@/types/repair';

// ============================================================================
// 0. FIRESTORE DATA SANITIZATION
// ============================================================================

/**
 * Recursively strips all `undefined` properties from an object or array.
 * Required because Firestore `updateDoc` and `arrayUnion` throw if any field is `undefined`.
 */
export function removeUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as any;

  // Preserve Firestore FieldValues (arrayUnion, serverTimestamp, deleteField, etc.)
  if (
    typeof obj === 'object' &&
    (
      (obj as any)._methodName ||
      (obj as any).constructor?.name === 'FieldValue' ||
      (obj as any).constructor?.name === 'FieldValueImpl' ||
      (obj as any).isEqual ||
      obj instanceof Date ||
      typeof (obj as any).toMillis === 'function'
    )
  ) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields) as any;
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        cleaned[k] = removeUndefinedFields(v);
      }
    }
    return cleaned as any;
  }

  return obj;
}

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

  const rawStatus = data.status || 'Reported';
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

  const status: RepairStatus = normalizeRepairStatus(ticketData.status || 'Reported');
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

    if (!snap || typeof snap.exists !== 'function' || !snap.exists() || snap.data()?.tenantId !== tenantId) {
      return { success: false, error: 'Repair ticket not found or unauthorized' };
    }

    const currentData = snap.data() || {};
    if (!newStatus || !CANONICAL_REPAIR_STATUSES.some((s) => s.toLowerCase() === String(newStatus).trim().toLowerCase())) {
      return { success: false, error: 'Invalid status transition' };
    }
    const oldStatus: RepairStatus = normalizeRepairStatus(currentData.status || 'Reported');
    const normNewStatus: RepairStatus = normalizeRepairStatus(newStatus);

    const actionText = reason && reason.trim()
      ? `Changed status from "${oldStatus}" to "${normNewStatus}" (${reason.trim()})`
      : `Changed status from "${oldStatus}" to "${normNewStatus}"`;

    const actionEntry = JSON.parse(JSON.stringify(createActionLogEntry(user, actionText, tenantId)));

    const updates: Record<string, any> = {
      status: normNewStatus,
      actions: arrayUnion(actionEntry),
      updatedAt: serverTimestamp(),
    };

    if (updatedCondition !== undefined) {
      updates.condition = updatedCondition;
    }

    // Atomic Firestore update
    await updateDoc(ticketRef, updates);

    const effectiveCondition: EquipmentCondition =
      updatedCondition !== undefined ? updatedCondition : (currentData.condition || 'Out of Service');

    // Sync /equipment condition
    if (currentData.equipment?.id) {
      try {
        await updateEquipmentRepairCondition(
          currentData.equipment.id,
          tenantId,
          effectiveCondition,
          normNewStatus,
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
        effectiveCondition,
        currentData.equipment?.quantity || 1
      );
    } catch (err) {
      console.warn('[repairService] Non-fatal RTDB sync warning:', err);
    }

    return { success: true };
  } catch (err: any) {
    console.error('[repairService] updateRepairTicketStatus error:', err);
    return { success: false, error: err.message || 'Failed to update status' };
  }
}

/**
 * Input parameters for updating individual repair ticket fields.
 */
export interface UpdateRepairTicketFieldsInput {
  equipment?: Partial<RepairEquipmentRef>;
  equipmentName?: string;
  serialNumber?: string | null;
  internalReference?: string | null;
  supplierId?: string | null;
  owner?: string | null;
  requestedBy?: string | null;
  priority?: RepairPriority;
  condition?: EquipmentCondition;
  repairPeriodStart?: string | null;
  repairPeriodEnd?: string | null;
  status?: RepairStatus;
  [key: string]: any;
}

/**
 * Updates individual repair ticket fields (equipment name, serial, internal reference,
 * priority, condition, repair period, supplier, owner, requester) directly in Firestore,
 * logging action audits and synchronizing equipment/RTDB availability where needed.
 */
export async function updateRepairTicketFields(
  ticketId: string,
  fields: UpdateRepairTicketFieldsInput,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  if (!ticketId || !tenantId) {
    return { success: false, error: 'Ticket ID and Tenant ID are required' };
  }

  try {
    const ticketRef = doc(db, 'tickets', ticketId);
    const snap = await getDoc(ticketRef);

    if (!snap || typeof snap.exists !== 'function' || !snap.exists() || snap.data()?.tenantId !== tenantId) {
      return { success: false, error: 'Repair ticket not found or unauthorized' };
    }

    const currentData = snap.data() || {};
    const updates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    const changes: string[] = [];

    // 1. Equipment changes
    const updatedEquipment = { ...(currentData.equipment || {}) };
    let equipmentChanged = false;

    const targetEquipName = fields.equipmentName !== undefined ? fields.equipmentName : fields.equipment?.name;
    if (targetEquipName !== undefined) {
      if (typeof targetEquipName !== 'string' || !targetEquipName.trim()) {
        return { success: false, error: 'Equipment name cannot be empty' };
      }
      const trimmedEquip = targetEquipName.trim();
      if (trimmedEquip !== currentData.equipment?.name) {
        updatedEquipment.name = trimmedEquip;
        equipmentChanged = true;
        changes.push(`equipment name to "${updatedEquipment.name}"`);
      }
    }

    const targetSerial = fields.serialNumber !== undefined ? fields.serialNumber : fields.equipment?.serialNumber;
    if (targetSerial !== undefined) {
      const normalizedSerial = targetSerial !== null && targetSerial !== undefined ? String(targetSerial).trim() || null : null;
      const currentSerial = currentData.equipment?.serialNumber ? String(currentData.equipment.serialNumber).trim() : null;
      if (normalizedSerial !== currentSerial) {
        updatedEquipment.serialNumber = normalizedSerial;
        equipmentChanged = true;
        changes.push(`serial number to "${updatedEquipment.serialNumber || '—'}"`);
      }
    }

    if (fields.equipment) {
      for (const [k, v] of Object.entries(fields.equipment)) {
        if (k !== 'name' && k !== 'serialNumber' && v !== undefined && v !== currentData.equipment?.[k]) {
          updatedEquipment[k] = v;
          equipmentChanged = true;
        }
      }
    }

    if (equipmentChanged) {
      updates.equipment = updatedEquipment;
    }

    // 2. Internal Reference
    if (fields.internalReference !== undefined) {
      const normalizedRef = fields.internalReference !== null && fields.internalReference !== undefined ? String(fields.internalReference).trim() || null : null;
      const currentRef = currentData.internalReference ? String(currentData.internalReference).trim() : null;
      if (normalizedRef !== currentRef) {
        updates.internalReference = normalizedRef;
        changes.push(`internal reference to "${updates.internalReference || '—'}"`);
      }
    }

    // 2b. Supplier
    if (fields.supplierId !== undefined) {
      const normalizedSupplier = fields.supplierId !== null && fields.supplierId !== undefined ? String(fields.supplierId).trim() || null : null;
      const currentSupplier = currentData.supplierId ? String(currentData.supplierId).trim() : null;
      if (normalizedSupplier !== currentSupplier) {
        updates.supplierId = normalizedSupplier;
        changes.push(`supplier to "${updates.supplierId || '—'}"`);
      }
    }

    // 2c. Owner
    if (fields.owner !== undefined) {
      const normalizedOwner = fields.owner !== null && fields.owner !== undefined ? String(fields.owner).trim() || null : null;
      const currentOwner = currentData.owner ? String(currentData.owner).trim() : null;
      if (normalizedOwner !== currentOwner) {
        updates.owner = normalizedOwner;
        changes.push(`owner to "${updates.owner || '—'}"`);
      }
    }

    // 2d. Requested By
    if (fields.requestedBy !== undefined) {
      const normalizedReq = fields.requestedBy !== null && fields.requestedBy !== undefined ? String(fields.requestedBy).trim() || null : null;
      const currentReq = currentData.requestedBy ? String(currentData.requestedBy).trim() : null;
      if (normalizedReq !== currentReq) {
        updates.requestedBy = normalizedReq || 'Warehouse Tech';
        changes.push(`requested by to "${updates.requestedBy}"`);
      }
    }

    // 3. Priority
    const VALID_PRIORITIES: RepairPriority[] = ['None', 'Low', 'Medium', 'High', 'Deferred', 'Critical'];
    if (fields.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(fields.priority as any)) {
        return { success: false, error: `Invalid priority level "${fields.priority}"` };
      }
      if (fields.priority !== currentData.priority) {
        updates.priority = fields.priority;
        changes.push(`priority to "${fields.priority}"`);
      }
    }

    // 4. Condition
    const VALID_CONDITIONS: EquipmentCondition[] = ['Available to Use', 'Out of Service'];
    if (fields.condition !== undefined) {
      if (!VALID_CONDITIONS.includes(fields.condition as any)) {
        return { success: false, error: `Invalid condition "${fields.condition}"` };
      }
      if (fields.condition !== currentData.condition) {
        updates.condition = fields.condition;
        changes.push(`condition to "${fields.condition}"`);
      }
    }

    // 5. Repair Period
    let normalizedStart: string | null | undefined = undefined;
    if (fields.repairPeriodStart !== undefined) {
      if (fields.repairPeriodStart !== null && String(fields.repairPeriodStart).trim() !== '') {
        const parsedStart = parseFirestoreDate(fields.repairPeriodStart);
        if (!parsedStart) {
          return { success: false, error: 'Invalid repair period start date' };
        }
        normalizedStart = parsedStart.toISOString();
      } else {
        normalizedStart = null;
      }
      const currentStart = currentData.repairPeriodStart ? parseFirestoreDate(currentData.repairPeriodStart)?.toISOString() || null : null;
      if (normalizedStart !== currentStart) {
        updates.repairPeriodStart = normalizedStart;
        changes.push('repair period start');
      }
    }

    let normalizedEnd: string | null | undefined = undefined;
    if (fields.repairPeriodEnd !== undefined) {
      if (fields.repairPeriodEnd !== null && String(fields.repairPeriodEnd).trim() !== '') {
        const parsedEnd = parseFirestoreDate(fields.repairPeriodEnd);
        if (!parsedEnd) {
          return { success: false, error: 'Invalid repair period end date' };
        }
        normalizedEnd = parsedEnd.toISOString();
      } else {
        normalizedEnd = null;
      }
      const currentEnd = currentData.repairPeriodEnd ? parseFirestoreDate(currentData.repairPeriodEnd)?.toISOString() || null : null;
      if (normalizedEnd !== currentEnd) {
        updates.repairPeriodEnd = normalizedEnd;
        changes.push('repair period end');
      }
    }

    // Validate that repairPeriodEnd >= repairPeriodStart if both exist
    const effectiveStartIso = updates.repairPeriodStart !== undefined ? updates.repairPeriodStart : currentData.repairPeriodStart;
    const effectiveEndIso = updates.repairPeriodEnd !== undefined ? updates.repairPeriodEnd : currentData.repairPeriodEnd;
    const effectiveStartDate = parseFirestoreDate(effectiveStartIso);
    const effectiveEndDate = parseFirestoreDate(effectiveEndIso);
    if (effectiveStartDate && effectiveEndDate && effectiveEndDate.getTime() < effectiveStartDate.getTime()) {
      return { success: false, error: 'Repair period end date must be on or after start date' };
    }

    // 6. Status
    if (fields.status !== undefined) {
      if (!CANONICAL_REPAIR_STATUSES.includes(fields.status as any)) {
        return { success: false, error: 'Invalid status transition' };
      }
      const normStatus = normalizeRepairStatus(fields.status);
      if (normStatus !== currentData.status) {
        updates.status = normStatus;
        changes.push(`status to "${normStatus}"`);
      }
    }

    // Audit log if any changes detected
    if (changes.length > 0) {
      const actionText = `Updated ${changes.join(', ')}`;
      const actionEntry = JSON.parse(JSON.stringify(createActionLogEntry(user, actionText, tenantId)));
      updates.actions = arrayUnion(actionEntry);
    }

    const sanitizedUpdates = removeUndefinedFields(updates);
    await updateDoc(ticketRef, sanitizedUpdates);

    // Sync /equipment condition & RTDB availability ledger if condition, status, or serial changed
    if (
      updates.condition ||
      updates.status ||
      (equipmentChanged && updatedEquipment.serialNumber !== currentData.equipment?.serialNumber)
    ) {
      const finalCondition: EquipmentCondition =
        updates.condition || currentData.condition || 'Out of Service';
      const finalStatus: RepairStatus = updates.status || currentData.status;
      const equipId = updatedEquipment.id || currentData.equipment?.id;
      const serialNo =
        updatedEquipment.serialNumber !== undefined
          ? updatedEquipment.serialNumber
          : currentData.equipment?.serialNumber;

      if (equipId) {
        try {
          await updateEquipmentRepairCondition(
            equipId,
            tenantId,
            finalCondition,
            finalStatus,
            serialNo
          );
        } catch (err) {
          console.warn('[repairService] Equipment condition sync warning in updateRepairTicketFields:', err);
        }
      }

      try {
        await syncRepairToRtdbLedger(
          tenantId,
          ticketId,
          equipId,
          finalCondition,
          updatedEquipment.quantity || currentData.equipment?.quantity || 1
        );
      } catch (err) {
        console.warn('[repairService] RTDB ledger sync warning in updateRepairTicketFields:', err);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[repairService] updateRepairTicketFields error:', err);
    return { success: false, error: err.message || 'Failed to update ticket fields' };
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

  const actionEntry = JSON.parse(JSON.stringify(createActionLogEntry(user, actionText.trim(), tenantId)));

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

  const noteEntry: RepairNote = removeUndefinedFields({
    id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    content: content.trim(),
    user: {
      id: userId,
      name: userName,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    timestamp: new Date().toISOString(),
  });

  const actionSnippet =
    content.trim().length > 60 ? `${content.trim().substring(0, 57)}...` : content.trim();

  const actionEntry = removeUndefinedFields(createActionLogEntry(user, `Added note: "${actionSnippet}"`, tenantId));

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

  const sanitizedAttachment = removeUndefinedFields(attachment);
  const actionEntry = removeUndefinedFields(
    createActionLogEntry(
      user,
      `Attached ${attachment.type.toLowerCase()}: ${attachment.fileName || 'Damage photo'}`,
      tenantId
    )
  );

  await updateDoc(ticketRef, {
    attachments: arrayUnion(sanitizedAttachment),
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
    const fullAttachment: RepairAttachment = removeUndefinedFields({
      id: attachmentId,
      ...attachment,
      uploadedAt: attachment.uploadedAt || new Date().toISOString(),
    });

    await appendRepairAttachment(ticketId, fullAttachment, user, tenantId);
    return { success: true, attachmentId };
  } catch (err: any) {
    return { success: false, attachmentId: '', error: err.message };
  }
}

/**
 * Updates an existing technician note in `notes` and logs an audit action.
 */
export async function updateRepairNote(
  ticketId: string,
  noteId: string,
  newContent: string,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string
): Promise<void> {
  if (!ticketId || !tenantId) throw new Error('Ticket ID and Tenant ID are required');
  if (!noteId) throw new Error('Note ID is required');
  if (!newContent || !newContent.trim()) throw new Error('Note content cannot be empty');

  const ticketRef = doc(db, 'tickets', ticketId);
  const snap = await getDoc(ticketRef);

  if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
    throw new Error('Repair ticket not found or unauthorized');
  }

  const currentData = snap.data();
  const currentNotes: RepairNote[] = Array.isArray(currentData.notes) ? currentData.notes : [];
  const updatedNotes = currentNotes.map((n) => {
    if (n.id === noteId) {
      return removeUndefinedFields({
        ...n,
        content: newContent.trim(),
        user: {
          id: user.uid || user.id || n.user?.id || 'system',
          name: user.name || n.user?.name || 'Technician',
          email: user.email || n.user?.email,
          avatarUrl: user.avatarUrl || n.user?.avatarUrl,
        },
        timestamp: new Date().toISOString(),
      });
    }
    return removeUndefinedFields(n);
  });

  const actionSnippet =
    newContent.trim().length > 60 ? `${newContent.trim().substring(0, 57)}...` : newContent.trim();
  const actionEntry = removeUndefinedFields(createActionLogEntry(user, `Updated note: "${actionSnippet}"`, tenantId));

  await updateDoc(ticketRef, {
    notes: updatedNotes,
    actions: arrayUnion(actionEntry),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes an existing technician note from `notes` and logs an audit action.
 */
export async function deleteRepairNote(
  ticketId: string,
  noteId: string,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string
): Promise<void> {
  if (!ticketId || !tenantId) throw new Error('Ticket ID and Tenant ID are required');
  if (!noteId) throw new Error('Note ID is required');

  const ticketRef = doc(db, 'tickets', ticketId);
  const snap = await getDoc(ticketRef);

  if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
    throw new Error('Repair ticket not found or unauthorized');
  }

  const currentData = snap.data();
  const currentNotes: RepairNote[] = Array.isArray(currentData.notes) ? currentData.notes : [];
  const targetNote = currentNotes.find((n) => n.id === noteId);
  const updatedNotes = currentNotes.filter((n) => n.id !== noteId).map(removeUndefinedFields);

  const actionSnippet = targetNote?.content
    ? (targetNote.content.length > 50 ? `${targetNote.content.substring(0, 47)}...` : targetNote.content)
    : 'technician note';
  const actionEntry = removeUndefinedFields(createActionLogEntry(user, `Deleted note: "${actionSnippet}"`, tenantId));

  await updateDoc(ticketRef, {
    notes: updatedNotes,
    actions: arrayUnion(actionEntry),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes an attachment (photo, PDF, document) from `attachments` and logs an audit action.
 */
export async function deleteRepairAttachment(
  ticketId: string,
  attachmentId: string,
  user: { id?: string; uid?: string; name?: string; email?: string; avatarUrl?: string },
  tenantId: string
): Promise<void> {
  if (!ticketId || !tenantId) throw new Error('Ticket ID and Tenant ID are required');
  if (!attachmentId) throw new Error('Attachment ID is required');

  const ticketRef = doc(db, 'tickets', ticketId);
  const snap = await getDoc(ticketRef);

  if (!snap.exists() || snap.data()?.tenantId !== tenantId) {
    throw new Error('Repair ticket not found or unauthorized');
  }

  const currentData = snap.data();
  const currentAttachments: RepairAttachment[] = Array.isArray(currentData.attachments)
    ? currentData.attachments
    : [];
  const targetAtt = currentAttachments.find((a) => a.id === attachmentId);
  const updatedAttachments = currentAttachments.filter((a) => a.id !== attachmentId).map(removeUndefinedFields);

  const fileName = targetAtt?.fileName || targetAtt?.type || 'attachment';
  const actionEntry = removeUndefinedFields(createActionLogEntry(user, `Deleted attachment: ${fileName}`, tenantId));

  await updateDoc(ticketRef, {
    attachments: updatedAttachments,
    actions: arrayUnion(actionEntry),
    updatedAt: serverTimestamp(),
  });
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

// ============================================================================
// 8. TENANT SUPPLIERS & CREW MEMBERS FETCHERS
// ============================================================================

/**
 * Fetches all supplier contacts belonging to the tenant from Firestore `contacts`.
 */
export async function fetchTenantSuppliers(tenantId: string): Promise<TenantSupplier[]> {
  if (!tenantId || !tenantId.trim()) return [];

  try {
    const q = query(
      collection(db, 'contacts'),
      where('tenantId', '==', tenantId)
    );

    const snapshot = await getDocs(q);
    const suppliers: TenantSupplier[] = [];

    if (snapshot) {
      const docs = typeof (snapshot as any).forEach === 'function'
        ? snapshot
        : Array.isArray(snapshot)
        ? snapshot
        : Array.isArray((snapshot as any).docs)
        ? (snapshot as any).docs
        : [];

      docs.forEach((docSnap: any) => {
        const data = docSnap && typeof docSnap.data === 'function'
          ? docSnap.data()
          : (docSnap as any)?.data || (docSnap as any) || {};
        if (data.tenantId && data.tenantId !== tenantId) return;

        const types: string[] = Array.isArray(data.types)
          ? data.types.map((t: any) => String(t).toLowerCase())
          : data.type
          ? [String(data.type).toLowerCase()]
          : [];

        // Include if explicitly marked as supplier, or if type is supplier/vendor/manufacturer, or if no specific types are set (general contact)
        const isSupplier =
          data.isSupplier === true ||
          types.includes('supplier') ||
          types.includes('vendor') ||
          types.includes('manufacturer') ||
          types.length === 0;

        const name = (data.name || data.company || data.companyName || '').trim();
        if (name && isSupplier) {
          suppliers.push({
            id: docSnap.id || data.id,
            name,
            type: data.type || (types.includes('supplier') ? 'Supplier' : types.includes('vendor') ? 'Vendor' : types.includes('manufacturer') ? 'Manufacturer' : 'Contact'),
            email: data.email || undefined,
            phone: data.phone || undefined,
            website: data.website || undefined,
            fullAddress: data.fullAddress || undefined,
          });
        }
      });
    }

    suppliers.sort((a, b) => a.name.localeCompare(b.name));
    return suppliers;
  } catch (err) {
    console.error('[repairService] fetchTenantSuppliers error:', err);
    return [];
  }
}

/**
 * Fetches all active crew members / users belonging to the tenant from Firestore `users`.
 */
export async function fetchTenantCrewMembers(tenantId: string): Promise<TenantCrewMember[]> {
  if (!tenantId || !tenantId.trim()) return [];

  try {
    const q = query(
      collection(db, 'users'),
      where('tenantId', '==', tenantId)
    );

    const snapshot = await getDocs(q);
    const crew: TenantCrewMember[] = [];

    if (snapshot) {
      const docs = typeof (snapshot as any).forEach === 'function'
        ? snapshot
        : Array.isArray(snapshot)
        ? snapshot
        : Array.isArray((snapshot as any).docs)
        ? (snapshot as any).docs
        : [];

      docs.forEach((docSnap: any) => {
        const data = docSnap && typeof docSnap.data === 'function'
          ? docSnap.data()
          : (docSnap as any)?.data || (docSnap as any) || {};
        if (data.tenantId && data.tenantId !== tenantId) return;
        if (data.disabled === true || data.archived === true || data.isDeleted === true || data.active === false) return;

        const name =
          (data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.displayName || data.email || '').trim();

        if (name) {
          crew.push({
            id: docSnap.id || data.id,
            name,
            firstName: data.firstName || undefined,
            lastName: data.lastName || undefined,
            email: data.email || undefined,
            position: data.position || undefined,
            role: data.role || data.roleName || undefined,
            avatarUrl: data.avatarUrl || undefined,
          });
        }
      });
    }

    crew.sort((a, b) => a.name.localeCompare(b.name));
    return crew;
  } catch (err) {
    console.error('[repairService] fetchTenantCrewMembers error:', err);
    return [];
  }
}

