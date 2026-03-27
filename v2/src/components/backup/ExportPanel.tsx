// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation with audit logging

import { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { exportService, CLIENT_EXPORT_FIELDS } from '@/services/exportService';
import { auditService } from '@/services/auditService';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export function ExportPanel() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const user = useAuthStore((s) => s.user);
  const { data: clients } = useClients(firmId);

  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () => new Set(CLIENT_EXPORT_FIELDS.filter((f) => f.defaultSelected).map((f) => f.key))
  );
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');

  const filteredCount = useMemo(() => {
    if (!clients) return 0;
    if (statusFilter === 'all') return clients.length;
    return clients.filter((c) => c.status === statusFilter).length;
  }, [clients, statusFilter]);

  const toggleField = (key: string, checked: boolean | 'indeterminate') => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (checked === true) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleExportClients = () => {
    if (!clients) return;
    exportService.exportClients(clients, [...selectedFields], format, statusFilter, t);
    toast.success(t('export.exported').replace('{count}', String(filteredCount)));
    // Audit log
    auditService.log(firmId!, {
      userId: user?.id ?? '',
      userName: user?.name ?? '',
      action: 'data_exported',
      target: 'clients',
      entityType: 'client',
      details: { format, entityType: 'clients', recordCount: filteredCount },
    }).catch(() => { /* best-effort */ });
  };

  const handleExportFilings = async () => {
    try {
      await exportService.exportFilings(firmId!, t);
      toast.success(t('export.filingsExported'));
      auditService.log(firmId!, {
        userId: user?.id ?? '',
        userName: user?.name ?? '',
        action: 'data_exported',
        target: 'filings',
        entityType: 'filing',
        details: { format: 'csv', entityType: 'filings' },
      }).catch(() => { /* best-effort */ });
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  const handleExportTasks = async () => {
    try {
      await exportService.exportTasks(firmId!, t);
      toast.success(t('export.tasksExported'));
      auditService.log(firmId!, {
        userId: user?.id ?? '',
        userName: user?.name ?? '',
        action: 'data_exported',
        target: 'tasks',
        entityType: 'task',
        details: { format: 'csv', entityType: 'tasks' },
      }).catch(() => { /* best-effort */ });
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Field selection */}
      <div className="lg:col-span-2">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-lg font-semibold">{t('export.selectFields')}</h3>
          <div className="grid grid-cols-2 gap-3">
            {CLIENT_EXPORT_FIELDS.map((field) => (
              <label key={field.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selectedFields.has(field.key)}
                  onCheckedChange={(checked) => toggleField(field.key, checked)}
                />
                {t(field.labelKey)}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Settings + actions */}
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-lg font-semibold">{t('export.settings')}</h3>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('export.format')}</label>
            <Select value={format} onValueChange={(v) => setFormat(v as 'csv' | 'json')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">{t('export.csvExcel')}</SelectItem>
                <SelectItem value="json">{t('export.json')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('export.filterStatus')}</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'archived')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('export.allClients')}</SelectItem>
                <SelectItem value="active">{t('export.activeOnly')}</SelectItem>
                <SelectItem value="archived">{t('export.archivedOnly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>{t('export.clientsToExport').replace('{count}', String(filteredCount))}</p>
            <p>{t('export.fieldsSelected').replace('{count}', String(selectedFields.size))}</p>
          </div>

          <Button onClick={handleExportClients} disabled={selectedFields.size === 0 || filteredCount === 0} className="w-full gap-2">
            <Download className="h-4 w-4" />
            {t('export.exportButton').replace('{count}', String(filteredCount))}
          </Button>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-3">
          <h3 className="text-lg font-semibold">{t('export.additionalExports')}</h3>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportFilings}>
            <Download className="h-4 w-4" />
            {t('export.exportFilings')}
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportTasks}>
            <Download className="h-4 w-4" />
            {t('export.exportTasks')}
          </Button>
        </div>
      </div>
    </div>
  );
}
