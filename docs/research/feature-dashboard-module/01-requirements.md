## Requirements Document

### Task Summary

Build the Dashboard Module — the landing page after login that shows aggregated metrics, recent clients, upcoming filings, pending tasks, and subscription status. Replaces the existing `DashboardPlaceholder` in `App.tsx` with a fully functional `DashboardView`.

### User Decisions

1. **Data fetching strategy** — **User chose: Dedicated service methods.** Add focused query methods (e.g., `clientService.countActive(firmId)`, `billingService.totalPending(firmId)`, `taskService.countOpen(firmId)`, `taskService.countOverdue(firmId)`) that each run a targeted Supabase query. Run in parallel via React Query. No RPC needed.

2. **UpcomingFilings widget scope** — **User chose: Pending + late filings.** Show overdue filings at the top (in red), then upcoming pending ones sorted by due date ascending. This gives an "action needed" view.

3. **Subscription renew button** — **User chose: Navigate to settings/billing route.** The button navigates to a settings route (placeholder if the route doesn't exist yet). No in-app billing dialog.

4. **PendingTasks quick-complete toggle** — **User chose: Yes, include it.** Use the existing `useToggleTaskStatus` mutation hook. Users can mark tasks done directly from the dashboard.

5. **Dashboard page header** — **User chose: Standard PageHeader only.** Use `PageHeader` with the translated "Dashboard" title, consistent with other module views. No welcome header with firm info.

### Chosen Approach

**Dedicated service methods with parallel React Query hooks** — Each dashboard metric is fetched via a small, focused Supabase query added to the existing service files. A new `useDashboard.ts` hook file orchestrates these queries. Components consume the hooks and render widgets in a responsive grid.

### Scope

**In scope:**
- 4 MetricCards (active clients, pending charges, open tasks, overdue tasks)
- RecentClients widget (latest 5 clients, clickable to client detail)
- UpcomingFilings widget (next 5 pending/late filings, clickable to filings)
- PendingTasks widget (top 5 priority-sorted open tasks, with quick-complete toggle)
- SubscriptionStatus widget (shown when <=60 days remaining, with navigate-to-settings renew button)
- Dashboard hook file (`useDashboard.ts`)
- New service methods for firm-wide aggregation
- i18n keys for all 3 languages
- Replace `DashboardPlaceholder` in `App.tsx`

**Out of scope:**
- Charts, graphs, or analytics visualizations
- Real-time updates / WebSocket subscriptions
- Subscription payment flow / billing settings page
- Report generation from dashboard
- Drag-and-drop widget reordering
- Dashboard customization / user preferences

### Existing Code to Import/Reuse

#### Types (from `src/types/`)
- `Client` — `src/types/client.ts`
- `Task`, `TaskPriority` — `src/types/task.ts`
- `Filing`, `FilingType`, `FilingStatus` — `src/types/filing.ts`
- `BillingEntry` — `src/types/billing.ts`
- `Firm` — `src/types/firm.ts`

#### Hooks (from `src/hooks/`)
- `useClients` — `src/hooks/useClients.ts` (for RecentClients, reuse existing `clientKeys`)
- `useTasks`, `useToggleTaskStatus` — `src/hooks/useTasks.ts` (for PendingTasks, reuse `taskKeys`)
- `useFilings` — `src/hooks/useFilings.ts` (reference for query key pattern)

#### Services (from `src/services/`)
- `clientService` — `src/services/clientService.ts` — add `countActive(firmId)` method
- `billingService` — `src/services/billingService.ts` — add `totalPending(firmId)` method
- `taskService` — `src/services/taskService.ts` — add `countOpen(firmId)`, `countOverdue(firmId)` methods
- `filingService` — `src/services/filingService.ts` — add `upcomingByFirm(firmId, limit)` method

#### Utilities (from `src/lib/`)
- `formatMoney` — `src/lib/money.ts`
- `formatDate`, `daysLeft`, `isOverdue` — `src/lib/dates.ts`
- `cn` — `src/lib/utils.ts`
- `FILING_TYPE_I18N_KEYS`, `FILING_TYPE_BADGE_CLASSES` — `src/lib/constants.ts`

#### Shared Components (from `src/components/shared/`)
- `PageHeader` — `src/components/shared/PageHeader.tsx`
- `PriorityBadge` — `src/components/shared/PriorityBadge.tsx`
- `StatusBadge` — `src/components/shared/StatusBadge.tsx`
- `EmptyState` — `src/components/shared/EmptyState.tsx`
- `LoadingSpinner` — `src/components/shared/LoadingSpinner.tsx`

#### Stores
- `useAuthStore` — `src/stores/useAuthStore.ts` — provides `firmId`, `firmData` (includes `plan`, `planLabel`, `expiry`)

#### Other
- `useIsMobile` — `src/hooks/useIsMobile.ts` — for responsive layout
- `useLanguage` — `src/contexts/LanguageContext.tsx` — for `t()` translations
- `useNavigate` — from `react-router-dom` — for click-to-navigate

### Data Sources and Queries Needed

#### New Service Methods

1. **`clientService.countActive(firmId: string): Promise<number>`**
   - Query: `supabase.from('clients').select('id', { count: 'exact', head: true }).eq('firm_id', firmId).eq('status', 'active').is('deleted_at', null)`
   - Returns: count of active clients

2. **`billingService.totalPending(firmId: string): Promise<number>`**
   - Query: `supabase.from('billing_entries').select('type, amount').eq('firm_id', firmId).eq('status', 'pending').is('deleted_at', null)`
   - Returns: sum of pending charges minus credits, in agorot

3. **`taskService.countOpen(firmId: string): Promise<number>`**
   - Query: `supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('firm_id', firmId).eq('status', 'open').is('deleted_at', null)`
   - Returns: count of open tasks

4. **`taskService.countOverdue(firmId: string): Promise<number>`**
   - Query: `supabase.from('tasks').select('id, due_date').eq('firm_id', firmId).eq('status', 'open').is('deleted_at', null).not('due_date', 'is', null).lt('due_date', today)`
   - Returns: count of open tasks with due_date in the past

5. **`filingService.upcomingByFirm(firmId: string, limit: number): Promise<(Filing & { clientName: string })[]>`**
   - Query: `supabase.from('filings').select('*, clients!inner(name)').eq('firm_id', firmId).in('status', ['pending', 'late']).is('deleted_at', null).order('due', { ascending: true }).limit(limit)`
   - Returns: filings with joined client name, overdue first (sorted by due ascending means past dates come first)

6. **`taskService.listOpenByFirm(firmId: string, limit: number): Promise<Task[]>`**
   - Query: `supabase.from('tasks').select('*').eq('firm_id', firmId).eq('status', 'open').is('deleted_at', null).order('priority_sort').order('due_date', { ascending: true, nullsFirst: false }).limit(limit)`
   - Note: Priority sorting needs to map high=1, medium=2, low=3 for DB ordering. Alternative: fetch all open and sort client-side.

7. **`clientService.listRecent(firmId: string, limit: number): Promise<Client[]>`**
   - Query: `supabase.from('clients').select('*').eq('firm_id', firmId).eq('status', 'active').is('deleted_at', null).order('created_at', { ascending: false }).limit(limit)`
   - Returns: most recently created active clients

### Component Inventory

#### 1. DashboardView (`src/components/dashboard/DashboardView.tsx`)
- **Purpose**: Main dashboard page layout
- **Layout**: PageHeader + responsive grid
- **Grid**: 4 MetricCards in a row (responsive: 2 cols on mobile, 4 on desktop), then 2-column grid for widgets (single column on mobile)
- **Data**: Uses all `useDashboard*` hooks
- **Imports**: PageHeader, MetricCard, RecentClients, UpcomingFilings, PendingTasks, SubscriptionStatus, LoadingSpinner
- **Navigation**: Imported in `App.tsx` to replace `DashboardPlaceholder`

#### 2. MetricCard (`src/components/dashboard/MetricCard.tsx`)
- **Purpose**: Single metric display card
- **Props**: `icon: LucideIcon`, `label: string`, `value: string | number`, `trend?: 'normal' | 'danger'`, `onClick: () => void`
- **Behavior**: Clickable (navigates to relevant section), danger trend shows red text for overdue count > 0
- **Style**: Rounded card with border, icon in accent color, large bold value, muted label

#### 3. RecentClients (`src/components/dashboard/RecentClients.tsx`)
- **Purpose**: Card showing latest 5 clients
- **Data**: `useRecentClients(firmId, 5)` from `useDashboard.ts`
- **Display**: Client name, case number, last update date, monthly fee (formatted via `formatMoney`)
- **Behavior**: Click a client row to navigate to `/clients/:id`
- **Empty state**: EmptyState component if no clients

#### 4. UpcomingFilings (`src/components/dashboard/UpcomingFilings.tsx`)
- **Purpose**: List of next 5 filings due across all clients
- **Data**: `useUpcomingFilings(firmId, 5)` from `useDashboard.ts`
- **Display**: Filing type badge (colored, using `FILING_TYPE_BADGE_CLASSES`), client name, due date, days remaining (via `daysLeft`), red highlight if overdue (via `isOverdue`)
- **Behavior**: Click to navigate to `/filings`
- **Empty state**: EmptyState component if no upcoming filings

#### 5. PendingTasks (`src/components/dashboard/PendingTasks.tsx`)
- **Purpose**: Priority-sorted open task list with quick-complete
- **Data**: `usePendingTasks(firmId, 5)` from `useDashboard.ts`
- **Display**: Title, client name (if available — needs client name join or lookup), due date, PriorityBadge
- **Behavior**: Checkbox toggle calls `useToggleTaskStatus` to mark done; click task title to navigate to `/crm`
- **Empty state**: EmptyState component if no pending tasks

#### 6. SubscriptionStatus (`src/components/dashboard/SubscriptionStatus.tsx`)
- **Purpose**: Subscription expiry warning when <=60 days remaining
- **Data**: `useAuthStore` — `firmData.plan`, `firmData.planLabel`, `firmData.expiry`
- **Display**: Plan label, days remaining (via `daysLeft`), expiry date (via `formatDate`), progress bar
- **Behavior**: "Renew" button navigates to `/settings` (or `/billing` placeholder). Only renders when `daysLeft(expiry) <= 60`.
- **Style**: Gradient background (matches legacy), distinct from other cards

#### 7. useDashboard Hook (`src/hooks/useDashboard.ts`)
- **Exports**:
  - `dashboardKeys` — query key factory
  - `useDashboardMetrics(firmId)` — returns `{ activeClients, pendingCharges, openTasks, overdueTasks, isLoading }` using 4 parallel `useQuery` calls
  - `useRecentClients(firmId, limit)` — returns `{ data: Client[], isLoading }`
  - `useUpcomingFilings(firmId, limit)` — returns `{ data: (Filing & { clientName })[], isLoading }`
  - `usePendingTasks(firmId, limit)` — returns `{ data: Task[], isLoading }`

### Affected Files (Existing)

- `src/App.tsx` — Remove `DashboardPlaceholder`, import and use `DashboardView`
- `src/services/clientService.ts` — Add `countActive()` and `listRecent()` methods
- `src/services/billingService.ts` — Add `totalPending()` method
- `src/services/taskService.ts` — Add `countOpen()`, `countOverdue()`, `listOpenByFirm()` methods
- `src/services/filingService.ts` — Add `upcomingByFirm()` method
- `src/i18n/he.ts` — Add dashboard i18n keys
- `src/i18n/ar.ts` — Add dashboard i18n keys
- `src/i18n/en.ts` — Add dashboard i18n keys

### New Files Needed

- `src/components/dashboard/DashboardView.tsx` — Main dashboard page
- `src/components/dashboard/MetricCard.tsx` — Single metric card
- `src/components/dashboard/RecentClients.tsx` — Recent clients widget
- `src/components/dashboard/UpcomingFilings.tsx` — Upcoming filings widget
- `src/components/dashboard/PendingTasks.tsx` — Pending tasks widget
- `src/components/dashboard/SubscriptionStatus.tsx` — Subscription expiry widget
- `src/hooks/useDashboard.ts` — Dashboard-specific React Query hooks

### Database Changes

No new tables or migrations needed. All data comes from existing tables:
- `clients` — count active, list recent
- `billing_entries` — sum pending charges
- `tasks` — count open, count overdue, list open sorted by priority
- `filings` — list upcoming/overdue with client name join
- `firms` — subscription data (already in auth store)

RLS policies are already in place on all tables (using `firm_id IN (SELECT user_firm_ids())`). The new service methods use the same `firm_id` scoping as existing queries.

### i18n Keys Needed

Existing keys to keep:
- `dashboard.title` — "לוח בקרה" / "لوحة التحكم" / "Dashboard"
- `dashboard.totalClients` — "סה"כ לקוחות" / "إجمالي العملاء" / "Total Clients"
- `dashboard.upcomingFilings` — "דיווחים קרובים" / "تقارير قادمة" / "Upcoming Filings"
- `dashboard.pendingTasks` — "משימות ממתינות" / "مهام معلقة" / "Pending Tasks"
- `dashboard.monthlyRevenue` — "הכנסה חודשית" / "الإيرادات الشهرية" / "Monthly Revenue"

New keys to add:
- `dashboard.activeClients` — "לקוחות פעילים" / "عملاء نشطون" / "Active Clients"
- `dashboard.pendingCharges` — "חיובים ממתינים" / "رسوم معلقة" / "Pending Charges"
- `dashboard.openTasks` — "משימות פתוחות" / "مهام مفتوحة" / "Open Tasks"
- `dashboard.overdueTasks` — "משימות באיחור" / "مهام متأخرة" / "Overdue Tasks"
- `dashboard.recentClients` — "לקוחות אחרונים" / "عملاء حديثون" / "Recent Clients"
- `dashboard.viewAll` — "הצג הכל" / "عرض الكل" / "View All"
- `dashboard.noClients` — "אין לקוחות עדיין" / "لا يوجد عملاء بعد" / "No clients yet"
- `dashboard.noFilings` — "אין דיווחים קרובים" / "لا توجد تقارير قادمة" / "No upcoming filings"
- `dashboard.noTasks` — "אין משימות ממתינות" / "لا توجد مهام معلقة" / "No pending tasks"
- `dashboard.dueIn` — "בעוד {days} ימים" / "خلال {days} أيام" / "Due in {days} days"
- `dashboard.overdue` — "באיחור" / "متأخر" / "Overdue"
- `dashboard.daysRemaining` — "{days} ימים נותרים" / "{days} أيام متبقية" / "{days} days remaining"
- `dashboard.subscription` — "מנוי" / "اشتراك" / "Subscription"
- `dashboard.renewSubscription` — "חידוש מנוי" / "تجديد الاشتراك" / "Renew Subscription"
- `dashboard.subscriptionActive` — "פעיל" / "نشط" / "Active"
- `dashboard.until` — "עד" / "حتى" / "Until"
- `dashboard.perMonth` — "לחודש" / "شهرياً" / "per month"
- `dashboard.caseNum` — "תיק" / "ملف" / "Case"

### Success Criteria

- [ ] DashboardView renders with 4 MetricCards showing correct aggregated counts
- [ ] MetricCards are clickable and navigate to the correct section (clients, billing, crm)
- [ ] RecentClients shows latest 5 active clients with name, case number, and monthly fee
- [ ] Clicking a recent client navigates to `/clients/:id`
- [ ] UpcomingFilings shows up to 5 pending/late filings sorted by due date
- [ ] Overdue filings display with red highlighting in UpcomingFilings
- [ ] PendingTasks shows up to 5 open tasks sorted by priority
- [ ] Quick-complete checkbox marks tasks as done via `useToggleTaskStatus`
- [ ] SubscriptionStatus only appears when <=60 days remaining
- [ ] Renew button navigates to settings route
- [ ] All user-facing text uses `t()` with keys in all 3 language files (he, ar, en)
- [ ] RTL layout works correctly (logical properties, icon mirroring)
- [ ] Responsive layout: 2-col metrics on mobile, 4-col on desktop; single-col widgets on mobile
- [ ] Loading states show `LoadingSpinner`; empty states show `EmptyState`
- [ ] `DashboardPlaceholder` removed from `App.tsx`
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
