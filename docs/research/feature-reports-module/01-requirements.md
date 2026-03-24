## Requirements Document — Reports & Analytics Module

### Task Summary

Implement the Reports & Analytics module with 3 report types (Hours by Staff, Hours by Client, Filing Status) accessible via a tabbed layout at `/reports`. Each report includes data visualization with progress bars, expandable detail rows (hours reports), and export functionality in both TXT and CSV formats.

### User Decisions

1. **Data fetching strategy** — **User chose: Client-side aggregation.** Fetch all `hours_log` rows for the firm in a single query, aggregate with `useMemo` on the frontend. Matches the existing BillingView pattern.
2. **Filing status report scope** — **User chose: Year picker dropdown** (default to current year). No date range filter for filings — just a year selector, matching the period-based nature of filings.
3. **Export formats** — **User chose: Both TXT and CSV** via an export dropdown button. CSV includes UTF-8 BOM for Excel Hebrew compatibility. Export button hidden entirely when user lacks `reports.export` permission.
4. **Expandable rows** — **User chose: Accordion expand/collapse.** Custom card-based layout for hours reports (not DataTable). DataTable used for the flat filing status table.

### Chosen Approach

**Client-side aggregation with custom card layouts** — Fetch raw data from Supabase, aggregate in React with `useMemo`, render hours reports as custom expandable cards and filing status as a DataTable. This matches existing codebase patterns (BillingView aggregation, CrmView tabs) and keeps implementation simple.

### Scope

**In scope:**
- ReportsView with 3-tab layout (shadcn Tabs)
- HoursByStaffReport — staff cards with expandable client breakdown, progress bars, date range filter
- HoursByClientReport — client cards with expandable staff breakdown, progress bars, date range filter
- FilingStatusReport — DataTable with filing metrics per client, progress bars, year picker
- ReportExport — export dropdown (TXT / CSV) per report tab
- New hooks: `useHoursByStaff`, `useHoursByClient`, `useFilingStatusReport`
- New service: `reportService` with firm-wide query methods
- i18n keys for all 3 languages (Hebrew, Arabic, English)
- Permission checks: `reports.view` for page access, `reports.export` for export button visibility
- Route integration: replace `/reports` placeholder in App.tsx

**Out of scope:**
- Server-side aggregation / database functions for reports
- Print-to-PDF functionality
- Scheduled/email report delivery
- Custom date presets (this month, this quarter, etc.)
- Charts/graphs (progress bars only, no chart library)

### Existing Patterns to Follow

#### Component Structure
- **Tab layout**: Follow `CrmView.tsx` pattern — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from shadcn
- **Page wrapper**: `<div className="p-6 animate-fade-in">` with `PageHeader` component
- **Permission gate**: `if (!can('reports.view')) return <Navigate to="/dashboard" />;` (BillingView pattern)
- **Loading state**: `<LoadingSpinner size="lg" className="py-20" />` while data loads

#### Hook Pattern
- Follow `useDashboard.ts` for query key structure: `reportKeys.all`, `reportKeys.hoursByStaff(firmId, dateRange)`, etc.
- Use `useQuery` with `enabled: !!firmId`
- Hooks accept `firmId: string | null` parameter

#### Service Pattern
- Follow `hoursService.ts` / `filingService.ts` patterns
- `rowToX()` mapper functions for DB rows
- `firm_id` scoping on all queries
- `is('deleted_at', null)` filter on all queries

#### i18n Pattern
- All strings via `t('reports.keyName')`
- Keys added to `he.ts`, `ar.ts`, `en.ts` simultaneously
- Section prefix: `reports.*`

### Affected Files

- `src/App.tsx` — Replace `<SectionPlaceholder section="reports" />` with `<ReportsView />`, add import
- `src/i18n/he.ts` — Add `reports.*` i18n keys (Hebrew)
- `src/i18n/ar.ts` — Add `reports.*` i18n keys (Arabic)
- `src/i18n/en.ts` — Add `reports.*` i18n keys (English)

### New Files Needed

- `src/components/reports/ReportsView.tsx` — Report hub with 3-tab layout, date range / year picker controls
- `src/components/reports/HoursByStaffReport.tsx` — Custom card layout with accordion expand, progress bars
- `src/components/reports/HoursByClientReport.tsx` — Custom card layout with accordion expand, progress bars
- `src/components/reports/FilingStatusReport.tsx` — DataTable with filing metrics, progress bars, summary row
- `src/components/reports/ReportExport.tsx` — Export dropdown component (TXT / CSV)
- `src/hooks/useReports.ts` — `useHoursByStaff`, `useHoursByClient`, `useFilingStatusReport` query hooks
- `src/services/reportService.ts` — Firm-wide data fetching methods for hours_log and filings

