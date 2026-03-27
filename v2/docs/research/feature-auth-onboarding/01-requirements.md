# Auth & Onboarding — Requirements Document

**Feature Plan:** `docs/plans/02-auth-onboarding.md`
**Branch:** `migration/auth-module`
**Date:** 2026-03-17

---

## Task Summary

Implement the full authentication and onboarding system for LexDoc: welcome screen, multi-step firm registration with Supabase Auth, login with server-side lockout, subscription expiry handling, and protected routes. All UI must support 3 languages (Hebrew primary, Arabic, English) and 3 themes.

---

## User Decisions

1. **Subscription plan on registration** — User chose: **Free 30-day trial**. All new firms get a 30-day trial automatically. Plan selection happens later on the ExpiredScreen. Onboarding stays at 3 steps.
2. **Logo upload storage** — User chose: **Supabase Storage bucket**. Upload to a `firm-logos` bucket, store the public URL in `firms.logo`. Set up RLS policies for the bucket.
3. **Login lockout behavior** — User chose: **Server-side with Supabase**. Track failed login attempts in a `login_attempts` database table. Lock the account for a duration after 5 failures. Requires DB table, RPC/edge function, and unlock logic.
4. **Registering user role** — User chose: **superAdmin**. The user who registers a firm is automatically assigned `superAdmin` role in `user_firms`.
5. **Multi-firm support** — User chose: **Multi-firm data model, single-firm UX**. Build the `user_firms` junction table correctly for future multi-firm support, but only implement single-firm UX (no firm switcher).
6. **Theme picker extraction** — User chose: **Extract to shared component**. Create `src/components/shared/ThemePicker.tsx` and refactor `Sidebar.tsx` to use it.
7. **Language selector on WelcomeScreen** — User chose: **Yes**. WelcomeScreen gets both theme picker and language selector so users can choose their language before registration.

---

## Chosen Approach

**Supabase-native auth with multi-step onboarding and server-side security.**

Use Supabase Auth (signUp/signIn) to replace the legacy password hashing system. Registration creates both a Supabase auth user and a firm record in a single transaction flow. Login includes server-side attempt tracking for lockout. All new registrations start with a 30-day free trial; plan selection is deferred to the ExpiredScreen.

---

## Scope

**In scope:**
- WelcomeScreen with theme picker + language selector
- 3-step Onboarding wizard (firm details, credentials, success)
- Login form with server-side lockout (5 attempts)
- ExpiredScreen with subscription plan selection
- ProtectedRoute wrapper (auth check + subscription check)
- `authService` and `firmService` (Supabase CRUD)
- Database migrations: `firms`, `user_firms`, `login_attempts` tables + RLS
- Supabase Storage bucket for firm logos
- Extract ThemePicker + LanguageSelector as shared components
- i18n keys for all auth-related strings (auth.* section)
- Route updates in App.tsx

**Out of scope:**
- Payment processing / billing integration for subscription plans
- Firm switcher UI (data model supports it, UI deferred)
- Password reset / forgot password flow (mentioned in i18n but not in feature plan)
- MFA / two-factor authentication (legacy had a demo MFA, not needed now)
- Email verification flow
- Social auth (Google, etc.)
- User profile management

---

## Existing Shared Code to Import (DO NOT recreate)

| Import | Source | Used For |
|--------|--------|----------|
| `Firm`, `FirmType`, `SubscriptionPlan` | `@/types` | Firm data types |
| `User` | `@/types/user` | User interface |
| `SUBSCRIPTION_PLANS` | `@/lib/constants` | Plan options on ExpiredScreen |
| `VAT_RATE` | `@/lib/constants` | VAT calculation display during onboarding |
| `daysLeft`, `formatDate` | `@/lib/dates` | Subscription expiry display |
| `addMonths` | `@/lib/dates` | Calculate expiry date from plan |
| `calculateVat`, `formatMoney` | `@/lib/money` | Default fee VAT preview |
| `shekelToAgorot`, `agorotToShekel` | `@/lib/money` | Fee conversion |
| `validateEmail`, `validatePhone` | `@/lib/validation` | Form validation |
| `FormField` | `@/components/shared` | All form fields |
| `LoadingSpinner` | `@/components/shared` | Loading states |
| `PageHeader` | `@/components/shared` | ExpiredScreen header |
| `useAuthStore` | `@/stores/useAuthStore` | Auth state management |
| `useThemeStore` | `@/stores/useThemeStore` | Theme picker |
| `useLanguage` | `@/contexts/LanguageContext` | i18n `t()` function |
| `supabase` | `@/integrations/supabase/client` | Supabase client |
| `cn` | `@/lib/utils` | Classname merging |

