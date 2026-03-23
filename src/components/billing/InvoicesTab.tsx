// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useInvoices, useCreateInvoice, useMarkInvoicePaid, useMarkInvoiceSent } from '@/hooks/useInvoices';
import { useHours } from '@/hooks/useHours';
import { invoiceService } from '@/services/invoiceService';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate, getToday } from '@/lib/dates';
import { formatMoney, calculateInvoiceTotal } from '@/lib/money';
import { Plus, Download, Check, Send } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Invoice, InvoiceItem, HoursEntry, Firm } from '@/types';
import { toast } from 'sonner';

interface InvoicesTabProps {
  clientId: string;
  clientName: string;
  clientMonthlyFee?: number;   // agorot
  clientCaseNum: string;
  clientEmail?: string;
  clientBillingDay?: number;
}

function buildInvoiceText(
  invoice: Invoice,
  firmData: Firm | null,
  clientName: string,
  clientCaseNum: string,
  clientEmail: string | undefined,
  clientBillingDay: number | undefined,
  monthHours: HoursEntry[],
  t: (key: string) => string
): string {
  const lines: string[] = [];
  lines.push('='.repeat(50));
  lines.push(t('invoices.transactionInvoice'));
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`${t('invoices.invoiceNum')}: ${invoice.invoiceNum}`);
  lines.push(`${t('invoices.date')}: ${formatDate(invoice.date)}`);
  lines.push('');

  if (firmData) {
    lines.push(`${t('invoices.from')}: ${firmData.name}`);
    if (firmData.regNum) lines.push(`  ${firmData.regNum}`);
    if (firmData.city) lines.push(`  ${firmData.city}`);
    lines.push('');
  }

  lines.push(`${t('invoices.to')}: ${clientName}`);
  lines.push(`${t('invoices.caseFile')}: ${clientCaseNum}`);
  if (clientEmail) lines.push(`  ${clientEmail}`);
  lines.push('');
  lines.push('-'.repeat(50));

  for (const item of invoice.items) {
    lines.push(`${item.desc}`);
    if (item.qty !== 1 || item.unit > 0) {
      lines.push(`  ${item.qty} x ${formatMoney(item.unit)} = ${formatMoney(item.total)}`);
    }
    if (item.note) lines.push(`  (${item.note})`);
  }

  lines.push('-'.repeat(50));
  lines.push(`${t('invoices.beforeVat')}: ${formatMoney(invoice.subtotal)}`);
  lines.push(`${t('billing.vat')} (18%): ${formatMoney(invoice.vatAmount)}`);
  lines.push(`${t('invoices.totalDue')}: ${formatMoney(invoice.total)}`);
  lines.push('');

  if (clientBillingDay) {
    lines.push(`${t('invoices.paymentDue')}: ${clientBillingDay}`);
  }

  if (monthHours.length > 0) {
    lines.push('');
    lines.push(`${t('hours.staffSummary')}:`);
    const staffMap: Record<string, number> = {};
    for (const h of monthHours) {
      staffMap[h.staffName] = (staffMap[h.staffName] || 0) + h.hours;
    }
    for (const [name, hrs] of Object.entries(staffMap)) {
      lines.push(`  ${name}: ${hrs}h`);
    }
  }

  lines.push('');
  lines.push(t('invoices.thanks'));
  lines.push('='.repeat(50));

  return lines.join('\n');
}

