// CREATED: 2026-03-18
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Pass clientId to ClientTabs for CRM integration

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient, useArchiveClient, useRestoreClient, useDeleteClient } from '@/hooks/useClients';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { ClientHeader } from './ClientHeader';
import { ClientTabs } from './ClientTabs';
import { ClientForm } from './ClientForm';
import { ArrowRight, ArrowLeft, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react';

export function ClientDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const { data: client, isLoading, error } = useClient(id);

  const archiveClient = useArchiveClient();
  const restoreClient = useRestoreClient();
  const deleteClient = useDeleteClient();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  if (error || !client) {
    return (
      <div className="p-6">
        <p className="text-destructive">{t('errors.notFound')}</p>
      </div>
    );
  }

  const isArchived = client.status === 'archived';
  // Direction-aware back icon: RTL -> ArrowRight, LTR -> ArrowLeft
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;

  return (
    <div className="p-6 animate-fade-in">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate('/clients')}
      >
        <BackIcon className="h-4 w-4 me-2" />
        {t('clients.backToList')}
      </Button>

      {/* Header */}
      <ClientHeader client={client} />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 me-2" />
          {t('common.edit')}
        </Button>

        {isArchived ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => restoreClient.mutate(client.id)}
            disabled={restoreClient.isPending}
          >
            <ArchiveRestore className="h-4 w-4 me-2" />
            {t('clients.restoreClient')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveDialogOpen(true)}
          >
            <Archive className="h-4 w-4 me-2" />
            {t('clients.archiveClient')}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-4 w-4 me-2" />
          {t('clients.deleteClient')}
        </Button>
      </div>

      {/* Tabs */}
      <ClientTabs clientId={client.id} />

      {/* Edit form dialog */}
      <ClientForm open={editOpen} onOpenChange={setEditOpen} client={client} />

      {/* Archive confirmation */}
      <ConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        title={t('clients.archiveClient')}
        description={t('clients.confirmArchive')}
        onConfirm={() => archiveClient.mutate(client.id)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('clients.deleteClient')}
        description={t('clients.confirmDelete')}
        variant="destructive"
        onConfirm={() => {
          deleteClient.mutate(client.id, {
            onSuccess: () => navigate('/clients'),
          });
        }}
      />
    </div>
  );
}
