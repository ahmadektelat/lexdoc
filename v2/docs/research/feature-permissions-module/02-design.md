# Technical Design — RBAC & Permissions Module

## Architecture Approach

**Separated RBAC with JSONB permissions, loaded on login.**

The existing `user_firms.role` column (superAdmin/manager/staff/external) remains untouched as the authentication access tier. A new `roles` table stores granular permission role definitions with a JSONB `permissions` array of permission ID strings. A `staff_roles` junction table (1:1 — each staff member has at most one permission role) maps staff records to permission roles. On login, the system resolves `auth.uid() -> staff(user_id) -> staff_roles(staff_id) -> roles(permissions)` and populates `useAuthStore.permissions` for synchronous `can()` checks throughout the app.

**Why this approach over alternatives:**

- **No breaking changes** — `user_firms.role` is unchanged; existing auth and `ROLE_HIERARCHY` in `useAuthStore` continue to work.
- **JSONB over join table** — Permission definitions live in code (`PERMISSION_GROUPS` in `src/types/role.ts`); the DB only stores which permission IDs are enabled per role. This avoids a `role_permissions` junction table and simplifies queries.
- **UI-level enforcement in Phase 1** — Permissions gate UI elements via `can()` checks. RLS-level enforcement is deferred to a later phase, keeping this migration focused.
- **Single role per staff** — `UNIQUE(staff_id)` on `staff_roles` simplifies permission resolution (no multi-role merging logic).

---

## File-by-File Change Plan

### New Files

#### 1. `supabase/migrations/20260318100002_create_roles.sql`
- **Action:** Create
- **Changes:** Complete migration file containing:
  - `roles` table with `id, firm_id, name, description, color, locked, permissions (JSONB), deleted_at, created_at, updated_at`
  - `staff_roles` junction table with `id, staff_id, role_id, created_at` and `UNIQUE(staff_id)`
  - Indexes on both tables
  - RLS policies on both tables (firm_id scoping via `user_firm_ids()`)
  - `update_updated_at` trigger on `roles`
  - GRANTs for `authenticated` role
  - `get_user_permissions(p_user_id, p_firm_id)` helper function
  - `seed_default_roles(p_firm_id)` helper function
  - Extension of `register_firm()` to call `seed_default_roles`
  - One-time seed of default roles for all existing firms
- **Rationale:** Single migration file following the `20260318100001_create_staff.sql` pattern — table, indexes, RLS, trigger, grants all in one file.

#### 2. `src/services/roleService.ts`
- **Action:** Create
- **Changes:** Service object following `staffService.ts` pattern with:
  - `rowToRole()` mapper (snake_case DB row -> camelCase `Role` type)
  - `roleInputToRow()` mapper (`CreateRoleInput` -> snake_case DB columns)
  - `updateInputToRow()` mapper (`UpdateRoleInput` -> snake_case DB columns)
  - `list(firmId)` — fetch non-deleted roles ordered by `locked DESC, created_at ASC` (system roles first)
  - `getById(firmId, id)` — fetch single role with firm_id defense-in-depth
  - `create(firmId, input)` — insert with firm_id
  - `update(firmId, id, input)` — update with firm_id filter; reject if role is locked (application-level check)
  - `delete(firmId, id)` — soft delete with firm_id filter; reject if role is locked
  - `getStaffRoles(firmId)` — fetch staff_roles joined with roles and staff, returning `StaffRoleRow[]`
  - `assignRole(staffId, roleId)` — upsert into staff_roles (ON CONFLICT on staff_id, update role_id)
  - `removeRole(staffId)` — delete from staff_roles for a staff member
  - `getPermissionsForUser(firmId)` — call `get_user_permissions` RPC (uses `auth.uid()` internally), return `string[]`
- **Rationale:** Follows exact `staffService.ts` patterns — `Record<string, unknown>` casting, `rowToX` mapper, firm_id defense-in-depth on every query.

#### 3. `src/hooks/useRoles.ts`
- **Action:** Create
- **Changes:** React Query hooks following `useStaff.ts` pattern:
  - `roleKeys` query key factory: `all`, `lists`, `list(firmId)`, `details`, `detail(id)`, `staffRoles`, `staffRoleList(firmId)`
  - `useRoles(firmId)` — query for all roles
  - `useCreateRole()` — mutation, invalidate `roleKeys.lists()`, toast `permissions.createSuccess`
  - `useUpdateRole()` — mutation, invalidate `roleKeys.lists()` + `roleKeys.detail(id)`, toast `permissions.updateSuccess`. Also re-fetch current user's permissions if the updated role is their assigned role.
  - `useDeleteRole()` — mutation, invalidate `roleKeys.lists()`, toast `permissions.deleteSuccess`
  - `useStaffRoles(firmId)` — query for staff-role assignments
  - `useAssignRole()` — mutation to upsert staff_role, invalidate `staffRoles` query key, toast `permissions.roleAssigned`. Also re-fetch current user's permissions if assigning to self.
- **Rationale:** Follows `useStaff.ts` exactly — `useLanguage()` for toast translations, `useAuthStore` for firmId, `useQueryClient` for invalidation.

