// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// Onboard - 3-step registration wizard container

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { OnboardStep1 } from './OnboardStep1';
import { OnboardStep2 } from './OnboardStep2';
import { OnboardStep3 } from './OnboardStep3';
import type { CreateFirmInput } from '@/types';

export function Onboard() {
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, isLoading, navigate]);
  const [firmData, setFirmData] = useState<Partial<CreateFirmInput>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const stepText = t('auth.onboard.step')
    .replace('{n}', String(step))
    .replace('{total}', '3');

  return (
    <div
      dir={direction}
      className="min-h-screen flex items-center justify-center bg-background p-4"
    >
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {t('auth.onboard.title')}
          </CardTitle>
          <CardDescription>{stepText}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <OnboardStep1
              data={firmData}
              onUpdate={setFirmData}
              logoFile={logoFile}
              onLogoChange={setLogoFile}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <OnboardStep2
              firmData={firmData}
              logoFile={logoFile}
              onBack={() => setStep(1)}
              onComplete={() => setStep(3)}
            />
          )}
          {step === 3 && <OnboardStep3 />}
        </CardContent>
      </Card>
    </div>
  );
}
