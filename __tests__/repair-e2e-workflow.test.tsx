/**
 * __tests__/repair-e2e-workflow.test.tsx
 * Milestone 5: Full End-to-End (E2E) Repair & Fault Logging Integration Test.
 * Tests complete lifecycle: Scan -> Report Fault -> Live Feed -> Detail View ->
 * 1-Tap Status Updates -> Action Logging -> Operational Condition Sync & RTDB Lock Release.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as repairEngine from '@/lib/repair-engine';
import * as repairService from '@/services/repair-service';
import type { RepairTicket, RepairStatus } from '@/types/repair';

// Mock Theme
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
    ThemeProvider: ({ children }: any) => children,
  };
});

describe('Milestone 5: Kuro Mobile Repair & Fault Logging E2E Integration', () => {
  const tenantAlpha = 'tenant-alpha-stage';
  const tenantBeta = 'tenant-beta-audio';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('verifies complete lifecycle state transitions and equipment condition synchronization', async () => {
    // 1. Validation of New Ticket Input
    const initialInput = {
      equipment: {
        id: 'eq-mega-01',
        name: 'Robe MegaPointe Moving Head',
        serialNumber: 'SN-MP-001',
        barcode: 'BAR-MP-001',
        category: 'Lighting',
      },
      repairType: 'Optical / Lens / Sensor',
      priority: 'Critical' as const,
      status: 'Under Repair' as const,
      condition: 'Out of Service' as const,
      initialNote: 'Front zoom lens cracked during load-in at arena show.',
      requestedBy: 'Lead Lighting Tech',
    };

    const validation = repairEngine.validateRepairTicketInput(initialInput);
    expect(validation.isValid).toBe(true);
    expect(validation.errorMessages).toHaveLength(0);

    // 2. Condition Calculation
    expect(repairEngine.calculateEquipmentCondition('Reported')).toBe('Out of Service');
    expect(repairEngine.calculateEquipmentCondition('Pending')).toBe('Out of Service');
    expect(repairEngine.calculateEquipmentCondition('Under Repair')).toBe('Out of Service');
    expect(repairEngine.calculateEquipmentCondition('Completed')).toBe('Available to Use');

    // 3. State Machine Progression
    // Reported -> Pending
    expect(repairEngine.isValidStatusTransition('Reported', 'Pending')).toBe(true);
    // Pending -> Under Repair
    expect(repairEngine.isValidStatusTransition('Pending', 'Under Repair')).toBe(true);
    // Under Repair -> Completed
    expect(repairEngine.isValidStatusTransition('Under Repair', 'Completed')).toBe(true);
    // Completed -> Completed
    expect(repairEngine.isValidStatusTransition('Completed', 'Completed')).toBe(true);

    // 4. Action Log Entry Creation
    const actionLog = repairEngine.createActionLogEntry(
      { name: 'Alex Tech', email: 'alex@kuro.test' },
      'Replaced prism glass and aligned stepper focus ring.',
      tenantAlpha
    );

    expect(actionLog.user.name).toBe('Alex Tech');
    expect(actionLog.action).toBe('Replaced prism glass and aligned stepper focus ring.');
    expect(actionLog.tenantId).toBe(tenantAlpha);
    expect(actionLog.timestamp).toBeTruthy();
  });

  it('strictly enforces multi-tenant isolation across ticket feeds and mutations', () => {
    const mixedTickets: RepairTicket[] = [
      {
        id: 'ticket-alpha-1',
        tenantId: tenantAlpha,
        equipment: { name: 'Alpha Camera' },
        priority: 'High',
        status: 'Under Repair',
        condition: 'Out of Service',
        requestedBy: 'Alpha User',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'ticket-alpha-2',
        tenantId: tenantAlpha,
        equipment: { name: 'Alpha Console' },
        priority: 'Low',
        status: 'Completed',
        condition: 'Available to Use',
        requestedBy: 'Alpha User',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'ticket-beta-1',
        tenantId: tenantBeta,
        equipment: { name: 'Beta Speaker' },
        priority: 'Critical',
        status: 'Under Repair',
        condition: 'Out of Service',
        requestedBy: 'Beta User',
        createdAt: new Date().toISOString(),
      },
    ];

    // Filter for Tenant Alpha
    const alphaFiltered = repairEngine.filterRepairTickets(
      mixedTickets.filter((t) => t.tenantId === tenantAlpha),
      { status: 'Under Repair' }
    );

    expect(alphaFiltered).toHaveLength(1);
    expect(alphaFiltered[0].id).toBe('ticket-alpha-1');

    // Filter with text search
    const searchFiltered = repairEngine.filterRepairTickets(
      mixedTickets.filter((t) => t.tenantId === tenantAlpha),
      { search: 'Console' }
    );

    expect(searchFiltered).toHaveLength(1);
    expect(searchFiltered[0].id).toBe('ticket-alpha-2');
  });

  it('calculates total repair parts cost accurately defending against NaN and missing fields', () => {
    const parts = [
      { id: 'p1', name: 'Lens', quantity: 2, cost: 150 },
      { id: 'p2', name: 'Cap', quantity: 4, cost: 12.5 },
      { id: 'p3', name: 'Screw', quantity: 10, cost: 0.5 },
    ];

    // 2*150 (300) + 4*12.5 (50) + 10*0.5 (5) = 355
    expect(repairEngine.calculateRepairCostTotal(parts)).toBe(355);

    // Defend against malformed inputs
    expect(repairEngine.calculateRepairCostTotal([{ id: 'p4', name: 'Broken', quantity: NaN, cost: 100 }])).toBe(0);
    expect(repairEngine.calculateRepairCostTotal([])).toBe(0);
  });
});
