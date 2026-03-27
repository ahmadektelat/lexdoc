# Requirements Document — RBAC & Permissions Module

## Task Summary

Implement a full RBAC (Role-Based Access Control) & Permissions module: a `roles` table with JSONB permissions, a `staff_roles` junction table, a two-column permissions management UI, and integration with the existing auth store so that `can(permission)` checks work throughout the app.

---

## User Decisions

1. **System roles separation** — **User chose: Separate concerns.** Keep `user_firms.role` (superAdmin/manager/staff/external) as the auth access tier, unchanged. The permissions module creates its own `roles` table for granular permission assignments. No breaking changes to existing auth.

2. **Seeded default roles** — **User chose: Fresh, no legacy.** Seed clean role names from the plan (`admin`, `editor`, `viewer`, `manager`) with fresh permission sets. Do not mirror legacy naming or permission structures. Lock all 4 system roles.

3. **Permission storage** — **User chose: JSONB array.** Store permissions as a JSONB array of permission ID strings on the `roles` table. Permission definitions live in code (`PERMISSION_GROUPS` in `src/types/role.ts`).

4. **Staff-role assignment** — **User chose: Assign to staff records.** Use `staff_roles(staff_id, role_id)` junction table as the plan specifies. Runtime permission check resolves via `auth.uid() -> staff(user_id) -> staff_roles(staff_id) -> roles(permissions)`.

5. **Permission loading** — **User chose: Load on login.** Extend the login flow in `useAuth.ts` to resolve `staff -> staff_roles -> roles.permissions` and call `setPermissions()` on the auth store. Re-fetch when roles change in the permissions UI.

---

## Chosen Approach

**Separated RBAC with JSONB permissions, loaded on login.**

The `user_firms.role` column stays as the auth access tier (who can log in). A new `roles` table stores permission role definitions with a JSONB `permissions` array. A `staff_roles` junction table maps staff to permission roles. On login, the system resolves the current user's permissions and stores them in `useAuthStore` for synchronous `can()` checks. The permissions management UI is a two-column layout with role list + permission matrix.

---

## Scope

**In scope:**
- `roles` table with JSONB permissions + RLS
- `staff_roles` junction table + RLS
- Seed 4 locked system roles (admin, editor, viewer, manager)
- Custom role CRUD (create, edit, delete non-locked roles)
- PermissionsView — two-column layout (role list + permission matrix)
- RoleForm — modal for creating/editing custom roles
- PermissionMatrix — grouped checkboxes for toggling permissions
- StaffRolesTable — assign permission roles to staff via dropdown
- `roleService` — Supabase CRUD for roles and staff_roles
- `useRoles` / `useStaffRoles` hooks (React Query)
- `useCanAccess(permission)` hook for conditional UI rendering
- Update `useAuth.ts` login flow to load permissions
- Update `useAuthStore.can()` to use loaded permissions
- Route: `/permissions` replacing the current placeholder
- i18n keys for the permissions UI in all 3 languages
- Update `SYSTEM_ROLES` constant to match the new role definitions

