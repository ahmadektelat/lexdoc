---
name: database
description: >
  Use when creating database tables, writing migrations, adding RLS policies,
  building edge functions, or querying Supabase tables. Use this for any
  database schema changes, Supabase MCP calls, or edge function development.
---

# Database Patterns

> Project-specific skill for Supabase database operations: migrations, RLS, edge functions.

## When to Use

Use when creating tables, writing migrations, adding RLS policies, or building edge functions.

## Supabase Project

- **Project ID**: TBD (will be set when Supabase project is created)
- Use this ID for ALL Supabase MCP calls

## Key Schema Principles

1. `firm_id` on every entity table — multi-tenancy at the row level
2. Soft delete: `deleted_at TIMESTAMPTZ DEFAULT NULL`
3. Audit log is immutable: `DELETE USING (false)`
4. All tables have `created_at` and `updated_at` timestamps
5. Money stored as integer agorot (cents) to avoid floating-point errors

## Migration Template

```sql
-- Migration: descriptive_name
-- Description: What this migration does

CREATE TABLE IF NOT EXISTS public.x (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id),
  -- columns...
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_x_firm
  ON public.x(firm_id);

-- Updated_at trigger
CREATE TRIGGER set_updated_at_x
  BEFORE UPDATE ON public.x
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.x TO authenticated;

-- RLS
ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;
```

## Key Tables

- `firms` — law/accounting firms (tenants)
- `clients` — firm clients (company, self-employed, etc.)
- `contacts` — CRM contact directory
- `interactions` — CRM interaction history
- `tasks` — task management (manual + auto-generated)
- `filings` — tax filing records (maam, mekadmot, nikuyim, nii)
- `filing_settings` — per-client filing schedule config
- `billing_entries` — billable items (monthly fee, hourly, one-time)
- `invoices` — generated invoices
- `hours_log` — staff time tracking
- `staff` — firm employees
- `documents` — document management
- `roles` — RBAC role definitions
- `staff_roles` — staff-to-role assignments
- `audit_log` — immutable audit trail
- `messages` — sent messages log
- `message_templates` — reusable message templates

## Helper Functions

- `user_firm_ids()` — get user's firm IDs
- `has_firm_role(firm_id, role)` — check user role in a firm
- `can_access_client(client_id)` — verify client access via firm membership

## Common Error Codes

- `PGRST116` — PostgREST "not found" (single row expected, none returned)
- `403 Forbidden` — Missing or incorrect RLS policy
- `23505` — Unique constraint violation

## Debugging with Supabase Logs

- Edge function issues: `get_logs` with `service: "edge-function"`
- Auth issues: `get_logs` with `service: "auth"`
- Database issues: `get_logs` with `service: "postgres"`

## Detailed Rules

For full examples and patterns, read:
- `rules/migration-patterns.md` — Table creation, indexes, triggers
- `rules/rls-policies.md` — Standard 4-policy template
- `rules/edge-functions.md` — Deno edge function patterns
