-- Migration: create_login_attempts_table
-- CREATED: 2026-03-17 10:00 IST (Jerusalem)
-- Description: Create the login_attempts table for server-side lockout tracking

CREATE TABLE login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email_time ON login_attempts (email, attempted_at DESC);
