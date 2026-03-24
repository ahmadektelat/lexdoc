# Audit Module — Technical Design

## Architecture Approach

The audit module is an **append-only** activity log. It has three layers:

1. **Database** — immutable `audit_log` table with RLS, no UPDATE/DELETE grants
2. **Service + Hooks** — `auditService` (log/list/getByEntity), `useAudit` (React Query reads), `useAuditLog` (fire-and-forget writes)
3. **UI** — `AuditView` (full-page viewer at `/audit`) and `AuditEntityPanel` (embedded in ClientTabs)

**Pagination decision (Option A):** Use the existing `DataTable` with client-side pagination. The service fetches a batch (default 500 entries). A "Load more" button appends the next batch using cursor-based pagination from the service. This keeps the implementation simple and reuses existing infrastructure.

**Why this approach over alternatives:**
- Option B (custom server-side pagination wrapper around DataTable) adds complexity for marginal benefit — most firms will have < 5000 entries at launch
- The "load more" pattern means the initial render is fast (500 rows), and users who need more history can fetch incrementally
- DataTable's built-in sorting and filtering remain fully functional on loaded data

---

## File-by-File Change Plan

### Files to Create

---

#### `supabase/migrations/20260325100000_create_audit_log.sql`

- **Action:** Create
- **Purpose:** Create the immutable audit_log table with indexes and RLS policies
- **Content:**

```sql
-- ============================================================
-- Audit Log Module: immutable activity log
-- CREATED: 2026-03-25
-- ============================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: No updated_at, no deleted_at, no update trigger — immutable by design

-- Indexes
CREATE INDEX idx_audit_log_firm_created ON audit_log(firm_id, created_at DESC);
CREATE INDEX idx_audit_log_firm_entity ON audit_log(firm_id, entity_type, entity_id);
CREATE INDEX idx_audit_log_firm_user ON audit_log(firm_id, user_id);
CREATE INDEX idx_audit_log_firm_action ON audit_log(firm_id, action);

-- RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: firm members can read
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

-- INSERT: firm members can write (logging), must be own user_id
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT
  WITH CHECK (
    firm_id IN (SELECT user_firm_ids())
    AND user_id = auth.uid()
  );

-- UPDATE: NEVER — immutable
CREATE POLICY "audit_log_update" ON audit_log FOR UPDATE
  USING (false);

-- DELETE: NEVER — immutable
CREATE POLICY "audit_log_delete" ON audit_log FOR DELETE
  USING (false);

-- GRANTs — only SELECT and INSERT, no UPDATE or DELETE at the database level
GRANT SELECT, INSERT ON audit_log TO authenticated;
```

- **Rationale:** The immutability is enforced at three levels: (1) no UPDATE/DELETE RLS policies, (2) no UPDATE/DELETE GRANTs, (3) no update/delete methods in the service. This is defense-in-depth.

---

#### `src/services/auditService.ts`

- **Action:** Create
- **Purpose:** Append-only Supabase service for the audit_log table
- **Imports:**
  ```typescript
  import { supabase } from '@/integrations/supabase/client';
  import type { AuditEntry, PaginatedResult } from '@/types';
  ```
- **Exports:**
  ```typescript
  export interface AuditListFilters {
    limit?: number;       // default 500
    cursor?: string;      // ISO datetime string (created_at of last item)
    userId?: string;      // filter by user_id
    action?: string;      // filter by action
    entityType?: string;  // filter by entity_type
    search?: string;      // search in target and user_name
  }

  export const auditService = {
    log(firmId, entry): Promise<void>,
    list(firmId, filters): Promise<PaginatedResult<AuditEntry>>,
    getByEntity(firmId, entityType, entityId): Promise<AuditEntry[]>,
  };
  ```
