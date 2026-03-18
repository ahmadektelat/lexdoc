# CRM Module — Technical Design

## Architecture Approach

Faithful migration of the legacy CRM module using the exact patterns established by clientService/useClients (service layer), StaffView (component layout), StaffForm (dialog forms), and PermissionsView (tab-based layout). The CRM module consists of three database tables (contacts, interactions, tasks), three services, three React Query hook files, and nine component files, plus modifications to six existing files.

**Why this approach over alternatives:**
- The codebase has a consistent pattern across all modules (clients, staff, permissions). Inventing new patterns would create inconsistency and maintenance burden.
- The requirements doc already specifies exact parity with legacy functionality — no new features to design, just map legacy behavior onto modern patterns.
- All shared code (types, constants, utilities, components) already exists — the design is about wiring, not inventing.

---

## Database Migration

### Migration file: `supabase/migrations/20260319100000_create_crm_tables.sql`

**Action:** Create
**Rationale:** Single migration file for all 3 CRM tables. Follows naming convention from existing migrations (YYYYMMDD + 6-digit sequence). All three tables are tightly related and should deploy atomically.

```sql
-- ============================================================
-- CRM Module: contacts, interactions, tasks
-- ============================================================

-- ---------- CONTACTS ----------
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

CREATE INDEX idx_contacts_firm_id ON contacts(firm_id);
CREATE INDEX idx_contacts_firm_client ON contacts(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_firm_type ON contacts(firm_id, type) WHERE deleted_at IS NULL;

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select" ON contacts FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "contacts_insert" ON contacts FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "contacts_update" ON contacts FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "contacts_delete" ON contacts FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO authenticated;

-- ---------- INTERACTIONS ----------
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  channel TEXT NOT NULL CHECK (channel IN ('call', 'email', 'meeting', 'letter', 'portal')),
  subject TEXT NOT NULL,
  notes TEXT,
  authority_type TEXT CHECK (authority_type IN ('taxAuth', 'vat', 'nii', 'court', 'other')),
  staff_id UUID REFERENCES staff(id),
  outcome TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interactions_firm_id ON interactions(firm_id);
CREATE INDEX idx_interactions_firm_client ON interactions(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_firm_date ON interactions(firm_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_firm_channel ON interactions(firm_id, channel) WHERE deleted_at IS NULL;

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interactions_select" ON interactions FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "interactions_insert" ON interactions FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "interactions_update" ON interactions FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "interactions_delete" ON interactions FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE TRIGGER interactions_updated_at BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON interactions TO authenticated;

-- ---------- TASKS ----------
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  filing_id UUID,  -- No FK: filings table does not exist yet
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  assigned_to UUID REFERENCES staff(id),
  category TEXT NOT NULL DEFAULT 'client' CHECK (category IN ('client', 'taxAuth', 'nii', 'internal')),
  is_auto BOOLEAN NOT NULL DEFAULT false,
  filing_type TEXT CHECK (filing_type IN ('maam', 'mekadmot', 'nikuyim', 'nii')),
  filing_due DATE,
  period TEXT,
  done_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-firm seq generation with advisory lock (same pattern as case_num on clients)
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

CREATE INDEX idx_tasks_firm_id ON tasks(firm_id);
CREATE INDEX idx_tasks_firm_status ON tasks(firm_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_client ON tasks(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_assigned ON tasks(firm_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_due ON tasks(firm_id, due_date) WHERE deleted_at IS NULL AND status = 'open';
CREATE INDEX idx_tasks_firm_filing ON tasks(firm_id, filing_id) WHERE deleted_at IS NULL AND is_auto = true;
CREATE UNIQUE INDEX idx_tasks_firm_seq ON tasks(firm_id, seq);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;
GRANT EXECUTE ON FUNCTION generate_task_seq(UUID) TO authenticated;
```

---

## File-by-File Change Plan

### Phase A: Type & Constant Modifications (no dependencies)

#### `src/types/crm.ts`
- **Action:** Modify
- **Changes:**
  1. Line 5: Add `'court'` to `ContactType` union:
     ```diff
     - export type ContactType = 'client' | 'taxAuth' | 'nii' | 'other';
     + export type ContactType = 'client' | 'taxAuth' | 'nii' | 'court' | 'other';
     ```
  2. Add `AuthorityType` union type after `InteractionChannel` (line 7):
     ```ts
     export type AuthorityType = 'taxAuth' | 'vat' | 'nii' | 'court' | 'other';
     ```
  3. Line 28: Make `contact_id` optional on the `Interaction` interface:
     ```diff
     - contact_id: string;
     + contact_id?: string;
     ```
  4. Line 33: Type `authorityType` with the new union:
     ```diff
     - authorityType?: string;
     + authorityType?: AuthorityType;
     ```
  5. Line 43: `CreateInteractionInput` is derived via `Omit<Interaction, ...>`, so it automatically inherits the optional `contact_id` and typed `authorityType`. No additional change needed on that line.
- **Rationale:** The legacy app uses `'court'` as a distinct contact type. `contact_id` must be optional on interactions since the legacy app does not require a contact when logging interactions. `AuthorityType` as a union prevents arbitrary strings from being passed.

#### `src/types/task.ts`
- **Action:** Modify
- **Changes:** Replace the `CreateTaskInput` type (line 36):
  ```diff
  - export type CreateTaskInput = Omit<Task, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;
  + export type CreateTaskInput = Omit<Task, 'id' | 'firm_id' | 'seq' | 'status' | 'doneAt' | 'deleted_at' | 'created_at' | 'updated_at'> & {
  +   isAuto?: boolean;
  +   filingType?: FilingType;
  +   filingDue?: string;
  +   period?: string;
  + };
  ```
- **Rationale:** `seq` is DB-generated (trigger), `status` defaults to `'open'` (service layer sets it), `doneAt` is set by `toggleStatus`. These should not be in the form input type. The auto-task fields (`isAuto`, `filingType`, `filingDue`, `period`) are made explicitly optional on the input because they are only set by the auto-task engine, never by the manual form. The `&` intersection re-declares them as optional, overriding the required `isAuto: boolean` from the base `Task` type.

#### `src/lib/constants.ts`
- **Action:** Modify
- **Changes:**
  1. Add `ContactType` and `AuthorityType` to the existing type import on line 6:
     ```diff
     - import type { FilingType, ClientType, StaffRole, TaskPriority, TaskCategory, InteractionChannel, DocumentSensitivity } from '@/types';
     + import type { FilingType, ClientType, StaffRole, TaskPriority, TaskCategory, InteractionChannel, DocumentSensitivity, ContactType, AuthorityType } from '@/types';
     ```
  2. Add two new constants after the existing `INTERACTION_CHANNELS` block (after line 73):
     ```ts
     export const CONTACT_TYPES: Record<ContactType, string> = {
       client: 'contactTypes.client',
       taxAuth: 'contactTypes.taxAuth',
       nii: 'contactTypes.nii',
       court: 'contactTypes.court',
       other: 'contactTypes.other',
     };

     export const AUTHORITY_TYPES: Record<AuthorityType, string> = {
       taxAuth: 'authorityTypes.taxAuth',
       vat: 'authorityTypes.vat',
       nii: 'authorityTypes.nii',
       court: 'authorityTypes.court',
       other: 'authorityTypes.other',
     };
     ```
- **Rationale:** These maps follow the exact same pattern as `CLIENT_TYPES`, `STAFF_ROLES`, etc. — i18n key lookup maps keyed by enum value. `AUTHORITY_TYPES` is now typed as `Record<AuthorityType, string>` instead of `Record<string, string>`, matching the new union type.

### Phase B: Services (depend on types/constants)

