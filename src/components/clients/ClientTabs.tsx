// CREATED: 2026-03-18
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Integrated DocumentsTab replacing placeholder

import { useLanguage } from '@/contexts/LanguageContext';
import { EmptyState } from '@/components/shared/EmptyState';
import { ClientTasksWidget } from '@/components/crm/ClientTasksWidget';
import { FilingsClientTab } from '@/components/filings/FilingsClientTab';
import { HoursTab } from '@/components/billing/HoursTab';
import { InvoicesTab } from '@/components/billing/InvoicesTab';
import { LedgerTab } from '@/components/billing/LedgerTab';
import { DocumentsTab } from '@/components/documents/DocumentsTab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Activity } from 'lucide-react';
import type { Client } from '@/types';

interface ClientTabsProps {
  clientId: string;
  client: Client;
}

export function ClientTabs({ clientId, client }: ClientTabsProps) {
  const { t } = useLanguage();

  return (
    <Tabs defaultValue="documents" className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="documents">{t('clients.tabs.documents')}</TabsTrigger>
        <TabsTrigger value="filings">{t('clients.tabs.filings')}</TabsTrigger>
        <TabsTrigger value="tasks">{t('clients.tabs.tasks')}</TabsTrigger>
        <TabsTrigger value="activity">{t('clients.tabs.activity')}</TabsTrigger>
        <TabsTrigger value="hours">{t('clients.tabs.hours')}</TabsTrigger>
        <TabsTrigger value="invoices">{t('clients.tabs.invoices')}</TabsTrigger>
        <TabsTrigger value="billing">{t('clients.tabs.billing')}</TabsTrigger>
      </TabsList>

      <TabsContent value="documents">
        <DocumentsTab clientId={clientId} clientName={client.name} clientCaseNum={client.caseNum} />
      </TabsContent>

      <TabsContent value="filings">
        <FilingsClientTab clientId={clientId} />
      </TabsContent>

      <TabsContent value="tasks">
        <ClientTasksWidget clientId={clientId} />
      </TabsContent>

      <TabsContent value="activity">
        <EmptyState
          icon={Activity}
          title={t('clients.tabs.activity')}
          description={t('clients.tabs.activityPlaceholder')}
        />
      </TabsContent>

      <TabsContent value="hours">
        <HoursTab clientId={clientId} clientName={client.name} />
      </TabsContent>

      <TabsContent value="invoices">
        <InvoicesTab
          clientId={clientId}
          clientName={client.name}
          clientMonthlyFee={client.monthlyFee}
          clientCaseNum={client.caseNum}
          clientEmail={client.email}
          clientBillingDay={client.billingDay}
        />
      </TabsContent>

      <TabsContent value="billing">
        <LedgerTab
          clientId={clientId}
          clientName={client.name}
          clientCaseNum={client.caseNum}
          clientMonthlyFee={client.monthlyFee}
        />
      </TabsContent>
    </Tabs>
  );
}
