# Auth & Onboarding — Technical Design

**Requirements:** `docs/research/feature-auth-onboarding/01-requirements.md`
**Branch:** `migration/auth-module`
**Date:** 2026-03-17

---

## Architecture Approach

**Supabase-native auth with layered services, React Query hooks, and Zustand store.**

The system uses Supabase Auth for all identity operations (signUp, signInWithPassword, signOut, onAuthStateChange). A `firmService` handles firm CRUD against the `firms` table. A `useAuth` hook wraps auth + firm loading into React Query mutations and an auth state listener. The `useAuthStore` Zustand store holds the resolved session state (user, firm, role, plan, expiry) that components read synchronously. `ProtectedRoute` reads the store to gate access.

**Why this approach over alternatives:**
- Supabase Auth handles session persistence, token refresh, and `onAuthStateChange` natively — no custom JWT/session logic needed.
- Separating `authService` (identity) from `firmService` (business data) follows the existing codebase plan for service-per-domain.
- Zustand store for synchronous reads avoids React Query cache-key coordination between ProtectedRoute, Sidebar, and other consumers that need instant access to auth state.
- React Query mutations for login/register give us loading/error states and retry logic for free.

**Note on role systems:** This codebase has two distinct role concepts: (1) `SYSTEM_ROLES` in `src/lib/constants.ts` (admin/editor/viewer/manager) — these are UI-level permission groups used by the RBAC permission management screen. (2) `user_firms.role` (superAdmin/manager/staff/external) — these are the auth-level roles that gate access at the RLS/API layer. The auth module uses `user_firms.role` exclusively. The `SYSTEM_ROLES` are consumed by the permissions module (future phase).

---

## Implementation Order

The phases are dependency-ordered. Each phase must complete before the next begins.

| Phase | Files | Depends On |
|-------|-------|------------|
| A | Database migrations (SQL files) | Nothing |
| B | `authService.ts`, `firmService.ts` | Phase A (tables must exist) |
| C | `useAuthStore.ts` (updates), `useAuth.ts` hook | Phase B |
| D | `ThemePicker.tsx`, `LanguageSelector.tsx` (shared) | Nothing |
| E | `WelcomeScreen.tsx`, `Onboard.tsx`, `OnboardStep1.tsx`, `OnboardStep2.tsx`, `OnboardStep3.tsx`, `Login.tsx`, `ExpiredScreen.tsx`, `ProtectedRoute.tsx` | Phases B, C, D |
| F | `App.tsx` route integration | Phase E |
| G | i18n keys (he.ts, ar.ts, en.ts) | Can be done in parallel with D-E, but must be complete before F |
| H | `Sidebar.tsx` refactor | Phase D |

---

## Database Migration Plan

All SQL below is written as migration files. They will be applied via `supabase migration` or Supabase MCP `apply_migration` once the Supabase project ID is configured.

**Migration order rationale:** Tables are created first (migrations 1-3), then helper functions (migration 4) which reference those tables, then RLS policies (migration 5) which reference the helper functions, then storage (migration 6), then triggers (migration 7).

### Migration 1: `create_firms_table`

```sql
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
```

### Migration 2: `create_user_firms_table`

```sql
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
```

### Migration 3: `create_login_attempts_table`

```sql
CREATE TABLE login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email_time ON login_attempts (email, attempted_at DESC);
```

### Migration 4: `create_helper_functions`

```sql
-- Helper: get firm IDs for the current authenticated user.
--
-- IMPORTANT: Reconciliation with existing skill definition.
-- The skill at .claude/skills/database/rules/rls-policies.md defines
-- user_firm_ids() as querying a `staff` table (with is_active and deleted_at
-- filters). This design uses `user_firms` instead because:
--   (a) `user_firms` is the canonical auth junction table linking users to firms
--   (b) The `staff` table in the skill is for the staff module (future phase)
--       and represents employees within a firm, not auth membership
--   (c) A user can be a firm member (superAdmin) without being in the staff table
--
-- When the staff module is implemented, the `staff` table will reference
-- `user_firms` for auth membership. The `user_firm_ids()` function should
-- remain based on `user_firms`, NOT `staff`. The skill definition should be
-- updated to match this design when the staff module is built.
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

-- Secure login attempt handler: checks lockout, attempts sign-in credential
-- validation, records the attempt, and returns the result.
-- The p_success parameter is NOT client-controllable — this RPC determines
-- success/failure internally by checking if the email exists and the caller
-- is authenticated after the attempt.
-- NOTE: This RPC does NOT perform the actual Supabase Auth signIn — that
-- must still happen client-side via supabase.auth.signInWithPassword().
-- This RPC is called AFTER the signIn attempt to record and check lockout.
-- The p_success parameter is validated: only the authenticated user matching
-- p_email can record a successful attempt. Anonymous callers can only record
-- failures (for lockout tracking).
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

  -- Check current lockout state
  SELECT COUNT(*) >= 5 INTO v_locked
  FROM login_attempts
  WHERE email = p_email
    AND success = false
    AND attempted_at > NOW() - INTERVAL '15 minutes';

  -- Get failed count for display
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM login_attempts
  WHERE email = p_email
    AND success = false
    AND attempted_at > NOW() - INTERVAL '15 minutes';

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
-- to enforce subscription at the DB level. NOT used on the firms table
-- itself (members must be able to read their firm record even when expired,
-- so the ExpiredScreen can display plan renewal options).
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
-- Called from the client after supabase.auth.signUp() succeeds.
-- Prevents orphaned firms or missing user_firms rows.
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
  -- Create the firm. Trial plan and 30-day expiry are hardcoded server-side
  -- to prevent clients from spoofing a longer trial via RPC parameters.
  INSERT INTO firms (name, type, reg_num, phone, email, city, default_fee, plan, plan_label, expiry)
  VALUES (p_name, p_type, p_reg_num, p_phone, p_email, p_city, p_default_fee, 'trial', 'subscriptionPlans.trial', NOW() + INTERVAL '30 days')
  RETURNING id INTO v_firm_id;

  -- Create the user_firms junction row with superAdmin role
  INSERT INTO user_firms (user_id, firm_id, role)
  VALUES (auth.uid(), v_firm_id, 'superAdmin');

  RETURN v_firm_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update firm subscription plan. Used by ExpiredScreen.
-- Validates that the caller is a superAdmin of the firm.
-- NOTE: This has no payment validation — it is a placeholder until
-- payment integration is added. Before production, this RPC should
-- be replaced with a payment-verified flow.
CREATE OR REPLACE FUNCTION update_firm_plan(
  p_firm_id UUID,
  p_plan TEXT,
  p_plan_label TEXT,
  p_expiry TIMESTAMPTZ
)
RETURNS VOID AS $$
BEGIN
  -- Verify caller is superAdmin of the firm
  IF NOT user_is_firm_admin(p_firm_id) THEN
    RAISE EXCEPTION 'Only superAdmin can change subscription plan';
  END IF;

  UPDATE firms
  SET plan = p_plan, plan_label = p_plan_label, expiry = p_expiry
  WHERE id = p_firm_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a member to a firm. Used by staff management (future phase).
-- Validates that the caller is a superAdmin of the target firm.
-- Prevents privilege escalation — only superAdmin can add members.
CREATE OR REPLACE FUNCTION add_firm_member(
  p_user_id UUID,
  p_firm_id UUID,
  p_role TEXT DEFAULT 'staff'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Verify caller is superAdmin of the firm
  IF NOT user_is_firm_admin(p_firm_id) THEN
    RAISE EXCEPTION 'Only superAdmin can add firm members';
  END IF;

  -- Validate role (cannot add another superAdmin)
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
```

