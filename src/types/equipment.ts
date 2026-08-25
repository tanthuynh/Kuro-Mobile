/**
 * src/types/equipment.ts
 * Authoritative TypeScript definitions for Equipment, Serial Numbers,
 * Categories, and Inventory Models in Kuro Mobile.
 */

export interface SerialNumber {
  id: string;
  serial: string;
  status: 'Available' | 'In Use' | 'In Repair' | 'Decommissioned';
  currentLocation?: string;
  notes?: string;
}

export interface EquipmentContent {
  id: string;
  quantity: number;
  description: string;
  internalNote?: string;
  caseType?: 'Fixed' | 'Non Fixed';
  cost: number;
  type: 'item' | 'note' | 'misc' | 'section-header' | 'section-footer' | 'sub-item';
  sectionId?: string;
  parentItemId?: string;
  hasContents?: boolean;
  inventoryItemId?: string;
}

export interface EquipmentCategory {
  id: string;
  name: string;
  parentId?: string;
  order?: number;
  tenantId?: string;
}

export interface Equipment {
  id: string;
  tenantId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  category?: string;
  categoryId?: string;
  barcode?: string;
  assetNumber?: string;
  segAssetNumber?: string;
  serialNumber?: string;
  serialNumbers?: SerialNumber[];
  knownLocation?: string;
  venue?: string;
  quantity?: number;
  consumedQuantity?: number;
  quantityDispatched?: number;
  quantityReturned?: number;
  price?: number;
  subrental_costs?: number;
  maxDiscount?: number;
  powerW?: number;
  weight?: number;
  weightWithContents?: number;
  height?: number;
  width?: number;
  length?: number;
  input?: string;
  output?: string;
  channels?: string;
  caseType?: 'Fixed' | 'Non Fixed' | 'Temporary' | 'None' | string;
  itemClass?: 'Sales' | 'Rental';
  equipmentType?: 'Physical' | 'Virtual' | 'Sub Rental';
  serialisation?: 'Yes' | 'No';
  notes?: string;
  archived?: boolean;
  manualUrl?: string;
  contents?: EquipmentContent[];
}
