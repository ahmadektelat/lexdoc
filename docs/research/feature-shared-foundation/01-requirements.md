## Requirements Document

### Task Summary

Create all shared types, utilities, constants, and reusable components for the LexDoc project. This is the foundation layer (Phase 1) that every subsequent module will import from. Nothing module-specific — only shared infrastructure.

### User Decisions

1. **Client `type` vs `clientType` fields** — **User chose: Keep both fields.** `type` ('company' | 'private') is for high-level UI grouping; `clientType` (ClientType) is the specific Israeli tax registration type used for filing logic. Do not consolidate.
2. **Money format input convention** — **User chose: Always accept agorot.** `formatMoney()` only accepts agorot values. All money values everywhere are agorot. Legacy data conversion is a migration concern, not a utility function concern.
3. **Subscription plan prices** — **User chose: Store as agorot.** Plan prices stored as integers in agorot (29900, 249000, 399000) for consistency with the system-wide agorot convention.
4. **DataTable component** — **User chose: Use @tanstack/react-table.** Add `@tanstack/react-table` as a dependency and build DataTable on top of it with sorting, pagination, and filtering support.
5. **User type location** — **User chose: Extract to `src/types/user.ts`.** The `User` type should be shared across modules (audit entries, staff assignments, etc.), not locked inside the auth store.

### Chosen Approach

**Plan-driven implementation with user refinements** — Follow the detailed plan in `docs/plans/01-shared-foundation.md` as the source of truth, applying the 5 user decisions above. Do NOT rely on legacy app patterns; the legacy app was acknowledged as not implemented correctly.

### Scope

**In scope:**
- All TypeScript type definitions in `src/types/` (13 files including barrel export)
- All utility functions in `src/lib/` (4 new files: money.ts, dates.ts, filing-utils.ts, validation.ts)
- Constants file `src/lib/constants.ts`
- 9 shared UI components in `src/components/shared/`
- Barrel export `src/components/shared/index.ts`
- Adding `@tanstack/react-table` as a dependency
- i18n keys needed by shared components (added to all 3 language files)

**Out of scope:**
- Services (`src/services/`) — created in Phase 3+
- Hooks (`src/hooks/`) — created in Phase 3+
- Page-level components — created in module phases
- Database tables/migrations — created in module phases
- Auth flow or routing — Phase 2
- Supabase Edge Functions — later phases

### What Already Exists (DO NOT duplicate)

#### Utilities
- `src/lib/utils.ts` — `cn()` function (clsx + tailwind-merge)

#### UI Components (shadcn/ui primitives)
- `src/components/ui/badge.tsx` — Badge with variants (default, secondary, destructive, outline)
- `src/components/ui/button.tsx` — Button
- `src/components/ui/card.tsx` — Card
- `src/components/ui/dialog.tsx` — Dialog (full Radix dialog with overlay, header, footer, title, description)
- `src/components/ui/dropdown-menu.tsx` — DropdownMenu
- `src/components/ui/input.tsx` — Input
- `src/components/ui/label.tsx` — Label
- `src/components/ui/scroll-area.tsx` — ScrollArea
- `src/components/ui/select.tsx` — Select
- `src/components/ui/separator.tsx` — Separator
- `src/components/ui/sheet.tsx` — Sheet
- `src/components/ui/switch.tsx` — Switch
- `src/components/ui/tabs.tsx` — Tabs
- `src/components/ui/tooltip.tsx` — Tooltip

#### Stores
- `src/stores/useAppStore.ts` — UI state (sidebar, navigation)
- `src/stores/useAuthStore.ts` — Auth state (user, firm, role, permissions) — **Note:** contains a local `User` interface that should be replaced with import from `src/types/user.ts`
- `src/stores/useThemeStore.ts` — Theme state with localStorage persistence

#### i18n
- `src/i18n/he.ts` — Hebrew translations (117 keys across nav, common, auth, dashboard, clients, filings, billing, staff, errors, theme, language)
- `src/i18n/ar.ts` — Arabic translations (same 117 keys)
- `src/i18n/en.ts` — English translations (same 117 keys)
- `src/i18n/index.ts` — Translation index, exports `translations` record
- `src/contexts/LanguageContext.tsx` — `useLanguage()` hook with `t()`, `language`, `direction`, `setLanguage`

#### Other
- `src/integrations/supabase/client.ts` — Supabase client config
- `src/App.tsx` — App shell
- `src/components/layout/AppShell.tsx` — Layout shell
- `src/components/layout/Sidebar.tsx` — Sidebar navigation

### New Files Needed

