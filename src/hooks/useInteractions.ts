// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { interactionService } from '@/services/interactionService';
import type { CreateInteractionInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';

export const interactionKeys = {
  all: ['interactions'] as const,
  lists: () => [...interactionKeys.all, 'list'] as const,
  list: (firmId: string, clientId?: string) => [...interactionKeys.lists(), firmId, clientId] as const,
};

export function useInteractions(firmId: string | null, clientId?: string) {
  return useQuery({
    queryKey: interactionKeys.list(firmId ?? '', clientId),
    queryFn: () => interactionService.list(firmId!, clientId),
    enabled: !!firmId,
  });
}

export function useCreateInteraction() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateInteractionInput }) =>
      interactionService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interactionKeys.lists() });
      toast.success(t('interactions.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateInteraction() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: Partial<CreateInteractionInput> }) =>
      interactionService.update(firmId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interactionKeys.lists() });
      toast.success(t('interactions.updateSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteInteraction() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => interactionService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interactionKeys.lists() });
      toast.success(t('interactions.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
