# Project Instructions for Claude

## Language & Communication
- Respond in English when discussing the project
- Use Hebrew for UI text, toast messages, and user-facing strings in the app (primary language)
- Use Arabic as secondary language for UI text
- Use English as tertiary language for UI text and for code comments and variable names
- Apply existing translation system (i18n) for any new translatable text

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

## Tech Stack
- React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Supabase (database, auth, edge functions, storage)
- Zustand (client-side state management)
- React Query / TanStack Query (server state)
- RTL (right-to-left) support required for Hebrew/Arabic UI

## Code Documentation & Timestamps
- ALWAYS add date and time stamp when updating code files, especially Edge Functions
- Use Jerusalem time (IST) for timestamps in format: YYYY-MM-DD HH:MM IST (Jerusalem)
- Add timestamps in file header comments showing:
  - CREATED: date when file was first created
  - UPDATED: date and time of last update with brief description of changes
- Example format:
  ```
  // CREATED: 2026-03-17
  // UPDATED: 2026-03-17 14:30 IST (Jerusalem)
  //          - Brief description of what changed
  ```

## Project Directory Structure

```
src/
├── components/
│   ├── dashboard/       # Dashboard views and widgets
│   ├── clients/         # Client management
│   ├── staff/           # Staff/employee management
│   ├── crm/             # CRM — contacts, interactions, tasks
│   ├── filings/         # Tax filing tracking (VAT, income tax, NII)
│   ├── billing/         # Invoicing, billing entries, hours
│   ├── documents/       # Document management and generation
│   ├── reports/         # Reports and analytics
│   ├── messaging/       # Client communication
│   ├── permissions/     # RBAC permission management
│   ├── audit/           # Audit log viewer
│   ├── backup/          # Backup and data export
│   ├── auth/            # Authentication and onboarding
│   ├── shared/          # Shared/reusable business components
│   ├── ui/              # shadcn/ui primitives
│   └── layout/          # App shell, sidebar, navigation
├── services/            # Supabase CRUD services (xService objects)
├── hooks/               # React Query hooks (useX functions)
├── types/               # TypeScript interfaces
├── stores/              # Zustand stores (useXStore)
├── i18n/                # Translation files (he.ts, ar.ts, en.ts)
├── lib/                 # Utility functions
└── integrations/
    └── supabase/        # Supabase client config
```

## i18n — Mandatory 3-Language Translation Rule

**Every** piece of user-facing text (UI labels, buttons, toast messages, placeholders, error messages, dialog titles, tooltips, select options, empty-state messages) **MUST** use the `t()` translation function — never hardcode Hebrew, Arabic, or English strings in JSX/TSX.

When adding or updating any component:
1. **Use `t('section.keyName')`** for all user-visible strings
2. **Add the key + translation** to all 3 language files:
   - `src/i18n/he.ts` — Hebrew (primary)
   - `src/i18n/ar.ts` — Arabic
   - `src/i18n/en.ts` — English
3. **Import `useLanguage`** if the component doesn't already have it:
   ```tsx
   const { t } = useLanguage();
   ```
4. **Key naming convention**: `section.descriptiveKey` (e.g., `clients.addNew`, `filings.vatReport`, `billing.invoiceTotal`)
5. **Non-React files** (utilities, services): accept a `language` parameter or a `t` function and provide translations for all 3 languages
6. **Never delete or overwrite** existing translation keys unless intentionally replacing them
7. **Verify** after adding keys: run `npx tsc --noEmit` to confirm no TypeScript errors

**Key sections**: clients, filings, billing, staff, crm, reports, messaging, permissions, audit, common, errors, auth, dashboard, documents, backup, nav

**Exceptions** (do NOT translate):
- Code examples, API endpoint paths, technical identifiers
- Content-generation templates that are intentionally in a specific language
- Phone format patterns, regex, URLs, tax ID formats

## RTL Layout Rules
- Default `dir="rtl"` for Hebrew/Arabic
- Use Tailwind logical properties: `ms-*/me-*/ps-*/pe-*/text-start/text-end`
- Force `dir="ltr"` for: phone numbers, tax IDs, code inputs, URLs
- Icon mirroring for directional icons (arrows, chevrons) in RTL
- Portal overrides with `!important` for shadcn components

## Domain-Specific Rules

### Filing Types
| Type | Hebrew | Code |
|------|--------|------|
| VAT Report | דוח מע"מ | maam |
| Tax Advances | מקדמות מס הכנסה | mekadmot |
| Income Tax Deductions | ניכויים מס הכנסה | nikuyim |
| NII Deductions | ניכויים ביטוח לאומי | nii |

### VAT & Financial Rules
- VAT rate: 18% (0.18)
- Currency: Israeli Shekel (₪ / ILS)
- Store money as integer agorot (cents) to avoid floating-point errors
- Format: `he-IL` locale for currency display

### Client Types
- `company` — חברה
- `self_employed` — עוסק מורשה
- `economic` — עוסק פטור
- `private` — פרטי

### RBAC Roles
- `superAdmin` — Full system access
- `manager` — Firm-wide management
- `staff` — Assigned client access
- `external` — Read-only limited access

## Supabase Database Conventions
- **Scoping**: Every entity table has `firm_id UUID NOT NULL REFERENCES firms(id)`
- **Soft delete**: `deleted_at TIMESTAMPTZ DEFAULT NULL` on entity tables
- **Audit log**: Immutable — `DELETE USING (false)` policy
- **Timestamps**: `created_at` and `updated_at` on all tables
- **RLS**: Required on every table, using `firm_id IN (SELECT user_firm_ids())`