export function InvoicesTab({
  clientId,
  clientName,
  clientMonthlyFee,
  clientCaseNum,
  clientEmail,
  clientBillingDay,
}: InvoicesTabProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const firmData = useAuthStore((s) => s.firmData);
  const can = useAuthStore((s) => s.can);
  const { data: invoices = [], isLoading } = useInvoices(firmId, clientId);
  const { data: hoursEntries = [] } = useHours(firmId, clientId);
  const createInvoice = useCreateInvoice();
  const markPaid = useMarkInvoicePaid();
  const markSent = useMarkInvoiceSent();

  const [showCreate, setShowCreate] = useState(false);
  const [selMonth, setSelMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const monthHours = useMemo(
    () => hoursEntries.filter(e => e.date.startsWith(selMonth)),
    [hoursEntries, selMonth]
  );
  const totalMonthHours = monthHours.reduce((s, e) => s + e.hours, 0);

  const feePreview = useMemo(() => {
    if (!clientMonthlyFee) return null;
    return calculateInvoiceTotal(clientMonthlyFee);
  }, [clientMonthlyFee]);

  const monthOptions = useMemo(() => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
      months.push({ value: val, label });
    }
    return months;
  }, []);

  if (!firmId || !can('billing.view')) return null;

  async function handleCreate() {
    if (!firmId || !clientMonthlyFee || !feePreview) return;

    const invoiceNum = await invoiceService.getNextInvoiceNumber(firmId);

    const items: InvoiceItem[] = [
      {
        desc: t('invoices.professionalServices'),
        qty: 1,
        unit: clientMonthlyFee,
        total: clientMonthlyFee,
      },
    ];

    if (totalMonthHours > 0) {
      items.push({
        desc: t('invoices.hoursInMonth'),
        qty: totalMonthHours,
        unit: 0,
        total: 0,
        note: t('invoices.includedInFee'),
      });
    }

    createInvoice.mutate(
      {
        firmId,
        input: {
          client_id: clientId,
          invoiceNum,
          date: getToday(),
          items,
          subtotal: feePreview.subtotal,
          vatAmount: feePreview.vatAmount,
          total: feePreview.total,
        },
      },
      {
        onSuccess: () => {
          setShowCreate(false);
        },
      }
    );
  }

  function handlePrint(invoice: Invoice) {
    const invoiceMonth = invoice.date.substring(0, 7);
    const invoiceHours = hoursEntries.filter(e => e.date.startsWith(invoiceMonth));
    const content = buildInvoiceText(
      invoice,
      firmData,
      clientName,
      clientCaseNum,
      clientEmail,
      clientBillingDay,
      invoiceHours,
      t
    );
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNum}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('invoices.downloadSuccess'));
  }

  const columns: ColumnDef<Invoice, unknown>[] = [
    {
      accessorKey: 'invoiceNum',
      header: t('invoices.invoiceNum'),
      cell: ({ row }) => <span dir="ltr">{row.original.invoiceNum}</span>,
    },
    {
      accessorKey: 'date',
      header: t('invoices.date'),
      cell: ({ row }) => <span dir="ltr">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'subtotal',
      header: t('billing.subtotal'),
      cell: ({ row }) => <span dir="ltr">{formatMoney(row.original.subtotal)}</span>,
    },
    {
      accessorKey: 'vatAmount',
      header: t('billing.vat'),
      cell: ({ row }) => <span dir="ltr">{formatMoney(row.original.vatAmount)}</span>,
    },
    {
      accessorKey: 'total',
      header: t('billing.total'),
      cell: ({ row }) => <span dir="ltr" className="font-semibold">{formatMoney(row.original.total)}</span>,
    },
    {
      id: 'status',
      header: t('invoices.status'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <StatusBadge status={row.original.paid ? 'paid' : 'pending'} />
          {row.original.sent && <StatusBadge status="sent" />}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              handlePrint(row.original);
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
          {!row.original.paid && can('billing.edit') && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-600"
              onClick={(e) => {
                e.stopPropagation();
                markPaid.mutate({ firmId: firmId!, id: row.original.id });
              }}
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          {!row.original.sent && can('billing.edit') && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                markSent.mutate({ firmId: firmId!, id: row.original.id });
              }}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Create invoice section */}
      {clientMonthlyFee && clientMonthlyFee > 0 ? (
        <>
          {can('billing.invoices') && (
            <Button onClick={() => setShowCreate(!showCreate)} size="sm">
              <Plus className="h-4 w-4 me-2" />
              {t('invoices.newInvoice')}
            </Button>
          )}

          {showCreate && feePreview && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">{t('invoices.billingPeriod')}</label>
                <Select value={selMonth} onValueChange={setSelMonth}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="text-sm space-y-1">
                <p className="font-medium">{t('invoices.invoiceWillInclude')}:</p>
                <p>{t('invoices.monthlyFeeLabel')}: {formatMoney(clientMonthlyFee)}</p>
                <p>{t('billing.vat')} (18%): {formatMoney(feePreview.vatAmount)}</p>
                <p className="font-semibold">{t('billing.total')}: {formatMoney(feePreview.total)}</p>
                {totalMonthHours > 0 && (
                  <p className="text-muted-foreground">
                    {t('invoices.hoursInMonth')}: {totalMonthHours}h ({t('invoices.includedInFee')})
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={createInvoice.isPending} size="sm">
                  {t('billing.createInvoice')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)} size="sm">
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('invoices.noMonthlyFee')}</p>
      )}

      {/* Invoices table */}
      <DataTable
        columns={columns}
        data={invoices}
        emptyMessage={t('invoices.noInvoicesYet')}
      />
    </div>
  );
}
