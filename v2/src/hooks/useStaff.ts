// CREATED: 2026-03-18
// UPDATED: 2026-03-18 14:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffService } from '@/services/staffService';
import type { CreateStaffInput, UpdateStaffInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';

export const staffKeys = {
  all: ['staff'] as const,
  lists: () => [...staffKeys.all, 'list'] as const,
  list: (firmId: string) => [...staffKeys.lists(), firmId] as const,
  details: () => [...staffKeys.all, 'detail'] as const,
  detail: (id: string) => [...staffKeys.details(), id] as const,
};

export function useStaff(firmId: string | null) {
  return useQuery({
    queryKey: staffKeys.list(firmId ?? ''),
    queryFn: () => staffService.list(firmId!),
    enabled: !!firmId,
  });
}

export function useStaffMember(id: string | undefined) {
  const firmId = useAuthStore((s) => s.firmId);

  return useQuery({
    queryKey: staffKeys.detail(id ?? ''),
    queryFn: () => staffService.getById(firmId!, id!),
    enabled: !!id && !!firmId,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateStaffInput }) =>
      staffService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      toast.success(t('staff.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: UpdateStaffInput }) =>
      staffService.update(firmId, id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      queryClient.invalidateQueries({ queryKey: staffKeys.detail(variables.id) });
      toast.success(t('staff.updateSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => staffService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      toast.success(t('staff.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
