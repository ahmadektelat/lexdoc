// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Permission labels use i18n keys (amendment 3)

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
      { id: 'clients.view', label: 'permissions.clients.view', group: 'clients' },
      { id: 'clients.create', label: 'permissions.clients.create', group: 'clients' },
      { id: 'clients.edit', label: 'permissions.clients.edit', group: 'clients' },
      { id: 'clients.delete', label: 'permissions.clients.delete', group: 'clients' },
    ],
  },
  {
    group: 'filings',
    permissions: [
      { id: 'filings.view', label: 'permissions.filings.view', group: 'filings' },
      { id: 'filings.create', label: 'permissions.filings.create', group: 'filings' },
      { id: 'filings.edit', label: 'permissions.filings.edit', group: 'filings' },
      { id: 'filings.delete', label: 'permissions.filings.delete', group: 'filings' },
    ],
  },
  {
    group: 'billing',
    permissions: [
      { id: 'billing.view', label: 'permissions.billing.view', group: 'billing' },
      { id: 'billing.create', label: 'permissions.billing.create', group: 'billing' },
      { id: 'billing.edit', label: 'permissions.billing.edit', group: 'billing' },
      { id: 'billing.delete', label: 'permissions.billing.delete', group: 'billing' },
      { id: 'billing.invoices', label: 'permissions.billing.invoices', group: 'billing' },
    ],
  },
  {
    group: 'staff',
    permissions: [
      { id: 'staff.view', label: 'permissions.staff.view', group: 'staff' },
      { id: 'staff.manage', label: 'permissions.staff.manage', group: 'staff' },
    ],
  },
  {
    group: 'crm',
    permissions: [
      { id: 'crm.view', label: 'permissions.crm.view', group: 'crm' },
      { id: 'crm.manage', label: 'permissions.crm.manage', group: 'crm' },
    ],
  },
  {
    group: 'documents',
    permissions: [
      { id: 'documents.view', label: 'permissions.documents.view', group: 'documents' },
      { id: 'documents.upload', label: 'permissions.documents.upload', group: 'documents' },
      { id: 'documents.delete', label: 'permissions.documents.delete', group: 'documents' },
    ],
  },
  {
    group: 'reports',
    permissions: [
      { id: 'reports.view', label: 'permissions.reports.view', group: 'reports' },
      { id: 'reports.export', label: 'permissions.reports.export', group: 'reports' },
    ],
  },
  {
    group: 'messaging',
    permissions: [
      { id: 'messaging.view', label: 'permissions.messaging.view', group: 'messaging' },
      { id: 'messaging.send', label: 'permissions.messaging.send', group: 'messaging' },
    ],
  },
  {
    group: 'settings',
    permissions: [
      { id: 'settings.roles', label: 'permissions.settings.roles', group: 'settings' },
      { id: 'settings.firm', label: 'permissions.settings.firm', group: 'settings' },
      { id: 'settings.audit', label: 'permissions.settings.audit', group: 'settings' },
      { id: 'settings.backup', label: 'permissions.settings.backup', group: 'settings' },
    ],
  },
];
