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
  appendRepairAction,
  appendRepairNote,
  uploadRepairDamagePhoto,
} from '@/services/repair-service';
import {
  filterRepairTickets,
  calculateEquipmentCondition,
} from '@/lib/repair-engine';
import type {
  RepairTicket,
  RepairStatus,
  RepairPriority,
  EquipmentCondition,
  CreateRepairTicketInput,
} from '@/types/repair';

export interface RepairMetrics {
  total: number;
  underRepair: number;
  awaitingParts: number;
  operational: number;
  completed: number;
  outOfService: number;
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
    let underRepair = 0;
    let awaitingParts = 0;
    let operational = 0;
    let completed = 0;
    let outOfService = 0;

    for (const t of tickets) {
      if (t.status === 'Under Repair') underRepair++;
      if (t.status === 'Awaiting Parts') awaitingParts++;
      if (t.status === 'Operational') operational++;
      if (t.status === 'Completed') completed++;
      if (
        t.condition === 'Out of Service' ||
        t.status === 'Under Repair' ||
        t.status === 'Awaiting Parts'
      ) {
        outOfService++;
      }
    }

    return {
      total: tickets.length,
      underRepair,
      awaitingParts,
      operational,
      completed,
      outOfService,
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
      };
      await updateRepairTicketStatus(ticketId, newStatus, author, tenantId, reason);
      await fetchTicket();
    },
    [ticketId, tenantId, user, fetchTicket]
  );

  const handleAppendAction = useCallback(
    async (actionText: string) => {
      if (!ticketId || !tenantId) return;
      const author = {
        id: user?.id || 'unknown',
        name: user?.name || user?.email || 'Technician',
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
      };
      await appendRepairNote(ticketId, noteText, author, tenantId);
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
    appendAction: handleAppendAction,
    appendNote: handleAppendNote,
  };
}
