// CREATED: 2026-03-18
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Replaced Tasks tab placeholder with ClientTasksWidget

import { useLanguage } from '@/contexts/LanguageContext';
import { EmptyState } from '@/components/shared/EmptyState';
import { ClientTasksWidget } from '@/components/crm/ClientTasksWidget';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileText, BarChart3, Activity } from 'lucide-react';

export function ClientTabs({ clientId }: { clientId: string }) {
  const { t } = useLanguage();

  return (
    <Tabs defaultValue="documents" className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="documents">{t('clients.tabs.documents')}</TabsTrigger>
        <TabsTrigger value="filings">{t('clients.tabs.filings')}</TabsTrigger>
        <TabsTrigger value="tasks">{t('clients.tabs.tasks')}</TabsTrigger>
        <TabsTrigger value="activity">{t('clients.tabs.activity')}</TabsTrigger>
      </TabsList>

      <TabsContent value="documents">
        <EmptyState
          icon={FileText}
          title={t('clients.tabs.documents')}
          description={t('clients.tabs.documentsPlaceholder')}
        />
      </TabsContent>

      <TabsContent value="filings">
        <EmptyState
          icon={BarChart3}
          title={t('clients.tabs.filings')}
          description={t('clients.tabs.filingsPlaceholder')}
        />
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
    </Tabs>
  );
}
