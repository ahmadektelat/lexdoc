# Backup & Import/Export Module — Requirements Document

> Prepared: 2026-03-24 | Branch: `migration/backup-module`

---

## 1. Feature Summary

The Backup & Import/Export module provides three core capabilities for firm data management:

1. **Backup & Restore** — Download a JSON backup of all firm data (clients, staff, filings, billing, invoices, hours, contacts, interactions, tasks, documents metadata, messages). Restore from a `.bak`/`.json` file with merge semantics (existing data preserved, new data added).

2. **Client Import** — Import clients from CSV, Excel (XLSX/XLS), or JSON files with intelligent Hebrew/English header mapping, duplicate detection (by name), row-level error reporting, and preview before import. Auto-generates `caseNum` and default document folders for new clients.

3. **Data Export** — Export clients with field selection, status filtering, and format choice (CSV/JSON). Also export filings and tasks as CSV.

4. **Document Import** — Upload document files to a specific client + folder via drag-and-drop, with file type icons, sensitivity selection, and size display.

The module replaces the `SectionPlaceholder` at the `/backup` route.

---

## 2. Existing Codebase Patterns

### Service Pattern (`src/services/`)
Services are exported as singleton objects (e.g., `export const auditService = { ... }`). Each service:
- Imports `supabase` from `@/integrations/supabase/client`
- Imports relevant types from `@/types`
- Contains a `rowToX()` function to map snake_case DB rows to camelCase TS types
- Contains `inputToRow()` functions for mapping input to DB columns
- All queries filter by `firm_id` and `.is('deleted_at', null)`
- Throws `new Error(error.message)` on Supabase errors

**Reference**: `src/services/auditService.ts`, `src/services/clientService.ts`, `src/services/reportService.ts`

### Hook Pattern (`src/hooks/`)
Hooks follow a consistent pattern:
- Export a `xKeys` object for React Query cache key factory
- Use `useQuery` for reads, `useMutation` for writes
- Get `firmId` from `useAuthStore((s) => s.firmId)`
- Set `enabled: !!firmId` on queries
- Use `queryClient.invalidateQueries()` in mutation `onSuccess`
- Use `toast()` from `sonner` for success/error notifications
- Use `useLanguage()` for translated messages

**Reference**: `src/hooks/useClients.ts`, `src/hooks/useAudit.ts`, `src/hooks/useReports.ts`

### Component Pattern (`src/components/<module>/`)
View components follow this structure:
- Import `useLanguage()` for `t()` translations
- Import `useAuthStore` for permission checks (`can()`)
- Use `<Navigate to="/dashboard" />` for unauthorized access
- Use `<PageHeader>` for title + description
- Use `<LoadingSpinner>` for loading states
- Use `<EmptyState>` for empty lists
- Use `<DataTable>` for tabular data with `@tanstack/react-table` ColumnDef
- Use shadcn `<Tabs>`, `<Select>`, `<Button>`, `<Badge>` components
- Class: `"p-6 animate-fade-in"` wrapper div
- Permission format: `'settings.backup'` or `'backup.view'` (follows `module.action` convention)

**Reference**: `src/components/audit/AuditView.tsx`, `src/components/reports/ReportsView.tsx`

### Route Pattern (`src/App.tsx`)
- Routes are defined inside a `<Route element={<AppShell />}>` parent
- Each module has a flat route: `<Route path="moduleName" element={<ModuleView />} />`
- Import the view component at the top of `App.tsx`
- Currently: `<Route path="backup" element={<SectionPlaceholder section="backup" />} />` (line 88)
- Sidebar already has the `/backup` link with `HardDrive` icon (line 38 of Sidebar.tsx)

### i18n Pattern (`src/i18n/`)
- Three files: `he.ts`, `ar.ts`, `en.ts`
- All export `Record<string, string>`
- Keys follow `section.descriptiveKey` convention
- Currently only `nav.backup` exists; no `backup.*` section yet

### Type Pattern (`src/types/`)
- Each module has its own file: `client.ts`, `billing.ts`, etc.
- Barrel export from `index.ts`
- Interfaces use camelCase; DB columns use snake_case (mapping in services)
- `Omit<>` used for `CreateXInput` and `UpdateXInput` types

