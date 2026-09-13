import { act, renderHook } from '@testing-library/react-native';
import { usePullSheet } from '@/hooks/use-pull-sheet';
import * as service from '@/services/pull-sheet-service';
import type { Pullsheet } from '@/types/pull-sheet';

let mockUserId = 'operator';
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({
  user: { uid: mockUserId }, tenant: { tenantId: 'tenant' },
}) }));

const sheet: Pullsheet = { id: 'event', eventId: 'event', tenantId: 'tenant', items: [
  { id: 'line', quantity: 4, scannedQuantity: 0, status: 'confirmed', description: 'Cable', type: 'item' },
] };
let publish: (data: Pullsheet | null) => void;
beforeEach(() => {
  mockUserId = 'operator';
  jest.spyOn(service, 'getPendingOperations').mockResolvedValue([]);
  jest.spyOn(service, 'subscribePullsheet').mockImplementation((_event, _tenant, callback) => {
    publish = callback; callback(sheet); return () => {};
  });
});
afterEach(() => jest.restoreAllMocks());

it('does not report an acknowledged save as failed when recovery-state refresh fails', async () => {
  jest.spyOn(service, 'updatePullsheetItemStatus').mockResolvedValue({ success: true });
  const { result } = renderHook(() => usePullSheet('event'));
  await act(async () => {});
  jest.spyOn(service, 'getPendingOperations').mockRejectedValue(new Error('storage unavailable'));
  await act(async () => { expect(await result.current.updateStatus('line', 'dispatched')).toBe(true); });
  expect(result.current.error?.message).toContain('Changes saved');
});

it('keeps a newer live snapshot when an older command acknowledgement arrives', async () => {
  let finish!: (result: service.CommandExecutionResult) => void;
  jest.spyOn(service, 'updatePullsheetItemScannedCount').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => usePullSheet('event'));
  let save!: Promise<boolean>;
  await act(async () => { save = result.current.incrementScannedCount('line'); });
  expect(result.current.items[0].scannedQuantity).toBe(0);
  act(() => publish({ ...sheet, items: [{ ...sheet.items[0], scannedQuantity: 3 }] }));
  await act(async () => {
    finish({ success: true, item: { ...sheet.items[0], scannedQuantity: 1 } });
    expect(await save).toBe(true);
  });
  expect(result.current.items[0].scannedQuantity).toBe(3);
});

it('does not roll back newer live data after a failed mutation', async () => {
  let finish!: (result: service.CommandExecutionResult) => void;
  jest.spyOn(service, 'updatePullsheetItemStatus').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => usePullSheet('event'));
  let save!: Promise<boolean>;
  await act(async () => { save = result.current.updateStatus('line', 'dispatched'); });
  act(() => publish({ ...sheet, items: [{ ...sheet.items[0], status: 'returned' }] }));
  await act(async () => { finish({ success: false, error: 'connection lost' }); await save; });
  expect(result.current.items[0].status).toBe('returned');
});

it('ignores old-user listeners and acknowledgements after account switch within the same tenant', async () => {
  let finish!: (result: service.CommandExecutionResult) => void;
  jest.spyOn(service, 'updatePullsheetItemStatus').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result, rerender } = renderHook(() => usePullSheet('event'));
  const oldPublish = publish;
  let save!: Promise<boolean>;
  await act(async () => { save = result.current.updateStatus('line', 'dispatched'); });
  mockUserId = 'other';
  rerender({});
  act(() => oldPublish({ ...sheet, items: [{ ...sheet.items[0], status: 'returned' }] }));
  await act(async () => { finish({ success: true, item: { ...sheet.items[0], status: 'dispatched' } }); await save; });
  expect(result.current.items[0].status).toBe('confirmed');
});
