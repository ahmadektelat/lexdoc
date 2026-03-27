# Filings Module — Technical Design

## Architecture Overview

### Component Tree

```
App.tsx
├── /filings route
│   └── FilingsView
│       ├── PageHeader (shared)
│       │   └── Year selector (prev / current / next)
│       ├── Two-column layout (flex)
│       │   ├── Left: Client sidebar
│       │   │   ├── SearchInput for filtering client list
│       │   │   └── Client list items (name + late badge)
│       │   └── Right: Main panel (shows when client selected)
│       │       ├── Metrics bar (filed / pending / late counts)
│       │       ├── FilingSettingsPanel
│       │       │   ├── VAT frequency toggle
│       │       │   ├── Tax advances enable/disable + frequency
│       │       │   ├── Tax deductions enable/disable + frequency
│       │       │   ├── NII deductions enable/disable + frequency
│       │       │   └── Save & Generate button
│       │       ├── Type filter tabs (All / maam / mekadmot / nikuyim / nii)
│       │       └── FilingScheduleTable
│       │           ├── Columns: type badge, period, due date, status, filed date, actions
│       │           └── Row: red bg if overdue
│       └── EmptyState (when no client selected)
│
└── ClientDetailView > ClientTabs
    └── "filings" tab
        └── FilingsClientTab
            ├── FilingSettingsPanel
            ├── Metrics bar
            └── FilingScheduleTable
```

### Data Flow

```
User selects client → useFilingSettings(firmId, clientId) → Supabase filing_settings
                     → useFilings(firmId, clientId, year) → Supabase filings

User saves settings → filingSettingService.save() → upsert filing_settings
                    → filingService.regenerateSchedule() → generates schedule, merges with existing
                    → invalidate filing + settings queries

User marks filed → filingService.markFiled(firmId, id) → update filings set status='filed'
                 → taskService.cancelAutoTaskForFiling(firmId, filingId) → soft-delete auto-tasks
                 → invalidate filing + task queries

User marks late → filingService.markLate(firmId, id) → update filings set status='late'
               → invalidate filing queries

User resets → filingService.resetToPending(firmId, id) → update filings set status='pending', filed_date=null
           → invalidate filing queries
```

---

## Design Decisions

### 1. DataTable row styling: Build a custom table for FilingScheduleTable

**Decision:** Build a custom, purpose-built table component inside `FilingScheduleTable` rather than extending `DataTable` with a `rowClassName` callback.

**Rationale:**
- `DataTable` is a general-purpose reusable component. Adding `rowClassName` is a small API change, but it sets a precedent for bolting domain-specific behavior onto a shared component.
- `FilingScheduleTable` needs highly specialized rendering: colored type badges via `FILING_TYPE_COLORS`, conditional red background for overdue rows, inline action buttons (Mark Filed / Mark Late / Reset), and no need for search, pagination, or sorting from DataTable.
- The filing schedule for a single client + year is bounded (max ~42 rows: 12 monthly * 4 types minus disabled). Pagination/search overhead is unnecessary.
- Building a custom table keeps `DataTable` clean and gives full control over row styling. The table markup follows the same Tailwind patterns as DataTable for visual consistency (same border, padding, header styling).

### 2. Schedule regeneration merge algorithm

The `filingService.regenerateSchedule` method must preserve existing filed/late statuses when settings change. The algorithm:

```
regenerateSchedule(firmId, clientId, year, settings):
  1. Call generateFilingSchedule(settings, year) to produce the "desired" schedule
  2. Fetch all existing filings for this client+year:
     SELECT * FROM filings WHERE firm_id=? AND client_id=? AND period LIKE 'YYYY%' AND deleted_at IS NULL
  3. Build a lookup map of existing filings: Map<string, Filing> keyed by `${type}:${period}`
  4. For each desired filing:
     - Compute key = `${type}:${period}`
     - If key exists in map:
       → Keep the existing row as-is (preserve status, filedDate, id)
       → Remove key from map (mark as "matched")
     - If key does NOT exist in map:
       → INSERT new filing row (firm_id, client_id, type, period, due, status='pending')
  5. For each remaining (unmatched) entry in the map:
     - These are filings that no longer belong to the new schedule
     - If status === 'filed': keep it (do NOT soft-delete filed filings — they are historical records)
     - If status === 'pending' or 'late': soft-delete (UPDATE deleted_at = now())
  6. Return void (caller invalidates queries)
```

This ensures:
- Filed filings are never lost when settings change
- Switching from monthly to bimonthly removes unfiled monthly entries and creates bimonthly ones
- Switching from bimonthly to monthly creates monthly entries and removes unfiled bimonthly ones

### 3. Year selector state management: Local component state

**Decision:** Use `useState` within `FilingsView` for the selected year.

**Rationale:**
- URL params add complexity and this view does not need deep-linkable year state. The year selector is a UX convenience, not a navigational concern.
- Zustand would be overkill for a single integer that only matters within this view.
- Default to `new Date().getFullYear()` on mount. Prev/next buttons decrement/increment. Keep it simple.

### 4. Client selection state management: Local component state

**Decision:** Use `useState` within `FilingsView` for `selectedClientId`.

