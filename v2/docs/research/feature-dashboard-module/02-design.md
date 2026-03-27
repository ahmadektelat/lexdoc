# Dashboard Module — Technical Design

## Architecture Approach

**Strategy: Thin service methods + parallel React Query hooks + presentational widget components.**

Each dashboard metric is fetched via a small, focused Supabase query added to the relevant existing service file (`clientService`, `billingService`, `taskService`, `filingService`). A new `src/hooks/useDashboard.ts` file defines a `dashboardKeys` factory and thin wrapper hooks that call these service methods through `useQuery`. The `DashboardView` component orchestrates all hooks and renders a responsive grid of widgets.

**Why this approach over alternatives:**
- **No RPC / edge functions needed** — all queries are simple selects with aggregation. Adding RPC would increase deployment surface and be harder to maintain.
- **Parallel React Query hooks** — each metric is an independent `useQuery` call. They fetch in parallel, fail independently, and cache independently. A failing billing query does not block the clients count.
- **Existing service pattern** — every other module follows the `xService` + `useX` pattern. The dashboard follows the same convention, just with read-only aggregate methods.

---

## File-by-File Change Plan

### Existing Files to Modify

#### `src/services/clientService.ts`
- **Action:** Modify
- **Changes:** Add two new methods to the `clientService` object (after the existing `delete` method, before the closing `};`):
  - `countActive(firmId: string): Promise<number>` — uses `select('id', { count: 'exact', head: true })` with `.eq('status', 'active')` filter
  - `listRecent(firmId: string, limit: number): Promise<Client[]>` — uses `.order('created_at', { ascending: false }).limit(limit)` with `status=active` filter
- **Rationale:** Dashboard needs aggregate client count and recent client list. These are firm-wide queries (no clientId), which don't exist in the current service.

#### `src/services/billingService.ts`
- **Action:** Modify
- **Changes:** Add one new method to the `billingService` object:
  - `totalPending(firmId: string): Promise<number>` — selects `type, amount` where `status='pending'`, sums charges minus credits. Similar logic to existing `getBalance` but firm-wide (no `client_id` filter).
- **Rationale:** Dashboard needs total pending charges across all clients for the firm.

#### `src/services/taskService.ts`
- **Action:** Modify
- **Changes:** Add three new methods to the `taskService` object:
  - `countOpen(firmId: string): Promise<number>` — uses `select('id', { count: 'exact', head: true })` with `status='open'`
  - `countOverdue(firmId: string): Promise<number>` — selects `id, due_date` where `status='open'` and `due_date IS NOT NULL`, then filters client-side for `due_date < today` and returns count. Client-side filter is needed because Supabase `.lt()` on dates requires a string comparison and we need to compare against the current date dynamically.
  - `listOpenByFirm(firmId: string, limit: number): Promise<(Task & { clientName?: string })[]>` — uses `select('*, clients(name)')` with a LEFT join (not inner, since `client_id` is optional on tasks) to include the client name. Orders by `due_date asc nulls last` with a generous limit (50), then sorts client-side by priority rank (high=0, medium=1, low=2) since PostgREST does not support CASE expressions in ORDER BY, then slices to the requested limit. Maps the joined `clients.name` into an optional `clientName` field on each result.
- **Rationale:** Dashboard needs open/overdue task counts and a priority-sorted task list with client names for context.

**Note on `listOpenByFirm` sorting:** PostgREST does not support custom sort expressions (CASE WHEN). The approach is: fetch open tasks ordered by `due_date asc nulls last` with a generous limit (e.g., 50), then sort client-side by priority rank, then slice to the requested limit. This is acceptable because we only need the top 5 and the total open task count is bounded per firm.

#### `src/services/filingService.ts`
- **Action:** Modify
- **Changes:** Add one new method to the `filingService` object:
  - `upcomingByFirm(firmId: string, limit: number): Promise<(Filing & { clientName: string })[]>` — uses `select('*, clients!inner(name)')` with `.in('status', ['pending', 'late'])` filter, ordered by `due asc`, limited. Maps the joined `clients.name` into a `clientName` field on each result. Uses the existing `rowToFiling` internally, then attaches `clientName` from the joined data.
