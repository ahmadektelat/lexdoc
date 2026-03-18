// CREATED: 2026-03-18
// UPDATED: 2026-03-18 10:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { CLIENT_TYPES } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientTypePicker } from './ClientTypePicker';
import { ClientCard } from './ClientCard';
import { ClientForm } from './ClientForm';
import { Plus, Users } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Client, ClientType } from '@/types';

// Detect mobile via media query — proper useEffect with cleanup
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

export function ClientsView() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients, isLoading } = useClients(firmId);
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ClientType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [formOpen, setFormOpen] = useState(false);

  // Client-side filtering
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    return clients.filter((client) => {
      // Type filter
      if (typeFilter !== 'all' && client.clientType !== typeFilter) return false;
      // Status filter
      if (statusFilter !== 'all' && client.status !== statusFilter) return false;
      // Search
      if (search) {
        const q = search.toLowerCase();
        return (
          client.name.toLowerCase().includes(q) ||
          client.caseNum.toLowerCase().includes(q) ||
          (client.taxId?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [clients, typeFilter, statusFilter, search]);

  // Column definitions for DataTable
  const columns: ColumnDef<Client, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: t('clients.name'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'caseNum',
        header: t('clients.caseNum'),
        cell: ({ row }) => (
          <span dir="ltr" className="text-muted-foreground">
            {row.original.caseNum}
          </span>
        ),
      },
      {
        accessorKey: 'clientType',
        header: t('clients.type'),
        cell: ({ row }) => (
          <Badge variant="secondary">
            {t(CLIENT_TYPES[row.original.clientType])}
          </Badge>
        ),
      },
      {
        accessorKey: 'taxId',
        header: t('clients.taxId'),
        cell: ({ row }) => (
          <span dir="ltr">{row.original.taxId ?? '-'}</span>
        ),
      },
      {
        accessorKey: 'mobile',
        header: t('clients.phone'),
        cell: ({ row }) => (
          <span dir="ltr">{row.original.mobile ?? '-'}</span>
        ),
      },
      {
        accessorKey: 'monthlyFee',
        header: t('clients.monthlyFee'),
        cell: ({ row }) =>
          row.original.monthlyFee
            ? formatMoney(row.original.monthlyFee)
            : '-',
      },
      {
        accessorKey: 'status',
        header: t('clients.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      // TODO: Add assigned staff column once staff module is built
      // { accessorKey: 'assignedStaffName', header: t('clients.assignedStaff') },
    ],
    [t]
  );

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('clients.title')}>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('clients.addNew')}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="space-y-4 mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('clients.searchPlaceholder')}
          className="max-w-md"
        />

        <div className="flex flex-wrap items-center gap-4">
          <ClientTypePicker value={typeFilter} onChange={setTypeFilter} />

          <div className="flex gap-2">
            {(['all', 'active', 'archived'] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all'
                  ? t('clients.all')
                  : status === 'active'
                    ? t('clients.active')
                    : t('clients.archived')}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {filteredClients.length === 0 && !search && typeFilter === 'all' && statusFilter === 'active' ? (
        <EmptyState
          icon={Users}
          title={t('clients.noClients')}
          description={t('clients.noClientsDesc')}
        />
      ) : isMobile ? (
        <div className="space-y-3">
          {filteredClients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredClients}
          onRowClick={(client) => navigate(`/clients/${client.id}`)}
          emptyMessage={t('common.noResults')}
        />
      )}

      {/* Create form dialog */}
      <ClientForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
