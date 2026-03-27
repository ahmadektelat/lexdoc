// CREATED: 2026-03-24
// UPDATED: 2026-03-24 22:00 IST (Jerusalem)
//          - Initial implementation

import { useMutation } from '@tanstack/react-query';
import { auditService } from '@/services/auditService';
import { useAuthStore } from '@/stores/useAuthStore';
import type { AuditEntry } from '@/types';

export function useAuditLog() {
  const firmId = useAuthStore((s) => s.firmId);
  const user = useAuthStore((s) => s.user);

  const mutation = useMutation({
    mutationFn: (entry: Omit<AuditEntry, 'id' | 'firm_id' | 'timestamp'>) =>
      auditService.log(firmId!, entry),
  });

  const logAction = (
    action: string,
    target?: string,
    entityType?: string,
    entityId?: string,
    details?: Record<string, unknown>
  ) => {
    if (!firmId || !user) return;

    mutation.mutate({
      userId: user.id,
      userName: user.name ?? user.email ?? 'Unknown',
      action,
      target,
      entityType,
      entityId,
      details,
    });
  };

  return { logAction };
}
