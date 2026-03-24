// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation with PII warning dialog

import { useState } from 'react';
import { HardDrive, Users, UserCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBackupStats, useCreateBackup } from '@/hooks/useBackup';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function BackupCard() {
  const { t } = useLanguage();
  const { data: stats } = useBackupStats();
  const createBackup = useCreateBackup();
  const [piiWarningOpen, setPiiWarningOpen] = useState(false);

  const handleDownloadClick = () => {
    setPiiWarningOpen(true);
  };

  const handleConfirmDownload = () => {
    createBackup.mutate();
  };

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{t('backup.backupData')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('backup.backupDesc')}</p>
      </div>

      {stats && (
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {stats.clientCount} {t('backup.clientCount')}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <UserCheck className="h-3 w-3" />
            {stats.staffCount} {t('backup.staffCount')}
          </Badge>
        </div>
      )}

      <Button
        onClick={handleDownloadClick}
        disabled={createBackup.isPending}
        className="gap-2"
      >
        <HardDrive className="h-4 w-4" />
        {createBackup.isPending ? t('backup.creating') : t('backup.downloadBackup')}
      </Button>

      <ConfirmDialog
        open={piiWarningOpen}
        onOpenChange={setPiiWarningOpen}
        title={t('backup.piiWarningTitle')}
        description={t('backup.piiWarningDesc')}
        confirmLabel={t('backup.downloadBackup')}
        onConfirm={handleConfirmDownload}
      />
    </div>
  );
}