### Database Tables Used (No New Tables)

#### `hours_log` (existing)
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `firm_id` | UUID | FK to firms, RLS scoped |
| `client_id` | UUID | FK to clients |
| `staff_id` | UUID | FK to staff |
| `staff_name` | TEXT | Denormalized staff name |
| `hours` | NUMERIC(5,2) | Hours logged |
| `date` | DATE | Entry date — used for date range filter |
| `note` | TEXT | Optional note |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Report queries needed:**
- `SELECT * FROM hours_log WHERE firm_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL`
- Client-side grouping by `staff_id` (for hours-by-staff) and `client_id` (for hours-by-client)

#### `filings` (existing)
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `firm_id` | UUID | FK to firms, RLS scoped |
| `client_id` | UUID | FK to clients |
| `type` | TEXT | maam / mekadmot / nikuyim / nii |
| `period` | TEXT | e.g., "2026-01" |
| `due` | DATE | Filing deadline |
| `status` | TEXT | pending / filed / late |
| `filed_date` | DATE | When actually filed |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Report queries needed:**
- `SELECT * FROM filings WHERE firm_id = ? AND period LIKE '2026%' AND deleted_at IS NULL`
- Client-side counting: filed/pending/late per client_id
- Late detection: `status === 'late' || (status === 'pending' && due < today)`

#### Supporting tables (read-only, for name resolution)
- `staff` — Staff names and roles (via `useStaff` hook)
- `clients` — Client names and case numbers (via `useClients` hook)

### Database Changes

None. No new tables, columns, or migrations needed. Reports are computed from existing data.

### Shared Code to Import

**Components:**
- `PageHeader` from `src/components/shared/PageHeader.tsx`
- `DataTable` from `src/components/shared/DataTable.tsx` (FilingStatusReport only)
- `EmptyState` from `src/components/shared/EmptyState.tsx`
- `LoadingSpinner` from `src/components/shared/LoadingSpinner.tsx`

**Hooks:**
- `useStaff` from `src/hooks/useStaff.ts` — staff list for name resolution
- `useClients` from `src/hooks/useClients.ts` — client list for name resolution

**Utilities:**
- `formatDate` from `src/lib/dates.ts` — date formatting in exports
- `getFilingTypeLabel` from `src/lib/filing-utils.ts` — filing type Hebrew labels
- `isOverdue` from `src/lib/dates.ts` — late filing detection
- `cn` from `src/lib/utils.ts` — className merging

**UI primitives (shadcn):**
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `src/components/ui/tabs`
- `Button` from `src/components/ui/button`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `src/components/ui/select`
- `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` from `src/components/ui/dropdown-menu` (export button)

**Stores:**
- `useAuthStore` — `firmId`, `can()` for permission checks

### Component Specifications

#### ReportsView.tsx
- Page wrapper with `PageHeader` (title: `t('reports.title')`, description: `t('reports.description')`)
- Permission gate: `can('reports.view')` or redirect to dashboard
- 3 tabs: Hours by Staff, Hours by Client, Filing Status
- Date range state (`fromDate`, `toDate`) shared across the two hours tabs — defaults: Jan 1 of current year to today
- Year state for filing tab — defaults to current year
- Export button in `PageHeader` children slot (conditionally rendered based on `can('reports.export')`)
- Passes current report data + metadata to `ReportExport` for download

#### HoursByStaffReport.tsx
- Props: `hours: HoursEntry[]`, `staff: Staff[]`, `clients: Client[]`, `fromDate: string`, `toDate: string`
- Aggregates hours by `staff_id`, computes total per staff member
- Sorts by total hours descending
- Each staff card shows: avatar initial, name, role badge, total hours, entry count
- Progress bar: percentage relative to the highest total (max = 100%)
- Accordion toggle: click to expand/collapse client breakdown chips
- Empty state via `EmptyState` component when no data for the selected period

#### HoursByClientReport.tsx
- Props: `hours: HoursEntry[]`, `staff: Staff[]`, `clients: Client[]`, `fromDate: string`, `toDate: string`
- Aggregates hours by `client_id`, computes total per client
- Sorts by total hours descending
- Each client card shows: avatar initial, name, case number, total hours
- Progress bar: percentage relative to the highest total
- Accordion toggle: click to expand/collapse staff breakdown chips
- Empty state when no data

