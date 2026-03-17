-- Migration: create_firms_table
-- CREATED: 2026-03-17 10:00 IST (Jerusalem)
-- Description: Create the firms table for multi-tenant firm management

CREATE TABLE firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('lawyer', 'cpa', 'combined', 'notary')),
  reg_num TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  city TEXT DEFAULT '',
  logo TEXT,
  plan TEXT NOT NULL DEFAULT 'trial',
  plan_label TEXT NOT NULL DEFAULT 'subscriptionPlans.trial',
  expiry TIMESTAMPTZ NOT NULL,
  default_fee INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for soft-delete filtering
CREATE INDEX idx_firms_deleted_at ON firms (deleted_at) WHERE deleted_at IS NULL;
