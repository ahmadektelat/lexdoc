// CREATED: 2026-03-19
// UPDATED: 2026-03-19 10:00 IST (Jerusalem)
//          - Initial implementation

import { useAuthStore } from '@/stores/useAuthStore';

export function useCanAccess(permission: string): boolean {
  return useAuthStore((s) => s.can(permission));
}
