// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation with foreign-firm detection + file size limit

import { useState, useRef } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useRestoreBackup } from '@/hooks/useBackup';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BACKUP_VERSION } from '@/types/backup';
import type { BackupData } from '@/types';
import { formatFileSize } from '@/lib/format';
import { formatDateTime } from '@/lib/dates';
import { toast } from 'sonner';

const MAX_RESTORE_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function RestoreCard() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const restoreBackup = useRestoreBackup();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [foreignFirmWarning, setForeignFirmWarning] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File size check
    if (file.size > MAX_RESTORE_FILE_SIZE) {
      toast.error(t('backup.fileTooLarge').replace('{size}', formatFileSize(MAX_RESTORE_FILE_SIZE)));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;

      if (!data.version || data.version > BACKUP_VERSION) {
        setParseError(t('backup.restoreFailed'));
        setParsedBackup(null);
        return;
      }
      if (!data.data) {
        setParseError(t('backup.restoreFailed'));
        setParsedBackup(null);
        return;
      }

      setParsedBackup(data);
      setParseError(null);
      setForeignFirmWarning(data.firmId !== firmId);
    } catch {
      setParseError(t('backup.fileError'));
      setParsedBackup(null);
    }
  };

  const handleRestore = () => {
    setConfirmOpen(true);
  };

  const handleConfirmRestore = () => {
    if (!parsedBackup) return;
    restoreBackup.mutate(parsedBackup, {
      onSuccess: () => {
        setParsedBackup(null);
        setForeignFirmWarning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  // Count total records in backup
  const totalRecords = parsedBackup
    ? Object.values(parsedBackup.data).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0
      )
    : 0;

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{t('backup.restore')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('backup.restoreDesc')}</p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-300">{t('backup.restoreWarning')}</p>
      </div>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".bak,.json"
          onChange={handleFileChange}
          className="block w-full text-sm text-muted-foreground
            file:me-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-primary file:text-primary-foreground
            hover:file:bg-primary/90 cursor-pointer"
        />
      </div>

      {parseError && (
        <p className="text-sm text-destructive">{parseError}</p>
      )}

      {parsedBackup && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">v{parsedBackup.version}</Badge>
            <Badge variant="secondary" dir="ltr">{formatDateTime(parsedBackup.createdAt)}</Badge>
            <Badge variant="secondary">{totalRecords} {t('backup.records')}</Badge>
          </div>

          {foreignFirmWarning && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                {t('backup.foreignFirmWarning').replace('{firmName}', parsedBackup.firmName)}
              </p>
            </div>
          )}

          <Button
            onClick={handleRestore}
            disabled={restoreBackup.isPending}
            variant={foreignFirmWarning ? 'destructive' : 'default'}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {restoreBackup.isPending ? t('backup.restoring') : t('backup.restore')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={foreignFirmWarning ? t('backup.foreignFirmConfirm') : t('backup.restore')}
        description={foreignFirmWarning
          ? t('backup.foreignFirmWarning').replace('{firmName}', parsedBackup?.firmName ?? '')
          : t('backup.restoreWarning')
        }
        confirmLabel={t('backup.restore')}
        onConfirm={handleConfirmRestore}
        variant={foreignFirmWarning ? 'destructive' : 'default'}
      />
    </div>
  );
}
