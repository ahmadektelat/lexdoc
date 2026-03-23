// CREATED: 2026-03-23
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUploadDocument } from '@/hooks/useDocuments';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
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
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DOCUMENT_SENSITIVITIES } from '@/lib/constants';
import { formatFileSize } from '@/lib/format';
import { toast } from 'sonner';
import type { DocumentSensitivity } from '@/types';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
  'application/zip',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface DocumentUploadProps {
  clientId: string;
  folderId: string;
  folderName: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function DocumentUpload({
  clientId,
  folderId,
  folderName,
  onSuccess,
  onClose,
}: DocumentUploadProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const uploadDocument = useUploadDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sensitivity, setSensitivity] = useState<DocumentSensitivity>('internal');
  const [dragging, setDragging] = useState(false);

  function validateFile(f: File): boolean {
    if (f.size > MAX_FILE_SIZE) {
      toast.error(t('documents.fileTooLarge'));
      return false;
    }
    if (!ALLOWED_MIME_TYPES.includes(f.type)) {
      toast.error(t('documents.invalidFileType'));
      return false;
    }
    return true;
  }

  function handleFileSelect(f: File) {
    if (validateFile(f)) {
      setFile(f);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }

  function handleSubmit() {
    if (!firmId || !file) return;
    uploadDocument.mutate(
      {
        firmId,
        clientId,
        folderId,
        folderName,
        file,
        sensitivity,
      },
      {
        onSuccess: () => {
          onSuccess();
          onClose();
        },
      }
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('documents.upload')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drag and drop zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
              file && 'border-primary bg-primary/5'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.zip"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) handleFileSelect(selectedFile);
              }}
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            {file ? (
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {formatFileSize(file.size)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('documents.uploadHint')}
              </p>
            )}
          </div>

          {/* Sensitivity selector */}
          <FormField label={t('documents.sensitivity')}>
            <Select
              value={sensitivity}
              onValueChange={(v) => setSensitivity(v as DocumentSensitivity)}
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
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || uploadDocument.isPending}
          >
            {t('documents.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
