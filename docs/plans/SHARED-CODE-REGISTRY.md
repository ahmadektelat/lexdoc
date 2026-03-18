# Shared Code Registry

> Updated after each migration phase. Agents MUST check this before creating new utilities.

## Types (`src/types/`)

| File | Exports | Created In |
|------|---------|------------|
| `index.ts` | Barrel exports | Phase 1 |
| `client.ts` | `Client`, `CreateClientInput`, `UpdateClientInput`, `ClientType` | Phase 1 |
| `staff.ts` | `Staff`, `CreateStaffInput`, `UpdateStaffInput`, `StaffRole` | Phase 1 |
| `filing.ts` | `Filing`, `FilingType`, `FilingStatus`, `FilingSetting`, `CreateFilingInput` | Phase 1 |
| `billing.ts` | `BillingEntry`, `Invoice`, `InvoiceItem`, `CreateBillingInput`, `CreateInvoiceInput` | Phase 1 |
| `task.ts` | `Task`, `TaskStatus`, `TaskPriority`, `TaskCategory`, `CreateTaskInput` | Phase 1 |
| `crm.ts` | `Contact`, `ContactType`, `Interaction`, `InteractionChannel`, `CreateContactInput`, `CreateInteractionInput` | Phase 1 |
| `document.ts` | `Document`, `DocumentFolder`, `DocumentSensitivity`, `CreateDocumentInput` | Phase 1 |
| `role.ts` | `Role`, `Permission`, `StaffRoleAssignment`, `PermissionGroup`, `CreateRoleInput`, `UpdateRoleInput`, `StaffRoleRow`, `PERMISSION_GROUPS` | Phase 1, Permissions |
| `audit.ts` | `AuditEntry` | Phase 1 |
| `message.ts` | `Message`, `MessageTemplate`, `ScheduledMessage`, `MessageChannel` | Phase 1 |
| `firm.ts` | `Firm`, `FirmType`, `SubscriptionPlan` | Phase 1 |
| `common.ts` | `PaginatedResult`, `ListOptions` | Phase 1 |

## Utilities (`src/lib/`)

| File | Exports | Created In |
|------|---------|------------|
| `utils.ts` | `cn()` | Scaffold |
| `constants.ts` | `VAT_RATE`, `AGOROT_PER_SHEKEL`, `FILING_TYPES`, `CLIENT_TYPES`, `ROLES`, `TASK_PRIORITIES`, `TASK_CATEGORIES`, `INTERACTION_CHANNELS`, `DOCUMENT_SENSITIVITIES`, `SUBSCRIPTION_PLANS` | Phase 1 |
| `money.ts` | `shekelToAgorot()`, `agorotToShekel()`, `formatMoney()`, `calculateVat()`, `calculateInvoiceTotal()` | Phase 1 |
| `dates.ts` | `formatDate()`, `formatDateTime()`, `daysLeft()`, `addMonths()`, `addDays()`, `isOverdue()` | Phase 1 |
| `filing-utils.ts` | `calculateDueDate()`, `getMonthlyPeriods()`, `getBimonthlyPeriods()`, `generateFilingSchedule()`, `getFilingTypeLabel()`, `taskDueDateForFiling()` | Phase 1 |
| `validation.ts` | `validateTaxId()`, `validatePhone()`, `validateEmail()`, `sanitizeSearchInput()` | Phase 1 |

## Shared Components (`src/components/shared/`)

| File | Exports | Created In |
|------|---------|------------|
| `StatusBadge.tsx` | `StatusBadge` — colored badge for statuses | Phase 1 |
| `PriorityBadge.tsx` | `PriorityBadge` — high/medium/low priority indicator | Phase 1 |
| `EmptyState.tsx` | `EmptyState` — empty list placeholder with icon | Phase 1 |
| `LoadingSpinner.tsx` | `LoadingSpinner` — centered spinner | Phase 1 |
| `ConfirmDialog.tsx` | `ConfirmDialog` — confirm/cancel dialog wrapper | Phase 1 |
| `DataTable.tsx` | `DataTable` — reusable table with header/rows | Phase 1 |
| `PageHeader.tsx` | `PageHeader` — page title + action buttons | Phase 1 |
| `FormField.tsx` | `FormField` — label + input + error wrapper | Phase 1 |
| `SearchInput.tsx` | `SearchInput` — debounced search input | Phase 1 |
| `ThemePicker.tsx` | `ThemePicker` — reusable theme picker (extracted from Sidebar) | Auth |
| `LanguageSelector.tsx` | `LanguageSelector` — reusable language selector (extracted from Sidebar) | Auth |

## Hooks (`src/hooks/`)

| File | Exports | Created In |
|------|---------|------------|
| `useAuth.ts` | `useAuth` — auth lifecycle hook (initialization, session persistence) | Auth |
| `useRoles.ts` | `useRoles`, `useCreateRole`, `useUpdateRole`, `useDeleteRole`, `useStaffRoles`, `useAssignRole`, `useRemoveRole`, `roleKeys` | Permissions |
| `usePermissions.ts` | `useCanAccess` — permission check wrapper hook | Permissions |

## Services (`src/services/`)

| File | Exports | Created In |
|------|---------|------------|
| `authService.ts` | `authService` — Supabase Auth operations + login lockout tracking | Auth |
| `firmService.ts` | `firmService` — firm CRUD, registration, logo upload, plan updates | Auth |
| `roleService.ts` | `roleService` — Supabase CRUD for roles and staff_roles | Permissions |

---

*Last updated: Permissions phase*
