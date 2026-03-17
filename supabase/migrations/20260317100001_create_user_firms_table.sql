-- Migration: create_user_firms_table
-- CREATED: 2026-03-17 10:00 IST (Jerusalem)
-- Description: Create the user_firms junction table linking auth users to firms

CREATE TABLE user_firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('superAdmin', 'manager', 'staff', 'external')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, firm_id)
);

-- Index for lookups by user_id (used by user_firm_ids() and every RLS policy)
CREATE INDEX idx_user_firms_user_id ON user_firms (user_id);
-- Index for lookups by firm_id (admin operations)
CREATE INDEX idx_user_firms_firm_id ON user_firms (firm_id);
