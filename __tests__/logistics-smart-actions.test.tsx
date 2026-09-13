/**
 * app/logistics/__tests__/logistics-smart-actions.test.tsx
 * Milestone 4: Smart Actions (1-Tap Maps & 1-Tap Phone Call) Component Tests.
 * Verifies that pressing "Open in Maps" and "Call Contact" buttons on LogisticsDestinationCard
 * triggers native Linking.openURL with properly sanitized and formatted URIs.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { LogisticsDestinationCard } from '@/components/logistics/LogisticsDestinationCard';
import type { LogisticsDestination } from '@/types/logistics';

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

describe('Milestone 4: 1-Tap Smart Actions Tests', () => {
  let openURLSpy: jest.SpyInstance;

  it('preserves the Start row layout while destination rows expose actions', () => {
    const destination: LogisticsDestination = { id: 'origin', type: 'destination',
      destinationName: 'Warehouse', address: '1 Warehouse Road', contact: '0412345678' };
    const { getByText, queryByTestId, rerender } = render(<LogisticsDestinationCard destination={destination} index={0} />);
    expect(getByText('Start')).toBeTruthy();
    expect(queryByTestId('open-maps-btn-origin')).toBeNull();
    expect(queryByTestId('call-contact-btn-origin')).toBeNull();
    rerender(<LogisticsDestinationCard destination={destination} index={1} />);
    expect(getByText('Stop 1')).toBeTruthy();
    expect(queryByTestId('open-maps-btn-origin')).toBeTruthy();
    expect(queryByTestId('call-contact-btn-origin')).toBeTruthy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  it('1-tap "Open in Maps" triggers Linking.openURL with encoded Google Maps search query', async () => {
    const destination: LogisticsDestination = {
      id: 'dest-01',
      type: 'destination',
      destinationName: 'Sydney Opera House Loading Bay',
      address: 'Macquarie St, Sydney NSW 2000',
      contact: 'Stage Mgr: +61 412 345 678',
    };

    const { getByTestId } = render(
      <LogisticsDestinationCard destination={destination} index={1} />
    );

    const mapsBtn = getByTestId('open-maps-btn-dest-01');
    await act(async () => {
      fireEvent.press(mapsBtn);
    });

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    const invokedUrl = openURLSpy.mock.calls[0][0];
    expect(invokedUrl).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(invokedUrl).toContain(encodeURIComponent('Sydney Opera House Loading Bay, Macquarie St, Sydney NSW 2000'));
  });

  it('1-tap "Call Contact" triggers Linking.openURL with sanitized tel: international phone number', async () => {
    const destination: LogisticsDestination = {
      id: 'dest-02',
      type: 'destination',
      destinationName: 'Qudos Bank Arena Dock B',
      address: 'Edwin Flack Ave, Sydney Olympic Park NSW 2127',
      contact: 'Dock Master: +61 412 345 678',
    };

    const { getByTestId } = render(
      <LogisticsDestinationCard destination={destination} index={1} />
    );

    const callBtn = getByTestId('call-contact-btn-dest-02');
    await act(async () => {
      fireEvent.press(callBtn);
    });

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledWith('tel:+61412345678');
  });

  it('1-tap "Call Contact" extracts and sanitizes domestic Australian phone number', async () => {
    const destination: LogisticsDestination = {
      id: 'dest-03',
      type: 'destination',
      destinationName: 'Enmore Theatre',
      address: '118 Enmore Rd, Newtown NSW 2042',
      contact: 'Venue Office: (02) 9876 5432',
    };

    const { getByTestId } = render(
      <LogisticsDestinationCard destination={destination} index={2} />
    );

    const callBtn = getByTestId('call-contact-btn-dest-03');
    await act(async () => {
      fireEvent.press(callBtn);
    });

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledWith('tel:0298765432');
  });

  it('disables "Call Contact" button when no valid phone number exists in contact field', async () => {
    const destination: LogisticsDestination = {
      id: 'dest-04',
      type: 'destination',
      destinationName: 'Warehouse Overflow',
      address: '10 Industrial Circuit, Alexandria NSW 2015',
      contact: 'Security guard on gate (no phone)',
    };

    const { getByTestId } = render(
      <LogisticsDestinationCard destination={destination} index={3} />
    );

    const callBtn = getByTestId('call-contact-btn-dest-04');
    await act(async () => {
      fireEvent.press(callBtn);
    });

    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('handles multi-line address text formatting for maps URL generation', async () => {
    const destination: LogisticsDestination = {
      id: 'dest-05',
      type: 'destination',
      destinationName: 'Convention Centre',
      address: '14 Darling Dr\nLevel 2 Dock\nSydney NSW 2000',
    };

    const { getByTestId } = render(
      <LogisticsDestinationCard destination={destination} index={4} />
    );

    const mapsBtn = getByTestId('open-maps-btn-dest-05');
    await act(async () => {
      fireEvent.press(mapsBtn);
    });

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    const invokedUrl = openURLSpy.mock.calls[0][0];
    expect(invokedUrl).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(invokedUrl).toContain(encodeURIComponent('Convention Centre, 14 Darling Dr, Level 2 Dock, Sydney NSW 2000'));
  });
});