**Rationale:**
- Same reasoning as year selector. The CRM module (`CrmView.tsx`) uses `useState` for its client filter dropdown. We follow the same pattern.
- The FilingsView's client selection is local UI state — no other component needs to know which client is selected.

---

## File-by-File Change Plan

### New Files

#### 1. `supabase/migrations/20260319100001_create_filings_tables.sql`
- **Action:** Create
- **Changes:** Full migration with `filings` table, `filing_settings` table, FK on `tasks.filing_id`, indexes, RLS, triggers, GRANTs
- **Rationale:** Database schema required for the module

#### 2. `src/services/filingService.ts`
- **Action:** Create
- **Changes:** Service object with: `list`, `markFiled`, `markLate`, `resetToPending`, `regenerateSchedule` methods. Follows `contactService.ts` pattern with `rowToFiling` mapper.
- **Rationale:** Data access layer for filings

#### 3. `src/services/filingSettingService.ts`
- **Action:** Create
- **Changes:** Service object with: `get`, `save` methods. Uses Supabase `.upsert()` for save. Follows `contactService.ts` pattern with `rowToFilingSetting` / `settingToRow` mappers.
- **Rationale:** Data access layer for filing settings

#### 4. `src/hooks/useFilings.ts`
- **Action:** Create
- **Changes:** Query keys, `useFilings(firmId, clientId, year)`, `useMarkFiled()`, `useMarkLate()`, `useResetToPending()`, `useRegenerateSchedule()`. Follows `useContacts.ts` pattern.
- **Rationale:** React Query hooks for filings

#### 5. `src/hooks/useFilingSettings.ts`
- **Action:** Create
- **Changes:** Query keys, `useFilingSettings(firmId, clientId)`, `useSaveFilingSettings()`. Follows `useContacts.ts` pattern.
- **Rationale:** React Query hooks for filing settings

#### 6. `src/components/filings/FilingsView.tsx`
- **Action:** Create
- **Changes:** Main view with two-column layout, client sidebar, year selector, type filter, metrics bar, permission guard
- **Rationale:** Primary filings page

#### 7. `src/components/filings/FilingSettingsPanel.tsx`
- **Action:** Create
- **Changes:** Per-client settings editor with VAT frequency, enable/disable toggles, save button
- **Rationale:** Settings management UI

#### 8. `src/components/filings/FilingScheduleTable.tsx`
- **Action:** Create
- **Changes:** Custom table with type badges, status badges, conditional row styling, action buttons
- **Rationale:** Core filing schedule display

#### 9. `src/components/filings/FilingsClientTab.tsx`
- **Action:** Create
- **Changes:** Wrapper for embedding in ClientDetailView — includes settings panel, metrics bar, and schedule table for a specific client
- **Rationale:** Embedded client tab view

### Modified Files

#### 10. `src/App.tsx` (line 73)
- **Action:** Modify
- **Changes:** Replace `<SectionPlaceholder section="filings" />` with `<FilingsView />`. Add import for `FilingsView`.
- **Rationale:** Route wiring

#### 11. `src/components/clients/ClientTabs.tsx` (lines 31-36)
- **Action:** Modify
- **Changes:** Replace filings tab `EmptyState` with `<FilingsClientTab clientId={clientId} />`. Add import. Remove unused `BarChart3` import.
- **Rationale:** Wire client tab

#### 12. `src/services/taskService.ts` (lines 157-160)
- **Action:** Modify
- **Changes:** Implement `cancelAutoTaskForFiling` — replace stub body with actual Supabase UPDATE query that soft-deletes auto-tasks linked to the filing_id.
- **Rationale:** Auto-task integration

#### 13. `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add all new `filings.*` translation keys listed in requirements
- **Rationale:** i18n compliance

#### 14. `src/lib/constants.ts` (SYSTEM_ROLES manager permissions, line 142-148)
- **Action:** Modify
- **Changes:** Add `'filings.view', 'filings.edit'` to the `manager` role's permissions array. The manager role currently has no filings permissions, which means managers cannot view or manage filings for their clients. Since managers already have `clients.view/create/edit/delete` and `crm.view/manage`, filings are a natural extension of their client management responsibilities.
- **Rationale:** Managers need to view and manage filing schedules for clients they oversee. Without this, only admins and editors can access filings, which creates an operational bottleneck. Excluded: `filings.create` and `filings.delete` — schedule creation happens via regenerateSchedule (which requires `filings.edit`), and deletion is not exposed in the UI.

---

## Database Migration

