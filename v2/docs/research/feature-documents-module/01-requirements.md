# Requirements Document — Document Management Module

## Task Summary

Build a document management module for the LexDoc legal/accounting SaaS. The module provides per-client folder-based document organization, file upload to Supabase Storage, document metadata management with sensitivity levels, and simplified document generation (letter templates with variable substitution). The module integrates into the existing ClientTabs component, replacing the current documents placeholder.

## User Decisions

1. **Storage path structure** — **Full hierarchy**: `client-documents/{firm_id}/{client_id}/{folder}/{filename}`. Matches existing `firm-logos` RLS pattern.
2. **Folder implementation** — **Separate `document_folders` table**. Folders exist independently of documents. Default folders auto-created per client.
3. **DocGen scope** — **Simplified**: template selection + variable substitution + preview + download/save. No AI chat panel or paragraph editor.
4. **File upload limits** — **10 MB** max per file. Allowed types: PDF, DOC/DOCX, XLS/XLSX, TXT, JPG, PNG, ZIP.
5. **Versioning** — **Display-only version field**. Manual number set during upload/edit. No automatic version history storage.

## Chosen Approach

**Full-featured document management with simplified DocGen** — Build complete folder management, file upload with Supabase Storage, document table with metadata editing, and a template-based letter generator. This covers the core document workflow while deferring AI chat and automatic versioning to future phases.

## Scope

**In scope:**
- `document_folders` table with CRUD operations and default folder auto-creation
- `documents` table with metadata (name, folder_id, size, date, version, sensitivity, file_path)
- Supabase Storage bucket `client-documents` with firm-scoped RLS
- File upload (drag-and-drop + click) with type/size validation
- Document table with sort, search, view/download, edit metadata, delete
- Sensitivity badge display (internal, confidential, restricted, public)
- AES-256 encryption indicator (display badge only — Supabase handles encryption at rest)
- Simplified DocGen modal: 5 letter templates, variable substitution, preview, download as .txt, save to client folder
- Integration into ClientTabs (replace documents placeholder)
- i18n keys for all 3 languages (he, ar, en)

**Out of scope:**
- AI chat panel / AI-generated content
- Custom paragraph editor
- Automatic version history with rollback
- Document sharing / external access links
- OCR or content search within documents
- Bulk upload progress tracking (single file at a time is fine)

---

## Existing Code to Reuse

### Types (from `src/types/document.ts`)
- `LegalDocument` — main document interface (note: renamed from `Document` per amendment 4)
- `DocumentFolder` — `{ name: string; docCount: number }` (needs update: will need `id`, `firm_id`, `client_id`, `created_at` for DB-backed folders)
- `DocumentSensitivity` — `'internal' | 'confidential' | 'restricted' | 'public'`
- `CreateDocumentInput` — Omit of LegalDocument fields

### Constants (from `src/lib/constants.ts`)
- `DOCUMENT_SENSITIVITIES` — Record mapping sensitivity to i18n keys
- `DEFAULT_FOLDERS` — `['חוזים', 'פיננסים', 'התכתבויות']`

### Utilities (from `src/lib/`)
- `formatDate()` from `dates.ts`
- `cn()` from `utils.ts`

### Shared Components (from `src/components/shared/`)
- `DataTable` — reusable table with sorting, pagination, search (TanStack Table)
- `EmptyState` — empty list placeholder with icon
- `LoadingSpinner` — centered spinner
- `FormField` — label + input + error wrapper
- `ConfirmDialog` — confirm/cancel dialog (for delete confirmations)
- `StatusBadge` — colored badge (needs sensitivity status support or use inline badge)
- `SearchInput` — debounced search input
- `PageHeader` — page title + action buttons

### Patterns to Follow

**Service pattern** (from `billingService.ts`):
- Export a const object with async methods
- Import `supabase` from `@/integrations/supabase/client`
- `rowToX()` and `inputToRow()` mapper functions
- `firmId` as first parameter to all methods
- Soft delete via `deleted_at` timestamp
- Throw `new Error(error.message)` on Supabase errors

**Hook pattern** (from `useBilling.ts`):
- Export query key factory: `documentKeys = { all, lists, list, folders }`
- `useQuery` with `enabled: !!firmId`
- `useMutation` with `onSuccess` invalidating relevant query keys + toast
- `onError` showing `t('errors.saveFailed')`
- Import `useAuthStore` for `firmId`, `useLanguage` for `t()`