#### FilingStatusReport.tsx
- Props: `filings: Filing[]`, `clients: Client[]`, `year: number`
- Aggregates filings by `client_id`: filed count, pending count, late count, total, completion percentage
- Late detection: `status === 'late'` OR (`status === 'pending'` AND `due < today`)
- Uses shared `DataTable` with columns: Client Name, Filed, Pending, Late, Total, Completion %
- Progress bar in the completion column (green if no late, red if late > 0)
- Summary totals row at bottom (total filed / pending / late / all across all clients)
- Filters to active clients only (clients with filings for the selected year)

#### ReportExport.tsx
- Props: `reportType: string`, `data: unknown`, `fromDate?: string`, `toDate?: string`, `year?: number`, `disabled?: boolean`
- Dropdown button with two options: TXT, CSV
- TXT format: Hebrew headers, `=` separators, structured sections per the legacy format
- CSV format: UTF-8 with BOM prefix (`\uFEFF`), comma-separated, quoted fields containing commas
- Filename pattern: `lexdoc-[report-type]-[date].txt` or `.csv`
- Uses `Blob` + `URL.createObjectURL` + programmatic click for download (same as legacy)

### i18n Keys Needed

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `reports.title` | דוחות | التقارير | Reports |
| `reports.description` | ניתוח שעות עבודה והגשות | تحليل ساعات العمل والتقديمات | Work hours and filing analytics |
| `reports.tabs.hoursByStaff` | שעות לפי עובד | الساعات حسب الموظف | Hours by Staff |
| `reports.tabs.hoursByClient` | שעות לפי לקוח | الساعات حسب العميل | Hours by Client |
| `reports.tabs.filingStatus` | סטטוס הגשות | حالة التقديمات | Filing Status |
| `reports.fromDate` | מתאריך | من تاريخ | From Date |
| `reports.toDate` | עד תאריך | إلى تاريخ | To Date |
| `reports.year` | שנה | السنة | Year |
| `reports.export` | ייצוא דוח | تصدير التقرير | Export Report |
| `reports.exportTxt` | ייצוא TXT | تصدير TXT | Export TXT |
| `reports.exportCsv` | ייצוא CSV | تصدير CSV | Export CSV |
| `reports.totalHours` | סה"כ שעות | إجمالي الساعات | Total Hours |
| `reports.entries` | רשומות | سجلات | Entries |
| `reports.filed` | הוגש | تم التقديم | Filed |
| `reports.pending` | ממתין | قيد الانتظار | Pending |
| `reports.late` | באיחור | متأخر | Late |
| `reports.total` | סה"כ | الإجمالي | Total |
| `reports.completion` | אחוז השלמה | نسبة الإنجاز | Completion % |
| `reports.noData` | אין נתונים לתקופה זו | لا توجد بيانات لهذه الفترة | No data for this period |
| `reports.noFilings` | אין נתוני הגשות | لا توجد بيانات تقديم | No filing data |
| `reports.exportSuccess` | הדוח יוצא בהצלחה | تم تصدير التقرير بنجاح | Report exported successfully |
| `reports.summaryRow` | סיכום | الملخص | Summary |

### Route Integration

In `src/App.tsx`:
1. Add import: `import { ReportsView } from '@/components/reports/ReportsView';`
2. Replace: `<Route path="reports" element={<SectionPlaceholder section="reports" />} />`
3. With: `<Route path="reports" element={<ReportsView />} />`

The sidebar navigation already has the `/reports` link with `BarChart3` icon and `nav.reports` i18n key.

### Success Criteria

- [ ] `/reports` route renders the ReportsView with 3 functional tabs
- [ ] Hours by Staff tab shows staff cards with total hours, progress bars, and expandable client breakdown
- [ ] Hours by Client tab shows client cards with total hours, progress bars, and expandable staff breakdown
- [ ] Date range filter works correctly for both hours tabs (defaults: Jan 1 to today)
- [ ] Filing Status tab shows DataTable with per-client filing metrics and completion progress bars
- [ ] Year picker works for filing status tab (defaults to current year)
- [ ] Late filings detected correctly (status === 'late' OR pending + overdue)
- [ ] Export dropdown offers TXT and CSV formats
- [ ] TXT export matches legacy format with Hebrew headers
- [ ] CSV export includes UTF-8 BOM for Excel Hebrew compatibility
- [ ] Export button hidden when user lacks `reports.export` permission
- [ ] Page inaccessible (redirects) when user lacks `reports.view` permission
- [ ] All user-facing strings use `t()` with keys in all 3 language files
- [ ] Empty states displayed when no data for selected period/year
- [ ] `npm run build` passes with no errors
- [ ] `npx tsc --noEmit` passes with no type errors
