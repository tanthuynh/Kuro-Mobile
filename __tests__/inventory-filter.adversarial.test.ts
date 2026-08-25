/**
 * __tests__/inventory-filter.adversarial.test.ts
 * Adversarial tests for Inventory Search Filtering, Category Chips, and Stock Levels
 */

interface EquipmentItem {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  category: string;
  barcode: string;
  serialNumber: string;
  availableQty: number;
  totalQty: number;
  status: 'Available' | 'Reserved' | 'In Repair';
  knownLocation: string;
}

const SAMPLE_EQUIPMENT: EquipmentItem[] = [
  {
    id: 'eq-1',
    name: 'K2 Line Array Enclosure',
    manufacturer: 'L-Acoustics',
    model: 'K2-3Way',
    category: 'Audio',
    barcode: 'BAR-LA-K2-001',
    serialNumber: 'SN-789012',
    availableQty: 24,
    totalQty: 32,
    status: 'Available',
    knownLocation: 'Warehouse Bay 2A',
  },
  {
    id: 'eq-2',
    name: 'Forte Spot Moving Head',
    manufacturer: 'Robe Lighting',
    model: 'ROBE-FORTE-HP',
    category: 'Lighting',
    barcode: 'BAR-RB-FRT-014',
    serialNumber: 'SN-552910',
    availableQty: 12,
    totalQty: 16,
    status: 'Reserved',
    knownLocation: 'Sydney Showground Hall 5',
  },
  {
    id: 'eq-3',
    name: 'Aquilon RS4 4K Video Processor',
    manufacturer: 'Analog Way',
    model: 'RS4-4K60',
    category: 'Video',
    barcode: 'BAR-AW-AQ4-002',
    serialNumber: 'SN-110934',
    availableQty: 2,
    totalQty: 2,
    status: 'Available',
    knownLocation: 'Video Rack Prep Room',
  },
  {
    id: 'eq-4',
    name: 'ProStar 500kg Electric Chain Hoist',
    manufacturer: 'CM Columbus McKinnon',
    model: 'PS-500-24M',
    category: 'Rigging',
    barcode: 'BAR-CM-PS5-033',
    serialNumber: 'SN-902184',
    availableQty: 0,
    totalQty: 18,
    status: 'In Repair',
    knownLocation: 'Rigging Service Workshop',
  },
  {
    id: 'eq-5',
    name: 'Socapex 19-Pin Multi-Cable 20m',
    manufacturer: 'Titanex',
    model: 'SOC-19-20M',
    category: 'Cables',
    barcode: 'BAR-CAB-SOC-050',
    serialNumber: 'SN-CAB-50',
    availableQty: 45,
    totalQty: 60,
    status: 'Available',
    knownLocation: 'Cable Warehouse Bins',
  },
];

function filterInventory(searchQuery: string, selectedCategory: string): EquipmentItem[] {
  return SAMPLE_EQUIPMENT.filter((item) => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.manufacturer.toLowerCase().includes(q) ||
      item.model.toLowerCase().includes(q) ||
      item.barcode.toLowerCase().includes(q) ||
      item.serialNumber.toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });
}

describe('Inventory Search, Category Filtering & Edge Cases', () => {
  describe('Category Chip Filtering', () => {
    it('returns all 5 items when category is All', () => {
      const results = filterInventory('', 'All');
      expect(results.length).toBe(5);
    });

    it('filters strictly by Audio category', () => {
      const results = filterInventory('', 'Audio');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('K2 Line Array Enclosure');
    });

    it('filters strictly by Lighting category', () => {
      const results = filterInventory('', 'Lighting');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Forte Spot Moving Head');
    });

    it('filters strictly by Rigging category', () => {
      const results = filterInventory('', 'Rigging');
      expect(results.length).toBe(1);
      expect(results[0].name).toContain('Electric Chain Hoist');
    });

    it('returns empty list for category with no stock (e.g. Comms or Staging)', () => {
      const resultsComms = filterInventory('', 'Comms');
      expect(resultsComms.length).toBe(0);

      const resultsStaging = filterInventory('', 'Staging');
      expect(resultsStaging.length).toBe(0);
    });
  });

  describe('Search Query Text Filtering', () => {
    it('matches by partial name (case-insensitive)', () => {
      const results = filterInventory('forte', 'All');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('eq-2');
    });

    it('matches by manufacturer', () => {
      const results = filterInventory('Analog Way', 'All');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('eq-3');
    });

    it('matches by exact barcode', () => {
      const results = filterInventory('BAR-CAB-SOC-050', 'All');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('eq-5');
    });

    it('matches by serial number prefix or substring', () => {
      const results = filterInventory('902184', 'All');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('eq-4');
    });

    it('matches by model identifier', () => {
      const results = filterInventory('RS4-4K60', 'All');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('eq-3');
    });
  });

  describe('Adversarial Search Input & Edge Cases', () => {
    it('handles search queries with extraneous spaces', () => {
      const results = filterInventory('   k2   ', 'All');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('eq-1');
    });

    it('handles regex special characters without throwing error', () => {
      // Inputs containing parentheses, brackets, question marks, asterisks
      expect(() => filterInventory('(', 'All')).not.toThrow();
      expect(() => filterInventory('[', 'All')).not.toThrow();
      expect(() => filterInventory('.*', 'All')).not.toThrow();
      expect(() => filterInventory('+?^${}()|[]\\', 'All')).not.toThrow();
    });

    it('returns empty array when query does not match any property', () => {
      const results = filterInventory('nonexistent-item-9999', 'All');
      expect(results.length).toBe(0);
    });

    it('correctly applies AND logic between category and search query', () => {
      // K2 is Audio, searching for K2 in Lighting category must return 0
      const mismatchResults = filterInventory('K2', 'Lighting');
      expect(mismatchResults.length).toBe(0);

      // Searching for K2 in Audio category returns 1
      const matchResults = filterInventory('K2', 'Audio');
      expect(matchResults.length).toBe(1);
    });
  });

  describe('Stock Level & Availability Indicators', () => {
    it('correctly reflects items in repair with 0 available quantity', () => {
      const inRepairItem = SAMPLE_EQUIPMENT.find((i) => i.status === 'In Repair');
      expect(inRepairItem).toBeDefined();
      expect(inRepairItem?.availableQty).toBe(0);
      expect(inRepairItem?.totalQty).toBeGreaterThan(0);
    });

    it('correctly reflects available stock ratio', () => {
      const k2 = SAMPLE_EQUIPMENT.find((i) => i.id === 'eq-1');
      expect(k2?.availableQty).toBe(24);
      expect(k2?.totalQty).toBe(32);
      expect((k2?.availableQty || 0) / (k2?.totalQty || 1)).toBe(0.75);
    });
  });
});
