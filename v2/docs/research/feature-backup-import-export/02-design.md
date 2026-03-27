# Backup & Import/Export Module — Technical Design

> Created: 2026-03-24 | Architecture Phase

---

## 1. Architecture Overview

```
BackupView (tabs)
├── Tab: Backup & Restore
│   ├── BackupCard ──────── useCreateBackup() ──────── backupService.createBackup()
│   ├── RestoreCard ─────── useRestoreBackup() ─────── backupService.restoreBackup()
│   └── StorageInfo ─────── useBackupStats() ────────── backupService.getStats()
├── Tab: Import
│   └── ImportPanel ─────── useImportClients() ─────── importService.parse*() + importService.importClients()
├── Tab: Export
│   └── ExportPanel ─────── (no hook — pure client-side) ── exportService.export*()
└── Tab: Documents
    └── DocsImportPanel ─── useUploadDocument() (existing) ── documentService.upload() (existing)
```

All services query Supabase directly with `firm_id` scoping. No new database tables or migrations are required.

### Decision Record

| # | Question | Decision |
|---|----------|----------|
| Q1 | Include audit_log in backup? | Yes, but skip on restore (immutable table) |
| Q2 | Restore conflict strategy? | Upsert with `ON CONFLICT DO NOTHING`, report skipped |
| Q3 | Backup size approach? | Download all non-deleted records at once |
| Q4 | xlsx loading strategy? | Lazy-load via `import('xlsx')` |
| Q5 | Permission key? | Single `settings.backup` permission |
| Q6 | DocsImportPanel upload? | Reuse existing `useUploadDocument` hook |
| Q7 | Backup version format? | Semantic version string `"1.0.0"` in JSON |

---

## 2. Type Definitions

### File: `src/types/backup.ts`

```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import type {
  Client, Staff, Filing, FilingSetting,
  BillingEntry, HoursEntry, Invoice,
  Contact, Interaction, Task,
  LegalDocument, DocumentFolder,
  MessageTemplate, Message, ScheduledMessage,
  AuditEntry, Role,
} from '@/types';

/** Current backup format version. */
export const BACKUP_VERSION = '1.0.0';

/** Full firm backup envelope. */
export interface BackupData {
  version: string;
  createdAt: string;        // ISO datetime
  firmId: string;
  firmName: string;
  data: {
    clients: Client[];
    clientStaff: ClientStaffRow[];
    staff: Staff[];
    contacts: Contact[];
    interactions: Interaction[];
    tasks: Task[];
    filings: Filing[];
    filingSettings: FilingSettingRow[];
    invoices: Invoice[];
    billingEntries: BillingEntry[];
    hoursLog: HoursEntry[];
    documentFolders: DocumentFolder[];
    documents: LegalDocument[];
    messageTemplates: MessageTemplate[];
    messages: Message[];
    scheduledMessages: ScheduledMessage[];
    auditLog: AuditEntry[];    // read-only archive, skipped on restore
    roles: Role[];
    staffRoles: StaffRoleJunctionRow[];
  };
}

/** Raw client_staff junction row (DB shape). */
export interface ClientStaffRow {
  id: string;
  client_id: string;
  staff_id: string;
  is_primary: boolean;
  created_at: string;
}

/** Raw filing_settings row (DB shape). */
export interface FilingSettingRow {
  id: string;
  firm_id: string;
  client_id: string;
  vat_freq: string;
  tax_adv_enabled: boolean;
  tax_adv_freq: string;
  tax_deduct_enabled: boolean;
  tax_deduct_freq: string;
  nii_deduct_enabled: boolean;
  nii_deduct_freq: string;
  created_at: string;
  updated_at: string;
}

/**
 * Raw staff_roles junction row (DB shape).
 * Named StaffRoleJunctionRow to avoid collision with StaffRoleRow in src/types/role.ts
 * which has different (camelCase) fields.
 */
export interface StaffRoleJunctionRow {
  id: string;
  staff_id: string;
  role_id: string;
  created_at: string;
}

/** Result of a restore operation. */
export interface RestoreResult {
  inserted: Record<string, number>;   // table -> count inserted
  skipped: Record<string, number>;    // table -> count skipped (conflicts)
  errors: string[];                   // human-readable error descriptions
}

/** A single parsed import row (pre-validation). */
export interface ImportRow {
  name?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  city?: string;
  type?: string;          // 'company' | 'private'
  clientType?: string;    // 'self_employed' | 'company' | 'economic' | 'private'
  monthlyFee?: string;    // raw string from CSV/Excel — parsed to number later
  billingDay?: string;
  tags?: string;
  notes?: string;
  _rowIndex: number;      // 1-based row number from source file
}

/** Validation result for a single import row. */
export interface ImportRowResult {
  row: ImportRow;
  valid: boolean;
  errors: string[];       // e.g. ['missingName', 'invalidEmail']
  isDuplicate: boolean;
}

/** Result of a client import operation. */
export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

export interface ImportRowError {
  rowIndex: number;
  name: string;
  reason: string;
}

/** Exportable client field definition. */
export interface ExportField {
  key: string;            // Client property name (camelCase)
  labelKey: string;       // i18n key for display
  defaultSelected: boolean;
}

/** Storage statistics for StorageInfo display. */
export interface BackupStats {
  clientCount: number;
  activeClientCount: number;
  staffCount: number;
  hoursCount: number;
  invoiceCount: number;
  documentCount: number;
}
```

### Barrel export addition: `src/types/index.ts`

Add one line at the end:

```typescript
export * from './backup';
```

---

## 3. Service Layer

### 3a. `src/services/backupService.ts`

This service handles full backup creation and restore. It queries every firm-scoped table.

**Key design decisions:**
- All queries use `.eq('firm_id', firmId).is('deleted_at', null)` (except junction tables and audit_log which have no `deleted_at`).
- Junction tables (`client_staff`, `staff_roles`) are scoped by fetching parent IDs first, then filtering with `.in()` — defense-in-depth beyond RLS.
- Restore uses `.upsert(..., { ignoreDuplicates: true })` per table. Entity tables use `onConflict: 'id'`. Junction tables use composite business keys (`client_id,staff_id` and `staff_id,role_id`) to prevent duplicate logical entries.
- `audit_log` is skipped during restore (immutable).
- Restore processes tables in dependency order (parents before children).

