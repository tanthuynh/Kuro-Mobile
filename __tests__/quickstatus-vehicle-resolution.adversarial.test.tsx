/**
 * __tests__/quickstatus-vehicle-resolution.adversarial.test.tsx
 * ============================================================================
 * Adversarial Challenger 2 Test Suite:
 * QuickStatusSelector, Vehicle Resolution & Logistics UI Security
 * ============================================================================
 *
 * EMPIRICAL ADVERSARIAL STRESS TEST MATRIX:
 * 1. QuickStatusSelector Component Deep Stress Testing
 *    - 1-click status transitions across canonical and custom status sets
 *    - Idempotency & disabled state enforcement
 *    - isUpdating spinner visibility and transition locking
 *    - Case-insensitive status matching and fallback configs
 *    - Accessibility roles, labels, and selected states
 * 2. fetchVehicleById Robustness & Cross-Tenant Boundary Enforcement
 *    - Null, undefined, empty, whitespace, and injection vehicle IDs
 *    - Corrupted/sparse Firestore document handling (missing name/rego/tenantId)
 *    - Name & rego formatting deduplication
 *    - Strict cross-tenant rejection (leak prevention)
 *    - Firestore exception resilience (network failure, permission denied)
 * 3. Logistics Job Detail Screen UI & Lifecycle Synchronization
 *    - Bracketed header title format [#eventNumber]
 *    - Removal of live-gps-tracking-banner (strictly null in all states)
 *    - Header tracking status badge (Idle vs Tracking)
 *    - 3-button control bar (Play, Pause, Finish) behavior and status preservation
 *    - QuickStatusSelector in Job Overview triggering tracking start/stop appropriately
 *    - Vehicle name resolution rendering across all fixture combinations
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import {
  QuickStatusSelector,
  LOGISTICS_CANONICAL_STATUSES,
  FIVE_CANONICAL_STATUSES,
  LOGISTICS_STATUS_CONFIG,
} from '@/components/repair/quick-status-selector';
import { fetchVehicleById, updateLogisticsStatus } from '@/services/logistics-service';
import LogisticsJobDetailScreen from '@/../app/logistics/[id]';
import * as logisticsService from '@/services/logistics-service';
import * as locationTrackingService from '@/services/location-tracking-service';
import * as firestore from 'firebase/firestore';
import type { LogisticsEntry, Vehicle } from '@/types/logistics';

// Global Firestore Mock references
const mockFirestore = firestore as jest.Mocked<any>;

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

// Mock Auth Context
const mockAuthUser = {
  id: 'usr-driver-adv',
  uid: 'usr-driver-adv',
  name: 'Empirical Challenger',
  email: 'challenger@kuro.test',
  tenantId: 'tenant-secure-zone',
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    tenant: { tenantId: 'tenant-secure-zone', tenantName: 'Secure Zone Fleet' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock Router
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
  useLocalSearchParams: () => ({
    id: 'job-adv-999',
  }),
}));

describe('Adversarial Challenger 2: QuickStatusSelector, Vehicle Resolution & UI Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // SECTION 1: QUICKSTATUSSELECTOR COMPONENT DEEP STRESS TESTING
  // ==========================================================================
  describe('1. QuickStatusSelector Component Deep Stress Testing', () => {
    it('QSS-ADV-01: Renders all 5 logistics canonical statuses and handles 1-click selection', () => {
      const onSelectStatus = jest.fn();

      const { getByTestId, getByText } = render(
        <QuickStatusSelector
          currentStatus="Pending"
          statuses={LOGISTICS_CANONICAL_STATUSES}
          onSelectStatus={onSelectStatus}
          showHeader={true}
          headerTitle="LOGISTICS STATUS"
          testID="adv-quick-status"
        />
      );

      expect(getByText('LOGISTICS STATUS')).toBeTruthy();

      // Check all 5 status buttons exist
      const statuses = ['Pending', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'];
      for (const st of statuses) {
        const testId = `status-btn-${st.toLowerCase().replace(/\s+/g, '-')}`;
        expect(getByTestId(testId)).toBeTruthy();
      }

      // Click on 'In Progress'
      fireEvent.press(getByTestId('status-btn-in-progress'));
      expect(onSelectStatus).toHaveBeenCalledWith('In Progress');

      // Click on 'Completed'
      fireEvent.press(getByTestId('status-btn-completed'));
      expect(onSelectStatus).toHaveBeenCalledWith('Completed');

      // Click on 'Cancelled'
      fireEvent.press(getByTestId('status-btn-cancelled'));
      expect(onSelectStatus).toHaveBeenCalledWith('Cancelled');
    });

    it('QSS-ADV-02: Idempotent - clicking currentStatus does NOT trigger onSelectStatus', () => {
      const onSelectStatus = jest.fn();

      const { getByTestId } = render(
        <QuickStatusSelector
          currentStatus="In Progress"
          statuses={LOGISTICS_CANONICAL_STATUSES}
          onSelectStatus={onSelectStatus}
        />
      );

      // Press button corresponding to current status
      fireEvent.press(getByTestId('status-btn-in-progress'));
      expect(onSelectStatus).not.toHaveBeenCalled();
    });

    it('QSS-ADV-03: Case-insensitive matching identifies current status correctly', () => {
      const onSelectStatus = jest.fn();

      const { getByTestId } = render(
        <QuickStatusSelector
          currentStatus="in progress" // Lowercase variation
          statuses={LOGISTICS_CANONICAL_STATUSES}
          onSelectStatus={onSelectStatus}
        />
      );

      // Pressing 'In Progress' should be recognized as current and not fire
      fireEvent.press(getByTestId('status-btn-in-progress'));
      expect(onSelectStatus).not.toHaveBeenCalled();

      // Pressing 'Scheduled' should fire
      fireEvent.press(getByTestId('status-btn-scheduled'));
      expect(onSelectStatus).toHaveBeenCalledWith('Scheduled');
    });

    it('QSS-ADV-04: Disabled prop prevents all status selections', () => {
      const onSelectStatus = jest.fn();

      const { getByTestId } = render(
        <QuickStatusSelector
          currentStatus="Scheduled"
          statuses={LOGISTICS_CANONICAL_STATUSES}
          onSelectStatus={onSelectStatus}
          disabled={true}
        />
      );

      fireEvent.press(getByTestId('status-btn-pending'));
      fireEvent.press(getByTestId('status-btn-in-progress'));
      fireEvent.press(getByTestId('status-btn-completed'));
      fireEvent.press(getByTestId('status-btn-cancelled'));

      expect(onSelectStatus).not.toHaveBeenCalled();
    });

    it('QSS-ADV-05: isUpdating prop displays ActivityIndicator and locks interactions', () => {
      const onSelectStatus = jest.fn();

      const { getByTestId, getByText } = render(
        <QuickStatusSelector
          currentStatus="Scheduled"
          statuses={LOGISTICS_CANONICAL_STATUSES}
          onSelectStatus={onSelectStatus}
          isUpdating={true}
          showHeader={true}
        />
      );

      expect(getByText('Updating...')).toBeTruthy();

      fireEvent.press(getByTestId('status-btn-in-progress'));
      expect(onSelectStatus).not.toHaveBeenCalled();
    });

    it('QSS-ADV-06: Falls back safely when statuses array is omitted', () => {
      const onSelectStatus = jest.fn();

      const { getByTestId } = render(
        <QuickStatusSelector
          currentStatus="Reported"
          onSelectStatus={onSelectStatus}
        />
      );

      // Default should be FIVE_CANONICAL_STATUSES (repair statuses)
      expect(getByTestId('status-btn-reported')).toBeTruthy();
      expect(getByTestId('status-btn-pending')).toBeTruthy();
      expect(getByTestId('status-btn-under-repair')).toBeTruthy();
      expect(getByTestId('status-btn-completed')).toBeTruthy();
      expect(getByTestId('status-btn-cancel')).toBeTruthy();
    });

    it('QSS-ADV-07: Supports custom statusConfigs and custom statuses without crash', () => {
      const onSelectStatus = jest.fn();
      const customStatuses = ['Custom_A', 'Custom_B'];
      const customConfigs = {
        Custom_A: { label: 'Status Alpha', color: '#123456' },
        Custom_B: { label: 'Status Beta', color: '#654321' },
      };

      const { getByTestId, getByText } = render(
        <QuickStatusSelector
          currentStatus="Custom_A"
          statuses={customStatuses}
          statusConfigs={customConfigs}
          onSelectStatus={onSelectStatus}
        />
      );

      expect(getByText('Status Alpha')).toBeTruthy();
      expect(getByText('Status Beta')).toBeTruthy();

      fireEvent.press(getByTestId('status-btn-custom_b'));
      expect(onSelectStatus).toHaveBeenCalledWith('Custom_B');
    });
  });

  // ==========================================================================
  // SECTION 2: FETCHVEHICLEBYID ROBUSTNESS & CROSS-TENANT ISOLATION
  // ==========================================================================
  describe('2. fetchVehicleById Robustness & Cross-Tenant Boundary Enforcement', () => {
    it('VEH-ADV-01: Returns null immediately for empty, whitespace, null, or undefined IDs without Firestore calls', async () => {
      expect(await fetchVehicleById('')).toBeNull();
      expect(await fetchVehicleById('   ')).toBeNull();
      expect(await fetchVehicleById('\t\n ')).toBeNull();
      expect(await fetchVehicleById(null as any)).toBeNull();
      expect(await fetchVehicleById(undefined as any)).toBeNull();
      expect(mockFirestore.getDoc).not.toHaveBeenCalled();
    });

    it('VEH-ADV-02: Returns null when vehicle document does not exist in Firestore', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const vehicle = await fetchVehicleById('veh-nonexistent-404', 'tenant-secure-zone');
      expect(vehicle).toBeNull();
      expect(mockFirestore.doc).toHaveBeenCalledWith(expect.anything(), 'vehicles', 'veh-nonexistent-404');
    });

    it('VEH-ADV-03: Successfully maps complete vehicle document with all optional metadata', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'veh-truck-09',
        data: () => ({
          name: 'Heavy Rig 09',
          rego: 'NSW-RIG09',
          color: 'Midnight Black',
          size: '12-Tonne Pantech',
          make: 'Isuzu',
          model: 'FVR 1000',
          notes: 'Tail-lift certified',
          tenantId: 'tenant-secure-zone',
          order: 3,
        }),
      });

      const vehicle = await fetchVehicleById('veh-truck-09', 'tenant-secure-zone');
      expect(vehicle).toEqual({
        id: 'veh-truck-09',
        name: 'Heavy Rig 09',
        rego: 'NSW-RIG09',
        color: 'Midnight Black',
        size: '12-Tonne Pantech',
        make: 'Isuzu',
        model: 'FVR 1000',
        notes: 'Tail-lift certified',
        tenantId: 'tenant-secure-zone',
        order: 3,
      });
    });

    it('VEH-ADV-04: Gracefully handles sparse/corrupted vehicle document missing rego, make, notes', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'veh-sparse-1',
        data: () => ({
          name: 'Utility Ute',
          tenantId: 'tenant-secure-zone',
        }),
      });

      const vehicle = await fetchVehicleById('veh-sparse-1', 'tenant-secure-zone');
      expect(vehicle).toEqual({
        id: 'veh-sparse-1',
        name: 'Utility Ute',
        rego: '',
        color: undefined,
        size: undefined,
        make: undefined,
        model: undefined,
        notes: undefined,
        tenantId: 'tenant-secure-zone',
        order: undefined,
      });
    });

    it('VEH-ADV-05: Strict Tenant Isolation Barrier - returns null when document tenantId mismatches requested tenantId', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'veh-foreign-99',
        data: () => ({
          name: 'Foreign Fleet Van',
          rego: 'VIC-LEAK01',
          tenantId: 'tenant-foreign-hacker',
        }),
      });

      const vehicle = await fetchVehicleById('veh-foreign-99', 'tenant-secure-zone');
      expect(vehicle).toBeNull();
    });

    it('VEH-ADV-06: Exception safety - returns null without crashing when Firestore throws network/permission error', async () => {
      mockFirestore.getDoc.mockRejectedValueOnce(new Error('Firestore network timeout or permission denied'));

      const vehicle = await fetchVehicleById('veh-error-prone', 'tenant-secure-zone');
      expect(vehicle).toBeNull();
    });

    it('VEH-ADV-07: Sanitizes vehicleId with leading/trailing whitespace before Firestore query', async () => {
      mockFirestore.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'veh-clean-id',
        data: () => ({
          name: 'Clean Van',
          tenantId: 'tenant-secure-zone',
        }),
      });

      await fetchVehicleById('   veh-clean-id   ', 'tenant-secure-zone');
      expect(mockFirestore.doc).toHaveBeenCalledWith(expect.anything(), 'vehicles', 'veh-clean-id');
    });
  });

  // ==========================================================================
  // SECTION 3: LOGISTICS DETAIL SCREEN UI & LIFECYCLE SYNCHRONIZATION
  // ==========================================================================
  describe('3. Logistics Job Detail Screen UI & Lifecycle Synchronization', () => {
    const baseMockJob: LogisticsEntry = {
      id: 'job-adv-999',
      tenantId: 'tenant-secure-zone',
      eventNumber: 888,
      eventName: 'Grand Finale Fireworks Transport',
      location: 'Sydney Harbour Foreshore',
      status: 'Scheduled',
      driverName: 'Empirical Challenger',
      assigneeId: 'usr-driver-adv',
      vehicleId: 'veh-van-04',
      start: new Date('2026-09-01T10:00:00Z'),
      end: new Date('2026-09-01T22:00:00Z'),
      createdBy: 'Dispatch Lead',
      updatedBy: 'Dispatch Lead',
      createdAt: '2026-09-01T06:00:00Z',
      updatedAt: '2026-09-01T06:00:00Z',
      archived: false,
      isTrackingActive: false,
      notes: '2026-09-01 06:00 [Dispatch Lead]: Hazmat escort required.',
      destinations: [
        {
          id: 'stop-1',
          type: 'destination',
          destinationName: 'Foreshore Loading Zone',
          address: '1 Circular Quay, Sydney NSW 2000',
          contact: 'Harbour Security: 02 9999 1111',
          time: '11:00 AM',
          estTravelTime: '30 min',
          detailNote: 'Show security pass at Gate 1',
        },
      ],
    };

    beforeEach(() => {
      jest.spyOn(logisticsService, 'getLogisticsEntry').mockResolvedValue(baseMockJob);
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb(baseMockJob);
        return () => {};
      });
      jest.spyOn(logisticsService, 'fetchVehicleById').mockResolvedValue({
        id: 'veh-van-04',
        name: 'Van 04',
        rego: 'NSW-KURO1',
      });
    });

    it('UI-ADV-01: Header displays bracketed title [888] Grand Finale Fireworks Transport', async () => {
      const { findByText, getByText } = render(<LogisticsJobDetailScreen />);
      expect(await findByText('[888]')).toBeTruthy();
      expect(getByText('Grand Finale Fireworks Transport')).toBeTruthy();
    });

    it('UI-ADV-02: live-gps-tracking-banner is STRICTLY ABSENT from rendered tree in both idle and tracking states', async () => {
      // 1. Idle state
      const { queryByTestId, unmount } = render(<LogisticsJobDetailScreen />);
      expect(queryByTestId('live-gps-tracking-banner')).toBeNull();
      unmount();

      // 2. Tracking active state
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb({
          ...baseMockJob,
          isTrackingActive: true,
          status: 'In Progress',
        });
        return () => {};
      });

      const { queryByTestId: queryActive } = render(<LogisticsJobDetailScreen />);
      expect(queryActive('live-gps-tracking-banner')).toBeNull();
    });

    it('UI-ADV-03: Header tracking status badge displays Idle when inactive and Tracking when active', async () => {
      // Inactive
      const { getByTestId, getByText, unmount } = render(<LogisticsJobDetailScreen />);
      expect(getByTestId('detail-tracking-status-badge')).toBeTruthy();
      expect(getByText('Idle')).toBeTruthy();
      unmount();

      // Active
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb({
          ...baseMockJob,
          isTrackingActive: true,
          status: 'In Progress',
        });
        return () => {};
      });

      const { getByTestId: getActiveBadge, getByText: getActiveText } = render(<LogisticsJobDetailScreen />);
      expect(getActiveBadge('detail-tracking-status-badge')).toBeTruthy();
      expect(getActiveText('Tracking')).toBeTruthy();
    });

    it('UI-ADV-04: Play button initiates tracking and transitions status to In Progress', async () => {
      const startTrackingSpy = jest
        .spyOn(locationTrackingService, 'startTrackingJob')
        .mockResolvedValueOnce(true);

      const updateStatusSpy = jest
        .spyOn(logisticsService, 'updateLogisticsStatus')
        .mockResolvedValueOnce(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const playBtn = await findByTestId('play-job-btn');

      await act(async () => {
        fireEvent.press(playBtn);
      });

      expect(startTrackingSpy).toHaveBeenCalledWith(
        'job-adv-999',
        'tenant-secure-zone',
        expect.objectContaining({ driverId: 'usr-driver-adv', driverName: 'Empirical Challenger' })
      );

      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-adv-999',
        'In Progress',
        expect.objectContaining({ tenantId: 'tenant-secure-zone' })
      );
    });

    it('UI-ADV-05: Pause button stops tracking and PRESERVES job status without calling updateStatus', async () => {
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb({
          ...baseMockJob,
          isTrackingActive: true,
          status: 'In Progress',
        });
        return () => {};
      });

      const stopTrackingSpy = jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockResolvedValueOnce(undefined);

      const updateStatusSpy = jest.spyOn(logisticsService, 'updateLogisticsStatus');

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const pauseBtn = await findByTestId('pause-job-btn');

      await act(async () => {
        fireEvent.press(pauseBtn);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-adv-999');
      expect(updateStatusSpy).not.toHaveBeenCalled();
    });

    it('UI-ADV-06: Finish button stops tracking and updates status to Completed', async () => {
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb({
          ...baseMockJob,
          isTrackingActive: true,
          status: 'In Progress',
        });
        return () => {};
      });

      const stopTrackingSpy = jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockResolvedValueOnce(undefined);

      const updateStatusSpy = jest
        .spyOn(logisticsService, 'updateLogisticsStatus')
        .mockResolvedValueOnce(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const finishBtn = await findByTestId('finish-job-btn');

      await act(async () => {
        fireEvent.press(finishBtn);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-adv-999');
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-adv-999',
        'Completed',
        expect.objectContaining({ tenantId: 'tenant-secure-zone' })
      );
    });

    it('UI-ADV-07: QuickStatusSelector 1-click transition to Completed halts tracking and mutates status', async () => {
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb({
          ...baseMockJob,
          isTrackingActive: true,
          status: 'In Progress',
        });
        return () => {};
      });

      const stopTrackingSpy = jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockResolvedValueOnce(undefined);

      const updateStatusSpy = jest
        .spyOn(logisticsService, 'updateLogisticsStatus')
        .mockResolvedValueOnce(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const completedPill = await findByTestId('status-btn-completed');

      await act(async () => {
        fireEvent.press(completedPill);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-adv-999');
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-adv-999',
        'Completed',
        expect.anything()
      );
    });

    it('UI-ADV-08: QuickStatusSelector 1-click transition to Cancelled halts tracking and mutates status', async () => {
      jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
        cb({
          ...baseMockJob,
          isTrackingActive: true,
          status: 'In Progress',
        });
        return () => {};
      });

      const stopTrackingSpy = jest
        .spyOn(locationTrackingService, 'stopTrackingJob')
        .mockResolvedValueOnce(undefined);

      const updateStatusSpy = jest
        .spyOn(logisticsService, 'updateLogisticsStatus')
        .mockResolvedValueOnce(undefined);

      const { findByTestId } = render(<LogisticsJobDetailScreen />);
      const cancelledPill = await findByTestId('status-btn-cancelled');

      await act(async () => {
        fireEvent.press(cancelledPill);
      });

      expect(stopTrackingSpy).toHaveBeenCalledWith('job-adv-999');
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-adv-999',
        'Cancelled',
        expect.anything()
      );
    });

    it('UI-ADV-09: Vehicle resolution formatting across variations (name+rego, name-only, rego-only, raw ID fallback)', async () => {
      // 1. Name already contains rego: "Van 04 (NSW-KURO1)" -> does not duplicate rego
      jest.spyOn(logisticsService, 'fetchVehicleById').mockResolvedValueOnce({
        id: 'veh-van-04',
        name: 'Van 04 (NSW-KURO1)',
        rego: 'NSW-KURO1',
      });

      const { findByText, unmount } = render(<LogisticsJobDetailScreen />);
      expect(await findByText('Van 04 (NSW-KURO1)')).toBeTruthy();
      unmount();

      // 2. Vehicle rego only without name
      jest.spyOn(logisticsService, 'fetchVehicleById').mockResolvedValueOnce({
        id: 'veh-van-04',
        name: '',
        rego: 'NSW-CUSTOM9',
      });

      const { findByText: findByText2, unmount: unmount2 } = render(<LogisticsJobDetailScreen />);
      expect(await findByText2('NSW-CUSTOM9')).toBeTruthy();
      unmount2();

      // 3. fetchVehicleById returns null -> displays raw job.vehicleId
      jest.spyOn(logisticsService, 'fetchVehicleById').mockResolvedValueOnce(null);

      const { findByText: findByText3 } = render(<LogisticsJobDetailScreen />);
      expect(await findByText3('veh-van-04')).toBeTruthy();
    });
  });
});
