/**
 * __tests__/events.test.tsx
 * Unit and component integration tests for Milestone 2: Events Feed & Event Details.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { renderHook } from '@testing-library/react-native';
import { EventFilterTabs } from '@/components/events/event-filter-tabs';
import { EventScheduleCard } from '@/components/events/event-schedule-card';
import { EventCard } from '@/components/events/event-card';
import { useEvents, useSingleEvent } from '@/hooks/use-events';
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
  useTenantOwners: () => ({ owners: [], loading: false, error: null }),
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
  equipmentItems: [
    {
      id: 'eq-item-1',
      description: 'L-Acoustics K2 Enclosure',
      quantity: 16,
      cost: 450,
      type: 'item',
    },
  ],
};

describe('Milestone 2: Events Feed & Details', () => {
  describe('EventFilterTabs', () => {
    it('renders all 4 tabs with correct count badges', () => {
      const onSelectTab = jest.fn();
      const { getByText, getByTestId } = render(
        <EventFilterTabs
          selectedTab="today"
          onSelectTab={onSelectTab}
          counts={{
            today: 3,
            inProgress: 1,
            upcoming: 5,
            all: 9,
          }}
        />
      );

      expect(getByText("Today's Jobs")).toBeTruthy();
      expect(getByText('In-Progress')).toBeTruthy();
      expect(getByText('Upcoming')).toBeTruthy();
      expect(getByText('All Active')).toBeTruthy();

      expect(getByText('3')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
      expect(getByText('5')).toBeTruthy();
      expect(getByText('9')).toBeTruthy();

      fireEvent.press(getByTestId('event-tab-upcoming'));
      expect(onSelectTab).toHaveBeenCalledWith('upcoming');
    });
  });

  describe('EventScheduleCard', () => {
    it('renders all 5 operational schedule stages', () => {
      const { getByText, getByTestId } = render(
        <EventScheduleCard
          event={sampleEvent}
          currentDate={new Date('2026-08-25T12:00:00.000Z')} // During Setup window
        />
      );

      expect(getByText('Operational Schedule & Timeline')).toBeTruthy();
      expect(getByText('Planning Period')).toBeTruthy();
      expect(getByText('Setup / Load-In')).toBeTruthy();
      expect(getByText('Rehearsal')).toBeTruthy();
      expect(getByText('Show / Event')).toBeTruthy();
      expect(getByText('Packdown / Load-Out')).toBeTruthy();

      expect(getByTestId('stage-row-planning')).toBeTruthy();
      expect(getByTestId('stage-row-setup')).toBeTruthy();
      expect(getByTestId('stage-row-rehearsal')).toBeTruthy();
      expect(getByTestId('stage-row-show')).toBeTruthy();
      expect(getByTestId('stage-row-packdown')).toBeTruthy();

      // Setup stage is active at 12:00
      expect(getByText('CURRENT STAGE')).toBeTruthy();
    });
  });

  describe('EventCard', () => {
    it('renders event details, number badge, status, and button actions', () => {
      const onOpenPullsheet = jest.fn();
      const onOpenScanner = jest.fn();
      const onPress = jest.fn();

      const { getByText, getByTestId } = render(
        <EventCard
          event={sampleEvent}
          clientName="LiveNation APAC"
          venueName="Sydney Showground"
          onOpenPullsheet={onOpenPullsheet}
          onOpenScanner={onOpenScanner}
          onPress={onPress}
        />
      );

      expect(getByText('#1042')).toBeTruthy();
      expect(getByText('Neon Horizon Music Festival')).toBeTruthy();
      expect(getByText('Confirmed')).toBeTruthy();
      expect(getByText('LiveNation APAC')).toBeTruthy();
      expect(getByText('Sydney Showground')).toBeTruthy();
      expect(getByText('1 Quote Line Items')).toBeTruthy();

      // Button actions
      fireEvent.press(getByTestId('card-pullsheet-btn-ev-101'));
      expect(onOpenPullsheet).toHaveBeenCalled();

      fireEvent.press(getByTestId('card-scan-btn-ev-101'));
      expect(onOpenScanner).toHaveBeenCalled();

      fireEvent.press(getByTestId('event-card-ev-101'));
      expect(onPress).toHaveBeenCalled();
    });
  });

  describe('useEvents Hook', () => {
    it('subscribes to live events and computes metrics & categorization', async () => {
      let listenerCallback: ((events: Event[]) => void) | null = null;
      jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
        listenerCallback = onData;
        onData([sampleEvent]);
        return jest.fn();
      });

      const { result } = renderHook(() => useEvents(0));

      expect(result.current.loading).toBe(false);
      expect(result.current.events.length).toBe(1);
      expect(result.current.metrics.totalActive).toBe(1);

      act(() => {
        result.current.setTargetDateOffset(1);
      });
      expect(result.current.targetDateOffset).toBe(1);

      act(() => {
        result.current.resetDateOffset();
      });
      expect(result.current.targetDateOffset).toBe(0);

      act(() => {
        result.current.setSelectedTab('upcoming');
      });
      expect(result.current.selectedTab).toBe('upcoming');
    });
  });

  describe('useSingleEvent Hook', () => {
    it('subscribes to a single event document', async () => {
      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, onData) => {
        onData(sampleEvent);
        return jest.fn();
      });

      const { result } = renderHook(() => useSingleEvent('ev-101'));

      expect(result.current.loading).toBe(false);
      expect(result.current.event?.id).toBe('ev-101');
      expect(result.current.event?.eventName).toBe('Neon Horizon Music Festival');
    });
  });

  describe('EventsFeedScreen (app/(tabs)/index.tsx)', () => {
    const mockRouterPush = jest.fn();
    beforeEach(() => {
      mockRouterPush.mockClear();
      const expoRouter = require('expo-router');
      expoRouter.useRouter = () => ({
        push: mockRouterPush,
        replace: jest.fn(),
        back: jest.fn(),
      });
    });

    afterEach(async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
    });

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

    it('renders top 5 status metric cards with correct counts', () => {
      jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
        onData(mockEventsList);
        return jest.fn();
      });

      const EventsFeedScreen = require('../app/(tabs)/index').default;
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

      const EventsFeedScreen = require('../app/(tabs)/index').default;
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

      const EventsFeedScreen = require('../app/(tabs)/index').default;
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

      // Search by notes "fiber"
      fireEvent.changeText(searchInput, 'fiber');
      expect(getByText('Tech Summit Keynote')).toBeTruthy();

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

      const EventsFeedScreen = require('../app/(tabs)/index').default;
      const { getByTestId, getByText } = render(<EventsFeedScreen />);

      const searchInput = getByTestId('events-feed-search-input');

      fireEvent.changeText(searchInput, 'nonexistent query 12345');

      expect(getByTestId('empty-events-state')).toBeTruthy();
      expect(getByText('No Events Found')).toBeTruthy();

      // Press Reset Filters button
      fireEvent.press(getByTestId('reset-filters-btn'));

      expect(getByText('Sydney Symphony Orchestra')).toBeTruthy();
    });

    it('navigates to Event Details screen when pressing an event card', () => {
      jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
        onData(mockEventsList);
        return jest.fn();
      });

      const EventsFeedScreen = require('../app/(tabs)/index').default;
      const { getByTestId } = render(<EventsFeedScreen />);

      fireEvent.press(getByTestId('feed-event-ev-1'));

      expect(mockRouterPush).toHaveBeenCalledWith('/events/ev-1');
    });

    it('handles rapid typing and metric card switching under high event volume', () => {
      const largeEventList: Event[] = Array.from({ length: 200 }, (_, i) => ({
        ...sampleEvent,
        id: `ev-stress-${i}`,
        eventName: `Production Festival Show ${i}`,
        eventNumber: 3000 + i,
        eventStatusId: (['Inquiry', 'Pending', 'Confirmed', 'Completed'] as const)[i % 4],
        clientId: `Client Partner ${i % 10}`,
        venueId: `Venue Location ${i % 5}`,
        notes: `Production stage rig notes ${i}`,
        startTime: new Date(Date.now() + ((i % 25) + 1) * 24 * 60 * 60 * 1000),
        finishTime: new Date(Date.now() + ((i % 25) + 2) * 24 * 60 * 60 * 1000),
      }));

      jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
        onData(largeEventList);
        return jest.fn();
      });

      const EventsFeedScreen = require('../app/(tabs)/index').default;
      const { getByTestId, queryByText, getByText } = render(<EventsFeedScreen />);

      const searchInput = getByTestId('events-feed-search-input');

      // Rapidly simulate keystrokes
      const searchTerms = ['P', 'Pr', 'Pro', 'Prod', 'Production Festival Show 15'];
      for (const term of searchTerms) {
        fireEvent.changeText(searchInput, term);
      }

      expect(getByText('Production Festival Show 15')).toBeTruthy();
      expect(queryByText('Production Festival Show 16')).toBeNull();

      // Switch to Confirmed tab rapidly
      fireEvent.press(getByTestId('metric-card-confirmed'));

      // Show 14 is Confirmed (14 % 4 === 2)
      fireEvent.changeText(searchInput, 'Production Festival Show 14');
      expect(getByText('Production Festival Show 14')).toBeTruthy();

      // Clear search
      fireEvent.press(getByTestId('events-feed-search-clear'));

      // Switch back to All
      fireEvent.press(getByTestId('metric-card-all'));

      expect(getByText('Production Festival Show 0')).toBeTruthy();
    });

    it('navigates to Pull Sheet and Continuous Scanner from event card buttons', () => {
      jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
        onData(mockEventsList);
        return jest.fn();
      });

      const EventsFeedScreen = require('../app/(tabs)/index').default;
      const { getByTestId } = render(<EventsFeedScreen />);

      fireEvent.press(getByTestId('card-pullsheet-btn-ev-1'));
      expect(mockRouterPush).toHaveBeenCalledWith('/pullsheet/ev-1');

      fireEvent.press(getByTestId('card-scan-btn-ev-1'));
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/(tabs)/scanner',
        params: { eventId: 'ev-1' },
      });
    });

    it('triggers refresh when pull-to-refresh is activated on FlatList', async () => {
      const mockFetch = jest.spyOn(eventService, 'fetchTenantEvents').mockResolvedValue(mockEventsList);
      jest.spyOn(eventService, 'subscribeTenantEvents').mockImplementation((tenantId, onData) => {
        onData(mockEventsList);
        return jest.fn();
      });

      const EventsFeedScreen = require('../app/(tabs)/index').default;
      const { getByTestId } = render(<EventsFeedScreen />);

      const flatList = getByTestId('events-flatlist');
      const { refreshControl } = flatList.props;

      expect(refreshControl).toBeDefined();
      await act(async () => {
        await refreshControl.props.onRefresh();
      });

      expect(mockFetch).toHaveBeenCalledWith('tenant-abc');
    });
  });

  // ==========================================================================
  // Milestone 2.3: Event Details Screen Layout & Actions
  // ==========================================================================
  describe('EventDetailsScreen', () => {
    let mockRouterPush: jest.Mock;

    beforeEach(() => {
      mockRouterPush = jest.fn();
      const expoRouter = require('expo-router');
      expoRouter.useRouter = () => ({
        push: mockRouterPush,
        replace: jest.fn(),
        back: jest.fn(),
      });
      expoRouter.useLocalSearchParams = () => ({ id: 'ev-101' });

      jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((id, tenantId, onData) => {
        onData(sampleEvent);
        return jest.fn();
      });
    });

    it('renders combined Client & Venue card and Open in Maps button', () => {
      const EventDetailsScreen = require('../app/events/[id]').default;
      const { getByTestId, getByText, queryByTestId, queryByText } = render(<EventDetailsScreen />);

      // Combined Client & Venue card exists
      expect(getByTestId('event-client-venue-card')).toBeTruthy();
      expect(getByText('Client & Venue')).toBeTruthy();
      expect(getByText('CLIENT')).toBeTruthy();
      expect(getByText('LiveNation APAC')).toBeTruthy();
      expect(getByText('VENUE')).toBeTruthy();
      expect(getByText('Sydney Showground Hall 5')).toBeTruthy();

      // Open in Maps button exists
      expect(getByTestId('open-maps-btn')).toBeTruthy();

      // Production Lead, Call, and Email buttons are removed
      expect(queryByText(/Production Lead/i)).toBeNull();
      expect(queryByTestId('call-lead-btn')).toBeNull();
      expect(queryByTestId('email-lead-btn')).toBeNull();

      // Warehouse operations top CTA card and inline bottom button are removed
      expect(queryByText('Warehouse Operations')).toBeNull();
      expect(queryByTestId('open-pullsheet-bottom-btn')).toBeNull();
    });

    it('renders persistent bottom action bar with Pull Sheet and Scan Gear buttons', () => {
      const EventDetailsScreen = require('../app/events/[id]').default;
      const { getByTestId } = render(<EventDetailsScreen />);

      const pullsheetBtn = getByTestId('event-details-pullsheet-btn');
      const scanBtn = getByTestId('event-details-scan-btn');

      expect(pullsheetBtn).toBeTruthy();
      expect(scanBtn).toBeTruthy();

      fireEvent.press(pullsheetBtn);
      expect(mockRouterPush).toHaveBeenCalledWith('/pullsheet/ev-101');

      fireEvent.press(scanBtn);
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/(tabs)/scanner',
        params: { eventId: 'ev-101' },
      });
    });
  });
});
