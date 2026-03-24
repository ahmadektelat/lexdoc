# Audit Module — Requirements Document

## Task Summary

Implement an immutable audit log module: a database-backed activity logger with a full-page viewer (`/audit`), a reusable logging hook for other modules, and a client-scoped activity tab in `ClientTabs`. The audit log is **append-only** — no edit, no delete, ever.

---

## Existing Shared Code to Import

### Types (from `src/types/`)

| Import | Path | Notes |
|--------|------|-------|
| `AuditEntry` | `@/types` (barrel via `src/types/audit.ts`) | Already defined: `id, firm_id, userId, userName, action, target?, timestamp, entityType?, entityId?, details?` |
| `PaginatedResult<T>` | `@/types` (barrel via `src/types/common.ts`) | `{ data: T[]; nextCursor: string \| null; hasMore: boolean }` |
| `ListOptions` | `@/types` (barrel via `src/types/common.ts`) | `{ firmId, limit?, cursor?, search? }` |

### Utilities (from `src/lib/`)

| Import | Path | Notes |
|--------|------|-------|
| `formatDateTime` | `@/lib/dates` | For displaying `timestamp` column — returns `DD/MM/YYYY HH:MM` |
| `formatDate` | `@/lib/dates` | For date-only display if needed |

### Shared Components (from `src/components/shared/`)

| Import | Path | Props |
|--------|------|-------|
| `PageHeader` | `@/components/shared/PageHeader` | `{ title, description?, children? }` |
| `DataTable` | `@/components/shared/DataTable` | `{ columns, data, onRowClick?, emptyMessage?, pageSize?, searchable?, searchPlaceholder? }` — uses TanStack Table, built-in pagination/sort/filter |
| `EmptyState` | `@/components/shared/EmptyState` | `{ icon: LucideIcon, title, description? }` |
| `LoadingSpinner` | `@/components/shared/LoadingSpinner` | `{ size?: 'sm'\|'md'\|'lg', className? }` |
| `SearchInput` | `@/components/shared/SearchInput` | `{ value, onChange, placeholder?, debounceMs?, className? }` |
| `StatusBadge` | `@/components/shared/StatusBadge` | Could serve as reference pattern for color-coded action badge, but audit actions (`create`, `update`, `delete`, `login`, etc.) are NOT the same as existing statuses. Will need a local `ActionBadge` or inline color logic. |

### Stores

| Import | Path | Notes |
|--------|------|-------|
| `useAuthStore` | `@/stores/useAuthStore` | Provides `user`, `firmId`, `firmName`, `role`, `can()` — needed for permission check and pre-filling userId/userName in the logging hook |

### Context

| Import | Path | Notes |
|--------|------|-------|
| `useLanguage` | `@/contexts/LanguageContext` | `{ t, language, setLanguage }` — used in every component |

### Supabase Client

| Import | Path | Notes |
|--------|------|-------|
| `supabase` | `@/integrations/supabase/client` | Standard Supabase client instance |

---

## Service Pattern to Follow

**Reference:** `src/services/contactService.ts`

Pattern:
```typescript
import { supabase } from '@/integrations/supabase/client';
import type { AuditEntry } from '@/types';

function rowToAuditEntry(row: Record<string, unknown>): AuditEntry { /* ... */ }

export const auditService = {
  async log(firmId: string, entry: Omit<AuditEntry, 'id' | 'firm_id' | 'timestamp'>): Promise<void> { /* INSERT only */ },
  async list(firmId: string, filters: AuditListFilters): Promise<PaginatedResult<AuditEntry>> { /* SELECT with cursor pagination */ },
  async getByEntity(firmId: string, entityType: string, entityId: string): Promise<AuditEntry[]> { /* filter by entity */ },
  // NO update, NO delete methods
};
```

Key differences from other services:
- **No `update()`** — immutable
- **No `delete()`** — immutable
- **No `deleted_at` filter** — audit entries are never soft-deleted
- **Cursor-based pagination** using `created_at` as cursor (matches `PaginatedResult<T>` type)

---

## Hook Pattern to Follow

**Reference:** `src/hooks/useContacts.ts`

Two hooks needed:

### 1. `useAudit.ts` — React Query hooks for the AuditView

```typescript
export const auditKeys = {
  all: ['audit'] as const,
  lists: () => [...auditKeys.all, 'list'] as const,
  list: (firmId: string, filters: AuditListFilters) => [...auditKeys.lists(), firmId, filters] as const,
  entity: (entityType: string, entityId: string) => [...auditKeys.all, 'entity', entityType, entityId] as const,
};

export function useAuditEntries(firmId, filters) { /* useQuery wrapping auditService.list */ }
export function useAuditByEntity(firmId, entityType, entityId) { /* useQuery wrapping auditService.getByEntity */ }
```

### 2. `useAuditLog.ts` — Fire-and-forget logging helper