---

## Affected Files (Existing)

| File | Changes |
|------|---------|
| `src/App.tsx` | Add public routes (/login, /register, /expired), wrap protected routes in ProtectedRoute, add auth state listener |
| `src/components/layout/Sidebar.tsx` | Refactor to import extracted ThemePicker and LanguageSelector components |
| `src/stores/useAuthStore.ts` | May need to add subscription-related state (plan, expiry, firmData) for ProtectedRoute to check |
| `src/i18n/he.ts` | Add auth.* section keys (~30-40 new keys) |
| `src/i18n/ar.ts` | Add auth.* section keys (~30-40 new keys) |
| `src/i18n/en.ts` | Add auth.* section keys (~30-40 new keys) |
| `docs/plans/SHARED-CODE-REGISTRY.md` | Register new shared components, services, hooks |

---

## New Files Needed

### Components (`src/components/auth/`)

| File | Purpose |
|------|---------|
| `WelcomeScreen.tsx` | Landing page: logo, app name, description, Login/Register buttons, ThemePicker, LanguageSelector |
| `Onboard.tsx` | 3-step registration wizard container (manages step state) |
| `OnboardStep1.tsx` | Firm details form: name, type, regNum, phone, email, city, logo upload, default fee with VAT preview |
| `OnboardStep2.tsx` | Credentials form: email, password (min 6), confirm password. Calls Supabase signUp |
| `OnboardStep3.tsx` | Success confirmation: setup checklist, proceed to login button |
| `Login.tsx` | Login form: email, password, error states, lockout message, subscription status display, link to register |
| `ExpiredScreen.tsx` | Subscription expired: expiry message, SUBSCRIPTION_PLANS cards, plan selection, logout button |
| `ProtectedRoute.tsx` | Route wrapper: checks auth, checks subscription, redirects accordingly, shows LoadingSpinner |

### Shared Components (`src/components/shared/`)

| File | Purpose |
|------|---------|
| `ThemePicker.tsx` | Reusable theme picker (extracted from Sidebar). Used by Sidebar + WelcomeScreen |
| `LanguageSelector.tsx` | Reusable language selector (extracted from Sidebar). Used by Sidebar + WelcomeScreen |

### Services (`src/services/`)

| File | Purpose |
|------|---------|
| `authService.ts` | `signUp(email, password)`, `signIn(email, password)`, `signOut()`, `getCurrentUser()`, `onAuthStateChange(callback)`, `checkLoginAttempts(email)`, `recordLoginAttempt(email, success)` |
| `firmService.ts` | `createFirm(data)`, `getFirmById(id)`, `getFirmByUserId(userId)`, `updateFirm(id, data)`, `uploadLogo(firmId, file)` |

### Hooks (`src/hooks/`)

| File | Purpose |
|------|---------|
| `useAuth.ts` | React Query hook wrapping authService. Handles auth state initialization, login/logout mutations, session persistence |

---

## Database Changes

### Table: `firms`

```sql
CREATE TABLE firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('lawyer', 'cpa', 'combined', 'notary')),
  reg_num TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  city TEXT DEFAULT '',
  logo TEXT,  -- URL to Supabase Storage
  plan TEXT NOT NULL DEFAULT 'trial',
  plan_label TEXT NOT NULL DEFAULT 'subscriptionPlans.trial',
  expiry TIMESTAMPTZ NOT NULL,
  default_fee INTEGER DEFAULT 0,  -- agorot
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**RLS Policies:**
- SELECT: Users can read firms they belong to (via `user_firms`)
- UPDATE: Users with superAdmin/manager role in `user_firms` can update
- INSERT: Authenticated users can insert (registration flow)
- DELETE: Soft delete only (no hard delete policy)

### Table: `user_firms`

```sql
CREATE TABLE user_firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('superAdmin', 'manager', 'staff', 'external')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, firm_id)
);
```

**RLS Policies:**
- SELECT: Users can read their own rows
- INSERT: Authenticated users can insert their own user_id (registration)
- UPDATE: superAdmin of the firm can update roles
- DELETE: superAdmin of the firm can remove members

### Table: `login_attempts`

```sql
CREATE TABLE login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_login_attempts_email_time ON login_attempts (email, attempted_at DESC);
```

**RLS Policies:**
- INSERT: Authenticated and anonymous users can insert (login attempts happen before auth)
- SELECT: Service role only (checked via RPC function)
- No UPDATE or DELETE for end users

### RPC Function: `check_login_locked`

```sql
CREATE OR REPLACE FUNCTION check_login_locked(p_email TEXT)
RETURNS BOOLEAN AS $$
  SELECT COUNT(*) >= 5
  FROM login_attempts
  WHERE email = p_email
    AND success = false
    AND attempted_at > NOW() - INTERVAL '15 minutes';
