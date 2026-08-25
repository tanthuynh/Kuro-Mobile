/**
 * src/lib/pull-sheet-engine.ts
 * Pure domain engine for Pull Sheets in Kuro Mobile.
 * Includes lifecycle state machine, legacy status normalization,
 * section grouping, progress metrics calculation, and filtering.
 */

import type {
  PullsheetItem,
  PullsheetItemStatus,
  PullsheetProgress,
  PullsheetSection,
} from '@/types/pull-sheet';

export const PULLSHEET_LIFECYCLE_ORDER: PullsheetItemStatus[] = [
  'pending',
  'confirmed',
  'prepped_scanned',
  'dispatched',
  'returned',
  'deprepped',
];

export const STATUS_DISPLAY_CONFIG: Record<
  PullsheetItemStatus,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  none: {
    label: '—',
    color: '#64748B',
    bgColor: '#1E293B',
    borderColor: '#334155',
  },
  pending: {
    label: 'Pending',
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  confirmed: {
    label: 'Confirmed',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  prepped_scanned: {
    label: 'Prepped',
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  dispatched: {
    label: 'Dispatched',
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  returned: {
    label: 'Returned',
    color: '#06B6D4',
    bgColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  deprepped: {
    label: 'Deprepped',
    color: '#94A3B8',
    bgColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
};

/**
 * Normalizes legacy, mixed-case, and modern status strings into canonical PullsheetItemStatus.
 */
export function normalizePullsheetStatus(status?: string | null): PullsheetItemStatus {
  if (!status) return 'none';
  const clean = status.trim().toLowerCase();

  switch (clean) {
    case 'pending':
      return 'pending';
    case 'ready':
    case 'confirmed':
      return 'confirmed';
    case 'prepped/scanned':
    case 'prepped_scanned':
    case 'prepped':
      return 'prepped_scanned';
    case 'dispatched':
      return 'dispatched';
    case 'returned':
      return 'returned';
    case 'deprepped':
      return 'deprepped';
    case 'none':
    default:
      return 'none';
  }
}

/**
 * Determines whether a pull sheet item row is actionable (can hold an operational status).
 */
export function isActionablePullsheetItem(item: PullsheetItem): boolean {
  return item.type === 'item' || item.type === 'misc';
}

/**
 * Returns the next status in the forward lifecycle pipeline.
 */
export function getNextPullsheetStatus(currentStatus: PullsheetItemStatus): PullsheetItemStatus {
  switch (currentStatus) {
    case 'pending':
      return 'confirmed';
    case 'confirmed':
      return 'prepped_scanned';
    case 'prepped_scanned':
      return 'dispatched';
    case 'dispatched':
      return 'returned';
    case 'returned':
      return 'deprepped';
    case 'deprepped':
      return 'deprepped';
    default:
      return 'none';
  }
}

/**
 * Returns the previous status in the reverse lifecycle pipeline (rollback).
 */
export function getPreviousPullsheetStatus(currentStatus: PullsheetItemStatus): PullsheetItemStatus {
  switch (currentStatus) {
    case 'deprepped':
      return 'returned';
    case 'returned':
      return 'dispatched';
    case 'dispatched':
      return 'prepped_scanned';
    case 'prepped_scanned':
      return 'confirmed';
    case 'confirmed':
      return 'pending';
    case 'pending':
      return 'pending';
    default:
      return 'none';
  }
}

/**
 * Calculates real-time progress metrics across all actionable pull sheet items.
 */
export function calculatePullsheetProgress(items: PullsheetItem[]): PullsheetProgress {
  let totalLines = 0;
  let totalQuantity = 0;
  let pendingQuantity = 0;
  let confirmedQuantity = 0;
  let preppedQuantity = 0;
  let dispatchedQuantity = 0;
  let returnedQuantity = 0;
  let depreppedQuantity = 0;

  for (const item of items) {
    if (!isActionablePullsheetItem(item)) continue;

    const qty = Math.max(0, item.quantity || 1);
    totalLines += 1;
    totalQuantity += qty;

    const status = normalizePullsheetStatus(item.status);

    switch (status) {
      case 'pending':
        pendingQuantity += qty;
        break;
      case 'confirmed':
        confirmedQuantity += qty;
        break;
      case 'prepped_scanned':
        preppedQuantity += qty;
        break;
      case 'dispatched':
        dispatchedQuantity += qty;
        break;
      case 'returned':
        returnedQuantity += qty;
        break;
      case 'deprepped':
        depreppedQuantity += qty;
        break;
      default:
        break;
    }
  }

  // Cumulative quantities
  // Prepped includes prepped_scanned, dispatched, returned, deprepped
  const cumulativePrepped = preppedQuantity + dispatchedQuantity + returnedQuantity + depreppedQuantity;
  const cumulativeDispatched = dispatchedQuantity + returnedQuantity + depreppedQuantity;
  const cumulativeReturned = returnedQuantity + depreppedQuantity;

  const percentPrepped = totalQuantity > 0 ? Math.round((cumulativePrepped / totalQuantity) * 100) : 0;
  const percentDispatched = totalQuantity > 0 ? Math.round((cumulativeDispatched / totalQuantity) * 100) : 0;
  const percentReturned = totalQuantity > 0 ? Math.round((cumulativeReturned / totalQuantity) * 100) : 0;

  return {
    totalLines,
    totalQuantity,
    pendingQuantity,
    confirmedQuantity,
    preppedQuantity,
    dispatchedQuantity,
    returnedQuantity,
    depreppedQuantity,
    percentPrepped,
    percentDispatched,
    percentReturned,
    isFullyPrepped: totalQuantity > 0 && cumulativePrepped >= totalQuantity,
    isFullyDispatched: totalQuantity > 0 && cumulativeDispatched >= totalQuantity,
    isFullyReturned: totalQuantity > 0 && cumulativeReturned >= totalQuantity,
    isFullyDeprepped: totalQuantity > 0 && depreppedQuantity >= totalQuantity,
  };
}

/**
 * Groups pull sheet items into sections based on section-header rows.
 * Automatically excludes service items.
 */
export function groupPullsheetBySections(items: PullsheetItem[]): PullsheetSection[] {
  const sections: PullsheetSection[] = [];
  let currentSection: PullsheetSection = {
    id: 'default-section',
    title: 'General Equipment',
    items: [],
  };

  for (const item of items) {
    // Strictly omit service items
    if ((item as any).type === 'service') continue;

    if (item.type === 'section-header') {
      if (currentSection.items.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        id: item.id || `section-${sections.length + 1}`,
        title: item.description || 'Untitled Section',
        items: [],
      };
    } else if (item.type === 'section-footer') {
      // Footers are ignored in mobile section grouping
      continue;
    } else {
      currentSection.items.push(item);
    }
  }

  if (currentSection.items.length > 0 || sections.length === 0) {
    sections.push(currentSection);
  }

  return sections;
}