- **Rationale:** Dashboard needs cross-client filing list with client names. The `clients!inner` join leverages the existing `client_id` foreign key.

#### `src/App.tsx`
- **Action:** Modify
- **Changes:**
  - Add import: `import { DashboardView } from '@/components/dashboard/DashboardView';`
  - Replace line 73 `<Route path="dashboard" element={<DashboardPlaceholder />} />` with `<Route path="dashboard" element={<DashboardView />} />`
  - Add a new `/settings` placeholder route (after the `backup` route, before the closing `</Route>`): `<Route path="settings" element={<SectionPlaceholder section="settings" />} />`. This is required because the `SubscriptionStatus` widget's "Renew" button navigates to `/settings`, and without this route the user would be redirected to the catch-all `/welcome`.
  - Remove the `DashboardPlaceholder` function (lines 99-106)
- **Rationale:** Replace placeholder with the real dashboard component and ensure `/settings` route exists for subscription renewal navigation.

#### `src/i18n/he.ts`
- **Action:** Modify
- **Changes:** Add new keys after existing `dashboard.monthlyRevenue` key:
```
'dashboard.activeClients': 'לקוחות פעילים',
'dashboard.pendingCharges': 'חיובים ממתינים',
'dashboard.openTasks': 'משימות פתוחות',
'dashboard.overdueTasks': 'משימות באיחור',
'dashboard.recentClients': 'לקוחות אחרונים',
'dashboard.viewAll': 'הצג הכל',
'dashboard.noClients': 'אין לקוחות עדיין',
'dashboard.noFilings': 'אין דיווחים קרובים',
'dashboard.noTasks': 'אין משימות ממתינות',
'dashboard.dueIn': 'בעוד {days} ימים',
'dashboard.overdue': 'באיחור',
'dashboard.daysRemaining': '{days} ימים נותרים',
'dashboard.subscription': 'מנוי',
'dashboard.renewSubscription': 'חידוש מנוי',
'dashboard.subscriptionActive': 'פעיל',
'dashboard.until': 'עד',
'dashboard.perMonth': 'לחודש',
'dashboard.caseNum': 'תיק',
'dashboard.dueSoon': 'יום אחרון',
'dashboard.markDone': 'סמן כבוצע',
```

#### `src/i18n/ar.ts`
- **Action:** Modify
- **Changes:** Add corresponding Arabic translations after existing `dashboard.monthlyRevenue`:
```
'dashboard.activeClients': 'عملاء نشطون',
'dashboard.pendingCharges': 'رسوم معلقة',
'dashboard.openTasks': 'مهام مفتوحة',
'dashboard.overdueTasks': 'مهام متأخرة',
'dashboard.recentClients': 'عملاء حديثون',
'dashboard.viewAll': 'عرض الكل',
'dashboard.noClients': 'لا يوجد عملاء بعد',
'dashboard.noFilings': 'لا توجد تقارير قادمة',
'dashboard.noTasks': 'لا توجد مهام معلقة',
'dashboard.dueIn': 'خلال {days} أيام',
'dashboard.overdue': 'متأخر',
'dashboard.daysRemaining': '{days} أيام متبقية',
'dashboard.subscription': 'اشتراك',
'dashboard.renewSubscription': 'تجديد الاشتراك',
'dashboard.subscriptionActive': 'نشط',
'dashboard.until': 'حتى',
'dashboard.perMonth': 'شهرياً',
'dashboard.caseNum': 'ملف',
'dashboard.dueSoon': 'موعد التسليم',
'dashboard.markDone': 'تحديد كمنجز',
```

#### `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add corresponding English translations after existing `dashboard.monthlyRevenue`:
```
'dashboard.activeClients': 'Active Clients',
'dashboard.pendingCharges': 'Pending Charges',
'dashboard.openTasks': 'Open Tasks',
'dashboard.overdueTasks': 'Overdue Tasks',
'dashboard.recentClients': 'Recent Clients',
'dashboard.viewAll': 'View All',
'dashboard.noClients': 'No clients yet',
'dashboard.noFilings': 'No upcoming filings',
'dashboard.noTasks': 'No pending tasks',
'dashboard.dueIn': 'Due in {days} days',
'dashboard.overdue': 'Overdue',
'dashboard.daysRemaining': '{days} days remaining',
'dashboard.subscription': 'Subscription',
'dashboard.renewSubscription': 'Renew Subscription',
'dashboard.subscriptionActive': 'Active',
'dashboard.until': 'Until',
'dashboard.perMonth': 'per month',
'dashboard.caseNum': 'Case',
'dashboard.dueSoon': 'Due date',
'dashboard.markDone': 'Mark as done',
```