**Out of scope:**
- Changing `user_firms.role` or its CHECK constraint
- Modifying the existing `ROLE_HIERARCHY` in `useAuthStore`
- Enforcing permissions in other module UIs (that's per-module work)
- RLS-level permission enforcement (permissions are UI-level in this phase)
- Audit logging of permission changes (audit module is a later phase)

---

## Existing Shared Code to Reuse

### Types (already exist — import from `@/types`)
| Import | File | Notes |
|--------|------|-------|
| `Role` | `src/types/role.ts` | Interface matches plan. Has `firm_id`, `name`, `desc`, `color`, `locked`, `permissions: string[]`, `deleted_at`, timestamps. |
| `Permission` | `src/types/role.ts` | `{ id, label, group }` |
| `StaffRoleAssignment` | `src/types/role.ts` | `{ staffId, roleId }` — camelCase. |
| `PermissionGroup` | `src/types/role.ts` | `{ group, permissions[] }` |
| `PERMISSION_GROUPS` | `src/types/role.ts` | Constant with 9 groups, 27 permissions. Labels use i18n keys. |
| `Staff` | `src/types/staff.ts` | Staff interface — needed for StaffRolesTable. |

### Constants (already exist — import from `@/lib/constants`)
| Import | Notes |
|--------|-------|
| `SYSTEM_ROLES` | Currently has `admin/editor/viewer/manager` with i18n label keys. **Needs updating**: add `permissions` arrays, mark `locked: true`, add `color` hex values (not Tailwind names). |

### Shared Components (already exist — import from `@/components/shared`)
| Component | Usage in Permissions Module |
|-----------|---------------------------|
| `PageHeader` | Page title + description for PermissionsView |
| `DataTable` | StaffRolesTable (staff list with role dropdown) |
| `FormField` | RoleForm fields (name, description) |
| `ConfirmDialog` | Delete role confirmation |
| `StatusBadge` | Locked/unlocked role status |
| `EmptyState` | No roles / no staff state |
| `LoadingSpinner` | Loading state |
| `SearchInput` | Optional — search staff in StaffRolesTable |

### Hooks (already exist)
| Hook | Usage |
|------|-------|
| `useStaff` from `@/hooks/useStaff` | Fetch staff list for StaffRolesTable |
| `useAuth` from `@/hooks/useAuth` | Auth lifecycle (will be extended) |

### Stores (already exist)
| Store | Usage |
|-------|-------|
| `useAuthStore` from `@/stores/useAuthStore` | `can()`, `permissions`, `setPermissions()` — already has the interface, just needs data |

### Services (already exist)
| Service | Usage |
|---------|-------|
| `staffService` from `@/services/staffService` | Staff queries (used by useStaff hook) |

---

## Missing Shared Code That Needs to Be Created

### Service: `src/services/roleService.ts`
New service object with methods:
- `list(firmId: string): Promise<Role[]>` — fetch all non-deleted roles for a firm
- `getById(firmId: string, id: string): Promise<Role>` — fetch single role
- `create(firmId: string, input: CreateRoleInput): Promise<Role>` — create custom role
- `update(firmId: string, id: string, input: UpdateRoleInput): Promise<Role>` — update role (reject if locked)
- `delete(firmId: string, id: string): Promise<void>` — soft delete (reject if locked)
- `getStaffRoles(firmId: string): Promise<StaffRoleRow[]>` — fetch staff_roles with joined role data
- `assignRole(staffId: string, roleId: string): Promise<void>` — upsert staff_roles assignment
- `getPermissionsForUser(userId: string, firmId: string): Promise<string[]>` — resolve user -> staff -> staff_roles -> role.permissions

Pattern: follow `staffService.ts` — use `supabase` client, `rowToX()` mappers, firm_id defense-in-depth filters.

### Hook: `src/hooks/useRoles.ts`
New hooks following the `useStaff.ts` pattern:
- `roleKeys` — query key factory
- `useRoles(firmId)` — fetch all roles for the firm
- `useCreateRole()` — mutation with cache invalidation + toast
- `useUpdateRole()` — mutation with cache invalidation + toast
- `useDeleteRole()` — mutation with cache invalidation + toast
- `useStaffRoles(firmId)` — fetch staff-role assignments
- `useAssignRole()` — mutation to assign a role to a staff member

### Hook: `src/hooks/usePermissions.ts`
- `useCanAccess(permission: string): boolean` — reads `useAuthStore.can(permission)`, returns boolean for conditional rendering

### Types to add in `src/types/role.ts`
- `CreateRoleInput = Omit<Role, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>`
- `UpdateRoleInput = Partial<Omit<Role, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>`
- `StaffRoleRow = { id: string; staffId: string; roleId: string; roleName: string; roleColor: string; }`

---

## Database Changes

### New Table: `roles`
```sql
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
```

Indexes:
- `idx_roles_firm_id ON roles(firm_id)`
- `idx_roles_firm_active ON roles(firm_id) WHERE deleted_at IS NULL`

RLS policies (same pattern as `staff` table):
- `roles_select` — `USING (firm_id IN (SELECT user_firm_ids()))`
- `roles_insert` — `WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))`
- `roles_update` — `USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))`
- `roles_delete` — `USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))`

Trigger: `roles_updated_at` using existing `update_updated_at()` function.

Grant: `SELECT, INSERT, UPDATE, DELETE ON roles TO authenticated`

### New Table: `staff_roles`
```sql
CREATE TABLE staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id)  -- each staff member has exactly one permission role
);
```

Note: `UNIQUE(staff_id)` not `UNIQUE(staff_id, role_id)` — each staff member can have only ONE permission role at a time. Changing role = update, not insert.

Indexes:
- `idx_staff_roles_staff ON staff_roles(staff_id)`
- `idx_staff_roles_role ON staff_roles(role_id)`

RLS policies (dual-chain validation like `client_staff`):
- `staff_roles_select` — `USING (staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids())))`
- `staff_roles_insert` — `WITH CHECK (staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id)) AND role_id IN (SELECT id FROM roles WHERE firm_id IN (SELECT user_firm_ids())))`
- `staff_roles_update` — same dual-chain as insert
- `staff_roles_delete` — `USING (staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id)))`

Grant: `SELECT, INSERT, UPDATE, DELETE ON staff_roles TO authenticated`

### Seed Data
Seed 4 locked system roles per firm. This should happen via a DB function called during firm registration (extend `register_firm()`) or via application-level seeding on first visit to the permissions page.

**Recommended: Extend `register_firm()` function** to also seed the 4 default roles when a firm is created:

| Role ID (generated) | Name | Description | Color | Locked | Permissions |
|---------------------|------|-------------|-------|--------|-------------|
| (uuid) | admin | Full access to all modules | `#ef4444` | true | All 27 permission IDs |
| (uuid) | editor | Edit and view all modules | `#3b82f6` | true | All except `*.delete`, `settings.*` |
| (uuid) | viewer | View-only access | `#64748b` | true | All `*.view` permissions only |
| (uuid) | manager | Manage staff and clients | `#10b981` | true | clients.*, staff.*, crm.*, reports.view, documents.view |

### Helper Function: `get_user_permissions`
```sql
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID, p_firm_id UUID)
RETURNS JSONB AS $$
  SELECT COALESCE(r.permissions, '[]'::jsonb)
  FROM staff s
  JOIN staff_roles sr ON sr.staff_id = s.id
  JOIN roles r ON r.id = sr.role_id
  WHERE s.user_id = p_user_id
    AND s.firm_id = p_firm_id
    AND s.deleted_at IS NULL
    AND r.deleted_at IS NULL
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

---

## Component Requirements

### 1. PermissionsView (`src/components/permissions/PermissionsView.tsx`)

**Layout:** Two-column grid (260px sidebar + flex-1 main), responsive — stacks on mobile.

**Left sidebar:**
- List of roles as clickable cards
- Each card shows: color dot, role name, locked badge (if locked), permission count, description
- Selected role highlighted with accent border/background
- Non-locked selected role shows delete button (top-left corner)
- "Add Role" button at top of sidebar — toggles inline form or opens RoleForm modal

**Right panel (when role selected):**
- Role header: color dot + name + locked badge if applicable
- PermissionMatrix component
- StaffRolesTable component below the matrix

**Props:** None (self-contained page component).

**State:** `selectedRole`, `formOpen`, `deleteTarget`.

**Imports:** `useRoles`, `useDeleteRole`, `useAuthStore`, `useLanguage`, `PageHeader`, `EmptyState`, `LoadingSpinner`, `ConfirmDialog`.

### 2. RoleForm (`src/components/permissions/RoleForm.tsx`)

**Type:** Dialog/Modal (using shadcn Dialog).

**Fields:**
- `name` (required, text input)
- `description` (optional, text input)
- `color` (hex color picker — preset swatches like legacy: `#3b82f6`, `#10b981`, `#f59e0b`, `#ef4444`, `#8b5cf6`, `#06b6d4`, `#64748b`)

**Behavior:**
- Create mode: empty form, calls `useCreateRole`
- Edit mode: pre-filled with role data, calls `useUpdateRole`
- Cannot open for locked roles (button disabled/hidden)
- Validation: name is required, must be non-empty after trim

**Props:** `open: boolean`, `onOpenChange: (open: boolean) => void`, `role?: Role` (edit mode).

### 3. PermissionMatrix (`src/components/permissions/PermissionMatrix.tsx`)

**Layout:** Grouped sections. Each group (from `PERMISSION_GROUPS`) has a heading + grid of permission checkboxes.

**Behavior:**
- Iterates over `PERMISSION_GROUPS` constant
- Each permission: styled checkbox + translated label (using `t(permission.label)`)
- Group heading shows translated group name (needs i18n key per group)
- Checked = permission ID is in the role's `permissions` array
- Toggle on click: add/remove permission ID, call `useUpdateRole` mutation
- Disabled for locked roles (opacity reduced, cursor not-allowed, no click handler)

**Props:** `role: Role`, `disabled: boolean`.

### 4. StaffRolesTable (`src/components/permissions/StaffRolesTable.tsx`)

**Layout:** Table showing all staff with their current permission role assignment.

**Columns:**
- Staff name (with avatar initial)
- Current role (colored badge with role name)
- Change role (dropdown select of all roles)

**Behavior:**
- Fetches staff list via `useStaff(firmId)` and staff-role assignments via `useStaffRoles(firmId)`
- Each row has a dropdown to change the staff member's permission role
- On change: calls `useAssignRole` mutation
- Highlights staff members who are assigned to the currently selected role

**Props:** `selectedRoleId: string`, `roles: Role[]`.

### 5. useCanAccess Hook (`src/hooks/usePermissions.ts`)

```typescript
export function useCanAccess(permission: string): boolean {
  return useAuthStore((s) => s.can(permission));
}
```

Simple wrapper for ergonomic use in components: `const canEdit = useCanAccess('clients.edit')`.

---

## Service Layer Requirements

### `src/services/roleService.ts`

Follow the exact pattern from `staffService.ts`:
- `rowToRole()` mapper (snake_case DB -> camelCase Role type)
- `roleInputToRow()` mapper (CreateRoleInput -> snake_case DB)
- `updateInputToRow()` mapper (UpdateRoleInput -> snake_case DB)
- All queries include `firm_id` filter for defense-in-depth beyond RLS
- Soft delete uses `deleted_at` timestamp
- Methods listed in "Missing Shared Code" section above

---

## Hook Requirements

### `src/hooks/useRoles.ts`

Follow the exact pattern from `useStaff.ts`:
- `roleKeys` query key factory: `all`, `lists`, `list(firmId)`, `details`, `detail(id)`
- `useRoles(firmId)` — query
- `useCreateRole()` — mutation, invalidate `roleKeys.lists()`, toast success
- `useUpdateRole()` — mutation, invalidate `roleKeys.lists()` + `roleKeys.detail(id)`, toast success. **Also invalidate permissions in auth store** when the updated role is the current user's role.
- `useDeleteRole()` — mutation, invalidate `roleKeys.lists()`, toast success
- `useStaffRoles(firmId)` — query for staff_roles data
- `useAssignRole()` — mutation to upsert staff_role, invalidate staff_roles query, toast success

---

## Auth Integration

### Changes to `src/hooks/useAuth.ts`

After `firmService.getFirmByUserId()` succeeds:
1. Call `roleService.getPermissionsForUser(session.user.id, result.firm.id)`
2. Convert the returned permission array to `Record<string, boolean>` format
3. Call `useAuthStore.getState().setPermissions(permissionsRecord)`

If no staff record or no role assignment found: permissions remain empty (default deny).

### Changes to `src/stores/useAuthStore.ts`

No structural changes needed. The existing `can(permission)` method and `permissions` field already support the required functionality. The `superAdmin` bypass in `can()` (line 76-77) should stay — users with `user_firms.role === 'superAdmin'` always have all permissions regardless of their staff_roles assignment.

---

## Route Configuration

In `src/App.tsx`, replace:
```tsx
<Route path="permissions" element={<SectionPlaceholder section="permissions" />} />
```
with:
```tsx
<Route path="permissions" element={<PermissionsView />} />
```

Add import: `import { PermissionsView } from '@/components/permissions/PermissionsView';`

The route and sidebar navigation already exist at `/permissions` with the Shield icon.

---

## i18n Keys Needed

All keys need entries in `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts`.

### Permissions UI Section (`permissions.*`)

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

### Permission Group Headers (i18n keys for `PERMISSION_GROUPS` group names)

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

### System Role Names (update existing `systemRoles.*` keys)

The existing `systemRoles.admin/editor/viewer/manager` keys and their desc variants already exist in all 3 i18n files. These are sufficient. No changes needed to the system role i18n keys.

---

## Constants Changes

### Update `SYSTEM_ROLES` in `src/lib/constants.ts`

The current `SYSTEM_ROLES` stores `{ id, label, desc, color }`. It needs to be extended with a `permissions` field and `locked: true` so the seed function can use it. The `color` field should use hex values (not Tailwind names) to match the `roles` table schema.

```typescript
export const SYSTEM_ROLES = [
  {
    id: 'admin',
    label: 'systemRoles.admin',
    desc: 'systemRoles.adminDesc',
    color: '#ef4444',
    locked: true,
    permissions: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id)),
  },
  {
    id: 'editor',
    label: 'systemRoles.editor',
    desc: 'systemRoles.editorDesc',
    color: '#3b82f6',
    locked: true,
    permissions: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id))
      .filter(p => !p.endsWith('.delete') && !p.startsWith('settings.')),
  },
  {
    id: 'viewer',
    label: 'systemRoles.viewer',
    desc: 'systemRoles.viewerDesc',
    color: '#64748b',
    locked: true,
    permissions: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id))
      .filter(p => p.endsWith('.view')),
  },
  {
    id: 'manager',
    label: 'systemRoles.manager',
    desc: 'systemRoles.managerDesc',
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

---

## Affected Files (Existing)

| File | Change | Why |
|------|--------|-----|
| `src/App.tsx` | Replace permissions placeholder route with `<PermissionsView />` import | Wire up the new component |
| `src/hooks/useAuth.ts` | Add permission loading after firm data fetch | Load permissions on login |
| `src/lib/constants.ts` | Update `SYSTEM_ROLES` to include `permissions`, `locked`, hex `color` | Seed data source for default roles |
| `src/types/role.ts` | Add `CreateRoleInput`, `UpdateRoleInput`, `StaffRoleRow` types | Service/hook type safety |
| `src/i18n/he.ts` | Add ~35 permission UI keys | Hebrew translations |
| `src/i18n/ar.ts` | Add ~35 permission UI keys | Arabic translations |
| `src/i18n/en.ts` | Add ~35 permission UI keys | English translations |
| `docs/plans/SHARED-CODE-REGISTRY.md` | Add roleService, useRoles, usePermissions entries | Keep registry up to date |

## New Files Needed

| File | Purpose |
|------|---------|
| `src/components/permissions/PermissionsView.tsx` | Main page — two-column layout |
| `src/components/permissions/RoleForm.tsx` | Create/edit role dialog |
| `src/components/permissions/PermissionMatrix.tsx` | Grouped permission checkboxes |
| `src/components/permissions/StaffRolesTable.tsx` | Staff-to-role assignment table |
| `src/services/roleService.ts` | Supabase CRUD for roles and staff_roles |
| `src/hooks/useRoles.ts` | React Query hooks for roles |
| `src/hooks/usePermissions.ts` | `useCanAccess()` wrapper hook |
| `supabase/migrations/20260318100002_create_roles.sql` | DB migration for roles + staff_roles tables |

---

## Security Considerations

1. **RLS on both tables** — `roles` and `staff_roles` must have RLS enabled with `firm_id` scoping via `user_firm_ids()`.
2. **Dual-chain RLS on staff_roles** — Both `staff_id` and `role_id` must belong to the same firm (prevents cross-firm role assignment).
3. **Locked role protection** — Application-level check: reject updates/deletes to roles where `locked = true`. Consider adding a DB-level trigger or check as defense-in-depth.
4. **superAdmin bypass** — `useAuthStore.can()` already returns `true` for `superAdmin` role. This should remain as a safety net.
5. **Subscription check** — INSERT/UPDATE/DELETE policies should include `firm_subscription_active(firm_id)`.
6. **No self-demotion guard** — Consider: should a superAdmin be able to change their own permission role? The auth tier (`user_firms.role`) is separate, so changing the permission role doesn't lock them out of auth. This is acceptable.
7. **Permission loading failure** — If the permission resolution chain fails (no staff record, no role assignment), default to empty permissions (deny all). The `superAdmin` bypass in `can()` ensures firm owners always have access.

---

## Success Criteria

- [ ] `roles` and `staff_roles` tables created with proper RLS and indexes
- [ ] 4 locked system roles seeded for new firms (and existing firms via migration)
- [ ] PermissionsView renders with two-column layout: role sidebar + permission matrix
- [ ] Custom roles can be created, edited (name/desc/color), and deleted
- [ ] Locked roles cannot be edited or deleted (UI prevents it)
- [ ] Permission checkboxes toggle individual permissions on custom roles
- [ ] Staff members can be assigned to permission roles via dropdown
- [ ] `useAuthStore.can(permission)` returns correct values based on loaded permissions
- [ ] Permissions load on login and update when roles change
- [ ] `superAdmin` (auth tier) bypasses all permission checks
- [ ] All UI text uses `t()` with keys in all 3 language files
- [ ] RTL layout works correctly
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] No console errors in the browser
