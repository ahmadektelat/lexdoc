// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  useBillingEntries,
  useCreateBillingEntry,
  useMarkBillingPaid,
  useCancelBillingEntry,
} from '@/hooks/useBilling';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate, getToday } from '@/lib/dates';
import { formatMoney, shekelToAgorot, calculateVat } from '@/lib/money';
import { Plus, Check, X } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { BillingEntry } from '@/types';
import { toast } from 'sonner';

interface LedgerTabProps {
  clientId: string;
  clientName: string;
  clientCaseNum: string;
  clientMonthlyFee?: number;   // agorot
}

export function LedgerTab({ clientId, clientName, clientCaseNum, clientMonthlyFee }: LedgerTabProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const { data: entries = [], isLoading } = useBillingEntries(firmId, clientId);
  const createEntry = useCreateBillingEntry();
  const markPaid = useMarkBillingPaid();
  const cancelEntry = useCancelBillingEntry();

  const [showAdd, setShowAdd] = useState(false);
  const [entryType, setEntryType] = useState<'charge' | 'credit'>('charge');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getToday());
  const [includeVat, setIncludeVat] = useState(false);

  const metrics = useMemo(() => {
    const active = entries.filter(e => e.status !== 'cancelled');
    const totalCharges = active.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
    const totalCredits = active.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
    const pending = entries.filter(e => e.status === 'pending');
    const pendingCharges = pending.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
    const pendingCredits = pending.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
    const balance = pendingCharges - pendingCredits;
    return { totalCharges, totalCredits, balance };
  }, [entries]);

  // VAT preview for the form
  const vatPreview = useMemo(() => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || !includeVat || entryType !== 'charge') return null;
    const base = shekelToAgorot(parsedAmount);
    return base + calculateVat(base);
  }, [amount, includeVat, entryType]);

  if (!firmId || !can('billing.view')) return null;

  function handleSubmit() {
    if (!firmId) return;
    if (!desc.trim()) {
      toast.error(t('billing.descriptionRequired'));
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error(t('billing.validAmount'));
      return;
    }

    let amountAgorot = shekelToAgorot(parsedAmount);
    if (includeVat && entryType === 'charge') {
      amountAgorot = amountAgorot + calculateVat(amountAgorot);
    }

    createEntry.mutate(
      {
        firmId,
        input: {
          client_id: clientId,
          type: entryType,
          amount: amountAgorot,
          date,
          notes: desc,
        },
      },
      {
        onSuccess: () => {
          setDesc('');
          setAmount('');
          setDate(getToday());
          setIncludeVat(false);
          setShowAdd(false);
        },
      }
    );
  }

  function handleMonthlyCharge() {
    if (!firmId || !clientMonthlyFee) return;
    const amountWithVat = clientMonthlyFee + calculateVat(clientMonthlyFee);
    createEntry.mutate({
      firmId,
      input: {
        client_id: clientId,
        type: 'charge',
        amount: amountWithVat,
        date: getToday(),
        notes: t('billing.monthlyCharge'),
      },
    });
  }

  const columns: ColumnDef<BillingEntry, unknown>[] = [
    {
      accessorKey: 'date',
      header: t('billing.date'),
      cell: ({ row }) => <span dir="ltr">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'notes',
      header: t('billing.description'),
    },
    {
      accessorKey: 'type',
      header: '',
      cell: ({ row }) => (
        <Badge
          className={
            row.original.type === 'charge'
              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-transparent'
              : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent'
          }
        >
          {t(`billing.${row.original.type}`)}
        </Badge>
      ),
    },
    {
      accessorKey: 'amount',
      header: t('billing.amount'),
      cell: ({ row }) => <span dir="ltr">{formatMoney(row.original.amount)}</span>,
    },
    {
      id: 'status',
      header: t('invoices.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.status === 'pending' && can('billing.edit') ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-600"
              onClick={(e) => {
                e.stopPropagation();
                markPaid.mutate({ firmId: firmId!, id: row.original.id });
              }}
              title={t('billing.markPaid')}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                cancelEntry.mutate({ firmId: firmId!, id: row.original.id });
              }}
              title={t('billing.cancelEntry')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null,
    },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-700 dark:text-red-400" dir="ltr">
            {formatMoney(metrics.totalCharges)}
          </div>
          <div className="text-sm text-red-600 dark:text-red-500">{t('billing.totalCharges')}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400" dir="ltr">
            {formatMoney(metrics.totalCredits)}
          </div>
          <div className="text-sm text-green-600 dark:text-green-500">{t('billing.totalCredits')}</div>
        </div>
        <div
          className={`rounded-lg p-3 text-center ${
            metrics.balance > 0
              ? 'bg-red-50 dark:bg-red-900/20'
              : 'bg-green-50 dark:bg-green-900/20'
          }`}
        >
          <div
            className={`text-2xl font-bold ${
              metrics.balance > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-green-700 dark:text-green-400'
            }`}
            dir="ltr"
          >
            {formatMoney(metrics.balance)}
          </div>
          <div className="text-sm text-muted-foreground">{t('billing.balance')}</div>
        </div>
      </div>

      {/* Action buttons */}
      {can('billing.create') && (
        <div className="flex flex-wrap gap-2">
          {clientMonthlyFee && clientMonthlyFee > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMonthlyCharge}
              disabled={createEntry.isPending}
            >
              {t('billing.monthlyCharge')} ({formatMoney(clientMonthlyFee + calculateVat(clientMonthlyFee))})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEntryType('charge');
              setShowAdd(true);
            }}
          >
            <Plus className="h-4 w-4 me-1" />
            {t('billing.addCharge')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEntryType('credit');
              setShowAdd(true);
            }}
          >
            <Plus className="h-4 w-4 me-1" />
            {t('billing.addCredit')}
          </Button>
        </div>
      )}

      {/* Add entry form */}
      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={entryType === 'charge' ? 'default' : 'outline'}
              onClick={() => setEntryType('charge')}
            >
              {t('billing.charge')}
            </Button>
            <Button
              size="sm"
              variant={entryType === 'credit' ? 'default' : 'outline'}
              onClick={() => setEntryType('credit')}
            >
              {t('billing.credit')}
            </Button>
          </div>

          <FormField label={t('billing.description')} required>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={`${t('billing.amount')} (₪)`} required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label={t('billing.date')} required>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </div>

          {entryType === 'charge' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="includeVat"
                checked={includeVat}
                onCheckedChange={(checked) => setIncludeVat(!!checked)}
              />
              <label htmlFor="includeVat" className="text-sm">
                {t('billing.includeVat')}
              </label>
            </div>
          )}

          {vatPreview && (
            <p className="text-sm text-muted-foreground">
              {t('billing.totalWithVat')}: <span dir="ltr">{formatMoney(vatPreview)}</span>
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={createEntry.isPending} size="sm">
              {t('common.save')}
            </Button>
            <Button variant="outline" onClick={() => setShowAdd(false)} size="sm">
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={entries}
        emptyMessage={t('billing.noEntriesYet')}
      />
    </div>
  );
}
