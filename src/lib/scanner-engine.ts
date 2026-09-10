/**
 * src/lib/scanner-engine.ts
 * Pure barcode evaluation engine and continuous scan throttle for Kuro Mobile.
 * Reconciles 1D/2D barcodes against Pull Sheet line items, serialized inventory,
 * and global equipment catalog.
 */

import type { PullsheetItem } from '@/types/pull-sheet';
import type { Equipment } from '@/types/equipment';
import type { ScanEvaluationResult, ScanTargetStatus } from '@/types/scanner';

/**
 * Evaluates a scanned barcode or manual code input against the active pull sheet
 * and the equipment catalog.
 */
export function evaluatePullsheetScan(
  scannedCode: string,
  pullsheetItems: PullsheetItem[],
  equipmentLookup: Map<string, Equipment> | Record<string, Equipment> | Equipment[],
  targetStatus: ScanTargetStatus = 'prepped_scanned'
): ScanEvaluationResult {
  const cleanCode = (scannedCode || '').trim();
  if (!cleanCode) {
    return {
      type: 'UNKNOWN_CODE',
      message: 'Empty barcode or scan input',
    };
  }

  // Convert equipmentLookup into Map if necessary
  const eqMap = new Map<string, Equipment>();
  if (equipmentLookup instanceof Map) {
    for (const [k, v] of equipmentLookup.entries()) {
      eqMap.set(k, v);
    }
  } else if (Array.isArray(equipmentLookup)) {
    for (const eq of equipmentLookup) {
      if (eq.id) eqMap.set(eq.id, eq);
    }
  } else if (typeof equipmentLookup === 'object') {
    for (const [k, v] of Object.entries(equipmentLookup)) {
      eqMap.set(k, v);
    }
  }

  // Helper to check if a code matches an Equipment record
  const matchesEquipment = (eq: Equipment, code: string): boolean => {
    if (eq.id === code) return true;
    if (eq.barcode && eq.barcode.toLowerCase() === code.toLowerCase()) return true;
    if (eq.serialNumber && eq.serialNumber.toLowerCase() === code.toLowerCase()) return true;
    if (eq.assetNumber && eq.assetNumber.toLowerCase() === code.toLowerCase()) return true;
    if (eq.segAssetNumber && eq.segAssetNumber.toLowerCase() === code.toLowerCase()) return true;
    if (eq.serialNumbers?.some((sn) => sn.serial.toLowerCase() === code.toLowerCase())) return true;
    return false;
  };

  // Step 1: Search for match in pullsheet actionable items
  let matchedItem: PullsheetItem | null = null;
  let matchedEquipment: Equipment | undefined = undefined;

  for (const item of pullsheetItems) {
    if (item.type !== 'item' && item.type !== 'misc' && item.type !== 'sub-item') {
      continue;
    }

    // Direct item ID match
    if (item.id === cleanCode || item.inventoryItemId === cleanCode) {
      matchedItem = item;
      if (item.inventoryItemId) matchedEquipment = eqMap.get(item.inventoryItemId);
      break;
    }

    // Direct scannedBarcodes array match
    if (item.scannedBarcodes?.includes(cleanCode)) {
      matchedItem = item;
      if (item.inventoryItemId) matchedEquipment = eqMap.get(item.inventoryItemId);
      break;
    }

    // Linked equipment catalog match
    if (item.inventoryItemId) {
      const eq = eqMap.get(item.inventoryItemId);
      if (eq && matchesEquipment(eq, cleanCode)) {
        matchedItem = item;
        matchedEquipment = eq;
        break;
      }
    }

    // Fallback: description match if exact barcode format inside description
    if (item.description && item.description.toLowerCase() === cleanCode.toLowerCase()) {
      matchedItem = item;
      if (item.inventoryItemId) matchedEquipment = eqMap.get(item.inventoryItemId);
      break;
    }
  }

  // Step 2: Handle Match on Pull Sheet
  if (matchedItem) {
    if (targetStatus === 'deprepped') {
      const isCurrentlyPrepped =
        matchedItem.status === 'prepped_scanned' ||
        (matchedItem.scannedQuantity !== undefined && matchedItem.scannedQuantity > 0);

      if (!isCurrentlyPrepped) {
        return {
          type: 'INVALID_TRANSITION',
          item: matchedItem,
          equipment: matchedEquipment,
          targetStatus: 'deprepped',
          message: `Cannot deprep: "${matchedItem.description}" is not currently prepped`,
        };
      }

      return {
        type: 'SUCCESS',
        item: matchedItem,
        equipment: matchedEquipment,
        targetStatus: 'deprepped',
        newScannedCount: 0,
        message: `Deprepped: ${matchedItem.description}`,
      };
    }

    if (targetStatus === 'confirmed') {
      const isAlreadyConfirmed = matchedItem.status === 'confirmed';
      return {
        type: 'SUCCESS',
        item: matchedItem,
        equipment: matchedEquipment,
        targetStatus: 'confirmed',
        warningOnly: isAlreadyConfirmed,
        message: isAlreadyConfirmed
          ? `Already confirmed: ${matchedItem.description}`
          : `Confirmed: ${matchedItem.description}`,
      };
    }

    if (targetStatus === 'returned') {
      const wasUnprepped = matchedItem.status !== 'prepped_scanned' && matchedItem.status !== 'dispatched';
      return {
        type: 'SUCCESS',
        item: matchedItem,
        equipment: matchedEquipment,
        targetStatus: 'returned',
        warningOnly: wasUnprepped,
        message: wasUnprepped
          ? `Warning: Unprepped item marked Returned: ${matchedItem.description}`
          : `Returned: ${matchedItem.description}`,
      };
    }

    // Default: 'prepped_scanned'
    const targetQty = Math.max(1, matchedItem.quantity || 1);
    const currentScanned =
      matchedItem.scannedQuantity !== undefined
        ? matchedItem.scannedQuantity
        : matchedItem.status === 'prepped_scanned'
        ? targetQty
        : 0;

    if (currentScanned >= targetQty) {
      return {
        type: 'ALREADY_COMPLETED',
        item: matchedItem,
        equipment: matchedEquipment,
        targetStatus: 'prepped_scanned',
        newScannedCount: currentScanned,
        isFullyPrepped: true,
        warningOnly: true,
        message: `${matchedItem.description} is already fully prepped (${currentScanned}/${targetQty})`,
      };
    }

    const newScannedCount = currentScanned + 1;
    const isFullyPrepped = newScannedCount >= targetQty;

    return {
      type: 'SUCCESS',
      item: matchedItem,
      equipment: matchedEquipment,
      targetStatus: 'prepped_scanned',
      newScannedCount,
      isFullyPrepped,
      message: isFullyPrepped
        ? `Prepped: ${matchedItem.description} (Complete)`
        : `Prepped: ${matchedItem.description} (${newScannedCount}/${targetQty})`,
    };
  }

  // Step 3: Check if code exists in global equipment fleet but NOT on this pull sheet
  for (const eq of eqMap.values()) {
    if (matchesEquipment(eq, cleanCode)) {
      return {
        type: 'NOT_ON_PULLSHEET',
        equipment: eq,
        message: `"${eq.name || cleanCode}" is in fleet inventory, but not on this pull sheet`,
      };
    }
  }

  // Step 4: Unknown Code
  return {
    type: 'UNKNOWN_CODE',
    message: `Barcode "${cleanCode}" not recognized in catalog`,
  };
}

/**
 * Creates a throttle controller for high-throughput continuous scanning.
 * Ignores identical barcodes within `cooldownMs` (default 1200ms) while allowing
 * distinct barcodes to process instantly.
 */
export function createScanThrottle(cooldownMs: number = 1200) {
  let lastCode: string | null = null;
  let lastTimestamp = 0;

  return {
    shouldThrottle(code: string): boolean {
      const now = Date.now();
      const clean = (code || '').trim();

      if (clean === lastCode && now - lastTimestamp < cooldownMs) {
        return true; // Throttled duplicate
      }

      lastCode = clean;
      lastTimestamp = now;
      return false;
    },

    reset(): void {
      lastCode = null;
      lastTimestamp = 0;
    },

    getLastCode(): string | null {
      return lastCode;
    },

    getLastTimestamp(): number {
      return lastTimestamp;
    },
  };
}
