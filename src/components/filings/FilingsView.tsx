// CREATED: 2026-03-19
// UPDATED: 2026-03-19 15:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { useFilings, useFilingLateCounts } from '@/hooks/useFilings';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { FilingSettingsPanel } from './FilingSettingsPanel';
import { FilingScheduleTable } from './FilingScheduleTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isOverdue } from '@/lib/dates';
import { ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import type { FilingType } from '@/types';

const FILING_TYPE_I18N_KEYS: Record<FilingType, string> = {
  maam: 'filings.vatReport',
  mekadmot: 'filings.taxAdvances',
  nikuyim: 'filings.incomeTaxDeductions',
  nii: 'filings.niiDeductions',
};

export function FilingsView() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const currentYear = new Date().getFullYear();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedType, setSelectedType] = useState<FilingType | '__all__'>('__all__');
  const [clientSearch, setClientSearch] = useState('');

  const { data: clients, isLoading: clientsLoading } = useClients(firmId);
  const { data: filings = [] } = useFilings(firmId, selectedClientId ?? undefined, selectedYear);
  const { data: lateCounts = {} } = useFilingLateCounts(firmId, selectedYear);

  // Filter clients: active only, matching search
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    return clients
      .filter((c) => c.status === 'active')
      .filter((c) => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clients, clientSearch]);

  // Filter filings by type
  const filteredFilings = useMemo(() => {
    if (selectedType === '__all__') return filings;
    return filings.filter((f) => f.type === selectedType);
  }, [filings, selectedType]);

  // Metrics for selected client
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

  // Permission guard
  if (!can('filings.view')) {
    return (
      <div className="p-6 animate-fade-in">
        <p className="text-destructive">{t('errors.unauthorized')}</p>
      </div>
    );
  }

  if (clientsLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('filings.title')} description={t('filings.description')}>
        {/* Year selector */}
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
      </PageHeader>

      <div className="flex gap-6">
        {/* Left sidebar — client list */}
        <div className="w-64 shrink-0 space-y-2">
          <h3 className="text-sm font-medium">{t('filings.clients')}</h3>
          <Input
            placeholder={t('filings.clients')}
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="border rounded-md max-h-[calc(100vh-220px)] overflow-y-auto">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                className={`w-full text-start px-3 py-2 text-sm border-b last:border-b-0 hover:bg-muted/50 transition-colors flex items-center justify-between ${
                  client.id === selectedClientId ? 'bg-accent' : ''
                }`}
                onClick={() => setSelectedClientId(client.id)}
              >
                <span className="truncate">{client.name}</span>
                {(lateCounts[client.id] ?? 0) > 0 && (
                  <Badge variant="destructive" className="ms-2 text-xs shrink-0">
                    {lateCounts[client.id]}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — filing details */}
        <div className="flex-1 min-w-0">
          {selectedClientId && firmId ? (
            <>
              {/* Metrics bar */}
              <div className="grid grid-cols-3 gap-4 mb-4">
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

              <FilingSettingsPanel
                firmId={firmId}
                clientId={selectedClientId}
                year={selectedYear}
              />

              {/* Type filter */}
              <Tabs
                value={selectedType}
                onValueChange={(v) => setSelectedType(v as FilingType | '__all__')}
                className="mb-4"
              >
                <TabsList>
                  <TabsTrigger value="__all__">{t('filings.allTypes')}</TabsTrigger>
                  <TabsTrigger value="maam">{t(FILING_TYPE_I18N_KEYS.maam)}</TabsTrigger>
                  <TabsTrigger value="mekadmot">{t(FILING_TYPE_I18N_KEYS.mekadmot)}</TabsTrigger>
                  <TabsTrigger value="nikuyim">{t(FILING_TYPE_I18N_KEYS.nikuyim)}</TabsTrigger>
                  <TabsTrigger value="nii">{t(FILING_TYPE_I18N_KEYS.nii)}</TabsTrigger>
                </TabsList>
              </Tabs>

              <FilingScheduleTable filings={filteredFilings} firmId={firmId} />
            </>
          ) : (
            <EmptyState icon={BarChart3} title={t('filings.selectClient')} />
          )}
        </div>
      </div>
    </div>
  );
}
