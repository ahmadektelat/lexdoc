# Requirements Document — Clients Module

## Task Summary

Implement the full client management module: list view with search/filter, create/edit form, detail view with tabbed layout, and supporting service/hook/database layers. This is Phase 3 of the migration, building on the auth & onboarding system (Phase 2).

## User Decisions

1. **Mobile responsiveness** — User chose: **Separate card layout on mobile** (detect screen width, render stacked `ClientCard` components on small screens instead of the DataTable)
2. **Case number generation** — User chose: **Database-side Postgres function with per-firm scoping** (each firm gets its own sequential YYYY-### counter, atomically generated on INSERT)
3. **Type fields** — User chose: **Keep both `type` and `clientType` as separate form fields** (prior Phase 1 decision; `type` is high-level UI grouping, `clientType` is specific Israeli tax registration type)
4. **Data fetching** — User chose: **Client-side filtering and pagination** (fetch all clients for the firm in one query, use DataTable's built-in `getFilteredRowModel`/`getPaginationRowModel` for filtering, sorting, pagination)
5. **Placeholder tabs** — User chose: **EmptyState placeholders** (all 4 tabs are clickable, each shows the shared `EmptyState` component with an appropriate icon and message; tab navigation architecture is built now for later phases to replace)

## Chosen Approach

**Client-side-first with DB-generated case numbers** — Fetch all firm clients in a single query and handle filtering/pagination in the browser for snappy UX. Case numbers are generated atomically in Postgres to prevent duplicates. Mobile gets a dedicated card layout. Tab scaffolding is built now with placeholders.

---

## Existing Shared Code — MUST Import (DO NOT Recreate)

### Types (`src/types/`)
| Import | Path |
|--------|------|
| `Client`, `ClientType`, `CreateClientInput`, `UpdateClientInput` | `@/types` (barrel via `@/types/client.ts`) |
| `PaginatedResult`, `ListOptions` | `@/types` (barrel via `@/types/common.ts`) |
| `Staff` | `@/types` (barrel via `@/types/staff.ts`) — needed for assigned staff display |

### Constants (`src/lib/constants.ts`)
| Import | Purpose |
|--------|---------|
| `CLIENT_TYPES` | `Record<ClientType, string>` — maps to i18n keys (`clientTypes.selfEmployed`, etc.) |
| `DEFAULT_FOLDERS` | `string[]` — `['חוזים', 'פיננסים', 'התכתבויות']` |

### Utilities (`src/lib/`)
| Import | Path | Purpose |
|--------|------|---------|
| `formatDate` | `@/lib/dates` | Format ISO dates as DD/MM/YYYY |
| `formatMoney` | `@/lib/money` | Format agorot as ₪ display string |
| `validateTaxId` | `@/lib/validation` | Israeli personal ID validation (9-digit Luhn) |
| `validateCompanyId` | `@/lib/validation` | Israeli company registration number (8-9 digits) |
| `validatePhone` | `@/lib/validation` | Israeli phone number validation |
| `validateEmail` | `@/lib/validation` | Email format validation |
| `sanitizeSearchInput` | `@/lib/validation` | ILIKE-safe search sanitization |

### Shared Components (`src/components/shared/`)
| Import | Purpose |
|--------|---------|
| `StatusBadge` | Colored badge for `active`/`archived` status |
| `EmptyState` | Empty list placeholder + tab placeholders |
| `LoadingSpinner` | Loading state indicator |
| `PageHeader` | Page title + action button layout |
| `DataTable` | Reusable table with sorting, pagination, filtering |
| `SearchInput` | Debounced search input with icon |
| `ConfirmDialog` | Confirm/cancel dialog for delete/archive |
| `FormField` | Label + input + error wrapper for forms |

### Stores & Services
| Import | Path | Purpose |
|--------|------|---------|
| `useAuthStore` | `@/stores/useAuthStore` | Get `firmId` for scoping all queries |
| `supabase` | `@/integrations/supabase/client` | Supabase client for CRUD operations |

---

## Shared Code Gaps — Needs to Be Created

None identified. All required types, constants, utilities, and shared components already exist from Phase 1.

---

## Database Requirements

### Table: `clients`

```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  name TEXT NOT NULL,
  case_num TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  type TEXT NOT NULL CHECK (type IN ('company', 'private')),
  client_type TEXT NOT NULL CHECK (client_type IN ('self_employed', 'company', 'economic', 'private')),
  tax_id TEXT,
  mobile TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  tags TEXT[] DEFAULT '{}',
  monthly_fee INTEGER DEFAULT 0,          -- agorot
  billing_day INTEGER CHECK (billing_day BETWEEN 1 AND 28),
  assigned_staff_id UUID REFERENCES staff(id),
  notes TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,    -- soft delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique case number per firm
ALTER TABLE clients ADD CONSTRAINT clients_firm_case_num_unique UNIQUE (firm_id, case_num);
```

**Note on column naming**: The DB uses snake_case (`case_num`, `client_type`, `monthly_fee`, `billing_day`, `assigned_staff_id`). The TypeScript `Client` type uses camelCase (`caseNum`, `clientType`, `monthlyFee`, `billingDay`, `assignedStaffId`). The service layer must handle this mapping.

### Indexes

```sql
CREATE INDEX idx_clients_firm_id ON clients(firm_id);
CREATE INDEX idx_clients_firm_status ON clients(firm_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_firm_type ON clients(firm_id, client_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_name_search ON clients(firm_id, name) WHERE deleted_at IS NULL;
```

### RLS Policies

```sql
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON clients FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

CREATE POLICY "clients_insert" ON clients FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()));

CREATE POLICY "clients_update" ON clients FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()));

CREATE POLICY "clients_delete" ON clients FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()));
```

### Case Number Generation Function

```sql
CREATE OR REPLACE FUNCTION generate_case_num(p_firm_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year TEXT;
  v_max_seq INTEGER;
  v_new_seq INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM now())::TEXT;

  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(case_num, '-', 2) AS INTEGER)), 0
  ) INTO v_max_seq
  FROM clients
  WHERE firm_id = p_firm_id
    AND case_num LIKE v_year || '-%'
  FOR UPDATE;

  v_new_seq := v_max_seq + 1;
  RETURN v_year || '-' || LPAD(v_new_seq::TEXT, 3, '0');
END;
$$;
```

### Trigger: auto-update `updated_at`

```sql
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
```

### Trigger: auto-generate `case_num` on INSERT

```sql
CREATE OR REPLACE FUNCTION clients_auto_case_num()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.case_num IS NULL OR NEW.case_num = '' THEN
    NEW.case_num := generate_case_num(NEW.firm_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_case_num_trigger
  BEFORE INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION clients_auto_case_num();
```

---

## Component Hierarchy and Responsibilities

### Route Structure

```
/clients          → ClientsView (list)
/clients/:id      → ClientDetailView (detail with tabs)
```

Both routes are nested inside the existing `<AppShell>` protected route in `App.tsx`.

### Component Tree

```
src/components/clients/
├── ClientsView.tsx           — Main list page
├── ClientCard.tsx             — Mobile card layout for a single client
├── ClientTypePicker.tsx       — Horizontal filter buttons (all/company/self_employed/economic/private)
├── ClientForm.tsx             — Dialog modal for create/edit
├── ClientDetailView.tsx       — Detail page at /clients/:id
├── ClientHeader.tsx           — Avatar, name, case number, badges, fees, staff, tags
└── ClientTabs.tsx             — Tab navigation + placeholder content
```

### Component Responsibilities

**ClientsView** (`/clients`)
- Uses `PageHeader` with title `t('clients.title')` and "Add Client" button
- Renders `SearchInput` for filtering by name, case number, tax ID
- Renders `ClientTypePicker` for type filtering
- Status filter toggle (all / active / archived)
- Desktop: renders `DataTable` with columns (name, caseNum, type badge, taxId, phone, monthlyFee, status, assignedStaff)
- Mobile: renders list of `ClientCard` components
- Click row/card navigates to `/clients/:id`
- Opens `ClientForm` dialog on "Add Client" click

**ClientCard** (mobile only)
- Displays client avatar (first letter), name, case number
- Shows type badge, status badge, monthly fee
- Shows tags, assigned staff
- Clickable — navigates to detail view

**ClientTypePicker**
- Horizontal row of buttons: "All" + one per ClientType
- Uses `CLIENT_TYPES` constant with `t()` for labels
- Active state styling via CSS classes
- Emits selected type to parent

**ClientForm** (Dialog)
- Mode: create or edit (controlled by parent)
- Fields: name (required), type (dropdown), clientType (dropdown), taxId (dir="ltr"), mobile (dir="ltr"), email, address, city, tags (comma-separated input), monthlyFee (number, stored as agorot), billingDay (1-28 select), notes (textarea)
- Validation: name required, email via `validateEmail`, phone via `validatePhone`, taxId via `validateTaxId` or `validateCompanyId` (based on type)
- On create: caseNum is auto-generated by DB (not sent from client)
- Uses `FormField` for each field
- Toast on success/error via sonner

**ClientDetailView** (`/clients/:id`)
- Fetches single client via `useClient(id)` hook
- Shows `LoadingSpinner` while loading
- Renders `ClientHeader` + `ClientTabs`
- Back button navigating to `/clients`
- Edit button opening `ClientForm` in edit mode
- Archive/Delete buttons with `ConfirmDialog`

**ClientHeader**
- Avatar: rounded div with first letter of name, styled with accent color
- Name (h1), case number, type badges (using i18n keys from `CLIENT_TYPES`)
- Monthly fee formatted via `formatMoney`
- Tags displayed as badges
- Status via `StatusBadge`
- Assigned staff name (if any)

**ClientTabs**
- 4 tabs: Documents, Filings, Tasks, Activity
- Tab labels use i18n keys
- All tabs show `EmptyState` with appropriate Lucide icon and message
- Tab state managed locally (useState)
- Designed for later phases to swap in real content

---

## Service Layer

### File: `src/services/clientService.ts`

```typescript
const clientService = {
  list(firmId: string): Promise<Client[]>,
  getById(id: string): Promise<Client>,
  create(firmId: string, input: CreateClientInput): Promise<Client>,
  update(id: string, input: UpdateClientInput): Promise<Client>,
  archive(id: string): Promise<void>,
  restore(id: string): Promise<void>,
  delete(id: string): Promise<void>,       // soft delete via deleted_at
};
```

**Key implementation notes:**
- All queries filter by `deleted_at IS NULL` unless explicitly showing archived
- `list()` fetches all clients for the firm (no server pagination — user decision #4)
- `create()` does NOT send `case_num` — the DB trigger generates it
- `create()` sets `firm_id` from the parameter, not from user input (security)
- Column name mapping: DB snake_case <-> TypeScript camelCase (use Supabase's column selection or a mapper utility)
- `archive()` sets `status = 'archived'`
- `delete()` sets `deleted_at = now()` (soft delete)

---

## Hook Layer

### File: `src/hooks/useClients.ts`

```typescript
// Query key factory
const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (firmId: string) => [...clientKeys.lists(), firmId] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

// Hooks
useClients(firmId: string)        — useQuery, returns Client[]
useClient(id: string)             — useQuery, returns Client
useCreateClient()                 — useMutation, invalidates client list
useUpdateClient()                 — useMutation, invalidates client list + detail
useArchiveClient()                — useMutation, invalidates client list + detail
useRestoreClient()                — useMutation, invalidates client list + detail
useDeleteClient()                 — useMutation, invalidates client list
```

---

## Route Requirements

In `src/App.tsx`, replace the clients placeholder route:

```diff
- <Route path="clients" element={<SectionPlaceholder section="clients" />} />
+ <Route path="clients" element={<ClientsView />} />
+ <Route path="clients/:id" element={<ClientDetailView />} />
```

Both routes remain nested inside the `<ProtectedRoute><AppShell /></ProtectedRoute>` wrapper.

---

## i18n Keys Needed

The following keys need to be added to all 3 language files. Some `clients.*` keys already exist — those are marked below.

### Already existing (DO NOT recreate):
- `clients.title` — "לקוחות" / "العملاء" / "Clients"
- `clients.addNew` — "הוספת לקוח חדש" / "إضافة عميل جديد" / "Add New Client"
- `clients.name` — "שם הלקוח" / "اسم العميل" / "Client Name"
- `clients.type` — "סוג לקוח" / "نوع العميل" / "Client Type"
- `clients.taxId` — "מספר עוסק / ח.פ." / "الرقم الضريبي" / "Tax ID"
- `clients.type.company/selfEmployed/economic/private` — all exist
- `clientTypes.selfEmployed/company/economic/private` — all exist (used by `CLIENT_TYPES` constant)

### New keys needed:

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `clients.caseNum` | מספר תיק | رقم الملف | Case Number |
| `clients.phone` | טלפון | هاتف | Phone |
| `clients.email` | דוא"ל | بريد إلكتروني | Email |
| `clients.address` | כתובת | عنوان | Address |
| `clients.city` | עיר | مدينة | City |
| `clients.tags` | תגיות | علامات | Tags |
| `clients.monthlyFee` | שכר טרחה חודשי | أتعاب شهرية | Monthly Fee |
| `clients.billingDay` | יום חיוב | يوم الفوترة | Billing Day |
| `clients.notes` | הערות | ملاحظات | Notes |
| `clients.status` | סטטוס | الحالة | Status |
| `clients.assignedStaff` | עובד אחראי | الموظف المسؤول | Assigned Staff |
| `clients.highLevelType` | סוג (ראשי) | النوع (رئيسي) | Type (Main) |
| `clients.registrationType` | סוג רישום | نوع التسجيل | Registration Type |
| `clients.all` | הכל | الكل | All |
| `clients.filterByType` | סינון לפי סוג | تصفية حسب النوع | Filter by Type |
| `clients.filterByStatus` | סינון לפי סטטוס | تصفية حسب الحالة | Filter by Status |
| `clients.active` | פעיל | نشط | Active |
| `clients.archived` | ארכיון | أرشيف | Archived |
| `clients.editClient` | עריכת לקוח | تعديل عميل | Edit Client |
| `clients.deleteClient` | מחיקת לקוח | حذف عميل | Delete Client |
| `clients.archiveClient` | העברה לארכיון | نقل للأرشيف | Archive Client |
| `clients.restoreClient` | שחזור לקוח | استعادة عميل | Restore Client |
| `clients.confirmDelete` | האם אתה בטוח שברצונך למחוק לקוח זה? | هل أنت متأكد من حذف هذا العميل؟ | Are you sure you want to delete this client? |
| `clients.confirmArchive` | האם אתה בטוח שברצונך להעביר לקוח זה לארכיון? | هل أنت متأكد من نقل هذا العميل للأرشيف؟ | Are you sure you want to archive this client? |
| `clients.createSuccess` | הלקוח נוצר בהצלחה | تم إنشاء العميل بنجاح | Client created successfully |
| `clients.updateSuccess` | הלקוח עודכן בהצלחה | تم تحديث العميل بنجاح | Client updated successfully |
| `clients.deleteSuccess` | הלקוח נמחק בהצלחה | تم حذف العميل بنجاح | Client deleted successfully |
| `clients.archiveSuccess` | הלקוח הועבר לארכיון | تم نقل العميل للأرشيف | Client archived successfully |
| `clients.restoreSuccess` | הלקוח שוחזר בהצלחה | تم استعادة العميل بنجاح | Client restored successfully |
| `clients.searchPlaceholder` | חיפוש לפי שם, מספר תיק או מספר עוסק... | البحث بالاسم، رقم الملف أو الرقم الضريبي... | Search by name, case number or tax ID... |
| `clients.backToList` | חזרה לרשימת לקוחות | العودة لقائمة العملاء | Back to Clients |
| `clients.noClients` | אין לקוחות עדיין | لا يوجد عملاء بعد | No clients yet |
| `clients.noClientsDesc` | הוסף לקוח חדש כדי להתחיל | أضف عميل جديد للبدء | Add a new client to get started |
| `clients.tabs.documents` | מסמכים | مستندات | Documents |
| `clients.tabs.filings` | הגשות | التقارير | Filings |
| `clients.tabs.tasks` | משימות | المهام | Tasks |
| `clients.tabs.activity` | יומן פעילות | سجل النشاط | Activity |
| `clients.tabs.documentsPlaceholder` | מודול המסמכים יהיה זמין בעדכון הבא | وحدة المستندات ستكون متاحة في التحديث القادم | Documents module will be available in a future update |
| `clients.tabs.filingsPlaceholder` | מודול ההגשות יהיה זמין בעדכון הבא | وحدة التقارير ستكون متاحة في التحديث القادم | Filings module will be available in a future update |
| `clients.tabs.tasksPlaceholder` | מודול המשימות יהיה זמין בעדכון הבא | وحدة المهام ستكون متاحة في التحديث القادم | Tasks module will be available in a future update |
| `clients.tabs.activityPlaceholder` | יומן הפעילות יהיה זמין בעדכון הבא | سجل النشاط سيكون متاح في التحديث القادم | Activity log will be available in a future update |
| `clients.tagsHint` | הפרד תגיות בפסיקים | افصل العلامات بفواصل | Separate tags with commas |
| `clients.perMonth` | לחודש | شهريًا | per month |

---

## Scope

**In scope:**
- ClientsView with DataTable (desktop) and ClientCard list (mobile)
- ClientTypePicker horizontal filter
- Status filter (all / active / archived)
- SearchInput integration for name, case number, tax ID
- ClientForm dialog (create and edit modes)
- ClientDetailView with ClientHeader and ClientTabs (4 placeholder tabs)
- clientService with full CRUD + archive/restore
- useClients hooks (query + mutations with cache invalidation)
- Database migration: clients table, indexes, RLS, triggers, case number function
- Routes: /clients and /clients/:id
- i18n keys for all new user-facing strings
- Form validation using existing validation utilities

**Out of scope:**
- Tab content (Documents, Filings, Tasks, Activity) — placeholder only
- Action buttons functionality (Hours, Invoices, Users, Documents, Billing) — disabled with tooltips
- Client import/export
- Bulk operations
- Client-staff assignment management UI (just display who is assigned)
- Advanced search (e.g., by tags, date ranges)

---

## Success Criteria

- [ ] Client list displays all firm clients with correct data in DataTable (desktop) and ClientCard (mobile)
- [ ] ClientTypePicker filters clients by type correctly
- [ ] Status filter toggles between all, active, and archived clients
- [ ] Search filters by name, case number, and tax ID
- [ ] Create client form validates and saves to database; case number is auto-generated
- [ ] Edit client form pre-fills data and saves changes
- [ ] Archive/restore toggles client status with confirmation dialog
- [ ] Delete (soft) removes client from list with confirmation dialog
- [ ] Client detail view shows full client information with header and tabs
- [ ] All 4 tabs are clickable and show EmptyState placeholders
- [ ] RLS policies prevent cross-firm data access
- [ ] All strings use `t()` — no hardcoded text in components
- [ ] RTL layout works correctly (logical properties, dir="ltr" on taxId/phone inputs)
- [ ] All 3 themes render correctly (Sky, Dark, Blue)
- [ ] `npm run build` passes with no errors
- [ ] `npx tsc --noEmit` passes with no type errors
