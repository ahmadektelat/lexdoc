// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Interaction, CreateInteractionInput } from '@/types';

function rowToInteraction(row: Record<string, unknown>): Interaction {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: (row.client_id as string) ?? undefined,
    contact_id: (row.contact_id as string) ?? undefined,
    date: row.date as string,
    channel: row.channel as Interaction['channel'],
    subject: row.subject as string,
    notes: (row.notes as string) ?? undefined,
    authorityType: (row.authority_type as string) ?? undefined,
    staffId: (row.staff_id as string) ?? undefined,
    outcome: (row.outcome as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function interactionInputToRow(input: CreateInteractionInput): Record<string, unknown> {
  return {
    client_id: input.client_id ?? null,
    contact_id: input.contact_id ?? null,
    date: input.date,
    channel: input.channel,
    subject: input.subject,
    notes: input.notes ?? null,
    authority_type: input.authorityType ?? null,
    staff_id: input.staffId ?? null,
    outcome: input.outcome ?? null,
  };
}

export const interactionService = {
  async list(firmId: string, clientId?: string): Promise<Interaction[]> {
    let query = supabase
      .from('interactions')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('date', { ascending: false });

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToInteraction);
  },

  async create(firmId: string, input: CreateInteractionInput): Promise<Interaction> {
    const row = interactionInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('interactions')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToInteraction(data as Record<string, unknown>);
  },

  async update(firmId: string, id: string, input: Partial<CreateInteractionInput>): Promise<Interaction> {
    const row: Record<string, unknown> = {};
    if (input.client_id !== undefined) row.client_id = input.client_id ?? null;
    if (input.contact_id !== undefined) row.contact_id = input.contact_id ?? null;
    if (input.date !== undefined) row.date = input.date;
    if (input.channel !== undefined) row.channel = input.channel;
    if (input.subject !== undefined) row.subject = input.subject;
    if (input.notes !== undefined) row.notes = input.notes ?? null;
    if (input.authorityType !== undefined) row.authority_type = input.authorityType ?? null;
    if (input.staffId !== undefined) row.staff_id = input.staffId ?? null;
    if (input.outcome !== undefined) row.outcome = input.outcome ?? null;

    const { data, error } = await supabase
      .from('interactions')
      .update(row)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToInteraction(data as Record<string, unknown>);
  },

  async delete(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('interactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },
};