---

## 3. Shared Code to Reuse

### Types (import from `@/types`)
| Type | Usage |
|------|-------|
| `Client`, `CreateClientInput` | Import target for client import; backup data structure |
| `Staff` | Backup data, storage info counts |
| `Filing` | Backup data, export filings |
| `BillingEntry`, `HoursEntry`, `Invoice` | Backup data, storage info counts |
| `Task` | Backup data, export tasks |
| `Contact`, `Interaction` | Backup data |
| `LegalDocument`, `DocumentFolder`, `DocumentSensitivity` | Backup data, DocsImportPanel |
| `MessageTemplate`, `Message`, `ScheduledMessage` | Backup data |
| `AuditEntry` | Backup data (read-only, cannot restore) |
| `PaginatedResult` | If backup listing is paginated |

### Shared Components (import from `@/components/shared/`)
| Component | Usage |
|-----------|-------|
| `PageHeader` | Main BackupView page header |
| `DataTable` | Preview table for import, potentially export field list |
| `EmptyState` | When no backup exists or import list is empty |
| `LoadingSpinner` | During backup creation, import parsing, export generation |
| `ConfirmDialog` | Confirm before restore; confirm before import |
| `FormField` | Any form inputs (sensitivity select in DocsImportPanel) |
| `SearchInput` | Search within import preview (optional) |

### Utilities (import from `@/lib/`)
| Utility | Path | Usage |
|---------|------|-------|
| `formatFileSize()` | `@/lib/format` | Display backup size, file sizes in DocsImportPanel |
| `sanitizePath()` | `@/lib/format` | Sanitize file paths in DocsImportPanel |
| `formatDate()`, `formatDateTime()` | `@/lib/dates` | Date formatting in backup metadata, export |
| `formatMoney()` | `@/lib/money` | Format monthlyFee in export |
| `cn()` | `@/lib/utils` | Classname merging |
| `validateEmail()`, `validatePhone()`, `validateTaxId()` | `@/lib/validation` | Validate imported client rows |
| `CLIENT_TYPES` | `@/lib/constants` | Validate client type during import |

### Existing Hooks (import from `@/hooks/`)
| Hook | Usage |
|------|-------|
| `useClients` | Fetch client list for duplicate detection, export, storage counts |
| `useStaff` | Fetch staff for storage counts, backup |
| `useDocuments` (`useEnsureDefaultFolders`, `useUploadDocument`) | DocsImportPanel, create default folders for imported clients |
| `useTasks` | Export tasks |

### Existing Services (import from `@/services/`)
| Service | Usage |
|---------|-------|
| `clientService` | Bulk read clients for backup/export, insert for import |
| `documentService` | Document upload in DocsImportPanel |

### UI Components (import from `@/components/ui/`)
| Component | Usage |
|-----------|-------|
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Import/Export/Docs tab navigation |
| `Button` | Action buttons |
| `Badge` | Status indicators |
| `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` | Format picker, status filter, sensitivity picker |
| `Checkbox` | Field selection in export |
| `Progress` | Storage usage bars |

---

## 4. Database Tables

The backup service will need to query **all** firm-scoped data tables. No new tables are needed.

| Table | Module | Notes |
|-------|--------|-------|
| `clients` | Clients | Primary import/export target |
| `client_staff` | Clients | Junction table — backup/restore |
| `staff` | Staff | Backup, storage counts |
| `contacts` | CRM | Backup |
| `interactions` | CRM | Backup |
| `tasks` | CRM | Backup, task export |
| `filings` | Filings | Backup, filing export |
| `filing_settings` | Filings | Backup |
| `invoices` | Billing | Backup, storage counts |
| `billing_entries` | Billing | Backup |
| `hours_log` | Billing | Backup, storage counts |
| `document_folders` | Documents | Backup |
| `documents` | Documents | Backup (metadata only, not file blobs) |
| `message_templates` | Messaging | Backup |
| `messages` | Messaging | Backup |
| `scheduled_messages` | Messaging | Backup |
| `audit_log` | Audit | **Read-only** — include in backup but **cannot restore** (immutable, DELETE policy uses `false`) |
| `roles` | Permissions | Backup |
| `staff_roles` | Permissions | Backup |

