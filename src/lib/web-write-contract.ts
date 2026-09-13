/** Values emitted by Mobile must match the fixed EMS web schema. Read models
 * deliberately retain legacy values; these guards run only for explicit writes. */
export const WEB_REPAIR_PRIORITIES = ['Low', 'Medium', 'High'] as const;
export const WEB_LOGISTICS_STATUSES = ['Pending', 'Planned', 'In Progress', 'Completed', 'Cancelled'] as const;

export function repairStatusForWrite(value: string): string {
  // Mobile's existing Cancel action represents the web's Cancelled state.
  const status = value === 'Cancel' ? 'Cancelled' : value;
  if (!['Reported', 'Pending', 'Under Repair', 'Completed', 'Cancelled'].includes(status)) {
    throw new Error(`Unsupported repair status: ${value}`);
  }
  return status;
}

export function repairPriorityForWrite(value: string): string {
  if (!(WEB_REPAIR_PRIORITIES as readonly string[]).includes(value)) {
    throw new Error(`Invalid priority level "${value}". Choose Low, Medium, or High.`);
  }
  return value;
}

export function logisticsStatusForWrite(value: string): string {
  if (!(WEB_LOGISTICS_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unsupported logistics status: ${value}`);
  }
  return value;
}

export function attachmentForWrite<T extends { type: string }>(attachment: T): T {
  if (!['Photo', 'PDF', 'URL'].includes(attachment.type)) {
    throw new Error('New attachments must use Photo, PDF, or URL.');
  }
  return { ...attachment };
}
