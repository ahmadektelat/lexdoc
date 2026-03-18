# CRM Module — Requirements Document

## Task Summary

Implement the CRM module with three panels (Contacts, Interactions, Tasks), an auto-task engine that generates tasks from filing deadlines, and a ClientTasksWidget for the client detail view. This includes database migrations, service layer, React Query hooks, components, i18n keys, and route wiring.

## User Decisions

1. **General interactions (no client)** — User chose: **Option C** — `client_id` is optional. If null, the interaction is implicitly general. No `isGeneral` boolean needed. The existing type already supports `client_id?: string`.
2. **`contact_id` on interactions** — **Recommended: Optional**. The legacy app does not require a contact on interactions. The existing type has `contact_id: string` (required) which needs to change to `contact_id?: string` to match actual usage. This avoids friction when quickly logging interactions.

## Chosen Approach

**Faithful migration of legacy CRM with modernized patterns** — Follow the existing service/hook/component patterns established by clientService, staffService, and the permissions module. Match legacy functionality without adding new features. Use existing shared code (types, constants, utilities, components) as mandated by the shared code registry.

## Scope

**In scope:**
- Contacts CRUD panel with client/type filtering
- Interactions CRUD panel with client/channel/authority filtering
- Tasks CRUD panel with status/client/priority/category filtering
- Task form as a modal dialog
- Auto-task engine (scan filings, create tasks 10 days before due dates)
- Cancel auto-tasks when filings are marked as filed
- ClientTasksWidget embedded in ClientDetailView's Tasks tab
- Database migrations (3 tables + sequence + RLS + indexes + triggers)
- Services (contactService, interactionService, taskService)
- React Query hooks (useContacts, useInteractions, useTasks)
- i18n keys for all 3 languages
- Route replacement (swap placeholder for CrmView)

**Out of scope:**
- Dashboard integration (separate module)
- Notifications/reminders for overdue tasks
- Bulk task operations
- Contact import/export
- Interaction attachments
- Task comments/subtasks

---

## Existing Shared Code (MUST IMPORT, NOT RECREATE)

### Types (`src/types/`)

| File | Exports | Status |
|------|---------|--------|
| `crm.ts` | `Contact`, `ContactType`, `Interaction`, `InteractionChannel`, `CreateContactInput`, `CreateInteractionInput` | EXISTS — needs minor update (see below) |
| `task.ts` | `Task`, `TaskStatus`, `TaskPriority`, `TaskCategory`, `CreateTaskInput` | EXISTS — complete |
| `filing.ts` | `Filing`, `FilingType`, `FilingStatus` | EXISTS — used by auto-task engine |

**Type modifications needed:**
- `src/types/crm.ts` line 28: Change `contact_id: string` to `contact_id?: string` (make optional per user decision)
- `src/types/crm.ts`: The `ContactType` is `'client' | 'taxAuth' | 'nii' | 'other'`. The legacy app also has `'court'` as a contact type (line 2756). Either add `'court'` to `ContactType` or keep as-is with `'other'` covering it. **Recommendation: add `'court'` to `ContactType`** since it appears in both contacts and interactions as a distinct category.
- `src/types/crm.ts`: The `Interaction` type has `staffId?: string` but the legacy uses `assignedStaff` as a separate field (the person handling the interaction vs. the person who logged it). Consider whether one `staffId` is sufficient or if we need `assignedToId` as well. **Recommendation: use `staffId` as the assigned handler** (matching the plan), keep it simple.

### Constants (`src/lib/constants.ts`)

| Constant | Value | Status |
|----------|-------|--------|
| `TASK_PRIORITIES` | `{ high, medium, low }` with i18n keys | EXISTS |
| `TASK_CATEGORIES` | `{ client, taxAuth, nii, internal }` with i18n keys | EXISTS |
| `INTERACTION_CHANNELS` | `{ call, email, meeting, letter, portal }` with i18n keys | EXISTS |
| `AUTO_TASK_LEAD_DAYS` | `10` | EXISTS |
| `AUTO_TASK_WINDOW_DAYS` | `30` | EXISTS |

**New constants needed:**
- `CONTACT_TYPES: Record<ContactType, string>` — i18n key map for contact types (client, taxAuth, nii, court, other)
- `AUTHORITY_TYPES` — i18n key map for authority types on interactions (taxAuth, vat, nii, court, other). This is used in the interaction form for the "authority/entity" dropdown.

