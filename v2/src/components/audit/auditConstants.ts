// CREATED: 2026-03-24
// UPDATED: 2026-03-24 22:00 IST (Jerusalem)
//          - Initial implementation

export const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  login: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  logout: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  export: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  import: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  statusChange: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

export const AUDIT_ACTIONS = [
  'create', 'update', 'delete', 'login', 'logout', 'export', 'import', 'statusChange',
] as const;

export const ENTITY_TYPES = [
  'client', 'filing', 'billing', 'invoice', 'task',
  'contact', 'document', 'staff', 'role', 'message',
] as const;
