# RLS Policy Patterns

## Standard 4-Policy Template

Every table needs these 4 policies:

```sql
-- Enable RLS
ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can read rows from their firms
CREATE POLICY "x_select"
  ON public.x FOR SELECT
  TO authenticated
  USING (firm_id IN (SELECT user_firm_ids()));

-- INSERT: Users can insert rows for their firms
CREATE POLICY "x_insert"
  ON public.x FOR INSERT
  TO authenticated
  WITH CHECK (firm_id IN (SELECT user_firm_ids()));

-- UPDATE: Users can update rows from their firms
CREATE POLICY "x_update"
  ON public.x FOR UPDATE
  TO authenticated
  USING (firm_id IN (SELECT user_firm_ids()))
  WITH CHECK (firm_id IN (SELECT user_firm_ids()));

-- DELETE: Users can delete rows from their firms
CREATE POLICY "x_delete"
  ON public.x FOR DELETE
  TO authenticated
  USING (firm_id IN (SELECT user_firm_ids()));
```

## Helper Functions

### user_firm_ids()

Returns all firm IDs the current user belongs to:
```sql
CREATE OR REPLACE FUNCTION public.user_firm_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT firm_id
  FROM public.staff
  WHERE user_id = auth.uid()
    AND is_active = true
    AND deleted_at IS NULL;
$$;
```

### has_firm_role()

Check if user has a specific role in a firm:
```sql
CREATE OR REPLACE FUNCTION public.has_firm_role(
  p_firm_id UUID,
  required_role TEXT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.staff_roles sr ON sr.staff_id = s.id
    JOIN public.roles r ON r.id = sr.role_id
    WHERE s.user_id = auth.uid()
      AND s.firm_id = p_firm_id
      AND r.name = required_role
      AND s.is_active = true
      AND s.deleted_at IS NULL
  );
$$;
```

### can_access_client()

Verify the current user's firm owns this client:
```sql
CREATE OR REPLACE FUNCTION public.can_access_client(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.firm_id IN (SELECT user_firm_ids())
      AND c.deleted_at IS NULL
  );
$$;
```

## Audit Log Policy (Special — Immutable)

The audit log allows insert and select but NEVER delete or update:
```sql
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (firm_id IN (SELECT user_firm_ids()));

CREATE POLICY "audit_log_insert"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (firm_id IN (SELECT user_firm_ids()));

-- Immutable: no updates allowed
CREATE POLICY "audit_log_no_update"
  ON public.audit_log FOR UPDATE
  TO authenticated
  USING (false);

-- Immutable: no deletes allowed
CREATE POLICY "audit_log_no_delete"
  ON public.audit_log FOR DELETE
  TO authenticated
  USING (false);
```

## RBAC-Aware Policies

For operations restricted to managers/admins:
```sql
CREATE POLICY "x_admin_delete"
  ON public.x FOR DELETE
  TO authenticated
  USING (has_firm_role(firm_id, 'manager') OR has_firm_role(firm_id, 'superAdmin'));
```

## Junction Table Policies

For tables without direct `firm_id`:
```sql
CREATE POLICY "staff_roles_select"
  ON public.staff_roles FOR SELECT
  TO authenticated
  USING (
    staff_id IN (
      SELECT id FROM public.staff
      WHERE firm_id IN (SELECT user_firm_ids())
    )
  );
```

## Checklist After Creating Tables

1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
2. Create all 4 policies (select/insert/update/delete)
3. `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated`
4. For audit_log: use immutable policies (no update, no delete)
5. For junction tables: derive firm_id from parent table
