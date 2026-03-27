# Billing & Invoicing Module

Billing management: hours tracking, billing entries, invoice generation with 18% VAT, and client ledger.

**Branch:** `migration/billing-module`
**Prerequisites:** Phase 4 (Staff) merged to main

## Context

- Read legacy-app.html lines 734-963 for HoursModal, InvoiceModal
- Read BILLING, HOURS, INVOICES data structures
- Read invoice creation function (lines 335-363)
- Money is stored as integer agorot (1 shekel = 100 agorot) — NEVER use floating-point
- VAT rate: 18% — use calculateVat() and calculateInvoiceTotal() from shared utils
- firm_id scoping on ALL queries
- Hebrew primary — all strings use t()
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { BillingEntry, HoursEntry, Invoice, InvoiceItem, CreateBillingInput, CreateInvoiceInput } from '@/types'`
- Constants: `import { VAT_RATE, AGOROT_PER_SHEKEL } from '@/lib/constants'`
- Utils: `import { formatMoney, shekelToAgorot, agorotToShekel, calculateVat, calculateInvoiceTotal } from '@/lib/money'`, `import { formatDate } from '@/lib/dates'`
- Components: `import { PageHeader, DataTable, EmptyState, LoadingSpinner, FormField, ConfirmDialog, StatusBadge } from '@/components/shared'`
- Staff: `import { StaffPicker } from '@/components/staff/StaffPicker'`

## Features to Implement

1. **HoursModal** — Hours logging per client:
   - Staff picker (StaffPicker component)
   - Hours input (numeric, decimal allowed)
   - Date field (defaults to today)
   - Note field (optional)
   - Display metrics: total hours, today's hours, staff count
   - Hours summary table: date, staff name, role badge, hours, note
   - Validation: hours > 0, staff selected

2. **InvoiceModal** — Invoice creation & management:
   - Month selector (last 12 months dropdown)
   - Shows: monthly fee, VAT calculation (using calculateVat), total (using calculateInvoiceTotal)
   - Requires client to have monthlyFee set
   - Invoice list table: number, date, amount (formatMoney), VAT, total, status (StatusBadge), actions
   - Actions: Print/download (generate .txt), Mark as paid
   - Invoice number format: "INV-XXXX" (auto-increment)

3. **BillingModal** — Client billing ledger:
   - List of billing entries (charges/credits)
   - Add entry: type (charge/credit), amount (input in shekels, convert to agorot), date, notes
   - Running balance display
   - Color: red for debt, green for credit

4. **BillingView** — Overview route /billing:
   - Summary cards: total billed, total collected, outstanding
   - Client list with balance column
   - Quick access to each client's billing

5. **Invoice generation logic**:
   - Items: monthly fee line, hours summary line
   - VAT calculation: Math.round(subtotal * 0.18) — integer agorot
   - Total = subtotal + vatAmount
   - Print format: formatted text with separator lines

6. **Services**:
   - billingService: list(clientId), create, getBalance(clientId)
   - hoursService: list(clientId), create, getTotalHours(clientId), getTodayHours(clientId)
   - invoiceService: list(clientId), create(clientId, month), markPaid(id), getNextInvoiceNumber(firmId)

7. **Database migrations**:
   - `billing_entries` (firm_id, client_id, type, amount INTEGER, date, notes, invoice_id)
   - `hours_log` (firm_id, client_id, staff_id, staff_name, hours NUMERIC(5,2), date, note)
   - `invoices` (firm_id, client_id, invoice_num, date, items JSONB, subtotal INTEGER, vat_amount INTEGER, total INTEGER, sent BOOLEAN, paid BOOLEAN, paid_date)
   - RLS, indexes, GRANTs

8. **Wire into ClientView** — Connect Hours, Invoices, Billing buttons in ClientHeader

Add i18n keys (billing.*, hours.*, invoices.* sections) to all 3 language files.

Files to create:
- `src/components/billing/HoursModal.tsx`
- `src/components/billing/InvoiceModal.tsx`
- `src/components/billing/BillingModal.tsx`
- `src/components/billing/BillingView.tsx`
- `src/services/billingService.ts`
- `src/services/hoursService.ts`
- `src/services/invoiceService.ts`
- `src/hooks/useBilling.ts`, `useHours.ts`, `useInvoices.ts`
- Database migrations for `billing_entries`, `hours_log`, `invoices` tables
