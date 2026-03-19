# Filings Module — Feature Summary

## Branch
`migration/filings-module`

## What was implemented

Tax filings module: filing schedule generation, per-client settings management, status tracking with auto-task integration.

### New Files (9)
- `supabase/migrations/20260319100001_create_filings_tables.sql` — filings + filing_settings tables, indexes, RLS, triggers, GRANTs, FK on tasks.filing_id, unique partial index
- `src/services/filingService.ts` — list, markFiled, markLate, resetToPending, regenerateSchedule, lateCountsByFirm
- `src/services/filingSettingService.ts` — get (with .maybeSingle()), save (with .upsert())
- `src/hooks/useFilings.ts` — query keys, useFilings, useFilingLateCounts, useMarkFiled, useMarkLate, useResetToPending, useRegenerateSchedule
- `src/hooks/useFilingSettings.ts` — query keys, useFilingSettings, useSaveFilingSettings
- `src/components/filings/FilingsView.tsx` — two-column layout with client sidebar, year selector (clamped ±1), type filter, metrics bar, permission guard
- `src/components/filings/FilingSettingsPanel.tsx` — per-client settings editor with VAT frequency, enable/disable toggles, save + regenerate flow
- `src/components/filings/FilingScheduleTable.tsx` — custom table with static type badge classes, status badges, overdue row styling, action buttons with dark mode support
- `src/components/filings/FilingsClientTab.tsx` — wrapper for ClientDetailView embedding with permission guard

### Modified Files (7)
- `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts` — added 32+ filings.* keys
- `src/services/taskService.ts` — implemented cancelAutoTaskForFiling (was stub)
- `src/App.tsx` — replaced SectionPlaceholder with FilingsView for /filings route
- `src/components/clients/ClientTabs.tsx` — replaced EmptyState with FilingsClientTab
- `src/lib/constants.ts` — added filings.view/filings.edit to manager role, FILING_TYPE_I18N_KEYS, FILING_TYPE_BADGE_CLASSES

## Review Status
- **Code Review**: APPROVED after fixes (dynamic Tailwind classes, dark mode buttons)
- **Devil's Advocate**: APPROVED after fixes (same Tailwind issue, DRY extraction, SearchInput, edit button label)
- **Security Audit**: PASSED (0 critical; permission guards added for FilingsClientTab and handleSaveAndGenerate)

## Verification
- `npx tsc --noEmit` — PASS
- `npm run lint` — PASS
- `npm run build` — PASS

## Key Design Decisions
1. Custom table for FilingScheduleTable (not extending DataTable) — bounded data, specialized row styling
2. Late counts fetched client-side from all firm filings for the year (~2100 rows max) — RPC optimization deferred
3. Year selector clamped to currentYear ± 1
4. Schedule regeneration preserves filed filings, soft-deletes unfiled orphans
5. FILING_TYPE_I18N_KEYS extracted to constants.ts (not using raw Hebrew FILING_TYPES for badges)

## Known Limitations
- `lateCountsByFirm` fetches all firm filings — optimize to RPC if firm exceeds 200 clients
- `runAutoTaskEngine` remains a stub — auto-task creation deferred to future phase
- RBAC enforced at UI level only (systemic across entire app)
