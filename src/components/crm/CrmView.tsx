// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
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
import { TasksPanel } from './TasksPanel';
import { InteractionsPanel } from './InteractionsPanel';
import { ContactsPanel } from './ContactsPanel';

export function CrmView() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const { data: clients, isLoading: clientsLoading } = useClients(firmId);

  const [selectedClientId, setSelectedClientId] = useState<string>('');

  if (!can('crm.view')) {
    return (
      <div className="p-6 animate-fade-in">
        <p className="text-destructive">{t('errors.unauthorized')}</p>
      </div>
    );
  }

  if (clientsLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  const clientFilter = selectedClientId || undefined;

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('crm.title')} description={t('crm.description')}>
        {/* Client filter dropdown */}
        <Select value={selectedClientId} onValueChange={setSelectedClientId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t('crm.allClients')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('crm.allClients')}</SelectItem>
            {clients?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      {/* Tab navigation */}
      <Tabs defaultValue="tasks" className="w-full mt-6">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="tasks">{t('crm.tabs.tasks')}</TabsTrigger>
          <TabsTrigger value="interactions">{t('crm.tabs.interactions')}</TabsTrigger>
          <TabsTrigger value="contacts">{t('crm.tabs.contacts')}</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <TasksPanel clientId={clientFilter} />
        </TabsContent>

        <TabsContent value="interactions" className="mt-4">
          <InteractionsPanel clientId={clientFilter} />
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <ContactsPanel clientId={clientFilter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
