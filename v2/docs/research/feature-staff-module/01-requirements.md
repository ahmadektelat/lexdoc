# Staff Module — Requirements Document

## Task Summary

Implement the Staff Management module: CRUD for firm employees, a reusable StaffPicker component, client-staff assignment via a many-to-many junction table, and a StaffTasksPanel (UI shell with empty state, wired up in Phase 6). This replaces the legacy `StaffView` (legacy-app.html lines 1769-1902).

## User Decisions

1. **Staff deletion strategy** — **Soft delete only** using `deleted_at` column, consistent with the existing codebase convention. Filter `deleted_at IS NULL` in all queries.
2. **client_staff junction table** — **Build now** as a many-to-many table. Create `clientStaffService.ts`.
3. **StaffTasksPanel** — **UI shell with empty state**. Build the full component structure (tabs, metrics area, task card layout) but show a "coming soon" empty state since the `tasks` table does not exist yet (Phase 6).
4. **assigned_staff_id migration** — **Junction table only**. Drop `assigned_staff_id` from `clients`, add `is_primary BOOLEAN` to `client_staff`. Single source of truth, no sync issues. Handle data migration in the staff migration file.

## Chosen Approach

**Full module implementation with junction table migration** — Build the staff table, client_staff junction table (migrating away from `assigned_staff_id`), service/hook layers following established patterns, and all UI components. The StaffTasksPanel gets a UI shell that Phase 6 will wire up.

---

## Existing Code Inventory

These MUST be imported, NOT recreated:

### Types (`src/types/staff.ts` — already exists)
- `Staff` — `{ id, firm_id, user_id?, name, role, isActive, deleted_at?, created_at, updated_at }`
- `StaffRole` — `'partner' | 'attorney' | 'junior_attorney' | 'accountant' | 'consultant' | 'secretary' | 'manager' | 'student'`
- `CreateStaffInput` — `Omit<Staff, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>`
- `UpdateStaffInput` — `Partial<Omit<Staff, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>`

### Constants (`src/lib/constants.ts` — already exists)
- `STAFF_ROLES: Record<StaffRole, string>` — maps roles to i18n keys (e.g., `'staffRoles.partner'`)

### i18n keys (already exist in all 3 language files)
- `staff.title`, `staff.addMember`, `staff.role`, `staff.active`
- `staffRoles.partner`, `staffRoles.attorney`, `staffRoles.juniorAttorney`, `staffRoles.accountant`, `staffRoles.consultant`, `staffRoles.secretary`, `staffRoles.manager`, `staffRoles.student`

### Shared Components (`src/components/shared/`)
- `PageHeader` — `{ title, description?, children? }`
- `DataTable` — `{ columns, data, onRowClick?, emptyMessage?, pageSize?, searchable?, searchPlaceholder? }` (uses `@tanstack/react-table`)
- `EmptyState` — `{ icon: LucideIcon, title, description? }`
- `LoadingSpinner` — `{ size?, className? }`
- `FormField` — `{ label, error?, required?, hint?, children, htmlFor? }`
- `ConfirmDialog` — `{ open, onOpenChange, title?, description?, confirmLabel?, cancelLabel?, onConfirm, variant? }`
- `StatusBadge` — `{ status, className? }` (supports: `active`, `archived`, `open`, `done`, etc.)
- `SearchInput` — `{ value, onChange, placeholder?, className? }`

### Other shared code
- `useAuthStore` — provides `firmId`, `role`, `can()`, `hasRole()`
- `useLanguage` — provides `t()`, `direction`
- `supabase` client from `@/integrations/supabase/client`
- `formatDate()`, `formatDateTime()` from `@/lib/dates`
- `cn()` from `@/lib/utils`

### Route
- `/staff` route already exists in `App.tsx` (line 72) as `SectionPlaceholder` — replace with `StaffView`

### Sidebar
- Nav item already configured: `{ path: '/staff', icon: UserCog, labelKey: 'nav.staff' }`

---

## Database Requirements

