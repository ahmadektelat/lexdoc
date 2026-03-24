// CREATED: 2026-03-19
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Added countOpen, countOverdue, listOpenByFirm methods for dashboard module

import { supabase } from '@/integrations/supabase/client';
import type { Task, CreateTaskInput } from '@/types';

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: (row.client_id as string) ?? undefined,
    filing_id: (row.filing_id as string) ?? undefined,
    seq: row.seq as number,
    title: row.title as string,
    desc: (row.description as string) ?? undefined,
    dueDate: (row.due_date as string) ?? undefined,
    priority: row.priority as Task['priority'],
    status: row.status as Task['status'],
    assignedTo: (row.assigned_to as string) ?? undefined,
    category: row.category as Task['category'],
    isAuto: row.is_auto as boolean,
    filingType: (row.filing_type as Task['filingType']) ?? undefined,
    filingDue: (row.filing_due as string) ?? undefined,
    period: (row.period as string) ?? undefined,
    doneAt: (row.done_at as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function taskInputToRow(input: CreateTaskInput): Record<string, unknown> {
  return {
    seq: 0, // DB trigger overwrites with generated value
    title: input.title,
    description: input.desc ?? null,
    due_date: input.dueDate ?? null,
    priority: input.priority,
    status: 'open',
    assigned_to: input.assignedTo ?? null,
    category: input.category,
    is_auto: input.isAuto ?? false,
    client_id: input.client_id ?? null,
    filing_id: input.filing_id ?? null,
    filing_type: input.filingType ?? null,
    filing_due: input.filingDue ?? null,
    period: input.period ?? null,
    done_at: null,
  };
}

export const taskService = {
  async list(firmId: string, clientId?: string): Promise<Task[]> {
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('status', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false });

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToTask);
  },

  async getById(firmId: string, id: string): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Task not found');
    return rowToTask(data as Record<string, unknown>);
  },

  async create(firmId: string, input: CreateTaskInput): Promise<Task> {
    const row = taskInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('tasks')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToTask(data as Record<string, unknown>);
  },

  async update(firmId: string, id: string, input: Partial<CreateTaskInput>): Promise<Task> {
    const row: Record<string, unknown> = {};
    if (input.title !== undefined) row.title = input.title;
    if (input.desc !== undefined) row.description = input.desc ?? null;
    if (input.dueDate !== undefined) row.due_date = input.dueDate ?? null;
    if (input.priority !== undefined) row.priority = input.priority;
    if (input.category !== undefined) row.category = input.category;
    if (input.assignedTo !== undefined) row.assigned_to = input.assignedTo ?? null;
    if (input.client_id !== undefined) row.client_id = input.client_id ?? null;

    const { data, error } = await supabase
      .from('tasks')
      .update(row)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToTask(data as Record<string, unknown>);
  },

  async toggleStatus(firmId: string, id: string): Promise<Task> {
    // First fetch the current task to determine new status
    const current = await taskService.getById(firmId, id);
    const newStatus = current.status === 'done' ? 'open' : 'done';
    const doneAt = newStatus === 'done' ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from('tasks')
      .update({ status: newStatus, done_at: doneAt })
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToTask(data as Record<string, unknown>);
  },

  async delete(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },

  // TODO: Implement when filings module is built. The task table schema
  // already includes all needed columns (filing_id, is_auto, filing_type, filing_due, period).
  async runAutoTaskEngine(_firmId: string): Promise<number> {
    // Stub: returns count of auto-tasks created (0 until filings module exists)
    return 0;
  },

  async cancelAutoTaskForFiling(firmId: string, filingId: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('firm_id', firmId)
      .eq('filing_id', filingId)
      .eq('is_auto', true)
      .is('deleted_at', null);

    if (error) throw new Error(error.message);
  },

  /** Count open (non-deleted) tasks for a firm. */
  async countOpen(firmId: string): Promise<number> {
    const { count, error } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', firmId)
      .eq('status', 'open')
      .is('deleted_at', null);

    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  /** Count overdue open tasks (due_date in the past) for a firm. */
  async countOverdue(firmId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const { count, error } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', firmId)
      .eq('status', 'open')
      .is('deleted_at', null)
      .not('due_date', 'is', null)
      .lt('due_date', today);

    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  /** List open tasks for a firm, sorted by priority then due date, with client name. */
  async listOpenByFirm(firmId: string, limit: number): Promise<(Task & { clientName?: string })[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, clients(name)')
      .eq('firm_id', firmId)
      .eq('status', 'open')
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50);

    if (error) throw new Error(error.message);

    const tasks = (data as Record<string, unknown>[]).map(row => ({
      ...rowToTask(row),
      clientName: (row.clients as { name: string } | null)?.name,
    }));

    // Sort by priority rank (high=0, medium=1, low=2), then by due_date
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    tasks.sort((a, b) => {
      const pa = priorityRank[a.priority] ?? 1;
      const pb = priorityRank[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return 0;
    });

    return tasks.slice(0, limit);
  },
};
