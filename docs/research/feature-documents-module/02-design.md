# Technical Design — Document Management Module

## Architecture Approach

This module follows the established three-layer architecture: **Service** (Supabase CRUD) -> **Hook** (React Query) -> **Component** (React UI). It adds two new database tables (`document_folders`, `documents`), a private Supabase Storage bucket (`client-documents`), and five new components under `src/components/documents/`.

**Why this approach over alternatives:**
- Consistent with billing, CRM, and filings modules already shipped
- Reuses existing shared components (DataTable, ConfirmDialog, EmptyState, FormField) and patterns (rowToX mappers, query key factories, permission checks via `can()`)
- No new dependencies required — all UI primitives (shadcn/ui, lucide-react, TanStack Table) already present

---

## Implementation Order

| Phase | What | Rationale |
|-------|------|-----------|
| 1 | Database migration | Tables must exist before service can query them |
| 2 | Type updates (`src/types/document.ts`) | Service and hooks depend on correct types |
| 3 | Service (`documentService.ts`) | Hooks depend on service methods |
| 4 | Hooks (`useDocuments.ts`) | Components depend on hooks |
| 5 | Components (FolderSidebar, DocumentTable, DocumentUpload, DocGenModal, DocumentsTab) | Build leaf components first, then compose |
| 6 | i18n keys (all 3 language files) | Components reference keys via `t()` |
| 7 | Integration (ClientTabs update) | Wire DocumentsTab into the existing tab system |
| 8 | Verification | `npx tsc --noEmit`, `npm run build`, `npm run lint` |

Note: Phase 5 and 6 can be done together since they are co-dependent. Build each component and add its keys simultaneously.

---

## File-by-File Change Plan

### 1. `supabase/migrations/20260323100000_create_documents_tables.sql`

- **Action:** Create new file
- **Changes:** Complete migration with `document_folders` table, `documents` table, indexes, RLS policies, triggers, GRANTs, and storage bucket policies
- **Dependencies:** Existing `firms`, `clients` tables; existing `user_firm_ids()`, `firm_subscription_active()`, `update_updated_at()` functions

### 2. `src/types/document.ts`

- **Action:** Modify existing file
- **Changes:**
  - Update `LegalDocument` interface: remove `folder`, `size` (string), `date`, `imported`; add `folder_id`, `file_path`, `size` (number), `mime_type`, `generated`, `content?`; make `client_id` required
  - Update `DocumentFolder` interface: add `id`, `firm_id`, `client_id`, `created_at`; make `docCount` optional (computed client-side)
  - Update `CreateDocumentInput` to match new `LegalDocument` fields
  - Add `CreateFolderInput` type
  - Add `UpdateDocumentInput` type (partial, for metadata edits)
- **Rationale:** Types must match DB schema; old fields (`folder`, `date`, `imported`) are not in the new schema
- **Dependencies:** None

### 3. `src/services/documentService.ts`

- **Action:** Create new file
- **Changes:** Export `documentService` object following `billingService` pattern. Methods:
  - `listFolders(firmId, clientId)` — query `document_folders` with left-join doc count
  - `createFolder(firmId, input)` — insert into `document_folders`
  - `deleteFolder(firmId, folderId)` — delete from `document_folders` (only if empty)
  - `ensureDefaultFolders(firmId, clientId)` — check if client has folders, create defaults if not
  - `list(firmId, clientId, folderId)` — query `documents` where `deleted_at IS NULL`
  - `getById(firmId, id)` — single document row
  - `create(firmId, input)` — insert document metadata
  - `update(firmId, id, input)` — update name, sensitivity, ver
  - `delete(firmId, id)` — soft delete + remove file from storage
  - `upload(firmId, clientId, folderName, file)` — upload to Supabase Storage, return path
  - `getDownloadUrl(filePath)` — create signed URL (60-second expiry)
- **Rationale:** Follows the established service pattern (firmId as first param, throw on error, rowToX mapper)
- **Dependencies:** `src/types/document.ts`, Supabase client

### 4. `src/hooks/useDocuments.ts`

- **Action:** Create new file
- **Changes:** Export query key factory and hooks:
  - `documentKeys` — `{ all, lists, list, folders, folder }`
  - `useFolders(firmId, clientId)` — useQuery for folder list
  - `useDocuments(firmId, clientId, folderId)` — useQuery for documents in folder
  - `useCreateFolder()` — useMutation, invalidates `documentKeys.folders()`
  - `useDeleteFolder()` — useMutation, invalidates `documentKeys.folders()`
  - `useUploadDocument()` — useMutation (upload file + create DB row), invalidates folders (doc count) + documents list
  - `useUpdateDocument()` — useMutation, invalidates documents list
  - `useDeleteDocument()` — useMutation, invalidates folders + documents list
  - `useSaveGeneratedDocument()` — useMutation (create DB row for generated doc), invalidates folders + documents list
- **Rationale:** Follows `useBilling.ts` pattern exactly
- **Dependencies:** `documentService.ts`, types

### 5. `src/components/documents/FolderSidebar.tsx`

