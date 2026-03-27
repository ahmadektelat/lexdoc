# Design Amendments — Shared Foundation (Phase 1)

**Date:** 2026-03-17
**Status:** Pending devil's advocate approval
**Applies to:** `docs/research/feature-shared-foundation/02-design.md`

These amendments address issues found during the devil's advocate review. The implementer MUST apply these changes on top of the original design.

---

## Amendment 1: Filing Type Codes — Use Hebrew Transliteration

**Reason:** CLAUDE.md defines canonical codes as `maam`, `mekadmot`, `nikuyim`, `nii`. User confirmed Hebrew codes.

### Changes:

**`src/types/filing.ts`** — Replace:
```typescript
export type FilingType = 'vat' | 'taxAdv' | 'taxDeduct' | 'niiDeduct';
```
With:
```typescript
export type FilingType = 'maam' | 'mekadmot' | 'nikuyim' | 'nii';
```

**`src/lib/constants.ts`** — Replace filing type maps:
```typescript
export const FILING_TYPES: Record<FilingType, string> = {
  maam: 'דוח מע"מ',
  mekadmot: 'מקדמות מס הכנסה',
  nikuyim: 'ניכויים מס הכנסה',
  nii: 'ניכויים ביטוח לאומי',
};

export const FILING_TYPE_COLORS: Record<FilingType, string> = {
  maam: 'blue',
  mekadmot: 'amber',
  nikuyim: 'green',
  nii: 'red',
};
```

**`src/lib/filing-utils.ts`** — Update `generateFilingSchedule` to use new codes:
```typescript
addFilings('maam', settings.vatFreq);
if (settings.taxAdvEnabled) addFilings('mekadmot', settings.taxAdvFreq);
if (settings.taxDeductEnabled) addFilings('nikuyim', settings.taxDeductFreq);
if (settings.niiDeductEnabled) addFilings('nii', settings.niiDeductFreq);
```