### Important DB Constraints for Import/Restore
- `clients.case_num` has a `UNIQUE(firm_id, case_num)` constraint + auto-generation trigger
- `invoices.invoice_num` has a `UNIQUE(firm_id, invoice_num)` constraint
- `document_folders` has a `UNIQUE(firm_id, client_id, name)` constraint
- `message_templates` has a unique partial index on `(firm_id, topic)` for defaults
- `audit_log` has `DELETE USING (false)` and `UPDATE USING (false)` — fully immutable
- All entity tables (except audit_log) use soft delete via `deleted_at`
- All tables use `firm_id IN (SELECT user_firm_ids())` RLS policies

---

## 5. New Files to Create

### Components (`src/components/backup/`)
| File | Purpose |
|------|---------|
| `BackupView.tsx` | Main view — tab layout with Backup/Restore, Import, Export, Documents tabs |
| `BackupCard.tsx` | Download backup button, estimated size, counts |
| `RestoreCard.tsx` | File upload, validation, preview, merge restore |
| `StorageInfo.tsx` | Usage metrics with progress bars (clients, staff, hours, invoices) |
| `ImportPanel.tsx` | Drag-and-drop file upload, CSV/XLSX/JSON parsing, header mapping, preview, import |
| `ExportPanel.tsx` | Field selection, format picker, status filter, export clients/filings/tasks |
| `DocsImportPanel.tsx` | Client/folder picker, drag-and-drop file upload, sensitivity selection |

### Services (`src/services/`)
| File | Purpose |
|------|---------|
| `backupService.ts` | `createBackup(firmId)` — fetches all tables; `restoreBackup(firmId, data)` — merges data |
| `importService.ts` | `parseCSV(file)`, `parseExcel(file)`, `parseJSON(file)`, `mapHeaders(headers)`, `importClients(firmId, rows)` |
| `exportService.ts` | `exportClients(firmId, fields, format, statusFilter)`, `exportFilings(firmId)`, `exportTasks(firmId)` |

### Hooks (`src/hooks/`)
| File | Purpose |
|------|---------|
| `useBackup.ts` | `backupKeys`, `useBackupStats()` (for StorageInfo counts), `useCreateBackup()`, `useRestoreBackup()`, `useImportClients()` |

### Types (`src/types/`)
| File | Purpose |
|------|---------|
| `backup.ts` | `BackupData` interface (full backup structure with version), `ImportRow`, `ImportResult`, `ExportField` types |

---

## 6. i18n Keys Needed

New sections: `backup`, `import`, `export`

