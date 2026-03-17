// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// ExpiredScreen - Subscription expired: plan selection + logout

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { firmService } from '@/services/firmService';
import { authService } from '@/services/authService';
import { SUBSCRIPTION_PLANS } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { addMonths } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ExpiredScreen() {
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const firmId = useAuthStore((s) => s.firmId);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, isLoading, navigate]);

  const handleSelectPlan = async (plan: (typeof SUBSCRIPTION_PLANS)[number]) => {
    if (!firmId) return;
    setIsUpdating(plan.id);

    const newExpiry = addMonths(new Date(), plan.months).toISOString();
    const { error } = await firmService.updatePlan(
      firmId,
      plan.id,
      plan.label,
      newExpiry
    );

    if (!error) {
      // Update store
      const store = useAuthStore.getState();
      store.setPlan(plan.id, newExpiry);
      navigate('/dashboard', { replace: true });
    }
    setIsUpdating(null);
  };

  const handleLogout = async () => {
    await authService.signOut();
    useAuthStore.getState().logout();
    navigate('/welcome', { replace: true });
  };

  return (
    <div dir={direction} className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        <PageHeader
          title={t('auth.expired.title')}
          description={t('auth.expired.message')}
        />

        <div className="grid gap-4 md:grid-cols-3 mt-6">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <Card key={plan.id} className="text-center">
              <CardHeader>
                <CardTitle className="text-lg">{t(plan.label)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-2xl font-bold text-foreground">
                  {formatMoney(plan.price)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('auth.expired.perMonth')}
                </p>
                <Button
                  className="w-full"
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isUpdating !== null}
                >
                  {isUpdating === plan.id
                    ? t('common.loading')
                    : t('auth.expired.selectPlan')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button variant="outline" onClick={handleLogout}>
            {t('auth.logout')}
          </Button>
        </div>
      </div>
    </div>
  );
}
