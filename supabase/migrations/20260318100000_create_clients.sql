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

-- Trigger: auto-update updated_at (uses existing update_updated_at() from helper functions migration)
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- GRANTs — Supabase does NOT auto-grant to authenticated when RLS is enabled
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO authenticated;
GRANT EXECUTE ON FUNCTION generate_case_num(UUID) TO authenticated;
