import { getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { createRepairTicket, updateRepairTicketFields, updateRepairTicketStatus } from '@/services/repair-service';
import { updateLogisticsStatus } from '@/services/logistics-service';
import { attachmentForWrite, repairPriorityForWrite, repairStatusForWrite, logisticsStatusForWrite } from '@/lib/web-write-contract';

beforeEach(() => { jest.clearAllMocks(); });

it('emits web cancellation spelling and rejects unsupported new enum values', () => {
  expect(repairStatusForWrite('Cancel')).toBe('Cancelled');
  expect(repairStatusForWrite('Cancelled')).toBe('Cancelled');
  expect(logisticsStatusForWrite('Planned')).toBe('Planned');
  expect(() => logisticsStatusForWrite('Scheduled')).toThrow();
  expect(() => repairPriorityForWrite('Critical')).toThrow();
  expect(() => attachmentForWrite({ type: 'Document', url: 'legacy' })).toThrow();
  expect(attachmentForWrite({ type: 'PDF', url: 'manual', custom: 42 })).toEqual({ type: 'PDF', url: 'manual', custom: 42 });
});

it('preserves legacy status, priority, attachments and web-owned references during an unrelated edit', async () => {
  const original = { tenantId: 'tenant', status: 'Legacy Workshop State', priority: 'Critical',
    attachments: [{ id: 'legacy', type: 'Document', url: 'manual', webMetadata: 'keep' }],
    logisticsOrder: ['line-web'], equipment: { name: 'Amp' }, internalNotes: 'old' };
  const before = JSON.stringify(original);
  (getDoc as jest.Mock).mockResolvedValue({ exists: () => true, data: () => original });
  const result = await updateRepairTicketFields('ticket', { internalNotes: 'new', priority: 'Critical' }, { uid: 'operator' }, 'tenant');
  expect(result.success).toBe(true);
  const update = (updateDoc as jest.Mock).mock.calls[0][1];
  expect(update.internalNotes).toBe('new');
  for (const field of ['status', 'priority', 'attachments', 'logisticsOrder', 'equipment']) expect(update).not.toHaveProperty(field);
  expect(JSON.stringify(original)).toBe(before);
});

it('rejects unsupported new priorities before ticket creation or metadata writes', async () => {
  await expect(createRepairTicket('tenant', { equipment: { name: 'Amp' }, priority: 'Critical' },
    { uid: 'operator' }, { preferLocalExecution: true })).rejects.toThrow('Invalid priority');
  expect(setDoc).not.toHaveBeenCalled();
  expect(updateDoc).not.toHaveBeenCalled();
});

it('writes Cancelled for the existing mobile Cancel action', async () => {
  (getDoc as jest.Mock).mockResolvedValue({ exists: () => true, data: () => ({ tenantId: 'tenant', status: 'Reported' }) });
  const result = await updateRepairTicketStatus('ticket', 'Cancel', { uid: 'operator' }, 'tenant');
  expect(result.success).toBe(true);
  expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'Cancelled' }));
});

it('writes the canonical logistics value and does not write unsupported statuses', async () => {
  (getDoc as jest.Mock).mockResolvedValue({ exists: () => true, data: () => ({ tenantId: 'tenant', status: 'Legacy' }) });
  await updateLogisticsStatus('job', 'Planned', { tenantId: 'tenant' });
  expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'Planned' }));
  (updateDoc as jest.Mock).mockClear();
  await expect(updateLogisticsStatus('job', 'En Route')).rejects.toThrow('Unsupported');
  expect(updateDoc).not.toHaveBeenCalled();
});
