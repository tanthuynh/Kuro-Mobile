/**
 * src/hooks/use-tickets.ts
 * React Hook for Real-Time Multi-Tenant Repair Tickets Subscriptions and Filters.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  subscribeTenantRepairTickets,
  getRepairTicket,
  createRepairTicket,
  updateRepairTicketStatus,
  updateRepairTicketFields,
  type UpdateRepairTicketFieldsInput,
  appendRepairAction,
  appendRepairNote,
  updateRepairNote,
  deleteRepairNote,
  addRepairAttachment,
  deleteRepairAttachment,
  uploadRepairDamagePhoto,
} from '@/services/repair-service';
import {
  filterRepairTickets,
  calculateEquipmentCondition,
  normalizeRepairStatus,
} from '@/lib/repair-engine';
import { parseFirestoreDate } from '@/lib/date-utils';
import type {
  RepairTicket,
  RepairStatus,
  RepairPriority,
  EquipmentCondition,
  RepairAttachment,
  CreateRepairTicketInput,
} from '@/types/repair';

export interface RepairMetrics {
  total: number;
  all?: number;
  reported: number;
  pending: number;
  underRepair: number;
  completed: number;
  operational?: number;
  awaitingParts?: number;
  outOfService?: number;
}

export function useTickets() {
  const { user, tenant } = useAuth();
  const tenantId = user?.tenantId || tenant?.tenantId || '';

  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filter States
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [conditionFilter, setConditionFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Live Subscription
  useEffect(() => {
    if (!tenantId) {
      setTickets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeTenantRepairTickets(
      tenantId,
      (liveTickets) => {
        setTickets(liveTickets);
        setLoading(false);
      },
      (err) => {
        console.error('[useTickets] Subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [tenantId]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return filterRepairTickets(tickets, {
      status: statusFilter === 'All' ? undefined : (statusFilter as any),
      priority: priorityFilter === 'All' ? undefined : (priorityFilter as any),
      condition: conditionFilter === 'All' ? undefined : (conditionFilter as any),
      search: searchQuery || undefined,
    });
  }, [tickets, statusFilter, priorityFilter, conditionFilter, searchQuery]);

  // Metrics summary
  const metrics: RepairMetrics = useMemo(() => {
    let reported = 0;
    let pending = 0;
    let underRepair = 0;
    let completed = 0;
    let outOfService = 0;

    for (const t of tickets) {
      const normStatus = normalizeRepairStatus(t.status);
      if (normStatus === 'Reported') reported++;
      else if (normStatus === 'Pending') pending++;
      else if (normStatus === 'Under Repair') underRepair++;
      else if (normStatus === 'Completed') completed++;

      if (
        t.condition === 'Out of Service' ||
        normStatus !== 'Completed'
      ) {
        outOfService++;
      }
    }

    return {
      total: tickets.length,
      all: tickets.length,
      reported,
      pending,
      underRepair,
      completed,
      outOfService,
      operational: completed,
      awaitingParts: pending,
    };
  }, [tickets]);

  // Mutation helpers
  const handleCreateTicket = useCallback(
    async (input: CreateRepairTicketInput) => {
      if (!tenantId) throw new Error('Cannot create ticket: tenantId missing');
      return await createRepairTicket(tenantId, {
        ...input,
        requestedBy: input.requestedBy || user?.name || user?.email || 'Field Tech',
        assignee: input.assignee || (user ? { id: user.id, name: user.name, email: user.email } : null),
      });
    },
    [tenantId, user]
  );

  const handleUpdateStatus = useCallback(
    async (ticketId: string, newStatus: RepairStatus, reason?: string) => {
      if (!tenantId) throw new Error('Cannot update status: tenantId missing');
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
      };
      await updateRepairTicketStatus(ticketId, newStatus, author, tenantId, reason);
    },
    [tenantId, user]
  );

  const handleAppendAction = useCallback(
    async (ticketId: string, actionText: string) => {
      if (!tenantId) throw new Error('Cannot append action: tenantId missing');
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
      };
      await appendRepairAction(ticketId, actionText, author, tenantId);
    },
    [tenantId, user]
  );

  const handleAppendNote = useCallback(
    async (ticketId: string, noteText: string) => {
      if (!tenantId) throw new Error('Cannot append note: tenantId missing');
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
      };
      await appendRepairNote(ticketId, noteText, author, tenantId);
    },
    [tenantId, user]
  );

  const handleUpdateTicketFields = useCallback(
    async (ticketId: string, fields: UpdateRepairTicketFieldsInput) => {
      if (!tenantId) throw new Error('Cannot update ticket fields: tenantId missing');
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };
      const result = await updateRepairTicketFields(ticketId, fields, author, tenantId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update ticket fields');
      }
      return result;
    },
    [tenantId, user]
  );

  return {
    tickets,
    filteredTickets,
    loading,
    error,
    metrics,
    // Filters
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    conditionFilter,
    setConditionFilter,
    searchQuery,
    setSearchQuery,
    // Actions
    createTicket: handleCreateTicket,
    updateStatus: handleUpdateStatus,
    updateRepairTicketFields: handleUpdateTicketFields,
    updateTicketFields: handleUpdateTicketFields,
    appendAction: handleAppendAction,
    appendNote: handleAppendNote,
  };
}

export function useSingleTicket(ticketId: string) {
  const { user, tenant } = useAuth();
  const tenantId = user?.tenantId || tenant?.tenantId || '';

  const [ticket, setTicket] = useState<RepairTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) {
      setTicket(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getRepairTicket(ticketId);
      setTicket(data);
      setError(null);
    } catch (err: any) {
      console.error('[useSingleTicket] Fetch error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const handleUpdateStatus = useCallback(
    async (newStatus: RepairStatus, reason?: string) => {
      if (!ticketId || !tenantId) return;
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };
      await updateRepairTicketStatus(ticketId, newStatus, author, tenantId, reason);
      await fetchTicket();
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  const handleUpdateFields = useCallback(
    async (fields: UpdateRepairTicketFieldsInput) => {
      if (!ticketId || !tenantId) throw new Error('Missing ticket ID or tenant ID');
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };

      // Optimistic local state update
      setTicket((prev) => {
        if (!prev) return prev;
        const updatedEquipment = { ...prev.equipment };
        if (fields.equipment) {
          Object.assign(updatedEquipment, fields.equipment);
        }
        if (fields.equipmentName !== undefined && typeof fields.equipmentName === 'string') {
          updatedEquipment.name = fields.equipmentName.trim();
        }
        if (fields.serialNumber !== undefined) {
          updatedEquipment.serialNumber = fields.serialNumber ? String(fields.serialNumber).trim() : null;
        }

        const nextStatus = fields.status !== undefined ? normalizeRepairStatus(fields.status) : prev.status;
        const nextCondition = fields.condition !== undefined
          ? fields.condition
          : fields.status !== undefined
          ? calculateEquipmentCondition(nextStatus)
          : prev.condition;

        const nextTicket: RepairTicket = {
          ...prev,
          equipment: updatedEquipment as any,
          internalReference:
            fields.internalReference !== undefined
              ? fields.internalReference
                ? String(fields.internalReference).trim()
                : null
              : prev.internalReference,
          supplierId:
            fields.supplierId !== undefined
              ? fields.supplierId
                ? String(fields.supplierId).trim()
                : null
              : prev.supplierId,
          owner:
            fields.owner !== undefined
              ? fields.owner
                ? String(fields.owner).trim()
                : null
              : prev.owner,
          requestedBy:
            fields.requestedBy !== undefined
              ? fields.requestedBy
                ? String(fields.requestedBy).trim()
                : 'Warehouse Tech'
              : prev.requestedBy,
          priority: fields.priority !== undefined ? fields.priority : prev.priority,
          condition: nextCondition,
          repairPeriodStart:
            fields.repairPeriodStart !== undefined
              ? fields.repairPeriodStart
                ? parseFirestoreDate(fields.repairPeriodStart)?.toISOString() || null
                : null
              : prev.repairPeriodStart,
          repairPeriodEnd:
            fields.repairPeriodEnd !== undefined
              ? fields.repairPeriodEnd
                ? parseFirestoreDate(fields.repairPeriodEnd)?.toISOString() || null
                : null
              : prev.repairPeriodEnd,
          status: nextStatus,
        };
        return nextTicket;
      });

      try {
        const result = await updateRepairTicketFields(ticketId, fields, author, tenantId);
        if (!result.success) {
          await fetchTicket();
          throw new Error(result.error || 'Failed to update ticket fields');
        }
        await fetchTicket();
        return result;
      } catch (err: any) {
        console.error('[useSingleTicket] updateRepairTicketFields error:', err);
        await fetchTicket();
        throw err;
      }
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  const handleAppendAction = useCallback(
    async (actionText: string) => {
      if (!ticketId || !tenantId) return;
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };
      await appendRepairAction(ticketId, actionText, author, tenantId);
      await fetchTicket();
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  const handleAppendNote = useCallback(
    async (noteText: string) => {
      if (!ticketId || !tenantId) return;
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };
      await appendRepairNote(ticketId, noteText, author, tenantId);
      await fetchTicket();
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  const handleUpdateNote = useCallback(
    async (noteId: string, content: string) => {
      if (!ticketId || !tenantId) return;
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };
      await updateRepairNote(ticketId, noteId, content, author, tenantId);
      await fetchTicket();
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!ticketId || !tenantId) return;
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };
      await deleteRepairNote(ticketId, noteId, author, tenantId);
      await fetchTicket();
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  const handleAddAttachment = useCallback(
    async (attachment: Omit<RepairAttachment, 'id'>) => {
      if (!ticketId || !tenantId) return { success: false, attachmentId: '', error: 'Missing ticket/tenant' };
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };
      const result = await addRepairAttachment(ticketId, attachment, author, tenantId);
      await fetchTicket();
      return result;
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  const handleDeleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!ticketId || !tenantId) return;
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
        email: user?.email,
        avatarUrl: user?.avatarUrl,
      };
      await deleteRepairAttachment(ticketId, attachmentId, author, tenantId);
      await fetchTicket();
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  return {
    ticket,
    loading,
    error,
    refresh: fetchTicket,
    updateStatus: handleUpdateStatus,
    updateRepairTicketFields: handleUpdateFields,
    updateTicketFields: handleUpdateFields,
    appendAction: handleAppendAction,
    appendNote: handleAppendNote,
    updateNote: handleUpdateNote,
    deleteNote: handleDeleteNote,
    addAttachment: handleAddAttachment,
    deleteAttachment: handleDeleteAttachment,
  };
}
