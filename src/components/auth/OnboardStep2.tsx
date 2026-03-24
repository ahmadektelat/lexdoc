// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// OnboardStep2 - Credentials form + registration execution (step 2 of 3)

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { FormField } from '@/components/shared/FormField';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { validateEmail } from '@/lib/validation';
import { authService } from '@/services/authService';
import { firmService } from '@/services/firmService';
import type { CreateFirmInput } from '@/types';

interface OnboardStep2Props {
  firmData: Partial<CreateFirmInput>;
  logoFile: File | null;
  onBack: () => void;
  onComplete: () => void;
}

export function OnboardStep2({
  firmData,
  logoFile,
  onBack,
  onComplete,
}: OnboardStep2Props) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = t('auth.errors.required');
    } else if (!validateEmail(email)) {
      newErrors.email = t('auth.errors.invalidEmail');
    }
    if (!password) {
      newErrors.password = t('auth.errors.required');
    } else if (password.length < 6) {
      newErrors.password = t('auth.errors.passwordTooShort');
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = t('auth.errors.passwordMismatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Sign up with Supabase Auth
      const { error: signUpError } = await authService.signUp(
        email,
        password
      );
      if (signUpError) {
        setSubmitError(t('auth.errors.signUpFailed'));
        setIsSubmitting(false);
        return;
      }

      // 2. Sign in to establish an authenticated session.
      //    signUp alone may not create a session (depends on email confirmation setting).
      //    auth.uid() in the register_firm RPC requires an active session.
      const signInResult = await authService.signIn(email, password);
      if (signInResult.error) {
        setSubmitError(t('auth.errors.signUpFailed'));
        setIsSubmitting(false);
        return;
      }

      // 3. Create firm via atomic RPC (auth.uid() is now available)
      const { firmId, error: firmError } = await firmService.registerFirm(
        firmData as CreateFirmInput
      );
      if (firmError || !firmId) {
        setSubmitError(firmError ?? t('auth.errors.signUpFailed'));
        setIsSubmitting(false);
        return;
      }

      // 4. Upload logo if provided
      if (logoFile) {
        const { url, error: logoError } = await firmService.uploadLogo(
          firmId,
          logoFile
        );
        if (url && !logoError) {
          await firmService.updateFirm(firmId, { logo: url });
        }
      }

      // 5. Advance to success step — user stays logged in
      onComplete();
    } catch {
      setSubmitError(t('auth.errors.signUpFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormField label={t('common.email')} error={errors.email} required>
        <Input
          dir="ltr"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((prev) => ({ ...prev, email: '' }));
          }}
          placeholder="user@example.com"
        />
      </FormField>

      <FormField
        label={t('auth.password')}
        error={errors.password}
        required
        hint={t('auth.onboard.passwordHint')}
      >
        <Input
          dir="ltr"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((prev) => ({ ...prev, password: '' }));
          }}
        />
      </FormField>

      <FormField
        label={t('auth.onboard.confirmPassword')}
        error={errors.confirmPassword}
        required
      >
        <Input
          dir="ltr"
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setErrors((prev) => ({ ...prev, confirmPassword: '' }));
          }}
        />
      </FormField>

      {submitError && (
        <p className="text-sm text-destructive text-center">{submitError}</p>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onBack}
          disabled={isSubmitting}
        >
          {t('common.back')}
        </Button>
        <Button
          className="flex-1"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? t('auth.onboard.saving') : t('auth.onboard.finishSetup')}
        </Button>
      </div>
    </div>
  );
}