#### Types (`src/types/`)

| File | Exports | Notes |
|------|---------|-------|
| `common.ts` | `PaginatedResult<T>`, `ListOptions` | Generic pagination types |
| `firm.ts` | `Firm`, `FirmType`, `SubscriptionPlan` | Firm entity and subscription |
| `user.ts` | `User` | **New file (user decision #5).** Extract from `useAuthStore.ts`. Fields: `id`, `email`, `name` |
| `client.ts` | `Client`, `ClientType`, `CreateClientInput`, `UpdateClientInput` | Keep both `type` and `clientType` fields (user decision #1) |
| `staff.ts` | `Staff`, `StaffRole`, `CreateStaffInput`, `UpdateStaffInput` | Staff entity |
| `filing.ts` | `Filing`, `FilingType`, `FilingStatus`, `FilingSetting`, `CreateFilingInput` | Filing tracker types |
| `billing.ts` | `BillingEntry`, `HoursEntry`, `Invoice`, `InvoiceItem`, `CreateBillingInput`, `CreateInvoiceInput` | All money fields in agorot (user decision #2) |
| `task.ts` | `Task`, `TaskStatus`, `TaskPriority`, `TaskCategory`, `CreateTaskInput` | Task management types |
| `crm.ts` | `Contact`, `ContactType`, `Interaction`, `InteractionChannel`, `CreateContactInput`, `CreateInteractionInput` | CRM types |
| `document.ts` | `Document`, `DocumentSensitivity`, `DocumentFolder`, `CreateDocumentInput` | Document management types |
| `role.ts` | `Role`, `Permission`, `StaffRoleAssignment`, `PERMISSION_GROUPS` | RBAC types and permission constant |
| `audit.ts` | `AuditEntry` | Audit log entry type |
| `message.ts` | `MessageTemplate`, `Message`, `ScheduledMessage`, `MessageChannel` | Messaging types |
| `index.ts` | Barrel re-exports | Re-exports all types from all files |

#### Utilities (`src/lib/`)

| File | Exports | Notes |
|------|---------|-------|
| `constants.ts` | `VAT_RATE`, `AGOROT_PER_SHEKEL`, `MAX_ACTIVE_USERS_PER_CLIENT`, `AUTO_TASK_LEAD_DAYS`, `AUTO_TASK_WINDOW_DAYS`, `FILING_TYPES`, `FILING_TYPE_COLORS`, `CLIENT_TYPES`, `STAFF_ROLES`, `TASK_PRIORITIES`, `TASK_CATEGORIES`, `INTERACTION_CHANNELS`, `DOCUMENT_SENSITIVITIES`, `SUBSCRIPTION_PLANS`, `DEFAULT_FOLDERS`, `SYSTEM_ROLES` | Plan prices in agorot (user decision #3). Hebrew labels for domain constants. |
| `money.ts` | `shekelToAgorot()`, `agorotToShekel()`, `formatMoney()`, `calculateVat()`, `calculateInvoiceTotal()` | All inputs/outputs in agorot (user decision #2). `formatMoney` converts to shekels only for display. |
| `dates.ts` | `formatDate()`, `formatDateTime()`, `daysLeft()`, `addMonths()`, `addDays()`, `isOverdue()`, `getToday()` | Use `date-fns` (already installed) for date manipulation. Format with `he-IL` locale. |
| `filing-utils.ts` | `calculateDueDate()`, `getMonthlyPeriods()`, `getBimonthlyPeriods()`, `generateFilingSchedule()`, `getFilingTypeLabel()`, `getFilingTypeColor()`, `taskDueDateForFiling()`, `getAutoTaskLabel()` | Filing schedule generation and helpers. References `FILING_TYPES` from constants. |
| `validation.ts` | `validateTaxId()`, `validatePhone()`, `validateEmail()`, `sanitizeSearchInput()` | Input validation. `zod` is available but these should be standalone functions that can be composed into zod schemas later. |

#### Shared Components (`src/components/shared/`)

| File | Exports | Dependencies | Notes |
|------|---------|-------------|-------|
| `StatusBadge.tsx` | `StatusBadge` | Badge (ui) | Variants: filed/active/sent/paid/done=green, pending/open=amber, late/cancelled=red, archived=gray |
| `PriorityBadge.tsx` | `PriorityBadge` | Badge (ui) | high=red, medium=amber, low=blue |
| `EmptyState.tsx` | `EmptyState` | lucide-react | Centered icon + title + optional description |
| `LoadingSpinner.tsx` | `LoadingSpinner` | none | CSS-animated centered spinner |
| `ConfirmDialog.tsx` | `ConfirmDialog` | Dialog (ui), Button (ui) | Wraps shadcn Dialog. Uses `t()` for default button labels. Supports destructive variant. |
| `DataTable.tsx` | `DataTable` | **@tanstack/react-table** (new dep) | Generic table with sorting, pagination, filtering (user decision #4) |
| `PageHeader.tsx` | `PageHeader` | none | h1 + optional description + right-aligned action slot |
| `FormField.tsx` | `FormField` | Label (ui) | Label + input slot + error display + optional hint |
| `SearchInput.tsx` | `SearchInput` | Input (ui), lucide-react | Debounced search with search icon. Default 300ms debounce. |
| `index.ts` | Barrel re-exports | all above | Re-exports all shared components |

### Dependencies

**Existing (already in package.json):**
- `date-fns` ^3.6.0 — date manipulation
- `zod` ^3.23.8 — validation schemas (available but not required for Phase 1 validation functions)
- `lucide-react` ^0.462.0 — icons
- `class-variance-authority` ^0.7.1 — variant styling
- `@radix-ui/react-dialog` — underlying Dialog primitive
- All shadcn/ui primitives listed above

**New dependency to add:**
- `@tanstack/react-table` — required for DataTable component (user decision #4)

### Modifications to Existing Files

| File | Change | Reason |
|------|--------|--------|
| `src/stores/useAuthStore.ts` | Replace local `User` interface with `import { User } from '@/types/user'` | User decision #5: extract User type for shared use |
| `src/i18n/he.ts` | Add new keys for shared component labels | Shared components need translated strings (confirm/cancel defaults, empty states, etc.) |
| `src/i18n/ar.ts` | Add corresponding Arabic keys | 3-language mandate |
| `src/i18n/en.ts` | Add corresponding English keys | 3-language mandate |
| `package.json` | Add `@tanstack/react-table` dependency | User decision #4 |

### i18n Keys Needed

New translation keys required by shared components (estimate -- architect should finalize):

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `common.confirmAction` | אישור פעולה | تأكيد الإجراء | Confirm Action |
| `common.areYouSure` | האם אתה בטוח? | هل أنت متأكد؟ | Are you sure? |
| `common.noData` | אין נתונים להצגה | لا توجد بيانات للعرض | No data to display |
| `common.searchPlaceholder` | חיפוש... | بحث... | Search... |
| `common.page` | עמוד | صفحة | Page |
| `common.of` | מתוך | من | of |
| `common.rowsPerPage` | שורות בעמוד | صفوف في الصفحة | Rows per page |
| `common.previous` | הקודם | السابق | Previous |
| `common.required` | שדה חובה | حقل مطلوب | Required |

### Database Changes

None in Phase 1. Database tables, RLS policies, and migrations are created in subsequent module phases.

### Component Rules (from plan)

All shared components MUST:
- Use `useLanguage()` for any user-facing strings
- Use semantic Tailwind classes (`bg-background`, `text-foreground`, etc.) — never hardcode theme colors
- Support RTL via `dir={direction}` or Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`)
- Include timestamp headers (CREATED/UPDATED in IST Jerusalem format)
- Define exported props interfaces

### Success Criteria

- [ ] All 14 type files created in `src/types/` with correct exports
- [ ] `src/types/index.ts` barrel exports all types
- [ ] `src/lib/constants.ts` created with all domain constants (prices in agorot)
- [ ] `src/lib/money.ts` created — all functions accept/return agorot
- [ ] `src/lib/dates.ts` created — uses date-fns, he-IL locale
- [ ] `src/lib/filing-utils.ts` created — schedule generation works
- [ ] `src/lib/validation.ts` created — Israeli tax ID, phone, email validation
- [ ] All 9 shared components created in `src/components/shared/`
- [ ] `src/components/shared/index.ts` barrel exports all components
- [ ] `DataTable` built on `@tanstack/react-table` with sorting/pagination/filtering
- [ ] `User` type extracted to `src/types/user.ts` and `useAuthStore.ts` imports from it
- [ ] All new i18n keys added to he.ts, ar.ts, en.ts
- [ ] All components use `useLanguage()` for user-facing strings
- [ ] All components use semantic Tailwind classes (no hardcoded theme colors)
- [ ] All components support RTL layout
- [ ] All files have CREATED/UPDATED timestamp headers
- [ ] `@tanstack/react-table` added to package.json
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes (or only pre-existing warnings)
- [ ] `SHARED-CODE-REGISTRY.md` updated after implementation
