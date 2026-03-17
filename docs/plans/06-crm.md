# CRM

CRM module: Contacts, interactions, and task management with auto-task generation engine.

**Branch:** `migration/crm-module`
**Prerequisites:** Phase 4 (Staff) merged to main

## Context

- Read legacy-app.html lines 2383-2697 for CRM components (ContactsPanel, InteractionsPanel, TasksPanel).
- Read CONTACTS, INTERACTIONS, TASKS data structures (lines 155-188).
- Read auto-task engine (lines 189-289): generates tasks 10 days before filing deadlines.
- Tasks have seq (incremental number), can be manual or auto-generated (isAuto flag).
- firm_id scoping on ALL queries.
- Hebrew primary — all strings use t().
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code, DO NOT recreate.

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { Contact, ContactType, CreateContactInput, Interaction, InteractionChannel, CreateInteractionInput, Task, TaskStatus, TaskPriority, TaskCategory, CreateTaskInput } from '@/types'`
- Constants: `import { TASK_PRIORITIES, TASK_CATEGORIES, INTERACTION_CHANNELS, AUTO_TASK_LEAD_DAYS } from '@/lib/constants'`
- Utils: `import { formatDate, isOverdue } from '@/lib/dates'`, `import { getAutoTaskLabel, taskDueDateForFiling } from '@/lib/filing-utils'`
- Components: `import { PageHeader, DataTable, EmptyState, LoadingSpinner, FormField, ConfirmDialog, StatusBadge, PriorityBadge, SearchInput } from '@/components/shared'`
- Staff: `import { StaffPicker } from '@/components/staff/StaffPicker'`
- Auth: `import { useAuthStore } from '@/stores/useAuthStore'`

## Features to Implement

1. **CrmView** (`src/components/crm/CrmView.tsx`) — Three-panel layout:
   - Tab navigation: Contacts, Interactions, Tasks
   - Client filter dropdown (filter by specific client or show all)

2. **ContactsPanel** (`src/components/crm/ContactsPanel.tsx`) — Contact CRUD:
   - Add contact form: type (client/taxAuth/nii/other), name, role, phone (dir=ltr), email, notes
   - Contact list: name, type badge, role, phone, email
   - Edit/delete contacts
   - Filter by client and contact type

3. **InteractionsPanel** (`src/components/crm/InteractionsPanel.tsx`) — Interaction history:
   - Add interaction: channel (call/email/meeting/letter/portal), date, subject, notes, staffId (StaffPicker), outcome
   - Interaction list sorted by date (newest first)
   - Channel icon/badge for each
   - Filter by client, channel, date range

4. **TasksPanel** (`src/components/crm/TasksPanel.tsx`) — Task management:
   - TaskForm (`src/components/crm/TaskForm.tsx`) modal: title, description, dueDate, priority (high/medium/low), category (client/taxAuth/nii/internal), assignedTo (StaffPicker), client (optional)
   - Task list with filters: status (open/done/all), client, priority, category
   - Task cards: seq number, title, due date (red if overdue using isOverdue()), PriorityBadge, category badge, client badge, assigned staff, auto indicator (lightning symbol for isAuto)
   - Toggle done/undone via checkbox
   - Multi-priority color coding

5. **ClientTasksWidget** (`src/components/crm/ClientTasksWidget.tsx`) — Used in ClientView (Phase 3):
   - Shows tasks filtered to a specific client
   - Same card layout as TasksPanel
   - Create task pre-filled with client

6. **Auto-task engine** — In taskService:
   - `runAutoTaskEngine(firmId)`: scan filings within 30-day window, create tasks for unfiled filings that don't already have linked tasks
   - `cancelAutoTaskForFiling(filingId)`: cancel auto-task when filing marked as filed
   - Uses filing-utils: getAutoTaskLabel(), taskDueDateForFiling()

7. **Services**:
   - `src/services/contactService.ts`: list(firmId, clientId?), getById, create, update, delete
   - `src/services/interactionService.ts`: list(firmId, clientId?), create, update, delete
   - `src/services/taskService.ts`: list(firmId, filters), getById, create, update, toggleStatus, delete, runAutoTaskEngine, cancelAutoTaskForFiling

8. **Hooks** — `src/hooks/useContacts.ts`, `src/hooks/useInteractions.ts`, `src/hooks/useTasks.ts`

9. **Database migrations**:
   - `contacts` table (firm_id, client_id, type, name, role, phone, email, notes)
   - `interactions` table (firm_id, client_id, contact_id, date, channel, subject, notes, staffId, outcome)
   - `tasks` table (firm_id, client_id, filing_id, seq, title, desc, dueDate, priority, status, assignedTo, category, isAuto, filingType, filingDue, period, doneAt)
   - RLS, indexes, GRANTs
   - Sequence for task seq numbers

10. **Routes** — Add /crm route

11. **Wire ClientTasksWidget** into ClientView's Tasks tab (from Phase 3)

12. **i18n** — Add i18n keys (crm.*, tasks.*, contacts.*, interactions.* sections) to all 3 language files.
