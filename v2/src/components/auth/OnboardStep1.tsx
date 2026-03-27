// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// OnboardStep1 - Firm details form (step 1 of 3)

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { FormField } from '@/components/shared/FormField';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { validatePhone, validateEmail } from '@/lib/validation';
import { calculateVat, formatMoney, shekelToAgorot } from '@/lib/money';
import type { CreateFirmInput, FirmType } from '@/types';

interface OnboardStep1Props {
  data: Partial<CreateFirmInput>;
  onUpdate: (data: Partial<CreateFirmInput>) => void;
  logoFile: File | null;
  onLogoChange: (file: File | null) => void;
  onNext: () => void;
}

const FIRM_TYPES: { value: FirmType; labelKey: string }[] = [
  { value: 'lawyer', labelKey: 'auth.onboard.firmType.lawyer' },
  { value: 'cpa', labelKey: 'auth.onboard.firmType.cpa' },
  { value: 'combined', labelKey: 'auth.onboard.firmType.combined' },
  { value: 'notary', labelKey: 'auth.onboard.firmType.notary' },
];

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function OnboardStep1({
  data,
  onUpdate,
  logoFile,
  onLogoChange,
  onNext,
}: OnboardStep1Props) {
  const { t } = useLanguage();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feeInput, setFeeInput] = useState(
    data.defaultFee ? String(data.defaultFee / 100) : ''
  );

  const update = (field: keyof CreateFirmInput, value: unknown) => {
    onUpdate({ ...data, [field]: value });
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_LOGO_SIZE) {
      setErrors((prev) => ({ ...prev, logo: t('auth.onboard.logoHint') }));
      return;
    }
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setErrors((prev) => ({ ...prev, logo: t('auth.onboard.logoHint') }));
      return;
    }

    setErrors((prev) => ({ ...prev, logo: '' }));
    onLogoChange(file);
  };

  const handleFeeChange = (value: string) => {
    setFeeInput(value);
    const numVal = parseFloat(value);
    if (!isNaN(numVal) && numVal >= 0) {
      update('defaultFee', shekelToAgorot(numVal));
    } else if (value === '') {
      update('defaultFee', 0);
    }
  };

  const vatPreview = () => {
    const feeAgorot = data.defaultFee ?? 0;
    if (feeAgorot === 0) return '';
    const total = feeAgorot + calculateVat(feeAgorot);
    return t('auth.onboard.vatPreview').replace('{amount}', formatMoney(total));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!data.name?.trim()) newErrors.name = t('auth.errors.required');
    if (!data.type) newErrors.type = t('auth.errors.required');
    if (!data.regNum?.trim()) newErrors.regNum = t('auth.errors.required');
    if (!data.phone?.trim()) {
      newErrors.phone = t('auth.errors.required');
    } else if (!validatePhone(data.phone)) {
      newErrors.phone = t('auth.errors.invalidPhone');
    }
    if (!data.email?.trim()) {
      newErrors.email = t('auth.errors.required');
    } else if (!validateEmail(data.email)) {
      newErrors.email = t('auth.errors.invalidEmail');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  return (
    <div className="space-y-4">
      <FormField label={t('auth.onboard.firmName')} error={errors.name} required>
        <Input
          value={data.name ?? ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder={t('auth.onboard.firmName')}
        />
      </FormField>

      <FormField label={t('auth.onboard.firmType')} error={errors.type} required>
        <Select
          value={data.type ?? ''}
          onValueChange={(v) => update('type', v as FirmType)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('auth.onboard.firmType')} />
          </SelectTrigger>
          <SelectContent>
            {FIRM_TYPES.map(({ value, labelKey }) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label={t('auth.onboard.regNum')} error={errors.regNum} required>
        <Input
          dir="ltr"
          value={data.regNum ?? ''}
          onChange={(e) => update('regNum', e.target.value)}
          placeholder={t('auth.onboard.regNum')}
        />
      </FormField>

      <FormField label={t('common.phone')} error={errors.phone} required>
        <Input
          dir="ltr"
          value={data.phone ?? ''}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="05X-XXXXXXX"
        />
      </FormField>

      <FormField label={t('common.email')} error={errors.email} required>
        <Input
          dir="ltr"
          type="email"
          value={data.email ?? ''}
          onChange={(e) => update('email', e.target.value)}
          placeholder="office@example.com"
        />
      </FormField>

      <FormField label={t('auth.onboard.city')}>
        <Input
          value={data.city ?? ''}
          onChange={(e) => update('city', e.target.value)}
          placeholder={t('auth.onboard.city')}
        />
      </FormField>

      <FormField
        label={t('auth.onboard.logo')}
        error={errors.logo}
        hint={t('auth.onboard.logoHint')}
      >
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleLogoChange}
        />
        {logoFile && (
          <p className="text-xs text-muted-foreground mt-1">{logoFile.name}</p>
        )}
      </FormField>

      <FormField
        label={t('auth.onboard.defaultFee')}
        hint={vatPreview()}
      >
        <Input
          dir="ltr"
          type="number"
          min="0"
          step="1"
          value={feeInput}
          onChange={(e) => handleFeeChange(e.target.value)}
          placeholder="0"
        />
      </FormField>

      <Button className="w-full mt-4" onClick={handleNext}>
        {t('auth.onboard.continueToCredentials')}
      </Button>
    </div>
  );
}