- **Implementation details:**

  **`rowToAuditEntry` mapper (camelCase <-> snake_case):**
  ```typescript
  function rowToAuditEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as string,
      firm_id: row.firm_id as string,
      userId: row.user_id as string,
      userName: row.user_name as string,
      action: row.action as string,
      target: (row.target as string) ?? undefined,
      timestamp: row.created_at as string,   // maps DB created_at -> type timestamp
      entityType: (row.entity_type as string) ?? undefined,
      entityId: (row.entity_id as string) ?? undefined,
      details: (row.details as Record<string, unknown>) ?? undefined,
    };
  }
  ```

  **`log` method:**
  ```typescript
  async log(
    firmId: string,
    entry: Omit<AuditEntry, 'id' | 'firm_id' | 'timestamp'>
  ): Promise<void> {
    const { error } = await supabase.from('audit_log').insert({
      firm_id: firmId,
      user_id: entry.userId,
      user_name: entry.userName,
      action: entry.action,
      target: entry.target ?? null,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? null,
    });
    if (error) throw new Error(error.message);
  }
  ```
  - No `.select()` after insert — we don't need the row back (fire-and-forget)
  - No `ip_address` in the insert — this would require a server-side function or edge function to capture the client IP. For now, this field is NULL. Can be added later via a Supabase edge function if needed.

  **`list` method:**
  ```typescript
  async list(firmId: string, filters: AuditListFilters = {}): Promise<PaginatedResult<AuditEntry>> {
    const limit = filters.limit ?? 500;

    let query = supabase
      .from('audit_log')
      .select('*')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);  // fetch one extra to determine hasMore

    if (filters.cursor) {
      query = query.lt('created_at', filters.cursor);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }
    if (filters.search) {
      // Sanitize search input — allowlist approach (safer than denylist)
      // Allows: alphanumeric, Hebrew, Arabic, spaces, hyphens
      const sanitized = filters.search.replace(/[^a-zA-Z0-9\u0590-\u05FF\u0600-\u06FF\s\-]/g, '');
      if (sanitized) {
        query = query.or(
          `target.ilike.%${sanitized}%,user_name.ilike.%${sanitized}%`
        );
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data as Record<string, unknown>[]) ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const mapped = items.map(rowToAuditEntry);

    return {
      data: mapped,
      nextCursor: hasMore ? (items[items.length - 1].created_at as string) : null,
      hasMore,
    };
  }
  ```
  - Cursor is the `created_at` value of the last item. Uses `lt` (less than) because we sort DESC.
  - Fetches `limit + 1` to determine if there are more results without a separate count query.

  **`getByEntity` method:**
  ```typescript
  async getByEntity(
    firmId: string,
    entityType: string,
    entityId: string
  ): Promise<AuditEntry[]> {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('firm_id', firmId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(200);   // reasonable cap for entity-scoped queries

    if (error) throw new Error(error.message);
    return ((data as Record<string, unknown>[]) ?? []).map(rowToAuditEntry);
  }
  ```
  - Returns flat array (no pagination) — entity-scoped queries are bounded by the entity's lifetime
  - Limit 200 is a safety cap; most entities will have far fewer entries

- **Rationale:** Follows the `contactService.ts` pattern exactly: `rowToX` mapper, exported service object, all methods take `firmId` as first param. Key differences: no update/delete, cursor-based list, no deleted_at filtering.

---

#### `src/hooks/useAudit.ts`

- **Action:** Create
- **Purpose:** React Query hooks for reading audit data (used by AuditView and AuditEntityPanel)
- **Imports:**
  ```typescript
  import { useQuery } from '@tanstack/react-query';
  import { auditService, type AuditListFilters } from '@/services/auditService';
  import { useAuthStore } from '@/stores/useAuthStore';
  ```
- **Exports:**
  ```typescript
  export const auditKeys = {
    all: ['audit'] as const,
    lists: () => [...auditKeys.all, 'list'] as const,
    list: (firmId: string, filters: AuditListFilters) =>
      [...auditKeys.lists(), firmId, filters] as const,
    entity: (entityType: string, entityId: string) =>
      [...auditKeys.all, 'entity', entityType, entityId] as const,
  };

  export function useAuditEntries(filters: AuditListFilters = {});
  export function useAuditByEntity(entityType: string, entityId: string);
  ```
- **Implementation details:**

  **`useAuditEntries`:**
  ```typescript
  export function useAuditEntries(filters: AuditListFilters = {}) {
    const firmId = useAuthStore((s) => s.firmId);

    return useQuery({
      queryKey: auditKeys.list(firmId ?? '', filters),
      queryFn: () => auditService.list(firmId!, filters),
      enabled: !!firmId,
    });
  }
  ```
  - Returns `PaginatedResult<AuditEntry>` as `data`
  - The component manages accumulated entries and calls this with different cursors for "load more"

  **`useAuditByEntity`:**
  ```typescript
  export function useAuditByEntity(entityType: string, entityId: string) {
    const firmId = useAuthStore((s) => s.firmId);

    return useQuery({
      queryKey: auditKeys.entity(entityType, entityId),
      queryFn: () => auditService.getByEntity(firmId!, entityType, entityId),
      enabled: !!firmId && !!entityType && !!entityId,
    });
  }
  ```
  - Returns `AuditEntry[]` as `data`
  - Used by `AuditEntityPanel` in ClientTabs

- **Rationale:** Follows the `useContacts.ts` pattern. No mutations here — mutations belong in `useAuditLog.ts`. Query keys include filters for proper cache invalidation.

---

#### `src/hooks/useAuditLog.ts`

- **Action:** Create
- **Purpose:** Fire-and-forget logging hook for use by any module
- **Imports:**
  ```typescript
  import { useMutation } from '@tanstack/react-query';
  import { auditService } from '@/services/auditService';
  import { useAuthStore } from '@/stores/useAuthStore';
  ```
- **Exports:**
  ```typescript
  export function useAuditLog(): {
    logAction: (
      action: string,
      target?: string,
      entityType?: string,
      entityId?: string,
      details?: Record<string, unknown>
    ) => void;
  };
  ```