- **Action:** Create new file
- **Changes:** Vertical folder list component
  - Props: `{ clientId: string; folders: DocumentFolder[]; selectedFolderId: string | null; onSelectFolder: (id: string | null) => void; onFolderCreated: () => void }`
  - "All Documents" option at top (selectedFolderId = null)
  - Each folder shows name + doc count badge
  - Selected folder highlighted with accent background
  - "New folder" button at bottom (permission: `documents.upload`)
  - Inline text input for folder name creation
  - Delete folder button (permission: `documents.delete`), blocked if folder has documents
- **Rationale:** Separate component for clean separation of sidebar vs content
- **Dependencies:** `useAuthStore` (can), `useCreateFolder`, `useDeleteFolder`, `FormField`, `ConfirmDialog`

### 6. `src/components/documents/DocumentTable.tsx`

- **Action:** Create new file
- **Changes:** Document list table
  - Props: `{ clientId: string; folderId: string | null; folderName: string }`
  - Uses `DataTable` with columns: name, sensitivity (inline Badge), version, date (formatDate), size (formatted KB/MB), actions
  - Actions column: view/download (Eye icon), edit metadata (Pencil icon), delete (Trash2 icon)
  - View/download: calls `documentService.getDownloadUrl()` then `window.open()`
  - Edit metadata: inline dialog with name, sensitivity select, version input
  - Delete: ConfirmDialog -> soft delete
  - AES-256 encryption indicator badge in a header note
  - EmptyState when no documents
  - Permission checks: view always (gated by parent), upload button -> `documents.upload`, delete -> `documents.delete`
- **Rationale:** Follows HoursTab DataTable pattern
- **Dependencies:** `useDocuments`, `useUpdateDocument`, `useDeleteDocument`, `DataTable`, `ConfirmDialog`, `EmptyState`

### 7. `src/components/documents/DocumentUpload.tsx`

- **Action:** Create new file
- **Changes:** Upload dialog/modal
  - Props: `{ clientId: string; folderId: string; folderName: string; onSuccess: () => void; onClose: () => void }`
  - Dialog with drag-and-drop zone (onDragOver/onDrop handlers)
  - Hidden file input triggered by click
  - File validation: max 10 MB, allowed MIME types
  - Sensitivity selector (Select component, default: 'internal')
  - On submit: calls `useUploadDocument` which uploads file to storage + creates DB row
  - Shows validation errors (file too large, invalid type) via toast
  - Loading state during upload
- **Rationale:** Encapsulates upload logic in a reusable dialog
- **Dependencies:** `useUploadDocument`, `FormField`, Dialog (shadcn), `DOCUMENT_SENSITIVITIES` constant

### 8. `src/components/documents/DocGenModal.tsx`

- **Action:** Create new file
- **Changes:** Document generation modal
  - Props: `{ clientId: string; clientName: string; clientCaseNum: string; onSuccess: () => void; onClose: () => void }`
  - Gets firm data from `useAuthStore` (`firmData: Firm`)
  - Template picker: 5 templates as radio/select options
  - Input fields: addressee name, addressee title, custom subject (for custom template)
  - Preview panel showing formatted letter with variable substitution
  - Variables: `{{client_name}}`, `{{case_num}}`, `{{firm_name}}`, `{{firm_phone}}`, `{{firm_email}}`, `{{date}}`, `{{addressee}}`, `{{addressee_title}}`, `{{subject}}`
  - "Download as .txt" button: creates Blob and triggers download
  - "Save to folder" button: calls `useSaveGeneratedDocument` which creates a DB row with `generated: true`, `content: letterText`, saves to the "התכתבויות" folder (looks up folder ID)
  - Letter templates are defined as functions that return formatted Hebrew text
- **Rationale:** Self-contained modal, templates are simple string functions
- **Dependencies:** `useSaveGeneratedDocument`, `useFolders`, `useAuthStore`, Dialog (shadcn)

### 9. `src/components/documents/DocumentsTab.tsx`

- **Action:** Create new file
- **Changes:** Top-level tab component
  - Props: `{ clientId: string; clientName: string; clientCaseNum: string }`
  - Gets `firmId` and `can()` from `useAuthStore`
  - Permission guard: `if (!firmId || !can('documents.view')) return null`
  - Calls `useFolders(firmId, clientId)` to get folder list
  - On first load, calls `documentService.ensureDefaultFolders(firmId, clientId)` via a `useEffect` or during the query
  - State: `selectedFolderId` (string | null, null = all docs), `showUpload` (boolean), `showDocGen` (boolean)
  - Layout: Two-column flex layout (sidebar start, content end)
    - Left/start (w-64): FolderSidebar
    - Right/end (flex-1): Header with upload + DocGen buttons, then DocumentTable
  - Renders DocumentUpload dialog when `showUpload` is true
  - Renders DocGenModal when `showDocGen` is true
- **Rationale:** Orchestrator component, follows HoursTab pattern for permission checks and layout
- **Dependencies:** All other document components, hooks

### 10. `src/components/clients/ClientTabs.tsx`

