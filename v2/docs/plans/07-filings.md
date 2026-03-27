# Tax Filings

Tax filing module: Filing schedule generation, settings management, status tracking with auto-task integration.

**Branch:** `migration/filings-module`
**Prerequisites:** Phase 6 (CRM — for task integration) merged to main

## Context

- Read legacy-app.html lines 1904-2102 for the FilingsView reference.
- Read lines 364-454 for filing schedule logic, FILING_SETTINGS, FILINGS data structures.
- Filing types: vat, taxAdv, taxDeduct, niiDeduct.
- Due dates: 15th of month after period end.
- VAT can be monthly or bimonthly; others are monthly with enable/disable toggle.
- Auto-tasks are created 10 days before filing deadline (integration with Phase 6 taskService).
- firm_id scoping on ALL queries.
- Hebrew primary — all strings use t().
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code, DO NOT recreate.

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { Filing, FilingType, FilingStatus, FilingSetting, CreateFilingInput } from '@/types'`
- Constants: `import { FILING_TYPES, FILING_TYPE_COLORS } from '@/lib/constants'`
- Utils: `import { calculateDueDate, getMonthlyPeriods, getBimonthlyPeriods, generateFilingSchedule, getFilingTypeLabel, getFilingTypeColor } from '@/lib/filing-utils'`, `import { formatDate, isOverdue } from '@/lib/dates'`
- Components: `import { PageHeader, DataTable, StatusBadge, EmptyState, LoadingSpinner, FormField } from '@/components/shared'`
- Task service: `import { taskService } from '@/services/taskService'` (for auto-task cancellation)
- Auth: `import { useAuthStore } from '@/stores/useAuthStore'`

## Features to Implement

1. **FilingsView** (`src/components/filings/FilingsView.tsx`) — Two-column layout:
   - Left sidebar: client list with late filing count badge per client
   - Right panel: filing schedule for selected client
   - Metrics bar: filed count, pending count, late count

2. **FilingSettingsPanel** (`src/components/filings/FilingSettingsPanel.tsx`) — Per-client settings:
   - VAT frequency toggle: monthly / bimonthly
   - Tax advance: enable/disable + frequency
   - Tax deduction: enable/disable + frequency
   - NII deduction: enable/disable + frequency
   - Save button: regenerates schedule preserving existing filed statuses

3. **FilingScheduleTable** (`src/components/filings/FilingScheduleTable.tsx`) — Filing list:
   - Columns: type (colored badge using FILING_TYPE_COLORS), period, due date, status (StatusBadge), filed date, actions
   - Red background row for overdue filings
   - Actions per filing:
     - Mark as filed: sets status='filed', records filedDate, cancels auto-task via taskService.cancelAutoTaskForFiling()
     - Mark as late: manual late marker
     - Reset: return to pending
   - Sort by due date

4. **FilingsClientTab** (`src/components/filings/FilingsClientTab.tsx`) — Used in ClientView (Phase 3):
   - Same as FilingScheduleTable but filtered to specific client
   - Includes FilingSettingsPanel above the table

5. **Services**:
   - `src/services/filingService.ts`: list(firmId, clientId), create, markFiled(id), markLate(id), resetToPending(id), regenerateSchedule(clientId, year, settings)
   - `src/services/filingSettingService.ts`: get(clientId), save(clientId, settings)
   - regenerateSchedule: uses generateFilingSchedule() from filing-utils, preserves existing filed statuses

6. **Hooks** — `src/hooks/useFilings.ts`

7. **Database migrations**:
   - `filings` table (firm_id, client_id, type, period, due DATE, status, filedDate, note)
   - `filing_settings` table (firm_id, client_id UNIQUE, vatFreq, taxAdvEnabled, taxAdvFreq, etc.)
   - Indexes on (client_id, due), (firm_id)
   - RLS policies

8. **Wire into ClientView** — Replace filings tab placeholder

9. **i18n** — Add i18n keys (filings.* section) to all 3 language files.