### Utilities (`src/lib/`)

| Function | File | Status |
|----------|------|--------|
| `formatDate(iso)` | `dates.ts` | EXISTS |
| `isOverdue(dueDate)` | `dates.ts` | EXISTS |
| `getToday()` | `dates.ts` | EXISTS |
| `taskDueDateForFiling(filingDueDate)` | `filing-utils.ts` | EXISTS |
| `getAutoTaskLabel(type)` | `filing-utils.ts` | EXISTS |
| `getFilingTypeLabel(type)` | `filing-utils.ts` | EXISTS |

No new utility functions needed.

### Shared Components (`src/components/shared/`)

| Component | Status |
|-----------|--------|
| `PageHeader` | EXISTS — used for CrmView header |
| `DataTable` | EXISTS — used for interaction list (table layout) |
| `EmptyState` | EXISTS — used for empty panels |
| `LoadingSpinner` | EXISTS — used during data fetching |
| `FormField` | EXISTS — used in contact/interaction/task forms |
| `ConfirmDialog` | EXISTS — used for delete confirmations |
| `StatusBadge` | EXISTS — supports 'open', 'done', 'cancelled' statuses |
| `PriorityBadge` | EXISTS — supports 'high', 'medium', 'low' |
| `SearchInput` | EXISTS — for contact/task search |

### Other Dependencies

| Item | File | Status |
|------|------|--------|
| `StaffPicker` | `src/components/staff/StaffPicker.tsx` | EXISTS — takes `firmId`, `value`, `onChange` |
| `useAuthStore` | `src/stores/useAuthStore.ts` | EXISTS — provides `firmId`, `user`, `can()` |
| Supabase client | `src/integrations/supabase/client.ts` | EXISTS |

---

## Affected Files (Existing)

- `src/types/crm.ts` — Make `contact_id` optional, potentially add `'court'` to `ContactType`
- `src/lib/constants.ts` — Add `CONTACT_TYPES` and `AUTHORITY_TYPES` constants
- `src/App.tsx` line 75 — Replace `<SectionPlaceholder section="crm" />` with `<CrmView />`
- `src/components/clients/ClientTabs.tsx` lines 38-43 — Replace Tasks tab placeholder with `<ClientTasksWidget clientId={id} />`
- `src/components/clients/ClientDetailView.tsx` — Pass client ID down to ClientTabs (currently ClientTabs has no props)
- `src/i18n/he.ts` — Add CRM section keys
- `src/i18n/ar.ts` — Add CRM section keys
- `src/i18n/en.ts` — Add CRM section keys
- `docs/plans/SHARED-CODE-REGISTRY.md` — Update with new services, hooks, components, constants

## New Files Needed

### Components (`src/components/crm/`)

| File | Purpose |
|------|---------|
| `CrmView.tsx` | Main CRM page: PageHeader + tab navigation (Tasks, Interactions, Contacts) + client filter dropdown |
| `ContactsPanel.tsx` | Contact list with filtering + inline add/edit form |
| `ContactForm.tsx` | Contact add/edit form (modal or inline) |
| `InteractionsPanel.tsx` | Interaction list (table layout) with filtering + add form |
| `InteractionForm.tsx` | Interaction add/edit form (modal or inline) |
| `TasksPanel.tsx` | Task list with stats cards + filtering + task cards |
| `TaskForm.tsx` | Task add/edit form (modal dialog) |
| `TaskCard.tsx` | Individual task card component (reused in TasksPanel and ClientTasksWidget) |
| `ClientTasksWidget.tsx` | Filtered task view for ClientDetailView Tasks tab |

### Services (`src/services/`)

| File | Methods |
|------|---------|
| `contactService.ts` | `list(firmId, clientId?)`, `getById(firmId, id)`, `create(firmId, input)`, `update(firmId, id, input)`, `delete(firmId, id)` |
| `interactionService.ts` | `list(firmId, clientId?)`, `create(firmId, input)`, `update(firmId, id, input)`, `delete(firmId, id)` |
| `taskService.ts` | `list(firmId, filters?)`, `getById(firmId, id)`, `create(firmId, input)`, `update(firmId, id, input)`, `toggleStatus(firmId, id)`, `delete(firmId, id)`, `runAutoTaskEngine(firmId)`, `cancelAutoTaskForFiling(firmId, filingId)` |

