# Reports & Analytics Module

Reports module: Hours by staff, hours by client, and filing status reports with export.

**Branch:** `migration/reports-module`
**Prerequisites:** Phase 8 (Billing — for hours data) and Phase 7 (Filings) merged to main

## Context

- Read legacy-app.html lines 2104-2288 for ReportsView (3 report types)
- Each report has date range filter and export to .txt
- Progress bar visualizations for completion percentages
- firm_id scoping on ALL queries
- Hebrew primary — all strings use t()
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code

## Existing Shared Code

Import these, DO NOT recreate:
- Types from all modules
- Utils: formatDate, formatMoney, getFilingTypeLabel
- Components: PageHeader, DataTable, EmptyState, LoadingSpinner, FormField
- Hooks: useStaff, useClients

## Features to Implement

1. **ReportsView** — 3-tab layout:
   - Tabs: Hours by Staff, Hours by Client, Filing Status
   - Date range filter (from/to) for hours reports

2. **HoursByStaffReport**:
   - Staff list with total hours
   - Expandable: hours breakdown by client per staff
   - Progress bar showing % of total
   - Date range filter

3. **HoursByClientReport**:
   - Client list with total hours
   - Expandable: hours breakdown by staff per client
   - Progress bar
   - Date range filter

4. **FilingStatusReport**:
   - All clients with filing metrics
   - Columns: client, filed count, pending count, late count, total, completion %
   - Progress bar per client
   - Summary totals row

5. **ReportExport**:
   - Export button on each report
   - Download as .txt with formatted headers and sections
   - Filename: [report-type]-[from-date].txt
   - Also support CSV export

6. **Hooks** — useReports.ts:
   - useHoursByStaff(firmId, dateRange)
   - useHoursByClient(firmId, dateRange)
   - useFilingStatusReport(firmId)

7. **Route** — Add /reports route

8. Add i18n keys (reports.* section) to all 3 language files.

### Files to Create

- `src/components/reports/ReportsView.tsx` — Report hub with tabs
- `src/components/reports/HoursByStaffReport.tsx` — Hours breakdown by staff
- `src/components/reports/HoursByClientReport.tsx` — Hours breakdown by client
- `src/components/reports/FilingStatusReport.tsx` — Filing status across all clients
- `src/components/reports/ReportExport.tsx` — Export report as CSV/text
- `src/hooks/useReports.ts` — Report query hooks
