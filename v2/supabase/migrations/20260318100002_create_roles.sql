-- ============================================================
-- 1. ROLES TABLE
-- ============================================================
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  locked BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '[]',
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_roles_firm_id ON roles(firm_id);
CREATE INDEX idx_roles_firm_active ON roles(firm_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select" ON roles FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

-- Write policies restricted to superAdmin/manager auth tier to prevent privilege escalation
CREATE POLICY "roles_insert" ON roles FOR INSERT
  WITH CHECK (
    firm_id IN (SELECT user_firm_ids())
    AND firm_subscription_active(firm_id)
    AND EXISTS (
      SELECT 1 FROM user_firms
      WHERE user_id = auth.uid() AND firm_id = roles.firm_id
        AND role IN ('superAdmin', 'manager')
    )
  );

CREATE POLICY "roles_update" ON roles FOR UPDATE
  USING (
    firm_id IN (SELECT user_firm_ids())
    AND firm_subscription_active(firm_id)
    AND EXISTS (
      SELECT 1 FROM user_firms
      WHERE user_id = auth.uid() AND firm_id = roles.firm_id
        AND role IN ('superAdmin', 'manager')
    )
  );

CREATE POLICY "roles_delete" ON roles FOR DELETE
  USING (
    firm_id IN (SELECT user_firm_ids())
    AND firm_subscription_active(firm_id)
    AND EXISTS (
      SELECT 1 FROM user_firms
      WHERE user_id = auth.uid() AND firm_id = roles.firm_id
        AND role IN ('superAdmin', 'manager')
    )
  );

-- Trigger: auto-update updated_at (reuses existing helper from 20260317100003)
CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger: prevent modification of locked system roles (defense-in-depth)
CREATE OR REPLACE FUNCTION prevent_locked_role_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked THEN
      RAISE EXCEPTION 'Cannot delete a locked system role';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE
  IF OLD.locked THEN
    RAISE EXCEPTION 'Cannot modify a locked system role';
  END IF;
  IF NEW.locked AND NOT OLD.locked THEN
    RAISE EXCEPTION 'Cannot lock a role after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER roles_prevent_locked_mutation
  BEFORE UPDATE OR DELETE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_role_mutation();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO authenticated;

-- ============================================================
-- 2. STAFF_ROLES JUNCTION TABLE
-- ============================================================
CREATE TABLE staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id)  -- each staff member has exactly one permission role
);

-- Indexes
CREATE INDEX idx_staff_roles_staff ON staff_roles(staff_id);
CREATE INDEX idx_staff_roles_role ON staff_roles(role_id);

-- RLS
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_roles_select" ON staff_roles FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND deleted_at IS NULL));

-- Write policies restricted to superAdmin/manager auth tier to prevent privilege escalation
-- INSERT: dual-chain validation — both staff_id AND role_id must belong to caller's firm, staff must be active
CREATE POLICY "staff_roles_insert" ON staff_roles FOR INSERT
  WITH CHECK (
    staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id) AND deleted_at IS NULL)
    AND role_id IN (SELECT id FROM roles WHERE firm_id IN (SELECT user_firm_ids()) AND deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM user_firms uf
      JOIN staff st ON st.id = staff_roles.staff_id
      WHERE uf.user_id = auth.uid() AND uf.firm_id = st.firm_id
        AND uf.role IN ('superAdmin', 'manager')
    )
  );

-- UPDATE: USING validates old row, WITH CHECK validates new role_id belongs to caller's firm
CREATE POLICY "staff_roles_update" ON staff_roles FOR UPDATE
  USING (
    staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id) AND deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM user_firms uf
      JOIN staff st ON st.id = staff_roles.staff_id
      WHERE uf.user_id = auth.uid() AND uf.firm_id = st.firm_id
        AND uf.role IN ('superAdmin', 'manager')
    )
  )
  WITH CHECK (
    staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND deleted_at IS NULL)
    AND role_id IN (SELECT id FROM roles WHERE firm_id IN (SELECT user_firm_ids()) AND deleted_at IS NULL)
  );

CREATE POLICY "staff_roles_delete" ON staff_roles FOR DELETE
  USING (
    staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id) AND deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM user_firms uf
      JOIN staff st ON st.id = staff_roles.staff_id
      WHERE uf.user_id = auth.uid() AND uf.firm_id = st.firm_id
        AND uf.role IN ('superAdmin', 'manager')
    )
  );

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_roles TO authenticated;