### Hebrew (`he.ts`) — Primary
```
backup.title: 'גיבוי ושחזור'
backup.description: 'גיבוי, שחזור, ייבוא וייצוא נתוני המשרד'
backup.downloadBackup: 'הורד גיבוי (.BAK)'
backup.creating: 'יוצר גיבוי...'
backup.estimatedSize: 'גודל משוער'
backup.clientCount: 'לקוחות'
backup.staffCount: 'עובדים'
backup.backupData: 'גיבוי נתונים'
backup.backupDesc: 'יוצר קובץ .BAK עם כל הנתונים: לקוחות, שעות, חשבוניות, הגשות'
backup.restore: 'שחזור נתונים'
backup.restoreDesc: 'טעינת קובץ .BAK לשחזור נתונים. נתונים קיימים יתאחדו עם הגיבוי'
backup.restoreWarning: 'שים לב: שחזור ימזג נתונים. מומלץ לגבות לפני שחזור.'
backup.loadFile: 'טען קובץ גיבוי (.BAK)'
backup.restoring: 'משחזר...'
backup.restoreSuccess: 'שחזור הושלם בהצלחה'
backup.restoreFailed: 'שחזור נכשל — קובץ לא תקין או גרסה ישנה'
backup.fileError: 'שגיאה בקריאת הקובץ'
backup.storageTitle: 'אחסון ונפח'
backup.hoursLogged: 'שעות רשומות'
backup.invoices: 'חשבוניות'
backup.records: 'רשומות'
backup.active: 'פעיל'
backup.usageLabel: 'נפח שימוש'
backup.tabBackup: 'גיבוי ושחזור'
backup.tabImport: 'ייבוא'
backup.tabExport: 'ייצוא'
backup.tabDocs: 'מסמכים'
backup.downloaded: 'גיבוי הורד'

import.title: 'ייבוא לקוחות'
import.dragDrop: 'גרור קובץ Excel / CSV לכאן'
import.clickSelect: 'או לחץ לבחירת קובץ'
import.supported: 'נתמך: CSV, Excel (XLSX/XLS), JSON'
import.instructions: 'הוראות ייבוא'
import.headerRow: 'שורה ראשונה: כותרות עמודות (בעברית / אנגלית)'
import.requiredField: 'שדה חובה: שם לקוח / חברה'
import.taxIdFormat: 'מספר עוסק: 9 ספרות (עוסק מורשה / ח"פ)'
import.feeFormat: 'שכ"ט: מספר בשקלים (ללא סימן ₪)'
import.noDuplicates: 'לקוחות קיימים (אותו שם) לא יובאו פעמיים'
import.downloadTemplate: 'הורד תבנית CSV לדוגמה'
import.preview: 'תצוגה מקדימה'
import.rows: 'שורות'
import.errors: 'שגיאות'
import.importButton: 'ייבא {count} לקוחות'
import.cancel: 'ביטול'
import.done: 'הייבוא הושלם!'
import.doneDesc: 'יובאו {count} לקוחות חדשים למערכת'
import.importMore: 'ייבוא נוסף'
import.noData: 'לא נמצאו נתונים קריאים בקובץ'
import.missingName: 'חסר שם לקוח'
import.duplicate: 'קיים'
import.supportedFields: 'שדות נתמכים לייבוא'
import.requiredIndicator: 'שדה חובה'
import.imported: 'יובאו {count} לקוחות'

export.title: 'ייצוא נתונים'
export.selectFields: 'בחר שדות לייצוא'
export.settings: 'הגדרות ייצוא'
export.format: 'פורמט'
export.filterStatus: 'סינון לפי סטטוס'
export.allClients: 'הכל'
export.activeOnly: 'פעילים'
export.archivedOnly: 'ארכיון'
export.clientsToExport: '{count} לקוחות ייצאו'
export.fieldsSelected: '{count} שדות נבחרו'
export.exportButton: 'ייצא {count} לקוחות'
export.additionalExports: 'ייצוא נוסף'
export.exportFilings: 'ייצוא הגשות'
export.exportTasks: 'ייצוא משימות'
export.exported: 'ייוצאו {count} לקוחות'
export.filingsExported: 'הגשות יויצאו'
export.tasksExported: 'משימות יויצאו'
export.csvExcel: 'CSV (Excel)'
export.json: 'JSON'

// Client field labels for import/export
export.field.name: 'שם לקוח'
export.field.taxId: 'מספר עוסק'
export.field.caseNum: 'מספר תיק'
export.field.email: 'דואר אלקטרוני'
export.field.phone: 'טלפון'
export.field.mobile: 'נייד'
export.field.address: 'כתובת'
export.field.city: 'עיר'
export.field.type: 'סוג ישות'
export.field.clientType: 'סיווג מס'
export.field.monthlyFee: 'שכ-ט חודשי'
export.field.status: 'סטטוס'
export.field.billingDay: 'יום חיוב'
export.field.tags: 'תגיות'
export.field.notes: 'הערות'
export.field.updatedAt: 'עדכון אחרון'

docs.importTitle: 'העלאת מסמכים'
docs.selectClient: 'בחר לקוח'
docs.selectFolder: 'בחר תיקייה'
docs.sensitivity: 'רגישות'
docs.dragFiles: 'גרור קבצים לכאן'
docs.uploadButton: 'העלה קבצים'
docs.uploading: 'מעלה...'
```

