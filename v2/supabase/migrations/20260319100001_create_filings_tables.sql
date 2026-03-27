-- ============================================================
-- Filings Module: filings, filing_settings
-- CREATED: 2026-03-19
-- ============================================================

-- ---------- FILINGS ----------
CREATE TABLE filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('maam', 'mekadmot', 'nikuyim', 'nii')),
  period TEXT NOT NULL,
  due DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'late')),
  filed_date DATE,
  note TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_filings_firm_id ON filings(firm_id);
CREATE INDEX idx_filings_firm_client ON filings(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_filings_firm_client_due ON filings(firm_id, client_id, due) WHERE deleted_at IS NULL;
CREATE INDEX idx_filings_firm_status ON filings(firm_id, status) WHERE deleted_at IS NULL;

-- Unique partial index: prevents duplicate active filings for the same client/type/period
-- Guards against race conditions during concurrent regenerateSchedule calls
CREATE UNIQUE INDEX idx_filings_unique_active
  ON filings(firm_id, client_id, type, period) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE filings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "filings_select" ON filings FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "filings_insert" ON filings FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "filings_update" ON filings FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "filings_delete" ON filings FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER filings_updated_at BEFORE UPDATE ON filings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON filings TO authenticated;

-- ---------- FILING_SETTINGS ----------
CREATE TABLE filing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  vat_freq TEXT NOT NULL DEFAULT 'monthly' CHECK (vat_freq IN ('monthly', 'bimonthly')),
  tax_adv_enabled BOOLEAN NOT NULL DEFAULT false,
  tax_adv_freq TEXT NOT NULL DEFAULT 'monthly' CHECK (tax_adv_freq IN ('monthly', 'bimonthly')),
  tax_deduct_enabled BOOLEAN NOT NULL DEFAULT false,
  tax_deduct_freq TEXT NOT NULL DEFAULT 'monthly' CHECK (tax_deduct_freq IN ('monthly', 'bimonthly')),
  nii_deduct_enabled BOOLEAN NOT NULL DEFAULT false,
  nii_deduct_freq TEXT NOT NULL DEFAULT 'monthly' CHECK (nii_deduct_freq IN ('monthly', 'bimonthly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(firm_id, client_id)
);

-- RLS
ALTER TABLE filing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "filing_settings_select" ON filing_settings FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "filing_settings_insert" ON filing_settings FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "filing_settings_update" ON filing_settings FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "filing_settings_delete" ON filing_settings FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER filing_settings_updated_at BEFORE UPDATE ON filing_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON filing_settings TO authenticated;

-- ---------- FK: tasks.filing_id → filings.id ----------
ALTER TABLE tasks ADD CONSTRAINT tasks_filing_id_fkey
  FOREIGN KEY (filing_id) REFERENCES filings(id);