#### `src/services/contactService.ts`
- **Action:** Create
- **Pattern:** Follows `clientService.ts` exactly: `rowToContact()` mapper, `contactInputToRow()` mapper, all methods take `firmId` first, soft delete, filter `deleted_at IS NULL`.
- **Methods:**
  - `list(firmId: string, clientId?: string): Promise<Contact[]>` — Fetches all non-deleted contacts for a firm. If `clientId` is provided, filters by `client_id`. Orders by `created_at DESC`.
  - `getById(firmId: string, id: string): Promise<Contact>` — Single contact, firm_id defense-in-depth.
  - `create(firmId: string, input: CreateContactInput): Promise<Contact>` — Sets `firm_id`, inserts, returns created row.
  - `update(firmId: string, id: string, input: Partial<CreateContactInput>): Promise<Contact>` — Partial update with firm_id guard.
  - `delete(firmId: string, id: string): Promise<void>` — Soft delete via `deleted_at`.
- **Row mapper `rowToContact()`:**
  ```ts
  function rowToContact(row: Record<string, unknown>): Contact {
    return {
      id: row.id as string,
      firm_id: row.firm_id as string,
      client_id: (row.client_id as string) ?? undefined,
      type: row.type as ContactType,
      name: row.name as string,
      role: (row.role as string) ?? undefined,
      phone: (row.phone as string) ?? undefined,
      email: (row.email as string) ?? undefined,
      notes: (row.notes as string) ?? undefined,
      deleted_at: (row.deleted_at as string) ?? undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
  ```
- **Input mapper `contactInputToRow()`:**
  ```ts
  function contactInputToRow(input: CreateContactInput): Record<string, unknown> {
    return {
      client_id: input.client_id ?? null,
      type: input.type,
      name: input.name,
      role: input.role ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
    };
  }
  ```

#### `src/services/interactionService.ts`
- **Action:** Create
- **Pattern:** Same as contactService.
- **Methods:**
  - `list(firmId: string, clientId?: string): Promise<Interaction[]>` — All non-deleted interactions, optional client filter. Orders by `date DESC, created_at DESC`.
  - `create(firmId: string, input: CreateInteractionInput): Promise<Interaction>` — Sets `firm_id`, inserts.
  - `update(firmId: string, id: string, input: Partial<CreateInteractionInput>): Promise<Interaction>` — Partial update.
  - `delete(firmId: string, id: string): Promise<void>` — Soft delete.
- **Row mapper `rowToInteraction()`:**
  ```ts
  function rowToInteraction(row: Record<string, unknown>): Interaction {
    return {
      id: row.id as string,
      firm_id: row.firm_id as string,
      client_id: (row.client_id as string) ?? undefined,
      contact_id: (row.contact_id as string) ?? undefined,
      date: row.date as string,
      channel: row.channel as InteractionChannel,
      subject: row.subject as string,
      notes: (row.notes as string) ?? undefined,
      authorityType: (row.authority_type as AuthorityType) ?? undefined,
      staffId: (row.staff_id as string) ?? undefined,
      outcome: (row.outcome as string) ?? undefined,
      deleted_at: (row.deleted_at as string) ?? undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
  ```
- **Input mapper `interactionInputToRow()`:**
  ```ts
  function interactionInputToRow(input: CreateInteractionInput): Record<string, unknown> {
    return {
      client_id: input.client_id ?? null,
      contact_id: input.contact_id ?? null,
      date: input.date,
      channel: input.channel,
      subject: input.subject,
      notes: input.notes ?? null,
      authority_type: input.authorityType ?? null,
      staff_id: input.staffId ?? null,
      outcome: input.outcome ?? null,
    };
  }
  ```

#### `src/services/taskService.ts`
- **Action:** Create
- **Pattern:** Same as clientService, plus `toggleStatus` and auto-task stubs.
- **Methods:**
  - `list(firmId: string, filters?: { clientId?: string; status?: string; assignedTo?: string }): Promise<Task[]>` — All non-deleted tasks. Applies optional filters. Orders by: `status ASC` (open first), then by priority custom order (handled client-side — DB returns all, component sorts), then `due_date ASC`.
  - `getById(firmId: string, id: string): Promise<Task>` — Single task.
  - `create(firmId: string, input: CreateTaskInput): Promise<Task>` — Sets `firm_id`. The `seq` field should be set to `0` in the insert to trigger the DB auto-seq trigger.
  - `update(firmId: string, id: string, input: Partial<CreateTaskInput>): Promise<Task>` — Partial update.
  - `toggleStatus(firmId: string, id: string, currentStatus: TaskStatus): Promise<Task>` — If `currentStatus === 'open'`, sets `status: 'done', done_at: now()`. If `currentStatus === 'done'`, sets `status: 'open', done_at: null`.
  - `delete(firmId: string, id: string): Promise<void>` — Soft delete.
  - `runAutoTaskEngine(firmId: string): Promise<number>` — **STUB**. Returns 0. TODO comment: requires filings table and filingService.
  - `cancelAutoTaskForFiling(firmId: string, filingId: string): Promise<void>` — **STUB**. TODO comment: requires filings table. The query itself is ready (find task where `filing_id = filingId AND is_auto = true AND status = 'open'`, update to `cancelled`), but no filings exist yet, so this is a no-op until the filings module.
- **Row mapper `rowToTask()`:**
  ```ts
  function rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      firm_id: row.firm_id as string,
      client_id: (row.client_id as string) ?? undefined,
      filing_id: (row.filing_id as string) ?? undefined,
      seq: row.seq as number,
      title: row.title as string,
      desc: (row.description as string) ?? undefined,
      dueDate: (row.due_date as string) ?? undefined,
      priority: row.priority as TaskPriority,
      status: row.status as TaskStatus,
      assignedTo: (row.assigned_to as string) ?? undefined,
      category: row.category as TaskCategory,
      isAuto: row.is_auto as boolean,
      filingType: (row.filing_type as string as FilingType) ?? undefined,
      filingDue: (row.filing_due as string) ?? undefined,
      period: (row.period as string) ?? undefined,
      doneAt: (row.done_at as string) ?? undefined,
      deleted_at: (row.deleted_at as string) ?? undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
  ```
- **Input mapper `taskInputToRow()`:**
  ```ts
  function taskInputToRow(input: CreateTaskInput): Record<string, unknown> {
    return {
      client_id: input.client_id ?? null,
      filing_id: input.filing_id ?? null,
      seq: 0,  // Trigger generates actual seq
      title: input.title,
      description: input.desc ?? null,
      due_date: input.dueDate ?? null,
      priority: input.priority,
      status: 'open',  // Always 'open' on creation; toggleStatus changes it
      assigned_to: input.assignedTo ?? null,
      category: input.category,
      is_auto: input.isAuto ?? false,
      filing_type: input.filingType ?? null,
      filing_due: input.filingDue ?? null,
      period: input.period ?? null,
      done_at: null,  // Never set on creation; toggleStatus sets it
    };
  }
  ```
  **Note:** `seq`, `status`, and `doneAt` are excluded from `CreateTaskInput` (server-controlled fields). The service layer hardcodes `seq: 0` (DB trigger overwrites), `status: 'open'`, and `done_at: null` in the row mapper.
- **Note on `list` ordering:** The DB query orders by `status ASC, due_date ASC NULLS LAST`. Priority sorting is done client-side for flexibility with the UI filter states.

### Phase C: Hooks (depend on services)

