-- ============================================================
-- CRM Module: contacts, interactions, tasks
-- CREATED: 2026-03-19
-- ============================================================

-- ---------- CONTACTS ----------
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('client', 'taxAuth', 'nii', 'court', 'other')),
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_contacts_firm_id ON contacts(firm_id);
CREATE INDEX idx_contacts_firm_client ON contacts(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_firm_type ON contacts(firm_id, type) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select" ON contacts FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "contacts_insert" ON contacts FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "contacts_update" ON contacts FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "contacts_delete" ON contacts FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO authenticated;

-- ---------- INTERACTIONS ----------
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  channel TEXT NOT NULL CHECK (channel IN ('call', 'email', 'meeting', 'letter', 'portal')),
  subject TEXT NOT NULL,
  notes TEXT,
  authority_type TEXT CHECK (authority_type IN ('taxAuth', 'vat', 'nii', 'court', 'other')),
  staff_id UUID REFERENCES staff(id),
  outcome TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_interactions_firm_id ON interactions(firm_id);
CREATE INDEX idx_interactions_firm_client ON interactions(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_firm_date ON interactions(firm_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_firm_channel ON interactions(firm_id, channel) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interactions_select" ON interactions FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "interactions_insert" ON interactions FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "interactions_update" ON interactions FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "interactions_delete" ON interactions FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER interactions_updated_at BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON interactions TO authenticated;

-- ---------- TASKS ----------

-- Per-firm seq number generation
-- Intentionally includes deleted tasks to prevent seq reuse
CREATE OR REPLACE FUNCTION generate_task_seq(p_firm_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_seq INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('task_seq_' || p_firm_id::text));

  SELECT COALESCE(MAX(seq), 0) INTO v_max_seq
  FROM tasks
  WHERE firm_id = p_firm_id;

  RETURN v_max_seq + 1;
END;
$$;

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  filing_id UUID,  -- TODO: Add FK REFERENCES filings(id) when filings table is created
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  assigned_to UUID REFERENCES staff(id),
  category TEXT NOT NULL DEFAULT 'client' CHECK (category IN ('client', 'taxAuth', 'nii', 'internal')),
  is_auto BOOLEAN NOT NULL DEFAULT false,
  filing_type TEXT CHECK (filing_type IN ('maam', 'mekadmot', 'nikuyim', 'nii')),
  filing_due DATE,
  period TEXT,
  done_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-generate seq on INSERT
CREATE OR REPLACE FUNCTION tasks_auto_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.seq IS NULL OR NEW.seq = 0 THEN
    NEW.seq := generate_task_seq(NEW.firm_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_seq_trigger
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION tasks_auto_seq();

-- Indexes
CREATE INDEX idx_tasks_firm_id ON tasks(firm_id);
CREATE INDEX idx_tasks_firm_status ON tasks(firm_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_client ON tasks(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_assigned ON tasks(firm_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_firm_due ON tasks(firm_id, due_date) WHERE deleted_at IS NULL AND status = 'open';
CREATE INDEX idx_tasks_firm_filing ON tasks(firm_id, filing_id) WHERE deleted_at IS NULL AND is_auto = true;
CREATE UNIQUE INDEX idx_tasks_firm_seq ON tasks(firm_id, seq);

-- RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Triggers
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;
GRANT EXECUTE ON FUNCTION generate_task_seq(UUID) TO authenticated;
