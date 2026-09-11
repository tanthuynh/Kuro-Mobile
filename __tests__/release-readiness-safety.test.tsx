/**
 * __tests__/release-readiness-safety.test.tsx
 * Release-readiness test suite covering ErrorBoundary and BackgroundLocationDisclosureModal.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { BackgroundLocationDisclosureModal } from '@/components/logistics/BackgroundLocationDisclosureModal';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { checkLocationPermissions } from '@/services/location-tracking-service';

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
  };
});

describe('BackgroundLocationDisclosureModal Component', () => {
  it('renders prominent background location disclosure and handles accept/decline actions', () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();

    const { getByText, getByTestId } = render(
      <BackgroundLocationDisclosureModal
        visible={true}
        onAccept={onAccept}
        onDecline={onDecline}
      />
    );

    expect(getByText('Background Location Access')).toBeTruthy();
    expect(getByText(/including when the app is closed or not in use/i)).toBeTruthy();
    expect(getByText(/Real-Time Route Telemetry:/i)).toBeTruthy();

    const acceptBtn = getByTestId('bg-location-accept-btn');
    fireEvent.press(acceptBtn);
    expect(onAccept).toHaveBeenCalledTimes(1);

    const declineBtn = getByTestId('bg-location-decline-btn');
    fireEvent.press(declineBtn);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorBoundary Component', () => {
  // Prevent noisy console.error during error boundary test
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  let shouldThrowError = true;
  const ProblemChild = () => {
    if (shouldThrowError) {
      throw new Error('Database connection failed with token eyJhbGciOiJIUzI1NiJ9.test.payload and key AIzaSyCw2IfjC8ELczfWtHIOUlbIjXou58SnkHY');
    }
    return <Text>Healthy Child</Text>;
  };

  it('catches render errors, redacts sensitive JWT/API keys, and allows reset', () => {
    shouldThrowError = true;
    const { getByText, getByTestId, queryByText } = render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(getByText('Something Went Wrong')).toBeTruthy();
    // Redacted token check
    expect(getByText(/\[REDACTED_JWT\]/)).toBeTruthy();
    expect(getByText(/\[REDACTED_API_KEY\]/)).toBeTruthy();
    expect(queryByText('Healthy Child')).toBeNull();

    // Clear error condition before pressing retry
    shouldThrowError = false;
    const retryBtn = getByTestId('error-boundary-retry-btn');
    act(() => {
      fireEvent.press(retryBtn);
    });

    expect(getByText('Healthy Child')).toBeTruthy();
  });
});

describe('checkLocationPermissions helper', () => {
  it('returns valid permission status structure', async () => {
    const perms = await checkLocationPermissions();
    expect(perms).toHaveProperty('foreground');
    expect(perms).toHaveProperty('background');
    expect(typeof perms.foreground).toBe('boolean');
    expect(typeof perms.background).toBe('boolean');
  });
});
