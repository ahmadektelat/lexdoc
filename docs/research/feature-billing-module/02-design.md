# Billing Module — Technical Design

**Date:** 2026-03-21
**Author:** Architect Agent
**Based on:** `docs/research/feature-billing-module/01-requirements.md`
**Branch:** `migration/billing-module`

---

## 1. Architecture Overview

### High-Level Data Flow

```
ClientDetailView
  └─ ClientTabs (receives full Client object)
       ├─ [existing tabs: documents, filings, tasks, activity]
       ├─ HoursTab      ← useHours() → hoursService → hours_log table
       ├─ InvoicesTab    ← useInvoices() → invoiceService → invoices table
       └─ LedgerTab     ← useBillingEntries() → billingService → billing_entries table

BillingView (/billing route)
  └─ useInvoices(firmId, no clientId) → invoiceService → invoices table
     + useBillingEntries aggregated per client
```

### Module Boundaries

- **Database layer**: One migration file creates all 3 tables, 1 function, RLS, indexes, triggers, grants
- **Service layer**: 3 independent service files (`billingService`, `hoursService`, `invoiceService`), each following the `contactService.ts` pattern
- **Hook layer**: 3 hook files (`useBilling`, `useHours`, `useInvoices`), each following `useContacts.ts` pattern
- **Component layer**: 3 tab-panel components + 1 route-level view
- **Integration**: `ClientTabs` receives full `Client` object and renders billing tabs inline (not as modal dialogs)

### Key Design Decision: Tabs, Not Modals

The user has decided to use **tabs within `ClientTabs`** (Option A from requirements). The legacy app used modals, but this project uses a tabs pattern. The components named `HoursModal`, `InvoiceModal`, and `BillingModal` in the requirements will be implemented as **tab panel components** (not `Dialog`-based modals). Their names will be changed to:

- `HoursTab.tsx` — hours logging tab panel
- `InvoicesTab.tsx` — invoice management tab panel
- `LedgerTab.tsx` — billing ledger tab panel

This avoids confusion with the `open/onOpenChange` modal pattern and keeps the naming consistent with `FilingsClientTab`.

---

## 2. Database Design

### Migration File

**File:** `supabase/migrations/20260320100000_create_billing_tables.sql`

The `invoices` table MUST be created before `billing_entries` due to the FK from `billing_entries.invoice_id → invoices.id`.

```sql
-- ============================================================
-- Billing Module: invoices, billing_entries, hours_log
-- CREATED: 2026-03-21
-- ============================================================

-- ========== INVOICES ==========
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  invoice_num TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  items JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array'),
  subtotal INTEGER NOT NULL,
  vat_amount INTEGER NOT NULL,
  total INTEGER NOT NULL CHECK (total = subtotal + vat_amount),
  sent BOOLEAN NOT NULL DEFAULT false,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: invoice numbers unique per firm
ALTER TABLE invoices ADD CONSTRAINT uq_invoices_firm_num UNIQUE (firm_id, invoice_num);

-- Indexes
CREATE INDEX idx_invoices_firm_id ON invoices(firm_id);
CREATE INDEX idx_invoices_firm_client ON invoices(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_firm_paid ON invoices(firm_id, paid) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "invoices_delete" ON invoices FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO authenticated;

-- ========== BILLING ENTRIES ==========
CREATE TABLE billing_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('charge', 'credit')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  invoice_id UUID REFERENCES invoices(id),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_billing_entries_firm_id ON billing_entries(firm_id);
CREATE INDEX idx_billing_entries_firm_client ON billing_entries(firm_id, client_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE billing_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_entries_select" ON billing_entries FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "billing_entries_insert" ON billing_entries FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "billing_entries_update" ON billing_entries FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "billing_entries_delete" ON billing_entries FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER billing_entries_updated_at BEFORE UPDATE ON billing_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_entries TO authenticated;

-- ========== HOURS LOG ==========
CREATE TABLE hours_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  hours NUMERIC(5,2) NOT NULL CHECK (hours > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No updated_at — hours entries are immutable (only soft-deletable).
-- UPDATE policy exists solely for soft-delete (setting deleted_at). Do NOT update other columns.

-- Indexes
CREATE INDEX idx_hours_log_firm_id ON hours_log(firm_id);
CREATE INDEX idx_hours_log_firm_client ON hours_log(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hours_log_firm_client_date ON hours_log(firm_id, client_id, date) WHERE deleted_at IS NULL;
CREATE INDEX idx_hours_log_firm_staff ON hours_log(firm_id, staff_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE hours_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hours_log_select" ON hours_log FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "hours_log_insert" ON hours_log FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "hours_log_update" ON hours_log FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "hours_log_delete" ON hours_log FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON hours_log TO authenticated;

-- ========== INVOICE NUMBER GENERATOR ==========
CREATE OR REPLACE FUNCTION generate_invoice_num(p_firm_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_seq INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoice_seq_' || p_firm_id::text));

  SELECT COALESCE(MAX(
    CAST(REPLACE(invoice_num, 'INV-', '') AS INTEGER)
  ), 1000) INTO v_max_seq
  FROM invoices
  WHERE firm_id = p_firm_id;

  RETURN 'INV-' || (v_max_seq + 1);
END;
$$;

GRANT EXECUTE ON FUNCTION generate_invoice_num(UUID) TO authenticated;
```

### Why This SQL

- **Invoice sequence**: Uses advisory lock pattern identical to `generate_task_seq`. Starts at INV-1001 (matching legacy `INVOICE_SEQ = 1000`).
- **`billing_entries.status`**: User decision — `TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled'))`. This matches the legacy behavior.
- **`billing_entries.invoice_id`**: User decision — when an invoice is created, a corresponding billing entry charge is auto-created linked via this FK.
- **`hours_log` has no `updated_at`**: Hours entries are immutable once created, matching the `HoursEntry` type definition.
- **RLS**: Identical pattern to CRM tables (`contacts`, `interactions`, `tasks`).
- **Soft delete**: All tables use `deleted_at TIMESTAMPTZ DEFAULT NULL` pattern.

---

## 3. Type Changes

### File: `src/types/billing.ts`

**Action:** Modify

**Changes:**

1. Add `status` field to `BillingEntry` interface (line 8-20)
2. Add `CreateHoursInput` type after the existing types
3. Update `CreateBillingInput` to include the new `status` field in the Omit

**Updated interface — BillingEntry (replace lines 8-20):**

```ts
export interface BillingEntry {
  id: string;
  firm_id: string;
  client_id: string;
  type: 'charge' | 'credit';
  amount: number;         // agorot
  status: 'pending' | 'paid' | 'cancelled';
  date: string;           // ISO date
  notes?: string;
  invoice_id?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}
```

**Updated CreateBillingInput (replace line 61):**

```ts
export type CreateBillingInput = Omit<BillingEntry, 'id' | 'firm_id' | 'status' | 'deleted_at' | 'created_at' | 'updated_at'>;
```