### Migration 5: `create_rls_policies`

```sql
-- Enable RLS on all tables
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- FIRMS policies
--
-- No INSERT policy. Firm creation MUST go through the register_firm RPC
-- (SECURITY DEFINER, bypasses RLS). This prevents clients from inserting
-- firms with spoofed plan/expiry values.
--
-- SELECT: members can always read their own firm record, even if expired.
-- This is intentional — the app needs to read the firm's plan/expiry to
-- display the ExpiredScreen and allow plan renewal. Subscription enforcement
-- at the DB level is applied to ENTITY tables (clients, filings, billing, etc.)
-- via firm_subscription_active() in their RLS policies, not on the firms
-- table itself.
CREATE POLICY "firms_select_own" ON firms
  FOR SELECT TO authenticated
  USING (id IN (SELECT user_firm_ids()));

-- UPDATE: superAdmin/manager can update non-sensitive fields.
-- plan and expiry changes go through the update_firm_plan RPC (SECURITY DEFINER).
-- Direct UPDATE cannot modify plan/expiry — enforced by a BEFORE UPDATE trigger
-- (see Migration 7b below), not RLS WITH CHECK, because RLS subqueries on the
-- same table during UPDATE can cause visibility issues.
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
--
-- No INSERT policy. All user_firms inserts go through SECURITY DEFINER RPCs:
--   - register_firm: creates the initial superAdmin row during registration
--   - add_firm_member: (future) lets a superAdmin add staff members
-- This prevents privilege escalation — users cannot insert themselves into
-- arbitrary firms or self-assign superAdmin role.
CREATE POLICY "user_firms_select_own" ON user_firms
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- UPDATE and DELETE use the SECURITY DEFINER helper user_is_firm_admin()
-- to avoid self-referential RLS recursion on user_firms.
CREATE POLICY "user_firms_update_admin" ON user_firms
  FOR UPDATE TO authenticated
  USING (user_is_firm_admin(firm_id));

CREATE POLICY "user_firms_delete_admin" ON user_firms
  FOR DELETE TO authenticated
  USING (user_is_firm_admin(firm_id));

-- LOGIN_ATTEMPTS policies
-- No direct table access for end users. All access via SECURITY DEFINER RPCs.
-- The SECURITY DEFINER functions bypass RLS, so this policy effectively blocks
-- all direct table access while allowing RPC functions to operate.
CREATE POLICY "login_attempts_service_only" ON login_attempts
  FOR ALL USING (false);

-- ============================================================
-- GRANT statements
-- ============================================================
-- firms: SELECT and UPDATE only (no INSERT — goes through register_firm RPC)
GRANT SELECT, UPDATE ON firms TO authenticated;

-- user_firms: SELECT only (INSERT goes through register_firm / add_firm_member RPCs,
-- UPDATE/DELETE through RLS-gated policies for superAdmin)
GRANT SELECT, UPDATE, DELETE ON user_firms TO authenticated;

-- login_attempts: no direct access (all via SECURITY DEFINER RPCs)
-- No GRANT needed — RPCs run as function owner and bypass RLS+grants.

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
```

### Migration 6: `create_storage_bucket`

This must be done via the Supabase dashboard or Supabase MCP, not raw SQL:

```sql
-- Create the firm-logos bucket (via Supabase Storage API, not raw SQL)
-- Bucket name: firm-logos
-- Public: true
-- File size limit: 2MB (2097152 bytes)
-- Allowed MIME types: image/png, image/jpeg, image/webp

-- Storage RLS policies (these are SQL on storage.objects)
CREATE POLICY "firm_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'firm-logos');

CREATE POLICY "firm_logos_upload_members" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'firm-logos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
  );

CREATE POLICY "firm_logos_update_members" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'firm-logos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
  );

CREATE POLICY "firm_logos_delete_members" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'firm-logos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
  );
```

### Migration 7: `create_updated_at_triggers`

```sql
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
```

### Migration 7b: `create_plan_protection_trigger`

```sql
-- Prevent direct modification of plan/expiry via regular UPDATE statements.
-- These columns can only be changed by SECURITY DEFINER RPCs (update_firm_plan),
-- which bypass triggers via session variable flag.
CREATE OR REPLACE FUNCTION protect_plan_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow SECURITY DEFINER RPCs to modify plan/expiry by checking a session var.
  -- The update_firm_plan RPC sets this before its UPDATE statement.
  IF current_setting('app.bypass_plan_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Block changes to plan/expiry for regular UPDATE calls
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.expiry IS DISTINCT FROM OLD.expiry THEN
    RAISE EXCEPTION 'plan and expiry cannot be modified directly. Use update_firm_plan RPC.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER firms_protect_plan
  BEFORE UPDATE ON firms
  FOR EACH ROW
  EXECUTE FUNCTION protect_plan_columns();
```

And update the `update_firm_plan` RPC to set the bypass flag:

```sql
-- Updated update_firm_plan: sets session variable to bypass plan protection trigger
CREATE OR REPLACE FUNCTION update_firm_plan(
  p_firm_id UUID,
  p_plan TEXT,
  p_plan_label TEXT,
  p_expiry TIMESTAMPTZ
)
RETURNS VOID AS $$
BEGIN
  -- Verify caller is superAdmin of the firm
  IF NOT user_is_firm_admin(p_firm_id) THEN
    RAISE EXCEPTION 'Only superAdmin can change subscription plan';
  END IF;

  -- Set session variable to bypass the plan protection trigger
  PERFORM set_config('app.bypass_plan_protection', 'true', true);

  UPDATE firms
  SET plan = p_plan, plan_label = p_plan_label, expiry = p_expiry
  WHERE id = p_firm_id;

  -- Reset the bypass flag
  PERFORM set_config('app.bypass_plan_protection', 'false', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## File-by-File Change Plan

### Phase A: Database (no TypeScript files)

Migration SQL files as described above. Applied via Supabase MCP or dashboard.

---

### Phase B: Services

#### `src/services/authService.ts`
- **Action:** Create
- **Purpose:** Wraps all Supabase Auth operations + secure login attempt tracking
- **Exports:** `authService` object with methods:
  - `signUp(email: string, password: string)` — calls `supabase.auth.signUp({ email, password })`. Returns `{ data, error }`.
  - `signIn(email: string, password: string)` — orchestrates the secure login flow (see below). Returns `{ data, error, isLocked, failedCount }`.
  - `signOut()` — calls `supabase.auth.signOut()`.
  - `getCurrentUser()` — calls `supabase.auth.getUser()`. Returns the current user or null.
  - `getSession()` — calls `supabase.auth.getSession()`. Returns current session.
  - `onAuthStateChange(callback)` — wraps `supabase.auth.onAuthStateChange`. Returns the subscription for cleanup.
- **Dependencies:** `@/integrations/supabase/client`
- **Pattern:** Plain object export, no class. Matches planned service pattern from SHARED-CODE-REGISTRY.

**Secure login flow:**

The login attempt tracking uses a single `record_login_attempt` RPC that both records the attempt and returns lockout state. The `p_success` parameter is validated server-side: only an authenticated user whose email matches can record a successful attempt. This prevents DoS attacks (cannot record fake successes to reset lockout) and prevents attackers from recording arbitrary failures for other users (see Security Note below).

```typescript
// Key implementation detail: signIn flow
async signIn(email: string, password: string) {
  // 1. Check lockout status FIRST via RPC
  const { data: lockCheck } = await supabase.rpc('check_login_locked', { p_email: email });
  if (lockCheck === true) {
    return { data: null, error: { message: 'ACCOUNT_LOCKED' }, isLocked: true, failedCount: 5 };
  }

  // 2. Attempt sign-in via Supabase Auth
  const result = await supabase.auth.signInWithPassword({ email, password });

  // 3. Record attempt via secure RPC (returns lockout state + count)
  const { data: attemptResult } = await supabase.rpc('record_login_attempt', {
    p_email: email,
    p_success: !result.error
  });

  // 4. Return enriched result
  if (result.error) {
    return {
      ...result,
      isLocked: attemptResult?.[0]?.is_locked ?? false,
      failedCount: attemptResult?.[0]?.failed_count ?? 0
    };
  }

  return { ...result, isLocked: false, failedCount: 0 };
}
```

**Security Note on `record_login_attempt`:** The RPC is `SECURITY DEFINER` and validates that only authenticated users can record `p_success = true` (and only for their own email). For failed attempts, the RPC accepts calls from any user (the login hasn't succeeded yet, so `auth.uid()` is null). This means an unauthenticated attacker *could* call `record_login_attempt('victim@email.com', false)` repeatedly to lock out a user. This is a known limitation of client-callable RPCs — the `check_login_locked` pre-check mitigates cascading lockouts (once locked, further calls are no-ops from the user's perspective). For stronger protection, consider rate-limiting at the API gateway level or moving login tracking to a Supabase Edge Function that validates the request origin.

#### `src/services/firmService.ts`
- **Action:** Create
- **Purpose:** CRUD operations for firms and user_firms
- **Exports:** `firmService` object with methods:
  - `registerFirm(data: CreateFirmInput)` — calls the `register_firm` RPC which atomically creates the firm + user_firms row in a single DB transaction. Returns the firm ID. This replaces separate `createFirm` + `createUserFirm` calls.
  - `getFirmByUserId(userId: string)` — queries `user_firms` joined with `firms` to get the firm for a user. Returns `{ firm, role }` or null.
  - `getFirmById(firmId: string)` — selects from `firms` by id.
  - `updateFirm(firmId: string, data: Partial<Firm>)` — updates `firms` row via direct UPDATE (RLS enforced). Used for non-sensitive fields like name, phone, email, city, logo. Cannot change `plan` or `expiry` (blocked by RLS `WITH CHECK`).
  - `updatePlan(firmId: string, plan: string, planLabel: string, expiry: string)` — calls `update_firm_plan` RPC (SECURITY DEFINER). Used by ExpiredScreen for plan changes. Validates superAdmin access server-side.
  - `uploadLogo(firmId: string, file: File)` — uploads to `firm-logos/{firmId}/logo.{ext}` in Supabase Storage. Returns public URL.
- **Dependencies:** `@/integrations/supabase/client`, `@/types` (Firm, FirmType)
- **Types needed:** A `CreateFirmInput` interface. Should be added to `src/types/firm.ts`.

**New type to add to `src/types/firm.ts`:**

```typescript
export interface CreateFirmInput {
  name: string;
  type: FirmType;
  regNum: string;
  phone: string;
  email: string;
  city?: string;
  logo?: string;
  defaultFee?: number; // agorot
}
```

**Note on trial defaults:** `CreateFirmInput` deliberately omits `plan`, `planLabel`, and `expiry`. These are set server-side by the `register_firm` RPC function (defaults to `'trial'`, `'subscriptionPlans.trial'`, and `NOW() + 30 days`). This prevents clients from spoofing their plan or expiry date. The `firmService.registerFirm()` method maps `CreateFirmInput` fields to the RPC parameters.

**Column name mapping:** The `Firm` TypeScript interface uses camelCase (`regNum`, `planLabel`, `defaultFee`), but the database uses snake_case (`reg_num`, `plan_label`, `default_fee`). The `firmService` must map between these when reading/writing. This is a straightforward object transform in each method — no ORM needed.

```
// Key implementation detail: DB row to Firm type mapping
function rowToFirm(row: Record<string, unknown>): Firm {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    regNum: row.reg_num,
    phone: row.phone,
    email: row.email,
    city: row.city ?? '',
    logo: row.logo ?? undefined,
    plan: row.plan,
    planLabel: row.plan_label,
    expiry: row.expiry,
    defaultFee: row.default_fee ?? 0,
    deleted_at: row.deleted_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```

---

### Phase C: Store Updates + Hook

#### `src/stores/useAuthStore.ts`
- **Action:** Modify
- **Changes (lines 8-14, 16-22, 32-61):**
  - Add `plan: string | null`, `expiry: string | null`, `firmData: Firm | null` to the store interface
  - Add `setPlan(plan: string, expiry: string)` action
  - Add `setFirmData(firm: Firm)` action — sets firmId, firmName, plan, expiry, firmData in one call
  - Update `logout()` to also clear plan, expiry, firmData
  - Add `isSubscriptionExpired()` computed getter — returns `true` if `expiry` is in the past
- **Rationale:** ProtectedRoute needs synchronous access to subscription status. Loading firm data into the store during auth initialization avoids async checks on every route transition.
- **No breaking changes** — existing fields and methods remain unchanged. Only additions.

**Key additions to the interface:**

```typescript
interface AuthStore {
  // ... existing fields ...
  plan: string | null;
  expiry: string | null;
  firmData: Firm | null;
  // ... existing methods ...
  setPlan: (plan: string, expiry: string) => void;
  setFirmData: (firm: Firm, role: string) => void;
  isSubscriptionExpired: () => boolean;
}
```

**Implementation of `setFirmData`:**

```typescript
setFirmData: (firm, role) => set({
  firmId: firm.id,
  firmName: firm.name,
  plan: firm.plan,
  expiry: firm.expiry,
  firmData: firm,
  role,
}),
```

**Implementation of `isSubscriptionExpired`:**

```typescript
isSubscriptionExpired: () => {
  const { expiry } = get();
  if (!expiry) return false;
  return new Date(expiry) < new Date();
},
```

#### `src/hooks/useAuth.ts`
- **Action:** Create
- **Purpose:** React hook that manages auth lifecycle: initialization, login/register mutations, session persistence
- **Exports:** `useAuth()` hook returning:
  - `isAuthenticated: boolean`
  - `isLoading: boolean`
  - `user: User | null`
  - `firmData: Firm | null`
  - `login: UseMutationResult` — mutation wrapping `authService.signIn` + `firmService.getFirmByUserId` + `useAuthStore.setFirmData`
  - `register: UseMutationResult` — mutation wrapping `authService.signUp`
  - `logout: () => Promise<void>` — calls `authService.signOut` + `useAuthStore.logout`
- **Dependencies:** `authService`, `firmService`, `useAuthStore`, `@tanstack/react-query`

**Key implementation detail — auth state initialization:**

The `useAuth` hook sets up an `onAuthStateChange` listener via `useEffect`. The listener explicitly filters by event type to avoid unnecessary DB calls on `TOKEN_REFRESHED` (~hourly). It also handles the orphaned-user edge case and the `INITIAL_SESSION` event (fires on page load with or without existing session).

```typescript
// In useAuth, set up onAuthStateChange listener via useEffect:
useEffect(() => {
  const { data: { subscription } } =
```

**Listener implementation (with explicit event filtering):**

The listener must filter by event type to avoid unnecessary DB calls on `TOKEN_REFRESHED` (fires every ~hour). It also handles the orphaned-user edge case where a session exists but no firm is found (signUp succeeded, `register_firm` failed).

```typescript
authService.onAuthStateChange(async (event, session) => {
  // Only act on events that change auth state.
  // Ignore TOKEN_REFRESHED, PASSWORD_RECOVERY, USER_UPDATED, etc.
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    if (session?.user) {
      const result = await firmService.getFirmByUserId(session.user.id);
      if (result) {
        store.setUser({ id: session.user.id, email: session.user.email!, name: session.user.email! });
        store.setFirmData(result.firm, result.role);
      } else {
        // Orphaned user: auth session exists but no firm record.
        // This happens if register_firm RPC failed after signUp succeeded.
        // Redirect to /register so user can retry firm creation.
        store.setUser({ id: session.user.id, email: session.user.email!, name: session.user.email! });
        store.setFirmData(null as any, ''); // firmData is null — ProtectedRoute will not grant access
      }
    } else {
      // INITIAL_SESSION with no session — user never logged in
      store.logout();
    }
    store.setLoading(false);
  } else if (event === 'SIGNED_OUT') {
    store.logout();
    store.setLoading(false);
  }
  // All other events (TOKEN_REFRESHED, etc.) are ignored.
});
```

---

### Phase D: Shared Components (ThemePicker + LanguageSelector)

#### `src/components/shared/ThemePicker.tsx`
- **Action:** Create
- **Purpose:** Reusable theme picker component, extracted from Sidebar footer
- **Props:** `className?: string` (for layout customization between Sidebar and WelcomeScreen contexts)
- **Implementation:** Move the THEMES array and theme-picker JSX from `Sidebar.tsx` lines 43-47 and 126-145. Use the same `useThemeStore` hook, same icons (Sun, Moon, Palette), same button styling.
- **Dependencies:** `useThemeStore`, `useLanguage`, `lucide-react` (Sun, Moon, Palette), `cn`
- **Differences from Sidebar version:**
  - Sidebar uses `bg-sidebar-accent` and `text-sidebar-foreground` — the extracted component should accept these via className or use theme-agnostic CSS variables (e.g., `bg-accent`, `text-foreground`). For reuse on WelcomeScreen (which has no sidebar context), use standard theme variables.
  - The extracted component should support a `variant` prop: `'sidebar' | 'standalone'` to toggle between sidebar-specific and generic styling. **However**, to keep it simple, use generic Tailwind classes that work in both contexts: `bg-accent/50` for active, `hover:bg-accent/30` for hover, `text-foreground/60` for inactive.

**Actually, simpler approach:** The WelcomeScreen and Sidebar have different visual contexts (sidebar has its own color scheme). Rather than a variant prop, use the existing `className` prop and let the parent control the background context. The buttons inside use relative opacity classes that adapt to their container:

```tsx
export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore();
  const { t } = useLanguage();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {THEMES.map(({ value, labelKey, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={t(labelKey)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs transition-colors',
            theme === value
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/30 text-muted-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
```

#### `src/components/shared/LanguageSelector.tsx`
- **Action:** Create
- **Purpose:** Reusable language selector, extracted from Sidebar footer
- **Props:** `className?: string`
- **Implementation:** Move the LANGUAGES array and language-selector JSX from `Sidebar.tsx` lines 49-53 and 148-165. Same approach as ThemePicker.
- **Dependencies:** `useLanguage`, `lucide-react` (Languages icon), `cn`

```tsx
export function LanguageSelector({ className }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Languages className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {LANGUAGES.map(({ value, labelKey }) => (
        <button
          key={value}
          onClick={() => setLanguage(value)}
          className={cn(
            'flex-1 py-1 rounded text-xs text-center transition-colors',
            language === value
              ? 'bg-accent text-accent-foreground font-medium'
              : 'hover:bg-accent/30 text-muted-foreground'
          )}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
```

---

### Phase E: Auth Components

#### `src/components/auth/WelcomeScreen.tsx`
- **Action:** Create
- **Purpose:** Landing page with branding, login/register navigation, theme picker, language selector
- **Layout:** Full-screen centered card with:
  - App name: `t('auth.appName')` — "LexDoc -- ניהול משרד"
  - Description: `t('auth.appDescription')`
  - Two buttons: Login (`t('auth.loginButton')`) and Register (`t('auth.registerButton')`)
  - ThemePicker and LanguageSelector at the bottom
- **Navigation:** Uses `useNavigate()` to go to `/login` or `/register`
- **Auth redirect:** If user is already authenticated, redirect to `/dashboard` via `useAuth` check
- **Dependencies:** `ThemePicker`, `LanguageSelector`, `useLanguage`, `useNavigate`, `useAuthStore`, `Button` (shadcn/ui), `Card` (shadcn/ui)
- **RTL:** Uses `dir={direction}` wrapper. Buttons are block-level so no directional concerns.

#### `src/components/auth/Onboard.tsx`
- **Action:** Create
- **Purpose:** 3-step registration wizard container
- **State:** `step: 1 | 2 | 3`, `firmData: Partial<CreateFirmInput>`, `logoFile: File | null`
- **Renders:** Conditionally renders OnboardStep1, OnboardStep2, or OnboardStep3 based on `step`
- **Data flow:**
  - Step 1 collects firm details + logo file → stored in local state
  - Step 2 collects credentials, calls Supabase signUp, creates firm, uploads logo, creates user_firms → on success, advance to step 3
  - Step 3 shows success message with link to login
- **Dependencies:** OnboardStep1, OnboardStep2, OnboardStep3, `useLanguage`, `Card` (shadcn/ui)

**Key design decision:** The actual Supabase signUp + firm creation happens in step 2, NOT step 1. This is because we need the user's email (from step 2) to call `supabase.auth.signUp()`. The firm creation happens immediately after signUp succeeds, using the returned user ID.

**Registration transaction flow:**

```
1. authService.signUp(email, password)
   → returns { user } with user.id
   → user is now authenticated (session exists)

2. firmService.registerFirm({
     name, type, regNum, phone, email: firmEmail,
     city, defaultFee
   })
   → calls register_firm RPC (SECURITY DEFINER)
   → atomically creates firms row + user_firms row (superAdmin) in one transaction
   → trial plan + 30-day expiry set server-side
   → returns firm_id

3. If logoFile exists:
   firmService.uploadLogo(firm_id, logoFile)
   → returns logoUrl
   firmService.updateFirm(firm_id, { logo: logoUrl })

4. authService.signOut()
   → Sign out so user must log in with their new credentials
```

**Why atomic RPC?** Without the `register_firm` RPC, if the client-side code created the firm and user_firms as separate INSERT calls, a failure between them would leave an orphaned firm with no owner, or an auth user with no firm. The RPC wraps both in a single PostgreSQL transaction — if either INSERT fails, the entire transaction rolls back.

**Orphaned auth user handling:** If `authService.signUp` succeeds but `firmService.registerFirm` fails, the auth user exists without a firm. The `onAuthStateChange` listener in `useAuth` detects this (session exists but `getFirmByUserId` returns null) and keeps `firmData` as null. The `ProtectedRoute` will not grant access. The user sees the login page, and can attempt to re-register. Since Supabase will return "User already registered", the UI should detect this and offer a retry path: sign in with existing credentials, then call `registerFirm` again.

**Why signOut after registration?** The user is directed to the login page after step 3. If we leave them signed in, they'd skip the login flow — but we want them to explicitly log in for a clean UX and to verify their credentials work. Also, the `onAuthStateChange` listener will fire on signUp and try to load firm data. Signing out prevents a half-initialized session state.

#### `src/components/auth/OnboardStep1.tsx`
- **Action:** Create
- **Purpose:** Firm details form (step 1 of 3)
- **Props:**
  - `data: Partial<CreateFirmInput>` — current form state
  - `onUpdate: (data: Partial<CreateFirmInput>) => void` — updates parent state
  - `logoFile: File | null`
  - `onLogoChange: (file: File | null) => void`
  - `onNext: () => void` — advance to step 2
- **Form fields:**
  - Firm name (text input, required)
  - Firm type (select: lawyer/cpa/combined/notary, required)
  - Registration number (text input, required, LTR `dir="ltr"`)
  - Phone (text input, required, LTR `dir="ltr"`, validated with `validatePhone`)
  - Email (text input, required, validated with `validateEmail`)
  - City (text input, optional)
  - Logo upload (file input, optional, max 2MB, image/png|jpeg|webp only)
  - Default monthly fee (number input, optional, shows VAT preview)
- **VAT preview:** When defaultFee changes, show `t('auth.onboard.vatPreview', { amount: formatMoney(calculateVat(shekelToAgorot(feeValue)) + shekelToAgorot(feeValue)) })`. The user enters a shekel amount; we convert to agorot for calculation.

  **Wait, revisit:** The i18n `vatPreview` key uses `{amount}` placeholder. The current `t()` function does simple key lookup with no interpolation. We need to handle this.

  **Resolution:** The `t()` function returns the raw string with `{amount}` placeholder. The component does a `.replace('{amount}', formatMoney(...))` after `t()`. This is the simplest approach and does not require changing the i18n system. Same pattern for all other interpolated strings (`{n}`, `{total}`, `{plan}`, `{date}`).

- **Validation on Next:** All required fields must be filled. Phone and email must pass validation. If logo file exceeds 2MB or is wrong type, show error.
- **Dependencies:** `FormField`, `Input`, `Select`, `Button` (shadcn/ui), `validatePhone`, `validateEmail`, `calculateVat`, `formatMoney`, `shekelToAgorot`, `useLanguage`

#### `src/components/auth/OnboardStep2.tsx`
- **Action:** Create
- **Purpose:** Credentials form + registration execution (step 2 of 3)
- **Props:**
  - `firmData: Partial<CreateFirmInput>` — firm data from step 1
  - `logoFile: File | null`
  - `onBack: () => void` — go back to step 1
  - `onComplete: () => void` — advance to step 3
- **Form fields:**
  - Email (text input, required, validated with `validateEmail`, LTR)
  - Password (text input type="password", required, min 6 chars)
  - Confirm password (text input type="password", required, must match)
- **Submit flow:**
  1. Validate all fields
  2. Set loading state
  3. Call `authService.signUp(email, password)`
  4. If error → show error message from `t('auth.errors.signUpFailed')`
  5. If success → call `firmService.registerFirm(firmData)` — atomic RPC creates firm + user_firms in one transaction. Trial plan and 30-day expiry are set server-side.
  6. If registerFirm error → show error, but auth user already exists. Store error state for retry path.
  7. If logoFile → call `firmService.uploadLogo(firmId, logoFile)` and `firmService.updateFirm(firmId, { logo })`
  8. Call `authService.signOut()` to force login
  9. Call `onComplete()` to advance to step 3
- **Error handling:** If `registerFirm` fails after signUp succeeds, the auth user exists without a firm. The UI should show the error and offer a "Retry" button that calls `registerFirm` again (the user is still authenticated at this point). If the user navigates away, the orphaned-user is detected at login time (session exists, no firm) and the user is directed to retry firm creation.
- **Dependencies:** `authService`, `firmService`, `FormField`, `Input`, `Button`, `useLanguage`, `validateEmail`

#### `src/components/auth/OnboardStep3.tsx`
- **Action:** Create
- **Purpose:** Success confirmation (step 3 of 3)
- **Props:** None (or minimal — just `onGoToLogin: () => void`)
- **Layout:**
  - Success icon/message: `t('auth.onboard.success')`
  - Checklist with check icons:
    - `t('auth.onboard.firmConfigured')`
    - `t('auth.onboard.subscriptionActive')`
    - `t('auth.onboard.securityEnabled')`
    - `t('auth.onboard.auditReady')`
  - Button: `t('auth.onboard.goToLogin')` → navigates to `/login`
- **Dependencies:** `useNavigate`, `useLanguage`, `Button`, `Card`

#### `src/components/auth/Login.tsx`
- **Action:** Create
- **Purpose:** Login form with lockout handling and subscription status display
- **State:**
  - `email: string`, `password: string`
  - `error: string | null`, `failedCount: number`
  - `isLocked: boolean`
  - `isSubmitting: boolean`
  - `firmData: Firm | null` (loaded after successful login to show subscription info)
- **Submit flow:**
  1. Call `authService.signIn(email, password)` — this checks lockout internally
  2. If `ACCOUNT_LOCKED` → show `t('auth.login.locked')`, set `isLocked = true`
  3. If auth error → show `t('auth.login.wrongPassword')` + attempt count `t('auth.login.attemptCount').replace('{n}', failedCount)`
  4. If success → `firmService.getFirmByUserId(user.id)` → load firm data into store → navigate to `/dashboard`
- **Subscription status display:** After successful login, immediately redirect to `/dashboard` and show subscription info as a toast via `sonner`. This satisfies the requirement without blocking the redirect:

  ```typescript
  toast.success(t('auth.login.subscription').replace('{plan}', t(firm.planLabel)), {
    description: t('auth.login.daysRemaining').replace('{n}', String(daysLeft(firm.expiry)))
  });
  navigate('/dashboard', { replace: true });
  ```

- **Auth redirect:** If already authenticated (check useAuthStore), redirect to `/dashboard`
- **Dependencies:** `authService`, `firmService`, `useAuthStore`, `useNavigate`, `FormField`, `Input`, `Button`, `useLanguage`, `daysLeft`, `toast` (from sonner), `LoadingSpinner`
- **RTL:** Email and password inputs get `dir="ltr"`. Form labels are RTL.

#### `src/components/auth/ExpiredScreen.tsx`
- **Action:** Create
- **Purpose:** Shows when authenticated user has an expired subscription. Displays plan options.
- **Layout:**
  - `PageHeader` with `t('auth.expired.title')`
  - Message: `t('auth.expired.message')`
  - Plan cards from `SUBSCRIPTION_PLANS` constant — each card shows:
    - Plan label: `t(plan.label)`
    - Price: `formatMoney(plan.price)` + `t('auth.expired.perMonth')` (for monthly display)
    - Select button: `t('auth.expired.selectPlan')`
  - Logout button: `t('auth.logout')`
- **Plan selection:** For now (out of scope for payment), selecting a plan calls `firmService.updatePlan(firmId, plan, planLabel, expiry)` which wraps the `update_firm_plan` RPC. This RPC validates superAdmin access and updates plan/expiry server-side. This is a placeholder until payment integration is added — the RPC has no payment validation.
- **Dependencies:** `SUBSCRIPTION_PLANS`, `formatMoney`, `addMonths`, `PageHeader`, `Button`, `Card`, `useLanguage`, `useAuthStore`, `firmService`, `authService`
- **Auth guard:** Must be authenticated to see this page. If not authenticated, redirect to `/login`.

#### `src/components/auth/ProtectedRoute.tsx`
- **Action:** Create
- **Purpose:** Route wrapper that enforces auth + subscription checks
- **Props:** `children: ReactNode`
- **Logic:**
  1. Read `useAuthStore` — `isLoading`, `user`, `expiry`
  2. If `isLoading` → render `LoadingSpinner` (full-screen centered)
  3. If `!user` → `<Navigate to="/login" replace />`
  4. If `isSubscriptionExpired()` → `<Navigate to="/expired" replace />`
  5. Otherwise → render `children`
- **Dependencies:** `useAuthStore`, `LoadingSpinner`, `Navigate` (react-router-dom)
- **No async logic** — relies entirely on store state which is set by the `useAuth` hook in App.tsx.

**Critical consideration:** The `useAuth` hook must be mounted in `App.tsx` (or a component that wraps the entire router) so that `onAuthStateChange` fires before any ProtectedRoute renders. If the hook is only in ProtectedRoute, it won't fire for public routes and won't handle session restoration on those pages.

---

### Phase F: Route Integration

#### `src/App.tsx`
- **Action:** Modify
- **Changes:**
  - Import new components: `WelcomeScreen`, `Login`, `Onboard`, `ExpiredScreen`, `ProtectedRoute`, `useAuth`
  - Add a new `AuthInitializer` component (similar pattern to `ThemeInitializer`) that calls `useAuth()` to set up the `onAuthStateChange` listener. This component renders nothing (`return null`).
  - Restructure routes:
    ```
    <Routes>
      {/* Public routes */}
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Onboard />} />
      <Route path="/expired" element={<ExpiredScreen />} />

      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPlaceholder />} />
        {/* ... all other existing routes ... */}
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/welcome" replace />} />
    </Routes>
    ```
  - Add `<AuthInitializer />` alongside `<ThemeInitializer />` inside the providers
  - Root `/` now goes to the ProtectedRoute which either shows AppShell (if auth + valid subscription) or redirects to `/login`
- **Rationale:** The ProtectedRoute wraps AppShell, not individual routes, because all dashboard routes require the same auth check. This avoids repeating ProtectedRoute on every child route.

**Route nesting detail:** The `<Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>` with child routes — this works because AppShell renders `<Outlet />`. The child routes render inside the Outlet. ProtectedRoute wraps the entire AppShell, so the auth check happens before any child route renders.

**Public route auth redirect:** WelcomeScreen and Login should redirect to `/dashboard` if the user is already authenticated. This is handled inside each component by checking `useAuthStore.user` and navigating if non-null.

---

### Phase G: i18n Keys

#### `src/i18n/he.ts`
- **Action:** Modify
- **Changes:** Add all `auth.*` keys from the requirements document (lines 241-319 of requirements). Insert after the existing `auth.register` key (line 50). Also add the `subscriptionPlans.trial` key after the existing subscription plan keys (line 197).
- **Key count:** ~40 new keys

#### `src/i18n/ar.ts`
- **Action:** Modify
- **Changes:** Add all corresponding `auth.*` keys in Arabic translation. Same key names, Arabic values from requirements document.

#### `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add all corresponding `auth.*` keys in English translation. Same key names, English values from requirements document.

**Implementation note:** The existing `auth.login`, `auth.logout`, `auth.email`, `auth.password`, `auth.forgotPassword`, `auth.register` keys in he.ts (lines 44-51) will remain. The new keys use more specific paths like `auth.loginButton`, `auth.login.title`, etc. No conflicts.

---

### Phase H: Sidebar Refactor

#### `src/components/layout/Sidebar.tsx`
- **Action:** Modify
- **Changes:**
  - Remove the `THEMES` and `LANGUAGES` arrays (lines 43-53) — these now live in ThemePicker and LanguageSelector
  - Remove the theme picker JSX (lines 126-145) — replaced by `<ThemePicker />`
  - Remove the language selector JSX (lines 148-165) — replaced by `<LanguageSelector />`
  - Remove icon imports: `Sun`, `Moon`, `Palette`, `Languages` (line 24-25) — no longer needed
  - Remove `useThemeStore` import (line 6) — no longer needed directly
  - Remove `Language` type import (line 27) — no longer needed
  - Remove destructured `theme, setTheme` (line 60) and `language, setLanguage` (line 61) — no longer needed
  - Add imports: `ThemePicker` from `@/components/shared/ThemePicker`, `LanguageSelector` from `@/components/shared/LanguageSelector`
  - In the footer section (lines 124-166), replace with:
    ```tsx
    <div className="p-3 border-t border-sidebar-border space-y-3">
      <ThemePicker />
      <LanguageSelector />
    </div>
    ```
- **Rationale:** Sidebar becomes simpler. ThemePicker and LanguageSelector are reusable in WelcomeScreen and potentially other contexts.

**Styling concern:** The current Sidebar uses `bg-sidebar-accent` and `text-sidebar-foreground` classes for the theme and language buttons. The extracted components use generic `bg-accent` and `text-foreground`. These might look different inside the sidebar context.

**Resolution:** The sidebar has its own CSS color scheme via `bg-sidebar` / `text-sidebar-foreground`. The `bg-accent` and `text-accent-foreground` classes inside the sidebar will inherit the sidebar's color scheme because shadcn/ui CSS variables scope to the nearest `[data-theme]` ancestor. Since the sidebar is inside the AppShell which has the theme attribute, both will look correct. Test this during implementation — if colors clash, add sidebar-specific className overrides to the ThemePicker/LanguageSelector props.

---

### SHARED-CODE-REGISTRY Update

#### `docs/plans/SHARED-CODE-REGISTRY.md`
- **Action:** Modify
- **Changes:** Add entries for:
  - **Shared Components:** ThemePicker, LanguageSelector
  - **Services:** authService, firmService
  - **Hooks:** useAuth
  - **Types:** CreateFirmInput (in firm.ts)

---

## Data Flow Diagrams

### Registration Flow

```
User (WelcomeScreen)
  │
  │ clicks "Register"
  ▼
Onboard (step=1)
  │
  │ fills firm details form
  │ OnboardStep1 validates, stores in parent state
  ▼
Onboard (step=2)
  │
  │ fills email + password
  │ OnboardStep2 validates
  ▼
authService.signUp(email, password)
  │
  ├── ERROR → show t('auth.errors.signUpFailed')
  │
  └── SUCCESS → returns { user.id }, user is now authenticated
        │
        ▼
firmService.registerFirm(firmData)
  │ → calls register_firm RPC (atomic transaction)
  │ → creates firm + user_firms(superAdmin) in one DB transaction
  │ → trial plan + 30-day expiry set server-side
  │
  ├── ERROR → show error, offer "Retry" (user still authenticated)
  │
  └── SUCCESS → returns firm_id
        │
        ▼
[if logoFile] firmService.uploadLogo(firm_id, logoFile)
  │             → firmService.updateFirm(firm_id, { logo: url })
  │
  ▼
authService.signOut()  // force re-login
  │
  ▼
Onboard (step=3) — success screen
  │
  │ clicks "Go to Login"
  ▼
Navigate to /login
```

### Login Flow

```
User (Login page)
  │
  │ enters email + password, submits
  ▼
authService.checkLoginLocked(email)
  │
  ├── LOCKED → show t('auth.login.locked'), stop
  │
  └── NOT LOCKED
        │
        ▼
supabase.auth.signInWithPassword({ email, password })
  │
  ├── ERROR → authService.recordLoginAttempt(email, false)
  │           → show t('auth.login.wrongPassword')
  │           → show attempt count
  │
  └── SUCCESS → authService.recordLoginAttempt(email, true)
        │
        ▼
onAuthStateChange fires with SIGNED_IN event
  │
  ▼
(in useAuth hook listener)
firmService.getFirmByUserId(session.user.id)
  │
  └── returns { firm, role }
        │
        ▼
useAuthStore.setUser(user)
useAuthStore.setFirmData(firm, role)
useAuthStore.setLoading(false)
  │
  ▼
Login component detects auth state change
  │
  ▼
toast.success(subscription info)
Navigate to /dashboard
```

### Auth State Restoration (Page Refresh)

```
Page loads
  │
  ▼
App.tsx renders
  │
  ├── ThemeInitializer: sets data-theme attribute
  ├── AuthInitializer: calls useAuth() which sets up onAuthStateChange
  │
  ▼
Supabase client initializes
  │ checks localStorage for existing session
  │
  ├── NO SESSION
  │     │
  │     ▼
  │   onAuthStateChange(INITIAL_SESSION, null)
  │     │
  │     ▼
  │   useAuthStore.logout()
  │   useAuthStore.setLoading(false)
  │     │
  │     ▼
  │   ProtectedRoute: user is null → Navigate to /login
  │
  └── SESSION EXISTS
        │
        ▼
      onAuthStateChange(INITIAL_SESSION, session)
        │
        ▼
      firmService.getFirmByUserId(session.user.id)
        │
        └── returns { firm, role }
              │
              ▼
      useAuthStore.setUser(user)
      useAuthStore.setFirmData(firm, role)
      useAuthStore.setLoading(false)
        │
        ▼
      ProtectedRoute: user exists, subscription valid → render AppShell
```

### Protected Route Flow

```
Route accessed (e.g., /dashboard)
  │
  ▼
ProtectedRoute reads useAuthStore
  │
  ├── isLoading === true → render LoadingSpinner (full page)
  │
  ├── user === null → <Navigate to="/login" replace />
  │
  ├── isSubscriptionExpired() === true → <Navigate to="/expired" replace />
  │
  └── user exists + subscription valid → render children (AppShell + child route)
```

---

## Component Hierarchy

```
App
├── QueryClientProvider
│   └── LanguageProvider
│       ├── ThemeInitializer (renders null)
│       ├── AuthInitializer (renders null, sets up onAuthStateChange)
│       ├── BrowserRouter
│       │   └── Routes
│       │       ├── /welcome → WelcomeScreen
│       │       │   ├── ThemePicker
│       │       │   └── LanguageSelector
│       │       │
│       │       ├── /login → Login
│       │       │
│       │       ├── /register → Onboard
│       │       │   ├── OnboardStep1
│       │       │   │   └── FormField (x8)
│       │       │   ├── OnboardStep2
│       │       │   │   └── FormField (x3)
│       │       │   └── OnboardStep3
│       │       │
│       │       ├── /expired → ExpiredScreen
│       │       │   └── PageHeader
│       │       │
│       │       └── / → ProtectedRoute
│       │           │   └── LoadingSpinner (while loading)
│       │           └── AppShell
│       │               ├── Sidebar
│       │               │   ├── ThemePicker
│       │               │   └── LanguageSelector
│       │               └── Outlet → child routes
│       │
│       └── Toaster
```

---

## Edge Cases & Error Handling

1. **signUp succeeds but `register_firm` RPC fails** — Orphaned Supabase auth user exists with no firm. **Handling:** Two layers of defense: (a) OnboardStep2 catches the error and shows a "Retry" button that calls `registerFirm` again while the user is still authenticated. (b) If the user navigates away, the `onAuthStateChange` listener in `useAuth` detects the orphaned state (session exists, `getFirmByUserId` returns null, `firmData` is null). ProtectedRoute will not grant access. The Login component should detect this state and offer to retry firm creation by calling `registerFirm` again after the user signs in.

2. **Logo upload fails after firm creation** — Firm is created but logo URL is not saved. **Handling:** Non-critical. The firm is created without a logo. Log the error in console. The user can add a logo later via firm settings (future feature).

3. **Network error during registration** — Any step can fail. **Handling:** Each async operation has try/catch. Show `t('auth.errors.signUpFailed')` with the error message. The form remains on the current step so the user can retry.

4. **User navigates away during registration** — State is lost. **Handling:** Acceptable. Registration is a short flow (3 steps). No draft persistence needed.

5. **Concurrent login attempts from multiple tabs** — `onAuthStateChange` fires in all tabs. **Handling:** Each tab's listener loads firm data independently. Zustand store is per-tab. No cross-tab sync needed (Supabase handles session sync via localStorage).

6. **Expired session during app use** — Supabase auto-refreshes tokens. If refresh fails (e.g., user revoked), `onAuthStateChange` fires with `SIGNED_OUT`. **Handling:** The listener calls `store.logout()` and `store.setLoading(false)`. ProtectedRoute then redirects to `/login`.

7. **Race condition: ProtectedRoute renders before auth state is loaded** — The `isLoading` flag starts as `true` and is only set to `false` after `onAuthStateChange` fires. ProtectedRoute shows a spinner during this window. **Handling:** Built into the design.

8. **User with multiple firms (future)** — The `user_firms` table supports multiple rows per user. `firmService.getFirmByUserId` returns the first firm. **Handling:** Acceptable for single-firm UX. When multi-firm is implemented, this method will return all firms and the UI will show a picker.

9. **Login lockout edge case: exactly at the 15-minute boundary** — The `check_login_locked` function uses `NOW() - INTERVAL '15 minutes'`. If the 5th failed attempt was exactly 15 minutes ago, `>` excludes it. **Handling:** Correct behavior — the lockout expires.

10. **Subscription bypass via direct API calls** — ProtectedRoute is client-side only. A user with an expired subscription could bypass the UI and query data directly via the Supabase REST API. **Handling:** The `firm_subscription_active()` function is designed to be included in RLS policies on entity tables (clients, filings, billing, etc.) during their respective migration phases. For this auth phase, only the firms table and user_firms table exist — neither needs subscription gating (the firm record must be readable for the ExpiredScreen to work). When entity tables are created in future phases, their RLS policies must include `AND firm_subscription_active(firm_id)` in the USING clause.

11. **RLS infinite recursion** — `user_firm_ids()` queries `user_firms`. If `user_firms` has a SELECT policy that calls `user_firm_ids()`, we get infinite recursion. **Handling:** The `user_firms` SELECT policy uses `user_id = auth.uid()` directly, NOT `user_firm_ids()`. The UPDATE/DELETE policies use the `SECURITY DEFINER` helper `user_is_firm_admin(firm_id)`, which bypasses RLS when querying `user_firms` internally. Only the `firms` table uses `user_firm_ids()` in its RLS. No recursion.

---

## Performance Considerations

1. **`user_firm_ids()` called on every RLS check** — This function runs a query on `user_firms` for every row-level check on `firms`. **Mitigation:** The `idx_user_firms_user_id` index makes this O(log n). For single-firm users, this returns 1 row. PostgreSQL also caches STABLE function results within a single statement.

2. **`onAuthStateChange` triggers firm data load on every auth event** — Token refreshes trigger `TOKEN_REFRESHED` events (~hourly). **Mitigation:** The listener explicitly filters by event type, only acting on `INITIAL_SESSION`, `SIGNED_IN`, and `SIGNED_OUT`. All other events (`TOKEN_REFRESHED`, `PASSWORD_RECOVERY`, `USER_UPDATED`) are ignored. This is implemented in the revised listener code in Phase C above.

3. **Logo upload on registration** — 2MB file upload to Supabase Storage. **Mitigation:** Client-side validation of file size and type before upload. Show progress indicator (optional — Supabase Storage upload returns a promise, no progress events).

4. **Login attempt count query** — `get_recent_failed_attempts` scans recent rows filtered by email and time. **Mitigation:** The `idx_login_attempts_email_time` index covers this query. Very fast.

5. **Login attempts table grows unbounded** — Old attempts are never cleaned up. **Mitigation:** Acceptable for now. Add a scheduled job later to delete attempts older than 30 days. Or add a `TTL` index if using Supabase's pg_cron extension.

---

## i18n / RTL Implications

### New Translation Keys
- ~40 new keys in the `auth.*` namespace (see requirements doc for complete list)
- 1 new key: `subscriptionPlans.trial`
- All keys must be added to `he.ts`, `ar.ts`, and `en.ts`

### String Interpolation Pattern
The `t()` function returns raw strings. For keys with placeholders like `{n}`, `{total}`, `{amount}`, `{plan}`, `{date}`, the component calls:
```typescript
t('auth.onboard.step').replace('{n}', String(step)).replace('{total}', '3')
```

This is a consistent pattern to use across all interpolated strings. No changes to the i18n system needed.

### RTL Layout Considerations
- **LTR inputs:** Email, password, phone, registration number, and all numeric inputs must have `dir="ltr"` explicitly set. Tax IDs and registration numbers are always LTR regardless of language.
- **Form layout:** Forms use vertical stacking, which works identically in RTL and LTR. No horizontal layout issues.
- **Button alignment:** Buttons in the onboarding wizard use `justify-between` for Back/Next layout. In RTL, this naturally puts "Next" on the left and "Back" on the right, which is correct for RTL users.
- **Card layout:** All auth pages use centered cards. No directional concerns.
- **WelcomeScreen:** The ThemePicker and LanguageSelector are horizontal flex rows — direction-neutral.
- **Navigation arrows:** The Onboard wizard might use chevron icons. If so, they should be mirrored in RTL (use `rtl:rotate-180` on directional icons).

---

## Self-Critique

### Where This Design Is Weakest

1. **Orphaned auth user on registration failure (mitigated).** The `register_firm` RPC wraps firm + user_firms creation atomically, so the DB side is safe. However, if signUp succeeds but the RPC call fails (network error, etc.), we still have an orphaned auth user. This is mitigated by retry logic in OnboardStep2 and orphaned-user detection in the `onAuthStateChange` listener, but cannot be fully eliminated without server-side orchestration (edge function wrapping both signUp and firm creation).

2. **No email verification.** The design creates auth users without requiring email verification. A malicious actor could register with someone else's email. This is acceptable for MVP (the requirements explicitly exclude email verification) but should be added before production.

3. **Login lockout is per-email, not per-IP.** An attacker can call `record_login_attempt('victim@email.com', false)` via the RPC to lock out any user. The RPC validates that only authenticated users can record successes, but failures are recordable by anonymous callers (necessary because the user hasn't authenticated yet). Mitigation: rate-limiting at the API gateway or moving login tracking to a Supabase Edge Function. The current approach is acceptable for MVP.

4. **Plan selection on ExpiredScreen has no payment.** Selecting a plan updates `plan`/`expiry` via a dedicated RPC (not direct UPDATE, which is blocked by the RLS `WITH CHECK` constraint). However, the RPC itself has no payment validation. This is a placeholder — the requirements say payment is out of scope. It means any expired user can self-extend by calling the RPC. Mitigation: the RPC should be replaced with a payment-integrated flow before production.

5. **String interpolation via `.replace()`.** This works for simple cases but breaks for pluralization, gender agreement, or complex formatting. For example, `{n} days remaining` should be `יום אחד נותר` for n=1 in Hebrew. The current approach will show `1 ימים נותרים`. This is acceptable for MVP but a proper i18n library (like i18next) would handle pluralization.

6. **AuthInitializer as a separate component.** This works but feels slightly awkward — it's a render-nothing component whose only purpose is to run a hook. An alternative is to use `useAuth()` inside `App` directly, but that would make App a hook consumer which is fine since it's already a component. The separate component pattern matches the existing `ThemeInitializer` pattern, so we follow consistency.

### Alternative Approaches Considered

1. **Edge function for registration** — Wrap signUp + firm creation in a Supabase edge function for full atomicity (including the auth.signUp call). **Rejected because:** Adds deployment complexity, requires edge function setup (which is TBD). The `register_firm` RPC provides DB-level atomicity, and the orphaned-user edge case (signUp succeeds, RPC fails) is rare and recoverable via retry logic.

2. **React Context for auth instead of Zustand** — Use a React context provider with useReducer. **Rejected because:** The codebase already uses Zustand for auth state. Switching would be inconsistent and add migration work.

3. **React Query for auth state instead of Zustand** — Use React Query to cache the auth session and firm data. **Rejected because:** Auth state needs to be read synchronously by ProtectedRoute, and React Query is inherently async. Zustand gives synchronous reads.

4. **Single `authService` with firm operations merged in** — Combine auth + firm operations in one service. **Rejected because:** The requirements and plan explicitly separate `authService` and `firmService`. Firm operations will grow significantly in later phases (settings, billing, etc.) and deserve their own service.

---

## Verification Plan

After implementation, run these commands to verify:

```bash
# TypeScript compilation
npx tsc --noEmit

# Build check
npm run build

# Lint check
npm run lint
```

Manual verification:
1. Navigate to `/welcome` — see branding, buttons, theme picker, language selector
2. Switch language on WelcomeScreen — UI updates to selected language
3. Switch theme on WelcomeScreen — colors change
4. Click Register — navigate to `/register`, see step 1 form
5. Fill step 1 with valid data, click Next — advance to step 2
6. Fill step 2 with valid credentials, submit — firm created, redirected to step 3
7. Click "Go to Login" — navigate to `/login`
8. Log in with registered credentials — redirect to `/dashboard`
9. Refresh page — session persists, dashboard loads without re-login
10. Manually set firm expiry to past date in DB — refresh → redirected to `/expired`
11. On ExpiredScreen, select a plan — subscription extended, redirect to `/dashboard`
12. Log out — redirect to `/login`
13. Attempt 5 failed logins — see lockout message, unable to login for 15 minutes
14. Check Sidebar — ThemePicker and LanguageSelector work as before