$$ LANGUAGE sql SECURITY DEFINER;
```

### Helper Function: `user_firm_ids`

```sql
CREATE OR REPLACE FUNCTION user_firm_ids()
RETURNS SETOF UUID AS $$
  SELECT firm_id FROM user_firms WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Supabase Storage

- **Bucket:** `firm-logos` (public)
- **Max file size:** 2MB
- **Allowed MIME types:** `image/png`, `image/jpeg`, `image/webp`
- **File path pattern:** `{firm_id}/logo.{ext}`
- **RLS:** Members of the firm can upload/update; public read access

---

## i18n Keys Needed

All keys use the `auth.*` prefix. These must be added to `he.ts`, `ar.ts`, and `en.ts`.

### WelcomeScreen
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `auth.appName` | `LexDoc — ניהול משרד` | `LexDoc — إدارة مكتب` | `LexDoc — Office Management` |
| `auth.appDescription` | `מערכת ניהול משרד מתקדמת` | `نظام إدارة مكتب متقدم` | `Advanced Office Management System` |
| `auth.loginButton` | `התחברות` | `تسجيل الدخول` | `Login` |
| `auth.registerButton` | `הרשמה` | `التسجيل` | `Register` |

### Onboarding
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `auth.onboard.title` | `הגדרת משרד חדש` | `إعداد مكتب جديد` | `Set Up New Firm` |
| `auth.onboard.step` | `שלב {n} מתוך {total}` | `الخطوة {n} من {total}` | `Step {n} of {total}` |
| `auth.onboard.firmDetails` | `פרטי המשרד` | `تفاصيل المكتب` | `Firm Details` |
| `auth.onboard.firmName` | `שם המשרד` | `اسم المكتب` | `Firm Name` |
| `auth.onboard.firmType` | `סוג משרד` | `نوع المكتب` | `Firm Type` |
| `auth.onboard.firmType.lawyer` | `עורכי דין` | `محاماة` | `Law Firm` |
| `auth.onboard.firmType.cpa` | `רואי חשבון` | `محاسبة` | `CPA Firm` |
| `auth.onboard.firmType.combined` | `עו"ד + רו"ח` | `محاماة + محاسبة` | `Law + CPA` |
| `auth.onboard.firmType.notary` | `נוטריון` | `كاتب عدل` | `Notary` |
| `auth.onboard.regNum` | `מספר ח.פ.` | `رقم التسجيل` | `Registration Number` |
| `auth.onboard.city` | `עיר` | `المدينة` | `City` |
| `auth.onboard.logo` | `לוגו (אופציונלי)` | `الشعار (اختياري)` | `Logo (optional)` |
| `auth.onboard.logoUpload` | `העלה לוגו` | `رفع شعار` | `Upload Logo` |
| `auth.onboard.logoReplace` | `החלף לוגו` | `استبدال الشعار` | `Replace Logo` |
| `auth.onboard.logoHint` | `PNG, JPG עד 2MB` | `PNG, JPG حتى 2MB` | `PNG, JPG up to 2MB` |
| `auth.onboard.defaultFee` | `אגרה חודשית ברירת מחדל (ללא מע"מ)` | `الرسوم الشهرية الافتراضية (بدون ضريبة)` | `Default Monthly Fee (excl. VAT)` |
| `auth.onboard.vatPreview` | `כולל מע"מ 18%: {amount}` | `شامل ضريبة 18%: {amount}` | `Incl. 18% VAT: {amount}` |
| `auth.onboard.continueToCredentials` | `המשך להגדרת כניסה` | `متابعة لإعداد الدخول` | `Continue to Login Setup` |
| `auth.onboard.credentials` | `פרטי כניסה` | `بيانات الدخول` | `Login Credentials` |
| `auth.onboard.confirmPassword` | `אישור סיסמה` | `تأكيد كلمة المرور` | `Confirm Password` |
| `auth.onboard.passwordHint` | `מינימום 6 תווים` | `6 أحرف على الأقل` | `Minimum 6 characters` |
| `auth.onboard.finishSetup` | `סיים הגדרה` | `إنهاء الإعداد` | `Finish Setup` |
| `auth.onboard.saving` | `שומר...` | `جارٍ الحفظ...` | `Saving...` |
| `auth.onboard.success` | `המשרד הוגדר בהצלחה!` | `تم إعداد المكتب بنجاح!` | `Firm setup complete!` |
| `auth.onboard.firmConfigured` | `משרד הוגדר` | `تم تكوين المكتب` | `Firm configured` |
| `auth.onboard.subscriptionActive` | `מנוי פעיל` | `الاشتراك فعّال` | `Subscription active` |
| `auth.onboard.securityEnabled` | `אבטחת RLS מופעלת` | `أمان RLS مفعّل` | `RLS security enabled` |
| `auth.onboard.auditReady` | `יומן פעילות מוכן` | `سجل التدقيق جاهز` | `Audit log ready` |
| `auth.onboard.goToLogin` | `עבור להתחברות` | `الانتقال لتسجيل الدخول` | `Go to Login` |

