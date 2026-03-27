// CREATED: 2026-03-24
// UPDATED: 2026-03-24 18:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { HoursEntry, Filing } from '@/types';

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

function rowToFiling(row: Record<string, unknown>): Filing {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    type: row.type as Filing['type'],
    period: row.period as string,
    due: row.due as string,
    status: row.status as Filing['status'],
    filedDate: (row.filed_date as string) ?? undefined,
    note: (row.note as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export const reportService = {
  /** Fetch all hours_log entries for the firm within a date range. */
  async hoursByFirm(firmId: string, fromDate: string, toDate: string): Promise<HoursEntry[]> {
    const { data, error } = await supabase
      .from('hours_log')
      .select('*')
      .eq('firm_id', firmId)
      .gte('date', fromDate)
      .lte('date', toDate)
      .is('deleted_at', null)
      .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToHoursEntry);
  },

  /** Fetch all filings for the firm for a given year. */
  async filingsByFirm(firmId: string, year: number): Promise<Filing[]> {
    const { data, error } = await supabase
      .from('filings')
      .select('*')
      .eq('firm_id', firmId)
      .like('period', `${year}%`)
      .is('deleted_at', null)
      .order('due', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToFiling);
  },
};