**Service patterns to follow** (from `clientService.ts`):
- Import supabase client from `@/integrations/supabase/client`
- `rowToX()` mapper function (snake_case DB -> camelCase TS)
- `inputToRow()` mapper function (camelCase TS -> snake_case DB)
- All methods take `firmId` as first param for defense-in-depth beyond RLS
- Soft delete: `update({ deleted_at: new Date().toISOString() })`
- Filter `deleted_at IS NULL` on all reads
- Export as `const xService = { ... }`

### Hooks (`src/hooks/`)

| File | Exports |
|------|---------|
| `useContacts.ts` | `contactKeys`, `useContacts(firmId, clientId?)`, `useCreateContact()`, `useUpdateContact()`, `useDeleteContact()` |
| `useInteractions.ts` | `interactionKeys`, `useInteractions(firmId, clientId?)`, `useCreateInteraction()`, `useUpdateInteraction()`, `useDeleteInteraction()` |
| `useTasks.ts` | `taskKeys`, `useTasks(firmId, filters?)`, `useTask(id)`, `useCreateTask()`, `useUpdateTask()`, `useToggleTaskStatus()`, `useDeleteTask()`, `useRunAutoTaskEngine()`, `useCancelAutoTaskForFiling()` |

**Hook patterns to follow** (from `useClients.ts`):
- Query key factory: `const xKeys = { all, lists, list(firmId), details, detail(id) }`
- `useQuery` with `enabled: !!firmId`
- `useMutation` with `onSuccess` invalidating relevant query keys + `toast.success(t(...))`
- `onError` showing `toast.error(t('errors.saveFailed'))`
- Import `useLanguage`, `useAuthStore`, `toast` from sonner

---

## Database Changes

