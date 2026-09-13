/**
 * __tests__/standardized-bottom-action-buttons.test.tsx
 * ============================================================================
 * Verification Test Suite for Bottom Action Button Standardization
 *
 * Verifies across Logistics Detail, Repair Detail, and Event Detail:
 * R1. Container styling: no card/surface background, no top border, blends with colors.background
 * R2. Sizing & Spacing: uniform minHeight 52 (size="lg"), paddingHorizontal 16, paddingTop 8, paddingBottom 18
 *     Side-by-side buttons share row equally (flex: 1)
 * R3. Preservation of testIDs, accessibility labels, and event handlers
 * ============================================================================
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

import { darkColors, lightColors, spacing } from '@/constants/theme';
import LogisticsDetailScreen from '@/../app/(tabs)/logistics/[id]';
import RepairTicketDetailScreen from '@/../app/(tabs)/repairs/[id]';
import EventDetailsScreen from '@/../app/(tabs)/events/[id]';
import RepairsFeedScreen from '@/../app/(tabs)/repairs';

import * as logisticsService from '@/services/logistics-service';
import * as locationTrackingService from '@/services/location-tracking-service';
import * as repairService from '@/services/repair-service';
import * as equipmentService from '@/services/equipment-service';
import * as eventService from '@/services/event-service';
import * as pullSheetService from '@/services/pull-sheet-service';
import type { LogisticsEntry } from '@/types/logistics';
import type { RepairTicket } from '@/types/repair';
import type { Event } from '@/types/events';
import type { Pullsheet } from '@/types/pull-sheet';

// Mock theme context with dynamic theme mode support
let mockThemeMode = 'dark';
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => {
      const isDark = mockThemeMode === 'dark';
      return {
        colors: isDark ? actualTheme.darkColors : actualTheme.lightColors,
        typography: actualTheme.typography,
        spacing: actualTheme.spacing,
        layout: actualTheme.layout,
        isDark,
        themeMode: mockThemeMode,
      };
    },
    ThemeProvider: ({ children }: any) => children,
  };
});

// Mock Auth Context
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-standardize-01',
      uid: 'usr-standardize-01',
      name: 'Test Technician',
      email: 'tech@kuro.test',
      tenantId: 'tenant-test',
    },
    tenant: { tenantId: 'tenant-test', tenantName: 'Kuro Productions' },
    isAuthenticated: true,
    isLoading: false,
    isRestoringSession: false,
  }),
}));

// Mock Router
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockIdParam: string = 'test-job-01';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({
      id: mockIdParam,
    }),
    useFocusEffect: jest.fn((effect) => {
      React.useEffect(() => {
        const cleanup = effect();
        return () => {
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    }),
    useIsFocused: jest.fn(() => true),
  };
});

// Mock Scanner Context
let mockScanTargetStatus = 'prepped_scanned';
const mockSetScanTargetStatus = jest.fn();

jest.mock('@/context/scanner-context', () => ({
  useScanner: () => ({
    activeEventId: 'ev-101',
    setActiveEventId: jest.fn(),
    scanTargetStatus: mockScanTargetStatus,
    setScanTargetStatus: mockSetScanTargetStatus,
    torchEnabled: false,
    toggleTorch: jest.fn(),
    lastResult: null,
    hudVisible: false,
    dismissHud: jest.fn(),
    processScan: jest.fn(),
  }),
  ScannerProvider: ({ children }: any) => children,
}));

// Helper to find the enclosing bottom action container in the component tree
function findBottomActionContainer(node: any) {
  let curr = node?.parent;
  while (curr) {
    const flat = curr.props?.style ? StyleSheet.flatten(curr.props.style) : null;
    if (flat && flat.paddingBottom === 18) {
      return curr;
    }
    curr = curr.parent;
  }
  return null;
}

// Sample Entities
const mockJob = {
  id: 'test-job-01',
  tenantId: 'tenant-test',
  eventName: 'Logistics Tour Stop #1',
  eventNumber: 101,
  location: 'Sydney Warehouse',
  start: '2026-09-01T00:00:00Z',
  end: '2026-09-01T12:00:00Z',
  createdBy: 'usr-01',
  updatedBy: 'usr-01',
  status: 'In Progress',
  vehicleId: 'veh-van-01',
  driverName: 'Test Driver',
  isTrackingActive: false,
  destinations: [],
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
} as unknown as LogisticsEntry;

const mockTicket = {
  id: 'test-ticket-01',
  tenantId: 'tenant-test',
  status: 'Reported',
  priority: 'High',
  condition: 'Out of Service',
  equipment: {
    id: 'eq-01',
    name: 'Martin MAC Aura XB',
    serialNumber: 'SN-AURA-01',
    barcode: 'BAR-001',
    category: 'Lighting',
  },
  requestedBy: 'Test Technician',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  notes: [],
  attachments: [],
} as unknown as RepairTicket;

const mockEvent = {
  id: 'ev-101',
  tenantId: 'tenant-test',
  eventName: 'Summer Arena Gala',
  eventNumber: 501,
  clientId: 'client-01',
  eventStatusId: 'Confirmed',
  startTime: new Date('2026-09-15T10:00:00.000Z'),
  finishTime: new Date('2026-09-15T22:00:00.000Z'),
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
} as unknown as Event;

const mockPullsheet = {
  id: 'ps-101',
  eventId: 'ev-101',
  tenantId: 'tenant-test',
  version: 1,
  status: 'draft',
  items: [],
  sections: [],
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
} as unknown as Pullsheet;

describe('Standardized Bottom Action Button Layout & Appearance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockThemeMode = 'dark';
    mockIdParam = 'test-job-01';

    // Mock Logistics Service
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((tenantId, jobId, cb) => {
      cb(mockJob);
      return jest.fn();
    });
    jest.spyOn(logisticsService, 'fetchVehicleById').mockResolvedValue({ id: 'veh-van-01', name: 'Van #1' } as any);
    jest.spyOn(locationTrackingService, 'isTrackingActive').mockReturnValue(false);
    jest.spyOn(locationTrackingService, 'getActiveTrackingJobId').mockReturnValue(null);
    jest.spyOn(locationTrackingService, 'isTrackingSuspended').mockReturnValue(false);
    jest.spyOn(locationTrackingService, 'getSuspendedTrackingJobId').mockReturnValue(null);
    jest.spyOn(locationTrackingService, 'getSyncStatus').mockReturnValue({ status: 'synced', lastSyncTime: null, lastError: null });
    jest.spyOn(locationTrackingService, 'addLocationListener').mockReturnValue(jest.fn());
    jest.spyOn(locationTrackingService, 'addSyncStatusListener').mockReturnValue(jest.fn());

    // Mock Repair Service
    jest.spyOn(repairService, 'subscribeTenantRepairTickets').mockImplementation((tenantId, cb) => {
      cb([]);
      return jest.fn();
    });
    jest.spyOn(repairService, 'subscribeSingleRepairTicket').mockImplementation((ticketId, tenantId, cb) => {
      cb(mockTicket);
      return jest.fn();
    });
    jest.spyOn(repairService, 'fetchTenantSuppliers').mockResolvedValue([]);
    jest.spyOn(repairService, 'fetchTenantOwners').mockResolvedValue([]);
    jest.spyOn(repairService, 'fetchTenantCrewMembers').mockResolvedValue([]);
    jest.spyOn(repairService, 'getRepairDraft').mockResolvedValue(null);
    jest.spyOn(equipmentService, 'fetchEquipment').mockResolvedValue([]);

    // Mock Event Service
    jest.spyOn(eventService, 'subscribeSingleEvent').mockImplementation((eventId, tenantId, cb) => {
      cb(mockEvent);
      return jest.fn();
    });
    jest.spyOn(pullSheetService, 'subscribePullsheet').mockImplementation((eventId, tenantId, cb) => {
      cb(mockPullsheet);
      return jest.fn();
    });
    jest.spyOn(pullSheetService, 'fetchPullsheet').mockResolvedValue(mockPullsheet);
  });

  // ==========================================================================
  // Reference Screen: "Report Equipment Fault" in Repairs Feed
  // ==========================================================================
  describe('Reference Container Pattern: Repairs Feed (repairs/index.tsx)', () => {
    it('verifies feed-new-repair-btn container styling specifications and navigation', async () => {
      const { findByTestId } = render(<RepairsFeedScreen />);
      const btn = await findByTestId('feed-new-repair-btn');
      expect(btn).toBeTruthy();

      const container = findBottomActionContainer(btn);
      expect(container).toBeTruthy();
      const containerStyle = StyleSheet.flatten(container?.props.style);

      expect(containerStyle.backgroundColor).toBe(darkColors.background);
      expect(containerStyle.paddingHorizontal).toBe(16); // spacing.base
      expect(containerStyle.paddingTop).toBe(spacing.xs); // spacing.xs
      expect(containerStyle.paddingBottom).toBe(18);
      expect(containerStyle.borderTopWidth).toBeFalsy();

      // Button size
      const btnStyle = StyleSheet.flatten(
        typeof btn.props.style === 'function' ? btn.props.style({ pressed: false }) : btn.props.style
      );
      expect(btnStyle.minHeight).toBe(52); // size="lg"

      // Interaction verification
      await act(async () => {
        fireEvent.press(btn);
      });
      expect(mockPush).toHaveBeenCalledWith('/repairs/new');
    });
  });

  // ==========================================================================
  // Screen 1: Logistics Detail (logistics/[id].tsx)
  // ==========================================================================
  describe('Screen 1: Logistics Detail (logistics/[id].tsx)', () => {
    it('verifies add-note-btn container blends seamlessly with colors.background and has no top border', async () => {
      const { findByTestId } = render(<LogisticsDetailScreen />);
      const btn = await findByTestId('add-note-btn');
      expect(btn).toBeTruthy();

      const container = findBottomActionContainer(btn);
      expect(container).toBeTruthy();
      const containerStyle = StyleSheet.flatten(container?.props.style);

      // R1: Container blends with background, no card/surface, no top border
      expect(containerStyle.backgroundColor).toBe(darkColors.background);
      expect(containerStyle.borderTopWidth).toBeFalsy();
      expect(containerStyle.borderTopColor).toBeUndefined();

      // R2: Standardized padding
      expect(containerStyle.paddingHorizontal).toBe(16); // spacing.base
      expect(containerStyle.paddingTop).toBe(spacing.xs); // spacing.xs
      expect(containerStyle.paddingBottom).toBe(18);

      // R2: Button minHeight: 52 (size="lg")
      const btnStyle = StyleSheet.flatten(
        typeof btn.props.style === 'function' ? btn.props.style({ pressed: false }) : btn.props.style
      );
      expect(btnStyle.minHeight).toBe(52);

      // R3: Verify testID, accessibility, and modal interaction
      await act(async () => {
        fireEvent.press(btn);
      });
      const notesModal = await findByTestId('job-notes-modal');
      expect(notesModal).toBeTruthy();
    });
  });

  // ==========================================================================
  // Screen 2: Repair Detail (repairs/[id].tsx)
  // ==========================================================================
  describe('Screen 2: Repair Detail (repairs/[id].tsx)', () => {
    it('verifies detail mode action buttons container and equal side-by-side sizing', async () => {
      mockIdParam = 'test-ticket-01';
      const { findByTestId } = render(<RepairTicketDetailScreen mode="detail" />);

      const photoBtn = await findByTestId('detail-add-photo-btn');
      const attBtn = await findByTestId('detail-add-attachment-btn');
      expect(photoBtn).toBeTruthy();
      expect(attBtn).toBeTruthy();

      // Parent row container
      const rowContainer = photoBtn.parent;
      expect(rowContainer).toBeTruthy();
      const rowStyle = StyleSheet.flatten(rowContainer?.props.style);
      expect(rowStyle.flexDirection).toBe('row');
      expect(rowStyle.flex).toBe(1);

      // Outermost fixedBottomBar container
      const container = findBottomActionContainer(photoBtn);
      expect(container).toBeTruthy();
      const barStyle = StyleSheet.flatten(container?.props.style);

      // R1: Container blends with background, no card, no top border
      expect(barStyle.backgroundColor).toBe(darkColors.background);
      expect(barStyle.borderTopWidth).toBeFalsy();
      expect(barStyle.borderTopColor).toBeUndefined();

      // R2: Standardized padding
      expect(barStyle.paddingHorizontal).toBe(16);
      expect(barStyle.paddingTop).toBe(spacing.xs);
      expect(barStyle.paddingBottom).toBe(18);

      // R2: Both buttons have minHeight: 52 and flex: 1
      const photoStyle = StyleSheet.flatten(
        typeof photoBtn.props.style === 'function' ? photoBtn.props.style({ pressed: false }) : photoBtn.props.style
      );
      const attStyle = StyleSheet.flatten(
        typeof attBtn.props.style === 'function' ? attBtn.props.style({ pressed: false }) : attBtn.props.style
      );

      expect(photoStyle.minHeight).toBe(52);
      expect(attStyle.minHeight).toBe(52);
      expect(photoStyle.flex).toBe(1);
      expect(attStyle.flex).toBe(1);

      // R3: Preservation of testID and modal interaction
      await act(async () => {
        fireEvent.press(attBtn);
      });
      const attModal = await findByTestId('add-attachment-modal');
      expect(attModal).toBeTruthy();
    });

    it('verifies new mode "Create Ticket" button container and sizing', async () => {
      mockIdParam = 'new';
      const { findByTestId } = render(<RepairTicketDetailScreen mode="new" />);

      const submitBtn = await findByTestId('submit-repair-btn');
      expect(submitBtn).toBeTruthy();

      const container = findBottomActionContainer(submitBtn);
      expect(container).toBeTruthy();
      const containerStyle = StyleSheet.flatten(container?.props.style);

      // R1: Container blends with background, no card, no top border
      expect(containerStyle.backgroundColor).toBe(darkColors.background);
      expect(containerStyle.borderTopWidth).toBeFalsy();
      expect(containerStyle.borderTopColor).toBeUndefined();

      // R2: Standardized padding
      expect(containerStyle.paddingHorizontal).toBe(16);
      expect(containerStyle.paddingTop).toBe(spacing.xs);
      expect(containerStyle.paddingBottom).toBe(18);

      // R2: Button minHeight: 52 and flex: 1
      const btnStyle = StyleSheet.flatten(
        typeof submitBtn.props.style === 'function' ? submitBtn.props.style({ pressed: false }) : submitBtn.props.style
      );
      expect(btnStyle.minHeight).toBe(52);
      expect(btnStyle.flex).toBe(1);
    });
  });

  // ==========================================================================
  // Screen 3: Event Detail (events/[id].tsx)
  // ==========================================================================
  describe('Screen 3: Event Detail (events/[id].tsx)', () => {
    it('verifies detail mode "Start Scanning" container styling and button dimensions', async () => {
      mockIdParam = 'ev-101';
      const { findByTestId } = render(<EventDetailsScreen />);

      const scanBtn = await findByTestId('start-scanning-btn');
      expect(scanBtn).toBeTruthy();

      const container = findBottomActionContainer(scanBtn);
      expect(container).toBeTruthy();
      const containerStyle = StyleSheet.flatten(container?.props.style);

      // R1: Container blends with background, no surface, no top border
      expect(containerStyle.backgroundColor).toBe(darkColors.background);
      expect(containerStyle.borderTopWidth).toBeFalsy();
      expect(containerStyle.borderTopColor).toBeUndefined();

      // R2: Standardized padding
      expect(containerStyle.paddingHorizontal).toBe(16);
      expect(containerStyle.paddingTop).toBe(spacing.xs);
      expect(containerStyle.paddingBottom).toBe(18);

      // R2: Button minHeight: 52
      const btnStyle = StyleSheet.flatten(
        typeof scanBtn.props.style === 'function' ? scanBtn.props.style({ pressed: false }) : scanBtn.props.style
      );
      expect(btnStyle.minHeight).toBe(52);
    });

    it('verifies scanning mode side-by-side buttons share row equally with minHeight 52 and standardized container', async () => {
      mockIdParam = 'ev-101';
      const { findByTestId } = render(<EventDetailsScreen />);

      const scanBtn = await findByTestId('start-scanning-btn');
      await act(async () => {
        fireEvent.press(scanBtn);
      });

      const statusBtn = await findByTestId('scanner-status-selector-btn');
      const closeBtn = await findByTestId('close-scanner-btn');
      expect(statusBtn).toBeTruthy();
      expect(closeBtn).toBeTruthy();

      // Parent row
      const row = statusBtn.parent;
      expect(row).toBeTruthy();
      const rowStyle = StyleSheet.flatten(row?.props.style);
      expect(rowStyle.flexDirection).toBe('row');

      // Container
      const container = findBottomActionContainer(statusBtn);
      expect(container).toBeTruthy();
      const containerStyle = StyleSheet.flatten(container?.props.style);

      // R1: Container blends with background, no surface, no top border
      expect(containerStyle.backgroundColor).toBe(darkColors.background);
      expect(containerStyle.borderTopWidth).toBeFalsy();
      expect(containerStyle.borderTopColor).toBeUndefined();

      // R2: Standardized padding
      expect(containerStyle.paddingHorizontal).toBe(16);
      expect(containerStyle.paddingTop).toBe(spacing.xs);
      expect(containerStyle.paddingBottom).toBe(18);

      // R2: Both buttons have minHeight: 52 and flex: 1
      const statusStyle = StyleSheet.flatten(
        typeof statusBtn.props.style === 'function' ? statusBtn.props.style({ pressed: false }) : statusBtn.props.style
      );
      const closeStyle = StyleSheet.flatten(
        typeof closeBtn.props.style === 'function' ? closeBtn.props.style({ pressed: false }) : closeBtn.props.style
      );

      expect(statusStyle.minHeight).toBe(52);
      expect(closeStyle.minHeight).toBe(52);
      expect(statusStyle.flex).toBe(1);
      expect(closeStyle.flex).toBe(1);

      // R3: Closing scanner restores Start Scanning button
      await act(async () => {
        fireEvent.press(closeBtn);
      });
      const restoredScanBtn = await findByTestId('start-scanning-btn');
      expect(restoredScanBtn).toBeTruthy();

      // R3: Re-open scanner and test status selector modal
      await act(async () => {
        fireEvent.press(restoredScanBtn);
      });
      const reopenedStatusBtn = await findByTestId('scanner-status-selector-btn');
      await act(async () => {
        fireEvent.press(reopenedStatusBtn);
      });
      const statusModal = await findByTestId('scanner-status-picker-modal');
      expect(statusModal).toBeTruthy();
    });
  });

  // ==========================================================================
  // Light Theme Container Seamless Blending Verification
  // ==========================================================================
  describe('Light Theme Container Seamless Blending Across All Target Screens', () => {
    beforeEach(() => {
      mockThemeMode = 'light';
    });

    it('verifies bottom button containers blend with light background (#FFFFFF) with no top borders', async () => {
      // 1. Repairs Feed Reference
      const feedRender = render(<RepairsFeedScreen />);
      const feedBtn = await feedRender.findByTestId('feed-new-repair-btn');
      const feedContainer = findBottomActionContainer(feedBtn);
      const feedStyle = StyleSheet.flatten(feedContainer?.props.style);
      expect(feedStyle.backgroundColor).toBe(lightColors.background);
      expect(feedStyle.borderTopWidth).toBeFalsy();

      // 2. Logistics Detail
      mockIdParam = 'test-job-01';
      const logRender = render(<LogisticsDetailScreen />);
      const logBtn = await logRender.findByTestId('add-note-btn');
      const logContainer = findBottomActionContainer(logBtn);
      const logStyle = StyleSheet.flatten(logContainer?.props.style);
      expect(logStyle.backgroundColor).toBe(lightColors.background);
      expect(logStyle.borderTopWidth).toBeFalsy();

      // 3. Repair Detail (detail mode)
      mockIdParam = 'test-ticket-01';
      const repRender = render(<RepairTicketDetailScreen mode="detail" />);
      const repBtn = await repRender.findByTestId('detail-add-photo-btn');
      const repContainer = findBottomActionContainer(repBtn);
      const repStyle = StyleSheet.flatten(repContainer?.props.style);
      expect(repStyle.backgroundColor).toBe(lightColors.background);
      expect(repStyle.borderTopWidth).toBeFalsy();

      // 4. Event Detail (normal and scanning mode)
      mockIdParam = 'ev-101';
      const evRender = render(<EventDetailsScreen />);
      const evBtn = await evRender.findByTestId('start-scanning-btn');
      const evContainer = findBottomActionContainer(evBtn);
      const evStyle = StyleSheet.flatten(evContainer?.props.style);
      expect(evStyle.backgroundColor).toBe(lightColors.background);
      expect(evStyle.borderTopWidth).toBeFalsy();

      // Open scanning mode in light theme
      await act(async () => {
        fireEvent.press(evBtn);
      });
      const scanStatusBtn = await evRender.findByTestId('scanner-status-selector-btn');
      const scanContainer = findBottomActionContainer(scanStatusBtn);
      const scanStyle = StyleSheet.flatten(scanContainer?.props.style);
      expect(scanStyle.backgroundColor).toBe(lightColors.background);
      expect(scanStyle.borderTopWidth).toBeFalsy();
    });
  });
});