```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type {
  BackupData, RestoreResult, BackupStats,
  ClientStaffRow, FilingSettingRow, StaffRoleJunctionRow,
} from '@/types';
import { BACKUP_VERSION } from '@/types/backup';

export const backupService = {
  /**
   * Create a full JSON backup of all firm data.
   * Fetches all non-deleted records from every entity table.
   */
  async createBackup(firmId: string, firmName: string): Promise<BackupData> {
    // Fetch all tables in parallel for speed
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
      fetchRaw(firmId, 'filing_settings'),    // no deleted_at
      fetchTable(firmId, 'invoices'),
      fetchTable(firmId, 'billing_entries'),
      fetchRaw(firmId, 'hours_log', true),    // has deleted_at but different schema
      fetchRaw(firmId, 'document_folders'),    // no deleted_at
      fetchTable(firmId, 'documents'),
      fetchTable(firmId, 'message_templates'),
      fetchRaw(firmId, 'messages'),           // no deleted_at
      fetchRaw(firmId, 'scheduled_messages'), // no deleted_at
      fetchRaw(firmId, 'audit_log'),          // immutable, no deleted_at
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
    };
  },

  /**
   * Restore data from a backup file using merge semantics.
   * - Inserts records with ON CONFLICT (id) DO NOTHING.
   * - Skips audit_log entirely (immutable).
   * - Processes tables in dependency order.
   */
  async restoreBackup(firmId: string, backup: BackupData): Promise<RestoreResult> {
    // ... see detailed logic below
  },

  /**
   * Get storage statistics for the StorageInfo display.
   */
  async getStats(firmId: string): Promise<BackupStats> {
    const [clients, activeClients, staff, hours, invoices, documents] = await Promise.all([
      countTable(firmId, 'clients'),
      countActiveClients(firmId),
      countTable(firmId, 'staff'),
      countTable(firmId, 'hours_log'),
      countTable(firmId, 'invoices'),
      countTable(firmId, 'documents'),
    ]);

    return {
      clientCount: clients,
      activeClientCount: activeClients,
      staffCount: staff,
      hoursCount: hours,
      invoiceCount: invoices,
      documentCount: documents,
    };
  },
};
```

**Internal helper functions** (not exported):

```typescript
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
 * This provides defense-in-depth beyond RLS to prevent cross-tenant leakage.
 */
async function fetchJunction(firmId: string, table: string): Promise<unknown[]> {
  if (table === 'client_staff') {
    // Scope via firm's client IDs
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
    // Scope via firm's staff IDs
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
```

**Restore logic — detailed table-by-table strategy:**

The restore function processes tables in dependency order. Entity tables use `upsert` with `onConflict: 'id'` so existing records (matched by primary key) are silently skipped. Junction tables use composite business keys (`client_id,staff_id` for `client_staff`, `staff_id,role_id` for `staff_roles`) to prevent duplicate logical entries even if the `id` differs.

```typescript
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

  // Table restore order (parents first, children last).
  // Each entry specifies the upsert conflict key:
  //   - Entity tables: 'id' (primary key)
  //   - Junction tables: composite business key to prevent duplicate logical entries
  const restoreOrder: Array<{
    key: keyof BackupData['data'];
    table: string;
    firmScoped: boolean;      // whether to inject firm_id
    onConflict: string;       // upsert conflict columns
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
    // auditLog is explicitly excluded — immutable, cannot INSERT with historical user_ids
  ];

  for (const { key, table, firmScoped, onConflict } of restoreOrder) {
    const rows = backup.data[key];
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      inserted[table] = 0;
      skipped[table] = 0;
      continue;
    }

    try {
      // Ensure firm_id matches current firm for firm-scoped tables
      const prepared = firmScoped
        ? rows.map((r: Record<string, unknown>) => ({ ...r, firm_id: firmId }))
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
}
```

**Important notes on restore:**
- `firm_id` is overwritten to the *current* firm's ID for all firm-scoped tables, preventing cross-firm data leakage.
- The `clients` table has a trigger that auto-generates `case_num`. For restore, the backup includes the original `case_num` and `id`. Since we upsert by `id`, if the record already exists it's skipped. If it's new, the trigger fires but the explicit `case_num` from the backup data should take precedence (INSERT provides it). **Edge case**: if the backup `case_num` conflicts with an existing one on a different `id`, the unique constraint `(firm_id, case_num)` will cause the insert to fail. This is caught and reported in the `errors` array.
- `invoices.invoice_num` has a similar unique constraint — same handling.

### 3b. `src/services/importService.ts`

This service handles parsing CSV/Excel/JSON files and importing client records.

