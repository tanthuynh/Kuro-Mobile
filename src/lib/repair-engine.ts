/**
 * src/lib/repair-engine.ts
 * Pure functional domain engine for Kuro Mobile Repair & Fault Logging.
 * Implements validation, state machine transitions, equipment condition mapping,
 * filtering predicates, date normalization, and audit log generation.
 */

import type {
  RepairTicket,
  RepairStatus,
  RepairPriority,
  RepairBillingStatus,
  EquipmentCondition,
  RepairActionLog,
  RepairAttachment,
  RepairPart,
  RepairNote,
  CreateRepairTicketInput,
  RepairFilterParams,
  RepairStatusConfig,
  RepairPriorityConfig,
} from '@/types/repair';
import { parseFirestoreDate } from '@/lib/date-utils';

// ============================================================================
// CONSTANTS & CONFIGURATIONS
// ============================================================================

export const CANONICAL_REPAIR_STATUSES: RepairStatus[] = [
  'Under Repair',
  'Awaiting Parts',
  'Operational',
  'Completed',
  'Collected',
  'Returned',
  'Decommissioned',
  'Archived',
];

export const CANONICAL_REPAIR_PRIORITIES: RepairPriority[] = [
  'None',
  'Low',
  'Medium',
  'High',
  'Deferred',
  'Critical',
];

export const PRIORITY_WEIGHTS: Record<RepairPriority, number> = {
  Critical: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Deferred: 1,
  None: 0,
};

export const REPAIR_STATUS_CONFIG: Record<RepairStatus, RepairStatusConfig> = {
  'Under Repair': {
    label: 'Under Repair',
    color: '#F59E0B', // Amber
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    badgeVariant: 'warning',
    icon: 'wrench',
  },
  'Awaiting Parts': {
    label: 'Awaiting Parts',
    color: '#F97316', // Orange
    bgColor: 'rgba(249, 115, 22, 0.15)',
    borderColor: 'rgba(249, 115, 22, 0.35)',
    badgeVariant: 'warning',
    icon: 'package',
  },
  'Operational': {
    label: 'Operational',
    color: '#10B981', // Emerald Green
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    badgeVariant: 'success',
    icon: 'check-circle-2',
  },
  'Completed': {
    label: 'Completed',
    color: '#3B82F6', // Blue
    bgColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
    badgeVariant: 'info',
    icon: 'check',
  },
  'Collected': {
    label: 'Collected',
    color: '#8B5CF6', // Purple
    bgColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: 'rgba(139, 92, 246, 0.35)',
    badgeVariant: 'secondary',
    icon: 'truck',
  },
  'Returned': {
    label: 'Returned',
    color: '#06B6D4', // Cyan
    bgColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.35)',
    badgeVariant: 'info',
    icon: 'corner-down-left',
  },
  'Decommissioned': {
    label: 'Decommissioned',
    color: '#EF4444', // Red
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    badgeVariant: 'destructive',
    icon: 'alert-octagon',
  },
  'Archived': {
    label: 'Archived',
    color: '#64748B', // Slate
    bgColor: 'rgba(100, 116, 139, 0.15)',
    borderColor: 'rgba(100, 116, 139, 0.35)',
    badgeVariant: 'outline',
    icon: 'archive',
  },
};

export const REPAIR_PRIORITY_CONFIG: Record<RepairPriority, RepairPriorityConfig> = {
  Critical: {
    label: 'Critical',
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    weight: 5,
    badgeVariant: 'destructive',
  },
  High: {
    label: 'High',
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.15)',
    borderColor: 'rgba(249, 115, 22, 0.35)',
    weight: 4,
    badgeVariant: 'warning',
  },
  Medium: {
    label: 'Medium',
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    weight: 3,
    badgeVariant: 'warning',
  },
  Low: {
    label: 'Low',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
    weight: 2,
    badgeVariant: 'info',
  },
  Deferred: {
    label: 'Deferred',
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: 'rgba(139, 92, 246, 0.35)',
    weight: 1,
    badgeVariant: 'secondary',
  },
  None: {
    label: 'None',
    color: '#64748B',
    bgColor: 'rgba(100, 116, 139, 0.15)',
    borderColor: 'rgba(100, 116, 139, 0.35)',
    weight: 0,
    badgeVariant: 'outline',
  },
};

