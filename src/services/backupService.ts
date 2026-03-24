// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type {
  BackupData, RestoreResult, BackupStats,
} from '@/types';
import { BACKUP_VERSION } from '@/types/backup';

/** Fetch all non-deleted rows from a firm-scoped entity table. */
async function fetchTable(firmId: string, table: string): Promise<unknown[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('firm_id', firmId)
    .is('deleted_at', null);
  if (error) throw new Error(`Backup failed on ${table}: ${error.message}`);
  return data ?? [];
}

/**
 * Fetch rows from a junction table scoped to this firm.
 * Junction tables (client_staff, staff_roles) lack a firm_id column,
 * so we explicitly fetch the firm's parent IDs and filter with .in().
 */
async function fetchJunction(firmId: string, table: string): Promise<unknown[]> {
  if (table === 'client_staff') {
    const { data: clients, error: cErr } = await supabase
      .from('clients').select('id').eq('firm_id', firmId).is('deleted_at', null);
    if (cErr) throw new Error(`Backup failed on ${table}: ${cErr.message}`);
    const clientIds = (clients ?? []).map((c: { id: string }) => c.id);
    if (clientIds.length === 0) return [];
    const { data, error } = await supabase
      .from(table).select('*').in('client_id', clientIds);
    if (error) throw new Error(`Backup failed on ${table}: ${error.message}`);
    return data ?? [];
  }
  if (table === 'staff_roles') {
    const { data: staff, error: sErr } = await supabase
      .from('staff').select('id').eq('firm_id', firmId).is('deleted_at', null);
    if (sErr) throw new Error(`Backup failed on ${table}: ${sErr.message}`);
    const staffIds = (staff ?? []).map((s: { id: string }) => s.id);
    if (staffIds.length === 0) return [];
    const { data, error } = await supabase
      .from(table).select('*').in('staff_id', staffIds);
    if (error) throw new Error(`Backup failed on ${table}: ${error.message}`);
    return data ?? [];
  }
  throw new Error(`Unknown junction table: ${table}`);
}

/** Fetch raw rows from a table that may or may not have deleted_at. */
async function fetchRaw(firmId: string, table: string, hasDeletedAt = false): Promise<unknown[]> {
  let query = supabase.from(table).select('*').eq('firm_id', firmId);
  if (hasDeletedAt) query = query.is('deleted_at', null);
  const { data, error } = await query;
  if (error) throw new Error(`Backup failed on ${table}: ${error.message}`);
  return data ?? [];
}

