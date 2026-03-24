// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, FileSpreadsheet, Image, File, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { useFolders, useUploadDocument } from '@/hooks/useDocuments';
import type { DocumentSensitivity } from '@/types';
import { DOCUMENT_SENSITIVITIES } from '@/lib/constants';
import { formatFileSize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function getFileIcon(filename: string): LucideIcon {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return FileText;
    case 'doc': case 'docx': return FileText;
    case 'xls': case 'xlsx': return FileSpreadsheet;
    case 'jpg': case 'jpeg': case 'png': return Image;
    default: return File;
  }
}

export function DocsImportPanel() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients } = useClients(firmId);
  const uploadDocument = useUploadDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [sensitivity, setSensitivity] = useState<DocumentSensitivity>('internal');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { data: folders } = useFolders(firmId, selectedClientId);

  const selectedFolder = folders?.find((f) => f.id === selectedFolderId);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

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
    const newFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedClientId || !selectedFolderId || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    // Upload with concurrency limit of 3
    const batch = [...files];
    const concurrency = 3;
    for (let i = 0; i < batch.length; i += concurrency) {
      const chunk = batch.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map((file) =>
          uploadDocument.mutateAsync({
            firmId: firmId!,
            clientId: selectedClientId,
            folderId: selectedFolderId,
            folderName: selectedFolder?.name ?? '',
            file,
            sensitivity,
          })
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled') successCount++;
        else failCount++;
      }
    }

    setUploading(false);
    setFiles([]);

    if (failCount > 0) {
      toast.warning(t('docs.uploadPartial').replace('{success}', String(successCount)).replace('{fail}', String(failCount)));
    } else {
      toast.success(`${successCount} ${t('documents.uploadSuccess')}`);
    }
  }, [selectedClientId, selectedFolderId, files, firmId, selectedFolder, sensitivity, uploadDocument, t]);

  // Reset folder when client changes
  const handleClientChange = useCallback((clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedFolderId('');
  }, []);

  return (
    <div className="space-y-6">
      {/* Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('docs.selectClient')}</label>
          <Select value={selectedClientId} onValueChange={handleClientChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('docs.selectClient')} />
            </SelectTrigger>
            <SelectContent>
              {(clients ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('docs.selectFolder')}</label>
          <Select value={selectedFolderId} onValueChange={setSelectedFolderId} disabled={!selectedClientId}>
            <SelectTrigger>
              <SelectValue placeholder={t('docs.selectFolder')} />
            </SelectTrigger>
            <SelectContent>
              {(folders ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('docs.sensitivity')}</label>
          <Select value={sensitivity} onValueChange={(v) => setSensitivity(v as DocumentSensitivity)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DOCUMENT_SENSITIVITIES).map(([key, labelKey]) => (
                <SelectItem key={key} value={key}>{t(labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="font-medium">{t('docs.dragFiles')}</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => {
            const Icon = getFileIcon(file.name);
            return (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{file.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground" dir="ltr">{formatFileSize(file.size)}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeFile(i)} className="h-6 w-6 p-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload button */}
      <Button
        onClick={handleUpload}
        disabled={!selectedClientId || !selectedFolderId || files.length === 0 || uploading}
        className="gap-2"
      >
        <Upload className="h-4 w-4" />
        {uploading ? t('docs.uploading') : t('docs.uploadButton')}
      </Button>
    </div>
  );
}
