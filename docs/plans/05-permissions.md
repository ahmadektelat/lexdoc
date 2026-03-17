# RBAC & Permissions

RBAC & permissions module: Role management, permission matrix, and staff-role assignments.

**Branch:** `migration/permissions-module`
**Prerequisites:** Phase 4 (Staff) merged to main

## Context

- Read legacy-app.html lines 2998-3122 for the PermissionsView reference.
- Read the ROLES, PERMISSIONS, and STAFF_ROLES data structures.
- 4 system roles (admin, editor, viewer, manager) are locked — cannot edit.
- Custom roles can be created with selected permissions.
- Permissions are grouped by category.
- firm_id scoping on ALL queries.
- Hebrew primary — all strings use t().
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code, DO NOT recreate.

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { Role, Permission, StaffRoleAssignment } from '@/types'`
- Constants: `import { SYSTEM_ROLES } from '@/lib/constants'`
- Components: `import { PageHeader, DataTable, FormField, ConfirmDialog, StatusBadge, EmptyState } from '@/components/shared'`
- Staff hooks: `import { useStaff } from '@/hooks/useStaff'`
- Auth: `import { useAuthStore } from '@/stores/useAuthStore'`

## Features to Implement

1. **PermissionsView** (`src/components/permissions/PermissionsView.tsx`) — Two-column layout:
   - Left sidebar: list of roles with color indicators, "הוספת תפקיד" button
   - Selected role shows lock icon if system role (amber "נעול" badge)
   - Right panel: PermissionMatrix for selected role

2. **RoleForm** (`src/components/permissions/RoleForm.tsx`) — Modal:
   - name (required), description, color picker (hex)
   - Cannot edit locked/system roles

3. **PermissionMatrix** (`src/components/permissions/PermissionMatrix.tsx`) — Grouped checkboxes:
   - Group permissions by category (client management, filings, billing, staff, reports, etc.)
   - Each permission: checkbox + label
   - Disabled for locked roles
   - Toggle permission on/off for the role

4. **StaffRolesTable** (`src/components/permissions/StaffRolesTable.tsx`) — Below the permission matrix:
   - Table: staff name, current role (dropdown to change)
   - Change role assignment via dropdown
   - Shows role color badge

5. **Permission hook** — `src/hooks/usePermissions.ts`:
   - `useCanAccess(permission: string): boolean` — checks current user's role permissions
   - Used by all modules to conditionally show/hide UI elements

6. **Update useAuthStore**:
   - On login: load user's role and permissions from DB
   - `can(permission)` method uses loaded permissions
   - `hasRole(role)` checks hierarchy

7. **Services** — `src/services/roleService.ts`:
   - listRoles(firmId), getRole(id), createRole, updateRole, deleteRole
   - getStaffRoles(firmId), assignRole(staffId, roleId)
   - getPermissionsForRole(roleId)

8. **Database migration**:
   - Create `roles` table (firm_id, name, desc, color, locked, permissions JSONB)
   - Create `staff_roles` table (staff_id, role_id — junction with UNIQUE)
   - Seed system roles (admin, editor, viewer, manager)
   - RLS policies, indexes

9. **Route** — Add /permissions route

10. **i18n** — Add i18n keys (permissions.* section) to all 3 language files.
