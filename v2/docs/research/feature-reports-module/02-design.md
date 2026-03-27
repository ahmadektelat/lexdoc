# Technical Design — Reports & Analytics Module

## Architecture Approach

Client-side aggregation with custom card layouts for hours reports and DataTable for filing status. This mirrors the existing BillingView pattern (fetch all records, aggregate with `useMemo`), the CrmView tab layout, and the dashboard query-key structure.

**Why this approach over alternatives:**
- Server-side aggregation (Postgres functions / views) would add migration complexity for a read-only module with moderate data volumes. The billing module already proves client-side aggregation works at firm scale.
- A single `reportService` with two firm-wide fetch methods keeps the service layer thin. The hooks layer handles query caching, and components handle aggregation via `useMemo`.
- Aggregation logic is extracted into pure functions in `src/lib/report-utils.ts` so that both report components (via `useMemo`) and the export component call the same aggregators. This eliminates duplication and prevents aggregation drift bugs.
- Late filing detection uses the existing `isOverdue()` from `src/lib/dates.ts` instead of manual string comparison, ensuring correct IST timezone behavior and consistency with `filingService.lateCountsByFirm`.

---

## File-by-File Change Plan

### New Files

#### 1. `src/services/reportService.ts`
- **Action:** Create
- **Rationale:** Firm-wide data fetching methods not scoped to a single client, unlike existing `hoursService.list(firmId, clientId)`.

```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { HoursEntry, Filing } from '@/types';

// Reuse the same rowToHoursEntry mapper pattern from hoursService
function rowToHoursEntry(row: Record<string, unknown>): HoursEntry {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    staffId: row.staff_id as string,
    staffName: row.staff_name as string,
    hours: Number(row.hours),
    date: row.date as string,
    note: (row.note as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
  };
}

function rowToFiling(row: Record<string, unknown>): Filing {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    type: row.type as Filing['type'],
    period: row.period as string,
    due: row.due as string,
    status: row.status as Filing['status'],
    filedDate: (row.filed_date as string) ?? undefined,
    note: (row.note as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export const reportService = {
  /** Fetch all hours_log entries for the firm within a date range. */
  async hoursByFirm(firmId: string, fromDate: string, toDate: string): Promise<HoursEntry[]> {
    const { data, error } = await supabase
      .from('hours_log')
      .select('*')
      .eq('firm_id', firmId)
      .gte('date', fromDate)
      .lte('date', toDate)
      .is('deleted_at', null)
      .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToHoursEntry);
  },

  /** Fetch all filings for the firm for a given year. */
  async filingsByFirm(firmId: string, year: number): Promise<Filing[]> {
    const { data, error } = await supabase
      .from('filings')
      .select('*')
      .eq('firm_id', firmId)
      .like('period', `${year}%`)
      .is('deleted_at', null)
      .order('due', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToFiling);
  },
};
```

**Key decisions:**
- `rowToHoursEntry` and `rowToFiling` are duplicated from `hoursService` and `filingService` respectively. This is intentional -- the mappers are private to each service. Extracting them to a shared location would couple the services and violate the existing pattern where each service owns its own mapper.
- `hoursByFirm` uses `.gte('date', fromDate).lte('date', toDate)` for date range filtering server-side, reducing client data volume.
- `filingsByFirm` uses `.like('period', `${year}%`)` matching the existing `filingService.list` pattern.

---

#### 2. `src/lib/report-utils.ts`
- **Action:** Create
- **Rationale:** Pure aggregation functions shared between report components and export. Eliminates duplication and prevents aggregation drift bugs between rendering and export.

