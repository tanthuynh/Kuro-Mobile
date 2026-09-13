import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateDoc } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { getSerializedScanCode } from '@/lib/scanner-engine';
import {
  updatePullsheetItemScannedCount, updatePullsheetItemStatus, getPendingOperations,
  reconcilePendingOperation, retryPendingOperation, triggerSideEffectsRecovery,
  setNetworkOnlineState, COMMAND_TIMEOUT_MS,
} from '@/services/pull-sheet-service';

jest.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('uuid', () => { let sequence = 0; return { v4: () => `phase1-${++sequence}` }; });

const user = { uid: 'operator' };
const key = '@kuro_pending_operations:tenant:operator';
const response = (data: any, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
const scan = (item = 'line') => updatePullsheetItemScannedCount('event', 'tenant', item, 999, true, user);
const records = () => getPendingOperations('tenant', user.uid);
const committed = (body: any, reconciliationStatus = 'completed') => response({
  success: true, operationId: body.operationId, status: 'committed', reconciliationStatus,
  result: { updatedItem: { id: body.itemId, quantity: 10, scannedQuantity: 2, status: 'confirmed' } },
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setNetworkOnlineState(true);
  (auth as any).currentUser = { uid: user.uid, getIdToken: jest.fn().mockResolvedValue('token') };
  global.fetch = jest.fn(async (_url, init) => committed(JSON.parse(init!.body as string))) as any;
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('persists before dispatch and omits stale client counts for every new bulk scan', async () => {
  let count = 0;
  global.fetch = jest.fn(async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    expect(JSON.parse((await AsyncStorage.getItem(key))!)[0].payload).toEqual(body);
    expect(body).not.toHaveProperty('scannedCount');
    expect(body).not.toHaveProperty('autoTransitionToPrepped');
    expect(body).not.toHaveProperty('barcode');
    count++;
    return committed(body);
  }) as any;
  expect((await scan()).success).toBe(true);
  expect((await scan()).success).toBe(true);
  expect(count).toBe(2);
  expect(await records()).toEqual([]);
});

it('fails closed on storage failure without sending a command', async () => {
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
  expect((await scan()).success).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it('retains corrupt storage and refuses to replace it with an empty queue', async () => {
  await AsyncStorage.setItem(key, 'corrupted');
  expect((await scan()).success).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(key)).toBe('corrupted');
});

it('blocks a rapid duplicate before the first asynchronous storage read', async () => {
  const first = scan();
  const second = scan();
  const result = await Promise.all([first, second]);
  expect(result.map((r) => r.success)).toEqual([true, false]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('preserves both uncertain records when different items save concurrently', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('connection lost'));
  const result = await Promise.all([scan('one'), scan('two')]);
  expect(result.every((r) => r.outcomeUnknown)).toBe(true);
  expect((await records()).map((r) => r.payload.itemId).sort()).toEqual(['one', 'two']);
});

it.each([403, 404, 500, 503])('never falls back to direct writes for HTTP %s', async (status) => {
  global.fetch = jest.fn().mockResolvedValue(response({ error: 'rejected' }, status));
  expect((await scan()).success).toBe(false);
  expect(updateDoc).not.toHaveBeenCalled();
  expect((await records()).length).toBe(status >= 500 ? 1 : 0);
});

it('retains receipt identity when a success body belongs to another operation', async () => {
  global.fetch = jest.fn().mockResolvedValue(committed({ operationId: 'wrong-id' }));
  const result = await scan();
  expect(result.outcomeUnknown).toBe(true);
  expect((await records())[0].operationId).toBe(result.operationId);
});

it('bounds a response body that never completes, then permits a status check', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => new Promise(() => {}) });
  const request = scan();
  await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS + 1);
  const result = await request;
  expect(result.outcomeUnknown).toBe(true);
  global.fetch = jest.fn().mockResolvedValue(response({ success: true, status: 'committed', operationId: result.operationId }));
  expect((await reconcilePendingOperation('event', 'tenant', user.uid, result.operationId!)).status).toBe('committed');
  expect(await records()).toEqual([]);
});

it('bounds status response bodies and retains the original recovery record', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('response lost'));
  await scan();
  const [record] = await records();
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => new Promise(() => {}) });
  const check = reconcilePendingOperation('event', 'tenant', user.uid, record.operationId);
  await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS + 1);
  expect((await check).success).toBe(false);
  expect((await records())[0].operationId).toBe(record.operationId);
});

it('replays the exact original legacy payload after restart, including absolute count and timestamp', async () => {
  const payload = { operationId: 'old', eventId: 'event', tenantId: 'tenant', action: 'increment_scan',
    itemId: 'line', scannedCount: 7, autoTransitionToPrepped: false, clientTimestamp: 123 };
  const record: any = { ...payload, userId: user.uid, payload, timestamp: 123, state: 'outcome_unknown' };
  await AsyncStorage.setItem(key, JSON.stringify([record]));
  expect((await retryPendingOperation(record, user)).success).toBe(true);
  expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body)).toEqual(payload);
});

it('retains committed saves with failed side effects and recovers using the original command', async () => {
  global.fetch = jest.fn(async (_url, init) => committed(JSON.parse(init!.body as string), 'failed')) as any;
  expect((await scan()).success).toBe(true);
  const [record] = await records();
  expect(record.committed).toBe(true);
  expect((await scan()).success).toBe(false);
  global.fetch = jest.fn(async (_url, init) => committed(JSON.parse(init!.body as string))) as any;
  expect((await triggerSideEffectsRecovery('event', 'tenant', record.operationId)).success).toBe(true);
  expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body)).toEqual(record.payload);
  expect(await records()).toEqual([]);
});

it('does not dispatch after the account changes during token retrieval', async () => {
  (auth.currentUser!.getIdToken as jest.Mock).mockImplementation(async () => {
    (auth as any).currentUser = { uid: 'someone-else' };
    return 'old-token';
  });
  expect((await scan()).success).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps original-account recovery records when the account changes during a request', async () => {
  global.fetch = jest.fn(async (_url, init) => {
    (auth as any).currentUser = { uid: 'someone-else' };
    return committed(JSON.parse(init!.body as string));
  }) as any;
  expect((await scan()).outcomeUnknown).toBe(true);
  const [record] = await records();
  expect((await retryPendingOperation(record, { uid: 'someone-else' })).success).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('distinguishes a shared bulk code from an individual serialized code', () => {
  expect(getSerializedScanCode('CABLE', { serialisation: 'No', barcode: 'CABLE' } as any)).toBeUndefined();
  const serialized: any = { serialisation: 'Yes', barcode: 'MODEL', serialNumbers: [{ serial: 'UNIT-01' }] };
  expect(getSerializedScanCode('unit-01', serialized)).toBe('UNIT-01');
  expect(() => getSerializedScanCode('MODEL', serialized)).toThrow('individual serial');
});
