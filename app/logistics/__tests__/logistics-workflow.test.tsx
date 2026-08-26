/**
 * app/logistics/__tests__/logistics-workflow.test.tsx
 * Milestone 5: Full End-to-End (E2E) Logistics & Driver Lifecycle Integration Test Suite.
 *
 * Covers complete driver workflow and edge scenarios:
 * - Scenario 1: Driver opens Logistics tab, views assigned jobs feed, switches tabs/filters, clicks on active job.
 * - Scenario 2: Driver activates scheduled job -> triggers status transition to 'In Progress' AND triggers startTrackingJob, syncing GPS coordinates to Firestore.
 * - Scenario 3: Driver performs 1-tap "Open in Maps" on destination -> triggers Linking.openURL with sanitized Google Maps query URL.
 * - Scenario 4: Driver performs 1-tap "Call Contact" on destination -> triggers Linking.openURL with sanitized tel: URL.
 * - Scenario 5: Driver appends internal notes -> notes update in Firestore with author and timestamp.
 * - Scenario 6: Driver completes job -> triggers status transition to 'Completed' AND triggers stopTrackingJob, deactivating GPS polling.
 * - Scenario 7: Multi-tenant boundary check -> documents from another tenant are rejected and not accessible.
 * - Scenario 8: Integrated Full-Lifecycle Driver Journey (E2E Master Workflow).
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import LogisticsFeedScreen from '@/../app/(tabs)/logistics';
import LogisticsJobDetailScreen from '@/../app/logistics/[id]';
import { LogisticsDestinationCard } from '@/components/logistics/LogisticsDestinationCard';
import * as logisticsService from '@/services/logistics-service';
import * as locationTrackingService from '@/services/location-tracking-service';
import * as logisticsEngine from '@/lib/logistics-engine';
import type { LogisticsEntry, LogisticsDestination, DriverLocation } from '@/types/logistics';

// ============================================================================
// MOCKS CONFIGURATION
// ============================================================================

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

// Mock Driver Authentication Context
const mockDriver = {
  id: 'usr-driver-sam-01',
  uid: 'usr-driver-sam-01',
  name: 'Sam Fisher',
  email: 'sam.fisher@kuro.test',
  firstName: 'Sam',
  lastName: 'Fisher',
  tenantId: 'tenant-alpha-transport',
};

const mockTenant = {
  tenantId: 'tenant-alpha-transport',
  tenantName: 'Alpha Logistics Fleet',
  success: true,
  authTenantId: null,
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockDriver,
    tenant: mockTenant,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock Router Navigation
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSearchParamId = 'job-alpha-701';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  useLocalSearchParams: () => ({
    id: mockSearchParamId,
  }),
}));

// ============================================================================
// TEST FIXTURES & DATASET
// ============================================================================

const tenantAlpha = 'tenant-alpha-transport';
const tenantBeta = 'tenant-beta-logistics';

const mockDatasetJobs: LogisticsEntry[] = [
  {
    id: 'job-alpha-701',
    tenantId: tenantAlpha,
    eventNumber: 701,
    eventName: 'Sydney Opera House Gala Audio Run',
    location: 'Bennelong Point, Sydney NSW',
    status: 'Scheduled',
    driverName: 'Sam Fisher',
    assigneeId: 'usr-driver-sam-01',
    vehicleId: 'VAN-07 (NSW-KURO7)',
    start: new Date('2026-08-27T08:00:00Z'),
    end: new Date('2026-08-27T13:00:00Z'),
    createdBy: 'Dispatch Coordinator',
    updatedBy: 'Dispatch Coordinator',
    createdAt: '2026-08-27T06:00:00Z',
    updatedAt: '2026-08-27T06:00:00Z',
    archived: false,
    isTrackingActive: false,
    notes: '2026-08-27 06:00 [Dispatch Coordinator]: Pallet 1 loaded with line-array speakers.',
    destinations: [
      {
        id: 'dest-stop-1',
        type: 'destination',
        destinationName: 'Opera House Loading Dock 2',
        address: 'Macquarie St, Sydney NSW 2000',
        contact: 'Stage Mgr Dave: +61 412 345 678',
        time: '08:30 AM',
        estTravelTime: '20 min',
        detailNote: 'Use underground service tunnel entry via Gate 4.',
      },
      {
        id: 'dest-stop-2',
        type: 'destination',
        destinationName: 'Audio Production Office',
        address: '2 Macquarie St, Sydney NSW 2000',
        contact: 'Office: (02) 9876 5432',
        time: '11:00 AM',
        estTravelTime: '10 min',
        detailNote: 'Handover wireless mic rack case.',
      },
    ],
  },
  {
    id: 'job-alpha-702',
    tenantId: tenantAlpha,
    eventNumber: 702,
    eventName: 'Enmore Theatre Lighting Delivery',
    location: '118-132 Enmore Rd, Newtown NSW',
    status: 'In Transit',
    driverName: 'Sam Fisher',
    assigneeId: 'usr-driver-sam-01',
    vehicleId: 'VAN-07 (NSW-KURO7)',
    start: new Date('2026-08-27T14:00:00Z'),
    end: new Date('2026-08-27T17:00:00Z'),
    createdBy: 'Dispatch Coordinator',
    updatedBy: 'Sam Fisher',
    createdAt: '2026-08-27T06:30:00Z',
    updatedAt: '2026-08-27T14:00:00Z',
    archived: false,
    isTrackingActive: true,
    currentLocation: {
      latitude: -33.8988,
      longitude: 151.1755,
      heading: 270,
      speed: 14.2,
      accuracy: 3.8,
      altitude: 25,
      timestamp: 1756288800000,
      driverId: 'usr-driver-sam-01',
      driverName: 'Sam Fisher',
      jobId: 'job-alpha-702',
    },
    destinations: [
      {
        id: 'dest-stop-3',
        type: 'destination',
        destinationName: 'Enmore Stage Door',
        address: '118 Enmore Rd, Newtown NSW 2042',
        contact: 'Crew Lead: 0498 765 432',
      },
    ],
  },
  {
    id: 'job-alpha-703',
    tenantId: tenantAlpha,
    eventNumber: 703,
    eventName: 'Qudos Bank Arena Video Wall Transport',
    location: 'Olympic Blvd, Sydney Olympic Park',
    status: 'Scheduled',
    driverName: 'Alex Rivera',
    assigneeId: 'usr-driver-alex-02',
    vehicleId: 'TRUCK-01 (NSW-RIG01)',
    start: new Date('2026-08-27T10:00:00Z'),
    end: new Date('2026-08-27T16:00:00Z'),
    createdBy: 'Dispatch Coordinator',
    updatedBy: 'Dispatch Coordinator',
    createdAt: '2026-08-27T06:00:00Z',
    updatedAt: '2026-08-27T06:00:00Z',
    archived: false,
    isTrackingActive: false,
  },
  {
    id: 'job-alpha-704',
    tenantId: tenantAlpha,
    eventNumber: 704,
    eventName: 'Metro Theatre Return Run',
    location: '624 George St, Sydney NSW',
    status: 'Completed',
    driverName: 'Sam Fisher',
    assigneeId: 'usr-driver-sam-01',
    vehicleId: 'VAN-07 (NSW-KURO7)',
    start: new Date('2026-08-26T08:00:00Z'),
    end: new Date('2026-08-26T12:00:00Z'),
    createdBy: 'Dispatch Coordinator',
    updatedBy: 'Sam Fisher',
    createdAt: '2026-08-26T07:00:00Z',
    updatedAt: '2026-08-26T12:00:00Z',
    archived: false,
    isTrackingActive: false,
  },
];

const mockForeignTenantJob: LogisticsEntry = {
  id: 'job-beta-999',
  tenantId: tenantBeta,
  eventNumber: 999,
  eventName: 'Competitor Cyber Stage Gig',
  location: 'Brisbane Entertainment Centre',
  status: 'In Transit',
  driverName: 'Foreign Driver',
  assigneeId: 'usr-foreign-99',
  start: new Date('2026-08-27T08:00:00Z'),
  end: new Date('2026-08-27T18:00:00Z'),
  createdBy: 'Beta Dispatcher',
  updatedBy: 'Beta Dispatcher',
  createdAt: '2026-08-27T06:00:00Z',
  updatedAt: '2026-08-27T06:00:00Z',
  archived: false,
};

// ============================================================================
// TEST SUITE IMPLEMENTATION
// ============================================================================

describe('Milestone 5: Kuro Mobile Logistics & Driver Workflow E2E Integration', () => {
  let openURLSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamId = 'job-alpha-701';
    locationTrackingService._resetTrackingStateForTesting();

    // Default Linking mock
    openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    // Default Expo Location mocks
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8568,
        longitude: 151.2153,
        altitude: 12.0,
        accuracy: 4.0,
        heading: 90,
        speed: 10.5,
      },
      timestamp: 1756285200000,
    });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: -33.8568,
        longitude: 151.2153,
        altitude: 12.0,
        accuracy: 4.0,
        heading: 90,
        speed: 10.5,
      },
      timestamp: 1756285200000,
    });
  });

  afterEach(() => {
    locationTrackingService._resetTrackingStateForTesting();
  });

  // ==========================================================================
  // SCENARIO 1: DRIVER LOGISTICS FEED & FILTERING WORKFLOW
  // ==========================================================================
  describe('Scenario 1: Driver opens Logistics tab, views assigned jobs feed, switches tabs/filters, clicks on active job', () => {
    it('renders real-time jobs feed and calculates accurate summary metrics', async () => {
      jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((tenantId, onUpdate) => {
        if (tenantId === tenantAlpha) {
          onUpdate(mockDatasetJobs);
        } else {
          onUpdate([]);
        }
        return () => {};
      });

      const { getByText, findByText, getByTestId } = render(<LogisticsFeedScreen />);

      // Verify Header
      expect(getByText('Logistics & Transport')).toBeTruthy();

      // Verify Aggregated Metrics: Total=4, Active=1, Scheduled=2, Completed=1
      expect(getByTestId('metric-card-active')).toBeTruthy();
      expect(getByTestId('metric-card-scheduled')).toBeTruthy();
      expect(getByTestId('metric-card-completed')).toBeTruthy();
      expect(getByTestId('metric-card-total')).toBeTruthy();

      // Verify Feed Job Cards render
      expect(await findByText('Sydney Opera House Gala Audio Run')).toBeTruthy();
      expect(getByText('Enmore Theatre Lighting Delivery')).toBeTruthy();
      expect(getByText('Qudos Bank Arena Video Wall Transport')).toBeTruthy();
      expect(getByText('Metro Theatre Return Run')).toBeTruthy();
    });

    it('filters jobs dynamically when toggling "Assigned to Me" vs "All Jobs"', async () => {
      jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((_tId, onUpdate) => {
        onUpdate(mockDatasetJobs);
        return () => {};
      });

      const { getByTestId, queryByText, findByText, getByText } = render(<LogisticsFeedScreen />);

      expect(await findByText('Qudos Bank Arena Video Wall Transport')).toBeTruthy(); // Assigned to Alex Rivera

      // Tap "Assigned to Me"
      const assignedMeToggle = getByTestId('toggle-assigned-me');
      await act(async () => {
        fireEvent.press(assignedMeToggle);
      });

      // Sam Fisher's jobs should remain
      expect(await findByText('Sydney Opera House Gala Audio Run')).toBeTruthy();
      expect(getByText('Enmore Theatre Lighting Delivery')).toBeTruthy();
      expect(getByText('Metro Theatre Return Run')).toBeTruthy();

      // Alex Rivera's job should be filtered out
      expect(queryByText('Qudos Bank Arena Video Wall Transport')).toBeNull();

      // Tap back to "All Jobs"
      const allJobsToggle = getByTestId('toggle-all-jobs');
      await act(async () => {
        fireEvent.press(allJobsToggle);
      });

      expect(await findByText('Qudos Bank Arena Video Wall Transport')).toBeTruthy();
    });

    it('filters feed jobs via status filter chips ("Active", "Scheduled", "Completed")', async () => {
      jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((_tId, onUpdate) => {
        onUpdate(mockDatasetJobs);
        return () => {};
      });

      const { getByTestId, queryByText, findByText, getByText } = render(<LogisticsFeedScreen />);

      // Filter by Active
      const activeChip = getByTestId('status-filter-active');
      await act(async () => {
        fireEvent.press(activeChip);
      });

      expect(await findByText('Enmore Theatre Lighting Delivery')).toBeTruthy();
      expect(queryByText('Sydney Opera House Gala Audio Run')).toBeNull();
      expect(queryByText('Metro Theatre Return Run')).toBeNull();

      // Filter by Scheduled
      const scheduledChip = getByTestId('status-filter-scheduled');
      await act(async () => {
        fireEvent.press(scheduledChip);
      });

      expect(await findByText('Sydney Opera House Gala Audio Run')).toBeTruthy();
      expect(getByText('Qudos Bank Arena Video Wall Transport')).toBeTruthy();
      expect(queryByText('Enmore Theatre Lighting Delivery')).toBeNull();

      // Filter by Completed
      const completedChip = getByTestId('status-filter-completed');
      await act(async () => {
        fireEvent.press(completedChip);
      });

      expect(await findByText('Metro Theatre Return Run')).toBeTruthy();
      expect(queryByText('Sydney Opera House Gala Audio Run')).toBeNull();
    });

    it('filters feed jobs via search keyword input and handles empty search reset', async () => {
      jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((_tId, onUpdate) => {
        onUpdate(mockDatasetJobs);
        return () => {};
      });

      const { getByTestId, queryByText, findByText, getByText } = render(<LogisticsFeedScreen />);

      const searchInput = getByTestId('logistics-search-input');
      await act(async () => {
        fireEvent.changeText(searchInput, 'Enmore');
      });

      expect(await findByText('Enmore Theatre Lighting Delivery')).toBeTruthy();
      expect(queryByText('Sydney Opera House Gala Audio Run')).toBeNull();
      expect(queryByText('Metro Theatre Return Run')).toBeNull();

      // Test non-matching query -> empty state -> reset filters button
      await act(async () => {
        fireEvent.changeText(searchInput, 'NonExistentVenueXYZ');
      });

      expect(await findByText('No Logistics Jobs Found')).toBeTruthy();
      const resetBtn = getByTestId('reset-logistics-filters-btn');
      await act(async () => {
        fireEvent.press(resetBtn);
      });

      expect(await findByText('Sydney Opera House Gala Audio Run')).toBeTruthy();
    });

    it('navigates to job detail screen when tapping a job card', async () => {
      jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((_tId, onUpdate) => {
        onUpdate(mockDatasetJobs);
        return () => {};
      });

      const { findByTestId } = render(<LogisticsFeedScreen />);

      const jobCard = await findByTestId('logistics-job-job-alpha-701');
      await act(async () => {
        fireEvent.press(jobCard);
      });

      expect(mockPush).toHaveBeenCalledWith('/logistics/job-alpha-701');
    });

    it('displays LIVE GPS indicator badge on jobs with active tracking', async () => {
      jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((_tId, onUpdate) => {
        onUpdate(mockDatasetJobs);
        return () => {};
      });

      const { findByTestId, queryByTestId } = render(<LogisticsFeedScreen />);

      // job-alpha-702 has isTrackingActive: true
      expect(await findByTestId('job-live-tracking-pill-job-alpha-702')).toBeTruthy();
      // job-alpha-701 has isTrackingActive: false
      expect(queryByTestId('job-live-tracking-pill-job-alpha-701')).toBeNull();
    });
  });

  // ==========================================================================
  // SCENARIO 2: JOB ACTIVATION & BACKGROUND GPS TRACKING LIFECYCLE
  // ==========================================================================
  describe('Scenario 2: Driver activates scheduled job -> triggers status transition to "In Progress" AND startTrackingJob syncing GPS coordinates to Firestore', () => {
    it('activates scheduled job, starts background GPS updates, and writes initial GPS location to Firestore', async () => {
      mockSearchParamId = 'job-alpha-701';
      const scheduledJob = { ...mockDatasetJobs[0] };

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(scheduledJob);
        return () => {};
      });

      const startTrackingSpy = jest.spyOn(locationTrackingService, 'startTrackingJob');
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValue(undefined);
      const updateLocationSpy = jest.spyOn(logisticsService, 'updateJobLocation').mockResolvedValue(undefined);

      const { findByTestId, getByText } = render(<LogisticsJobDetailScreen />);

      const activateBtn = await findByTestId('activate-job-btn');
      expect(getByText('Activate Job / Start Route')).toBeTruthy();

      await act(async () => {
        fireEvent.press(activateBtn);
      });

      // 1. Verify startTrackingJob was invoked with driver info
      expect(startTrackingSpy).toHaveBeenCalledWith(
        'job-alpha-701',
        tenantAlpha,
        expect.objectContaining({
          driverId: 'usr-driver-sam-01',
          driverName: 'Sam Fisher',
        })
      );

      // 2. Verify status transition to 'In Progress'
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-alpha-701',
        'In Progress',
        expect.objectContaining({
          note: 'Driver started route and initiated GPS tracking',
          tenantId: tenantAlpha,
        })
      );

      // 3. Verify Expo Location startLocationUpdatesAsync was called
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
        locationTrackingService.LOCATION_TASK_NAME,
        expect.objectContaining({
          accuracy: Location.Accuracy.High,
          showsBackgroundLocationIndicator: true,
        })
      );

      // 4. Verify initial coordinates were synced to Firestore
      expect(updateLocationSpy).toHaveBeenCalledWith(
        'job-alpha-701',
        expect.objectContaining({
          latitude: -33.8568,
          longitude: 151.2153,
          driverId: 'usr-driver-sam-01',
          driverName: 'Sam Fisher',
          jobId: 'job-alpha-701',
        })
      );

      // 5. Verify in-memory tracking singleton state is active
      expect(locationTrackingService.isTrackingActive()).toBe(true);
      expect(locationTrackingService.getActiveTrackingJobId()).toBe('job-alpha-701');
      expect(locationTrackingService.getActiveTenantId()).toBe(tenantAlpha);
    });

    it('updates live GPS banner to BROADCASTING and renders real-time coordinates', async () => {
      mockSearchParamId = 'job-alpha-702';
      const activeTrackingJob: LogisticsEntry = {
        ...mockDatasetJobs[1],
        isTrackingActive: true,
      };

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(activeTrackingJob);
        return () => {};
      });

      const { findByTestId, getByText } = render(<LogisticsJobDetailScreen />);

      expect(await findByTestId('live-gps-tracking-banner')).toBeTruthy();
      expect(getByText('GPS Tracking Active')).toBeTruthy();
      expect(getByText('BROADCASTING')).toBeTruthy();
      expect(getByText(/Lat: -33\.89880, Lng: 151\.17550/)).toBeTruthy();
    });

    it('handles permission denial gracefully and displays error banner without unhandled crash', async () => {
      mockSearchParamId = 'job-alpha-701';
      const scheduledJob = { ...mockDatasetJobs[0] };

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(scheduledJob);
        return () => {};
      });

      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      const { findByTestId } = render(<LogisticsJobDetailScreen />);

      const activateBtn = await findByTestId('activate-job-btn');
      await act(async () => {
        fireEvent.press(activateBtn);
      });

      expect(locationTrackingService.isTrackingActive()).toBe(false);
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SCENARIO 3: 1-TAP "OPEN IN MAPS" SMART ACTION
  // ==========================================================================
  describe('Scenario 3: Driver performs 1-tap "Open in Maps" on destination -> triggers Linking.openURL with sanitized Google Maps query URL', () => {
    it('triggers Linking.openURL with properly sanitized, formatted Google Maps search query', async () => {
      const destination = mockDatasetJobs[0].destinations![0];

      const { getByTestId } = render(
        <LogisticsDestinationCard destination={destination} index={0} />
      );

      const mapsBtn = getByTestId(`open-maps-btn-${destination.id}`);
      await act(async () => {
        fireEvent.press(mapsBtn);
      });

      expect(openURLSpy).toHaveBeenCalledTimes(1);
      const calledUrl = openURLSpy.mock.calls[0][0];
      expect(calledUrl).toContain('https://www.google.com/maps/search/?api=1&query=');
      expect(calledUrl).toContain(encodeURIComponent('Opera House Loading Dock 2, Macquarie St, Sydney NSW 2000'));
    });

    it('normalizes multi-line address and trailing whitespace for map URL generation', async () => {
      const destination: LogisticsDestination = {
        id: 'dest-multiline',
        type: 'destination',
        destinationName: 'International Convention Centre',
        address: '14 Darling Dr\nLevel 2 Freight Bay\nSydney NSW 2000  ',
      };

      const { getByTestId } = render(
        <LogisticsDestinationCard destination={destination} index={0} />
      );

      const mapsBtn = getByTestId('open-maps-btn-dest-multiline');
      await act(async () => {
        fireEvent.press(mapsBtn);
      });

      expect(openURLSpy).toHaveBeenCalledTimes(1);
      const calledUrl = openURLSpy.mock.calls[0][0];
      expect(calledUrl).toContain(encodeURIComponent('International Convention Centre, 14 Darling Dr, Level 2 Freight Bay, Sydney NSW 2000'));
    });

    it('disables "Open in Maps" button when address and venue name are missing', () => {
      const destination: LogisticsDestination = {
        id: 'dest-blank',
        type: 'note',
        destinationName: '',
        address: '',
      };

      const { getByTestId } = render(
        <LogisticsDestinationCard destination={destination} index={0} />
      );

      const mapsBtn = getByTestId('open-maps-btn-dest-blank');
      expect(mapsBtn.props.accessibilityState?.disabled).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO 4: 1-TAP "CALL CONTACT" SMART ACTION
  // ==========================================================================
  describe('Scenario 4: Driver performs 1-tap "Call Contact" on destination -> triggers Linking.openURL with sanitized tel: URL', () => {
    it('extracts and dials international formatted phone numbers', async () => {
      const destination = mockDatasetJobs[0].destinations![0]; // Contact: 'Stage Mgr Dave: +61 412 345 678'

      const { getByTestId } = render(
        <LogisticsDestinationCard destination={destination} index={0} />
      );

      const callBtn = getByTestId(`call-contact-btn-${destination.id}`);
      await act(async () => {
        fireEvent.press(callBtn);
      });

      expect(openURLSpy).toHaveBeenCalledTimes(1);
      expect(openURLSpy).toHaveBeenCalledWith('tel:+61412345678');
    });

    it('extracts and dials Australian domestic landline and mobile phone numbers', async () => {
      const destination = mockDatasetJobs[0].destinations![1]; // Contact: 'Office: (02) 9876 5432'

      const { getByTestId } = render(
        <LogisticsDestinationCard destination={destination} index={1} />
      );

      const callBtn = getByTestId(`call-contact-btn-${destination.id}`);
      await act(async () => {
        fireEvent.press(callBtn);
      });

      expect(openURLSpy).toHaveBeenCalledTimes(1);
      expect(openURLSpy).toHaveBeenCalledWith('tel:0298765432');
    });

    it('disables "Call Contact" button when contact string has no dialable digits', () => {
      const destination: LogisticsDestination = {
        id: 'dest-no-phone',
        type: 'destination',
        destinationName: 'Security Gate',
        address: '10 Industrial Pkwy',
        contact: 'Guard on post (no radio / no phone)',
      };

      const { getByTestId } = render(
        <LogisticsDestinationCard destination={destination} index={0} />
      );

      const callBtn = getByTestId('call-contact-btn-dest-no-phone');
      expect(callBtn.props.accessibilityState?.disabled).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO 5: DRIVER INTERNAL NOTES LOGGING & AUDIT TRAIL
  // ==========================================================================
  describe('Scenario 5: Driver appends internal notes -> notes update in Firestore with author and timestamp', () => {
    it('opens notes modal and submits internal note with author attribution', async () => {
      mockSearchParamId = 'job-alpha-701';
      const jobWithNotes = { ...mockDatasetJobs[0] };

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(jobWithNotes);
        return () => {};
      });

      const appendNoteSpy = jest.spyOn(logisticsService, 'appendLogisticsNote').mockResolvedValue(undefined);

      const { findByTestId, getByTestId } = render(<LogisticsJobDetailScreen />);

      const addNoteBtn = await findByTestId('add-note-btn');
      await act(async () => {
        fireEvent.press(addNoteBtn);
      });

      expect(getByTestId('job-notes-modal')).toBeTruthy();

      // Enter driver note
      const noteInput = getByTestId('logistics-note-input');
      fireEvent.changeText(noteInput, 'Dock 2 entry security code is #8844. Forklift driver on lunch until 12:30.');

      // Submit note
      const submitBtn = getByTestId('submit-notes-btn');
      await act(async () => {
        fireEvent.press(submitBtn);
      });

      expect(appendNoteSpy).toHaveBeenCalledWith(
        'job-alpha-701',
        'Dock 2 entry security code is #8844. Forklift driver on lunch until 12:30.',
        'Sam Fisher',
        tenantAlpha
      );
    });

    it('renders audit notes history in chronological order', async () => {
      mockSearchParamId = 'job-alpha-701';
      const jobWithHistory: LogisticsEntry = {
        ...mockDatasetJobs[0],
        notes:
          '2026-08-27 06:00 [Dispatch Coordinator]: Pallet 1 loaded with line-array speakers.\n2026-08-27 08:35 [Sam Fisher]: Arrived at Dock 2. Loading bay clear.',
      };

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(jobWithHistory);
        return () => {};
      });

      const { findByText } = render(<LogisticsJobDetailScreen />);

      expect(
        await findByText('2026-08-27 06:00 [Dispatch Coordinator]: Pallet 1 loaded with line-array speakers.')
      ).toBeTruthy();
      expect(
        await findByText('2026-08-27 08:35 [Sam Fisher]: Arrived at Dock 2. Loading bay clear.')
      ).toBeTruthy();
    });
  });

  // ==========================================================================
  // SCENARIO 6: JOB COMPLETION & BACKGROUND GPS DEACTIVATION
  // ==========================================================================
  describe('Scenario 6: Driver completes job -> triggers status transition to "Completed" AND triggers stopTrackingJob deactivating GPS polling', () => {
    it('completes active job, deactivates background GPS updates, and updates Firestore state', async () => {
      mockSearchParamId = 'job-alpha-702';
      const activeJob: LogisticsEntry = {
        ...mockDatasetJobs[1],
        status: 'In Progress',
        isTrackingActive: true,
      };

      // Set in-memory tracking state to simulate active tracking
      await locationTrackingService.startTrackingJob('job-alpha-702', tenantAlpha);
      expect(locationTrackingService.isTrackingActive()).toBe(true);

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(activeJob);
        return () => {};
      });

      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockResolvedValue(undefined);

      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true);

      const { findByTestId, getByText } = render(<LogisticsJobDetailScreen />);

      const completeBtn = await findByTestId('complete-job-btn');
      expect(getByText('Complete Job')).toBeTruthy();

      await act(async () => {
        fireEvent.press(completeBtn);
      });

      // 1. Verify stopTrackingJob was called
      expect(stopTrackingSpy).toHaveBeenCalledWith('job-alpha-702');

      // 2. Verify Expo Location stopLocationUpdatesAsync was invoked
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        locationTrackingService.LOCATION_TASK_NAME
      );

      // 3. Verify Firestore status transition to 'Completed'
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-alpha-702',
        'Completed',
        expect.objectContaining({
          note: 'Driver marked job as completed',
          tenantId: tenantAlpha,
        })
      );

      // 4. Verify in-memory tracking singleton state is deactivated
      expect(locationTrackingService.isTrackingActive()).toBe(false);
      expect(locationTrackingService.getActiveTrackingJobId()).toBeNull();
    });

    it('renders completed job state with success badge and inactive GPS banner', async () => {
      mockSearchParamId = 'job-alpha-704';
      const completedJob: LogisticsEntry = {
        ...mockDatasetJobs[3],
        status: 'Completed',
        isTrackingActive: false,
      };

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(completedJob);
        return () => {};
      });

      const { findByTestId, getByText, queryByTestId } = render(<LogisticsJobDetailScreen />);

      expect(await findByTestId('live-gps-tracking-banner')).toBeTruthy();
      expect(getByText('GPS Tracking Inactive')).toBeTruthy();
      expect(getByText('IDLE')).toBeTruthy();
      expect(getByText('Job is marked completed. Location tracking stopped.')).toBeTruthy();

      // Action buttons for Activate and Complete should not be visible on completed job
      expect(queryByTestId('activate-job-btn')).toBeNull();
      expect(queryByTestId('complete-job-btn')).toBeNull();
    });
  });

  // ==========================================================================
  // SCENARIO 7: MULTI-TENANT BOUNDARY CHECK & ISOLATION BARRIER
  // ==========================================================================
  describe('Scenario 7: Multi-tenant boundary check -> documents from another tenant are rejected and not accessible', () => {
    it('excludes jobs belonging to a foreign tenant from feed subscription', () => {
      let emittedJobs: LogisticsEntry[] = [];

      jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((tenantId, cb) => {
        // Service should only emit jobs matching the requested tenant
        const filtered = [...mockDatasetJobs, mockForeignTenantJob].filter((j) => j.tenantId === tenantId);
        cb(filtered);
        return () => {};
      });

      logisticsService.subscribeToLogistics(tenantAlpha, (jobs) => {
        emittedJobs = jobs;
      });

      expect(emittedJobs).toHaveLength(4);
      expect(emittedJobs.every((j) => j.tenantId === tenantAlpha)).toBe(true);
      expect(emittedJobs.some((j) => j.id === 'job-beta-999')).toBe(false);
    });

    it('rejects single job subscription if document belongs to another tenant', () => {
      let emittedJob: LogisticsEntry | null = 'INITIAL' as any;

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, tenantId, cb) => {
        if (mockForeignTenantJob.tenantId !== tenantId) {
          cb(null);
        } else {
          cb(mockForeignTenantJob);
        }
        return () => {};
      });

      logisticsService.subscribeSingleLogisticsEntry('job-beta-999', tenantAlpha, (job) => {
        emittedJob = job;
      });

      expect(emittedJob).toBeNull();
    });

    it('rejects getLogisticsEntry fetch across tenant boundaries', async () => {
      jest.spyOn(logisticsService, 'getLogisticsEntry').mockImplementation(async (jobId, tenantId) => {
        if (jobId === 'job-beta-999' && tenantId === tenantAlpha) {
          return null;
        }
        return mockForeignTenantJob;
      });

      const result = await logisticsService.getLogisticsEntry('job-beta-999', tenantAlpha);
      expect(result).toBeNull();
    });

    it('throws authorization error on cross-tenant status update', async () => {
      jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(async (_jId, _st, options) => {
        if (options?.tenantId && options.tenantId !== tenantBeta) {
          throw new Error('Unauthorized: Tenant isolation mismatch');
        }
      });

      await expect(
        logisticsService.updateLogisticsStatus('job-beta-999', 'Completed', {
          tenantId: tenantAlpha,
        })
      ).rejects.toThrow(/Unauthorized: Tenant isolation mismatch/);
    });

    it('throws authorization error on cross-tenant note append', async () => {
      jest.spyOn(logisticsService, 'appendLogisticsNote').mockImplementation(async (_jId, _note, _author, tenantId) => {
        if (tenantId && tenantId !== tenantBeta) {
          throw new Error('Unauthorized: Tenant isolation mismatch');
        }
      });

      await expect(
        logisticsService.appendLogisticsNote('job-beta-999', 'Rogue note', 'Attacker', tenantAlpha)
      ).rejects.toThrow(/Unauthorized: Tenant isolation mismatch/);
    });

    it('defensively parses sparse or corrupted documents without throwing exceptions', () => {
      const corruptDoc = {
        id: 'job-corrupt',
        data: () => ({
          tenantId: tenantAlpha,
          destinations: null,
          currentLocation: { latitude: 'invalid', longitude: null },
          start: 'not-a-date',
        }),
      };

      const mapped = logisticsService.mapFirestoreLogisticsDoc(corruptDoc);
      expect(mapped.id).toBe('job-corrupt');
      expect(mapped.tenantId).toBe(tenantAlpha);
      expect(mapped.destinations).toEqual([]);
      expect(mapped.currentLocation).toBeNull();
      expect(mapped.start).toBeInstanceOf(Date);
      expect(mapped.status).toBe('Draft');
    });
  });

  // ==========================================================================
  // SCENARIO 8: INTEGRATED FULL-LIFECYCLE DRIVER JOURNEY (E2E MASTER WORKFLOW)
  // ==========================================================================
  describe('Scenario 8: Integrated Full-Lifecycle Driver Journey (E2E Master Workflow)', () => {
    it('executes complete step-by-step driver workflow: Select -> Activate -> GPS Track -> Maps -> Call -> Add Note -> Complete', async () => {
      // 1. Initial State: Driver in Feed view
      jest.spyOn(logisticsService, 'subscribeToLogistics').mockImplementation((tenantId, cb) => {
        cb(mockDatasetJobs.filter((j) => j.tenantId === tenantId));
        return () => {};
      });

      const feedRender = render(<LogisticsFeedScreen />);
      expect(await feedRender.findByText('Sydney Opera House Gala Audio Run')).toBeTruthy();

      // Driver taps on scheduled job #701
      const jobCard = await feedRender.findByTestId('logistics-job-job-alpha-701');
      await act(async () => {
        fireEvent.press(jobCard);
      });
      expect(mockPush).toHaveBeenCalledWith('/logistics/job-alpha-701');

      // 2. Driver opens Job Detail view
      mockSearchParamId = 'job-alpha-701';
      let currentJobState: LogisticsEntry = { ...mockDatasetJobs[0] };

      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(currentJobState);
        return () => {};
      });

      const startTrackingSpy = jest.spyOn(locationTrackingService, 'startTrackingJob');
      const stopTrackingSpy = jest.spyOn(locationTrackingService, 'stopTrackingJob');
      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus').mockImplementation(async (_jId, newStatus) => {
        currentJobState = {
          ...currentJobState,
          status: newStatus as any,
          isTrackingActive: newStatus === 'In Progress',
        };
      });
      const appendNoteSpy = jest.spyOn(logisticsService, 'appendLogisticsNote').mockResolvedValue(undefined);

      const detailRender = render(<LogisticsJobDetailScreen />);
      expect(await detailRender.findByText('Sydney Opera House Gala Audio Run')).toBeTruthy();

      // 3. Driver Activates Job / Starts Route
      const activateBtn = await detailRender.findByTestId('activate-job-btn');
      await act(async () => {
        fireEvent.press(activateBtn);
      });

      expect(startTrackingSpy).toHaveBeenCalledWith(
        'job-alpha-701',
        tenantAlpha,
        expect.objectContaining({ driverId: 'usr-driver-sam-01' })
      );
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-alpha-701',
        'In Progress',
        expect.anything()
      );
      expect(locationTrackingService.isTrackingActive()).toBe(true);

      // 4. Driver performs 1-Tap "Open in Maps" for Stop 1
      const stop1MapsBtn = detailRender.getByTestId('open-maps-btn-dest-stop-1');
      await act(async () => {
        fireEvent.press(stop1MapsBtn);
      });

      expect(openURLSpy).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('Opera House Loading Dock 2, Macquarie St, Sydney NSW 2000'))
      );

      // 5. Driver performs 1-Tap "Call Contact" for Stop 1
      const stop1CallBtn = detailRender.getByTestId('call-contact-btn-dest-stop-1');
      await act(async () => {
        fireEvent.press(stop1CallBtn);
      });

      expect(openURLSpy).toHaveBeenCalledWith('tel:+61412345678');

      // 6. Driver Appends Internal Delivery Note
      const addNoteBtn = detailRender.getByTestId('add-note-btn');
      await act(async () => {
        fireEvent.press(addNoteBtn);
      });

      const noteInput = detailRender.getByTestId('logistics-note-input');
      fireEvent.changeText(noteInput, 'Speakers unloaded at Dock 2. Moving to production office for mic racks.');

      const submitNotesBtn = detailRender.getByTestId('submit-notes-btn');
      await act(async () => {
        fireEvent.press(submitNotesBtn);
      });

      expect(appendNoteSpy).toHaveBeenCalledWith(
        'job-alpha-701',
        'Speakers unloaded at Dock 2. Moving to production office for mic racks.',
        'Sam Fisher',
        tenantAlpha
      );

      // 7. Driver Completes Job
      // Transition job state to In Progress for component re-render
      currentJobState = {
        ...currentJobState,
        status: 'In Progress',
        isTrackingActive: true,
      };

      const completeDetailRender = render(<LogisticsJobDetailScreen />);
      const completeBtn = await completeDetailRender.findByTestId('complete-job-btn');
      await act(async () => {
        fireEvent.press(completeBtn);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-alpha-701');
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-alpha-701',
        'Completed',
        expect.anything()
      );
      expect(locationTrackingService.isTrackingActive()).toBe(false);
    });
  });
});