**`src/types/task.ts`** — `TaskCategory` `'taxAuth'` stays as-is (it's a category, not a filing type). But `filingType?: FilingType` will use the updated `FilingType` union automatically.

---

## Amendment 2: Separate Tax ID Validation Functions

**Reason:** Israeli personal IDs (9 digits) and company registration numbers (ח.פ.) have different formats. User chose separate functions.

### Changes:

**`src/lib/validation.ts`** — Replace single `validateTaxId` with two functions:

```typescript
/**
 * Validate an Israeli personal ID number (מספר זהות).
 * 9-digit number with Luhn-like check digit algorithm.
 * Accepts shorter numbers (left-padded with zeros).
 */
export function validateTaxId(id: string): boolean {
  const cleaned = id.replace(/\D/g, '');
  if (cleaned.length > 9 || cleaned.length === 0) return false;
  const padded = cleaned.padStart(9, '0');

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(padded[i], 10);
    if (i % 2 !== 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Validate an Israeli company registration number (ח.פ. / ע.ר.).
 * Accepts 8-9 digit numbers. Does NOT apply check-digit algorithm
 * (company numbers use a different validation scheme).
 */
export function validateCompanyId(id: string): boolean {
  const cleaned = id.replace(/\D/g, '');
  return cleaned.length >= 8 && cleaned.length <= 9;
}
```

---

## Amendment 3: i18n Keys for Constants and Permissions

**Reason:** The i18n mandate requires all user-facing text to use `t()`. Permission labels and constant labels (priorities, channels, etc.) are UI labels, not immutable legal terms.

### Changes:

**`src/types/role.ts`** — Permission labels become i18n keys:
```typescript
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'clients',
    permissions: [
      { id: 'clients.view', label: 'permissions.clients.view', group: 'clients' },
      { id: 'clients.create', label: 'permissions.clients.create', group: 'clients' },
      { id: 'clients.edit', label: 'permissions.clients.edit', group: 'clients' },
      { id: 'clients.delete', label: 'permissions.clients.delete', group: 'clients' },
    ],
  },
  // ... all other groups follow same pattern: label = 'permissions.<group>.<action>'
];
```

**`src/lib/constants.ts`** — Domain labels become i18n keys:
```typescript
// These constants store i18n keys. Components call t(STAFF_ROLES[role]) to get localized text.
export const STAFF_ROLES: Record<StaffRole, string> = {
  partner: 'staffRoles.partner',
  attorney: 'staffRoles.attorney',
  junior_attorney: 'staffRoles.juniorAttorney',
  accountant: 'staffRoles.accountant',
  consultant: 'staffRoles.consultant',
  secretary: 'staffRoles.secretary',
  manager: 'staffRoles.manager',
  student: 'staffRoles.student',
};

export const TASK_PRIORITIES: Record<TaskPriority, string> = {
  high: 'priority.high',
  medium: 'priority.medium',
  low: 'priority.low',
};

export const TASK_CATEGORIES: Record<TaskCategory, string> = {
  client: 'taskCategories.client',
  taxAuth: 'taskCategories.taxAuth',
  nii: 'taskCategories.nii',
  internal: 'taskCategories.internal',
};

export const INTERACTION_CHANNELS: Record<InteractionChannel, string> = {
  call: 'channels.call',
  email: 'channels.email',
  meeting: 'channels.meeting',
  letter: 'channels.letter',
  portal: 'channels.portal',
};

export const DOCUMENT_SENSITIVITIES: Record<DocumentSensitivity, string> = {
  internal: 'sensitivity.internal',
  confidential: 'sensitivity.confidential',
  restricted: 'sensitivity.restricted',
  public: 'sensitivity.public',
};

export const SYSTEM_ROLES = [
  { id: 'admin', label: 'systemRoles.admin', desc: 'systemRoles.adminDesc', color: 'red' },
  { id: 'editor', label: 'systemRoles.editor', desc: 'systemRoles.editorDesc', color: 'blue' },
  { id: 'viewer', label: 'systemRoles.viewer', desc: 'systemRoles.viewerDesc', color: 'gray' },
  { id: 'manager', label: 'systemRoles.manager', desc: 'systemRoles.managerDesc', color: 'green' },
];

export const CLIENT_TYPES: Record<ClientType, string> = {
  self_employed: 'clientTypes.selfEmployed',
  company: 'clientTypes.company',
  economic: 'clientTypes.economic',
  private: 'clientTypes.private',
};
```

**Exception:** `FILING_TYPES` keeps hardcoded Hebrew labels because these are official Israeli legal/tax terminology (דוח מע"מ, מקדמות מס הכנסה, etc.). They do not change across languages. `DEFAULT_FOLDERS` also keeps Hebrew as these are domain-specific folder names.

**i18n files** — Add all new keys to he.ts, ar.ts, en.ts:
```typescript
// Staff roles
'staffRoles.partner': 'שותף' / 'شريك' / 'Partner',
'staffRoles.attorney': 'עורך דין' / 'محامي' / 'Attorney',
'staffRoles.juniorAttorney': 'עורך דין מתמחה' / 'محامي متدرب' / 'Junior Attorney',
'staffRoles.accountant': 'רואה חשבון' / 'محاسب' / 'Accountant',
'staffRoles.consultant': 'יועץ' / 'مستشار' / 'Consultant',
'staffRoles.secretary': 'מזכיר/ה' / 'سكرتير/ة' / 'Secretary',
'staffRoles.manager': 'מנהל/ת' / 'مدير/ة' / 'Manager',
'staffRoles.student': 'סטודנט/ית' / 'طالب/ة' / 'Student',

// Task categories
'taskCategories.client': 'לקוח' / 'عميل' / 'Client',
'taskCategories.taxAuth': 'רשות המסים' / 'مصلحة الضرائب' / 'Tax Authority',
'taskCategories.nii': 'ביטוח לאומי' / 'التأمين الوطني' / 'National Insurance',
'taskCategories.internal': 'פנימי' / 'داخلي' / 'Internal',

// Interaction channels
'channels.call': 'שיחה' / 'مكالمة' / 'Call',
'channels.email': 'דוא"ל' / 'بريد إلكتروني' / 'Email',
'channels.meeting': 'פגישה' / 'اجتماع' / 'Meeting',
'channels.letter': 'מכתב' / 'رسالة' / 'Letter',
'channels.portal': 'פורטל' / 'بوابة' / 'Portal',

// Document sensitivity
'sensitivity.internal': 'פנימי' / 'داخلي' / 'Internal',
'sensitivity.confidential': 'חסוי' / 'سري' / 'Confidential',
'sensitivity.restricted': 'מוגבל' / 'مقيد' / 'Restricted',
'sensitivity.public': 'ציבורי' / 'عام' / 'Public',

// Client types
'clientTypes.selfEmployed': 'עוסק מורשה' / 'عامل مستقل' / 'Self Employed',
'clientTypes.company': 'חברה' / 'شركة' / 'Company',
'clientTypes.economic': 'עוסק פטור' / 'معفى' / 'Exempt Dealer',
'clientTypes.private': 'פרטי' / 'خاص' / 'Private',

// System roles
'systemRoles.admin': 'מנהל מערכת' / 'مدير النظام' / 'System Admin',
'systemRoles.adminDesc': 'גישה מלאה לכל המערכת' / 'وصول كامل لجميع النظام' / 'Full system access',
'systemRoles.editor': 'עורך' / 'محرر' / 'Editor',
'systemRoles.editorDesc': 'עריכה וצפייה בכל המודולים' / 'تحرير وعرض جميع الوحدات' / 'Edit and view all modules',
'systemRoles.viewer': 'צופה' / 'مشاهد' / 'Viewer',
'systemRoles.viewerDesc': 'צפייה בלבד' / 'عرض فقط' / 'View only',
'systemRoles.manager': 'מנהל' / 'مدير' / 'Manager',
'systemRoles.managerDesc': 'ניהול צוות ולקוחות' / 'إدارة الفريق والعملاء' / 'Manage staff and clients',

// Permission labels (all follow pattern: permissions.<group>.<action>)
'permissions.clients.view': 'צפייה בלקוחות' / 'عرض العملاء' / 'View Clients',
'permissions.clients.create': 'הוספת לקוח' / 'إضافة عميل' / 'Add Client',
'permissions.clients.edit': 'עריכת לקוח' / 'تعديل عميل' / 'Edit Client',
'permissions.clients.delete': 'מחיקת לקוח' / 'حذف عميل' / 'Delete Client',
'permissions.filings.view': 'צפייה בדיווחים' / 'عرض التقارير' / 'View Filings',
'permissions.filings.create': 'הוספת דיווח' / 'إضافة تقرير' / 'Add Filing',
'permissions.filings.edit': 'עריכת דיווח' / 'تعديل تقرير' / 'Edit Filing',
'permissions.filings.delete': 'מחיקת דיווח' / 'حذف تقرير' / 'Delete Filing',
'permissions.billing.view': 'צפייה בחיובים' / 'عرض الفواتير' / 'View Billing',
'permissions.billing.create': 'הוספת חיוב' / 'إضافة فاتورة' / 'Add Billing',
'permissions.billing.edit': 'עריכת חיוב' / 'تعديل فاتورة' / 'Edit Billing',
'permissions.billing.delete': 'מחיקת חיוב' / 'حذف فاتورة' / 'Delete Billing',
'permissions.billing.invoices': 'ניהול חשבוניות' / 'إدارة الفواتير' / 'Manage Invoices',
'permissions.staff.view': 'צפייה בצוות' / 'عرض الفريق' / 'View Staff',
'permissions.staff.manage': 'ניהול צוות' / 'إدارة الفريق' / 'Manage Staff',
'permissions.crm.view': 'צפייה באנשי קשר' / 'عرض جهات الاتصال' / 'View Contacts',
'permissions.crm.manage': 'ניהול אנשי קשר' / 'إدارة جهات الاتصال' / 'Manage Contacts',
'permissions.documents.view': 'צפייה במסמכים' / 'عرض المستندات' / 'View Documents',
'permissions.documents.upload': 'העלאת מסמכים' / 'رفع المستندات' / 'Upload Documents',
'permissions.documents.delete': 'מחיקת מסמכים' / 'حذف المستندات' / 'Delete Documents',
'permissions.reports.view': 'צפייה בדוחות' / 'عرض التقارير' / 'View Reports',
'permissions.reports.export': 'ייצוא דוחות' / 'تصدير التقارير' / 'Export Reports',
'permissions.messaging.view': 'צפייה בהודעות' / 'عرض الرسائل' / 'View Messages',
'permissions.messaging.send': 'שליחת הודעות' / 'إرسال الرسائل' / 'Send Messages',
'permissions.settings.roles': 'ניהול הרשאות' / 'إدارة الصلاحيات' / 'Manage Roles',
'permissions.settings.firm': 'הגדרות משרד' / 'إعدادات المكتب' / 'Firm Settings',
'permissions.settings.audit': 'צפייה ביומן פעילות' / 'عرض سجل النشاط' / 'View Audit Log',
'permissions.settings.backup': 'גיבוי ושחזור' / 'نسخ احتياطي واستعادة' / 'Backup & Restore',
```

---

## Amendment 4: Rename `Document` Type to `LegalDocument`

**Reason:** `Document` shadows the global DOM `Document` interface, causing potential confusion and auto-import issues.

### Changes:

**`src/types/document.ts`** — Rename:
```typescript
export interface LegalDocument { ... }  // was: Document
export type CreateDocumentInput = Omit<LegalDocument, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>;
```

**`src/types/index.ts`** — No change needed (export * re-exports the new name).

---

## Amendment 5: Add Missing Timestamps

**Reason:** Supabase conventions require `created_at` and `updated_at` on all tables. Soft-delete convention requires `deleted_at` on entity tables.

### Changes:

**`src/types/firm.ts`** — Add:
```typescript
export interface Firm {
  // ... existing fields ...
  deleted_at?: string;  // ADD — soft-delete consistency
  created_at: string;
  updated_at: string;
}
```

**`src/types/billing.ts`** — HoursEntry:
```typescript
export interface HoursEntry {
  // ... existing fields ...
  deleted_at?: string;  // ADD — soft-delete for correction workflow
  created_at: string;
  // No updated_at — hours entries are immutable (delete and re-create)
}
```

**`src/types/billing.ts`** — Invoice:
```typescript
export interface Invoice {
  // ... existing fields ...
  updated_at: string;   // ADD — track when sent/paid status changed
  deleted_at?: string;  // ADD — soft-delete
  created_at: string;
}
```

**`src/types/billing.ts`** — Tighten CreateInvoiceInput:
```typescript
export type CreateInvoiceInput = Omit<Invoice, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sent' | 'paid' | 'paidDate'>;
```

**`src/types/message.ts`** — MessageTemplate:
```typescript
export interface MessageTemplate {
  // ... existing fields ...
  firm_id?: string;     // ADD — optional: null = system-wide, set = firm-specific
  created_at: string;   // ADD
  updated_at: string;   // ADD
}
```

**`src/types/message.ts`** — Message:
```typescript
export interface Message {
  // ... existing fields ...
  created_at: string;   // ADD — may differ from sentAt for queued messages
}
```

**`src/types/message.ts`** — ScheduledMessage:
```typescript
export interface ScheduledMessage {
  // ... existing fields ...
  created_at: string;   // ADD
  updated_at: string;   // ADD
}
```

---

## Amendment 6: Implementer Notes (INFO items — non-blocking)

These are awareness items for the implementer, not design changes:

1. **SearchInput debounce**: Use `useRef` for the `onChange` callback to avoid dependency array issues.
2. **DataTable**: Add a page-size dropdown to the pagination footer (using the `common.rowsPerPage` i18n key).
3. **ConfirmDialog**: Call `onOpenChange(false)` before `onConfirm()` to prevent double-click issues.
4. **ConfirmDialog RTL**: Override the `DialogFooter` with `gap-2` instead of relying on default `space-x-2`.
5. **SUBSCRIPTION_PLANS label**: These are UI labels, so they should also use i18n keys: `{ id: 'monthly', label: 'subscriptionPlans.monthly', ... }`. Add corresponding translations.
