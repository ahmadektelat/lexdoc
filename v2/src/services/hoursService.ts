// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { HoursEntry, CreateHoursInput } from '@/types';

function rowToHoursEntry(row: Record<string, unknown>): HoursEntry {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    staffId: row.staff_id as string,
    staffName: row.staff_name as string,
    hours: Number(row.hours),
    date: row.date as string,
    note: (row.note as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
  };
}

function hoursInputToRow(input: CreateHoursInput): Record<string, unknown> {
  return {
    client_id: input.client_id,
    staff_id: input.staffId,
    staff_name: input.staffName,
    hours: input.hours,
    date: input.date,
    note: input.note ?? null,
  };
}

export const hoursService = {
  async list(firmId: string, clientId: string): Promise<HoursEntry[]> {
    const { data, error } = await supabase
      .from('hours_log')
      .select('*')
      .eq('firm_id', firmId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToHoursEntry);
  },

  async create(firmId: string, input: CreateHoursInput): Promise<HoursEntry> {
    const row = hoursInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('hours_log')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToHoursEntry(data as Record<string, unknown>);
  },

  async delete(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('hours_log')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },
};
