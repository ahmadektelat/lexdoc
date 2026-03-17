// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Constants use i18n keys where applicable (amendment 3)
//          - Filing types use Hebrew transliteration codes (amendment 1)
//          - SUBSCRIPTION_PLANS labels use i18n keys (amendment 6 note 5)

import type { FilingType, ClientType, StaffRole, TaskPriority, TaskCategory, InteractionChannel, DocumentSensitivity } from '@/types';

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

// System roles for RBAC
export const SYSTEM_ROLES = [
  { id: 'admin', label: 'systemRoles.admin', desc: 'systemRoles.adminDesc', color: 'red' },
  { id: 'editor', label: 'systemRoles.editor', desc: 'systemRoles.editorDesc', color: 'blue' },
  { id: 'viewer', label: 'systemRoles.viewer', desc: 'systemRoles.viewerDesc', color: 'gray' },
  { id: 'manager', label: 'systemRoles.manager', desc: 'systemRoles.managerDesc', color: 'green' },
];
