/**
 * __tests__/m1-immutability-stress.challenge.test.ts
 * Deep adversarial stress test on state machine immutability & defensive copying.
 */

import {
  getAvailableStatusTransitions,
  getQuickStatusOptions,
  CANONICAL_REPAIR_STATUSES,
  STATUS_TRANSITIONS_GRAPH,
  QUICK_STATUS_OPTIONS,
  calculateRepairCostTotal,
} from '@/lib/repair-engine';
import type { RepairStatus } from '@/types/repair';

describe('Tier 5 Immutability & Defensive Copying Stress Harness', () => {
  it('CHALLENGE-IMM-01: Aggressive array mutation of getAvailableStatusTransitions results does not corrupt internal graph', () => {
    for (const status of CANONICAL_REPAIR_STATUSES) {
      const canonicalBaseline = [...(STATUS_TRANSITIONS_GRAPH[status] || [])];

      // Call 1: mutate with push
      const arr1 = getAvailableStatusTransitions(status);
      arr1.push('CORRUPTED_STATUS' as RepairStatus);
      arr1.push('Decommissioned');

      // Call 2: mutate with pop and splice
      const arr2 = getAvailableStatusTransitions(status);
      expect(arr2).toEqual(canonicalBaseline);
      arr2.pop();
      arr2.splice(0, arr2.length);

      // Call 3: mutate with reverse and sort
      const arr3 = getAvailableStatusTransitions(status);
      expect(arr3).toEqual(canonicalBaseline);
      arr3.reverse();

      // Call 4: verify untouched
      const arr4 = getAvailableStatusTransitions(status);
      expect(arr4).toEqual(canonicalBaseline);
    }
  });

  it('CHALLENGE-IMM-02: Aggressive array mutation of getQuickStatusOptions results does not corrupt internal graph', () => {
    for (const status of CANONICAL_REPAIR_STATUSES) {
      const canonicalBaseline = [...(QUICK_STATUS_OPTIONS[status] || [])];

      // Call 1: mutate with push
      const arr1 = getQuickStatusOptions(status);
      arr1.push('CORRUPTED_STATUS' as RepairStatus);

      // Call 2: mutate with splice
      const arr2 = getQuickStatusOptions(status);
      expect(arr2).toEqual(canonicalBaseline);
      arr2.splice(0, 1);

      // Call 3: mutate with reverse
      const arr3 = getQuickStatusOptions(status);
      expect(arr3).toEqual(canonicalBaseline);
      arr3.reverse();

      // Call 4: verify untouched
      const arr4 = getQuickStatusOptions(status);
      expect(arr4).toEqual(canonicalBaseline);
    }
  });

  it('CHALLENGE-CST-01: Cost calculation handles adversarial part combinations', () => {
    const maliciousParts: any[] = [
      null,
      undefined,
      {},
      { quantity: NaN, cost: 50 },
      { quantity: 5, cost: NaN },
      { quantity: '10' as any, cost: 20 },
      { quantity: 2, cost: '30' as any },
      { quantity: 2, cost: 12.3456 }, // 24.6912
      { quantity: 3, cost: 5.1 },      // 15.3
    ];

    const total = calculateRepairCostTotal(maliciousParts, NaN);
    // 2 * 12.3456 + 3 * 5.1 = 24.6912 + 15.3 = 39.9912 -> rounded to 39.99
    expect(total).toBe(39.99);
    expect(Number.isFinite(total)).toBe(true);
    expect(isNaN(total)).toBe(false);
  });
});