- **Action:** Modify existing file
- **Changes:**
  - Add import: `import { DocumentsTab } from '@/components/documents/DocumentsTab'`
  - Replace lines 36-42 (EmptyState placeholder) with: `<DocumentsTab clientId={clientId} clientName={client.name} clientCaseNum={client.caseNum} />`
  - Remove unused `FileText` import (only used by the placeholder EmptyState)
- **Rationale:** Integration point defined in requirements
- **Dependencies:** `DocumentsTab` component

### 11. `src/lib/format.ts`

- **Action:** Create new file
- **Changes:** Export two utility functions:

```typescript
/**
 * Format byte count to human-readable string (B, KB, MB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sanitize a string for use in a Supabase Storage path segment.
 * Strips path traversal characters (/, \, ..), control characters,
 * and other dangerous chars while preserving Hebrew/Arabic/English text.
 */
export function sanitizePath(segment: string): string {
  return segment
    .replace(/\.\./g, '')        // strip path traversal
    .replace(/[/\\]/g, '')       // strip directory separators
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control characters
    .replace(/[<>:"|?*]/g, '')   // strip Windows-reserved chars
    .trim();
}
```

- **Rationale:** `formatFileSize` is a shared display utility. `sanitizePath` is a security utility that prevents path traversal and injection in storage paths. Both registered in SHARED-CODE-REGISTRY.md.
- **Dependencies:** None

### 12. `src/i18n/he.ts`

- **Action:** Modify existing file
- **Changes:** Add all `documents.*` keys from the requirements i18n table (approximately 40 keys)
- **Dependencies:** None

### 13. `src/i18n/ar.ts`

- **Action:** Modify existing file
- **Changes:** Add matching `documents.*` keys in Arabic
- **Dependencies:** None

### 14. `src/i18n/en.ts`

- **Action:** Modify existing file
- **Changes:** Add matching `documents.*` keys in English
- **Dependencies:** None

---

## Database Migration

Complete SQL for `supabase/migrations/20260323100000_create_documents_tables.sql`:

```sql
-- ============================================================
-- Documents Module: document_folders, documents, storage policies
-- CREATED: 2026-03-23
-- ============================================================

-- ========== DOCUMENT FOLDERS ==========
CREATE TABLE document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: folder names unique per client within a firm
ALTER TABLE document_folders ADD CONSTRAINT uq_document_folders_client_name
  UNIQUE (firm_id, client_id, name);

-- Indexes
CREATE INDEX idx_document_folders_firm_id ON document_folders(firm_id);
CREATE INDEX idx_document_folders_firm_client ON document_folders(firm_id, client_id);

-- RLS
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_folders_select" ON document_folders FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "document_folders_insert" ON document_folders FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "document_folders_update" ON document_folders FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "document_folders_delete" ON document_folders FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON document_folders TO authenticated;

-- ========== DOCUMENTS ==========
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  ver INTEGER NOT NULL DEFAULT 1,
  sensitivity TEXT NOT NULL DEFAULT 'internal'
    CHECK (sensitivity IN ('internal', 'confidential', 'restricted', 'public')),
  generated BOOLEAN NOT NULL DEFAULT false,
  content TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_documents_firm_id ON documents(firm_id);
CREATE INDEX idx_documents_firm_client ON documents(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_folder ON documents(folder_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_select" ON documents FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "documents_insert" ON documents FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "documents_update" ON documents FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "documents_delete" ON documents FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;

-- ========== STORAGE POLICIES ==========
-- Bucket 'client-documents' must be created via Supabase dashboard or API.
-- Path structure: {firm_id}/{client_id}/{folder_name}/{filename}

CREATE POLICY "client_docs_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'client-documents'
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids()));

CREATE POLICY "client_docs_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
    AND firm_subscription_active((storage.foldername(name))[1]::UUID));

CREATE POLICY "client_docs_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'client-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
    AND firm_subscription_active((storage.foldername(name))[1]::UUID));

CREATE POLICY "client_docs_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'client-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
    AND firm_subscription_active((storage.foldername(name))[1]::UUID));
```

**Notes on `document_folders`:**
- No `deleted_at` — folders are hard-deleted, but only when empty of active (non-deleted) documents (enforced at service layer)
- No `updated_at` — folders are immutable after creation (name + client are fixed)
- The unique constraint `(firm_id, client_id, name)` prevents duplicate folder names per client

**Notes on `documents.folder_id`:**
- Nullable with `ON DELETE SET NULL` — when a folder is deleted, any remaining soft-deleted document rows have their `folder_id` set to NULL rather than being physically deleted. This preserves the audit trail for soft-deleted documents while allowing folder cleanup.

**Notes on storage policies:**
- The bucket itself must be created via Supabase dashboard with: `public: false`, `file_size_limit: 10485760`, `allowed_mime_types: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'image/jpeg', 'image/png', 'application/zip']`
- Write policies (INSERT, UPDATE, DELETE) include `firm_subscription_active()` check to prevent expired-subscription firms from uploading or modifying files. SELECT is allowed regardless of subscription status so users can still download existing files.

---

## Type Definitions