---

### New Files to Create

#### `src/hooks/useDashboard.ts`
- **Action:** Create
- **Purpose:** Dashboard-specific React Query hooks that call the new service methods
- **Exports:**
  - `dashboardKeys` — query key factory following the established pattern (`taskKeys`, `clientKeys`, etc.)
  - `useDashboardMetrics(firmId: string | null)` — returns `{ activeClients: number, pendingCharges: number, openTasks: number, overdueTasks: number, isLoading: boolean }`. Internally runs 4 independent `useQuery` calls in parallel. Combines their `isLoading` states with `||`.
  - `useRecentClients(firmId: string | null, limit: number)` — returns `{ data: Client[], isLoading: boolean }`
  - `useUpcomingFilings(firmId: string | null, limit: number)` — returns `{ data: (Filing & { clientName: string })[], isLoading: boolean }`
  - `usePendingTasks(firmId: string | null, limit: number)` — returns `{ data: (Task & { clientName?: string })[], isLoading: boolean }`

**Query key factory:**
```ts
export const dashboardKeys = {
  all: ['dashboard'] as const,
  metrics: (firmId: string) => [...dashboardKeys.all, 'metrics', firmId] as const,
  activeClients: (firmId: string) => [...dashboardKeys.metrics(firmId), 'activeClients'] as const,
  pendingCharges: (firmId: string) => [...dashboardKeys.metrics(firmId), 'pendingCharges'] as const,
  openTasks: (firmId: string) => [...dashboardKeys.metrics(firmId), 'openTasks'] as const,
  overdueTasks: (firmId: string) => [...dashboardKeys.metrics(firmId), 'overdueTasks'] as const,
  recentClients: (firmId: string, limit: number) => [...dashboardKeys.all, 'recentClients', firmId, limit] as const,
  upcomingFilings: (firmId: string, limit: number) => [...dashboardKeys.all, 'upcomingFilings', firmId, limit] as const,
  pendingTasks: (firmId: string, limit: number) => [...dashboardKeys.all, 'pendingTasks', firmId, limit] as const,
};
```

**React Query configuration:**
- `staleTime`: Use the global default (5 minutes from `QueryClient` config in `App.tsx`)
- `enabled`: `!!firmId` — all queries disabled when firmId is null
- No custom `retry` — inherits default (1 retry from global config)

**`useDashboardMetrics` implementation pattern:**
```ts
export function useDashboardMetrics(firmId: string | null) {
  const activeClients = useQuery({
    queryKey: dashboardKeys.activeClients(firmId ?? ''),
    queryFn: () => clientService.countActive(firmId!),
    enabled: !!firmId,
  });
  const pendingCharges = useQuery({
    queryKey: dashboardKeys.pendingCharges(firmId ?? ''),
    queryFn: () => billingService.totalPending(firmId!),
    enabled: !!firmId,
  });
  const openTasks = useQuery({
    queryKey: dashboardKeys.openTasks(firmId ?? ''),
    queryFn: () => taskService.countOpen(firmId!),
    enabled: !!firmId,
  });
  const overdueTasks = useQuery({
    queryKey: dashboardKeys.overdueTasks(firmId ?? ''),
    queryFn: () => taskService.countOverdue(firmId!),
    enabled: !!firmId,
  });

  return {
    activeClients: activeClients.data ?? 0,
    pendingCharges: pendingCharges.data ?? 0,
    openTasks: openTasks.data ?? 0,
    overdueTasks: overdueTasks.data ?? 0,
    isLoading: activeClients.isLoading || pendingCharges.isLoading || openTasks.isLoading || overdueTasks.isLoading,
  };
}
```

