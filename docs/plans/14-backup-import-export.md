# Backup & Import/Export Module

Backup/restore, CSV/Excel/JSON client import, and data export.

**Branch:** `migration/backup-module`
**Prerequisites:** Phase 3 (Clients) merged to main (for import target). Ideally all phases merged (for complete backup).

## Context

- Read legacy-app.html lines 2290-2381 for BackupView
- Read lines 3127-3566 for Import/Export panels
- Backup format: JSON with version number and all data tables
- Import supports CSV, Excel (XLSX), JSON with intelligent header mapping (Hebrew/English)
- Export supports CSV and JSON with field selection
- firm_id scoping on ALL queries
- Hebrew primary — all strings use t()
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code

## Existing Shared Code

Import these, DO NOT recreate:
- Types from all modules
- Constants: DEFAULT_FOLDERS, CLIENT_TYPES
- Utils: formatDate, formatMoney
- Components: PageHeader, DataTable, EmptyState, LoadingSpinner, FormField, ConfirmDialog

## Features to Implement

1. **BackupView** — Two-section layout:
   - Left: backup + restore cards
   - Right: storage info
   - Bottom: import/export tabs

2. **BackupCard**:
   - Download backup button
   - Shows estimated size, client count, staff count
   - Downloads as .json file with all data + version number

3. **RestoreCard**:
   - File picker (.json, .bak)
   - Merge behavior: existing data preserved, new data added
   - Validation: version check, data integrity
   - Preview before restore

4. **StorageInfo**:
   - Usage metrics: clients, staff, hours logged, invoices, documents
   - Visual progress bars

5. **ImportPanel** — Client import:
   - Drag-and-drop or click file select
   - Supported: CSV, XLSX/XLS, JSON
   - Intelligent header mapping:
     - Hebrew headers: שם → name, מספר עוסק → taxId, תיק → caseNum, etc.
     - English headers: name, taxId, email, phone, etc.
   - Preview table before import
   - Duplicate detection (by name)
   - Error reporting per row
   - Auto-generates caseNum if missing ("IMP-" + suffix)
   - Creates default folders for new clients
   - Template download button (CSV with example rows)

6. **ExportPanel** — Data export:
   - Field selection checkboxes
   - Preset selection (default fields)
   - Filter by status (all/active/archived)
   - Export formats: CSV (Excel-compatible), JSON
   - Additional exports: filings CSV, tasks CSV

7. **DocsImportPanel** — Document import:
   - Client picker, folder picker
   - Drag-and-drop file upload (multiple)
   - File type icons by extension
   - Sensitivity selector
   - Size display (auto-format KB/MB)

8. **Services**:
   - backupService: createBackup(firmId), restoreBackup(firmId, data)
   - importService: parseCSV(file), parseExcel(file), parseJSON(file), importClients(firmId, rows), mapHeaders(headers)
   - exportService: exportClients(firmId, fields, format, statusFilter), exportFilings(firmId), exportTasks(firmId)

9. **Dependencies**: Consider adding `xlsx` package for Excel parsing

10. **Route** — Add /backup route (also handles import/export)

11. Add i18n keys (backup.*, import.*, export.* sections) to all 3 language files.

### Files to Create

- `src/components/backup/BackupView.tsx` — Backup/restore hub
- `src/components/backup/BackupCard.tsx` — Download backup
- `src/components/backup/RestoreCard.tsx` — Upload and restore backup
- `src/components/backup/StorageInfo.tsx` — Storage usage display
- `src/components/backup/ImportPanel.tsx` — CSV/Excel/JSON import
- `src/components/backup/ExportPanel.tsx` — Data export with field selection
- `src/components/backup/DocsImportPanel.tsx` — Document file import
- `src/services/backupService.ts` — Backup/restore logic
- `src/services/importService.ts` — CSV/Excel parsing and import
- `src/services/exportService.ts` — Data export
- `src/hooks/useBackup.ts` — React Query hooks
