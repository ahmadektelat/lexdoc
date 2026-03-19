# Filings Module — Requirements Document

## Task Summary

Build the tax filings module: a two-column FilingsView for managing client filing schedules (VAT, tax advances, tax deductions, NII deductions), per-client filing settings, status tracking (pending/filed/late), and auto-task integration. Also wire a FilingsClientTab into the existing ClientDetailView's tabs.

---

## Scope

### In scope
- **FilingsView** — Two-column layout with client sidebar + filing schedule
- **FilingSettingsPanel** — Per-client filing settings (VAT frequency, enable/disable other types)
- **FilingScheduleTable** — Filing list with type badges, status, actions (mark filed/late/reset)
- **FilingsClientTab** — Embedded in ClientDetailView's existing filings tab placeholder
- **Metrics bar** — Filed/pending/late counts for selected client
- **Year selector** — Switch between years (prev/current/next)
- **Type filter** — Filter filings by type (all/maam/mekadmot/nikuyim/nii)
- **Services** — `filingService.ts`, `filingSettingService.ts`
- **Hooks** — `useFilings.ts`, `useFilingSettings.ts`
- **Database** — `filings` table, `filing_settings` table, migrations, RLS, indexes
- **Route wiring** — Replace `SectionPlaceholder` in App.tsx for `/filings`
- **Auto-task integration** — Cancel auto-task when filing is marked as filed (uses existing `taskService.cancelAutoTaskForFiling`)
- **i18n** — New keys in `filings.*` section for all 3 languages
- **Permission check** — `can('filings.view')` guard on FilingsView

### Out of scope
- Implementing `taskService.runAutoTaskEngine` (remains a stub until full auto-task engine is built)
- Bulk operations on filings
- Filing document attachments
- Filing notifications/reminders
- Dashboard widgets for filings

---

## Shared Code Inventory

### EXISTS — Import, do NOT recreate

| Category | Path | Exports | Status |
|----------|------|---------|--------|
| Types | `src/types/filing.ts` | `Filing`, `FilingType`, `FilingStatus`, `FilingSetting`, `CreateFilingInput` | Exists, exported via `src/types/index.ts` |
| Constants | `src/lib/constants.ts` | `FILING_TYPES`, `FILING_TYPE_COLORS`, `AUTO_TASK_LEAD_DAYS` | Exists |
| Utils | `src/lib/filing-utils.ts` | `calculateDueDate`, `getMonthlyPeriods`, `getBimonthlyPeriods`, `generateFilingSchedule`, `getFilingTypeLabel`, `getFilingTypeColor`, `taskDueDateForFiling`, `getAutoTaskLabel` | Exists |
| Utils | `src/lib/dates.ts` | `formatDate`, `isOverdue`, `getToday` | Exists |
| Components | `src/components/shared/PageHeader.tsx` | `PageHeader` | Exists |
| Components | `src/components/shared/DataTable.tsx` | `DataTable` | Exists — uses TanStack Table, supports sorting/pagination/search |
| Components | `src/components/shared/StatusBadge.tsx` | `StatusBadge` | Exists — already handles `filed`, `pending`, `late` statuses |
| Components | `src/components/shared/EmptyState.tsx` | `EmptyState` | Exists |
| Components | `src/components/shared/LoadingSpinner.tsx` | `LoadingSpinner` | Exists |
| Components | `src/components/shared/FormField.tsx` | `FormField` | Exists |
| Components | `src/components/shared/ConfirmDialog.tsx` | `ConfirmDialog` | Exists |
| Service | `src/services/taskService.ts` | `taskService.cancelAutoTaskForFiling` | Exists (stub — needs implementation as part of this module) |
| Hook | `src/hooks/useTasks.ts` | `useCancelAutoTaskForFiling` | Exists |
| Store | `src/stores/useAuthStore.ts` | `useAuthStore` — `firmId`, `can()` | Exists |
| Hook | `src/hooks/useClients.ts` | `useClients`, `useClient` | Exists |

### NEEDS CREATION

