// CREATED: 2026-03-26
// UPDATED: 2026-03-26 11:00 IST (Jerusalem)
//          - Initial implementation — full settings page with 5 sections
//          - Client-side logo file validation (security requirement)
//          - Guards defaultFee against undefined (per review)

import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { firmService } from '@/services/firmService';
import { agorotToShekel, shekelToAgorot } from '@/lib/money';
import { daysLeft, formatDate } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField } from '@/components/shared/FormField';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ThemePicker } from '@/components/shared/ThemePicker';
import { LanguageSelector } from '@/components/shared/LanguageSelector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Building2, Upload, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB

export function SettingsView() {
  const { t } = useLanguage();
  const firmData = useAuthStore((s) => s.firmData);
  const role = useAuthStore((s) => s.role);
  const can = useAuthStore((s) => s.can);

  const canEdit = can('settings.firm');

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [defaultFeeShekel, setDefaultFeeShekel] = useState('0');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Initialize form from firmData
  useEffect(() => {
    if (firmData) {
      setName(firmData.name ?? '');
      setPhone(firmData.phone ?? '');
      setEmail(firmData.email ?? '');
      setCity(firmData.city ?? '');
      setDefaultFeeShekel(String(agorotToShekel(firmData.defaultFee ?? 0)));
    }
  }, [firmData]);

  if (!firmData) return <LoadingSpinner />;

  const isDirty =
    name !== (firmData.name ?? '') ||
    phone !== (firmData.phone ?? '') ||
    email !== (firmData.email ?? '') ||
    city !== (firmData.city ?? '') ||
    defaultFeeShekel !== String(agorotToShekel(firmData.defaultFee ?? 0));

  const handleSave = async () => {
    if (!firmData?.id || !canEdit) return;
    setIsSaving(true);
    try {
      const fee = parseFloat(defaultFeeShekel) || 0;
      const result = await firmService.updateFirm(firmData.id, {
        name,
        phone,
        email,
        city,
        defaultFee: shekelToAgorot(Math.max(0, fee)),
      });

      if (result.error) {
        toast.error(t('settings.saveFailed'));
        return;
      }

      // Re-fetch and update global store
      const updated = await firmService.getFirmById(firmData.id);
      if (updated && role) {
        useAuthStore.getState().setFirmData(updated, role);
      }

      toast.success(t('settings.saveSuccess'));
    } catch {
      toast.error(t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firmData?.id) return;

    // Client-side validation (security requirement)
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error(t('documents.invalidFileType'));
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      toast.error(t('documents.fileTooLarge'));
      return;
    }

    setIsUploadingLogo(true);
    try {
      const { url, error: uploadError } = await firmService.uploadLogo(firmData.id, file);
      if (uploadError || !url) {
        toast.error(t('settings.saveFailed'));
        return;
      }

      const result = await firmService.updateFirm(firmData.id, { logo: url });
      if (result.error) {
        toast.error(t('settings.saveFailed'));
        return;
      }

      const updated = await firmService.getFirmById(firmData.id);
      if (updated && role) {
        useAuthStore.getState().setFirmData(updated, role);
      }

      toast.success(t('settings.logoUploadSuccess'));
    } catch {
      toast.error(t('settings.saveFailed'));
    } finally {
      setIsUploadingLogo(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!firmData?.id || !canEdit) return;
    setIsUploadingLogo(true);
    try {
      const result = await firmService.updateFirm(firmData.id, { logo: '' });
      if (result.error) {
        toast.error(t('settings.saveFailed'));
        return;
      }

      const updated = await firmService.getFirmById(firmData.id);
      if (updated && role) {
        useAuthStore.getState().setFirmData(updated, role);
      }

      toast.success(t('settings.logoRemoved'));
    } catch {
      toast.error(t('settings.saveFailed'));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const remaining = firmData.expiry ? daysLeft(firmData.expiry) : 0;
  const progressWidth = Math.max(0, Math.min(100, (remaining / 365) * 100));

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <div className="space-y-6">
        {/* Section 1: Firm Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('settings.firmProfile')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!canEdit && (
              <p className="text-sm text-muted-foreground mb-4">{t('settings.noPermission')}</p>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FormField label={t('settings.firmName')}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canEdit}
                />
              </FormField>

              <FormField label={t('settings.phone')}>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!canEdit}
                  dir="ltr"
                />
              </FormField>

              <FormField label={t('settings.email')}>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!canEdit}
                  dir="ltr"
                />
              </FormField>

              <FormField label={t('settings.city')}>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={!canEdit}
                />
              </FormField>

              <FormField label={t('settings.regNum')}>
                <Input value={firmData.regNum} disabled dir="ltr" />
              </FormField>

              <FormField label={t('settings.firmType')}>
                <Input
                  value={t(`auth.onboard.firmType.${firmData.type}`)}
                  disabled
                />
              </FormField>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Logo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('settings.logo')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {firmData.logo ? (
                <img
                  src={firmData.logo}
                  alt={t('settings.logo')}
                  className="h-20 w-20 object-contain rounded-lg border border-border"
                />
              ) : (
                <div className="h-20 w-20 rounded-lg border border-border border-dashed flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              {canEdit && (
                <div className="flex flex-col gap-2">
                  <label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      disabled={isUploadingLogo}
                    >
                      <span>
                        <Upload className="h-4 w-4 me-2" />
                        {t('settings.uploadLogo')}
                      </span>
                    </Button>
                  </label>

                  {firmData.logo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveLogo}
                      disabled={isUploadingLogo}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 me-2" />
                      {t('settings.removeLogo')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Billing Defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('settings.billingDefaults')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm">
              <FormField label={t('settings.defaultFee')}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t('settings.feeCurrency')}</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={defaultFeeShekel}
                    onChange={(e) => setDefaultFeeShekel(e.target.value)}
                    disabled={!canEdit}
                    dir="ltr"
                  />
                </div>
              </FormField>
            </div>
          </CardContent>
        </Card>

        {/* Save button for editable sections */}
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving || !isDirty}>
              <Save className="h-4 w-4 me-2" />
              {isSaving ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        )}

        {/* Section 4: Subscription */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('settings.subscription')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{t('settings.currentPlan')}:</span>
                <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  {t(firmData.planLabel)}
                </Badge>
              </div>

              {firmData.expiry && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.expiry')}: {formatDate(firmData.expiry)}
                  </p>

                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${progressWidth}%` }}
                    />
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {t('settings.daysRemaining').replace('{days}', String(Math.max(0, remaining)))}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('settings.preferences')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg">
              <div>
                <p className="text-sm font-medium mb-2">{t('settings.theme')}</p>
                <ThemePicker />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">{t('settings.language')}</p>
                <LanguageSelector />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
