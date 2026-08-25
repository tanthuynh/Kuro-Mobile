/**
 * __tests__/inventory.test.tsx
 * Unit and integration tests for Milestone 4: Equipment Inventory & Lookup.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { renderHook } from '@testing-library/react-native';
import { CategoryFilterBar } from '@/components/inventory/category-filter-bar';
import { EquipmentCard } from '@/components/inventory/equipment-card';
import { useEquipment } from '@/hooks/use-equipment';
import * as equipmentService from '@/services/equipment-service';
import type { Equipment } from '@/types/equipment';

// Mock theme
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => ({
      colors: actualTheme.darkColors,
      typography: actualTheme.typography,
      spacing: actualTheme.spacing,
      layout: actualTheme.layout,
      isDark: true,
    }),
  };
});

// Mock auth
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      uid: 'user-123',
      tenantId: 'tenant-abc',
      firstName: 'Alex',
    },
    tenant: {
      tenantId: 'tenant-abc',
      tenantName: 'Amia Productions',
    },
    isAuthenticated: true,
  }),
}));

const sampleCatalog: Equipment[] = [
  {
    id: 'eq-1',
    tenantId: 'tenant-abc',
    name: 'K2 Line Array Enclosure',
    manufacturer: 'L-Acoustics',
    model: 'K2-3Way',
    category: 'Audio',
    barcode: 'BAR-LA-K2-001',
    serialNumber: 'SN-789012',
    quantity: 24,
    consumedQuantity: 4,
    knownLocation: 'Warehouse Bay 2A',
    powerW: 1800,
    weight: 56,
    serialNumbers: [
      { id: 'sn-1', serial: 'SN-789012', status: 'Available' },
      { id: 'sn-2', serial: 'SN-789013', status: 'In Use' },
    ],
  },
  {
    id: 'eq-2',
    tenantId: 'tenant-abc',
    name: 'Forte Spot Moving Head',
    manufacturer: 'Robe Lighting',
    model: 'ROBE-FORTE',
    category: 'Lighting',
    barcode: 'BAR-RB-FRT-014',
    serialNumber: 'SN-552910',
    quantity: 12,
    consumedQuantity: 12,
    knownLocation: 'Sydney Showground',
    powerW: 1200,
    weight: 39,
  },
  {
    id: 'eq-3',
    tenantId: 'tenant-abc',
    name: 'ProStar 500kg Electric Hoist',
    manufacturer: 'CM Columbus McKinnon',
    model: 'PS-500',
    category: 'Rigging',
    barcode: 'BAR-CM-PS5-033',
    serialNumber: 'SN-902184',
    quantity: 6,
    consumedQuantity: 0,
    serialNumbers: [
      { id: 'sn-3', serial: 'SN-902184', status: 'In Repair' },
    ],
  },
];

describe('Milestone 4: Equipment Inventory UI & Search', () => {
  describe('CategoryFilterBar', () => {
    it('renders category chips and triggers selection', () => {
      const onSelect = jest.fn();
      const { getByText, getByTestId } = render(
        <CategoryFilterBar selectedCategory="Audio" onSelectCategory={onSelect} />
      );

      expect(getByText('Audio')).toBeTruthy();
      expect(getByText('Lighting')).toBeTruthy();
      expect(getByText('Video')).toBeTruthy();

      fireEvent.press(getByTestId('inventory-cat-chip-lighting'));
      expect(onSelect).toHaveBeenCalledWith('Lighting');
    });
  });

  describe('EquipmentCard', () => {
    it('renders equipment details, stock levels, and specs', () => {
      const onPress = jest.fn();
      const { getByText } = render(
        <EquipmentCard item={sampleCatalog[0]} onPress={onPress} />
      );

      expect(getByText('L-Acoustics')).toBeTruthy();
      expect(getByText('K2 Line Array Enclosure')).toBeTruthy();
      expect(getByText('Available')).toBeTruthy();
      expect(getByText('BAR-LA-K2-001')).toBeTruthy();
      expect(getByText('Warehouse Bay 2A')).toBeTruthy();
      expect(getByText('1800 W')).toBeTruthy();
      expect(getByText('56 kg')).toBeTruthy();
      expect(getByText('20 / 24 units available')).toBeTruthy();
      expect(getByText('2 Serials')).toBeTruthy();

      fireEvent.press(getByText('K2 Line Array Enclosure'));
      expect(onPress).toHaveBeenCalledWith(sampleCatalog[0]);
    });
  });

  describe('useEquipment Hook', () => {
    it('subscribes to live catalog, searches multi-fields, and computes metrics', async () => {
      jest.spyOn(equipmentService, 'subscribeEquipment').mockImplementation((tenantId, onData) => {
        onData(sampleCatalog);
        return jest.fn();
      });

      const { result } = renderHook(() => useEquipment());

      expect(result.current.loading).toBe(false);
      expect(result.current.equipment.length).toBe(3);
      expect(result.current.metrics.totalItems).toBe(3);
      expect(result.current.metrics.availableCount).toBe(26); // 20 + 0 + 6

      // Multi-key lookup map
      expect(result.current.equipmentLookupMap.has('eq-1')).toBe(true);
      expect(result.current.equipmentLookupMap.has('bar-la-k2-001')).toBe(true);
      expect(result.current.equipmentLookupMap.has('sn-789012')).toBe(true);

      // Search by keyword
      act(() => {
        result.current.setSearchQuery('Robe');
      });
      expect(result.current.filteredEquipment.length).toBe(1);
      expect(result.current.filteredEquipment[0].name).toBe('Forte Spot Moving Head');

      // Filter by category
      act(() => {
        result.current.setSearchQuery('');
        result.current.setSelectedCategory('Rigging');
      });
      expect(result.current.filteredEquipment.length).toBe(1);
      expect(result.current.filteredEquipment[0].name).toBe('ProStar 500kg Electric Hoist');

      // Filter by availability
      act(() => {
        result.current.setSelectedCategory('All');
        result.current.setAvailabilityFilter('In Repair');
      });
      expect(result.current.filteredEquipment.length).toBe(1);
      expect(result.current.filteredEquipment[0].category).toBe('Rigging');
    });
  });
});
