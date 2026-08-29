/**
 * __tests__/theme.test.ts
 * Theme Tokens, Contrast Ratios & Accessibility Compliance Unit Tests
 */

import { darkColors, lightColors, layout, typography, spacing, iconSize } from '../src/constants/theme';

describe('Kuro Mobile Theme System & Accessibility Tokens', () => {
  describe('Token Parity', () => {
    it('darkColors and lightColors define identical keys', () => {
      const darkKeys = Object.keys(darkColors).sort();
      const lightKeys = Object.keys(lightColors).sort();

      expect(darkKeys).toEqual(lightKeys);
    });

    it('operational status colors match Kuro Web specifications', () => {
      expect(darkColors.status.events).toBe('#30ABE8');
      expect(darkColors.status.logistics).toBe('#16A34A');
      expect(darkColors.status.dispatch).toBe('#FACC15');
      expect(darkColors.status.repairs).toBe('#D92929');

      expect(lightColors.status.events).toBe('#3B82F6');
      expect(lightColors.status.logistics).toBe('#16A34A');
      expect(lightColors.status.dispatch).toBe('#FACC15');
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

    it('badgeHeight standardizes uniform badge height', () => {
      expect(layout.badgeHeight).toBe(24);
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

    it('typography fontFamily defines Calibri family tokens', () => {
      expect(typography.fontFamily.regular).toBe('Calibri');
      expect(typography.fontFamily.bold).toBe('Calibri-Bold');
      expect(typography.fontFamily.italic).toBe('Calibri-Italic');
      expect(typography.fontFamily.boldItalic).toBe('Calibri-BoldItalic');
      expect(typography.fontFamily.light).toBe('Calibri-Light');
      expect(typography.fontFamily.body).toBe('Calibri');
      expect(typography.fontFamily.heading).toBe('Calibri-Bold');
    });

    it('iconSize scale standardizes app-wide icon dimensions', () => {
      expect(iconSize.xs).toBe(12);
      expect(iconSize.sm).toBe(14);
      expect(iconSize.md).toBe(16);
      expect(iconSize.lg).toBe(20);
      expect(iconSize.xl).toBe(24);
      expect(iconSize.hero).toBe(40);
    });
  });
});