```sql
-- ============================================================
-- Filings Module: filings, filing_settings
-- CREATED: 2026-03-19
-- ============================================================

-- ---------- FILINGS ----------
CREATE TABLE filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('maam', 'mekadmot', 'nikuyim', 'nii')),
  period TEXT NOT NULL,
  due DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'late')),
  filed_date DATE,
  note TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_filings_firm_id ON filings(firm_id);
CREATE INDEX idx_filings_firm_client ON filings(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_filings_firm_client_due ON filings(firm_id, client_id, due) WHERE deleted_at IS NULL;
CREATE INDEX idx_filings_firm_status ON filings(firm_id, status) WHERE deleted_at IS NULL;

-- Unique partial index: prevents duplicate active filings for the same client/type/period
-- Guards against race conditions during concurrent regenerateSchedule calls
CREATE UNIQUE INDEX idx_filings_unique_active
  ON filings(firm_id, client_id, type, period) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE filings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "filings_select" ON filings FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "filings_insert" ON filings FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "filings_update" ON filings FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "filings_delete" ON filings FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER filings_updated_at BEFORE UPDATE ON filings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON filings TO authenticated;

-- ---------- FILING_SETTINGS ----------
CREATE TABLE filing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  vat_freq TEXT NOT NULL DEFAULT 'monthly' CHECK (vat_freq IN ('monthly', 'bimonthly')),
  tax_adv_enabled BOOLEAN NOT NULL DEFAULT false,
  tax_adv_freq TEXT NOT NULL DEFAULT 'monthly' CHECK (tax_adv_freq IN ('monthly', 'bimonthly')),
  tax_deduct_enabled BOOLEAN NOT NULL DEFAULT false,
  tax_deduct_freq TEXT NOT NULL DEFAULT 'monthly' CHECK (tax_deduct_freq IN ('monthly', 'bimonthly')),
  nii_deduct_enabled BOOLEAN NOT NULL DEFAULT false,
  nii_deduct_freq TEXT NOT NULL DEFAULT 'monthly' CHECK (nii_deduct_freq IN ('monthly', 'bimonthly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(firm_id, client_id)
);

-- RLS
ALTER TABLE filing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "filing_settings_select" ON filing_settings FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "filing_settings_insert" ON filing_settings FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "filing_settings_update" ON filing_settings FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "filing_settings_delete" ON filing_settings FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER filing_settings_updated_at BEFORE UPDATE ON filing_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON filing_settings TO authenticated;

-- ---------- FK: tasks.filing_id → filings.id ----------
ALTER TABLE tasks ADD CONSTRAINT tasks_filing_id_fkey
  FOREIGN KEY (filing_id) REFERENCES filings(id);
```

---

## Service Layer

### `filingService.ts`

```typescript
// Method signatures and key logic

function rowToFiling(row: Record<string, unknown>): Filing {
  // Maps DB columns to TypeScript Filing interface
  // DB: filed_date → TS: filedDate
  // DB: due (DATE) → TS: due (string)
}

function filingInputToRow(input: CreateFilingInput): Record<string, unknown> {
  // Maps TS CreateFilingInput to DB row
  // TS: filedDate → DB: filed_date
}

export const filingService = {
  async list(firmId: string, clientId: string, year: number): Promise<Filing[]>
  // SELECT * FROM filings
  // WHERE firm_id=? AND client_id=? AND period LIKE 'year%' AND deleted_at IS NULL
  // ORDER BY due ASC
  // Uses: .like('period', `${year}%`)

  async markFiled(firmId: string, id: string): Promise<Filing>
  // UPDATE filings SET status='filed', filed_date=CURRENT_DATE
  // WHERE id=? AND firm_id=?
  // Returns updated filing

  async markLate(firmId: string, id: string): Promise<Filing>
  // UPDATE filings SET status='late'
  // WHERE id=? AND firm_id=?

  async resetToPending(firmId: string, id: string): Promise<Filing>
  // UPDATE filings SET status='pending', filed_date=NULL
  // WHERE id=? AND firm_id=?

  async regenerateSchedule(
    firmId: string,
    clientId: string,
    year: number,
    settings: FilingSetting
  ): Promise<void>
  // Algorithm:
  // 1. const desired = generateFilingSchedule(settings, year)
  // 2. const existing = await this.list(firmId, clientId, year)
  // 3. Build existingMap: Map<`${type}:${period}`, Filing>
  // 4. For each d in desired:
  //    key = `${d.type}:${d.period}`
  //    if existingMap.has(key) → remove from map (keep existing row)
  //    else → collect for batch insert
  // 5. Batch insert new filings via supabase.from('filings').insert(newRows)
  // 6. For each remaining in existingMap:
  //    if status !== 'filed' → soft-delete via update deleted_at
  // 7. Return void
};
```

**DB column name → TS field name mappings:**
| DB column | TS field |
|-----------|----------|
| `filed_date` | `filedDate` |
| `firm_id` | `firm_id` |
| `client_id` | `client_id` |
| `deleted_at` | `deleted_at` |
| `created_at` | `created_at` |
| `updated_at` | `updated_at` |

### `filingSettingService.ts`

```typescript
function rowToFilingSetting(row: Record<string, unknown>): FilingSetting {
  // Maps DB columns to TypeScript FilingSetting interface
  // DB: vat_freq → TS: vatFreq
  // DB: tax_adv_enabled → TS: taxAdvEnabled
  // DB: tax_adv_freq → TS: taxAdvFreq
  // DB: tax_deduct_enabled → TS: taxDeductEnabled
  // DB: tax_deduct_freq → TS: taxDeductFreq
  // DB: nii_deduct_enabled → TS: niiDeductEnabled
  // DB: nii_deduct_freq → TS: niiDeductFreq
  // DB: client_id → TS: clientId
}

function settingToRow(setting: FilingSetting, firmId: string): Record<string, unknown> {
  // Reverse mapping + adds firm_id
}

export const filingSettingService = {
  async get(firmId: string, clientId: string): Promise<FilingSetting | null>
  // SELECT * FROM filing_settings WHERE firm_id=? AND client_id=?
  // Returns null if no settings exist (new client)
  // Uses .maybeSingle()

  async save(firmId: string, setting: FilingSetting): Promise<FilingSetting>
  // UPSERT into filing_settings
  // Uses supabase.from('filing_settings').upsert(row, { onConflict: 'firm_id,client_id' })
  // Returns the saved setting
};
```

