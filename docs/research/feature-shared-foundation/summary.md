# Feature Summary: Shared Foundation (Phase 1)

**Branch:** `migration/shared-foundation`
**Date:** 2026-03-17
**Status:** Complete — all reviews passed

## What Was Implemented

The shared foundation layer for LexDoc: all shared types, utilities, constants, and reusable components that every subsequent module will import from.

### Files Created (32 new)

**Type Definitions (14 files in `src/types/`):**
- `common.ts` — PaginatedResult<T>, ListOptions
- `firm.ts` — Firm, FirmType, SubscriptionPlan
- `user.ts` — User (extracted from useAuthStore)
- `client.ts` — Client, ClientType, CreateClientInput, UpdateClientInput
- `staff.ts` — Staff, StaffRole, CreateStaffInput, UpdateStaffInput
- `filing.ts` — Filing, FilingType (maam/mekadmot/nikuyim/nii), FilingStatus, FilingSetting, CreateFilingInput
- `billing.ts` — BillingEntry, HoursEntry, InvoiceItem, Invoice, CreateBillingInput, CreateInvoiceInput
- `task.ts` — Task, TaskStatus, TaskPriority, TaskCategory, CreateTaskInput
- `crm.ts` — Contact, ContactType, Interaction, InteractionChannel, CreateContactInput, CreateInteractionInput
- `document.ts` — LegalDocument, DocumentSensitivity, DocumentFolder, CreateDocumentInput
- `role.ts` — Role, Permission, PermissionGroup, StaffRoleAssignment, PERMISSION_GROUPS
- `audit.ts` — AuditEntry (with details field for forensic trail)
- `message.ts` — MessageTemplate, Message, ScheduledMessage, MessageChannel
- `index.ts` — barrel re-exports

**Constants & Utilities (5 files in `src/lib/`):**
- `constants.ts` — VAT_RATE, AGOROT_PER_SHEKEL, FILING_TYPES, CLIENT_TYPES, STAFF_ROLES, TASK_PRIORITIES, TASK_CATEGORIES, INTERACTION_CHANNELS, DOCUMENT_SENSITIVITIES, SUBSCRIPTION_PLANS, DEFAULT_FOLDERS, SYSTEM_ROLES
- `money.ts` — shekelToAgorot, agorotToShekel, formatMoney, calculateVat, calculateInvoiceTotal
- `dates.ts` — formatDate, formatDateTime, daysLeft, addMonths, addDays, isOverdue, getToday
- `filing-utils.ts` — calculateDueDate, getMonthlyPeriods, getBimonthlyPeriods, generateFilingSchedule, getFilingTypeLabel, getFilingTypeColor, taskDueDateForFiling, getAutoTaskLabel
- `validation.ts` — validateTaxId, validateCompanyId, validatePhone, validateEmail, sanitizeSearchInput

**Shared Components (10 files in `src/components/shared/`):**
- StatusBadge, PriorityBadge, EmptyState, LoadingSpinner, ConfirmDialog, PageHeader, FormField, SearchInput, DataTable (with @tanstack/react-table), index barrel

### Files Modified (4)
- `src/stores/useAuthStore.ts` — imports User from @/types/user
- `src/i18n/he.ts` — 100+ new Hebrew translation keys
- `src/i18n/ar.ts` — 100+ new Arabic translation keys
- `src/i18n/en.ts` — 100+ new English translation keys

### Dependencies Added
- `@tanstack/react-table` — powers the DataTable component

## Key Decisions
1. Filing codes use Hebrew transliteration: maam, mekadmot, nikuyim, nii
2. All money values stored as integer agorot
3. Separate validateTaxId (personal) and validateCompanyId (company)
4. Constants store i18n keys for localized display (except filing type legal terms)
5. Document type renamed to LegalDocument (avoids DOM shadowing)
6. firm_id excluded from all Create*Input types (security hardening)

## Review Results
- **Code Review:** APPROVED
- **Devil's Advocate:** APPROVED
- **Security Audit:** PASS (0 critical, 0 high)

## Verification
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
- `npm run lint` — PASS (only pre-existing issues)
- i18n key parity — 182 keys across all 3 languages, zero mismatches