### Updated `src/types/document.ts`

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-23 XX:XX IST (Jerusalem)
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
```

---

## Service Layer

### `src/services/documentService.ts`

```typescript
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
```

**Mapper functions:**

```typescript
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
```

**Service methods (all on `export const documentService`):**

#### `listFolders(firmId: string, clientId: string): Promise<DocumentFolder[]>`
- Query `document_folders` filtered by `firm_id` and `client_id`, ordered by `created_at` ascending
- For doc counts: make a second query on `documents` grouped by `folder_id` where `deleted_at IS NULL`, then merge counts into folder objects client-side
- **Why separate query for counts:** Supabase JS client doesn't support `LEFT JOIN ... GROUP BY` in a single `.select()` call cleanly. Two simple queries are clearer than an RPC.

#### `createFolder(firmId: string, input: CreateFolderInput): Promise<DocumentFolder>`
- Insert into `document_folders` with `firm_id`, `client_id`, `name`
- Return created row

#### `deleteFolder(firmId: string, folderId: string): Promise<void>`
- **Step 1:** Check for active (non-deleted) documents: query `documents` where `folder_id = folderId AND deleted_at IS NULL`. If count > 0, throw `new Error('Folder not empty')`.
- **Step 2:** Delete the folder row: `supabase.from('document_folders').delete().eq('id', folderId).eq('firm_id', firmId)`.
- **FK behavior:** The `folder_id` column uses `ON DELETE SET NULL`, so deleting a folder automatically sets `folder_id = NULL` on any remaining soft-deleted document rows. This preserves soft-deleted rows for audit trail purposes while allowing the folder to be removed. Active documents are protected by the Step 1 check.

#### `ensureDefaultFolders(firmId: string, clientId: string): Promise<void>`
- Uses Supabase `.upsert()` with `{ onConflict: 'firm_id,client_id,name', ignoreDuplicates: true }` to insert all `DEFAULT_FOLDERS` in a single call
- This leverages `ON CONFLICT (firm_id, client_id, name) DO NOTHING` at the DB level, making the method fully idempotent and race-condition-safe
- No count check needed — just fire the upsert. If folders already exist, the DB silently skips them. If two tabs call simultaneously, both succeed without error.
- Rows to upsert: `DEFAULT_FOLDERS.map(name => ({ firm_id: firmId, client_id: clientId, name }))`

#### `list(firmId: string, clientId: string, folderId: string | null): Promise<LegalDocument[]>`
- Query `documents` filtered by `firm_id`, `client_id`, `deleted_at IS NULL`
- If `folderId` is not null, also filter by `folder_id`
- Order by `created_at` descending

#### `getById(firmId: string, id: string): Promise<LegalDocument>`
- Single row query, throw if not found

#### `create(firmId: string, input: CreateDocumentInput): Promise<LegalDocument>`
- Insert row with `firm_id` prepended
- Return created row

#### `update(firmId: string, id: string, input: UpdateDocumentInput): Promise<LegalDocument>`
- Update only provided fields (name, sensitivity, ver)
- Return updated row

#### `delete(firmId: string, id: string): Promise<void>`
- First fetch the document to get `file_path`
- Soft delete the DB row (set `deleted_at`)
- Then delete the file from storage: `supabase.storage.from('client-documents').remove([filePath])`
- If storage delete fails, log but don't throw (DB row is already soft-deleted)

#### `upload(firmId: string, clientId: string, folderName: string, file: File): Promise<string>`
- Import `sanitizePath` from `@/lib/format`
- Sanitize both folder name and file name before building the path: `const safeFolderName = sanitizePath(folderName)` and `const safeFileName = sanitizePath(file.name)`
- Build path: `${firmId}/${clientId}/${safeFolderName}/${Date.now()}_${safeFileName}`
- `Date.now()` prefix prevents filename collisions
- **Security:** `sanitizePath` strips `/`, `\`, `..`, control characters, and Windows-reserved chars. This prevents path traversal attacks where a malicious folder name or file name could escape the intended storage directory. Hebrew/Arabic characters are preserved.
- Upload: `supabase.storage.from('client-documents').upload(path, file, { contentType: file.type })`
- Throw on error
- Return the path string (not a URL — URL is generated on download)

#### `getDownloadUrl(filePath: string): Promise<string>`
- `supabase.storage.from('client-documents').createSignedUrl(filePath, 60)` (60 seconds)
- Return the signed URL
- Throw on error

---

## Hook Layer

### `src/hooks/useDocuments.ts`

```typescript
export const documentKeys = {
  all: ['documents'] as const,
  folders: () => [...documentKeys.all, 'folders'] as const,
  folderList: (firmId: string, clientId: string) =>
    [...documentKeys.folders(), firmId, clientId] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (firmId: string, clientId: string, folderId: string | null) =>
    [...documentKeys.lists(), firmId, clientId, folderId ?? 'all'] as const,
};
```

**Hooks:**

#### `useFolders(firmId: string | null, clientId: string)`
```typescript
useQuery({
  queryKey: documentKeys.folderList(firmId ?? '', clientId),
  queryFn: () => documentService.listFolders(firmId!, clientId),
  enabled: !!firmId,
});
```

#### `useDocuments(firmId: string | null, clientId: string, folderId: string | null)`
```typescript
useQuery({
  queryKey: documentKeys.list(firmId ?? '', clientId, folderId),
  queryFn: () => documentService.list(firmId!, clientId, folderId),
  enabled: !!firmId,
});
```

#### `useEnsureDefaultFolders()`
```typescript
useMutation({
  mutationFn: ({ firmId, clientId }: { firmId: string; clientId: string }) =>
    documentService.ensureDefaultFolders(firmId, clientId),
  onSuccess: (_data, { firmId, clientId }) => {
    queryClient.invalidateQueries({ queryKey: documentKeys.folderList(firmId, clientId) });
  },
});
```

#### `useCreateFolder()`
```typescript
useMutation({
  mutationFn: ({ firmId, input }: { firmId: string; input: CreateFolderInput }) =>
    documentService.createFolder(firmId, input),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: documentKeys.folders() });
    toast.success(t('documents.folderCreated'));
  },
  onError: () => toast.error(t('errors.saveFailed')),
});
```

#### `useDeleteFolder()`
```typescript
useMutation({
  mutationFn: ({ firmId, folderId }: { firmId: string; folderId: string }) =>
    documentService.deleteFolder(firmId, folderId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: documentKeys.folders() });
    toast.success(t('documents.folderDeleted'));
  },
  onError: (error) => {
    // If error is "folder not empty", show specific message
    const msg = error instanceof Error && error.message.includes('not empty')
      ? t('documents.folderNotEmpty')
      : t('errors.saveFailed');
    toast.error(msg);
  },
});
```

#### `useUploadDocument()`
```typescript
useMutation({
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
```

#### `useUpdateDocument()`
```typescript
useMutation({
  mutationFn: ({ firmId, id, input }: { firmId: string; id: string; input: UpdateDocumentInput }) =>
    documentService.update(firmId, id, input),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    toast.success(t('common.save'));
  },
  onError: () => toast.error(t('errors.saveFailed')),
});
```

#### `useDeleteDocument()`
```typescript
useMutation({
  mutationFn: ({ firmId, id }: { firmId: string; id: string }) =>
    documentService.delete(firmId, id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: documentKeys.all });
    toast.success(t('documents.deleteSuccess'));
  },
  onError: () => toast.error(t('errors.saveFailed')),
});
```

#### `useSaveGeneratedDocument()`
```typescript
useMutation({
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
    // Show specific error if folder creation failed
    const msg = error instanceof Error && error.message.includes('folder')
      ? t('documents.folderCreationFailed')
      : t('errors.saveFailed');
    toast.error(msg);
  },
});
```

---

## Component Designs

### `DocumentsTab.tsx`

**Props interface:**
```typescript
interface DocumentsTabProps {
  clientId: string;
  clientName: string;
  clientCaseNum: string;
}
```

**State:**
- `selectedFolderId: string | null` — null means "all documents"
- `showUpload: boolean`
- `showDocGen: boolean`
- `defaultFoldersEnsured: boolean` — tracks whether `ensureDefaultFolders` has been called

**Key behavior:**
- On mount, call `ensureDefaultFolders` mutation once (guarded by `defaultFoldersEnsured` ref)
- Two-column layout using `flex` with RTL support:
  - Start side (w-64): `<FolderSidebar />`
  - End side (flex-1): Header row with Upload + DocGen buttons, then `<DocumentTable />`
- Upload button: `can('documents.upload')` guard
- DocGen button: `can('documents.upload')` guard (generating a doc = creating content)
- Upload dialog: opened when `showUpload` is true AND a folder is selected (if no folder selected, show toast asking user to select a folder first)
- DocGen dialog: needs to resolve the "התכתבויות" folder ID from the folder list

**Permission check:**
```typescript
if (!firmId || !can('documents.view')) return null;
```

**Layout (conceptual):**
```
[FolderSidebar]  |  [Header: Upload btn + DocGen btn]
                 |  [DocumentTable]