```typescript
export function useAuditLog() {
  // reads userId, userName from useAuthStore
  // returns logAction(action, target?, entityType?, entityId?, details?)
  // fire-and-forget: does NOT await, does NOT block UI
  // uses useMutation but does NOT show toasts (silent)
}
```

---

## i18n Keys Needed

**Section:** `audit.*` — does NOT exist yet in any language file. Must be added to all three:
- `src/i18n/he.ts`
- `src/i18n/ar.ts`
- `src/i18n/en.ts`

### Keys to add:

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `audit.title` | יומן פעילות | سجل النشاط | Activity Log |
| `audit.description` | צפייה בכל הפעולות שבוצעו במערכת | عرض جميع الأنشطة في النظام | View all system activity |
| `audit.timestamp` | תאריך ושעה | التاريخ والوقت | Date & Time |
| `audit.user` | משתמש | المستخدم | User |
| `audit.action` | פעולה | الإجراء | Action |
| `audit.target` | יעד | الهدف | Target |
| `audit.entityType` | סוג ישות | نوع الكيان | Entity Type |
| `audit.entityId` | מזהה ישות | معرف الكيان | Entity ID |
| `audit.noEntries` | אין רשומות ביומן הפעילות | لا توجد سجلات نشاط | No audit log entries |
| `audit.noEntriesDesc` | פעולות שיבוצעו במערכת ירשמו כאן | ستظهر الأنشطة المسجلة هنا | System actions will be recorded here |
| `audit.filterByUser` | סנן לפי משתמש | تصفية حسب المستخدم | Filter by user |
| `audit.filterByAction` | סנן לפי פעולה | تصفية حسب الإجراء | Filter by action |
| `audit.filterByEntity` | סנן לפי סוג ישות | تصفية حسب نوع الكيان | Filter by entity type |
| `audit.allUsers` | כל המשתמשים | جميع المستخدمين | All users |
| `audit.allActions` | כל הפעולות | جميع الإجراءات | All actions |
| `audit.allEntities` | כל הישויות | جميع الكيانات | All entities |
| `audit.details` | פרטים | التفاصيل | Details |

### Action type labels (for color-coded badges):

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `audit.actions.create` | יצירה | إنشاء | Create |
| `audit.actions.update` | עדכון | تحديث | Update |
| `audit.actions.delete` | מחיקה | حذف | Delete |
| `audit.actions.login` | כניסה | تسجيل دخول | Login |
| `audit.actions.logout` | יציאה | تسجيل خروج | Logout |
| `audit.actions.export` | ייצוא | تصدير | Export |
| `audit.actions.import` | ייבוא | استيراد | Import |
| `audit.actions.statusChange` | שינוי סטטוס | تغيير الحالة | Status Change |

### Entity type labels:

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `audit.entities.client` | לקוח | عميل | Client |
| `audit.entities.filing` | הגשה | تقديم | Filing |
| `audit.entities.billing` | חיוב | فاتورة | Billing |
| `audit.entities.invoice` | חשבונית | فاتورة | Invoice |
| `audit.entities.task` | משימה | مهمة | Task |
| `audit.entities.contact` | איש קשר | جهة اتصال | Contact |
| `audit.entities.document` | מסמך | مستند | Document |
| `audit.entities.staff` | עובד | موظف | Staff |
| `audit.entities.role` | תפקיד | دور | Role |
| `audit.entities.message` | הודעה | رسالة | Message |

Also update the existing placeholder key:
- `clients.tabs.activityPlaceholder` — will no longer be needed once the activity tab is wired up

---

## Router Integration Point

**File:** `src/App.tsx:86`

Current state:
```tsx
<Route path="audit" element={<SectionPlaceholder section="audit" />} />
```

Change to:
```tsx
import { AuditView } from '@/components/audit/AuditView';
// ...
<Route path="audit" element={<AuditView />} />
```

**Sidebar:** Already wired — `src/components/layout/Sidebar.tsx:37` has `{ path: '/audit', icon: ScrollText, labelKey: 'nav.audit' }`.

**Navigation label:** `nav.audit` already exists in all i18n files as "יומן פעילות" / equivalent.

---

## ClientView Activity Tab Integration Point

**File:** `src/components/clients/ClientTabs.tsx:49-55`

Current state — placeholder:
```tsx
<TabsContent value="activity">
  <EmptyState
    icon={Activity}
    title={t('clients.tabs.activity')}
    description={t('clients.tabs.activityPlaceholder')}
  />
</TabsContent>
```

Replace with an `AuditEntityPanel` component (or inline usage of `useAuditByEntity`) that shows audit entries filtered to `entityType='client'` and `entityId=clientId`.

The `ClientTabs` component receives `{ clientId, client }` as props — `clientId` is available for the entity filter.

---

## Database Migration

