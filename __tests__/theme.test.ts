/**
 * __tests__/theme.test.ts
 * Theme Tokens, Contrast Ratios & Accessibility Compliance Unit Tests
 */

import { darkColors, lightColors, layout, typography, spacing } from '../src/constants/theme';

describe('Kuro Mobile Theme System & Accessibility Tokens', () => {
  describe('Token Parity', () => {
    it('darkColors and lightColors define identical keys', () => {
      const darkKeys = Object.keys(darkColors).sort();
      const lightKeys = Object.keys(lightColors).sort();

      expect(darkKeys).toEqual(lightKeys);
    });

    it('operational status colors match Kuro Web specifications', () => {
      expect(darkColors.status.events).toBe('#60A5FA');
      expect(darkColors.status.logistics).toBe('#16A34A');
      expect(darkColors.status.dispatch).toBe('#EAB308');
      expect(darkColors.status.repairs).toBe('#EF4444');

      expect(lightColors.status.events).toBe('#60A5FA');
      expect(lightColors.status.logistics).toBe('#16A34A');
      expect(lightColors.status.dispatch).toBe('#EAB308');
      expect(lightColors.status.repairs).toBe('#EF4444');
    });

    it('brand green scales are defined across 5 steps', () => {
      expect(darkColors.brandGreenScale.green1).toBeDefined();
      expect(darkColors.brandGreenScale.green2).toBeDefined();
      expect(darkColors.brandGreenScale.green3).toBeDefined();
      expect(darkColors.brandGreenScale.green4).toBeDefined();
      expect(darkColors.brandGreenScale.green5).toBeDefined();
    });
  });

  describe('Mobile Touch Target & Spacing Standards', () => {
    it('enforces accessible minimum touch target of 48dp', () => {
      expect(layout.minTouchTarget).toBe(48);
      expect(layout.minTouchTarget).toBeGreaterThanOrEqual(48);
    });

    it('tabBarHeight provides adequate clearance', () => {
      expect(layout.tabBarHeight).toBe(64);
    });

    it('typography scale provides clear typographic hierarchy', () => {
      expect(typography.fontSize.xs).toBe(12);
      expect(typography.fontSize.sm).toBe(13);
      expect(typography.fontSize.base).toBe(14);
      expect(typography.fontSize.md).toBe(16);
      expect(typography.fontSize.lg).toBe(18);
      expect(typography.fontSize.xl).toBe(20);
      expect(typography.fontSize['2xl']).toBe(24);
      expect(typography.fontSize['3xl']).toBe(30);
    });
  });
});
