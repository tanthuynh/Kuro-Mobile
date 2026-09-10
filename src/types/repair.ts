/**
 * src/types/repair.ts
 * Authoritative TypeScript definitions for Kuro Mobile Repair & Fault Logging domain.
 * Strictly compatible with kuro-web schema and Firestore tickets collection.
 */

import type { User } from './auth';
import type { Equipment } from './equipment';

/**
 * Canonical repair ticket lifecycle statuses.
 * Mirrors kuro-web/src/app/repair/definitions.ts Status type.
 */
export type RepairStatus =
  | 'Reported'
  | 'Pending'
  | 'Under Repair'
  | 'Completed'
  | 'Cancel';

/**
 * Canonical ticket priority levels.
 * Mirrors kuro-web/src/app/repair/definitions.ts Priority type.
 */
export type RepairPriority =
  | 'None'
  | 'Low'
  | 'Medium'
  | 'High'
  | 'Deferred'
  | 'Critical';

/**
 * Canonical billing statuses for repairs.
 * Mirrors kuro-web/src/app/repair/definitions.ts BillingStatus type.
 */
export type RepairBillingStatus =
  | 'Internal'
  | 'Quoted'
  | 'Inquiry'
  | 'Confirmed'
  | 'Invoiced'
  | 'None';

/**
 * Operational condition of the equipment asset.
 * Synchronized with equipment availability in inventory & dispatch.
 */
export type EquipmentCondition = 'Available to Use' | 'Out of Service';

/**
 * Origin source of the repair ticket.
 */
export type RepairSource = 'Internal' | 'External';

/**
 * User representation for repair tickets and action logs.
 */
export interface RepairUser {
  id?: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Media attachment on a repair ticket (damage evidence photos, spec PDFs, URLs, documents).
 * Mirrors kuro-web attachmentSchema.
 */
export interface RepairAttachment {
  id: string;
  type: 'Photo' | 'PDF' | 'URL' | 'Document' | string;
  url: string;
  fileName?: string;
  notes?: string;
  fileSize?: number;
  uploadedAt?: string; // ISO 8601 string
}

/**
 * Append-only immutable action log entry for audit trail.
 * Mirrors kuro-web/src/lib/definitions.ts ActionLog.
 */
export interface RepairActionLog {
  id: string;
  user: Partial<User> & {
    id?: string;
    name: string;
    email?: string;
    avatarUrl?: string;
    firstName?: string;
    lastName?: string;
  };
  action: string;
  timestamp: string; // ISO 8601 UTC string
  tenantId?: string;
}

/**
 * Technician notes appended to a repair ticket.
 * Mirrors kuro-web noteSchema.
 */
export interface RepairNote {
  id: string;
  content: string;
  user?: Partial<User> & {
    id?: string;
    name: string;
    email?: string;
    avatarUrl?: string;
  };
  timestamp: string; // ISO 8601 UTC string
}

/**
 * Replacement part logged against a repair.
 * Mirrors kuro-web partSchema.
 */
export interface RepairPart {
  id: string;
  name: string;
  quantity: number;
  cost: number;
  supplier?: string;
  notes?: string;
}

/**
 * Minimal embedded equipment representation in a repair ticket.
 * Captures point-in-time equipment snapshot.
 */
export interface RepairEquipmentRef {
  id?: string | null;
  name: string;
  serialNumber?: string | null;
  category?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
  assetNumber?: string | null;
  segAssetNumber?: string | null;
  knownLocation?: string | null;
  venue?: string | null;
  quantity?: number | null;
  itemUsable?: 'Yes' | 'No' | null;
}

/**
 * Root Firestore document representation in `tickets/{ticketId}` collection.
 * Completely mirrors kuro-web RepairTicket definition.
 */
export interface RepairTicket {
  id: string;
  tenantId: string;
  repairNumber?: number | null;
  rentmanId?: string | null;
  equipment: RepairEquipmentRef;
  repairType?: string;
  priority: RepairPriority;
  status: RepairStatus;
  billingStatus?: RepairBillingStatus;
  assignee?: (Partial<User> & {
    id?: string;
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    avatarUrl?: string;
  }) | null;
  assigneeId?: string | null;
  requestedBy: string;
  supplierId?: string | null;
  owner?: string | null;
  repairPeriodStart?: string | null; // Normalized ISO 8601 string
  repairPeriodEnd?: string | null;   // Normalized ISO 8601 string
  notes?: RepairNote[];
  internalNotes?: string;
  attachments?: RepairAttachment[];
  partsUsed?: RepairPart[];
  actions?: RepairActionLog[];
  internalReference?: string | null;
  costs?: number | null;
  source?: RepairSource;
  archived?: boolean;
  condition?: EquipmentCondition | null;
  logisticsNotes?: { id: string; notes: string }[];
  logisticsOrder?: string[];
  createdAt?: string | any; // Normalized ISO 8601 string or Timestamp
  updatedAt?: string | any; // Normalized ISO 8601 string or Timestamp
}

/**
 * Input payload for creating a new repair ticket from mobile form / scanner.
 */
export interface CreateRepairTicketInput {
  id?: string;
  tenantId?: string;
  equipment: {
    id?: string | null;
    name: string;
    serialNumber?: string | null;
    category?: string | null;
    categoryId?: string | null;
    barcode?: string | null;
    assetNumber?: string | null;
    segAssetNumber?: string | null;
    knownLocation?: string | null;
    venue?: string | null;
    quantity?: number | null;
    itemUsable?: 'Yes' | 'No' | null;
  };
  repairType?: string;
  priority?: RepairPriority;
  status?: RepairStatus;
  billingStatus?: RepairBillingStatus;
  condition?: EquipmentCondition;
  assigneeId?: string | null;
  assignee?: (Partial<User> & {
    id?: string;
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    avatarUrl?: string;
  }) | null;
  requestedBy?: string;
  supplierId?: string | null;
  owner?: string | null;
  repairPeriodStart?: string | Date | null;
  repairPeriodEnd?: string | Date | null;
  initialNote?: string;
  notes?: RepairNote[];
  internalNotes?: string;
  attachments?: RepairAttachment[];
  partsUsed?: RepairPart[];
  actions?: RepairActionLog[];
  internalReference?: string | null;
  costs?: number;
  source?: RepairSource;
  repairNumber?: number | null;
}

/**
 * Input payload for updating an existing repair ticket.
 */
export interface UpdateRepairTicketInput {
  id: string;
  tenantId: string;
  equipment?: Partial<RepairEquipmentRef>;
  repairType?: string;
  priority?: RepairPriority;
  status?: RepairStatus;
  billingStatus?: RepairBillingStatus;
  condition?: EquipmentCondition;
  assigneeId?: string | null;
  assignee?: (Partial<User> & {
    id?: string;
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    avatarUrl?: string;
  }) | null;
  requestedBy?: string;
  supplierId?: string | null;
  owner?: string | null;
  repairPeriodStart?: string | Date | null;
  repairPeriodEnd?: string | Date | null;
  internalNotes?: string;
  internalReference?: string | null;
  costs?: number;
  archived?: boolean;
  attachments?: RepairAttachment[];
  partsUsed?: RepairPart[];
}

/**
 * Filter parameters for repair ticket queries and client-side filtering.
 */
export interface RepairFilterParams {
  status?: RepairStatus | RepairStatus[] | 'all' | string;
  priority?: RepairPriority | RepairPriority[] | 'all' | string;
  condition?: EquipmentCondition | 'all' | string;
  billingStatus?: RepairBillingStatus | 'all' | string;
  assigneeId?: string;
  search?: string;
  includeArchived?: boolean;
  archived?: boolean;
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
}

/**
 * UI Metadata configuration for Status Badges & Pills.
 */
export interface RepairStatusConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'brand' | 'error';
  icon: string;
}