// State Machine Permitted Transitions Graph
export const STATUS_TRANSITIONS_GRAPH: Record<RepairStatus, RepairStatus[]> = {
  'Under Repair': [
    'Under Repair',
    'Awaiting Parts',
    'Completed',
    'Operational',
    'Decommissioned',
    'Archived',
  ],
  'Awaiting Parts': [
    'Awaiting Parts',
    'Under Repair',
    'Completed',
    'Operational',
    'Decommissioned',
    'Archived',
  ],
  'Completed': [
    'Completed',
    'Operational',
    'Returned',
    'Under Repair',
    'Archived',
  ],
  'Operational': [
    'Operational',
    'Under Repair',
    'Completed',
    'Returned',
    'Archived',
  ],
  'Collected': [
    'Collected',
    'Under Repair',
    'Awaiting Parts',
    'Operational',
    'Archived',
  ],
  'Returned': [
    'Returned',
    'Operational',
    'Under Repair',
    'Archived',
  ],
  'Decommissioned': [
    'Decommissioned',
    'Under Repair',
    'Archived',
  ],
  'Archived': [
    'Archived',
    'Under Repair',
    'Operational',
  ],
};

// 1-Tap Quick Action Suggestions for Mobile UI
export const QUICK_STATUS_OPTIONS: Record<RepairStatus, RepairStatus[]> = {
  'Under Repair': ['Awaiting Parts', 'Completed', 'Operational'],
  'Awaiting Parts': ['Under Repair', 'Completed', 'Operational'],
  'Completed': ['Operational', 'Returned', 'Under Repair'],
  'Operational': ['Under Repair', 'Completed'],
  'Collected': ['Under Repair', 'Operational'],
  'Returned': ['Operational', 'Under Repair'],
  'Decommissioned': ['Under Repair', 'Archived'],
  'Archived': ['Under Repair', 'Operational'],
};

// ============================================================================
// 1. NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Normalizes any string or legacy input into a canonical RepairStatus.
 */
export function normalizeRepairStatus(status?: string | null): RepairStatus {
  if (!status || typeof status !== 'string') return 'Under Repair';
  const clean = status.trim().toLowerCase();

  switch (clean) {
    case 'under repair':
    case 'under_repair':
    case 'in repair':
    case 'in_repair':
      return 'Under Repair';
    case 'awaiting parts':
    case 'awaiting_parts':
    case 'waiting parts':
      return 'Awaiting Parts';
    case 'operational':
    case 'ready':
      return 'Operational';
    case 'completed':
    case 'repaired':
      return 'Completed';
    case 'collected':
      return 'Collected';
    case 'returned':
      return 'Returned';
    case 'decommissioned':
    case 'scrapped':
      return 'Decommissioned';
    case 'archived':
      return 'Archived';
    default: {
      const match = CANONICAL_REPAIR_STATUSES.find(
        (s) => s.toLowerCase() === clean
      );
      return match || 'Under Repair';
    }
  }
}

/**
 * Normalizes priority strings with safe fallback.
 */
export function normalizeRepairPriority(priority?: string | null): RepairPriority {
  if (!priority || typeof priority !== 'string') return 'Low';
  const clean = priority.trim().toLowerCase();

  switch (clean) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'medium':
    case 'med':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'deferred':
      return 'Deferred';
    case 'none':
      return 'None';
    default: {
      const match = CANONICAL_REPAIR_PRIORITIES.find(
        (p) => p.toLowerCase() === clean
      );
      return match || 'Low';
    }
  }
}

/**
 * Normalizes billing status strings.
 */
export function normalizeRepairBillingStatus(billing?: string | null): RepairBillingStatus {
  if (!billing || typeof billing !== 'string') return 'None';
  const clean = billing.trim().toLowerCase();

  switch (clean) {
    case 'internal':
      return 'Internal';
    case 'quoted':
      return 'Quoted';
    case 'inquiry':
      return 'Inquiry';
    case 'confirmed':
      return 'Confirmed';
    case 'invoiced':
      return 'Invoiced';
    case 'none':
    default:
      return 'None';
  }
}

/**
 * Normalizes equipment condition strings with fail-safe default.
 */