Note: `status` is excluded from `CreateBillingInput` because it defaults to `'pending'` in the database and should not be set by the caller on creation.

**New type to add (after line 63):**

```ts
export type CreateHoursInput = Omit<HoursEntry, 'id' | 'firm_id' | 'deleted_at' | 'created_at'>;
```

This means `CreateHoursInput` includes: `client_id`, `staffId`, `staffName`, `hours`, `date`, `note?`.

---

## 4. Service Layer Design

All services follow the established `contactService.ts` pattern:
- Import supabase client and types
- `rowToType()` mapping function
- `inputToRow()` mapping function
- Service object with async methods
- Firm-id scoping on every query
- Soft delete via `deleted_at` timestamp
- Throw `new Error(error.message)` on Supabase errors

### 4.1 File: `src/services/hoursService.ts`

**Action:** Create

```ts
import { supabase } from '@/integrations/supabase/client';
import type { HoursEntry, CreateHoursInput } from '@/types';

function rowToHoursEntry(row: Record<string, unknown>): HoursEntry {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    staffId: row.staff_id as string,
    staffName: row.staff_name as string,
    hours: Number(row.hours),
    date: row.date as string,
    note: (row.note as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
  };
}

function hoursInputToRow(input: CreateHoursInput): Record<string, unknown> {
  return {
    client_id: input.client_id,
    staff_id: input.staffId,
    staff_name: input.staffName,
    hours: input.hours,
    date: input.date,
    note: input.note ?? null,
  };
}

export const hoursService = {
  async list(firmId: string, clientId: string): Promise<HoursEntry[]> { ... },
  async create(firmId: string, input: CreateHoursInput): Promise<HoursEntry> { ... },
  async delete(firmId: string, id: string): Promise<void> { ... },
};
```

**Method details:**

- `list`: Query `hours_log` with `eq('firm_id', firmId)`, `eq('client_id', clientId)`, `is('deleted_at', null)`, `order('date', { ascending: false })`. Map rows via `rowToHoursEntry`.
- `create`: Build row from input, set `firm_id`, insert, select, return mapped entry.
- `delete`: Soft delete by setting `deleted_at = new Date().toISOString()`, scoped by `firm_id`.

**Design note:** `getTotalHours` and `getTodayHours` are NOT implemented as service methods. These are computed client-side from the `list` query data in the hook/component layer. This avoids unnecessary round-trips for small data sets.

**Key mapping:** DB columns use `snake_case` (`staff_id`, `staff_name`), TypeScript types use `camelCase` (`staffId`, `staffName`). The `rowToHoursEntry` function handles this translation.

### 4.2 File: `src/services/invoiceService.ts`

**Action:** Create

```ts
import { supabase } from '@/integrations/supabase/client';
import type { Invoice, CreateInvoiceInput, CreateBillingInput } from '@/types';

function rowToInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    invoiceNum: row.invoice_num as string,
    date: row.date as string,
    items: (row.items as Invoice['items']) ?? [],
    subtotal: row.subtotal as number,
    vatAmount: row.vat_amount as number,
    total: row.total as number,
    sent: row.sent as boolean,
    paid: row.paid as boolean,
    paidDate: (row.paid_date as string) ?? undefined,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
  };
}

function invoiceInputToRow(input: CreateInvoiceInput): Record<string, unknown> {
  return {
    client_id: input.client_id,
    invoice_num: input.invoiceNum,
    date: input.date,
    items: input.items,
    subtotal: input.subtotal,
    vat_amount: input.vatAmount,
    total: input.total,
  };
}

export const invoiceService = {
  async list(firmId: string, clientId?: string): Promise<Invoice[]> { ... },
  async create(firmId: string, input: CreateInvoiceInput): Promise<Invoice> { ... },
  async markPaid(firmId: string, id: string): Promise<Invoice> { ... },
  async markSent(firmId: string, id: string): Promise<Invoice> { ... },
  async getNextInvoiceNumber(firmId: string): Promise<string> { ... },
  async delete(firmId: string, id: string): Promise<void> { ... },
};
```

**Method details:**

- `list`: Query `invoices` with `eq('firm_id', firmId)`, optionally `eq('client_id', clientId)`, `is('deleted_at', null)`, `order('created_at', { ascending: false })`. Map via `rowToInvoice`.
- `create`:
  1. Build row from input, set `firm_id`
  2. Insert invoice, select, get the returned invoice
  3. **Auto-create billing entry** (user decision): After successful invoice insert, insert into `billing_entries` via direct `supabase.from('billing_entries').insert()` call with `{ firm_id, client_id: input.client_id, type: 'charge', amount: input.total, date: input.date, notes: 'Invoice ' + input.invoiceNum, invoice_id: invoice.id }`. **Wrap in try/catch** — if the billing entry insert fails, `console.error('Failed to create billing entry for invoice', invoice.id, error)` but do NOT throw. The invoice is the primary artifact.
  4. Return the mapped invoice
- `markPaid`: Update `{ paid: true, paid_date: new Date().toISOString().split('T')[0] }` scoped by `firm_id` and `id`. Select and return. **Also update the linked billing entry:** after updating the invoice, run `supabase.from('billing_entries').update({ status: 'paid' }).eq('invoice_id', id).eq('firm_id', firmId)` to keep the ledger in sync. Wrap this second update in try/catch — log errors but don't fail the operation.
- `markSent`: Update `{ sent: true }` scoped by `firm_id` and `id`. Select and return.
- `getNextInvoiceNumber`: Call `supabase.rpc('generate_invoice_num', { p_firm_id: firmId })`. Return the string result.
- `delete`: Soft delete via `deleted_at`.

**Critical: Invoice → Billing Entry link.** The `create` method performs TWO inserts within a single service call. If the billing entry insert fails, the invoice has still been created. This is acceptable because:
1. The invoice is the primary artifact — its existence is more important than the ledger entry
2. The billing entry can be manually created later
3. Wrapping in a DB transaction would require an RPC function, which is over-engineering at this stage

### 4.3 File: `src/services/billingService.ts`

**Action:** Create

```ts
import { supabase } from '@/integrations/supabase/client';
import type { BillingEntry, CreateBillingInput } from '@/types';

function rowToBillingEntry(row: Record<string, unknown>): BillingEntry {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    type: row.type as BillingEntry['type'],
    amount: row.amount as number,
    status: row.status as BillingEntry['status'],
    date: row.date as string,
    notes: (row.notes as string) ?? undefined,
    invoice_id: (row.invoice_id as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function billingInputToRow(input: CreateBillingInput): Record<string, unknown> {
  return {
    client_id: input.client_id,
    type: input.type,
    amount: input.amount,
    date: input.date,
    notes: input.notes ?? null,
    invoice_id: input.invoice_id ?? null,
  };
}

export const billingService = {
  async list(firmId: string, clientId: string): Promise<BillingEntry[]> { ... },
  async create(firmId: string, input: CreateBillingInput): Promise<BillingEntry> { ... },
  async getBalance(firmId: string, clientId: string): Promise<number> { ... },
  async markPaid(firmId: string, id: string): Promise<BillingEntry> { ... },
  async cancel(firmId: string, id: string): Promise<BillingEntry> { ... },
  async delete(firmId: string, id: string): Promise<void> { ... },
};
```