### Migration file: `supabase/migrations/2026031810000X_create_staff.sql`

#### Table: `staff`
```sql
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  user_id UUID REFERENCES auth.users(id),  -- optional link to auth user
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('partner', 'attorney', 'junior_attorney', 'accountant', 'consultant', 'secretary', 'manager', 'student')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_staff_firm_id ON staff(firm_id)`
- `idx_staff_firm_active ON staff(firm_id, is_active) WHERE deleted_at IS NULL`

**RLS policies** (same pattern as clients):
- `staff_select`: `USING (firm_id IN (SELECT user_firm_ids()))`
- `staff_insert`: `WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))`
- `staff_update`: `USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))`
- `staff_delete`: `USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))`

**Triggers:**
- `staff_updated_at` — `BEFORE UPDATE EXECUTE FUNCTION update_updated_at()` (reuse existing helper)

**GRANTs:**
- `GRANT SELECT, INSERT, UPDATE, DELETE ON staff TO authenticated;`

#### Table: `client_staff`
```sql
CREATE TABLE client_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, staff_id)
);
```

**Indexes:**
- `idx_client_staff_client ON client_staff(client_id)`
- `idx_client_staff_staff ON client_staff(staff_id)`

**RLS policies:**
- `client_staff_select`: `USING (client_id IN (SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids())))`
- `client_staff_insert`: `WITH CHECK (client_id IN (SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id)))`
- `client_staff_update`: same pattern as insert
- `client_staff_delete`: same pattern as insert

**GRANTs:**
- `GRANT SELECT, INSERT, UPDATE, DELETE ON client_staff TO authenticated;`

#### Migration: Drop `assigned_staff_id` from clients
```sql
-- Migrate existing assigned_staff_id data to client_staff junction table
INSERT INTO client_staff (client_id, staff_id, is_primary)
SELECT id, assigned_staff_id, true
FROM clients
WHERE assigned_staff_id IS NOT NULL
  AND deleted_at IS NULL;

-- Drop the column
ALTER TABLE clients DROP COLUMN assigned_staff_id;
```

**Important:** This migration must run AFTER the `staff` and `client_staff` tables are created. The `clients` migration has a TODO comment about this FK (`-- TODO: ADD FK REFERENCES staff(id) when staff module is built`).

---

## Service Layer

### `src/services/staffService.ts`

Follow the `clientService.ts` pattern exactly:

```
staffService = {
  list(firmId: string): Promise<Staff[]>
  getById(firmId: string, id: string): Promise<Staff>
  create(firmId: string, input: CreateStaffInput): Promise<Staff>
  update(firmId: string, id: string, input: UpdateStaffInput): Promise<Staff>
  delete(firmId: string, id: string): Promise<void>   // soft delete: sets deleted_at
}
```

**Row mapping needed:** DB uses `is_active` (snake_case), TypeScript type uses `isActive` (camelCase). Implement `rowToStaff()` and `staffInputToRow()` functions following the `rowToClient()` pattern in `clientService.ts`.

**Key details:**
- `list()`: filter `deleted_at IS NULL`, order by `created_at DESC`
- `create()`: set `firm_id` server-side (same as clientService)
- `delete()`: set `deleted_at = new Date().toISOString()` (soft delete)
- All methods include `firm_id` filter for defense-in-depth beyond RLS

### `src/services/clientStaffService.ts`

```
clientStaffService = {
  getAssignments(clientId: string): Promise<ClientStaffAssignment[]>
  getStaffClients(staffId: string): Promise<ClientStaffAssignment[]>
  assignStaff(clientId: string, staffId: string, isPrimary?: boolean): Promise<void>
  removeAssignment(clientId: string, staffId: string): Promise<void>
  setPrimary(clientId: string, staffId: string): Promise<void>
}
```

**Note:** A new type `ClientStaffAssignment` will be needed — `{ id, client_id, staff_id, is_primary, created_at }`. Add to `src/types/staff.ts`.

---

