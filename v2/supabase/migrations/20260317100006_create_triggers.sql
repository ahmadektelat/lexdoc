-- Migration: create_triggers
-- CREATED: 2026-03-17 10:00 IST (Jerusalem)
-- Description: Create updated_at triggers and plan protection trigger

-- Apply updated_at auto-update trigger to firms
CREATE TRIGGER firms_updated_at
  BEFORE UPDATE ON firms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Apply updated_at auto-update trigger to user_firms
CREATE TRIGGER user_firms_updated_at
  BEFORE UPDATE ON user_firms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Prevent direct modification of plan/expiry via regular UPDATE statements.
-- Only SECURITY DEFINER RPCs (update_firm_plan) can change these columns.
CREATE OR REPLACE FUNCTION protect_plan_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow SECURITY DEFINER RPCs to modify plan/expiry by checking a session var.
  IF current_setting('app.bypass_plan_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Block changes to plan/plan_label/expiry for regular UPDATE calls
  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.plan_label IS DISTINCT FROM OLD.plan_label
     OR NEW.expiry IS DISTINCT FROM OLD.expiry THEN
    RAISE EXCEPTION 'plan, plan_label, and expiry cannot be modified directly. Use update_firm_plan RPC.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER firms_protect_plan
  BEFORE UPDATE ON firms
  FOR EACH ROW
  EXECUTE FUNCTION protect_plan_columns();
