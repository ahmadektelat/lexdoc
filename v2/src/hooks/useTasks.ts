// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskService } from '@/services/taskService';
import type { CreateTaskInput } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (firmId: string, clientId?: string) => [...taskKeys.lists(), firmId, clientId] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

export function useTasks(firmId: string | null, clientId?: string) {
  return useQuery({
    queryKey: taskKeys.list(firmId ?? '', clientId),
    queryFn: () => taskService.list(firmId!, clientId),
    enabled: !!firmId,
  });
}

export function useTask(id: string | undefined) {
  const firmId = useAuthStore((s) => s.firmId);

  return useQuery({
    queryKey: taskKeys.detail(id ?? ''),
    queryFn: () => taskService.getById(firmId!, id!),
    enabled: !!id && !!firmId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateTaskInput }) =>
      taskService.create(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      toast.success(t('tasks.createSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: Partial<CreateTaskInput> }) =>
      taskService.update(firmId, id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.id) });
      toast.success(t('tasks.updateSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useToggleTaskStatus() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => taskService.toggleStatus(firmId!, id),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
      toast.success(task.status === 'done' ? t('tasks.completeSuccess') : t('tasks.reopenSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => taskService.delete(firmId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      toast.success(t('tasks.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRunAutoTaskEngine() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: () => taskService.runAutoTaskEngine(firmId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      toast.success(t('tasks.autoEngineCreated'));
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useCancelAutoTaskForFiling() {
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);

  return useMutation({
    mutationFn: (filingId: string) => taskService.cancelAutoTaskForFiling(firmId!, filingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
    onError: () => {
      // Silent failure for auto-task cancellation
    },
  });
}
