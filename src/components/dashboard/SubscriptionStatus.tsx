// CREATED: 2026-03-24
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Initial implementation

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { daysLeft, formatDate } from '@/lib/dates';

export function SubscriptionStatus() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const firmData = useAuthStore((s) => s.firmData);

  if (!firmData?.expiry) return null;

  const remaining = daysLeft(firmData.expiry);
  if (remaining > 60) return null;

  const progressWidth = Math.max(0, Math.min(100, (remaining / 365) * 100));

  return (
    <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">{t('dashboard.subscription')}</h3>
          <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            {t('dashboard.subscriptionActive')}
          </Badge>
        </div>

        <p className="text-sm text-foreground mb-1">{firmData.planLabel}</p>
        <p className="text-sm text-muted-foreground mb-3">
          {t('dashboard.until')} {formatDate(firmData.expiry)}
        </p>

        <div className="w-full bg-muted rounded-full h-2 mb-2">
          <div
            className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {t('dashboard.daysRemaining').replace('{days}', String(Math.max(0, remaining)))}
        </p>

        <Button onClick={() => navigate('/settings')} size="sm">
          {t('dashboard.renewSubscription')}
        </Button>
      </CardContent>
    </Card>
  );
}