```

### `FolderSidebar.tsx`

**Props interface:**
```typescript
interface FolderSidebarProps {
  clientId: string;
  folders: DocumentFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onFolderCreated: () => void;
}
```

**State:**
- `showNewFolder: boolean` — toggle inline input
- `newFolderName: string` — input value
- `deleteFolderId: string | null` — folder pending delete confirmation

**Key UI elements:**
- "All Documents" button at top: `onClick={() => onSelectFolder(null)}`
- Folder list: `folders.map(f => <button>)` with highlight on selected
- Each folder button: `{f.name} ({f.docCount ?? 0})`
- Delete icon button per folder (only if `can('documents.delete')` and `f.docCount === 0`)
- "New folder" button at bottom (only if `can('documents.upload')`)
- Inline input + save/cancel when `showNewFolder` is true
- ConfirmDialog for folder deletion

**Styling:**
- `border-e` (logical RTL border on end side)
- `pe-4` padding end
- Selected folder: `bg-accent text-accent-foreground rounded-md`

### `DocumentTable.tsx`

**Props interface:**
```typescript
interface DocumentTableProps {
  clientId: string;
  folderId: string | null;
  folderName: string;
}
```

**State:**
- `deleteId: string | null` — document pending delete
- `editDoc: LegalDocument | null` — document being edited (metadata dialog)

**Columns (`ColumnDef<LegalDocument, unknown>[]`):**
1. `name` — accessor, header: `t('documents.fileName')`
2. `sensitivity` — custom cell with inline Badge using `DOCUMENT_SENSITIVITIES` constant for i18n label and color classes
3. `ver` — accessor, header: `t('documents.version')`, cell: `v${row.original.ver}`
4. `created_at` — custom cell: `formatDate(row.original.created_at)`, header: `t('documents.date')`
5. `size` — custom cell: format bytes to KB/MB string, header: `t('documents.size')`
6. `actions` — custom cell with 3 icon buttons:
   - Eye (view/download) — always visible
   - Pencil (edit metadata) — visible if `can('documents.upload')`
   - Trash2 (delete) — visible if `can('documents.delete')`

**Event handlers:**
- View/download: `async () => { const url = await documentService.getDownloadUrl(doc.file_path); window.open(url, '_blank'); }`
- Edit: opens inline Dialog with form for name, sensitivity (Select), ver (number Input)
- Delete: sets `deleteId`, ConfirmDialog fires `useDeleteDocument`

**Edit metadata dialog:**
- Dialog component with FormField for name (Input), sensitivity (Select), ver (Input type=number)
- On save: calls `useUpdateDocument`

**Sensitivity badge colors (inline, not StatusBadge — sensitivity is not a Status type):**
```typescript
const SENSITIVITY_COLORS: Record<DocumentSensitivity, string> = {
  internal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  confidential: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  restricted: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  public: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};
