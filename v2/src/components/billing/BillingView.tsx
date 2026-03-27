// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useInvoices } from '@/hooks/useInvoices';
import { useClients } from '@/hooks/useClients';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { ColumnDef } from '@tanstack/react-table';

interface ClientBillingRow {
  clientId: string;
  name: string;
  totalBilled: number;
  outstanding: number;
  lastInvoiceDate: string;
}

export function BillingView() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const { data: invoices = [], isLoading } = useInvoices(firmId);
  const { data: clients = [] } = useClients(firmId);

  const summary = useMemo(() => {
    const totalBilled = invoices.reduce((s, inv) => s + inv.total, 0);
    const totalCollected = invoices.filter(inv => inv.paid).reduce((s, inv) => s + inv.total, 0);
    const outstanding = totalBilled - totalCollected;
    return { totalBilled, totalCollected, outstanding };
  }, [invoices]);

  const clientBilling = useMemo(() => {
    const map = new Map<string, ClientBillingRow>();
    for (const inv of invoices) {
      const existing = map.get(inv.client_id) || {
        clientId: inv.client_id,
        name: clients.find(c => c.id === inv.client_id)?.name || '',
        totalBilled: 0,
        outstanding: 0,
        lastInvoiceDate: '',
      };
      existing.totalBilled += inv.total;
      if (!inv.paid) existing.outstanding += inv.total;
      if (!existing.lastInvoiceDate || inv.date > existing.lastInvoiceDate) {
        existing.lastInvoiceDate = inv.date;
      }
      map.set(inv.client_id, existing);
    }
    return Array.from(map.values());
  }, [invoices, clients]);

  if (!can('billing.view')) return <Navigate to="/dashboard" />;

  const columns: ColumnDef<ClientBillingRow, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('common.name'),
    },
    {
      accessorKey: 'totalBilled',
      header: t('billing.totalBilled'),
      cell: ({ row }) => <span dir="ltr">{formatMoney(row.original.totalBilled)}</span>,
    },
    {
      accessorKey: 'outstanding',
      header: t('billing.outstanding'),
      cell: ({ row }) => (
        <span
          dir="ltr"
          className={row.original.outstanding > 0 ? 'text-red-600 font-medium' : ''}
        >
          {formatMoney(row.original.outstanding)}
        </span>
      ),
    },
    {
      accessorKey: 'lastInvoiceDate',
      header: t('billing.lastInvoice'),
      cell: ({ row }) =>
        row.original.lastInvoiceDate ? (
          <span dir="ltr">{formatDate(row.original.lastInvoiceDate)}</span>
        ) : (
          '—'
        ),
    },
  ];

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('billing.title')} />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-400" dir="ltr">
            {formatMoney(summary.totalBilled)}
          </div>
          <div className="text-sm text-blue-600 dark:text-blue-500">{t('billing.totalBilled')}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400" dir="ltr">
            {formatMoney(summary.totalCollected)}
          </div>
          <div className="text-sm text-green-600 dark:text-green-500">{t('billing.totalCollected')}</div>
        </div>
        <div
          className={`rounded-lg p-4 text-center ${
            summary.outstanding > 0
              ? 'bg-red-50 dark:bg-red-900/20'
              : 'bg-green-50 dark:bg-green-900/20'
          }`}
        >
          <div
            className={`text-2xl font-bold ${
              summary.outstanding > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-green-700 dark:text-green-400'
            }`}
            dir="ltr"
          >
            {formatMoney(summary.outstanding)}
          </div>
          <div className="text-sm text-muted-foreground">{t('billing.outstanding')}</div>
        </div>
      </div>

      {/* Client billing table */}
      <DataTable
        columns={columns}
        data={clientBilling}
        onRowClick={(row) => navigate(`/clients/${row.clientId}`)}
        searchable
      />
    </div>
  );
}