-- ============================================================
-- 3. HELPER FUNCTION: get_user_permissions
-- ============================================================
-- Uses auth.uid() internally — no arbitrary user_id parameter to prevent cross-tenant info disclosure
CREATE OR REPLACE FUNCTION get_user_permissions(p_firm_id UUID)
RETURNS JSONB AS $$
  SELECT COALESCE(
    (SELECT r.permissions
     FROM staff s
     JOIN staff_roles sr ON sr.staff_id = s.id
     JOIN roles r ON r.id = sr.role_id
     WHERE s.user_id = auth.uid()
       AND s.firm_id = p_firm_id
       AND s.deleted_at IS NULL
       AND r.deleted_at IS NULL
     LIMIT 1),
    '[]'::jsonb
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_permissions(UUID) TO authenticated;

-- ============================================================
-- 4. SEED FUNCTION: seed_default_roles
-- ============================================================
CREATE OR REPLACE FUNCTION seed_default_roles(p_firm_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Idempotency guard: skip if roles already exist for this firm
  IF EXISTS (SELECT 1 FROM roles WHERE firm_id = p_firm_id) THEN
    RETURN;
  END IF;

  -- Admin: all permissions
  INSERT INTO roles (firm_id, name, description, color, locked, permissions)
  VALUES (
    p_firm_id, 'admin', 'Full access to all modules', '#ef4444', true,
    '["clients.view","clients.create","clients.edit","clients.delete","filings.view","filings.create","filings.edit","filings.delete","billing.view","billing.create","billing.edit","billing.delete","billing.invoices","staff.view","staff.manage","crm.view","crm.manage","documents.view","documents.upload","documents.delete","reports.view","reports.export","messaging.view","messaging.send","settings.roles","settings.firm","settings.audit","settings.backup"]'::jsonb
  );

  -- Editor: all except delete and settings
  INSERT INTO roles (firm_id, name, description, color, locked, permissions)
  VALUES (
    p_firm_id, 'editor', 'Edit and view all modules', '#3b82f6', true,
    '["clients.view","clients.create","clients.edit","filings.view","filings.create","filings.edit","billing.view","billing.create","billing.edit","billing.invoices","staff.view","staff.manage","crm.view","crm.manage","documents.view","documents.upload","reports.view","reports.export","messaging.view","messaging.send"]'::jsonb
  );

  -- Viewer: view-only
  INSERT INTO roles (firm_id, name, description, color, locked, permissions)
  VALUES (
    p_firm_id, 'viewer', 'View only access', '#64748b', true,
    '["clients.view","filings.view","billing.view","staff.view","crm.view","documents.view","reports.view","messaging.view"]'::jsonb
  );

  -- Manager: clients, staff, crm, reports, documents
  INSERT INTO roles (firm_id, name, description, color, locked, permissions)
  VALUES (
    p_firm_id, 'manager', 'Manage staff and clients', '#10b981', true,
    '["clients.view","clients.create","clients.edit","clients.delete","staff.view","staff.manage","crm.view","crm.manage","reports.view","documents.view","documents.upload"]'::jsonb
  );
END;
$$;

-- Revoke all access — only callable internally by register_firm() (SECURITY DEFINER context)
REVOKE ALL ON FUNCTION seed_default_roles(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION seed_default_roles(UUID) FROM authenticated;

-- ============================================================
-- 5. EXTEND register_firm() TO SEED DEFAULT ROLES
-- ============================================================
CREATE OR REPLACE FUNCTION register_firm(
  p_name TEXT,
  p_type TEXT,
  p_reg_num TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_city TEXT DEFAULT '',
  p_default_fee INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_firm_id UUID;
BEGIN
  INSERT INTO firms (name, type, reg_num, phone, email, city, default_fee, plan, plan_label, expiry)
  VALUES (p_name, p_type, p_reg_num, p_phone, p_email, p_city, p_default_fee, 'trial', 'subscriptionPlans.trial', NOW() + INTERVAL '30 days')
  RETURNING id INTO v_firm_id;

  INSERT INTO user_firms (user_id, firm_id, role)
  VALUES (auth.uid(), v_firm_id, 'superAdmin');

  -- Seed default permission roles for the new firm
  PERFORM seed_default_roles(v_firm_id);

  RETURN v_firm_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. SEED DEFAULT ROLES FOR ALL EXISTING FIRMS
-- ============================================================
DO $$
DECLARE
  v_firm_id UUID;
BEGIN
  FOR v_firm_id IN SELECT id FROM firms WHERE deleted_at IS NULL LOOP
    -- Only seed if the firm doesn't already have roles
    IF NOT EXISTS (SELECT 1 FROM roles WHERE firm_id = v_firm_id) THEN
      PERFORM seed_default_roles(v_firm_id);
    END IF;
  END LOOP;
END;
$$;
