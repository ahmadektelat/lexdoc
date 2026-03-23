# Billing Module — Requirements Document

**Date:** 2026-03-19
**Module:** Billing & Invoicing
**Branch:** `migration/billing-module`
**Prerequisite:** Staff module merged to main

---

## 1. Feature Overview

The billing module provides three core capabilities per client and one overview route:

1. **Hours Tracking** — Log staff work hours per client with staff picker, date, hours (decimal), and optional note. Displays metrics (total hours, today's hours, active staff count) and a full hours log table.

2. **Invoice Generation** — Create transaction invoices from a client's monthly fee for a selected billing period. Invoices include VAT at 18%, track sent/paid status, and can be downloaded as formatted `.txt` files. Invoice numbers auto-increment per firm as `INV-XXXX`.

3. **Billing Ledger** — Client billing entries (charges/credits) with running balance. Supports manual entries with optional VAT addition, plus a one-click monthly fee charge. Entries can be marked as paid or cancelled.

4. **Billing Overview** (`/billing` route) — Firm-wide billing dashboard with summary cards (total billed, total collected, outstanding balance) and a client list with balance columns.

---

## 2. Existing Shared Code Inventory

All of the following already exist and MUST be imported, not recreated.

### Types (`src/types/billing.ts`, re-exported from `src/types/index.ts`)

| Export | Description |
|--------|-------------|
| `BillingEntry` | Billing ledger entry: id, firm_id, client_id, type ('charge'/'credit'), amount (agorot), date, notes, invoice_id, deleted_at, created_at, updated_at |
| `HoursEntry` | Hours log: id, firm_id, client_id, staffId, staffName, hours, date, note, deleted_at, created_at |
| `InvoiceItem` | Line item: desc, qty, unit (agorot), total (agorot), note? |
| `Invoice` | Full invoice: id, firm_id, client_id, invoiceNum, date, items[], subtotal/vatAmount/total (agorot), sent, paid, paidDate, updated_at, deleted_at, created_at |
| `CreateBillingInput` | Omit<BillingEntry, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'> |
| `CreateInvoiceInput` | Omit<Invoice, 'id' | 'firm_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sent' | 'paid' | 'paidDate'> |

### Constants (`src/lib/constants.ts`)

| Export | Value |
|--------|-------|
| `VAT_RATE` | `0.18` |
| `AGOROT_PER_SHEKEL` | `100` |

### Utilities (`src/lib/money.ts`)

| Export | Signature |
|--------|-----------|
| `shekelToAgorot(shekels: number)` | Returns integer agorot |
| `agorotToShekel(agorot: number)` | Returns decimal shekels |
| `formatMoney(agorot: number)` | Returns `he-IL` formatted ILS string |
| `calculateVat(amountAgorot: number)` | Returns `Math.round(amount * 0.18)` in agorot |
| `calculateInvoiceTotal(subtotalAgorot: number)` | Returns `{ subtotal, vatAmount, total }` all in agorot |

### Utilities (`src/lib/dates.ts`)

| Export | Signature |
|--------|-----------|
| `formatDate(iso: string)` | Returns `DD/MM/YYYY` |
| `getToday()` | Returns today's ISO date string |

### Shared Components (`src/components/shared/`)

| Component | File | Usage |
|-----------|------|-------|
| `PageHeader` | `PageHeader.tsx` | BillingView page title + actions |
| `DataTable` | `DataTable.tsx` | Hours log table, invoice list, billing entries table, client billing overview table |
| `EmptyState` | `EmptyState.tsx` | Empty list placeholders |
| `LoadingSpinner` | `LoadingSpinner.tsx` | Loading states |
| `FormField` | `FormField.tsx` | Form inputs in modals |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Delete/cancel confirmations |
| `StatusBadge` | `StatusBadge.tsx` | Payment status badges |
| `SearchInput` | `SearchInput.tsx` | BillingView client search |

### Staff Component

| Component | File | Usage |
|-----------|------|-------|
| `StaffPicker` | `src/components/staff/StaffPicker.tsx` | Staff selection in HoursModal. Props: `value?, onChange, firmId, placeholder?, disabled?` |

### Auth Store (`src/stores/useAuthStore.ts`)

- `useAuthStore((s) => s.firmId)` — current firm ID for all service calls
- `useAuthStore((s) => s.firmData)` — firm details for invoice generation (name, regNum, phone, email)
- `useAuthStore((s) => s.can('billing.view'))` — permission checks

---

## 3. Missing Shared Code

### Missing Type: `CreateHoursInput`

The `HoursEntry` type exists but there is no `CreateHoursInput` type. Must be added to `src/types/billing.ts`:

```ts
export type CreateHoursInput = Omit<HoursEntry, 'id' | 'firm_id' | 'deleted_at' | 'created_at'>;
```

This means it includes: `client_id, staffId, staffName, hours, date, note?`

### No other missing shared code

All other utilities, constants, components, and types needed are already in place.

---

## 4. Database Requirements

### 4.1 Table: `billing_entries`

```sql
CREATE TABLE billing_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('charge', 'credit')),
  amount INTEGER NOT NULL,                    -- agorot, always positive
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  invoice_id UUID REFERENCES invoices(id),    -- optional link to invoice
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_billing_entries_firm_id ON billing_entries(firm_id)`
- `idx_billing_entries_firm_client ON billing_entries(firm_id, client_id) WHERE deleted_at IS NULL`

**RLS policies** (same pattern as contacts/interactions/tasks):
- `billing_entries_select` — `USING (firm_id IN (SELECT user_firm_ids()))`
- `billing_entries_insert` — `WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))`
- `billing_entries_update` — same USING as insert WITH CHECK
- `billing_entries_delete` — same USING as insert WITH CHECK

**Trigger:** `billing_entries_updated_at` — `BEFORE UPDATE ... EXECUTE FUNCTION update_updated_at()`

**GRANT:** `SELECT, INSERT, UPDATE, DELETE ON billing_entries TO authenticated`

### 4.2 Table: `hours_log`

```sql
CREATE TABLE hours_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,                   -- denormalized for display
  hours NUMERIC(5,2) NOT NULL CHECK (hours > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Note:** No `updated_at` — hours log entries are immutable once created (only soft-deletable). This matches the `HoursEntry` type which has no `updated_at`.

**Indexes:**
- `idx_hours_log_firm_id ON hours_log(firm_id)`
- `idx_hours_log_firm_client ON hours_log(firm_id, client_id) WHERE deleted_at IS NULL`
- `idx_hours_log_firm_client_date ON hours_log(firm_id, client_id, date) WHERE deleted_at IS NULL`
- `idx_hours_log_firm_staff ON hours_log(firm_id, staff_id) WHERE deleted_at IS NULL`

**RLS policies:** Same pattern as billing_entries.

**GRANT:** `SELECT, INSERT, UPDATE, DELETE ON hours_log TO authenticated`

### 4.3 Table: `invoices`

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  invoice_num TEXT NOT NULL,                  -- "INV-1001", "INV-1002", ...
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  items JSONB NOT NULL DEFAULT '[]',          -- InvoiceItem[]
  subtotal INTEGER NOT NULL,                  -- agorot
  vat_amount INTEGER NOT NULL,                -- agorot
  total INTEGER NOT NULL,                     -- agorot
  sent BOOLEAN NOT NULL DEFAULT false,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Unique constraint:** `UNIQUE(firm_id, invoice_num)` — invoice numbers are unique per firm.

**Indexes:**
- `idx_invoices_firm_id ON invoices(firm_id)`
- `idx_invoices_firm_client ON invoices(firm_id, client_id) WHERE deleted_at IS NULL`
- `idx_invoices_firm_paid ON invoices(firm_id, paid) WHERE deleted_at IS NULL`

**RLS policies:** Same pattern as billing_entries.

**Trigger:** `invoices_updated_at` — `BEFORE UPDATE ... EXECUTE FUNCTION update_updated_at()`

**GRANT:** `SELECT, INSERT, UPDATE, DELETE ON invoices TO authenticated`

### 4.4 Invoice Sequence Function

Per-firm auto-increment for invoice numbers (same pattern as `generate_task_seq`):

```sql
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
```

**GRANT:** `EXECUTE ON FUNCTION generate_invoice_num(UUID) TO authenticated`

### 4.5 Migration File

Name: `supabase/migrations/20260320100000_create_billing_tables.sql`

The `invoices` table must be created BEFORE `billing_entries` (due to the FK reference from `billing_entries.invoice_id` to `invoices.id`).

---

## 5. Service Layer Requirements

Follow the established pattern from `contactService.ts`: row-to-type mapping functions, firm_id scoping, soft delete, Supabase query builder.

### 5.1 `src/services/billingService.ts`

```ts
export const billingService = {
  list(firmId: string, clientId: string): Promise<BillingEntry[]>,
  create(firmId: string, input: CreateBillingInput): Promise<BillingEntry>,
  getBalance(firmId: string, clientId: string): Promise<number>,  // sum charges - sum credits, in agorot
  markPaid(firmId: string, id: string): Promise<BillingEntry>,    // update status equivalent
  cancel(firmId: string, id: string): Promise<BillingEntry>,      // soft-cancel (update status)
  delete(firmId: string, id: string): Promise<void>,              // soft delete
}
```

**Note on balance:** The legacy app calculates balance as `totalCharges - totalCredits`. The service should compute this server-side or via a query aggregation.

**Note on `billing_entries.type` values:** The legacy app uses Hebrew strings (`"חיוב"` / `"זיכוי"`). The new app uses English enum values (`'charge'` / `'credit'`) as defined in the `BillingEntry` type.

### 5.2 `src/services/hoursService.ts`

```ts
export const hoursService = {
  list(firmId: string, clientId: string): Promise<HoursEntry[]>,
  create(firmId: string, input: CreateHoursInput): Promise<HoursEntry>,
  getTotalHours(firmId: string, clientId: string): Promise<number>,
  getTodayHours(firmId: string, clientId: string): Promise<number>,
  delete(firmId: string, id: string): Promise<void>,  // soft delete
}
```

**Note:** `getTotalHours` and `getTodayHours` can be computed client-side from the list query results rather than separate DB calls. The architect should decide.

### 5.3 `src/services/invoiceService.ts`

```ts
export const invoiceService = {
  list(firmId: string, clientId?: string): Promise<Invoice[]>,     // optional clientId for overview
  create(firmId: string, input: CreateInvoiceInput): Promise<Invoice>,
  markPaid(firmId: string, id: string): Promise<Invoice>,          // set paid=true, paid_date=today
  markSent(firmId: string, id: string): Promise<Invoice>,          // set sent=true
  getNextInvoiceNumber(firmId: string): Promise<string>,           // calls generate_invoice_num RPC
  delete(firmId: string, id: string): Promise<void>,               // soft delete
}
```

**Invoice creation flow:**
1. Call `getNextInvoiceNumber(firmId)` to get the next `INV-XXXX`
2. Build `InvoiceItem[]` from client's monthly fee + hours data
3. Calculate subtotal, vatAmount, total using `calculateInvoiceTotal()`
4. Insert into `invoices` table

---

## 6. Hook Layer Requirements

Follow the established pattern from `useContacts.ts`: query keys factory, React Query hooks with toast messages, `useAuthStore` for firmId.

### 6.1 `src/hooks/useBilling.ts`

```ts
export const billingKeys = {
  all: ['billing'] as const,
  lists: () => [...billingKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string) => [...billingKeys.lists(), firmId, clientId] as const,
  balance: (firmId: string, clientId: string) => [...billingKeys.all, 'balance', firmId, clientId] as const,
};

export function useBillingEntries(firmId: string | null, clientId: string): UseQueryResult<BillingEntry[]>;
export function useCreateBillingEntry(): UseMutationResult;   // invalidates billingKeys.lists() + balance
export function useMarkBillingPaid(): UseMutationResult;
export function useCancelBillingEntry(): UseMutationResult;
export function useDeleteBillingEntry(): UseMutationResult;
export function useBillingBalance(firmId: string | null, clientId: string): UseQueryResult<number>;
```

### 6.2 `src/hooks/useHours.ts`

```ts
export const hoursKeys = {
  all: ['hours'] as const,
  lists: () => [...hoursKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string) => [...hoursKeys.lists(), firmId, clientId] as const,
};

export function useHours(firmId: string | null, clientId: string): UseQueryResult<HoursEntry[]>;
export function useCreateHoursEntry(): UseMutationResult;     // invalidates hoursKeys.lists()
export function useDeleteHoursEntry(): UseMutationResult;
```

### 6.3 `src/hooks/useInvoices.ts`

```ts
export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (firmId: string, clientId?: string) => [...invoiceKeys.lists(), firmId, clientId] as const,
};