```

**File size formatter (shared utility — imported from `@/lib/format`):**
```typescript
import { formatFileSize } from '@/lib/format';
```
See the new shared utility file below (File-by-File Change Plan, item 14).

### `DocumentUpload.tsx`

**Props interface:**
```typescript
interface DocumentUploadProps {
  clientId: string;
  folderId: string;
  folderName: string;
  onSuccess: () => void;
  onClose: () => void;
}
```

**State:**
- `file: File | null`
- `sensitivity: DocumentSensitivity` (default: `'internal'`)
- `dragging: boolean` (for visual drag feedback)

**Allowed MIME types (constant):**
```typescript
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
```

**Key behavior:**
- Drag-and-drop zone with `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` handlers
- Hidden `<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.zip">` triggered by click
- On file selection: validate type and size, show toast errors if invalid
- Sensitivity selector using Select component with options from `DOCUMENT_SENSITIVITIES`
- Submit button calls `useUploadDocument.mutate()`
- Loading spinner during upload (`isPending` from mutation)
- On success: calls `onSuccess()` and `onClose()`

### `DocGenModal.tsx`

**Props interface:**
```typescript
interface DocGenModalProps {
  clientId: string;
  clientName: string;
  clientCaseNum: string;
  onSuccess: () => void;
  onClose: () => void;
}
```

**State:**
- `templateId: string` — selected template key
- `addressee: string` — addressee name
- `addresseeTitle: string` — addressee title/position
- `subject: string` — custom subject (for free-form template)
- `customBody: string` — custom body text (for free-form template)

**Template IDs and labels:**
```typescript
const TEMPLATES = [
  { id: 'fine', label: 'documents.templateFine' },
  { id: 'extension', label: 'documents.templateExtension' },
  { id: 'withholding', label: 'documents.templateWithholding' },
  { id: 'appeal', label: 'documents.templateAppeal' },
  { id: 'custom', label: 'documents.templateCustom' },
] as const;
```

**Variable substitution:**
- Gets `firmData` from `useAuthStore` for firm name, phone, email
- Date formatted in Hebrew locale: `new Date().toLocaleDateString('he-IL')`
- Each template is a function: `(vars: TemplateVars) => string`

**TemplateVars type:**
```typescript
interface TemplateVars {
  clientName: string;
  caseNum: string;
  firmName: string;
  firmPhone: string;
  firmEmail: string;
  date: string;
  addressee: string;
  addresseeTitle: string;
  subject: string;
  customBody: string;
}
```

**Template example (fine cancellation):**
```typescript
function generateFineTemplate(v: TemplateVars): string {
  return `${v.date}

לכבוד
${v.addressee}
${v.addresseeTitle}

הנדון: ${v.clientName} - ת.ז./ח.פ. ${v.caseNum}
ביטול קנס

${v.addresseeTitle} הנכבד/ה,

1. אנו פונים אליכם בשם לקוחנו, ${v.clientName}, בבקשה לביטול הקנס שהוטל.

2. לקוחנו פעל בתום לב ובהתאם להנחיות שניתנו לו, ולפיכך מבוקש ביטול הקנס.

3. נודה לטיפולכם המהיר בעניין.