```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import { isOverdue } from '@/lib/dates';
import type { HoursEntry, Filing, Staff, Client } from '@/types';

// --- Shared aggregation types ---

export interface BreakdownItem {
  id: string;
  name: string;
  hours: number;
}

export interface StaffAggregation {
  staffId: string;
  staffName: string;
  role: string;
  totalHours: number;
  entryCount: number;
  clientBreakdown: BreakdownItem[];
}

export interface ClientHoursAggregation {
  clientId: string;
  clientName: string;
  caseNum: string;
  totalHours: number;
  entryCount: number;
  staffBreakdown: BreakdownItem[];
}

export interface ClientFilingRow {
  clientId: string;
  clientName: string;
  filed: number;
  pending: number;
  late: number;
  total: number;
  completionPct: number;
}

// --- Aggregation functions ---

/** Aggregate hours entries grouped by staff member. Sorted by total hours descending. */
export function aggregateHoursByStaff(
  hours: HoursEntry[],
  staff: Staff[],
  clients: Client[],
): StaffAggregation[] {
  const map = new Map<string, StaffAggregation>();

  for (const entry of hours) {
    const existing = map.get(entry.staffId) || {
      staffId: entry.staffId,
      staffName: entry.staffName,
      role: staff.find((s) => s.id === entry.staffId)?.role ?? '',
      totalHours: 0,
      entryCount: 0,
      clientBreakdown: [],
    };
    existing.totalHours += entry.hours;
    existing.entryCount += 1;

    const clientEntry = existing.clientBreakdown.find((c) => c.id === entry.client_id);
    if (clientEntry) {
      clientEntry.hours += entry.hours;
    } else {
      existing.clientBreakdown.push({
        id: entry.client_id,
        name: clients.find((c) => c.id === entry.client_id)?.name ?? '',
        hours: entry.hours,
      });
    }
    map.set(entry.staffId, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
}

/** Aggregate hours entries grouped by client. Sorted by total hours descending. */
export function aggregateHoursByClient(
  hours: HoursEntry[],
  staff: Staff[],
  clients: Client[],
): ClientHoursAggregation[] {
  const map = new Map<string, ClientHoursAggregation>();

  for (const entry of hours) {
    const client = clients.find((c) => c.id === entry.client_id);
    const existing = map.get(entry.client_id) || {
      clientId: entry.client_id,
      clientName: client?.name ?? '',
      caseNum: client?.caseNum ?? '',
      totalHours: 0,
      entryCount: 0,
      staffBreakdown: [],
    };
    existing.totalHours += entry.hours;
    existing.entryCount += 1;

    const staffEntry = existing.staffBreakdown.find((s) => s.id === entry.staffId);
    if (staffEntry) {
      staffEntry.hours += entry.hours;
    } else {
      existing.staffBreakdown.push({
        id: entry.staffId,
        name: entry.staffName,
        hours: entry.hours,
      });
    }
    map.set(entry.client_id, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
}

/**
 * Aggregate filings grouped by client. Returns rows + summary.
 * Uses isOverdue() from dates.ts for timezone-correct late detection.
 */
export function aggregateFilingStatus(
  filings: Filing[],
  clients: Client[],
  summaryLabel: string,
): { rows: ClientFilingRow[]; summary: ClientFilingRow } {
  const map = new Map<string, ClientFilingRow>();

  for (const f of filings) {
    const client = clients.find((c) => c.id === f.client_id);
    const existing = map.get(f.client_id) || {
      clientId: f.client_id,
      clientName: client?.name ?? '',
      filed: 0,
      pending: 0,
      late: 0,
      total: 0,
      completionPct: 0,
    };

    existing.total += 1;

    if (f.status === 'filed') {
      existing.filed += 1;
    } else if (f.status === 'late' || (f.status === 'pending' && isOverdue(f.due))) {
      existing.late += 1;
    } else {
      existing.pending += 1;
    }

    map.set(f.client_id, existing);
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    completionPct: r.total > 0 ? Math.round((r.filed / r.total) * 100) : 0,
  }));

  const summary: ClientFilingRow = {
    clientId: '__summary__',
    clientName: summaryLabel,
    filed: rows.reduce((s, r) => s + r.filed, 0),
    pending: rows.reduce((s, r) => s + r.pending, 0),
    late: rows.reduce((s, r) => s + r.late, 0),
    total: rows.reduce((s, r) => s + r.total, 0),
    completionPct: 0,
  };
  summary.completionPct =
    summary.total > 0 ? Math.round((summary.filed / summary.total) * 100) : 0;

  return { rows, summary };
}
```

**Key decisions:**
- All three functions are pure (no side effects, no hooks). They accept data arrays and return aggregated results.
- `aggregateFilingStatus` accepts a `summaryLabel` string parameter so the calling component can pass `t('reports.summaryRow')` without the utility needing i18n awareness.
- Late detection uses `isOverdue(f.due)` from `src/lib/dates.ts` which uses `startOfDay(new Date())` in local time, consistent with `filingService.lateCountsByFirm` and correct for IST timezone.
- `BreakdownItem` is a shared interface for both client-breakdown and staff-breakdown items, since both have the same shape (`id`, `name`, `hours`).

---

#### 3. `src/hooks/useReports.ts`
- **Action:** Create
- **Rationale:** Query hooks with factory keys following the `dashboardKeys` / `hoursKeys` pattern.

```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import { useQuery } from '@tanstack/react-query';
import { reportService } from '@/services/reportService';
import type { HoursEntry, Filing } from '@/types';

export const reportKeys = {
  all: ['reports'] as const,
  hours: (firmId: string, from: string, to: string) =>
    [...reportKeys.all, 'hours', firmId, from, to] as const,
  filings: (firmId: string, year: number) =>
    [...reportKeys.all, 'filings', firmId, year] as const,
};

export function useReportHours(firmId: string | null, fromDate: string, toDate: string) {
  return useQuery<HoursEntry[]>({
    queryKey: reportKeys.hours(firmId ?? '', fromDate, toDate),
    queryFn: () => reportService.hoursByFirm(firmId!, fromDate, toDate),
    enabled: !!firmId,
  });
}

export function useReportFilings(firmId: string | null, year: number) {
  return useQuery<Filing[]>({
    queryKey: reportKeys.filings(firmId ?? '', year),
    queryFn: () => reportService.filingsByFirm(firmId!, year),
    enabled: !!firmId,
  });
}
```

**Key decisions:**
- Two hooks, not three. The requirements listed `useHoursByStaff`, `useHoursByClient`, `useFilingStatusReport`, but both hours reports fetch the same data (all firm hours within date range). Aggregation by staff vs client is a presentation concern handled in each component's `useMemo`. Fetching the same data twice via separate hooks would be wasteful. React Query will cache by the same key, so both tab components share the single `useReportHours` result.
- The query key includes `fromDate` and `toDate` so that changing the date range automatically triggers a re-fetch.

