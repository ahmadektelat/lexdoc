// CREATED: 2026-03-23
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFolders, useEnsureDefaultFolders } from '@/hooks/useDocuments';
import { FolderSidebar } from './FolderSidebar';
import { DocumentTable } from './DocumentTable';
import { DocumentUpload } from './DocumentUpload';
import { DocGenModal } from './DocGenModal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Upload, FileEdit } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentsTabProps {
  clientId: string;
  clientName: string;
  clientCaseNum: string;
}

export function DocumentsTab({ clientId, clientName, clientCaseNum }: DocumentsTabProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const { data: folders = [], isLoading } = useFolders(firmId, clientId);
  const ensureDefaults = useEnsureDefaultFolders();
  const defaultFoldersEnsured = useRef(false);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showDocGen, setShowDocGen] = useState(false);

  // Ensure default folders exist on first load
  useEffect(() => {
    if (firmId && !defaultFoldersEnsured.current) {
      defaultFoldersEnsured.current = true;
      ensureDefaults.mutate({ firmId, clientId });
    }
  }, [firmId, clientId, ensureDefaults]);

  if (!firmId || !can('documents.view')) return null;
  if (isLoading) return <LoadingSpinner />;

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);
  const folderName = selectedFolder?.name ?? t('documents.allDocuments');

  function handleUploadClick() {
    if (!selectedFolderId) {
      toast.error(t('documents.selectFolder'));
      return;
    }
    setShowUpload(true);
  }

  return (
    <div className="space-y-4">
      {/* Header with action buttons */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('documents.title')}</h3>
        <div className="flex gap-2">
          {can('documents.upload') && (
            <>
              <Button size="sm" onClick={handleUploadClick}>
                <Upload className="h-4 w-4 me-2" />
                {t('documents.upload')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowDocGen(true)}>
                <FileEdit className="h-4 w-4 me-2" />
                {t('documents.generateDocument')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        <FolderSidebar
          clientId={clientId}
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onFolderCreated={() => {}}
        />

        <div className="flex-1 min-w-0">
          <DocumentTable
            clientId={clientId}
            folderId={selectedFolderId}
            folderName={folderName}
          />
        </div>
      </div>

      {/* Upload dialog */}
      {showUpload && selectedFolderId && selectedFolder && (
        <DocumentUpload
          clientId={clientId}
          folderId={selectedFolderId}
          folderName={selectedFolder.name}
          onSuccess={() => {}}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* DocGen dialog */}
      {showDocGen && (
        <DocGenModal
          clientId={clientId}
          clientName={clientName}
          clientCaseNum={clientCaseNum}
          onSuccess={() => {}}
          onClose={() => setShowDocGen(false)}
        />
      )}
    </div>
  );
}