**Method details:**

- `list`: Query `billing_entries` with `eq('firm_id', firmId)`, `eq('client_id', clientId)`, `is('deleted_at', null)`, `order('date', { ascending: false })`. Map via `rowToBillingEntry`.
- `create`: Build row, set `firm_id`, insert, select, return.
- `getBalance`: Query all non-deleted entries for `(firm_id, client_id)`, select only `type`, `amount`, and `status`. Compute **outstanding balance** in JavaScript: `sum(pending charges) - sum(pending credits)`. Only count entries where `status === 'pending'` — paid and cancelled entries are excluded. This matches the "Outstanding Balance" / "יתרה לתשלום" label semantics.
- `markPaid`: Update `{ status: 'paid' }` scoped by `firm_id` and `id`.
- `cancel`: Update `{ status: 'cancelled' }` scoped by `firm_id` and `id`.
- `delete`: Soft delete via `deleted_at`.

**Design note on `getBalance`:** We compute balance client-side from a targeted query rather than using a DB aggregate function. This is simpler and the data volume per client is small (typically < 100 entries). The query selects only `type, amount, status` columns for efficiency.

---

## 5. Hook Layer Design

All hooks follow the `useContacts.ts` pattern: query keys factory, `useQuery` with `enabled: !!firmId`, `useMutation` with `invalidateQueries` and toast messages.

### 5.1 File: `src/hooks/useHours.ts`

**Action:** Create

```ts
export const hoursKeys = {
  all: ['hours'] as const,
  lists: () => [...hoursKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string) => [...hoursKeys.lists(), firmId, clientId] as const,
};

export function useHours(firmId: string | null, clientId: string) {
  // useQuery → hoursService.list(firmId!, clientId)
  // enabled: !!firmId
  // queryKey: hoursKeys.list(firmId ?? '', clientId)
}

export function useCreateHoursEntry() {
  // useMutation → hoursService.create(firmId, input)
  // mutationFn params: { firmId: string; input: CreateHoursInput }
  // onSuccess: invalidate hoursKeys.lists(), toast t('hours.logSuccess')
  // onError: toast t('errors.saveFailed')
}

export function useDeleteHoursEntry() {
  // useMutation → hoursService.delete(firmId!, id)
  // mutationFn param: id: string (firmId from useAuthStore)
  // onSuccess: invalidate hoursKeys.lists(), toast t('common.deleteSuccess')
  // onError: toast t('errors.saveFailed')
}
```

### 5.2 File: `src/hooks/useInvoices.ts`

**Action:** Create

```ts
export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (firmId: string, clientId?: string) => [...invoiceKeys.lists(), firmId, clientId] as const,
};

export function useInvoices(firmId: string | null, clientId?: string) {
  // useQuery → invoiceService.list(firmId!, clientId)
  // enabled: !!firmId
  // queryKey: invoiceKeys.list(firmId ?? '', clientId)
}

export function useCreateInvoice() {
  // useMutation → invoiceService.create(firmId, input)
  // mutationFn params: { firmId: string; input: CreateInvoiceInput }
  // onSuccess:
  //   1. invalidate invoiceKeys.lists()
  //   2. invalidate billingKeys.lists()  ← CROSS-INVALIDATION (import from useBilling)
  //   3. invalidate billingKeys.all (catches balance queries too)
  //   4. toast t('invoices.createSuccess')
  // onError: toast t('errors.saveFailed')
}

export function useMarkInvoicePaid() {
  // useMutation → invoiceService.markPaid(firmId, id)
  // mutationFn params: { firmId: string; id: string }
  // onSuccess:
  //   1. invalidate invoiceKeys.lists()
  //   2. invalidate billingKeys.all  ← CROSS-INVALIDATION (markPaid also updates linked billing entry)
  //   3. toast t('invoices.paidSuccess')
  // onError: toast t('errors.saveFailed')
}

export function useMarkInvoiceSent() {
  // useMutation → invoiceService.markSent(firmId, id)
  // mutationFn params: { firmId: string; id: string }
  // onSuccess: invalidate invoiceKeys.lists()
  // onError: toast t('errors.saveFailed')
}

export function useDeleteInvoice() {
  // useMutation → invoiceService.delete(firmId!, id)
  // mutationFn param: id: string (firmId from useAuthStore)
  // onSuccess:
  //   1. invalidate invoiceKeys.lists()
  //   2. invalidate billingKeys.lists()  ← CROSS-INVALIDATION
  //   3. toast t('common.deleteSuccess')
  // onError: toast t('errors.saveFailed')
}
```

**Cross-invalidation rationale:** Since `invoiceService.create` also creates a billing entry, the billing queries must be invalidated when an invoice is created or deleted. Import `billingKeys` from `useBilling.ts` to enable this.

### 5.3 File: `src/hooks/useBilling.ts`

**Action:** Create

```ts
export const billingKeys = {
  all: ['billing'] as const,
  lists: () => [...billingKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string) => [...billingKeys.lists(), firmId, clientId] as const,
  balance: (firmId: string, clientId: string) => [...billingKeys.all, 'balance', firmId, clientId] as const,
};

export function useBillingEntries(firmId: string | null, clientId: string) {
  // useQuery → billingService.list(firmId!, clientId)
  // enabled: !!firmId
  // queryKey: billingKeys.list(firmId ?? '', clientId)
}

export function useBillingBalance(firmId: string | null, clientId: string) {
  // useQuery → billingService.getBalance(firmId!, clientId)
  // enabled: !!firmId
  // queryKey: billingKeys.balance(firmId ?? '', clientId)
}

export function useCreateBillingEntry() {
  // useMutation → billingService.create(firmId, input)
  // mutationFn params: { firmId: string; input: CreateBillingInput }
  // onSuccess: invalidate billingKeys.lists(), invalidate billingKeys.all (catches balance), toast t('billing.createSuccess')
  // onError: toast t('errors.saveFailed')
}

export function useMarkBillingPaid() {
  // useMutation → billingService.markPaid(firmId, id)
  // mutationFn params: { firmId: string; id: string }
  // onSuccess: invalidate billingKeys.lists(), invalidate billingKeys.all, toast t('billing.statusPaid')
  // onError: toast t('errors.saveFailed')
}

export function useCancelBillingEntry() {
  // useMutation → billingService.cancel(firmId, id)
  // mutationFn params: { firmId: string; id: string }
  // onSuccess: invalidate billingKeys.lists(), invalidate billingKeys.all, toast t('billing.cancelled')
  // onError: toast t('errors.saveFailed')
}

export function useDeleteBillingEntry() {
  // useMutation → billingService.delete(firmId!, id)
  // mutationFn param: id: string (firmId from useAuthStore)
  // onSuccess: invalidate billingKeys.lists(), invalidate billingKeys.all
  // onError: toast t('errors.saveFailed')
}
```