### Login
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `auth.login.title` | `התחברות` | `تسجيل الدخول` | `Login` |
| `auth.login.submit` | `כניסה` | `دخول` | `Sign In` |
| `auth.login.authenticating` | `מאמת...` | `جارٍ التحقق...` | `Authenticating...` |
| `auth.login.wrongPassword` | `סיסמה שגויה` | `كلمة مرور خاطئة` | `Wrong password` |
| `auth.login.attemptCount` | `ניסיון {n} מתוך 5` | `المحاولة {n} من 5` | `Attempt {n} of 5` |
| `auth.login.locked` | `החשבון נעול. נסה שוב בעוד 15 דקות.` | `الحساب مقفل. حاول مرة أخرى بعد 15 دقيقة.` | `Account locked. Try again in 15 minutes.` |
| `auth.login.noAccount` | `אין לך חשבון?` | `ليس لديك حساب؟` | `Don't have an account?` |
| `auth.login.registerHere` | `הרשמה כאן` | `سجّل هنا` | `Register here` |
| `auth.login.subscription` | `מנוי {plan}` | `اشتراك {plan}` | `{plan} subscription` |
| `auth.login.daysRemaining` | `{n} ימים נותרים` | `{n} أيام متبقية` | `{n} days remaining` |
| `auth.login.until` | `עד {date}` | `حتى {date}` | `Until {date}` |

### ExpiredScreen
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `auth.expired.title` | `המנוי פג תוקף` | `انتهى الاشتراك` | `Subscription Expired` |
| `auth.expired.message` | `המנוי שלך פג תוקף. בחר מנוי חדש כדי להמשיך.` | `انتهى اشتراكك. اختر اشتراكًا جديدًا للمتابعة.` | `Your subscription has expired. Choose a new plan to continue.` |
| `auth.expired.selectPlan` | `בחר מנוי` | `اختر اشتراك` | `Select Plan` |
| `auth.expired.perMonth` | `לחודש` | `شهريًا` | `per month` |

### Validation Errors
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `auth.errors.required` | `שדה חובה` | `حقل مطلوب` | `Required field` |
| `auth.errors.invalidEmail` | `אימייל לא תקין` | `بريد إلكتروني غير صالح` | `Invalid email` |
| `auth.errors.invalidPhone` | `טלפון לא תקין` | `رقم هاتف غير صالح` | `Invalid phone number` |
| `auth.errors.passwordTooShort` | `מינימום 6 תווים` | `6 أحرف على الأقل` | `Minimum 6 characters` |
| `auth.errors.passwordMismatch` | `הסיסמאות לא תואמות` | `كلمات المرور غير متطابقة` | `Passwords don't match` |
| `auth.errors.signUpFailed` | `ההרשמה נכשלה` | `فشل التسجيل` | `Registration failed` |
| `auth.errors.signInFailed` | `ההתחברות נכשלה` | `فشل تسجيل الدخول` | `Login failed` |

### Trial Plan Label
| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `subscriptionPlans.trial` | `ניסיון 30 יום` | `تجربة 30 يوم` | `30-day Trial` |

---

## Route Changes

**Current state (App.tsx):** All routes are under `<AppShell />` with no auth protection.

**Target state:**

```
/ (root)
├── /welcome          — WelcomeScreen (public)
├── /login            — Login (public)
├── /register         — Onboard wizard (public)
├── /expired          — ExpiredScreen (authenticated but expired)
└── <ProtectedRoute>  — Checks auth + subscription
    └── <AppShell />
        ├── /dashboard
        ├── /clients
        ├── /filings
        ├── /billing
        ├── /staff
        ├── /crm
        ├── /documents
        ├── /reports
        ├── /messaging
        ├── /permissions
        ├── /audit
        └── /backup
```