```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Client, CreateClientInput } from '@/types';
import type { ImportRow, ImportRowResult, ImportResult } from '@/types/backup';
import { validateEmail, validatePhone, validateTaxId } from '@/lib/validation';
import { DEFAULT_FOLDERS } from '@/lib/constants';

/** Hebrew-to-English header mapping for import files. */
const HEADER_MAP: Record<string, keyof ImportRow> = {
  // Hebrew headers
  'שם': 'name',
  'שם לקוח': 'name',
  'שם חברה': 'name',
  'מספר עוסק': 'taxId',
  'ח.פ.': 'taxId',
  'ח"פ': 'taxId',
  'מספר זהות': 'taxId',
  'דואר אלקטרוני': 'email',
  'מייל': 'email',
  'טלפון': 'phone',
  'נייד': 'mobile',
  'כתובת': 'address',
  'עיר': 'city',
  'סוג': 'type',
  'סוג ישות': 'type',
  'סיווג מס': 'clientType',
  'שכ"ט': 'monthlyFee',
  'שכר טרחה': 'monthlyFee',
  'שכ"ט חודשי': 'monthlyFee',
  'יום חיוב': 'billingDay',
  'תגיות': 'tags',
  'הערות': 'notes',
  // English headers (case-insensitive match applied later)
  'name': 'name',
  'company': 'name',
  'tax_id': 'taxId',
  'taxid': 'taxId',
  'tax id': 'taxId',
  'email': 'email',
  'phone': 'phone',
  'mobile': 'mobile',
  'address': 'address',
  'city': 'city',
  'type': 'type',
  'client_type': 'clientType',
  'clienttype': 'clientType',
  'monthly_fee': 'monthlyFee',
  'monthlyfee': 'monthlyFee',
  'fee': 'monthlyFee',
  'billing_day': 'billingDay',
  'billingday': 'billingDay',
  'tags': 'tags',
  'notes': 'notes',
};

export const importService = {
  /**
   * Map raw file headers to ImportRow keys using HEADER_MAP.
   * Returns a map of columnIndex -> ImportRow key.
   */
  mapHeaders(headers: string[]): Map<number, keyof ImportRow> {
    const result = new Map<number, keyof ImportRow>();
    for (let i = 0; i < headers.length; i++) {
      const raw = headers[i].trim();
      const normalized = raw.toLowerCase().replace(/[\s_\-]+/g, '');
      // Try exact match first (Hebrew)
      if (HEADER_MAP[raw]) {
        result.set(i, HEADER_MAP[raw]);
        continue;
      }
      // Try normalized match (English case-insensitive)
      for (const [key, value] of Object.entries(HEADER_MAP)) {
        if (key.toLowerCase().replace(/[\s_\-]+/g, '') === normalized) {
          result.set(i, value);
          break;
        }
      }
    }
    return result;
  },

  /**
   * Parse a CSV file into ImportRow[].
   * Handles BOM, quoted fields, and Hebrew/English headers.
   */
  async parseCSV(file: File): Promise<ImportRow[]> {
    const text = await file.text();
    return parseCsvText(text);
  },

  /**
   * Parse an Excel (XLSX/XLS) file into ImportRow[].
   * Lazy-loads the xlsx library.
   */
  async parseExcel(file: File): Promise<ImportRow[]> {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Convert to array of arrays
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length < 2) return []; // header + at least one data row
    return rowsToImportRows(rows);
  },

  /**
   * Parse a JSON file into ImportRow[].
   * Expects an array of objects with English or Hebrew keys.
   */
  async parseJSON(file: File): Promise<ImportRow[]> {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed.clients ?? parsed.data ?? [];
    if (!Array.isArray(arr)) throw new Error('Invalid JSON format');

    const rows: ImportRow[] = [];
    for (let i = 0; i < arr.length; i++) {
      const obj = arr[i];
      if (typeof obj !== 'object' || obj === null) continue;
      const row: ImportRow = { _rowIndex: i + 1 };
      for (const [key, val] of Object.entries(obj)) {
        const mapped = HEADER_MAP[key] ?? HEADER_MAP[key.toLowerCase()];
        if (mapped && mapped !== '_rowIndex') {
          (row as Record<string, unknown>)[mapped] = String(val ?? '');
        }
      }
      rows.push(row);
    }
    return rows;
  },

  /**
   * Validate parsed rows against existing clients (duplicate detection by name).
   */
  validateRows(rows: ImportRow[], existingNames: Set<string>): ImportRowResult[] {
    return rows.map((row) => {
      const errors: string[] = [];
      const name = row.name?.trim();

      if (!name) errors.push('missingName');
      if (row.email && !validateEmail(row.email)) errors.push('invalidEmail');
      if (row.phone && !validatePhone(row.phone)) errors.push('invalidPhone');
      if (row.mobile && !validatePhone(row.mobile)) errors.push('invalidPhone');
      if (row.taxId && !validateTaxId(row.taxId)) errors.push('invalidTaxId');
      if (row.monthlyFee && isNaN(Number(row.monthlyFee))) errors.push('invalidFee');

      const isDuplicate = !!name && existingNames.has(name.toLowerCase());

      return {
        row,
        valid: errors.length === 0 && !isDuplicate,
        errors,
        isDuplicate,
      };
    });
  },

  /**
   * Import validated client rows into the database.
   * Auto-generates caseNum via DB trigger.
   * Creates default document folders for each new client.
   */
  async importClients(
    firmId: string,
    validRows: ImportRow[]
  ): Promise<ImportResult> {
    const results: ImportResult = { total: validRows.length, imported: 0, skipped: 0, errors: [] };

    for (const row of validRows) {
      try {
        const input: CreateClientInput = {
          name: row.name!.trim(),
          type: resolveType(row.type),
          clientType: resolveClientType(row.clientType),
          taxId: row.taxId?.trim() || undefined,
          email: row.email?.trim() || undefined,
          mobile: row.mobile?.trim() || row.phone?.trim() || undefined,
          address: row.address?.trim() || undefined,
          city: row.city?.trim() || undefined,
          tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
          monthlyFee: row.monthlyFee ? Math.round(Number(row.monthlyFee) * 100) : 0,  // shekel to agorot
          billingDay: row.billingDay ? Number(row.billingDay) : undefined,
          notes: row.notes?.trim() || undefined,
        };

        const { data, error } = await supabase
          .from('clients')
          .insert({
            firm_id: firmId,
            name: input.name,
            status: 'active',
            type: input.type,
            client_type: input.clientType,
            tax_id: input.taxId ?? null,
            mobile: input.mobile ?? null,
            email: input.email ?? null,
            address: input.address ?? null,
            city: input.city ?? null,
            tags: input.tags,
            monthly_fee: input.monthlyFee,
            billing_day: input.billingDay ?? null,
            notes: input.notes ?? null,
            case_num: '',   // trigger overwrites
          })
          .select('id')
          .single();

        if (error) {
          results.errors.push({ rowIndex: row._rowIndex, name: row.name ?? '', reason: error.message });
          results.skipped++;
        } else {
          // Create default folders for the new client (using shared constant)
          try {
            const folderRows = DEFAULT_FOLDERS.map((name) => ({
              firm_id: firmId,
              client_id: data.id,
              name,
            }));
            await supabase
              .from('document_folders')
              .upsert(folderRows, { onConflict: 'firm_id,client_id,name', ignoreDuplicates: true });
          } catch {
            // Folder creation is best-effort
          }
          results.imported++;
        }
      } catch (err) {
        results.errors.push({
          rowIndex: row._rowIndex,
          name: row.name ?? '',
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
        results.skipped++;
      }
    }

    return results;
  },
};
```

**Internal helper functions** (not exported):