---

#### 4. `src/components/reports/ReportsView.tsx`
- **Action:** Create
- **Rationale:** Main page component with tab layout, controls, and permission gate.

**Structure:**
```typescript
// CREATED: 2026-03-24
// UPDATED: 2026-03-24 HH:MM IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useReportHours, useReportFilings } from '@/hooks/useReports';
import { useStaff } from '@/hooks/useStaff';
import { useClients } from '@/hooks/useClients';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HoursByStaffReport } from './HoursByStaffReport';
import { HoursByClientReport } from './HoursByClientReport';
import { FilingStatusReport } from './FilingStatusReport';
import { ReportExport } from './ReportExport';
```

**State management:**
```typescript
const [activeTab, setActiveTab] = useState<string>('hoursByStaff');

// Date range for hours tabs — default: Jan 1 of current year to today
const currentYear = new Date().getFullYear();
const [fromDate, setFromDate] = useState<string>(`${currentYear}-01-01`);
const [toDate, setToDate] = useState<string>(
  new Date().toISOString().split('T')[0]
);

// Year picker for filing tab
const [filingYear, setFilingYear] = useState<number>(currentYear);
```

**Data fetching:**
```typescript
const firmId = useAuthStore((s) => s.firmId);
const can = useAuthStore((s) => s.can);
const { t } = useLanguage();

const { data: hours = [], isLoading: hoursLoading } = useReportHours(firmId, fromDate, toDate);
const { data: filings = [], isLoading: filingsLoading } = useReportFilings(firmId, filingYear);
const { data: staff = [] } = useStaff(firmId);
const { data: clients = [] } = useClients(firmId);
```

**Permission gate:**
```typescript
if (!can('reports.view')) return <Navigate to="/dashboard" />;
```

**Loading state:**
```typescript
const isLoading = hoursLoading || filingsLoading;
if (isLoading) return <LoadingSpinner size="lg" className="py-20" />;
```

**Layout (JSX):**
```tsx
<div className="p-6 animate-fade-in">
  <PageHeader title={t('reports.title')} description={t('reports.description')}>
    {can('reports.export') && (
      <ReportExport
        activeTab={activeTab}
        hours={hours}
        filings={filings}
        staff={staff}
        clients={clients}
        fromDate={fromDate}
        toDate={toDate}
        filingYear={filingYear}
        t={t}
      />
    )}
  </PageHeader>

  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
    <TabsList className="w-full justify-start">
      <TabsTrigger value="hoursByStaff">{t('reports.tabs.hoursByStaff')}</TabsTrigger>
      <TabsTrigger value="hoursByClient">{t('reports.tabs.hoursByClient')}</TabsTrigger>
      <TabsTrigger value="filingStatus">{t('reports.tabs.filingStatus')}</TabsTrigger>
    </TabsList>

    {/* Date range controls — shown for hours tabs only */}
    {(activeTab === 'hoursByStaff' || activeTab === 'hoursByClient') && (
      <div className="flex items-center gap-4 mt-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">{t('reports.fromDate')}</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background text-foreground"
            dir="ltr"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">{t('reports.toDate')}</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background text-foreground"
            dir="ltr"
          />
        </div>
      </div>
    )}

    {/* Year picker — shown for filing tab only */}
    {activeTab === 'filingStatus' && (
      <div className="flex items-center gap-2 mt-4">
        <label className="text-sm text-muted-foreground">{t('reports.year')}</label>
        <Select
          value={String(filingYear)}
          onValueChange={(v) => setFilingYear(Number(v))}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )}

    <TabsContent value="hoursByStaff" className="mt-4">
      <HoursByStaffReport hours={hours} staff={staff} clients={clients} />
    </TabsContent>
    <TabsContent value="hoursByClient" className="mt-4">
      <HoursByClientReport hours={hours} staff={staff} clients={clients} />
    </TabsContent>
    <TabsContent value="filingStatus" className="mt-4">
      <FilingStatusReport filings={filings} clients={clients} year={filingYear} />
    </TabsContent>
  </Tabs>
</div>
```

**Additional imports needed:**
```typescript
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
```

---

#### 5. `src/components/reports/HoursByStaffReport.tsx`
- **Action:** Create
- **Rationale:** Custom card layout with expandable accordion rows showing hours grouped by staff member.

**Props interface:**
```typescript
import type { HoursEntry, Staff, Client } from '@/types';

interface HoursByStaffReportProps {
  hours: HoursEntry[];
  staff: Staff[];
  clients: Client[];
}
```

**Aggregation logic (delegates to shared `report-utils.ts`):**
```typescript
import { aggregateHoursByStaff } from '@/lib/report-utils';
import type { StaffAggregation } from '@/lib/report-utils';

const aggregated = useMemo<StaffAggregation[]>(
  () => aggregateHoursByStaff(hours, staff, clients),
  [hours, staff, clients],
);

const maxHours = aggregated[0]?.totalHours ?? 1;
```

