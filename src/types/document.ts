// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Renamed Document to LegalDocument (amendment 4)
//          - Excluded firm_id from CreateDocumentInput (security audit)

export type DocumentSensitivity = 'internal' | 'confidential' | 'restricted' | 'public';

export interface LegalDocument {
  id: string;
  firm_id: string;
  client_id?: string;
  name: string;
  folder: string;
  size: string;
  date: string;           // ISO date
  ver: number;
  sensitivity: DocumentSensitivity;
  imported: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentFolder {
  name: string;
  docCount: number;
}

export type CreateDocumentInput = Omit<LegalDocument, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;
