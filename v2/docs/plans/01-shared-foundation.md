# Shared Foundation

Create all shared types, utilities, constants, and reusable components for the LexDoc project. This is the foundation that every module will import from — nothing module-specific, only shared infrastructure.

**Branch:** `migration/shared-foundation`
**Prerequisites:** Scaffold complete, `npm run build` passes

## Context

- This is a migration from a legacy single-file HTML app (see `legacy-app.html` for reference data structures, lines 31-450)
- Hebrew is the primary language. All user-facing strings must use `t()` from `useLanguage()`
- 3 themes (sky/dark/blue) via CSS variables — use semantic classes like `bg-background`, `text-foreground`
- Money is stored as integer agorot (1₪ = 100 agorot). Never use floating-point for money.
- Do NOT create any services, hooks, or page-level components in this phase. Only types, utilities, and shared UI components.

## Types to Create (`src/types/`)

`common.ts`:
- PaginatedResult<T> { data: T[], nextCursor: string|null, hasMore: boolean }
- ListOptions { firmId: string, limit?: number, cursor?: string, search?: string }

`firm.ts`:
- Firm { id, name, type: FirmType, regNum, phone, email, city, logo?: string, plan, planLabel, expiry, defaultFee?: number }
- FirmType = 'lawyer' | 'cpa' | 'combined' | 'notary'
- SubscriptionPlan { id: 'monthly'|'yearly'|'two', label, price: number, months: number }

`client.ts`:
- Client { id, firm_id, name, caseNum, status: 'active'|'archived', type: 'company'|'private', clientType: ClientType, taxId?, mobile?, email?, address?, city?, tags: string[], monthlyFee?: number, billingDay?: number, assignedStaffId?, notes?, deleted_at?, created_at, updated_at }
- ClientType = 'self_employed' | 'company' | 'economic' | 'private'
- CreateClientInput, UpdateClientInput

`staff.ts`:
- Staff { id, firm_id, user_id?, name, role: StaffRole, isActive, deleted_at?, created_at, updated_at }
- StaffRole = 'partner' | 'attorney' | 'junior_attorney' | 'accountant' | 'consultant' | 'secretary' | 'manager' | 'student'
- CreateStaffInput, UpdateStaffInput

`filing.ts`:
- Filing { id, firm_id, client_id, type: FilingType, period, due, status: FilingStatus, filedDate?, note?, deleted_at?, created_at, updated_at }
- FilingType = 'vat' | 'taxAdv' | 'taxDeduct' | 'niiDeduct'
- FilingStatus = 'pending' | 'filed' | 'late'
- FilingSetting { clientId: string, vatFreq: 'monthly'|'bimonthly', taxAdvEnabled: boolean, taxAdvFreq: 'monthly'|'bimonthly', taxDeductEnabled: boolean, taxDeductFreq: 'monthly'|'bimonthly', niiDeductEnabled: boolean, niiDeductFreq: 'monthly'|'bimonthly' }
- CreateFilingInput

`billing.ts`:
- BillingEntry { id, firm_id, client_id, type: 'charge'|'credit', amount: number (agorot), date, notes?, invoice_id?, deleted_at?, created_at, updated_at }
- HoursEntry { id, firm_id, client_id, staffId, staffName, hours: number, date, note?, created_at }
- Invoice { id, firm_id, client_id, invoiceNum, date, items: InvoiceItem[], subtotal: number, vatAmount: number, total: number, sent: boolean, paid: boolean, paidDate?, created_at }
- InvoiceItem { desc, qty: number, unit: number, total: number, note?: string }
- CreateBillingInput, CreateInvoiceInput

`task.ts`:
- Task { id, firm_id, client_id?, filing_id?, seq: number, title, desc?, dueDate?, priority: TaskPriority, status: TaskStatus, assignedTo?: string, category: TaskCategory, isAuto: boolean, filingType?, filingDue?, period?, doneAt?, deleted_at?, created_at, updated_at }
- TaskStatus = 'open' | 'done' | 'cancelled'
- TaskPriority = 'high' | 'medium' | 'low'
- TaskCategory = 'client' | 'taxAuth' | 'nii' | 'internal'
- CreateTaskInput

`crm.ts`:
- Contact { id, firm_id, client_id?, type: ContactType, name, role?, phone?, email?, notes?, deleted_at?, created_at, updated_at }
- ContactType = 'client' | 'taxAuth' | 'nii' | 'other'
- Interaction { id, firm_id, client_id?, contact_id, date, channel: InteractionChannel, subject, notes?, authorityType?, staffId?, outcome?, deleted_at?, created_at, updated_at }
- InteractionChannel = 'call' | 'email' | 'meeting' | 'letter' | 'portal'
- CreateContactInput, CreateInteractionInput

`document.ts`:
- Document { id, firm_id, client_id?, name, folder, size: string, date, ver: number, sensitivity: DocumentSensitivity, imported: boolean, deleted_at?, created_at, updated_at }
- DocumentSensitivity = 'internal' | 'confidential' | 'restricted' | 'public'
- DocumentFolder { name: string, docCount: number }
- CreateDocumentInput

`role.ts`:
- Role { id, firm_id, name, desc?, color: string, locked: boolean, permissions: string[], deleted_at?, created_at, updated_at }
- Permission { id: string, label: string, group: string }
- StaffRoleAssignment { staffId: string, roleId: string }
- PERMISSION_GROUPS constant with all permissions grouped

