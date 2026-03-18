# Feature Summary — RBAC & Permissions Module

## What Was Implemented

Full RBAC (Role-Based Access Control) & Permissions module with role management, permission matrix, and staff-role assignments.

### Architecture
- **Separated concerns**: `user_firms.role` (superAdmin/manager/staff/external) remains as the auth access tier. A new `roles` table stores granular permission role definitions with JSONB permissions. A `staff_roles` junction table maps staff to permission roles.
- **Permission loading**: On login, resolves `auth.uid() → staff → staff_roles → roles.permissions` and stores in `useAuthStore` for synchronous `can()` checks.
- **UI-level enforcement**: Permissions gate UI elements via `can()`. RLS-level enforcement deferred to later phase.

### Database
- `roles` table: id, firm_id, name, description, color, locked, permissions (JSONB), soft delete
- `staff_roles` junction table: staff_id (UNIQUE), role_id — one permission role per staff member
- 4 locked system roles seeded per firm: admin, editor, viewer, manager
- RLS policies with superAdmin/manager auth tier restriction on write operations
- `get_user_permissions(firm_id)` SECURITY DEFINER function using `auth.uid()` internally
- `prevent_locked_role_mutation` trigger for DB-level defense-in-depth
- `seed_default_roles(firm_id)` with REVOKE ALL FROM PUBLIC + idempotency guard

### UI Components
- **PermissionsView** — Two-column layout: role sidebar + permission matrix + staff table
- **RoleForm** — Dialog for creating/editing custom roles (name, description, color)
- **PermissionMatrix** — Grouped checkbox grid for 27 permissions across 9 categories
- **StaffRolesTable** — Table of staff with role assignment dropdown

### Service Layer
- `roleService` — Full CRUD: list, getById, create, update, delete (soft), getStaffRoles, assignRole, removeRole, getPermissionsForUser
- Application-level locked role protection (defense-in-depth with DB trigger)

### Hooks
- `useRoles`, `useCreateRole`, `useUpdateRole`, `useDeleteRole` — React Query for role CRUD
- `useStaffRoles`, `useAssignRole`, `useRemoveRole` — React Query for staff-role assignments
- `useCanAccess(permission)` — Wrapper hook for permission checks in components

### Auth Integration
- Permission loading added to login flow in `useAuth.ts`
- Failure defaults to empty permissions (deny all); `superAdmin` bypass ensures firm owners are never locked out

## Files Changed

### New (8 files)
- `supabase/migrations/20260318100002_create_roles.sql`
- `src/services/roleService.ts`
- `src/hooks/useRoles.ts`
- `src/hooks/usePermissions.ts`
- `src/components/permissions/PermissionsView.tsx`
- `src/components/permissions/RoleForm.tsx`
- `src/components/permissions/PermissionMatrix.tsx`
- `src/components/permissions/StaffRolesTable.tsx`

### Modified (8 files)
- `src/types/role.ts` — Renamed desc→description, added CreateRoleInput/UpdateRoleInput/StaffRoleRow
- `src/lib/constants.ts` — Updated SYSTEM_ROLES with permissions, locked, hex colors
- `src/hooks/useAuth.ts` — Added permission loading on login
- `src/App.tsx` — Replaced permissions placeholder route
- `src/i18n/he.ts` — 36 new permission UI keys
- `src/i18n/ar.ts` — 36 new permission UI keys
- `src/i18n/en.ts` — 36 new permission UI keys
- `docs/plans/SHARED-CODE-REGISTRY.md` — Updated registry

## Review Status
- Code Review: APPROVED
- Devil's Advocate: APPROVED (after 1 round of fixes)
- Security Audit: APPROVED (0 critical issues in final code)

## Security Hardening Applied
- `get_user_permissions()` uses `auth.uid()` internally (no arbitrary user_id parameter)
- `seed_default_roles()` REVOKE ALL FROM PUBLIC + idempotency guard
- Write RLS policies restricted to superAdmin/manager auth tier
- `staff_roles_update` has USING + WITH CHECK for cross-tenant protection
- `prevent_locked_role_mutation` trigger prevents UPDATE/DELETE on locked roles AND setting locked=true
- Dual-chain validation on staff_roles (both staff_id and role_id must belong to caller's firm)

## Branch
`migration/permissions-module`

## Commits
1. `36e15c7` — feat: implement RBAC & permissions module (16 files, 1457 insertions)
2. `c611836` — fix: address review feedback — useEffect auto-select, role removal toast, optimistic permission toggles
