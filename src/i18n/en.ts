// English translations
export const en: Record<string, string> = {
  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.clients': 'Clients',
  'nav.filings': 'Tax Filings',
  'nav.billing': 'Billing & Invoicing',
  'nav.staff': 'Staff',
  'nav.crm': 'CRM',
  'nav.documents': 'Documents',
  'nav.reports': 'Reports',
  'nav.messaging': 'Messaging',
  'nav.permissions': 'Permissions',
  'nav.audit': 'Audit Log',
  'nav.backup': 'Backup',
  'nav.settings': 'Settings',

  // Common
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.export': 'Export',
  'common.import': 'Import',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.loading': 'Loading...',
  'common.noResults': 'No results found',
  'common.actions': 'Actions',
  'common.status': 'Status',
  'common.date': 'Date',
  'common.name': 'Name',
  'common.phone': 'Phone',
  'common.email': 'Email',
  'common.notes': 'Notes',
  'common.type': 'Type',
  'common.all': 'All',

  // Auth
  'auth.login': 'Login',
  'auth.logout': 'Logout',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.forgotPassword': 'Forgot Password',
  'auth.register': 'Register',

  // Dashboard
  'dashboard.title': 'Dashboard',
  'dashboard.welcome': 'Welcome',
  'dashboard.totalClients': 'Total Clients',
  'dashboard.upcomingFilings': 'Upcoming Filings',
  'dashboard.pendingTasks': 'Pending Tasks',
  'dashboard.monthlyRevenue': 'Monthly Revenue',

  // Clients
  'clients.title': 'Clients',
  'clients.addNew': 'Add New Client',
  'clients.name': 'Client Name',
  'clients.type': 'Client Type',
  'clients.taxId': 'Tax ID',
  'clients.type.company': 'Company',
  'clients.type.selfEmployed': 'Self-Employed',
  'clients.type.economic': 'Exempt Dealer',
  'clients.type.private': 'Private',

  // Filings
  'filings.title': 'Tax Filings',
  'filings.vatReport': 'VAT Report',
  'filings.taxAdvances': 'Tax Advances',
  'filings.incomeTaxDeductions': 'Income Tax Deductions',
  'filings.niiDeductions': 'NII Deductions',
  'filings.dueDate': 'Due Date',
  'filings.status.pending': 'Pending',
  'filings.status.filed': 'Filed',
  'filings.status.late': 'Late',

  // Billing
  'billing.title': 'Billing & Invoicing',
  'billing.invoiceTotal': 'Invoice Total',
  'billing.createInvoice': 'Create Invoice',
  'billing.monthlyFee': 'Monthly Fee',
  'billing.hourly': 'Hourly',
  'billing.oneTime': 'One-Time',
  'billing.vat': 'VAT',
  'billing.subtotal': 'Subtotal',
  'billing.total': 'Total',

  // Staff
  'staff.title': 'Staff',
  'staff.addMember': 'Add Staff Member',
  'staff.role': 'Role',
  'staff.active': 'Active',

  // Errors
  'errors.generic': 'An error occurred',
  'errors.notFound': 'Not found',
  'errors.unauthorized': 'Unauthorized',
  'errors.networkError': 'Network error',
  'errors.saveFailed': 'Save failed',

  // Theme
  'theme.sky': 'Sky',
  'theme.dark': 'Dark',
  'theme.blue': 'Blue',
  'theme.label': 'Theme',

  // Language
  'language.hebrew': 'עברית',
  'language.arabic': 'عربية',
  'language.english': 'English',
  'language.label': 'Language',

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

  // Staff roles
  'staffRoles.partner': 'Partner',
  'staffRoles.attorney': 'Attorney',
  'staffRoles.juniorAttorney': 'Junior Attorney',
  'staffRoles.accountant': 'Accountant',
  'staffRoles.consultant': 'Consultant',
  'staffRoles.secretary': 'Secretary',
  'staffRoles.manager': 'Manager',
  'staffRoles.student': 'Student',

  // Task categories
  'taskCategories.client': 'Client',
  'taskCategories.taxAuth': 'Tax Authority',
  'taskCategories.nii': 'National Insurance',
  'taskCategories.internal': 'Internal',

  // Interaction channels
  'channels.call': 'Call',
  'channels.email': 'Email',
  'channels.meeting': 'Meeting',
  'channels.letter': 'Letter',
  'channels.portal': 'Portal',

  // Document sensitivity
  'sensitivity.internal': 'Internal',
  'sensitivity.confidential': 'Confidential',
  'sensitivity.restricted': 'Restricted',
  'sensitivity.public': 'Public',

  // Client types
  'clientTypes.selfEmployed': 'Self Employed',
  'clientTypes.company': 'Company',
  'clientTypes.economic': 'Exempt Dealer',
  'clientTypes.private': 'Private',

  // System roles
  'systemRoles.admin': 'System Admin',
  'systemRoles.adminDesc': 'Full system access',
  'systemRoles.editor': 'Editor',
  'systemRoles.editorDesc': 'Edit and view all modules',
  'systemRoles.viewer': 'Viewer',
  'systemRoles.viewerDesc': 'View only',
  'systemRoles.manager': 'Manager',
  'systemRoles.managerDesc': 'Manage staff and clients',

  // Subscription plans
  'subscriptionPlans.monthly': 'Monthly',
  'subscriptionPlans.yearly': 'Yearly',
  'subscriptionPlans.twoYear': 'Two-Year',

  // Permission labels
  'permissions.clients.view': 'View Clients',
  'permissions.clients.create': 'Add Client',
  'permissions.clients.edit': 'Edit Client',
  'permissions.clients.delete': 'Delete Client',
  'permissions.filings.view': 'View Filings',
  'permissions.filings.create': 'Add Filing',
  'permissions.filings.edit': 'Edit Filing',
  'permissions.filings.delete': 'Delete Filing',
  'permissions.billing.view': 'View Billing',
  'permissions.billing.create': 'Add Billing',
  'permissions.billing.edit': 'Edit Billing',
  'permissions.billing.delete': 'Delete Billing',
  'permissions.billing.invoices': 'Manage Invoices',
  'permissions.staff.view': 'View Staff',
  'permissions.staff.manage': 'Manage Staff',
  'permissions.crm.view': 'View Contacts',
  'permissions.crm.manage': 'Manage Contacts',
  'permissions.documents.view': 'View Documents',
  'permissions.documents.upload': 'Upload Documents',
  'permissions.documents.delete': 'Delete Documents',
  'permissions.reports.view': 'View Reports',
  'permissions.reports.export': 'Export Reports',
  'permissions.messaging.view': 'View Messages',
  'permissions.messaging.send': 'Send Messages',
  'permissions.settings.roles': 'Manage Roles',
  'permissions.settings.firm': 'Firm Settings',
  'permissions.settings.audit': 'View Audit Log',
  'permissions.settings.backup': 'Backup & Restore',
};