| Category | Path | Purpose |
|----------|------|---------|
| Service | `src/services/filingService.ts` | CRUD for filings table (list, create, markFiled, markLate, resetToPending, regenerateSchedule) |
| Service | `src/services/filingSettingService.ts` | CRUD for filing_settings table (get, save) |
| Hook | `src/hooks/useFilings.ts` | React Query hooks for filings |
| Hook | `src/hooks/useFilingSettings.ts` | React Query hooks for filing settings |
| Component | `src/components/filings/FilingsView.tsx` | Main view — two-column layout, client sidebar, year selector, type filter |
| Component | `src/components/filings/FilingSettingsPanel.tsx` | Per-client settings editor (VAT freq, enable/disable toggles) |
| Component | `src/components/filings/FilingScheduleTable.tsx` | Filing schedule table with actions |
| Component | `src/components/filings/FilingsClientTab.tsx` | Embeddable tab for ClientDetailView |
| Migration | `supabase/migrations/20260319100001_create_filings_tables.sql` | filings + filing_settings tables |

---

## Codebase Patterns to Follow

### Service Pattern (from `contactService.ts`, `taskService.ts`)

```
- rowToEntity() mapper function (DB row -> TypeScript type)
- inputToRow() mapper function (TS input -> DB row)
- Export a const service object with async methods
- All queries scoped by firm_id
- Soft delete: UPDATE deleted_at, not DELETE
- Filter deleted_at IS NULL on reads
- Return typed entities, not raw rows
```

### Hook Pattern (from `useContacts.ts`, `useTasks.ts`)

```
- Export query keys object: entityKeys = { all, lists, list(firmId, clientId?), details, detail(id) }
- useQuery for reads with enabled: !!firmId
- useMutation for writes with onSuccess: invalidateQueries + toast
- Import useLanguage for toast translations
- Import useAuthStore for firmId
- Import toast from 'sonner'
```

### Component Pattern (from `CrmView.tsx`)

```
- const { t } = useLanguage() for all text
- const firmId = useAuthStore((s) => s.firmId)
- const can = useAuthStore((s) => s.can) for permission checks
- useClients(firmId) for client dropdowns
- LoadingSpinner while loading
- PageHeader for page title
- Tabs from @/components/ui/tabs for tabbed panels
- Select from @/components/ui/select for dropdowns with '__all__' sentinel
- animate-fade-in on root div
```

### Permission Pattern

```
- Guard with: if (!can('filings.view')) return <unauthorized message>
- Permission keys: filings.view, filings.create, filings.edit, filings.delete
- Already registered in PERMISSION_GROUPS and i18n
```

### Routing Pattern (from `App.tsx:73`)

```
- Currently: <Route path="filings" element={<SectionPlaceholder section="filings" />} />
- Replace with: <Route path="filings" element={<FilingsView />} />
- Import FilingsView at top of App.tsx
```

---

## Database Requirements

### Table: `filings`

```sql
CREATE TABLE filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('maam', 'mekadmot', 'nikuyim', 'nii')),
  period TEXT NOT NULL,           -- "2026-01" or "2026-01/2026-02"
  due DATE NOT NULL,              -- filing deadline
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'late')),
  filed_date DATE,                -- when actually filed
  note TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_filings_firm_id ON filings(firm_id)`
- `idx_filings_firm_client ON filings(firm_id, client_id) WHERE deleted_at IS NULL`
- `idx_filings_firm_client_due ON filings(firm_id, client_id, due) WHERE deleted_at IS NULL`
- `idx_filings_firm_status ON filings(firm_id, status) WHERE deleted_at IS NULL`

**RLS policies** (same pattern as contacts/tasks):
- SELECT: `firm_id IN (SELECT user_firm_ids())`
- INSERT: `firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id)`
- UPDATE: same as INSERT
- DELETE: same as INSERT

**Triggers:**
- `update_updated_at()` on UPDATE (existing function)

**GRANTs:**
- `GRANT SELECT, INSERT, UPDATE, DELETE ON filings TO authenticated`

### Table: `filing_settings`

```sql
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
```

**Indexes:**
- `idx_filing_settings_firm_client ON filing_settings(firm_id, client_id)` (covered by UNIQUE)

**RLS policies:** Same pattern as filings.

**Triggers:** `update_updated_at()` on UPDATE.

**GRANTs:** `GRANT SELECT, INSERT, UPDATE, DELETE ON filing_settings TO authenticated`

### Foreign Key addition to tasks table

