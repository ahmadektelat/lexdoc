// CREATED: 2026-03-23
// UPDATED: 2026-03-26 15:00 IST (Jerusalem)
//          - Used invoices.pdfGenerating i18n key on download button spinner (review fix)
//          - Replaced buildInvoiceText + handlePrint with PDF generation via jsPDF
//          - Uses dynamic import() for PDF modules (lazy loading)

import { useState, useMemo, useCallback } from 'react';
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
import { formatMoney, calculateInvoiceTotal, agorotToShekel } from '@/lib/money';
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

// Logo base64 cache — loaded once per session
let cachedLogoBase64: string | null | undefined = undefined;

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
  const [isPrinting, setIsPrinting] = useState(false);
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

  const handlePrint = useCallback(async (invoice: Invoice) => {
    if (isPrinting) return;
    setIsPrinting(true);
    try {
      // Dynamic import for lazy loading PDF modules
      const { createPdfDoc, renderLetterhead, fetchImageAsBase64 } = await import('@/lib/pdf');
      await import('jspdf-autotable');

      // Fetch logo (cached after first call)
      if (cachedLogoBase64 === undefined) {
        cachedLogoBase64 = await fetchImageAsBase64(firmData?.logo);
      }

      const doc = createPdfDoc();
      const PAGE_W = 210;
      const M = 15;
      let y = renderLetterhead(doc, firmData, cachedLogoBase64);

      // Invoice title
      doc.setFontSize(14);
      doc.text(t('invoices.transactionInvoice'), PAGE_W - M, y, { align: 'right' });
      y += 8;

      // Invoice meta (number, date)
      doc.setFontSize(10);
      doc.text(`${t('invoices.invoiceNum')}: ${invoice.invoiceNum}`, PAGE_W - M, y, { align: 'right' });
      y += 5;
      doc.text(`${t('invoices.date')}: ${formatDate(invoice.date)}`, PAGE_W - M, y, { align: 'right' });
      y += 8;

      // Client block
      doc.text(`${t('invoices.to')}: ${clientName}`, PAGE_W - M, y, { align: 'right' });
      y += 5;
      doc.text(`${t('invoices.caseFile')}: ${clientCaseNum}`, PAGE_W - M, y, { align: 'right' });
      y += 5;
      if (clientEmail) {
        doc.text(clientEmail, PAGE_W - M, y, { align: 'right' });
        y += 5;
      }
      y += 5;

      // Line items table (RTL: columns reversed visually)
      const tableBody = invoice.items.map((item) => [
        formatMoney(item.total),
        `${formatMoney(item.unit)}`,
        String(item.qty),
        item.desc + (item.note ? ` (${item.note})` : ''),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        startY: y,
        head: [[
          t('invoices.pdfTotal'),
          t('invoices.pdfUnitPrice'),
          t('invoices.pdfQty'),
          t('invoices.pdfDescription'),
        ]],
        body: tableBody,
        styles: { halign: 'right', fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246], halign: 'right', fontSize: 9 },
        margin: { left: M, right: M },
        tableWidth: 'auto',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 8;

      // Totals section
      doc.setFontSize(10);
      doc.text(`${t('invoices.beforeVat')}: ${formatMoney(invoice.subtotal)}`, PAGE_W - M, y, { align: 'right' });
      y += 5;
      doc.text(`${t('billing.vat')} (18%): ${formatMoney(invoice.vatAmount)}`, PAGE_W - M, y, { align: 'right' });
      y += 5;
      doc.setFontSize(12);
      doc.text(`${t('invoices.totalDue')}: ${formatMoney(invoice.total)}`, PAGE_W - M, y, { align: 'right' });
      y += 10;

      // Hours summary
      const invoiceMonth = invoice.date.substring(0, 7);
      const invoiceHours = hoursEntries.filter(e => e.date.startsWith(invoiceMonth));
      if (invoiceHours.length > 0) {
        doc.setFontSize(10);
        doc.text(`${t('hours.staffSummary')}:`, PAGE_W - M, y, { align: 'right' });
        y += 5;
        const staffMap: Record<string, number> = {};
        for (const h of invoiceHours) {
          staffMap[h.staffName] = (staffMap[h.staffName] || 0) + h.hours;
        }
        for (const [name, hrs] of Object.entries(staffMap)) {
          doc.text(`${name}: ${hrs}h`, PAGE_W - M - 5, y, { align: 'right' });
          y += 4;
        }
        y += 5;
      }

      // Footer
      if (clientBillingDay) {
        doc.setFontSize(9);
        doc.text(`${t('invoices.paymentDue')}: ${clientBillingDay}`, PAGE_W - M, y, { align: 'right' });
        y += 5;
      }
      doc.text(t('invoices.thanks'), PAGE_W - M, y, { align: 'right' });

      doc.save(`${invoice.invoiceNum}.pdf`);
      toast.success(t('invoices.downloadSuccess'));
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setIsPrinting(false);
    }
  }, [isPrinting, firmData, t, clientName, clientCaseNum, clientEmail, clientBillingDay, hoursEntries]);

  if (!firmId || !can('billing.view')) return null;

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
            disabled={isPrinting}
            title={isPrinting ? t('invoices.pdfGenerating') : undefined}
            onClick={(e) => {
              e.stopPropagation();
              handlePrint(row.original);
            }}
          >
            {isPrinting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Download className="h-4 w-4" />}
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
