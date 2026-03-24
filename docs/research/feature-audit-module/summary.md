# Audit Module — Feature Summary

## Branch
`feature/audit-module`

## What was implemented

Immutable audit log module with full-page viewer, fire-and-forget logging hook, and client activity tab integration.

### Files Created (7)
| File | Purpose |
|------|---------|
| `supabase/migrations/20260325100000_create_audit_log.sql` | Immutable audit_log table, 4 indexes, RLS (UPDATE/DELETE blocked), GRANTs (SELECT+INSERT only) |
| `src/services/auditService.ts` | Append-only service: `log()`, `list()` (cursor-based pagination), `getByEntity()` |
| `src/hooks/useAudit.ts` | React Query read hooks: `useAuditEntries()`, `useAuditByEntity()` with query key factory |
| `src/hooks/useAuditLog.ts` | Fire-and-forget write hook: `useAuditLog()` returning `logAction()` |
| `src/components/audit/auditConstants.ts` | Shared ACTION_COLORS, AUDIT_ACTIONS, ENTITY_TYPES constants |
| `src/components/audit/AuditEntityPanel.tsx` | Entity-scoped audit panel (used in ClientTabs activity tab) |
| `src/components/audit/AuditView.tsx` | Full-page audit log viewer at `/audit` with permission check, filters, load more |

### Files Modified (5)
| File | Change |
|------|--------|
| `src/App.tsx` | Replaced `SectionPlaceholder` with `AuditView` for `/audit` route |
| `src/components/clients/ClientTabs.tsx` | Replaced activity tab placeholder with `AuditEntityPanel` |
| `src/i18n/he.ts` | Added 31+ `audit.*` translation keys |
| `src/i18n/ar.ts` | Added 31+ `audit.*` translation keys |
| `src/i18n/en.ts` | Added 31+ `audit.*` translation keys |

## Key Design Decisions

1. **Pagination**: Option A — DataTable client-side pagination with "load more" (500-entry batches)
2. **Immutability**: Defense-in-depth at 3 layers — no service methods, RLS USING(false), no UPDATE/DELETE GRANTs
3. **INSERT RLS**: Requires `user_id = auth.uid()` to prevent audit log spoofing
4. **Search sanitization**: Allowlist regex (Hebrew/Arabic/English/numbers/spaces/hyphens only)
5. **Select filters**: Use `'all'` sentinel value (Radix Select requires non-empty values)
6. **Load-more state**: Uses `useRef` flag to avoid stale closure in useEffect
7. **Fire-and-forget**: `mutation.mutate()` (not `mutateAsync`), no toasts, no query invalidation

## Review Results

| Reviewer | Verdict | Issues |
|----------|---------|--------|
| Devil's Advocate (design) | APPROVED | 3 issues fixed before approval (PostgREST injection, stale closure, Radix Select) |
| Security Auditor (design) | PASS | 4 medium findings addressed (user_id validation, allowlist sanitization) |
| Code Reviewer | APPROVED | 0 blocking issues, 2 non-blocking suggestions |
| Devil's Advocate (code) | APPROVED | 3 non-blocking warnings (Strict Mode double-effect, effect ordering, missing sortingFn) |
| Security Auditor (code) | PASS | 0 critical, 0 warning, 3 info items |

## Deferred Items
- Rate limiting on audit log inserts
- Server-side `user_name` resolution (currently client-provided)
- `ip_address` capture via edge function (column exists but always NULL)
- Date range filter (users browse via cursor pagination)
- User dropdown filter (search input covers user name lookup)

## Verification
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
