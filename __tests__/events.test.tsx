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
    isLoading: false,
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
});
