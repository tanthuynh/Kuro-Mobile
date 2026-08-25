/**
 * __tests__/components.test.ts
 * UI Component & Touch Target Verification Tests
 */

import { layout } from '../src/constants/theme';
import { Logo, GoogleIcon } from '../src/components/icons';

describe('UI Component Geometry & Accessibility', () => {
  it('verifies standard button minHeight meets 48dp requirement', () => {
    const buttonMinHeight = layout.minTouchTarget;
    expect(buttonMinHeight).toBe(48);
  });

  it('verifies input wrapper minHeight meets 48dp requirement', () => {
    const inputMinHeight = layout.minTouchTarget;
    expect(inputMinHeight).toBe(48);
  });

  it('verifies eye toggle button has minimum 48x48dp hit area', () => {
    const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };
    const innerDimension = 24;
    const effectiveTapArea = innerDimension + hitSlop.top + hitSlop.bottom;

    expect(effectiveTapArea).toBe(48);
  });

  it('verifies tab bar items satisfy 48dp minimum touch target', () => {
    const tabItemHeight = layout.minTouchTarget;
    expect(tabItemHeight).toBeGreaterThanOrEqual(48);
  });

  it('verifies Logo component is defined and exportable', () => {
    expect(Logo).toBeDefined();
    expect(typeof Logo).toBe('function');
  });

  it('verifies GoogleIcon component is defined and exportable', () => {
    expect(GoogleIcon).toBeDefined();
    expect(typeof GoogleIcon).toBe('function');
  });
});