- **Implementation details:**
  ```typescript
  export function useAuditLog() {
    const firmId = useAuthStore((s) => s.firmId);
    const user = useAuthStore((s) => s.user);

    const mutation = useMutation({
      mutationFn: (entry: Omit<AuditEntry, 'id' | 'firm_id' | 'timestamp'>) =>
        auditService.log(firmId!, entry),
      // No onSuccess toast — silent
      // No onError toast — silent; audit failures must not disrupt the user
    });

    const logAction = (
      action: string,
      target?: string,
      entityType?: string,
      entityId?: string,
      details?: Record<string, unknown>
    ) => {
      if (!firmId || !user) return;   // guard: no auth = no log

      mutation.mutate({
        userId: user.id,
        userName: user.name ?? user.email ?? 'Unknown',
        action,
        target,
        entityType,
        entityId,
        details,
      });
    };

    return { logAction };
  }
  ```

  **Fire-and-forget pattern:** `mutation.mutate()` (not `mutateAsync`) is called without awaiting. The calling component never blocks on audit logging. No toast is shown on success or failure — audit is infrastructure, not a user-facing operation.

  **Usage example in other modules:**
  ```typescript
  const { logAction } = useAuditLog();

  // After creating a client:
  logAction('create', clientName, 'client', newClient.id);

  // After updating a filing:
  logAction('statusChange', `${filingType} - ${period}`, 'filing', filingId, { oldStatus, newStatus });
  ```

- **Rationale:** Separating the write hook from the read hooks keeps concerns clean. The read hooks are only used in audit UI; the write hook is used everywhere. No query invalidation on write — the audit view will refetch when navigated to, and stale-while-revalidate is fine for a log.

---

#### `src/components/audit/AuditView.tsx`

- **Action:** Create
- **Purpose:** Full-page audit log viewer at `/audit`
- **Imports:**
  ```typescript
  import { useState, useRef, useMemo, useCallback } from 'react';
  import { Navigate } from 'react-router-dom';
  import type { ColumnDef } from '@tanstack/react-table';
  import { ScrollText } from 'lucide-react';
  import { useLanguage } from '@/contexts/LanguageContext';
  import { useAuthStore } from '@/stores/useAuthStore';
  import { useAuditEntries } from '@/hooks/useAudit';
  import type { AuditEntry } from '@/types';
  import type { AuditListFilters } from '@/services/auditService';
  import { formatDateTime } from '@/lib/dates';
  import { PageHeader } from '@/components/shared/PageHeader';
  import { DataTable } from '@/components/shared/DataTable';
  import { EmptyState } from '@/components/shared/EmptyState';
  import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  } from '@/components/ui/select';
  import { cn } from '@/lib/utils';
  ```
- **Exports:**
  ```typescript
  export function AuditView(): JSX.Element;
  ```
