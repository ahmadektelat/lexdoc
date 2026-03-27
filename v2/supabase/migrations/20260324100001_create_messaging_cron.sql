-- ============================================================
-- Messaging Module: pg_cron scheduled job (optional)
-- CREATED: 2026-03-24
--
-- This migration is separated from the core tables so that failure
-- (e.g., on Supabase free tier where pg_cron is unavailable) does
-- not prevent table creation. Wrapped in DO/EXCEPTION for safety.
-- ============================================================

-- Unparameterized wrapper for cron: iterates all firms with pending messages.
-- SECURITY DEFINER bypasses RLS since cron runs as postgres, not authenticated.
-- This function is NOT granted to authenticated — only callable by cron.
--
-- SECURITY NOTE: This function uses SECURITY DEFINER to bypass RLS because
-- pg_cron jobs run as the postgres superuser, not as an authenticated user.
-- It is intentionally NOT granted to the authenticated role. The only caller
-- should be the pg_cron scheduler. The firm-scoped process_scheduled_messages()
-- (SECURITY INVOKER, granted to authenticated) is the user-facing version.
CREATE OR REPLACE FUNCTION process_all_scheduled_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_firm_id UUID;
  v_total INTEGER := 0;
  v_count INTEGER;
BEGIN
  FOR v_firm_id IN
    SELECT DISTINCT firm_id FROM scheduled_messages
    WHERE status = 'pending' AND send_date <= CURRENT_DATE
  LOOP
    SELECT process_scheduled_messages(v_firm_id) INTO v_count;
    v_total := v_total + v_count;
  END LOOP;
  RETURN v_total;
END;
$$;

-- NOTE: No GRANT to authenticated — only pg_cron (running as postgres) calls this.

-- Attempt to enable pg_cron and schedule the job.
-- Wrapped in DO/EXCEPTION so this migration succeeds even if pg_cron is unavailable.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.schedule(
    'process-scheduled-messages',
    '0 * * * *',  -- every hour, on the hour
    $$SELECT process_all_scheduled_messages()$$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — skipping cron job setup. Use manual "Run Now" button.';
END;
$$;