**Render pattern:**
- If `aggregated.length === 0`, render `<EmptyState icon={Clock} title={t('reports.noData')} />`
- Otherwise render a list of cards. Each card:
  - Avatar initial (first letter of `staffName`), name, role badge via `t(STAFF_ROLES[role])`
  - `totalHours` formatted to 1 decimal + `entryCount` label
  - Progress bar: `width: ${(agg.totalHours / maxHours) * 100}%`
  - Expandable section (toggle via local `expandedIds` Set state) showing client breakdown chips

**Expand/collapse state:**
```typescript
const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

const toggleExpand = (staffId: string) => {
  setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(staffId)) next.delete(staffId);
    else next.add(staffId);
    return next;
  });
};
```

**Card JSX pattern (per aggregated item):**
```tsx
<div
  key={agg.staffId}
  className="border rounded-lg p-4 bg-card cursor-pointer hover:bg-muted/50 transition-colors"
  onClick={() => toggleExpand(agg.staffId)}
>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
        {agg.staffName.charAt(0)}
      </div>
      <div>
        <div className="font-medium">{agg.staffName}</div>
        <div className="text-xs text-muted-foreground">
          {agg.role ? t(STAFF_ROLES[agg.role as StaffRole] ?? '') : ''}
        </div>
      </div>
    </div>
    <div className="text-end">
      <div className="font-bold text-lg" dir="ltr">{agg.totalHours.toFixed(1)}</div>
      <div className="text-xs text-muted-foreground">
        {agg.entryCount} {t('reports.entries')}
      </div>
    </div>
  </div>

  {/* Progress bar */}
  <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
    <div
      className="h-full bg-primary rounded-full transition-all"
      style={{ width: `${(agg.totalHours / maxHours) * 100}%` }}
    />
  </div>

  {/* Expandable client breakdown */}
  {expandedIds.has(agg.staffId) && (
    <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
      {agg.clientBreakdown
        .sort((a, b) => b.hours - a.hours)
        .map((cb) => (
          <span
            key={cb.id}
            className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-xs"
          >
            <span>{cb.name}</span>
            <span className="font-medium" dir="ltr">{cb.hours.toFixed(1)}</span>
          </span>
        ))}
    </div>
  )}
</div>
```

**Imports needed:**
```typescript
import { useState, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmptyState } from '@/components/shared/EmptyState';
import { aggregateHoursByStaff } from '@/lib/report-utils';
import type { StaffAggregation } from '@/lib/report-utils';
import { STAFF_ROLES } from '@/lib/constants';
import type { HoursEntry, Staff, Client, StaffRole } from '@/types';
```

---

#### 6. `src/components/reports/HoursByClientReport.tsx`
- **Action:** Create
- **Rationale:** Mirror of HoursByStaffReport but grouped by client.

**Props interface:**
```typescript
interface HoursByClientReportProps {
  hours: HoursEntry[];
  staff: Staff[];
  clients: Client[];
}
```

**Aggregation logic (delegates to shared `report-utils.ts`):**
```typescript
import { aggregateHoursByClient } from '@/lib/report-utils';
import type { ClientHoursAggregation } from '@/lib/report-utils';

const aggregated = useMemo<ClientHoursAggregation[]>(
  () => aggregateHoursByClient(hours, staff, clients),
  [hours, staff, clients],
);

const maxHours = aggregated[0]?.totalHours ?? 1;
```

**Render pattern:** Same card pattern as HoursByStaffReport but:
- Avatar shows first letter of `clientName`
- Subtitle shows `caseNum` instead of role
- Expandable section shows staff breakdown chips instead of client breakdown

---

#### 7. `src/components/reports/FilingStatusReport.tsx`
- **Action:** Create
- **Rationale:** Uses shared `DataTable` with filing metrics per client.

**Props interface:**
```typescript
import type { Filing, Client } from '@/types';

interface FilingStatusReportProps {
  filings: Filing[];
  clients: Client[];
  year: number;
}
```

**Aggregation logic (delegates to shared `report-utils.ts`):**
```typescript
import { aggregateFilingStatus } from '@/lib/report-utils';
import type { ClientFilingRow } from '@/lib/report-utils';

const { rows, summary } = useMemo(
  () => aggregateFilingStatus(filings, clients, t('reports.summaryRow')),
  [filings, clients, t],
);
```

**Late detection logic (critical -- handled inside `aggregateFilingStatus`):**
```typescript
// Uses isOverdue(f.due) from src/lib/dates.ts which calls:
//   isBefore(parseISO(dueDate), startOfDay(new Date()))
// This uses local time (IST), NOT UTC, avoiding the timezone bug where
// new Date().toISOString().split('T')[0] returns UTC date.
// Consistent with filingService.lateCountsByFirm which also uses isOverdue().
//
// A filing is "late" if:
// 1. f.status === 'late' (explicitly marked), OR
// 2. f.status === 'pending' AND isOverdue(f.due) (overdue but not yet marked)
```