/** Count non-deleted records in a firm-scoped table. */
async function countTable(firmId: string, table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countActiveClients(firmId: string): Promise<number> {
  const { count, error } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export const backupService = {
  /**
   * Create a full JSON backup of all firm data.
   * Fetches all non-deleted records from every entity table.
   */
  async createBackup(firmId: string, firmName: string): Promise<BackupData> {
    const [
      clients, clientStaff, staff, contacts, interactions, tasks,
      filings, filingSettings, invoices, billingEntries, hoursLog,
      documentFolders, documents, messageTemplates, messages,
      scheduledMessages, auditLog, roles, staffRoles,
    ] = await Promise.all([
      fetchTable(firmId, 'clients'),
      fetchJunction(firmId, 'client_staff'),
      fetchTable(firmId, 'staff'),
      fetchTable(firmId, 'contacts'),
      fetchTable(firmId, 'interactions'),
      fetchTable(firmId, 'tasks'),
      fetchTable(firmId, 'filings'),
      fetchRaw(firmId, 'filing_settings'),
      fetchTable(firmId, 'invoices'),
      fetchTable(firmId, 'billing_entries'),
      fetchRaw(firmId, 'hours_log', true),
      fetchRaw(firmId, 'document_folders'),
      fetchTable(firmId, 'documents'),
      fetchTable(firmId, 'message_templates'),
      fetchRaw(firmId, 'messages'),
      fetchRaw(firmId, 'scheduled_messages'),
      fetchRaw(firmId, 'audit_log'),
      fetchTable(firmId, 'roles'),
      fetchJunction(firmId, 'staff_roles'),
    ]);

    return {
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      firmId,
      firmName,
      data: {
        clients, clientStaff, staff, contacts, interactions, tasks,
        filings, filingSettings, invoices, billingEntries, hoursLog,
        documentFolders, documents, messageTemplates, messages,
        scheduledMessages, auditLog, roles, staffRoles,
      },
    } as BackupData;
  },

  /**
   * Restore data from a backup file using merge semantics.
   * - Inserts records with ON CONFLICT DO NOTHING.
   * - Skips audit_log entirely (immutable).
   * - Processes tables in dependency order.
   * - For foreign-firm restores, filters junction table rows to only include
   *   those whose parent IDs exist in the backup's entity arrays.
   */
  async restoreBackup(firmId: string, backup: BackupData): Promise<RestoreResult> {
    const inserted: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const errors: string[] = [];

    // Validation: check version
    if (!backup.version || backup.version > BACKUP_VERSION) {
      throw new Error('Unsupported backup version');
    }
    if (!backup.data) {
      throw new Error('Invalid backup format');
    }

    // Detect foreign-firm restore: build sets of parent IDs for junction filtering
    const isForeignFirm = backup.firmId !== firmId;
    const backupClientIds = new Set(
      (backup.data.clients ?? []).map((c) => c.id)
    );
    const backupStaffIds = new Set(
      (backup.data.staff ?? []).map((s) => s.id)
    );

    // Table restore order (parents first, children last)
    const restoreOrder: Array<{
      key: keyof BackupData['data'];
      table: string;
      firmScoped: boolean;
      onConflict: string;
    }> = [
      { key: 'staff', table: 'staff', firmScoped: true, onConflict: 'id' },
      { key: 'roles', table: 'roles', firmScoped: true, onConflict: 'id' },
      { key: 'clients', table: 'clients', firmScoped: true, onConflict: 'id' },
      { key: 'clientStaff', table: 'client_staff', firmScoped: false, onConflict: 'client_id,staff_id' },
      { key: 'staffRoles', table: 'staff_roles', firmScoped: false, onConflict: 'staff_id,role_id' },
      { key: 'contacts', table: 'contacts', firmScoped: true, onConflict: 'id' },
      { key: 'interactions', table: 'interactions', firmScoped: true, onConflict: 'id' },
      { key: 'tasks', table: 'tasks', firmScoped: true, onConflict: 'id' },
      { key: 'filings', table: 'filings', firmScoped: true, onConflict: 'id' },
      { key: 'filingSettings', table: 'filing_settings', firmScoped: true, onConflict: 'id' },
      { key: 'invoices', table: 'invoices', firmScoped: true, onConflict: 'id' },
      { key: 'billingEntries', table: 'billing_entries', firmScoped: true, onConflict: 'id' },
      { key: 'hoursLog', table: 'hours_log', firmScoped: true, onConflict: 'id' },
      { key: 'documentFolders', table: 'document_folders', firmScoped: true, onConflict: 'id' },
      { key: 'documents', table: 'documents', firmScoped: true, onConflict: 'id' },
      { key: 'messageTemplates', table: 'message_templates', firmScoped: true, onConflict: 'id' },
      { key: 'messages', table: 'messages', firmScoped: true, onConflict: 'id' },
      { key: 'scheduledMessages', table: 'scheduled_messages', firmScoped: true, onConflict: 'id' },
      // auditLog is explicitly excluded — immutable
    ];

    for (const { key, table, firmScoped, onConflict } of restoreOrder) {
      const rawRows = backup.data[key];
      if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) {
        inserted[table] = 0;
        skipped[table] = 0;
        continue;
      }

      // Cast to generic record array for uniform processing
      let rows = rawRows as unknown as Record<string, unknown>[];

      // Security: For foreign-firm restores, filter junction table rows
      // to only include those whose parent IDs exist in the backup
      if (isForeignFirm) {
        if (key === 'clientStaff') {
          rows = rows.filter(
            (r) => backupClientIds.has(r.client_id as string) && backupStaffIds.has(r.staff_id as string)
          );
        } else if (key === 'staffRoles') {
          const backupRoleIds = new Set(
            (backup.data.roles ?? []).map((r) => r.id)
          );
          rows = rows.filter(
            (r) => backupStaffIds.has(r.staff_id as string) && backupRoleIds.has(r.role_id as string)
          );
        }
      }

      if (rows.length === 0) {
        inserted[table] = 0;
        skipped[table] = 0;
        continue;
      }

      try {
        // Ensure firm_id matches current firm for firm-scoped tables
        const prepared = firmScoped
          ? rows.map((r) => ({ ...r, firm_id: firmId }))
          : rows;

        const { data, error } = await supabase
          .from(table)
          .upsert(prepared as Record<string, unknown>[], {
            onConflict,
            ignoreDuplicates: true,
          })
          .select('id');

        if (error) {
          errors.push(`${table}: ${error.message}`);
          skipped[table] = rows.length;
          inserted[table] = 0;
        } else {
          const insertedCount = data?.length ?? 0;
          inserted[table] = insertedCount;
          skipped[table] = rows.length - insertedCount;
        }
      } catch (err) {
        errors.push(`${table}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skipped[table] = rows.length;
        inserted[table] = 0;
      }
    }

    return { inserted, skipped, errors };
  },

  /**
   * Get storage statistics for the StorageInfo display.
   */
  async getStats(firmId: string): Promise<BackupStats> {
    const [clientCount, activeClientCount, staffCount, hoursCount, invoiceCount, documentCount] = await Promise.all([
      countTable(firmId, 'clients'),
      countActiveClients(firmId),
      countTable(firmId, 'staff'),
      countTable(firmId, 'hours_log'),
      countTable(firmId, 'invoices'),
      countTable(firmId, 'documents'),
    ]);

    return {
      clientCount,
      activeClientCount,
      staffCount,
      hoursCount,
      invoiceCount,
      documentCount,
    };
  },
};
