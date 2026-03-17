// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// OnboardStep3 - Success confirmation (step 3 of 3)

import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

const CHECKLIST_KEYS = [
  'auth.onboard.firmConfigured',
  'auth.onboard.subscriptionActive',
  'auth.onboard.securityEnabled',
  'auth.onboard.auditReady',
];

export function OnboardStep3() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        {t('auth.onboard.success')}
      </h2>
      <ul className="space-y-3 text-start">
        {CHECKLIST_KEYS.map((key) => (
          <li key={key} className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm text-foreground">{t(key)}</span>
          </li>
        ))}
      </ul>
      <Button
        className="w-full"
        size="lg"
        onClick={() => navigate('/login', { replace: true })}
      >
        {t('auth.onboard.goToLogin')}
      </Button>
    </div>
  );
}
