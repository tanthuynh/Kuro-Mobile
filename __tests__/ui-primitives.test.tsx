/**
 * __tests__/ui-primitives.test.tsx
 * Unit & Accessibility Tests for EmptyState and ModalSheet primitives
 */

import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '../src/components/ui/empty-state';
import { ModalSheet } from '../src/components/ui/modal-sheet';
import { ThemeProvider } from '../src/context/theme-context';

describe('Modular UI Primitives', () => {
  describe('<EmptyState />', () => {
    it('renders title and description correctly', () => {
      const { getByText, getByTestId } = render(
        <ThemeProvider>
          <EmptyState
            title="No Items Available"
            description="Please check back later or modify your filters."
            testID="test-empty-state"
          />
        </ThemeProvider>
      );

      expect(getByText('No Items Available')).toBeTruthy();
      expect(getByText('Please check back later or modify your filters.')).toBeTruthy();
      expect(getByTestId('test-empty-state')).toBeTruthy();
    });

    it('renders and triggers action button when provided', () => {
      const handleAction = jest.fn();
      const { getByText, getByTestId } = render(
        <ThemeProvider>
          <EmptyState
            title="Empty Data"
            description="Nothing here"
            actionLabel="Refresh Now"
            onAction={handleAction}
            testID="action-empty-state"
          />
        </ThemeProvider>
      );

      const button = getByText('Refresh Now');
      expect(button).toBeTruthy();
      fireEvent.press(button);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('<ModalSheet />', () => {
    it('renders title and children when visible', () => {
      const handleClose = jest.fn();
      const { getByText, getByTestId } = render(
        <ThemeProvider>
          <ModalSheet
            visible={true}
            onClose={handleClose}
            title="Filter Settings"
            testID="filter-modal-sheet"
          >
            <Text>Modal Body Content</Text>
          </ModalSheet>
        </ThemeProvider>
      );

      expect(getByText('Filter Settings')).toBeTruthy();
      expect(getByText('Modal Body Content')).toBeTruthy();
    });

    it('calls onClose when close button is pressed', () => {
      const handleClose = jest.fn();
      const { getByTestId } = render(
        <ThemeProvider>
          <ModalSheet
            visible={true}
            onClose={handleClose}
            title="Quick Details"
            testID="details-modal-sheet"
          >
            <View />
          </ModalSheet>
        </ThemeProvider>
      );

      const closeBtn = getByTestId('details-modal-sheet-close-btn');
      fireEvent.press(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is pressed', () => {
      const handleClose = jest.fn();
      const { getByTestId } = render(
        <ThemeProvider>
          <ModalSheet
            visible={true}
            onClose={handleClose}
            title="Backdrop Test"
            testID="backdrop-modal-sheet"
          >
            <View />
          </ModalSheet>
        </ThemeProvider>
      );

      const backdrop = getByTestId('backdrop-modal-sheet-backdrop');
      fireEvent.press(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
