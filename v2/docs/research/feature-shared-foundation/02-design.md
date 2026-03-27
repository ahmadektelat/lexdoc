# Technical Design: Shared Foundation (Phase 1)

**Date:** 2026-03-17
**Status:** Draft
**Branch:** `migration/shared-foundation`

---

## Architecture Approach

Build the shared foundation as a layered dependency graph: **types** (no deps) -> **constants** (imports types) -> **utilities** (imports types + constants) -> **shared components** (imports all of the above + shadcn/ui primitives). Each layer only depends on layers below it.

**Why this approach over alternatives:**
- A flat structure with no layering would create circular dependency risks as the project grows.
- Types having zero internal dependencies means they can be imported anywhere without risk.
- Constants referencing type unions (e.g., `FilingType`) ensures type safety on label maps.
- Utilities importing constants (e.g., `VAT_RATE`) avoids magic numbers and keeps a single source of truth.
- Components at the top layer can compose everything below.

**Key decisions from requirements:**
1. Both `type` and `clientType` fields on Client (user decision #1)
2. All money functions accept/return agorot only (user decision #2)
3. Subscription plan prices stored as agorot integers (user decision #3)
4. DataTable built on `@tanstack/react-table` (user decision #4)
5. User type extracted to `src/types/user.ts` (user decision #5)

---

## File-by-File Change Plan

### Implementation Order

The files must be created in this dependency order. Files within the same group have no inter-dependencies and can be created in parallel.

**Group 1 — Types (no internal dependencies):**
1. `src/types/common.ts`
2. `src/types/firm.ts`
3. `src/types/user.ts`
4. `src/types/client.ts`
5. `src/types/staff.ts`
6. `src/types/filing.ts`
7. `src/types/billing.ts`
8. `src/types/task.ts`
9. `src/types/crm.ts`
10. `src/types/document.ts`
11. `src/types/role.ts`
12. `src/types/audit.ts`
13. `src/types/message.ts`
14. `src/types/index.ts` (barrel — depends on all above)

**Group 2 — Constants (depends on types):**
15. `src/lib/constants.ts`

**Group 3 — Utilities (depends on types + constants):**
16. `src/lib/money.ts`
17. `src/lib/dates.ts`
18. `src/lib/filing-utils.ts`
19. `src/lib/validation.ts`

**Group 4 — i18n additions (no code deps, but needed before components):**
20. `src/i18n/he.ts` (modify)
21. `src/i18n/ar.ts` (modify)
22. `src/i18n/en.ts` (modify)

**Group 5 — Shared Components (depends on everything above):**
23. `src/components/shared/StatusBadge.tsx`
24. `src/components/shared/PriorityBadge.tsx`
25. `src/components/shared/EmptyState.tsx`
26. `src/components/shared/LoadingSpinner.tsx`
27. `src/components/shared/ConfirmDialog.tsx`
28. `src/components/shared/PageHeader.tsx`
29. `src/components/shared/FormField.tsx`
30. `src/components/shared/SearchInput.tsx`
31. `src/components/shared/DataTable.tsx` (depends on `@tanstack/react-table` being installed)
32. `src/components/shared/index.ts` (barrel)

**Group 6 — Modifications to existing files:**
33. `src/stores/useAuthStore.ts` (modify — import User from types)
34. `package.json` (add `@tanstack/react-table`)

---

## Group 1: Type Definitions (`src/types/`)

### `src/types/common.ts`
- **Action:** Create
- **Rationale:** Generic pagination and list-query types used by every service/hook in later phases.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListOptions {
  firmId: string;
  limit?: number;
  cursor?: string;
  search?: string;
}
```

### `src/types/firm.ts`
- **Action:** Create
- **Rationale:** Firm entity is the root tenant. Every entity references `firm_id`.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export type FirmType = 'lawyer' | 'cpa' | 'combined' | 'notary';

export interface Firm {
  id: string;
  name: string;
  type: FirmType;
  regNum: string;
  phone: string;
  email: string;
  city: string;
  logo?: string;
  plan: string;
  planLabel: string;
  expiry: string;
  defaultFee?: number; // agorot
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: 'monthly' | 'yearly' | 'two';
  label: string;
  price: number; // agorot
  months: number;
}
```

**Design notes:**
- `defaultFee` is in agorot, consistent with system-wide convention.
- `expiry` is ISO date string.
- `plan` stores the plan ID string; `planLabel` is the display name (populated at query time or from constants).
- `created_at` and `updated_at` added per Supabase convention (not in original plan but needed for DB consistency).

### `src/types/user.ts`
- **Action:** Create
- **Rationale:** User decision #5 — extract from `useAuthStore.ts` so it can be imported by audit entries, staff assignments, etc.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export interface User {
  id: string;
  email: string;
  name: string;
}
```

**Design notes:**
- Intentionally minimal. This represents the authenticated user identity, not a full profile.
- Additional profile fields (avatar, phone, preferences) can be added in later phases.
- The `useAuthStore.ts` will import this type instead of defining its own local interface.

### `src/types/client.ts`
- **Action:** Create
- **Rationale:** Core business entity. Both `type` and `clientType` kept per user decision #1.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export type ClientType = 'self_employed' | 'company' | 'economic' | 'private';

export interface Client {
  id: string;
  firm_id: string;
  name: string;
  caseNum: string;
  status: 'active' | 'archived';
  type: 'company' | 'private';       // high-level UI grouping
  clientType: ClientType;             // specific Israeli tax registration type
  taxId?: string;
  mobile?: string;
  email?: string;
  address?: string;
  city?: string;
  tags: string[];
  monthlyFee?: number;               // agorot
  billingDay?: number;
  assignedStaffId?: string;
  notes?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type CreateClientInput = Omit<Client, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type UpdateClientInput = Partial<Omit<Client, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;
```

**Design notes:**
- `type` is a coarse grouping ('company' | 'private') for dashboard widgets and quick filters.
- `clientType` is the precise Israeli tax classification used in filing logic.
- `CreateClientInput` omits server-generated fields (id, timestamps, soft-delete).
- `UpdateClientInput` is `Partial` because any subset of fields can be updated, but excludes immutable fields (id, firm_id, created_at).
- `monthlyFee` in agorot.

### `src/types/staff.ts`
- **Action:** Create
- **Rationale:** Staff/employee entity for the firm.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export type StaffRole = 'partner' | 'attorney' | 'junior_attorney' | 'accountant' | 'consultant' | 'secretary' | 'manager' | 'student';

export interface Staff {
  id: string;
  firm_id: string;
  user_id?: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type CreateStaffInput = Omit<Staff, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type UpdateStaffInput = Partial<Omit<Staff, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;
```

**Design notes:**
- `user_id` is optional because a staff record can exist before the person has a user account (invited but not yet registered).
- `isActive` is a boolean rather than using soft-delete for staff, because deactivated staff members should still appear in historical data (e.g., hours entries) but should not be assignable.

### `src/types/filing.ts`
- **Action:** Create
- **Rationale:** Core filing tracker types — VAT, tax advances, deductions.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export type FilingType = 'vat' | 'taxAdv' | 'taxDeduct' | 'niiDeduct';

export type FilingStatus = 'pending' | 'filed' | 'late';

export interface Filing {
  id: string;
  firm_id: string;
  client_id: string;
  type: FilingType;
  period: string;         // e.g., "2026-01" or "2026-01/2026-02" for bimonthly
  due: string;            // ISO date — filing deadline
  status: FilingStatus;
  filedDate?: string;     // ISO date — when actually filed
  note?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FilingSetting {
  clientId: string;
  vatFreq: 'monthly' | 'bimonthly';
  taxAdvEnabled: boolean;
  taxAdvFreq: 'monthly' | 'bimonthly';
  taxDeductEnabled: boolean;
  taxDeductFreq: 'monthly' | 'bimonthly';
  niiDeductEnabled: boolean;
  niiDeductFreq: 'monthly' | 'bimonthly';
}

export type CreateFilingInput = Omit<Filing, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;
```

**Design notes:**
- `period` uses ISO month format "YYYY-MM" for monthly, "YYYY-MM/YYYY-MM" for bimonthly periods. This is a string, not a Date, because it represents a range/period not a point in time.
- `due` is the 15th of the month following the period end (calculated by `filing-utils.ts`).
- `FilingSetting` is per-client configuration for what filings to auto-generate. It is not a database table yet — it will be stored as part of the client record or a related table in a later phase.

### `src/types/billing.ts`
- **Action:** Create
- **Rationale:** All billing, invoicing, and hours tracking types. All money in agorot.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export interface BillingEntry {
  id: string;
  firm_id: string;
  client_id: string;
  type: 'charge' | 'credit';
  amount: number;         // agorot
  date: string;           // ISO date
  notes?: string;
  invoice_id?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface HoursEntry {
  id: string;
  firm_id: string;
  client_id: string;
  staffId: string;
  staffName: string;
  hours: number;
  date: string;           // ISO date
  note?: string;
  created_at: string;
}

export interface InvoiceItem {
  desc: string;
  qty: number;
  unit: number;           // agorot — unit price
  total: number;          // agorot — qty * unit
  note?: string;
}

export interface Invoice {
  id: string;
  firm_id: string;
  client_id: string;
  invoiceNum: string;
  date: string;           // ISO date
  items: InvoiceItem[];
  subtotal: number;       // agorot
  vatAmount: number;      // agorot
  total: number;          // agorot
  sent: boolean;
  paid: boolean;
  paidDate?: string;      // ISO date
  created_at: string;
}

export type CreateBillingInput = Omit<BillingEntry, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type CreateInvoiceInput = Omit<Invoice, 'id' | 'created_at'>;
```

**Design notes:**
- `HoursEntry` has no `updated_at` — hours logged are immutable (delete and re-create to correct).
- `staffName` is denormalized on `HoursEntry` for display performance without joins.
- `InvoiceItem` is embedded in `Invoice.items` as a JSONB array in the database.
- Every monetary field is annotated `// agorot` for clarity.

### `src/types/task.ts`
- **Action:** Create
- **Rationale:** Task management types, including auto-generated filing tasks.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export type TaskStatus = 'open' | 'done' | 'cancelled';

export type TaskPriority = 'high' | 'medium' | 'low';

export type TaskCategory = 'client' | 'taxAuth' | 'nii' | 'internal';

export interface Task {
  id: string;
  firm_id: string;
  client_id?: string;
  filing_id?: string;
  seq: number;
  title: string;
  desc?: string;
  dueDate?: string;       // ISO date
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: string;    // staff ID
  category: TaskCategory;
  isAuto: boolean;
  filingType?: FilingType;
  filingDue?: string;     // ISO date — the filing's due date (for auto-tasks)
  period?: string;        // filing period (for auto-tasks)
  doneAt?: string;        // ISO datetime
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type CreateTaskInput = Omit<Task, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;
```

**Design notes:**
- `Task` imports `FilingType` from `./filing` — this is the one cross-type dependency.
- `seq` is a monotonically increasing task number within the firm, used for display (e.g., "Task #42").
- `isAuto` distinguishes auto-generated filing tasks from manually created tasks.
- `filingType`, `filingDue`, `period` are only populated for auto-tasks (linked to a filing).

**Important:** The `task.ts` file must import `FilingType` from `./filing`. This is intentional and does not create a circular dependency since `filing.ts` does not import from `task.ts`.

### `src/types/crm.ts`
- **Action:** Create
- **Rationale:** CRM contacts and interaction tracking.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export type ContactType = 'client' | 'taxAuth' | 'nii' | 'other';

export type InteractionChannel = 'call' | 'email' | 'meeting' | 'letter' | 'portal';

export interface Contact {
  id: string;
  firm_id: string;
  client_id?: string;
  type: ContactType;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  firm_id: string;
  client_id?: string;
  contact_id: string;
  date: string;           // ISO date
  channel: InteractionChannel;
  subject: string;
  notes?: string;
  authorityType?: string;
  staffId?: string;
  outcome?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type CreateContactInput = Omit<Contact, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type CreateInteractionInput = Omit<Interaction, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;
```

### `src/types/document.ts`
- **Action:** Create
- **Rationale:** Document management and folder structure types.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export type DocumentSensitivity = 'internal' | 'confidential' | 'restricted' | 'public';

export interface Document {
  id: string;
  firm_id: string;
  client_id?: string;
  name: string;
  folder: string;
  size: string;
  date: string;           // ISO date
  ver: number;
  sensitivity: DocumentSensitivity;
  imported: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentFolder {
  name: string;
  docCount: number;
}

export type CreateDocumentInput = Omit<Document, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;
```

### `src/types/role.ts`
- **Action:** Create
- **Rationale:** RBAC role definitions and permission grouping.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export interface Role {
  id: string;
  firm_id: string;
  name: string;
  desc?: string;
  color: string;
  locked: boolean;
  permissions: string[];
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  label: string;
  group: string;
}

export interface StaffRoleAssignment {
  staffId: string;
  roleId: string;
}

export interface PermissionGroup {
  group: string;
  permissions: Permission[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'clients',
    permissions: [
      { id: 'clients.view', label: 'צפייה בלקוחות', group: 'clients' },
      { id: 'clients.create', label: 'הוספת לקוח', group: 'clients' },
      { id: 'clients.edit', label: 'עריכת לקוח', group: 'clients' },
      { id: 'clients.delete', label: 'מחיקת לקוח', group: 'clients' },
    ],
  },
  {
    group: 'filings',
    permissions: [
      { id: 'filings.view', label: 'צפייה בדיווחים', group: 'filings' },
      { id: 'filings.create', label: 'הוספת דיווח', group: 'filings' },
      { id: 'filings.edit', label: 'עריכת דיווח', group: 'filings' },
      { id: 'filings.delete', label: 'מחיקת דיווח', group: 'filings' },
    ],
  },
  {
    group: 'billing',
    permissions: [
      { id: 'billing.view', label: 'צפייה בחיובים', group: 'billing' },
      { id: 'billing.create', label: 'הוספת חיוב', group: 'billing' },
      { id: 'billing.edit', label: 'עריכת חיוב', group: 'billing' },
      { id: 'billing.delete', label: 'מחיקת חיוב', group: 'billing' },
      { id: 'billing.invoices', label: 'ניהול חשבוניות', group: 'billing' },
    ],
  },
  {
    group: 'staff',
    permissions: [
      { id: 'staff.view', label: 'צפייה בצוות', group: 'staff' },
      { id: 'staff.manage', label: 'ניהול צוות', group: 'staff' },
    ],
  },
  {
    group: 'crm',
    permissions: [
      { id: 'crm.view', label: 'צפייה באנשי קשר', group: 'crm' },
      { id: 'crm.manage', label: 'ניהול אנשי קשר', group: 'crm' },
    ],
  },
  {
    group: 'documents',
    permissions: [
      { id: 'documents.view', label: 'צפייה במסמכים', group: 'documents' },
      { id: 'documents.upload', label: 'העלאת מסמכים', group: 'documents' },
      { id: 'documents.delete', label: 'מחיקת מסמכים', group: 'documents' },
    ],
  },
  {
    group: 'reports',
    permissions: [
      { id: 'reports.view', label: 'צפייה בדוחות', group: 'reports' },
      { id: 'reports.export', label: 'ייצוא דוחות', group: 'reports' },
    ],
  },
  {
    group: 'messaging',
    permissions: [
      { id: 'messaging.view', label: 'צפייה בהודעות', group: 'messaging' },
      { id: 'messaging.send', label: 'שליחת הודעות', group: 'messaging' },
    ],
  },
  {
    group: 'settings',
    permissions: [
      { id: 'settings.roles', label: 'ניהול הרשאות', group: 'settings' },
      { id: 'settings.firm', label: 'הגדרות משרד', group: 'settings' },
      { id: 'settings.audit', label: 'צפייה ביומן פעילות', group: 'settings' },
      { id: 'settings.backup', label: 'גיבוי ושחזור', group: 'settings' },
    ],
  },
];
```

**Design notes:**
- `PERMISSION_GROUPS` is a constant exported from the type file because it is tightly coupled to the `Permission` and `PermissionGroup` types. It defines the canonical list of all permissions in the system.
- Permission IDs use dot notation (`module.action`) matching the `useAuthStore.can()` pattern.
- Labels are in Hebrew because they are domain constants (like filing type labels). Components will use these labels directly since they are static domain terms. If i18n is needed for permission labels in the future, they can be refactored to use translation keys.
- `locked` on `Role` means the role is system-defined and cannot be deleted (e.g., "Admin", "Viewer").

### `src/types/audit.ts`
- **Action:** Create
- **Rationale:** Audit log entry type for the immutable audit trail.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export interface AuditEntry {
  id: string;
  firm_id: string;
  userId: string;
  userName: string;
  action: string;
  target?: string;
  timestamp: string;      // ISO datetime
  entityType?: string;
  entityId?: string;
}
```

**Design notes:**
- No `deleted_at` or `updated_at` — audit entries are immutable. The database will enforce `DELETE USING (false)`.
- `userName` is denormalized for display without joins.
- `action` is a free-form string (e.g., "client.created", "filing.updated"). A union type is not used here because new actions will be added as modules are built.
- `entityType` + `entityId` enable linking the audit entry back to the affected record.

### `src/types/message.ts`
- **Action:** Create
- **Rationale:** Messaging system types — templates, sent messages, scheduled messages.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export type MessageChannel = 'email' | 'sms' | 'whatsapp';

export interface MessageTemplate {
  id: string;
  topic: string;
  topicLabel: string;
  subject: string;
  body: string;
  channel: MessageChannel;
  color: string;
  icon: string;
}

export interface Message {
  id: string;
  firm_id: string;
  client_id: string;
  clientName: string;
  templateId?: string;
  topic: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  sentAt: string;         // ISO datetime
  status: 'sent' | 'failed' | 'pending';
  sentBy: string;
  toEmail?: string;
  toPhone?: string;
}

export interface ScheduledMessage {
  id: string;
  firm_id: string;
  client_id: string;
  templateId: string;
  sendDate: string;       // ISO date
  extraVars?: Record<string, string>;
  status: 'pending' | 'sent' | 'failed';
}
```

**Design notes:**
- `MessageTemplate` has no `firm_id` because templates are system-wide (shared across all firms). If firm-specific templates are needed later, `firm_id` can be added.
- `clientName` is denormalized on `Message` for display.
- `extraVars` on `ScheduledMessage` allows template variable substitution at send time.

### `src/types/index.ts`
- **Action:** Create
- **Rationale:** Barrel re-exports so consumers can do `import { Client, Filing } from '@/types'`.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)
// Barrel exports for all shared types

export * from './common';
export * from './firm';
export * from './user';
export * from './client';
export * from './staff';
export * from './filing';
export * from './billing';
export * from './task';
export * from './crm';
export * from './document';
export * from './role';
export * from './audit';
export * from './message';
```

**Design notes:**
- Uses `export *` for simplicity. Since each type file has distinct export names, there are no naming collisions.
- Consumers can import from `@/types` for convenience or from specific files like `@/types/client` for explicit dependency tracking.

---

## Group 2: Constants (`src/lib/constants.ts`)

### `src/lib/constants.ts`
- **Action:** Create
- **Rationale:** Single source of truth for all domain constants. Hebrew labels for domain terms. All prices in agorot.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

import type { FilingType, ClientType, StaffRole, TaskPriority, TaskCategory, InteractionChannel, DocumentSensitivity } from '@/types';

// Financial constants
export const VAT_RATE = 0.18;
export const AGOROT_PER_SHEKEL = 100;

// Business rule constants
export const MAX_ACTIVE_USERS_PER_CLIENT = 5;
export const AUTO_TASK_LEAD_DAYS = 10;
export const AUTO_TASK_WINDOW_DAYS = 30;

// Filing types with Hebrew labels
export const FILING_TYPES: Record<FilingType, string> = {
  vat: 'דוח מע"מ',
  taxAdv: 'מקדמות מס הכנסה',
  taxDeduct: 'ניכויים מס הכנסה',
  niiDeduct: 'ניכויים ביטוח לאומי',
};

// Filing type badge colors (Tailwind color names, not full classes)
export const FILING_TYPE_COLORS: Record<FilingType, string> = {
  vat: 'blue',
  taxAdv: 'amber',
  taxDeduct: 'green',
  niiDeduct: 'red',
};

// Client types with Hebrew labels
export const CLIENT_TYPES: Record<ClientType, string> = {
  self_employed: 'עוסק מורשה',
  company: 'חברה',
  economic: 'עוסק פטור',
  private: 'פרטי',
};

// Staff roles with Hebrew labels
export const STAFF_ROLES: Record<StaffRole, string> = {
  partner: 'שותף',
  attorney: 'עורך דין',
  junior_attorney: 'עורך דין מתמחה',
  accountant: 'רואה חשבון',
  consultant: 'יועץ',
  secretary: 'מזכיר/ה',
  manager: 'מנהל/ת',
  student: 'סטודנט/ית',
};

// Task priorities with Hebrew labels
export const TASK_PRIORITIES: Record<TaskPriority, string> = {
  high: 'גבוהה',
  medium: 'בינונית',
  low: 'נמוכה',
};

// Task categories with Hebrew labels
export const TASK_CATEGORIES: Record<TaskCategory, string> = {
  client: 'לקוח',
  taxAuth: 'רשות המסים',
  nii: 'ביטוח לאומי',
  internal: 'פנימי',
};

// Interaction channels with Hebrew labels
export const INTERACTION_CHANNELS: Record<InteractionChannel, string> = {
  call: 'שיחה',
  email: 'דוא"ל',
  meeting: 'פגישה',
  letter: 'מכתב',
  portal: 'פורטל',
};

// Document sensitivity levels with Hebrew labels
export const DOCUMENT_SENSITIVITIES: Record<DocumentSensitivity, string> = {
  internal: 'פנימי',
  confidential: 'חסוי',
  restricted: 'מוגבל',
  public: 'ציבורי',
};

// Subscription plans — prices in agorot (user decision #3)
export const SUBSCRIPTION_PLANS = [
  { id: 'monthly' as const, label: 'חודשי', price: 29900, months: 1 },
  { id: 'yearly' as const, label: 'שנתי', price: 249000, months: 12 },
  { id: 'two' as const, label: 'דו-שנתי', price: 399000, months: 24 },
];

// Default document folders (Hebrew)
export const DEFAULT_FOLDERS = ['חוזים', 'פיננסים', 'התכתבויות'];

// System roles for RBAC
export const SYSTEM_ROLES = [
  { id: 'admin', label: 'מנהל מערכת', desc: 'גישה מלאה לכל המערכת', color: 'red' },
  { id: 'editor', label: 'עורך', desc: 'עריכה וצפייה בכל המודולים', color: 'blue' },
  { id: 'viewer', label: 'צופה', desc: 'צפייה בלבד', color: 'gray' },
  { id: 'manager', label: 'מנהל', desc: 'ניהול צוות ולקוחות', color: 'green' },
];
```

**Design notes:**
- All `Record<UnionType, string>` maps are typed against the imported union types, so adding a new union member in the type file will cause a TypeScript error here until the map is updated. This is intentional — it prevents stale label maps.
- `SUBSCRIPTION_PLANS` uses `as const` on the `id` field to preserve the literal type for type inference downstream.
- Hebrew labels are domain constants, not UI strings. They represent canonical Israeli legal/tax terms. The i18n system (`t()`) is used for UI chrome (buttons, headings), but domain terms are static.

---

## Group 3: Utility Functions

### `src/lib/money.ts`
- **Action:** Create
- **Rationale:** Centralized money formatting and VAT calculation. All values in agorot per user decision #2.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

import { VAT_RATE, AGOROT_PER_SHEKEL } from './constants';

/** Convert shekels to agorot (integer). */
export function shekelToAgorot(shekels: number): number {
  return Math.round(shekels * AGOROT_PER_SHEKEL);
}

/** Convert agorot to shekels (decimal). */
export function agorotToShekel(agorot: number): number {
  return agorot / AGOROT_PER_SHEKEL;
}

/** Format agorot as display string "₪ 1,234.00" using he-IL locale. */
export function formatMoney(agorot: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(agorotToShekel(agorot));
}

/** Calculate VAT on an amount in agorot. Returns agorot (integer). */
export function calculateVat(amountAgorot: number): number {
  return Math.round(amountAgorot * VAT_RATE);
}

/** Calculate invoice totals from a pre-VAT subtotal in agorot. */
export function calculateInvoiceTotal(subtotalAgorot: number): {
  subtotal: number;
  vatAmount: number;
  total: number;
} {
  const vatAmount = calculateVat(subtotalAgorot);
  return {
    subtotal: subtotalAgorot,
    vatAmount,
    total: subtotalAgorot + vatAmount,
  };
}
```

**Design notes:**
- `formatMoney` uses `Intl.NumberFormat` with `he-IL` locale. This formats as "₪ 1,234.00" regardless of the user's browser locale, ensuring consistent display.
- `Math.round` on `shekelToAgorot` and `calculateVat` prevents floating-point drift.
- No error handling for negative values — negative amounts are valid (credits, refunds).

### `src/lib/dates.ts`
- **Action:** Create
- **Rationale:** Date formatting and comparison utilities. Uses `date-fns` (already installed).

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

import { format, differenceInDays, addMonths as dfnsAddMonths, addDays as dfnsAddDays, parseISO, isBefore, startOfDay } from 'date-fns';

/** Format ISO date string as DD/MM/YYYY. */
export function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy');
}

/** Format ISO datetime string as DD/MM/YYYY HH:MM. */
export function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy HH:mm');
}

/** Days remaining until an expiry date. Negative if expired. */
export function daysLeft(expiry: string): number {
  return differenceInDays(parseISO(expiry), startOfDay(new Date()));
}

/** Add n months to a date. */
export function addMonths(date: Date, n: number): Date {
  return dfnsAddMonths(date, n);
}

/** Add n days to a date. */
export function addDays(date: Date, n: number): Date {
  return dfnsAddDays(date, n);
}

/** Check if a due date (ISO string) is in the past. */
export function isOverdue(dueDate: string): boolean {
  return isBefore(parseISO(dueDate), startOfDay(new Date()));
}

/** Get today's date as ISO date string (YYYY-MM-DD). */
export function getToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
```

**Design notes:**
- Uses `parseISO` from date-fns for consistent parsing (avoids `new Date(string)` browser inconsistencies).
- `daysLeft` uses `startOfDay` to normalize the comparison to whole days.
- `formatDate` outputs DD/MM/YYYY (Israeli convention), not MM/DD/YYYY.
- Does NOT use date-fns locale objects — the format patterns are explicit and locale-independent.

### `src/lib/filing-utils.ts`
- **Action:** Create
- **Rationale:** Filing schedule generation and deadline calculation — core business logic.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

import { format, parseISO, addMonths, subDays } from 'date-fns';
import type { Filing, FilingType, FilingSetting } from '@/types';
import { FILING_TYPES, FILING_TYPE_COLORS, AUTO_TASK_LEAD_DAYS } from './constants';

/**
 * Calculate filing due date: 15th of the month after the period end.
 * @param periodEnd - ISO date string (last day of the period, e.g., "2026-01-31")
 * @returns ISO date string for the due date
 */
export function calculateDueDate(periodEnd: string): string {
  const endDate = parseISO(periodEnd);
  const nextMonth = addMonths(endDate, 1);
  return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 15), 'yyyy-MM-dd');
}

/** Generate all 12 monthly periods for a given year. */
export function getMonthlyPeriods(year: number): { start: string; end: string }[] {
  const periods: { start: string; end: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0); // last day of month
    periods.push({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  }
  return periods;
}

/** Generate all 6 bimonthly periods for a given year. */
export function getBimonthlyPeriods(year: number): { start: string; end: string }[] {
  const periods: { start: string; end: string }[] = [];
  for (let m = 0; m < 12; m += 2) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 2, 0); // last day of second month
    periods.push({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  }
  return periods;
}

/**
 * Generate a full year of filing records for a client based on their settings.
 * Returns partial Filing objects (without id, firm_id, timestamps).
 */
export function generateFilingSchedule(
  settings: FilingSetting,
  year: number
): Partial<Filing>[] {
  const filings: Partial<Filing>[] = [];

  const addFilings = (type: FilingType, freq: 'monthly' | 'bimonthly') => {
    const periods = freq === 'monthly' ? getMonthlyPeriods(year) : getBimonthlyPeriods(year);
    for (const p of periods) {
      filings.push({
        client_id: settings.clientId,
        type,
        period: freq === 'monthly'
          ? format(parseISO(p.start), 'yyyy-MM')
          : `${format(parseISO(p.start), 'yyyy-MM')}/${format(parseISO(p.end), 'yyyy-MM')}`,
        due: calculateDueDate(p.end),
        status: 'pending',
      });
    }
  };

  // VAT is always enabled for clients that have filing settings
  addFilings('vat', settings.vatFreq);

  if (settings.taxAdvEnabled) {
    addFilings('taxAdv', settings.taxAdvFreq);
  }
  if (settings.taxDeductEnabled) {
    addFilings('taxDeduct', settings.taxDeductFreq);
  }
  if (settings.niiDeductEnabled) {
    addFilings('niiDeduct', settings.niiDeductFreq);
  }

  return filings;
}

/** Get the Hebrew label for a filing type. */
export function getFilingTypeLabel(type: FilingType): string {
  return FILING_TYPES[type];
}

/** Get the color key for a filing type. */
export function getFilingTypeColor(type: FilingType): string {
  return FILING_TYPE_COLORS[type];
}

/**
 * Calculate the auto-task due date for a filing.
 * Returns a date AUTO_TASK_LEAD_DAYS before the filing due date.
 */
export function taskDueDateForFiling(filingDueDate: string): string {
  return format(subDays(parseISO(filingDueDate), AUTO_TASK_LEAD_DAYS), 'yyyy-MM-dd');
}

/** Get the auto-generated task label for a filing type. */
export function getAutoTaskLabel(type: FilingType): string {
  return `הגשת ${FILING_TYPES[type]}`;
}
```

**Design notes:**
- `calculateDueDate` handles month boundaries correctly by constructing a new Date with day 15 from the next month's year/month, rather than adding days (which could overshoot).
- `generateFilingSchedule` returns `Partial<Filing>[]` because `id`, `firm_id`, `created_at`, `updated_at` are set by the service layer when persisting.
- `getAutoTaskLabel` prefixes with "הגשת" (submission of) to create labels like "הגשת דוח מע"מ".
- Period format: monthly = "2026-01", bimonthly = "2026-01/2026-02". This matches the `Filing.period` field definition.

### `src/lib/validation.ts`
- **Action:** Create
- **Rationale:** Input validation for Israeli tax IDs, phone numbers, email. Standalone functions composable with zod.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

/**
 * Validate an Israeli tax ID (9-digit number with Luhn-like check digit).
 * Handles both company IDs (ח.פ.) and dealer numbers (עוסק מורשה/פטור).
 */
export function validateTaxId(id: string): boolean {
  const cleaned = id.replace(/\D/g, '');
  if (cleaned.length !== 9) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(cleaned[i], 10);
    // Multiply alternating digits by 1 and 2
    if (i % 2 !== 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Validate an Israeli phone number.
 * Accepts formats: 05X-XXXXXXX, 05XXXXXXXX, +972-5X-XXXXXXX, etc.
 * Must be a mobile number (05X prefix) or landline (02/03/04/08/09 prefix).
 */
export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  // Israeli mobile: 05X followed by 7 digits
  // Israeli landline: 0[2-9] followed by 7 digits
  // International: +972 followed by 9 digits (without leading 0)
  const israeliPattern = /^0[2-9]\d{7,8}$/;
  const internationalPattern = /^\+972[2-9]\d{7,8}$/;
  return israeliPattern.test(cleaned) || internationalPattern.test(cleaned);
}

/** Validate email format. */
export function validateEmail(email: string): boolean {
  // Simple but effective email regex — not trying to be RFC 5322 compliant
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Sanitize user search input for safe use in PostgREST queries.
 * Escapes special characters that have meaning in PostgREST text search.
 */
export function sanitizeSearchInput(search: string): string {
  return search
    .replace(/[\\%_]/g, (char) => `\\${char}`)
    .trim();
}
```

**Design notes:**
- `validateTaxId` implements the Israeli ID / company number check-digit algorithm (Luhn variant). Strips non-digits first to handle formatted input (e.g., "51-234567-8").
- `validatePhone` accepts common Israeli formats. It does NOT enforce strict formatting — it strips common separators first.
- `validateEmail` uses a simple pattern. A more thorough validation happens server-side.
- `sanitizeSearchInput` escapes `%`, `_`, and `\` which are special in PostgreSQL `LIKE`/`ILIKE` patterns. This prevents SQL injection via search input.

---

## Group 4: i18n Additions

### `src/i18n/he.ts`
- **Action:** Modify
- **Changes:** Add new keys at the end of the `common` section. These keys are needed by shared components (ConfirmDialog, DataTable, SearchInput, FormField, EmptyState).

**New keys to add:**

```typescript
  // Shared component keys (added for Phase 1)
  'common.confirmAction': 'אישור פעולה',
  'common.areYouSure': 'האם אתה בטוח? לא ניתן לבטל פעולה זו.',
  'common.noData': 'אין נתונים להצגה',
  'common.searchPlaceholder': 'חיפוש...',
  'common.page': 'עמוד',
  'common.of': 'מתוך',
  'common.rowsPerPage': 'שורות בעמוד',
  'common.previous': 'הקודם',
  'common.required': 'שדה חובה',
  'common.showing': 'מציג',
  'common.results': 'תוצאות',

  // Status labels
  'status.filed': 'הוגש',
  'status.pending': 'ממתין',
  'status.late': 'באיחור',
  'status.active': 'פעיל',
  'status.archived': 'בארכיון',
  'status.sent': 'נשלח',
  'status.paid': 'שולם',
  'status.open': 'פתוח',
  'status.done': 'הושלם',
  'status.cancelled': 'בוטל',
  'status.failed': 'נכשל',

  // Priority labels
  'priority.high': 'גבוהה',
  'priority.medium': 'בינונית',
  'priority.low': 'נמוכה',
```

### `src/i18n/ar.ts`
- **Action:** Modify
- **Changes:** Add corresponding Arabic translations.

```typescript
  // Shared component keys (added for Phase 1)
  'common.confirmAction': 'تأكيد الإجراء',
  'common.areYouSure': 'هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.',
  'common.noData': 'لا توجد بيانات للعرض',
  'common.searchPlaceholder': 'بحث...',
  'common.page': 'صفحة',
  'common.of': 'من',
  'common.rowsPerPage': 'صفوف في الصفحة',
  'common.previous': 'السابق',
  'common.required': 'حقل مطلوب',
  'common.showing': 'عرض',
  'common.results': 'نتائج',

  // Status labels
  'status.filed': 'تم التقديم',
  'status.pending': 'معلق',
  'status.late': 'متأخر',
  'status.active': 'نشط',
  'status.archived': 'مؤرشف',
  'status.sent': 'تم الإرسال',
  'status.paid': 'مدفوع',
  'status.open': 'مفتوح',
  'status.done': 'مكتمل',
  'status.cancelled': 'ملغى',
  'status.failed': 'فشل',

  // Priority labels
  'priority.high': 'عالية',
  'priority.medium': 'متوسطة',
  'priority.low': 'منخفضة',
```

### `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add corresponding English translations.

```typescript
  // Shared component keys (added for Phase 1)
  'common.confirmAction': 'Confirm Action',
  'common.areYouSure': 'Are you sure? This action cannot be undone.',
  'common.noData': 'No data to display',
  'common.searchPlaceholder': 'Search...',
  'common.page': 'Page',
  'common.of': 'of',
  'common.rowsPerPage': 'Rows per page',
  'common.previous': 'Previous',
  'common.required': 'Required',
  'common.showing': 'Showing',
  'common.results': 'results',

  // Status labels
  'status.filed': 'Filed',
  'status.pending': 'Pending',
  'status.late': 'Late',
  'status.active': 'Active',
  'status.archived': 'Archived',
  'status.sent': 'Sent',
  'status.paid': 'Paid',
  'status.open': 'Open',
  'status.done': 'Done',
  'status.cancelled': 'Cancelled',
  'status.failed': 'Failed',

  // Priority labels
  'priority.high': 'High',
  'priority.medium': 'Medium',
  'priority.low': 'Low',
```

**Design notes:**
- Status and priority labels use their own sections (`status.*`, `priority.*`) because they are used by multiple modules (filings, tasks, billing, etc.), not just one component.
- `common.areYouSure` includes a warning about irreversibility — this is the default ConfirmDialog description.
- `common.showing` and `common.results` are used by DataTable pagination: "Showing 1-10 of 50 results".

---

## Group 5: Shared Components

### `src/components/shared/StatusBadge.tsx`
- **Action:** Create
- **Rationale:** Reusable colored badge for entity statuses across all modules.

**Props interface:**
```typescript
export interface StatusBadgeProps {
  status: 'filed' | 'pending' | 'late' | 'active' | 'archived' | 'sent' | 'paid' | 'open' | 'done' | 'cancelled' | 'failed';
  className?: string;
}
```

**Structure:**
- Uses the existing `Badge` component from `@/components/ui/badge`.
- Maps status to color classes:
  - Green group (filed, active, sent, paid, done): `bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400`
  - Amber group (pending, open): `bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400`
  - Red group (late, cancelled, failed): `bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400`
  - Gray group (archived): `bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400`
- Uses `t('status.<status>')` for the display label.
- Uses `cn()` from `@/lib/utils` for class merging.

**Implementation approach:**
- Define a `STATUS_COLORS` map inside the component file (not in constants, since these are UI styling classes, not domain data).
- Render `<Badge className={cn(colorClasses, className)}>{t(`status.${status}`)}</Badge>`.

### `src/components/shared/PriorityBadge.tsx`
- **Action:** Create
- **Rationale:** Colored badge for task priority levels.

**Props interface:**
```typescript
export interface PriorityBadgeProps {
  priority: 'high' | 'medium' | 'low';
  className?: string;
}
```

**Structure:**
- Uses `Badge` from `@/components/ui/badge`.
- Color mapping:
  - high: red classes
  - medium: amber classes
  - low: blue classes (not green — blue distinguishes "low priority" from "success/done")
- Uses `t('priority.<priority>')` for display.

### `src/components/shared/EmptyState.tsx`
- **Action:** Create
- **Rationale:** Consistent empty-state placeholder across all list views.

**Props interface:**
```typescript
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}
```

**Structure:**
- Centered flex container.
- Icon rendered at 48x48 with `text-muted-foreground` color.
- Title as `<h3>` with `text-lg font-medium text-foreground`.
- Optional description as `<p>` with `text-sm text-muted-foreground`.
- No i18n in this component itself — `title` and `description` are passed in already translated by the consumer.

**Design note:** EmptyState does NOT call `t()` internally because the title/description are page-specific. The consumer passes pre-translated strings.

### `src/components/shared/LoadingSpinner.tsx`
- **Action:** Create
- **Rationale:** Consistent loading indicator.

**Props interface:**
```typescript
export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}
```

**Structure:**
- Centered `<div>` with a CSS-animated spinning circle.
- Uses `border-t-primary` for the spinner arc color (semantic, theme-aware).
- Size mapping: sm=16px, md=24px, lg=40px.
- No text — just the spinner. The consumer wraps it in a container if centering is needed.
- CSS animation uses `animate-spin` from Tailwind.

### `src/components/shared/ConfirmDialog.tsx`
- **Action:** Create
- **Rationale:** Standardized confirm/cancel dialog wrapping shadcn Dialog.

**Props interface:**
```typescript
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'default' | 'destructive';
}
```

**Structure:**
- Uses `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`.
- Uses `Button` from `@/components/ui/button`.
- Default `title` = `t('common.confirmAction')`.
- Default `description` = `t('common.areYouSure')`.
- Default `confirmLabel` = `t('common.confirm')`.
- Default `cancelLabel` = `t('common.cancel')`.
- Confirm button uses `variant="destructive"` when `variant` prop is `'destructive'`.
- Footer layout uses `flex gap-2 justify-end` with RTL-aware ordering via logical properties.
- Cancel button rendered first in DOM (appears on the right in RTL).
- Calls `onConfirm()` then `onOpenChange(false)` on confirm click.

### `src/components/shared/PageHeader.tsx`
- **Action:** Create
- **Rationale:** Consistent page header across all module pages.

**Props interface:**
```typescript
export interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode; // action buttons slot
}
```

**Structure:**
- `<div className="flex items-center justify-between mb-6">` as the outer container.
- Left side: `<div>` with `<h1 className="text-2xl font-bold text-foreground">` for title, optional `<p className="text-sm text-muted-foreground mt-1">` for description.
- Right side (children slot): `<div className="flex items-center gap-2">` wrapping action buttons.
- Uses `justify-between` which works correctly in both LTR and RTL because flexbox respects `dir`.

### `src/components/shared/FormField.tsx`
- **Action:** Create
- **Rationale:** Consistent form field wrapper with label, error, and hint.

**Props interface:**
```typescript
export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode; // the input element
  htmlFor?: string;
}
```

**Structure:**
- Uses `Label` from `@/components/ui/label`.
- Layout: vertical stack with `space-y-1.5`.
- Label row: `<Label>` with optional red `*` asterisk when `required`.
- Children slot: renders the input.
- Hint: `<p className="text-xs text-muted-foreground">` (shown only when no error).
- Error: `<p className="text-xs text-destructive">` (replaces hint when present).

### `src/components/shared/SearchInput.tsx`
- **Action:** Create
- **Rationale:** Debounced search input used in list pages.

**Props interface:**
```typescript
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number; // default 300
  className?: string;
}
```

**Structure:**
- Uses `Input` from `@/components/ui/input`.
- Uses `Search` icon from `lucide-react`.
- Wraps Input in a `<div className="relative">` with the search icon positioned absolutely.
- Internal state for immediate input value; debounced `onChange` callback via `useEffect` + `setTimeout`.
- Input has `ps-9` (padding-start for icon space) — uses logical property for RTL support.
- Default `placeholder` = `t('common.searchPlaceholder')`.
- Icon color: `text-muted-foreground`.
- Search icon positioned with `absolute start-3 top-1/2 -translate-y-1/2` for RTL-safe positioning.

**Debounce implementation:**
```typescript
// Internal state for immediate display
const [internal, setInternal] = useState(value);

useEffect(() => {
  setInternal(value);
}, [value]);

useEffect(() => {
  const timer = setTimeout(() => {
    if (internal !== value) {
      onChange(internal);
    }
  }, debounceMs ?? 300);
  return () => clearTimeout(timer);
}, [internal, debounceMs]);
```

**Design note:** Not using a third-party debounce library — the implementation is trivial and avoids an extra dependency.

### `src/components/shared/DataTable.tsx`
- **Action:** Create
- **Rationale:** Generic data table with sorting, pagination, filtering. Built on `@tanstack/react-table` per user decision #4.

**Props interface:**
```typescript
import type { ColumnDef } from '@tanstack/react-table';

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
  pageSize?: number;       // default 10
  searchable?: boolean;    // enable built-in search filter (default false)
  searchPlaceholder?: string;
}
```

**Structure:**
- Uses `@tanstack/react-table` with `useReactTable`, `getCoreRowModel`, `getSortedRowModel`, `getPaginationRowModel`, `getFilteredRowModel`.
- Table rendered using semantic `<table>` with Tailwind classes matching the shadcn table pattern: `w-full caption-bottom text-sm`.
- Header cells render with sort indicators (chevron up/down icons from lucide-react) when column is sortable.
- Row hover effect: `hover:bg-muted/50`.
- Row click: `cursor-pointer` when `onRowClick` is provided.
- Empty state: renders `EmptyState` or custom `emptyMessage` when `data.length === 0`.
- Pagination footer: Previous/Next buttons with page info using `t('common.page')`, `t('common.of')`, `t('common.previous')`, `t('common.next')`.
- Optional search bar at top using `SearchInput` when `searchable` is true.

**Implementation approach:**
- Accept standard `@tanstack/react-table` `ColumnDef` — do NOT create a custom column type. This gives consumers full control over sorting, filtering, cell rendering.
- The component manages its own pagination state and sort state internally.
- Global filtering (search) uses `getFilteredRowModel` with `globalFilter` state.

**Why @tanstack/react-table over a simpler custom table:**
- Sorting, pagination, and filtering are complex to implement correctly, especially with keyboard accessibility.
- `@tanstack/react-table` is headless — it does not impose any styling, so it works perfectly with shadcn/Tailwind.
- It is the standard for React data tables and is already used by the official shadcn DataTable example.
- The column definition API (`ColumnDef`) is well-understood and documented.

### `src/components/shared/index.ts`
- **Action:** Create
- **Rationale:** Barrel exports for shared components.

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-17 HH:MM IST (Jerusalem)

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps } from './StatusBadge';

export { PriorityBadge } from './PriorityBadge';
export type { PriorityBadgeProps } from './PriorityBadge';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { LoadingSpinner } from './LoadingSpinner';
export type { LoadingSpinnerProps } from './LoadingSpinner';

export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';

export { DataTable } from './DataTable';
export type { DataTableProps } from './DataTable';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { FormField } from './FormField';
export type { FormFieldProps } from './FormField';

export { SearchInput } from './SearchInput';
export type { SearchInputProps } from './SearchInput';
```

---

## Group 6: Modifications to Existing Files

### `src/stores/useAuthStore.ts`
- **Action:** Modify
- **Changes:** Remove the local `User` interface definition (lines 5-9) and replace with an import from `@/types/user`.
- **Line range:** Lines 5-9 (the `interface User { ... }` block)

**Before:**
```typescript
interface User {
  id: string;
  email: string;
  name: string;
}
```

**After:**
```typescript
import type { User } from '@/types/user';
```

- **Rationale:** User decision #5. The `User` type must be shared so it can be used in audit entries, staff assignments, and other modules.
- **Risk:** Low. The interface shape is identical. No consumers change.

### `package.json`
- **Action:** Modify
- **Changes:** Add `@tanstack/react-table` to dependencies.

**Add to `dependencies`:**
```json
"@tanstack/react-table": "^8.20.6"
```

- **Rationale:** User decision #4. Required for DataTable component.
- **Version note:** Use latest stable v8. The exact version will be resolved by `npm install`.

---

## Data Flow

This phase creates no runtime data flow — it defines types, utilities, and presentational components. Here is how they will be consumed in later phases:

```
User Action → Page Component → Service (CRUD) → Supabase
                    ↓                  ↓
              Shared Components    Types (input/output)
                    ↓                  ↓
              useLanguage()      Constants, Utilities
                    ↓                  ↓
              i18n translations   money.ts, dates.ts, etc.
```

**Dependency graph for Phase 1 artifacts:**

```
src/types/*  ←──────────── no internal deps
     ↑
src/lib/constants.ts ←── imports types
     ↑
src/lib/money.ts ←─────── imports constants
src/lib/dates.ts ←─────── no internal deps (only date-fns)
src/lib/filing-utils.ts ← imports types, constants
src/lib/validation.ts ←── no internal deps
     ↑
src/components/shared/* ── imports types, lib/*, ui/*
```

---

## Database Changes

None in Phase 1. All database tables, RLS policies, migrations, and indexes will be created in subsequent module phases (Phase 3+). The types defined here will map 1:1 to database schemas when those are created.

---

## Edge Cases & Error Handling

1. **`formatMoney(0)`** → should render "₪ 0.00", not empty string. `Intl.NumberFormat` handles this correctly.
2. **`formatMoney` with negative agorot** → renders "₪ -12.34" for credits/refunds. This is correct.
3. **`calculateDueDate` for December periods** → period end "2026-12-31" should produce due date "2027-01-15". The `addMonths` from date-fns handles year rollover correctly.
4. **`validateTaxId` with non-numeric input** → strips non-digits first, then validates. Input like "51-234567-8" works.
5. **`validatePhone` with international prefix** → `+972` prefix is handled. `+972-50-1234567` cleans to `+97250124567` and matches.
6. **`daysLeft` for today's date** → returns 0, not 1. The `startOfDay` normalization ensures this.
7. **`isOverdue` for today** → returns false (due today is not overdue). `isBefore` is strict less-than.
8. **DataTable with empty data** → renders EmptyState component, not an empty table.
9. **SearchInput unmount during debounce** → cleanup function in `useEffect` clears the timeout, preventing state updates on unmounted component.
10. **ConfirmDialog rapid double-click** → `onConfirm` called once, then dialog closes via `onOpenChange(false)`.
11. **Bimonthly periods for leap year** → February 29 is correctly handled by `new Date(year, m + 2, 0)` which gives the last day of the month.

---

## Performance Considerations

1. **`Intl.NumberFormat` in `formatMoney`** → Creates a new formatter on each call. If profiling shows this as a bottleneck (unlikely), it can be cached in a module-level variable since the locale/currency never changes.
2. **DataTable with large datasets** → `@tanstack/react-table` uses client-side pagination by default. For tables with 1000+ rows, server-side pagination should be implemented at the service/hook level in later phases. The DataTable component supports this by accepting pre-paginated data.
3. **SearchInput debounce** → 300ms default is a good balance. Faster typing does not trigger unnecessary re-renders in the parent because only the debounced value propagates.
4. **Barrel exports** → Tree-shaking works correctly with Vite/Rollup for `export *` patterns. Unused types are stripped at build time. Unused components are stripped if not imported.

---

## i18n / RTL Implications

### New Translation Keys
- 25 new keys added across all 3 language files (see Group 4 above).
- Keys organized into `common.*`, `status.*`, and `priority.*` sections.

### RTL Layout Considerations
- **SearchInput:** Uses `ps-9` (padding-start) and `start-3` (inset-inline-start) for icon positioning — these flip automatically in RTL.
- **PageHeader:** Uses `justify-between` which is direction-aware in flexbox.
- **ConfirmDialog footer:** Uses `justify-end` — buttons appear on the left in RTL (correct for Hebrew/Arabic UIs where primary actions are on the left).
- **DataTable:** Sort icons do not need mirroring (up/down arrows are not directional). Pagination Previous/Next buttons use text labels from i18n, not arrow icons, so they are RTL-safe.
- **FormField:** Vertical stack — no horizontal RTL concerns. Label text alignment inherits from `dir`.
- **EmptyState:** Centered layout — no RTL concerns.
- **LoadingSpinner:** Centered, circular — no RTL concerns.

---

## Self-Critique

### Where this design is strongest
- Type safety: Every constant map is typed against the union type, so missing values are compile-time errors.
- Consistency: All money in agorot, all dates as ISO strings, all components use `useLanguage()`.
- Minimal footprint: No services, hooks, or pages — just the foundation layer.

### Where this design is weakest
1. **Hebrew-only labels in constants** — `FILING_TYPES`, `CLIENT_TYPES`, etc. have Hebrew labels hardcoded as values. This works because these are domain constants (Israeli tax terms), but it means changing the app to support a fully Arabic-speaking firm would require mapping these to i18n keys. This is an acceptable trade-off for Phase 1 — the labels can be refactored to use translation keys if multi-language domain terms become a requirement.

2. **`PERMISSION_GROUPS` in role.ts is a runtime value in a types file** — Purists would argue constants belong in `constants.ts`. However, `PERMISSION_GROUPS` is tightly coupled to the `Permission` and `PermissionGroup` interfaces, and moving it to `constants.ts` would create a bidirectional dependency (constants importing types, types needing to know about constants). Keeping it co-located is the pragmatic choice.

3. **DataTable accepts `ColumnDef` from @tanstack/react-table** — This creates a tight coupling between consumer code and the @tanstack/react-table API. If we ever wanted to swap the table library, all column definitions would need rewriting. Mitigated by: @tanstack/react-table is the de facto standard, and wrapping its API would add complexity without benefit.

4. **`staffName` denormalized on HoursEntry and `clientName` on Message** — These could become stale if names are updated. Mitigated by: these are historical records (the name at the time of the event is often the correct one to show), and the cost of a join for every list query is non-trivial.

5. **No runtime validation on type constructors** — The `Create*Input` types are compile-time only. Runtime validation (e.g., ensuring `amount` is a positive integer) will be handled by zod schemas in the service layer (Phase 3+). This is intentional — Phase 1 is infrastructure, not business logic enforcement.

### Alternative approaches considered
- **Zod schemas as the source of truth instead of TypeScript interfaces** — Rejected because it adds complexity to Phase 1 and not all types need runtime validation. Types are consumed by many modules that just need type checking, not parsing.
- **Custom table component without @tanstack/react-table** — Rejected per user decision #4. A custom implementation would be buggy and incomplete for sorting/pagination/accessibility.
- **Putting all constants in a JSON file instead of TypeScript** — Rejected because we lose type safety on the Record keys and cannot import union types.

---

## Verification Plan

After implementation, run these commands to verify:

```bash
# 1. TypeScript compilation (most important)
npx tsc --noEmit

# 2. Build succeeds
npm run build

# 3. Lint passes
npm run lint

# 4. Verify no circular dependencies (manual check)
# Confirm: types/* do not import from lib/*
# Confirm: lib/constants.ts only imports types from @/types
# Confirm: lib/money.ts only imports from lib/constants
# Confirm: lib/filing-utils.ts only imports from @/types and lib/constants
# Confirm: lib/dates.ts only imports from date-fns
# Confirm: lib/validation.ts has no internal imports

# 5. Verify @tanstack/react-table is installed
npm ls @tanstack/react-table

# 6. Verify useAuthStore imports User from @/types/user
grep -n "import.*User.*from" src/stores/useAuthStore.ts
```
