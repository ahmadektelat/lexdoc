# Staff Module — Technical Design

## 1. File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260318100001_create_staff.sql` | Create | staff table, client_staff junction table, data migration, drop assigned_staff_id |
| `src/types/staff.ts` | Modify | Add `ClientStaffAssignment` interface |
| `src/types/client.ts` | Modify | Remove `assignedStaffId` from Client, CreateClientInput, UpdateClientInput |
| `src/services/staffService.ts` | Create | CRUD service for staff table |
| `src/services/clientStaffService.ts` | Create | CRUD service for client_staff junction table |
| `src/hooks/useStaff.ts` | Create | React Query hooks for staff CRUD |
| `src/hooks/useClientStaff.ts` | Create | React Query hooks for client_staff assignments |
| `src/components/staff/StaffView.tsx` | Create | Main staff list page with DataTable and mobile cards |
| `src/components/staff/StaffForm.tsx` | Create | Create/edit staff dialog |
| `src/components/staff/StaffCard.tsx` | Create | Mobile card view for staff members |
| `src/components/staff/StaffPicker.tsx` | Create | Reusable staff dropdown selector |
| `src/components/staff/StaffTasksPanel.tsx` | Create | Tasks panel UI shell with empty state |
| `src/i18n/he.ts` | Modify | Add new staff translation keys |
| `src/i18n/ar.ts` | Modify | Add new staff translation keys |
| `src/i18n/en.ts` | Modify | Add new staff translation keys |
| `src/App.tsx` | Modify | Replace staff SectionPlaceholder with StaffView |
| `src/services/clientService.ts` | Modify | Remove assignedStaffId from row mapping functions |
| `src/components/clients/ClientForm.tsx` | No change needed | Does not reference assignedStaffId in form fields |
| `src/components/clients/ClientHeader.tsx` | Modify | Update stale TODO comment to reference client_staff junction table |
| `src/hooks/useIsMobile.ts` | Create | Extract shared useIsMobile hook from ClientsView |
| `src/components/clients/ClientsView.tsx` | Modify | Import useIsMobile from shared hook instead of local definition |

---

## 2. Database Migration

**File:** `supabase/migrations/20260318100001_create_staff.sql`

This follows the exact pattern established in `20260318100000_create_clients.sql`: CREATE TABLE, indexes, RLS enable, policies using `user_firm_ids()` and `firm_subscription_active()`, triggers using `update_updated_at()`, and GRANTs to `authenticated`.

```sql
-- Migration: create_staff
-- CREATED: 2026-03-18 IST (Jerusalem)
-- Description: Create staff table, client_staff junction table,
--              migrate assigned_staff_id data, drop assigned_staff_id column

-- ============================================================
-- 1. STAFF TABLE
-- ============================================================
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'partner', 'attorney', 'junior_attorney', 'accountant',
    'consultant', 'secretary', 'manager', 'student'
  )),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_staff_firm_id ON staff(firm_id);
CREATE INDEX idx_staff_firm_active ON staff(firm_id, is_active) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select" ON staff FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

CREATE POLICY "staff_insert" ON staff FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE POLICY "staff_update" ON staff FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE POLICY "staff_delete" ON staff FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger: auto-update updated_at (reuses existing helper from 20260317100003)
CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON staff TO authenticated;

-- ============================================================
-- 2. CLIENT_STAFF JUNCTION TABLE
-- ============================================================
CREATE TABLE client_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, staff_id)
);

-- Indexes
CREATE INDEX idx_client_staff_client ON client_staff(client_id);
CREATE INDEX idx_client_staff_staff ON client_staff(staff_id);

-- RLS (scoped via client -> firm_id chain)
ALTER TABLE client_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_staff_select" ON client_staff FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids())));

CREATE POLICY "client_staff_insert" ON client_staff FOR INSERT
  WITH CHECK (client_id IN (
    SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids())
      AND firm_subscription_active(firm_id)
  ));

CREATE POLICY "client_staff_update" ON client_staff FOR UPDATE
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids())
      AND firm_subscription_active(firm_id)
  ));

CREATE POLICY "client_staff_delete" ON client_staff FOR DELETE
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids())
      AND firm_subscription_active(firm_id)
  ));

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON client_staff TO authenticated;

-- ============================================================
-- 3. RPC: ATOMIC SET PRIMARY STAFF
-- ============================================================
-- Unsets any existing primary and sets the new one in a single transaction.
-- Uses SECURITY INVOKER so the caller's RLS policies still apply.
CREATE OR REPLACE FUNCTION set_primary_staff(p_client_id UUID, p_staff_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Unset existing primary for this client
  UPDATE client_staff
  SET is_primary = false
  WHERE client_id = p_client_id
    AND is_primary = true;

  -- Set new primary
  UPDATE client_staff
  SET is_primary = true
  WHERE client_id = p_client_id
    AND staff_id = p_staff_id;

  -- Verify the row existed
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found for client_id=% staff_id=%', p_client_id, p_staff_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_primary_staff(UUID, UUID) TO authenticated;

-- ============================================================
-- 4. MIGRATE assigned_staff_id DATA TO JUNCTION TABLE
-- ============================================================
-- Only migrate rows where assigned_staff_id references a valid staff row
-- (the column was a UUID without FK, so orphan values may exist)
INSERT INTO client_staff (client_id, staff_id, is_primary)
SELECT c.id, c.assigned_staff_id, true
FROM clients c
WHERE c.assigned_staff_id IS NOT NULL
  AND c.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM staff s WHERE s.id = c.assigned_staff_id);

-- ============================================================
-- 5. DROP assigned_staff_id COLUMN FROM CLIENTS
-- ============================================================
ALTER TABLE clients DROP COLUMN assigned_staff_id;
```