### Migration 1: `contacts` table

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('client', 'taxAuth', 'nii', 'court', 'other')),
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_contacts_firm_id ON contacts(firm_id);
CREATE INDEX idx_contacts_firm_client ON contacts(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_firm_type ON contacts(firm_id, type) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select" ON contacts FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "contacts_insert" ON contacts FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "contacts_update" ON contacts FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "contacts_delete" ON contacts FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO authenticated;
```

### Migration 2: `interactions` table

```sql
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  channel TEXT NOT NULL CHECK (channel IN ('call', 'email', 'meeting', 'letter', 'portal')),
  subject TEXT NOT NULL,
  notes TEXT,
  authority_type TEXT CHECK (authority_type IN ('taxAuth', 'vat', 'nii', 'court', 'other', NULL)),
  staff_id UUID REFERENCES staff(id),
  outcome TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_interactions_firm_id ON interactions(firm_id);
CREATE INDEX idx_interactions_firm_client ON interactions(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_firm_date ON interactions(firm_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_firm_channel ON interactions(firm_id, channel) WHERE deleted_at IS NULL;

-- RLS (same pattern as contacts)
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interactions_select" ON interactions FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "interactions_insert" ON interactions FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "interactions_update" ON interactions FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "interactions_delete" ON interactions FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER interactions_updated_at BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON interactions TO authenticated;
```

### Migration 3: `tasks` table

```sql
-- Sequence for task seq numbers (per-firm sequential numbering)
CREATE SEQUENCE task_seq_sequence START 1;

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  filing_id UUID,  -- No FK constraint since filings table doesn't exist yet
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  assigned_to UUID REFERENCES staff(id),
  category TEXT NOT NULL DEFAULT 'client' CHECK (category IN ('client', 'taxAuth', 'nii', 'internal')),
  is_auto BOOLEAN NOT NULL DEFAULT false,
  filing_type TEXT CHECK (filing_type IN ('maam', 'mekadmot', 'nikuyim', 'nii', NULL)),
  filing_due DATE,
  period TEXT,
  done_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-firm seq number generation
CREATE OR REPLACE FUNCTION generate_task_seq(p_firm_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_seq INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('task_seq_' || p_firm_id::text));

  SELECT COALESCE(MAX(seq), 0) INTO v_max_seq
  FROM tasks
  WHERE firm_id = p_firm_id;

  RETURN v_max_seq + 1;
END;
$$;

-- Trigger: auto-generate seq on INSERT
CREATE OR REPLACE FUNCTION tasks_auto_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.seq IS NULL OR NEW.seq = 0 THEN
    NEW.seq := generate_task_seq(NEW.firm_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_seq_trigger
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION tasks_auto_seq();

-- Indexes
CREATE INDEX idx_tasks_firm_id ON tasks(firm_id);
CREATE INDEX idx_tasks_firm_status ON tasks(firm_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_client ON tasks(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_assigned ON tasks(firm_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_due ON tasks(firm_id, due_date) WHERE deleted_at IS NULL AND status = 'open';
CREATE INDEX idx_tasks_firm_filing ON tasks(firm_id, filing_id) WHERE deleted_at IS NULL AND is_auto = true;
CREATE UNIQUE INDEX idx_tasks_firm_seq ON tasks(firm_id, seq);

-- RLS (same pattern)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;
GRANT EXECUTE ON FUNCTION generate_task_seq(UUID) TO authenticated;
```

**Notes on task seq:**
- The legacy app uses a global `TASK_SEQ` counter. In the new system, seq is per-firm (scoped like `case_num` on clients).
- An advisory lock prevents race conditions on concurrent inserts.
- The seq is auto-generated by trigger, similar to how `case_num` works for clients.
- `filing_id` has no FK constraint because the `filings` table hasn't been created yet (it's a later migration phase). The column is present for the auto-task engine.

---

## Component Hierarchy and Data Flow

```
App.tsx
  └── AppShell (layout)
       └── /crm route
            └── CrmView
                 ├── PageHeader (title + description)
                 ├── Client filter dropdown (all clients / specific client)
                 ├── Tab navigation (Tasks | Interactions | Contacts)
                 ├── TasksPanel (default tab)
                 │    ├── Stats cards (open, overdue, done, total)
                 │    ├── Filter buttons (status, priority, category)
                 │    ├── "+ New Task" button -> TaskForm (modal)
                 │    └── Task list -> TaskCard[]
                 ├── InteractionsPanel
                 │    ├── Filter bar (client, channel, authority)
                 │    ├── "+ Log Interaction" button -> InteractionForm (modal/inline)
                 │    └── DataTable (date, client, staff, authority, channel, subject, outcome)
                 └── ContactsPanel
                      ├── Filter bar (client, type)
                      ├── "+ Add Contact" button -> ContactForm (modal/inline)
                      └── Contact cards grid (avatar, name, role, type badge, phone, email)

  └── /clients/:id route
       └── ClientDetailView
            └── ClientTabs
                 └── Tasks tab
                      └── ClientTasksWidget (clientId prop)
                           ├── Task list -> TaskCard[]
                           └── "+ New Task" button (pre-filled with clientId)
```

**Data flow:**
- `CrmView` holds `selectedClientId` state, passes it down to panels as a filter
- Each panel uses its hook (e.g., `useTasks(firmId, { clientId })`) to fetch data
- `firmId` comes from `useAuthStore`
- Mutations invalidate query keys to refresh lists
- `ClientTasksWidget` receives `clientId` as prop, passes it to `useTasks` as a filter

---

## Auto-Task Engine Logic

The auto-task engine scans filings and creates tasks automatically. It runs:
1. When the CRM Tasks panel loads (on mount)
2. Can be triggered manually via a "Run Auto-Tasks" button

### Algorithm (from legacy lines 255-280):

```
runAutoTaskEngine(firmId):
  today = current date
  windowEnd = today + 30 days

  for each client in firm:
    for each filing of client:
      if filing.status === 'filed': skip (already filed)

      taskDue = filing.due - 10 days  (AUTO_TASK_LEAD_DAYS)

      if taskDue <= windowEnd AND filing.due >= today:
        // Check if auto-task already exists for this filing
        existingTask = find task where filing_id = filing.id AND is_auto = true AND status != 'cancelled'
        if existingTask exists: skip

        // Create auto-task
        create task:
          title: getAutoTaskLabel(filing.type) + " — " + client.name
          description: filing type label + period + due date
          dueDate: taskDue
          priority: taskDue < today ? 'high' : 'medium'
          status: 'open'
          assignedTo: client's assigned staff (or first staff member)
          category: filing.type === 'nii' ? 'nii' : 'taxAuth'
          isAuto: true
          filingId: filing.id
          filingDue: filing.due
          filingType: filing.type
          period: filing.period
```

### cancelAutoTaskForFiling(firmId, filingId):

```
find task where firm_id = firmId AND filing_id = filingId AND is_auto = true AND status = 'open'
if found: update status to 'cancelled'
```

**Implementation note:** Since the `filings` table doesn't exist yet in the database, the auto-task engine will need to be implemented as a service method that can be wired up later when the filings module is built. For now, the service method signature and the task table schema should be ready. The actual scanning logic depends on filingService which doesn't exist yet.

**Recommendation:** Create the `taskService.runAutoTaskEngine()` and `taskService.cancelAutoTaskForFiling()` method stubs with TODO comments indicating they need the filings module. The task table schema already includes all needed columns (`filing_id`, `is_auto`, `filing_type`, `filing_due`, `period`).

---

## i18n Keys Needed

All keys must be added to `src/i18n/he.ts`, `src/i18n/ar.ts`, and `src/i18n/en.ts`.

### CRM section keys

```
crm.title                    — CRM page title
crm.description              — CRM page subtitle
crm.filterByClient           — Client filter placeholder
crm.allClients               — "All clients" option
crm.tabs.tasks               — Tasks tab label
crm.tabs.interactions        — Interactions tab label
crm.tabs.contacts            — Contacts tab label
```

### Contact keys

```
contacts.addContact           — "Add contact" button
contacts.editContact          — "Edit contact" dialog title
contacts.deleteContact        — "Delete contact" dialog title
contacts.confirmDelete        — Delete confirmation message
contacts.name                 — Name field label
contacts.role                 — Role field label
contacts.phone                — Phone field label
contacts.email                — Email field label
contacts.notes                — Notes field label
contacts.type                 — Type field label
contacts.client               — Associated client field label
contacts.noContacts           — Empty state message
contacts.createSuccess        — Success toast
contacts.updateSuccess        — Success toast
contacts.deleteSuccess        — Success toast
contacts.nameRequired         — Validation: name required
```

### Contact type keys

```
contactTypes.client           — "Client"
contactTypes.taxAuth          — "Tax Authority"
contactTypes.nii              — "National Insurance"
contactTypes.court            — "Court"
contactTypes.other            — "Other"
```

### Authority type keys (for interactions)

```
authorityTypes.taxAuth        — "Income Tax"
authorityTypes.vat            — "VAT"
authorityTypes.nii            — "National Insurance"
authorityTypes.court          — "Court"
authorityTypes.other          — "Other"
authorityTypes.client         — "Client only"
```

### Interaction keys

```
interactions.addInteraction    — "Log interaction" button
interactions.editInteraction   — "Edit interaction" dialog title
interactions.deleteInteraction — "Delete interaction" dialog title
interactions.confirmDelete     — Delete confirmation message
interactions.authority         — Authority/entity field label
interactions.channel           — Channel field label
interactions.date              — Date field label
interactions.subject           — Subject field label
interactions.notes             — Notes field label
interactions.outcome           — Outcome field label
interactions.staff             — Assigned staff field label
interactions.client            — Associated client field label
interactions.noInteractions    — Empty state message
interactions.createSuccess     — Success toast
interactions.updateSuccess     — Success toast
interactions.deleteSuccess     — Success toast
interactions.subjectRequired   — Validation: subject required
interactions.generalInteraction — "General interaction (no client)" label
```

### Task keys

```
tasks.addTask                  — "New task" button
tasks.editTask                 — "Edit task" dialog title
tasks.deleteTask               — "Delete task" dialog title
tasks.confirmDelete            — Delete confirmation message
tasks.title                    — Title field label
tasks.description              — Description field label
tasks.dueDate                  — Due date field label
tasks.priority                 — Priority field label
tasks.category                 — Category field label
tasks.assignedTo               — Assigned to field label
tasks.client                   — Client field label
tasks.noClient                 — "No client" option
tasks.noTasks                  — Empty state: no tasks
tasks.noOpenTasks              — Empty state: no open tasks
tasks.createSuccess            — Success toast
tasks.updateSuccess            — Success toast
tasks.deleteSuccess            — Success toast
tasks.completeSuccess          — Task completed toast
tasks.reopenSuccess            — Task reopened toast
tasks.titleRequired            — Validation: title required
tasks.stats.open               — "Open" stat label
tasks.stats.overdue            — "Overdue" stat label
tasks.stats.done               — "Done" stat label
tasks.stats.total              — "Total" stat label
tasks.filter.open              — "Open" filter
tasks.filter.done              — "Done" filter
tasks.filter.auto              — "Auto" filter
tasks.filter.all               — "All" filter
tasks.filter.allPriorities     — "All priorities" filter
tasks.autoIndicator            — "Auto-generated" tooltip/label
tasks.overdue                  — "Overdue" label
tasks.dueLabel                 — "Due:" prefix
tasks.assignedLabel            — "Assigned:" prefix
tasks.completedLabel           — "Completed:" prefix
tasks.runAutoEngine            — "Generate auto-tasks" button (stub)
tasks.autoEngineCreated        — "X auto-tasks created" toast
```

---

## Route Integration

**Current state:** `src/App.tsx` line 75 has `<SectionPlaceholder section="crm" />`.

**Change:** Replace with:
```tsx
import { CrmView } from '@/components/crm/CrmView';
// ...
<Route path="crm" element={<CrmView />} />
```

The sidebar (`src/components/layout/Sidebar.tsx` line 32) already has the `/crm` nav link configured.

---

## ClientTabs Integration

**Current state:** `src/components/clients/ClientTabs.tsx` line 38-43 shows a placeholder EmptyState for the Tasks tab.

**Changes needed:**
1. `ClientTabs` currently receives no props. It needs to accept `clientId: string`.
2. `ClientDetailView` needs to pass the client ID to `ClientTabs`.
3. The Tasks tab content should render `<ClientTasksWidget clientId={clientId} />` instead of EmptyState.

```tsx
// ClientTabs.tsx — change
export function ClientTabs({ clientId }: { clientId: string }) {
  // ...
  <TabsContent value="tasks">
    <ClientTasksWidget clientId={clientId} />
  </TabsContent>
}

// ClientDetailView.tsx — change
<ClientTabs clientId={client.id} />
```

---

## Gaps and Notes

1. **Filings table doesn't exist yet** — The auto-task engine depends on a `filings` table that will be created in a future phase. The `filing_id` column on tasks has no FK constraint. The `runAutoTaskEngine()` and `cancelAutoTaskForFiling()` service methods should be created as stubs with clear TODO markers.

2. **Staff assignment for auto-tasks** — The legacy auto-task engine assigns tasks to the staff member responsible for the client (via `getClientStaff()`). In the new system, this maps to the `client_staff` junction table. The `clientStaffService` already exists (`src/services/clientStaffService.ts`). The auto-task engine should use it to find the assigned staff.

3. **Contact type mismatch** — The existing `ContactType` in `src/types/crm.ts` is `'client' | 'taxAuth' | 'nii' | 'other'`, but the legacy app also uses `'court'`. This needs to be added to the type and the DB CHECK constraint.

4. **Task sorting** — The legacy app sorts tasks: open first, then by priority (high > medium > low), then by due date. This should be preserved.

5. **Task filtering** — The legacy app has a special "auto" filter that shows only auto-generated open tasks. This is a `filterStatus === 'auto'` value that is not a real status — it's a UI-level filter combining `isAuto === true` and `status === 'open'`.

6. **Phone field LTR** — Per CLAUDE.md RTL rules, phone number inputs must have `dir="ltr"`. This applies to the contact form's phone field.

7. **Permission checks** — The permissions module has `crm.view` and `crm.manage` permissions (visible in constants.ts SYSTEM_ROLES). Components should check these: view-only users can see CRM data but cannot create/edit/delete. Use `useAuthStore.can('crm.view')` and `useAuthStore.can('crm.manage')`.

## Success Criteria

- [ ] CRM route renders CrmView with three working tab panels
- [ ] Contacts CRUD: create, edit, delete, filter by client and type
- [ ] Interactions CRUD: create, edit, delete, filter by client, channel, authority
- [ ] Tasks CRUD: create, edit, toggle status, delete, filter by status/client/priority/category
- [ ] Task seq numbers auto-increment per firm
- [ ] Overdue tasks are visually highlighted (red border, "overdue" badge)
- [ ] Auto-tasks display lightning indicator
- [ ] ClientTasksWidget shows in ClientDetailView Tasks tab, filtered to that client
- [ ] New task from ClientTasksWidget is pre-filled with client
- [ ] All text uses t() — no hardcoded strings
- [ ] i18n keys present in he.ts, ar.ts, en.ts
- [ ] Phone inputs have dir="ltr"
- [ ] RLS policies on all 3 tables
- [ ] Soft delete pattern (deleted_at) on all 3 tables
- [ ] firm_id defense-in-depth on all service methods
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] Permission checks (crm.view / crm.manage) guard CRM operations
