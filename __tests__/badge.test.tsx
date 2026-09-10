/**
 * __tests__/badge.test.tsx
 * Unit Tests for Badge Component
 * Verifies robust text handling, composite expressions, custom React elements,
 * icon rendering, edge cases, and variant styles without leaking raw text nodes into <View>.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Badge, type BadgeVariant } from '../src/components/ui/badge';
import { ThemeProvider } from '../src/context/theme-context';

describe('<Badge /> Component', () => {
  const renderBadge = (ui: React.ReactElement) => {
    return render(<ThemeProvider>{ui}</ThemeProvider>);
  };

  describe('R1: Robust Text Handling', () => {
    it('renders single string child safely inside <Text>', () => {
      const { getByText, getByTestId } = renderBadge(
        <Badge testID="single-string-badge">Active Status</Badge>
      );

      const textElement = getByText('Active Status');
      expect(textElement).toBeTruthy();
      expect(getByTestId('single-string-badge')).toBeTruthy();
    });

    it('renders single positive number child safely inside <Text>', () => {
      const { getByText, getByTestId } = renderBadge(
        <Badge testID="number-badge">{42}</Badge>
      );

      expect(getByText('42')).toBeTruthy();
      expect(getByTestId('number-badge')).toBeTruthy();
    });

    it('renders zero (0) number child safely inside <Text> without leaking text node to <View>', () => {
      const { getByText, getByTestId } = renderBadge(
        <Badge testID="zero-badge">{0}</Badge>
      );

      expect(getByText('0')).toBeTruthy();
      expect(getByTestId('zero-badge')).toBeTruthy();
    });

    it('renders composite text expressions (JSX interpolation) safely inside <Text>', () => {
      const count = 5;
      const { getByText, getByTestId } = renderBadge(
        <Badge testID="composite-badge">
          Scanner Active ({count} items)
        </Badge>
      );

      expect(getByText('Scanner Active (5 items)')).toBeTruthy();
      expect(getByTestId('composite-badge')).toBeTruthy();
    });

    it('renders composite text expressions with zero count safely inside <Text>', () => {
      const count = 0;
      const { getByText } = renderBadge(
        <Badge testID="composite-zero-badge">
          Scanner Active ({count} items)
        </Badge>
      );

      expect(getByText('Scanner Active (0 items)')).toBeTruthy();
    });

    it('renders array of primitive text and number expressions safely inside <Text>', () => {
      const { getByText } = renderBadge(
        <Badge>{['Item #', 101, ' - ', 'Prepped']}</Badge>
      );

      expect(getByText('Item #101 - Prepped')).toBeTruthy();
    });

    it('ensures NO raw string is a direct child of the container <View>', () => {
      const count = 3;
      const { toJSON, getByTestId } = renderBadge(
        <Badge testID="tree-check-badge">
          Scanner Active ({count} items)
        </Badge>
      );

      const tree = toJSON();
      // Verify root is View and its children are elements (Text), never raw strings
      expect(tree).toBeDefined();
      expect((tree as any).type).toBe('View');
      const viewChildren = (tree as any).children;
      expect(Array.isArray(viewChildren)).toBe(true);
      expect(viewChildren.length).toBe(1);
      // The child must be a Text component
      expect(viewChildren[0].type).toBe('Text');
      // The Text component contains the text fragments
      expect(viewChildren[0].children).toEqual(['Scanner Active (', '3', ' items)']);
    });
  });

  describe('Preservation of Custom React Elements', () => {
    it('preserves custom React element children without wrapping them in extra <Text>', () => {
      const { getByTestId, getByText, toJSON } = renderBadge(
        <Badge testID="custom-element-badge">
          <View testID="custom-child-view">
            <Text>Custom Inner Content</Text>
          </View>
        </Badge>
      );

      expect(getByTestId('custom-element-badge')).toBeTruthy();
      expect(getByTestId('custom-child-view')).toBeTruthy();
      expect(getByText('Custom Inner Content')).toBeTruthy();

      const tree = toJSON();
      const viewChildren = (tree as any).children;
      expect(viewChildren[0].type).toBe('View');
      expect(viewChildren[0].props.testID).toBe('custom-child-view');
    });

    it('preserves custom <Text> children directly without double-wrapping', () => {
      const { getByTestId } = renderBadge(
        <Badge>
          <Text testID="direct-custom-text">Pre-formatted Text</Text>
        </Badge>
      );

      expect(getByTestId('direct-custom-text')).toBeTruthy();
    });

    it('handles mixed array of custom React elements and text primitives', () => {
      const { getByTestId, getByText, toJSON } = renderBadge(
        <Badge testID="mixed-badge">
          {[
            <View key="custom-icon" testID="inline-icon" />,
            ' Scanned: ',
            12,
            ' items',
          ]}
        </Badge>
      );

      expect(getByTestId('mixed-badge')).toBeTruthy();
      expect(getByTestId('inline-icon')).toBeTruthy();
      expect(getByText(' Scanned: 12 items')).toBeTruthy();

      const tree = toJSON();
      const children = (tree as any).children;
      expect(children.length).toBe(2);
      expect(children[0].type).toBe('View');
      expect(children[0].props.testID).toBe('inline-icon');
      expect(children[1].type).toBe('Text');
    });
  });

  describe('Icon Prop & Layout', () => {
    it('renders icon prop alongside children', () => {
      const { getByTestId, getByText } = renderBadge(
        <Badge
          icon={<View testID="badge-icon-elem" />}
          testID="icon-badge"
        >
          Status With Icon
        </Badge>
      );

      expect(getByTestId('icon-badge')).toBeTruthy();
      expect(getByTestId('badge-icon-elem')).toBeTruthy();
      expect(getByText('Status With Icon')).toBeTruthy();
    });
  });

  describe('Edge Cases & Null Safety', () => {
    it('renders safely when children is null', () => {
      const { getByTestId } = renderBadge(
        <Badge testID="null-badge">{null}</Badge>
      );
      expect(getByTestId('null-badge')).toBeTruthy();
    });

    it('renders safely when children is undefined', () => {
      const { getByTestId } = renderBadge(
        <Badge testID="undefined-badge">{undefined}</Badge>
      );
      expect(getByTestId('undefined-badge')).toBeTruthy();
    });

    it('renders safely when children is boolean false', () => {
      const { getByTestId } = renderBadge(
        <Badge testID="false-badge">{false}</Badge>
      );
      expect(getByTestId('false-badge')).toBeTruthy();
    });

    it('renders safely when children is an empty string', () => {
      const { getByTestId } = renderBadge(
        <Badge testID="empty-string-badge">{''}</Badge>
      );
      expect(getByTestId('empty-string-badge')).toBeTruthy();
    });

    it('renders safely with nested primitive arrays containing nulls', () => {
      const { getByText } = renderBadge(
        <Badge>{[['Prefix: ', null], false, ['Ready']]}</Badge>
      );
      expect(getByText('Prefix: Ready')).toBeTruthy();
    });
  });

  describe('Variants & Styling', () => {
    const variants: BadgeVariant[] = [
      'default',
      'secondary',
      'destructive',
      'outline',
      'success',
      'warning',
      'info',
      'brand',
    ];

    variants.forEach((variant) => {
      it(`renders variant "${variant}" with text cleanly`, () => {
        const { getByText, getByTestId } = renderBadge(
          <Badge variant={variant} testID={`badge-${variant}`}>
            {variant.toUpperCase()}
          </Badge>
        );

        expect(getByTestId(`badge-${variant}`)).toBeTruthy();
        expect(getByText(variant.toUpperCase())).toBeTruthy();
      });
    });

    it('applies custom style and textStyle props', () => {
      const customStyle = { backgroundColor: '#123456' };
      const customTextStyle = { fontSize: 20, color: '#abcdef' };

      const { getByTestId, getByText } = renderBadge(
        <Badge
          testID="custom-style-badge"
          style={customStyle}
          textStyle={customTextStyle}
        >
          Custom Styled
        </Badge>
      );

      const container = getByTestId('custom-style-badge');
      expect(container.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining(customStyle)])
      );

      const text = getByText('Custom Styled');
      expect(text.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining(customTextStyle)])
      );
    });
  });
});
