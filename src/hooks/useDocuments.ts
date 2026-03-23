// CREATED: 2026-03-23
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { documentService } from '@/services/documentService';
import type { CreateFolderInput, UpdateDocumentInput, DocumentSensitivity } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

export const documentKeys = {
  all: ['documents'] as const,
  folders: () => [...documentKeys.all, 'folders'] as const,
  folderList: (firmId: string, clientId: string) =>
    [...documentKeys.folders(), firmId, clientId] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string, folderId: string | null) =>
    [...documentKeys.lists(), firmId, clientId, folderId ?? 'all'] as const,
};

export function useFolders(firmId: string | null, clientId: string) {
  return useQuery({
    queryKey: documentKeys.folderList(firmId ?? '', clientId),
    queryFn: () => documentService.listFolders(firmId!, clientId),
    enabled: !!firmId,
  });
}

export function useDocuments(firmId: string | null, clientId: string, folderId: string | null) {
  return useQuery({
    queryKey: documentKeys.list(firmId ?? '', clientId, folderId),
    queryFn: () => documentService.list(firmId!, clientId, folderId),
    enabled: !!firmId,
  });
}

export function useEnsureDefaultFolders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ firmId, clientId }: { firmId: string; clientId: string }) =>
      documentService.ensureDefaultFolders(firmId, clientId),
    onSuccess: (_data, { firmId, clientId }) => {
      queryClient.invalidateQueries({ queryKey: documentKeys.folderList(firmId, clientId) });
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, input }: { firmId: string; input: CreateFolderInput }) =>
      documentService.createFolder(firmId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.folders() });
      toast.success(t('documents.folderCreated'));
    },
    onError: () => toast.error(t('errors.saveFailed')),
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, folderId }: { firmId: string; folderId: string }) =>
      documentService.deleteFolder(firmId, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.folders() });
      toast.success(t('documents.folderDeleted'));
    },
    onError: (error) => {
      const msg = error instanceof Error && error.message.includes('not empty')
        ? t('documents.folderNotEmpty')
        : t('errors.saveFailed');
      toast.error(msg);
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async ({ firmId, clientId, folderId, folderName, file, sensitivity }:
      { firmId: string; clientId: string; folderId: string; folderName: string; file: File; sensitivity: DocumentSensitivity }) => {
      // Step 1: Upload file to storage
      const filePath = await documentService.upload(firmId, clientId, folderName, file);
      // Step 2: Create document metadata row — with storage cleanup on failure
      try {
        return await documentService.create(firmId, {
          client_id: clientId,
          folder_id: folderId,
          name: file.name,
          file_path: filePath,
          size: file.size,
          mime_type: file.type,
          ver: 1,
          sensitivity,
          generated: false,
        });
      } catch (dbError) {
        // DB insert failed — clean up the orphan storage file
        try {
          await supabase.storage.from('client-documents').remove([filePath]);
        } catch {
          // Storage cleanup is best-effort; don't mask the original error
        }
        throw dbError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success(t('documents.uploadSuccess'));
    },
    onError: () => toast.error(t('errors.saveFailed')),
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: UpdateDocumentInput }) =>
      documentService.update(firmId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
      toast.success(t('common.save'));
    },
    onError: () => toast.error(t('errors.saveFailed')),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
      documentService.delete(firmId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success(t('documents.deleteSuccess'));
    },
    onError: () => toast.error(t('errors.saveFailed')),
  });
}

export function useSaveGeneratedDocument() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async ({ firmId, clientId, folderId, name, content }:
      { firmId: string; clientId: string; folderId: string | null; name: string; content: string }) => {
      // Resolve folder ID — if null, auto-create the "התכתבויות" folder
      let resolvedFolderId = folderId;
      if (!resolvedFolderId) {
        const folder = await documentService.createFolder(firmId, {
          client_id: clientId,
          name: 'התכתבויות',
        });
        resolvedFolderId = folder.id;
      }

      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], name, { type: 'text/plain' });
      const filePath = await documentService.upload(firmId, clientId, 'התכתבויות', file);
      return documentService.create(firmId, {
        client_id: clientId,
        folder_id: resolvedFolderId,
        name,
        file_path: filePath,
        size: blob.size,
        mime_type: 'text/plain',
        ver: 1,
        sensitivity: 'internal',
        generated: true,
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success(t('documents.savedToFolder'));
    },
    onError: (error) => {
      const msg = error instanceof Error && error.message.includes('folder')
        ? t('documents.folderCreationFailed')
        : t('errors.saveFailed');
      toast.error(msg);
    },
  });
}