בכבוד רב,
${v.firmName}
טל: ${v.firmPhone}
דוא"ל: ${v.firmEmail}`;
}
```

**Key behavior:**
- Left panel: template selector (radio group or Select), input fields for addressee, title, subject
- Right panel: live preview of generated letter (monospace/pre-wrap text)
- "Download" button: creates `.txt` Blob, uses anchor element trick for download
- "Save to folder" button: finds the "התכתבויות" folder ID from the folder list query. **If the folder does not exist**, auto-creates it via `documentService.createFolder(firmId, { client_id: clientId, name: 'התכתבויות' })` before saving. If folder creation also fails, shows `t('documents.folderCreationFailed')` toast (new i18n key) rather than a generic error. Only after a valid folder ID is obtained does it call `useSaveGeneratedDocument`.
- File name for saved doc: `{templateLabel}_{clientName}_{date}.txt`

---

## Data Flow Diagrams

### Upload Flow
```
User drops file on DocumentUpload
  -> Validate file type + size (client-side)
  -> If invalid: toast error, stop
  -> useUploadDocument.mutate()
    -> sanitizePath(folderName), sanitizePath(file.name)
    -> documentService.upload(firmId, clientId, safeFolderName, file)
      -> supabase.storage.from('client-documents').upload(path, file)
      -> Returns file_path string
    -> try: documentService.create(firmId, { ...metadata, file_path })
      -> supabase.from('documents').insert(row)
      -> Returns LegalDocument
    -> catch: best-effort storage cleanup
      -> supabase.storage.from('client-documents').remove([filePath])
      -> Re-throw original error
  -> onSuccess: invalidate queries, toast success, close dialog
```

### Download Flow
```
User clicks download button on DocumentTable row
  -> documentService.getDownloadUrl(doc.file_path)
    -> supabase.storage.from('client-documents').createSignedUrl(path, 60)
    -> Returns signed URL
  -> window.open(signedUrl, '_blank')
```

### DocGen Flow
```
User selects template, fills in addressee + title
  -> Template function generates letter text (client-side, instant)
  -> Preview updates live

User clicks "Save to folder":
  -> Look up "התכתבויות" folder ID from folders query data
  -> If folder not found:
    -> documentService.createFolder(firmId, { client_id, name: 'התכתבויות' })
    -> If creation fails: toast t('documents.folderCreationFailed'), stop
  -> useSaveGeneratedDocument.mutate({ folderId (or null to auto-create) })
    -> Create Blob from text, wrap as File
    -> documentService.upload(firmId, clientId, 'התכתבויות', file)
    -> documentService.create(firmId, { ...metadata, generated: true, content: text })
  -> onSuccess: invalidate queries, toast, close modal

User clicks "Download":
  -> Create Blob from text
  -> Create <a> element with href=URL.createObjectURL(blob), download=filename
  -> Click programmatically, revoke URL
```

### Default Folders Flow
```
DocumentsTab mounts
  -> useEffect (once, guarded by ref)
    -> useEnsureDefaultFolders.mutate({ firmId, clientId })
      -> documentService.ensureDefaultFolders(firmId, clientId)
        -> supabase.from('document_folders').upsert(
            DEFAULT_FOLDERS.map(name => ({ firm_id, client_id, name })),
            { onConflict: 'firm_id,client_id,name', ignoreDuplicates: true }
          )
        -> ON CONFLICT DO NOTHING — safe for concurrent calls
  -> useFolders query runs (may initially return [])
  -> After ensureDefaultFolders completes: invalidates folder query
  -> Folders re-fetch, now showing 3 defaults
