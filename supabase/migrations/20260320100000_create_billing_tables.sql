-- ============================================================
-- Billing Module: invoices, billing_entries, hours_log
-- CREATED: 2026-03-21
-- ============================================================

-- ========== INVOICES ==========
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  invoice_num TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  items JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array'),
  subtotal INTEGER NOT NULL,
  vat_amount INTEGER NOT NULL,
  total INTEGER NOT NULL CHECK (total = subtotal + vat_amount),
  sent BOOLEAN NOT NULL DEFAULT false,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: invoice numbers unique per firm
ALTER TABLE invoices ADD CONSTRAINT uq_invoices_firm_num UNIQUE (firm_id, invoice_num);

-- Indexes
CREATE INDEX idx_invoices_firm_id ON invoices(firm_id);
CREATE INDEX idx_invoices_firm_client ON invoices(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_firm_paid ON invoices(firm_id, paid) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "invoices_delete" ON invoices FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO authenticated;

-- ========== BILLING ENTRIES ==========
CREATE TABLE billing_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('charge', 'credit')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  invoice_id UUID REFERENCES invoices(id),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_billing_entries_firm_id ON billing_entries(firm_id);
CREATE INDEX idx_billing_entries_firm_client ON billing_entries(firm_id, client_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE billing_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_entries_select" ON billing_entries FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "billing_entries_insert" ON billing_entries FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "billing_entries_update" ON billing_entries FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "billing_entries_delete" ON billing_entries FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER billing_entries_updated_at BEFORE UPDATE ON billing_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_entries TO authenticated;

-- ========== HOURS LOG ==========
CREATE TABLE hours_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  hours NUMERIC(5,2) NOT NULL CHECK (hours > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No updated_at — hours entries are immutable (only soft-deletable).
-- UPDATE policy exists solely for soft-delete (setting deleted_at). Do NOT update other columns.

-- Indexes
CREATE INDEX idx_hours_log_firm_id ON hours_log(firm_id);
CREATE INDEX idx_hours_log_firm_client ON hours_log(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hours_log_firm_client_date ON hours_log(firm_id, client_id, date) WHERE deleted_at IS NULL;
CREATE INDEX idx_hours_log_firm_staff ON hours_log(firm_id, staff_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE hours_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hours_log_select" ON hours_log FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "hours_log_insert" ON hours_log FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "hours_log_update" ON hours_log FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "hours_log_delete" ON hours_log FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON hours_log TO authenticated;

-- ========== INVOICE NUMBER GENERATOR ==========
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

GRANT EXECUTE ON FUNCTION generate_invoice_num(UUID) TO authenticated;