### `taskService.ts` modification (line 158)

```typescript
async cancelAutoTaskForFiling(firmId: string, filingId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('firm_id', firmId)
    .eq('filing_id', filingId)
    .eq('is_auto', true)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
}
```

---

## Hook Layer

### `useFilings.ts`

```typescript
export const filingKeys = {
  all: ['filings'] as const,
  lists: () => [...filingKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string, year: number) =>
    [...filingKeys.lists(), firmId, clientId, year] as const,
};

export function useFilings(firmId: string | null, clientId: string | undefined, year: number)
// queryKey: filingKeys.list(firmId, clientId, year)
// queryFn: filingService.list(firmId, clientId, year)
// enabled: !!firmId && !!clientId

export function useMarkFiled()
// mutationFn: ({ firmId, id }) => filingService.markFiled(firmId, id)
// onSuccess: invalidate filingKeys.lists(), toast t('filings.markedFiled')
// Also call cancelAutoTaskForFiling in onSuccess

export function useMarkLate()
// mutationFn: ({ firmId, id }) => filingService.markLate(firmId, id)
// onSuccess: invalidate filingKeys.lists(), toast t('filings.markedLate')

export function useResetToPending()
// mutationFn: ({ firmId, id }) => filingService.resetToPending(firmId, id)
// onSuccess: invalidate filingKeys.lists(), toast t('filings.resetSuccess')

export function useRegenerateSchedule()
// mutationFn: ({ firmId, clientId, year, settings }) =>
//   filingService.regenerateSchedule(firmId, clientId, year, settings)
// onSuccess: invalidate filingKeys.lists(), toast t('filings.settingsUpdated')
```

