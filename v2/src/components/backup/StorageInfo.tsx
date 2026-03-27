// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation

import { Users, UserCheck, Clock, FileText, FolderOpen } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBackupStats } from '@/hooks/useBackup';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';

const MAX_VISUAL = 500; // progress bar max reference

interface MetricRow {
  icon: React.ElementType;
  labelKey: string;
  count: number;
  color: string;
}

export function StorageInfo() {
  const { t } = useLanguage();
  const { data: stats, isLoading } = useBackupStats();

  if (isLoading || !stats) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <LoadingSpinner size="sm" className="py-8" />
      </div>
    );
  }

  const metrics: MetricRow[] = [
    { icon: Users, labelKey: 'backup.clientCount', count: stats.clientCount, color: 'bg-blue-500' },
    { icon: UserCheck, labelKey: 'backup.active', count: stats.activeClientCount, color: 'bg-green-500' },
    { icon: Users, labelKey: 'backup.staffCount', count: stats.staffCount, color: 'bg-purple-500' },
    { icon: Clock, labelKey: 'backup.hoursLogged', count: stats.hoursCount, color: 'bg-amber-500' },
    { icon: FileText, labelKey: 'backup.invoices', count: stats.invoiceCount, color: 'bg-red-500' },
    { icon: FolderOpen, labelKey: 'common.documents', count: stats.documentCount, color: 'bg-cyan-500' },
  ];

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <h3 className="text-lg font-semibold">{t('backup.storageTitle')}</h3>
      <div className="space-y-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          const pct = Math.min((m.count / MAX_VISUAL) * 100, 100);
          return (
            <div key={m.labelKey} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4 text-muted-foreground')} />
                  <span>{t(m.labelKey)}</span>
                </div>
                <span className="font-medium" dir="ltr">{m.count} {t('backup.records')}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', m.color)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
