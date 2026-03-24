// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackupCard } from './BackupCard';
import { RestoreCard } from './RestoreCard';
import { StorageInfo } from './StorageInfo';
import { ImportPanel } from './ImportPanel';
import { ExportPanel } from './ExportPanel';
import { DocsImportPanel } from './DocsImportPanel';

export function BackupView() {
  const { t } = useLanguage();
  const can = useAuthStore((s) => s.can);
  const [activeTab, setActiveTab] = useState('backup');

  if (!can('settings.backup')) return <Navigate to="/dashboard" />;

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('backup.title')} description={t('backup.description')} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="backup">{t('backup.tabBackup')}</TabsTrigger>
          <TabsTrigger value="import">{t('backup.tabImport')}</TabsTrigger>
          <TabsTrigger value="export">{t('backup.tabExport')}</TabsTrigger>
          <TabsTrigger value="docs">{t('backup.tabDocs')}</TabsTrigger>
        </TabsList>

        <TabsContent value="backup">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <BackupCard />
              <RestoreCard />
            </div>
            <StorageInfo />
          </div>
        </TabsContent>

        <TabsContent value="import">
          <ImportPanel />
        </TabsContent>

        <TabsContent value="export">
          <ExportPanel />
        </TabsContent>

        <TabsContent value="docs">
          <DocsImportPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
