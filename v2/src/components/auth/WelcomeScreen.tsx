// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// WelcomeScreen - Landing page with branding, login/register navigation, theme, language

import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ThemePicker } from '@/components/shared/ThemePicker';
import { LanguageSelector } from '@/components/shared/LanguageSelector';

export function WelcomeScreen() {
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, isLoading, navigate]);

  return (
    <div
      dir={direction}
      className="min-h-screen flex items-center justify-center bg-background p-4"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold">
            {t('auth.appName')}
          </CardTitle>
          <CardDescription className="text-base">
            {t('auth.appDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={() => navigate('/login')}
            >
              {t('auth.loginButton')}
            </Button>
            <Button
              className="w-full"
              size="lg"
              variant="outline"
              onClick={() => navigate('/register')}
            >
              {t('auth.registerButton')}
            </Button>
          </div>
          <div className="space-y-3 pt-4 border-t border-border">
            <ThemePicker />
            <LanguageSelector />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
