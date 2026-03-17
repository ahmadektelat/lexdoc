# Auth & Onboarding

Implement the authentication system: login, onboarding/registration, subscription management, and protected routes.

**Branch:** `migration/auth-module`
**Prerequisites:** Phase 1 (Shared Foundation) merged to main

## Context

- Read legacy-app.html lines 577-731 for the onboarding and login flows
- Supabase Auth replaces the legacy hashPw password system — use Supabase signUp/signIn
- The firm data is stored in a `firms` table (will be created via migration)
- Hebrew is primary language — all strings use t() from useLanguage()
- 3 themes via CSS variables — use bg-background, text-foreground, etc.
- Read `docs/plans/SHARED-CODE-REGISTRY.md` for existing shared code — DO NOT recreate utilities

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { Firm, FirmType, SubscriptionPlan } from '@/types'`
- Constants: `import { SUBSCRIPTION_PLANS } from '@/lib/constants'`
- Utils: `import { daysLeft, formatDate } from '@/lib/dates'`
- Components: `import { FormField, LoadingSpinner, PageHeader } from '@/components/shared'`
- Auth store: `import { useAuthStore } from '@/stores/useAuthStore'`
- Supabase: `import { supabase } from '@/integrations/supabase/client'`

## Features to Implement

1. **WelcomeScreen** — Landing page with:
   - App logo and name "LexDoc — ניהול משרד"
   - Brief description
   - Login button → navigates to /login
   - Register button → navigates to /register
   - Theme picker (import from existing Sidebar or extract)

2. **Onboard** — Multi-step registration (3 steps):
   Step 1 — Firm details: name (required), type (lawyer/cpa/combined/notary), regNum (required), phone (required), email (required), city, logo upload (optional, 2MB max), default monthly fee (optional, show VAT calculation using calculateVat())
   Step 2 — Login credentials: email, password (min 6 chars), confirm password. Uses Supabase signUp.
   Step 3 — Success: confirmation message, list of setup items, proceed to login

3. **Login** — Login form:
   - Email and password fields
   - Max 5 failed attempts with lockout message
   - Uses Supabase signInWithPassword
   - On success: load firm data, set useAuthStore state, redirect to /dashboard
   - Show subscription status (days remaining, plan label)
   - Link to registration for new users

4. **ExpiredScreen** — Shows when subscription expired:
   - Expiry message
   - Renewal options (show SUBSCRIPTION_PLANS)
   - Logout button

5. **ProtectedRoute** — Route wrapper:
   - Checks useAuthStore for authenticated user
   - Redirects to /login if not authenticated
   - Shows LoadingSpinner while checking auth
   - Checks subscription expiry — redirects to /expired if past due

6. **Services**:
   - `authService.ts`: signUp, signIn, signOut, getCurrentUser, onAuthStateChange
   - `firmService.ts`: createFirm, getFirmById, updateFirm

7. **Database migration** (via Supabase MCP):
   - Create `firms` table with all firm fields
   - Create `user_firms` junction table (user_id, firm_id, role)
   - RLS policies scoped to user's firms
   - Insert firm data on registration

8. **Update App.tsx**:
   - Wrap main routes in ProtectedRoute
   - Add public routes: /login, /register, /expired
   - Add auth state listener (onAuthStateChange)

Add i18n keys for all auth-related strings to he.ts, ar.ts, en.ts (auth.* section).