---

## 6. Component Design

### 6.1 File: `src/components/billing/HoursTab.tsx`

**Action:** Create
**Rationale:** Tab panel for hours logging within ClientTabs. Not a modal — renders inline.

**Props interface:**

```ts
interface HoursTabProps {
  clientId: string;
  clientName: string;
}
```

**State:**

```ts
const [showForm, setShowForm] = useState(false);
const [staffId, setStaffId] = useState('');
const [hours, setHours] = useState('');
const [date, setDate] = useState(getToday());
const [note, setNote] = useState('');
```

**Data hooks:**

```ts
const firmId = useAuthStore((s) => s.firmId);
const can = useAuthStore((s) => s.can);
const { data: entries = [], isLoading } = useHours(firmId, clientId);
const createEntry = useCreateHoursEntry();
const deleteEntry = useDeleteHoursEntry();
```

**Computed metrics (useMemo):**

```ts
const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
const todayHours = entries.filter(e => e.date === getToday()).reduce((sum, e) => sum + e.hours, 0);
const activeStaff = new Set(entries.map(e => e.staffId)).size;
const staffSummary = Object.values(
  entries.reduce((acc, e) => {
    acc[e.staffId] = acc[e.staffId] || { name: e.staffName, hours: 0 };
    acc[e.staffId].hours += e.hours;
    return acc;
  }, {} as Record<string, { name: string; hours: number }>)
);
```

**JSX structure:**

1. Permission guard: `if (!firmId || !can('billing.view')) return null;`
2. 3-column metric cards grid: Total Hours, Today's Hours, Staff Active
3. Staff summary section (hours per staff with initials avatar)
4. "Log Hours" button → toggles `showForm` — **only shown if `can('billing.create')`**
5. Form (when visible): StaffPicker, hours input (type="number", step="0.5", min="0.5"), date input, note input, submit button
6. DataTable with columns: Date (formatDate), Staff Name (with initial avatar), Hours, Note, Actions (delete button with ConfirmDialog)

**Validation on submit:**
- `parseFloat(hours) > 0` — else toast `t('hours.validHours')`
- `staffId` not empty — else toast `t('hours.selectStaff')`

**Column definitions:**

```ts
const columns: ColumnDef<HoursEntry>[] = [
  { accessorKey: 'date', header: t('hours.date'), cell: ({ row }) => formatDate(row.original.date) },
  { accessorKey: 'staffName', header: t('hours.staff'), cell: ({ row }) => /* avatar + name */ },
  { accessorKey: 'hours', header: t('hours.hoursColumn') },
  { accessorKey: 'note', header: t('hours.note') },
  { id: 'actions', header: '', cell: ({ row }) => /* delete button — only shown if can('billing.delete') */ },
];
```

**Permission guards summary:** `can('billing.view')` gates the entire tab, `can('billing.create')` gates the "Log Hours" button/form, `can('billing.delete')` gates the delete action.

### 6.2 File: `src/components/billing/InvoicesTab.tsx`

**Action:** Create
**Rationale:** Tab panel for invoice management within ClientTabs.

**Props interface:**

```ts
interface InvoicesTabProps {
  clientId: string;
  clientName: string;
  clientMonthlyFee?: number;   // agorot
  clientCaseNum: string;
  clientEmail?: string;
  clientBillingDay?: number;
}
```

**State:**

```ts
const [showCreate, setShowCreate] = useState(false);
const [selMonth, setSelMonth] = useState(() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
});
```

**Data hooks:**

```ts
const firmId = useAuthStore((s) => s.firmId);
const firmData = useAuthStore((s) => s.firmData);
const can = useAuthStore((s) => s.can);
const { data: invoices = [], isLoading } = useInvoices(firmId, clientId);
const { data: hoursEntries = [] } = useHours(firmId, clientId);
const createInvoice = useCreateInvoice();
const markPaid = useMarkInvoicePaid();
const markSent = useMarkInvoiceSent();
```

**Computed values:**

```ts
// Hours for selected month
const monthHours = useMemo(() => {
  return hoursEntries.filter(e => e.date.startsWith(selMonth));
}, [hoursEntries, selMonth]);

const totalMonthHours = monthHours.reduce((s, e) => s + e.hours, 0);

// Invoice preview calculations
const feePreview = useMemo(() => {
  if (!clientMonthlyFee) return null;
  return calculateInvoiceTotal(clientMonthlyFee);
}, [clientMonthlyFee]);

// Last 12 months for month selector
const monthOptions = useMemo(() => {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
    months.push({ value: val, label });
  }
  return months;
}, []);
```

**Create invoice handler:**

```ts
async function handleCreate() {
  if (!firmId || !clientMonthlyFee || !feePreview) return;

  const invoiceNum = await invoiceService.getNextInvoiceNumber(firmId);

  const items: InvoiceItem[] = [
    {
      desc: t('invoices.professionalServices'),
      qty: 1,
      unit: clientMonthlyFee,
      total: clientMonthlyFee,
    },
  ];

  // Add hours summary line if hours exist for the month
  if (totalMonthHours > 0) {
    items.push({
      desc: t('invoices.hoursInMonth'),
      qty: totalMonthHours,
      unit: 0,
      total: 0,
      note: t('invoices.includedInFee'),
    });
  }

  createInvoice.mutate({
    firmId,
    input: {
      client_id: clientId,
      invoiceNum,
      date: getToday(),
      items,
      subtotal: feePreview.subtotal,
      vatAmount: feePreview.vatAmount,
      total: feePreview.total,
    },
  });
}
```

**Print/download handler:**

```ts
function handlePrint(invoice: Invoice) {
  // Build formatted .txt content following the legacy format from section 11.5 of requirements
  // Use firmData for firm details
  // Use month/year from selMonth or invoice date
  // Filter hours for that month for staff breakdown
  // Create Blob, trigger download via URL.createObjectURL + anchor click
  const content = buildInvoiceText(invoice, firmData, clientName, clientCaseNum, clientEmail, clientBillingDay, monthHours, t);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${invoice.invoiceNum}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(t('invoices.downloadSuccess'));
}
```

The `buildInvoiceText` function should be a local helper within this file (not shared — only used here). It constructs the exact format from requirements section 11.5.

**JSX structure:**

1. Permission guard
2. Create invoice section (only shown if `clientMonthlyFee > 0`):
   - Toggle button to show/hide form — **only shown if `can('billing.invoices')`**
   - Month selector dropdown (last 12 months)
   - Preview: monthly fee, VAT, total (all via `formatMoney`)
   - Hours count for selected month
   - "Create Invoice" button
