// CREATED: 2026-03-24
// UPDATED: 2026-03-26 12:30 IST (Jerusalem)
//          - Added useCronStatus hook for cron status indicator

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { messageService } from '@/services/messageService';
import type {
  CreateMessageTemplateInput, UpdateMessageTemplateInput,
  CreateMessageInput, CreateScheduledInput, MessageChannel,
} from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

// --- Query Key Factory ---
export const messageKeys = {
  all: ['messages'] as const,
  templates: () => [...messageKeys.all, 'templates'] as const,
  templateList: (firmId: string) => [...messageKeys.templates(), firmId] as const,
  lists: () => [...messageKeys.all, 'list'] as const,
  list: (firmId: string, filters?: Record<string, unknown>) =>
    [...messageKeys.lists(), firmId, filters ?? {}] as const,
  scheduled: () => [...messageKeys.all, 'scheduled'] as const,
  scheduledList: (firmId: string) => [...messageKeys.scheduled(), firmId] as const,
};

// --- Template Queries ---

export function useTemplates(firmId: string | null) {
  return useQuery({
    queryKey: messageKeys.templateList(firmId ?? ''),
    queryFn: () => messageService.listTemplates(firmId!),
    enabled: !!firmId,
  });
}

export function useSeedTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ firmId }: { firmId: string }) =>
      messageService.seedDefaultTemplates(firmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.templates() });
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateMessageTemplateInput }) =>
      messageService.createTemplate(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.templates() });
      toast.success(t('messaging.templateSaved'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: UpdateMessageTemplateInput }) =>
      messageService.updateTemplate(firmId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.templates() });
      toast.success(t('messaging.templateSaved'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      messageService.deleteTemplate(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.templates() });
      toast.success(t('messaging.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

// --- Message Log Queries ---

export function useMessageLog(
  firmId: string | null,
  filters?: { clientId?: string; topic?: string; channel?: MessageChannel; fromDate?: string; toDate?: string }
) {
  return useQuery({
    queryKey: messageKeys.list(firmId ?? '', filters as Record<string, unknown>),
    queryFn: () => messageService.listMessages(firmId!, filters),
    enabled: !!firmId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, inputs }: { firmId: string; inputs: CreateMessageInput[] }) =>
      messageService.createBatchMessages(firmId, inputs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.lists() });
      toast.success(t('messaging.sendSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

// --- Scheduled Message Queries ---

export function useScheduledMessages(firmId: string | null) {
  return useQuery({
    queryKey: messageKeys.scheduledList(firmId ?? ''),
    queryFn: () => messageService.listScheduled(firmId!),
    enabled: !!firmId,
  });
}

export function useScheduleMessage() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateScheduledInput }) =>
      messageService.createScheduled(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.scheduled() });
      toast.success(t('messaging.scheduleSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useCancelScheduled() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      messageService.cancelScheduled(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.scheduled() });
      toast.success(t('messaging.cancelSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRunScheduledMessages() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId }: { firmId: string }) =>
      messageService.runScheduledMessages(firmId),
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: messageKeys.scheduled() });
      queryClient.invalidateQueries({ queryKey: messageKeys.lists() });
      toast.success(t('messaging.runResult').replace('{{count}}', String(count)));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

// --- Cron Status ---

export function useCronStatus() {
  return useQuery({
    queryKey: ['cron-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('check_cron_status');
      if (error) return false;
      return data as boolean;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
  });
}