#### 4. `src/hooks/usePermissions.ts`
- **Action:** Create
- **Changes:** Single hook:
  ```typescript
  export function useCanAccess(permission: string): boolean {
    return useAuthStore((s) => s.can(permission));
  }
  ```
- **Rationale:** Thin wrapper for ergonomic use: `const canEdit = useCanAccess('clients.edit')`. Avoids importing `useAuthStore` and calling `.can()` directly in every consumer component.

#### 5. `src/components/permissions/PermissionsView.tsx`
- **Action:** Create
- **Changes:** Main page component with:
  - Two-column layout: 260px sidebar (role list) + flex-1 main panel (permission matrix + staff table)
  - Responsive: stacks vertically on mobile via `useIsMobile()`
  - Left sidebar: scrollable list of role cards, each showing color dot, name, locked badge, permission count, description. Selected role has accent border. "Add Role" button at top.
  - Right panel: role header (color dot + name + locked badge) + `PermissionMatrix` + `StaffRolesTable` below
  - State: `selectedRole`, `formOpen`, `deleteTarget`
  - Delete button visible only on non-locked selected roles
  - Uses: `useRoles`, `useDeleteRole`, `useAuthStore`, `useLanguage`, `useIsMobile`, `PageHeader`, `EmptyState`, `LoadingSpinner`, `ConfirmDialog`
- **Rationale:** Follows `StaffView.tsx` layout patterns — `PageHeader` with action button, `ConfirmDialog` for deletions, `EmptyState` for empty list, responsive mobile handling.

#### 6. `src/components/permissions/RoleForm.tsx`
- **Action:** Create
- **Changes:** Dialog/modal component following `StaffForm.tsx` pattern:
  - Props: `open`, `onOpenChange`, `role?: Role` (edit mode)
  - Fields: `name` (required text), `description` (optional text), `color` (preset hex swatches)
  - Color picker: 7 preset swatches (`#3b82f6`, `#10b981`, `#f59e0b`, `#ef4444`, `#8b5cf6`, `#06b6d4`, `#64748b`) rendered as clickable circles with selected indicator
  - Validation: name required, non-empty after trim
  - Create mode: calls `useCreateRole`, Edit mode: calls `useUpdateRole`
  - Uses `FormField`, `Dialog*` components, `Input`, `Button`
- **Rationale:** Mirrors `StaffForm.tsx` structure — `useEffect` to reset form on open, `setField` with error clearing, `validate()` before submit, `isSubmitting` disabled state.

#### 7. `src/components/permissions/PermissionMatrix.tsx`
- **Action:** Create
- **Changes:** Grouped permission checkbox grid:
  - Props: `role: Role`, `disabled: boolean`
  - Iterates `PERMISSION_GROUPS` from `src/types/role.ts`
  - Each group: translated heading (`t('permissions.group.' + group.group)`) + grid of checkboxes
  - Each checkbox: checked if `role.permissions.includes(permissionId)`, label via `t(permission.label)`
  - On toggle: compute new permissions array, call `useUpdateRole` with `{ permissions: newArray }`
  - Disabled state: reduced opacity, `pointer-events-none`, no click handler
  - Grid layout: `grid grid-cols-1 sm:grid-cols-2 gap-2` per group
- **Rationale:** Permission definitions are code-driven from `PERMISSION_GROUPS`. The component is a pure renderer — no local permission state, mutations go through React Query.