**Design notes:**
- The migration number `20260318100001` comes after `20260318100000` (clients), ensuring the `clients` table exists when we create the FK.
- The data migration uses `EXISTS` to guard against orphan UUIDs in `assigned_staff_id` that may not reference a valid staff row. This is defensive because the column never had an FK constraint.
- `client_staff` RLS chains through `clients.firm_id` to avoid adding a redundant `firm_id` column to the junction table.
- `ON DELETE CASCADE` on both FKs means deleting a client or staff row automatically removes junction rows. Since we use soft delete (setting `deleted_at`) for both entities, CASCADE only fires on actual hard deletes, which is correct behavior.
- `set_primary_staff()` uses `SECURITY INVOKER` (not `SECURITY DEFINER`) so the caller's RLS policies apply — the function cannot bypass firm scoping. The `IF NOT FOUND` check after the second UPDATE ensures the assignment row exists, preventing silent no-ops.

---

## 3. Type Changes

### `src/types/staff.ts` — Add ClientStaffAssignment

The existing types (`Staff`, `StaffRole`, `CreateStaffInput`, `UpdateStaffInput`) remain unchanged. Add at the end of the file:

```ts
export interface ClientStaffAssignment {
  id: string;
  clientId: string;
  staffId: string;
  isPrimary: boolean;
  created_at: string;
}
```

**Note:** We use camelCase (`clientId`, `staffId`, `isPrimary`) in the TypeScript interface and map from snake_case DB columns via a row mapper in `clientStaffService.ts`, consistent with how `Client` uses `clientType` (from `client_type`).

### `src/types/client.ts` — Remove assignedStaffId

**Before:**
```ts
export interface Client {
  // ... other fields ...
  assignedStaffId?: string;
  // ...
}
```

**After:**
Remove the `assignedStaffId?: string;` line from the `Client` interface (line 24 in the current file). The `CreateClientInput` and `UpdateClientInput` types are derived via `Omit`/`Partial` from `Client`, so they will automatically exclude it.

**Exact change:** Delete line 24 (`assignedStaffId?: string;`) from `src/types/client.ts`.

---

## 4. Service Layer

### `src/services/staffService.ts` — Create

Follows the `clientService.ts` pattern exactly: row mapping functions, exported `staffService` object with async methods, `firm_id` defense-in-depth on all queries, `deleted_at IS NULL` filtering.

```ts
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 XX:XX IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Staff, CreateStaffInput, UpdateStaffInput } from '@/types';

// Map a Supabase DB row (snake_case) to a Staff object (camelCase)
function rowToStaff(row: Record<string, unknown>): Staff {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    user_id: (row.user_id as string) ?? undefined,
    name: row.name as string,
    role: row.role as Staff['role'],
    isActive: row.is_active as boolean,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// Map camelCase input to snake_case DB columns for INSERT
function staffInputToRow(input: CreateStaffInput): Record<string, unknown> {
  return {
    name: input.name,
    role: input.role,
    is_active: input.isActive ?? true,
    user_id: input.user_id ?? null,
  };
}

// Map camelCase partial update to snake_case DB columns
function updateInputToRow(input: UpdateStaffInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.role !== undefined) row.role = input.role;
  if (input.isActive !== undefined) row.is_active = input.isActive;
  if (input.user_id !== undefined) row.user_id = input.user_id;
  if (input.deleted_at !== undefined) row.deleted_at = input.deleted_at;
  return row;
}

export const staffService = {
  /** Fetch all non-deleted staff for a firm. */
  async list(firmId: string): Promise<Staff[]> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToStaff);
  },

  /** Fetch a single staff member by ID. firm_id filter provides defense-in-depth beyond RLS. */
  async getById(firmId: string, id: string): Promise<Staff> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('id', id)
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Staff member not found');
    return rowToStaff(data as Record<string, unknown>);
  },

  /** Create a new staff member. firm_id is set server-side. */
  async create(firmId: string, input: CreateStaffInput): Promise<Staff> {
    const row = staffInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('staff')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToStaff(data as Record<string, unknown>);
  },

  /** Update an existing staff member. firm_id filter provides defense-in-depth beyond RLS. */
  async update(firmId: string, id: string, input: UpdateStaffInput): Promise<Staff> {
    const row = updateInputToRow(input);

    const { data, error } = await supabase
      .from('staff')
      .update(row)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToStaff(data as Record<string, unknown>);
  },

  /** Soft delete a staff member (set deleted_at). firm_id filter provides defense-in-depth beyond RLS. */
  async delete(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('staff')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },
};
```

