// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Client, ExportField } from '@/types';
import { agorotToShekel } from '@/lib/money';

/** All exportable client fields with i18n label keys. */
export const CLIENT_EXPORT_FIELDS: ExportField[] = [
  { key: 'name', labelKey: 'export.field.name', defaultSelected: true },
  { key: 'taxId', labelKey: 'export.field.taxId', defaultSelected: true },
  { key: 'caseNum', labelKey: 'export.field.caseNum', defaultSelected: true },
  { key: 'email', labelKey: 'export.field.email', defaultSelected: true },
  { key: 'mobile', labelKey: 'export.field.phone', defaultSelected: true },
  { key: 'address', labelKey: 'export.field.address', defaultSelected: false },
  { key: 'city', labelKey: 'export.field.city', defaultSelected: false },
  { key: 'type', labelKey: 'export.field.type', defaultSelected: false },
  { key: 'clientType', labelKey: 'export.field.clientType', defaultSelected: true },
  { key: 'monthlyFee', labelKey: 'export.field.monthlyFee', defaultSelected: true },
  { key: 'status', labelKey: 'export.field.status', defaultSelected: false },
  { key: 'billingDay', labelKey: 'export.field.billingDay', defaultSelected: false },
  { key: 'tags', labelKey: 'export.field.tags', defaultSelected: false },
  { key: 'notes', labelKey: 'export.field.notes', defaultSelected: false },
  { key: 'updated_at', labelKey: 'export.field.updatedAt', defaultSelected: false },
];

/** Format a client field value for export. */
function formatFieldValue(client: Client, key: string): string | number {
  const val = (client as unknown as Record<string, unknown>)[key];
  if (key === 'monthlyFee' && typeof val === 'number') {
    return agorotToShekel(val);
  }
  if (key === 'tags' && Array.isArray(val)) {
    return val.join(', ');
  }
  return val != null ? String(val) : '';
}

/** Escape a value for CSV. */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Trigger browser file download. */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const exportService = {
  /**
   * Export clients as CSV or JSON.
   */
  exportClients(
    clients: Client[],
    fields: string[],
    format: 'csv' | 'json',
    statusFilter: 'all' | 'active' | 'archived',
    t: (key: string) => string,
  ): void {
    let filtered = clients;
    if (statusFilter !== 'all') {
      filtered = clients.filter((c) => c.status === statusFilter);
    }

    const selectedFields = CLIENT_EXPORT_FIELDS.filter((f) => fields.includes(f.key));

    if (format === 'json') {
      const data = filtered.map((client) => {
        const obj: Record<string, unknown> = {};
        for (const field of selectedFields) {
          obj[field.key] = formatFieldValue(client, field.key);
        }
        return obj;
      });
      downloadFile(JSON.stringify(data, null, 2), 'clients.json', 'application/json');
    } else {
      const headers = selectedFields.map((f) => t(f.labelKey));
      const rows = filtered.map((client) =>
        selectedFields.map((f) => csvEscape(String(formatFieldValue(client, f.key) ?? '')))
      );
      const csv = '\uFEFF' + headers.join(',') + '\n' + rows.map((r) => r.join(',')).join('\n');
      downloadFile(csv, 'clients.csv', 'text/csv;charset=utf-8');
    }
  },

  /**
   * Export filings as CSV.
   */
  async exportFilings(firmId: string, t: (key: string) => string): Promise<void> {
    const { data, error } = await supabase
      .from('filings')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('due', { ascending: false });

    if (error) throw new Error(error.message);
    const rows = data ?? [];

    const headers = [t('common.type'), t('common.status'), 'Period', 'Due', 'Filed'];
    const csvRows = rows.map((r: Record<string, unknown>) => [
      csvEscape(String(r.type)),
      csvEscape(String(r.status)),
      csvEscape(String(r.period)),
      csvEscape(String(r.due)),
      csvEscape(String(r.filed_date ?? '')),
    ]);

    const csv = '\uFEFF' + headers.join(',') + '\n' + csvRows.map((r) => r.join(',')).join('\n');
    downloadFile(csv, 'filings.csv', 'text/csv;charset=utf-8');
  },

  /**
   * Export tasks as CSV.
   */
  async exportTasks(firmId: string, t: (key: string) => string): Promise<void> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    const rows = data ?? [];

    const headers = [t('tasks.title'), t('common.status'), t('tasks.priority'), t('tasks.dueDate'), t('tasks.category')];
    const csvRows = rows.map((r: Record<string, unknown>) => [
      csvEscape(String(r.title)),
      csvEscape(String(r.status)),
      csvEscape(String(r.priority)),
      csvEscape(String(r.due_date ?? '')),
      csvEscape(String(r.category)),
    ]);

    const csv = '\uFEFF' + headers.join(',') + '\n' + csvRows.map((r) => r.join(',')).join('\n');
    downloadFile(csv, 'tasks.csv', 'text/csv;charset=utf-8');
  },
};