#### `src/components/dashboard/DashboardView.tsx`
- **Action:** Create
- **Purpose:** Main dashboard page — layout orchestrator
- **Imports:**
  - `useLanguage` from `@/contexts/LanguageContext`
  - `useAuthStore` from `@/stores/useAuthStore`
  - `PageHeader` from `@/components/shared/PageHeader`
  - `LoadingSpinner` from `@/components/shared/LoadingSpinner`
  - `useDashboardMetrics, useRecentClients, useUpcomingFilings, usePendingTasks` from `@/hooks/useDashboard`
  - `useNavigate` from `react-router-dom`
  - `formatMoney` from `@/lib/money`
  - `daysLeft` from `@/lib/dates`
  - `MetricCard` from `./MetricCard`
  - `RecentClients` from `./RecentClients`
  - `UpcomingFilings` from `./UpcomingFilings`
  - `PendingTasks` from `./PendingTasks`
  - `SubscriptionStatus` from `./SubscriptionStatus`
  - Lucide icons: `Users, Receipt, ListTodo, AlertTriangle`

**Layout structure:**
```
<div className="p-6 animate-fade-in">
  <PageHeader title={t('dashboard.title')} />

  {/* Metrics row: 2 cols mobile, 4 cols desktop */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <MetricCard icon={Users} label={t('dashboard.activeClients')} value={metrics.activeClients} onClick={() => navigate('/clients')} />
    <MetricCard icon={Receipt} label={t('dashboard.pendingCharges')} value={formatMoney(metrics.pendingCharges)} onClick={() => navigate('/billing')} />
    <MetricCard icon={ListTodo} label={t('dashboard.openTasks')} value={metrics.openTasks} onClick={() => navigate('/crm')} />
    <MetricCard icon={AlertTriangle} label={t('dashboard.overdueTasks')} value={metrics.overdueTasks} trend={metrics.overdueTasks > 0 ? 'danger' : 'normal'} onClick={() => navigate('/crm')} />
  </div>

  {/* Widgets: 1 col mobile, 2 cols desktop */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <RecentClients />
    <UpcomingFilings />
    <PendingTasks />
    <SubscriptionStatus />
  </div>
</div>
```

**Loading state:** Show `LoadingSpinner` with `size="lg"` and `className="py-20"` only when ALL metrics are still loading on first mount. Individual widgets handle their own loading states internally.

**No permission gate:** The dashboard is a general landing page. All users who are authenticated can see it. The data itself is already scoped by `firm_id` via RLS.

#### `src/components/dashboard/MetricCard.tsx`
- **Action:** Create
- **Props interface:**
```ts
interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: 'normal' | 'danger';
  onClick: () => void;
}
```
- **Implementation:** Uses `Card` from `@/components/ui/card`. Clickable via `onClick` handler on the card with `cursor-pointer hover:shadow-md transition-shadow`. Icon rendered in `text-primary` color (theme-aware). Value in large bold text (`text-2xl font-bold`). When `trend === 'danger'`, value text uses `text-destructive` instead of `text-foreground`.
- **RTL:** No directional concerns — centered content.

#### `src/components/dashboard/RecentClients.tsx`
- **Action:** Create
- **Purpose:** Card widget showing latest 5 clients
- **Data:** Calls `useRecentClients(firmId, 5)` internally (gets `firmId` from `useAuthStore`)
- **Layout:** `Card` with `CardHeader` (title: `t('dashboard.recentClients')` + "View All" link button) and `CardContent` (list of client rows)
- **Each row:** Client name (bold), case number (`t('dashboard.caseNum')` + value, LTR-forced via `dir="ltr"` on the case number span), monthly fee via `formatMoney`. Rows are clickable — `onClick` navigates to `/clients/${client.id}`.
- **Empty state:** `EmptyState` with `Users` icon and `t('dashboard.noClients')` title
- **Loading state:** `LoadingSpinner` with `size="sm"` centered in the card content area
- **"View All" button:** `Button` variant `ghost` size `sm`, navigates to `/clients`

