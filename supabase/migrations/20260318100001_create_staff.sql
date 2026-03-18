-- ============================================================
-- 1. STAFF TABLE
-- ============================================================
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('partner', 'attorney', 'junior_attorney', 'accountant', 'consultant', 'secretary', 'manager', 'student')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_staff_firm_id ON staff(firm_id);
CREATE INDEX idx_staff_firm_active ON staff(firm_id, is_active) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select" ON staff FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

CREATE POLICY "staff_insert" ON staff FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE POLICY "staff_update" ON staff FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

CREATE POLICY "staff_delete" ON staff FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger: auto-update updated_at (reuses existing helper from 20260317100003)
CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON staff TO authenticated;

-- ============================================================
-- 2. CLIENT_STAFF JUNCTION TABLE
-- ============================================================
CREATE TABLE client_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, staff_id)
);

-- Indexes
CREATE INDEX idx_client_staff_client ON client_staff(client_id);
CREATE INDEX idx_client_staff_staff ON client_staff(staff_id);

-- RLS
ALTER TABLE client_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_staff_select" ON client_staff FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids())));

-- INSERT: dual-chain validation — both client_id AND staff_id must belong to caller's firm
CREATE POLICY "client_staff_insert" ON client_staff FOR INSERT
  WITH CHECK (
    client_id IN (SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))
    AND staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()))
  );

-- UPDATE: dual-chain validation — both client_id AND staff_id must belong to caller's firm
CREATE POLICY "client_staff_update" ON client_staff FOR UPDATE
  USING (
    client_id IN (SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id))
    AND staff_id IN (SELECT id FROM staff WHERE firm_id IN (SELECT user_firm_ids()))
  );

CREATE POLICY "client_staff_delete" ON client_staff FOR DELETE
  USING (client_id IN (SELECT id FROM clients WHERE firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id)));

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON client_staff TO authenticated;

-- ============================================================
-- 3. MIGRATE assigned_staff_id DATA TO JUNCTION TABLE
-- ============================================================
INSERT INTO client_staff (client_id, staff_id, is_primary)
SELECT id, assigned_staff_id, true
FROM clients
WHERE assigned_staff_id IS NOT NULL
  AND deleted_at IS NULL;

-- Drop the legacy column
ALTER TABLE clients DROP COLUMN assigned_staff_id;
