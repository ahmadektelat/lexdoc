// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useInteractions, useDeleteInteraction } from '@/hooks/useInteractions';
import { useClients } from '@/hooks/useClients';
import { useStaff } from '@/hooks/useStaff';
import { INTERACTION_CHANNELS, AUTHORITY_TYPES } from '@/lib/constants';
import { formatDate } from '@/lib/dates';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InteractionForm } from './InteractionForm';
import { Plus, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Interaction, InteractionChannel, AuthorityType } from '@/types';

interface InteractionsPanelProps {
  clientId?: string;
}

export function InteractionsPanel({ clientId }: InteractionsPanelProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const canManage = can('crm.manage');
  const { data: interactions, isLoading } = useInteractions(firmId, clientId);
  const { data: clients } = useClients(firmId);
  const { data: staffList } = useStaff(firmId);
  const deleteInteraction = useDeleteInteraction();

  const [channelFilter, setChannelFilter] = useState<InteractionChannel | 'all'>('all');
  const [authorityFilter, setAuthorityFilter] = useState<AuthorityType | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingInteraction, setEditingInteraction] = useState<Interaction | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Interaction | null>(null);

  // Lookup maps
  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients?.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const staffMap = useMemo(() => {
    const map = new Map<string, string>();
    staffList?.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [staffList]);

  // Client-side filtering
  const filteredInteractions = useMemo(() => {
    if (!interactions) return [];
    return interactions.filter((i) => {
      if (channelFilter !== 'all' && i.channel !== channelFilter) return false;
      if (authorityFilter !== 'all' && i.authorityType !== authorityFilter) return false;
      return true;
    });
  }, [interactions, channelFilter, authorityFilter]);

  const handleEdit = (interaction: Interaction) => {
    setEditingInteraction(interaction);
    setFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setFormOpen(open);
    if (!open) setEditingInteraction(undefined);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteInteraction.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  // Column definitions
  const columns: ColumnDef<Interaction, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'date',
        header: t('interactions.date'),
        cell: ({ row }) => <span dir="ltr">{formatDate(row.original.date)}</span>,
      },
      ...(!clientId
        ? [
            {
              id: 'client',
              header: t('interactions.client'),
              cell: ({ row }: { row: { original: Interaction } }) =>
                row.original.client_id
                  ? clientMap.get(row.original.client_id) ?? '-'
                  : t('interactions.generalInteraction'),
            } as ColumnDef<Interaction, unknown>,
          ]
        : []),
      {
        id: 'staff',
        header: t('interactions.staff'),
        cell: ({ row }) =>
          row.original.staffId ? staffMap.get(row.original.staffId) ?? '-' : '-',
      },
      {
        id: 'authority',
        header: t('interactions.authority'),
        cell: ({ row }) =>
          row.original.authorityType
            ? t(AUTHORITY_TYPES[row.original.authorityType as AuthorityType] ?? '')
            : '-',
      },
      {
        accessorKey: 'channel',
        header: t('interactions.channel'),
        cell: ({ row }) => (
          <Badge variant="outline">{t(INTERACTION_CHANNELS[row.original.channel])}</Badge>
        ),
      },
      {
        accessorKey: 'subject',
        header: t('interactions.subject'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.subject}</span>
        ),
      },
      {
        accessorKey: 'outcome',
        header: t('interactions.outcome'),
        cell: ({ row }) => row.original.outcome ?? '-',
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: Interaction } }) => (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(row.original)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteTarget(row.original)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            } as ColumnDef<Interaction, unknown>,
          ]
        : []),
    ],
    [t, clientId, clientMap, staffMap, canManage]
  );

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={channelFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setChannelFilter('all')}
          >
            {t('common.all')}
          </Button>
          {Object.entries(INTERACTION_CHANNELS).map(([value, labelKey]) => (
            <Button
              key={value}
              variant={channelFilter === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChannelFilter(value as InteractionChannel)}
            >
              {t(labelKey)}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant={authorityFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAuthorityFilter('all')}
          >
            {t('common.all')}
          </Button>
          {Object.entries(AUTHORITY_TYPES).map(([value, labelKey]) => (
            <Button
              key={value}
              variant={authorityFilter === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAuthorityFilter(value as AuthorityType)}
            >
              {t(labelKey)}
            </Button>
          ))}
        </div>

        {canManage && (
          <Button onClick={() => setFormOpen(true)} className="ms-auto">
            <Plus className="h-4 w-4 me-2" />
            {t('interactions.addInteraction')}
          </Button>
        )}
      </div>

      {/* Content */}
      {filteredInteractions.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t('interactions.noInteractions')}
          description={t('interactions.noInteractionsDesc')}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredInteractions}
          emptyMessage={t('common.noResults')}
        />
      )}

      {/* Create/Edit form dialog */}
      <InteractionForm
        open={formOpen}
        onOpenChange={handleFormClose}
        interaction={editingInteraction}
        defaultClientId={clientId}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('interactions.deleteInteraction')}
        description={t('interactions.confirmDelete')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}
