// CREATED: 2026-03-24
// UPDATED: 2026-03-24 12:30 IST (Jerusalem)
//          - Initial implementation

import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTemplates, useSeedTemplates } from '@/hooks/useMessages';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MsgSendPanel } from './MsgSendPanel';
import { MsgSchedulePanel } from './MsgSchedulePanel';
import { MsgLogPanel } from './MsgLogPanel';
import { MsgTemplatesPanel } from './MsgTemplatesPanel';

export function MessagingView() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);

  const { data: templates, isSuccess } = useTemplates(firmId);
  const seedTemplates = useSeedTemplates();
  const seededRef = useRef(false);

  // Seed default templates on first access when template list is empty
  useEffect(() => {
    if (firmId && isSuccess && templates && templates.length === 0 && !seededRef.current) {
      seededRef.current = true;
      seedTemplates.mutate({ firmId });
    }
  }, [firmId, isSuccess, templates, seedTemplates]);

  if (!can('messaging.view')) return <Navigate to="/dashboard" />;

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader
        title={t('messaging.title')}
        description={t('messaging.subtitle')}
      />

      <Tabs defaultValue="send" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="send">{t('messaging.tabSend')}</TabsTrigger>
          <TabsTrigger value="schedule">{t('messaging.tabSchedule')}</TabsTrigger>
          <TabsTrigger value="history">{t('messaging.tabHistory')}</TabsTrigger>
          <TabsTrigger value="templates">{t('messaging.tabTemplates')}</TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <MsgSendPanel />
        </TabsContent>
        <TabsContent value="schedule">
          <MsgSchedulePanel />
        </TabsContent>
        <TabsContent value="history">
          <MsgLogPanel />
        </TabsContent>
        <TabsContent value="templates">
          <MsgTemplatesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
