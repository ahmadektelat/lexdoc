// CREATED: 2026-03-18
// UPDATED: 2026-03-18 14:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientStaffService } from '@/services/clientStaffService';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

export const clientStaffKeys = {
  all: ['clientStaff'] as const,
  byClient: (clientId: string) => [...clientStaffKeys.all, 'client', clientId] as const,
  byStaff: (staffId: string) => [...clientStaffKeys.all, 'staff', staffId] as const,
};

export function useClientStaffAssignments(clientId: string | undefined) {
  return useQuery({
    queryKey: clientStaffKeys.byClient(clientId ?? ''),
    queryFn: () => clientStaffService.getAssignments(clientId!),
    enabled: !!clientId,
  });
}

export function useStaffClientAssignments(staffId: string | undefined) {
  return useQuery({
    queryKey: clientStaffKeys.byStaff(staffId ?? ''),
    queryFn: () => clientStaffService.getStaffClients(staffId!),
    enabled: !!staffId,
  });
}

export function useAssignStaff() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ clientId, staffId, isPrimary }: { clientId: string; staffId: string; isPrimary?: boolean }) =>
      clientStaffService.assignStaff(clientId, staffId, isPrimary),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientStaffKeys.all });
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRemoveStaffAssignment() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ clientId, staffId }: { clientId: string; staffId: string }) =>
      clientStaffService.removeAssignment(clientId, staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientStaffKeys.all });
    },
    onError: () => {
      toast.error(t('errors.saveFailed'));
    },
  });
}