## Hook Layer

### `src/hooks/useStaff.ts`

Follow the `useClients.ts` pattern exactly:

```
staffKeys = {
  all: ['staff']
  lists: () => [...staffKeys.all, 'list']
  list: (firmId: string) => [...staffKeys.lists(), firmId]
  details: () => [...staffKeys.all, 'detail']
  detail: (id: string) => [...staffKeys.details(), id]
}

useStaff(firmId: string | null)        — list query
useStaffMember(id: string | undefined) — single query (uses firmId from useAuthStore)
useCreateStaff()                       — mutation with toast: t('staff.createSuccess')
useUpdateStaff()                       — mutation with toast: t('staff.updateSuccess')
useDeleteStaff()                       — mutation with toast: t('staff.deleteSuccess')
```

### `src/hooks/useClientStaff.ts` (optional, may be deferred)

```
useClientStaffAssignments(clientId: string)  — assignments for a client
useAssignStaff()                              — mutation
useRemoveStaffAssignment()                    — mutation
```

---

## Component Requirements

### 1. `src/components/staff/StaffView.tsx` — Main staff list page

**Structure:**
- `PageHeader` with title `t('staff.title')` and "Add" button `t('staff.addMember')`
- Optional search/filter bar
- `DataTable` with columns:
  - Name (font-medium, with avatar initial like legacy)
  - Role (Badge using `t(STAFF_ROLES[role])`, with role-based colors)
  - Total hours (placeholder "—" until billing module, or computed if hours data exists)
  - Active clients count (count from `client_staff` junction)
  - Tasks count (placeholder until Phase 6)
  - Actions (edit button, delete button — delete hidden for `partner` role)
- Row click selects staff and shows `StaffTasksPanel`
- Empty state with `EmptyState` component when no staff exist
- Mobile responsive: card layout on small screens (follow `ClientsView` pattern with `useIsMobile`)

**State:**
- `formOpen` / `setFormOpen` — controls StaffForm dialog
- `editingStaff` — the staff member being edited (or null for create)
- `selectedStaff` — the staff member whose tasks panel is shown (or null)
- `deleteTarget` — staff member pending deletion confirmation

**Patterns to follow from `ClientsView`:**
- `useAuthStore` for `firmId`
- `useStaff(firmId)` for data
- `useMemo` for column definitions with `t` dependency
- `LoadingSpinner` while loading
- `ConfirmDialog` for delete confirmation

### 2. `src/components/staff/StaffForm.tsx` — Create/edit dialog