```typescript
/** Parse CSV text into ImportRow[]. Handles BOM and quoted fields. */
function parseCsvText(text: string): ImportRow[] {
  // Remove BOM
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = splitCsvLine(headerLine);
  const headerMap = importService.mapHeaders(headers);

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (values.every((v) => !v.trim())) continue; // skip empty rows

    const row: ImportRow = { _rowIndex: i + 1 };
    for (const [colIdx, field] of headerMap.entries()) {
      if (field !== '_rowIndex' && colIdx < values.length) {
        (row as Record<string, unknown>)[field] = values[colIdx].trim();
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Split a CSV line respecting quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Convert raw rows (array of arrays) from Excel to ImportRow[]. */
function rowsToImportRows(rows: string[][]): ImportRow[] {
  const headers = rows[0].map(String);
  const headerMap = importService.mapHeaders(headers);

  const result: ImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (!values || values.every((v) => !String(v ?? '').trim())) continue;

    const row: ImportRow = { _rowIndex: i + 1 };
    for (const [colIdx, field] of headerMap.entries()) {
      if (field !== '_rowIndex' && colIdx < values.length) {
        (row as Record<string, unknown>)[field] = String(values[colIdx] ?? '').trim();
      }
    }
    result.push(row);
  }
  return result;
}

/** Resolve type field to 'company' | 'private'. Default: 'private'. */
function resolveType(raw?: string): 'company' | 'private' {
  if (!raw) return 'private';
  const lower = raw.trim().toLowerCase();
  if (lower === 'company' || lower === 'חברה') return 'company';
  return 'private';
}

/** Resolve clientType field. Default: 'self_employed'. */
function resolveClientType(raw?: string): 'self_employed' | 'company' | 'economic' | 'private' {
  if (!raw) return 'self_employed';
  const lower = raw.trim().toLowerCase();
  const map: Record<string, 'self_employed' | 'company' | 'economic' | 'private'> = {
    'self_employed': 'self_employed',
    'עוסק מורשה': 'self_employed',
    'company': 'company',
    'חברה': 'company',
    'economic': 'economic',
    'עוסק פטור': 'economic',
    'private': 'private',
    'פרטי': 'private',
  };
  return map[lower] ?? 'self_employed';
}
```

