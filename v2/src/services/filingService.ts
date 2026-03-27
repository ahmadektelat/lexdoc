// CREATED: 2026-03-19
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Added upcomingByFirm method for dashboard module

import { supabase } from '@/integrations/supabase/client';
import type { Filing, FilingSetting, CreateFilingInput } from '@/types';
import { generateFilingSchedule } from '@/lib/filing-utils';
import { isOverdue } from '@/lib/dates';

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

function filingInputToRow(input: CreateFilingInput, firmId: string): Record<string, unknown> {
  return {
    firm_id: firmId,
    client_id: input.client_id,
    type: input.type,
    period: input.period,
    due: input.due,
    status: input.status,
    filed_date: input.filedDate ?? null,
    note: input.note ?? null,
  };
}

export const filingService = {
  async list(firmId: string, clientId: string, year: number): Promise<Filing[]> {
    const { data, error } = await supabase
      .from('filings')
      .select('*')
      .eq('firm_id', firmId)
      .eq('client_id', clientId)
      .like('period', `${year}%`)
      .is('deleted_at', null)
      .order('due', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToFiling);
  },

  async markFiled(firmId: string, id: string): Promise<Filing> {
    const { data, error } = await supabase
      .from('filings')
      .update({ status: 'filed', filed_date: new Date().toISOString().split('T')[0] })
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToFiling(data as Record<string, unknown>);
  },

  async markLate(firmId: string, id: string): Promise<Filing> {
    const { data, error } = await supabase
      .from('filings')
      .update({ status: 'late' })
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToFiling(data as Record<string, unknown>);
  },

  async resetToPending(firmId: string, id: string): Promise<Filing> {
    const { data, error } = await supabase
      .from('filings')
      .update({ status: 'pending', filed_date: null })
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToFiling(data as Record<string, unknown>);
  },

  async regenerateSchedule(
    firmId: string,
    clientId: string,
    year: number,
    settings: FilingSetting
  ): Promise<void> {
    // 1. Generate desired schedule from settings
    const desired = generateFilingSchedule(settings, year);

    // 2. Fetch existing filings for this client+year
    const existing = await this.list(firmId, clientId, year);

    // 3. Build lookup map of existing filings
    const existingMap = new Map<string, Filing>();
    for (const f of existing) {
      existingMap.set(`${f.type}:${f.period}`, f);
    }

    // 4. Determine new filings to insert
    const toInsert: Record<string, unknown>[] = [];
    for (const d of desired) {
      const key = `${d.type}:${d.period}`;
      if (existingMap.has(key)) {
        existingMap.delete(key); // matched — keep existing
      } else {
        toInsert.push(filingInputToRow(
          {
            client_id: clientId,
            type: d.type!,
            period: d.period!,
            due: d.due!,
            status: 'pending',
          } as CreateFilingInput,
          firmId
        ));
      }
    }

    // 5. Batch insert new filings
    if (toInsert.length > 0) {
      const { error } = await supabase.from('filings').insert(toInsert);
      if (error) throw new Error(error.message);
    }

    // 6. Soft-delete unmatched filings (only if not filed)
    for (const [, filing] of existingMap) {
      if (filing.status !== 'filed') {
        const { error } = await supabase
          .from('filings')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', filing.id)
          .eq('firm_id', firmId);

        if (error) throw new Error(error.message);
      }
    }
  },

  /** List upcoming/overdue filings for a firm, with client name. */
  async upcomingByFirm(firmId: string, limit: number): Promise<(Filing & { clientName: string })[]> {
    const { data, error } = await supabase
      .from('filings')
      .select('*, clients!inner(name)')
      .eq('firm_id', firmId)
      .in('status', ['pending', 'late'])
      .is('deleted_at', null)
      .order('due', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    return (data as Record<string, unknown>[]).map(row => ({
      ...rowToFiling(row),
      clientName: (row.clients as { name: string }).name,
    }));
  },

  async lateCountsByFirm(firmId: string, year: number): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('filings')
      .select('client_id, status, due')
      .eq('firm_id', firmId)
      .like('period', `${year}%`)
      .is('deleted_at', null);

    if (error) throw new Error(error.message);

    const counts: Record<string, number> = {};
    for (const row of data as Record<string, unknown>[]) {
      const clientId = row.client_id as string;
      const status = row.status as string;
      const due = row.due as string;

      if (status === 'late' || (status === 'pending' && isOverdue(due))) {
        counts[clientId] = (counts[clientId] ?? 0) + 1;
      }
    }
    return counts;
  },
};