```sql
-- Add FK from tasks.filing_id to filings.id (currently a TODO in the tasks schema)
ALTER TABLE tasks ADD CONSTRAINT tasks_filing_id_fkey FOREIGN KEY (filing_id) REFERENCES filings(id);
```

---

## Integration Points

### 1. ClientTabs (`src/components/clients/ClientTabs.tsx`)

**Current state (line 31-36):** Filings tab shows `EmptyState` placeholder.

**Required change:** Replace the EmptyState with `<FilingsClientTab clientId={clientId} />`.

### 2. App.tsx routing (`src/App.tsx:73`)

**Current state:** `<Route path="filings" element={<SectionPlaceholder section="filings" />} />`

**Required change:** Replace with `<Route path="filings" element={<FilingsView />} />` and add import.

### 3. Task Service — `cancelAutoTaskForFiling` (`src/services/taskService.ts:158`)

**Current state:** Stub function that does nothing.

**Required change:** Implement to soft-delete auto-tasks linked to a specific filing_id:
```
UPDATE tasks SET deleted_at = now() WHERE firm_id = ? AND filing_id = ? AND is_auto = true AND deleted_at IS NULL
```

### 4. Task Service — `runAutoTaskEngine` (`src/services/taskService.ts:152`)

**Current state:** Stub returning 0.

**Note:** The plan says auto-tasks are created 10 days before filing deadline. The implementation of `runAutoTaskEngine` is a stretch goal — the core filings module should work without it. The filings module must support the forward integration (filing_id column, cancelAutoTaskForFiling) but implementing the auto-generation engine can be deferred.

---

## i18n Requirements

### Existing keys (already in all 3 files)

- `nav.filings` — Navigation label
- `clients.tabs.filings` — Client tab label
- `clients.tabs.filingsPlaceholder` — Placeholder text (will no longer be used)
- `filings.title` — Page title
- `filings.vatReport` / `filings.taxAdvances` / `filings.incomeTaxDeductions` / `filings.niiDeductions` — Type labels
- `filings.dueDate` — Due date column header
- `filings.status.pending` / `filings.status.filed` / `filings.status.late` — Status labels
- `status.filed` / `status.pending` / `status.late` — Used by StatusBadge component
- `permissions.filings.*` — Permission labels

### New keys needed (add to all 3 language files)

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `filings.description` | מעקב הגשות תקופתי לרשויות המס | تتبع التقارير الضريبية الدورية | Periodic tax filing tracker |
| `filings.selectClient` | בחר לקוח מהרשימה | اختر عميل من القائمة | Select a client from the list |
| `filings.clients` | לקוחות | العملاء | Clients |
| `filings.settings` | הגדרות הגשות | إعدادات التقارير | Filing Settings |
| `filings.settingsFor` | הגדרות הגשות - | إعدادات التقارير - | Filing Settings - |
| `filings.vatFrequency` | תדירות מע"מ | تكرار ض.ق.م. | VAT Frequency |
| `filings.monthly` | חודשי | شهري | Monthly |
| `filings.bimonthly` | דו-חודשי | كل شهرين | Bimonthly |
| `filings.taxAdvances.label` | מקדמות מ.ה. | سلف ض.د. | Tax Advances |
| `filings.taxDeductions.label` | ניכויים מ.ה. | خصومات ض.د. | Tax Deductions |
| `filings.niiDeductions.label` | ניכויים ב.ל. | خصومات ت.و. | NII Deductions |
| `filings.frequency` | תדירות: | التكرار: | Frequency: |
| `filings.saveAndGenerate` | שמור והפק לוח | احفظ وأنشئ جدول | Save & Generate Schedule |
| `filings.cancel` | ביטול | إلغاء | Cancel |
| `filings.allTypes` | הכל | الكل | All |
| `filings.columns.type` | סוג | النوع | Type |
| `filings.columns.period` | תקופה | الفترة | Period |
| `filings.columns.dueDate` | מועד הגשה | تاريخ الاستحقاق | Due Date |
| `filings.columns.status` | סטטוס | الحالة | Status |
| `filings.columns.filedDate` | תאריך הגשה | تاريخ التقديم | Filed Date |
| `filings.columns.actions` | פעולות | الإجراءات | Actions |
| `filings.markFiled` | הוגש | تم التقديم | Mark Filed |
| `filings.markLate` | איחור | متأخر | Mark Late |
| `filings.reset` | אפס | إعادة تعيين | Reset |
| `filings.filed` | הוגש | تم التقديم | Filed |
| `filings.pending` | ממתין | معلق | Pending |
| `filings.late` | באיחור | متأخر | Late |
| `filings.noFilings` | אין הגשות להצגה | لا توجد تقارير للعرض | No filings to display |
| `filings.settingsUpdated` | הגדרות הגשות עודכנו | تم تحديث إعدادات التقارير | Filing settings updated |
| `filings.markedFiled` | הגשה סומנה כבוצעה | تم تحديد التقرير كمقدم | Filing marked as filed |
| `filings.markedLate` | סומן כמאוחר | تم التحديد كمتأخر | Marked as late |
| `filings.resetSuccess` | הגשה אופסה | تم إعادة تعيين التقرير | Filing reset |
| `filings.metrics.filed` | הוגש | تم التقديم | Filed |
| `filings.metrics.pending` | ממתין | معلق | Pending |
| `filings.metrics.late` | באיחור | متأخر | Late |

