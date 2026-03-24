// CREATED: 2026-03-24
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery } from '@tanstack/react-query';
import { clientService } from '@/services/clientService';
import { billingService } from '@/services/billingService';
import { taskService } from '@/services/taskService';
import { filingService } from '@/services/filingService';
import type { Client, Task, Filing } from '@/types';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  metrics: (firmId: string) => [...dashboardKeys.all, 'metrics', firmId] as const,
  activeClients: (firmId: string) => [...dashboardKeys.metrics(firmId), 'activeClients'] as const,
  pendingCharges: (firmId: string) => [...dashboardKeys.metrics(firmId), 'pendingCharges'] as const,
  openTasks: (firmId: string) => [...dashboardKeys.metrics(firmId), 'openTasks'] as const,
  overdueTasks: (firmId: string) => [...dashboardKeys.metrics(firmId), 'overdueTasks'] as const,
  recentClients: (firmId: string, limit: number) => [...dashboardKeys.all, 'recentClients', firmId, limit] as const,
  upcomingFilings: (firmId: string, limit: number) => [...dashboardKeys.all, 'upcomingFilings', firmId, limit] as const,
  pendingTasks: (firmId: string, limit: number) => [...dashboardKeys.all, 'pendingTasks', firmId, limit] as const,
};

export function useDashboardMetrics(firmId: string | null) {
  const activeClients = useQuery({
    queryKey: dashboardKeys.activeClients(firmId ?? ''),
    queryFn: () => clientService.countActive(firmId!),
    enabled: !!firmId,
  });
  const pendingCharges = useQuery({
    queryKey: dashboardKeys.pendingCharges(firmId ?? ''),
    queryFn: () => billingService.totalPending(firmId!),
    enabled: !!firmId,
  });
  const openTasks = useQuery({
    queryKey: dashboardKeys.openTasks(firmId ?? ''),
    queryFn: () => taskService.countOpen(firmId!),
    enabled: !!firmId,
  });
  const overdueTasks = useQuery({
    queryKey: dashboardKeys.overdueTasks(firmId ?? ''),
    queryFn: () => taskService.countOverdue(firmId!),
    enabled: !!firmId,
  });

  return {
    activeClients: activeClients.data ?? 0,
    pendingCharges: pendingCharges.data ?? 0,
    openTasks: openTasks.data ?? 0,
    overdueTasks: overdueTasks.data ?? 0,
    isLoading: activeClients.isLoading || pendingCharges.isLoading || openTasks.isLoading || overdueTasks.isLoading,
  };
}

export function useRecentClients(firmId: string | null, limit: number) {
  return useQuery<Client[]>({
    queryKey: dashboardKeys.recentClients(firmId ?? '', limit),
    queryFn: () => clientService.listRecent(firmId!, limit),
    enabled: !!firmId,
  });
}

export function useUpcomingFilings(firmId: string | null, limit: number) {
  return useQuery<(Filing & { clientName: string })[]>({
    queryKey: dashboardKeys.upcomingFilings(firmId ?? '', limit),
    queryFn: () => filingService.upcomingByFirm(firmId!, limit),
    enabled: !!firmId,
  });
}

export function usePendingTasks(firmId: string | null, limit: number) {
  return useQuery<(Task & { clientName?: string })[]>({
    queryKey: dashboardKeys.pendingTasks(firmId ?? '', limit),
    queryFn: () => taskService.listOpenByFirm(firmId!, limit),
    enabled: !!firmId,
  });
}
