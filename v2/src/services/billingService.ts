// CREATED: 2026-03-23
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Added totalPending method for dashboard module

import { supabase } from '@/integrations/supabase/client';
import type { BillingEntry, CreateBillingInput } from '@/types';

function rowToBillingEntry(row: Record<string, unknown>): BillingEntry {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    type: row.type as BillingEntry['type'],
    amount: row.amount as number,
    status: row.status as BillingEntry['status'],
    date: row.date as string,
    notes: (row.notes as string) ?? undefined,
    invoice_id: (row.invoice_id as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function billingInputToRow(input: CreateBillingInput): Record<string, unknown> {
  return {
    client_id: input.client_id,
    type: input.type,
    amount: input.amount,
    date: input.date,
    notes: input.notes ?? null,
    invoice_id: input.invoice_id ?? null,
  };
}

export const billingService = {
  async list(firmId: string, clientId: string): Promise<BillingEntry[]> {
    const { data, error } = await supabase
      .from('billing_entries')
      .select('*')
      .eq('firm_id', firmId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToBillingEntry);
  },

  async create(firmId: string, input: CreateBillingInput): Promise<BillingEntry> {
    const row = billingInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('billing_entries')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToBillingEntry(data as Record<string, unknown>);
  },

  async getBalance(firmId: string, clientId: string): Promise<number> {
    const { data, error } = await supabase
      .from('billing_entries')
      .select('type, amount, status')
      .eq('firm_id', firmId)
      .eq('client_id', clientId)
      .is('deleted_at', null);

    if (error) throw new Error(error.message);

    const rows = data as { type: string; amount: number; status: string }[];
    const pending = rows.filter(r => r.status === 'pending');
    const charges = pending.filter(r => r.type === 'charge').reduce((s, r) => s + r.amount, 0);
    const credits = pending.filter(r => r.type === 'credit').reduce((s, r) => s + r.amount, 0);
    return charges - credits;
  },

  async markPaid(firmId: string, id: string): Promise<BillingEntry> {
    const { data, error } = await supabase
      .from('billing_entries')
      .update({ status: 'paid' })
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToBillingEntry(data as Record<string, unknown>);
  },

  async cancel(firmId: string, id: string): Promise<BillingEntry> {
    const { data, error } = await supabase
      .from('billing_entries')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToBillingEntry(data as Record<string, unknown>);
  },

  async delete(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('billing_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },

  /** Sum pending charges minus credits for a firm (returns agorot). */
  async totalPending(firmId: string): Promise<number> {
    const { data, error } = await supabase
      .from('billing_entries')
      .select('type, amount')
      .eq('firm_id', firmId)
      .eq('status', 'pending')
      .is('deleted_at', null);

    if (error) throw new Error(error.message);

    const rows = data as { type: string; amount: number }[];
    const charges = rows.filter(r => r.type === 'charge').reduce((s, r) => s + r.amount, 0);
    const credits = rows.filter(r => r.type === 'credit').reduce((s, r) => s + r.amount, 0);
    return charges - credits;
  },
};
