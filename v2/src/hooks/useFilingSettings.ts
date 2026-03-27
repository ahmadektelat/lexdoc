// CREATED: 2026-03-19
// UPDATED: 2026-03-19 15:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filingSettingService } from '@/services/filingSettingService';
import type { FilingSetting } from '@/types';

export const filingSettingKeys = {
  all: ['filingSettings'] as const,
  lists: () => [...filingSettingKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string) =>
    [...filingSettingKeys.lists(), firmId, clientId] as const,
};

export function useFilingSettings(firmId: string | null, clientId: string | undefined) {
  return useQuery({
    queryKey: filingSettingKeys.list(firmId ?? '', clientId ?? ''),
    queryFn: () => filingSettingService.get(firmId!, clientId!),
    enabled: !!firmId && !!clientId,
  });
}

export function useSaveFilingSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ firmId, setting }: { firmId: string; setting: FilingSetting }) =>
      filingSettingService.save(firmId, setting),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: filingSettingKeys.lists() });
    },
  });
}
