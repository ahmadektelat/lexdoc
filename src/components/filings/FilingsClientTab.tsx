// CREATED: 2026-03-19
// UPDATED: 2026-03-19 15:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilings } from '@/hooks/useFilings';
import { FilingSettingsPanel } from './FilingSettingsPanel';
import { FilingScheduleTable } from './FilingScheduleTable';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isOverdue } from '@/lib/dates';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Filing, FilingType } from '@/types';

interface FilingsClientTabProps {
  clientId: string;
}

const FILING_TYPE_I18N_KEYS: Record<FilingType, string> = {
  maam: 'filings.vatReport',
  mekadmot: 'filings.taxAdvances',
  nikuyim: 'filings.incomeTaxDeductions',
  nii: 'filings.niiDeductions',
};

export function FilingsClientTab({ clientId }: FilingsClientTabProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedType, setSelectedType] = useState<FilingType | '__all__'>('__all__');

  const { data: filings = [] } = useFilings(firmId, clientId, selectedYear);

  const filteredFilings = useMemo(() => {
    if (selectedType === '__all__') return filings;
    return filings.filter((f) => f.type === selectedType);
  }, [filings, selectedType]);

  // Metrics
  const metrics = useMemo(() => {
    const filed = filings.filter((f) => f.status === 'filed').length;
    const late = filings.filter(
      (f) => f.status === 'late' || (f.status === 'pending' && isOverdue(f.due))
    ).length;
    const pending = filings.filter(
      (f) => f.status === 'pending' && !isOverdue(f.due)
    ).length;
    return { filed, pending, late };
  }, [filings]);

  if (!firmId) return null;

  return (
    <div className="space-y-4">
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t('filings.settings')}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={selectedYear <= currentYear - 1}
            onClick={() => setSelectedYear((y) => y - 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold w-16 text-center">{selectedYear}</span>
          <Button
            variant="outline"
            size="icon"
            disabled={selectedYear >= currentYear + 1}
            onClick={() => setSelectedYear((y) => y + 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <FilingSettingsPanel firmId={firmId} clientId={clientId} year={selectedYear} />

      {/* Metrics bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400">{metrics.filed}</div>
          <div className="text-sm text-green-600 dark:text-green-500">{t('filings.metrics.filed')}</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{metrics.pending}</div>
          <div className="text-sm text-amber-600 dark:text-amber-500">{t('filings.metrics.pending')}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-700 dark:text-red-400">{metrics.late}</div>
          <div className="text-sm text-red-600 dark:text-red-500">{t('filings.metrics.late')}</div>
        </div>
      </div>

      {/* Type filter */}
      <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as FilingType | '__all__')}>
        <TabsList>
          <TabsTrigger value="__all__">{t('filings.allTypes')}</TabsTrigger>
          <TabsTrigger value="maam">{t(FILING_TYPE_I18N_KEYS.maam)}</TabsTrigger>
          <TabsTrigger value="mekadmot">{t(FILING_TYPE_I18N_KEYS.mekadmot)}</TabsTrigger>
          <TabsTrigger value="nikuyim">{t(FILING_TYPE_I18N_KEYS.nikuyim)}</TabsTrigger>
          <TabsTrigger value="nii">{t(FILING_TYPE_I18N_KEYS.nii)}</TabsTrigger>
        </TabsList>
      </Tabs>

      <FilingScheduleTable filings={filteredFilings} firmId={firmId} />
    </div>
  );
}
