-- ============================================================
-- Messaging Module: message_templates, messages, scheduled_messages
-- CREATED: 2026-03-24
-- ============================================================

-- ========== MESSAGE TEMPLATES ==========
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  topic TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp')),
  color TEXT NOT NULL DEFAULT '#64748b',
  icon TEXT NOT NULL DEFAULT 'mail',
  is_default BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_msg_templates_firm ON message_templates(firm_id) WHERE deleted_at IS NULL;

-- Unique partial index: prevents duplicate default templates per firm+topic.
-- Used by seedDefaultTemplates upsert (ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX idx_msg_templates_default_unique
  ON message_templates(firm_id, topic) WHERE is_default = true AND deleted_at IS NULL;

-- RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_templates_select" ON message_templates FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "msg_templates_insert" ON message_templates FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "msg_templates_update" ON message_templates FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "msg_templates_delete" ON message_templates FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER msg_templates_updated_at BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON message_templates TO authenticated;

-- ========== MESSAGES (log) ==========
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  client_name TEXT NOT NULL,
  template_id UUID REFERENCES message_templates(id),
  topic TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_by TEXT NOT NULL,
  to_email TEXT,
  to_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_firm ON messages(firm_id);
CREATE INDEX idx_messages_firm_client ON messages(firm_id, client_id);
CREATE INDEX idx_messages_firm_sent_at ON messages(firm_id, sent_at DESC);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON messages FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "messages_insert" ON messages FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
-- Messages are immutable — no update or delete
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (false);
CREATE POLICY "messages_delete" ON messages FOR DELETE USING (false);

-- GRANTs (no UPDATE/DELETE)
GRANT SELECT, INSERT ON messages TO authenticated;

-- ========== SCHEDULED MESSAGES ==========
-- NOTE: `resolved_subject` and `resolved_body` store the fully-substituted
-- message text at schedule time. This eliminates variable substitution
-- divergence between the TypeScript client and the SQL cron processor.
-- The cron/Run Now function simply copies these into the messages table.
CREATE TABLE scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  template_id UUID NOT NULL REFERENCES message_templates(id),
  send_date DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp')),
  resolved_subject TEXT NOT NULL,
  resolved_body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  extra_vars JSONB DEFAULT '{}' CHECK (pg_column_size(extra_vars) < 4096),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scheduled_msgs_firm ON scheduled_messages(firm_id);
CREATE INDEX idx_scheduled_msgs_pending ON scheduled_messages(firm_id, status, send_date)
  WHERE status = 'pending';

-- RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scheduled_msgs_select" ON scheduled_messages FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "scheduled_msgs_insert" ON scheduled_messages FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "scheduled_msgs_update" ON scheduled_messages FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "scheduled_msgs_delete" ON scheduled_messages FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER scheduled_msgs_updated_at BEFORE UPDATE ON scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_messages TO authenticated;

-- ========== PROCESS SCHEDULED MESSAGES — FIRM-SCOPED ==========
-- Parameterized by firm_id so authenticated users can only process their own firm.
-- The "Run Now" button calls this via RPC with the user's firmId.
-- Since it takes p_firm_id and runs through the authenticated client,
-- RLS on the messages INSERT policy also validates firm membership.
CREATE OR REPLACE FUNCTION process_scheduled_messages(p_firm_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec RECORD;
  v_client RECORD;
  v_template RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Explicit firm ownership validation
  IF p_firm_id NOT IN (SELECT user_firm_ids()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_rec IN
    SELECT sm.*
    FROM scheduled_messages sm
    WHERE sm.firm_id = p_firm_id
      AND sm.status = 'pending'
      AND sm.send_date <= CURRENT_DATE
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Fetch client (for name, email, mobile)
    SELECT * INTO v_client
    FROM clients
    WHERE id = v_rec.client_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
      UPDATE scheduled_messages SET status = 'failed', updated_at = now()
      WHERE id = v_rec.id;
      CONTINUE;
    END IF;

    -- Check template is not soft-deleted (security fix)
    SELECT * INTO v_template
    FROM message_templates
    WHERE id = v_rec.template_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
      UPDATE scheduled_messages SET status = 'failed', updated_at = now()
      WHERE id = v_rec.id;
      CONTINUE;
    END IF;

    -- Insert message log entry using pre-resolved subject and body
    INSERT INTO messages (
      firm_id, client_id, client_name, template_id,
      topic, channel, subject, body, sent_at,
      status, sent_by, to_email, to_phone
    ) VALUES (
      v_rec.firm_id, v_rec.client_id, v_client.name, v_rec.template_id,
      v_template.topic,
      v_rec.channel, v_rec.resolved_subject, v_rec.resolved_body, now(),
      'sent', v_rec.created_by, v_client.email, v_client.mobile
    );

    -- Mark scheduled message as sent
    UPDATE scheduled_messages SET status = 'sent', updated_at = now()
    WHERE id = v_rec.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION process_scheduled_messages(UUID) TO authenticated;