```

---

## Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| No folders exist for client | `ensureDefaultFolders` creates 3 defaults on first visit |
| Empty folder selected | Show `EmptyState` with "No documents in this folder" message |
| No folder selected (null) | Show all documents across all folders for this client |
| Upload file too large (>10 MB) | Client-side validation + toast error `t('documents.fileTooLarge')` before upload attempt |
| Upload invalid file type | Client-side validation + toast error `t('documents.invalidFileType')` before upload attempt |
| Duplicate folder name | DB unique constraint catches it; service throws; hook shows `t('errors.saveFailed')` toast |
| Delete non-empty folder | Service checks doc count first, throws "folder not empty" error; hook shows `t('documents.folderNotEmpty')` toast |
| Storage upload fails | `useUploadDocument` onError fires, shows generic error toast. No orphan DB row because upload happens before DB insert. |
| DB insert fails after storage upload | `useUploadDocument` hook catches DB errors and attempts to delete the orphan file from storage before re-throwing. Storage cleanup is best-effort (silent on failure). |
| Signed URL expired | User clicks download, gets 403/expired. They click again and get a fresh URL. 60-second window is enough for the redirect to start. |
| User has `documents.view` but not `documents.upload` | Upload/DocGen buttons hidden. They can view and download but not modify. |
| User has no `documents.view` permission | Entire tab returns null (hidden). |
| Concurrent default folder creation | Uses `.upsert()` with `ON CONFLICT DO NOTHING`. Both concurrent calls succeed silently — no constraint violation errors, no race condition. |
| Delete folder with soft-deleted documents | FK uses `ON DELETE SET NULL` — deleting a folder sets `folder_id = NULL` on soft-deleted document rows, preserving them for audit trail. Active (non-deleted) documents still block deletion with a "folder not empty" error. |
| Generated document with no "התכתבויות" folder | DocGenModal auto-creates the "התכתבויות" folder via `documentService.createFolder()` before saving. If folder creation also fails, shows `t('documents.folderCreationFailed')` toast rather than a generic error. |
| Loading states | `isLoading` from useQuery shows `<LoadingSpinner />`. `isPending` from mutations disables submit buttons. |

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Large number of documents per folder | DataTable has built-in pagination (default 10 rows). Query is indexed on `(firm_id, client_id)` with `deleted_at IS NULL` partial index. |
| Large file uploads blocking UI | Upload happens in a single async call. The UI shows a loading state. No chunked upload needed for 10 MB max. |
| Folder doc count requires extra query | Counts are fetched alongside folders. This is 2 queries instead of 1, but both are fast (indexed) and cached by React Query. |
| Signed URL generation on every download click | Each call is a single Supabase API call. No caching needed — 60-second URLs are cheap to generate. |
| Default folder creation on every tab visit | Guarded by a ref to run once. The query is fast (count check on indexed column). After first visit, the count returns >0 and the function exits immediately. |

---

## i18n / RTL Implications

### New Translation Keys

All keys listed in the requirements document under "i18n Keys Needed" section. Approximately 40 keys in the `documents.*` namespace.

Additionally needed (not in requirements):
- `documents.allDocumentsCount` — "All ({count})" for the all-documents sidebar option
- `documents.editDocument` — dialog title for edit metadata
- `documents.folderNameRequired` — validation error if folder name is empty
- `documents.folderCreationFailed` — error toast when auto-creating "התכתבויות" folder fails during DocGen save

### RTL Layout Considerations

- **Two-column layout:** Use `flex` with `gap`. FolderSidebar is at `start` (right in RTL), DocumentTable at `end` (left in RTL). Use logical properties: `border-e` on sidebar, `ps-4`/`pe-4` for padding.
- **File size display:** Force `dir="ltr"` on file sizes (e.g., "2.4 MB") since numbers read LTR.
- **Date display:** Force `dir="ltr"` on dates (already done in HoursTab pattern).
- **Drag-and-drop text:** Centered, no directional concern.
- **DocGen preview:** Letter text is Hebrew, so `dir="rtl"` is natural. The preview panel inherits RTL from the app.
- **Icons:** No directional icons that need mirroring in this module (Eye, Pencil, Trash2, Upload, FileText are symmetrical).

---

## Self-Critique

### Potential Weaknesses

1. **Doc count as a separate query.** Two queries per folder list render instead of one. This is pragmatic given Supabase JS client limitations. If performance becomes an issue, this could be replaced with a database view or RPC.

2. **No server-side file type validation.** We validate MIME types client-side, but the Supabase Storage bucket configuration also enforces allowed MIME types. However, a sophisticated user could bypass client-side checks. The bucket's `allowed_mime_types` setting is the real enforcement layer.

3. **StatusBadge cannot be reused for sensitivity.** The existing `StatusBadge` component has a fixed `Status` type union that doesn't include sensitivity values. Rather than modifying the shared component (which could break other modules), we use inline Badge components with sensitivity-specific colors. This is a minor code duplication trade-off for isolation.

### Resolved During Review

- **`ensureDefaultFolders` race condition** — Resolved by using `.upsert()` with `ON CONFLICT DO NOTHING`. No error handling needed for concurrent calls.
- **Soft-delete / FK interaction on folder deletion** — Resolved by using `ON DELETE SET NULL` on `folder_id` FK. Soft-deleted rows are preserved for audit trail with `folder_id = NULL`.
- **DocGen missing "התכתבויות" folder** — Resolved by auto-creating the folder with a specific error message fallback.
- **`formatFileSize` as local function** — Moved to shared `src/lib/format.ts` utility.

### Resolved During Security Audit

- **Storage write policies missing subscription check** — Added `firm_subscription_active()` to INSERT, UPDATE, DELETE storage policies. Prevents expired-subscription firms from uploading/modifying files.
- **Path traversal in storage paths** — Added `sanitizePath()` utility in `src/lib/format.ts` that strips `/`, `\`, `..`, control characters, and Windows-reserved chars. Used in `upload()` service method for both folder names and file names. Hebrew/Arabic characters preserved.
- **Orphan storage files on DB insert failure** — `useUploadDocument` hook now catches DB insert errors and attempts best-effort cleanup of the orphan storage file before re-throwing.
- **Folder deletion destroying audit trail** — Changed `folder_id` FK to `ON DELETE SET NULL` (nullable). Soft-deleted documents retain their data with `folder_id = NULL` when parent folder is removed.

### Alternative Approaches Considered

- **Database view for folder+count**: Rejected because it would require an additional migration and the two-query approach is sufficient.
- **File versioning with storage history**: Out of scope per requirements. The `ver` field is display-only.
- **Storing generated documents only in DB (no storage upload)**: Considered to avoid unnecessary storage usage for text-only docs. Rejected because having a consistent `file_path` for all documents simplifies the download flow and keeps the document model uniform.
- **Using a Zustand store for selected folder state**: Unnecessary — this is local component state within DocumentsTab. No other component outside the documents tree needs to know which folder is selected.

---

## Verification Commands

After implementation, run:

```bash
# TypeScript check
npx tsc --noEmit

# Build
npm run build

# Lint
npm run lint

# Check current branch (must NOT be main)
git branch --show-current
```
