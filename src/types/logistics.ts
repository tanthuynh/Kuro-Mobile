/**
 * src/types/logistics.ts
 * Authoritative TypeScript definitions for Kuro Mobile Logistics & Driver domain.
 * Strictly compatible with kuro-web schema and Firestore logistics collection.
 */

import type { User } from './auth';

/**
 * Type of stop or item in a logistics route.
 */
export type DestinationType = 'destination' | 'note';

/**
 * Individual destination stop or itinerary note within a logistics job.
 * Mirrors kuro-web LogisticsDestination definition.
 */
export interface LogisticsDestination {
  id: string;
  type: DestinationType;
  destinationName: string;
  address: string;
  contact?: string;
  time?: string;
  estTravelTime?: string;
  detailNote?: string;
  distance?: string;
}

/**
 * Standard coordinates structure for location services.
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  altitude?: number | null;
}

/**
 * Driver location payload transmitted during background GPS tracking.
 */
export interface DriverLocation extends Coordinates {
  timestamp: number; // epoch timestamp in ms
  driverId?: string;
  driverName?: string;
  jobId?: string;
}

/**
 * Vehicle metadata representing fleet vehicles.
 * Mirrors kuro-web Vehicle definition.
 */
export interface Vehicle {
  id: string;
  name: string;
  rego: string;
  color?: string;
  size?: string;
  make?: string;
  model?: string;
  notes?: string;
  tenantId?: string;
  order?: number;
}

/**
 * Configurable status definition from tenant settings.
 * Mirrors kuro-web StatusDefinition definition.
 */
export interface StatusDefinition {
  id: string;
  name: string;
  isDefault?: boolean;
  isConfirmedTrigger?: boolean;
  order?: number;
  tenantId?: string;
  icon?: string;
  role?: 'in-progress' | 'completed' | string;
  showOnBoard?: boolean;
  colour?: string;
}

/**
 * Canonical lifecycle status for a logistics job.
 */
export type LogisticsStatus =
  | 'Draft'
  | 'Pending'
  | 'Scheduled'
  | 'Confirmed'
  | 'Ready'
  | 'In Transit'
  | 'En Route'
  | 'Arrived'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled'
  | 'Archived'
  | string;

/**
 * Internal note logged against a logistics job.
 */
export interface LogisticsNote {
  id: string;
  content: string;
  user?: Partial<User> & {
    id?: string;
    name?: string;
    email?: string;
  };
  timestamp: string; // ISO 8601 UTC string
}

/**
 * Root Firestore document representation in `logistics/{jobId}` collection.
 * Strictly compatible with kuro-web LogisticsEntry definition with mobile tracking extensions.
 */
export interface LogisticsEntry {
  id: string;
  tenantId: string;
  vehicleId?: string | null;
  vehicleName?: string;
  driverName?: string;
  driverId?: string | null;
  assigneeId?: string | null;
  eventName?: string;
  eventNumber?: number | null;
  location: string;
  notes?: string;
  start: Date | string | any; // Supports Date, ISO string, or Firestore Timestamp
  end: Date | string | any;   // Supports Date, ISO string, or Firestore Timestamp
  createdBy: string;
  updatedBy: string;
  createdAt: string | any;
  updatedAt: string | any;
  status: LogisticsStatus;
  destinations?: LogisticsDestination[];
  archived?: boolean;

  // Real-time GPS tracking fields
  currentLocation?: DriverLocation | null;
  lastLocationUpdate?: string | number | any;
  isTrackingActive?: boolean;
  trackingJobId?: string;

  // Offline sync metadata
  hasPendingWrites?: boolean;
}

/**
 * User representation for driver assignment and filtering.
 */
export interface LogisticsUser {
  id?: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

/**
 * Filter parameters for logistics job queries and client-side filtering.
 */
export interface LogisticsFilterParams {
  status?: string | string[] | 'all';
  search?: string;
  onlyAssigned?: boolean;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  includeArchived?: boolean;
}

/**
 * Aggregated metrics summary for logistics jobs.
 */
export interface LogisticsMetrics {
  total: number;
  all?: number;
  pending: number;
  planned: number;
  inProgress: number;
  completed: number;
  active: number;
  scheduled: number;
  inTransit: number;
}

/**
 * Input payload for updating logistics job status.
 */
export interface UpdateLogisticsStatusInput {
  id: string;
  tenantId: string;
  status: LogisticsStatus;
  updatedBy?: string;
  internalNote?: string;
}

/**
 * Input payload for appending notes to a logistics job.
 */
export interface AppendLogisticsNoteInput {
  id: string;
  tenantId: string;
  note: string;
  user: LogisticsUser;
}
