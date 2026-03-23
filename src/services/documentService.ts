// CREATED: 2026-03-23
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_FOLDERS } from '@/lib/constants';
import { sanitizePath } from '@/lib/format';
import type {
  LegalDocument,
  DocumentFolder,
  CreateDocumentInput,
  CreateFolderInput,
  UpdateDocumentInput,
} from '@/types';

function rowToDocument(row: Record<string, unknown>): LegalDocument {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    folder_id: (row.folder_id as string) ?? null,
    name: row.name as string,
    file_path: row.file_path as string,
    size: row.size as number,
    mime_type: row.mime_type as string,
    ver: row.ver as number,
    sensitivity: row.sensitivity as LegalDocument['sensitivity'],
    generated: row.generated as boolean,
    content: (row.content as string) ?? undefined,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function rowToFolder(row: Record<string, unknown>): DocumentFolder {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    name: row.name as string,
    created_at: row.created_at as string,
    docCount: typeof row.doc_count === 'number' ? row.doc_count : undefined,
  };
}

export const documentService = {
  async listFolders(firmId: string, clientId: string): Promise<DocumentFolder[]> {
    // Fetch folders
    const { data: folders, error: foldersError } = await supabase
      .from('document_folders')
      .select('*')
      .eq('firm_id', firmId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (foldersError) throw new Error(foldersError.message);

    // Fetch doc counts per folder
    const { data: counts, error: countsError } = await supabase
      .from('documents')
      .select('folder_id')
      .eq('firm_id', firmId)
      .eq('client_id', clientId)
      .is('deleted_at', null);

    if (countsError) throw new Error(countsError.message);

    // Build count map
    const countMap: Record<string, number> = {};
    for (const row of counts as { folder_id: string }[]) {
      if (row.folder_id) {
        countMap[row.folder_id] = (countMap[row.folder_id] || 0) + 1;
      }
    }

    return (folders as Record<string, unknown>[]).map((f) => {
      const folder = rowToFolder(f);
      folder.docCount = countMap[folder.id] ?? 0;
      return folder;
    });
  },

  async createFolder(firmId: string, input: CreateFolderInput): Promise<DocumentFolder> {
    const { data, error } = await supabase
      .from('document_folders')
      .insert({
        firm_id: firmId,
        client_id: input.client_id,
        name: input.name,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToFolder(data as Record<string, unknown>);
  },

  async deleteFolder(firmId: string, folderId: string): Promise<void> {
    // Check for active documents
    const { count, error: countError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('folder_id', folderId)
      .eq('firm_id', firmId)
      .is('deleted_at', null);

    if (countError) throw new Error(countError.message);
    if (count && count > 0) throw new Error('Folder not empty');

    const { error } = await supabase
      .from('document_folders')
      .delete()
      .eq('id', folderId)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },

  async ensureDefaultFolders(firmId: string, clientId: string): Promise<void> {
    const rows = DEFAULT_FOLDERS.map((name) => ({
      firm_id: firmId,
      client_id: clientId,
      name,
    }));

    const { error } = await supabase
      .from('document_folders')
      .upsert(rows, { onConflict: 'firm_id,client_id,name', ignoreDuplicates: true });

    if (error) throw new Error(error.message);
  },

  async list(firmId: string, clientId: string, folderId: string | null): Promise<LegalDocument[]> {
    let query = supabase
      .from('documents')
      .select('*')
      .eq('firm_id', firmId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (folderId) {
      query = query.eq('folder_id', folderId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToDocument);
  },

  async getById(firmId: string, id: string): Promise<LegalDocument> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('firm_id', firmId)
      .single();

    if (error) throw new Error(error.message);
    return rowToDocument(data as Record<string, unknown>);
  },

  async create(firmId: string, input: CreateDocumentInput): Promise<LegalDocument> {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        firm_id: firmId,
        client_id: input.client_id,
        folder_id: input.folder_id,
        name: input.name,
        file_path: input.file_path,
        size: input.size,
        mime_type: input.mime_type,
        ver: input.ver,
        sensitivity: input.sensitivity,
        generated: input.generated,
        content: input.content ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToDocument(data as Record<string, unknown>);
  },

  async update(firmId: string, id: string, input: UpdateDocumentInput): Promise<LegalDocument> {
    const { data, error } = await supabase
      .from('documents')
      .update(input)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToDocument(data as Record<string, unknown>);
  },

  async delete(firmId: string, id: string): Promise<void> {
    // Fetch document to get file_path
    const doc = await documentService.getById(firmId, id);

    // Soft delete the DB row
    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);

    // Delete from storage (best-effort)
    try {
      await supabase.storage.from('client-documents').remove([doc.file_path]);
    } catch {
      // Storage cleanup is best-effort
    }
  },

  async upload(firmId: string, clientId: string, folderName: string, file: File): Promise<string> {
    const safeFolderName = sanitizePath(folderName);
    const safeFileName = sanitizePath(file.name);
    const path = `${firmId}/${clientId}/${safeFolderName}/${Date.now()}_${safeFileName}`;

    const { error } = await supabase.storage
      .from('client-documents')
      .upload(path, file, { contentType: file.type });

    if (error) throw new Error(error.message);
    return path;
  },

  async getDownloadUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(filePath, 60);

    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
};
