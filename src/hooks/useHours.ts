// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hoursService } from '@/services/hoursService';
import type { CreateHoursInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';

export const hoursKeys = {
  all: ['hours'] as const,
  lists: () => [...hoursKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string) => [...hoursKeys.lists(), firmId, clientId] as const,
};

export function useHours(firmId: string | null, clientId: string) {
  return useQuery({
    queryKey: hoursKeys.list(firmId ?? '', clientId),
    queryFn: () => hoursService.list(firmId!, clientId),
    enabled: !!firmId,
  });
}

export function useCreateHoursEntry() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateHoursInput }) =>
      hoursService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hoursKeys.lists() });
      toast.success(t('hours.logSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteHoursEntry() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => hoursService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hoursKeys.lists() });
      toast.success(t('common.delete'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
