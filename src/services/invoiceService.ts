// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Invoice, CreateInvoiceInput } from '@/types';

function rowToInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    invoiceNum: row.invoice_num as string,
    date: row.date as string,
    items: (row.items as Invoice['items']) ?? [],
    subtotal: row.subtotal as number,
    vatAmount: row.vat_amount as number,
    total: row.total as number,
    sent: row.sent as boolean,
    paid: row.paid as boolean,
    paidDate: (row.paid_date as string) ?? undefined,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
  };
}

function invoiceInputToRow(input: CreateInvoiceInput): Record<string, unknown> {
  return {
    client_id: input.client_id,
    invoice_num: input.invoiceNum,
    date: input.date,
    items: input.items,
    subtotal: input.subtotal,
    vat_amount: input.vatAmount,
    total: input.total,
  };
}

export const invoiceService = {
  async list(firmId: string, clientId?: string): Promise<Invoice[]> {
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToInvoice);
  },

  async create(firmId: string, input: CreateInvoiceInput): Promise<Invoice> {
    const row = invoiceInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('invoices')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    const invoice = rowToInvoice(data as Record<string, unknown>);

    // Auto-create billing entry for this invoice
    try {
      const { error: billingError } = await supabase.from('billing_entries').insert({
        firm_id: firmId,
        client_id: input.client_id,
        type: 'charge',
        amount: input.total,
        date: input.date,
        notes: 'Invoice ' + input.invoiceNum,
        invoice_id: invoice.id,
      });
      if (billingError) {
        console.error('Failed to create billing entry for invoice', invoice.id, billingError.message);
      }
    } catch (err) {
      console.error('Failed to create billing entry for invoice', invoice.id, err);
    }

    return invoice;
  },

  async markPaid(firmId: string, id: string): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .update({ paid: true, paid_date: new Date().toISOString().split('T')[0] })
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    // Also update the linked billing entry status
    try {
      const { error: billingError } = await supabase
        .from('billing_entries')
        .update({ status: 'paid' })
        .eq('invoice_id', id)
        .eq('firm_id', firmId);
      if (billingError) {
        console.error('Failed to update billing entry status for invoice', id, billingError.message);
      }
    } catch (err) {
      console.error('Failed to update billing entry for invoice', id, err);
    }

    return rowToInvoice(data as Record<string, unknown>);
  },

  async markSent(firmId: string, id: string): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .update({ sent: true })
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToInvoice(data as Record<string, unknown>);
  },

  async getNextInvoiceNumber(firmId: string): Promise<string> {
    const { data, error } = await supabase.rpc('generate_invoice_num', { p_firm_id: firmId });
    if (error) throw new Error(error.message);
    return data as string;
  },

  async delete(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },
};
