// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactService } from '@/services/contactService';
import type { CreateContactInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';

export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (firmId: string, clientId?: string) => [...contactKeys.lists(), firmId, clientId] as const,
  details: () => [...contactKeys.all, 'detail'] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
};

export function useContacts(firmId: string | null, clientId?: string) {
  return useQuery({
    queryKey: contactKeys.list(firmId ?? '', clientId),
    queryFn: () => contactService.list(firmId!, clientId),
    enabled: !!firmId,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateContactInput }) =>
      contactService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success(t('contacts.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: Partial<CreateContactInput> }) =>
      contactService.update(firmId, id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(variables.id) });
      toast.success(t('contacts.updateSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => contactService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success(t('contacts.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