3. If no monthly fee: show message with `t('invoices.noMonthlyFee')`
4. DataTable with columns: Invoice Number, Date, Subtotal, VAT, Total, Status (StatusBadge — paid/pending + sent indicator), Actions (Print — always visible; Mark Paid — **only if `can('billing.edit')`**; Mark Sent — **only if `can('billing.edit')`**)

**Column definitions:**

```ts
const columns: ColumnDef<Invoice>[] = [
  { accessorKey: 'invoiceNum', header: t('invoices.invoiceNum') },
  { accessorKey: 'date', header: t('invoices.date'), cell: ({ row }) => formatDate(row.original.date) },
  { accessorKey: 'subtotal', header: t('billing.subtotal'), cell: ({ row }) => formatMoney(row.original.subtotal) },
  { accessorKey: 'vatAmount', header: t('billing.vat'), cell: ({ row }) => formatMoney(row.original.vatAmount) },
  { accessorKey: 'total', header: t('billing.total'), cell: ({ row }) => formatMoney(row.original.total) },
  {
    id: 'status',
    header: t('invoices.status'),
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <StatusBadge status={row.original.paid ? 'paid' : 'pending'} />
        {row.original.sent && <StatusBadge status="sent" />}
      </div>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => /* Print button, Mark Paid (if !paid), Mark Sent (if !sent) */,
  },
];
```

### 6.3 File: `src/components/billing/LedgerTab.tsx`

**Action:** Create
**Rationale:** Tab panel for the client billing ledger (charges/credits with running balance).

**Props interface:**

```ts
interface LedgerTabProps {
  clientId: string;
  clientName: string;
  clientCaseNum: string;
  clientMonthlyFee?: number;   // agorot
}
```

**State:**

```ts
const [showAdd, setShowAdd] = useState(false);
const [entryType, setEntryType] = useState<'charge' | 'credit'>('charge');
const [desc, setDesc] = useState('');
const [amount, setAmount] = useState('');
const [date, setDate] = useState(getToday());
const [includeVat, setIncludeVat] = useState(false);
```

**Data hooks:**

```ts
const firmId = useAuthStore((s) => s.firmId);
const can = useAuthStore((s) => s.can);
const { data: entries = [], isLoading } = useBillingEntries(firmId, clientId);
const createEntry = useCreateBillingEntry();
const markPaid = useMarkBillingPaid();
const cancelEntry = useCancelBillingEntry();
```

**Computed metrics (useMemo):**

```ts
const metrics = useMemo(() => {
  const active = entries.filter(e => e.status !== 'cancelled');
  const totalCharges = active.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
  const totalCredits = active.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  // Outstanding balance: only pending entries (paid entries are settled)
  const pending = entries.filter(e => e.status === 'pending');
  const pendingCharges = pending.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
  const pendingCredits = pending.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  const balance = pendingCharges - pendingCredits;
  return { totalCharges, totalCredits, balance };
}, [entries]);
```

**Submit handler:**

```ts
function handleSubmit() {
  if (!firmId) return;
  if (!desc.trim()) { toast.error(t('billing.descriptionRequired')); return; }
  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || parsedAmount <= 0) { toast.error(t('billing.validAmount')); return; }

  let amountAgorot = shekelToAgorot(parsedAmount);
  if (includeVat && entryType === 'charge') {
    amountAgorot = amountAgorot + calculateVat(amountAgorot);
  }

  createEntry.mutate({
    firmId,
    input: {
      client_id: clientId,
      type: entryType,
      amount: amountAgorot,
      date,
      notes: desc,
    },
  });

  // Reset form
  setDesc('');
  setAmount('');
  setDate(getToday());
  setIncludeVat(false);
  setShowAdd(false);
}
```

**Monthly fee quick-charge handler:**

```ts
function handleMonthlyCharge() {
  if (!firmId || !clientMonthlyFee) return;
  const amountWithVat = clientMonthlyFee + calculateVat(clientMonthlyFee);
  createEntry.mutate({
    firmId,
    input: {
      client_id: clientId,
      type: 'charge',
      amount: amountWithVat,
      date: getToday(),
      notes: t('billing.monthlyCharge'),
    },
  });
}
```

**JSX structure:**

1. Permission guard
2. 3-column metric cards: Total Charges (red), Total Credits (green), Balance (conditional color — red if > 0 meaning debt, green if <= 0)
3. Action buttons row:
   - "Monthly Charge" quick button (only if `clientMonthlyFee > 0`), shows amount preview with VAT
   - "Add Charge" / "Add Credit" buttons → toggle `showAdd` and set `entryType`
4. Add entry form (when `showAdd`):
   - Type toggle (charge/credit buttons, visually active)
   - Description input (FormField)
   - Amount input in shekels (FormField, type="number")
   - Date input (FormField, type="date")
   - VAT checkbox (only visible for charges): label shows `t('billing.includeVat')`
   - Preview: if includeVat, show "Total with VAT: X" using formatMoney
   - Submit / Cancel buttons
5. DataTable with columns: Date, Description, Type (badge — charge=red, credit=green), Amount (formatMoney), Status (StatusBadge), Actions (Mark Paid if pending — **only if `can('billing.edit')`**, Cancel if pending — **only if `can('billing.edit')`**)

**Column definitions:**

```ts
const columns: ColumnDef<BillingEntry>[] = [
  { accessorKey: 'date', header: t('billing.date'), cell: ({ row }) => formatDate(row.original.date) },
  { accessorKey: 'notes', header: t('billing.description') },
  {
    accessorKey: 'type',
    header: '',
    cell: ({ row }) => (
      <Badge className={row.original.type === 'charge' ? 'bg-red-100 text-red-800 ...' : 'bg-green-100 text-green-800 ...'}>
        {t(`billing.${row.original.type}`)}
      </Badge>
    ),
  },
  { accessorKey: 'amount', header: t('billing.amount'), cell: ({ row }) => formatMoney(row.original.amount) },
  {
    id: 'status',
    header: t('invoices.status'),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => /* Mark Paid + Cancel buttons, only if status === 'pending' */,
  },
];
```

### 6.4 File: `src/components/billing/BillingView.tsx`

**Action:** Create
**Rationale:** Route-level component for `/billing` showing firm-wide billing summary.

**Props:** None (route component).

**Data hooks:**

```ts
const firmId = useAuthStore((s) => s.firmId);
const can = useAuthStore((s) => s.can);
const { data: invoices = [], isLoading } = useInvoices(firmId);
const { data: clients = [] } = useClients(firmId);
```

**Computed values (useMemo):**