export function useInvoices(firmId: string | null, clientId?: string): UseQueryResult<Invoice[]>;
export function useCreateInvoice(): UseMutationResult;        // invalidates invoiceKeys.lists() + billingKeys (may create billing entry)
export function useMarkInvoicePaid(): UseMutationResult;
export function useMarkInvoiceSent(): UseMutationResult;
export function useDeleteInvoice(): UseMutationResult;
```

---

## 7. Component Requirements

### 7.1 `src/components/billing/HoursModal.tsx`

**Purpose:** Modal dialog for logging and viewing hours for a specific client.

**Props:**
```ts
interface HoursModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
}
```

**State:**
- `staffId: string` — selected staff (via StaffPicker)
- `hours: string` — hours input (decimal allowed, e.g. "2.5")
- `date: string` — ISO date, defaults to today
- `note: string` — optional note

**Behavior:**
- Uses `useHours()` to load hours entries for the client
- Uses `useCreateHoursEntry()` to add new entries
- Displays 3 metric cards: Total Hours, Today's Hours, Staff Active count
- Displays staff summary (hours per staff member with avatar initials)
- Displays DataTable of hours log: date, staff name (with avatar), role badge, hours, note
- Validation: hours > 0, staff selected
- Toast on success/error using i18n keys

**Legacy reference:** `legacy-app.html:734-837`

### 7.2 `src/components/billing/InvoiceModal.tsx`

**Purpose:** Modal dialog for creating and managing invoices for a specific client.

**Props:**
```ts
interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientMonthlyFee?: number;   // agorot
  clientCaseNum: string;
  clientEmail?: string;
  clientBillingDay?: number;
}
```

**State:**
- `showCreate: boolean` — toggles the invoice creation form
- `selMonth: string` — selected billing period (YYYY-MM format, last 12 months)

**Behavior:**
- Uses `useInvoices()` to load invoices for the client
- Uses `useCreateInvoice()` to create new invoices
- Uses `useMarkInvoicePaid()` and `useMarkInvoiceSent()` for status changes
- Uses `useHours()` to get hours for the selected month (for invoice line items)
- Uses `useAuthStore` to get firm details for invoice generation
- **Create invoice form:** Shows only if `monthlyFee > 0`. Displays monthly fee, VAT preview (using `calculateVat`), total preview (using `calculateInvoiceTotal`), month selector (last 12 months dropdown), and hours count for selected month.
- **Invoice list:** DataTable with columns: Invoice Number, Date, Amount (formatMoney), VAT, Total, Status (StatusBadge — paid/pending + sent), Actions (Print/Download, Mark Paid)
- **Print/Download:** Generates formatted `.txt` file following the legacy format (firm details, client details, line items, VAT breakdown, payment terms)
- Invoice number format: `INV-XXXX` (auto-increment via `getNextInvoiceNumber`)

**Legacy reference:** `legacy-app.html:838-963`

### 7.3 `src/components/billing/BillingModal.tsx`

**Purpose:** Modal dialog for the client billing ledger (charges/credits).

**Props:**
```ts
interface BillingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientCaseNum: string;
  clientMonthlyFee?: number;   // agorot
}
```

**State:**
- `showAdd: boolean` — toggles the add entry form
- `entryType: 'charge' | 'credit'` — type of entry being added
- `desc: string` — description
- `amount: string` — amount in shekels (converted to agorot on save)
- `date: string` — ISO date
- `includeVat: boolean` — whether to add 18% VAT to the amount

**Behavior:**
- Uses `useBillingEntries()` to load entries for the client
- Uses `useCreateBillingEntry()` to add new entries
- Uses `useMarkBillingPaid()` and `useCancelBillingEntry()` for status changes
- Displays 3 metric cards: Total Charges (red), Total Credits (green), Balance (red if debt, green if credit)
- Quick "Monthly Fee" button: adds a charge entry for monthlyFee * 1.18 (if monthlyFee set)
- Add entry form: type toggle (charge/credit), description, amount (shekels), date, VAT checkbox (charges only)
- DataTable: date, description, type badge (charge=red, credit=green), amount (formatMoney), VAT indicator, status badge, actions (mark paid, cancel)
- Balance calculation: sum of charges - sum of credits (all in agorot)
- Validation: description required, amount > 0

**Legacy reference:** `legacy-app.html:1050-1170`

### 7.4 `src/components/billing/BillingView.tsx`

**Purpose:** Overview route component at `/billing` showing firm-wide billing summary.

**Props:** None (uses route context).

**Behavior:**
- Uses `useInvoices()` with no clientId (all firm invoices) for summary data
- Uses `PageHeader` with title from `t('billing.title')`
- Displays summary cards:
  - Total Billed: sum of all invoice totals
  - Total Collected: sum of paid invoice totals
  - Outstanding: Total Billed - Total Collected
- Client list table with columns: Client Name, Total Billed, Outstanding, Last Invoice Date
- Click on client row navigates to `/clients/:id` (or opens billing modal)
- Permission check: `billing.view`

---

## 8. i18n Requirements

### Existing Keys (already in all 3 language files)

The following keys already exist at lines 226-234 in all 3 i18n files:
- `billing.title`, `billing.invoiceTotal`, `billing.createInvoice`
- `billing.monthlyFee`, `billing.hourly`, `billing.oneTime`
- `billing.vat`, `billing.subtotal`, `billing.total`
- `nav.billing` (line 7)
- `permissions.billing.*` (lines 375-379)

### New Keys Required

All keys below must be added to `src/i18n/he.ts`, `src/i18n/ar.ts`, and `src/i18n/en.ts`:

**Hours section:**
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `hours.title` | יומן שעות | سجل الساعات | Hours Log |
| `hours.logHours` | רשום שעות | تسجيل ساعات | Log Hours |
| `hours.totalHours` | סה"כ שעות | إجمالي الساعات | Total Hours |
| `hours.todayHours` | שעות היום | ساعات اليوم | Today's Hours |
| `hours.staffActive` | עובדים פעילים | موظفون نشطون | Staff Active |
| `hours.staffSummary` | סיכום לפי עובד | ملخص حسب الموظف | Summary by Staff |
| `hours.date` | תאריך | التاريخ | Date |
| `hours.staff` | עובד | الموظف | Staff Member |
| `hours.hoursColumn` | שעות | ساعات | Hours |
| `hours.note` | הערה | ملاحظة | Note |
| `hours.validHours` | הזן שעות תקינות | أدخل ساعات صحيحة | Enter valid hours |
| `hours.selectStaff` | בחר עובד | اختر موظف | Select staff member |
| `hours.noHoursYet` | לא נרשמו שעות עדיין | لم يتم تسجيل ساعات بعد | No hours logged yet |
| `hours.logSuccess` | שעות נרשמו בהצלחה | تم تسجيل الساعات بنجاح | Hours logged successfully |

**Invoices section:**
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `invoices.title` | חשבוניות | الفواتير | Invoices |
| `invoices.newInvoice` | חשבונית חדשה | فاتورة جديدة | New Invoice |
| `invoices.invoiceNum` | מספר חשבונית | رقم الفاتورة | Invoice Number |
| `invoices.date` | תאריך | التاريخ | Date |
| `invoices.amount` | סכום | المبلغ | Amount |
| `invoices.status` | סטטוס | الحالة | Status |
| `invoices.paid` | שולם | مدفوعة | Paid |
| `invoices.pending` | ממתין | قيد الانتظار | Pending |
| `invoices.sent` | נשלח | مرسلة | Sent |
| `invoices.print` | הדפסה/הורדה | طباعة/تنزيل | Print/Download |
| `invoices.markPaid` | סמן כשולם | وضع علامة مدفوع | Mark as Paid |
| `invoices.billingPeriod` | תקופת חיוב | فترة الفوترة | Billing Period |
| `invoices.invoiceWillInclude` | החשבונית תכלול | ستشمل الفاتورة | Invoice will include |
| `invoices.monthlyFeeLabel` | שכר טרחה חודשי | رسوم شهرية | Monthly Fee |
| `invoices.hoursInMonth` | שעות רשומות בחודש | ساعات مسجلة في الشهر | Hours logged this month |
| `invoices.includedInFee` | כלול בשכר הטרחה | مشمول في الرسوم | Included in fee |
| `invoices.noMonthlyFee` | אין שכר טרחה חודשי. ערוך לקוח להוספה | لا توجد رسوم شهرية. عدّل العميل لإضافتها | No monthly fee set. Edit client to add one |
| `invoices.noInvoicesYet` | לא נוצרו חשבוניות עדיין | لم يتم إنشاء فواتير بعد | No invoices yet |
| `invoices.createSuccess` | חשבונית נוצרה בהצלחה | تم إنشاء الفاتورة بنجاح | Invoice created successfully |
| `invoices.downloadSuccess` | חשבונית הורדה | تم تنزيل الفاتورة | Invoice downloaded |
| `invoices.paidSuccess` | סומן כשולם | تم وضع علامة مدفوع | Marked as paid |
| `invoices.professionalServices` | שירותים מקצועיים | خدمات مهنية | Professional services |
| `invoices.transactionInvoice` | חשבון עסקה | فاتورة تجارية | Transaction Invoice |
| `invoices.from` | מאת | من | From |
| `invoices.to` | אל | إلى | To |
| `invoices.caseFile` | תיק | ملف | Case File |
| `invoices.servicesFor` | שירותים | خدمات لفترة | Services for |
| `invoices.beforeVat` | לפני מע"מ | قبل ض.ق.م | Before VAT |
| `invoices.totalDue` | סה"כ לתשלום | الإجمالي المستحق | Total Due |
| `invoices.paymentDue` | מועד תשלום | تاريخ الاستحقاق | Payment Due |
| `invoices.thanks` | תודה על שיתוף הפעולה | شكراً لتعاونكم | Thank you for your cooperation |

**Billing ledger section:**
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `billing.ledger` | כרטסת | دفتر الحسابات | Ledger |
| `billing.totalCharges` | סה"כ חיובים | إجمالي الرسوم | Total Charges |
| `billing.totalCredits` | סה"כ זיכויים | إجمالي الإعتمادات | Total Credits |
| `billing.balance` | יתרה לתשלום | الرصيد المستحق | Outstanding Balance |
| `billing.addCharge` | הוסף חיוב | إضافة رسم | Add Charge |
| `billing.addCredit` | הוסף זיכוי | إضافة إعتماد | Add Credit |
| `billing.charge` | חיוב | رسم | Charge |
| `billing.credit` | זיכוי | إعتماد | Credit |
| `billing.description` | תיאור | الوصف | Description |
| `billing.amount` | סכום | المبلغ | Amount |
| `billing.date` | תאריך | التاريخ | Date |
| `billing.includeVat` | כולל מע"מ 18% | شامل ض.ق.م 18% | Include VAT 18% |
| `billing.totalWithVat` | סה"כ עם מע"מ | الإجمالي مع ض.ق.م | Total with VAT |
| `billing.markPaid` | סמן כשולם | وضع علامة مدفوع | Mark as Paid |
| `billing.cancelEntry` | ביטול | إلغاء | Cancel |
| `billing.cancelled` | בוטל | ملغاة | Cancelled |
| `billing.statusPaid` | שולם | مدفوع | Paid |
| `billing.statusPending` | ממתין | قيد الانتظار | Pending |
| `billing.monthlyCharge` | חיוב חודשי | رسوم شهرية | Monthly Charge |
| `billing.descriptionRequired` | נדרש תיאור | الوصف مطلوب | Description required |
| `billing.validAmount` | נדרש סכום תקין | أدخل مبلغ صحيح | Enter a valid amount |
| `billing.createSuccess` | חיוב נוסף בהצלחה | تم إضافة الرسم بنجاح | Entry added successfully |
| `billing.noEntriesYet` | לא קיימות רשומות | لا توجد سجلات بعد | No entries yet |
| `billing.creditLabel` | זיכוי | إعتماد | Credit (label) |
| `billing.vatIncluded` | כולל | شامل | Included |

**Billing overview section:**
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `billing.totalBilled` | סה"כ חויב | إجمالي المفوتر | Total Billed |
| `billing.totalCollected` | סה"כ גבייה | إجمالي المحصّل | Total Collected |
| `billing.outstanding` | יתרות פתוחות | المستحقات المفتوحة | Outstanding |
| `billing.lastInvoice` | חשבונית אחרונה | آخر فاتورة | Last Invoice |

**Client tabs (new tab):**
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `clients.tabs.hours` | שעות | ساعات | Hours |
| `clients.tabs.invoices` | חשבוניות | فواتير | Invoices |
| `clients.tabs.billing` | כרטסת | دفتر الحسابات | Ledger |

---

## 9. Routing Requirements

### 9.1 Replace Billing Placeholder

In `src/App.tsx`, replace:
```tsx
<Route path="billing" element={<SectionPlaceholder section="billing" />} />
```
with:
```tsx
<Route path="billing" element={<BillingView />} />
```

Add import:
```tsx
import { BillingView } from '@/components/billing/BillingView';
```

### 9.2 Sidebar Navigation

The sidebar already has the billing route configured at `src/components/layout/Sidebar.tsx:30`:
```ts
{ path: '/billing', icon: Receipt, labelKey: 'nav.billing' },
```

No changes needed to the sidebar.

---

## 10. Integration Points

### 10.1 ClientTabs — Add Hours, Invoices, Billing tabs

In `src/components/clients/ClientTabs.tsx`, add three new tabs:

1. **Hours tab** — Opens `HoursModal` or renders `HoursModal` inline
2. **Invoices tab** — Opens `InvoiceModal` or renders inline
3. **Billing/Ledger tab** — Opens `BillingModal` or renders inline

**Design decision for architect:** The legacy app uses separate modal dialogs triggered by buttons in the client card. The new app uses a tabs pattern in `ClientTabs`. Options:
- **Option A:** Add tabs in `ClientTabs` that render embedded content (not modals)
- **Option B:** Add action buttons in `ClientDetailView` that open modals (matching legacy pattern)
- **Option C:** Hybrid — tabs show summary data, clicking "open" triggers modals

The plan spec says "Wire into ClientView — Connect Hours, Invoices, Billing buttons in ClientHeader" which suggests buttons, but the current architecture uses tabs. The architect should decide.

### 10.2 ClientTabs Dependencies

`ClientTabs` currently receives only `clientId: string`. To support billing modals, it may need additional props from the `Client` object (name, monthlyFee, caseNum, email, billingDay) — or the billing components can fetch client data internally.

### 10.3 Permission Guards

All billing components should check:
- `billing.view` — for viewing billing data, hours, invoices
- `billing.create` — for adding billing entries, logging hours
- `billing.edit` — for marking paid, cancelling
- `billing.invoices` — for creating/managing invoices

Use `useAuthStore((s) => s.can('billing.view'))` for guards.

---

## 11. Domain Rules

### 11.1 Money Handling

- **Storage:** Always integer agorot (1 shekel = 100 agorot). NEVER floating-point.
- **Input:** Users enter amounts in shekels. Convert with `shekelToAgorot()` before storage.
- **Display:** Convert with `formatMoney()` which uses `agorotToShekel()` internally and formats with `he-IL` locale.
- **VAT:** Always 18% (`VAT_RATE = 0.18`). Calculate with `calculateVat()` — uses `Math.round()` to avoid fractional agorot.
- **Invoice totals:** Use `calculateInvoiceTotal(subtotalAgorot)` — returns `{ subtotal, vatAmount, total }`.

### 11.2 Invoice Number Format

- Format: `INV-XXXX` where XXXX is an auto-incrementing integer per firm.
- Starting sequence: 1001 (matching legacy `INVOICE_SEQ = 1000`, first invoice = 1001).
- Generated via `generate_invoice_num()` PostgreSQL function with advisory lock to prevent race conditions.
- Unique constraint: `(firm_id, invoice_num)`.

### 11.3 Invoice Creation Rules

1. Client must have `monthlyFee > 0` to create an invoice.
2. Invoice items always include: monthly fee line (qty=1, unit=fee, total=fee).
3. If hours exist for the selected month, add a second line: professional services summary (qty=totalHours, unit=0, total=0, note="included in fee").
4. Subtotal = monthly fee (the hours line has 0 cost).
5. VAT = `calculateVat(subtotal)`.
6. Total = subtotal + VAT.

### 11.4 Billing Entry Rules

- Amount is always stored as positive agorot. The `type` field determines whether it's a charge or credit.
- Balance = sum of charges - sum of credits.
- VAT handling: When `includeVat` is checked for a charge, the amount stored is `Math.round(inputShekels * 1.18 * 100)` (input converted to agorot with VAT).
- Status tracking: Entries can be pending, paid, or cancelled. (The legacy app uses Hebrew status strings; the new app should use English enum values if a status column is added, or track via paid_at/cancelled_at timestamps.)

### 11.5 Invoice Print Format

The `.txt` download follows this structure (from legacy `printInv` function):
```
==================================================
       חשבון עסקה