## Theme System

Three themes via CSS custom properties:
- **Sky** — Light: slate/blue palette with gradient backgrounds
- **Dark** — Dark mode: zinc palette
- **Blue** — Medium: blue/indigo palette

All theme colors accessed via CSS variables (e.g., `var(--bg)`, `var(--text)`, `var(--accent)`). Never hardcode a single theme's colors directly.

## Supabase Project
- **Project ID**: TBD (will be filled when Supabase project is created)
- Use this ID for ALL Supabase MCP calls (apply_migration, execute_sql, list_tables, etc.)
- Do NOT call list_projects to discover the ID — it is defined here

## Verification Commands
- `npm run build` — build the project
- `npm run lint` — run linter
- `npx tsc --noEmit` — typecheck without emitting

---

# Git Workflow Rules (MANDATORY)

Violating these rules is considered a failure of process.

---

## 🚫 ABSOLUTE RULE: NEVER COMMIT TO `main`

- The `main` branch is **protected by policy**, regardless of repository settings.
- **No commits are ever allowed directly on `main`.**
- This includes:
  - Features
  - Bug fixes
  - Refactors
  - Formatting
  - Experiments
  - "Small quick changes"

There are **no exceptions**.

---

## 🌱 ALL WORK MUST HAPPEN IN A DEDICATED BRANCH

- Every new task **must** start from a new branch.
- Branches must be created **before** making changes.
- Branches must be created **from `main`**.

### Recommended branch naming
```
feature/<short-description>
fix/<short-description>
chore/<short-description>
refactor/<short-description>
migration/<module-name>
```

Examples:
```
feature/add-user-preferences
fix/login-null-crash
refactor/auth-service
migration/clients-module
```

---

## 🛑 SAFETY CHECK BEFORE EVERY COMMIT

Before committing **anything**, the following checks are mandatory:

1. Run:
   ```bash
   git branch --show-current
   ```

2. If the result is `main`:
   * **STOP IMMEDIATELY**
   * **DO NOT COMMIT**
   * Follow the recovery steps below

---

## 🔄 RECOVERY: IF WORK WAS DONE ON `main`

If changes were accidentally made on `main` **before committing**:

1. Create a new branch **from the current state**:
   ```bash
   git checkout -b <new-branch-name>
   ```

2. Verify:
   ```bash
   git branch --show-current
   ```
   Must NOT be `main`.

3. Only then:
   ```bash
   git commit
   ```

⚠️ Under no circumstances should the changes be committed first and moved later.

---

## ✅ WHEN A FEATURE IS READY

Once a feature is complete and ready for review:

1. **Commit the changes** on the feature branch:
   ```bash
   git status
   git commit -m "<clear, descriptive message>"
   ```

2. **Push the branch to the remote**:
   ```bash
   git push -u origin <branch-name>
   ```

3. **Create a Pull Request using GitHub CLI**:
   ```bash
   gh pr create --title "type: Short description" --body "## Summary
   - Bullet points describing changes

   🤖 Generated with [Claude Code](https://claude.com/claude-code)"
   ```
   * Base branch: `main`
   * Review changes carefully
   * Merge only through the Pull Request

All changes must reach `main` **via a Pull Request**.
Direct merges or pushes to `main` are forbidden.

---

## 🚨 CRITICAL RULE: CHECK IF THE REMOTE BRANCH WAS ALREADY MERGED

Before pushing **any new commits** to an existing remote branch:

1. Fetch latest state:
   ```bash
   git fetch origin
   ```

2. Check if the branch was already merged into `main`:
   ```bash
   git branch --remotes --merged origin/main | grep <branch-name>
   ```

3. If the branch **has been merged**:
   * **STOP**
   * **DO NOT PUSH**
   * **DO NOT CONTINUE WORK ON THIS BRANCH**

### Why this matters

Pushing new commits to a branch that was already merged:
* Breaks the Pull Request flow
* Makes rebasing or merging into `main` difficult
* Creates hidden divergence from `main`
* Risks lost or duplicated changes

Once a branch is merged, it is **closed forever**.

---

## 🔁 CORRECT ACTION IF THE BRANCH WAS MERGED

If more work is needed after a branch was merged:

1. Switch to `main`:
   ```bash
   git checkout main
   git pull
   ```

2. Create a **new branch**:
   ```bash
   git checkout -b <new-branch-name>
   ```

3. Continue work there and open a **new Pull Request**.

Never reuse merged branches.

---

## ❌ FORBIDDEN ACTIONS

The following actions are explicitly forbidden:

* `git commit` while on `main`
* `git push` directly to `main`
* Working on `main`
* Pushing to a branch that was already merged
* Reusing merged branches
* "Temporary" commits on `main`
* "I'll fix it later" logic

If unsure, **assume the action is forbidden**.

---

## 🧠 FINAL REMINDER

* `main` is sacred
* Every change lives in a branch
* Every branch ends in a Pull Request
* Every merged branch is **dead**
* Do NOT push automatically - always ask first before pushing
* Commit messages in English

If you are about to commit or push and feel even a hint of doubt:

👉 **STOP**
👉 **CHECK YOUR BRANCH**
👉 **VERIFY MERGE STATUS**

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Run `npm run build`, `npm run lint`, `npx tsc --noEmit` to verify
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Context Management
- Use `/clear` between unrelated tasks to keep context window clean
- When compacting, preserve: modified file list, table names, current branch
- Scope investigations with subagents to avoid polluting main context
