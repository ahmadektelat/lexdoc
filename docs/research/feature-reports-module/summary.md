# Feature Summary — Reports & Analytics Module

## What Was Implemented

Reports & Analytics module with 3 report types, exportable to TXT and CSV, accessible at `/reports`.

### Report Types
1. **Hours by Staff** — Staff cards with total hours, progress bars, and accordion-expandable client breakdown
2. **Hours by Client** — Client cards with total hours, progress bars, and accordion-expandable staff breakdown
3. **Filing Status** — DataTable with per-client filing metrics (filed/pending/late/total), completion progress bars, and summary row

### Key Features
- Date range filter for hours reports (defaults: Jan 1 to today)
- Year picker for filing status (defaults: current year)
- TXT and CSV export with dropdown selector
- CSV includes UTF-8 BOM for Excel Hebrew compatibility
- CSV formula injection protection (sanitizes cells starting with =, +, -, @)
- Permission gates: `reports.view` for page access, `reports.export` for export button
- Full i18n support (30 keys across Hebrew, Arabic, English)
- Dark theme support with `dark:` color variants
- RTL layout with `dir="ltr"` for numbers and dates

### Architecture Decisions
- **Client-side aggregation** — Fetch raw data, aggregate with `useMemo`. Matches existing BillingView pattern.
- **Shared aggregation utils** (`src/lib/report-utils.ts`) — Pure functions used by both report components and export, eliminating duplication.
- **Two hooks, not three** — Both hours tabs share `useReportHours`; React Query caches by key.
- **`isOverdue()` for late detection** — Uses existing utility for timezone-correct late filing detection.

## Files Changed

### New Files (8)
| File | Purpose |
|------|---------|
| `src/lib/report-utils.ts` | Shared aggregation functions |
| `src/services/reportService.ts` | Firm-wide data fetching |
| `src/hooks/useReports.ts` | React Query hooks |
| `src/components/reports/ReportsView.tsx` | Main page with tabs and controls |
| `src/components/reports/HoursByStaffReport.tsx` | Staff hours cards |
| `src/components/reports/HoursByClientReport.tsx` | Client hours cards |
| `src/components/reports/FilingStatusReport.tsx` | Filing status DataTable |
| `src/components/reports/ReportExport.tsx` | TXT/CSV export dropdown |

### Modified Files (4)
| File | Change |
|------|--------|
| `src/App.tsx` | Replaced SectionPlaceholder with ReportsView |
| `src/i18n/he.ts` | Added 30 reports.* keys (Hebrew) |
| `src/i18n/ar.ts` | Added 30 reports.* keys (Arabic) |
| `src/i18n/en.ts` | Added 30 reports.* keys (English) |

### No Database Changes
All reports computed from existing `hours_log` and `filings` tables.

## Review Results
- **Security audit (design)**: PASS WITH RECOMMENDATIONS — CSV injection fix added
- **Devil's advocate (design)**: APPROVED after 2nd round (isOverdue, shared utils)
- **Security audit (code)**: PASS — 0 critical/warning findings
- **Code review**: APPROVED after fixes (dark theme variants, export i18n)
- **Devil's advocate (code)**: APPROVED after fixes (export i18n, CSV role translation)

## Commits
1. `0035865` — feat: implement reports module — metrics, export, and filing status
2. `2c76d60` — fix: address review feedback — dark theme, export i18n, cleanup

## Branch
`feature/reports-module`
