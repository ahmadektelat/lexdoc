# Audit Log Module

Immutable activity viewer and audit logging service for all modules.

**Branch:** `migration/audit-module`
**Prerequisites:** Phase 2 (Auth) merged to main

## Context

- Read legacy-app.html ACTIVITY data structure
- Audit entries are IMMUTABLE — no edit, no delete, ever
- DB policy: DELETE USING (false), UPDATE USING (false)
- Each entry: userId, userName, action, target, timestamp, entityType, entityId
- firm_id scoping on ALL queries
- Hebrew primary — all strings use t()
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { AuditEntry } from '@/types'`
- Utils: `import { formatDate, formatDateTime } from '@/lib/dates'`
- Components: `import { PageHeader, DataTable, EmptyState, LoadingSpinner, SearchInput } from '@/components/shared'`

## Features to Implement

1. **AuditView** — Audit log viewer:
   - Table: timestamp (formatDateTime), user, action, target, entity type
   - Search/filter by: user, action type, date range, entity type
   - Immutable — NO edit/delete buttons anywhere
   - Pagination (cursor-based for performance)
   - Color-coded action types

2. **auditService** — Append-only:
   - log(entry): insert audit entry (the ONLY write operation)
   - list(firmId, filters): read with pagination
   - getByEntity(entityType, entityId): get audit trail for specific entity
   - NO update, NO delete methods — this is intentional

3. **useAuditLog hook** — Helper for other modules:
   - `logAction(action, target?, entityType?, entityId?)` — convenience wrapper
   - Pre-fills userId, userName, timestamp from useAuthStore
   - Used by other modules: clientService, billingService, etc.
   - Fire-and-forget (don't await, don't block UI)

4. **Database migration**:
   - `audit_log` table (firm_id, user_id, user_name, action TEXT, target TEXT, entity_type, entity_id, ip_address, created_at)
   - NO updated_at, NO deleted_at columns
   - RLS: SELECT for firm members, INSERT for firm members, UPDATE USING (false), DELETE USING (false)
   - Index on (firm_id, created_at DESC) for efficient pagination
   - GRANT SELECT, INSERT ON audit_log TO authenticated (NO UPDATE, NO DELETE)

5. **Wire into ClientView** — Replace activity tab placeholder with audit trail filtered to client

6. **Route** — Add /audit route

7. Add i18n keys (audit.* section) to all 3 language files.

### Files to Create

- `src/components/audit/AuditView.tsx` — Audit log viewer
- `src/services/auditService.ts` — Audit log service (append-only)
- `src/hooks/useAudit.ts` — React Query hooks
- `src/hooks/useAuditLog.ts` — Helper hook for logging actions from any module
- Database migration for `audit_log` table (immutable — no delete, no update)