export function normalizeEquipmentCondition(condition?: string | null): EquipmentCondition {
  if (!condition || typeof condition !== 'string') return 'Out of Service';
  const clean = condition.trim().toLowerCase();

  if (clean === 'available to use' || clean === 'available' || clean === 'operational') {
    return 'Available to Use';
  }
  return 'Out of Service';
}

/**
 * Normalizes any date-like input (Firestore Timestamp, ISO string, epoch number) into an ISO string or null.
 */
export function normalizeDateToISO(val: any): string | null {
  const d = parseFirestoreDate(val);
  return d ? d.toISOString() : null;
}

/**
 * Alias for normalizeDateToISO.
 */
export function normalizeDate(val: any): string | null {
  return normalizeDateToISO(val);
}

/**
 * Formats a repair ticket number into display format.
 * e.g. 42 -> "#42" or null -> "—"
 */
export function formatRepairNumber(repairNumber?: number | null, prefix: string = '#'): string {
  if (repairNumber === undefined || repairNumber === null || isNaN(Number(repairNumber))) {
    return '—';
  }
  return `${prefix}${repairNumber}`;
}

// ============================================================================
// 2. EQUIPMENT CONDITION DERIVATION
// ============================================================================

/**
 * Calculates the operational equipment condition derived from the ticket's repair status.
 * Fail-safe principle: unresolved faults default to 'Out of Service'.
 */
export function calculateEquipmentCondition(status?: string | null): EquipmentCondition {
  if (!status || typeof status !== 'string' || !status.trim()) {
    return 'Out of Service';
  }
  const clean = status.trim().toLowerCase();

  if (
    clean === 'operational' ||
    clean === 'completed' ||
    clean === 'returned' ||
    clean === 'ready' ||
    clean === 'repaired'
  ) {
    return 'Available to Use';
  }

  return 'Out of Service';
}

// ============================================================================
// 3. STATE MACHINE & STATUS TRANSITIONS
// ============================================================================

/**
 * Determines whether a status transition from `current` to `next` is permissible.
 */
export function isValidStatusTransition(
  current: string | null | undefined,
  next: string | null | undefined
): boolean {
  if (!current || !next || typeof current !== 'string' || typeof next !== 'string') {
    return false;
  }

  const currTrim = current.trim().toLowerCase();
  const nextTrim = next.trim().toLowerCase();

  const currValid = CANONICAL_REPAIR_STATUSES.some((s) => s.toLowerCase() === currTrim);
  const nextValid = CANONICAL_REPAIR_STATUSES.some((s) => s.toLowerCase() === nextTrim);

  if (!currValid || !nextValid) {
    return false;
  }

  const currNorm = normalizeRepairStatus(current);
  const nextNorm = normalizeRepairStatus(next);

  // Idempotent self-transition is always valid
  if (currNorm === nextNorm) return true;

  const allowedTargets = STATUS_TRANSITIONS_GRAPH[currNorm];
  if (!allowedTargets) return false;

  return allowedTargets.includes(nextNorm);
}

/**
 * Computes the default recommended next status in the repair lifecycle.
 */
export function getNextRepairStatus(current: string | null | undefined, _action?: string): RepairStatus {
  if (!current || typeof current !== 'string' || !CANONICAL_REPAIR_STATUSES.some((s) => s.toLowerCase() === current.trim().toLowerCase())) {
    return 'Under Repair';
  }
  const currNorm = normalizeRepairStatus(current);

  switch (currNorm) {
    case 'Under Repair':
      return 'Completed';
    case 'Awaiting Parts':
      return 'Under Repair';
    case 'Completed':
      return 'Operational';
    case 'Operational':
      return 'Returned';
    case 'Collected':
      return 'Under Repair';
    case 'Returned':
      return 'Archived';
    case 'Decommissioned':
      return 'Archived';
    case 'Archived':
      return 'Archived'; // Idempotent terminal
    default:
      return 'Under Repair';
  }
}

/**
 * Returns the list of all allowed transition statuses from the current status.
 */
export function getAvailableStatusTransitions(current: string | null | undefined): RepairStatus[] {
  const currNorm = normalizeRepairStatus(current);
  return [...(STATUS_TRANSITIONS_GRAPH[currNorm] || [])];
}

