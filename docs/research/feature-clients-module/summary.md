# Feature Summary — Clients Module

## What Was Implemented

Full client management module: list view with search/filter, create/edit form, detail view with tabbed layout, and supporting service/hook/database layers.

## User Decisions

1. **Mobile responsiveness** — Separate card layout on mobile (ClientCard component)
2. **Case number generation** — Per-firm Postgres DB function with advisory lock (YYYY-###)
3. **Type fields** — Keep both `type` and `clientType` as separate fields (Phase 1 decision)
4. **Data fetching** — Client-side filtering and pagination (fetch all, use DataTable built-ins)
5. **Placeholder tabs** — EmptyState placeholders (clickable tabs with EmptyState content)
6. **Subscription enforcement** — Added `firm_subscription_active()` to INSERT/UPDATE/DELETE RLS policies
7. **Security fixes** — Replaced moddatetime with existing `update_updated_at()`, added defense-in-depth firm_id filtering

## Files Created (10)

- `supabase/migrations/20260318100000_create_clients.sql` — DB migration (table, indexes, RLS with subscription check, GRANTs, case number function with advisory lock, triggers)
- `src/services/clientService.ts` — CRUD service with snake_case/camelCase mapping, firm_id defense-in-depth
- `src/hooks/useClients.ts` — 7 React Query hooks with query key factory and cache invalidation
- `src/components/clients/ClientTypePicker.tsx` — Horizontal type filter buttons
- `src/components/clients/ClientCard.tsx` — Mobile card layout
- `src/components/clients/ClientForm.tsx` — Create/edit dialog with validation
- `src/components/clients/ClientHeader.tsx` — Detail page header with avatar, badges, tags
- `src/components/clients/ClientTabs.tsx` — 4 placeholder tabs (Documents, Filings, Tasks, Activity)
- `src/components/clients/ClientsView.tsx` — Main list page with DataTable (desktop) + ClientCard (mobile)
- `src/components/clients/ClientDetailView.tsx` — Detail page with header, action buttons, tabs

## Files Modified (5)

- `src/types/client.ts` — Updated CreateClientInput (omit caseNum, status) and UpdateClientInput (omit caseNum, deleted_at)
- `src/App.tsx` — Replaced clients placeholder route with ClientsView and ClientDetailView routes
- `src/i18n/he.ts` — Added ~40 new clients.* keys
- `src/i18n/ar.ts` — Added ~40 new clients.* keys
- `src/i18n/en.ts` — Added ~40 new clients.* keys

## Review Results

| Reviewer | Verdict |
|----------|---------|
| Code Reviewer | APPROVED |
| Devil's Advocate (design) | APPROVED (after 1 revision) |
| Devil's Advocate (implementation) | APPROVED |
| Security Auditor (design) | CONDITIONAL PASS → fixes applied |
| Security Auditor (implementation) | CONDITIONAL PASS → fixes applied |

## Key Architecture Decisions

- **Client-side filtering** — All firm clients fetched in one query, filtered/sorted/paginated via DataTable built-ins. Suitable for typical firm sizes (50-300 clients).
- **Per-firm case numbers** — Postgres function with `pg_advisory_xact_lock` prevents race conditions. Each firm has independent YYYY-### numbering.
- **Defense-in-depth** — RLS enforces firm isolation at DB level. Service layer adds redundant firm_id filtering for belt-and-suspenders security.
- **Subscription gating** — Write operations (INSERT/UPDATE/DELETE) gated by `firm_subscription_active()`. Read (SELECT) remains open so expired firms can view data.

## Known Deferred Items

- Assigned staff display — deferred until staff module (TODO comments in code)
- Tab content (Documents, Filings, Tasks, Activity) — placeholder EmptyState only
- Action buttons (Hours, Invoices, etc.) — disabled with tooltips
- RBAC-granular RLS — current policies use firm membership only, not role-based

## Branch

`migration/clients-module`