**Structure:**
- `Dialog` with `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- Fields:
  - Name (required) — `Input` with `FormField`
  - Role — `Select` with options from `STAFF_ROLES` constant, rendered with `t()`
- Edit mode: pre-fill from `staff` prop
- Create mode: empty form

**Props:**
```ts
interface StaffFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: Staff;  // if provided, edit mode
}
```

**Patterns to follow from `ClientForm`:**
- `FormState` interface with string fields
- `useEffect` to reset form on open/close
- `setField` helper that clears errors
- `validate()` function (name is required)
- `handleSubmit()` calls create or update mutation
- `isSubmitting` from `isPending`

### 3. `src/components/staff/StaffPicker.tsx` — Reusable dropdown

**Props:**
```ts
interface StaffPickerProps {
  value?: string;           // selected staff ID
  onChange: (staffId: string | undefined) => void;
  firmId: string;
  placeholder?: string;
  disabled?: boolean;
}
```

**Structure:**
- `Select` component listing active, non-deleted staff
- Each option shows staff name and role badge
- Uses `useStaff(firmId)` internally
- Reusable by other modules (clients, filings, billing)

### 4. `src/components/staff/StaffTasksPanel.tsx` — Tasks panel (UI shell)

**Props:**
```ts
interface StaffTasksPanelProps {
  staff: Staff;
  onClose: () => void;
}
```

**Structure (Phase 4 — empty state):**
- Header with staff avatar initial, name, and close button
- Metrics grid (3 columns): open count, overdue count, done count — all show "0" or "—"
- Tab buttons: Open, Done, All
- Empty state message: `t('staff.tasksComingSoon')` or similar

**Structure (Phase 6 — wired up):**
- Same layout but populated with real task data
- Task cards with: title, due date, priority (PriorityBadge), client name, auto indicator
- Completion toggle checkbox

---

## i18n Requirements

### New keys needed (add to all 3 language files):

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `staff.description` | הוספה, עריכה וניהול צוות המשרד | إضافة وتعديل وإدارة طاقم المكتب | Add, edit and manage office staff |
| `staff.name` | שם מלא | الاسم الكامل | Full Name |
| `staff.addTitle` | הוספת עובד חדש | إضافة موظف جديد | Add New Staff Member |
| `staff.editTitle` | עריכת עובד | تعديل موظف | Edit Staff Member |
| `staff.noStaff` | אין עובדים | لا يوجد موظفون | No Staff Members |
| `staff.noStaffDesc` | הוסף עובדים לצוות המשרד | أضف موظفين لطاقم المكتب | Add staff members to the office team |
| `staff.totalHours` | שעות סה"כ | إجمالي الساعات | Total Hours |
| `staff.activeClients` | לקוחות פעילים | عملاء نشطون | Active Clients |
| `staff.tasks` | משימות | المهام | Tasks |
| `staff.createSuccess` | עובד נוסף בהצלחה | تمت إضافة الموظف بنجاح | Staff member added successfully |
| `staff.updateSuccess` | עובד עודכן בהצלחה | تم تحديث الموظف بنجاح | Staff member updated successfully |
| `staff.deleteSuccess` | עובד הוסר בהצלחה | تمت إزالة الموظف بنجاح | Staff member removed successfully |
| `staff.deleteConfirm` | האם למחוק את העובד? | هل تريد حذف هذا الموظف؟ | Delete this staff member? |
| `staff.deleteConfirmDesc` | פעולה זו אינה ניתנת לביטול | لا يمكن التراجع عن هذا الإجراء | This action cannot be undone |
| `staff.openTasks` | משימות פתוחות | مهام مفتوحة | Open Tasks |
| `staff.overdueTasks` | באיחור | متأخرة | Overdue |
| `staff.doneTasks` | הושלמו | مكتملة | Completed |
| `staff.allTasks` | הכל | الكل | All |
| `staff.tasksComingSoon` | מודול המשימות יהיה זמין בקרוב | وحدة المهام ستكون متاحة قريباً | Tasks module coming soon |
| `staff.noOpenTasks` | אין משימות פתוחות | لا توجد مهام مفتوحة | No open tasks |
| `staff.searchPlaceholder` | חיפוש עובד... | البحث عن موظف... | Search staff... |
| `staff.cannotDeletePartner` | לא ניתן למחוק שותף | لا يمكن حذف شريك | Cannot delete partner |
| `staff.selectStaff` | בחר עובד | اختر موظف | Select staff member |

---

## Route Requirements

In `src/App.tsx`:
1. Add import: `import { StaffView } from '@/components/staff/StaffView';`
2. Replace line 72: `<Route path="staff" element={<SectionPlaceholder section="staff" />} />`
   With: `<Route path="staff" element={<StaffView />} />`

No new routes needed — staff does not have a detail page (unlike clients). Staff details are edited via the dialog.

---

## Patterns to Follow

### Service pattern (from `clientService.ts`)
- Export a single `staffService` object with async methods
- Row mapping functions: `rowToStaff()` converts snake_case DB rows to camelCase `Staff` type
- `staffInputToRow()` converts camelCase input to snake_case for INSERT
- `updateInputToRow()` handles partial updates
- All queries include `firm_id` filter for defense-in-depth
- All queries filter `deleted_at IS NULL` for soft delete
- Soft delete: `update({ deleted_at: new Date().toISOString() })`

### Hook pattern (from `useClients.ts`)
- Export query key factory (`staffKeys`)
- List hook takes `firmId` parameter, uses `enabled: !!firmId`
- Single-item hook gets `firmId` from `useAuthStore`
- Mutation hooks use `useLanguage` for toast messages
- On success: invalidate list queries, show success toast
- On error: show `t('errors.saveFailed')` toast

### Component pattern (from `ClientsView.tsx` / `ClientForm.tsx`)
- Views: `p-6 animate-fade-in` wrapper, `PageHeader`, filter section, DataTable/cards
- Forms: Dialog-based, `FormState` type, `useEffect` reset, `validate()`, `handleSubmit()`
- Mobile detection: `useIsMobile()` hook with `matchMedia`
- All text via `t()` — no hardcoded strings in JSX

### Migration pattern (from `20260318100000_create_clients.sql`)
- CREATE TABLE with constraints
- Indexes
- RLS enable + policies using `user_firm_ids()` and `firm_subscription_active()`
- Triggers using existing `update_updated_at()`
- GRANTs to `authenticated`

---

## Type Changes Required

### `src/types/staff.ts` — Add `ClientStaffAssignment`
```ts
export interface ClientStaffAssignment {
  id: string;
  client_id: string;
  staff_id: string;
  is_primary: boolean;
  created_at: string;
}
```

### `src/types/client.ts` — Remove `assignedStaffId`
After the migration drops `assigned_staff_id` from clients:
- Remove `assignedStaffId?: string` from `Client` interface
- Remove `assignedStaffId` from `CreateClientInput` (via Omit — check if it needs explicit removal)
- Remove `assignedStaffId` from `UpdateClientInput`

### `src/services/clientService.ts` — Update row mapping
- Remove `assignedStaffId` / `assigned_staff_id` from `rowToClient()`, `clientInputToRow()`, `updateInputToRow()`

### `src/components/clients/ClientForm.tsx` — Remove assignedStaffId field
- Remove the `assignedStaffId` field from `FormState` and form UI
- (Later: add StaffPicker to ClientForm or ClientDetailView to use junction table)

---

## Scope

**In scope:**
- `staff` table with RLS, indexes, triggers, GRANTs
- `client_staff` junction table with `is_primary` flag
- Migration of `assigned_staff_id` data to junction table + column drop
- `staffService.ts` and `clientStaffService.ts`
- `useStaff.ts` hooks
- `StaffView.tsx`, `StaffForm.tsx`, `StaffPicker.tsx`, `StaffTasksPanel.tsx` (empty state)
- i18n keys in all 3 languages
- Route update in `App.tsx`
- Update `Client` type and `clientService` to remove `assignedStaffId`

**Out of scope:**
- Tasks table / task CRUD (Phase 6)
- Wiring StaffTasksPanel to real task data (Phase 6)
- Billing hours display in staff table (Phase 5)
- StaffPicker integration into ClientForm (can be a follow-up)
- RBAC permission checks on staff CRUD operations (Phase 8)
- Staff-to-auth-user linking workflow

---

## Success Criteria

- [ ] `staff` table exists with correct schema, RLS, indexes, triggers
- [ ] `client_staff` junction table exists with `is_primary` flag
- [ ] `assigned_staff_id` column removed from `clients` table, data migrated
- [ ] `staffService.ts` provides list, getById, create, update, delete with firm_id defense-in-depth
- [ ] `clientStaffService.ts` provides assignment CRUD
- [ ] `useStaff.ts` hooks work with React Query (list, single, mutations with toasts)
- [ ] `StaffView` shows staff list with DataTable, search, mobile cards
- [ ] `StaffForm` creates and edits staff via dialog
- [ ] `StaffPicker` is a reusable dropdown listing active staff
- [ ] `StaffTasksPanel` renders UI shell with empty state
- [ ] Delete is soft delete, hidden for partner role, with ConfirmDialog
- [ ] All text uses `t()` with keys in he.ts, ar.ts, en.ts
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] Client type/service updated to remove `assignedStaffId`
