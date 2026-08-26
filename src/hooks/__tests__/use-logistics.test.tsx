/**
 * src/hooks/__tests__/use-logistics.test.tsx
 * Unit & Integration test suite for useLogistics & useSingleLogistics React hooks.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useLogistics, useSingleLogistics, useLogisticsJob } from '../use-logistics';
import * as logisticsService from '@/services/logistics-service';
import type { LogisticsEntry } from '@/types/logistics';

// Mock Auth Context
const mockUser = {
  id: 'driver-007',
  uid: 'driver-007',
  name: 'James Bond',
  email: 'james@kuro.io',
  firstName: 'James',
  lastName: 'Bond',
  tenantId: 'tenant-mi6',
};

const mockTenant = {
  tenantId: 'tenant-mi6',
  tenantName: 'MI6 Logistics',
  success: true,
  authTenantId: null,
};

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    tenant: mockTenant,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock Logistics Service methods
jest.mock('@/services/logistics-service', () => ({
  subscribeToLogistics: jest.fn(),
  subscribeSingleLogisticsEntry: jest.fn(),
  fetchTenantLogistics: jest.fn(),
  getLogisticsEntry: jest.fn(),
  updateLogisticsStatus: jest.fn(),
  appendLogisticsNote: jest.fn(),
  updateJobLocation: jest.fn(),
  stopJobTracking: jest.fn(),
}));

const sampleEntries: LogisticsEntry[] = [
  {
    id: 'job-1',
    tenantId: 'tenant-mi6',
    eventName: 'Secret Operation Alpha',
    eventNumber: 101,
    location: 'London HQ',
    status: 'In Transit',
    assigneeId: 'driver-007',
    driverName: 'James Bond',
    start: new Date('2026-08-27T08:00:00Z'),
    end: new Date('2026-08-27T12:00:00Z'),
    createdBy: 'M',
    updatedBy: 'James Bond',
    createdAt: '2026-08-27T07:00:00Z',
    updatedAt: '2026-08-27T08:00:00Z',
    archived: false,
    destinations: [
      {
        id: 'd-1',
        type: 'destination',
        destinationName: 'Vauxhall Cross',
        address: '85 Albert Embankment',
        contact: 'Q: 020 7946 0991',
      },
    ],
  },
  {
    id: 'job-2',
    tenantId: 'tenant-mi6',
    eventName: 'Gear Transport Beta',
    eventNumber: 102,
    location: 'Q Branch Lab',
    status: 'Scheduled',
    assigneeId: 'driver-008',
    driverName: 'Bill Tanner',
    start: new Date('2026-08-27T14:00:00Z'),
    end: new Date('2026-08-27T18:00:00Z'),
    createdBy: 'M',
    updatedBy: 'M',
    createdAt: '2026-08-27T07:00:00Z',
    updatedAt: '2026-08-27T07:00:00Z',
    archived: false,
  },
  {
    id: 'job-3',
    tenantId: 'tenant-mi6',
    eventName: 'Aston Martin Delivery',
    eventNumber: 103,
    location: 'Monaco Harbor',
    status: 'Completed',
    assigneeId: 'driver-007',
    driverName: 'James Bond',
    start: new Date('2026-08-26T10:00:00Z'),
    end: new Date('2026-08-26T16:00:00Z'),
    createdBy: 'M',
    updatedBy: 'James Bond',
    createdAt: '2026-08-26T09:00:00Z',
    updatedAt: '2026-08-26T16:00:00Z',
    archived: false,
  },
];

describe('useLogistics Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes to tenant logistics on mount and populates entries and metrics', () => {
    let emitSnapshot: (entries: LogisticsEntry[]) => void = () => {};
    (logisticsService.subscribeToLogistics as jest.Mock).mockImplementation((_tId, cb) => {
      emitSnapshot = cb;
      return jest.fn();
    });

    const { result } = renderHook(() => useLogistics());

    expect(result.current.loading).toBe(true);
    expect(logisticsService.subscribeToLogistics).toHaveBeenCalledWith(
      'tenant-mi6',
      expect.any(Function),
      expect.any(Function)
    );

    // Emit live entries
    act(() => {
      emitSnapshot(sampleEntries);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toHaveLength(3);
    expect(result.current.filteredEntries).toHaveLength(3);
    expect(result.current.metrics).toEqual({
      total: 3,
      active: 1,
      scheduled: 1,
      completed: 1,
      inTransit: 1,
    });
  });

  it('filters entries when onlyAssigned is toggled', () => {
    let emitSnapshot: (entries: LogisticsEntry[]) => void = () => {};
    (logisticsService.subscribeToLogistics as jest.Mock).mockImplementation((_tId, cb) => {
      emitSnapshot = cb;
      return jest.fn();
    });

    const { result } = renderHook(() => useLogistics());

    act(() => {
      emitSnapshot(sampleEntries);
    });

    expect(result.current.filteredEntries).toHaveLength(3);

    // Toggle onlyAssigned to true
    act(() => {
      result.current.setOnlyAssigned(true);
    });

    expect(result.current.onlyAssigned).toBe(true);
    expect(result.current.filteredEntries).toHaveLength(2);
    expect(result.current.filteredEntries.map((e) => e.id)).toEqual(['job-1', 'job-3']);
  });

  it('filters entries when statusFilter is changed', () => {
    let emitSnapshot: (entries: LogisticsEntry[]) => void = () => {};
    (logisticsService.subscribeToLogistics as jest.Mock).mockImplementation((_tId, cb) => {
      emitSnapshot = cb;
      return jest.fn();
    });

    const { result } = renderHook(() => useLogistics());

    act(() => {
      emitSnapshot(sampleEntries);
    });

    act(() => {
      result.current.setStatusFilter('active');
    });

    expect(result.current.filteredEntries).toHaveLength(1);
    expect(result.current.filteredEntries[0].id).toBe('job-1');

    act(() => {
      result.current.setStatusFilter('completed');
    });

    expect(result.current.filteredEntries).toHaveLength(1);
    expect(result.current.filteredEntries[0].id).toBe('job-3');
  });

  it('filters entries when searchQuery is entered', () => {
    let emitSnapshot: (entries: LogisticsEntry[]) => void = () => {};
    (logisticsService.subscribeToLogistics as jest.Mock).mockImplementation((_tId, cb) => {
      emitSnapshot = cb;
      return jest.fn();
    });

    const { result } = renderHook(() => useLogistics());

    act(() => {
      emitSnapshot(sampleEntries);
    });

    act(() => {
      result.current.setSearchQuery('Aston Martin');
    });

    expect(result.current.filteredEntries).toHaveLength(1);
    expect(result.current.filteredEntries[0].id).toBe('job-3');
  });

  it('calls updateStatus, addNote, syncLocation, and stopTracking mutations', async () => {
    (logisticsService.subscribeToLogistics as jest.Mock).mockReturnValue(jest.fn());
    (logisticsService.updateLogisticsStatus as jest.Mock).mockResolvedValue(undefined);
    (logisticsService.appendLogisticsNote as jest.Mock).mockResolvedValue(undefined);
    (logisticsService.updateJobLocation as jest.Mock).mockResolvedValue(undefined);
    (logisticsService.stopJobTracking as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useLogistics());

    await act(async () => {
      await result.current.updateStatus('job-1', 'Arrived', 'On site');
    });

    expect(logisticsService.updateLogisticsStatus).toHaveBeenCalledWith(
      'job-1',
      'Arrived',
      expect.objectContaining({
        note: 'On site',
        updatedBy: 'James Bond',
        tenantId: 'tenant-mi6',
      })
    );

    await act(async () => {
      await result.current.addNote('job-1', 'Gate passcode is 1234');
    });

    expect(logisticsService.appendLogisticsNote).toHaveBeenCalledWith(
      'job-1',
      'Gate passcode is 1234',
      'James Bond',
      'tenant-mi6'
    );

    await act(async () => {
      await result.current.syncLocation('job-1', {
        latitude: -33.86,
        longitude: 151.2,
        timestamp: Date.now(),
      });
    });

    expect(logisticsService.updateJobLocation).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        latitude: -33.86,
        longitude: 151.2,
        driverId: 'driver-007',
        driverName: 'James Bond',
      })
    );

    await act(async () => {
      await result.current.stopTracking('job-1');
    });

    expect(logisticsService.stopJobTracking).toHaveBeenCalledWith('job-1');
  });

  it('refresh invokes fetchTenantLogistics and updates state', async () => {
    (logisticsService.subscribeToLogistics as jest.Mock).mockReturnValue(jest.fn());
    (logisticsService.fetchTenantLogistics as jest.Mock).mockResolvedValue(sampleEntries);

    const { result } = renderHook(() => useLogistics());

    await act(async () => {
      await result.current.refresh();
    });

    expect(logisticsService.fetchTenantLogistics).toHaveBeenCalledWith('tenant-mi6');
    expect(result.current.entries).toHaveLength(3);
  });
});

describe('useSingleLogistics & useLogisticsJob Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes to single job document and updates state', () => {
    let emitSnapshot: (entry: LogisticsEntry | null) => void = () => {};
    (logisticsService.subscribeSingleLogisticsEntry as jest.Mock).mockImplementation(
      (_jId, _tId, cb) => {
        emitSnapshot = cb;
        return jest.fn();
      }
    );

    const { result } = renderHook(() => useSingleLogistics('job-1'));

    expect(logisticsService.subscribeSingleLogisticsEntry).toHaveBeenCalledWith(
      'job-1',
      'tenant-mi6',
      expect.any(Function),
      expect.any(Function)
    );

    act(() => {
      emitSnapshot(sampleEntries[0]);
    });

    expect(result.current.entry?.id).toBe('job-1');
    expect(result.current.job?.id).toBe('job-1');
    expect(result.current.loading).toBe(false);
  });

  it('useLogisticsJob alias works identically', () => {
    (logisticsService.subscribeSingleLogisticsEntry as jest.Mock).mockReturnValue(jest.fn());
    const { result } = renderHook(() => useLogisticsJob('job-1'));
    expect(result.current).toHaveProperty('entry');
    expect(result.current).toHaveProperty('job');
    expect(result.current).toHaveProperty('updateStatus');
  });
});