### Arabic (`ar.ts`) and English (`en.ts`)
Equivalent keys must be added with Arabic and English translations respectively. All keys above need corresponding entries in all three files.

---

## 7. Route Integration

### Current State
- `src/App.tsx` line 88: `<Route path="backup" element={<SectionPlaceholder section="backup" />} />`
- Sidebar already renders the `/backup` link with `HardDrive` icon (`src/components/layout/Sidebar.tsx` line 38)

### Changes Required
1. In `src/App.tsx`:
   - Add import: `import { BackupView } from '@/components/backup/BackupView';`
   - Replace line 88: `<Route path="backup" element={<BackupView />} />`
   - Remove `SectionPlaceholder` if no other routes use it (currently `settings` also uses it, so keep it)

2. No sidebar changes needed — navigation is already wired.

3. Permission check: `can('settings.backup')` — follow the pattern from AuditView which uses `can('settings.audit')`. Both backup and audit are under the `settings` permission group.

---

## 8. Dependencies

### New npm Package Required
| Package | Version | Purpose |
|---------|---------|---------|
| `xlsx` | `^0.18.5` | Parse XLSX/XLS files for client import. The legacy app loaded SheetJS from CDN; the new app should use the npm package. |

**Note**: `xlsx` is NOT currently in `package.json`. It must be installed:
```bash
npm install xlsx
```

### Existing Dependencies (already installed)
- `@tanstack/react-query` — for hooks
- `@tanstack/react-table` — for DataTable (import preview)
- `lucide-react` — for icons (HardDrive, Upload, Download, FileSpreadsheet, etc.)
- `sonner` — for toast notifications
- `zod` — for backup data validation (version check, schema validation)
- `date-fns` — date formatting

---

## 9. Open Questions

### Q1: Backup Scope — Include audit_log?
The audit_log is immutable (no UPDATE/DELETE policies). Should the backup include audit_log entries for archival purposes? If yes, they should be **read-only in the backup** and **skipped during restore** (since the INSERT policy requires `user_id = auth.uid()` which won't match historical entries).

**Recommendation**: Include in backup for archival, skip on restore.

### Q2: Restore Strategy — Merge vs Replace
The legacy app used merge semantics (existing data preserved, new records added). This is safe but may cause issues with:
- Duplicate `case_num` if the backup has conflicting values
- Duplicate `invoice_num` if restoring billing data

**Recommendation**: Use upsert (INSERT ON CONFLICT DO NOTHING) for restore, skipping records with conflicting unique constraints. Report skipped records to the user.

### Q3: Backup Size Limits
For large firms (1000+ clients, years of filings), the backup JSON could be very large. Should we:
A) Download everything at once (simplest)
B) Stream/paginate the backup
C) Limit backup to active (non-deleted) records only

**Recommendation**: Option A for now (most firms are small), but only include non-deleted records (option C behavior). Add a warning if estimated size > 10MB.

### Q4: Import — Excel Library Size
The `xlsx` package is ~1.5MB gzipped. Should we:
A) Include it as a regular dependency (simplest, always available)
B) Lazy-load it only when the user clicks import (better bundle size)

**Recommendation**: Option B — dynamic `import('xlsx')` to keep the main bundle small.

### Q5: Permission Key
What permission key should control backup access? Options:
A) `settings.backup` (matches `settings.audit` pattern)
B) `backup.view` / `backup.create` / `backup.restore` (more granular)

**Recommendation**: Option A for now (`settings.backup`), with a single permission that covers all backup operations.

### Q6: DocsImportPanel — Reuse Existing Upload?
The `documentService.upload()` and `useUploadDocument()` hook already exist. Should DocsImportPanel reuse them directly, or create a new bulk upload wrapper?

**Recommendation**: Reuse existing `useUploadDocument()` hook, calling it once per file in sequence (or with `Promise.all` for parallel uploads with a concurrency limit).

### Q7: Backup Version Schema
The legacy app used a version number in the backup. What version format should we use?

**Recommendation**: Semantic version string (e.g., `"1.0.0"`) in the backup JSON. Include a `version` field and a `createdAt` timestamp. Reject restore if the backup version is newer than the app version.