```ts
const summary = useMemo(() => {
  const totalBilled = invoices.reduce((s, inv) => s + inv.total, 0);
  const totalCollected = invoices.filter(inv => inv.paid).reduce((s, inv) => s + inv.total, 0);
  const outstanding = totalBilled - totalCollected;
  return { totalBilled, totalCollected, outstanding };
}, [invoices]);

// Aggregate by client
const clientBilling = useMemo(() => {
  const map = new Map<string, { clientId: string; name: string; totalBilled: number; outstanding: number; lastInvoiceDate: string }>();
  for (const inv of invoices) {
    const existing = map.get(inv.client_id) || {
      clientId: inv.client_id,
      name: clients.find(c => c.id === inv.client_id)?.name || '',
      totalBilled: 0,
      outstanding: 0,
      lastInvoiceDate: '',
    };
    existing.totalBilled += inv.total;
    if (!inv.paid) existing.outstanding += inv.total;
    if (!existing.lastInvoiceDate || inv.date > existing.lastInvoiceDate) {
      existing.lastInvoiceDate = inv.date;
    }
    map.set(inv.client_id, existing);
  }
  return Array.from(map.values());
}, [invoices, clients]);
```

**JSX structure:**

1. Permission guard: `if (!can('billing.view')) return <Navigate to="/dashboard" />;`
2. `PageHeader` with `title={t('billing.title')}`
3. 3-column summary cards: Total Billed (formatMoney), Total Collected (formatMoney), Outstanding (formatMoney, red if > 0)
4. DataTable of client billing: Client Name, Total Billed, Outstanding, Last Invoice Date
5. Row click navigates to `/clients/:id`

---

## 7. ClientTabs Integration

### File: `src/components/clients/ClientTabs.tsx`

**Action:** Modify

**Current state:** Receives only `{ clientId: string }`. Has 4 tabs: documents, filings, tasks, activity.

**Required changes:**

1. Change props from `{ clientId: string }` to `{ clientId: string; client: Client }` — the parent `ClientDetailView` already has the full `Client` object loaded.
2. Add 3 new tab triggers after the existing 4
3. Add 3 new `TabsContent` panels
4. Import the 3 billing tab components

**Updated props:**

```ts
import type { Client } from '@/types';

interface ClientTabsProps {
  clientId: string;
  client: Client;
}

export function ClientTabs({ clientId, client }: ClientTabsProps) {
```

**New tab triggers (after the existing 4):**

```tsx
<TabsTrigger value="hours">{t('clients.tabs.hours')}</TabsTrigger>
<TabsTrigger value="invoices">{t('clients.tabs.invoices')}</TabsTrigger>
<TabsTrigger value="billing">{t('clients.tabs.billing')}</TabsTrigger>
```

**New tab content panels (after existing 4):**

```tsx
<TabsContent value="hours">
  <HoursTab clientId={clientId} clientName={client.name} />
</TabsContent>

<TabsContent value="invoices">
  <InvoicesTab
    clientId={clientId}
    clientName={client.name}
    clientMonthlyFee={client.monthlyFee}
    clientCaseNum={client.caseNum}
    clientEmail={client.email}
    clientBillingDay={client.billingDay}
  />
</TabsContent>

<TabsContent value="billing">
  <LedgerTab
    clientId={clientId}
    clientName={client.name}
    clientCaseNum={client.caseNum}
    clientMonthlyFee={client.monthlyFee}
  />
</TabsContent>
```

**New imports:**

```ts
import { HoursTab } from '@/components/billing/HoursTab';
import { InvoicesTab } from '@/components/billing/InvoicesTab';
import { LedgerTab } from '@/components/billing/LedgerTab';
import type { Client } from '@/types';
```

**New icons import:**

```ts
import { FileText, Activity, Clock, Receipt, CreditCard } from 'lucide-react';
```

