---
name: quickfix
description: >
  Lightweight bug fix for small UI/DB issues.
  Uses project skills from .claude/skills/ for conventions and patterns.
  Lean team (devils-advocate, implementer, code-reviewer) — no clarifier,
  no architect, no iterative gates.
argument-hint: "[bug description]"
disable-model-invocation: false
allowed-tools: Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, TaskList, TaskGet, SendMessage, Read, Grep, Glob, Bash, Write, Edit, AskUserQuestion
---

# Quick Fix Team

You are the **team lead** for a lightweight bug fix. The user has reported:

**Bug:** $ARGUMENTS

## Principles

- **Small scope only** — this workflow is for bugs needing 1-3 file changes
- **No over-engineering** — fix the bug, nothing more
- **Use project skills for patterns** — read relevant `.claude/skills/` files to understand codebase conventions and structure

## Skill File Reference

Read the relevant skill files BEFORE exploring the bug — they tell you where things are and how they're structured:

| Area | Skill file path |
|------|----------------|
| DB migrations | `.claude/skills/database/rules/migration-patterns.md` |
| RLS policies | `.claude/skills/database/rules/rls-policies.md` |
| Edge functions | `.claude/skills/database/rules/edge-functions.md` |
| UI components | `.claude/skills/architecture/rules/component-patterns.md` |
| Services | `.claude/skills/architecture/rules/service-layer.md` |
| React Query hooks | `.claude/skills/architecture/rules/react-query-hooks.md` |
| Zustand stores | `.claude/skills/architecture/rules/zustand-stores.md` |
| Type definitions | `.claude/skills/architecture/rules/type-definitions.md` |
| Translations | `.claude/skills/i18n-rtl/rules/translation-workflow.md` |
| RTL layout | `.claude/skills/i18n-rtl/rules/rtl-layout.md` |
| Filing logic | `.claude/skills/domain/rules/filing-logic.md` |
| Financial calcs | `.claude/skills/domain/rules/financial-calculations.md` |
| RBAC model | `.claude/skills/domain/rules/rbac-model.md` |

## Setup

**MANDATORY VERY FIRST ACTION — CREATE BRANCH:**
Before creating a team, before reading files, before ANYTHING:
1. Run `git checkout -b fix/<short-kebab-description>` to create a dedicated branch from `main`
2. ALL subsequent work (exploration, implementation, review) happens on this branch
3. Do NOT use git worktrees — they don't work correctly in this project

1. Create a branch:
   ```bash
   git checkout -b fix/<short-kebab-description>
   ```

2. Create a team:
   ```
   TeamCreate: team_name = "quickfix-<short-kebab-description>"
   ```

3. Create tasks:

   **Phase 1: EXPLORE & PLAN** (self)
   - Task: "Explore bug and write fix plan"

   **Phase 2: REVIEW PLAN**
   - Task: "Review fix plan for best practices and security" → assign to `devils-advocate` (blocked by Phase 1)

   **Phase 3: IMPLEMENT**
   - Task: "Implement the fix" → assign to `implementer` (blocked by Phase 2)

   **Phase 4: REVIEW CODE**
   - Task: "Review the implementation" → assign to `code-reviewer` (blocked by Phase 3)

   **Phase 5: WRAP UP** (self)
   - Task: "Shut down team and summarize" (blocked by Phase 4)

## Workflow

### Phase 1: EXPLORE & PLAN (You — team lead)

**MANDATORY FIRST ACTION — READ PROJECT SKILLS:**
Before exploring the bug, you MUST read the relevant project skill files to understand the codebase structure. Parse the user's bug description to determine which area is affected, then read the corresponding skill files. For example:
- Bug mentions "preview", "component", "UI", "tab" → read `.claude/skills/architecture/rules/component-patterns.md`
- Bug mentions "template", "campaign" → read `.claude/skills/architecture/rules/component-patterns.md`
- Bug mentions "database", "query", "migration" → read `.claude/skills/database/rules/migration-patterns.md`
- Bug mentions "translation", "text", "i18n" → read `.claude/skills/i18n-rtl/rules/translation-workflow.md`

If unsure, read `.claude/skills/architecture/rules/component-patterns.md` — it covers the directory structure.

