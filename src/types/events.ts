/**
 * src/types/events.ts
 * Authoritative TypeScript definitions for Events, Stages, Schedules, Contacts,
 * and Categorized Event sets in Kuro Mobile.
 */

export const EVENT_STATUSES = ['Inquiry', 'Pending', 'Confirmed', 'Completed', 'Cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export type EventEquipmentItemType =
  | 'item'
  | 'note'
  | 'misc'
  | 'section-header'
  | 'section-footer'
  | 'sub-item'
  | 'service';

export interface EventEquipmentItem {
  id: string;
  inventoryItemId?: string;
  serviceItemId?: string;
  serviceType?: string;
  quantity: number;
  description: string;
  internalNote?: string;
  time?: number;
  unit?: string;
  cost: number;
  discount?: number;
  maxDiscount?: number;
  type: EventEquipmentItemType;
  sectionId?: string;
  parentItemId?: string;
  hasContents?: boolean;
}

export interface ContactPerson {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  isDefault?: boolean;
}

export interface Contact {
  id: string;
  name: string;
  fullAddress?: string;
  unitNumber?: string;
  street?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
  phone?: string;
  internalNotes?: string;
  website?: string;
  tenantId?: string;
  types?: ('Client' | 'Supplier' | 'Venue')[];
  contactPeople?: ContactPerson[];
}

export interface EventType {
  id: string;
  name: string;
  colour?: string; // Hex color code
  order?: number;
  tenantId?: string;
  isDefault?: boolean;
}

export interface Event {
  id: string;
  tenantId: string;
  eventName: string;
  eventNumber?: number | null;
  clientId: string;
  clientName?: string | null;
  eventStatusId: EventStatus;
  eventTypeId: string;
  typeName?: string | null;
  venueId?: string | null;
  venueName?: string | null;
  departmentId?: string;
  assigneeId: string;
  assigneeName?: string | null;
  billingStatus?: string | null;
  billingTerms?: string | null;
  
  // 5 Operational stage windows
  startTime: Date | null;       // Planning Period Start
  finishTime: Date | null;      // Planning Period Finish
  deliveryTime: Date | null;    // Setup Period Start (Load-In)
  setupTime: Date | null;       // Setup Period Finish (Ready)
  rehearsalTime?: Date | null;  // Rehearsal Start
  eventStartDate: Date | null;  // Show Period Start
  eventFinishDate: Date | null; // Show Period Finish
  pickupTime: Date | null;      // Packdown Period Start (Load-Out)
  packdownTime: Date | null;    // Packdown Period Finish (Complete)

  notes?: string;
  archived?: boolean;
  equipmentItems?: EventEquipmentItem[];
  logisticsOrder?: string[];
  logisticsNotes?: Record<string, string>;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface CategorizedEvents {
  todayJobs: Event[];
  inProgress: Event[];
  upcoming: Event[];
  completed: Event[];
}