---

## Success Criteria

- [ ] `filings` and `filing_settings` tables created with RLS, indexes, triggers
- [ ] FK from `tasks.filing_id` to `filings.id` added
- [ ] `filingService.ts` and `filingSettingService.ts` follow existing service pattern
- [ ] `useFilings.ts` and `useFilingSettings.ts` follow existing hook pattern
- [ ] `FilingsView` renders two-column layout with client sidebar and filing schedule
- [ ] Client sidebar shows late filing count badge per client
- [ ] Year selector switches between prev/current/next year
- [ ] Type filter filters by filing type
- [ ] Metrics bar shows filed/pending/late counts
- [ ] `FilingSettingsPanel` allows editing VAT frequency and enabling/disabling other types
- [ ] Saving settings regenerates schedule while preserving existing filed statuses
- [ ] `FilingScheduleTable` shows all columns: type badge, period, due date, status, filed date, actions
- [ ] Overdue filings show red background
- [ ] "Mark Filed" sets status=filed, records filedDate, cancels auto-task
- [ ] "Mark Late" sets status=late
- [ ] "Reset" returns to pending and clears filedDate
- [ ] `FilingsClientTab` embedded in ClientDetailView's filings tab (replaces placeholder)
- [ ] `/filings` route wired in App.tsx (replaces SectionPlaceholder)
- [ ] Permission check: `can('filings.view')` guards the view
- [ ] All user-facing strings use `t()` with keys in all 3 language files
- [ ] `taskService.cancelAutoTaskForFiling` implemented (no longer a stub)
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

---

## Notes & Observations

1. **Shared code registry gap**: `getFilingTypeColor` exists in `filing-utils.ts` but is not listed in `SHARED-CODE-REGISTRY.md`. The registry should be updated.

2. **Legacy status mismatch**: The legacy app uses Hebrew string `"ממתין"` as the pending status value. The new types correctly use English `'pending'`. No compatibility concern since this is a fresh build.

3. **DataTable vs custom table**: The plan mentions `FilingScheduleTable` with custom row styling (red background for overdue). The shared `DataTable` component supports standard rows but not conditional row styling. The architect should decide whether to:
   - A) Extend `DataTable` with a `rowClassName` callback prop
   - B) Build a custom table for FilingScheduleTable (simpler, isolated)

4. **Schedule regeneration logic**: The `generateFilingSchedule()` util returns `Partial<Filing>[]` (without id, firm_id, timestamps). The service's `regenerateSchedule` must: (a) generate new schedule, (b) fetch existing filings for that client+year, (c) merge by matching type+period, preserving filed statuses, (d) insert new ones, (e) soft-delete removed ones.

5. **filing_settings upsert**: Since there's a UNIQUE constraint on `(firm_id, client_id)`, the save operation should use Supabase's upsert (`.upsert()`) to handle both create and update.

6. **Metrics include auto-overdue**: In the legacy app, a filing with status `"ממתין"` where `due < today` is counted as "late" in the metrics. The new code should check both `status === 'late'` AND `status === 'pending' && isOverdue(due)` for the late count.

7. **Year-based filtering**: The service's `list` method should accept a `year` parameter and filter by `period LIKE 'YYYY%'` to avoid loading all years at once.