**DataTable columns:**
```typescript
const columns: ColumnDef<ClientFilingRow, unknown>[] = [
  {
    accessorKey: 'clientName',
    header: t('common.name'),
  },
  {
    accessorKey: 'filed',
    header: t('reports.filed'),
    cell: ({ row }) => (
      <span className="text-green-600 font-medium">{row.original.filed}</span>
    ),
  },
  {
    accessorKey: 'pending',
    header: t('reports.pending'),
    cell: ({ row }) => (
      <span className="text-amber-600 font-medium">{row.original.pending}</span>
    ),
  },
  {
    accessorKey: 'late',
    header: t('reports.late'),
    cell: ({ row }) => (
      <span className={row.original.late > 0 ? 'text-red-600 font-bold' : 'text-muted-foreground'}>
        {row.original.late}
      </span>
    ),
  },
  {
    accessorKey: 'total',
    header: t('reports.total'),
  },
  {
    accessorKey: 'completionPct',
    header: t('reports.completion'),
    cell: ({ row }) => {
      const pct = row.original.completionPct;
      const hasLate = row.original.late > 0;
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                hasLate ? 'bg-red-500' : 'bg-green-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-10 text-end" dir="ltr">
            {pct}%
          </span>
        </div>
      );
    },
  },
];
```

**Summary row rendering:**
The summary row is appended to the `rows` array before passing to DataTable:
```typescript
const dataWithSummary = [...rows, summary];
```
The summary row is visually differentiated by checking `row.original.clientId === '__summary__'` in a custom row class or by styling it differently. Since DataTable does not support custom row classes natively, the simpler approach is to render the summary as a separate `div` below the DataTable:

```tsx
{rows.length === 0 ? (
  <EmptyState icon={FileText} title={t('reports.noFilings')} />
) : (
  <>
    <DataTable columns={columns} data={rows} searchable />
    {/* Summary row */}
    <div className="mt-2 border rounded-md p-3 bg-muted/30 flex items-center justify-between text-sm font-medium">
      <span>{t('reports.summaryRow')}</span>
      <div className="flex items-center gap-6">
        <span className="text-green-600">{t('reports.filed')}: {summary.filed}</span>
        <span className="text-amber-600">{t('reports.pending')}: {summary.pending}</span>
        <span className={summary.late > 0 ? 'text-red-600 font-bold' : ''}>{t('reports.late')}: {summary.late}</span>
        <span>{t('reports.total')}: {summary.total}</span>
        <span dir="ltr">{summary.completionPct}%</span>
      </div>
    </div>
  </>
)}
```

**Imports needed:**
```typescript
import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { aggregateFilingStatus } from '@/lib/report-utils';
import type { ClientFilingRow } from '@/lib/report-utils';
import { cn } from '@/lib/utils';
import type { Filing, Client } from '@/types';
import type { ColumnDef } from '@tanstack/react-table';
```

---

#### 8. `src/components/reports/ReportExport.tsx`
- **Action:** Create
- **Rationale:** Export dropdown with TXT and CSV options, shared across all tabs.

**Props interface:**
```typescript
interface ReportExportProps {
  activeTab: string;
  hours: HoursEntry[];
  filings: Filing[];
  staff: Staff[];
  clients: Client[];
  fromDate: string;
  toDate: string;
  filingYear: number;
  t: (key: string) => string;
}
```

**Export utility functions (inside the file, not exported):**

```typescript
function downloadFile(content: string, filename: string, mimeType: string) {
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

function getDateStamp(): string {
  return new Date().toISOString().split('T')[0];
}
```

**TXT export format (Hours by Staff):**
```
========================================
דוח שעות לפי עובד
תאריך: 01/01/2026 - 24/03/2026
========================================

עובד: שם העובד
תפקיד: רואה חשבון
סה"כ שעות: 120.5
מספר רשומות: 45
----------------------------------------
  לקוח: לקוח א' — 45.0 שעות
  לקוח: לקוח ב' — 30.5 שעות
  לקוח: לקוח ג' — 45.0 שעות
========================================

... (repeat per staff member)
```

**TXT export format (Hours by Client):**
```
========================================
דוח שעות לפי לקוח
תאריך: 01/01/2026 - 24/03/2026
========================================

לקוח: שם הלקוח (תיק: 001)
סה"כ שעות: 75.0
----------------------------------------
  עובד: עובד א' — 40.0 שעות
  עובד: עובד ב' — 35.0 שעות
========================================

... (repeat per client)
```

**TXT export format (Filing Status):**
```
========================================
דוח סטטוס הגשות — שנת 2026
========================================

לקוח: שם הלקוח
הוגש: 8 | ממתין: 2 | באיחור: 1 | סה"כ: 11 | השלמה: 73%
========================================

... (repeat per client)

סיכום כללי:
הוגש: 80 | ממתין: 15 | באיחור: 5 | סה"כ: 100 | השלמה: 80%
```

**CSV export format (Hours by Staff):**
```
\uFEFF"עובד","תפקיד","סה""כ שעות","רשומות"
"שם העובד","רואה חשבון","120.5","45"
```

**CSV export format (Hours by Client):**
```
\uFEFF"לקוח","מספר תיק","סה""כ שעות","רשומות"
"שם הלקוח","001","75.0","32"
```