#### `src/hooks/useContacts.ts`
- **Action:** Create
- **Pattern:** Follows `useClients.ts` exactly.
- **Exports:**
  - `contactKeys` — Query key factory: `{ all: ['contacts'], lists: () => [..., 'list'], list: (firmId, clientId?) => [...], details: () => [..., 'detail'], detail: (id) => [...] }`
  - `useContacts(firmId: string | null, clientId?: string)` — `useQuery`, `enabled: !!firmId`, calls `contactService.list(firmId!, clientId)`. Query key includes clientId to cache per-client contact lists separately.
  - `useCreateContact()` — `useMutation`, mutationFn takes `{ firmId, input }`, invalidates `contactKeys.lists()`, toast `t('contacts.createSuccess')`.
  - `useUpdateContact()` — `useMutation`, mutationFn takes `{ firmId, id, input }`, invalidates lists + detail, toast `t('contacts.updateSuccess')`.
  - `useDeleteContact()` — `useMutation`, uses `firmId` from `useAuthStore`, mutationFn takes `id`, invalidates lists, toast `t('contacts.deleteSuccess')`.

#### `src/hooks/useInteractions.ts`
- **Action:** Create
- **Pattern:** Same as useContacts.
- **Exports:**
  - `interactionKeys` — Same factory pattern.
  - `useInteractions(firmId: string | null, clientId?: string)` — `useQuery`, calls `interactionService.list(firmId!, clientId)`.
  - `useCreateInteraction()` — `useMutation`, invalidates `interactionKeys.lists()`, toast `t('interactions.createSuccess')`.
  - `useUpdateInteraction()` — `useMutation`, invalidates lists, toast `t('interactions.updateSuccess')`.
  - `useDeleteInteraction()` — `useMutation`, from store `firmId`, invalidates lists, toast `t('interactions.deleteSuccess')`.

#### `src/hooks/useTasks.ts`
- **Action:** Create
- **Pattern:** Same as useClients, extended for toggleStatus.
- **Exports:**
  - `taskKeys` — `{ all: ['tasks'], lists: () => [..., 'list'], list: (firmId, filters?) => [...], details: () => [..., 'detail'], detail: (id) => [...] }`. The list key serializes the filters object so different filter combos are cached separately.
  - `useTasks(firmId: string | null, filters?: { clientId?: string; status?: string; assignedTo?: string })` — `useQuery`, `enabled: !!firmId`, calls `taskService.list(firmId!, filters)`.
  - `useTask(id: string | undefined)` — `useQuery` for single task, uses `firmId` from store.
  - `useCreateTask()` — `useMutation`, takes `{ firmId, input }`, invalidates `taskKeys.lists()`, toast `t('tasks.createSuccess')`.
  - `useUpdateTask()` — `useMutation`, takes `{ firmId, id, input }`, invalidates lists + detail, toast `t('tasks.updateSuccess')`.
  - `useToggleTaskStatus()` — `useMutation`, takes `{ firmId, id, currentStatus }`, calls `taskService.toggleStatus()`, invalidates lists + detail, toast `t('tasks.completeSuccess')` or `t('tasks.reopenSuccess')` depending on direction.
  - `useDeleteTask()` — `useMutation`, from store `firmId`, invalidates lists, toast `t('tasks.deleteSuccess')`.
  - `useRunAutoTaskEngine()` — `useMutation` (stub), takes `firmId`, calls `taskService.runAutoTaskEngine()`, invalidates `taskKeys.lists()`, toast `t('tasks.autoEngineCreated')`.
  - `useCancelAutoTaskForFiling()` — `useMutation` (stub), takes `{ firmId, filingId }`.

### Phase D: Components (depend on hooks)

#### `src/components/crm/CrmView.tsx`
- **Action:** Create
- **Props:** None (top-level route component)
- **State:**
  - `activeTab: 'tasks' | 'interactions' | 'contacts'` (default: `'tasks'`)
  - `selectedClientId: string | undefined` (client filter dropdown)
- **Structure:**
  ```
  <div className="p-6 animate-fade-in">
    <PageHeader title={t('crm.title')} description={t('crm.description')} />

    {/* Client filter dropdown */}
    <div className="mb-4">
      <Select value={selectedClientId ?? ''} onValueChange={...}>
        <SelectTrigger className="max-w-xs">
          <SelectValue placeholder={t('crm.allClients')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{t('crm.allClients')}</SelectItem>
          {clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>

    {/* Tab navigation */}
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="tasks">{t('crm.tabs.tasks')}</TabsTrigger>
        <TabsTrigger value="interactions">{t('crm.tabs.interactions')}</TabsTrigger>
        <TabsTrigger value="contacts">{t('crm.tabs.contacts')}</TabsTrigger>
      </TabsList>

      <TabsContent value="tasks">
        <TasksPanel clientId={selectedClientId} />
      </TabsContent>
      <TabsContent value="interactions">
        <InteractionsPanel clientId={selectedClientId} />
      </TabsContent>
      <TabsContent value="contacts">
        <ContactsPanel clientId={selectedClientId} />
      </TabsContent>
    </Tabs>
  </div>
  ```
- **Data:** Uses `useClients(firmId)` for the client filter dropdown. Passes `clientId` down to each panel.
- **Permission:** Checks `can('crm.view')`. If no permission, show access denied message.
- **Rationale:** Matches PermissionsView's tab-based layout. The client filter is CrmView-level state, not per-panel.

#### `src/components/crm/ContactsPanel.tsx`
- **Action:** Create
- **Props:** `{ clientId?: string }`
- **State:**
  - `search: string`
  - `typeFilter: ContactType | 'all'`
  - `formOpen: boolean`
  - `editingContact: Contact | undefined`
  - `deleteTarget: Contact | null`
- **Data:** `useContacts(firmId, clientId)`, `useDeleteContact()`.
- **Structure:**
  - Filter bar: `SearchInput` + contact type filter buttons (from `CONTACT_TYPES` constant)
  - Add button: `+ Add Contact` opens `ContactForm` dialog
  - Contact grid: Cards with avatar (first letter), name, role, type badge, phone (dir="ltr"), email
  - Each card: edit and delete action buttons
  - Empty state: `EmptyState` with `Users` icon
  - Delete confirmation: `ConfirmDialog`
- **Permission:** Add button and edit/delete actions only shown if `can('crm.manage')`.
- **Client-side filtering:** `useMemo` filtering by search (name, role, email), typeFilter, like ClientsView pattern.

#### `src/components/crm/ContactForm.tsx`
- **Action:** Create
- **Props:** `{ open, onOpenChange, contact?: Contact, defaultClientId?: string }`
- **Pattern:** Follows `StaffForm.tsx` exactly.
- **Form state:**
  ```ts
  interface FormState {
    type: ContactType;
    name: string;
    role: string;
    phone: string;
    email: string;
    notes: string;
    client_id: string;
  }
  ```
- **Validation:** `name` required.
- **Fields:**
  - Client picker: `Select` dropdown of clients (from `useClients`). Pre-filled with `defaultClientId` or contact's `client_id`.
  - Type: `Select` from `CONTACT_TYPES`.
  - Name: `Input`, required.
  - Role: `Input`.
  - Phone: `Input` with `dir="ltr"`.
  - Email: `Input` with `dir="ltr"`.
  - Notes: `Textarea`.
- **Submit:** Calls `useCreateContact` or `useUpdateContact` (same pattern as StaffForm).

#### `src/components/crm/InteractionsPanel.tsx`
- **Action:** Create
- **Props:** `{ clientId?: string }`
- **State:**
  - `channelFilter: InteractionChannel | 'all'`
  - `authorityFilter: AuthorityType | 'all'`
  - `formOpen: boolean`
  - `editingInteraction: Interaction | undefined`
  - `deleteTarget: Interaction | null`
