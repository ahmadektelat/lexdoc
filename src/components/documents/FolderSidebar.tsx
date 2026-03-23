// CREATED: 2026-03-23
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Initial implementation

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateFolder, useDeleteFolder } from '@/hooks/useDocuments';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderOpen, Plus, Trash2, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentFolder } from '@/types';

interface FolderSidebarProps {
  clientId: string;
  folders: DocumentFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onFolderCreated: () => void;
}

export function FolderSidebar({
  clientId,
  folders,
  selectedFolderId,
  onSelectFolder,
  onFolderCreated,
}: FolderSidebarProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  const totalDocs = folders.reduce((sum, f) => sum + (f.docCount ?? 0), 0);

  function handleCreateFolder() {
    if (!firmId || !newFolderName.trim()) return;
    createFolder.mutate(
      { firmId, input: { client_id: clientId, name: newFolderName.trim() } },
      {
        onSuccess: () => {
          setNewFolderName('');
          setShowNewFolder(false);
          onFolderCreated();
        },
      }
    );
  }

  function handleDeleteFolder() {
    if (!firmId || !deleteFolderId) return;
    deleteFolder.mutate(
      { firmId, folderId: deleteFolderId },
      {
        onSuccess: () => {
          if (selectedFolderId === deleteFolderId) {
            onSelectFolder(null);
          }
          setDeleteFolderId(null);
        },
      }
    );
  }

  return (
    <div className="w-64 border-e pe-4 space-y-1">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {t('documents.folders')}
      </h3>

      {/* All Documents */}
      <button
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-start',
          selectedFolderId === null
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-muted/50'
        )}
        onClick={() => onSelectFolder(null)}
      >
        <span>{t('documents.allDocuments')}</span>
        <span className="text-xs text-muted-foreground" dir="ltr">{totalDocs}</span>
      </button>

      {/* Folder list */}
      {folders.map((folder) => (
        <div key={folder.id} className="group flex items-center">
          <button
            className={cn(
              'flex-1 flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-start',
              selectedFolderId === folder.id
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted/50'
            )}
            onClick={() => onSelectFolder(folder.id)}
          >
            <span className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              {folder.name}
            </span>
            <span className="text-xs text-muted-foreground" dir="ltr">
              {folder.docCount ?? 0}
            </span>
          </button>
          {can('documents.delete') && (folder.docCount ?? 0) === 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
              onClick={() => setDeleteFolderId(folder.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-1 px-1">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t('documents.folderName')}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') setShowNewFolder(false);
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary"
            onClick={handleCreateFolder}
            disabled={createFolder.isPending}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* New folder button */}
      {can('documents.upload') && !showNewFolder && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setShowNewFolder(true)}
        >
          <Plus className="h-4 w-4 me-2" />
          {t('documents.newFolder')}
        </Button>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteFolderId}
        onOpenChange={(open) => !open && setDeleteFolderId(null)}
        title={t('documents.deleteFolder')}
        variant="destructive"
        onConfirm={handleDeleteFolder}
      />
    </div>
  );
}