**Component tab pattern** (from `HoursTab.tsx`):
- Props: `{ clientId: string; clientName: string }`
- Get `firmId` and `can()` from `useAuthStore`
- Permission check: `if (!firmId || !can('documents.view')) return null`
- Metric cards at top, action button, form toggle, DataTable, ConfirmDialog
- Use `ColumnDef<T, unknown>[]` for table columns

**Migration pattern** (from `20260320100000_create_billing_tables.sql`):
- Header comment with module name and date
- `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `firm_id UUID NOT NULL REFERENCES firms(id)`
- `deleted_at TIMESTAMPTZ DEFAULT NULL` for soft delete
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Indexes on `firm_id` and `(firm_id, client_id) WHERE deleted_at IS NULL`
- RLS enabled with 4 policies (select, insert, update, delete)
- RLS uses `firm_id IN (SELECT user_firm_ids())` and `firm_subscription_active(firm_id)`
- `update_updated_at()` trigger
- `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated`

---

## Legacy Data Structures

### FOLDERS (from `legacy-app.html:128`)
```javascript
var FOLDERS = {
  1: ["חוזים", "פיננסים", "התכתבויות"],
  2: ["חוזים", "פיננסים", "התכתבויות"],
  3: ["חוזים", "קניין רוחני"],
  4: ["רפואי", "התכתבויות"]
};
```
Per-client folder arrays. Default set: `["חוזים", "פיננסים", "התכתבויות"]`. Some clients have custom folders (e.g., "קניין רוחני", "רפואי").

### DOCS (from `legacy-app.html:129`)
```javascript
var DOCS = {
  "חוזים": [{ id: 101, name: "Agreement 2024.pdf", size: "2.4MB", date: "2024-01-15", ver: 3, sens: "סודי" }, ...],
  "פיננסים": [{ id: 201, name: "Annual Report 2023.xlsx", size: "5.2MB", ... }],
  ...
};
```
Document fields: `id`, `name`, `size` (string like "2.4MB"), `date` (ISO date), `ver` (integer), `sens` (Hebrew sensitivity label).

### CLIENT_DOCS (from `legacy-app.html:131-155`)
Per-client document storage. `getClientAllDocs(cid, folder)` merges shared `DOCS[folder]` with client-specific `CLIENT_DOCS[cid][folder]`.

### DocGen (from `legacy-app.html:1177-1326`)
Letter generator with 5 templates:
1. **ביטול קנס** (Fine cancellation) — request to cancel tax penalty
2. **בקשת ארכה** (Extension request) — deadline extension request
3. **פטור ניכוי מס במקור** (Withholding exemption) — tax withholding exemption request
4. **השגה על שומה** (Tax appeal) — appeal against tax assessment
5. **מכתב חופשי** (Custom letter) — free-form letter

Variables used: `client.name`, `client.caseNum`, `firm.firmName`, `firm.phone`, `firm.email`, today's date (Hebrew locale).

Letter structure: date, addressee, title, subject line (`הנדון: {client} - ת.ז./ח.פ. {caseNum}`), opening, numbered paragraphs, closing with firm details.

Generated docs saved to "התכתבויות" folder with `{ name, size, date, ver: 1, sens: "פנימי", content, generated: true }`.

---

## Database Requirements

### Table: `document_folders`

```sql
CREATE TABLE document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: folder names unique per client
ALTER TABLE document_folders ADD CONSTRAINT uq_document_folders_client_name
  UNIQUE (firm_id, client_id, name);

-- Indexes
CREATE INDEX idx_document_folders_firm_id ON document_folders(firm_id);
CREATE INDEX idx_document_folders_firm_client ON document_folders(firm_id, client_id);

