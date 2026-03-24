-- ============================================================
-- Audit Log Module: immutable activity log
-- CREATED: 2026-03-25
-- ============================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: No updated_at, no deleted_at, no update trigger — immutable by design

-- Indexes
CREATE INDEX idx_audit_log_firm_created ON audit_log(firm_id, created_at DESC);
CREATE INDEX idx_audit_log_firm_entity ON audit_log(firm_id, entity_type, entity_id);
CREATE INDEX idx_audit_log_firm_user ON audit_log(firm_id, user_id);
CREATE INDEX idx_audit_log_firm_action ON audit_log(firm_id, action);

-- RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: firm members can read
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));

-- INSERT: firm members can write (logging), must be own user_id
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT
  WITH CHECK (
    firm_id IN (SELECT user_firm_ids())
    AND user_id = auth.uid()
  );

-- UPDATE: NEVER — immutable
CREATE POLICY "audit_log_update" ON audit_log FOR UPDATE
  USING (false);

-- DELETE: NEVER — immutable
CREATE POLICY "audit_log_delete" ON audit_log FOR DELETE
  USING (false);

-- GRANTs — only SELECT and INSERT, no UPDATE or DELETE at the database level
GRANT SELECT, INSERT ON audit_log TO authenticated;