- **Implementation details:**

  **State management:**
  ```typescript
  // Filters — use 'all' sentinel for selects (Radix Select requires non-empty value)
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Accumulated entries for "load more" pattern
  const [allEntries, setAllEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  // Track whether current fetch is a "load more" vs a fresh filter fetch
  const isLoadMoreRef = useRef(false);
  ```

  **Query filters object:**
  ```typescript
  const filters: AuditListFilters = useMemo(() => ({
    limit: 500,
    cursor,
    action: actionFilter === 'all' ? undefined : actionFilter,
    entityType: entityFilter === 'all' ? undefined : entityFilter,
    search: search || undefined,
  }), [cursor, actionFilter, entityFilter, search]);
  ```

  **Data fetching with accumulation:**
  The component uses `useAuditEntries(filters)` and accumulates results. When filters change (action, entity, search), the accumulated data resets. When "load more" is clicked, cursor advances and new results append.

  ```typescript
  const { data: result, isLoading, isFetching } = useAuditEntries(filters);

  // When result changes, merge into allEntries
  // Uses isLoadMoreRef to avoid stale closure over cursor
  useEffect(() => {
    if (!result) return;
    if (isLoadMoreRef.current) {
      // "Load more" — append
      setAllEntries((prev) => [...prev, ...result.data]);
      isLoadMoreRef.current = false;
    } else {
      // Fresh fetch (filter changed)
      setAllEntries(result.data);
    }
    setHasMore(result.hasMore);
  }, [result]);

  // Reset when filters change
  useEffect(() => {
    setCursor(undefined);
    setAllEntries([]);
    isLoadMoreRef.current = false;
  }, [actionFilter, entityFilter, search]);
  ```

  **Load more handler:**
  ```typescript
  const handleLoadMore = useCallback(() => {
    if (result?.nextCursor) {
      isLoadMoreRef.current = true;
      setCursor(result.nextCursor);
    }
  }, [result]);
  ```

  **Permission check:**
  ```typescript
  const can = useAuthStore((s) => s.can);
  if (!can('settings.audit')) return <Navigate to="/dashboard" />;
  ```
  Follows the same pattern as `ReportsView` (line 49).

  **Action badge color mapping:**
  ```typescript
  const ACTION_COLORS: Record<string, string> = {
    create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    login: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    logout: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    export: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    import: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    statusChange: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  };
  ```
  This follows the same pattern as `StatusBadge` and `PriorityBadge` — color classes with both light and dark variants using Tailwind. The key is the action string stored in the DB.

  **Column definitions:**
  ```typescript
  const columns: ColumnDef<AuditEntry, unknown>[] = useMemo(() => [
    {
      accessorKey: 'timestamp',
      header: t('audit.timestamp'),
      cell: ({ row }) => (
        <span dir="ltr" className="text-muted-foreground text-xs">
          {formatDateTime(row.original.timestamp)}
        </span>
      ),
      sortingFn: 'datetime',
    },
    {
      accessorKey: 'userName',
      header: t('audit.user'),
    },
    {
      accessorKey: 'action',
      header: t('audit.action'),
      cell: ({ row }) => {
        const action = row.original.action;
        const colorClass = ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
        return (
          <Badge className={cn('border-transparent', colorClass)}>
            {t(`audit.actions.${action}`) || action}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'target',
      header: t('audit.target'),
      cell: ({ row }) => row.original.target ?? '—',
    },
    {
      accessorKey: 'entityType',
      header: t('audit.entityType'),
      cell: ({ row }) => {
        const et = row.original.entityType;
        return et ? (t(`audit.entities.${et}`) || et) : '—';
      },
    },
  ], [t]);
  ```
  - `timestamp` column has `dir="ltr"` for correct date rendering in RTL
  - Action badge uses the color map with a fallback for unknown actions
  - Entity type renders translated label with raw fallback

  **Filter UI — three Select dropdowns above the DataTable:**
  ```typescript
  const AUDIT_ACTIONS = [
    'create', 'update', 'delete', 'login', 'logout', 'export', 'import', 'statusChange'
  ] as const;

  const ENTITY_TYPES = [
    'client', 'filing', 'billing', 'invoice', 'task',
    'contact', 'document', 'staff', 'role', 'message'
  ] as const;
  ```

  Rendered as:
  ```tsx
  <div className="flex items-center gap-3 flex-wrap">
    {/* Search */}
    <SearchInput
      value={search}
      onChange={setSearch}
      placeholder={t('common.searchPlaceholder')}
      className="max-w-sm"
    />

    {/* Action filter */}
    <Select value={actionFilter} onValueChange={setActionFilter}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={t('audit.allActions')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('audit.allActions')}</SelectItem>
        {AUDIT_ACTIONS.map((a) => (
          <SelectItem key={a} value={a}>{t(`audit.actions.${a}`)}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    {/* Entity type filter */}
    <Select value={entityFilter} onValueChange={setEntityFilter}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={t('audit.allEntities')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('audit.allEntities')}</SelectItem>
        {ENTITY_TYPES.map((e) => (
          <SelectItem key={e} value={e}>{t(`audit.entities.${e}`)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  ```

  Note: The `filterByUser` filter from requirements is excluded from the initial build. Listing all firm users requires an additional query, and the search input already covers searching by user name. This can be added later if needed.

  **DataTable integration:**
  ```tsx
  <DataTable
    columns={columns}
    data={allEntries}
    emptyMessage={t('audit.noEntries')}
    pageSize={20}
  />
  ```
  - DataTable handles its own client-side pagination on the `allEntries` array
  - `searchable` is NOT passed — we use our own SearchInput above because we need server-side search (to limit data fetched from Supabase)

  **Load more button:**
  ```tsx
  {hasMore && (
    <div className="flex justify-center mt-4">
      <Button
        variant="outline"
        onClick={handleLoadMore}
        disabled={isFetching}
      >
        {isFetching ? t('common.loading') : t('audit.loadMore')}
      </Button>
    </div>
  )}
  ```

  **Full component layout:**
  ```tsx
  <div className="p-6 animate-fade-in">
    <PageHeader title={t('audit.title')} description={t('audit.description')} />
    <div className="space-y-4">
      {/* Filter bar */}
      {/* DataTable */}
      {/* Load more button */}
    </div>
  </div>
  ```
  - If loading the first batch: show `<LoadingSpinner size="lg" className="py-20" />`
  - If loaded but empty: show `<EmptyState icon={ScrollText} title={t('audit.noEntries')} description={t('audit.noEntriesDesc')} />`

- **Rationale:** The view follows the `ReportsView` pattern for permission checks and layout. Filter UI uses the same `Select` components seen in DataTable's page-size dropdown and ReportsView's year picker. The "load more" pattern is straightforward: accumulate entries in state, advance cursor on click.

---

#### `src/components/audit/AuditEntityPanel.tsx`

- **Action:** Create
- **Purpose:** Embedded audit trail panel for use in ClientTabs activity tab (and potentially other entity detail views)
- **Imports:**
  ```typescript
  import { useMemo } from 'react';
  import type { ColumnDef } from '@tanstack/react-table';
  import { ScrollText } from 'lucide-react';
  import { useLanguage } from '@/contexts/LanguageContext';
  import { useAuditByEntity } from '@/hooks/useAudit';
  import type { AuditEntry } from '@/types';
  import { formatDateTime } from '@/lib/dates';
  import { DataTable } from '@/components/shared/DataTable';
  import { EmptyState } from '@/components/shared/EmptyState';
  import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
  import { Badge } from '@/components/ui/badge';
  import { cn } from '@/lib/utils';
  ```