-- RLS (standard pattern)
-- No soft delete on folders — deleting a folder should move/orphan docs or be blocked if non-empty
```

### Table: `documents`

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  folder_id UUID NOT NULL REFERENCES document_folders(id),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,          -- Supabase Storage path
  size INTEGER NOT NULL,            -- bytes
  mime_type TEXT NOT NULL,
  ver INTEGER NOT NULL DEFAULT 1,
  sensitivity TEXT NOT NULL DEFAULT 'internal'
    CHECK (sensitivity IN ('internal', 'confidential', 'restricted', 'public')),
  generated BOOLEAN NOT NULL DEFAULT false,  -- true for DocGen-created docs
  content TEXT,                     -- text content for generated documents
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_documents_firm_id ON documents(firm_id);
CREATE INDEX idx_documents_firm_client ON documents(firm_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_folder ON documents(folder_id) WHERE deleted_at IS NULL;

-- RLS (standard 4-policy pattern)
-- Trigger: update_updated_at()
-- GRANTs: SELECT, INSERT, UPDATE, DELETE to authenticated
```

### Supabase Storage Bucket

- **Bucket name**: `client-documents`
- **Public**: No (private bucket)
- **File size limit**: 10 MB (10485760 bytes)
- **Allowed MIME types**: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/plain`, `image/jpeg`, `image/png`, `application/zip`

### Storage RLS Policies

```sql
-- Path structure: client-documents/{firm_id}/{client_id}/{folder}/{filename}
-- Firm members can read their firm's documents
CREATE POLICY "client_docs_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'client-documents'
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids()));

-- Firm members can upload (with active subscription)
CREATE POLICY "client_docs_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids()));

-- Firm members can update/delete their own firm's files
CREATE POLICY "client_docs_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'client-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids()));