**Invalidation strategy:**
- All mutations invalidate `filingKeys.lists()` (broad invalidation is safe — bounded data set)
- `useMarkFiled` additionally invalidates `taskKeys.lists()` (since it cancels auto-tasks)
- `useRegenerateSchedule` additionally invalidates `filingSettingKeys.lists()` (since save + regenerate happen atomically from the user's perspective)

### `useFilingSettings.ts`

```typescript
export const filingSettingKeys = {
  all: ['filingSettings'] as const,
  lists: () => [...filingSettingKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string) =>
    [...filingSettingKeys.lists(), firmId, clientId] as const,
};

export function useFilingSettings(firmId: string | null, clientId: string | undefined)
// queryKey: filingSettingKeys.list(firmId, clientId)
// queryFn: filingSettingService.get(firmId, clientId)
// enabled: !!firmId && !!clientId

export function useSaveFilingSettings()
// mutationFn: ({ firmId, setting }) => filingSettingService.save(firmId, setting)
// onSuccess: invalidate filingSettingKeys.lists()
// Note: No separate toast — the caller (FilingSettingsPanel) chains this with regenerateSchedule,
//       and the regenerate mutation shows the toast
```

---

## Component Specifications

### `FilingsView.tsx`

**State:**
- `selectedClientId: string | null` — `useState(null)`
- `selectedYear: number` — `useState(new Date().getFullYear())`
- `selectedType: FilingType | '__all__'` — `useState('__all__')`
- `clientSearch: string` — `useState('')`

**Year clamping:** The year selector is clamped to `currentYear - 1` through `currentYear + 1` (3 years total). The prev button is `disabled` when `selectedYear <= currentYear - 1` and the next button is `disabled` when `selectedYear >= currentYear + 1`. This prevents users from navigating to arbitrary years and generating empty or nonsensical schedules. The `currentYear` is computed once via `new Date().getFullYear()` and stored in a `useMemo` or `const` (stable across renders).

**Hooks:**
- `useLanguage()` → `t`
- `useAuthStore` → `firmId`, `can`
- `useClients(firmId)` → client list for sidebar
- `useFilings(firmId, selectedClientId, selectedYear)` → filing list
- `useFilingSettings(firmId, selectedClientId)` → settings for selected client

**Permission guard:** `if (!can('filings.view'))` → return unauthorized message (same as CrmView pattern)

**Layout:**
```
<div className="p-6 animate-fade-in">
  <PageHeader title={t('filings.title')} description={t('filings.description')}>
    {/* Year selector: ChevronLeft | year | ChevronRight — clamped to currentYear ± 1 */}
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon"
        disabled={selectedYear <= currentYear - 1}
        onClick={() => setSelectedYear(y => y - 1)}>
        <ChevronRight />  {/* RTL: right = previous */}
      </Button>
      <span className="text-lg font-semibold w-16 text-center">{selectedYear}</span>
      <Button variant="outline" size="icon"
        disabled={selectedYear >= currentYear + 1}
        onClick={() => setSelectedYear(y => y + 1)}>
        <ChevronLeft />  {/* RTL: left = next */}
      </Button>
    </div>
  </PageHeader>

  <div className="flex gap-6">
    {/* Left sidebar */}
    <div className="w-64 shrink-0 space-y-2">
      <h3 className="text-sm font-medium">{t('filings.clients')}</h3>
      <SearchInput value={clientSearch} onChange={setClientSearch} />
      <div className="border rounded-md max-h-[calc(100vh-220px)] overflow-y-auto">
        {filteredClients.map(client => (
          <ClientSidebarItem
            key={client.id}
            client={client}
            isSelected={client.id === selectedClientId}
            lateCount={lateCountByClient[client.id]}
            onClick={() => setSelectedClientId(client.id)}
          />
        ))}
      </div>
    </div>

    {/* Right panel */}
    <div className="flex-1 min-w-0">
      {selectedClientId ? (
        <>
          <MetricsBar filings={filings} />
          <FilingSettingsPanel
            firmId={firmId}
            clientId={selectedClientId}
            year={selectedYear}
          />
          <TypeFilter selectedType={selectedType} onChange={setSelectedType} />
          <FilingScheduleTable
            filings={filteredFilings}
            firmId={firmId}
          />
        </>
      ) : (
        <EmptyState icon={BarChart3} title={t('filings.selectClient')} />
      )}
    </div>
  </div>
</div>
```

**Computed values:**
- `filteredClients`: clients filtered by `clientSearch` (name match)
- `lateCountByClient`: For the sidebar badge — requires a separate lightweight query OR computed client-side. Since we only have filings for the selected client, the sidebar badge should show late counts across ALL clients. Two options:
  - (a) Fetch all filings for the firm+year (expensive)
  - (b) Only show the badge for the currently selected client
  - **Decision: (b)** — Only highlight the selected client. Fetching all filings for all clients just for sidebar badges is wasteful. The sidebar item for the selected client will show the late count from the already-loaded data. Other clients show no badge. This is pragmatic and avoids N+1 queries.
  - CORRECTION: Re-reading the requirements more carefully — "Client sidebar shows late filing count badge per client." This is an explicit requirement. To avoid N+1 queries or a massive all-filings fetch, we use a single aggregation query.

**Late count sidebar approach:**
- Add a `filingService.lateCountsByFirm(firmId, year)` method that runs:
  ```sql
  SELECT client_id, COUNT(*) as late_count FROM filings
  WHERE firm_id = ? AND period LIKE 'year%' AND deleted_at IS NULL
    AND (status = 'late' OR (status = 'pending' AND due < CURRENT_DATE))
  GROUP BY client_id
  ```
- Add a `useFilingLateCounts(firmId, year)` hook.
- This is a single lightweight query that returns `Record<string, number>`.
- Invalidated when any filing mutation succeeds.

**Metrics bar** (inline, not a separate component — too small):
```
<div className="grid grid-cols-3 gap-4 mb-4">
  <div className="bg-green-50 ... rounded-lg p-3 text-center">
    <div className="text-2xl font-bold">{filedCount}</div>
    <div className="text-sm">{t('filings.metrics.filed')}</div>
  </div>
  {/* pending, late similarly */}
</div>
```

Metrics computation:
- `filedCount`: filings with `status === 'filed'`
- `pendingCount`: filings with `status === 'pending'` AND NOT overdue
- `lateCount`: filings with `status === 'late'` OR (`status === 'pending'` AND `isOverdue(due)`)

This matches the requirement from observation #6 — auto-overdue pending filings count as late in metrics.

**Type filter** (inline, using Tabs or a simple button group):
```
<Tabs value={selectedType} onValueChange={setSelectedType}>
  <TabsList>
    <TabsTrigger value="__all__">{t('filings.allTypes')}</TabsTrigger>
    <TabsTrigger value="maam">{t('filings.vatReport')}</TabsTrigger>
    <TabsTrigger value="mekadmot">{t('filings.taxAdvances')}</TabsTrigger>
    <TabsTrigger value="nikuyim">{t('filings.incomeTaxDeductions')}</TabsTrigger>
    <TabsTrigger value="nii">{t('filings.niiDeductions')}</TabsTrigger>
  </TabsList>
</Tabs>
```

**Client sidebar item** (inline render, not a separate component):
- Client name
- Badge with late count (only if > 0) using `lateCountsByClient[client.id]`
- Selected state: `bg-accent` background
- Active clients only (filter out archived)

### `FilingSettingsPanel.tsx`

**Props:**
```typescript
interface FilingSettingsPanelProps {
  firmId: string;
  clientId: string;
  year: number;
}
```

**State:**
- `localSettings: FilingSetting` — `useState` initialized from `useFilingSettings` data or defaults
- `isEditing: boolean` — `useState(false)` — toggles between read-only summary and edit mode
- `isDirty: boolean` — computed by comparing `localSettings` to fetched settings

**Default settings** (when no settings exist for the client):
```typescript
const DEFAULT_SETTINGS: FilingSetting = {
  clientId: props.clientId,
  vatFreq: 'monthly',
  taxAdvEnabled: false,
  taxAdvFreq: 'monthly',
  taxDeductEnabled: false,
  taxDeductFreq: 'monthly',
  niiDeductEnabled: false,
  niiDeductFreq: 'monthly',
};
```

**Behavior:**
- On mount / clientId change: load settings from `useFilingSettings`. If null, use defaults.
- Edit mode shows form fields. Read-only mode shows a compact summary.
- "Save & Generate Schedule" button:
  1. Calls `useSaveFilingSettings().mutateAsync({ firmId, setting: localSettings })`
  2. Then calls `useRegenerateSchedule().mutateAsync({ firmId, clientId, year, settings: localSettings })`
  3. On success: exits edit mode, toast `t('filings.settingsUpdated')`
  4. On partial failure (settings saved, regenerate fails): show `toast.error(t('errors.saveFailed'))`. The settings are persisted but the schedule is stale. The button remains enabled so the user can retry. The settings query will be invalidated and re-fetched, so the UI stays consistent with the saved state. This is a recoverable state — clicking "Save & Generate" again will skip the settings upsert (idempotent) and retry the regeneration.
- Cancel button: resets `localSettings` to fetched values and exits edit mode

**Form fields:**
- VAT Frequency: `Select` with "monthly" / "bimonthly" options — always visible
- Tax Advances: `Switch` to enable + `Select` for frequency (visible only when enabled)
- Tax Deductions: `Switch` to enable + `Select` for frequency (visible only when enabled)
- NII Deductions: `Switch` to enable + `Select` for frequency (visible only when enabled)

Uses `FormField` wrapper for each, `Switch` from shadcn/ui for enable/disable toggles, `Select` for frequency dropdowns.

### `FilingScheduleTable.tsx`

**Props:**
```typescript
interface FilingScheduleTableProps {
  filings: Filing[];
  firmId: string;
}
```

**Hooks:**
- `useLanguage()` → `t`
- `useAuthStore` → `can`
- `useMarkFiled()`
- `useMarkLate()`
- `useResetToPending()`
- `useCancelAutoTaskForFiling()` from `useTasks.ts`

**Filing type i18n mapping:**

`FILING_TYPES` in `constants.ts` stores raw Hebrew strings, NOT i18n keys. The badge text must NOT use `FILING_TYPES[type]` directly. Instead, define a local constant mapping type codes to existing i18n keys:

```typescript
const FILING_TYPE_I18N_KEYS: Record<FilingType, string> = {
  maam: 'filings.vatReport',
  mekadmot: 'filings.taxAdvances',
  nikuyim: 'filings.incomeTaxDeductions',
  nii: 'filings.niiDeductions',
};
```

This constant is defined at the top of `FilingScheduleTable.tsx` (not in shared constants, since it is only used here and in `FilingsView` type filter tabs). The badge renders `t(FILING_TYPE_I18N_KEYS[filing.type])`. The color still comes from `FILING_TYPE_COLORS[type]` (which stores Tailwind color names, not translatable text).

**Columns:**
| Column | Content | Width |
|--------|---------|-------|
| Type | Colored badge: `<Badge className={bg-${FILING_TYPE_COLORS[type]}-100 text-${FILING_TYPE_COLORS[type]}-800}>{t(FILING_TYPE_I18N_KEYS[type])}</Badge>` | auto |
| Period | `filing.period` formatted (e.g., "01/2026" or "01-02/2026") | auto |
| Due Date | `formatDate(filing.due)` | auto |
| Status | `<StatusBadge status={effectiveStatus} />` where effectiveStatus accounts for auto-overdue | auto |
| Filed Date | `filing.filedDate ? formatDate(filing.filedDate) : '—'` | auto |
| Actions | Button group (see below) | auto |

**Effective status logic:**
```typescript
function getEffectiveStatus(filing: Filing): FilingStatus {
  if (filing.status === 'pending' && isOverdue(filing.due)) return 'late';
  return filing.status;
}
```

**Row styling:**
```typescript
const isOverdueRow = filing.status === 'pending' && isOverdue(filing.due);
// className: isOverdueRow ? 'bg-red-50 dark:bg-red-950/20' : ''
```

**Action buttons** (conditional on status and permissions):
- `status === 'pending'`:
  - "Mark Filed" button (green) — `can('filings.edit')` required
  - "Mark Late" button (red) — `can('filings.edit')` required
- `status === 'filed'`:
  - "Reset" button (outline) — `can('filings.edit')` required
  - Shows filed date instead of action buttons as primary content
- `status === 'late'`:
  - "Mark Filed" button (green) — `can('filings.edit')` required
  - "Reset" button (outline) — `can('filings.edit')` required

**Mark Filed flow:**
1. `markFiled.mutate({ firmId, id: filing.id })`
2. On success callback: `cancelAutoTask.mutate(filing.id)` (fire-and-forget, silent failure)

**Empty state:** When `filings.length === 0`, show `t('filings.noFilings')` message.

**Sorting:** Filings arrive pre-sorted by `due ASC` from the service. No client-side sorting needed.

### `FilingsClientTab.tsx`

**Props:**
```typescript
interface FilingsClientTabProps {
  clientId: string;
}
```

**State:**
- `selectedYear: number` — `useState(new Date().getFullYear())`
- `selectedType: FilingType | '__all__'` — `useState('__all__')`

**Hooks:**
- `useLanguage()` → `t`
- `useAuthStore` → `firmId`
- `useFilings(firmId, clientId, selectedYear)`
- `useFilingSettings(firmId, clientId)`

**Layout:**
```
<div className="space-y-4">
  {/* Year selector (same as in FilingsView) */}
  <div className="flex items-center justify-between">
    <h3>{t('filings.settings')}</h3>
    <YearSelector year={selectedYear} onChange={setSelectedYear} />
  </div>
  <FilingSettingsPanel firmId={firmId} clientId={clientId} year={selectedYear} />
  <MetricsBar filings={filings} />
  <TypeFilter selectedType={selectedType} onChange={setSelectedType} />
  <FilingScheduleTable filings={filteredFilings} firmId={firmId} />
</div>
```

This is a simpler version of FilingsView — no client sidebar (client is already known), no permission guard (parent ClientDetailView handles access), but includes the same settings panel, metrics, type filter, and table.

---

## i18n Additions

All keys from the requirements document section "New keys needed" will be added to all three language files. The exact key-value pairs are specified in `01-requirements.md` and are not repeated here to avoid duplication. The implementer should copy them verbatim.

Summary: 32 new keys in the `filings.*` namespace across `he.ts`, `ar.ts`, and `en.ts`.

---

## Integration Wiring

### App.tsx (line 73)

**Before:**
```tsx
<Route path="filings" element={<SectionPlaceholder section="filings" />} />
```

**After:**
```tsx
<Route path="filings" element={<FilingsView />} />
```

**Import to add:**
```tsx
import { FilingsView } from '@/components/filings/FilingsView';
```

### ClientTabs.tsx (lines 31-36)

**Before:**
```tsx
<TabsContent value="filings">
  <EmptyState
    icon={BarChart3}
    title={t('clients.tabs.filings')}
    description={t('clients.tabs.filingsPlaceholder')}
  />
</TabsContent>
```

**After:**
```tsx
<TabsContent value="filings">
  <FilingsClientTab clientId={clientId} />
</TabsContent>
```

**Import to add:**
```tsx
import { FilingsClientTab } from '@/components/filings/FilingsClientTab';
```

**Import to remove** (if no longer used elsewhere): `BarChart3` from `lucide-react` — verify that no other tab uses it before removing.

### taskService.ts (line 158)

Replace the stub body of `cancelAutoTaskForFiling` with the real implementation (see Service Layer section above).

---

## Implementation Order

Dependency-ordered sequence for the implementer:

1. **Database migration** — `20260319100001_create_filings_tables.sql`
   - Creates tables, indexes, RLS, triggers, GRANTs, FK
   - No code dependencies

2. **i18n keys** — `he.ts`, `ar.ts`, `en.ts`
   - Add all 32 new `filings.*` keys
   - No code dependencies, but needed by all components

3. **Services** — `filingService.ts`, `filingSettingService.ts`
   - Depends on: migration (tables must exist), types (already exist)
   - Also: implement `taskService.cancelAutoTaskForFiling`

4. **Hooks** — `useFilings.ts`, `useFilingSettings.ts`
   - Depends on: services

5. **Components** — Bottom-up:
   - a. `FilingScheduleTable.tsx` — depends on hooks, types, shared components
   - b. `FilingSettingsPanel.tsx` — depends on hooks, types, shared components
   - c. `FilingsClientTab.tsx` — depends on (a), (b), hooks
   - d. `FilingsView.tsx` — depends on (a), (b), hooks, plus client sidebar logic

6. **Integration wiring**:
   - a. `App.tsx` — swap route, add import
   - b. `ClientTabs.tsx` — swap tab content, add import

7. **Verification**:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run build`

---

## Additional Service Method: `lateCountsByFirm`

This was identified during component design. The client sidebar needs late counts for all clients.

### `filingService.lateCountsByFirm`

```typescript
async lateCountsByFirm(firmId: string, year: number): Promise<Record<string, number>>
// Runs a raw RPC or a filtered query:
// SELECT client_id, COUNT(*) FROM filings
// WHERE firm_id=? AND period LIKE 'year%' AND deleted_at IS NULL
//   AND (status = 'late' OR (status = 'pending' AND due < CURRENT_DATE))
// GROUP BY client_id
//
// Implementation note: Supabase JS client doesn't support GROUP BY natively.
// Two options:
//   (a) Use .rpc() with a Postgres function — cleaner but requires another migration
//   (b) Fetch all non-deleted filings for the firm+year and compute client-side
//
// Decision: Option (b) — fetch all filings for the firm+year.
// The dataset is bounded: ~50 clients * ~42 filings/client = ~2100 rows max per year.
// This avoids adding a Postgres function for a simple aggregation.
// Method:
//   1. SELECT id, client_id, status, due FROM filings WHERE firm_id=? AND period LIKE 'year%' AND deleted_at IS NULL
//   2. Filter client-side: status='late' OR (status='pending' AND due < today)
//   3. Group by client_id, count
//   4. Return Record<string, number>
```

### `useFilingLateCounts` hook

```typescript
export const filingLateCountKeys = {
  all: ['filingLateCounts'] as const,
  list: (firmId: string, year: number) => [...filingLateCountKeys.all, firmId, year] as const,
};

export function useFilingLateCounts(firmId: string | null, year: number)
// queryKey: filingLateCountKeys.list(firmId, year)
// queryFn: filingService.lateCountsByFirm(firmId, year)
// enabled: !!firmId
```

Invalidation: All filing mutations should also invalidate `filingLateCountKeys.all`.

---

## Edge Cases & Error Handling

1. **No settings for client** → `useFilingSettings` returns `null` → `FilingSettingsPanel` uses defaults → User must save settings before filings appear → The table shows "No filings to display" empty state.

2. **Switching year with no filings** → Table shows empty state. Settings panel remains editable. User can save settings and generate schedule for the new year.

3. **Settings change that removes a filing type (e.g., disable tax advances)** → `regenerateSchedule` soft-deletes unfiled `mekadmot` filings. Filed ones are preserved.

4. **Concurrent edits** → Supabase's optimistic concurrency handles this. The `updated_at` trigger ensures audit trail. No explicit locking needed for this use case. The `idx_filings_unique_active` partial unique index on `(firm_id, client_id, type, period) WHERE deleted_at IS NULL` prevents duplicate filings from being created if two `regenerateSchedule` calls race concurrently. The second insert will fail with a unique violation, which surfaces as an error toast and the user can retry.

5. **Overdue auto-detection** → A pending filing past its due date is visually marked as late (red row, late badge in metrics) but its `status` column remains `'pending'`. This is an intentional UI-only treatment. The user can explicitly "Mark Late" to persist the status.

6. **Cancel auto-task when no auto-task exists** → The `cancelAutoTaskForFiling` query will match zero rows and return successfully. No error.

7. **Filing marked filed then reset** → Reset clears `filed_date` and sets `status='pending'`. The previously cancelled auto-task is NOT restored (it was soft-deleted). This is acceptable behavior — the auto-task engine would recreate it on its next run if implemented.

---

## Performance Considerations

1. **Late counts query** — Fetches all filings for a firm+year. Bounded at ~2100 rows. The `idx_filings_firm_client_due` index covers this query efficiently. Acceptable for firms with up to 200 clients.

2. **Schedule regeneration** — Involves 1 SELECT + N INSERTs + M UPDATEs. For a single client, N+M <= 42. Supabase batch insert handles this efficiently.

3. **React Query caching** — `staleTime: 5 * 60 * 1000` (from global config) means filing data is cached for 5 minutes. This is appropriate for filing data which changes infrequently.

4. **No real-time subscription needed** — Filings are updated by the same user who views them. No need for Supabase realtime channels.

---

## i18n / RTL Implications

- **New translation keys**: 32 keys in `filings.*` namespace (see requirements doc)
- **RTL layout**: Year selector chevrons are swapped (ChevronRight = previous, ChevronLeft = next) because the app is RTL by default
- **Date formatting**: Uses `formatDate()` from `dates.ts` which outputs DD/MM/YYYY — appropriate for Israeli locale
- **Table layout**: Uses `text-start` for left-alignment in RTL (aligns to right), consistent with DataTable pattern
- **Client sidebar**: Placed at the "start" side (right in RTL). Using `flex` with natural document order — no explicit RTL handling needed since the sidebar comes first in DOM and RTL will place it on the right.

**Correction on sidebar placement:**
In RTL, the first flex child appears on the right. Since the sidebar is the first child in the flex container, it will naturally appear on the right side in RTL mode. The main content panel will be on the left. This matches the expected layout where the client list is a sidebar on the "start" side.

---

## Self-Critique

1. **Late counts query fetches all filings for the firm** — For very large firms (500+ clients, each with 42 filings = 21,000 rows), this could be slow. A Postgres function would be more efficient. However, the current approach is simpler and adequate for the expected firm sizes (< 200 clients). Can be optimized later with a `filing_late_counts` RPC if needed.

2. **No optimistic updates** — Mutations wait for the server response before updating the UI. For "Mark Filed" which is a common rapid action, this could feel sluggish. However, following the existing codebase pattern (no optimistic updates in any hook), this is consistent. Can be added later if UX feedback demands it.

3. **FilingSettingsPanel save + regenerate is two sequential mutations** — If the regenerate fails after settings are saved, the settings will be persisted but the schedule will be stale. This is unlikely (both are simple DB operations) and recoverable (user can re-click save). A database transaction would be ideal but Supabase JS client doesn't support client-side transactions. **Mitigated:** Error messaging guidance added to FilingSettingsPanel behavior spec — the button stays enabled on partial failure so the user can retry.

4. **Year selector clamped to `currentYear +/- 1`** — **Addressed** in the component spec. The prev/next buttons are disabled at boundaries.

5. **Custom table instead of extending DataTable** — We're duplicating some table markup. If more modules need conditional row styling in the future, we'd want to add `rowClassName` to DataTable. But YAGNI — solve it when it actually recurs.

6. **No FilingSetting `id` and `firm_id` in TypeScript type** — The `FilingSetting` interface in `src/types/filing.ts` lacks `id` and `firm_id` fields. The service layer will need to handle this mapping (DB row has `id` and `firm_id`, but the TS type only has `clientId` and setting fields). This is fine — the service maps between DB and TS representations, and the UI never needs the setting's `id` or `firm_id`. The `clientId` is sufficient for identification since there's a UNIQUE constraint on `(firm_id, client_id)`.
