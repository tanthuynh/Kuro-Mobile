/**
 * src/types/scanner.ts
 * Authoritative TypeScript definitions for Barcode/QR Scanning,
 * Evaluation Results, and Continuous Scanner State in Kuro Mobile.
 */

import type { PullsheetItem } from './pull-sheet';
import type { Equipment } from './equipment';

export type ScanEvaluationType =
  | 'SUCCESS'
  | 'ALREADY_COMPLETED'
  | 'NOT_ON_PULLSHEET'
  | 'UNKNOWN_CODE';

export interface ScanEvaluationResult {
  type: ScanEvaluationType;
  item?: PullsheetItem;
  equipment?: Equipment;
  newScannedCount?: number;
  isFullyPrepped?: boolean;
  message?: string;
}

export type ScannerMode = 'continuous' | 'single' | 'lookup';

export interface ScannerState {
  mode: ScannerMode;
  torchEnabled: boolean;
  activeEventId: string | null;
  lastScannedCode: string | null;
  lastResult: ScanEvaluationResult | null;
  isProcessing: boolean;
  cooldownMs: number;
}