**Key decisions:**
- `staffInputToRow()` maps `user_id` directly (it's already snake_case in the Staff type, so no conversion needed). The `isActive` field maps to `is_active`.
- `delete()` uses soft delete via `update({ deleted_at })` — same pattern as `clientService.delete()`.
- No `archive`/`restore` methods needed for staff (unlike clients, staff uses `isActive` boolean rather than a status enum).

### `src/services/clientStaffService.ts` — Create

```ts
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 XX:XX IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { ClientStaffAssignment } from '@/types';

function rowToAssignment(row: Record<string, unknown>): ClientStaffAssignment {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    staffId: row.staff_id as string,
    isPrimary: row.is_primary as boolean,
    created_at: row.created_at as string,
  };
}

export const clientStaffService = {
  /** Get all staff assignments for a client. */
  async getAssignments(clientId: string): Promise<ClientStaffAssignment[]> {
    const { data, error } = await supabase
      .from('client_staff')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToAssignment);
  },

  /** Get all client assignments for a staff member. */
  async getStaffClients(staffId: string): Promise<ClientStaffAssignment[]> {
    const { data, error } = await supabase
      .from('client_staff')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToAssignment);
  },

  /** Assign a staff member to a client. */
  async assignStaff(clientId: string, staffId: string, isPrimary = false): Promise<void> {
    const { error } = await supabase
      .from('client_staff')
      .insert({ client_id: clientId, staff_id: staffId, is_primary: isPrimary });

    if (error) throw new Error(error.message);
  },

  /** Remove a staff assignment from a client. */
  async removeAssignment(clientId: string, staffId: string): Promise<void> {
    const { error } = await supabase
      .from('client_staff')
      .delete()
      .eq('client_id', clientId)
      .eq('staff_id', staffId);

    if (error) throw new Error(error.message);
  },

  /** Set a staff member as the primary for a client. Atomic via RPC — unsets old + sets new in one transaction. */
  async setPrimary(clientId: string, staffId: string): Promise<void> {
    const { error } = await supabase.rpc('set_primary_staff', {
      p_client_id: clientId,
      p_staff_id: staffId,
    });

    if (error) throw new Error(error.message);
  },
};
```

**Key decisions:**
- `setPrimary` delegates to the `set_primary_staff` RPC function, which executes both the unset and set in a single database transaction. This eliminates the race condition where two concurrent calls could leave multiple primaries. The RPC uses `SECURITY INVOKER` so RLS still applies.
- No `firm_id` defense-in-depth on junction table queries — the RLS policy already chains through `clients.firm_id`, and the junction table has no `firm_id` column. The `client_id` and `staff_id` parameters are sufficient for scoping.

---

## 5. Hook Layer

### `src/hooks/useStaff.ts` — Create

Follows the `useClients.ts` pattern exactly: query key factory, list hook with `firmId` parameter, single-item hook using `useAuthStore`, mutation hooks with toast messages.

```ts
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 XX:XX IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffService } from '@/services/staffService';
import type { CreateStaffInput, UpdateStaffInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';

export const staffKeys = {
  all: ['staff'] as const,
  lists: () => [...staffKeys.all, 'list'] as const,
  list: (firmId: string) => [...staffKeys.lists(), firmId] as const,
  details: () => [...staffKeys.all, 'detail'] as const,
  detail: (id: string) => [...staffKeys.details(), id] as const,
};

export function useStaff(firmId: string | null) {
  return useQuery({
    queryKey: staffKeys.list(firmId ?? ''),
    queryFn: () => staffService.list(firmId!),
    enabled: !!firmId,
  });
}

export function useStaffMember(id: string | undefined) {
  const firmId = useAuthStore((s) => s.firmId);

  return useQuery({
    queryKey: staffKeys.detail(id ?? ''),
    queryFn: () => staffService.getById(firmId!, id!),
    enabled: !!id && !!firmId,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateStaffInput }) =>
      staffService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      toast.success(t('staff.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: UpdateStaffInput }) =>
      staffService.update(firmId, id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      queryClient.invalidateQueries({ queryKey: staffKeys.detail(variables.id) });
      toast.success(t('staff.updateSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => staffService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      toast.success(t('staff.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
```

### `src/hooks/useClientStaff.ts` — Create

```ts
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 XX:XX IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientStaffService } from '@/services/clientStaffService';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

export const clientStaffKeys = {
  all: ['client-staff'] as const,
  byClient: (clientId: string) => [...clientStaffKeys.all, 'client', clientId] as const,
  byStaff: (staffId: string) => [...clientStaffKeys.all, 'staff', staffId] as const,
};

export function useClientStaffAssignments(clientId: string | undefined) {
  return useQuery({
    queryKey: clientStaffKeys.byClient(clientId ?? ''),
    queryFn: () => clientStaffService.getAssignments(clientId!),
    enabled: !!clientId,
  });
}

export function useStaffClientAssignments(staffId: string | undefined) {
  return useQuery({
    queryKey: clientStaffKeys.byStaff(staffId ?? ''),
    queryFn: () => clientStaffService.getStaffClients(staffId!),
    enabled: !!staffId,
  });
}

export function useAssignStaff() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ clientId, staffId, isPrimary }: { clientId: string; staffId: string; isPrimary?: boolean }) =>
      clientStaffService.assignStaff(clientId, staffId, isPrimary),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clientStaffKeys.byClient(variables.clientId) });
      queryClient.invalidateQueries({ queryKey: clientStaffKeys.byStaff(variables.staffId) });
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRemoveStaffAssignment() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ clientId, staffId }: { clientId: string; staffId: string }) =>
      clientStaffService.removeAssignment(clientId, staffId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clientStaffKeys.byClient(variables.clientId) });
      queryClient.invalidateQueries({ queryKey: clientStaffKeys.byStaff(variables.staffId) });
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
```

---

## 5.5. Shared Hook: `src/hooks/useIsMobile.ts` — Create

Extracted from the local definition in `ClientsView.tsx` (lines 28-39) per the CLAUDE.md shared code rule. Both `StaffView` and `ClientsView` will import from this shared location.

```ts
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 XX:XX IST (Jerusalem)
//          - Extracted from ClientsView.tsx to shared hook

import { useState, useEffect } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}
```

---

## 6. Components

### 6.1 `src/components/staff/StaffView.tsx`

**Props:** None (page-level component, gets data from hooks/stores)

**Imports:** Same pattern as `ClientsView.tsx` — `useState`, `useMemo`, `useEffect`, shared components (`PageHeader`, `SearchInput`, `DataTable`, `EmptyState`, `LoadingSpinner`, `StatusBadge`, `ConfirmDialog`), UI components (`Badge`, `Button`), hooks (`useLanguage`, `useAuthStore`, `useStaff`, `useDeleteStaff`), constants (`STAFF_ROLES`), icons (`Plus`, `UserCog`, `Pencil`, `Trash2`).

**State:**
```ts
const [search, setSearch] = useState('');
const [formOpen, setFormOpen] = useState(false);
const [editingStaff, setEditingStaff] = useState<Staff | undefined>();
const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);
```

**Data flow:**
```
useAuthStore (firmId) -> useStaff(firmId) -> filteredStaff (useMemo with search) -> DataTable / StaffCard
```

**Filtered staff:** `useMemo` filters by `search` against `name` field (case-insensitive).

**Column definitions** (via `useMemo` with `[t]` dependency, same pattern as `ClientsView`):

| Column | accessorKey | Cell renderer |
|--------|-------------|---------------|
| Name | `name` | `<span className="font-medium">{name}</span>` with avatar initial div |
| Role | `role` | `<Badge variant="secondary">{t(STAFF_ROLES[role])}</Badge>` |
| Total Hours | — | Placeholder `"—"` (until billing module) |
| Active Clients | — | Count from `useStaffClientAssignments` or placeholder `"—"` (see note) |
| Tasks | — | Placeholder `"—"` (until Phase 6) |
| Actions | — | Edit button (Pencil icon), Delete button (Trash2 icon, hidden for `role === 'partner'`) |

**Note on Active Clients column:** To avoid N+1 queries (one per staff member), the initial implementation will show `"—"` as a placeholder. A follow-up can add a `staffService.listWithClientCounts()` method that uses a Supabase join or RPC. This is an explicit trade-off to keep the first implementation simple.

**JSX structure:**
```
<div className="p-6 animate-fade-in">
  <PageHeader title={t('staff.title')} description={t('staff.description')}>
    <Button onClick={() => { setEditingStaff(undefined); setFormOpen(true); }}>
      <Plus className="h-4 w-4 me-2" />
      {t('staff.addMember')}
    </Button>
  </PageHeader>

  <SearchInput value={search} onChange={setSearch} placeholder={t('staff.searchPlaceholder')} className="max-w-md mb-6" />

  {/* Content: EmptyState | mobile StaffCards | DataTable */}
  {filteredStaff.length === 0 && !search ? (
    <EmptyState icon={UserCog} title={t('staff.noStaff')} description={t('staff.noStaffDesc')} />
  ) : isMobile ? (
    <div className="space-y-3">
      {filteredStaff.map(s => <StaffCard key={s.id} staff={s} onEdit={...} onDelete={...} />)}
    </div>
  ) : (
    <DataTable columns={columns} data={filteredStaff} onRowClick={s => setSelectedStaff(s)} emptyMessage={t('common.noResults')} />
  )}

  <StaffForm open={formOpen} onOpenChange={setFormOpen} staff={editingStaff} />

  <ConfirmDialog
    open={!!deleteTarget}
    onOpenChange={open => { if (!open) setDeleteTarget(null); }}
    title={t('staff.deleteConfirm')}
    description={t('staff.deleteConfirmDesc')}
    variant="destructive"
    onConfirm={() => { if (deleteTarget) deleteStaff.mutate(deleteTarget.id); setDeleteTarget(null); }}
  />

  {selectedStaff && <StaffTasksPanel staff={selectedStaff} onClose={() => setSelectedStaff(null)} />}
</div>
```

**Mobile detection:** Imports `useIsMobile` from `@/hooks/useIsMobile` (shared hook extracted from `ClientsView.tsx` — see section 5.5).

**Action handlers in columns:**
- Edit: `onClick={() => { setEditingStaff(staff); setFormOpen(true); }}`
- Delete: Hidden for `role === 'partner'`. Otherwise: `onClick={() => setDeleteTarget(staff)}`

### 6.2 `src/components/staff/StaffForm.tsx`

**Props:**
```ts
interface StaffFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: Staff;  // if provided, edit mode
}
```

**Follows `ClientForm.tsx` pattern exactly:**

**FormState:**
```ts
interface FormState {
  name: string;
  role: string;  // StaffRole value
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_STATE: FormState = {
  name: '',
  role: 'attorney',  // sensible default
};
```

**staffToFormState:**
```ts
function staffToFormState(staff: Staff): FormState {
  return {
    name: staff.name,
    role: staff.role,
  };
}
```

**Hooks:**
```ts
const { t } = useLanguage();
const firmId = useAuthStore((s) => s.firmId);
const createStaff = useCreateStaff();
const updateStaff = useUpdateStaff();
const isEdit = !!staff;
```

**useEffect reset** (same pattern as ClientForm):
```ts
useEffect(() => {
  if (open) {
    setForm(staff ? staffToFormState(staff) : INITIAL_STATE);
    setErrors({});
  }
}, [open, staff]);
```

**setField helper** (same pattern): clears error on change.

**validate:**
```ts
const validate = (): boolean => {
  const errs: FormErrors = {};
  if (!form.name.trim()) {
    errs.name = t('common.required');
  }
  setErrors(errs);
  return Object.keys(errs).length === 0;
};
```

**handleSubmit:**
```ts
const handleSubmit = async () => {
  if (!validate()) return;
  if (!firmId) return;

  if (isEdit && staff) {
    const input: UpdateStaffInput = {
      name: form.name.trim(),
      role: form.role as StaffRole,
    };
    updateStaff.mutate(
      { firmId, id: staff.id, input },
      { onSuccess: () => onOpenChange(false) }
    );
  } else {
    const input: CreateStaffInput = {
      name: form.name.trim(),
      role: form.role as StaffRole,
      isActive: true,
    };
    createStaff.mutate(
      { firmId, input },
      { onSuccess: () => onOpenChange(false) }
    );
  }
};
```

**JSX structure:**
```
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>{isEdit ? t('staff.editTitle') : t('staff.addTitle')}</DialogTitle>
    </DialogHeader>

    <div className="space-y-4 py-4">
      <FormField label={t('staff.name')} required error={errors.name}>
        <Input value={form.name} onChange={e => setField('name', e.target.value)} />
      </FormField>

      <FormField label={t('staff.role')}>
        <Select value={form.role} onValueChange={v => setField('role', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(STAFF_ROLES).map(([value, labelKey]) => (
              <SelectItem key={value} value={value}>{t(labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </div>

    <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
      <Button onClick={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? t('common.loading') : t('common.save')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 6.3 `src/components/staff/StaffCard.tsx`

**Props:**
```ts
interface StaffCardProps {
  staff: Staff;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
}
```

Follows the `ClientCard.tsx` pattern: `Card` with `CardContent`, avatar initial, name, role badge, action buttons.

**JSX structure:**
```
<Card className="hover:bg-muted/50 transition-colors">
  <CardContent className="p-4">
    <div className="flex items-start gap-3">
      {/* Avatar initial */}
      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
        {staff.name.charAt(0)}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground truncate">{staff.name}</h3>
        <Badge variant="secondary" className="text-xs mt-1">{t(STAFF_ROLES[staff.role])}</Badge>
        {!staff.isActive && <StatusBadge status="archived" />}
      </div>

      <div className="flex gap-1">
        <Button variant="ghost" size="icon" onClick={() => onEdit(staff)}>
          <Pencil className="h-4 w-4" />
        </Button>
        {staff.role !== 'partner' && (
          <Button variant="ghost" size="icon" onClick={() => onDelete(staff)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  </CardContent>
</Card>
```

### 6.4 `src/components/staff/StaffPicker.tsx`

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

**Implementation:**
```ts
export function StaffPicker({ value, onChange, firmId, placeholder, disabled }: StaffPickerProps) {
  const { t } = useLanguage();
  const { data: staffList, isLoading } = useStaff(firmId);

  // Filter to active, non-deleted staff only
  const activeStaff = useMemo(
    () => (staffList ?? []).filter(s => s.isActive),
    [staffList]
  );

  return (
    <Select
      value={value ?? ''}
      onValueChange={v => onChange(v || undefined)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? t('staff.selectStaff')} />
      </SelectTrigger>
      <SelectContent>
        {activeStaff.map(s => (
          <SelectItem key={s.id} value={s.id}>
            <span>{s.name}</span>
            <Badge variant="secondary" className="ms-2 text-xs">{t(STAFF_ROLES[s.role])}</Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### 6.5 `src/components/staff/StaffTasksPanel.tsx`

**Props:**
```ts
interface StaffTasksPanelProps {
  staff: Staff;
  onClose: () => void;
}
```

**Phase 4 implementation (UI shell with empty state):**

```ts
export function StaffTasksPanel({ staff, onClose }: StaffTasksPanelProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'open' | 'done' | 'all'>('open');

  const tabs = [
    { key: 'open' as const, label: t('staff.openTasks') },
    { key: 'done' as const, label: t('staff.doneTasks') },
    { key: 'all' as const, label: t('staff.allTasks') },
  ];

  return (
    <div className="border rounded-lg p-4 mt-6 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
            {staff.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{staff.name}</h3>
            <Badge variant="secondary" className="text-xs">{t(STAFF_ROLES[staff.role])}</Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold text-foreground">—</div>
          <div className="text-xs text-muted-foreground">{t('staff.openTasks')}</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold text-foreground">—</div>
          <div className="text-xs text-muted-foreground">{t('staff.overdueTasks')}</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold text-foreground">—</div>
          <div className="text-xs text-muted-foreground">{t('staff.doneTasks')}</div>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2 mb-4">
        {tabs.map(tab => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Empty state */}
      <EmptyState
        icon={ClipboardList}
        title={t('staff.noOpenTasks')}
        description={t('staff.tasksComingSoon')}
      />
    </div>
  );
}
```

**Icons needed:** `X`, `ClipboardList` from `lucide-react`.

---

## 7. i18n Keys

All keys below must be added to all 3 language files. The existing keys (`staff.title`, `staff.addMember`, `staff.role`, `staff.active`, and all `staffRoles.*`) are already present and must NOT be duplicated or overwritten.

### New keys to add:

**`src/i18n/he.ts`** — Add after the existing `staff.active` line (line 205):
```ts
  'staff.description': 'הוספה, עריכה וניהול צוות המשרד',
  'staff.name': 'שם מלא',
  'staff.addTitle': 'הוספת עובד חדש',
  'staff.editTitle': 'עריכת עובד',
  'staff.noStaff': 'אין עובדים',
  'staff.noStaffDesc': 'הוסף עובדים לצוות המשרד',
  'staff.totalHours': 'שעות סה"כ',
  'staff.activeClients': 'לקוחות פעילים',
  'staff.tasks': 'משימות',
  'staff.createSuccess': 'עובד נוסף בהצלחה',
  'staff.updateSuccess': 'עובד עודכן בהצלחה',
  'staff.deleteSuccess': 'עובד הוסר בהצלחה',
  'staff.deleteConfirm': 'האם למחוק את העובד?',
  'staff.deleteConfirmDesc': 'פעולה זו אינה ניתנת לביטול',
  'staff.openTasks': 'משימות פתוחות',
  'staff.overdueTasks': 'באיחור',
  'staff.doneTasks': 'הושלמו',
  'staff.allTasks': 'הכל',
  'staff.tasksComingSoon': 'מודול המשימות יהיה זמין בקרוב',
  'staff.noOpenTasks': 'אין משימות פתוחות',
  'staff.searchPlaceholder': 'חיפוש עובד...',
  'staff.cannotDeletePartner': 'לא ניתן למחוק שותף',
  'staff.selectStaff': 'בחר עובד',
```

**`src/i18n/ar.ts`** — Add after the existing `staff.active` line (line 205):
```ts
  'staff.description': 'إضافة وتعديل وإدارة طاقم المكتب',
  'staff.name': 'الاسم الكامل',
  'staff.addTitle': 'إضافة موظف جديد',
  'staff.editTitle': 'تعديل موظف',
  'staff.noStaff': 'لا يوجد موظفون',
  'staff.noStaffDesc': 'أضف موظفين لطاقم المكتب',
  'staff.totalHours': 'إجمالي الساعات',
  'staff.activeClients': 'عملاء نشطون',
  'staff.tasks': 'المهام',
  'staff.createSuccess': 'تمت إضافة الموظف بنجاح',
  'staff.updateSuccess': 'تم تحديث الموظف بنجاح',
  'staff.deleteSuccess': 'تمت إزالة الموظف بنجاح',
  'staff.deleteConfirm': 'هل تريد حذف هذا الموظف؟',
  'staff.deleteConfirmDesc': 'لا يمكن التراجع عن هذا الإجراء',
  'staff.openTasks': 'مهام مفتوحة',
  'staff.overdueTasks': 'متأخرة',
  'staff.doneTasks': 'مكتملة',
  'staff.allTasks': 'الكل',
  'staff.tasksComingSoon': 'وحدة المهام ستكون متاحة قريباً',
  'staff.noOpenTasks': 'لا توجد مهام مفتوحة',
  'staff.searchPlaceholder': 'البحث عن موظف...',
  'staff.cannotDeletePartner': 'لا يمكن حذف شريك',
  'staff.selectStaff': 'اختر موظف',
```

**`src/i18n/en.ts`** — Add after the existing `staff.active` line (line 205):
```ts
  'staff.description': 'Add, edit and manage office staff',
  'staff.name': 'Full Name',
  'staff.addTitle': 'Add New Staff Member',
  'staff.editTitle': 'Edit Staff Member',
  'staff.noStaff': 'No Staff Members',
  'staff.noStaffDesc': 'Add staff members to the office team',
  'staff.totalHours': 'Total Hours',
  'staff.activeClients': 'Active Clients',
  'staff.tasks': 'Tasks',
  'staff.createSuccess': 'Staff member added successfully',
  'staff.updateSuccess': 'Staff member updated successfully',
  'staff.deleteSuccess': 'Staff member removed successfully',
  'staff.deleteConfirm': 'Delete this staff member?',
  'staff.deleteConfirmDesc': 'This action cannot be undone',
  'staff.openTasks': 'Open Tasks',
  'staff.overdueTasks': 'Overdue',
  'staff.doneTasks': 'Completed',
  'staff.allTasks': 'All',
  'staff.tasksComingSoon': 'Tasks module coming soon',
  'staff.noOpenTasks': 'No open tasks',
  'staff.searchPlaceholder': 'Search staff...',
  'staff.cannotDeletePartner': 'Cannot delete partner',
  'staff.selectStaff': 'Select staff member',
```

---

## 8. Route Update

**File:** `src/App.tsx`

**Change 1** — Add import (after the `ClientDetailView` import at line 19):
```ts
import { StaffView } from '@/components/staff/StaffView';
```

**Change 2** — Replace line 72:
```ts
// Before:
<Route path="staff" element={<SectionPlaceholder section="staff" />} />

// After:
<Route path="staff" element={<StaffView />} />
```

---

## 9. Client Module Updates

### `src/types/client.ts`

**Delete line 24:** `assignedStaffId?: string;`

The `CreateClientInput` and `UpdateClientInput` types are derived from `Client` via `Omit`/`Partial`, so they automatically exclude the removed field.

### `src/services/clientService.ts`

**`rowToClient()` (line 27):** Delete `assignedStaffId: (row.assigned_staff_id as string) ?? undefined,`

**`clientInputToRow()` (line 51):** Delete `assigned_staff_id: input.assignedStaffId ?? null,`

**`updateInputToRow()` (line 72):** Delete `if (input.assignedStaffId !== undefined) row.assigned_staff_id = input.assignedStaffId;`

### `src/components/clients/ClientForm.tsx`

No changes needed. The form does not have a field for `assignedStaffId` — it was never wired into the UI. The `FormState` interface does not include it, and no `<Input>` or `<Select>` renders it.

### `src/components/clients/ClientHeader.tsx`

**Update the stale TODO comment at lines 64-66.** The current comment references the dropped `assigned_staff_id` column and a join pattern that no longer applies:

```ts
// Before (lines 64-66):
{/* TODO: Display assigned staff name once staff module is built.
    Currently only assignedStaffId (UUID) is available.
    Add: .select('*, staff!assigned_staff_id(name)') to the service query. */}

// After:
{/* TODO: Display assigned staff via client_staff junction table.
    Use useClientStaffAssignments(client.id) to fetch assignments,
    then display primary staff name with StaffPicker for editing. */}
```

### `src/components/clients/ClientsView.tsx`

**Change 1:** The TODO comment at line 129-131 about the assigned staff column can remain as-is or be updated to reference the `client_staff` junction table. No functional change needed.

**Change 2:** Remove the local `useIsMobile()` function definition (lines 28-39) and replace with an import from the shared hook:

```ts
// Before (local definition at lines 28-39):
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// After (import):
import { useIsMobile } from '@/hooks/useIsMobile';
```

---

## 10. Data Flow

```
User Action → Component (StaffView/StaffForm)
                ↓
              Hook (useStaff / useCreateStaff / useUpdateStaff / useDeleteStaff)
                ↓
              Service (staffService.list / .create / .update / .delete)
                ↓
              Supabase Client (supabase.from('staff').select/insert/update)
                ↓
              PostgreSQL (RLS: firm_id IN user_firm_ids())
                ↓
              Response → Service (rowToStaff mapping) → Hook (cache + toast) → Component (re-render)
```

For junction table:
```
StaffPicker / ClientForm → useClientStaff hooks → clientStaffService → supabase.from('client_staff') → PostgreSQL (RLS via client_id chain)
```

---

## 11. Edge Cases & Error Handling

1. **Deleting a partner** -- The delete button is hidden in the UI when `staff.role === 'partner'`. This is a UI-only guard. No server-side enforcement because RBAC is Phase 8 scope.

2. **Deleting a staff member who is assigned to clients** -- Soft delete sets `deleted_at`, so `client_staff` junction rows remain intact. The `StaffPicker` filters by `isActive` and `deleted_at IS NULL` (via the `useStaff` hook which calls `staffService.list()`), so deleted staff won't appear in dropdowns. Existing assignments are preserved for historical reference.

3. **Duplicate staff name** -- No uniqueness constraint on staff names (intentional — same name is possible in a firm). The form validates only that name is non-empty.

4. **Empty staff list** -- `EmptyState` component with `UserCog` icon shown when `filteredStaff.length === 0 && !search`.

5. **Network errors on mutations** -- `onError` handlers in hooks show `t('errors.saveFailed')` toast. The form remains open so the user can retry.

6. **Concurrent edits** -- No optimistic updates. Standard React Query invalidation after mutation success. `updated_at` trigger provides last-write-wins semantics.

7. **Orphan `assigned_staff_id` values during migration** -- The migration uses `EXISTS (SELECT 1 FROM staff s WHERE s.id = c.assigned_staff_id)` to skip orphan UUIDs that don't reference a valid staff row.

---

## 12. Performance Considerations

- **Staff list query** -- Indexed by `idx_staff_firm_active` for the common case (active staff within a firm). Expected volume: 5-50 staff per firm. No pagination needed.

- **Client_staff junction queries** -- Indexed by both `client_id` and `staff_id`. Expected volume: 1-5 assignments per client.

- **N+1 risk for "Active Clients" column** -- Initial implementation shows `"—"` placeholder to avoid N+1 queries. A follow-up can use `supabase.from('staff').select('*, client_staff(count)')` or an RPC to get counts in a single query.

- **StaffPicker re-fetching** -- Uses React Query caching. Multiple `StaffPicker` instances on the same page share the same `staffKeys.list(firmId)` cache entry.

---

## 13. i18n / RTL Implications

- All text uses `t()` — no hardcoded strings in JSX.
- `dir="rtl"` is inherited from the app-level `<div dir={direction}>`.
- No LTR-forced fields needed (staff names are Hebrew text, roles are translated).
- Uses Tailwind logical properties (`me-2`, `ms-2`, `text-start`, `text-end`) inherited from shared components.
- `DialogFooter` uses `gap-2` pattern from `ClientForm` for correct RTL button order.

---

## 14. Self-Critique

### What could go wrong

1. **`assigned_staff_id` migration data loss** -- If any `assigned_staff_id` values reference UUIDs that are not in the `staff` table (because staff data was populated separately, or the column held free-text UUIDs), those assignments will be silently dropped during migration. The `EXISTS` guard is correct behavior, but the team should verify that all `assigned_staff_id` values are valid staff UUIDs before running the migration. Mitigation: the migration can be tested on a branch database first.

2. **StaffTasksPanel is purely decorative** -- It shows dashes and an empty state. If users don't understand it's a placeholder, they might think the feature is broken. Mitigation: the "coming soon" message is explicit.

3. **Extracting `useIsMobile` expands the diff surface** -- Touching `ClientsView.tsx` (removing the local hook, adding an import) in a staff module PR creates a cross-module change. This is the correct trade-off per the shared code rule, but the implementer should verify `ClientsView` still works after the extraction.

### Alternative approaches considered

- **Server-side view for staff + client counts** -- Rejected for now. A DB view or RPC that joins `staff` with `client_staff` counts would be more efficient but adds migration complexity. The placeholder approach is simpler for Phase 4.

- **Optimistic updates on mutations** -- Rejected. The existing codebase (clientService hooks) uses invalidation-based updates, not optimistic. Following the established pattern is more important than the marginal UX improvement.

- **Adding `firm_id` to `client_staff`** -- Rejected. The RLS policy chains through `clients.firm_id`, so adding a redundant column would violate normalization. The current design is correct — firm scoping comes from the `client_id` FK chain.

- **Two-step JS `setPrimary` instead of RPC** -- Rejected. The original design used two sequential Supabase updates in JS, which was not atomic and could cause race conditions where two concurrent calls leave multiple primaries. Replaced with `set_primary_staff()` RPC that executes both updates in a single database transaction.

---

## 15. Implementation Order

Files must be created/modified in this order to avoid import errors:

1. **Database migration** — `supabase/migrations/20260318100001_create_staff.sql` (includes `set_primary_staff` RPC)
2. **Types** — `src/types/staff.ts` (add `ClientStaffAssignment`), then `src/types/client.ts` (remove `assignedStaffId`)
3. **Services** — `src/services/staffService.ts`, then `src/services/clientStaffService.ts`, then update `src/services/clientService.ts`
4. **Hooks** — `src/hooks/useIsMobile.ts` (shared hook), then `src/hooks/useStaff.ts`, then `src/hooks/useClientStaff.ts`
5. **Client module updates** — Update `src/components/clients/ClientsView.tsx` (import shared `useIsMobile`, remove local definition), update `src/components/clients/ClientHeader.tsx` (update stale TODO comment)
6. **Components** — In order:
   a. `src/components/staff/StaffCard.tsx` (no internal dependencies)
   b. `src/components/staff/StaffTasksPanel.tsx` (no internal dependencies)
   c. `src/components/staff/StaffPicker.tsx` (depends on `useStaff`)
   d. `src/components/staff/StaffForm.tsx` (depends on `useCreateStaff`, `useUpdateStaff`)
   e. `src/components/staff/StaffView.tsx` (depends on all above + `useIsMobile`)
7. **i18n** — `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts` (can be done at any point, but must be done before components are tested)
8. **Route** — `src/App.tsx` (last, once `StaffView` exists)

**Verification after implementation:**
```bash
npx tsc --noEmit    # TypeScript check
npm run build       # Full build
npm run lint        # Linter
```
