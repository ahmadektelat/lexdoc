// CREATED: 2026-03-24
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Initial implementation

import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useRecentClients } from '@/hooks/useDashboard';
import { formatMoney } from '@/lib/money';

export function RecentClients() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients, isLoading } = useRecentClients(firmId, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <h3 className="text-lg font-semibold text-foreground">{t('dashboard.recentClients')}</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate('/clients')}>
          {t('dashboard.viewAll')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSpinner size="sm" className="py-8" />
        ) : !clients?.length ? (
          <EmptyState icon={Users} title={t('dashboard.noClients')} />
        ) : (
          <div className="space-y-3">
            {clients.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                <div>
                  <p className="font-medium text-foreground">{client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.caseNum')}{' '}
                    <span dir="ltr">{client.caseNum}</span>
                  </p>
                </div>
                <p className="text-sm font-medium text-foreground" dir="ltr">
                  {formatMoney(client.monthlyFee)}
                  <span className="text-muted-foreground ms-1">{t('dashboard.perMonth')}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
