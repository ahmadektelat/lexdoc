// CREATED: 2026-03-24
// UPDATED: 2026-03-24 18:30 IST (Jerusalem)
//          - Removed year prop from FilingStatusReport

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useReportHours, useReportFilings } from '@/hooks/useReports';
import { useStaff } from '@/hooks/useStaff';
import { useClients } from '@/hooks/useClients';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HoursByStaffReport } from './HoursByStaffReport';
import { HoursByClientReport } from './HoursByClientReport';
import { FilingStatusReport } from './FilingStatusReport';
import { ReportExport } from './ReportExport';

export function ReportsView() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);

  const [activeTab, setActiveTab] = useState<string>('hoursByStaff');

  // Date range for hours tabs — default: Jan 1 of current year to today
  const currentYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState<string>(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );

  // Year picker for filing tab
  const [filingYear, setFilingYear] = useState<number>(currentYear);

  const { data: hours = [], isLoading: hoursLoading } = useReportHours(firmId, fromDate, toDate);
  const { data: filings = [], isLoading: filingsLoading } = useReportFilings(firmId, filingYear);
  const { data: staff = [] } = useStaff(firmId);
  const { data: clients = [] } = useClients(firmId);

  if (!can('reports.view')) return <Navigate to="/dashboard" />;

  const isLoading = hoursLoading || filingsLoading;
  if (isLoading) return <LoadingSpinner size="lg" className="py-20" />;

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('reports.title')} description={t('reports.description')}>
        {can('reports.export') && (
          <ReportExport
            activeTab={activeTab}
            hours={hours}
            filings={filings}
            staff={staff}
            clients={clients}
            fromDate={fromDate}
            toDate={toDate}
            filingYear={filingYear}
            t={t}
          />
        )}
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="hoursByStaff">{t('reports.tabs.hoursByStaff')}</TabsTrigger>
          <TabsTrigger value="hoursByClient">{t('reports.tabs.hoursByClient')}</TabsTrigger>
          <TabsTrigger value="filingStatus">{t('reports.tabs.filingStatus')}</TabsTrigger>
        </TabsList>

        {/* Date range controls — shown for hours tabs only */}
        {(activeTab === 'hoursByStaff' || activeTab === 'hoursByClient') && (
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">{t('reports.fromDate')}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background text-foreground"
                dir="ltr"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">{t('reports.toDate')}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background text-foreground"
                dir="ltr"
              />
            </div>
          </div>
        )}

        {/* Year picker — shown for filing tab only */}
        {activeTab === 'filingStatus' && (
          <div className="flex items-center gap-2 mt-4">
            <label className="text-sm text-muted-foreground">{t('reports.year')}</label>
            <Select
              value={String(filingYear)}
              onValueChange={(v) => setFilingYear(Number(v))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <TabsContent value="hoursByStaff" className="mt-4">
          <HoursByStaffReport hours={hours} staff={staff} clients={clients} />
        </TabsContent>
        <TabsContent value="hoursByClient" className="mt-4">
          <HoursByClientReport hours={hours} staff={staff} clients={clients} />
        </TabsContent>
        <TabsContent value="filingStatus" className="mt-4">
          <FilingStatusReport filings={filings} clients={clients} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