**CSV export format (Filing Status):**
```
\uFEFF"לקוח","הוגש","ממתין","באיחור","סה""כ","אחוז השלמה"
"שם הלקוח","8","2","1","11","73%"
```

**Implementation approach (uses shared aggregators from `report-utils.ts`):**
```typescript
import {
  aggregateHoursByStaff,
  aggregateHoursByClient,
  aggregateFilingStatus,
} from '@/lib/report-utils';

function generateTxtContent(
  activeTab: string,
  hours: HoursEntry[],
  filings: Filing[],
  staff: Staff[],
  clients: Client[],
  fromDate: string,
  toDate: string,
  filingYear: number,
): string {
  if (activeTab === 'hoursByStaff') {
    const agg = aggregateHoursByStaff(hours, staff, clients);
    // Format into TXT structure per the patterns above
  } else if (activeTab === 'hoursByClient') {
    const agg = aggregateHoursByClient(hours, staff, clients);
    // Format into TXT structure
  } else {
    const { rows, summary } = aggregateFilingStatus(filings, clients, 'סיכום');
    // Format into TXT structure
  }
  // Return the string content
}

function generateCsvContent(
  activeTab: string,
  hours: HoursEntry[],
  filings: Filing[],
  staff: Staff[],
  clients: Client[],
  fromDate: string,
  toDate: string,
  filingYear: number,
): string {
  // Same aggregation calls as above, format as CSV
  // UTF-8 BOM + CSV content
  // Return '\uFEFF' + csvRows.join('\n')
}
```

**Critical:** The export functions call the *same* `aggregateHoursByStaff`, `aggregateHoursByClient`, and `aggregateFilingStatus` functions that the report components use. This guarantees the exported data exactly matches what the user sees on screen.

**CSV field escaping helper:**
```typescript
function csvField(value: string | number): string {
  const str = String(value);
  // Escape double quotes by doubling them, wrap in double quotes
  return `"${str.replace(/"/g, '""')}"`;
}
```

**Dropdown component:**
```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