- **Data:** `useInteractions(firmId, clientId)`, `useDeleteInteraction()`.
- **Structure:**
  - Filter bar: Channel filter buttons (from `INTERACTION_CHANNELS`), authority filter (from `AUTHORITY_TYPES`)
  - Add button: `+ Log Interaction` opens `InteractionForm` dialog
  - DataTable with columns: date, client name (if no clientId filter), staff, authority, channel badge, subject, outcome
  - Delete confirmation: `ConfirmDialog`
- **Column definitions:** Follow `StaffView` `columns` pattern using `useMemo` and `ColumnDef<Interaction>`.
- **Note:** Needs to resolve client names and staff names. For client names, use `useClients(firmId)` and create a lookup map. For staff names, use `useStaff(firmId)` similarly.
- **Permission:** Add/edit/delete only if `can('crm.manage')`.

#### `src/components/crm/InteractionForm.tsx`
- **Action:** Create
- **Props:** `{ open, onOpenChange, interaction?: Interaction, defaultClientId?: string }`
- **Pattern:** Follows `StaffForm.tsx`.
- **Form state:**
  ```ts
  interface FormState {
    client_id: string;
    contact_id: string;
    date: string;
    channel: InteractionChannel;
    subject: string;
    notes: string;
    authorityType: AuthorityType | '';  // empty string = not selected
    staffId: string;
    outcome: string;
  }
  ```
- **Validation:** `subject` required.
- **Fields:**
  - Client: `Select` dropdown (optional).
  - Contact: `Select` dropdown, filtered to contacts of the selected client (from `useContacts`). Only shown if a client is selected.
  - Date: `Input type="date"`, defaults to today (`getToday()`).
  - Channel: `Select` from `INTERACTION_CHANNELS`.
  - Authority: `Select` from `AUTHORITY_TYPES` (optional). Include a "Client only" option (`t('authorityTypes.client')`) that maps to empty string / `undefined` (no authority_type in DB). The `AUTHORITY_TYPES` constant covers only actual authority values; the "client only" option is a UI-level deselect.
  - Subject: `Input`, required.
  - Notes: `Textarea`.
  - Staff: `StaffPicker` component.
  - Outcome: `Input`.

#### `src/components/crm/TasksPanel.tsx`
- **Action:** Create
- **Props:** `{ clientId?: string }`
- **State:**
  - `statusFilter: 'open' | 'done' | 'auto' | 'all'` (default: `'open'`)
  - `priorityFilter: TaskPriority | 'all'` (default: `'all'`)
  - `categoryFilter: TaskCategory | 'all'` (default: `'all'`)
  - `formOpen: boolean`
  - `editingTask: Task | undefined`
  - `deleteTarget: Task | null`
- **Data:** `useTasks(firmId, { clientId })`, `useToggleTaskStatus()`, `useDeleteTask()`.
- **Structure:**
  ```
  {/* Stats cards row */}
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <StatCard label={t('tasks.stats.open')} count={openCount} color="amber" />
    <StatCard label={t('tasks.stats.overdue')} count={overdueCount} color="red" />
    <StatCard label={t('tasks.stats.done')} count={doneCount} color="green" />
    <StatCard label={t('tasks.stats.total')} count={totalCount} color="blue" />
  </div>

  {/* Filter bar */}
  <div className="flex flex-wrap gap-2 mb-4">
    {/* Status filter buttons */}
    {/* Priority filter buttons */}
    {/* Category filter buttons */}
    <Button onClick={() => setFormOpen(true)}>
      <Plus /> {t('tasks.addTask')}
    </Button>
  </div>

  {/* Task list */}
  <div className="space-y-3">
    {filteredTasks.map(task => <TaskCard key={task.id} task={task} ... />)}
  </div>
  ```
- **Stats computation:** `useMemo` over tasks data:
  - `openCount`: tasks where `status === 'open'`
  - `overdueCount`: tasks where `status === 'open' && dueDate && isOverdue(dueDate)`
  - `doneCount`: tasks where `status === 'done'`
  - `totalCount`: all tasks
- **Client-side filtering:** `useMemo`:
  - `statusFilter === 'open'`: `status === 'open'`
  - `statusFilter === 'done'`: `status === 'done'`
  - `statusFilter === 'auto'`: `isAuto === true && status === 'open'`
  - `statusFilter === 'all'`: no status filter
  - `priorityFilter !== 'all'`: `priority === priorityFilter`
  - `categoryFilter !== 'all'`: `category === categoryFilter`
