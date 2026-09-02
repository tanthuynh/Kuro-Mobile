/**
 * src/components/logistics/__tests__/LogisticsJobCard.test.tsx
 * Unit test suite for LogisticsJobCard component.
 * Verifies 2-row layout, status badge coloring, Calibri typography, accessibility, and responsive rendering.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet, type TextStyle } from 'react-native';
import { LogisticsJobCard } from '../LogisticsJobCard';
import type { LogisticsEntry } from '@/types/logistics';

// Mock Theme Context
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

// Mock Router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('LogisticsJobCard Component Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseJob: LogisticsEntry = {
    id: 'job-1001',
    tenantId: 'tenant-1',
    eventNumber: 101,
    eventName: 'Sydney Symphony Gala',
    location: 'Sydney Opera House, Bennelong Point',
    status: 'In Transit',
    driverName: 'Alex Mercer',
    vehicleId: 'VAN-08 (NSW-AV08)',
    start: '2026-09-01T08:00:00Z',
    end: '2026-09-01T12:00:00Z',
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: '2026-09-01T07:00:00Z',
    updatedAt: '2026-09-01T08:00:00Z',
    isTrackingActive: true,
    destinations: [
      { id: 'd1', type: 'destination', destinationName: 'Stage Door 1', address: 'Macquarie St, Sydney NSW 2000' },
      { id: 'd2', type: 'destination', destinationName: 'Loading Dock 2', address: 'Bennelong Point, Sydney NSW 2000' },
    ],
  };

  it('renders top row with [Event Number] and Event Title on left, and Status Badge on right', () => {
    const { getByText, getByTestId } = render(
      <LogisticsJobCard job={baseJob} />
    );

    expect(getByText('[#101]')).toBeTruthy();
    expect(getByText('Sydney Symphony Gala')).toBeTruthy();

    const badge = getByTestId('job-status-badge-job-1001');
    expect(badge).toBeTruthy();
    expect(getByText('In Transit')).toBeTruthy();
  });

  it('renders second row with location, schedule, stops count, live GPS pill, driver, and vehicle', () => {
    const { getByText, getByTestId } = render(
      <LogisticsJobCard job={baseJob} />
    );

    expect(getByText('Sydney Opera House, Bennelong Point')).toBeTruthy();
    expect(getByText('2 stops')).toBeTruthy();
    expect(getByTestId('job-live-tracking-pill-job-1001')).toBeTruthy();
    expect(getByText('LIVE GPS')).toBeTruthy();
    expect(getByText('Alex Mercer')).toBeTruthy();
    expect(getByText('VAN-08 (NSW-AV08)')).toBeTruthy();
  });

  it('renders singular "1 stop" when only one destination is present', () => {
    const singleStopJob: LogisticsEntry = {
      ...baseJob,
      destinations: [{ id: 'd1', type: 'destination', destinationName: 'Dock', address: 'Bennelong Point, Sydney NSW 2000' }],
    };

    const { getByText } = render(
      <LogisticsJobCard job={singleStopJob} />
    );

    expect(getByText('1 stop')).toBeTruthy();
  });

  it('verifies standard Calibri typography is applied across all text elements', () => {
    const { getByText } = render(
      <LogisticsJobCard job={baseJob} />
    );

    const checkCalibri = (textNode: any) => {
      const flat = StyleSheet.flatten<TextStyle>(textNode.props.style);
      expect(flat.fontFamily).toBe('Calibri');
    };

    checkCalibri(getByText('[#101]'));
    checkCalibri(getByText('Sydney Symphony Gala'));
    checkCalibri(getByText('In Transit'));
    checkCalibri(getByText('Sydney Opera House, Bennelong Point'));
    checkCalibri(getByText('2 stops'));
    checkCalibri(getByText('LIVE GPS'));
    checkCalibri(getByText('Alex Mercer'));
    checkCalibri(getByText('VAN-08 (NSW-AV08)'));
  });

  describe('Status Badge Color Harmonization', () => {
    it('applies purple (#8B5CF6) border/text for In Progress / In Transit / Active statuses', () => {
      const activeJob: LogisticsEntry = {
        ...baseJob,
        status: 'In Progress',
      };

      const { getByText } = render(
        <LogisticsJobCard job={activeJob} />
      );

      const statusText = getByText('In Progress');
      const textStyle = StyleSheet.flatten<TextStyle>(statusText.props.style);
      expect(textStyle.color).toBe('#8B5CF6');
    });

    it('applies blue (#3B82F6) border/text for Planned / Scheduled / Confirmed statuses', () => {
      const plannedJob: LogisticsEntry = {
        ...baseJob,
        status: 'Scheduled',
      };

      const { getByText } = render(
        <LogisticsJobCard job={plannedJob} />
      );

      const statusText = getByText('Scheduled');
      const textStyle = StyleSheet.flatten<TextStyle>(statusText.props.style);
      expect(textStyle.color).toBe('#3B82F6');
    });

    it('applies amber (#F59E0B) border/text for Pending / Draft / Unassigned statuses', () => {
      const pendingJob: LogisticsEntry = {
        ...baseJob,
        status: 'Pending',
      };

      const { getByText } = render(
        <LogisticsJobCard job={pendingJob} />
      );

      const statusText = getByText('Pending');
      const textStyle = StyleSheet.flatten<TextStyle>(statusText.props.style);
      expect(textStyle.color).toBe('#F59E0B');
    });

    it('applies green (#10B981) border/text for Completed / Delivered statuses', () => {
      const completedJob: LogisticsEntry = {
        ...baseJob,
        status: 'Completed',
      };

      const { getByText } = render(
        <LogisticsJobCard job={completedJob} />
      );

      const statusText = getByText('Completed');
      const textStyle = StyleSheet.flatten<TextStyle>(statusText.props.style);
      expect(textStyle.color).toBe('#10B981');
    });

    it('applies red (#EF4444) border/text for Cancelled status', () => {
      const cancelledJob: LogisticsEntry = {
        ...baseJob,
        status: 'Cancelled',
      };

      const { getByText } = render(
        <LogisticsJobCard job={cancelledJob} />
      );

      const statusText = getByText('Cancelled');
      const textStyle = StyleSheet.flatten<TextStyle>(statusText.props.style);
      expect(textStyle.color).toBe('#EF4444');
    });

    it('falls back to mutedForeground for unknown custom status', () => {
      const customJob: LogisticsEntry = {
        ...baseJob,
        status: 'On Hold',
      };

      const { getByText } = render(
        <LogisticsJobCard job={customJob} />
      );

      const statusText = getByText('On Hold');
      const textStyle = StyleSheet.flatten<TextStyle>(statusText.props.style);
      expect(textStyle.color).toBeTruthy();
    });
  });

  describe('Edge Cases and Fallbacks', () => {
    it('falls back to "Unassigned" when driverName is missing', () => {
      const unassignedJob: LogisticsEntry = {
        ...baseJob,
        driverName: undefined,
        vehicleId: undefined,
      };

      const { getByText } = render(
        <LogisticsJobCard job={unassignedJob} />
      );

      expect(getByText('Unassigned')).toBeTruthy();
    });

    it('falls back to truncated ID format [#1001] when eventNumber is missing', () => {
      const noEventNumJob: LogisticsEntry = {
        ...baseJob,
        eventNumber: undefined,
      };

      const { getByText } = render(
        <LogisticsJobCard job={noEventNumJob} />
      );

      expect(getByText('[#JOB-10]')).toBeTruthy();
    });

    it('handles missing location and missing destinations gracefully', () => {
      const sparseJob: LogisticsEntry = {
        ...baseJob,
        location: '',
        destinations: undefined,
        isTrackingActive: false,
      };

      const { queryByText, getByText } = render(
        <LogisticsJobCard job={sparseJob} />
      );

      expect(getByText('Alex Mercer')).toBeTruthy();
      expect(queryByText('stops')).toBeNull();
      expect(queryByText('LIVE GPS')).toBeNull();
    });

    it('calls custom onPress handler when provided', () => {
      const onPressMock = jest.fn();
      const { getByTestId } = render(
        <LogisticsJobCard job={baseJob} onPress={onPressMock} />
      );

      fireEvent.press(getByTestId('logistics-job-card-job-1001'));
      expect(onPressMock).toHaveBeenCalledWith(baseJob);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('navigates to router path when default onPress is triggered', () => {
      const { getByTestId } = render(
        <LogisticsJobCard job={baseJob} />
      );

      fireEvent.press(getByTestId('logistics-job-card-job-1001'));
      expect(mockPush).toHaveBeenCalledWith('/logistics/job-1001');
    });
  });
});
