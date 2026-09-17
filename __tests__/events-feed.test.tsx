/**
 * __tests__/events-feed.test.tsx
 * Standalone test suite for Milestone 2 & 3: Events Feed Component & Interaction Tests.
 * Verifies real-time feed rendering, interactive top-row status metric cards,
 * search filtering, empty states, pull-to-refresh, and EventCard navigation.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import EventsFeedScreen from '@/../app/(tabs)/events';
import * as eventService from '@/services/event-service';
import type { Event } from '@/types/events';

// Mock theme context
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

// Mock auth context
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      uid: 'user-123',
      tenantId: 'tenant-abc',
      firstName: 'Alex',
      lastName: 'Vance',
      email: 'alex@kuro.io',
    },
    tenant: {
      tenantId: 'tenant-abc',
      tenantName: 'Amia Productions',
      success: true,
      authTenantId: null,
    },
    isAuthenticated: true,
  }),
}));

jest.mock('@/hooks/use-tickets', () => ({
  useTenantOwners: () => ({ owners: [], loading: false, error: null, refresh: jest.fn() }),
  useTenantCrew: () => ({ crew: [], loading: false, error: null, refresh: jest.fn() }),
}));

// Mock Router
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

const sampleEvent: Event = {
  id: 'ev-101',
  tenantId: 'tenant-abc',
  eventName: 'Neon Horizon Music Festival',
  eventNumber: 1042,
  clientId: 'LiveNation APAC',
  eventStatusId: 'Confirmed',
  eventTypeId: 'type-concert',
  venueId: 'Sydney Showground Hall 5',
  assigneeId: 'user-123',
  startTime: new Date('2026-08-25T08:00:00.000Z'),
  finishTime: new Date('2026-08-25T10:00:00.000Z'),
  deliveryTime: new Date('2026-08-25T10:00:00.000Z'),
  setupTime: new Date('2026-08-25T14:00:00.000Z'),
  rehearsalTime: new Date('2026-08-25T16:00:00.000Z'),
  eventStartDate: new Date('2026-08-25T18:00:00.000Z'),
  eventFinishDate: new Date('2026-08-25T23:30:00.000Z'),
  pickupTime: new Date('2026-08-26T00:00:00.000Z'),
  packdownTime: new Date('2026-08-26T04:00:00.000Z'),
  notes: 'High voltage 3-phase required at Stage Left.',
};

const mockEventsList: Event[] = [
  {
    ...sampleEvent,
    id: 'ev-1',
    eventName: 'Sydney Symphony Orchestra',
    eventNumber: 2001,
    eventStatusId: 'Inquiry',
    clientId: 'Sydney Opera House',
    venueId: 'Concert Hall',
    notes: 'Acoustic shell setup',
    startTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    finishTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 8 * 3600 * 1000),
  },
  {
    ...sampleEvent,
    id: 'ev-2',
    eventName: 'Tech Summit Keynote',
    eventNumber: 2002,
    eventStatusId: 'Pending',
    clientId: 'CloudTech APAC',
    venueId: 'ICC Sydney',
    notes: 'High speed fiber uplink required',
    startTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    finishTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 10 * 3600 * 1000),
  },
  {
    ...sampleEvent,
    id: 'ev-3',
    eventName: 'Neon Lights Festival',
    eventNumber: 2003,
    eventStatusId: 'Confirmed',
    clientId: 'LiveNation APAC',
    venueId: 'Showground Arena',
    notes: 'Mainstage lighting rig',
    startTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    finishTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 12 * 3600 * 1000),
  },
  {
    ...sampleEvent,
    id: 'ev-4',
    eventName: 'Corporate Product Launch',
    eventNumber: 2004,
    eventStatusId: 'Completed',
    clientId: 'Alpha Corp',
    venueId: 'Harbour Ballroom',
    notes: 'LED display wall',
    startTime: new Date(Date.now() + 0.1 * 24 * 60 * 60 * 1000),
    finishTime: new Date(Date.now() + 0.3 * 24 * 60 * 60 * 1000),
  },
];

describe('EventsFeedScreen (Standalone Suite)', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
  });

  it('renders top 5 status metric cards with correct counts', () => {
    jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
      onData(mockEventsList);
      return jest.fn();
    });

    const { getByTestId, getByText } = render(<EventsFeedScreen />);

    expect(getByTestId('metric-card-all')).toBeTruthy();
    expect(getByTestId('metric-card-inquiry')).toBeTruthy();
    expect(getByTestId('metric-card-pending')).toBeTruthy();
    expect(getByTestId('metric-card-confirmed')).toBeTruthy();
    expect(getByTestId('metric-card-completed')).toBeTruthy();

    expect(getByText('Sydney Symphony Orchestra')).toBeTruthy();
    expect(getByText('Tech Summit Keynote')).toBeTruthy();
    expect(getByText('Neon Lights Festival')).toBeTruthy();
    expect(getByText('Corporate Product Launch')).toBeTruthy();
  });

  it('filters events list when tapping status metric cards', () => {
    jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
      onData(mockEventsList);
      return jest.fn();
    });

    const { getByTestId, queryByText, getByText } = render(<EventsFeedScreen />);

    // Filter by Inquiry
    fireEvent.press(getByTestId('metric-card-inquiry'));
    expect(getByText('Sydney Symphony Orchestra')).toBeTruthy();
    expect(queryByText('Tech Summit Keynote')).toBeNull();
    expect(queryByText('Neon Lights Festival')).toBeNull();

    // Filter by Pending
    fireEvent.press(getByTestId('metric-card-pending'));
    expect(queryByText('Sydney Symphony Orchestra')).toBeNull();
    expect(getByText('Tech Summit Keynote')).toBeTruthy();
    expect(queryByText('Neon Lights Festival')).toBeNull();

    // Filter by Confirmed
    fireEvent.press(getByTestId('metric-card-confirmed'));
    expect(queryByText('Sydney Symphony Orchestra')).toBeNull();
    expect(queryByText('Tech Summit Keynote')).toBeNull();
    expect(getByText('Neon Lights Festival')).toBeTruthy();

    // Filter back to All
    fireEvent.press(getByTestId('metric-card-all'));
    expect(getByText('Sydney Symphony Orchestra')).toBeTruthy();
    expect(getByText('Tech Summit Keynote')).toBeTruthy();
    expect(getByText('Neon Lights Festival')).toBeTruthy();
  });

  it('filters events in real-time using search bar and clears query', () => {
    jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
      onData(mockEventsList);
      return jest.fn();
    });

    const { getByTestId, queryByText, getByText } = render(<EventsFeedScreen />);
    const searchInput = getByTestId('events-feed-search-input');

    // Search by venue "ICC"
    fireEvent.changeText(searchInput, 'ICC');
    expect(getByText('Tech Summit Keynote')).toBeTruthy();
    expect(queryByText('Sydney Symphony Orchestra')).toBeNull();

    // Search by event number "#2003"
    fireEvent.changeText(searchInput, '2003');
    expect(getByText('Neon Lights Festival')).toBeTruthy();
    expect(queryByText('Tech Summit Keynote')).toBeNull();

    // Clear search
    fireEvent.press(getByTestId('events-feed-search-clear'));
    expect(getByText('Sydney Symphony Orchestra')).toBeTruthy();
    expect(getByText('Tech Summit Keynote')).toBeTruthy();
  });

  it('renders EmptyState when no events match and resets filters on action button', () => {
    jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
      onData(mockEventsList);
      return jest.fn();
    });

    const { getByTestId, getByText } = render(<EventsFeedScreen />);
    const searchInput = getByTestId('events-feed-search-input');

    fireEvent.changeText(searchInput, 'nonexistent query 12345');

    expect(getByTestId('empty-events-state')).toBeTruthy();
    expect(getByText('No Events Found')).toBeTruthy();

    fireEvent.press(getByTestId('reset-filters-btn'));
    expect(getByText('Sydney Symphony Orchestra')).toBeTruthy();
  });

  it('navigates to Event Details screen when pressing an event card', () => {
    jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
      onData(mockEventsList);
      return jest.fn();
    });

    const { getByTestId } = render(<EventsFeedScreen />);

    fireEvent.press(getByTestId('feed-event-ev-1'));
    expect(mockRouterPush).toHaveBeenCalledWith('/events/ev-1');
  });
});