CREATE POLICY "client_docs_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'client-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids()));
```

---

## Type Updates Required

### Update `DocumentFolder` in `src/types/document.ts`

Current:
```typescript
export interface DocumentFolder {
  name: string;
  docCount: number;
}
```

Needs to become:
```typescript
export interface DocumentFolder {
  id: string;
  firm_id: string;
  client_id: string;
  name: string;
  created_at: string;
  docCount?: number;  // computed client-side or via join
}
```

### Update `LegalDocument` in `src/types/document.ts`

Add missing fields:
```typescript
export interface LegalDocument {
  id: string;
  firm_id: string;
  client_id?: string;    // make required: client_id: string
  folder_id: string;     // NEW: reference to document_folders
  name: string;
  folder: string;        // REMOVE: replaced by folder_id
  file_path: string;     // NEW: Supabase Storage path
  size: string;          // CHANGE to number (bytes)
  mime_type: string;     // NEW
  date: string;          // REMOVE: use created_at instead
  ver: number;
  sensitivity: DocumentSensitivity;
  generated: boolean;    // NEW: true for DocGen docs
  content?: string;      // NEW: text for generated docs
  imported: boolean;     // REMOVE: not needed in new system
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}
```

### Add `CreateFolderInput`

```typescript
export type CreateFolderInput = {
  client_id: string;
  name: string;
};
```

---

## i18n Keys Needed

Section: `documents.*` — to be added to all 3 language files.

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `documents.title` | מסמכים | مستندات | Documents |
| `documents.folders` | תיקיות | مجلدات | Folders |
| `documents.allDocuments` | כל המסמכים | جميع المستندات | All Documents |
| `documents.newFolder` | תיקייה חדשה | مجلد جديد | New Folder |
| `documents.folderName` | שם תיקייה | اسم المجلد | Folder Name |
| `documents.createFolder` | יצירת תיקייה | إنشاء مجلد | Create Folder |
| `documents.deleteFolder` | מחיקת תיקייה | حذف المجلد | Delete Folder |
| `documents.folderNotEmpty` | לא ניתן למחוק תיקייה שמכילה מסמכים | لا يمكن حذف مجلد يحتوي على مستندات | Cannot delete folder that contains documents |
| `documents.upload` | העלאת מסמך | رفع مستند | Upload Document |
| `documents.uploadHint` | גרור קבצים לכאן או לחץ לבחירה | اسحب الملفات هنا أو انقر للاختيار | Drag files here or click to select |
| `documents.fileName` | שם קובץ | اسم الملف | File Name |
| `documents.sensitivity` | רמת סודיות | مستوى السرية | Sensitivity |
| `documents.version` | גרסה | إصدار | Version |
| `documents.size` | גודל | الحجم | Size |
| `documents.date` | תאריך | التاريخ | Date |
| `documents.actions` | פעולות | إجراءات | Actions |
| `documents.view` | צפייה | عرض | View |
| `documents.download` | הורדה | تحميل | Download |
| `documents.editMetadata` | עריכת פרטים | تعديل التفاصيل | Edit Details |
| `documents.delete` | מחיקת מסמך | حذف المستند | Delete Document |
| `documents.deleteConfirm` | האם למחוק את המסמך? | هل تريد حذف المستند؟ | Delete this document? |
| `documents.uploadSuccess` | המסמך הועלה בהצלחה | تم رفع المستند بنجاح | Document uploaded successfully |
| `documents.deleteSuccess` | המסמך נמחק | تم حذف المستند | Document deleted |
| `documents.folderCreated` | התיקייה נוצרה | تم إنشاء المجلد | Folder created |
| `documents.folderDeleted` | התיקייה נמחקה | تم حذف المجلد | Folder deleted |
| `documents.noDocuments` | אין מסמכים בתיקייה זו | لا توجد مستندات في هذا المجلد | No documents in this folder |
| `documents.selectFolder` | בחר תיקייה | اختر مجلد | Select a folder |
| `documents.encryption` | הצפנת AES-256 | تشفير AES-256 | AES-256 Encryption |
| `documents.fileTooLarge` | הקובץ גדול מדי (מקסימום 10MB) | الملف كبير جداً (الحد الأقصى 10MB) | File too large (max 10MB) |
| `documents.invalidFileType` | סוג קובץ לא נתמך | نوع الملف غير مدعوم | Unsupported file type |
| `documents.generateDocument` | מחולל מסמכים | مولد المستندات | Document Generator |
| `documents.selectTemplate` | בחר תבנית | اختر قالب | Select Template |
| `documents.templateFine` | ביטול קנס | إلغاء غرامة | Fine Cancellation |
| `documents.templateExtension` | בקשת ארכה | طلب تمديد | Extension Request |
| `documents.templateWithholding` | פטור ניכוי מס במקור | إعفاء خصم ضريبي | Withholding Exemption |
| `documents.templateAppeal` | השגה על שומה | اعتراض على تقييم ضريبي | Tax Appeal |
| `documents.templateCustom` | מכתב חופשי | رسالة حرة | Custom Letter |
| `documents.preview` | תצוגה מקדימה | معاينة | Preview |
| `documents.downloadLetter` | הורדת מכתב | تحميل الرسالة | Download Letter |
| `documents.saveToFolder` | שמירה בתיק | حفظ في المجلد | Save to Folder |
| `documents.savedToFolder` | המכתב נשמר בתיק הלקוח | تم حفظ الرسالة في ملف العميل | Letter saved to client folder |
| `documents.addressee` | נמען | المرسل إليه | Addressee |
| `documents.addresseeTitle` | תפקיד הנמען | لقب المرسل إليه | Addressee Title |
| `documents.subject` | נושא | الموضوع | Subject |

---

## Component Hierarchy and Props

### File: `src/components/documents/DocumentsTab.tsx`
**Props**: `{ clientId: string; clientName: string; clientCaseNum: string }`
**Description**: Top-level tab component. Two-column layout: FolderSidebar (left/start) + DocumentTable (right/end). Manages selected folder state. Upload and DocGen buttons in header area.
**State**: `selectedFolderId`, `showUpload`, `showDocGen`

### File: `src/components/documents/FolderSidebar.tsx`
**Props**: `{ clientId: string; folders: DocumentFolder[]; selectedFolderId: string | null; onSelectFolder: (id: string) => void; onFolderCreated: () => void }`
**Description**: Vertical folder list with doc count badges. "New folder" button at bottom. Inline folder name input for creation. Selected folder highlighted.

### File: `src/components/documents/DocumentTable.tsx`
**Props**: `{ clientId: string; folderId: string; folderName: string }`
**Description**: DataTable showing documents in the selected folder. Columns: name, sensitivity badge, version badge, date, size, actions (view/download, edit metadata, delete). AES-256 badge in header. EmptyState when no docs.

### File: `src/components/documents/DocumentUpload.tsx`
**Props**: `{ clientId: string; folderId: string; folderName: string; onSuccess: () => void; onClose: () => void }`
**Description**: Dialog/modal with drag-and-drop zone. File type validation, size check. Sensitivity selector (default: internal). Upload to Supabase Storage + insert DB row.

### File: `src/components/documents/DocGenModal.tsx`
**Props**: `{ clientId: string; clientName: string; clientCaseNum: string; firmName: string; firmPhone?: string; firmEmail?: string; folderId: string; onSuccess: () => void; onClose: () => void }`
**Description**: Dialog for letter generation. Template picker (5 templates), addressee fields, subject field. Preview panel showing formatted letter. Download as .txt and/or save to client folder (התכתבויות).

### File: `src/services/documentService.ts`
**Exports**: `documentService` object with methods:
- `listFolders(firmId, clientId)` — returns folders with doc counts
- `createFolder(firmId, input: CreateFolderInput)` — creates folder
- `deleteFolder(firmId, folderId)` — deletes folder (only if empty)
- `ensureDefaultFolders(firmId, clientId)` — creates default folders if none exist
- `list(firmId, clientId, folderId)` — documents in a folder
- `getById(firmId, id)` — single document
- `create(firmId, input)` — insert document metadata row
- `update(firmId, id, input)` — update metadata (name, sensitivity, ver)
- `delete(firmId, id)` — soft delete document + delete from storage
- `upload(firmId, clientId, folder, file)` — upload file to Supabase Storage, returns path
- `getDownloadUrl(filePath)` — get signed URL for download

### File: `src/hooks/useDocuments.ts`
**Exports**:
- `documentKeys` — query key factory
- `useFolders(firmId, clientId)` — query for folders
- `useDocuments(firmId, clientId, folderId)` — query for documents in folder
- `useCreateFolder()` — mutation
- `useDeleteFolder()` — mutation
- `useUploadDocument()` — mutation (upload file + create DB row)
- `useUpdateDocument()` — mutation (edit metadata)
- `useDeleteDocument()` — mutation (soft delete + storage delete)
- `useSaveGeneratedDocument()` — mutation (save DocGen output)

---

## Integration Points

### ClientTabs (`src/components/clients/ClientTabs.tsx`)

Replace the documents tab placeholder (lines 36-42):

```tsx
// FROM:
<TabsContent value="documents">
  <EmptyState icon={FileText} title={t('clients.tabs.documents')} description={t('clients.tabs.documentsPlaceholder')} />
