# Staff Module — Implementation Summary

## Overview
Implemented the Staff Management module for LexDoc: CRUD for firm employees, reusable StaffPicker component, client-staff assignment via many-to-many junction table, and StaffTasksPanel UI shell.

## Branch
`migration/staff-module` (2 commits)

## Files Changed (18 files)

### Created
| File | Description |
|------|-------------|
| `supabase/migrations/20260318100001_create_staff.sql` | Staff table, client_staff junction, set_primary_staff RPC, data migration, RLS, indexes, GRANTs |
| `src/services/staffService.ts` | CRUD service with firm_id defense-in-depth, soft delete |
| `src/services/clientStaffService.ts` | Junction table service (assignments, setPrimary via RPC) |
| `src/hooks/useStaff.ts` | React Query hooks for staff CRUD |
| `src/hooks/useClientStaff.ts` | React Query hooks for client-staff assignments |
| `src/hooks/useIsMobile.ts` | Shared responsive hook (extracted from ClientsView) |
| `src/components/staff/StaffView.tsx` | Main staff list page with DataTable + mobile cards |
| `src/components/staff/StaffForm.tsx` | Create/edit staff dialog |
| `src/components/staff/StaffCard.tsx` | Mobile card component |
| `src/components/staff/StaffPicker.tsx` | Reusable staff dropdown selector |
| `src/components/staff/StaffTasksPanel.tsx` | Tasks panel UI shell (empty state, ready for Phase 6) |

### Modified
| File | Change |
|------|--------|
| `src/types/staff.ts` | Added `ClientStaffAssignment` interface (camelCase) |
| `src/types/client.ts` | Removed `assignedStaffId` field |
| `src/services/clientService.ts` | Removed `assignedStaffId` from row mappings |
| `src/components/clients/ClientsView.tsx` | Import shared `useIsMobile` hook |
| `src/components/clients/ClientHeader.tsx` | Updated stale TODO to reference junction table |
| `src/i18n/he.ts`, `ar.ts`, `en.ts` | Added 23+ staff translation keys each |
| `src/App.tsx` | Replaced staff placeholder with `StaffView` |

## Key Design Decisions
1. **Soft delete** — `deleted_at` convention, consistent with codebase
2. **Junction table** — `client_staff` with `is_primary` flag (many-to-many)
3. **Migrated `assigned_staff_id`** — Dropped column, data moved to junction table
4. **Atomic setPrimary** — Database RPC with `SECURITY INVOKER` (no race conditions)
5. **Dual-chain RLS** — `client_staff` policies validate both `client_id` AND `staff_id` firm ownership
6. **StaffTasksPanel** — UI shell with empty state (Phase 6 wires it up)

## Review Results
- Code review: APPROVED (after fixes)
- Devil's advocate: APPROVED (after fixes)
- Security audit: PASS (0 critical issues)

## Known Tech Debt
- `ActiveClientsCell` triggers N+1 queries (one per staff member) — optimize with bulk query later
- `user_id` field on Staff type uses snake_case (pre-existing inconsistency)
- `StaffPicker` has no "clear selection" option
- RBAC enforcement deferred to Phase 8

## Verification
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
- `npm run lint` — PASS (no new issues)
