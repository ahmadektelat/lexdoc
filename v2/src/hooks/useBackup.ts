// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation with audit logging

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupService } from '@/services/backupService';
import { importService } from '@/services/importService';
import { auditService } from '@/services/auditService';
import type { BackupData, ImportRow } from '@/types';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { clientKeys } from '@/hooks/useClients';
import { documentKeys } from '@/hooks/useDocuments';

export const backupKeys = {
  all: ['backup'] as const,
  stats: (firmId: string) => [...backupKeys.all, 'stats', firmId] as const,
};

/** Fetch storage statistics for StorageInfo. */
export function useBackupStats() {
  const firmId = useAuthStore((s) => s.firmId);

  return useQuery({
    queryKey: backupKeys.stats(firmId ?? ''),
    queryFn: () => backupService.getStats(firmId!),
    enabled: !!firmId,
  });
}

/** Create and download a full firm backup. */
export function useCreateBackup() {
  const firmId = useAuthStore((s) => s.firmId);
  const firmName = useAuthStore((s) => s.firmName);
  const user = useAuthStore((s) => s.user);
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async () => {
      const backup = await backupService.createBackup(firmId!, firmName ?? 'backup');
      // Trigger download
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `${firmName ?? 'backup'}_${date}.bak`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return backup;
    },
    onSuccess: (backup) => {
      toast.success(t('backup.downloaded'));
      // Audit log
      const counts: Record<string, number> = {};
      for (const [key, arr] of Object.entries(backup.data)) {
        if (Array.isArray(arr)) counts[key] = arr.length;
      }
      auditService.log(firmId!, {
        userId: user?.id ?? '',
        userName: user?.name ?? '',
        action: 'backup_created',
        target: firmName ?? '',
        entityType: 'backup',
        details: { counts },
      }).catch(() => { /* best-effort */ });
    },
    onError: () => {
      toast.error(t('errors.generic'));
    },
  });
}

/** Restore a firm backup from a parsed BackupData object. */
export function useRestoreBackup() {
  const firmId = useAuthStore((s) => s.firmId);
  const user = useAuthStore((s) => s.user);
  const firmName = useAuthStore((s) => s.firmName);
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (backup: BackupData) =>
      backupService.restoreBackup(firmId!, backup),
    onSuccess: (result, backup) => {
      queryClient.invalidateQueries();
      if (result.errors.length > 0) {
        toast.warning(`${t('backup.restoreSuccess')} (${result.errors.length} errors)`);
      } else {
        toast.success(t('backup.restoreSuccess'));
      }
      // Audit log
      const totalInserted = Object.values(result.inserted).reduce((a, b) => a + b, 0);
      const totalSkipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);
      auditService.log(firmId!, {
        userId: user?.id ?? '',
        userName: user?.name ?? '',
        action: 'backup_restored',
        target: firmName ?? '',
        entityType: 'backup',
        details: {
          inserted: totalInserted,
          skipped: totalSkipped,
          foreignFirm: backup.firmId !== firmId,
          backupFirmName: backup.firmName,
        },
      }).catch(() => { /* best-effort */ });
    },
    onError: () => {
      toast.error(t('backup.restoreFailed'));
    },
  });
}

/** Import validated client rows. */
export function useImportClients() {
  const firmId = useAuthStore((s) => s.firmId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: (validRows: ImportRow[]) =>
      importService.importClients(firmId!, validRows),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: documentKeys.folders() });
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
      toast.success(t('import.imported').replace('{count}', String(result.imported)));
      // Audit log
      auditService.log(firmId!, {
        userId: user?.id ?? '',
        userName: user?.name ?? '',
        action: 'clients_imported',
        target: `${result.imported} clients`,
        entityType: 'client',
        details: {
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors.length,
        },
      }).catch(() => { /* best-effort */ });
    },
    onError: () => {
      toast.error(t('errors.generic'));
    },
  });
}