/**
 * Returns top 3-4 quick-tap status options for the mobile UI status selector.
 */
export function getQuickStatusOptions(current: string | null | undefined): RepairStatus[] {
  const currNorm = normalizeRepairStatus(current);
  return [...(QUICK_STATUS_OPTIONS[currNorm] || [])];
}

// ============================================================================
// 4. INPUT VALIDATION ENGINE
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  errorMessages: string[];
}

/**
 * Validates a repair ticket input payload before Firestore creation or update.
 * Strictly checks required fields, date constraints, numeric bounds, and tenant isolation.
 */
export function validateRepairTicketInput(
  input: Partial<CreateRepairTicketInput | RepairTicket> | null | undefined
): ValidationResult {
  const errors: Record<string, string[]> = {};

  const addError = (field: string, msg: string) => {
    if (!errors[field]) errors[field] = [];
    errors[field].push(msg);
  };

  if (!input || typeof input !== 'object') {
    addError('payload', 'Input payload is required.');
    addError('equipment.name', 'Equipment name is required.');
    return {
      isValid: false,
      errors,
      errorMessages: Object.values(errors).flat(),
    };
  }

  // 1. Equipment Name
  const equipName = input.equipment?.name;
  if (!equipName || typeof equipName !== 'string' || !equipName.trim()) {
    addError('equipment.name', 'Equipment name is required.');
  }

  // 2. Tenant ID (if provided)
  if (input.tenantId !== undefined && (typeof input.tenantId !== 'string' || !input.tenantId.trim())) {
    addError('tenantId', 'Tenant ID is required for multi-tenant data isolation.');
  }

  // 3. Requested By
  if (input.requestedBy !== undefined && (typeof input.requestedBy !== 'string' || !input.requestedBy.trim())) {
    addError('requestedBy', 'Requested by is required.');
  }

  // 4. Quantity (if specified)
  if (input.equipment?.quantity !== undefined && input.equipment?.quantity !== null) {
    const qty = Number(input.equipment.quantity);
    if (isNaN(qty) || qty < 1) {
      addError('equipment.quantity', 'Quantity must be at least 1.');
    }
  }

  // 5. Costs (if specified)
  if (input.costs !== undefined && input.costs !== null) {
    const cost = Number(input.costs);
    if (isNaN(cost) || cost < 0) {
      addError('costs', 'Cost cannot be negative.');
    }
  }

  // 6. Repair Period Dates
  const startDate = input.repairPeriodStart ? parseFirestoreDate(input.repairPeriodStart) : null;
  const endDate = input.repairPeriodEnd ? parseFirestoreDate(input.repairPeriodEnd) : null;

  if (input.repairPeriodStart && !startDate) {
    addError('repairPeriodStart', 'Repair Start Date is invalid.');
  }
  if (input.repairPeriodEnd && !endDate) {
    addError('repairPeriodEnd', 'Repair End Date is invalid.');
  }
  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    addError('repairPeriodEnd', 'Repair End Date cannot be before Start Date.');
  }

  // 7. Attachments Validation
  if (Array.isArray(input.attachments)) {
    input.attachments.forEach((att, idx) => {
      if (!att || !att.url || typeof att.url !== 'string' || !att.url.trim()) {
        addError(`attachments[${idx}].url`, 'Attachment URL is required.');
      }
      if (att && !['Photo', 'PDF', 'URL'].includes(att.type)) {
        addError(`attachments[${idx}].type`, 'Attachment type must be Photo, PDF, or URL.');
      }
    });
  }

  // 8. Parts Validation
  if (Array.isArray(input.partsUsed)) {
    input.partsUsed.forEach((part, idx) => {
      if (!part || !part.name || typeof part.name !== 'string' || !part.name.trim()) {
        addError(`partsUsed[${idx}].name`, 'Part name is required.');
      }
      if (part && (typeof part.quantity !== 'number' || part.quantity < 1)) {
        addError(`partsUsed[${idx}].quantity`, 'Part quantity must be at least 1.');
      }
      if (part && (typeof part.cost !== 'number' || part.cost < 0)) {
        addError(`partsUsed[${idx}].cost`, 'Part cost cannot be negative.');
      }
    });
  }

  const errorMessages = Object.values(errors).flat();
  return {
    isValid: errorMessages.length === 0,
    errors,
    errorMessages,
  };
}

