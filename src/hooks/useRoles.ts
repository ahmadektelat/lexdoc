// CREATED: 2026-03-19
// UPDATED: 2026-03-19 10:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roleService } from '@/services/roleService';
import type { CreateRoleInput, UpdateRoleInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';

export const roleKeys = {
  all: ['roles'] as const,
  lists: () => [...roleKeys.all, 'list'] as const,
  list: (firmId: string) => [...roleKeys.lists(), firmId] as const,
  details: () => [...roleKeys.all, 'detail'] as const,
  detail: (id: string) => [...roleKeys.details(), id] as const,
  staffRoles: () => [...roleKeys.all, 'staffRoles'] as const,
  staffRoleList: (firmId: string) => [...roleKeys.staffRoles(), firmId] as const,
};

export function useRoles(firmId: string | null) {
  return useQuery({
    queryKey: roleKeys.list(firmId ?? ''),
    queryFn: () => roleService.list(firmId!),
    enabled: !!firmId,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateRoleInput }) =>
      roleService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      toast.success(t('permissions.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: UpdateRoleInput }) =>
      roleService.update(firmId, id, input),
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.id) });
      toast.success(t('permissions.updateSuccess'));

      // Re-fetch permissions if the updated role is the current user's role
      try {
        const firmId = useAuthStore.getState().firmId;
        if (firmId) {
          const permissions = await roleService.getPermissionsForUser(firmId);
          const permissionsRecord: Record<string, boolean> = {};
          for (const p of permissions) {
            permissionsRecord[p] = true;
          }
          useAuthStore.getState().setPermissions(permissionsRecord);
        }
      } catch {
        // Silently fail — permission re-fetch is best-effort
      }
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => roleService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      toast.success(t('permissions.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useStaffRoles(firmId: string | null) {
  return useQuery({
    queryKey: roleKeys.staffRoleList(firmId ?? ''),
    queryFn: () => roleService.getStaffRoles(firmId!),
    enabled: !!firmId,
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ staffId, roleId }: { staffId: string; roleId: string }) =>
      roleService.assignRole(staffId, roleId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.staffRoles() });
      toast.success(t('permissions.roleAssigned'));

      // Re-fetch own permissions in case the assignment was for the current user
      try {
        const firmId = useAuthStore.getState().firmId;
        if (firmId) {
          const permissions = await roleService.getPermissionsForUser(firmId);
          const permissionsRecord: Record<string, boolean> = {};
          for (const p of permissions) {
            permissionsRecord[p] = true;
          }
          useAuthStore.getState().setPermissions(permissionsRecord);
        }
      } catch {
        // Silently fail
      }
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRemoveRole() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (staffId: string) => roleService.removeRole(staffId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.staffRoles() });
      toast.success(t('permissions.roleAssigned'));

      // Re-fetch own permissions
      try {
        const firmId = useAuthStore.getState().firmId;
        if (firmId) {
          const permissions = await roleService.getPermissionsForUser(firmId);
          const permissionsRecord: Record<string, boolean> = {};
          for (const p of permissions) {
            permissionsRecord[p] = true;
          }
          useAuthStore.getState().setPermissions(permissionsRecord);
        }
      } catch {
        // Silently fail
      }
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
