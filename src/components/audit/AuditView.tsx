// CREATED: 2026-03-24
// UPDATED: 2026-03-24 22:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ScrollText } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAuditEntries } from '@/hooks/useAudit';
import type { AuditEntry } from '@/types';
import type { AuditListFilters } from '@/services/auditService';
import { formatDateTime } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { SearchInput } from '@/components/shared/SearchInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ACTION_COLORS, AUDIT_ACTIONS, ENTITY_TYPES } from './auditConstants';

export function AuditView() {
  const { t } = useLanguage();
  const can = useAuthStore((s) => s.can);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Accumulated entries for "load more" pattern
  const [allEntries, setAllEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const isLoadMoreRef = useRef(false);

  const filters: AuditListFilters = useMemo(() => ({
    limit: 500,
    cursor,
    action: actionFilter === 'all' ? undefined : actionFilter,
    entityType: entityFilter === 'all' ? undefined : entityFilter,
    search: search || undefined,
  }), [cursor, actionFilter, entityFilter, search]);

  const { data: result, isLoading, isFetching } = useAuditEntries(filters);

  // When result changes, merge into allEntries
  useEffect(() => {
    if (!result) return;
    if (isLoadMoreRef.current) {
      setAllEntries((prev) => [...prev, ...result.data]);
      isLoadMoreRef.current = false;
    } else {
      setAllEntries(result.data);
    }
    setHasMore(result.hasMore);
  }, [result]);

  // Reset when filters change
  useEffect(() => {
    setCursor(undefined);
    setAllEntries([]);
    isLoadMoreRef.current = false;
  }, [actionFilter, entityFilter, search]);

  const handleLoadMore = useCallback(() => {
    if (result?.nextCursor) {
      isLoadMoreRef.current = true;
      setCursor(result.nextCursor);
    }
  }, [result]);

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
    {
      accessorKey: 'entityType',
      header: t('audit.entityType'),
      cell: ({ row }) => {
        const et = row.original.entityType;
        return et ? (t(`audit.entities.${et}`) || et) : '—';
      },
    },
  ], [t]);

  if (!can('settings.audit')) return <Navigate to="/dashboard" />;

  if (isLoading && allEntries.length === 0) {
    return (
      <div className="p-6 animate-fade-in">
        <PageHeader title={t('audit.title')} description={t('audit.description')} />
        <LoadingSpinner size="lg" className="py-20" />
      </div>
    );
  }

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('audit.title')} description={t('audit.description')} />
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('common.searchPlaceholder')}
            className="max-w-sm"
          />

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('audit.allActions')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('audit.allActions')}</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{t(`audit.actions.${a}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('audit.allEntities')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('audit.allEntities')}</SelectItem>
              {ENTITY_TYPES.map((e) => (
                <SelectItem key={e} value={e}>{t(`audit.entities.${e}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {allEntries.length === 0 && !isFetching ? (
          <EmptyState
            icon={ScrollText}
            title={t('audit.noEntries')}
            description={t('audit.noEntriesDesc')}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={allEntries}
              emptyMessage={t('audit.noEntries')}
              pageSize={20}
            />

            {hasMore && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={isFetching}
                >
                  {isFetching ? t('common.loading') : t('audit.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