`audit.ts`:
- AuditEntry { id, firm_id, userId, userName, action, target?, timestamp, entityType?, entityId? }

`message.ts`:
- MessageTemplate { id, topic, topicLabel, subject, body, channel: MessageChannel, color: string, icon: string }
- Message { id, firm_id, client_id, clientName, templateId?, topic, channel: MessageChannel, subject, body, sentAt, status: 'sent'|'failed'|'pending', sentBy, toEmail?, toPhone? }
- ScheduledMessage { id, firm_id, client_id, templateId, sendDate, extraVars?: Record<string,string>, status: 'pending'|'sent'|'failed' }
- MessageChannel = 'email' | 'sms' | 'whatsapp'

`index.ts` — barrel exports for all types

## Constants to Create (`src/lib/constants.ts`)

- VAT_RATE = 0.18
- AGOROT_PER_SHEKEL = 100
- MAX_ACTIVE_USERS_PER_CLIENT = 5
- AUTO_TASK_LEAD_DAYS = 10
- AUTO_TASK_WINDOW_DAYS = 30
- FILING_TYPES with labels: { vat: 'דוח מע"מ', taxAdv: 'מקדמות מס הכנסה', taxDeduct: 'ניכויים מס הכנסה', niiDeduct: 'ניכויים ביטוח לאומי' }
- FILING_TYPE_COLORS: { vat: 'blue', taxAdv: 'amber', taxDeduct: 'green', niiDeduct: 'red' }
- CLIENT_TYPES with labels
- STAFF_ROLES with Hebrew labels
- TASK_PRIORITIES, TASK_CATEGORIES, INTERACTION_CHANNELS, DOCUMENT_SENSITIVITIES
- SUBSCRIPTION_PLANS array (monthly/yearly/two-year)
- DEFAULT_FOLDERS = ['חוזים', 'פיננסים', 'התכתבויות']
- SYSTEM_ROLES (admin, editor, viewer, manager) with descriptions and colors

## Utility Functions to Create

`src/lib/money.ts`:
- shekelToAgorot(shekels: number): number — Math.round(shekels * 100)
- agorotToShekel(agorot: number): number — agorot / 100
- formatMoney(agorot: number): string — format as "₪ 1,234" using Intl.NumberFormat('he-IL')
- calculateVat(amountAgorot: number): number — Math.round(amount * VAT_RATE)
- calculateInvoiceTotal(amountAgorot: number): { subtotal, vatAmount, total }

`src/lib/dates.ts`:
- formatDate(iso: string): string — format as DD/MM/YYYY using he-IL locale
- formatDateTime(iso: string): string — format as DD/MM/YYYY HH:MM
- daysLeft(expiry: string): number — days until expiry
- addMonths(date: Date, n: number): Date
- addDays(date: Date, n: number): Date
- isOverdue(dueDate: string): boolean — is due date in the past?
- getToday(): string — ISO date string for today

`src/lib/filing-utils.ts`:
- calculateDueDate(periodEnd: string): string — 15th of month after period
- getMonthlyPeriods(year: number): { start, end }[]
- getBimonthlyPeriods(year: number): { start, end }[]
- generateFilingSchedule(settings: FilingSetting, year: number): Partial<Filing>[]
- getFilingTypeLabel(type: FilingType): string
- getFilingTypeColor(type: FilingType): string
- taskDueDateForFiling(filingDueDate: string): string — 10 days before
- getAutoTaskLabel(type: FilingType): string

`src/lib/validation.ts`:
- validateTaxId(id: string): boolean
- validatePhone(phone: string): boolean
- validateEmail(email: string): boolean
- sanitizeSearchInput(search: string): string — escape PostgREST special chars

## Shared Components to Create (`src/components/shared/`)

`StatusBadge.tsx` — Takes variant ('filed'|'pending'|'late'|'active'|'archived'|'sent'|'paid'|'open'|'done'|'cancelled') and renders colored badge using the Badge shadcn component. Colors: filed/active/sent/paid/done=green, pending/open=amber, late/cancelled=red, archived=gray.

`PriorityBadge.tsx` — Takes priority ('high'|'medium'|'low'). Colors: high=red, medium=amber, low=blue.

`EmptyState.tsx` — Takes icon (LucideIcon), title (string), description? (string). Renders centered empty state with large muted icon and text.

`LoadingSpinner.tsx` — Centered animated spinner using CSS animation.

`ConfirmDialog.tsx` — Wraps shadcn Dialog. Props: open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, variant ('default'|'destructive'). Uses t() for default labels.

`DataTable.tsx` — Generic table component. Props: columns: { key, header: string, render?: (row) => ReactNode }[], data: T[], onRowClick?: (row) => void, emptyMessage?: string.

`PageHeader.tsx` — Props: title, description?, children (action buttons slot). Renders h1 + optional description + right-aligned actions.

`FormField.tsx` — Props: label, error?, required?, hint?, children (input slot). Wraps any input with label and error display.

`SearchInput.tsx` — Props: value, onChange, placeholder?, debounceMs? (default 300). Renders Input with search icon and debounced onChange.

`index.ts` — barrel exports for all shared components.

## Component Rules

All components MUST:
- Use `useLanguage()` for any user-facing strings
- Use semantic Tailwind classes (bg-background, text-foreground, etc.)
- Support RTL via `dir={direction}`
- Include timestamp headers
- Define props interfaces