#### `src/components/dashboard/UpcomingFilings.tsx`
- **Action:** Create
- **Purpose:** Card widget showing next 5 pending/late filings
- **Data:** Calls `useUpcomingFilings(firmId, 5)` internally
- **Layout:** `Card` with `CardHeader` (title + "View All" link) and `CardContent` (filing rows)
- **Each row:**
  - Filing type badge using `Badge` component with `FILING_TYPE_BADGE_CLASSES[filing.type]` and `t(FILING_TYPE_I18N_KEYS[filing.type])` as label
  - Client name (from joined `clientName`)
  - Due date via `formatDate(filing.due)`
  - Days remaining: computed via `daysLeft(filing.due)`. If negative or zero → show `t('dashboard.overdue')` in `text-destructive`. If positive → show `t('dashboard.dueIn').replace('{days}', String(days))`.
- **Row click:** Navigates to `/filings`
- **Overdue highlight:** Rows where `isOverdue(filing.due)` get `bg-destructive/5` background
- **Empty state:** `EmptyState` with `Calendar` icon and `t('dashboard.noFilings')`
- **Loading state:** `LoadingSpinner` size `sm`

#### `src/components/dashboard/PendingTasks.tsx`
- **Action:** Create
- **Purpose:** Priority-sorted open task list with quick-complete toggle
- **Data:** Calls `usePendingTasks(firmId, 5)` internally
- **Mutation:** Uses `useToggleTaskStatus()` from `@/hooks/useTasks` for the checkbox
- **Layout:** `Card` with `CardHeader` (title + "View All" link) and `CardContent` (task rows)
- **Each row:**
  - `Checkbox` (from `@/components/ui/checkbox`) — unchecked. `onCheckedChange` calls `toggleStatus.mutate(task.id)`. While mutation is pending for that task, show spinner instead of checkbox.
  - Task title (clickable → navigates to `/crm`)
  - Client name (if available — from joined `clientName` field, displayed in `text-muted-foreground text-sm`)
  - `PriorityBadge` with `task.priority`
  - Due date (if exists) via `formatDate(task.dueDate)`, with `text-destructive` if `isOverdue(task.dueDate)`
- **Empty state:** `EmptyState` with `ListTodo` icon and `t('dashboard.noTasks')`
- **Loading state:** `LoadingSpinner` size `sm`
- **"View All" button:** Navigates to `/crm`

**Task toggle invalidation:** The `useToggleTaskStatus` hook already invalidates `taskKeys.lists()`. The dashboard queries use `dashboardKeys` (different namespace), so we need to also invalidate `dashboardKeys.all` when a task is toggled. We accomplish this by passing an `onSuccess` callback from within `PendingTasks` that calls `queryClient.invalidateQueries({ queryKey: dashboardKeys.all })` after the toggle mutation succeeds. Alternatively, we can use `useToggleTaskStatus` as-is and add a manual invalidation in the component via `useMutation`'s `onSettled`. The simpler approach: use `useToggleTaskStatus` directly and add a `useEffect` or manual `queryClient.invalidateQueries` call in `onSuccess` override. **Chosen approach:** Wrap the toggle in a local handler that awaits the mutation, then invalidates dashboard keys.

```ts
const queryClient = useQueryClient();
const toggleStatus = useToggleTaskStatus();

const handleToggle = (taskId: string) => {
  toggleStatus.mutate(taskId, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
};
```

#### `src/components/dashboard/SubscriptionStatus.tsx`
- **Action:** Create
- **Purpose:** Subscription expiry warning (renders only when <= 60 days remaining)
- **Data:** `useAuthStore` — reads `firmData?.plan`, `firmData?.planLabel`, `firmData?.expiry`
- **Conditional rendering:** If `!firmData?.expiry` or `daysLeft(firmData.expiry) > 60`, return `null`
- **Layout:** `Card` with distinctive styling:
  - Background: `bg-gradient-to-r from-primary/10 to-primary/5` (subtle gradient, works with all themes)
  - Title: `t('dashboard.subscription')`
  - Plan label: `firmData.planLabel`
  - Status badge: `t('dashboard.subscriptionActive')` in green
  - Days remaining: `daysLeft(firmData.expiry)` formatted with `t('dashboard.daysRemaining').replace('{days}', String(days))`
  - Expiry date: `t('dashboard.until')` + `formatDate(firmData.expiry)`
  - Progress bar: A simple `<div>` with width percentage based on days remaining out of total plan duration. Since we don't know the total plan duration from the stored data, we use a fixed 365-day reference and clamp: `width = Math.max(0, Math.min(100, (remaining / 365) * 100))%`. This is a visual approximation.
  - "Renew" button: `Button` with `t('dashboard.renewSubscription')`, `onClick` navigates to `/settings`
