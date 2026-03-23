// CREATED: 2026-03-23
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Initial implementation

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDocuments, useUpdateDocument, useDeleteDocument } from '@/hooks/useDocuments';
import { documentService } from '@/services/documentService';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FormField } from '@/components/shared/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye, Pencil, Trash2, FileText, Shield } from 'lucide-react';
import { formatDate } from '@/lib/dates';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DOCUMENT_SENSITIVITIES } from '@/lib/constants';
import type { ColumnDef } from '@tanstack/react-table';
import type { LegalDocument, DocumentSensitivity } from '@/types';

const SENSITIVITY_COLORS: Record<DocumentSensitivity, string> = {
  internal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  confidential: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  restricted: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  public: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

interface DocumentTableProps {
  clientId: string;
  folderId: string | null;
  folderName: string;
}

export function DocumentTable({ clientId, folderId, folderName }: DocumentTableProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const { data: documents = [], isLoading } = useDocuments(firmId, clientId, folderId);
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editDoc, setEditDoc] = useState<LegalDocument | null>(null);
  const [editName, setEditName] = useState('');
  const [editSensitivity, setEditSensitivity] = useState<DocumentSensitivity>('internal');
  const [editVer, setEditVer] = useState('1');

  function openEdit(doc: LegalDocument) {
    setEditDoc(doc);
    setEditName(doc.name);
    setEditSensitivity(doc.sensitivity);
    setEditVer(String(doc.ver));
  }

  function handleSaveEdit() {
    if (!firmId || !editDoc) return;
    updateDocument.mutate(
      {
        firmId,
        id: editDoc.id,
        input: {
          name: editName,
          sensitivity: editSensitivity,
          ver: parseInt(editVer, 10) || 1,
        },
      },
      { onSuccess: () => setEditDoc(null) }
    );
  }

  async function handleDownload(doc: LegalDocument) {
    try {
      const url = await documentService.getDownloadUrl(doc.file_path);
      window.open(url, '_blank');
    } catch {
      // Error handled silently — signed URL generation may fail if file was removed
    }
  }

  const columns: ColumnDef<LegalDocument, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('documents.fileName'),
    },
    {
      accessorKey: 'sensitivity',
      header: t('documents.sensitivity'),
      cell: ({ row }) => {
        const sens = row.original.sensitivity;
        return (
          <Badge className={cn('border-0', SENSITIVITY_COLORS[sens])}>
            {t(DOCUMENT_SENSITIVITIES[sens])}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'ver',
      header: t('documents.version'),
      cell: ({ row }) => <span dir="ltr">v{row.original.ver}</span>,
    },
    {
      accessorKey: 'created_at',
      header: t('documents.date'),
      cell: ({ row }) => <span dir="ltr">{formatDate(row.original.created_at)}</span>,
    },
    {
      accessorKey: 'size',
      header: t('documents.size'),
      cell: ({ row }) => <span dir="ltr">{formatFileSize(row.original.size)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const doc = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
              title={t('documents.download')}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {can('documents.upload') && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => { e.stopPropagation(); openEdit(doc); }}
                title={t('documents.editMetadata')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('documents.delete') && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={(e) => { e.stopPropagation(); setDeleteId(doc.id); }}
                title={t('documents.delete')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* AES-256 encryption indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-4 w-4" />
        {t('documents.encryption')}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={folderName}
          description={t('documents.noDocuments')}
        />
      ) : (
        <DataTable
          columns={columns}
          data={documents}
          searchable
          searchPlaceholder={t('common.search')}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={t('documents.delete')}
        description={t('documents.deleteConfirm')}
        variant="destructive"
        onConfirm={() => {
          if (deleteId && firmId) {
            deleteDocument.mutate({ firmId, id: deleteId });
          }
          setDeleteId(null);
        }}
      />

      {/* Edit metadata dialog */}
      <Dialog open={!!editDoc} onOpenChange={(open) => !open && setEditDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('documents.editMetadata')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label={t('documents.fileName')}>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </FormField>
            <FormField label={t('documents.sensitivity')}>
              <Select
                value={editSensitivity}
                onValueChange={(v) => setEditSensitivity(v as DocumentSensitivity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOCUMENT_SENSITIVITIES) as DocumentSensitivity[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(DOCUMENT_SENSITIVITIES[key])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t('documents.version')}>
              <Input
                type="number"
                min="1"
                value={editVer}
                onChange={(e) => setEditVer(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setEditDoc(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateDocument.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