</TabsContent>

// TO:
<TabsContent value="documents">
  <DocumentsTab clientId={clientId} clientName={client.name} clientCaseNum={client.caseNum} />
</TabsContent>
```

### RBAC Permissions

Existing permission IDs already defined in the system:
- `documents.view` — view documents and folders
- `documents.upload` — upload new documents, create folders
- `documents.delete` — delete documents and folders

These are already in `PERMISSION_GROUPS` (from `src/types/role.ts`) and in the `manager` system role in `constants.ts`.

### Default Folder Auto-Creation

When a client's documents tab is first loaded (or via `ensureDefaultFolders`), check if the client has any folders. If not, create the 3 defaults from `DEFAULT_FOLDERS` constant: `['חוזים', 'פיננסים', 'התכתבויות']`.

---

## Success Criteria

- [ ] `document_folders` table created with RLS, indexes, and GRANTs
- [ ] `documents` table created with RLS, indexes, triggers, and GRANTs
- [ ] Supabase Storage bucket `client-documents` created with RLS policies
- [ ] `documentService` implements all CRUD operations following existing service pattern
- [ ] `useDocuments` hook exports all query/mutation hooks following existing hook pattern
- [ ] `DocumentsTab` renders two-column layout with folder sidebar and document table
- [ ] Folder creation, selection, and deletion work correctly
- [ ] Default folders auto-created for clients with no folders
- [ ] File upload with drag-and-drop works, validates type and size (10 MB, common office formats)
- [ ] Documents display with name, sensitivity badge, version, date, size, and action buttons
- [ ] View/download opens signed URL; edit metadata updates name/sensitivity/version; delete soft-deletes
- [ ] DocGen modal generates letters from 5 templates with variable substitution
- [ ] Generated letters can be previewed, downloaded as .txt, and saved to client folder
- [ ] All UI text uses `t()` with keys in all 3 language files (he, ar, en)
- [ ] `LegalDocument` and `DocumentFolder` types updated in `src/types/document.ts`
- [ ] Integration into `ClientTabs` replaces placeholder
- [ ] Permission checks use `can('documents.view')`, `can('documents.upload')`, `can('documents.delete')`
- [ ] `npm run build`, `npm run lint`, and `npx tsc --noEmit` pass