- **Exports:**
  ```typescript
  export interface AuditEntityPanelProps {
    entityType: string;
    entityId: string;
  }

  export function AuditEntityPanel(props: AuditEntityPanelProps): JSX.Element;
  ```
- **Implementation details:**

  This is a simpler version of AuditView — no filters, no load more, just a DataTable showing all entries for one entity.

  ```typescript
  export function AuditEntityPanel({ entityType, entityId }: AuditEntityPanelProps) {
    const { t } = useLanguage();
    const { data: entries = [], isLoading } = useAuditByEntity(entityType, entityId);

    // Reuse ACTION_COLORS from AuditView — define as shared constant at module level
    // or duplicate inline (small enough not to warrant a shared file)

    const columns: ColumnDef<AuditEntry, unknown>[] = useMemo(() => [
      {
        accessorKey: 'timestamp',
        header: t('audit.timestamp'),
        cell: ({ row }) => (
          <span dir="ltr" className="text-muted-foreground text-xs">
            {formatDateTime(row.original.timestamp)}
          </span>
        ),
      },
      {
        accessorKey: 'userName',
        header: t('audit.user'),
      },
      {
        accessorKey: 'action',
        header: t('audit.action'),
        cell: ({ row }) => {
          const action = row.original.action;
          const colorClass = ACTION_COLORS[action] ?? '...fallback...';
          return (
            <Badge className={cn('border-transparent', colorClass)}>
              {t(`audit.actions.${action}`) || action}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'target',
        header: t('audit.target'),
        cell: ({ row }) => row.original.target ?? '—',
      },
    ], [t]);

    if (isLoading) return <LoadingSpinner size="md" className="py-12" />;
    if (entries.length === 0) {
      return (
        <EmptyState
          icon={ScrollText}
          title={t('audit.noEntries')}
          description={t('audit.noEntriesDesc')}
        />
      );
    }

    return (
      <DataTable
        columns={columns}
        data={entries}
        pageSize={10}
      />
    );
  }
  ```

  - No entity type column (already scoped)
  - No search/filter (small dataset)
  - pageSize 10 since this is a tab panel, not a full page

  **Shared ACTION_COLORS:** Define `ACTION_COLORS` in a small constant object in `AuditView.tsx` and import it in `AuditEntityPanel.tsx`. Alternatively, since it's just 8 key-value pairs, duplicating it is acceptable and avoids a premature abstraction. The design recommends **extracting it to a shared const** within the audit component folder:

  Create a small file `src/components/audit/auditConstants.ts`:
  ```typescript
  export const ACTION_COLORS: Record<string, string> = {
    create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    login: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    logout: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    export: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    import: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    statusChange: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  };

  export const AUDIT_ACTIONS = [
    'create', 'update', 'delete', 'login', 'logout', 'export', 'import', 'statusChange',
  ] as const;

  export const ENTITY_TYPES = [
    'client', 'filing', 'billing', 'invoice', 'task',
    'contact', 'document', 'staff', 'role', 'message',
  ] as const;
  ```

- **Rationale:** Extracting to a constants file avoids duplication between AuditView and AuditEntityPanel while keeping it scoped to the audit module (not a global shared constant — these are audit-specific).

---

### Files to Modify

---

#### `src/App.tsx`

- **Action:** Modify
- **Lines to change:** Line 86 (audit route) and add import at top
- **Old (line 86):**
  ```tsx
  <Route path="audit" element={<SectionPlaceholder section="audit" />} />
  ```
- **New (line 86):**
  ```tsx
  <Route path="audit" element={<AuditView />} />
  ```
- **Add import (after line 27, with other view imports):**
  ```typescript
  import { AuditView } from '@/components/audit/AuditView';
  ```
- **Rationale:** Replaces the placeholder with the real audit view component.

---

#### `src/components/clients/ClientTabs.tsx`

- **Action:** Modify
- **Lines to change:** Lines 49-55 (activity tab content) and add import at top
- **Old (lines 49-55):**
  ```tsx
  <TabsContent value="activity">
    <EmptyState
      icon={Activity}
      title={t('clients.tabs.activity')}
      description={t('clients.tabs.activityPlaceholder')}
    />
  </TabsContent>
  ```
- **New:**
  ```tsx
  <TabsContent value="activity">
    <AuditEntityPanel entityType="client" entityId={clientId} />
  </TabsContent>
  ```
- **Add import (at top, with other imports):**
  ```typescript
  import { AuditEntityPanel } from '@/components/audit/AuditEntityPanel';
  ```
- **Remove unused import:** The `Activity` icon import from lucide-react can be removed if it's no longer used elsewhere in the file. Check first — if it's only used for the placeholder, remove it.
- **Rationale:** Replaces the activity tab placeholder with the real audit entity panel. No separate permission check needed — the client detail view already checks `clients.view`.

---

#### `src/i18n/he.ts`