- **Client-side sorting:** After filtering, sort by: open before done, then by priority weight (high=0, medium=1, low=2), then by dueDate ascending (nulls last).
- **Permission:** Add/edit/delete only if `can('crm.manage')`.
- **StatCard:** Inline helper component within TasksPanel (not worth extracting to shared — it's CRM-specific styling):
  ```tsx
  function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
    return (
      <div className={`rounded-lg border p-4 bg-${color}-50 dark:bg-${color}-900/10`}>
        <p className="text-2xl font-bold">{count}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    );
  }
  ```
  **Important:** Use explicit Tailwind class strings, not template interpolation, for PurgeCSS safety. Define a small color map like:
  ```ts
  const STAT_COLORS = {
    amber: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800',
    red: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
    green: 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
    blue: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800',
  };
  ```

#### `src/components/crm/TaskForm.tsx`
- **Action:** Create
- **Props:** `{ open, onOpenChange, task?: Task, defaultClientId?: string }`
- **Pattern:** Follows `StaffForm.tsx`.
- **Form state:**
  ```ts
  interface FormState {
    title: string;
    description: string;
    dueDate: string;
    priority: TaskPriority;
    category: TaskCategory;
    assignedTo: string;
    client_id: string;
  }
  ```
- **Validation:** `title` required.
- **Fields:**
  - Title: `Input`, required.
  - Description: `Textarea`.
  - Client: `Select` dropdown (optional). Pre-filled with `defaultClientId`.
  - Due date: `Input type="date"`.
  - Priority: `Select` from `TASK_PRIORITIES`.
  - Category: `Select` from `TASK_CATEGORIES`.
  - Assigned to: `StaffPicker`.
- **Submit:** For create, constructs `CreateTaskInput` with the form fields only (`title`, `desc`, `dueDate`, `priority`, `category`, `assignedTo`, `client_id`). Server-controlled fields (`seq`, `status`, `doneAt`) are excluded from the type — the service layer handles them. `isAuto` defaults to `false` (optional on input). For edit, calls `useUpdateTask`.

#### `src/components/crm/TaskCard.tsx`
- **Action:** Create
- **Props:** `{ task: Task; onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void; canManage: boolean; clientName?: string; staffName?: string }`
- **Structure:**
  ```
  <div className={cn(
    "rounded-lg border p-4 transition-colors",
    task.status === 'done' && "opacity-60",
    task.dueDate && task.status === 'open' && isOverdue(task.dueDate) && "border-red-300 dark:border-red-800"
  )}>
    <div className="flex items-start gap-3">
      {/* Checkbox for toggle */}
      <Checkbox
        checked={task.status === 'done'}
        onCheckedChange={() => onToggle(task)}
        disabled={!canManage}
      />

      <div className="flex-1 min-w-0">
        {/* Title row: seq + title + auto indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">#{task.seq}</span>
          <span className={cn("font-medium", task.status === 'done' && "line-through")}>{task.title}</span>
          {task.isAuto && <Zap className="h-3 w-3 text-amber-500" title={t('tasks.autoIndicator')} />}
        </div>

        {/* Meta row: badges */}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <PriorityBadge priority={task.priority} />
          <Badge variant="outline">{t(TASK_CATEGORIES[task.category])}</Badge>
          {clientName && <Badge variant="secondary">{clientName}</Badge>}
          {task.dueDate && (
            <span className={cn("text-xs", isOverdue(task.dueDate) && task.status === 'open' ? "text-red-600 font-medium" : "text-muted-foreground")}>
              {t('tasks.dueLabel')} {formatDate(task.dueDate)}
            </span>
          )}
          {staffName && (
            <span className="text-xs text-muted-foreground">
              {t('tasks.assignedLabel')} {staffName}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {canManage && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onEdit(task)}><Pencil /></Button>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(task)}><Trash2 /></Button>
        </div>
      )}
    </div>
  </div>
  ```
- **Rationale:** Reusable in both `TasksPanel` and `ClientTasksWidget`. Receives resolved names as props so it doesn't need its own queries.

#### `src/components/crm/ClientTasksWidget.tsx`
- **Action:** Create
- **Props:** `{ clientId: string }`
- **State:**
  - `statusFilter: 'open' | 'done' | 'all'` (default: `'open'`)
  - `formOpen: boolean`
  - `editingTask: Task | undefined`
  - `deleteTarget: Task | null`
- **Data:** `useTasks(firmId, { clientId })`, `useToggleTaskStatus()`, `useDeleteTask()`, `useStaff(firmId)` (for staff name lookup).
- **Structure:** Simplified version of TasksPanel:
  - Filter buttons (open/done/all)
  - Add task button (opens TaskForm with `defaultClientId={clientId}`)
  - TaskCard list
  - Empty state if no tasks
  - ConfirmDialog for delete
- **Permission:** Actions guarded by `can('crm.manage')`.
- **Rationale:** Lighter than TasksPanel — no stats cards, no priority/category filters. Focused on a single client.

### Phase E: Integration Changes (depend on components)

#### `src/App.tsx`
- **Action:** Modify
- **Changes:**
  1. Add import: `import { CrmView } from '@/components/crm/CrmView';` (after line 21)
  2. Line 75: Replace `<SectionPlaceholder section="crm" />` with `<CrmView />`
- **Rationale:** Wire CRM route to actual component.

#### `src/components/clients/ClientDetailView.tsx`
- **Action:** Modify
- **Changes:**
  1. Line 103: Change `<ClientTabs />` to `<ClientTabs clientId={client.id} />`
- **Rationale:** Pass client ID down for the ClientTasksWidget.

#### `src/components/clients/ClientTabs.tsx`
- **Action:** Modify
- **Changes:**
  1. Add import: `import { ClientTasksWidget } from '@/components/crm/ClientTasksWidget';`
  2. Line 10: Change `export function ClientTabs()` to `export function ClientTabs({ clientId }: { clientId: string })`
  3. Lines 38-43: Replace Tasks tab EmptyState with `<ClientTasksWidget clientId={clientId} />`
- **Rationale:** Wire the ClientTasksWidget into the existing client detail tabs.

### Phase F: i18n Keys

#### `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts`
- **Action:** Modify (all three)
- **Changes:** Add all CRM keys from the requirements document (see full key list below). Keys must be added to all three files.
- **Key sections to add:**
  - `crm.*` — Page title, description, tab labels, client filter
  - `contacts.*` — Contact CRUD labels, form fields, toasts, validation
  - `contactTypes.*` — Contact type labels (client, taxAuth, nii, court, other)
  - `authorityTypes.*` — Authority type labels (taxAuth, vat, nii, court, other)
  - `interactions.*` — Interaction CRUD labels, form fields, toasts, validation
  - `tasks.*` — Task CRUD labels, form fields, toasts, validation, stats, filters, indicators

**English keys (add after the `permissions.group.settings` block):**

```ts
// CRM
'crm.title': 'CRM',
'crm.description': 'Contacts, interactions, and task management',
'crm.filterByClient': 'Filter by client',
'crm.allClients': 'All Clients',
'crm.tabs.tasks': 'Tasks',
'crm.tabs.interactions': 'Interactions',
'crm.tabs.contacts': 'Contacts',

// Contacts
'contacts.addContact': 'Add Contact',
'contacts.editContact': 'Edit Contact',
'contacts.deleteContact': 'Delete Contact',
'contacts.confirmDelete': 'Are you sure you want to delete this contact?',
'contacts.name': 'Name',
'contacts.role': 'Role',
'contacts.phone': 'Phone',
'contacts.email': 'Email',
'contacts.notes': 'Notes',
'contacts.type': 'Type',
'contacts.client': 'Client',
'contacts.noContacts': 'No contacts yet',
'contacts.noContactsDesc': 'Add contacts to track communication details',
'contacts.createSuccess': 'Contact created successfully',
'contacts.updateSuccess': 'Contact updated successfully',
'contacts.deleteSuccess': 'Contact deleted successfully',
'contacts.nameRequired': 'Name is required',

// Contact types
'contactTypes.client': 'Client',
'contactTypes.taxAuth': 'Tax Authority',
'contactTypes.nii': 'National Insurance',
'contactTypes.court': 'Court',
'contactTypes.other': 'Other',

// Authority types
'authorityTypes.taxAuth': 'Income Tax',
'authorityTypes.vat': 'VAT',
'authorityTypes.nii': 'National Insurance',
'authorityTypes.court': 'Court',
'authorityTypes.other': 'Other',
'authorityTypes.client': 'Client Only',

// Interactions
'interactions.addInteraction': 'Log Interaction',
'interactions.editInteraction': 'Edit Interaction',
'interactions.deleteInteraction': 'Delete Interaction',
'interactions.confirmDelete': 'Are you sure you want to delete this interaction?',
'interactions.authority': 'Authority',
'interactions.channel': 'Channel',
'interactions.date': 'Date',
'interactions.subject': 'Subject',
'interactions.notes': 'Notes',
'interactions.outcome': 'Outcome',
'interactions.staff': 'Staff Member',
'interactions.client': 'Client',
'interactions.noInteractions': 'No interactions recorded',
'interactions.noInteractionsDesc': 'Log interactions to track communication history',
'interactions.createSuccess': 'Interaction logged successfully',
'interactions.updateSuccess': 'Interaction updated successfully',
'interactions.deleteSuccess': 'Interaction deleted successfully',
'interactions.subjectRequired': 'Subject is required',
'interactions.generalInteraction': 'General (no client)',
'interactions.contact': 'Contact',

// Tasks
'tasks.addTask': 'New Task',
'tasks.editTask': 'Edit Task',
'tasks.deleteTask': 'Delete Task',
'tasks.confirmDelete': 'Are you sure you want to delete this task?',
'tasks.title': 'Title',
'tasks.description': 'Description',
'tasks.dueDate': 'Due Date',
'tasks.priority': 'Priority',
'tasks.category': 'Category',
'tasks.assignedTo': 'Assigned To',
'tasks.client': 'Client',
'tasks.noClient': 'No client',
'tasks.noTasks': 'No tasks yet',
'tasks.noTasksDesc': 'Create tasks to track work items',
'tasks.noOpenTasks': 'No open tasks',
'tasks.createSuccess': 'Task created successfully',
'tasks.updateSuccess': 'Task updated successfully',
'tasks.deleteSuccess': 'Task deleted successfully',
'tasks.completeSuccess': 'Task marked as complete',
'tasks.reopenSuccess': 'Task reopened',
'tasks.titleRequired': 'Title is required',
'tasks.stats.open': 'Open',
'tasks.stats.overdue': 'Overdue',
'tasks.stats.done': 'Done',
'tasks.stats.total': 'Total',
'tasks.filter.open': 'Open',
'tasks.filter.done': 'Done',
'tasks.filter.auto': 'Auto',
'tasks.filter.all': 'All',
'tasks.filter.allPriorities': 'All Priorities',
'tasks.filter.allCategories': 'All Categories',
'tasks.autoIndicator': 'Auto-generated task',
'tasks.overdue': 'Overdue',
'tasks.dueLabel': 'Due:',
'tasks.assignedLabel': 'Assigned:',
'tasks.completedLabel': 'Completed:',
'tasks.runAutoEngine': 'Generate Auto-Tasks',
'tasks.autoEngineCreated': 'Auto-tasks generated',
```

**Hebrew keys (same keys, Hebrew values):**

```ts
'crm.title': 'ניהול קשרי לקוחות',
'crm.description': 'אנשי קשר, אינטראקציות וניהול משימות',
'crm.filterByClient': 'סנן לפי לקוח',
'crm.allClients': 'כל הלקוחות',
'crm.tabs.tasks': 'משימות',
'crm.tabs.interactions': 'אינטראקציות',
'crm.tabs.contacts': 'אנשי קשר',

'contacts.addContact': 'הוסף איש קשר',
'contacts.editContact': 'עריכת איש קשר',
'contacts.deleteContact': 'מחיקת איש קשר',
'contacts.confirmDelete': 'האם למחוק את איש הקשר?',
'contacts.name': 'שם',
'contacts.role': 'תפקיד',
'contacts.phone': 'טלפון',
'contacts.email': 'דוא"ל',
'contacts.notes': 'הערות',
'contacts.type': 'סוג',
'contacts.client': 'לקוח',
'contacts.noContacts': 'אין אנשי קשר',
'contacts.noContactsDesc': 'הוסף אנשי קשר למעקב אחר פרטי תקשורת',
'contacts.createSuccess': 'איש קשר נוסף בהצלחה',
'contacts.updateSuccess': 'איש קשר עודכן בהצלחה',
'contacts.deleteSuccess': 'איש קשר נמחק בהצלחה',
'contacts.nameRequired': 'שם הוא שדה חובה',

'contactTypes.client': 'לקוח',
'contactTypes.taxAuth': 'רשות המסים',
'contactTypes.nii': 'ביטוח לאומי',
'contactTypes.court': 'בית משפט',
'contactTypes.other': 'אחר',

'authorityTypes.taxAuth': 'מס הכנסה',
'authorityTypes.vat': 'מע"מ',
'authorityTypes.nii': 'ביטוח לאומי',
'authorityTypes.court': 'בית משפט',
'authorityTypes.other': 'אחר',
'authorityTypes.client': 'לקוח בלבד',

'interactions.addInteraction': 'רשום אינטראקציה',
'interactions.editInteraction': 'עריכת אינטראקציה',
'interactions.deleteInteraction': 'מחיקת אינטראקציה',
'interactions.confirmDelete': 'האם למחוק את האינטראקציה?',
'interactions.authority': 'גורם/רשות',
'interactions.channel': 'ערוץ',
'interactions.date': 'תאריך',
'interactions.subject': 'נושא',
'interactions.notes': 'הערות',
'interactions.outcome': 'תוצאה',
'interactions.staff': 'איש צוות',
'interactions.client': 'לקוח',
'interactions.noInteractions': 'אין אינטראקציות',
'interactions.noInteractionsDesc': 'רשום אינטראקציות למעקב אחר היסטוריית תקשורת',
'interactions.createSuccess': 'אינטראקציה נרשמה בהצלחה',
'interactions.updateSuccess': 'אינטראקציה עודכנה בהצלחה',
'interactions.deleteSuccess': 'אינטראקציה נמחקה בהצלחה',
'interactions.subjectRequired': 'נושא הוא שדה חובה',
'interactions.generalInteraction': 'כללי (ללא לקוח)',
'interactions.contact': 'איש קשר',

'tasks.addTask': 'משימה חדשה',
'tasks.editTask': 'עריכת משימה',
'tasks.deleteTask': 'מחיקת משימה',
'tasks.confirmDelete': 'האם למחוק את המשימה?',
'tasks.title': 'כותרת',
'tasks.description': 'תיאור',
'tasks.dueDate': 'תאריך יעד',
'tasks.priority': 'עדיפות',
'tasks.category': 'קטגוריה',
'tasks.assignedTo': 'שויך ל',
'tasks.client': 'לקוח',
'tasks.noClient': 'ללא לקוח',
'tasks.noTasks': 'אין משימות',
'tasks.noTasksDesc': 'צור משימות למעקב אחר פריטי עבודה',
'tasks.noOpenTasks': 'אין משימות פתוחות',
'tasks.createSuccess': 'משימה נוצרה בהצלחה',
'tasks.updateSuccess': 'משימה עודכנה בהצלחה',
'tasks.deleteSuccess': 'משימה נמחקה בהצלחה',
'tasks.completeSuccess': 'משימה הושלמה',
'tasks.reopenSuccess': 'משימה נפתחה מחדש',
'tasks.titleRequired': 'כותרת היא שדה חובה',
'tasks.stats.open': 'פתוחות',
'tasks.stats.overdue': 'באיחור',
'tasks.stats.done': 'הושלמו',
'tasks.stats.total': 'סה"כ',
'tasks.filter.open': 'פתוחות',
'tasks.filter.done': 'הושלמו',
'tasks.filter.auto': 'אוטומטי',
'tasks.filter.all': 'הכל',
'tasks.filter.allPriorities': 'כל העדיפויות',
'tasks.filter.allCategories': 'כל הקטגוריות',
'tasks.autoIndicator': 'משימה אוטומטית',
'tasks.overdue': 'באיחור',
'tasks.dueLabel': 'יעד:',
'tasks.assignedLabel': 'שויך:',
'tasks.completedLabel': 'הושלם:',
'tasks.runAutoEngine': 'ייצר משימות אוטומטיות',
'tasks.autoEngineCreated': 'משימות אוטומטיות נוצרו',
```

**Arabic keys (same keys, Arabic values):**

```ts
'crm.title': 'إدارة علاقات العملاء',
'crm.description': 'جهات الاتصال والتفاعلات وإدارة المهام',
'crm.filterByClient': 'تصفية حسب العميل',
'crm.allClients': 'جميع العملاء',
'crm.tabs.tasks': 'المهام',
'crm.tabs.interactions': 'التفاعلات',
'crm.tabs.contacts': 'جهات الاتصال',

'contacts.addContact': 'إضافة جهة اتصال',
'contacts.editContact': 'تعديل جهة الاتصال',
'contacts.deleteContact': 'حذف جهة الاتصال',
'contacts.confirmDelete': 'هل تريد حذف جهة الاتصال؟',
'contacts.name': 'الاسم',
'contacts.role': 'الدور',
'contacts.phone': 'الهاتف',
'contacts.email': 'البريد الإلكتروني',
'contacts.notes': 'ملاحظات',
'contacts.type': 'النوع',
'contacts.client': 'العميل',
'contacts.noContacts': 'لا توجد جهات اتصال',
'contacts.noContactsDesc': 'أضف جهات اتصال لتتبع تفاصيل التواصل',
'contacts.createSuccess': 'تم إضافة جهة الاتصال بنجاح',
'contacts.updateSuccess': 'تم تحديث جهة الاتصال بنجاح',
'contacts.deleteSuccess': 'تم حذف جهة الاتصال بنجاح',
'contacts.nameRequired': 'الاسم مطلوب',

'contactTypes.client': 'عميل',
'contactTypes.taxAuth': 'سلطة الضرائب',
'contactTypes.nii': 'التأمين الوطني',
'contactTypes.court': 'محكمة',
'contactTypes.other': 'أخرى',

'authorityTypes.taxAuth': 'ضريبة الدخل',
'authorityTypes.vat': 'ضريبة القيمة المضافة',
'authorityTypes.nii': 'التأمين الوطني',
'authorityTypes.court': 'محكمة',
'authorityTypes.other': 'أخرى',
'authorityTypes.client': 'عميل فقط',

'interactions.addInteraction': 'تسجيل تفاعل',
'interactions.editInteraction': 'تعديل التفاعل',
'interactions.deleteInteraction': 'حذف التفاعل',
'interactions.confirmDelete': 'هل تريد حذف هذا التفاعل؟',
'interactions.authority': 'الجهة/السلطة',
'interactions.channel': 'القناة',
'interactions.date': 'التاريخ',
'interactions.subject': 'الموضوع',
'interactions.notes': 'ملاحظات',
'interactions.outcome': 'النتيجة',
'interactions.staff': 'عضو الفريق',
'interactions.client': 'العميل',
'interactions.noInteractions': 'لا توجد تفاعلات',
'interactions.noInteractionsDesc': 'سجّل التفاعلات لتتبع سجل التواصل',
'interactions.createSuccess': 'تم تسجيل التفاعل بنجاح',
'interactions.updateSuccess': 'تم تحديث التفاعل بنجاح',
'interactions.deleteSuccess': 'تم حذف التفاعل بنجاح',
'interactions.subjectRequired': 'الموضوع مطلوب',
'interactions.generalInteraction': 'عام (بدون عميل)',
'interactions.contact': 'جهة اتصال',

'tasks.addTask': 'مهمة جديدة',
'tasks.editTask': 'تعديل المهمة',
'tasks.deleteTask': 'حذف المهمة',
'tasks.confirmDelete': 'هل تريد حذف هذه المهمة؟',
'tasks.title': 'العنوان',
'tasks.description': 'الوصف',
'tasks.dueDate': 'تاريخ الاستحقاق',
'tasks.priority': 'الأولوية',
'tasks.category': 'الفئة',
'tasks.assignedTo': 'مسند إلى',
'tasks.client': 'العميل',
'tasks.noClient': 'بدون عميل',
'tasks.noTasks': 'لا توجد مهام',
'tasks.noTasksDesc': 'أنشئ مهام لتتبع عناصر العمل',
'tasks.noOpenTasks': 'لا توجد مهام مفتوحة',
'tasks.createSuccess': 'تم إنشاء المهمة بنجاح',
'tasks.updateSuccess': 'تم تحديث المهمة بنجاح',
'tasks.deleteSuccess': 'تم حذف المهمة بنجاح',
'tasks.completeSuccess': 'تم إكمال المهمة',
'tasks.reopenSuccess': 'تم إعادة فتح المهمة',
'tasks.titleRequired': 'العنوان مطلوب',
'tasks.stats.open': 'مفتوحة',
'tasks.stats.overdue': 'متأخرة',
'tasks.stats.done': 'مكتملة',
'tasks.stats.total': 'المجموع',
'tasks.filter.open': 'مفتوحة',
'tasks.filter.done': 'مكتملة',
'tasks.filter.auto': 'تلقائي',
'tasks.filter.all': 'الكل',
'tasks.filter.allPriorities': 'جميع الأولويات',
'tasks.filter.allCategories': 'جميع الفئات',
'tasks.autoIndicator': 'مهمة تلقائية',
'tasks.overdue': 'متأخرة',
'tasks.dueLabel': 'الاستحقاق:',
'tasks.assignedLabel': 'مسند:',
'tasks.completedLabel': 'اكتمل:',
'tasks.runAutoEngine': 'إنشاء مهام تلقائية',
'tasks.autoEngineCreated': 'تم إنشاء المهام التلقائية',
```

### Phase G: Registry Update

#### `docs/plans/SHARED-CODE-REGISTRY.md`
- **Action:** Modify
- **Changes:** Add new entries to the Services, Hooks, and Constants sections:

**Services section — add:**
| `contactService.ts` | `contactService` — contact CRUD | CRM |
| `interactionService.ts` | `interactionService` — interaction CRUD | CRM |
| `taskService.ts` | `taskService` — task CRUD, toggleStatus, auto-task stubs | CRM |

**Hooks section — add:**
| `useContacts.ts` | `contactKeys`, `useContacts`, `useCreateContact`, `useUpdateContact`, `useDeleteContact` | CRM |
| `useInteractions.ts` | `interactionKeys`, `useInteractions`, `useCreateInteraction`, `useUpdateInteraction`, `useDeleteInteraction` | CRM |
| `useTasks.ts` | `taskKeys`, `useTasks`, `useTask`, `useCreateTask`, `useUpdateTask`, `useToggleTaskStatus`, `useDeleteTask`, `useRunAutoTaskEngine`, `useCancelAutoTaskForFiling` | CRM |

**Constants section — update `constants.ts` row to include:** `CONTACT_TYPES`, `AUTHORITY_TYPES` alongside existing exports.

---

## Implementation Order

The build order respects dependency chains:

```
Phase A: Type & constant modifications (no deps)
  ├── src/types/crm.ts      (add 'court', AuthorityType, optional contact_id)
  ├── src/types/task.ts      (fix CreateTaskInput Omit list)
  └── src/lib/constants.ts   (add CONTACT_TYPES, AUTHORITY_TYPES)

Phase B: Database migration (no code deps)
  └── supabase/migrations/20260319100000_create_crm_tables.sql

Phase C: Services (depend on Phase A types)
  ├── src/services/contactService.ts
  ├── src/services/interactionService.ts
  └── src/services/taskService.ts

Phase D: Hooks (depend on Phase C services)
  ├── src/hooks/useContacts.ts
  ├── src/hooks/useInteractions.ts
  └── src/hooks/useTasks.ts

Phase E: Components (depend on Phase D hooks)
  ├── src/components/crm/TaskCard.tsx         (leaf, no CRM deps)
  ├── src/components/crm/ContactForm.tsx      (leaf, needs useContacts for client filter)
  ├── src/components/crm/InteractionForm.tsx  (needs useContacts for contact dropdown)
  ├── src/components/crm/TaskForm.tsx         (leaf)
  ├── src/components/crm/ContactsPanel.tsx    (needs ContactForm)
  ├── src/components/crm/InteractionsPanel.tsx (needs InteractionForm)
  ├── src/components/crm/TasksPanel.tsx       (needs TaskCard, TaskForm)
  ├── src/components/crm/ClientTasksWidget.tsx (needs TaskCard, TaskForm)
  └── src/components/crm/CrmView.tsx          (needs all panels)

Phase F: Integration (depend on Phase E components)
  ├── src/App.tsx
  ├── src/components/clients/ClientDetailView.tsx
  └── src/components/clients/ClientTabs.tsx

Phase G: i18n & Registry (can be done in parallel with any phase)
  ├── src/i18n/he.ts
  ├── src/i18n/ar.ts
  ├── src/i18n/en.ts
  └── docs/plans/SHARED-CODE-REGISTRY.md
```

---

## Data Flow

```
CrmView
  │
  ├─ useClients(firmId) → client list for filter dropdown
  │
  ├─ selectedClientId (state) ──────────────────────┐
  │                                                  │
  ├─ TasksPanel ◄──── clientId prop ◄──────────────┤
  │    ├─ useTasks(firmId, { clientId })             │
  │    ├─ useToggleTaskStatus()                      │
  │    ├─ useStaff(firmId) → staff name lookup       │
  │    ├─ useClients(firmId) → client name lookup    │
  │    ├─ TaskCard[] (receives resolved names)       │
  │    ├─ TaskForm (dialog)                          │
  │    │    └─ useCreateTask / useUpdateTask          │
  │    └─ ConfirmDialog → useDeleteTask              │
  │                                                  │
  ├─ InteractionsPanel ◄──── clientId prop ◄────────┤
  │    ├─ useInteractions(firmId, clientId)           │
  │    ├─ useClients(firmId) → client name lookup    │
  │    ├─ useStaff(firmId) → staff name lookup       │
  │    ├─ DataTable (interaction rows)               │
  │    ├─ InteractionForm (dialog)                   │
  │    │    ├─ useContacts(firmId, selectedClient)    │
  │    │    └─ StaffPicker                           │
  │    └─ ConfirmDialog → useDeleteInteraction       │
  │                                                  │
  └─ ContactsPanel ◄──── clientId prop ◄────────────┘
       ├─ useContacts(firmId, clientId)
       ├─ useClients(firmId) → client name lookup
       ├─ Contact cards grid
       ├─ ContactForm (dialog)
       │    └─ useCreateContact / useUpdateContact
       └─ ConfirmDialog → useDeleteContact

ClientDetailView
  └─ ClientTabs(clientId)
       └─ TabsContent "tasks"
            └─ ClientTasksWidget(clientId)
                 ├─ useTasks(firmId, { clientId })
                 ├─ useStaff(firmId) → staff name lookup
                 ├─ TaskCard[]
                 ├─ TaskForm(defaultClientId)
                 └─ ConfirmDialog → useDeleteTask
```

**Query invalidation flow:**
- Create/update/delete contact → invalidates `contactKeys.lists()`
- Create/update/delete interaction → invalidates `interactionKeys.lists()`
- Create/update/delete/toggle task → invalidates `taskKeys.lists()`
- Each panel re-fetches automatically via React Query stale invalidation

---

## Edge Cases & Error Handling

1. **Client filter + no contacts/interactions/tasks** — Each panel shows `EmptyState` with descriptive message. The empty state changes based on whether a client filter is active ("No contacts for this client" vs "No contacts yet").
2. **Toggle task status on a cancelled task** — The toggle only works between open/done. Cancelled tasks are not toggleable. TaskCard should disable the checkbox for cancelled tasks.
3. **Deleting a contact that's referenced by interactions** — Soft delete means the contact row still exists. The `contact_id` FK on interactions references the contact, which remains in the table (just has `deleted_at` set). No cascade issue. InteractionForm should only show non-deleted contacts in its dropdown.
4. **Creating a task with no seq** — The DB trigger auto-generates the seq. The service sends `seq: 0` which the trigger overrides. If the trigger fails (unlikely), the insert fails with a constraint error, caught by the service's error handler.
5. **Concurrent task creation (seq collision)** — The advisory lock in `generate_task_seq()` prevents this. Same pattern as `generate_case_num()` for clients, which is proven.
6. **Long client name in badges** — Use `truncate` class on client name badges in TaskCard.
7. **Phone field RTL** — `dir="ltr"` on phone `Input` in ContactForm. Same pattern as `ClientsView` taxId and phone fields.
8. **Permission denied** — If `can('crm.view')` is false, CrmView shows an access-denied message instead of the tab layout. If `can('crm.manage')` is false, all create/edit/delete buttons are hidden but data is still visible.

---

## Performance Considerations

1. **Client/staff name resolution** — The panels use `useClients` and `useStaff` to build lookup maps for resolving IDs to names. These queries are cached by React Query with `staleTime: 5 * 60 * 1000` (set in the QueryClient default). The lookup is O(n) map construction once, then O(1) per row. For firms with <500 clients/staff, this is negligible.
2. **Task list re-rendering on toggle** — `useToggleTaskStatus` invalidates `taskKeys.lists()`, causing a refetch. This is fast for typical task counts (<1000). If performance becomes an issue, optimistic updates can be added later.
3. **Contact dropdown in InteractionForm** — Filters contacts by selected client. This is a derived computation, not a separate query. Re-computation on client change is instant.
4. **Partial index usage** — All indexes have `WHERE deleted_at IS NULL` conditions, matching the service layer's filter. This keeps indexes small for firms with many soft-deleted records.
5. **Advisory lock contention** — The task seq advisory lock holds briefly per insert. For typical usage (a few tasks/minute), no contention. The lock is transaction-scoped, so it releases on commit.

---

## i18n / RTL Implications

**New translation keys:** ~75 keys across 3 languages (listed in Phase F above).

**RTL layout considerations:**
- All components use Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`) — following the pattern in all existing components.
- Phone inputs: `dir="ltr"` on the `<Input>` element in ContactForm.
- Email inputs: `dir="ltr"` on the `<Input>` element in ContactForm (emails are always LTR).
- Date inputs: `dir="ltr"` forced by browser for `type="date"` inputs.
- DataTable headers: Already use `text-start` (logical property) — correct for both RTL and LTR.
- Filter buttons: Flex layout with `gap` — naturally adapts to RTL.
- TaskCard chevrons: No directional icons in the card layout — no mirroring needed.
- Badge layout: `flex items-center gap-*` — direction-neutral.

---

## Self-Critique

1. **Name resolution via full client/staff lists** — Currently, every panel fetches the full client list and staff list to resolve names. This works for small firms but doesn't scale. An alternative would be to do a join in the DB query (e.g., `select('*, clients(name), staff(name)')`). I chose the current approach because: (a) it matches the existing pattern (StaffView fetches assignments separately), (b) the client/staff lists are already cached, (c) joining in Supabase requires explicit relationship definitions. If scaling becomes an issue, the fix is to add `.select('*, clients!client_id(name)')` to service queries.

2. **Single migration file for 3 tables** — If the migration fails partway (e.g., the tasks table fails), all 3 tables need to be re-run. The alternative is 3 separate migration files. I chose a single file because: the tables are logically cohesive (CRM domain), and Supabase migrations are transactional — they succeed or fail atomically.

3. **Client-side sorting/filtering for tasks** — The alternative is server-side filtering (passing filters to the Supabase query). I chose client-side because: (a) task counts per firm are typically <1000, (b) it avoids multiple query keys for each filter combination, (c) it matches the pattern in ClientsView where type/status filtering is client-side. If firms have >1000 tasks, server-side pagination should be added.

4. **Auto-task engine is a stub** — The filing table doesn't exist yet, so the auto-task scanning logic cannot be implemented. The stub is ready to be filled in when the filings module is built. The risk is that the stub's interface might not match the filings module's actual API. Mitigation: the task table schema includes all the columns the engine needs (`filing_id`, `is_auto`, `filing_type`, `filing_due`, `period`), so the data model is locked in.

5. **No optimistic updates** — Mutations wait for server confirmation before updating the UI. This means a brief loading state on toggle/create/delete. The alternative is optimistic updates (update UI immediately, rollback on error). I chose non-optimistic because: (a) it matches the existing codebase pattern (clientService, staffService), (b) it's simpler and less error-prone, (c) the latency is <200ms for typical operations.

6. **TaskCard receives resolved names as props** — This means the parent (TasksPanel/ClientTasksWidget) must do the lookup and pass names down. The alternative is for TaskCard to fetch its own data (e.g., `useClient(task.client_id)`), but that would cause N+1 queries. The chosen approach is correct for performance but requires the parent to do more work.

7. **`authority_type` and `filing_type` CHECK constraints** — Both columns are nullable and have CHECK constraints with explicit value lists (no `NULL` in the IN clause). PostgreSQL allows `NULL` values through CHECK constraints automatically (since `NULL IN (...)` evaluates to `NULL`, not `FALSE`). The constraints are clean and correct.
