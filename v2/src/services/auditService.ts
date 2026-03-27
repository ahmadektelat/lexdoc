// CREATED: 2026-03-24
// UPDATED: 2026-03-24 22:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { AuditEntry, PaginatedResult } from '@/types';

export interface AuditListFilters {
  limit?: number;
  cursor?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  search?: string;
}

function rowToAuditEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    userId: row.user_id as string,
    userName: row.user_name as string,
    action: row.action as string,
    target: (row.target as string) ?? undefined,
    timestamp: row.created_at as string,
    entityType: (row.entity_type as string) ?? undefined,
    entityId: (row.entity_id as string) ?? undefined,
    details: (row.details as Record<string, unknown>) ?? undefined,
  };
}

export const auditService = {
  async log(
    firmId: string,
    entry: Omit<AuditEntry, 'id' | 'firm_id' | 'timestamp'>
  ): Promise<void> {
    const { error } = await supabase.from('audit_log').insert({
      firm_id: firmId,
      user_id: entry.userId,
      user_name: entry.userName,
      action: entry.action,
      target: entry.target ?? null,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async list(
    firmId: string,
    filters: AuditListFilters = {}
  ): Promise<PaginatedResult<AuditEntry>> {
    const limit = filters.limit ?? 500;

    let query = supabase
      .from('audit_log')
      .select('*')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (filters.cursor) {
      query = query.lt('created_at', filters.cursor);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }
    if (filters.search) {
      const sanitized = filters.search.replace(/[^a-zA-Z0-9\u0590-\u05FF\u0600-\u06FF\s\-]/g, '');
      if (sanitized) {
        query = query.or(
          `target.ilike.%${sanitized}%,user_name.ilike.%${sanitized}%`
        );
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data as Record<string, unknown>[]) ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const mapped = items.map(rowToAuditEntry);

    return {
      data: mapped,
      nextCursor: hasMore ? (items[items.length - 1].created_at as string) : null,
      hasMore,
    };
  },

  async getByEntity(
    firmId: string,
    entityType: string,
    entityId: string
  ): Promise<AuditEntry[]> {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('firm_id', firmId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    return ((data as Record<string, unknown>[]) ?? []).map(rowToAuditEntry);
  },
};