==================================================

מספר חשבונית: INV-1001    תאריך: 2026-03-19

מאת:
  [Firm Name]
  ח.פ.: [Firm Registration Number]
  טלפון: [Firm Phone]
  אימייל: [Firm Email]

אל:
  [Client Name]
  תיק: [Case Number]
  אימייל: [Client Email]

--------------------------------------------------
שירותים - [Month] [Year]
--------------------------------------------------

  שכר טרחה חודשי:    [formatMoney(subtotal)]

  שעות החודש: [totalHours]h
    [StaffName]: [hours]h

--------------------------------------------------
  לפני מעמ:           [formatMoney(subtotal)]
  מעמ (18%):          [formatMoney(vatAmount)]
  סהכ לתשלום:         [formatMoney(total)]
==================================================

מועד תשלום: יום [billingDay] לכל חודש
תודה על שיתוף הפעולה.
```

---

## 12. Open Questions

1. **Client Tabs vs. Modals vs. Buttons:** The plan says "Wire into ClientView — Connect Hours, Invoices, Billing buttons in ClientHeader" but the current `ClientDetailView` uses a `ClientTabs` component. Should billing features be:
   - (A) New tabs within `ClientTabs`?
   - (B) Action buttons in `ClientDetailView` that open modals?
   - (C) Both — tabs show summary, buttons open full modals?

   **Recommendation:** Option A (tabs) for consistency with the existing UI pattern. The legacy modal pattern was a constraint of the old inline rendering.

2. **Billing Entry Status Column:** The `BillingEntry` type has no `status` field, but the legacy app tracks status ("pending"/"paid"/"cancelled"). Should we:
   - (A) Add a `status` column to the `billing_entries` table and type?
   - (B) Use `paid_at` and `cancelled_at` timestamp columns instead?
   - (C) Keep it simple — billing entries have no status; invoices handle payment tracking?

   **Recommendation:** Option A — add a `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled'))` column. This matches the legacy behavior and is the most straightforward.