/**
 * UI Metadata configuration for Priority Badges.
 */
export interface RepairPriorityConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  weight: number;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'brand' | 'error';
}

/**
 * Tenant supplier contact representation from Firestore `contacts` collection.
 */
export interface TenantSupplier {
  id: string;
  name: string;
  type?: string;
  email?: string;
  phone?: string;
  website?: string;
  fullAddress?: string;
}

/**
 * Tenant owner contact representation from Firestore `contacts` collection (Clients and Venues).
 */
export interface TenantOwner {
  id: string;
  name: string;
  type?: string;
  email?: string;
  phone?: string;
  website?: string;
  fullAddress?: string;
}

/**
 * Tenant crew member representation from Firestore `users` collection.
 */
export interface TenantCrewMember {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  position?: string;
  avatarUrl?: string;
}

// ============================================================================
// HARDENING & IDEMPOTENT COMMAND TYPES
// ============================================================================

export type RepairCommandAction =
  | 'create_ticket'
  | 'update_status'
  | 'update_fields'
  | 'add_attachment';

export interface PendingRepairOperationRecord {
  operationId: string;
  tenantId: string;
  userId: string;
  ticketId?: string;
  action: RepairCommandAction;
  payload: Record<string, any>;
  timestamp: number;
  state: 'in_flight' | 'outcome_unknown' | 'reconciling';
}

export interface RepairCommandPayload {
  operationId: string;
  tenantId: string;
  action: RepairCommandAction;
  ticketId?: string;
  clientTimestamp?: number;
  ticketData?: any;
  newStatus?: RepairStatus;
  reason?: string;
  updates?: any;
  attachment?: RepairAttachment;
}

export interface RepairCommandResponse {
  success: boolean;
  status?: 'committed' | 'processing' | 'not_found' | 'error';
  operationId?: string;
  ticketId?: string;
  repairNumber?: number;
  ticket?: RepairTicket;
  error?: string;
}

export interface RepairDraft {
  tenantId?: string;
  equipmentName?: string;
  equipmentId?: string;
  serialNumber?: string;
  barcode?: string;
  category?: string;
  location?: string;
  owner?: string;
  supplierId?: string;
  requestedBy?: string;
  priority?: RepairPriority;
  condition?: EquipmentCondition;
  status?: RepairStatus;
  faultDescription?: string;
  internalNotes?: string;
  internalReference?: string;
  repairPeriodStart?: string | null;
  repairPeriodEnd?: string | null;
  stagedPhotos?: Array<{ id: string; url: string; uri?: string; fileName?: string }>;
  lastModified?: number;
  updatedAt?: number;
}
