/**
 * src/types/pull-sheet.ts
 * Authoritative TypeScript definitions for Pull Sheets, Items, Lifecycle States,
 * Section Groupings, and Progress Metrics in Kuro Mobile.
 */

export type PullsheetItemStatus =
  | 'none'
  | 'pending'
  | 'confirmed'
  | 'prepped_scanned'
  | 'dispatched'
  | 'returned'
  | 'deprepped';

export type PullsheetItemType =
  | 'item'
  | 'note'
  | 'misc'
  | 'section-header'
  | 'section-footer'
  | 'sub-item';

export interface PullsheetItem {
  id: string;
  sourceQuoteLineId?: string;
  inventoryItemId?: string;
  quantity: number;
  scannedQuantity?: number;
  scannedBarcodes?: string[];
  description: string;
  internalNote?: string;
  type: PullsheetItemType;
  sectionId?: string;
  parentItemId?: string;
  hasContents?: boolean;
  unit?: string;
  cost?: number;
  discount?: number;
  time?: number;
  status: PullsheetItemStatus;
  statusUpdatedAt?: Date | null;
  statusUpdatedBy?: string;
}

export interface Pullsheet {
  id: string; // doc ID == eventId
  eventId: string;
  tenantId: string;
  items: PullsheetItem[];
  sourceCopyTimestamp?: Date | null;
  lastBulkConfirmAt?: Date | null;
  lastBulkConfirmBy?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdBy?: string;
  updatedBy?: string;
}

export interface PullsheetSection {
  id: string;
  title: string;
  items: PullsheetItem[];
}

export interface PullsheetProgress {
  totalLines: number;
  totalQuantity: number;
  pendingQuantity: number;
  confirmedQuantity: number;
  preppedQuantity: number;
  dispatchedQuantity: number;
  returnedQuantity: number;
  depreppedQuantity: number;
  percentPrepped: number;
  percentDispatched: number;
  percentReturned: number;
  isFullyPrepped: boolean;
  isFullyDispatched: boolean;
  isFullyReturned: boolean;
  isFullyDeprepped: boolean;
}