#### 8. `src/components/permissions/StaffRolesTable.tsx`
- **Action:** Create
- **Changes:** Table showing all active staff with their current permission role:
  - Props: `selectedRoleId: string`, `roles: Role[]`
  - Fetches staff via `useStaff(firmId)` and assignments via `useStaffRoles(firmId)`
  - Columns: avatar initial + staff name, current role badge (colored), role selector dropdown
  - Dropdown: lists all roles + "No role" option. On change: calls `useAssignRole` (or `removeRole` for "no role")
  - Highlights rows where staff member has the currently selected role
  - Uses `DataTable` for rendering (or simple table if DataTable is overkill for this simpler use case — design decision: use a simple `<table>` since we don't need sorting/pagination/search here)
- **Rationale:** Simpler than `DataTable` because this table is embedded inside the permission view and doesn't need its own search/pagination. A hand-rolled `<table>` matching the DataTable styling keeps it lightweight.

### Existing Files to Modify

#### 9. `src/types/role.ts`
- **Action:** Modify
- **Changes:**
  1. Rename `desc` to `description` in the `Role` interface (line 9) to match the DB column name. This ensures consistency between the TypeScript type, DB schema, service mapper, and form fields.
  2. Add 3 new type aliases after the existing `PermissionGroup` interface:
  ```typescript
  export type CreateRoleInput = Omit<Role, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;
  export type UpdateRoleInput = Partial<Omit<Role, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;
  export interface StaffRoleRow {
    id: string;
    staffId: string;
    roleId: string;
    roleName: string;
    roleColor: string;
  }
  ```
- **Rationale:** The DB column is `description`, so the TypeScript field should match. The `desc` abbreviation was inconsistent with the DB schema. `SYSTEM_ROLES` in `constants.ts` also uses `desc` and must be updated to `description` in the same pass.

#### 10. `src/lib/constants.ts`
- **Action:** Modify (lines 93-98, the `SYSTEM_ROLES` constant)
- **Changes:** Replace the current `SYSTEM_ROLES` array with an extended version that includes `permissions`, `locked`, and hex `color` values:
  ```typescript
  import { PERMISSION_GROUPS } from '@/types/role';

  // All permission IDs (derived from PERMISSION_GROUPS)
  const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id));

  export const SYSTEM_ROLES = [
    {
      id: 'admin',
      label: 'systemRoles.admin',
      description: 'systemRoles.adminDesc',
      color: '#ef4444',
      locked: true,
      permissions: ALL_PERMISSIONS,
    },
    {
      id: 'editor',
      label: 'systemRoles.editor',
      description: 'systemRoles.editorDesc',
      color: '#3b82f6',
      locked: true,
      permissions: ALL_PERMISSIONS.filter(p => !p.endsWith('.delete') && !p.startsWith('settings.')),
    },
    {
      id: 'viewer',
      label: 'systemRoles.viewer',
      description: 'systemRoles.viewerDesc',
      color: '#64748b',
      locked: true,
      permissions: ALL_PERMISSIONS.filter(p => p.endsWith('.view')),
    },
    {
      id: 'manager',
      label: 'systemRoles.manager',
      description: 'systemRoles.managerDesc',
      color: '#10b981',
      locked: true,
      permissions: [
        'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
        'staff.view', 'staff.manage',
        'crm.view', 'crm.manage',
        'reports.view',
        'documents.view', 'documents.upload',
      ],
    },
  ];
  ```
- **Rationale:** The `SYSTEM_ROLES` constant serves as the seed data source. Adding `permissions` and `locked` fields allows both the DB seed function and the UI to derive permission lists from a single source of truth. Color changes from Tailwind names to hex values to match the `roles.color` DB column (TEXT storing hex).

#### 11. `src/hooks/useAuth.ts`
- **Action:** Modify (lines 19-26, inside the `SIGNED_IN` handler after `setFirmData`)
- **Changes:** After the `setFirmData(result.firm, result.role)` call, add permission loading:
  ```typescript
  // Load granular permissions for this user
  try {
    const permissions = await roleService.getPermissionsForUser(
      result.firm.id
    );
    const permissionsRecord: Record<string, boolean> = {};
    for (const p of permissions) {
      permissionsRecord[p] = true;
    }
    useAuthStore.getState().setPermissions(permissionsRecord);
  } catch {
    // Permission loading failure = default deny (empty permissions).
    // superAdmin bypass in can() ensures firm owners always have access.
  }
  ```
  Also add import: `import { roleService } from '@/services/roleService';`
- **Rationale:** Permission loading happens in the same auth lifecycle event as firm data loading. Failure defaults to empty permissions (deny all), which is safe because `superAdmin` users bypass permission checks via `can()`. The try/catch prevents permission loading errors from breaking the entire login flow.

#### 12. `src/App.tsx`
- **Action:** Modify (line 78, the permissions route)
- **Changes:**
  - Replace `<SectionPlaceholder section="permissions" />` with `<PermissionsView />`
  - Add import: `import { PermissionsView } from '@/components/permissions/PermissionsView';`
- **Rationale:** The route `/permissions` and sidebar nav link already exist. This simply wires up the real component.

#### 13. `src/i18n/he.ts`
- **Action:** Modify (after existing `permissions.*` keys around line 359)
- **Changes:** Add ~35 new permission UI keys (see i18n Keys section below)
- **Rationale:** All new UI text must have Hebrew translations per CLAUDE.md rules.

#### 14. `src/i18n/ar.ts`
- **Action:** Modify (after existing `permissions.*` keys around line 359)
- **Changes:** Add ~35 new permission UI keys (see i18n Keys section below)
- **Rationale:** Arabic translations required per CLAUDE.md.

#### 15. `src/i18n/en.ts`
- **Action:** Modify (after existing `permissions.*` keys around line 359)
- **Changes:** Add ~35 new permission UI keys (see i18n Keys section below)
- **Rationale:** English translations required per CLAUDE.md.

#### 16. `docs/plans/SHARED-CODE-REGISTRY.md`
- **Action:** Modify
- **Changes:** Add entries to the registry:
  - **Services section:** `roleService.ts` — `roleService` (Supabase CRUD for roles and staff_roles) — Permissions phase
  - **Hooks section:** `useRoles.ts` — `useRoles`, `useCreateRole`, `useUpdateRole`, `useDeleteRole`, `useStaffRoles`, `useAssignRole` — Permissions phase
  - **Hooks section:** `usePermissions.ts` — `useCanAccess` — Permissions phase
  - **Types section:** Update `role.ts` entry to include `CreateRoleInput`, `UpdateRoleInput`, `StaffRoleRow`
- **Rationale:** CLAUDE.md mandates keeping the shared code registry up to date.

---

## Database Migration — Complete SQL

File: `supabase/migrations/20260318100002_create_roles.sql`

```sql
-- ============================================================
-- 1. ROLES TABLE
-- ============================================================
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  locked BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '[]',
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_roles_firm_id ON roles(firm_id);
CREATE INDEX idx_roles_firm_active ON roles(firm_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select" ON roles FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

-- Write policies restricted to superAdmin/manager auth tier to prevent privilege escalation
CREATE POLICY "roles_insert" ON roles FOR INSERT
  WITH CHECK (
    firm_id IN (SELECT user_firm_ids())
    AND firm_subscription_active(firm_id)
    AND EXISTS (
      SELECT 1 FROM user_firms
      WHERE user_id = auth.uid() AND firm_id = roles.firm_id
        AND role IN ('superAdmin', 'manager')
    )
  );

CREATE POLICY "roles_update" ON roles FOR UPDATE
  USING (
    firm_id IN (SELECT user_firm_ids())
    AND firm_subscription_active(firm_id)
    AND EXISTS (
      SELECT 1 FROM user_firms
      WHERE user_id = auth.uid() AND firm_id = roles.firm_id
        AND role IN ('superAdmin', 'manager')
    )
  );

CREATE POLICY "roles_delete" ON roles FOR DELETE
  USING (
    firm_id IN (SELECT user_firm_ids())
    AND firm_subscription_active(firm_id)
    AND EXISTS (
      SELECT 1 FROM user_firms
      WHERE user_id = auth.uid() AND firm_id = roles.firm_id
        AND role IN ('superAdmin', 'manager')
    )
  );

-- Trigger: auto-update updated_at (reuses existing helper from 20260317100003)
CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger: prevent modification of locked system roles (defense-in-depth)
CREATE OR REPLACE FUNCTION prevent_locked_role_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked THEN
      RAISE EXCEPTION 'Cannot delete a locked system role';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE
  IF OLD.locked THEN
    RAISE EXCEPTION 'Cannot modify a locked system role';
  END IF;
  IF NEW.locked AND NOT OLD.locked THEN
    RAISE EXCEPTION 'Cannot lock a role after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER roles_prevent_locked_mutation
  BEFORE UPDATE OR DELETE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_role_mutation();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO authenticated;

-- ============================================================
-- 2. STAFF_ROLES JUNCTION TABLE
-- ============================================================
CREATE TABLE staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id)  -- each staff member has exactly one permission role
);

-- Indexes
CREATE INDEX idx_staff_roles_staff ON staff_roles(staff_id);
CREATE INDEX idx_staff_roles_role ON staff_roles(role_id);

-- RLS
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_roles_select" ON staff_roles FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND deleted_at IS NULL));

-- Write policies restricted to superAdmin/manager auth tier to prevent privilege escalation
-- INSERT: dual-chain validation — both staff_id AND role_id must belong to caller's firm, staff must be active
CREATE POLICY "staff_roles_insert" ON staff_roles FOR INSERT
  WITH CHECK (
    staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id) AND deleted_at IS NULL)
    AND role_id IN (SELECT id FROM roles WHERE firm_id IN (SELECT user_firm_ids()) AND deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM user_firms uf
      JOIN staff st ON st.id = staff_roles.staff_id
      WHERE uf.user_id = auth.uid() AND uf.firm_id = st.firm_id
        AND uf.role IN ('superAdmin', 'manager')
    )
  );

-- UPDATE: USING validates old row, WITH CHECK validates new role_id belongs to caller's firm
CREATE POLICY "staff_roles_update" ON staff_roles FOR UPDATE
  USING (
    staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id) AND deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM user_firms uf
      JOIN staff st ON st.id = staff_roles.staff_id
      WHERE uf.user_id = auth.uid() AND uf.firm_id = st.firm_id
        AND uf.role IN ('superAdmin', 'manager')
    )
  )
  WITH CHECK (
    staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND deleted_at IS NULL)
    AND role_id IN (SELECT id FROM roles WHERE firm_id IN (SELECT user_firm_ids()) AND deleted_at IS NULL)
  );

CREATE POLICY "staff_roles_delete" ON staff_roles FOR DELETE
  USING (
    staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id) AND deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM user_firms uf
      JOIN staff st ON st.id = staff_roles.staff_id
      WHERE uf.user_id = auth.uid() AND uf.firm_id = st.firm_id
        AND uf.role IN ('superAdmin', 'manager')
    )
  );

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_roles TO authenticated;

-- ============================================================
-- 3. HELPER FUNCTION: get_user_permissions
-- ============================================================
-- Uses auth.uid() internally — no arbitrary user_id parameter to prevent cross-tenant info disclosure
CREATE OR REPLACE FUNCTION get_user_permissions(p_firm_id UUID)
RETURNS JSONB AS $$
  SELECT COALESCE(
    (SELECT r.permissions
     FROM staff s
     JOIN staff_roles sr ON sr.staff_id = s.id
     JOIN roles r ON r.id = sr.role_id
     WHERE s.user_id = auth.uid()
       AND s.firm_id = p_firm_id
       AND s.deleted_at IS NULL
       AND r.deleted_at IS NULL
     LIMIT 1),
    '[]'::jsonb
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_permissions(UUID) TO authenticated;

-- ============================================================
-- 4. SEED FUNCTION: seed_default_roles
-- ============================================================
CREATE OR REPLACE FUNCTION seed_default_roles(p_firm_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Idempotency guard: skip if roles already exist for this firm
  IF EXISTS (SELECT 1 FROM roles WHERE firm_id = p_firm_id) THEN
    RETURN;
  END IF;

  -- Admin: all permissions
  INSERT INTO roles (firm_id, name, description, color, locked, permissions)
  VALUES (
    p_firm_id, 'admin', 'Full access to all modules', '#ef4444', true,
    '["clients.view","clients.create","clients.edit","clients.delete","filings.view","filings.create","filings.edit","filings.delete","billing.view","billing.create","billing.edit","billing.delete","billing.invoices","staff.view","staff.manage","crm.view","crm.manage","documents.view","documents.upload","documents.delete","reports.view","reports.export","messaging.view","messaging.send","settings.roles","settings.firm","settings.audit","settings.backup"]'::jsonb
  );

  -- Editor: all except delete and settings
  INSERT INTO roles (firm_id, name, description, color, locked, permissions)
  VALUES (
    p_firm_id, 'editor', 'Edit and view all modules', '#3b82f6', true,
    '["clients.view","clients.create","clients.edit","filings.view","filings.create","filings.edit","billing.view","billing.create","billing.edit","billing.invoices","staff.view","staff.manage","crm.view","crm.manage","documents.view","documents.upload","reports.view","reports.export","messaging.view","messaging.send"]'::jsonb
  );

  -- Viewer: view-only
  INSERT INTO roles (firm_id, name, description, color, locked, permissions)
  VALUES (
    p_firm_id, 'viewer', 'View only access', '#64748b', true,
    '["clients.view","filings.view","billing.view","staff.view","crm.view","documents.view","reports.view","messaging.view"]'::jsonb
  );

  -- Manager: clients, staff, crm, reports, documents
  INSERT INTO roles (firm_id, name, description, color, locked, permissions)
  VALUES (
    p_firm_id, 'manager', 'Manage staff and clients', '#10b981', true,
    '["clients.view","clients.create","clients.edit","clients.delete","staff.view","staff.manage","crm.view","crm.manage","reports.view","documents.view","documents.upload"]'::jsonb
  );
END;
$$;

-- Revoke all access — only callable internally by register_firm() (SECURITY DEFINER context)
REVOKE ALL ON FUNCTION seed_default_roles(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION seed_default_roles(UUID) FROM authenticated;

-- ============================================================
-- 5. EXTEND register_firm() TO SEED DEFAULT ROLES
-- ============================================================
CREATE OR REPLACE FUNCTION register_firm(
  p_name TEXT,
  p_type TEXT,
  p_reg_num TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_city TEXT DEFAULT '',
  p_default_fee INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_firm_id UUID;
BEGIN
  INSERT INTO firms (name, type, reg_num, phone, email, city, default_fee, plan, plan_label, expiry)
  VALUES (p_name, p_type, p_reg_num, p_phone, p_email, p_city, p_default_fee, 'trial', 'subscriptionPlans.trial', NOW() + INTERVAL '30 days')
  RETURNING id INTO v_firm_id;

  INSERT INTO user_firms (user_id, firm_id, role)
  VALUES (auth.uid(), v_firm_id, 'superAdmin');

  -- Seed default permission roles for the new firm
  PERFORM seed_default_roles(v_firm_id);

  RETURN v_firm_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. SEED DEFAULT ROLES FOR ALL EXISTING FIRMS
-- ============================================================
DO $$
DECLARE
  v_firm_id UUID;
BEGIN
  FOR v_firm_id IN SELECT id FROM firms WHERE deleted_at IS NULL LOOP
    -- Only seed if the firm doesn't already have roles
    IF NOT EXISTS (SELECT 1 FROM roles WHERE firm_id = v_firm_id) THEN
      PERFORM seed_default_roles(v_firm_id);
    END IF;
  END LOOP;
END;
$$;
```

---

## Data Flow

### Permission Resolution on Login

```
User Login
  │
  ▼
useAuth.ts: onAuthStateChange('SIGNED_IN')
  │
  ├─ firmService.getFirmByUserId(userId)
  │   └─ Returns { firm, role }
  │
  ├─ useAuthStore.setFirmData(firm, role)     ← sets auth tier role
  │
  └─ roleService.getPermissionsForUser(firmId)
      │
      ▼
    Supabase RPC: get_user_permissions(firmId)  ← uses auth.uid() internally
      │
      ▼
    DB: staff(user_id) → staff_roles(staff_id) → roles(permissions)
      │
      ▼
    Returns: ['clients.view', 'clients.edit', ...]
      │
      ▼
    Convert to Record<string, boolean>: { 'clients.view': true, 'clients.edit': true }
      │
      ▼
    useAuthStore.setPermissions(permissionsRecord)
```

### Permission Check in Components

```
Component renders
  │
  ▼
useCanAccess('clients.edit')        ← from src/hooks/usePermissions.ts
  │
  ▼
useAuthStore(s => s.can('clients.edit'))
  │
  ├─ if role === 'superAdmin' → return true    (bypass)
  └─ else → return permissions['clients.edit'] === true
```

### Role Mutation Flow (PermissionsView)

```
User toggles a permission checkbox
  │
  ▼
PermissionMatrix: compute new permissions array
  │
  ▼
useUpdateRole.mutate({ firmId, id, input: { permissions: newArray } })
  │
  ▼
roleService.update(firmId, id, { permissions: newArray })
  │
  ▼
Supabase: UPDATE roles SET permissions = ... WHERE id = ... AND firm_id = ...
  │
  ▼
onSuccess:
  ├─ queryClient.invalidateQueries(roleKeys.lists())
  ├─ queryClient.invalidateQueries(roleKeys.detail(id))
  ├─ toast.success('permissions.permissionUpdated')
  └─ IF updated role is current user's role:
       └─ Re-fetch permissions via roleService.getPermissionsForUser()
          └─ useAuthStore.setPermissions(newRecord)
```

### Staff Role Assignment Flow

```
User changes role dropdown for a staff member
  │
  ▼
StaffRolesTable: call useAssignRole.mutate({ staffId, roleId })
  │
  ▼
roleService.assignRole(staffId, roleId)
  │
  ▼
Supabase: INSERT INTO staff_roles (staff_id, role_id)
          ON CONFLICT (staff_id) DO UPDATE SET role_id = EXCLUDED.role_id
  │
  ▼
onSuccess:
  ├─ queryClient.invalidateQueries(roleKeys.staffRoles())
  ├─ toast.success('permissions.roleAssigned')
  └─ IF staffId is current user's staff record:
       └─ Re-fetch own permissions
```

---

## i18n Keys

All keys below need entries in `he.ts`, `ar.ts`, and `en.ts`. The individual permission label keys (`permissions.clients.view`, etc.) and system role keys (`systemRoles.admin`, etc.) already exist in all 3 files. Only the permission **UI** keys and **group header** keys are new.

### New Permission UI Keys

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `permissions.title` | ניהול הרשאות ותפקידים | إدارة الصلاحيات والأدوار | Roles & Permissions |
| `permissions.description` | הגדר תפקידים, הרשאות ושייך עובדים לתפקידים | تحديد الأدوار والصلاحيات وتعيين الموظفين | Define roles, permissions, and assign staff to roles |
| `permissions.roles` | תפקידים | الأدوار | Roles |
| `permissions.addRole` | הוספת תפקיד | إضافة دور | Add Role |
| `permissions.editRole` | עריכת תפקיד | تعديل دور | Edit Role |
| `permissions.roleName` | שם התפקיד | اسم الدور | Role Name |
| `permissions.roleDesc` | תיאור (אופציונלי) | وصف (اختياري) | Description (optional) |
| `permissions.roleColor` | צבע | لون | Color |
| `permissions.locked` | נעול | مقفل | Locked |
| `permissions.lockedDesc` | הרשאות נעולות - תפקיד מובנה | صلاحيات مقفلة - دور مدمج | Locked permissions — built-in role |
| `permissions.permissionCount` | הרשאות | صلاحيات | permissions |
| `permissions.deleteRole` | מחיקת תפקיד | حذف دور | Delete Role |
| `permissions.deleteConfirm` | האם למחוק את התפקיד? | هل تريد حذف الدور؟ | Delete this role? |
| `permissions.deleteConfirmDesc` | עובדים בתפקיד זה יאבדו את ההרשאות שלהם | سيفقد الموظفون في هذا الدور صلاحياتهم | Staff with this role will lose their permissions |
| `permissions.createSuccess` | תפקיד חדש נוסף בהצלחה | تم إضافة دور جديد بنجاح | Role created successfully |
| `permissions.updateSuccess` | תפקיד עודכן בהצלחה | تم تحديث الدور بنجاح | Role updated successfully |
| `permissions.deleteSuccess` | תפקיד הוסר בהצלחה | تم حذف الدور بنجاح | Role deleted successfully |
| `permissions.permissionUpdated` | הרשאה עודכנה | تم تحديث الصلاحية | Permission updated |
| `permissions.roleAssigned` | תפקיד שויך בהצלחה | تم تعيين الدور بنجاح | Role assigned successfully |
| `permissions.noRoles` | אין תפקידים | لا توجد أدوار | No roles |
| `permissions.noRolesDesc` | הוסף תפקידים לניהול הרשאות | أضف أدوار لإدارة الصلاحيات | Add roles to manage permissions |
| `permissions.staffInRole` | עובדים בתפקיד | موظفون في الدور | Staff in role |
| `permissions.changeRole` | שנה תפקיד | تغيير الدور | Change Role |
| `permissions.currentRole` | תפקיד נוכחי | الدور الحالي | Current Role |
| `permissions.selectRole` | בחר תפקיד | اختر دور | Select Role |
| `permissions.noPermissionRole` | ללא תפקיד הרשאות | بدون دور صلاحيات | No permission role |
| `permissions.cannotEditLocked` | לא ניתן לערוך תפקיד מובנה | لا يمكن تعديل دور مدمج | Cannot edit built-in role |
| `permissions.cannotDeleteLocked` | לא ניתן למחוק תפקיד מובנה | لا يمكن حذف دور مدمج | Cannot delete built-in role |

### New Permission Group Header Keys

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `permissions.group.clients` | לקוחות | العملاء | Clients |
| `permissions.group.filings` | דיווחים | التقارير | Filings |
| `permissions.group.billing` | חיובים | الفواتير | Billing |
| `permissions.group.staff` | צוות | الفريق | Staff |
| `permissions.group.crm` | אנשי קשר | جهات الاتصال | Contacts |
| `permissions.group.documents` | מסמכים | المستندات | Documents |
| `permissions.group.reports` | דוחות | التقارير | Reports |
| `permissions.group.messaging` | הודעות | الرسائل | Messages |
| `permissions.group.settings` | הגדרות מערכת | إعدادات النظام | System Settings |

---

## Implementation Order

The implementation must follow this dependency order:

### Phase 1: Foundation (no UI dependencies)
1. **`supabase/migrations/20260318100002_create_roles.sql`** — Tables, RLS, functions, seed data. Everything downstream depends on the DB schema existing.
2. **`src/types/role.ts`** — Add `CreateRoleInput`, `UpdateRoleInput`, `StaffRoleRow`. Must exist before service and hooks.

### Phase 2: Service + Hooks (depends on Phase 1)
3. **`src/services/roleService.ts`** — CRUD service. Depends on types from Phase 1.
4. **`src/hooks/useRoles.ts`** — React Query hooks. Depends on `roleService`.
5. **`src/hooks/usePermissions.ts`** — `useCanAccess` hook. Depends on `useAuthStore` (already exists).

### Phase 3: Auth Integration (depends on Phase 2)
6. **`src/hooks/useAuth.ts`** — Add permission loading. Depends on `roleService.getPermissionsForUser`.
7. **`src/lib/constants.ts`** — Update `SYSTEM_ROLES` with `permissions`, `locked`, hex colors. No code depends on the new fields yet, but it should be done before UI work.

### Phase 4: UI Components (depends on Phases 2-3)
8. **`src/components/permissions/PermissionMatrix.tsx`** — Standalone, depends on `useUpdateRole` + `PERMISSION_GROUPS`.
9. **`src/components/permissions/RoleForm.tsx`** — Standalone dialog, depends on `useCreateRole` + `useUpdateRole`.
10. **`src/components/permissions/StaffRolesTable.tsx`** — Depends on `useStaff`, `useStaffRoles`, `useAssignRole`.
11. **`src/components/permissions/PermissionsView.tsx`** — Orchestrator, depends on all 3 sub-components + `useRoles`.

### Phase 5: Wiring + i18n (depends on Phase 4)
12. **`src/App.tsx`** — Replace placeholder route with `PermissionsView`.
13. **`src/i18n/he.ts`, `ar.ts`, `en.ts`** — Add all new translation keys.
14. **`docs/plans/SHARED-CODE-REGISTRY.md`** — Update registry.

**Note:** i18n keys can technically be added at any point, but doing them last ensures no keys are missed and the full key list is known.

---

## Edge Cases & Error Handling

1. **No staff record for user** — Permission resolution returns empty array. `can()` returns `false` for everything. `superAdmin` bypass ensures firm owner is never locked out.

2. **No role assignment for staff** — Same as above. The `get_user_permissions` function returns `NULL` (handled by `COALESCE` to empty array). Default deny.

3. **Deleted role that staff is assigned to** — `get_user_permissions` filters `r.deleted_at IS NULL`, so permissions become empty. Staff member effectively loses all granular permissions until reassigned. The `ON DELETE CASCADE` on `staff_roles.role_id` would also clean up the assignment when a role is hard-deleted, but we use soft delete so this cascade doesn't apply in normal operation.

4. **Locked role edit/delete attempt** — Application-level check in `roleService.update()` and `roleService.delete()` throws an error if `role.locked === true`. UI also prevents this by disabling edit/delete buttons for locked roles. Defense in depth.

5. **Self-permission change** — When a user changes their own role's permissions (or gets reassigned to a different role), the mutation's `onSuccess` handler detects this and re-fetches permissions. The user's `can()` checks update in real-time without requiring a page refresh.

6. **Concurrent role editing** — Two admins editing the same role simultaneously: last write wins (standard optimistic concurrency). React Query's stale-while-revalidate handles showing fresh data. Not a critical issue for a settings page.

7. **Role deletion with assigned staff** — The `ConfirmDialog` warns that staff will lose permissions. After deletion (soft), `staff_roles` entries still reference the role, but `get_user_permissions` filters `r.deleted_at IS NULL`, so those staff lose their permissions. They need to be reassigned.

8. **Empty firm (no staff)** — StaffRolesTable shows empty state. PermissionMatrix and role list still work normally.

---

## Performance Considerations

1. **Permission loading on login** — Single RPC call (`get_user_permissions`) with a 3-table join. The join path is indexed (`staff.user_id`, `staff_roles.staff_id`, `staff_roles.role_id`). For firms with <100 staff this is negligible (<5ms).

2. **JSONB permissions column** — Storing 27 permission strings in JSONB is tiny (~500 bytes). No GIN index needed since we never query `WHERE permissions @> ...` — permissions are always fetched as a whole column value.

3. **Role list query** — `SELECT * FROM roles WHERE firm_id = ? AND deleted_at IS NULL` with the `idx_roles_firm_active` partial index. Sub-millisecond for any realistic number of roles per firm (<50).

4. **React Query caching** — Roles and staff_roles queries use `staleTime: 5 * 60 * 1000` (5 minutes, inherited from `QueryClient` defaults). This prevents unnecessary re-fetches when navigating between tabs.

5. **No N+1 in StaffRolesTable** — Staff list and staff_roles are fetched as two separate queries, then joined client-side by `staffId`. This avoids per-row queries.

---

## i18n / RTL Implications

- **RTL layout:** The two-column layout uses `flex gap-6` which respects RTL direction automatically. The sidebar is logically "start" (right side in RTL).
- **Color picker swatches:** Directional-neutral (circles in a grid), no RTL issues.
- **Permission checkboxes:** Checkboxes with labels use `flex items-center gap-2` — naturally RTL-compatible with logical properties.
- **New translation keys:** 35+ keys added to all 3 language files (he, ar, en). All UI text uses `t()`.
- **Force LTR:** No LTR-forced elements needed in this module (no phone numbers, tax IDs, or code inputs).

---

## Security Considerations

1. **RLS on both tables** — `roles` scoped by `firm_id IN (SELECT user_firm_ids())`. `staff_roles` scoped by chain validation through `staff.firm_id`.

2. **Dual-chain RLS on staff_roles** — INSERT/UPDATE policies validate both `staff_id` and `role_id` belong to the caller's firm. Prevents cross-firm role assignment.

3. **Subscription check** — INSERT/UPDATE/DELETE policies include `firm_subscription_active(firm_id)`. Expired firms can still read roles but cannot modify them.

4. **Locked role protection** — Defense-in-depth: application-level check in `roleService` rejects updates/deletes to locked roles, AND a DB trigger (`prevent_locked_role_mutation`) raises an exception on UPDATE/DELETE of locked roles.

5. **superAdmin bypass** — `useAuthStore.can()` returns `true` for `superAdmin` role (line 76-77 of `useAuthStore.ts`). This ensures firm owners always have full access regardless of permission role assignment.

6. **SECURITY DEFINER on `get_user_permissions`** — This function runs with the definer's privileges, bypassing RLS. This is intentional — it needs to read staff/staff_roles/roles across the firm to resolve permissions. The function is `STABLE` (read-only) and only returns the permissions array, not sensitive data.

7. **Permission loading failure = deny all** — If `getPermissionsForUser` throws (no staff record, no role, DB error), the catch block in `useAuth.ts` silently fails. Permissions remain empty (`{}`), which means `can()` returns `false` for everything. Safe default.

---

## Self-Critique

### What could go wrong

1. **Stale permissions after role mutation** — If a user updates their own role's permissions, the `onSuccess` re-fetch is asynchronous. There's a brief window where `can()` returns stale values. Mitigation: This is acceptable for a settings page; the user just made the change so they know what's happening.

2. **Locked role protection is dual-layer** — Locked roles are protected at both the application level (`roleService` checks) and the DB level (`prevent_locked_role_mutation` trigger). A direct Supabase API call bypassing the service will still be blocked by the trigger.

3. **Orphaned staff_roles after soft-delete** — When a role is soft-deleted, `staff_roles` entries referencing it remain. These staff members silently lose permissions (the `get_user_permissions` function filters `r.deleted_at IS NULL`). The UI should reassign staff before deletion, but the `deleteConfirmDesc` message warns about this.

4. **No multi-role support** — `UNIQUE(staff_id)` on `staff_roles` enforces single-role-per-staff. If multi-role is ever needed, this constraint must be dropped and permission merging logic added. The current design was explicitly chosen by the user (requirement decision #4).

5. **Permission ID drift** — If `PERMISSION_GROUPS` in code adds/removes permission IDs, existing roles in the DB may reference stale IDs. The `PermissionMatrix` renders from `PERMISSION_GROUPS` and checks against `role.permissions`, so removed permissions simply won't render (no crash), and new permissions default to unchecked. This is acceptable behavior.

### Alternative approaches considered

- **Join table for permissions (`role_permissions`)** — Rejected because it adds a table, more joins, and more complexity for no benefit when the permission set is small (27 items) and defined in code.
- **Store permissions in `useAuthStore` as `Set<string>`** — Rejected because Zustand's `set()` doesn't handle custom objects well in shallow comparison. `Record<string, boolean>` is simpler and already used by the existing `permissions` field.
- **Load permissions via edge function** — Rejected because the existing `supabase.rpc()` pattern is simpler and doesn't require deploying/maintaining an edge function.
- **Merge multiple roles** — Rejected per user decision. Single role per staff member is simpler and sufficient for the use case.
