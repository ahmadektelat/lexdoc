# Auth & Onboarding — Feature Summary

**Branch:** `migration/auth-module`
**Date:** 2026-03-18
**Status:** Implementation complete, reviewed, ready for PR

---

## What Was Built

Full authentication and onboarding system for LexDoc:

### Components (10 new, 1 modified)
- **WelcomeScreen** — Landing page with app branding, login/register buttons, theme picker, language selector
- **Onboard** — 3-step registration wizard container
- **OnboardStep1** — Firm details form (name, type, regNum, phone, email, city, logo upload, default fee with VAT preview)
- **OnboardStep2** — Credentials form (email, password, confirm) with Supabase signUp + atomic firm registration
- **OnboardStep3** — Success confirmation with setup checklist
- **Login** — Login form with server-side lockout (5 attempts, 15min lock), subscription status toast
- **ExpiredScreen** — Subscription expired view with plan selection cards
- **ProtectedRoute** — Route wrapper checking auth + subscription status
- **ThemePicker** — Extracted from Sidebar as shared component
- **LanguageSelector** — Extracted from Sidebar as shared component
- **Sidebar** — Refactored to use extracted ThemePicker/LanguageSelector

### Services (2 new)
- **authService** — signUp, signIn (with lockout), signOut, getCurrentUser, getSession, onAuthStateChange
- **firmService** — registerFirm (atomic RPC), getFirmByUserId, getFirmById, updateFirm, updatePlan, uploadLogo

### Database (7 migrations)
- **firms** table with soft delete, indexes
- **user_firms** junction table (multi-firm data model, single-firm UX)
- **login_attempts** table for server-side lockout tracking
- **10 helper functions** including register_firm (atomic), record_login_attempt (validated), protect_plan_columns (trigger)
- **RLS policies** — No direct INSERT on firms/user_firms; all writes through SECURITY DEFINER RPCs
- **Storage bucket** — firm-logos with scoped RLS
- **Triggers** — updated_at auto-update, plan column protection

### Other
- **useAuth hook** — Auth lifecycle with event-filtered onAuthStateChange
- **useAuthStore** — Extended with plan, expiry, firmData, isSubscriptionExpired
- **i18n** — ~45 new auth.* keys in he.ts, ar.ts, en.ts
- **Routes** — Public (/welcome, /login, /register, /expired) + ProtectedRoute wrapper

## Key User Decisions
1. Free 30-day trial on registration (plan selection deferred to ExpiredScreen)
2. Supabase Storage bucket for logo uploads
3. Server-side login lockout with DB tracking
4. superAdmin role for registering user
5. Multi-firm data model, single-firm UX
6. ThemePicker + LanguageSelector extracted as shared components

## Security Measures
- Atomic registration via SECURITY DEFINER RPC (no orphaned auth users)
- No direct INSERT policies on firms/user_firms
- Plan/expiry columns protected by DB trigger
- Login attempt success recording validated server-side
- firm_subscription_active() helper for entity table RLS
- Explicit GRANT statements on all tables

## Review Results
- **Code Reviewer:** APPROVED
- **Devil's Advocate:** APPROVED (after 6 fixes applied)
- **Security Auditor:** CONDITIONAL PASS (pre-payment expiry limitation acknowledged)

## Known Limitations (pre-production)
- update_firm_plan accepts client-controlled expiry (needs payment integration)
- Login lockout DoS via anonymous failure recording (needs API gateway rate limiting)
- No email verification (deferred to future phase)
- No payment validation on plan changes

## Files Changed
- 28 files changed, 1847 insertions, 70 deletions
- 20 new files, 8 modified files
