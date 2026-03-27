// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation with file size limit + audit logging

import { useState, useRef, useMemo, useCallback } from 'react';
import { Upload, CheckCircle, Download, AlertCircle } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { useImportClients } from '@/hooks/useBackup';
import { importService, generateImportTemplate } from '@/services/importService';
import type { ImportRow, ImportRowResult, ImportResult } from '@/types';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatFileSize } from '@/lib/format';

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function ImportPanel() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients } = useClients(firmId);
  const importClients = useImportClients();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [validatedRows, setValidatedRows] = useState<ImportRowResult[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const existingNames = useMemo(() => {
    const names = new Set<string>();
    (clients ?? []).forEach((c) => names.add(c.name.toLowerCase()));
    return names;
  }, [clients]);

  const handleFile = useCallback(async (file: File) => {
    // File size check
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      toast.error(t('backup.fileTooLarge').replace('{size}', formatFileSize(MAX_IMPORT_FILE_SIZE)));
      return;
    }

    setIsLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let rows: ImportRow[];

      if (ext === 'csv') {
        rows = await importService.parseCSV(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        rows = await importService.parseExcel(file);
      } else if (ext === 'json') {
        rows = await importService.parseJSON(file);
      } else {
        toast.error(t('import.noData'));
        return;
      }

      if (rows.length === 0) {
        toast.error(t('import.noData'));
        return;
      }

      const validated = importService.validateRows(rows, existingNames);
      setValidatedRows(validated);
      setStep('preview');
    } catch {
      toast.error(t('import.noData'));
    } finally {
      setIsLoading(false);
    }
  }, [existingNames, t]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = useCallback(async () => {
    const validRows = validatedRows.filter((r) => r.valid).map((r) => r.row);
    if (validRows.length === 0) return;

    try {
      const result = await importClients.mutateAsync(validRows);
      setImportResult(result);
      setStep('done');
    } catch {
      // Error handled by mutation onError
    }
  }, [validatedRows, importClients]);

  const downloadTemplate = useCallback(() => {
    const csv = generateImportTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const validCount = validatedRows.filter((r) => r.valid).length;
  const errorCount = validatedRows.filter((r) => !r.valid).length;

  const previewColumns: ColumnDef<ImportRowResult, unknown>[] = useMemo(() => [
    {
      accessorKey: 'row._rowIndex',
      header: '#',
      cell: ({ row }) => <span dir="ltr">{row.original.row._rowIndex}</span>,
    },
    {
      accessorKey: 'row.name',
      header: t('export.field.name'),
      cell: ({ row }) => row.original.row.name || '—',
    },
    {
      accessorKey: 'row.taxId',
      header: t('export.field.taxId'),
      cell: ({ row }) => <span dir="ltr">{row.original.row.taxId || '—'}</span>,
    },
    {
      accessorKey: 'row.email',
      header: t('export.field.email'),
      cell: ({ row }) => <span dir="ltr">{row.original.row.email || '—'}</span>,
    },
    {
      accessorKey: 'row.mobile',
      header: t('export.field.phone'),
      cell: ({ row }) => <span dir="ltr">{row.original.row.mobile || row.original.row.phone || '—'}</span>,
    },
    {
      id: 'status',
      header: t('common.status'),
      cell: ({ row }) => {
        const r = row.original;
        if (r.isDuplicate) return <Badge variant="outline">{t('import.duplicate')}</Badge>;
        if (r.errors.length > 0) return <Badge variant="destructive">{r.errors.map(e => t(`import.${e}`)).join(', ')}</Badge>;
        return <Badge className="bg-green-100 text-green-800 border-transparent dark:bg-green-900/30 dark:text-green-400">{t('common.valid')}</Badge>;
      },
    },
  ], [t]);

  if (step === 'done' && importResult) {
    return (
      <div className="text-center py-12 space-y-4">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
        <h3 className="text-xl font-semibold">{t('import.done')}</h3>
        <p className="text-muted-foreground">
          {t('import.doneDesc').replace('{count}', String(importResult.imported))}
        </p>
        <Button variant="outline" onClick={() => { setStep('upload'); setValidatedRows([]); setImportResult(null); }}>
          {t('import.importMore')}
        </Button>
      </div>
    );
  }

  if (step === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{validCount} {t('import.rows')}</Badge>
            {errorCount > 0 && (
              <Badge variant="destructive">{errorCount} {t('import.errors')}</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setStep('upload'); setValidatedRows([]); }}>
              {t('import.cancel')}
            </Button>
            <Button
              onClick={handleImport}
              disabled={validCount === 0 || importClients.isPending}
            >
              {importClients.isPending
                ? t('common.loading')
                : t('import.importButton').replace('{count}', String(validCount))
              }
            </Button>
          </div>
        </div>

        <DataTable columns={previewColumns} data={validatedRows} emptyMessage={t('import.noData')} pageSize={10} />
      </div>
    );
  }

  // Upload step
  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          {t('import.instructions')}
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ps-2">
          <li>{t('import.headerRow')}</li>
          <li>{t('import.requiredField')}</li>
          <li>{t('import.taxIdFormat')}</li>
          <li>{t('import.feeFormat')}</li>
          <li>{t('import.noDuplicates')}</li>
        </ul>
        <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
          <Download className="h-4 w-4" />
          {t('import.downloadTemplate')}
        </Button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
        )}
      >
        <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">{t('import.dragDrop')}</p>
        <p className="text-sm text-muted-foreground mt-1">{t('import.clickSelect')}</p>
        <p className="text-xs text-muted-foreground mt-2">{t('import.supported')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="animate-spin rounded-full border-2 border-muted border-t-primary h-5 w-5" />
          <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
        </div>
      )}
    </div>
  );
}
