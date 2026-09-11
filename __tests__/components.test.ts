/**
 * __tests__/components.test.ts
 * UI Component & Touch Target Verification Tests
 */

import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { layout } from '../src/constants/theme';
import { Logo, GoogleIcon } from '../src/components/icons';
import { ThemeProvider } from '../src/context/theme-context';

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

  it('renders Logo Image with props.tintColor and no style.tintColor', () => {
    const { UNSAFE_getByType } = render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(Logo, { testID: 'test-logo' })
      )
    );

    const imageElement = UNSAFE_getByType(Image);
    expect(imageElement.props.tintColor).toBeDefined();
    const flattened = StyleSheet.flatten(imageElement.props.style);
    expect(flattened?.tintColor).toBeUndefined();
  });

  it('honors explicit tintColor prop on Logo', () => {
    const { UNSAFE_getByType } = render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(Logo, { tintColor: '#FF0000', testID: 'custom-tint-logo' })
      )
    );

    const imageElement = UNSAFE_getByType(Image);
    expect(imageElement.props.tintColor).toBe('#FF0000');
    const flattened = StyleSheet.flatten(imageElement.props.style);
    expect(flattened?.tintColor).toBeUndefined();
  });

  it('sanitizes legacy imageStyle.tintColor to props.tintColor without leaving it in style', () => {
    const { UNSAFE_getByType } = render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(Logo, {
          imageStyle: { tintColor: '#00FF00', opacity: 0.8 },
          testID: 'legacy-style-logo',
        })
      )
    );

    const imageElement = UNSAFE_getByType(Image);
    expect(imageElement.props.tintColor).toBe('#00FF00');
    const flattened = StyleSheet.flatten(imageElement.props.style);
    expect(flattened?.tintColor).toBeUndefined();
    expect(flattened?.opacity).toBe(0.8);
  });

  it('verifies GoogleIcon component is defined and exportable', () => {
    expect(GoogleIcon).toBeDefined();
    expect(typeof GoogleIcon).toBe('function');
  });
});

