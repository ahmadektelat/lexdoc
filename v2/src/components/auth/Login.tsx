// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// Login - Login form with lockout handling and subscription status display

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { authService } from '@/services/authService';
import { FormField } from '@/components/shared/FormField';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { daysLeft } from '@/lib/dates';
import { toast } from 'sonner';

export function Login() {
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loginSucceededRef = useRef(false);

  // Redirect to dashboard if already authenticated.
  // After successful signIn, the useAuth listener populates the store —
  // this effect detects that and navigates + shows the subscription toast.
  const firmData = useAuthStore((s) => s.firmData);
  useEffect(() => {
    if (!isLoading && user) {
      if (loginSucceededRef.current && firmData) {
        // Show subscription toast on fresh login
        const days = daysLeft(firmData.expiry);
        toast.success(
          t('auth.login.subscription').replace(
            '{plan}',
            t(firmData.planLabel)
          ),
          {
            description:
              days > 0
                ? t('auth.login.daysRemaining').replace('{n}', String(days))
                : undefined,
          }
        );
        loginSucceededRef.current = false;
      }
      if (firmData) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, isLoading, firmData, navigate, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authService.signIn(email, password);

      if (result.isLocked) {
        setIsLocked(true);
        setError(t('auth.login.locked'));
        setIsSubmitting(false);
        return;
      }

      if (result.error) {
        setFailedCount(result.failedCount);
        const attemptMsg =
          result.failedCount > 0
            ? `\n${t('auth.login.attemptCount').replace('{n}', String(result.failedCount))}`
            : '';
        setError(`${t('auth.login.wrongPassword')}${attemptMsg}`);
        setIsSubmitting(false);
        return;
      }

      // Success — navigate immediately. ProtectedRoute will show a spinner
      // while useAuth finishes loading firm data in the background.
      loginSucceededRef.current = true;
      navigate('/dashboard', { replace: true });
    } catch {
      setError(t('auth.errors.signInFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      dir={direction}
      className="min-h-screen flex items-center justify-center bg-background p-4"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {t('auth.login.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label={t('common.email')} required>
              <Input
                dir="ltr"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={isLocked}
              />
            </FormField>

            <FormField label={t('auth.password')} required>
              <Input
                dir="ltr"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLocked}
              />
            </FormField>

            {error && (
              <p className="text-sm text-destructive text-center whitespace-pre-line">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || isLocked}
            >
              {isSubmitting
                ? t('auth.login.authenticating')
                : t('auth.login.submit')}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              {t('auth.login.noAccount')}{' '}
              <Link
                to="/register"
                className="text-primary hover:underline"
              >
                {t('auth.login.registerHere')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
