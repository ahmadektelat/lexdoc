// CREATED: 2026-03-17
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Updated for DB-backed folders and storage integration
//          - Added folder_id, file_path, mime_type, generated, content
//          - Removed folder (string), date, imported, size (string)
//          - Added CreateFolderInput, UpdateDocumentInput

export type DocumentSensitivity = 'internal' | 'confidential' | 'restricted' | 'public';

export interface LegalDocument {
  id: string;
  firm_id: string;
  client_id: string;
  folder_id: string | null;  // null when parent folder was deleted (ON DELETE SET NULL)
  name: string;
  file_path: string;
  size: number;           // bytes
  mime_type: string;
  ver: number;
  sensitivity: DocumentSensitivity;
  generated: boolean;
  content?: string;       // text content for generated documents
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentFolder {
  id: string;
  firm_id: string;
  client_id: string;
  name: string;
  created_at: string;
  docCount?: number;      // computed client-side via count query
}

export type CreateDocumentInput = Omit<LegalDocument, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type CreateFolderInput = {
  client_id: string;
  name: string;
};

export type UpdateDocumentInput = Partial<Pick<LegalDocument, 'name' | 'sensitivity' | 'ver'>>;