// ============================================================================
// 5. ACTION LOG GENERATOR
// ============================================================================

/**
 * Creates an immutable, timestamped audit action log entry.
 */
export function createActionLogEntry(
  user?: {
    id?: string;
    uid?: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
    firstName?: string;
    lastName?: string;
  } | null,
  actionText: string = '',
  tenantId?: string
): RepairActionLog {
  const userName =
    user?.name ||
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
    user?.email ||
    'Technician';

  const userId = user?.id || user?.uid;
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const id = `act_${Date.now()}_${randomSuffix}`;

  return {
    id,
    user: {
      id: userId,
      name: userName,
      email: user?.email,
      avatarUrl: user?.avatarUrl,
      firstName: user?.firstName,
      lastName: user?.lastName,
    },
    action: (actionText || '').trim() || 'Updated ticket',
    timestamp: new Date().toISOString(),
    tenantId,
  };
}

// ============================================================================
// 6. FILTERING, SEARCH & SORTING PREDICATES
// ============================================================================

/**
 * Pure predicate filter across an array of repair tickets.
 * Supports status, priority, condition, billing, technician assignee, archived, date ranges, and fuzzy multi-field search.
 */
export function filterRepairTickets(
  tickets: RepairTicket[],
  filters: RepairFilterParams
): RepairTicket[] {
  if (!Array.isArray(tickets) || tickets.length === 0) return [];

  const {
    status,
    priority,
    condition,
    billingStatus,
    assigneeId,
    search,
    includeArchived = false,
    archived,
    dateFrom,
    dateTo,
  } = filters;

  const cleanSearch = (search || '').trim().toLowerCase();
  const fromDate = dateFrom ? parseFirestoreDate(dateFrom) : null;
  const toDate = dateTo ? parseFirestoreDate(dateTo) : null;
  const allowArchived = includeArchived === true || archived === true;

  return tickets.filter((ticket) => {
    // 1. Archived check
    const isArchived = ticket.archived === true || ticket.status === 'Archived';
    if (!allowArchived && isArchived) {
      return false;
    }

    // 2. Status filter
    if (status && status !== 'all') {
      const allowedStatuses = Array.isArray(status) ? status : [status];
      const matchStatus = allowedStatuses.some(
        (s) => s.toLowerCase() === (ticket.status || '').toLowerCase()
      );
      if (!matchStatus) return false;
    }

    // 3. Priority filter
    if (priority && priority !== 'all') {
      const allowedPriorities = Array.isArray(priority) ? priority : [priority];
      const matchPriority = allowedPriorities.some(
        (p) => p.toLowerCase() === (ticket.priority || '').toLowerCase()
      );
      if (!matchPriority) return false;
    }

    // 4. Condition filter
    if (condition && condition !== 'all') {
      const ticketCond = ticket.condition || calculateEquipmentCondition(ticket.status);
      if (ticketCond.toLowerCase() !== condition.toLowerCase()) {
        return false;
      }
    }

    // 5. Billing Status filter
    if (billingStatus && billingStatus !== 'all') {
      const ticketBill = ticket.billingStatus || 'None';
      if (ticketBill.toLowerCase() !== billingStatus.toLowerCase()) {
        return false;
      }
    }

    // 6. Assignee filter
    if (assigneeId) {
      const ticketAssigneeId = ticket.assigneeId || ticket.assignee?.id;
      if (ticketAssigneeId !== assigneeId) {
        return false;
      }
    }

    // 7. Date range filter (against repairPeriodStart or createdAt)
    if (fromDate || toDate) {
      const ticketDate = parseFirestoreDate(ticket.repairPeriodStart || ticket.createdAt);
      if (ticketDate) {
        if (fromDate && ticketDate.getTime() < fromDate.getTime()) return false;
        if (toDate && ticketDate.getTime() > toDate.getTime()) return false;
      }
    }

    // 8. Multi-field fuzzy search
    if (cleanSearch) {
      const matchFields: (string | number | undefined | null)[] = [
        ticket.equipment?.name,
        ticket.equipment?.serialNumber,
        ticket.equipment?.barcode,
        ticket.equipment?.category,
        ticket.equipment?.assetNumber,
        ticket.equipment?.segAssetNumber,
        ticket.equipment?.knownLocation,
        ticket.equipment?.venue,
        ticket.repairNumber !== undefined && ticket.repairNumber !== null ? String(ticket.repairNumber) : undefined,
        ticket.repairNumber !== undefined && ticket.repairNumber !== null ? `#${ticket.repairNumber}` : undefined,
        ticket.repairType,
        ticket.requestedBy,
        ticket.internalReference,
        ticket.internalNotes,
        ticket.assignee?.name,
      ];

      // Also search through notes contents
      if (Array.isArray(ticket.notes)) {
        ticket.notes.forEach((n) => {
          if (n && n.content) matchFields.push(n.content);
        });
      }

      // Also search action log text
      if (Array.isArray(ticket.actions)) {
        ticket.actions.forEach((a) => {
          if (a && a.action) matchFields.push(a.action);
        });
      }

      const hasMatch = matchFields.some((field) => {
        if (field === null || field === undefined) return false;
        return String(field).toLowerCase().includes(cleanSearch);
      });

      if (!hasMatch) return false;
    }

    return true;
  });
}

