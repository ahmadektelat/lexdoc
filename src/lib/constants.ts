// CREATED: 2026-03-17
// UPDATED: 2026-03-19 15:00 IST (Jerusalem)
//          - Added filings.view, filings.edit to manager role permissions

import type { FilingType, ClientType, StaffRole, TaskPriority, TaskCategory, InteractionChannel, DocumentSensitivity, ContactType, AuthorityType } from '@/types';
import { PERMISSION_GROUPS } from '@/types/role';

// Financial constants
export const VAT_RATE = 0.18;
export const AGOROT_PER_SHEKEL = 100;

// Business rule constants
export const MAX_ACTIVE_USERS_PER_CLIENT = 5;
export const AUTO_TASK_LEAD_DAYS = 10;
export const AUTO_TASK_WINDOW_DAYS = 30;

// Filing types with Hebrew labels (exception: official Israeli legal/tax terminology)
export const FILING_TYPES: Record<FilingType, string> = {
  maam: 'דוח מע"מ',
  mekadmot: 'מקדמות מס הכנסה',
  nikuyim: 'ניכויים מס הכנסה',
  nii: 'ניכויים ביטוח לאומי',
};

// Filing type badge colors (Tailwind color names, not full classes)
export const FILING_TYPE_COLORS: Record<FilingType, string> = {
  maam: 'blue',
  mekadmot: 'amber',
  nikuyim: 'green',
  nii: 'red',
};

// These constants store i18n keys. Components call t(CLIENT_TYPES[type]) to get localized text.
export const CLIENT_TYPES: Record<ClientType, string> = {
  self_employed: 'clientTypes.selfEmployed',
  company: 'clientTypes.company',
  economic: 'clientTypes.economic',
  private: 'clientTypes.private',
};

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

export const CONTACT_TYPES: Record<ContactType, string> = {
  client: 'contactTypes.client',
  taxAuth: 'contactTypes.taxAuth',
  nii: 'contactTypes.nii',
  court: 'contactTypes.court',
  other: 'contactTypes.other',
};

export const AUTHORITY_TYPES: Record<AuthorityType, string> = {
  taxAuth: 'authorityTypes.taxAuth',
  vat: 'authorityTypes.vat',
  nii: 'authorityTypes.nii',
  court: 'authorityTypes.court',
  other: 'authorityTypes.other',
};

export const DOCUMENT_SENSITIVITIES: Record<DocumentSensitivity, string> = {
  internal: 'sensitivity.internal',
  confidential: 'sensitivity.confidential',
  restricted: 'sensitivity.restricted',
  public: 'sensitivity.public',
};

// Subscription plans — prices in agorot (user decision #3)
export const SUBSCRIPTION_PLANS = [
  { id: 'monthly' as const, label: 'subscriptionPlans.monthly', price: 29900, months: 1 },
  { id: 'yearly' as const, label: 'subscriptionPlans.yearly', price: 249000, months: 12 },
  { id: 'two' as const, label: 'subscriptionPlans.twoYear', price: 399000, months: 24 },
];

// Default document folders (Hebrew — domain-specific, not translated)
export const DEFAULT_FOLDERS = ['חוזים', 'פיננסים', 'התכתבויות'];

// All permission IDs (derived from PERMISSION_GROUPS)
const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id));

// System roles for RBAC
export const SYSTEM_ROLES = [
  {
    id: 'admin',
    label: 'systemRoles.admin',
    description: 'systemRoles.adminDesc',
    color: '#ef4444',
    locked: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    id: 'editor',
    label: 'systemRoles.editor',
    description: 'systemRoles.editorDesc',
    color: '#3b82f6',
    locked: true,
    permissions: ALL_PERMISSIONS.filter(p => !p.endsWith('.delete') && !p.startsWith('settings.')),
  },
  {
    id: 'viewer',
    label: 'systemRoles.viewer',
    description: 'systemRoles.viewerDesc',
    color: '#64748b',
    locked: true,
    permissions: ALL_PERMISSIONS.filter(p => p.endsWith('.view')),
  },
  {
    id: 'manager',
    label: 'systemRoles.manager',
    description: 'systemRoles.managerDesc',
    color: '#10b981',
    locked: true,
    permissions: [
      'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
      'staff.view', 'staff.manage',
      'crm.view', 'crm.manage',
      'filings.view', 'filings.edit',
      'reports.view',
      'documents.view', 'documents.upload',
    ],
  },
];
