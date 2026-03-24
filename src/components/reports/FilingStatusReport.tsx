// CREATED: 2026-03-24
// UPDATED: 2026-03-24 18:00 IST (Jerusalem)
//          - Initial implementation

import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { aggregateFilingStatus } from '@/lib/report-utils';
import type { ClientFilingRow } from '@/lib/report-utils';
import { cn } from '@/lib/utils';
import type { Filing, Client } from '@/types';
import type { ColumnDef } from '@tanstack/react-table';

interface FilingStatusReportProps {
  filings: Filing[];
  clients: Client[];
  year: number;
}

export function FilingStatusReport({ filings, clients, year }: FilingStatusReportProps) {
  const { t } = useLanguage();

  const { rows, summary } = useMemo(
    () => aggregateFilingStatus(filings, clients, t('reports.summaryRow')),
    [filings, clients, t],
  );

  const columns: ColumnDef<ClientFilingRow, unknown>[] = [
    {
      accessorKey: 'clientName',
      header: t('common.name'),
    },
    {
      accessorKey: 'filed',
      header: t('reports.filed'),
      cell: ({ row }) => (
        <span className="text-green-600 font-medium">{row.original.filed}</span>
      ),
    },
    {
      accessorKey: 'pending',
      header: t('reports.pending'),
      cell: ({ row }) => (
        <span className="text-amber-600 font-medium">{row.original.pending}</span>
      ),
    },
    {
      accessorKey: 'late',
      header: t('reports.late'),
      cell: ({ row }) => (
        <span className={row.original.late > 0 ? 'text-red-600 font-bold' : 'text-muted-foreground'}>
          {row.original.late}
        </span>
      ),
    },
    {
      accessorKey: 'total',
      header: t('reports.total'),
    },
    {
      accessorKey: 'completionPct',
      header: t('reports.completion'),
      cell: ({ row }) => {
        const pct = row.original.completionPct;
        const hasLate = row.original.late > 0;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  hasLate ? 'bg-red-500' : 'bg-green-500'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-10 text-end" dir="ltr">
              {pct}%
            </span>
          </div>
        );
      },
    },
  ];

  if (rows.length === 0) {
    return <EmptyState icon={FileText} title={t('reports.noFilings')} />;
  }

  return (
    <>
      <DataTable columns={columns} data={rows} searchable />
      {/* Summary row */}
      <div className="mt-2 border rounded-md p-3 bg-muted/30 flex items-center justify-between text-sm font-medium">
        <span>{t('reports.summaryRow')}</span>
        <div className="flex items-center gap-6">
          <span className="text-green-600">{t('reports.filed')}: {summary.filed}</span>
          <span className="text-amber-600">{t('reports.pending')}: {summary.pending}</span>
          <span className={summary.late > 0 ? 'text-red-600 font-bold' : ''}>{t('reports.late')}: {summary.late}</span>
          <span>{t('reports.total')}: {summary.total}</span>
          <span dir="ltr">{summary.completionPct}%</span>
        </div>
      </div>
    </>
  );
}