**Template CSV generation** (used by ImportPanel's "download template" button):

```typescript
/** Generate a CSV template with example rows. */
export function generateImportTemplate(): string {
  const headers = ['שם לקוח', 'מספר עוסק', 'דואר אלקטרוני', 'טלפון', 'נייד', 'כתובת', 'עיר', 'סוג ישות', 'סיווג מס', 'שכ"ט חודשי', 'יום חיוב', 'תגיות', 'הערות'];
  const example = ['ישראלי בע"מ', '123456789', 'info@example.com', '02-1234567', '050-1234567', 'הרצל 1', 'תל אביב', 'חברה', 'company', '1500', '1', 'חדש,VIP', 'לקוח חדש'];
  // BOM for Excel Hebrew support
  return '\uFEFF' + headers.join(',') + '\n' + example.join(',') + '\n';
}
```

### 3c. `src/services/exportService.ts`

This service handles exporting data to CSV/JSON files.

```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Client, ExportField } from '@/types';
import { agorotToShekel, formatMoney } from '@/lib/money';

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

export const exportService = {
  /**
   * Export clients as CSV or JSON.
   * @param clients - Pre-fetched client list (from useClients hook).
   * @param fields - Selected field keys.
   * @param format - 'csv' or 'json'.
   * @param statusFilter - 'all' | 'active' | 'archived'.
   * @param t - Translation function for header labels.
   */
  exportClients(
    clients: Client[],
    fields: string[],
    format: 'csv' | 'json',
    statusFilter: 'all' | 'active' | 'archived',
    t: (key: string) => string,
  ): void {
    // Filter by status
    let filtered = clients;
    if (statusFilter !== 'all') {
      filtered = clients.filter((c) => c.status === statusFilter);
    }

    // Get field metadata for selected fields in order
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
      // CSV
      const headers = selectedFields.map((f) => t(f.labelKey));
      const rows = filtered.map((client) =>
        selectedFields.map((f) => csvEscape(String(formatFieldValue(client, f.key) ?? '')))
      );
      // BOM + header + data
      const csv = '\uFEFF' + headers.join(',') + '\n' + rows.map((r) => r.join(',')).join('\n');
      downloadFile(csv, 'clients.csv', 'text/csv;charset=utf-8');
    }
  },

  /**
   * Export filings as CSV.
   * Fetches directly from Supabase.
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
   * Fetches directly from Supabase.
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
```

**Internal helpers** (not exported):

```typescript
/** Format a client field value for export. Handles agorot -> shekel, arrays -> comma-joined. */
function formatFieldValue(client: Client, key: string): string | number {
  const val = (client as Record<string, unknown>)[key];
  if (key === 'monthlyFee' && typeof val === 'number') {
    return agorotToShekel(val);
  }
  if (key === 'tags' && Array.isArray(val)) {
    return val.join(', ');
  }
  return val != null ? String(val) : '';
}

/** Escape a value for CSV (wrap in quotes if it contains comma, quote, or newline). */
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
```

---

## 4. Hook Layer

### File: `src/hooks/useBackup.ts`

```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupService } from '@/services/backupService';
import { importService } from '@/services/importService';
import type { BackupData, ImportRow, ImportResult } from '@/types';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { clientKeys } from '@/hooks/useClients';
import { documentKeys } from '@/hooks/useDocuments';

export const backupKeys = {
  all: ['backup'] as const,
  stats: (firmId: string) => [...backupKeys.all, 'stats', firmId] as const,
};

/** Fetch storage statistics for StorageInfo. */
export function useBackupStats() {
  const firmId = useAuthStore((s) => s.firmId);

  return useQuery({
    queryKey: backupKeys.stats(firmId ?? ''),
    queryFn: () => backupService.getStats(firmId!),
    enabled: !!firmId,
  });
}

/** Create and download a full firm backup. */
export function useCreateBackup() {
  const firmId = useAuthStore((s) => s.firmId);
  const firmName = useAuthStore((s) => s.firmName);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async () => {
      const backup = await backupService.createBackup(firmId!, firmName ?? 'backup');
      // Trigger download
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `${firmName ?? 'backup'}_${date}.bak`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return backup;
    },
    onSuccess: () => {
      toast.success(t('backup.downloaded'));
    },
    onError: () => {
      toast.error(t('errors.generic'));
    },
  });
}

/** Restore a firm backup from a parsed BackupData object. */
export function useRestoreBackup() {
  const firmId = useAuthStore((s) => s.firmId);
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (backup: BackupData) =>
      backupService.restoreBackup(firmId!, backup),
    onSuccess: (result) => {
      // Invalidate all caches after restore
      queryClient.invalidateQueries();
      const totalInserted = Object.values(result.inserted).reduce((a, b) => a + b, 0);
      if (result.errors.length > 0) {
        toast.warning(`${t('backup.restoreSuccess')} (${result.errors.length} errors)`);
      } else {
        toast.success(t('backup.restoreSuccess'));
      }
    },
    onError: () => {
      toast.error(t('backup.restoreFailed'));
    },
  });
}

/** Import validated client rows. */
export function useImportClients() {
  const firmId = useAuthStore((s) => s.firmId);
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (validRows: ImportRow[]) =>
      importService.importClients(firmId!, validRows),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: documentKeys.folders() });
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
      toast.success(t('import.imported').replace('{count}', String(result.imported)));
    },
    onError: () => {
      toast.error(t('errors.generic'));
    },
  });
}
```

---

## 5. Component Specifications

### 5a. `src/components/backup/BackupView.tsx` (Main View)

**Purpose**: Root view for the `/backup` route. Contains tabs for Backup & Restore, Import, Export, and Documents.

**Props**: None (top-level page component).

**State management**:
- `const { t } = useLanguage()` — translations
- `const can = useAuthStore((s) => s.can)` — permission check
- `const [activeTab, setActiveTab] = useState('backup')` — active tab

**Permission check**: `if (!can('settings.backup')) return <Navigate to="/dashboard" />`

**UI layout**:
```
<div className="p-6 animate-fade-in">
  <PageHeader title={t('backup.title')} description={t('backup.description')} />

  <Tabs value={activeTab} onValueChange={setActiveTab}>
    <TabsList>
      <TabsTrigger value="backup">{t('backup.tabBackup')}</TabsTrigger>
      <TabsTrigger value="import">{t('backup.tabImport')}</TabsTrigger>
      <TabsTrigger value="export">{t('backup.tabExport')}</TabsTrigger>
      <TabsTrigger value="docs">{t('backup.tabDocs')}</TabsTrigger>
    </TabsList>

    <TabsContent value="backup">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <BackupCard />
          <RestoreCard />
        </div>
        <StorageInfo />
      </div>
    </TabsContent>

    <TabsContent value="import">
      <ImportPanel />
    </TabsContent>

    <TabsContent value="export">
      <ExportPanel />
    </TabsContent>

    <TabsContent value="docs">
      <DocsImportPanel />
    </TabsContent>
  </Tabs>
</div>
```

### 5b. `src/components/backup/BackupCard.tsx`

**Purpose**: Card with "Download Backup" button and estimated metadata.

**Hooks used**:
- `useBackupStats()` — for counts
- `useCreateBackup()` — mutation

**UI layout**:
```
Card with:
  - Title: t('backup.backupData') + description: t('backup.backupDesc')
  - Stats: client count, staff count
  - Button: <HardDrive /> t('backup.downloadBackup') / t('backup.creating') when loading
```

**Event handlers**:
- `onClick` on download button calls `createBackup.mutate()`
- Button disabled while `createBackup.isPending`

### 5c. `src/components/backup/RestoreCard.tsx`

**Purpose**: File upload for .bak/.json restore with confirmation dialog.

**State**:
- `const [file, setFile] = useState<File | null>(null)`
- `const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null)`
- `const [parseError, setParseError] = useState<string | null>(null)`
- `const [confirmOpen, setConfirmOpen] = useState(false)`
- `const [foreignFirmWarning, setForeignFirmWarning] = useState(false)` — true when backup.firmId !== current firmId

**Hooks used**:
- `useRestoreBackup()` — mutation
- `useAuthStore((s) => s.firmId)` — current firm ID for foreign-firm detection

**UI layout**:
```
Card with:
  - Title: t('backup.restore') + description: t('backup.restoreDesc')
  - Warning alert: t('backup.restoreWarning')
  - File input (accept=".bak,.json")
  - When file loaded: show backup metadata (version, date, record counts)
  - If foreignFirmWarning: prominent destructive alert explaining that the backup
    belongs to a different firm ("{backupFirmName}") and data will be imported
    as foreign data into the current firm. Requires explicit confirmation.
  - Restore button -> opens ConfirmDialog (with stronger warning text if foreign firm)
```

**Event handlers**:
- `onFileChange`: reads file, parses JSON, validates version field, sets parsedBackup or parseError. Also checks `parsedBackup.firmId !== firmId` and sets `foreignFirmWarning` accordingly.
- `onRestore` (in ConfirmDialog onConfirm): calls `restoreBackup.mutate(parsedBackup!)`

**Validation**:
- Parse JSON safely with try/catch
- Check `backup.version` exists and is <= BACKUP_VERSION
- Check `backup.data` exists and has expected shape
- Check `backup.firmId` against current `firmId` — if different, set `foreignFirmWarning = true` (does NOT block restore, but requires explicit user acknowledgement via a separate ConfirmDialog with `variant="destructive"` and clear explanation)

### 5d. `src/components/backup/StorageInfo.tsx`

**Purpose**: Display storage usage metrics with progress bars.

**Hooks used**:
- `useBackupStats()` — for counts

**UI layout**:
```
Card with:
  - Title: t('backup.storageTitle')
  - Metric rows, each with:
    - Icon + label + count
    - Progress bar (visual only — no hard limit, just relative proportions)
  - Metrics: clients, staff, hours logged, invoices, documents
```

### 5e. `src/components/backup/ImportPanel.tsx`

**Purpose**: Full client import flow — file upload, parse, preview, validate, import.

**State**:
- `const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')`
- `const [rows, setRows] = useState<ImportRow[]>([])`
- `const [validatedRows, setValidatedRows] = useState<ImportRowResult[]>([])`
- `const [importResult, setImportResult] = useState<ImportResult | null>(null)`
- `const [isLoading, setIsLoading] = useState(false)`
- Drag state: `const [isDragging, setIsDragging] = useState(false)`

**Hooks used**:
- `useClients(firmId)` — for duplicate detection
- `useImportClients()` — mutation
- `useAuthStore((s) => s.firmId)` — firm ID

**UI layout — step "upload"**:
```
<div className="space-y-6">
  {/* Instructions card */}
  <Card>
    <h3>{t('import.instructions')}</h3>
    <ul> ... instruction items from i18n ... </ul>
    <Button variant="outline" onClick={downloadTemplate}>
      {t('import.downloadTemplate')}
    </Button>
  </Card>

  {/* Drop zone */}
  <div
    onDragOver, onDragLeave, onDrop
    className={cn("border-2 border-dashed rounded-lg p-12 text-center", isDragging && "border-primary bg-primary/5")}
  >
    <Upload icon />
    <p>{t('import.dragDrop')}</p>
    <p className="text-muted-foreground">{t('import.clickSelect')}</p>
    <input type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileSelect} hidden />
  </div>
</div>
```

**UI layout — step "preview"**:
```
<div className="space-y-4">
  <div className="flex items-center justify-between">
    <div>
      <Badge>{validRows.length} {t('import.rows')}</Badge>
      {errorCount > 0 && <Badge variant="destructive">{errorCount} {t('import.errors')}</Badge>}
    </div>
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setStep('upload')}>{t('import.cancel')}</Button>
      <Button onClick={handleImport} disabled={validRows.length === 0}>
        {t('import.importButton').replace('{count}', String(validRows.length))}
      </Button>
    </div>
  </div>

  <DataTable columns={previewColumns} data={validatedRows} pageSize={10} />
</div>
```

Preview columns: row number, name, taxId, email, mobile, status (valid/duplicate/error badge).

**UI layout — step "done"**:
```
<div className="text-center py-12">
  <CheckCircle icon />
  <h3>{t('import.done')}</h3>
  <p>{t('import.doneDesc').replace('{count}', String(importResult.imported))}</p>
  <Button onClick={() => { setStep('upload'); setRows([]); }}>
    {t('import.importMore')}
  </Button>
</div>
```

**Event handlers**:
- `handleFileSelect(e)` / `handleDrop(e)`: detect file extension, call `importService.parseCSV/parseExcel/parseJSON`, then `importService.validateRows(rows, existingNames)`, transition to 'preview' step
- `handleImport()`: filter validated rows where `valid === true`, call `importClients.mutateAsync(validRows)`, transition to 'done' step
- `downloadTemplate()`: call `generateImportTemplate()`, trigger download

### 5f. `src/components/backup/ExportPanel.tsx`

**Purpose**: Export clients with field selection, status filter, format choice. Also export filings and tasks.

**State**:
- `const [selectedFields, setSelectedFields] = useState<Set<string>>(() => new Set(CLIENT_EXPORT_FIELDS.filter(f => f.defaultSelected).map(f => f.key)))`
- `const [format, setFormat] = useState<'csv' | 'json'>('csv')`
- `const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all')`

**Hooks used**:
- `useClients(firmId)` — client data for export
- `useAuthStore((s) => s.firmId)` — firm ID

**UI layout**:
```
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* Field selection (left 2 cols) */}
  <div className="lg:col-span-2">
    <Card>
      <h3>{t('export.selectFields')}</h3>
      <div className="grid grid-cols-2 gap-2">
        {CLIENT_EXPORT_FIELDS.map(field => (
          <label key={field.key} className="flex items-center gap-2">
            <Checkbox
              checked={selectedFields.has(field.key)}
              onCheckedChange={(checked) => toggleField(field.key, checked)}
            />
            {t(field.labelKey)}
          </label>
        ))}
      </div>
    </Card>
  </div>

  {/* Settings + actions (right col) */}
  <div className="space-y-4">
    <Card>
      <h3>{t('export.settings')}</h3>
      <Select value={format} onValueChange={setFormat}>
        ... CSV / JSON options ...
      </Select>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        ... all / active / archived options ...
      </Select>
      <p className="text-muted-foreground">
        {t('export.clientsToExport').replace('{count}', String(filteredCount))}
      </p>
      <p className="text-muted-foreground">
        {t('export.fieldsSelected').replace('{count}', String(selectedFields.size))}
      </p>
      <Button onClick={handleExportClients}>
        {t('export.exportButton').replace('{count}', String(filteredCount))}
      </Button>
    </Card>

    <Card>
      <h3>{t('export.additionalExports')}</h3>
      <Button variant="outline" onClick={handleExportFilings}>
        {t('export.exportFilings')}
      </Button>
      <Button variant="outline" onClick={handleExportTasks}>
        {t('export.exportTasks')}
      </Button>
    </Card>
  </div>
</div>
```

**Event handlers**:
- `handleExportClients()`: calls `exportService.exportClients(clients, [...selectedFields], format, statusFilter, t)`, then `toast.success(t('export.exported')...)`
- `handleExportFilings()`: calls `exportService.exportFilings(firmId, t)`, then toast
- `handleExportTasks()`: calls `exportService.exportTasks(firmId, t)`, then toast
- `toggleField(key, checked)`: add/remove from selectedFields Set

### 5g. `src/components/backup/DocsImportPanel.tsx`

**Purpose**: Upload document files to a specific client + folder.

**State**:
- `const [selectedClientId, setSelectedClientId] = useState<string>('')`
- `const [selectedFolderId, setSelectedFolderId] = useState<string>('')`
- `const [sensitivity, setSensitivity] = useState<DocumentSensitivity>('internal')`
- `const [files, setFiles] = useState<File[]>([])`
- `const [uploading, setUploading] = useState(false)`
- `const [isDragging, setIsDragging] = useState(false)`

**Hooks used**:
- `useClients(firmId)` — client picker
- `useFolders(firmId, selectedClientId)` — folder picker (from `useDocuments`)
- `useUploadDocument()` — existing upload hook (called per file)
- `useAuthStore((s) => s.firmId)` — firm ID

**UI layout**:
```
<div className="space-y-6">
  {/* Client + Folder pickers */}
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
      ... client list options ...
    </Select>
    <Select value={selectedFolderId} onValueChange={setSelectedFolderId}
            disabled={!selectedClientId}>
      ... folder list options ...
    </Select>
    <Select value={sensitivity} onValueChange={setSensitivity}>
      ... sensitivity options from DOCUMENT_SENSITIVITIES constant ...
    </Select>
  </div>

  {/* Drop zone */}
  <div onDragOver, onDragLeave, onDrop className="border-2 border-dashed ...">
    <Upload icon />
    <p>{t('docs.dragFiles')}</p>
    <input type="file" multiple onChange={handleFileSelect} hidden />
  </div>

  {/* File list */}
  {files.length > 0 && (
    <div className="space-y-2">
      {files.map((file, i) => (
        <div key={i} className="flex items-center justify-between p-2 border rounded">
          <FileIcon /> {/* based on extension */}
          <span>{file.name}</span>
          <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
          <Button variant="ghost" size="sm" onClick={() => removeFile(i)}>X</Button>
        </div>
      ))}
    </div>
  )}

  {/* Upload button */}
  <Button
    onClick={handleUpload}
    disabled={!selectedClientId || !selectedFolderId || files.length === 0 || uploading}
  >
    {uploading ? t('docs.uploading') : t('docs.uploadButton')}
  </Button>
</div>
```

**Event handlers**:
- `handleFileSelect(e)` / `handleDrop(e)`: append files to state
- `removeFile(index)`: remove file from array
- `handleUpload()`: loop through files, call `uploadDocument.mutateAsync({ firmId, clientId, folderId, folderName, file, sensitivity })` for each. Uses `Promise.allSettled` with concurrency of 3. Shows toast on completion.

**File type icon mapping** (local helper):
```typescript
function getFileIcon(filename: string): LucideIcon {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return FileText;
    case 'doc': case 'docx': return FileText;
    case 'xls': case 'xlsx': return FileSpreadsheet;
    case 'jpg': case 'jpeg': case 'png': return Image;
    default: return File;
  }
}
```

---

## 6. Route Integration

### Changes to `src/App.tsx`

**Line 28** — Add import:
```typescript
import { BackupView } from '@/components/backup/BackupView';
```

**Line 88** — Replace:
```typescript
// Before:
<Route path="backup" element={<SectionPlaceholder section="backup" />} />
// After:
<Route path="backup" element={<BackupView />} />
```

No sidebar changes needed — the `/backup` link with `HardDrive` icon is already in `Sidebar.tsx`.

---

## 7. i18n Integration

New keys will be added under sections: `backup.*`, `import.*`, `export.*`, `docs.*`.

All keys listed in the requirements document section 6 must be added to all three files:
- `src/i18n/he.ts` — Hebrew (primary, values from requirements doc)
- `src/i18n/ar.ts` — Arabic translations
- `src/i18n/en.ts` — English translations

Key structure confirms the `section.descriptiveKey` convention. No new sections need to be registered — the translation function does simple key lookup.

Additional i18n keys needed for foreign-firm restore warning (add to all 3 language files):
```
backup.foreignFirmWarning: 'הגיבוי שייך למשרד אחר ({firmName}). הנתונים יובאו למשרד הנוכחי.'
backup.foreignFirmConfirm: 'אני מבין — ייבא נתונים ממשרד אחר'
```

---

## 8. File Creation Order

Dependencies flow: types -> services -> hooks -> components -> route integration -> i18n.

| Order | File | Depends On |
|-------|------|-----------|
| 1 | `src/types/backup.ts` | Existing types only |
| 2 | Update `src/types/index.ts` | backup.ts |
| 3 | `src/services/backupService.ts` | types/backup |
| 4 | `src/services/importService.ts` | types/backup, lib/validation |
| 5 | `src/services/exportService.ts` | types/backup, lib/money |
| 6 | `src/hooks/useBackup.ts` | backupService, importService, useClients, useDocuments |
| 7 | `src/components/backup/BackupCard.tsx` | useBackup hooks |
| 8 | `src/components/backup/RestoreCard.tsx` | useBackup hooks, ConfirmDialog |
| 9 | `src/components/backup/StorageInfo.tsx` | useBackup hooks |
| 10 | `src/components/backup/ImportPanel.tsx` | importService, useBackup, useClients, DataTable |
| 11 | `src/components/backup/ExportPanel.tsx` | exportService, useClients |
| 12 | `src/components/backup/DocsImportPanel.tsx` | useDocuments, useClients |
| 13 | `src/components/backup/BackupView.tsx` | All sub-components |
| 14 | Update `src/App.tsx` | BackupView |
| 15 | Update `src/i18n/he.ts` | N/A |
| 16 | Update `src/i18n/ar.ts` | N/A |
| 17 | Update `src/i18n/en.ts` | N/A |

Steps 15-17 (i18n) can be done in parallel with component creation, or as a batch at the end. Recommend batch at the end to avoid merge conflicts.

**npm dependency**: `npm install xlsx` must be run before implementing ImportPanel (step 10).

---

## 9. Edge Cases & Error Handling

### Backup

| Edge Case | Handling |
|-----------|----------|
| Empty firm (no data) | Returns valid BackupData with empty arrays. Button still works. |
| Very large firm (1000+ clients) | All data fetched with parallel `Promise.all`. JSON serialization handles it. No pagination needed per Q3 decision. |
| Supabase query fails mid-backup | Error thrown on first failure. No partial backup downloaded — user sees toast error. |
| Network disconnect during backup | Standard fetch error propagated to mutation's `onError`. |

### Restore

| Edge Case | Handling |
|-----------|----------|
| Invalid JSON file | Parse error caught in RestoreCard's `onFileChange`, displayed as `parseError`. |
| Wrong version (newer than app) | Rejected with error message before any inserts. |
| Duplicate primary keys (id) | `ON CONFLICT (id) DO NOTHING` — silently skipped, counted in `skipped`. |
| Duplicate case_num on new id | Unique constraint violation caught, reported in `errors` array. |
| Duplicate invoice_num on new id | Same handling as case_num. |
| Backup from different firm | `foreignFirmWarning` flag set in RestoreCard. User sees prominent destructive warning dialog with firm name. Must explicitly confirm. On proceed, `firm_id` overwritten to current firm for all firm-scoped rows. |
| audit_log in backup | Skipped entirely during restore (table is immutable). |
| Partial restore failure | Each table is processed independently. Failures on one table don't block others. Full result reported. |

### Import

| Edge Case | Handling |
|-----------|----------|
| Empty file | `parseCsvText` returns []. Step stays at 'upload' with no-op. |
| No header row | Returns [] (requires at least 2 rows). |
| Unrecognized headers | Headers not in HEADER_MAP are ignored. If no `name` column is mapped, all rows fail validation with 'missingName'. |
| Duplicate client name | Detected by comparing against `existingNames` Set (lowercase). Marked as `isDuplicate: true` in preview. |
| BOM in CSV | Stripped by `parseCsvText`. |
| Hebrew characters in CSV | UTF-8 encoding assumed (standard for modern files). |
| monthlyFee as "1,500" (comma separator) | Validation catches `isNaN(Number("1,500"))` and marks as 'invalidFee'. User must use plain number format. |
| Excel file with multiple sheets | Only first sheet (`SheetNames[0]`) is processed. |
| Very large file (10,000+ rows) | Parsing happens client-side. No hard limit, but UI may lag. Consider warning if > 1000 rows. |

### Export

| Edge Case | Handling |
|-----------|----------|
| No clients match filter | Empty CSV/JSON downloaded (headers only for CSV). |
| Special characters in CSV values | `csvEscape` wraps in quotes and escapes internal quotes. |
| monthlyFee = 0 | Exported as 0 (agorotToShekel(0) = 0). |

### DocsImportPanel

| Edge Case | Handling |
|-----------|----------|
| No client selected | Upload button disabled. |
| No folder selected | Upload button disabled. |
| File too large (> 10MB) | Supabase Storage will reject. Error caught by `useUploadDocument`'s `onError`. |
| Upload partial failure | `Promise.allSettled` ensures all files are attempted. Individual failures show per-file toast. |

---

## 10. Data Flow Diagrams

### Backup Flow

```
User clicks "Download Backup"
  |
  v
useCreateBackup.mutate()
  |
  v
backupService.createBackup(firmId, firmName)
  |
  v
Promise.all([
  supabase.from('clients').select('*').eq('firm_id',...).is('deleted_at', null),
  supabase.from('staff').select('*')...,
  supabase.from('filings').select('*')...,
  ... (19 parallel queries)
])
  |
  v
Assemble BackupData { version, createdAt, firmId, firmName, data: {...} }
  |
  v
JSON.stringify -> Blob -> download as .bak file
  |
  v
toast.success("backup.downloaded")
```

### Restore Flow

```
User selects .bak/.json file
  |
  v
FileReader.readAsText -> JSON.parse -> validate version + structure
  |
  v
parsedBackup stored in state, metadata displayed
  |
  v
User clicks "Restore" -> ConfirmDialog opens
  |
  v
User confirms -> useRestoreBackup.mutate(parsedBackup)
  |
  v
backupService.restoreBackup(firmId, backup)
  |
  v
For each table in dependency order:
  ├── Override firm_id to current firm
  ├── supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
  ├── Count inserted vs skipped
  └── Catch errors per table
  |
  v
Return RestoreResult { inserted, skipped, errors }
  |
  v
queryClient.invalidateQueries() -> toast result
```

### Import Flow

```
User drops/selects CSV/XLSX/JSON file
  |
  v
Detect format by extension:
  ├── .csv  -> importService.parseCSV(file)
  ├── .xlsx/.xls -> importService.parseExcel(file)  [lazy-loads xlsx]
  └── .json -> importService.parseJSON(file)
  |
  v
ImportRow[] returned
  |
  v
importService.validateRows(rows, existingClientNames)
  |
  v
ImportRowResult[] with valid/invalid/duplicate flags
  |
  v
Display in DataTable preview (step: 'preview')
  |
  v
User clicks "Import N clients"
  |
  v
useImportClients.mutate(validRows)
  |
  v
importService.importClients(firmId, validRows)
  |
  v
For each valid row:
  ├── Map to CreateClientInput (shekel -> agorot, resolve types)
  ├── supabase.from('clients').insert({...}).select('id')
  ├── On success: create default document folders
  └── On error: record in errors array
  |
  v
Return ImportResult { total, imported, skipped, errors }
  |
  v
Invalidate client + document + backup caches
  |
  v
Display success (step: 'done')
```

### Export Flow

```
User selects fields, format, status filter -> clicks "Export"
  |
  v
exportService.exportClients(clients, fields, format, statusFilter, t)
  |
  v
Filter clients by status
  |
  v
Format = 'csv':                         Format = 'json':
  ├── Build header row (translated)        ├── Map clients to field objects
  ├── Map clients to CSV rows              ├── JSON.stringify with indent
  ├── Join with BOM prefix                 └── downloadFile('clients.json')
  └── downloadFile('clients.csv')
  |
  v
toast.success("export.exported")

--- Filings/Tasks export ---

User clicks "Export Filings" / "Export Tasks"
  |
  v
exportService.exportFilings(firmId, t) / exportService.exportTasks(firmId, t)
  |
  v
supabase.from('filings'/'tasks').select('*').eq('firm_id',...).is('deleted_at', null)
  |
  v
Build CSV with BOM -> downloadFile()
  |
  v
toast.success()
```

---

## 11. Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| `xlsx` package ~1.5MB | Lazy-loaded via `import('xlsx')` only when user selects an Excel file. Not in main bundle. |
| Backup with 19 parallel queries | All queries run with `Promise.all` for speed. Each query is scoped by `firm_id` and uses RLS indexes. |
| Large backup JSON serialization | `JSON.stringify` is synchronous and may block UI for very large data. For most firms (< 1000 clients) this is sub-second. No mitigation needed per Q3 decision. |
| Import of many clients (sequential inserts) | Each client is inserted individually (needed for trigger + error isolation). Could batch with `insert([...])` but would lose per-row error reporting. |
| Export with all fields selected | Client data is already in memory from `useClients` hook. CSV/JSON generation is pure computation, fast. |

---

## 12. Self-Critique

1. **Sequential client import**: Inserting clients one-by-one is slower than a batch insert. The tradeoff is per-row error reporting and per-client folder creation. For typical imports (< 500 rows), this is acceptable. If performance becomes an issue, we could batch inserts and create folders in a separate pass, at the cost of more complex error handling.

2. **Backup size has no upper bound**: The Q3 decision was to download everything at once. For extremely large firms, this could create multi-MB JSON files that are slow to serialize and parse. A future enhancement could add streaming or pagination, but this adds significant complexity.

3. **Restore overwrites firm_id**: When restoring a backup from a different firm, all `firm_id` values are replaced with the current firm. This means the data effectively "belongs" to the current firm after restore. This is intentional for the merge-restore use case but could be surprising. The ConfirmDialog warning mitigates this.

4. **Junction tables are now explicitly scoped**: During backup, `fetchJunction` fetches firm parent IDs first and filters with `.in()`. During restore, junction tables use composite business keys (`client_id,staff_id` and `staff_id,role_id`) for upsert conflict resolution. This prevents both cross-tenant leakage and duplicate logical entries.

5. **Foreign-firm restore requires explicit confirmation**: When a user loads a backup from a different firm, a prominent destructive warning dialog explains the implications. The user must explicitly confirm before restore proceeds. The `firm_id` on all records is overwritten to the current firm.

6. **No backup encryption**: Backup files are plain JSON. Sensitive data (client names, tax IDs, email addresses) is exported in cleartext. For a production system, consider offering optional password-based encryption. Not in scope for v1.

6. **CSV parsing is simple**: The custom CSV parser handles basic quoting but doesn't cover all RFC 4180 edge cases (e.g., newlines within quoted fields). For most practical import files, this is sufficient. The xlsx library handles Excel complexity.

7. **No progress indicator for long operations**: Backup creation and import don't report progress during execution. The user sees only "loading" state. For typical data sizes, this is fast enough. A future enhancement could use Supabase realtime or chunked processing for progress.
