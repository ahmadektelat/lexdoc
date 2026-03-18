// CREATED: 2026-03-18
// UPDATED: 2026-03-18 10:00 IST (Jerusalem)
//          - Initial implementation for clients module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientService } from '@/services/clientService';
import type { CreateClientInput, UpdateClientInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (firmId: string) => [...clientKeys.lists(), firmId] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

export function useClients(firmId: string | null) {
  return useQuery({
    queryKey: clientKeys.list(firmId ?? ''),
    queryFn: () => clientService.list(firmId!),
    enabled: !!firmId,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: clientKeys.detail(id ?? ''),
    queryFn: () => clientService.getById(id!),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateClientInput }) =>
      clientService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      toast.success(t('clients.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClientInput }) =>
      clientService.update(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.id) });
      toast.success(t('clients.updateSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useArchiveClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => clientService.archive(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(id) });
      toast.success(t('clients.archiveSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRestoreClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => clientService.restore(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(id) });
      toast.success(t('clients.restoreSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => clientService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      toast.success(t('clients.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