- **RTL:** No directional concerns — text is theme/locale aware via `t()`.

---

## Data Flow

```
Supabase (RLS: firm_id scoped)
    │
    ├── clients table ──► clientService.countActive(firmId) ──► useDashboardMetrics ──► MetricCard
    │                 ──► clientService.listRecent(firmId, 5) ──► useRecentClients  ──► RecentClients
    │
    ├── billing_entries ─► billingService.totalPending(firmId) ──► useDashboardMetrics ──► MetricCard
    │
    ├── tasks table ────► taskService.countOpen(firmId) ───────► useDashboardMetrics ──► MetricCard
    │                 ──► taskService.countOverdue(firmId) ────► useDashboardMetrics ──► MetricCard
    │                 ──► taskService.listOpenByFirm(firmId,5) ► usePendingTasks    ──► PendingTasks
    │                    (LEFT JOIN on clients for client name)
    │
    ├── filings + clients ► filingService.upcomingByFirm(firmId,5) ► useUpcomingFilings ► UpcomingFilings
    │                 (INNER JOIN on clients for client name)
    │
    └── firms (auth store) ────────────────────────────────────────► SubscriptionStatus (no query, reads store)
```

**Component tree:**
```
DashboardView
├── PageHeader
├── MetricCard x4 (data from useDashboardMetrics)
├── RecentClients (data from useRecentClients)
├── UpcomingFilings (data from useUpcomingFilings)
├── PendingTasks (data from usePendingTasks + useToggleTaskStatus)
└── SubscriptionStatus (data from useAuthStore)
```

---

## Component Hierarchy and Props

```
DashboardView (no props — reads firmId from useAuthStore)
│
├── MetricCard
│   Props: { icon: LucideIcon, label: string, value: string | number, trend?: 'normal' | 'danger', onClick: () => void }
│
├── RecentClients (no props — reads firmId from useAuthStore internally)
│
├── UpcomingFilings (no props — reads firmId from useAuthStore internally)
│
├── PendingTasks (no props — reads firmId from useAuthStore internally)
│
└── SubscriptionStatus (no props — reads firmData from useAuthStore internally)
```

**Design decision: Widget components get their own data.** Each widget calls `useAuthStore` for `firmId` and runs its own hook. This keeps `DashboardView` clean and avoids prop drilling. It also means widgets are independently testable. The only exception is `MetricCard`, which is a pure presentational component that receives pre-computed values from `DashboardView`.

---

## Service Method Signatures