1. **FIRST:** Read the relevant project skill files using the Read tool
2. Explore the bug using Read, Grep, Glob — **narrow your search to the specific section the user mentions before searching broadly**.
3. Determine which areas the fix touches (DB? UI? services?) and note the relevant skill file paths
4. **CLARIFY WITH USER (when needed):** After exploring, if ANY of these are true:
   - Multiple possible root causes were found
   - Multiple valid fix approaches exist
   - The fix involves trade-offs (e.g. quick patch vs. proper refactor)
   - The intended behavior is ambiguous
   - You're unsure what the user expects the correct behavior to be

   Then use `AskUserQuestion` to present your findings and ask the user which direction to take **BEFORE** writing the plan. Include what you found, the options, and your recommendation.

   If the root cause and fix are obvious and unambiguous, skip to the next step.

5. Write a fix plan to `docs/research/<team>/01-plan.md` covering:
   - Root cause (1-2 sentences)
   - Files to change (with line numbers)
   - What to change in each file
   - Any SQL migrations needed
   - i18n keys to add (if any)
   - **List of relevant skill file paths** for agents to read
6. Present the plan to the user for approval
7. **GATE:** Do not proceed until user approves

### Phase 2: REVIEW PLAN (Single `devils-advocate` agent)

Spawn one agent to review your plan. Include the relevant skill file paths:

```
Agent: subagent_type="devils-advocate", team_name="<team>", name="devils-advocate", mode="acceptEdits"
prompt: |
  You are reviewing a bug fix plan. Read the plan at docs/research/<team>/01-plan.md.
  Also read these project convention files:
  <list relevant skill file paths from Phase 1>

  Review checklist:
  1. Does the fix target the root cause, not symptoms?
  2. Security: RLS policies, SQL injection, input validation
  3. i18n: all user-facing strings use t() with 3 language files
  4. Do the changes follow the patterns in the skill files you read?
  5. Any edge cases or regressions this could introduce?

  Respond with APPROVE or REQUEST CHANGES (with specific feedback).
  Send your verdict to the team lead.
```

- If APPROVED → proceed to Phase 3
- If CHANGES REQUESTED → revise once, then proceed

### Phase 3: IMPLEMENT (`implementer` agent)

1. Only proceed after user has approved the plan
2. Spawn the implementer:

```
Agent: subagent_type="general-purpose", team_name="<team>", name="implementer", mode="acceptEdits"
prompt: |
  Implement the approved bug fix. Read the plan at docs/research/<team>/01-plan.md.
  Also read these project convention files:
  <list relevant skill file paths from Phase 1>

  Follow the patterns defined in those files exactly.

  Do NOT create branches — you are already on the correct branch.
  Just edit files directly.

  Rules:
  - Change only the files specified in the plan
  - Add timestamp headers to modified files (Jerusalem time IST)
  - All user-facing strings must use t() with keys in he.ts, ar.ts, en.ts
  - Theme: 3 themes via CSS variables (sky/dark/blue) — never hardcode single palette
  - RTL support: use logical properties (ms/me, ps/pe)
  - Run `npx tsc --noEmit` when done to verify no type errors
  - Commit your changes with a clear message
  - Report what you changed to the team lead
```

### Phase 4: REVIEW CODE (`code-reviewer` agent)

Spawn the code reviewer:

```
Agent: subagent_type="general-purpose", team_name="<team>", name="code-reviewer", mode="acceptEdits"
prompt: |
  Review this bug fix implementation. Read the plan at docs/research/<team>/01-plan.md.
  Also read these project convention files:
  <list relevant skill file paths from Phase 1>

  Review for:
  1. Does the implementation match the approved plan?
  2. Do the changes follow the patterns in the skill files you read?
  3. i18n completeness (all 3 language files updated)
  4. Timestamp headers present
  5. No security issues introduced (RLS, injection, XSS)
  6. No unnecessary changes beyond the fix

  Respond with APPROVE or REQUEST CHANGES.
  Send your verdict to the team lead.
```

- If APPROVED → proceed to Phase 5
- If CHANGES REQUESTED → send to implementer, one revision max

### Phase 5: WRAP UP

1. Stage and commit the research docs and agent activity logs:
   ```bash
   git add docs/research/<team>/ docs/research/agent-logs/
   git commit -m "docs: add research docs for <team>"
   ```
2. Send shutdown requests to all agents
3. Delete the team
4. Report to user:
   - Root cause
   - Fix applied
   - Files changed
   - Review status
   - **Branch name** (from `git branch --show-current`)
5. **Ask the user** what to do next using AskUserQuestion:
   - **Create PR to main** — push and create a pull request:
     ```bash
     git push -u origin <fix-branch-name>
     gh pr create --base main --title "fix: <short description>" --body "## Summary\n- <changes>\n\nGenerated with Claude Code"
     ```
   - **Keep branch** — leave it as-is for manual review
   - **Discard** — delete the branch and its changes
