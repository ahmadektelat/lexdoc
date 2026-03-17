# Clients

Implement the full client management module: list, create, edit, delete, and detail view with tabs.

**Branch:** `migration/clients-module`
**Prerequisites:** Phase 2 (Auth & Onboarding) merged to main

## Context

- Read legacy-app.html lines 1587-1698 for ClientView, and the CLIENTS data structure (lines 120-145)
- firm_id scoping on ALL queries — one firm never sees another's data
- Hebrew is primary language — all strings use t() from useLanguage()
- 3 themes via CSS variables — use bg-background, text-foreground, bg-card, border-border, etc.
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code, DO NOT recreate

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { Client, ClientType, CreateClientInput, UpdateClientInput } from '@/types'`
- Constants: `import { CLIENT_TYPES, DEFAULT_FOLDERS } from '@/lib/constants'`
- Utils: `import { formatDate } from '@/lib/dates'`, `import { formatMoney } from '@/lib/money'`, `import { sanitizeSearchInput } from '@/lib/validation'`
- Components: `import { StatusBadge, EmptyState, LoadingSpinner, PageHeader, DataTable, SearchInput, ConfirmDialog, FormField } from '@/components/shared'`
- Auth: `import { useAuthStore } from '@/stores/useAuthStore'`
- Supabase: `import { supabase } from '@/integrations/supabase/client'`

## Features to Implement

1. **ClientsView** — Main client list:
   - PageHeader with title "לקוחות" and "הוספת לקוח" button
   - SearchInput for filtering by name, case number, tax ID
   - ClientTypePicker filter (all / company / self_employed / economic / private)
   - Status filter (all / active / archived)
   - DataTable showing: name, caseNum, type (badge), taxId, phone, monthly fee (formatMoney), status (StatusBadge), assigned staff
   - Click row → navigate to /clients/:id
   - Responsive: card layout on mobile

2. **ClientForm** — Modal dialog for create/edit:
   - Fields: name (required), type, clientType, taxId, mobile, email, address, city, tags (comma-separated), monthlyFee, billingDay (1-28), notes
   - taxId and mobile inputs with dir="ltr"
   - Validation: name required, email format, phone format
   - On create: auto-generate caseNum as "YYYY-###"
   - Toast on success/error

3. **ClientView** — Detail view at /clients/:id:
   - ClientHeader: avatar (first letter), name, case number, type badges, monthly fee, assigned staff, tags
   - Action buttons row: Hours, Invoices, Users, Documents, Billing (these will be implemented in later phases — for now show disabled buttons with tooltips)
   - Tab navigation (4 tabs):
     - Documents tab (placeholder for Phase 9)
     - Filings tab (placeholder for Phase 7)
     - Tasks tab (placeholder for Phase 6)
     - Activity tab (placeholder for Phase 13)
   - Back button to client list

4. **ClientTypePicker** — Horizontal filter:
   - Buttons for each client type + "all"
   - Active state styling
   - Uses constants from CLIENT_TYPES

5. **Service** — `clientService.ts`:
   - list(firmId, options): paginated, filtered, searched
   - getById(id): single client
   - create(input): with firm_id
   - update(id, input): partial update
   - archive(id): soft-delete (set status to archived)
   - restore(id): unarchive
   - delete(id): hard delete (soft delete via deleted_at)

6. **Hooks** — `useClients.ts`:
   - clientKeys factory
   - useClients(firmId, filters) — list query
   - useClient(id) — single client query
   - useCreateClient() — mutation with cache invalidation
   - useUpdateClient() — mutation
   - useDeleteClient() — mutation

7. **Database migration**:
   - Create `clients` table with all fields from Client type
   - firm_id FK to firms, indexes, RLS policies, moddatetime trigger
   - soft delete column

8. **Route** — Add /clients and /clients/:id routes to App.tsx

Add i18n keys for all client-related strings (clients.* section) to all 3 language files.