### `clientService.countActive`
```ts
async countActive(firmId: string): Promise<number> {
  const { count, error } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('status', 'active')
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

### `clientService.listRecent`
```ts
async listRecent(firmId: string, limit: number): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('firm_id', firmId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]).map(rowToClient);
}
```

### `billingService.totalPending`
```ts
async totalPending(firmId: string): Promise<number> {
  const { data, error } = await supabase
    .from('billing_entries')
    .select('type, amount')
    .eq('firm_id', firmId)
    .eq('status', 'pending')
    .is('deleted_at', null);

  if (error) throw new Error(error.message);

  const rows = data as { type: string; amount: number }[];
  const charges = rows.filter(r => r.type === 'charge').reduce((s, r) => s + r.amount, 0);
  const credits = rows.filter(r => r.type === 'credit').reduce((s, r) => s + r.amount, 0);
  return charges - credits;
}
```

### `taskService.countOpen`
```ts
async countOpen(firmId: string): Promise<number> {
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('status', 'open')
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

### `taskService.countOverdue`
```ts
async countOverdue(firmId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('status', 'open')
    .is('deleted_at', null)
    .not('due_date', 'is', null)
    .lt('due_date', today);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
```
Note: `.lt('due_date', today)` works because `due_date` is stored as `YYYY-MM-DD` text/date and lexicographic comparison is correct for ISO date strings.

### `taskService.listOpenByFirm`
```ts
async listOpenByFirm(firmId: string, limit: number): Promise<(Task & { clientName?: string })[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, clients(name)')
    .eq('firm_id', firmId)
    .eq('status', 'open')
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const tasks = (data as Record<string, unknown>[]).map(row => ({
    ...rowToTask(row),
    clientName: (row.clients as { name: string } | null)?.name,
  }));

  // Sort by priority rank (high=0, medium=1, low=2), then by due_date
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 1;
    const pb = priorityRank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    // Both same priority — keep due_date ascending (already from DB)
    return 0;
  });

  return tasks.slice(0, limit);
}
```
Note: `select('*, clients(name)')` performs a LEFT JOIN via the `client_id` foreign key. Tasks without a `client_id` will have `clients` as `null`, so `clientName` is `undefined` for those rows.

### `filingService.upcomingByFirm`
```ts
async upcomingByFirm(firmId: string, limit: number): Promise<(Filing & { clientName: string })[]> {
  const { data, error } = await supabase
    .from('filings')
    .select('*, clients!inner(name)')
    .eq('firm_id', firmId)
    .in('status', ['pending', 'late'])
    .is('deleted_at', null)
    .order('due', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data as Record<string, unknown>[]).map(row => ({
    ...rowToFiling(row),
    clientName: (row.clients as { name: string }).name,
  }));
}
```

---

## Database Changes

**No new tables, migrations, indexes, or RLS policies are needed.**

All data comes from existing tables (`clients`, `billing_entries`, `tasks`, `filings`, `firms`) which already have:
- `firm_id` column with foreign key to `firms`
- RLS policies using `firm_id IN (SELECT user_firm_ids())`
- Indexes on `firm_id` (created by foreign key)
- `deleted_at` for soft-delete
- `created_at` / `updated_at` timestamps

The new service methods use the same `firm_id` scoping pattern as all existing methods.

**Performance note:** The `billing_entries` `totalPending` query fetches all pending rows for the firm to sum them. For firms with very large billing volumes, this could be slow. However, this is the same pattern used by `getBalance` (per-client), and firm-level pending entries are unlikely to exceed a few thousand rows. No index optimization needed at this stage.

---

## Edge Cases & Error Handling

1. **Firm has no clients** → `countActive` returns 0, `listRecent` returns `[]`. MetricCard shows "0", RecentClients shows EmptyState. No crash.

2. **Firm has no billing entries** → `totalPending` returns 0 (the reduce on empty array returns 0). MetricCard shows "₪0.00".

3. **Firm has no tasks** → `countOpen`/`countOverdue` return 0, `listOpenByFirm` returns `[]`. PendingTasks shows EmptyState.

4. **Firm has no filings** → `upcomingByFirm` returns `[]`. UpcomingFilings shows EmptyState.

5. **Subscription without expiry date** → `firmData.expiry` is undefined → `SubscriptionStatus` returns null (not rendered). This is correct for firms without a set expiry.

6. **Subscription expiry > 60 days** → `SubscriptionStatus` returns null. Widget is hidden.

7. **Task toggle while mutation is in-flight** → The `useToggleTaskStatus` hook handles this. The checkbox shows a spinner while `toggleStatus.isPending` for that specific task. We track which task ID is being toggled to show the spinner only on that row.

8. **React Query error state** → Individual query failures are isolated. If `countActive` fails, the metric shows 0 (via `?? 0` fallback). The other metrics still load. We do not show error toasts on dashboard load failures (this would be noisy). The data simply shows stale/default values and retries on next visit.

9. **`daysLeft` returns negative** → Correct behavior — indicates overdue. The UI handles this by showing "Overdue" text in red.

10. **Client deleted between filing join and render** → The `clients!inner` join in `upcomingByFirm` means filings without a matching client are excluded (INNER JOIN). This is correct — if the client is deleted, their filings should not appear on the dashboard.

---

## Performance Considerations

1. **4 parallel metric queries** → Each is a lightweight `HEAD` request or simple aggregate. Total round-trip is bounded by the slowest single query, not the sum. Expected < 200ms each.

2. **`totalPending` fetches all pending rows** → For a typical firm with <500 pending billing entries, this is fine. If performance becomes an issue later, a Supabase RPC with `SUM(CASE WHEN type='charge' THEN amount ELSE -amount END)` could replace it. Not needed now.

3. **`listOpenByFirm` fetches 50 rows, sorts, slices to 5** → The 50-row fetch is a safety margin for client-side priority sorting. This is negligible overhead.

4. **5-minute stale time** → Dashboard data refreshes when the user navigates away and comes back after 5 minutes. No unnecessary refetches on tab switching within the stale window.

5. **No real-time / WebSocket** → Out of scope. Dashboard shows point-in-time data. Users refresh by navigating away and back.

---

## i18n / RTL Implications

### Translation keys
All new keys listed above follow the existing `dashboard.*` namespace convention. 20 new keys across 3 language files.

### RTL layout considerations
- **Grid layout** (`grid-cols-2 lg:grid-cols-4`) is direction-agnostic — CSS Grid respects `dir="rtl"` automatically.
- **Card content** uses Tailwind logical properties where directional spacing is needed: `ms-*` / `me-*` / `ps-*` / `pe-*`.
- **Case numbers** in RecentClients should have `dir="ltr"` applied (they are alphanumeric identifiers), consistent with the existing pattern in the codebase.
- **Currency values** from `formatMoney` already use `he-IL` locale which handles RTL currency formatting correctly.
- **Directional icons** (e.g., chevrons for "View All" links) should use `rtl:rotate-180` class if arrow icons are used. However, the design uses text buttons ("View All") without directional icons, so no icon mirroring is needed.

---

## Self-Critique

### Weaknesses in this design

1. **No dashboard-level error UI.** If all 4 metric queries fail simultaneously (e.g., Supabase is down), the dashboard shows 4 zeros with no indication that data failed to load. A future improvement could show a subtle error banner, but this matches the existing pattern in other modules (they also silently show empty states on error).

2. **`totalPending` requires fetching all pending rows.** This is O(n) in the number of pending billing entries firm-wide. For very active firms, this could be slow. An RPC with SQL aggregation would be O(1) but adds deployment complexity. Acceptable tradeoff for now.

3. **Client-side priority sorting in `listOpenByFirm`.** We fetch 50 tasks and sort client-side because PostgREST doesn't support CASE expressions in ORDER BY. If a firm has >50 open tasks, the "top 5 by priority" view might miss some high-priority tasks that fell outside the 50-row window. Mitigation: 50 is generous — most firms have <50 open tasks. If this becomes an issue, we can increase the limit or add a priority_sort column to the tasks table.

4. **Dashboard query invalidation on task toggle.** The `useToggleTaskStatus` hook invalidates `taskKeys.lists()` but not `dashboardKeys`. We handle this with a manual invalidation in the `PendingTasks` component. This is slightly fragile — if someone adds another place that toggles tasks, they'd need to remember to invalidate dashboard keys too. A more robust approach would be to modify `useToggleTaskStatus` to also invalidate dashboard keys, but that would couple the tasks module to the dashboard module. The current approach (component-level invalidation) is the lesser coupling.

5. **Progress bar in SubscriptionStatus uses 365-day reference.** We don't store the plan's total duration in `firmData`, only the expiry date. The 365-day reference is an approximation. For monthly plans (30 days), the progress bar will look nearly empty even at 50% through the plan. This is acceptable as a rough visual indicator — the exact days remaining text is what matters.

### Alternatives considered

- **Single aggregate RPC** — One Supabase edge function that returns all metrics in a single call. Rejected because: increases deployment surface, couples all metrics into one failure domain, and the current codebase has zero RPCs. Adding the first one for dashboard metrics is not justified.

- **Reusing existing list hooks** (e.g., `useClients` to get all clients, then count active ones client-side) — Rejected because: fetches far more data than needed (all client objects vs. a single count), wastes bandwidth, and violates the "query what you need" principle.

- **Dashboard-specific service file** (`dashboardService.ts`) — Rejected because: the queries logically belong to their respective domains (client queries in clientService, task queries in taskService). Creating a cross-cutting service would be a new pattern not established in the codebase.