- Root `/` redirects to `/welcome` (not `/dashboard`) when not authenticated
- Root `/` redirects to `/dashboard` when authenticated with valid subscription
- All public routes (/welcome, /login, /register) should redirect to /dashboard if already authenticated

---

## Codebase Patterns to Follow

### Component Structure
- Timestamp header comment with CREATED/UPDATED
- `useLanguage()` hook for `t()` function
- Tailwind CSS with theme-aware classes (`bg-background`, `text-foreground`, etc.)
- RTL-first using logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`)
- shadcn/ui primitives for inputs, buttons, cards, dialogs
- `FormField` wrapper for all form inputs

### Service Pattern
- Export a plain object with methods (no class)
- Each method takes typed parameters and returns typed results
- Use `supabase` client directly
- Handle errors and return meaningful messages

### Store Pattern (Zustand)
- `create<StoreType>()((set, get) => ({...}))`
- Simple state + actions
- No async logic in stores — that goes in services/hooks

### Naming Conventions
- Components: PascalCase files and exports
- Services: `camelCaseService.ts` with `camelCaseService` object export
- Hooks: `useCamelCase.ts` with `useCamelCase` function export
- Types: PascalCase interfaces in `src/types/`
- i18n keys: `section.descriptiveKey`

---

## Gaps and Considerations

1. **No `firm_id` on `firms` table** — The existing `Firm` type has an `id` field but the CLAUDE.md says every entity table needs `firm_id`. The `firms` table IS the firm, so it does not need a `firm_id` column. This is correct — the `firm_id` scoping pattern applies to entities WITHIN a firm.

2. **`useAuthStore` needs expansion** — The current store has `user`, `firmId`, `firmName`, `role`, `permissions`. It will need `plan`, `expiry`, and possibly the full `Firm` object for the ProtectedRoute to check subscription status. Alternatively, the ProtectedRoute can fetch firm data independently.

3. **Auth state listener** — Need `onAuthStateChange` listener in App.tsx to handle session restore on page refresh. This should set the auth store state and load firm data.

4. **Supabase project ID** — The CLAUDE.md says project ID is TBD. Database migrations will need the Supabase project to be set up first. The Supabase client config uses env vars that need to be configured.

5. **Trial plan not in SUBSCRIPTION_PLANS** — The existing `SUBSCRIPTION_PLANS` constant has `monthly`, `yearly`, and `two`. A `trial` plan needs to be added or handled separately (it's not purchasable, only auto-assigned on registration). Recommend adding a `subscriptionPlans.trial` i18n key but NOT adding trial to the `SUBSCRIPTION_PLANS` array (which is for purchasable plans shown on ExpiredScreen).

6. **`Firm` type needs `firm_id` renamed from `plan`** — The existing `Firm` interface has `plan: string` and `planLabel: string`. These work for both trial and paid plans. No type changes needed.

7. **Password requirements** — The plan says min 6 characters. No uppercase/special character requirements specified. Keep it simple as stated.

---

## Success Criteria

- [ ] WelcomeScreen renders with logo, description, Login/Register buttons, ThemePicker, and LanguageSelector
- [ ] Onboarding wizard completes 3 steps and creates both a Supabase auth user and a firm record
- [ ] Logo upload works via Supabase Storage bucket (2MB max, image types only)
- [ ] Default fee shows VAT preview using `calculateVat()` and `formatMoney()`
- [ ] Registration auto-assigns 30-day trial and `superAdmin` role
- [ ] Login authenticates via Supabase `signInWithPassword`
- [ ] Failed login attempts are tracked server-side; account locks after 5 failures for 15 minutes
- [ ] Login shows subscription status (plan label, days remaining)
- [ ] ProtectedRoute redirects unauthenticated users to /login
- [ ] ProtectedRoute redirects expired subscriptions to /expired
- [ ] ExpiredScreen displays SUBSCRIPTION_PLANS for selection
- [ ] Auth state persists across page refreshes via `onAuthStateChange`
- [ ] All strings use `t()` with keys in he.ts, ar.ts, en.ts
- [ ] All 3 themes render correctly on auth pages
- [ ] RTL layout works for Hebrew/Arabic, LTR for English
- [ ] `npm run build` passes with no errors
- [ ] `npx tsc --noEmit` passes with no type errors
- [ ] ThemePicker and LanguageSelector extracted as shared components
- [ ] Sidebar refactored to use extracted ThemePicker and LanguageSelector
- [ ] Database tables created with proper RLS policies
- [ ] SHARED-CODE-REGISTRY.md updated with new components, services, hooks