3. **Billing Entry → Invoice Link:** The `BillingEntry` type has `invoice_id?: string`. When creating an invoice, should a corresponding billing entry (charge) be automatically created? The legacy app has billing and invoices as separate systems. The architect should clarify the relationship.

4. **BillingView Client List:** The overview shows client billing summaries. Should this:
   - (A) Query all invoices and group by client (simpler)?
   - (B) Add a database view or function that aggregates billing data per client (more performant)?

   **Recommendation:** Start with (A) and optimize later if needed.

5. **Hours Log and Billing Day-based Reporting:** The plan mentions `billingDay` on clients. Should hours/invoices be filterable or groupable by billing cycle (e.g., day 15 of month N to day 14 of month N+1)? The legacy app does not implement this — it only uses calendar months. The architect should confirm that simple calendar month grouping is sufficient.

---

## 13. Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20260320100000_create_billing_tables.sql` | Database tables, RLS, indexes, triggers, functions |
| `src/services/billingService.ts` | Billing entries CRUD + balance |
| `src/services/hoursService.ts` | Hours log CRUD |
| `src/services/invoiceService.ts` | Invoices CRUD + invoice number generation |
| `src/hooks/useBilling.ts` | React Query hooks for billing entries |
| `src/hooks/useHours.ts` | React Query hooks for hours log |
| `src/hooks/useInvoices.ts` | React Query hooks for invoices |
| `src/components/billing/HoursModal.tsx` | Hours logging modal/tab |
| `src/components/billing/InvoiceModal.tsx` | Invoice creation/management modal/tab |
| `src/components/billing/BillingModal.tsx` | Billing ledger modal/tab |
| `src/components/billing/BillingView.tsx` | `/billing` route overview page |

## 14. Files to Modify

| File | Change |
|------|--------|
| `src/types/billing.ts` | Add `CreateHoursInput` type |
| `src/App.tsx` | Replace billing `SectionPlaceholder` with `BillingView` |
| `src/components/clients/ClientTabs.tsx` | Add hours/invoices/billing tabs |
| `src/i18n/he.ts` | Add ~50 new translation keys (hours.*, invoices.*, billing.*) |
| `src/i18n/ar.ts` | Add ~50 new translation keys |
| `src/i18n/en.ts` | Add ~50 new translation keys |
| `docs/plans/SHARED-CODE-REGISTRY.md` | Register new services, hooks, components |
