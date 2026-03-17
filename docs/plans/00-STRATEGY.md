# LexDoc Migration Strategy

## Overview

Migrate the legacy single-file HTML app (~4700 lines, 46+ components) into a proper React 18 + TypeScript + Vite + Supabase project. Migration is done **one module at a time**, sequentially, to prevent code duplication.

## Anti-Duplication Rules

### The Problem
When agent teams work independently, they create their own utility functions, types, and patterns. This leads to:
- 3 different `formatMoney()` implementations
- Duplicate type definitions
- Inconsistent patterns across modules

### The Solution: Shared Foundation First

**Phase 1 creates ALL shared code** before any module migration begins:
- All TypeScript interfaces (`src/types/`)
- All utility functions (`src/lib/`)
- All domain constants (`src/lib/constants.ts`)
- All shared UI components (`src/components/shared/`)
- Base service patterns (`src/services/`)

**Every subsequent phase's `/feature` prompt explicitly:**
1. Lists what shared code already exists
2. Instructs agents to `import from` shared modules — never recreate
3. References the `SHARED-CODE-REGISTRY.md` file

### Enforcement Mechanism

After Phase 1, add this rule to `.claude/CLAUDE.md`:

```
## Shared Code Rule (MANDATORY)

Before creating ANY utility function, type, constant, or shared component:
1. Check `docs/plans/SHARED-CODE-REGISTRY.md` for existing shared code
2. Check `src/lib/`, `src/types/`, `src/components/shared/` for existing implementations
3. If it exists — IMPORT IT. Do not create a local copy.
4. If it doesn't exist — create it in the shared location, not locally.

Shared locations:
- Types → `src/types/`
- Utilities → `src/lib/`
- Constants → `src/lib/constants.ts`
- Shared components → `src/components/shared/`
- Services → `src/services/`
- Hooks → `src/hooks/`
```

## Migration Order

| # | Phase | Branch | Depends On | Creates |
|---|-------|--------|------------|---------|
| 1 | Shared Foundation | `migration/shared-foundation` | Scaffold | Types, utils, constants, shared components |
| 2 | Auth & Onboarding | `migration/auth-module` | Phase 1 | Auth flow, protected routes |
| 3 | Clients | `migration/clients-module` | Phase 1, 2 | Client CRUD, detail view |
| 4 | Staff Management | `migration/staff-module` | Phase 1, 2 | Staff CRUD, role assignment |
| 5 | RBAC & Permissions | `migration/permissions-module` | Phase 4 | Permission system, role management |
| 6 | CRM | `migration/crm-module` | Phase 3, 4 | Contacts, interactions, tasks |
| 7 | Tax Filings | `migration/filings-module` | Phase 3, 4 | Filing schedule, auto-tasks |
| 8 | Billing & Invoicing | `migration/billing-module` | Phase 3, 4 | Hours, billing, invoices |
| 9 | Document Management | `migration/documents-module` | Phase 3 | Folders, docs, generation |
| 10 | Messaging | `migration/messaging-module` | Phase 3 | Templates, sending, scheduling |
| 11 | Dashboard | `migration/dashboard-module` | Phase 3-10 | Aggregated widgets |
| 12 | Reports | `migration/reports-module` | Phase 3-8 | Analytics, exports |
| 13 | Audit Log | `migration/audit-module` | Phase 2 | Activity viewer |
| 14 | Backup & Import/Export | `migration/backup-module` | Phase 3 | Backup, restore, CSV/Excel import |

## How to Run Each Phase

1. Read the plan file: `docs/plans/XX-module-name.md`
2. Copy the `/feature` prompt from the plan
3. Run it in a new Claude Code session with `--dangerously-skip-permissions`
4. After completion, merge the PR to main
5. Update `docs/plans/SHARED-CODE-REGISTRY.md` with any new shared code
6. Proceed to the next phase

## Post-Phase Checklist

After each phase is merged:
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] New shared code documented in SHARED-CODE-REGISTRY.md
- [ ] PR merged to main
- [ ] Branch deleted
