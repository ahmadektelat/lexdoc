# Feature Summary: Backup & Import/Export Module

## What Was Built

Complete backup, import/export module for the LexDoc law/accounting firm management application. The module provides four capabilities:

1. **Backup & Restore** — Download a JSON backup of all 19 firm-scoped tables. Restore with merge semantics (upsert with ON CONFLICT DO NOTHING). Includes foreign-firm detection with explicit confirmation.

2. **Client Import** — Import clients from CSV, Excel (XLSX/XLS), or JSON files. Intelligent Hebrew/English header mapping, duplicate detection by name, per-row validation, preview before import. Auto-generates caseNum and default document folders.

3. **Data Export** — Export clients with field selection, status filtering, and format choice (CSV/JSON). Also export filings and tasks as CSV.

4. **Document Import** — Bulk upload documents to a specific client + folder with sensitivity selection.

## Files Created (14)

| File | Purpose |
|------|---------|
| `src/types/backup.ts` | BackupData, ImportRow, ImportResult, ExportField, BackupStats, RestoreResult types |
| `src/services/backupService.ts` | createBackup (parallel 19-table fetch), restoreBackup (dependency-ordered upsert), getStats |
| `src/services/importService.ts` | parseCSV, parseExcel (lazy xlsx), parseJSON, validateRows, importClients, generateImportTemplate |
| `src/services/exportService.ts` | exportClients (CSV/JSON), exportFilings, exportTasks |
| `src/hooks/useBackup.ts` | useBackupStats, useCreateBackup, useRestoreBackup, useImportClients with audit logging |
| `src/components/backup/BackupView.tsx` | Main tabbed view with permission gate |
| `src/components/backup/BackupCard.tsx` | Download backup with PII warning dialog |
| `src/components/backup/RestoreCard.tsx` | File upload, parse, foreign-firm detection, confirm restore |
| `src/components/backup/StorageInfo.tsx` | Usage metrics with progress bars |
| `src/components/backup/ImportPanel.tsx` | Multi-step import: drag-drop → parse → preview → import |
| `src/components/backup/ExportPanel.tsx` | Field selection, format/status filters, export buttons |
| `src/components/backup/DocsImportPanel.tsx` | Client/folder picker, drag-drop, batch upload |

## Files Modified (7)

| File | Change |
|------|--------|
| `src/types/index.ts` | Added barrel export for backup types |
| `src/App.tsx` | Replaced SectionPlaceholder with BackupView for /backup route |
| `src/i18n/he.ts` | ~90 new keys (backup, import, export, docs sections) |
| `src/i18n/ar.ts` | ~90 new keys (Arabic translations) |
| `src/i18n/en.ts` | ~90 new keys (English translations) |
| `package.json` | Added xlsx dependency |
| `package-lock.json` | Updated lockfile |

## Security Measures

- All queries scoped by firm_id (defense-in-depth beyond RLS)
- Junction tables scoped via parent ID lookups (not just RLS)
- Foreign-firm restore detection with explicit confirmation dialog
- PII warning before backup download
- File size limits: 50MB restore, 10MB import
- Audit logging on all operations (backup_created, backup_restored, clients_imported, data_exported)
- firm_id overwritten on restore to prevent cross-firm data leakage
- xlsx lazy-loaded via dynamic import (429KB code-split chunk)

## Review Results

| Reviewer | Verdict |
|----------|---------|
| Devil's Advocate (design) | APPROVED (after 1 revision round) |
| Security Auditor (design) | CONDITIONAL PASS (4 medium findings — all implemented) |
| Code Reviewer | APPROVED (after i18n fix) |
| Devil's Advocate (code) | APPROVED (after i18n fix) |
| Security Auditor (code) | PASS (zero vulnerabilities) |

## Branch

`feature/backup-import-export`
