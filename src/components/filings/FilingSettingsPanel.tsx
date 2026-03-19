// CREATED: 2026-03-19
// UPDATED: 2026-03-19 15:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilingSettings, useSaveFilingSettings } from '@/hooks/useFilingSettings';
import { useRegenerateSchedule } from '@/hooks/useFilings';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { FilingSetting } from '@/types';

interface FilingSettingsPanelProps {
  firmId: string;
  clientId: string;
  year: number;
}

const DEFAULT_SETTINGS: Omit<FilingSetting, 'clientId'> = {
  vatFreq: 'monthly',
  taxAdvEnabled: false,
  taxAdvFreq: 'monthly',
  taxDeductEnabled: false,
  taxDeductFreq: 'monthly',
  niiDeductEnabled: false,
  niiDeductFreq: 'monthly',
};

export function FilingSettingsPanel({ firmId, clientId, year }: FilingSettingsPanelProps) {
  const { t } = useLanguage();
  const can = useAuthStore((s) => s.can);
  const { data: fetchedSettings } = useFilingSettings(firmId, clientId);
  const saveSettings = useSaveFilingSettings();
  const regenerateSchedule = useRegenerateSchedule();

  const [isEditing, setIsEditing] = useState(false);
  const [localSettings, setLocalSettings] = useState<FilingSetting>({
    clientId,
    ...DEFAULT_SETTINGS,
  });

  // Sync local state when fetched settings change or clientId changes
  useEffect(() => {
    if (fetchedSettings) {
      setLocalSettings(fetchedSettings);
    } else {
      setLocalSettings({ clientId, ...DEFAULT_SETTINGS });
    }
    setIsEditing(false);
  }, [fetchedSettings, clientId]);

  const handleSaveAndGenerate = async () => {
    try {
      await saveSettings.mutateAsync({ firmId, setting: localSettings });
      await regenerateSchedule.mutateAsync({ firmId, clientId, year, settings: localSettings });
      setIsEditing(false);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  };

  const handleCancel = () => {
    if (fetchedSettings) {
      setLocalSettings(fetchedSettings);
    } else {
      setLocalSettings({ clientId, ...DEFAULT_SETTINGS });
    }
    setIsEditing(false);
  };

  const isSaving = saveSettings.isPending || regenerateSchedule.isPending;

  const updateSetting = <K extends keyof FilingSetting>(key: K, value: FilingSetting[K]) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Read-only summary
  if (!isEditing) {
    return (
      <div className="border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">{t('filings.settings')}</h3>
          {can('filings.edit') && (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              {t('filings.settings')}
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">{t('filings.vatFrequency')}: </span>
            {t(`filings.${localSettings.vatFreq === 'monthly' ? 'monthly' : 'bimonthly'}`)}
          </div>
          <div>
            <span className="text-muted-foreground">{t('filings.taxAdvances.label')}: </span>
            {localSettings.taxAdvEnabled
              ? t(`filings.${localSettings.taxAdvFreq === 'monthly' ? 'monthly' : 'bimonthly'}`)
              : '—'}
          </div>
          <div>
            <span className="text-muted-foreground">{t('filings.taxDeductions.label')}: </span>
            {localSettings.taxDeductEnabled
              ? t(`filings.${localSettings.taxDeductFreq === 'monthly' ? 'monthly' : 'bimonthly'}`)
              : '—'}
          </div>
          <div>
            <span className="text-muted-foreground">{t('filings.niiDeductions.label')}: </span>
            {localSettings.niiDeductEnabled
              ? t(`filings.${localSettings.niiDeductFreq === 'monthly' ? 'monthly' : 'bimonthly'}`)
              : '—'}
          </div>
        </div>
      </div>
    );
  }

  // Edit mode
  return (
    <div className="border rounded-lg p-4 mb-4 space-y-4">
      <h3 className="font-medium">{t('filings.settings')}</h3>

      {/* VAT Frequency — always visible */}
      <FormField label={t('filings.vatFrequency')}>
        <Select
          value={localSettings.vatFreq}
          onValueChange={(v) => updateSetting('vatFreq', v as FilingSetting['vatFreq'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">{t('filings.monthly')}</SelectItem>
            <SelectItem value="bimonthly">{t('filings.bimonthly')}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {/* Tax Advances */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={localSettings.taxAdvEnabled}
            onCheckedChange={(v) => updateSetting('taxAdvEnabled', v)}
          />
          <span className="text-sm">{t('filings.taxAdvances.label')}</span>
        </div>
        {localSettings.taxAdvEnabled && (
          <FormField label={t('filings.frequency')}>
            <Select
              value={localSettings.taxAdvFreq}
              onValueChange={(v) => updateSetting('taxAdvFreq', v as FilingSetting['taxAdvFreq'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t('filings.monthly')}</SelectItem>
                <SelectItem value="bimonthly">{t('filings.bimonthly')}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}
      </div>

      {/* Tax Deductions */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={localSettings.taxDeductEnabled}
            onCheckedChange={(v) => updateSetting('taxDeductEnabled', v)}
          />
          <span className="text-sm">{t('filings.taxDeductions.label')}</span>
        </div>
        {localSettings.taxDeductEnabled && (
          <FormField label={t('filings.frequency')}>
            <Select
              value={localSettings.taxDeductFreq}
              onValueChange={(v) => updateSetting('taxDeductFreq', v as FilingSetting['taxDeductFreq'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t('filings.monthly')}</SelectItem>
                <SelectItem value="bimonthly">{t('filings.bimonthly')}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}
      </div>

      {/* NII Deductions */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={localSettings.niiDeductEnabled}
            onCheckedChange={(v) => updateSetting('niiDeductEnabled', v)}
          />
          <span className="text-sm">{t('filings.niiDeductions.label')}</span>
        </div>
        {localSettings.niiDeductEnabled && (
          <FormField label={t('filings.frequency')}>
            <Select
              value={localSettings.niiDeductFreq}
              onValueChange={(v) => updateSetting('niiDeductFreq', v as FilingSetting['niiDeductFreq'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t('filings.monthly')}</SelectItem>
                <SelectItem value="bimonthly">{t('filings.bimonthly')}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          onClick={handleSaveAndGenerate}
          disabled={isSaving}
        >
          {t('filings.saveAndGenerate')}
        </Button>
        <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
          {t('filings.cancel')}
        </Button>
      </div>
    </div>
  );
}
