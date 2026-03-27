// CREATED: 2026-03-19
// UPDATED: 2026-03-19 16:00 IST (Jerusalem)
//          - Fixed dynamic Tailwind classes with static badge lookup
//          - Added dark mode support for action buttons

import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMarkFiled, useMarkLate, useResetToPending } from '@/hooks/useFilings';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, isOverdue } from '@/lib/dates';
import { FILING_TYPE_I18N_KEYS, FILING_TYPE_BADGE_CLASSES } from '@/lib/constants';
import type { Filing, FilingStatus } from '@/types';

function getEffectiveStatus(filing: Filing): FilingStatus {
  if (filing.status === 'pending' && isOverdue(filing.due)) return 'late';
  return filing.status;
}

interface FilingScheduleTableProps {
  filings: Filing[];
  firmId: string;
}

export function FilingScheduleTable({ filings, firmId }: FilingScheduleTableProps) {
  const { t } = useLanguage();
  const can = useAuthStore((s) => s.can);
  const markFiled = useMarkFiled();
  const markLate = useMarkLate();
  const resetToPending = useResetToPending();

  if (filings.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">{t('filings.noFilings')}</p>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('filings.columns.type')}</th>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('filings.columns.period')}</th>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('filings.columns.dueDate')}</th>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('filings.columns.status')}</th>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('filings.columns.filedDate')}</th>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('filings.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {filings.map((filing) => {
            const isOverdueRow = filing.status === 'pending' && isOverdue(filing.due);
            const effectiveStatus = getEffectiveStatus(filing);

            return (
              <tr
                key={filing.id}
                className={`border-b last:border-b-0 ${isOverdueRow ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
              >
                <td className="px-4 py-3">
                  <Badge className={`${FILING_TYPE_BADGE_CLASSES[filing.type]} border-transparent`}>
                    {t(FILING_TYPE_I18N_KEYS[filing.type])}
                  </Badge>
                </td>
                <td className="px-4 py-3" dir="ltr">{filing.period}</td>
                <td className="px-4 py-3" dir="ltr">{formatDate(filing.due)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={effectiveStatus} />
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {filing.filedDate ? formatDate(filing.filedDate) : '—'}
                </td>
                <td className="px-4 py-3">
                  {can('filings.edit') && (
                    <div className="flex items-center gap-1">
                      {(filing.status === 'pending' || filing.status === 'late') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950/20"
                          onClick={() => markFiled.mutate({ firmId, id: filing.id })}
                          disabled={markFiled.isPending}
                        >
                          {t('filings.markFiled')}
                        </Button>
                      )}
                      {filing.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950/20"
                          onClick={() => markLate.mutate({ firmId, id: filing.id })}
                          disabled={markLate.isPending}
                        >
                          {t('filings.markLate')}
                        </Button>
                      )}
                      {(filing.status === 'filed' || filing.status === 'late') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resetToPending.mutate({ firmId, id: filing.id })}
                          disabled={resetToPending.isPending}
                        >
                          {t('filings.reset')}
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