- **Action:** Modify
- **Location:** Before the closing `};` (after line 807)
- **Keys to add:**

```typescript
  // Audit
  'audit.title': 'יומן פעילות',
  'audit.description': 'צפייה בכל הפעולות שבוצעו במערכת',
  'audit.timestamp': 'תאריך ושעה',
  'audit.user': 'משתמש',
  'audit.action': 'פעולה',
  'audit.target': 'יעד',
  'audit.entityType': 'סוג ישות',
  'audit.entityId': 'מזהה ישות',
  'audit.noEntries': 'אין רשומות ביומן הפעילות',
  'audit.noEntriesDesc': 'פעולות שיבוצעו במערכת ירשמו כאן',
  'audit.filterByUser': 'סנן לפי משתמש',
  'audit.filterByAction': 'סנן לפי פעולה',
  'audit.filterByEntity': 'סנן לפי סוג ישות',
  'audit.allUsers': 'כל המשתמשים',
  'audit.allActions': 'כל הפעולות',
  'audit.allEntities': 'כל הישויות',
  'audit.details': 'פרטים',
  'audit.loadMore': 'טען עוד',
  'audit.actions.create': 'יצירה',
  'audit.actions.update': 'עדכון',
  'audit.actions.delete': 'מחיקה',
  'audit.actions.login': 'כניסה',
  'audit.actions.logout': 'יציאה',
  'audit.actions.export': 'ייצוא',
  'audit.actions.import': 'ייבוא',
  'audit.actions.statusChange': 'שינוי סטטוס',
  'audit.entities.client': 'לקוח',
  'audit.entities.filing': 'הגשה',
  'audit.entities.billing': 'חיוב',
  'audit.entities.invoice': 'חשבונית',
  'audit.entities.task': 'משימה',
  'audit.entities.contact': 'איש קשר',
  'audit.entities.document': 'מסמך',
  'audit.entities.staff': 'עובד',
  'audit.entities.role': 'תפקיד',
  'audit.entities.message': 'הודעה',
```

---

#### `src/i18n/ar.ts`

- **Action:** Modify
- **Location:** Before the closing `};`
- **Keys to add:**

```typescript
  // Audit
  'audit.title': 'سجل النشاط',
  'audit.description': 'عرض جميع الأنشطة في النظام',
  'audit.timestamp': 'التاريخ والوقت',
  'audit.user': 'المستخدم',
  'audit.action': 'الإجراء',
  'audit.target': 'الهدف',
  'audit.entityType': 'نوع الكيان',
  'audit.entityId': 'معرف الكيان',
  'audit.noEntries': 'لا توجد سجلات نشاط',
  'audit.noEntriesDesc': 'ستظهر الأنشطة المسجلة هنا',
  'audit.filterByUser': 'تصفية حسب المستخدم',
  'audit.filterByAction': 'تصفية حسب الإجراء',
  'audit.filterByEntity': 'تصفية حسب نوع الكيان',
  'audit.allUsers': 'جميع المستخدمين',
  'audit.allActions': 'جميع الإجراءات',
  'audit.allEntities': 'جميع الكيانات',
  'audit.details': 'التفاصيل',
  'audit.loadMore': 'تحميل المزيد',
  'audit.actions.create': 'إنشاء',
  'audit.actions.update': 'تحديث',
  'audit.actions.delete': 'حذف',
  'audit.actions.login': 'تسجيل دخول',
  'audit.actions.logout': 'تسجيل خروج',
  'audit.actions.export': 'تصدير',
  'audit.actions.import': 'استيراد',
  'audit.actions.statusChange': 'تغيير الحالة',
  'audit.entities.client': 'عميل',
  'audit.entities.filing': 'تقديم',
  'audit.entities.billing': 'فاتورة',
  'audit.entities.invoice': 'فاتورة',
  'audit.entities.task': 'مهمة',
  'audit.entities.contact': 'جهة اتصال',
  'audit.entities.document': 'مستند',
  'audit.entities.staff': 'موظف',
  'audit.entities.role': 'دور',
  'audit.entities.message': 'رسالة',
```

---

#### `src/i18n/en.ts`

- **Action:** Modify
- **Location:** Before the closing `};`
- **Keys to add:**

```typescript
  // Audit
  'audit.title': 'Activity Log',
  'audit.description': 'View all system activity',
  'audit.timestamp': 'Date & Time',
  'audit.user': 'User',
  'audit.action': 'Action',
  'audit.target': 'Target',
  'audit.entityType': 'Entity Type',
  'audit.entityId': 'Entity ID',
  'audit.noEntries': 'No audit log entries',
  'audit.noEntriesDesc': 'System actions will be recorded here',
  'audit.filterByUser': 'Filter by user',
  'audit.filterByAction': 'Filter by action',
  'audit.filterByEntity': 'Filter by entity type',
  'audit.allUsers': 'All users',
  'audit.allActions': 'All actions',
  'audit.allEntities': 'All entities',
  'audit.details': 'Details',
  'audit.loadMore': 'Load more',
  'audit.actions.create': 'Create',
  'audit.actions.update': 'Update',
  'audit.actions.delete': 'Delete',
  'audit.actions.login': 'Login',
  'audit.actions.logout': 'Logout',
  'audit.actions.export': 'Export',
  'audit.actions.import': 'Import',
  'audit.actions.statusChange': 'Status Change',
  'audit.entities.client': 'Client',
  'audit.entities.filing': 'Filing',
  'audit.entities.billing': 'Billing',
  'audit.entities.invoice': 'Invoice',
  'audit.entities.task': 'Task',
  'audit.entities.contact': 'Contact',
  'audit.entities.document': 'Document',
  'audit.entities.staff': 'Staff',
  'audit.entities.role': 'Role',
  'audit.entities.message': 'Message',
```

