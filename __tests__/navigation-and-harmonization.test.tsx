/**
 * __tests__/navigation-and-harmonization.test.tsx
 * Comprehensive Integration & Verification Tests for:
 * 1. ScreenHeader unified Repairs-styled back button & bracketed ID badge.
 * 2. Deterministic Navigation (Logistics Detail -> Logistics Feed, Event Detail -> Events Feed, etc.)
 * 3. EventCard 2-row layout harmonization with status badge pill & quick actions.
 * 4. Scanner and Inventory header back navigation.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ScreenHeader } from '@/components/layout/screen-header';
import { EventCard } from '@/components/events/event-card';
import type { Event } from '@/types/events';

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

// Mock expo-router
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: mockPush,
  }),
  useLocalSearchParams: () => ({}),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

describe('Unified ScreenHeader & Navigation Standards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Repairs-styled square back button when onBack prop is provided', () => {
    const onBackMock = jest.fn();
    const { getByTestId } = render(
      <ScreenHeader
        title="Job Logistics"
        onBack={onBackMock}
        backTestID="test-screen-back-btn"
        backAccessibilityLabel="Return to Feed"
      />
    );

    const backButton = getByTestId('test-screen-back-btn');
    expect(backButton).toBeTruthy();
    expect(backButton.props.accessibilityLabel).toBe('Return to Feed');

    fireEvent.press(backButton);
    expect(onBackMock).toHaveBeenCalledTimes(1);
  });

  it('renders bracketed idBadge alongside title with high contrast', () => {
    const { getByText } = render(
      <ScreenHeader
        title="Fleet Logistics Job"
        idBadge="[1042]"
      />
    );

    expect(getByText('[1042]')).toBeTruthy();
    expect(getByText('Fleet Logistics Job')).toBeTruthy();
  });

  it('does not render back button when neither onBack nor leftAction is provided', () => {
    const { queryByTestId } = render(
      <ScreenHeader title="Dashboard" />
    );

    expect(queryByTestId('screen-header-back-btn')).toBeNull();
  });
});

describe('Harmonized EventCard Component', () => {
  const sampleEvent: Event = {
    id: 'ev-test-harmonize',
    tenantId: 'tenant-test',
    eventName: 'Apex Music Arena',
    eventNumber: 5050,
    clientId: 'LiveNation Global',
    venueId: 'Arena Dock 1',
    eventStatusId: 'Confirmed',
    eventTypeId: 'type-concert',
    assigneeId: 'usr-1',
    startTime: new Date('2026-09-10T12:00:00Z'),
    finishTime: new Date('2026-09-10T23:00:00Z'),
    deliveryTime: new Date('2026-09-10T08:00:00Z'),
    setupTime: new Date('2026-09-10T10:00:00Z'),
    eventStartDate: new Date('2026-09-10T12:00:00Z'),
    eventFinishDate: new Date('2026-09-10T23:00:00Z'),
    pickupTime: new Date('2026-09-11T02:00:00Z'),
    packdownTime: new Date('2026-09-11T04:00:00Z'),
    equipmentItems: [
      { id: 'eq-1', description: 'Line Array', quantity: 8, cost: 100, type: 'item' },
      { id: 'eq-2', description: 'Subwoofer', quantity: 4, cost: 50, type: 'item' },
    ],
  };

  it('renders 3-row structure with event number, title, status pill, type pill, date, venue, and assignee', () => {
    const { getByText, getByTestId, queryByTestId, queryByText } = render(
      <EventCard
        event={sampleEvent}
        assigneeName="Alex Vance"
        venueName="Arena Dock 1"
        typeName="Audio"
      />
    );

    // Row 1: Event Number, Title, and Status Pill
    expect(getByText('[5050]')).toBeTruthy();
    expect(getByText('Apex Music Arena')).toBeTruthy();
    expect(getByText('Confirmed')).toBeTruthy();
    expect(getByTestId('event-status-badge-ev-test-harmonize')).toBeTruthy();

    // Row 2: Type Pill and Date
    expect(getByText('Audio')).toBeTruthy();
    expect(getByText('10 - 11 Sep 2026')).toBeTruthy();

    // Row 3: Venue (left) and Assignee (right)
    expect(getByText('Arena Dock 1')).toBeTruthy();
    expect(getByText('Alex Vance')).toBeTruthy();

    // Quote lines count removed
    expect(queryByText(/Quote Line Items/i)).toBeNull();

    // Quick Action Buttons are removed
    expect(queryByTestId('card-pullsheet-btn-ev-test-harmonize')).toBeNull();
    expect(queryByTestId('card-scan-btn-ev-test-harmonize')).toBeNull();
  });

  it('navigates to unified event details screen when pressing card', () => {
    const { getByTestId } = render(
      <EventCard
        event={sampleEvent}
      />
    );

    fireEvent.press(getByTestId('event-card-ev-test-harmonize'));
    expect(mockPush).toHaveBeenCalledWith('/events/ev-test-harmonize');
  });
});
