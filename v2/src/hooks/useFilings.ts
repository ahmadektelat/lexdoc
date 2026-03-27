// CREATED: 2026-03-19
// UPDATED: 2026-03-19 15:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filingService } from '@/services/filingService';
import { taskService } from '@/services/taskService';
import { filingSettingKeys } from '@/hooks/useFilingSettings';
import { taskKeys } from '@/hooks/useTasks';
import type { FilingSetting } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

export const filingKeys = {
  all: ['filings'] as const,
  lists: () => [...filingKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string, year: number) =>
    [...filingKeys.lists(), firmId, clientId, year] as const,
};

export const filingLateCountKeys = {
  all: ['filingLateCounts'] as const,
  list: (firmId: string, year: number) => [...filingLateCountKeys.all, firmId, year] as const,
};

export function useFilings(firmId: string | null, clientId: string | undefined, year: number) {
  return useQuery({
    queryKey: filingKeys.list(firmId ?? '', clientId ?? '', year),
    queryFn: () => filingService.list(firmId!, clientId!, year),
    enabled: !!firmId && !!clientId,
  });
}

export function useFilingLateCounts(firmId: string | null, year: number) {
  return useQuery({
    queryKey: filingLateCountKeys.list(firmId ?? '', year),
    queryFn: () => filingService.lateCountsByFirm(firmId!, year),
    enabled: !!firmId,
  });
}

export function useMarkFiled() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      filingService.markFiled(firmId, id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: filingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: filingLateCountKeys.all });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      // Cancel auto-task for this filing (fire-and-forget)
      taskService.cancelAutoTaskForFiling(variables.firmId, _data.id).catch(() => {});
      toast.success(t('filings.markedFiled'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useMarkLate() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      filingService.markLate(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: filingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: filingLateCountKeys.all });
      toast.success(t('filings.markedLate'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useResetToPending() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      filingService.resetToPending(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: filingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: filingLateCountKeys.all });
      toast.success(t('filings.resetSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRegenerateSchedule() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({
      firmId,
      clientId,
      year,
      settings,
    }: {
      firmId: string;
      clientId: string;
      year: number;
      settings: FilingSetting;
    }) => filingService.regenerateSchedule(firmId, clientId, year, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: filingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: filingLateCountKeys.all });
      queryClient.invalidateQueries({ queryKey: filingSettingKeys.lists() });
      toast.success(t('filings.settingsUpdated'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
