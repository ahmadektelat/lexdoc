---
name: bugfix
description: >
  Spawns a pre-configured agent team for diagnosing and fixing bugs.
  Orchestrates clarifier, architect, devil's advocate, security-auditor,
  implementer, and code-reviewer through a streamlined bugfix workflow.
argument-hint: "[bug description or error message]"
disable-model-invocation: false
allowed-tools: Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, TaskList, TaskGet, SendMessage, Read, Grep, Glob, Bash, Write, Edit, AskUserQuestion
---

# Bug Fix Team

You are the **team lead** orchestrating a bug fix workflow. The user has reported:

**Bug:** $ARGUMENTS

## Setup

**MANDATORY VERY FIRST ACTION — CREATE BRANCH:**
Before creating a team, before spawning agents, before ANYTHING:
1. Run `git checkout -b fix/<short-kebab-description>` to create a dedicated branch from `main`
2. ALL subsequent work (diagnosis, implementation, review) happens on this branch
3. Do NOT use git worktrees — they don't work correctly in this project

1. Create a branch:
   ```bash
   git checkout -b fix/<short-kebab-description>
   ```

2. Create a team named `bugfix-<short-kebab-description>`:
   ```
   TeamCreate: team_name = "bugfix-<description>"
   ```

3. Create the task list with these phases:

   **Phase 1: DIAGNOSE**
   - Task: "Reproduce bug and identify root cause" → assign to `clarifier`
   - Task: "Check if bug has security implications" → assign to `security-auditor`

   **Phase 2: PLAN FIX**
   - Task: "Plan minimal fix approach" → assign to `architect` (blocked by Phase 1)
   - Task: "Challenge the fix — is this the real root cause?" → assign to `devils-advocate` (blocked by architect)

   **Phase 3: IMPLEMENT FIX**
   - Task: "Implement the fix" → assign to `implementer` (blocked by Phase 2)

   **Phase 4: REVIEW**
   - Task: "Review the fix" → assign to `code-reviewer` (blocked by Phase 3)
   - Task: "Verify fix doesn't introduce new vulnerabilities" → assign to `security-auditor` (blocked by Phase 3)

   **Phase 5: COMPLETE**
   - Task: "Write research doc and shut down team" → self (blocked by Phase 4)

## Workflow Execution

### Phase 1: DIAGNOSE

1. Spawn `clarifier` and `security-auditor` in parallel:

   ```
   Agent: subagent_type="clarifier", team_name="<team>", name="clarifier", mode="acceptEdits"
   prompt: "Diagnose this bug: <bug description>. Trace the code path, identify symptoms vs root cause, map the blast radius. Write your diagnosis to docs/research/<team>/01-diagnosis.md. Then send the file path to the team lead."
   ```

   ```
   Agent: subagent_type="security-auditor", team_name="<team>", name="security-auditor", mode="acceptEdits"
   prompt: "Check if this bug has security implications: <bug description>. Could it be exploited? Send your assessment to the team lead."
   ```

2. Present the diagnosis + security assessment to the user

### Phase 2: PLAN FIX

1. Spawn the `architect`:
   ```
   Agent: subagent_type="architect", team_name="<team>", name="architect", mode="acceptEdits"
   prompt: "Plan a minimal fix for this bug. Read the diagnosis at docs/research/<team>/01-diagnosis.md. Focus on fixing the root cause with minimal changes. Write your fix plan to docs/research/<team>/02-fix-plan.md. Then send the file path to the team lead."
   ```

2. Spawn the `devils-advocate`:
   ```
   Agent: subagent_type="devils-advocate", team_name="<team>", name="devils-advocate", mode="acceptEdits"
   prompt: "Challenge this fix plan. Read the plan at docs/research/<team>/02-fix-plan.md. Is this really the root cause? Could the fix introduce new issues? Send your verdict to the team lead."
   ```

3. **GATE:** Iterate architect <-> devil's advocate until APPROVED

4. Present fix plan to user for approval

### Phase 3: IMPLEMENT FIX

1. Only proceed after user approves
2. Spawn the `implementer`:
   ```
   Agent: subagent_type="general-purpose", team_name="<team>", name="implementer", mode="acceptEdits"
   prompt: |
     Implement the approved fix. Read the fix plan at docs/research/<team>/02-fix-plan.md. Minimal changes only.
     Do NOT create branches — you are already on the correct branch.
     Just edit files directly.
     Run npx tsc --noEmit when done. Commit your changes with a clear message.
     Report what you changed to the team lead.
   ```

### Phase 4: REVIEW

1. Spawn review agents in parallel:
   - `code-reviewer`: review the fix
   - `security-auditor`: verify fix doesn't introduce new vulnerabilities

2. **GATE:** If any reviewer issues CHANGES REQUESTED:
   - Send feedback to implementer
   - Re-run reviews after fixes
   - Iterate until all APPROVE

3. Present review results to the user

### Phase 5: COMPLETE

1. Write summary to `docs/research/<team>/summary.md`
2. Stage and commit the research docs and agent activity logs:
   ```bash
   git add docs/research/<team>/ docs/research/agent-logs/
   git commit -m "docs: add research docs for <team>"
   ```
3. Send shutdown requests to all teammates
4. Delete the team after all agents confirm shutdown
5. Report final summary:
   - Root cause
   - Fix applied
   - Files changed
   - Security status
   - **Branch name** (from `git branch --show-current`)
6. **Ask the user** what to do next using AskUserQuestion:
   - **Create PR to main** — push and create a pull request:
     ```bash
     git push -u origin <fix-branch-name>
     gh pr create --base main --title "fix: <short description>" --body "## Summary\n- <changes>\n\nGenerated with Claude Code"
     ```
   - **Keep branch** — leave it as-is for manual review
   - **Discard** — delete the branch and its changes

## Bug Fix Principles

- **Minimal fix** — change only what's necessary to fix the root cause
- **Don't refactor** — a bugfix is not an opportunity to improve surrounding code
- **Root cause, not symptoms** — the devil's advocate specifically challenges whether the root cause is correct
- **Regression guard** — if appropriate, the implementer adds a check that prevents the bug from recurring
