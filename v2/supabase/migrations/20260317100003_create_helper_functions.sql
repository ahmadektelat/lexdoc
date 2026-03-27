-- Migration: create_helper_functions
-- CREATED: 2026-03-17 10:00 IST (Jerusalem)
-- Description: Create helper functions for auth, RLS, and firm management

-- Helper: get firm IDs for the current authenticated user.
-- Uses user_firms (auth junction table), NOT the staff table.
CREATE OR REPLACE FUNCTION user_firm_ids()
RETURNS SETOF UUID AS $$
  SELECT firm_id FROM user_firms WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if a user's login is currently locked (5+ failures in 15 min)
CREATE OR REPLACE FUNCTION check_login_locked(p_email TEXT)
RETURNS BOOLEAN AS $$
  SELECT COUNT(*) >= 5
  FROM login_attempts
  WHERE email = p_email
    AND success = false
    AND attempted_at > NOW() - INTERVAL '15 minutes';
$$ LANGUAGE sql SECURITY DEFINER;

-- Secure login attempt handler: records attempt and returns lockout state.
-- p_success is validated server-side: only authenticated user matching p_email
-- can record success. Anonymous callers can only record failures.
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_email TEXT,
  p_success BOOLEAN
)
RETURNS TABLE(is_locked BOOLEAN, failed_count INTEGER) AS $$
DECLARE
  v_locked BOOLEAN;
  v_count INTEGER;
BEGIN
  -- Security: only allow recording success if caller is authenticated
  -- and their email matches. Prevents attackers from resetting lockout.
  IF p_success AND (auth.uid() IS NULL OR
    (SELECT email FROM auth.users WHERE id = auth.uid()) != p_email) THEN
    RAISE EXCEPTION 'Cannot record success for another user';
  END IF;

  -- Insert the attempt
  INSERT INTO login_attempts (email, success)
  VALUES (p_email, p_success);

  -- Get failed count and derive lockout state in a single query
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM login_attempts
  WHERE email = p_email
    AND success = false
    AND attempted_at > NOW() - INTERVAL '15 minutes';

  v_locked := v_count >= 5;

  RETURN QUERY SELECT v_locked, v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: get role for current user in a specific firm
CREATE OR REPLACE FUNCTION user_role_in_firm(p_firm_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM user_firms
  WHERE user_id = auth.uid() AND firm_id = p_firm_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current user is a superAdmin of a given firm.
-- Used by user_firms UPDATE/DELETE RLS policies to avoid self-referential recursion.
CREATE OR REPLACE FUNCTION user_is_firm_admin(p_firm_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_firms
    WHERE user_id = auth.uid()
      AND firm_id = p_firm_id
      AND role = 'superAdmin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if a firm's subscription is still active (not expired).
-- Used in ENTITY table RLS policies (clients, filings, billing, etc.)
CREATE OR REPLACE FUNCTION firm_subscription_active(p_firm_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM firms
    WHERE id = p_firm_id
      AND expiry > NOW()
      AND deleted_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Atomic registration: creates firm + user_firms row in a single transaction.
-- Trial plan and 30-day expiry are hardcoded server-side.
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

  RETURN v_firm_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update firm subscription plan. Validates superAdmin access.
-- NOTE: No payment validation — placeholder until payment integration.
CREATE OR REPLACE FUNCTION update_firm_plan(
  p_firm_id UUID,
  p_plan TEXT,
  p_plan_label TEXT,
  p_expiry TIMESTAMPTZ
)
RETURNS VOID AS $$
BEGIN
  IF NOT user_is_firm_admin(p_firm_id) THEN
    RAISE EXCEPTION 'Only superAdmin can change subscription plan';
  END IF;

  PERFORM set_config('app.bypass_plan_protection', 'true', true);

  UPDATE firms
  SET plan = p_plan, plan_label = p_plan_label, expiry = p_expiry
  WHERE id = p_firm_id;

  PERFORM set_config('app.bypass_plan_protection', 'false', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a member to a firm. Validates superAdmin access.
CREATE OR REPLACE FUNCTION add_firm_member(
  p_user_id UUID,
  p_firm_id UUID,
  p_role TEXT DEFAULT 'staff'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT user_is_firm_admin(p_firm_id) THEN
    RAISE EXCEPTION 'Only superAdmin can add firm members';
  END IF;

  IF p_role NOT IN ('manager', 'staff', 'external') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  INSERT INTO user_firms (user_id, firm_id, role)
  VALUES (p_user_id, p_firm_id, p_role)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
