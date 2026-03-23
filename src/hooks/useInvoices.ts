// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoiceService } from '@/services/invoiceService';
import type { CreateInvoiceInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';
import { billingKeys } from './useBilling';

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (firmId: string, clientId?: string) => [...invoiceKeys.lists(), firmId, clientId] as const,
};

export function useInvoices(firmId: string | null, clientId?: string) {
  return useQuery({
    queryKey: invoiceKeys.list(firmId ?? '', clientId),
    queryFn: () => invoiceService.list(firmId!, clientId),
    enabled: !!firmId,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateInvoiceInput }) =>
      invoiceService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: billingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
      toast.success(t('invoices.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      invoiceService.markPaid(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
      toast.success(t('invoices.paidSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useMarkInvoiceSent() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      invoiceService.markSent(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => invoiceService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: billingKeys.lists() });
      toast.success(t('invoices.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