---

## Data Flow

### Reading (AuditView)

```
User opens /audit
  → ProtectedRoute checks auth
  → AuditView checks can('settings.audit')
  → useAuditEntries(filters) → auditService.list(firmId, filters)
    → supabase.from('audit_log').select('*').eq('firm_id', firmId)...
    → RLS: firm_id IN (SELECT user_firm_ids())
    → Returns rows → rowToAuditEntry mapping → PaginatedResult<AuditEntry>
  → DataTable renders entries with client-side pagination
  → User clicks "Load more" → cursor advances → new batch appends
```

### Reading (ClientTabs Activity Tab)

```
User views client detail → clicks Activity tab
  → AuditEntityPanel renders
  → useAuditByEntity('client', clientId) → auditService.getByEntity(...)
    → supabase.from('audit_log').select('*')
        .eq('firm_id', firmId)
        .eq('entity_type', 'client')
        .eq('entity_id', clientId)
    → RLS check → Returns rows → map → AuditEntry[]
  → DataTable renders (no pagination needed for most entities)
```

### Writing (Fire-and-Forget)

```
User performs action (e.g., creates a client)
  → Module's mutation.onSuccess callback:
      const { logAction } = useAuditLog();
      logAction('create', clientName, 'client', newClient.id);
  → useAuditLog internally:
      mutation.mutate({
        userId: user.id,
        userName: user.name,
        action: 'create',
        target: clientName,
        entityType: 'client',
        entityId: newClient.id,
      })
  → auditService.log(firmId, entry)
    → supabase.from('audit_log').insert({
        firm_id, user_id, user_name, action, target, entity_type, entity_id
      })
    → RLS: WITH CHECK (firm_id IN (SELECT user_firm_ids()))
    → Row inserted into audit_log table
  → No await, no toast, no UI feedback — fire-and-forget
```

---

## Database Changes

### New Table: `audit_log`
- See migration file above for full schema
- No foreign key on `user_id` — the user could be deleted later, but their audit entries must persist
- No foreign key on `entity_id` — the entity could be soft-deleted, but audit entries are permanent
- `user_name TEXT NOT NULL` — denormalized for display performance (avoids JOIN on every query)

### Indexes
1. `idx_audit_log_firm_created` — primary query (paginated list sorted by time)
2. `idx_audit_log_firm_entity` — entity lookup (activity tab)
3. `idx_audit_log_firm_user` — user filter
4. `idx_audit_log_firm_action` — action filter

### RLS Policies
- SELECT: `firm_id IN (SELECT user_firm_ids())`
- INSERT: `firm_id IN (SELECT user_firm_ids())`
- UPDATE: `USING (false)` — blocked
- DELETE: `USING (false)` — blocked

### GRANTs
- `GRANT SELECT, INSERT ON audit_log TO authenticated`
- No UPDATE or DELETE grants

### Why no `firm_subscription_active(firm_id)` on INSERT?
The contacts and other entity tables check `firm_subscription_active(firm_id)` on INSERT. For audit_log, we intentionally omit this. Audit logging should work even during subscription grace periods — a user logging in should still generate an audit entry. The subscription check is an authorization concern for business operations, not infrastructure logging.

---

## Edge Cases & Error Handling

1. **Audit service.log() fails** → The error is swallowed by `useMutation` (no `onError` handler). The user's primary action (e.g., create client) has already succeeded. Audit failure is non-blocking. If the Supabase insert fails (e.g., network issue), the entry is lost — this is acceptable for a v1. A retry queue could be added later.

2. **User with no name** → `useAuditLog` falls back to `user.email ?? 'Unknown'` for userName. This ensures the column is never null.

3. **Unknown action type in badge** → Falls back to gray styling with the raw action string as label. `t('audit.actions.${action}')` returns the key itself if not found in translations — the raw string is still readable.

4. **Empty search string** → Treated as undefined (no filter applied). The `|| undefined` coercion handles this.

5. **Concurrent "load more" clicks** → The button is disabled while `isFetching` is true. React Query deduplicates queries with the same key.

6. **Filter change during load more** → The `useEffect` that watches `[actionFilter, entityFilter, search]` resets `cursor` and `allEntries`. This cancels any in-flight "load more" by changing the query key.

