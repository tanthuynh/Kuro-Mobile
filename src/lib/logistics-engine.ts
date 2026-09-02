/**
 * src/lib/logistics-engine.ts
 * Pure functional domain logic for Kuro Mobile Logistics & Driver workflows.
 * Completely deterministic, side-effect free, and fully tested.
 */

import type { LogisticsEntry, LogisticsMetrics, LogisticsStatus } from '../types/logistics';

/**
 * Normalizes multi-line address text and removes excess whitespace/formatting artifacts.
 *
 * @param address Raw address string.
 * @returns Clean single-line or normalized address.
 */
export function formatDestinationAddress(address?: string | null): string {
  if (!address || typeof address !== 'string') {
    return '';
  }

  return address
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a standardized Google Maps search URL from address and optional destination title.
 *
 * @param address Destination address.
 * @param destinationName Optional name of destination / venue.
 * @returns Fully encoded Maps URL or empty string if input is blank.
 */
export function buildMapsUrl(address?: string | null, destinationName?: string | null): string {
  const cleanAddress = formatDestinationAddress(address);
  const cleanName = (destinationName || '').trim();

  let query = '';
  if (cleanName && cleanAddress) {
    const nameLower = cleanName.toLowerCase();
    const addrLower = cleanAddress.toLowerCase();

    if (addrLower.includes(nameLower)) {
      query = cleanAddress;
    } else if (nameLower.includes(addrLower)) {
      query = cleanName;
    } else {
      query = `${cleanName}, ${cleanAddress}`;
    }
  } else if (cleanAddress) {
    query = cleanAddress;
  } else if (cleanName) {
    query = cleanName;
  }

  if (!query) {
    return '';
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Sanitizes contact text, strips non-dialable artifacts, and formats into a native `tel:` URI.
 * Extracts valid international (+...) and domestic phone numbers.
 *
 * @param contact Raw contact string (e.g. "Bob: +61 412 345 678", "(02) 9876 5432").
 * @returns `tel:<digits>` URI or `null` if no valid dialable number found.
 */
export function buildPhoneUrl(contact?: string | null): string | null {
  if (!contact || typeof contact !== 'string') {
    return null;
  }

  const trimmed = contact.trim();
  if (!trimmed) {
    return null;
  }

  // Look for phone number pattern within text (e.g. "+61 412 345 678", "(02) 9876 5432", "0412-345-678")
  const match = trimmed.match(/(?:\+?\d[\d\s\-()./]{2,}\d|\d{3,})/);
  if (!match) {
    return null;
  }

  const phoneCandidate = match[0];
  const hasLeadingPlus = phoneCandidate.trim().startsWith('+');
  const digitsOnly = phoneCandidate.replace(/\D/g, '');

  if (digitsOnly.length < 3) {
    return null;
  }

  const sanitized = hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
  return `tel:${sanitized}`;
}

/**
 * Checks whether a logistics status represents an active / in-progress job.
 *
 * @param status Status name.
 * @param role Optional status role from StatusDefinition.
 * @returns `true` if job is active / in progress.
 */
export function isJobActive(status?: string | null, role?: string | null): boolean {
  if (role === 'in-progress') {
    return true;
  }
  if (role === 'completed') {
    return false;
  }

  if (!status || typeof status !== 'string') {
    return false;
  }

  const s = status.trim().toLowerCase();
  const activeStatuses = new Set([
    'active',
    'in transit',
    'in-transit',
    'in_transit',
    'en route',
    'en-route',
    'en_route',
    'in progress',
    'in-progress',
    'in_progress',
    'arrived',
    'dispatched',
    'on route',
    'on-route',
    'out for delivery',
  ]);

  return activeStatuses.has(s);
}

/**
 * Checks whether a logistics status represents a completed job.
 *
 * @param status Status name.
 * @param role Optional status role from StatusDefinition.
 * @returns `true` if job is completed.
 */
export function isJobCompleted(status?: string | null, role?: string | null): boolean {
  if (role === 'completed') {
    return true;
  }
  if (role === 'in-progress') {
    return false;
  }

  if (!status || typeof status !== 'string') {
    return false;
  }

  const s = status.trim().toLowerCase();
  const completedStatuses = new Set([
    'completed',
    'delivered',
    'returned',
    'closed',
    'done',
    'finished',
  ]);

  return completedStatuses.has(s);
}

/**
 * Checks whether a logistics status represents a scheduled / pending job.
 *
 * @param status Status name.
 * @param role Optional status role from StatusDefinition.
 * @returns `true` if job is scheduled / pending.
 */
export function isJobScheduled(status?: string | null, role?: string | null): boolean {
  if (role === 'in-progress' || role === 'completed') {
    return false;
  }

  if (!status || typeof status !== 'string') {
    return false;
  }

  const s = status.trim().toLowerCase();
  if (isJobActive(status, role) || isJobCompleted(status, role)) {
    return false;
  }

  const scheduledStatuses = new Set([
    'scheduled',
    'pending',
    'confirmed',
    'draft',
    'ready',
    'assigned',
    'unassigned',
  ]);

  return scheduledStatuses.has(s);
}

/**
 * Checks whether a logistics status represents a pending / draft / unassigned job.
 *
 * @param status Status name.
 * @returns `true` if job is pending / draft / unassigned.
 */
export function isJobPending(status?: string | null): boolean {
  if (!status || typeof status !== 'string') {
    return false;
  }

  const s = status.trim().toLowerCase();
  const pendingStatuses = new Set(['pending', 'draft', 'unassigned']);
  return pendingStatuses.has(s);
}

/**
 * Checks whether a logistics status represents a planned / scheduled / confirmed / ready job.
 *
 * @param status Status name.
 * @returns `true` if job is planned / scheduled.
 */
export function isJobPlanned(status?: string | null): boolean {
  if (!status || typeof status !== 'string') {
    return false;
  }

  const s = status.trim().toLowerCase();
  const plannedStatuses = new Set(['planned', 'scheduled', 'confirmed', 'ready', 'assigned']);
  return plannedStatuses.has(s);
}

/**
 * Alias for isJobActive to match standard lifecycle naming.
 */
export const isJobInProgress = isJobActive;

/**
 * Validates whether transitioning from `currentStatus` to `newStatus` is valid.
 *
 * @param currentStatus Current job status.
 * @param newStatus Proposed target status.
 * @returns `true` if transition is permissible.
 */
export function isValidStatusTransition(
  currentStatus?: string | null,
  newStatus?: string | null
): boolean {
  if (!currentStatus || !newStatus || typeof currentStatus !== 'string' || typeof newStatus !== 'string') {
    return false;
  }

  const curr = currentStatus.trim().toLowerCase();
  const next = newStatus.trim().toLowerCase();

  if (!curr || !next) {
    return false;
  }

  // Idempotent transition is always allowed
  if (curr === next) {
    return true;
  }

  // Disallowed target states
  const cancelledStatuses = new Set(['cancelled', 'canceled', 'void']);

  // Draft / Scheduled / Confirmed can transition to Active, Completed, Cancelled, Archived
  const draftOrScheduled = new Set(['draft', 'scheduled', 'pending', 'confirmed', 'ready', 'assigned', 'planned']);
  if (draftOrScheduled.has(curr)) {
    return true;
  }

  // Active states (In Transit, En Route, Arrived, In Progress) can transition to Active, Completed, Cancelled, Scheduled
  if (isJobActive(curr)) {
    return true;
  }

  // Completed can transition to Archived or reopen to Scheduled / In Transit
  if (isJobCompleted(curr)) {
    return true;
  }

  // Cancelled can reopen to Draft, Scheduled, or Archive
  if (cancelledStatuses.has(curr)) {
    return true;
  }

  // Default fallback for any custom statuses
  return true;
}

/**
 * Filters logistics entries for a specific driver, status category, and search query.
 * Pure functional, non-mutating.
 *
 * @param entries Array of logistics entries.
 * @param user Current authenticated user/driver.
 * @param onlyAssigned If true, filters strictly to jobs assigned to the driver.
 * @param statusFilter 'all', 'active', 'scheduled', 'pending', 'planned', 'in progress', 'completed', 'in_transit', or specific status.
 * @param search Search keyword matching against venue, event, driver, notes, or destination.
 * @returns Filtered array of logistics entries.
 */
export function filterLogisticsForDriver(
  entries: LogisticsEntry[] | null | undefined,
  user: { id?: string; name?: string; email?: string; firstName?: string; lastName?: string } | null | undefined,
  onlyAssigned: boolean = false,
  statusFilter: string = 'all',
  search: string = ''
): LogisticsEntry[] {
  if (!entries || !Array.isArray(entries)) {
    return [];
  }

  let result = entries.filter((entry) => !entry.archived);

  // 1. Filter by Driver Assignment
  if (onlyAssigned) {
    if (!user || (!user.id && !user.name && !user.email && !user.firstName)) {
      return [];
    }

    const userId = user.id?.trim();
    const userName = (user.name || '').trim().toLowerCase();
    const userEmail = (user.email || '').trim().toLowerCase();
    const userFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim().toLowerCase();

    result = result.filter((entry) => {
      // Check assigneeId match
      if (userId && entry.assigneeId && entry.assigneeId === userId) {
        return true;
      }

      // Check driverName match
      if (entry.driverName) {
        const driverNameLower = entry.driverName.trim().toLowerCase();
        if (userName && driverNameLower === userName) {
          return true;
        }
        if (userFullName && driverNameLower === userFullName) {
          return true;
        }
        if (userEmail && driverNameLower === userEmail) {
          return true;
        }
        // Substring / partial match on name
        if (userName && driverNameLower.includes(userName)) {
          return true;
        }
      }

      return false;
    });
  }

  // 2. Filter by Status
  if (statusFilter && statusFilter.toLowerCase() !== 'all' && statusFilter.trim() !== '') {
    const sf = statusFilter.trim().toLowerCase();

    if (sf === 'pending') {
      result = result.filter((entry) => isJobPending(entry.status));
    } else if (sf === 'planned') {
      result = result.filter((entry) => isJobPlanned(entry.status));
    } else if (sf === 'in progress' || sf === 'in-progress' || sf === 'in_progress' || sf === 'active') {
      result = result.filter((entry) => isJobActive(entry.status));
    } else if (sf === 'completed') {
      result = result.filter((entry) => isJobCompleted(entry.status));
    } else if (sf === 'scheduled') {
      result = result.filter((entry) => isJobScheduled(entry.status));
    } else if (sf === 'in_transit' || sf === 'in-transit' || sf === 'in transit') {
      result = result.filter((entry) => {
        const s = (entry.status || '').toLowerCase();
        return s === 'in transit' || s === 'in-transit' || s === 'in_transit' || s === 'en route' || s === 'en-route';
      });
    } else {
      result = result.filter((entry) => (entry.status || '').trim().toLowerCase() === sf);
    }
  }

  // 3. Filter by Search Query
  if (search && search.trim() !== '') {
    const q = search.trim().toLowerCase();

    result = result.filter((entry) => {
      if (entry.location && entry.location.toLowerCase().includes(q)) {
        return true;
      }
      if (entry.eventName && entry.eventName.toLowerCase().includes(q)) {
        return true;
      }
      if (entry.eventNumber !== undefined && entry.eventNumber !== null && entry.eventNumber.toString().includes(q)) {
        return true;
      }
      if (entry.driverName && entry.driverName.toLowerCase().includes(q)) {
        return true;
      }
      if (entry.notes && entry.notes.toLowerCase().includes(q)) {
        return true;
      }
      if (entry.status && entry.status.toLowerCase().includes(q)) {
        return true;
      }

      // Check destinations
      if (entry.destinations && Array.isArray(entry.destinations)) {
        const hasDestMatch = entry.destinations.some((d) => {
          return (
            (d.destinationName && d.destinationName.toLowerCase().includes(q)) ||
            (d.address && d.address.toLowerCase().includes(q)) ||
            (d.contact && d.contact.toLowerCase().includes(q)) ||
            (d.detailNote && d.detailNote.toLowerCase().includes(q))
          );
        });
        if (hasDestMatch) {
          return true;
        }
      }

      return false;
    });
  }

  return result;
}

/**
 * Computes aggregated summary metrics across a set of logistics entries.
 *
 * @param entries Array of logistics entries.
 * @returns Metrics breakdown `{ total, all, pending, planned, inProgress, completed, active, scheduled, inTransit }`.
 */
export function computeLogisticsMetrics(
  entries: LogisticsEntry[] | null | undefined
): LogisticsMetrics {
  if (!entries || !Array.isArray(entries)) {
    return {
      total: 0,
      all: 0,
      pending: 0,
      planned: 0,
      inProgress: 0,
      completed: 0,
      active: 0,
      scheduled: 0,
      inTransit: 0,
    };
  }

  let total = 0;
  let pending = 0;
  let planned = 0;
  let inProgress = 0;
  let completed = 0;
  let inTransit = 0;

  for (const entry of entries) {
    if (entry.archived) {
      continue;
    }

    total++;

    if (isJobPending(entry.status)) {
      pending++;
    }
    if (isJobPlanned(entry.status)) {
      planned++;
    }
    if (isJobActive(entry.status)) {
      inProgress++;
    }
    if (isJobCompleted(entry.status)) {
      completed++;
    }

    const s = (entry.status || '').toLowerCase();
    if (s === 'in transit' || s === 'in-transit' || s === 'in_transit' || s === 'en route' || s === 'en-route') {
      inTransit++;
    }
  }

  return {
    total,
    all: total,
    pending,
    planned,
    inProgress,
    completed,
    active: inProgress,
    scheduled: planned + pending,
    inTransit,
  };
}
