# Technical Design — Clients Module

## Architecture Approach

**Client-side filtering with DB-generated case numbers.** All clients for a firm are fetched in a single query and filtered/sorted/paginated in the browser using TanStack Table's built-in models. Case numbers are generated atomically in Postgres via a `BEFORE INSERT` trigger to prevent duplicates across concurrent inserts. Mobile uses a dedicated card layout detected via a `useMediaQuery`-style check (Tailwind `md:` breakpoint).

**Why this approach:** The user explicitly chose client-side filtering (Decision #4) for snappy UX. Israeli accounting/law firms typically have hundreds, not millions, of clients per firm — a single fetch is practical. DB-side case number generation (Decision #2) is the only safe approach for per-firm sequential numbering under concurrency.

### Data Flow

```
UI Component
  → useClients / useClient hook (React Query)
    → clientService methods (Supabase JS client)
      → Supabase REST API
        → PostgreSQL (RLS enforces firm_id scoping)
          → Triggers (case_num generation, updated_at)
```

---

## File-by-File Change Plan

### Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/<timestamp>_create_clients.sql` | DB migration (applied via Supabase MCP) |
| 2 | `src/services/clientService.ts` | CRUD service with snake_case mapping |
| 3 | `src/hooks/useClients.ts` | React Query hooks + cache invalidation |
| 4 | `src/components/clients/ClientsView.tsx` | Main list page |
| 5 | `src/components/clients/ClientCard.tsx` | Mobile card layout |
| 6 | `src/components/clients/ClientTypePicker.tsx` | Horizontal type filter |
| 7 | `src/components/clients/ClientForm.tsx` | Create/edit dialog |
| 8 | `src/components/clients/ClientDetailView.tsx` | Detail page |
| 9 | `src/components/clients/ClientHeader.tsx` | Detail page header |
| 10 | `src/components/clients/ClientTabs.tsx` | Tabbed placeholder content |

### Files to Modify

| # | File | Change |
|---|------|--------|
| 11 | `src/App.tsx` | Replace clients placeholder route, add `:id` route |
| 12 | `src/types/client.ts` | Update `CreateClientInput` to omit `caseNum` and `status` |
| 13 | `src/i18n/he.ts` | Add ~40 new `clients.*` keys |
| 14 | `src/i18n/ar.ts` | Add matching Arabic keys |
| 15 | `src/i18n/en.ts` | Add matching English keys |

---

## 1. Database Migration

**Action:** Create new migration (apply via Supabase MCP `apply_migration`)

```sql
-- Create clients table
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
  monthly_fee INTEGER DEFAULT 0,
  billing_day INTEGER CHECK (billing_day BETWEEN 1 AND 28),
  assigned_staff_id UUID,            -- TODO: ADD FK REFERENCES staff(id) when staff module is built
  notes TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique case number per firm
ALTER TABLE clients ADD CONSTRAINT clients_firm_case_num_unique UNIQUE (firm_id, case_num);

-- Indexes
CREATE INDEX idx_clients_firm_id ON clients(firm_id);
CREATE INDEX idx_clients_firm_status ON clients(firm_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_firm_type ON clients(firm_id, client_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_name_search ON clients(firm_id, name) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON clients FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

CREATE POLICY "clients_insert" ON clients FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE POLICY "clients_update" ON clients FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE POLICY "clients_delete" ON clients FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Case number generation function
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

  -- Advisory lock prevents duplicates when no rows exist yet (first client of the year)
  PERFORM pg_advisory_xact_lock(hashtext(p_firm_id::text || v_year));

  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(case_num, '-', 2) AS INTEGER)), 0
  ) INTO v_max_seq
  FROM clients
  WHERE firm_id = p_firm_id
    AND case_num LIKE v_year || '-%';

  v_new_seq := v_max_seq + 1;
  RETURN v_year || '-' || LPAD(v_new_seq::TEXT, 3, '0');
END;
$$;

-- Trigger: auto-generate case_num on INSERT
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

-- Trigger: auto-update updated_at
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- GRANTs — Supabase does NOT auto-grant to authenticated when RLS is enabled
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO authenticated;
GRANT EXECUTE ON FUNCTION generate_case_num(UUID) TO authenticated;
```

**Rationale:** The advisory lock in `generate_case_num` prevents duplicate case numbers even when no rows exist for the current year (first client scenario). The `moddatetime` extension is already enabled (used by the `firms` table from Phase 2). Explicit GRANTs are required because Supabase does not auto-grant table permissions to the `authenticated` role when RLS is enabled.

---

## 1b. Type Update — `src/types/client.ts`

**Action:** Modify

**Exact diff:**

```diff
-export type CreateClientInput = Omit<Client, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;
+export type CreateClientInput = Omit<Client, 'id' | 'firm_id' | 'caseNum' | 'status' | 'deleted_at' | 'created_at' | 'updated_at'>;

-export type UpdateClientInput = Partial<Omit<Client, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;
+export type UpdateClientInput = Partial<Omit<Client, 'id' | 'firm_id' | 'caseNum' | 'deleted_at' | 'created_at' | 'updated_at'>>;
```

**Rationale:** `caseNum` is auto-generated by the DB trigger and must never be changed by client code. `status` is omitted from `CreateClientInput` (always `'active'` on creation, set by service layer). `deleted_at` is omitted from `UpdateClientInput` because soft-delete is handled exclusively by the `delete()` service method — callers should not set it directly. `status` remains in `UpdateClientInput` because archive/restore legitimately changes it.

---

## 2. Service Layer

### `src/services/clientService.ts`

**Action:** Create

```typescript
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation for clients module

import { supabase } from '@/integrations/supabase/client';
import type { Client, CreateClientInput, UpdateClientInput } from '@/types';

// Map a Supabase DB row (snake_case) to a Client object (camelCase)
function rowToClient(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    name: row.name as string,
    caseNum: row.case_num as string,
    status: row.status as Client['status'],
    type: row.type as Client['type'],
    clientType: row.client_type as Client['clientType'],
    taxId: (row.tax_id as string) ?? undefined,
    mobile: (row.mobile as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    address: (row.address as string) ?? undefined,
    city: (row.city as string) ?? undefined,
    tags: (row.tags as string[]) ?? [],
    monthlyFee: (row.monthly_fee as number) ?? 0,
    billingDay: (row.billing_day as number) ?? undefined,
    assignedStaffId: (row.assigned_staff_id as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// Map camelCase input to snake_case DB columns for INSERT.
// Note: caseNum and status are excluded from CreateClientInput (set by service/DB).
function clientInputToRow(input: CreateClientInput): Record<string, unknown> {
  return {
    name: input.name,
    status: 'active',  // Always active on creation; service layer controls this
    type: input.type,
    client_type: input.clientType,
    tax_id: input.taxId ?? null,
    mobile: input.mobile ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    tags: input.tags ?? [],
    monthly_fee: input.monthlyFee ?? 0,
    billing_day: input.billingDay ?? null,
    assigned_staff_id: input.assignedStaffId ?? null,
    notes: input.notes ?? null,
    case_num: '', // Safety net for NOT NULL constraint — DB trigger overwrites with generated value
  };
}

// Map camelCase partial update to snake_case DB columns
function updateInputToRow(input: UpdateClientInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.status !== undefined) row.status = input.status;
  if (input.type !== undefined) row.type = input.type;
  if (input.clientType !== undefined) row.client_type = input.clientType;
  if (input.taxId !== undefined) row.tax_id = input.taxId;
  if (input.mobile !== undefined) row.mobile = input.mobile;
  if (input.email !== undefined) row.email = input.email;
  if (input.address !== undefined) row.address = input.address;
  if (input.city !== undefined) row.city = input.city;
  if (input.tags !== undefined) row.tags = input.tags;
  if (input.monthlyFee !== undefined) row.monthly_fee = input.monthlyFee;
  if (input.billingDay !== undefined) row.billing_day = input.billingDay;
  if (input.assignedStaffId !== undefined) row.assigned_staff_id = input.assignedStaffId;
  if (input.notes !== undefined) row.notes = input.notes;
  return row;
}

export const clientService = {
  /** Fetch all non-deleted clients for a firm. */
  async list(firmId: string): Promise<Client[]> {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToClient);
  },

  /** Fetch a single client by ID. */
  async getById(id: string): Promise<Client> {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Client not found');
    return rowToClient(data as Record<string, unknown>);
  },

  /** Create a new client. firm_id is set server-side, case_num is auto-generated by trigger. */
  async create(firmId: string, input: CreateClientInput): Promise<Client> {
    const row = clientInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('clients')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToClient(data as Record<string, unknown>);
  },

  /** Update an existing client. */
  async update(id: string, input: UpdateClientInput): Promise<Client> {
    const row = updateInputToRow(input);

    const { data, error } = await supabase
      .from('clients')
      .update(row)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToClient(data as Record<string, unknown>);
  },

  /** Archive a client (set status to 'archived'). */
  async archive(id: string): Promise<void> {
    const { error } = await supabase
      .from('clients')
      .update({ status: 'archived' })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  /** Restore an archived client (set status to 'active'). */
  async restore(id: string): Promise<void> {
    const { error } = await supabase
      .from('clients')
      .update({ status: 'active' })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  /** Soft delete a client (set deleted_at). */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
```

**Rationale:**
- Follows the same pattern as `firmService.ts` — a `rowToX` mapper function, an exported `const xService` object.
- `create()` omits `case_num` from the insert payload — the DB trigger fills it. The service passes `firm_id` from the parameter (not from user input) to prevent firm impersonation.
- `delete()` is a soft delete (sets `deleted_at`) matching the CLAUDE.md convention.
- All queries filter `deleted_at IS NULL` for consistency.
- Uses `Record<string, unknown>` casting consistent with `firmService.ts`.

---

## 3. Hook Layer

### `src/hooks/useClients.ts`

**Action:** Create

```typescript
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation for clients module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientService } from '@/services/clientService';
import type { CreateClientInput, UpdateClientInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (firmId: string) => [...clientKeys.lists(), firmId] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

export function useClients(firmId: string | null) {
  return useQuery({
    queryKey: clientKeys.list(firmId ?? ''),
    queryFn: () => clientService.list(firmId!),
    enabled: !!firmId,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: clientKeys.detail(id ?? ''),
    queryFn: () => clientService.getById(id!),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateClientInput }) =>
      clientService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      toast.success(t('clients.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClientInput }) =>
      clientService.update(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.id) });
      toast.success(t('clients.updateSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useArchiveClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => clientService.archive(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(id) });
      toast.success(t('clients.archiveSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRestoreClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => clientService.restore(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(id) });
      toast.success(t('clients.restoreSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => clientService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      toast.success(t('clients.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
```

**Rationale:**
- Query key factory pattern enables granular cache invalidation.
- `useClients` takes `firmId | null` and is disabled when null (covers loading state in auth store).
- `useClient` takes `id | undefined` for route param scenarios.
- All mutations invalidate the list query; detail-modifying mutations also invalidate the specific detail query.
- Toast messages use i18n keys.
- Follows the same pattern as the existing `useAuth` hook structure (service layer abstraction, hooks consume services).

---

## 4. Components

### 4a. `src/components/clients/ClientTypePicker.tsx`

**Action:** Create

```tsx
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation

import { useLanguage } from '@/contexts/LanguageContext';
import { CLIENT_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import type { ClientType } from '@/types';

interface ClientTypePickerProps {
  value: ClientType | 'all';
  onChange: (value: ClientType | 'all') => void;
}

const TYPE_OPTIONS: Array<{ value: ClientType | 'all'; labelKey: string }> = [
  { value: 'all', labelKey: 'clients.all' },
  ...Object.entries(CLIENT_TYPES).map(([value, labelKey]) => ({
    value: value as ClientType,
    labelKey,
  })),
];

export function ClientTypePicker({ value, onChange }: ClientTypePickerProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-wrap gap-2">
      {TYPE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(option.value)}
        >
          {t(option.labelKey)}
        </Button>
      ))}
    </div>
  );
}
```

**Rationale:** Uses `CLIENT_TYPES` constant (stores i18n keys), `Button` from shadcn/ui with variant toggling for active state. The `'all'` option uses `clients.all` key. Clean, minimal component with no internal state.

---

### 4b. `src/components/clients/ClientCard.tsx`

**Action:** Create

```tsx
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation

import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLIENT_TYPES } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Client } from '@/types';

interface ClientCardProps {
  client: Client;
}

export function ClientCard({ client }: ClientCardProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => navigate(`/clients/${client.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
            {client.name.charAt(0)}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + case number */}
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{client.name}</h3>
              <span className="text-xs text-muted-foreground" dir="ltr">
                {client.caseNum}
              </span>
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Badge variant="secondary" className="text-xs">
                {t(CLIENT_TYPES[client.clientType])}
              </Badge>
              <StatusBadge status={client.status} />
            </div>

            {/* Fee */}
            {client.monthlyFee ? (
              <p className="text-sm text-muted-foreground mt-1.5">
                {formatMoney(client.monthlyFee)} {t('clients.perMonth')}
              </p>
            ) : null}

            {/* Tags */}
            {client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {client.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Rationale:** A focused mobile card. Uses `Card` from shadcn/ui. Avatar uses first letter of name (consistent with `ClientHeader`). Case number is forced `dir="ltr"` since it is a format code. Navigates on click.

---

### 4c. `src/components/clients/ClientForm.tsx`

**Action:** Create

```tsx
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateClient, useUpdateClient } from '@/hooks/useClients';
import { CLIENT_TYPES } from '@/lib/constants';
import { shekelToAgorot, agorotToShekel } from '@/lib/money';
import { validateEmail, validatePhone, validateTaxId, validateCompanyId } from '@/lib/validation';
import { FormField } from '@/components/shared/FormField';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Client, ClientType, CreateClientInput, UpdateClientInput } from '@/types';

interface ClientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client; // If provided, we're in edit mode
}

interface FormState {
  name: string;
  type: 'company' | 'private';
  clientType: ClientType;
  taxId: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  tags: string;
  monthlyFee: string; // display as shekels, stored as agorot
  billingDay: string;
  notes: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_STATE: FormState = {
  name: '',
  type: 'private',
  clientType: 'self_employed',
  taxId: '',
  mobile: '',
  email: '',
  address: '',
  city: '',
  tags: '',
  monthlyFee: '',
  billingDay: '',
  notes: '',
};

function clientToFormState(client: Client): FormState {
  return {
    name: client.name,
    type: client.type,
    clientType: client.clientType,
    taxId: client.taxId ?? '',
    mobile: client.mobile ?? '',
    email: client.email ?? '',
    address: client.address ?? '',
    city: client.city ?? '',
    tags: client.tags.join(', '),
    monthlyFee: client.monthlyFee ? String(agorotToShekel(client.monthlyFee)) : '',
    billingDay: client.billingDay ? String(client.billingDay) : '',
    notes: client.notes ?? '',
  };
}

export function ClientForm({ open, onOpenChange, client }: ClientFormProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const isEdit = !!client;

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});

  // Reset form when dialog opens/closes or client changes
  useEffect(() => {
    if (open) {
      setForm(client ? clientToFormState(client) : INITIAL_STATE);
      setErrors({});
    }
  }, [open, client]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};

    if (!form.name.trim()) {
      errs.name = t('common.required');
    }

    if (form.email && !validateEmail(form.email)) {
      errs.email = t('auth.errors.invalidEmail');
    }

    if (form.mobile && !validatePhone(form.mobile)) {
      errs.mobile = t('auth.errors.invalidPhone');
    }

    if (form.taxId) {
      const isCompanyType = form.type === 'company';
      const isValid = isCompanyType
        ? validateCompanyId(form.taxId)
        : validateTaxId(form.taxId);
      if (!isValid) {
        errs.taxId = t('errors.generic');
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!firmId) return;

    const tagsArray = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const feeAgorot = form.monthlyFee
      ? shekelToAgorot(parseFloat(form.monthlyFee))
      : 0;

    if (isEdit && client) {
      const input: UpdateClientInput = {
        name: form.name.trim(),
        type: form.type,
        clientType: form.clientType,
        taxId: form.taxId || undefined,
        mobile: form.mobile || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        tags: tagsArray,
        monthlyFee: feeAgorot,
        billingDay: form.billingDay ? parseInt(form.billingDay, 10) : undefined,
        notes: form.notes || undefined,
      };
      updateClient.mutate(
        { id: client.id, input },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      // caseNum and status are omitted — set by service layer and DB trigger
      const input: CreateClientInput = {
        name: form.name.trim(),
        type: form.type,
        clientType: form.clientType,
        taxId: form.taxId || undefined,
        mobile: form.mobile || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        tags: tagsArray,
        monthlyFee: feeAgorot,
        billingDay: form.billingDay ? parseInt(form.billingDay, 10) : undefined,
        notes: form.notes || undefined,
      };
      createClient.mutate(
        { firmId, input },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isSubmitting = createClient.isPending || updateClient.isPending;

  const billingDayOptions = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('clients.editClient') : t('clients.addNew')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <FormField label={t('clients.name')} required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </FormField>

          {/* Type (high-level) */}
          <FormField label={t('clients.highLevelType')}>
            <Select value={form.type} onValueChange={(v) => setField('type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">{t('clients.type.company')}</SelectItem>
                <SelectItem value="private">{t('clients.type.private')}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {/* Client Type (registration type) */}
          <FormField label={t('clients.registrationType')}>
            <Select
              value={form.clientType}
              onValueChange={(v) => setField('clientType', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CLIENT_TYPES).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Tax ID */}
          <FormField label={t('clients.taxId')} error={errors.taxId}>
            <Input
              dir="ltr"
              value={form.taxId}
              onChange={(e) => setField('taxId', e.target.value)}
              className="text-start"
            />
          </FormField>

          {/* Mobile */}
          <FormField label={t('clients.phone')} error={errors.mobile}>
            <Input
              dir="ltr"
              value={form.mobile}
              onChange={(e) => setField('mobile', e.target.value)}
              placeholder="05X-XXXXXXX"
              className="text-start"
            />
          </FormField>

          {/* Email */}
          <FormField label={t('clients.email')} error={errors.email}>
            <Input
              dir="ltr"
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className="text-start"
            />
          </FormField>

          {/* Address */}
          <FormField label={t('clients.address')}>
            <Input
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
            />
          </FormField>

          {/* City */}
          <FormField label={t('clients.city')}>
            <Input
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
            />
          </FormField>

          {/* Tags */}
          <FormField label={t('clients.tags')} hint={t('clients.tagsHint')}>
            <Input
              value={form.tags}
              onChange={(e) => setField('tags', e.target.value)}
            />
          </FormField>

          {/* Monthly Fee */}
          <FormField label={t('clients.monthlyFee')}>
            <Input
              dir="ltr"
              type="number"
              min="0"
              step="0.01"
              value={form.monthlyFee}
              onChange={(e) => setField('monthlyFee', e.target.value)}
              className="text-start"
            />
          </FormField>

          {/* Billing Day */}
          <FormField label={t('clients.billingDay')}>
            <Select
              value={form.billingDay}
              onValueChange={(v) => setField('billingDay', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="-" />
              </SelectTrigger>
              <SelectContent>
                {billingDayOptions.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Notes */}
          <FormField label={t('clients.notes')}>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormField>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Rationale:**
- Uses `Dialog` from shadcn/ui (same pattern as `ConfirmDialog`).
- Form state is plain `useState` — no form library needed for this field count.
- `clientToFormState` converts a `Client` to the form shape; `monthlyFee` is displayed in shekels, stored as agorot.
- `CreateClientInput` omits `caseNum` and `status` — set by service layer and DB trigger respectively.
- `dir="ltr"` on taxId, mobile, email inputs per CLAUDE.md RTL rules.
- Validation uses the shared validation utilities from `@/lib/validation`.
- Tax ID validation is context-dependent: company type uses `validateCompanyId`, personal type uses `validateTaxId`.
- The textarea uses raw HTML `<textarea>` with Tailwind classes matching shadcn/ui Input styling (shadcn/ui does not ship a Textarea by default, and creating one is not needed for a single usage).

---

### 4d. `src/components/clients/ClientsView.tsx`

**Action:** Create

```tsx
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { CLIENT_TYPES } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientTypePicker } from './ClientTypePicker';
import { ClientCard } from './ClientCard';
import { ClientForm } from './ClientForm';
import { Plus, Users } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Client, ClientType } from '@/types';

// Detect mobile via media query — proper useEffect with cleanup
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

export function ClientsView() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients, isLoading } = useClients(firmId);
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ClientType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [formOpen, setFormOpen] = useState(false);

  // Client-side filtering
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    return clients.filter((client) => {
      // Type filter
      if (typeFilter !== 'all' && client.clientType !== typeFilter) return false;
      // Status filter
      if (statusFilter !== 'all' && client.status !== statusFilter) return false;
      // Search
      if (search) {
        const q = search.toLowerCase();
        return (
          client.name.toLowerCase().includes(q) ||
          client.caseNum.toLowerCase().includes(q) ||
          (client.taxId?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [clients, typeFilter, statusFilter, search]);

  // Column definitions for DataTable
  const columns: ColumnDef<Client, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: t('clients.name'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'caseNum',
        header: t('clients.caseNum'),
        cell: ({ row }) => (
          <span dir="ltr" className="text-muted-foreground">
            {row.original.caseNum}
          </span>
        ),
      },
      {
        accessorKey: 'clientType',
        header: t('clients.type'),
        cell: ({ row }) => (
          <Badge variant="secondary">
            {t(CLIENT_TYPES[row.original.clientType])}
          </Badge>
        ),
      },
      {
        accessorKey: 'taxId',
        header: t('clients.taxId'),
        cell: ({ row }) => (
          <span dir="ltr">{row.original.taxId ?? '-'}</span>
        ),
      },
      {
        accessorKey: 'mobile',
        header: t('clients.phone'),
        cell: ({ row }) => (
          <span dir="ltr">{row.original.mobile ?? '-'}</span>
        ),
      },
      {
        accessorKey: 'monthlyFee',
        header: t('clients.monthlyFee'),
        cell: ({ row }) =>
          row.original.monthlyFee
            ? formatMoney(row.original.monthlyFee)
            : '-',
      },
      {
        accessorKey: 'status',
        header: t('clients.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      // TODO: Add assigned staff column once staff module is built
      // { accessorKey: 'assignedStaffName', header: t('clients.assignedStaff') },
    ],
    [t]
  );

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('clients.title')}>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('clients.addNew')}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="space-y-4 mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('clients.searchPlaceholder')}
          className="max-w-md"
        />

        <div className="flex flex-wrap items-center gap-4">
          <ClientTypePicker value={typeFilter} onChange={setTypeFilter} />

          <div className="flex gap-2">
            {(['all', 'active', 'archived'] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all'
                  ? t('clients.all')
                  : status === 'active'
                    ? t('clients.active')
                    : t('clients.archived')}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {filteredClients.length === 0 && !search && typeFilter === 'all' && statusFilter === 'active' ? (
        <EmptyState
          icon={Users}
          title={t('clients.noClients')}
          description={t('clients.noClientsDesc')}
        />
      ) : isMobile ? (
        <div className="space-y-3">
          {filteredClients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredClients}
          onRowClick={(client) => navigate(`/clients/${client.id}`)}
          emptyMessage={t('common.noResults')}
        />
      )}

      {/* Create form dialog */}
      <ClientForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
```

**Rationale:**
- Client-side filtering via `useMemo` (user decision #4).
- `useIsMobile` uses `matchMedia` with proper `useEffect` + cleanup for responsive detection (Tailwind `md:` breakpoint = 768px). Lazy initializer avoids layout flash; listener cleanup prevents memory leaks. This avoids rendering both layouts and hiding with CSS.
- DataTable handles sorting and pagination internally.
- `dir="ltr"` on caseNum, taxId, and mobile columns.
- Search filters on name, caseNum, and taxId (as specified in requirements).
- Empty state shows `EmptyState` with `Users` icon when there are no clients at all; `common.noResults` when filters yield no results.
- The "Add Client" button opens the `ClientForm` dialog.

---

### 4e. `src/components/clients/ClientHeader.tsx`

**Action:** Create

```tsx
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation

import { useLanguage } from '@/contexts/LanguageContext';
import { CLIENT_TYPES } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import type { Client } from '@/types';

interface ClientHeaderProps {
  client: Client;
}

export function ClientHeader({ client }: ClientHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col sm:flex-row items-start gap-4 mb-6">
      {/* Avatar */}
      <div className="flex-shrink-0 h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl">
        {client.name.charAt(0)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + case number */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
          <span className="text-sm text-muted-foreground" dir="ltr">
            {client.caseNum}
          </span>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge variant="secondary">
            {t(CLIENT_TYPES[client.clientType])}
          </Badge>
          <StatusBadge status={client.status} />
        </div>

        {/* Details row */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
          {client.monthlyFee ? (
            <span>
              {formatMoney(client.monthlyFee)} {t('clients.perMonth')}
            </span>
          ) : null}

          {client.taxId && (
            <span dir="ltr">{client.taxId}</span>
          )}

          {client.mobile && (
            <span dir="ltr">{client.mobile}</span>
          )}

          {client.email && (
            <span dir="ltr">{client.email}</span>
          )}
        </div>

        {/* TODO: Display assigned staff name once staff module is built.
            Currently only assignedStaffId (UUID) is available.
            Add: .select('*, staff!assigned_staff_id(name)') to the service query. */}

        {/* Tags */}
        {client.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {client.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Rationale:** Displays all client information in a header layout. `dir="ltr"` on caseNum, taxId, mobile, email. Uses `Badge` and `StatusBadge` from shared components. Responsive with `flex-col sm:flex-row`.

---

### 4f. `src/components/clients/ClientTabs.tsx`

**Action:** Create

```tsx
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation with placeholder tabs

import { useLanguage } from '@/contexts/LanguageContext';
import { EmptyState } from '@/components/shared/EmptyState';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileText, BarChart3, CheckSquare, Activity } from 'lucide-react';

export function ClientTabs() {
  const { t } = useLanguage();

  return (
    <Tabs defaultValue="documents" className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="documents">{t('clients.tabs.documents')}</TabsTrigger>
        <TabsTrigger value="filings">{t('clients.tabs.filings')}</TabsTrigger>
        <TabsTrigger value="tasks">{t('clients.tabs.tasks')}</TabsTrigger>
        <TabsTrigger value="activity">{t('clients.tabs.activity')}</TabsTrigger>
      </TabsList>

      <TabsContent value="documents">
        <EmptyState
          icon={FileText}
          title={t('clients.tabs.documents')}
          description={t('clients.tabs.documentsPlaceholder')}
        />
      </TabsContent>

      <TabsContent value="filings">
        <EmptyState
          icon={BarChart3}
          title={t('clients.tabs.filings')}
          description={t('clients.tabs.filingsPlaceholder')}
        />
      </TabsContent>

      <TabsContent value="tasks">
        <EmptyState
          icon={CheckSquare}
          title={t('clients.tabs.tasks')}
          description={t('clients.tabs.tasksPlaceholder')}
        />
      </TabsContent>

      <TabsContent value="activity">
        <EmptyState
          icon={Activity}
          title={t('clients.tabs.activity')}
          description={t('clients.tabs.activityPlaceholder')}
        />
      </TabsContent>
    </Tabs>
  );
}
```

**Rationale:** Uses the existing shadcn/ui `Tabs` component with Radix UI. Each tab shows an `EmptyState` placeholder (user decision #5). Tab state is managed by Radix internally (`defaultValue`). Icons are chosen to match the tab content semantically. Later phases will replace the `TabsContent` children with real components.

---

### 4g. `src/components/clients/ClientDetailView.tsx`

**Action:** Create

```tsx
// CREATED: 2026-03-18
// UPDATED: 2026-03-18 IST (Jerusalem)
//          - Initial implementation

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient, useArchiveClient, useRestoreClient, useDeleteClient } from '@/hooks/useClients';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { ClientHeader } from './ClientHeader';
import { ClientTabs } from './ClientTabs';
import { ClientForm } from './ClientForm';
import { ArrowRight, ArrowLeft, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react';

export function ClientDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const { data: client, isLoading, error } = useClient(id);

  const archiveClient = useArchiveClient();
  const restoreClient = useRestoreClient();
  const deleteClient = useDeleteClient();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  if (error || !client) {
    return (
      <div className="p-6">
        <p className="text-destructive">{t('errors.notFound')}</p>
      </div>
    );
  }

  const isArchived = client.status === 'archived';
  // Direction-aware back icon: RTL → ArrowRight, LTR → ArrowLeft
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;

  return (
    <div className="p-6 animate-fade-in">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate('/clients')}
      >
        <BackIcon className="h-4 w-4 me-2" />
        {t('clients.backToList')}
      </Button>

      {/* Header */}
      <ClientHeader client={client} />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 me-2" />
          {t('common.edit')}
        </Button>

        {isArchived ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => restoreClient.mutate(client.id)}
            disabled={restoreClient.isPending}
          >
            <ArchiveRestore className="h-4 w-4 me-2" />
            {t('clients.restoreClient')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveDialogOpen(true)}
          >
            <Archive className="h-4 w-4 me-2" />
            {t('clients.archiveClient')}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-4 w-4 me-2" />
          {t('clients.deleteClient')}
        </Button>
      </div>

      {/* Tabs */}
      <ClientTabs />

      {/* Edit form dialog */}
      <ClientForm open={editOpen} onOpenChange={setEditOpen} client={client} />

      {/* Archive confirmation */}
      <ConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        title={t('clients.archiveClient')}
        description={t('clients.confirmArchive')}
        onConfirm={() => archiveClient.mutate(client.id)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('clients.deleteClient')}
        description={t('clients.confirmDelete')}
        variant="destructive"
        onConfirm={() => {
          deleteClient.mutate(client.id, {
            onSuccess: () => navigate('/clients'),
          });
        }}
      />
    </div>
  );
}
```

**Rationale:**
- Uses `useParams` to get client ID from the URL.
- Uses direction-aware back icon (`ArrowRight` in RTL, `ArrowLeft` in LTR) via `useLanguage().direction`.
- Archive/Restore are conditional based on current status.
- Delete navigates back to list on success.
- Edit opens the same `ClientForm` in edit mode (passing the `client` prop).
- `ConfirmDialog` for archive and delete actions as specified.

---

## 5. Route Changes

### `src/App.tsx`

**Action:** Modify

**What changes:**
1. Add import for `ClientsView` and `ClientDetailView`
2. Replace the clients placeholder route with two real routes

**Exact diff:**

```diff
 import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
+import { ClientsView } from '@/components/clients/ClientsView';
+import { ClientDetailView } from '@/components/clients/ClientDetailView';

 ...

-              <Route path="clients" element={<SectionPlaceholder section="clients" />} />
+              <Route path="clients" element={<ClientsView />} />
+              <Route path="clients/:id" element={<ClientDetailView />} />
```

**Rationale:** Both routes remain nested inside `<ProtectedRoute><AppShell /></ProtectedRoute>`, so they inherit the sidebar layout and auth protection. The `:id` route must come after the list route.

---

## 6. i18n Key Additions

### New keys to add to all 3 language files

Only the keys below are new. Existing keys (listed in requirements as "Already existing") must NOT be duplicated.

#### `src/i18n/he.ts` — Add these entries:

```typescript
// Clients — new keys
'clients.caseNum': 'מספר תיק',
'clients.phone': 'טלפון',
'clients.email': 'דוא"ל',
'clients.address': 'כתובת',
'clients.city': 'עיר',
'clients.tags': 'תגיות',
'clients.monthlyFee': 'שכר טרחה חודשי',
'clients.billingDay': 'יום חיוב',
'clients.notes': 'הערות',
'clients.status': 'סטטוס',
'clients.assignedStaff': 'עובד אחראי',
'clients.highLevelType': 'סוג (ראשי)',
'clients.registrationType': 'סוג רישום',
'clients.all': 'הכל',
'clients.filterByType': 'סינון לפי סוג',
'clients.filterByStatus': 'סינון לפי סטטוס',
'clients.active': 'פעיל',
'clients.archived': 'ארכיון',
'clients.editClient': 'עריכת לקוח',
'clients.deleteClient': 'מחיקת לקוח',
'clients.archiveClient': 'העברה לארכיון',
'clients.restoreClient': 'שחזור לקוח',
'clients.confirmDelete': 'האם אתה בטוח שברצונך למחוק לקוח זה?',
'clients.confirmArchive': 'האם אתה בטוח שברצונך להעביר לקוח זה לארכיון?',
'clients.createSuccess': 'הלקוח נוצר בהצלחה',
'clients.updateSuccess': 'הלקוח עודכן בהצלחה',
'clients.deleteSuccess': 'הלקוח נמחק בהצלחה',
'clients.archiveSuccess': 'הלקוח הועבר לארכיון',
'clients.restoreSuccess': 'הלקוח שוחזר בהצלחה',
'clients.searchPlaceholder': 'חיפוש לפי שם, מספר תיק או מספר עוסק...',
'clients.backToList': 'חזרה לרשימת לקוחות',
'clients.noClients': 'אין לקוחות עדיין',
'clients.noClientsDesc': 'הוסף לקוח חדש כדי להתחיל',
'clients.tabs.documents': 'מסמכים',
'clients.tabs.filings': 'הגשות',
'clients.tabs.tasks': 'משימות',
'clients.tabs.activity': 'יומן פעילות',
'clients.tabs.documentsPlaceholder': 'מודול המסמכים יהיה זמין בעדכון הבא',
'clients.tabs.filingsPlaceholder': 'מודול ההגשות יהיה זמין בעדכון הבא',
'clients.tabs.tasksPlaceholder': 'מודול המשימות יהיה זמין בעדכון הבא',
'clients.tabs.activityPlaceholder': 'יומן הפעילות יהיה זמין בעדכון הבא',
'clients.tagsHint': 'הפרד תגיות בפסיקים',
'clients.perMonth': 'לחודש',
```

#### `src/i18n/ar.ts` — Add these entries:

```typescript
// Clients — new keys
'clients.caseNum': 'رقم الملف',
'clients.phone': 'هاتف',
'clients.email': 'بريد إلكتروني',
'clients.address': 'عنوان',
'clients.city': 'مدينة',
'clients.tags': 'علامات',
'clients.monthlyFee': 'أتعاب شهرية',
'clients.billingDay': 'يوم الفوترة',
'clients.notes': 'ملاحظات',
'clients.status': 'الحالة',
'clients.assignedStaff': 'الموظف المسؤول',
'clients.highLevelType': 'النوع (رئيسي)',
'clients.registrationType': 'نوع التسجيل',
'clients.all': 'الكل',
'clients.filterByType': 'تصفية حسب النوع',
'clients.filterByStatus': 'تصفية حسب الحالة',
'clients.active': 'نشط',
'clients.archived': 'أرشيف',
'clients.editClient': 'تعديل عميل',
'clients.deleteClient': 'حذف عميل',
'clients.archiveClient': 'نقل للأرشيف',
'clients.restoreClient': 'استعادة عميل',
'clients.confirmDelete': 'هل أنت متأكد من حذف هذا العميل؟',
'clients.confirmArchive': 'هل أنت متأكد من نقل هذا العميل للأرشيف؟',
'clients.createSuccess': 'تم إنشاء العميل بنجاح',
'clients.updateSuccess': 'تم تحديث العميل بنجاح',
'clients.deleteSuccess': 'تم حذف العميل بنجاح',
'clients.archiveSuccess': 'تم نقل العميل للأرشيف',
'clients.restoreSuccess': 'تم استعادة العميل بنجاح',
'clients.searchPlaceholder': 'البحث بالاسم، رقم الملف أو الرقم الضريبي...',
'clients.backToList': 'العودة لقائمة العملاء',
'clients.noClients': 'لا يوجد عملاء بعد',
'clients.noClientsDesc': 'أضف عميل جديد للبدء',
'clients.tabs.documents': 'مستندات',
'clients.tabs.filings': 'التقارير',
'clients.tabs.tasks': 'المهام',
'clients.tabs.activity': 'سجل النشاط',
'clients.tabs.documentsPlaceholder': 'وحدة المستندات ستكون متاحة في التحديث القادم',
'clients.tabs.filingsPlaceholder': 'وحدة التقارير ستكون متاحة في التحديث القادم',
'clients.tabs.tasksPlaceholder': 'وحدة المهام ستكون متاحة في التحديث القادم',
'clients.tabs.activityPlaceholder': 'سجل النشاط سيكون متاح في التحديث القادم',
'clients.tagsHint': 'افصل العلامات بفواصل',
'clients.perMonth': 'شهريًا',
```

#### `src/i18n/en.ts` — Add these entries:

```typescript
// Clients — new keys
'clients.caseNum': 'Case Number',
'clients.phone': 'Phone',
'clients.email': 'Email',
'clients.address': 'Address',
'clients.city': 'City',
'clients.tags': 'Tags',
'clients.monthlyFee': 'Monthly Fee',
'clients.billingDay': 'Billing Day',
'clients.notes': 'Notes',
'clients.status': 'Status',
'clients.assignedStaff': 'Assigned Staff',
'clients.highLevelType': 'Type (Main)',
'clients.registrationType': 'Registration Type',
'clients.all': 'All',
'clients.filterByType': 'Filter by Type',
'clients.filterByStatus': 'Filter by Status',
'clients.active': 'Active',
'clients.archived': 'Archived',
'clients.editClient': 'Edit Client',
'clients.deleteClient': 'Delete Client',
'clients.archiveClient': 'Archive Client',
'clients.restoreClient': 'Restore Client',
'clients.confirmDelete': 'Are you sure you want to delete this client?',
'clients.confirmArchive': 'Are you sure you want to archive this client?',
'clients.createSuccess': 'Client created successfully',
'clients.updateSuccess': 'Client updated successfully',
'clients.deleteSuccess': 'Client deleted successfully',
'clients.archiveSuccess': 'Client archived successfully',
'clients.restoreSuccess': 'Client restored successfully',
'clients.searchPlaceholder': 'Search by name, case number or tax ID...',
'clients.backToList': 'Back to Clients',
'clients.noClients': 'No clients yet',
'clients.noClientsDesc': 'Add a new client to get started',
'clients.tabs.documents': 'Documents',
'clients.tabs.filings': 'Filings',
'clients.tabs.tasks': 'Tasks',
'clients.tabs.activity': 'Activity',
'clients.tabs.documentsPlaceholder': 'Documents module will be available in a future update',
'clients.tabs.filingsPlaceholder': 'Filings module will be available in a future update',
'clients.tabs.tasksPlaceholder': 'Tasks module will be available in a future update',
'clients.tabs.activityPlaceholder': 'Activity log will be available in a future update',
'clients.tagsHint': 'Separate tags with commas',
'clients.perMonth': 'per month',
```

---

## Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| No `firmId` in auth store (loading) | `useClients` is disabled via `enabled: !!firmId`; UI shows `LoadingSpinner` |
| Client not found (detail view) | `clientService.getById` throws; `useClient` enters error state; UI shows `errors.notFound` message |
| Concurrent case number generation | `pg_advisory_xact_lock` in `generate_case_num` serializes inserts per firm per year, including when no rows exist yet |
| Empty name on create | Client-side validation rejects; `name NOT NULL` constraint catches server-side |
| Invalid tax ID format | Client-side validation via `validateTaxId`/`validateCompanyId` before submit |
| Cross-firm data access | RLS policies enforce `firm_id IN (SELECT user_firm_ids())` on all operations |
| Soft-deleted clients in list | `list()` filters `deleted_at IS NULL`; soft-deleted clients are invisible |
| Creating client with existing case number | DB `UNIQUE (firm_id, case_num)` constraint prevents duplicates; the trigger generates unique numbers |
| Very long tag list | Tags are stored as `TEXT[]` in Postgres; no practical limit; UI wraps via `flex-wrap` |
| Monthly fee as decimal shekels | Converted to integer agorot via `shekelToAgorot` before save; displayed via `formatMoney` |

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Fetching all clients for large firms | For firms with < 1,000 clients (typical for Israeli accounting/law firms), a single fetch is fast. The `idx_clients_firm_id` index ensures the query is efficient. If a firm exceeds this scale, server-side pagination can be added later without changing the UI architecture (the hook/service layer abstracts this). |
| Re-rendering filtered list on every keystroke | `SearchInput` debounces at 300ms; `useMemo` prevents recalculation unless inputs change. |
| Advisory lock in case number generation | The `pg_advisory_xact_lock` is scoped to `hashtext(firm_id + year)`, so it only serializes concurrent inserts for the same firm in the same year. For typical insert volumes (a few per minute), contention is negligible. The lock is released automatically at transaction end. |
| React Query staleTime | Set to 5 minutes globally. Client list queries will not refetch on every navigation back to the list. |

---

## Self-Critique

1. **`useIsMobile` hook in ClientsView** — This is defined inline rather than extracted to a shared hook. Since it is only used in one component, extracting it would be premature abstraction. If other components need the same detection later, it should be moved to `src/hooks/`.

2. **No assigned staff name display in the table/card** — The requirements mention showing assigned staff, but the service only fetches the `assigned_staff_id` (a UUID). To display the staff member's name, we would need a join or a separate query. For now, the table omits the assigned staff column and includes a TODO comment. The detail header also has a TODO comment. **Recommendation:** Add a join in the service layer's `list()` method (`.select('*, staff!assigned_staff_id(name)')`) once the staff table is populated in a later phase.

3. **Textarea not using a shadcn/ui Textarea component** — The project does not have a `Textarea` component in `src/components/ui/`. Rather than creating one for a single usage, the form uses a raw `<textarea>` with Tailwind classes. This is pragmatic but slightly inconsistent. If more textareas appear in future phases, extract to a shared component.

4. **No form dirty-check or unsaved changes warning** — If a user fills out the form and closes the dialog, changes are lost silently. This is acceptable for a V1 and matches the existing pattern in `Onboard.tsx`.

### Resolved from review
- ~~`CreateClientInput` includes `caseNum` and `status`~~ — Fixed: type updated to omit both; service layer sets them.
- ~~`useIsMobile` uses `useState` initializer for side effects~~ — Fixed: now uses proper `useEffect` with cleanup.
- ~~`FOR UPDATE` lock ineffective on empty set~~ — Fixed: added `pg_advisory_xact_lock` for first-client-of-year scenario.
- ~~No GRANTs in migration~~ — Fixed: explicit GRANTs to `authenticated` role added.
- ~~`assigned_staff_id REFERENCES staff(id)` but staff table doesn't exist~~ — Fixed: plain UUID with TODO comment.
- ~~BackIcon not direction-aware~~ — Fixed: uses `direction === 'rtl' ? ArrowRight : ArrowLeft`.
- ~~Default status filter shows all clients~~ — Fixed: defaults to `'active'`.

---

## Database Changes Summary

- **New table:** `clients` (17 columns)
- **New function:** `generate_case_num(p_firm_id UUID)` — atomic per-firm case number generation
- **New function:** `clients_auto_case_num()` — trigger function for auto-generating case_num
- **New triggers:** `clients_case_num_trigger` (BEFORE INSERT), `clients_updated_at` (BEFORE UPDATE via moddatetime)
- **New constraint:** `clients_firm_case_num_unique` (UNIQUE on firm_id + case_num)
- **New indexes:** 4 indexes for query performance
- **RLS policies:** 4 policies (SELECT, INSERT, UPDATE, DELETE) using `user_firm_ids()`
- **GRANTs:** `SELECT, INSERT, UPDATE, DELETE` on `clients` table + `EXECUTE` on `generate_case_num` to `authenticated` role
