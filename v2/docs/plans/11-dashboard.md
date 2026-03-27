# Dashboard Module

Aggregated metrics, recent clients, upcoming filings, pending tasks, and subscription status.

**Branch:** `migration/dashboard-module`
**Prerequisites:** Phases 3-10 merged (needs data from all modules for aggregation)

## Context

- Read legacy-app.html lines 4274-4302 for Dashboard
- Dashboard shows aggregated data from all modules
- Metrics: active clients, pending charges, open tasks, overdue tasks
- Hebrew primary — all strings use t()
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code

## Existing Shared Code

Import these, DO NOT recreate:
- All existing types, utils, and components from previous phases
- Hooks from each module: useClients, useTasks, useFilings, useBilling
- Utils: formatMoney, formatDate, daysLeft, isOverdue

## Features to Implement

1. **DashboardView** — Grid layout:
   - 4 MetricCards in row: active clients, pending charges (formatMoney), open tasks, overdue tasks (red if > 0)
   - RecentClients widget (latest 4-6 clients)
   - UpcomingFilings widget (next 5 filings due)
   - PendingTasks widget (top priority tasks)
   - SubscriptionStatus (if <=60 days remaining)

2. **MetricCard** — Single metric:
   - Icon, label, value, trend color
   - Clickable — navigates to relevant section

3. **RecentClients** — Card list:
   - Name, case number, last update, monthly fee
   - Click — navigate to client detail

4. **UpcomingFilings** — List:
   - Type badge (colored), client name, due date, days remaining
   - Red highlight if overdue
   - Click — navigate to filings

5. **PendingTasks** — Priority-sorted task list:
   - Title, client name, due date, PriorityBadge
   - Quick complete toggle

6. **SubscriptionStatus** — Shows when <=60 days:
   - Plan label, days remaining
   - Progress bar
   - Renew button (navigates to settings/billing)

7. **Hooks** — useDashboard.ts:
   - useDashboardMetrics(firmId) — aggregated counts
   - useRecentClients(firmId, limit) — latest clients
   - useUpcomingFilings(firmId, limit) — next due filings

8. **Replace DashboardPlaceholder** in App.tsx

Add i18n keys (dashboard.* section) to all 3 language files.

Files to create:
- `src/components/dashboard/DashboardView.tsx`
- `src/components/dashboard/MetricCard.tsx`
- `src/components/dashboard/RecentClients.tsx`
- `src/components/dashboard/UpcomingFilings.tsx`
- `src/components/dashboard/PendingTasks.tsx`
- `src/components/dashboard/SubscriptionStatus.tsx`
- `src/hooks/useDashboard.ts`
