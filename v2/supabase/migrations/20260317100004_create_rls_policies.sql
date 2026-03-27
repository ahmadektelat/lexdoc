-- Migration: create_rls_policies
-- CREATED: 2026-03-17 10:00 IST (Jerusalem)
-- Description: Enable RLS and create policies for firms, user_firms, login_attempts

-- Enable RLS on all tables
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- FIRMS policies
-- No INSERT policy. Firm creation MUST go through register_firm RPC (SECURITY DEFINER).
-- SELECT: members can always read their own firm record, even if expired.
CREATE POLICY "firms_select_own" ON firms
  FOR SELECT TO authenticated
  USING (id IN (SELECT user_firm_ids()));

-- UPDATE: superAdmin/manager can update non-sensitive fields.
-- plan/expiry changes go through update_firm_plan RPC.
CREATE POLICY "firms_update_admin" ON firms
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT firm_id FROM user_firms
      WHERE user_id = auth.uid() AND role IN ('superAdmin', 'manager')
    )
  );

-- No DELETE policy on firms (soft delete only via UPDATE)

-- USER_FIRMS policies
-- No INSERT policy. All inserts go through SECURITY DEFINER RPCs.
CREATE POLICY "user_firms_select_own" ON user_firms
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_firms_update_admin" ON user_firms
  FOR UPDATE TO authenticated
  USING (user_is_firm_admin(firm_id));

CREATE POLICY "user_firms_delete_admin" ON user_firms
  FOR DELETE TO authenticated
  USING (user_is_firm_admin(firm_id));

-- LOGIN_ATTEMPTS policies
-- No direct table access for end users. All access via SECURITY DEFINER RPCs.
CREATE POLICY "login_attempts_service_only" ON login_attempts
  FOR ALL USING (false);

-- ============================================================
-- GRANT statements
-- ============================================================
GRANT SELECT, UPDATE ON firms TO authenticated;
GRANT SELECT, UPDATE, DELETE ON user_firms TO authenticated;

-- RPC function execution grants
GRANT EXECUTE ON FUNCTION user_firm_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION check_login_locked(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_login_locked(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION record_login_attempt(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION record_login_attempt(TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION register_firm(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION firm_subscription_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_is_firm_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_role_in_firm(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_firm_plan(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION add_firm_member(UUID, UUID, TEXT) TO authenticated;
