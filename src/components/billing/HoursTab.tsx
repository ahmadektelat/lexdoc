// CREATED: 2026-03-23
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useHours, useCreateHoursEntry, useDeleteHoursEntry } from '@/hooks/useHours';
import { useStaff } from '@/hooks/useStaff';
import { DataTable } from '@/components/shared/DataTable';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { FormField } from '@/components/shared/FormField';
import { StaffPicker } from '@/components/staff/StaffPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, getToday } from '@/lib/dates';
import { Clock, Plus, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { HoursEntry } from '@/types';
import { toast } from 'sonner';

interface HoursTabProps {
  clientId: string;
  clientName: string;
}

export function HoursTab({ clientId, clientName }: HoursTabProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const { data: entries = [], isLoading } = useHours(firmId, clientId);
  const { data: staffList = [] } = useStaff(firmId);
  const createEntry = useCreateHoursEntry();
  const deleteEntry = useDeleteHoursEntry();

  const [showForm, setShowForm] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(getToday());
  const [note, setNote] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalHours = useMemo(() => entries.reduce((sum, e) => sum + e.hours, 0), [entries]);
  const todayHours = useMemo(
    () => entries.filter(e => e.date === getToday()).reduce((sum, e) => sum + e.hours, 0),
    [entries]
  );
  const activeStaff = useMemo(() => new Set(entries.map(e => e.staffId)).size, [entries]);
  const staffSummary = useMemo(
    () =>
      Object.values(
        entries.reduce((acc, e) => {
          acc[e.staffId] = acc[e.staffId] || { name: e.staffName, hours: 0 };
          acc[e.staffId].hours += e.hours;
          return acc;
        }, {} as Record<string, { name: string; hours: number }>)
      ),
    [entries]
  );

  if (!firmId || !can('billing.view')) return null;

  function handleSubmit() {
    if (!firmId) return;
    const parsedHours = parseFloat(hours);
    if (!parsedHours || parsedHours <= 0) {
      toast.error(t('hours.validHours'));
      return;
    }
    if (!staffId) {
      toast.error(t('hours.selectStaff'));
      return;
    }

    const staff = staffList.find(s => s.id === staffId);
    if (!staff) return;

    createEntry.mutate(
      {
        firmId,
        input: {
          client_id: clientId,
          staffId,
          staffName: staff.name,
          hours: parsedHours,
          date,
          note: note || undefined,
        },
      },
      {
        onSuccess: () => {
          setStaffId('');
          setHours('');
          setDate(getToday());
          setNote('');
          setShowForm(false);
        },
      }
    );
  }

  const columns: ColumnDef<HoursEntry, unknown>[] = [
    {
      accessorKey: 'date',
      header: t('hours.date'),
      cell: ({ row }) => <span dir="ltr">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'staffName',
      header: t('hours.staff'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
            {row.original.staffName.charAt(0)}
          </div>
          {row.original.staffName}
        </div>
      ),
    },
    { accessorKey: 'hours', header: t('hours.hoursColumn') },
    { accessorKey: 'note', header: t('hours.note') },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        can('billing.delete') ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(row.original.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{totalHours}</div>
          <div className="text-sm text-blue-600 dark:text-blue-500">{t('hours.totalHours')}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400">{todayHours}</div>
          <div className="text-sm text-green-600 dark:text-green-500">{t('hours.todayHours')}</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{activeStaff}</div>
          <div className="text-sm text-amber-600 dark:text-amber-500">{t('hours.staffActive')}</div>
        </div>
      </div>

      {/* Staff summary */}
      {staffSummary.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('hours.staffSummary')}</h4>
          <div className="flex flex-wrap gap-3">
            {staffSummary.map((s) => (
              <div key={s.name} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                  {s.name.charAt(0)}
                </div>
                <span className="text-sm">{s.name}</span>
                <span className="text-sm font-semibold">{s.hours}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log hours button */}
      {can('billing.create') && (
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 me-2" />
          {t('hours.logHours')}
        </Button>
      )}

      {/* Form */}
      {showForm && (
        <div className="border rounded-lg p-4 space-y-3">
          <FormField label={t('hours.staff')} required>
            <StaffPicker
              value={staffId}
              onChange={(v) => setStaffId(v ?? '')}
              firmId={firmId}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('hours.hoursColumn')} required>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label={t('hours.date')} required>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </div>
          <FormField label={t('hours.note')}>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={createEntry.isPending} size="sm">
              {t('common.save')}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} size="sm">
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={entries}
        emptyMessage={t('hours.noHoursYet')}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        variant="destructive"
        onConfirm={() => {
          if (deleteId) deleteEntry.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
