# Staff Management

Staff management module: CRUD for firm employees, staff picker component, and client-staff assignment.

**Branch:** `migration/staff-module`
**Prerequisites:** Phase 3 (Clients) merged to main

## Context

- Read legacy-app.html lines 1769-1902 for the StaffView component reference.
- Read the STAFF data structure and role options.
- Staff are assigned to clients via a CLIENT_STAFF mapping.
- firm_id scoping on ALL queries.
- Hebrew primary — all strings use t().
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code, DO NOT recreate.

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { Staff, StaffRole, CreateStaffInput } from '@/types'`
- Constants: `import { STAFF_ROLES } from '@/lib/constants'`
- Utils: `import { formatDate } from '@/lib/dates'`
- Components: `import { PageHeader, DataTable, EmptyState, LoadingSpinner, FormField, ConfirmDialog, StatusBadge } from '@/components/shared'`
- Auth: `import { useAuthStore } from '@/stores/useAuthStore'`

## Features to Implement

1. **StaffView** (`src/components/staff/StaffView.tsx`) — Staff list:
   - PageHeader "צוות" with "הוספת עובד" button
   - DataTable: name, role (badge with STAFF_ROLES label), total hours, active clients count, tasks count, actions (edit/delete)
   - Delete only for non-partner roles
   - Click to select staff → show StaffTasksPanel

2. **StaffForm** (`src/components/staff/StaffForm.tsx`) — Modal:
   - name (required), role (select from STAFF_ROLES)
   - Edit mode: pre-fill fields
   - Create mode: add new staff member

3. **StaffPicker** (`src/components/staff/StaffPicker.tsx`) — Reusable dropdown (used by other modules later):
   - Select component listing active staff
   - Props: value, onChange, firmId, placeholder?
   - Shows staff name and role

4. **StaffTasksPanel** (`src/components/staff/StaffTasksPanel.tsx`) — Panel showing tasks for selected staff:
   - Tabs: Open, Done, All
   - Metrics: open count, overdue count, done count
   - Task cards: title, due date, priority (PriorityBadge), client name, auto indicator
   - Completion toggle checkbox (mark done/undone)
   - Note: tasks come from Phase 6 — for now show placeholder or query tasks table if it exists

5. **Services**:
   - `src/services/staffService.ts`: list(firmId), getById(id), create, update, delete
   - `src/services/clientStaffService.ts`: assignStaff(clientId, staffId), getAssignment(clientId), removeAssignment(clientId)

6. **Hooks** — `src/hooks/useStaff.ts`:
   - staffKeys factory
   - useStaff(firmId) — list query
   - useStaffMember(id) — single query
   - useCreateStaff, useUpdateStaff, useDeleteStaff mutations

7. **Database migration**:
   - Create `staff` table (firm_id, user_id, name, role, is_active, deleted_at, timestamps)
   - Create `client_staff` table (client_id, staff_id — junction)
   - RLS policies, indexes, GRANTs

8. **Route** — Add /staff route

9. **i18n** — Add i18n keys (staff.* section) to all 3 language files.
