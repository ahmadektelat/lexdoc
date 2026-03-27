# Billing Module — Implementation Summary

**Date:** 2026-03-23
**Branch:** `migration/billing-module`
**Commits:** `557961a` (implementation), `9c00a37` (review fixes)

## What Was Implemented

The billing module provides four core capabilities:

1. **Hours Tracking (HoursTab)** — Log staff work hours per client with staff picker, date, hours (decimal), and notes. Displays metrics (total hours, today's hours, staff active count) and a full hours log table.

2. **Invoice Generation (InvoicesTab)** — Create invoices from a client's monthly fee for a selected billing period. Invoices include 18% VAT, track sent/paid status, and can be downloaded as formatted `.txt` files. Invoice numbers auto-increment per firm as `INV-XXXX`.

3. **Billing Ledger (LedgerTab)** — Client billing entries (charges/credits) with running outstanding balance. Supports manual entries with optional VAT addition, plus a one-click monthly fee charge. Entries can be marked as paid or cancelled.

4. **Billing Overview (BillingView at /billing)** — Firm-wide billing dashboard with summary cards (total billed, total collected, outstanding) and a client list with balance columns.

## Key Design Decisions

- **Tabs, not modals** — billing features are tab panels in ClientTabs, not modal dialogs
- **Status column** on billing entries — `pending`, `paid`, `cancelled`
- **Invoice → billing entry auto-link** — creating an invoice auto-creates a charge in the ledger
- **Calendar months** — simple month grouping; billingDay only for payment due dates
- **Outstanding balance** = only pending entries (paid entries excluded)
- **Integer agorot** throughout — no floating-point money

## Files Created (11)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260320100000_create_billing_tables.sql` | DB tables, RLS, indexes, triggers, functions |
| `src/services/hoursService.ts` | Hours log CRUD |
| `src/services/billingService.ts` | Billing entries CRUD + balance + status |
| `src/services/invoiceService.ts` | Invoices CRUD + invoice number + auto-billing-entry |
| `src/hooks/useBilling.ts` | React Query hooks for billing entries |
| `src/hooks/useHours.ts` | React Query hooks for hours log |
| `src/hooks/useInvoices.ts` | React Query hooks for invoices (cross-invalidates billing) |
| `src/components/billing/HoursTab.tsx` | Hours logging tab panel |
| `src/components/billing/InvoicesTab.tsx` | Invoice management tab panel |
| `src/components/billing/LedgerTab.tsx` | Billing ledger tab panel |
| `src/components/billing/BillingView.tsx` | /billing route overview page |

## Files Modified (9)

| File | Change |
|------|--------|
| `src/types/billing.ts` | Added `status` to BillingEntry, `CreateHoursInput` type |
| `src/components/clients/ClientTabs.tsx` | Added 3 new tabs, `client: Client` prop |
| `src/components/clients/ClientDetailView.tsx` | Passes `client` prop to ClientTabs |
| `src/App.tsx` | Replaced billing SectionPlaceholder with BillingView |
| `src/i18n/he.ts` | Added ~67 new translation keys |
| `src/i18n/ar.ts` | Added ~67 new translation keys |
| `src/i18n/en.ts` | Added ~67 new translation keys |
| `src/lib/constants.ts` | Added billing permissions to manager role |
| `docs/plans/SHARED-CODE-REGISTRY.md` | Registered new services, hooks, types |

## Review Results

- **Code reviewer:** APPROVED
- **Devil's advocate:** CHANGES REQUESTED → 3 bugs fixed → re-verified
- **Security auditor:** PASS (0 critical, 3 medium — all defense-in-depth, not blockers)

### Bugs Fixed in Review

1. Supabase `{ error }` return value checked in invoiceService (was silently swallowed by try/catch)
2. `handlePrint` now filters hours by invoice date month (was using selected dropdown month)
3. Form reset moved to `onSuccess` callbacks in LedgerTab and InvoicesTab (was premature)
4. Delete toast keys fixed — `hours.deleteSuccess` and `invoices.deleteSuccess` added

## Security Hardening Applied

- `CHECK (amount > 0)` on billing_entries
- `CHECK (total = subtotal + vat_amount)` on invoices
- `CHECK (jsonb_typeof(items) = 'array')` on invoices.items
- Granular permission guards on all UI actions
- Manager role gets billing permissions
- Invoice markPaid syncs linked billing entry status

## Verification

- `npx tsc --noEmit` — PASS (zero errors)
- `npm run build` — PASS
- `npm run lint` — PASS (no new warnings)