**File:** `supabase/migrations/20260325100000_create_audit_log.sql`

### Table Schema

```sql
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
```

Key differences from other tables:
- **NO `updated_at`** — immutable
- **NO `deleted_at`** — immutable
- **NO update trigger** — immutable
- `details` is `JSONB` for structured metadata
- `ip_address` is `INET` type for IP storage

### Indexes

```sql
-- Primary query: paginated list sorted by time
CREATE INDEX idx_audit_log_firm_created ON audit_log(firm_id, created_at DESC);

-- Entity lookup: audit trail for a specific entity
CREATE INDEX idx_audit_log_firm_entity ON audit_log(firm_id, entity_type, entity_id);

-- Filter by user
CREATE INDEX idx_audit_log_firm_user ON audit_log(firm_id, user_id);

-- Filter by action
CREATE INDEX idx_audit_log_firm_action ON audit_log(firm_id, action);
```

### RLS Policies

```sql
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: firm members can read
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

-- INSERT: firm members can write (logging)
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()));

-- UPDATE: NEVER — immutable
CREATE POLICY "audit_log_update" ON audit_log FOR UPDATE
  USING (false);

-- DELETE: NEVER — immutable
CREATE POLICY "audit_log_delete" ON audit_log FOR DELETE
  USING (false);
```

### GRANTs

```sql
-- Only SELECT and INSERT — no UPDATE or DELETE at the database level
GRANT SELECT, INSERT ON audit_log TO authenticated;
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/audit/AuditView.tsx` | Full-page audit log viewer with filters and DataTable |
| `src/services/auditService.ts` | Append-only service: `log()`, `list()`, `getByEntity()` |
| `src/hooks/useAudit.ts` | React Query hooks: `useAuditEntries()`, `useAuditByEntity()` |
| `src/hooks/useAuditLog.ts` | Fire-and-forget logging hook: `useAuditLog()` returning `logAction()` |
| `supabase/migrations/20260325100000_create_audit_log.sql` | Database migration |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Replace `SectionPlaceholder` with `AuditView` import + route |
| `src/components/clients/ClientTabs.tsx` | Replace activity tab placeholder with audit entity panel |
| `src/i18n/he.ts` | Add `audit.*` keys (~30 keys) |
| `src/i18n/ar.ts` | Add `audit.*` keys (~30 keys) |
| `src/i18n/en.ts` | Add `audit.*` keys (~30 keys) |

---

## Permission Check

The existing permission key `permissions.settings.audit` (`'צפייה ביומן פעילות'`) already exists in the i18n files. The permission string to check is `settings.audit`.

The `AuditView` should guard with:
```tsx
const can = useAuthStore((s) => s.can);
if (!can('settings.audit')) { /* show unauthorized */ }
```

The client activity tab does NOT need a separate permission check — it's within the client detail view which already checks `clients.view`.

---

## AuditEntry Type vs DB Column Mapping

The existing `AuditEntry` type uses camelCase but the DB uses snake_case. The `rowToAuditEntry` mapper needs:

| Type field | DB column |
|------------|-----------|
| `id` | `id` |
| `firm_id` | `firm_id` |
| `userId` | `user_id` |
| `userName` | `user_name` |
| `action` | `action` |
| `target` | `target` |
| `timestamp` | `created_at` |
| `entityType` | `entity_type` |
| `entityId` | `entity_id` |
| `details` | `details` |

Note: `timestamp` in the type maps to `created_at` in the DB (there is no separate `timestamp` column).

---

## DataTable Pagination Note

The existing `DataTable` component uses **client-side pagination** via TanStack Table's `getPaginationRowModel()`. For the main audit view which could have thousands of entries, there are two approaches:

1. **Use DataTable as-is** — fetch a large batch (e.g., 500 entries) and let DataTable paginate client-side. Simple but memory-heavy for large firms.
2. **Custom server-side pagination** — use cursor-based pagination from the service, with manual next/previous buttons outside DataTable. More scalable.

The plan specifies cursor-based pagination. The architect should decide whether to:
- (A) Use the existing DataTable with a reasonable initial fetch limit and "load more" pattern
- (B) Build a thin custom pagination wrapper around DataTable that calls `auditService.list()` with cursor

---

## Success Criteria

- [ ] `/audit` route shows paginated, filterable audit log
- [ ] Audit entries are color-coded by action type
- [ ] Search/filter works for: user, action type, entity type
- [ ] No edit or delete buttons anywhere in the UI
- [ ] `useAuditLog` hook works fire-and-forget from any module
- [ ] Client detail activity tab shows entries filtered to that client
- [ ] DB migration enforces immutability (UPDATE/DELETE USING false)
- [ ] All strings use `t()` with keys in all 3 language files
- [ ] Permission check: only users with `settings.audit` can see `/audit`
- [ ] `npm run build` and `npx tsc --noEmit` pass
