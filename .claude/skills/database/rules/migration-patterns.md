# Migration Patterns

## Table Creation

```sql
CREATE TABLE IF NOT EXISTS public.x (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id),

  -- Data columns
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Soft delete
  deleted_at TIMESTAMPTZ DEFAULT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Indexes

```sql
-- Foreign key index (required on every table with firm_id)
CREATE INDEX IF NOT EXISTS idx_x_firm
  ON public.x(firm_id);

-- Foreign key index for related entities
CREATE INDEX IF NOT EXISTS idx_x_client
  ON public.x(client_id);

-- Unique constraint
ALTER TABLE public.x
  ADD CONSTRAINT uq_x_firm_tax_id
  UNIQUE (firm_id, tax_id);

-- Composite index for pagination
CREATE INDEX IF NOT EXISTS idx_x_created_id
  ON public.x(created_at DESC, id DESC);
```

## Updated_at Trigger

Use `moddatetime` extension (must be enabled):
```sql
CREATE TRIGGER set_updated_at_x
  BEFORE UPDATE ON public.x
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

## Grants

Always grant to `authenticated` role:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.x TO authenticated;
```

## Money Columns

Store all monetary values as integer agorot (Israeli cents):
```sql
amount INTEGER NOT NULL DEFAULT 0,        -- in agorot
vat_amount INTEGER NOT NULL DEFAULT 0,    -- in agorot
total INTEGER NOT NULL DEFAULT 0,         -- in agorot
```

## Audit Log Table (Special)

The audit log table has NO `deleted_at` and NO delete policy:
```sql
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at, NO deleted_at — immutable
);

-- DELETE is forbidden
CREATE POLICY "audit_log_no_delete"
  ON public.audit_log FOR DELETE
  TO authenticated
  USING (false);
```

## Junction Tables

```sql
CREATE TABLE IF NOT EXISTS public.staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_roles_staff
  ON public.staff_roles(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_roles_role
  ON public.staff_roles(role_id);
```

## Filing Tables

```sql
CREATE TABLE IF NOT EXISTS public.filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  type TEXT NOT NULL CHECK (type IN ('maam', 'mekadmot', 'nikuyim', 'nii')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'late')),
  filed_at TIMESTAMPTZ,
  amount INTEGER,             -- agorot
  notes TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_filings_firm ON public.filings(firm_id);
CREATE INDEX IF NOT EXISTS idx_filings_client ON public.filings(client_id);
CREATE INDEX IF NOT EXISTS idx_filings_due ON public.filings(due_date);
```