/**
 * Pure sorting function for repair tickets.
 */
export function sortRepairTickets(
  tickets: RepairTicket[],
  sortBy: 'repairNumber' | 'priority' | 'status' | 'updatedAt' | 'createdAt' | 'equipmentName' = 'updatedAt',
  sortOrder: 'asc' | 'desc' = 'desc'
): RepairTicket[] {
  const sorted = [...tickets];
  const mult = sortOrder === 'asc' ? 1 : -1;

  return sorted.sort((a, b) => {
    switch (sortBy) {
      case 'repairNumber': {
        const numA = a.repairNumber || 0;
        const numB = b.repairNumber || 0;
        return (numA - numB) * mult;
      }
      case 'priority': {
        const weightA = PRIORITY_WEIGHTS[normalizeRepairPriority(a.priority)];
        const weightB = PRIORITY_WEIGHTS[normalizeRepairPriority(b.priority)];
        return (weightA - weightB) * mult;
      }
      case 'equipmentName': {
        const nameA = (a.equipment?.name || '').toLowerCase();
        const nameB = (b.equipment?.name || '').toLowerCase();
        return nameA.localeCompare(nameB) * mult;
      }
      case 'status': {
        const statA = (a.status || '').toLowerCase();
        const statB = (b.status || '').toLowerCase();
        return statA.localeCompare(statB) * mult;
      }
      case 'createdAt': {
        const dateA = parseFirestoreDate(a.createdAt)?.getTime() || 0;
        const dateB = parseFirestoreDate(b.createdAt)?.getTime() || 0;
        return (dateA - dateB) * mult;
      }
      case 'updatedAt':
      default: {
        const dateA = parseFirestoreDate(a.updatedAt || a.createdAt)?.getTime() || 0;
        const dateB = parseFirestoreDate(b.updatedAt || b.createdAt)?.getTime() || 0;
        return (dateA - dateB) * mult;
      }
    }
  });
}

/**
 * Sums the total parts and manual costs on a ticket.
 */
export function calculateRepairCostTotal(
  parts?: RepairPart[],
  manualCosts?: number | null
): number {
  let total = 0;
  if (Array.isArray(parts)) {
    parts.forEach((p) => {
      if (!p) return;
      const q = typeof p.quantity === 'number' && !isNaN(p.quantity) ? p.quantity : 0;
      const c = typeof p.cost === 'number' && !isNaN(p.cost) ? p.cost : 0;
      total += q * c;
    });
  }
  if (typeof manualCosts === 'number' && !isNaN(manualCosts)) {
    total += manualCosts;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Gets badge variant for a given priority.
 */
export function getPriorityBadgeVariant(
  priority: RepairPriority | string
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'brand' | 'error' {
  const norm = normalizeRepairPriority(priority);
  return REPAIR_PRIORITY_CONFIG[norm]?.badgeVariant || 'default';
}

/**
 * Gets badge variant for a given status.
 */
export function getStatusBadgeVariant(
  status: RepairStatus | string
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'brand' | 'error' {
  const norm = normalizeRepairStatus(status);
  return REPAIR_STATUS_CONFIG[norm]?.badgeVariant || 'default';
}
