// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingService } from '@/services/billingService';
import type { CreateBillingInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';

export const billingKeys = {
  all: ['billing'] as const,
  lists: () => [...billingKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string) => [...billingKeys.lists(), firmId, clientId] as const,
  balance: (firmId: string, clientId: string) => [...billingKeys.all, 'balance', firmId, clientId] as const,
};

export function useBillingEntries(firmId: string | null, clientId: string) {
  return useQuery({
    queryKey: billingKeys.list(firmId ?? '', clientId),
    queryFn: () => billingService.list(firmId!, clientId),
    enabled: !!firmId,
  });
}

export function useBillingBalance(firmId: string | null, clientId: string) {
  return useQuery({
    queryKey: billingKeys.balance(firmId ?? '', clientId),
    queryFn: () => billingService.getBalance(firmId!, clientId),
    enabled: !!firmId,
  });
}

export function useCreateBillingEntry() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateBillingInput }) =>
      billingService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
      toast.success(t('billing.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useMarkBillingPaid() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      billingService.markPaid(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
      toast.success(t('billing.statusPaid'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useCancelBillingEntry() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      billingService.cancel(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
      toast.success(t('billing.cancelled'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteBillingEntry() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => billingService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
