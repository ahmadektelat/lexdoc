// CREATED: 2026-03-24
// UPDATED: 2026-03-24 22:00 IST (Jerusalem)
//          - Initial implementation

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ScrollText } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuditByEntity } from '@/hooks/useAudit';
import type { AuditEntry } from '@/types';
import { formatDateTime } from '@/lib/dates';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ACTION_COLORS } from './auditConstants';

export interface AuditEntityPanelProps {
  entityType: string;
  entityId: string;
}

export function AuditEntityPanel({ entityType, entityId }: AuditEntityPanelProps) {
  const { t } = useLanguage();
  const { data: entries = [], isLoading } = useAuditByEntity(entityType, entityId);

  const columns: ColumnDef<AuditEntry, unknown>[] = useMemo(() => [
    {
      accessorKey: 'timestamp',
      header: t('audit.timestamp'),
      cell: ({ row }) => (
        <span dir="ltr" className="text-muted-foreground text-xs">
          {formatDateTime(row.original.timestamp)}
        </span>
      ),
    },
    {
      accessorKey: 'userName',
      header: t('audit.user'),
    },
    {
      accessorKey: 'action',
      header: t('audit.action'),
      cell: ({ row }) => {
        const action = row.original.action;
        const colorClass = ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
        return (
          <Badge className={cn('border-transparent', colorClass)}>
            {t(`audit.actions.${action}`) || action}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'target',
      header: t('audit.target'),
      cell: ({ row }) => row.original.target ?? '—',
    },
  ], [t]);

  if (isLoading) return <LoadingSpinner size="md" className="py-12" />;
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title={t('audit.noEntries')}
        description={t('audit.noEntriesDesc')}
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={entries}
      pageSize={10}
    />
  );
}