(Icons are optional for tab triggers — the existing tabs don't use icons, just text. Keep consistent with existing pattern: text-only triggers.)

### File: `src/components/clients/ClientDetailView.tsx`

**Action:** Modify (line 103)

Change:
```tsx
<ClientTabs clientId={client.id} />
```

To:
```tsx
<ClientTabs clientId={client.id} client={client} />
```

This is a single-line change. The `client` object is already available in scope from the `useClient(id)` hook.

---

## 8. Routing Changes

### File: `src/App.tsx`

**Action:** Modify

**Change 1:** Add import (after line 23):

```tsx
import { BillingView } from '@/components/billing/BillingView';
```

**Change 2:** Replace line 75:

```tsx
// FROM:
<Route path="billing" element={<SectionPlaceholder section="billing" />} />
// TO:
<Route path="billing" element={<BillingView />} />
```

No other routing changes needed. The sidebar navigation is already configured.

---

## 9. i18n Changes

### Existing Keys (DO NOT duplicate or overwrite)

These keys already exist in all 3 language files and must be left untouched:

- `billing.title`, `billing.invoiceTotal`, `billing.createInvoice`, `billing.monthlyFee`, `billing.hourly`, `billing.oneTime`, `billing.vat`, `billing.subtotal`, `billing.total` (lines 226-234 in he.ts)
- `nav.billing` (line 7)
- `permissions.billing.*` (lines 375-379)
- `status.paid`, `status.pending`, `status.cancelled`, `status.sent` (lines 298-307) — used by StatusBadge component

### New Keys to Add

Add after line 234 (after `'billing.total': ...`) in all 3 files. Preserve the existing `// Billing` section comment.

**For `src/i18n/he.ts`:**

```ts
  // Hours
  'hours.title': 'יומן שעות',
  'hours.logHours': 'רשום שעות',
  'hours.totalHours': 'סה"כ שעות',
  'hours.todayHours': 'שעות היום',
  'hours.staffActive': 'עובדים פעילים',
  'hours.staffSummary': 'סיכום לפי עובד',
  'hours.date': 'תאריך',
  'hours.staff': 'עובד',
  'hours.hoursColumn': 'שעות',
  'hours.note': 'הערה',
  'hours.validHours': 'הזן שעות תקינות',
  'hours.selectStaff': 'בחר עובד',
  'hours.noHoursYet': 'לא נרשמו שעות עדיין',
  'hours.logSuccess': 'שעות נרשמו בהצלחה',

  // Invoices
  'invoices.title': 'חשבוניות',
  'invoices.newInvoice': 'חשבונית חדשה',
  'invoices.invoiceNum': 'מספר חשבונית',
  'invoices.date': 'תאריך',
  'invoices.amount': 'סכום',
  'invoices.status': 'סטטוס',
  'invoices.paid': 'שולם',
  'invoices.pending': 'ממתין',
  'invoices.sent': 'נשלח',
  'invoices.print': 'הדפסה/הורדה',
  'invoices.markPaid': 'סמן כשולם',
  'invoices.billingPeriod': 'תקופת חיוב',
  'invoices.invoiceWillInclude': 'החשבונית תכלול',
  'invoices.monthlyFeeLabel': 'שכר טרחה חודשי',
  'invoices.hoursInMonth': 'שעות רשומות בחודש',
  'invoices.includedInFee': 'כלול בשכר הטרחה',
  'invoices.noMonthlyFee': 'אין שכר טרחה חודשי. ערוך לקוח להוספה',
  'invoices.noInvoicesYet': 'לא נוצרו חשבוניות עדיין',
  'invoices.createSuccess': 'חשבונית נוצרה בהצלחה',
  'invoices.downloadSuccess': 'חשבונית הורדה',
  'invoices.paidSuccess': 'סומן כשולם',
  'invoices.professionalServices': 'שירותים מקצועיים',
  'invoices.transactionInvoice': 'חשבון עסקה',
  'invoices.from': 'מאת',
  'invoices.to': 'אל',
  'invoices.caseFile': 'תיק',
  'invoices.servicesFor': 'שירותים',
  'invoices.beforeVat': 'לפני מע"מ',
  'invoices.totalDue': 'סה"כ לתשלום',
  'invoices.paymentDue': 'מועד תשלום',
  'invoices.thanks': 'תודה על שיתוף הפעולה',

  // Billing ledger
  'billing.ledger': 'כרטסת',
  'billing.totalCharges': 'סה"כ חיובים',
  'billing.totalCredits': 'סה"כ זיכויים',
  'billing.balance': 'יתרה לתשלום',
  'billing.addCharge': 'הוסף חיוב',
  'billing.addCredit': 'הוסף זיכוי',
  'billing.charge': 'חיוב',
  'billing.credit': 'זיכוי',
  'billing.description': 'תיאור',
  'billing.amount': 'סכום',
  'billing.date': 'תאריך',
  'billing.includeVat': 'כולל מע"מ 18%',
  'billing.totalWithVat': 'סה"כ עם מע"מ',
  'billing.markPaid': 'סמן כשולם',
  'billing.cancelEntry': 'ביטול',
  'billing.cancelled': 'בוטל',
  'billing.statusPaid': 'שולם',
  'billing.statusPending': 'ממתין',
  'billing.monthlyCharge': 'חיוב חודשי',
  'billing.descriptionRequired': 'נדרש תיאור',
  'billing.validAmount': 'נדרש סכום תקין',
  'billing.createSuccess': 'חיוב נוסף בהצלחה',
  'billing.noEntriesYet': 'לא קיימות רשומות',
  'billing.creditLabel': 'זיכוי',
  'billing.vatIncluded': 'כולל',

  // Billing overview
  'billing.totalBilled': 'סה"כ חויב',
  'billing.totalCollected': 'סה"כ גבייה',
  'billing.outstanding': 'יתרות פתוחות',
  'billing.lastInvoice': 'חשבונית אחרונה',

  // Client tabs (billing)
  'clients.tabs.hours': 'שעות',
  'clients.tabs.invoices': 'חשבוניות',
  'clients.tabs.billing': 'כרטסת',
```

**For `src/i18n/ar.ts`:** Same keys with Arabic values from requirements section 8.

**For `src/i18n/en.ts`:** Same keys with English values from requirements section 8.

The complete translations for all 3 languages are specified in the requirements document section 8. The implementer should copy the exact values from there.

---

## 10. Shared Code Registry Updates

### File: `docs/plans/SHARED-CODE-REGISTRY.md`

**Action:** Modify

**Add to Types table:**

```
| `billing.ts` | `BillingEntry`, `HoursEntry`, `Invoice`, `InvoiceItem`, `CreateBillingInput`, `CreateInvoiceInput`, `CreateHoursInput` | Phase 1, Billing |
```

(Update the existing `billing.ts` row to add `CreateHoursInput` and change "Created In" to include "Billing")

**Add to Services table:**

```
| `billingService.ts` | `billingService` — billing entries CRUD, balance, status changes | Billing |
| `hoursService.ts` | `hoursService` — hours log CRUD | Billing |
| `invoiceService.ts` | `invoiceService` — invoices CRUD, invoice number generation, auto-billing-entry | Billing |
```

**Add to Hooks table:**

```
| `useBilling.ts` | `billingKeys`, `useBillingEntries`, `useBillingBalance`, `useCreateBillingEntry`, `useMarkBillingPaid`, `useCancelBillingEntry`, `useDeleteBillingEntry` | Billing |
| `useHours.ts` | `hoursKeys`, `useHours`, `useCreateHoursEntry`, `useDeleteHoursEntry` | Billing |
| `useInvoices.ts` | `invoiceKeys`, `useInvoices`, `useCreateInvoice`, `useMarkInvoicePaid`, `useMarkInvoiceSent`, `useDeleteInvoice` | Billing |
```

**Update "Last updated" line:** `*Last updated: Billing phase*`

---

## 11. Implementation Order

The following order respects dependencies between layers:

### Step 1: Database Migration
- Create `supabase/migrations/20260320100000_create_billing_tables.sql`
- Apply migration to Supabase

### Step 2: Type Changes
- Modify `src/types/billing.ts`:
  - Add `status` field to `BillingEntry`
  - Update `CreateBillingInput` to exclude `status`
  - Add `CreateHoursInput` type
- Run `npx tsc --noEmit` to verify

### Step 3: Service Layer (order matters for imports)
- Create `src/services/hoursService.ts`
- Create `src/services/billingService.ts`
- Create `src/services/invoiceService.ts` (auto-creates billing entries via direct `supabase.from('billing_entries').insert()` — no `billingService` import needed)
- Run `npx tsc --noEmit` to verify

### Step 4: Hook Layer (order matters for cross-invalidation imports)
- Create `src/hooks/useBilling.ts` (must be first — exports `billingKeys` imported by `useInvoices`)
- Create `src/hooks/useHours.ts`
- Create `src/hooks/useInvoices.ts` (imports `billingKeys` from `useBilling.ts` for cross-invalidation)
- Run `npx tsc --noEmit` to verify

### Step 5: i18n Keys
- Add all new keys to `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts`
- Run `npx tsc --noEmit` to verify

### Step 6: Components (order matters — tab panels before integration)
- Create `src/components/billing/HoursTab.tsx`
- Create `src/components/billing/InvoicesTab.tsx`
- Create `src/components/billing/LedgerTab.tsx`
- Create `src/components/billing/BillingView.tsx`
- Run `npx tsc --noEmit` to verify

### Step 7: Integration
- Modify `src/components/clients/ClientTabs.tsx` — add new tabs and pass `client` prop
- Modify `src/components/clients/ClientDetailView.tsx` — pass `client` to `ClientTabs`
- Modify `src/App.tsx` — replace billing placeholder with `BillingView`
- Run `npx tsc --noEmit` to verify

### Step 8: Manager Role Permissions
- Modify `src/lib/constants.ts` — add `'billing.view', 'billing.create', 'billing.edit', 'billing.invoices'` to the `manager` role's permission array (around line 158-166)

### Step 9: Registry Update
- Update `docs/plans/SHARED-CODE-REGISTRY.md`

### Step 10: Final Verification
- `npm run build`
- `npm run lint`
- `npx tsc --noEmit`

---

## 12. Edge Cases & Error Handling

1. **No monthly fee set** → InvoicesTab shows "No monthly fee set. Edit client to add one" message. Create button is hidden.
2. **Duplicate invoice number race condition** → The `generate_invoice_num` function uses `pg_advisory_xact_lock` to prevent concurrent generation. The UNIQUE constraint `(firm_id, invoice_num)` is a safety net. If the insert fails, the error propagates to the UI as `toast.error(t('errors.saveFailed'))`.
3. **Billing entry for deleted invoice** → The `invoice_id` FK does NOT cascade delete. If an invoice is soft-deleted, the billing entry remains. This is correct — the ledger should not lose history.
4. **Zero-amount billing entry** → The amount column has `CHECK (amount > 0)` constraint, enforcing positive values at the DB level. The UI also validates `amount > 0` before submission.
5. **Client with no hours for selected month** → Invoice still creates with just the monthly fee line item. The hours line (qty=0) is simply omitted.
6. **Stale getNextInvoiceNumber** → If two users fetch the next number simultaneously, one will get a duplicate constraint violation. The advisory lock prevents this at the DB level, but if there's a delay between fetching and inserting, the number could be stale. Mitigation: The create flow fetches the number immediately before insert, minimizing the window.

---

## 13. Performance Considerations

1. **BillingView queries all invoices** → For firms with many clients and invoices, this could be slow. Acceptable for MVP; optimize with a DB aggregate view if > 1000 invoices become common.
2. **Balance computation client-side** → `getBalance` fetches all entries and sums. For clients with many entries (> 500), consider a DB aggregate. For MVP, this is fine.
3. **Hours filtering by month** → Done client-side from the full list. The hours list is already loaded for the DataTable. No extra query needed.
4. **Cross-invalidation breadth** → `billingKeys.all` invalidation touches both list and balance queries. This is intentional — balance must update when entries change. The over-invalidation is acceptable for correctness.

---

## 14. Security Considerations

1. **RLS on all tables** — Every table has firm_id scoping via `user_firm_ids()`.
2. **Subscription check on writes** — INSERT/UPDATE/DELETE policies require `firm_subscription_active(firm_id)`.
3. **Permission checks in UI** — `can('billing.view')`, `can('billing.create')`, etc. guard all components.
4. **firm_id never from client** — All service methods take `firmId` from `useAuthStore` (set during auth), never from user input.
5. **SQL injection** — Not applicable; Supabase client uses parameterized queries.
6. **Amount validation** — UI validates > 0; DB has `CHECK (hours > 0)` on hours_log; DB has `CHECK (amount > 0)` on billing_entries for defense in depth.
7. **Invoice items JSONB** — No server-side validation of the items array structure. The client constructs this from trusted data (monthly fee, hours). This is acceptable for an internal tool.

---

## 15. Self-Critique

### What could go wrong

1. **Invoice → billing entry atomicity**: The two-insert pattern in `invoiceService.create` is not transactional. If the billing entry insert fails, the invoice exists without a corresponding ledger entry. This is acceptable for MVP because: (a) the invoice is the primary artifact, (b) manual reconciliation is possible, (c) a DB transaction would require an RPC function adding complexity.

2. **getBalance accuracy**: Computing balance by fetching all entries and summing client-side means the balance shown could be stale if another user adds an entry. React Query's staleTime (5 minutes) mitigates this, and manual refresh is possible.

3. **No pagination on service queries**: `hoursService.list` and `billingService.list` fetch ALL entries for a client. For clients with years of history, this could be slow. DataTable handles client-side pagination, but all data must be loaded. For MVP, this is fine. Future optimization: add server-side pagination with cursor-based queries.

### Where this design is weakest

1. **The `buildInvoiceText` function** in InvoicesTab is a significant piece of logic for text formatting. It needs careful implementation to match the legacy format exactly. It should be tested with actual data.

2. **Cross-invalidation coupling** — `useInvoices.ts` imports `billingKeys` from `useBilling.ts`. This creates a dependency between hook modules. It is necessary for correctness but adds coupling.

### Alternatives considered and rejected

1. **DB function for balance calculation** — Rejected because: (a) adds DB complexity, (b) client-side calculation is fast for expected data volumes, (c) the data is already loaded for the table display.

2. **Modal pattern (legacy)** — Rejected per user decision. Tabs are consistent with the existing `ClientTabs` pattern.

3. **DB transaction for invoice+billing-entry** — Rejected because: (a) requires creating an RPC function, (b) adds migration and maintenance complexity, (c) the failure mode is acceptable (invoice without ledger entry can be manually reconciled).

4. **Separate `status` timestamps (`paid_at`, `cancelled_at`) instead of status column** — Rejected per user decision. Simple `status TEXT` column is clearer and matches existing patterns.

---

## 16. Files Summary

### Files to Create (11)

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/20260320100000_create_billing_tables.sql` | DB tables, RLS, indexes, triggers, functions |
| 2 | `src/services/hoursService.ts` | Hours log CRUD |
| 3 | `src/services/billingService.ts` | Billing entries CRUD + balance + status |
| 4 | `src/services/invoiceService.ts` | Invoices CRUD + invoice number + auto-billing-entry |
| 5 | `src/hooks/useBilling.ts` | React Query hooks for billing entries |
| 6 | `src/hooks/useHours.ts` | React Query hooks for hours log |
| 7 | `src/hooks/useInvoices.ts` | React Query hooks for invoices |
| 8 | `src/components/billing/HoursTab.tsx` | Hours logging tab panel |
| 9 | `src/components/billing/InvoicesTab.tsx` | Invoice management tab panel |
| 10 | `src/components/billing/LedgerTab.tsx` | Billing ledger tab panel |
| 11 | `src/components/billing/BillingView.tsx` | `/billing` route overview page |

### Files to Modify (7)

| # | File | Change |
|---|------|--------|
| 1 | `src/types/billing.ts` | Add `status` to BillingEntry, add `CreateHoursInput`, update `CreateBillingInput` |
| 2 | `src/components/clients/ClientTabs.tsx` | Add 3 new tabs, change props to include `client: Client` |
| 3 | `src/components/clients/ClientDetailView.tsx` | Pass `client` prop to `ClientTabs` (1 line) |
| 4 | `src/App.tsx` | Replace billing placeholder with `BillingView` (2 lines) |
| 5 | `src/i18n/he.ts` | Add ~65 new translation keys |
| 6 | `src/i18n/ar.ts` | Add ~65 new translation keys |
| 7 | `src/i18n/en.ts` | Add ~65 new translation keys |
| 8 | `docs/plans/SHARED-CODE-REGISTRY.md` | Register new services, hooks, types |
