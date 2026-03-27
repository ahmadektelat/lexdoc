// CREATED: 2026-03-24
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Initial implementation

import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUpcomingFilings } from '@/hooks/useDashboard';
import { formatDate, daysLeft, isOverdue } from '@/lib/dates';
import { FILING_TYPE_I18N_KEYS, FILING_TYPE_BADGE_CLASSES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { FilingType } from '@/types';

export function UpcomingFilings() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: filings, isLoading } = useUpcomingFilings(firmId, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <h3 className="text-lg font-semibold text-foreground">{t('dashboard.upcomingFilings')}</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate('/filings')}>
          {t('dashboard.viewAll')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSpinner size="sm" className="py-8" />
        ) : !filings?.length ? (
          <EmptyState icon={Calendar} title={t('dashboard.noFilings')} />
        ) : (
          <div className="space-y-3">
            {filings.map((filing) => {
              const overdue = isOverdue(filing.due);
              const days = daysLeft(filing.due);

              return (
                <div
                  key={filing.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors',
                    overdue && 'bg-destructive/5'
                  )}
                  onClick={() => navigate('/filings')}
                >
                  <div className="flex items-center gap-2">
                    <Badge className={cn('border-transparent', FILING_TYPE_BADGE_CLASSES[filing.type as FilingType])}>
                      {t(FILING_TYPE_I18N_KEYS[filing.type as FilingType])}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{filing.clientName}</span>
                  </div>
                  <div className="text-end">
                    <p className="text-sm text-muted-foreground" dir="ltr">{formatDate(filing.due)}</p>
                    <p className={cn('text-xs', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                      {overdue
                        ? t('dashboard.overdue')
                        : t('dashboard.dueIn').replace('{days}', String(days))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
