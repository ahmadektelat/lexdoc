// CREATED: 2026-03-24
// UPDATED: 2026-03-24 22:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery } from '@tanstack/react-query';
import { auditService, type AuditListFilters } from '@/services/auditService';
import { useAuthStore } from '@/stores/useAuthStore';

export const auditKeys = {
  all: ['audit'] as const,
  lists: () => [...auditKeys.all, 'list'] as const,
  list: (firmId: string, filters: AuditListFilters) =>
    [...auditKeys.lists(), firmId, filters] as const,
  entity: (entityType: string, entityId: string) =>
    [...auditKeys.all, 'entity', entityType, entityId] as const,
};

export function useAuditEntries(filters: AuditListFilters = {}) {
  const firmId = useAuthStore((s) => s.firmId);

  return useQuery({
    queryKey: auditKeys.list(firmId ?? '', filters),
    queryFn: () => auditService.list(firmId!, filters),
    enabled: !!firmId,
  });
}

export function useAuditByEntity(entityType: string, entityId: string) {
  const firmId = useAuthStore((s) => s.firmId);

  return useQuery({
    queryKey: auditKeys.entity(entityType, entityId),
    queryFn: () => auditService.getByEntity(firmId!, entityType, entityId),
    enabled: !!firmId && !!entityType && !!entityId,
  });
}
