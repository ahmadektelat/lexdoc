// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Contact, CreateContactInput } from '@/types';

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: (row.client_id as string) ?? undefined,
    type: row.type as Contact['type'],
    name: row.name as string,
    role: (row.role as string) ?? undefined,
    phone: (row.phone as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function contactInputToRow(input: CreateContactInput): Record<string, unknown> {
  return {
    type: input.type,
    name: input.name,
    client_id: input.client_id ?? null,
    role: input.role ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes: input.notes ?? null,
  };
}

export const contactService = {
  async list(firmId: string, clientId?: string): Promise<Contact[]> {
    let query = supabase
      .from('contacts')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToContact);
  },

  async getById(firmId: string, id: string): Promise<Contact> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Contact not found');
    return rowToContact(data as Record<string, unknown>);
  },

  async create(firmId: string, input: CreateContactInput): Promise<Contact> {
    const row = contactInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('contacts')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToContact(data as Record<string, unknown>);
  },

  async update(firmId: string, id: string, input: Partial<CreateContactInput>): Promise<Contact> {
    const row: Record<string, unknown> = {};
    if (input.type !== undefined) row.type = input.type;
    if (input.name !== undefined) row.name = input.name;
    if (input.client_id !== undefined) row.client_id = input.client_id ?? null;
    if (input.role !== undefined) row.role = input.role ?? null;
    if (input.phone !== undefined) row.phone = input.phone ?? null;
    if (input.email !== undefined) row.email = input.email ?? null;
    if (input.notes !== undefined) row.notes = input.notes ?? null;

    const { data, error } = await supabase
      .from('contacts')
      .update(row)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToContact(data as Record<string, unknown>);
  },

  async delete(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },
};