export function ReportExport({ activeTab, hours, filings, staff, clients, fromDate, toDate, filingYear, t }: ReportExportProps) {
  const tabLabel = activeTab === 'hoursByStaff' ? 'hours-by-staff'
    : activeTab === 'hoursByClient' ? 'hours-by-client'
    : 'filing-status';

  const handleExport = (format: 'txt' | 'csv') => {
    const content = format === 'txt'
      ? generateTxtContent(activeTab, hours, filings, staff, clients, fromDate, toDate, filingYear)
      : generateCsvContent(activeTab, hours, filings, staff, clients, fromDate, toDate, filingYear);

    const filename = `lexdoc-${tabLabel}-${getDateStamp()}.${format}`;
    const mimeType = format === 'txt' ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8';
    downloadFile(content, filename, mimeType);
    toast.success(t('reports.exportSuccess'));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 me-2" />
          {t('reports.export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleExport('txt')}>
          {t('reports.exportTxt')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          {t('reports.exportCsv')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

### Modified Files

#### 9. `src/App.tsx`
- **Action:** Modify (2 changes)
- **Line ~1 (imports section):** Add `import { ReportsView } from '@/components/reports/ReportsView';`
- **Line ~82 (route):** Replace `<Route path="reports" element={<SectionPlaceholder section="reports" />} />` with `<Route path="reports" element={<ReportsView />} />`

---

#### 10. `src/i18n/he.ts`
- **Action:** Modify
- **Changes:** Add `reports.*` section keys (insert after existing sections, before closing brace)

Keys to add:
```typescript
// Reports
'reports.title': 'דוחות',
'reports.description': 'ניתוח שעות עבודה והגשות',
'reports.tabs.hoursByStaff': 'שעות לפי עובד',
'reports.tabs.hoursByClient': 'שעות לפי לקוח',
'reports.tabs.filingStatus': 'סטטוס הגשות',
'reports.fromDate': 'מתאריך',
'reports.toDate': 'עד תאריך',
'reports.year': 'שנה',
'reports.export': 'ייצוא דוח',
'reports.exportTxt': 'ייצוא TXT',
'reports.exportCsv': 'ייצוא CSV',
'reports.totalHours': 'סה"כ שעות',
'reports.entries': 'רשומות',
'reports.filed': 'הוגש',
'reports.pending': 'ממתין',
'reports.late': 'באיחור',
'reports.total': 'סה"כ',
'reports.completion': 'אחוז השלמה',
'reports.noData': 'אין נתונים לתקופה זו',
'reports.noFilings': 'אין נתוני הגשות',
'reports.exportSuccess': 'הדוח יוצא בהצלחה',
'reports.summaryRow': 'סיכום',
```

---

#### 11. `src/i18n/ar.ts`
- **Action:** Modify
- **Changes:** Add matching `reports.*` keys in Arabic

```typescript
// Reports
'reports.title': 'التقارير',
'reports.description': 'تحليل ساعات العمل والتقديمات',
'reports.tabs.hoursByStaff': 'الساعات حسب الموظف',
'reports.tabs.hoursByClient': 'الساعات حسب العميل',
'reports.tabs.filingStatus': 'حالة التقديمات',
'reports.fromDate': 'من تاريخ',
'reports.toDate': 'إلى تاريخ',
'reports.year': 'السنة',
'reports.export': 'تصدير التقرير',
'reports.exportTxt': 'تصدير TXT',
'reports.exportCsv': 'تصدير CSV',
'reports.totalHours': 'إجمالي الساعات',
'reports.entries': 'سجلات',
'reports.filed': 'تم التقديم',
'reports.pending': 'قيد الانتظار',
'reports.late': 'متأخر',
'reports.total': 'الإجمالي',
'reports.completion': 'نسبة الإنجاز',
'reports.noData': 'لا توجد بيانات لهذه الفترة',
'reports.noFilings': 'لا توجد بيانات تقديم',
'reports.exportSuccess': 'تم تصدير التقرير بنجاح',
'reports.summaryRow': 'الملخص',
```

---

#### 12. `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add matching `reports.*` keys in English

```typescript
// Reports
'reports.title': 'Reports',
'reports.description': 'Work hours and filing analytics',
'reports.tabs.hoursByStaff': 'Hours by Staff',
'reports.tabs.hoursByClient': 'Hours by Client',
'reports.tabs.filingStatus': 'Filing Status',
'reports.fromDate': 'From Date',
'reports.toDate': 'To Date',
'reports.year': 'Year',
'reports.export': 'Export Report',
'reports.exportTxt': 'Export TXT',
'reports.exportCsv': 'Export CSV',
'reports.totalHours': 'Total Hours',
'reports.entries': 'Entries',
'reports.filed': 'Filed',
'reports.pending': 'Pending',
'reports.late': 'Late',
'reports.total': 'Total',
'reports.completion': 'Completion %',
'reports.noData': 'No data for this period',
'reports.noFilings': 'No filing data',
'reports.exportSuccess': 'Report exported successfully',
'reports.summaryRow': 'Summary',
```

---

#### 13. `docs/plans/SHARED-CODE-REGISTRY.md`
- **Action:** Modify
- **Changes:** Add entries for the new utility, service, and hooks

In the **Utilities** table, add:
```
| `report-utils.ts` | `aggregateHoursByStaff()`, `aggregateHoursByClient()`, `aggregateFilingStatus()`, `StaffAggregation`, `ClientHoursAggregation`, `ClientFilingRow`, `BreakdownItem` | Reports |
```

In the **Services** table, add:
```
| `reportService.ts` | `reportService` — firm-wide hours and filings queries for reports | Reports |
```

In the **Hooks** table, add:
```
| `useReports.ts` | `reportKeys`, `useReportHours`, `useReportFilings` | Reports |
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        ReportsView                          │
│  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────┐ │
│  │ Date Range State │ │ Filing Year State│ │ Active Tab   │ │
│  └────────┬────────┘ └────────┬─────────┘ └──────────────┘ │
│           │                   │                              │
│           ▼                   ▼                              │
│  ┌────────────────┐ ┌──────────────────┐                    │
│  │ useReportHours │ │ useReportFilings │ (React Query)      │
│  └────────┬───────┘ └───────┬──────────┘                    │
│           │                 │                                │
│           ▼                 ▼                                │
│  ┌────────────────┐ ┌──────────────────┐                    │
│  │ reportService  │ │ reportService    │ (Supabase client)  │
│  │ .hoursByFirm() │ │ .filingsByFirm() │                    │
│  └────────┬───────┘ └───────┬──────────┘                    │
│           │                 │                                │
│           ▼                 ▼                                │
│  ┌─────────────────────────────────────┐                    │
│  │         Supabase (PostgreSQL)       │                    │
│  │   hours_log table  |  filings table │                    │
│  │   (RLS: firm_id)   |  (RLS: firm_id)│                    │
│  └─────────────────────────────────────┘                    │
│                                                             │
│  Response flows back up:                                    │
│  DB → service (rowToX mapper) → hook (cached) → component  │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          report-utils.ts (shared pure functions)       │ │
│  │  aggregateHoursByStaff() | aggregateHoursByClient()   │ │
│  │  aggregateFilingStatus() — uses isOverdue() from      │ │
│  │  dates.ts for timezone-correct late detection          │ │
│  └──────────────────────┬─────────────────────────────────┘ │
│                         │ called by both:                    │
│              ┌──────────┴───────────┐                        │
│              ▼                      ▼                        │
│  ┌──────────────────────┐  ┌──────────────────┐             │
│  │   Tab Components     │  │  ReportExport    │             │
│  │  (useMemo wraps the  │  │  (calls same     │             │
│  │   aggregation fns)   │  │   aggregation    │             │
│  │  HoursByStaff        │  │   fns on export  │             │
│  │  HoursByClient       │  │   click)         │             │
│  │  FilingStatus        │  │                  │             │
│  └──────────────────────┘  └──────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Changes

None. No new tables, columns, indexes, migrations, RLS policies, or GRANTs are needed. All reports are derived from existing `hours_log` and `filings` tables via read-only queries already protected by RLS.

---

## Edge Cases & Error Handling

1. **Empty date range (fromDate > toDate)** -- The Supabase query returns 0 rows, `EmptyState` renders naturally. No validation needed since native `<input type="date">` does not prevent inverted ranges, but the result is simply empty data. Acceptable behavior.

2. **Staff member deleted after logging hours** -- `hours_log.staff_name` is denormalized, so the name displays correctly even if the staff record is soft-deleted. `staff.find(s => s.id === entry.staffId)` may return undefined for role lookup, which falls back to empty string. No crash.

3. **Client archived/deleted** -- Same pattern: `clients.find()` may return undefined, fallback to `''` for name. Archived clients with hours in the period still appear in reports, which is correct behavior.

4. **Very large hours_log dataset** -- At firm scale (likely < 10,000 rows per year), client-side aggregation with `useMemo` is fast. The service fetches only rows within the date range, limiting data volume.

5. **Filing status late detection race condition** -- A filing with `status === 'pending'` and `isOverdue(f.due)` is detected as late in the report even if the `filings` table hasn't been updated to `status = 'late'`. The `isOverdue()` function from `src/lib/dates.ts` uses `startOfDay(new Date())` in local time (IST), avoiding the UTC timezone bug. This matches `filingService.lateCountsByFirm` behavior. This is the correct behavior per requirements (real-time late detection vs. batch update).

6. **CSV Hebrew Excel compatibility** -- The UTF-8 BOM (`\uFEFF`) prefix ensures Excel opens the file with correct Hebrew encoding. This is a well-known workaround.

7. **Year picker boundary** -- Only shows current year and 2 prior years. Filings for future years are unlikely but not harmful if the year is changed programmatically.

8. **Export with no data** -- Export generates a file with headers only (no data rows). The empty file is still valid. A toast success is still shown.

---

## Performance Considerations

- **Single query per data type** -- `useReportHours` fetches all firm hours in date range in one query, shared between both hours tabs via React Query cache. No duplicate fetches.
- **`useMemo` for aggregation** -- Aggregation only recomputes when `hours`, `staff`, or `clients` arrays change (referential equality from React Query cache).
- **Date range as query key** -- Changing the date range triggers a new fetch with the new range, leveraging Supabase server-side filtering.
- **No `select *` optimization needed** -- The hours_log table has ~8 columns, all needed for the report. No benefit to selecting a subset.
- **Export re-aggregation** -- The export functions re-aggregate data from the raw arrays. This is a one-time computation on button click, not a render-cycle concern. For moderate data volumes, this is negligible.

---

## i18n / RTL Implications

### New translation keys
22 keys added to all 3 language files (`he.ts`, `ar.ts`, `en.ts`), all under the `reports.*` namespace. See the exact keys in the file-by-file plan above.

### RTL layout considerations
- **Date inputs** -- `dir="ltr"` on all `<input type="date">` elements (dates are always LTR).
- **Numeric values** -- `dir="ltr"` on hours totals and percentage values.
- **Progress bars** -- CSS `width` percentages are direction-agnostic, no RTL concern.
- **Cards layout** -- Using `me-*` / `ms-*` logical properties where horizontal spacing is needed.
- **Export dropdown** -- `DropdownMenu` from shadcn handles RTL automatically via Radix.
- **Tab ordering** -- Tabs render in DOM order; in RTL, the first tab is rightmost, which is correct for Hebrew/Arabic reading direction.

---

## Self-Critique

### What could go wrong
1. **TXT export format is hardcoded in Hebrew** -- The TXT export uses Hebrew headers regardless of the user's current language. This matches the requirement ("Hebrew headers") but may surprise Arabic or English users. The CSV export also uses Hebrew headers. This is a design decision from the requirements, not a bug.

2. **No memoization of export functions** -- The export generates content on each click (calling the shared aggregation functions). For very large datasets, this could cause a brief UI freeze. In practice, firm-level data is unlikely to cause noticeable latency.

3. **DataTable summary row** -- The filing status summary is rendered outside the DataTable as a separate div. This means the summary row does not sort/filter with the table. This is actually desirable (the summary should always be visible), but it is slightly inconsistent with the visual expectation of a table footer.

4. **~~Aggregation duplication~~ (RESOLVED)** -- Previously, aggregation logic would have been duplicated between components and export. Now resolved by extracting shared pure functions into `src/lib/report-utils.ts`. Both consumers call the same functions.

### Alternative approaches considered
- **Server-side aggregation (DB functions)** -- Rejected per user decision. Would require migrations, function maintenance, and RPC calls. Client-side is simpler and matches BillingView pattern.
- **Shared aggregation hooks** -- Considered creating `useHoursByStaff` and `useHoursByClient` as separate hooks that do both fetching and aggregation. Rejected because: (a) both need the same raw data, (b) aggregation is a component concern, not a data-fetching concern, (c) it would create React Query cache entries with aggregated data that can't be reused across tabs.
- **Chart.js / Recharts for visualization** -- Rejected per requirements (progress bars only, no chart library). Keeps bundle size minimal.
- **Extracting common card layout** -- The HoursByStaff and HoursByClient cards share similar structure but differ in detail (role vs case number, client vs staff breakdown). Extracting a shared `ReportCard` would add abstraction for only 2 consumers. Not worth it.