7. **Large entry counts (10k+)** → The 500-entry batch size keeps initial load fast. Users can "load more" incrementally. DataTable's client-side pagination (20 rows/page) means the DOM never renders more than 20 rows at once even with thousands in memory.

8. **RTL layout** → Dates use `dir="ltr"` to prevent reversed digit order. Badge text is naturally RTL. Filter bar uses `gap-3` which respects flex direction. No explicit `ms-`/`me-` needed since layout is symmetric.

---

## Performance Considerations

- **Index on (firm_id, created_at DESC)** — the primary query always filters by firm_id and sorts by created_at. This composite index covers both in a single scan.
- **No COUNT(*)** — we use the `limit + 1` trick instead of a separate count query.
- **Denormalized user_name** — avoids a JOIN with the users table on every audit query.
- **200-row cap on getByEntity** — prevents a single entity with extremely high activity from causing a large response.
- **Cursor-based pagination** — O(1) per page regardless of total row count (unlike OFFSET which is O(n)).
- **No refetch on mutation** — `useAuditLog` does not invalidate audit query caches. The audit view refetches on mount (default staleTime), not on every write. This keeps write operations fast.

---

## i18n / RTL Implications

### New translation keys
- 31 new keys in the `audit.*` section (see i18n modification sections above)
- 1 new key: `audit.loadMore` (not in original requirements — needed for the "load more" button)
- The key `clients.tabs.activityPlaceholder` is no longer referenced after the change but should NOT be deleted (other code might reference it, and deleting keys is against the rules)

### RTL layout considerations
- `dir="ltr"` on timestamp cells to prevent RTL digit reversal
- Filter bar uses flexbox with `gap` — works correctly in both RTL and LTR
- Badge text is content-driven and works correctly in RTL
- Select dropdowns inherit the document's `dir` attribute automatically via shadcn/Radix

---

## Self-Critique

### What could go wrong with this approach

1. **Accumulated state complexity in AuditView**: Managing `allEntries`, `cursor`, and `hasMore` manually alongside React Query is somewhat fragile. If the user rapidly changes filters while a "load more" is in flight, there could be a brief flash of stale data. Mitigation: the reset effect clears state immediately on filter change.

2. **No user dropdown filter**: The requirements specify a "filter by user" select, but the design omits it for v1 because it requires fetching the staff list. This is a conscious trade-off — the search input covers searching by user name. A dedicated user select can be added in a follow-up if requested.

3. **Lost audit entries on network failure**: Fire-and-forget means audit entries are silently dropped on failure. For a legal/accounting app, this could be a compliance concern in the long term. Mitigation for v1: the service throws on error, and while the mutation swallows it, it's still visible in React Query devtools. A proper solution would be a retry queue or edge function with server-side logging.

4. **ip_address field is always NULL**: The client-side Supabase insert cannot capture the client's IP address. This would require a Supabase edge function or database trigger using `inet_client_addr()`. Left as NULL for v1.

5. **No date range filter**: The requirements mention date range filtering but the design uses cursor-based pagination instead. Users can scroll through time via "load more", but cannot jump to a specific date range. This simplifies the implementation but may frustrate users looking for entries from a specific period.

### Alternative approaches considered

- **Server-side pagination wrapper around DataTable**: Rejected because it adds significant complexity (custom pagination UI, disable DataTable's built-in pagination) for marginal benefit at current scale.
- **Infinite scroll**: Rejected because it's harder to implement correctly with RTL layouts and doesn't play well with DataTable's built-in pagination.
- **Shared ActionBadge component in `src/components/shared/`**: Rejected because audit action types are domain-specific and not reused outside the audit module. Keeping the color map in `auditConstants.ts` within the audit folder is the right scope.
- **useInfiniteQuery from React Query**: Considered for the "load more" pattern, which would be more idiomatic. However, it adds complexity around cursor management that the manual approach handles more transparently. This could be refactored to `useInfiniteQuery` in the future if the pattern proves stable.

---

## Summary of All Files

### To Create (6 files)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260325100000_create_audit_log.sql` | Immutable audit_log table, indexes, RLS, GRANTs |
| `src/services/auditService.ts` | Append-only service: log, list, getByEntity |
| `src/hooks/useAudit.ts` | React Query read hooks: useAuditEntries, useAuditByEntity |
| `src/hooks/useAuditLog.ts` | Fire-and-forget write hook: useAuditLog |
| `src/components/audit/AuditView.tsx` | Full-page audit log viewer with filters |
| `src/components/audit/AuditEntityPanel.tsx` | Embedded entity audit trail panel |
| `src/components/audit/auditConstants.ts` | Shared action colors and type arrays |

### To Modify (5 files)

| File | Change |
|------|--------|
| `src/App.tsx` | Import AuditView, replace SectionPlaceholder on audit route |
| `src/components/clients/ClientTabs.tsx` | Import AuditEntityPanel, replace activity tab placeholder |
| `src/i18n/he.ts` | Add ~31 `audit.*` keys |
| `src/i18n/ar.ts` | Add ~31 `audit.*` keys |
| `src/i18n/en.ts` | Add ~31 `audit.*` keys |
