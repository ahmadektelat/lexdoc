---
name: feature
description: >
  Spawns a pre-configured agent team for implementing a new feature.
  Orchestrates clarifier, architect, devil's advocate, security-auditor,
  implementer, and code-reviewer through a phased workflow.
argument-hint: "[feature description]"
disable-model-invocation: true
allowed-tools: Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, TaskList, TaskGet, SendMessage, Read, Grep, Glob, Bash, Write, Edit, AskUserQuestion
---

# Feature Development Team

You are the **team lead** orchestrating a feature development workflow. The user has requested:

**Feature:** $ARGUMENTS

## Setup

**MANDATORY VERY FIRST ACTION — CREATE BRANCH:**
Before creating a team, before spawning agents, before ANYTHING:
1. Run `git checkout -b feature/<short-kebab-description>` to create a dedicated branch from `main`
2. ALL subsequent work (clarification, design, implementation, review) happens on this branch
3. Do NOT use git worktrees — they don't work correctly in this project

1. Create a branch:
   ```bash
   git checkout -b feature/<short-kebab-description>
   ```

2. Create a team named `feature-<short-kebab-description>`:
   ```
   TeamCreate: team_name = "feature-<description>"
   ```

3. Create the task list with these phases and dependencies:

   **Phase 1: CLARIFY**
   - Task: "Gather requirements and explore codebase" → assign to `clarifier`

   **Phase 2: PLAN**
   - Task: "Create technical design" → assign to `architect` (blocked by Phase 1)
   - Task: "Challenge the technical design" → assign to `devils-advocate` (blocked by architect)
   - Task: "Security audit of proposed design" → assign to `security-auditor` (blocked by devils-advocate approval)

   **Phase 3: IMPLEMENT**
   - Task: "Implement the approved design" → assign to `implementer` (blocked by Phase 2)

   **Phase 4: REVIEW**
   - Task: "Code review implementation" → assign to `code-reviewer` (blocked by Phase 3)
   - Task: "Post-implementation challenge" → assign to `devils-advocate` (blocked by Phase 3)
   - Task: "Final security audit on code" → assign to `security-auditor` (blocked by Phase 3)

   **Phase 5: COMPLETE**
   - Task: "Write research doc and shut down team" → self (blocked by Phase 4)

## Workflow Execution

### Phase 1: CLARIFY

1. Spawn the `clarifier` agent:
   ```
   Agent: subagent_type="clarifier", team_name="<team>", name="clarifier", mode="acceptEdits"
   prompt: "Explore the codebase and gather requirements for: <feature description>. Write your requirements to docs/research/<team>/01-requirements.md. Then send the file path to the team lead."
   ```

2. When clarifier reports back, present the requirements to the user via AskUserQuestion
3. Incorporate user feedback before proceeding

### Phase 2: PLAN

1. Spawn the `architect` agent:
   ```
   Agent: subagent_type="architect", team_name="<team>", name="architect", mode="acceptEdits"
   prompt: "Create a technical design for: <feature>. Read the requirements at docs/research/<team>/01-requirements.md. Write your design to docs/research/<team>/02-design.md. Then send the file path to the team lead."
   ```

2. When architect reports back, spawn the `devils-advocate`:
   ```
   Agent: subagent_type="devils-advocate", team_name="<team>", name="devils-advocate", mode="acceptEdits"
   prompt: "Challenge the technical design. Read it at docs/research/<team>/02-design.md. Send your verdict to the team lead."
   ```

3. **GATE:** If devil's advocate issues CHANGES REQUESTED:
   - Send feedback to architect for revision
   - Re-submit to devil's advocate
   - Iterate until APPROVED

4. Once design is approved, spawn the `security-auditor`:
   ```
   Agent: subagent_type="security-auditor", team_name="<team>", name="security-auditor", mode="acceptEdits"
   prompt: "Audit the approved design for security issues. Read it at docs/research/<team>/02-design.md. Send your audit report to the team lead."
   ```

5. Present the design + security report to the user for approval

### Phase 3: IMPLEMENT

1. Only proceed after user approves the design
2. Spawn the `implementer`:
   ```
   Agent: subagent_type="general-purpose", team_name="<team>", name="implementer", mode="acceptEdits"
   prompt: |
     Implement the approved design. Read it at docs/research/<team>/02-design.md. Follow it exactly.
     Do NOT create branches — you are already on the correct branch.
     Just edit files directly.
     Run npx tsc --noEmit when done. Commit your changes with a clear message.
     Report what you changed to the team lead.
   ```

### Phase 4: REVIEW

1. Spawn review agents in parallel:
   - `code-reviewer`: review the implementation
   - `devils-advocate`: post-implementation challenge
   - `security-auditor`: final security audit on actual code

2. **GATE:** If any reviewer issues CHANGES REQUESTED:
   - Collect all feedback
   - Send to implementer for fixes
   - Re-run reviews
   - Iterate until all reviewers APPROVE

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
5. Report final summary to the user, including:
   - What was implemented
   - Files changed
   - Review status
   - **Branch name** (from `git branch --show-current`)
6. **Ask the user** what to do next using AskUserQuestion:
   - **Create PR to main** — push and create a pull request:
     ```bash
     git push -u origin <feature-branch-name>
     gh pr create --base main --title "feat: <short description>" --body "## Summary\n- <changes>\n\nGenerated with Claude Code"
     ```
   - **Keep branch** — leave it as-is for manual review
   - **Discard** — delete the branch and its changes

## Key Rules

- **Never skip the devil's advocate review** — it's the quality gate
- **Never proceed to implementation without user approval** of the design
- **Always present findings to the user** at phase boundaries
- **The implementer is the ONLY agent that writes code**
