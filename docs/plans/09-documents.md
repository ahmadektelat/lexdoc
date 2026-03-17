# Document Management Module

Document management: folder system, document upload, sensitivity levels, and document generation.

**Branch:** `migration/documents-module`
**Prerequisites:** Phase 3 (Clients) merged to main

## Context

- Read legacy-app.html for DOCS, CLIENT_DOCS, FOLDERS data structures
- Read DocGen component for document generation templates
- Documents have sensitivity levels: internal, confidential, restricted, public
- Folders are per-client with defaults: חוזים, פיננסים, התכתבויות
- firm_id scoping on ALL queries
- Hebrew primary — all strings use t()
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { Document, DocumentFolder, DocumentSensitivity, CreateDocumentInput } from '@/types'`
- Constants: `import { DOCUMENT_SENSITIVITIES, DEFAULT_FOLDERS } from '@/lib/constants'`
- Utils: `import { formatDate } from '@/lib/dates'`
- Components: `import { DataTable, EmptyState, LoadingSpinner, FormField, ConfirmDialog, StatusBadge, SearchInput } from '@/components/shared'`

## Features to Implement

1. **DocumentsTab** — Two-column layout in ClientView:
   - Left: FolderSidebar
   - Right: DocumentTable for selected folder
   - Upload button

2. **FolderSidebar** — Folder navigation:
   - List of folders with doc count
   - Create new folder button
   - Default folders auto-created for new clients
   - Selected folder highlight

3. **DocumentTable** — Document list:
   - Columns: name, sensitivity (StatusBadge), version, date, size, actions
   - Actions: view, edit metadata, delete
   - AES-256 encryption indicator badge
   - Empty state when no documents in folder

4. **DocumentUpload** — Upload component:
   - Drag-and-drop area
   - Click to select files (multiple)
   - File type icons (PDF, Word, Excel, Images, ZIP, etc.)
   - Auto-detect file type and size
   - Sensitivity selector (default: internal)
   - Upload to selected folder

5. **DocGenModal** — Document generation:
   - Template selection (letter types)
   - Variable substitution: {{client_name}}, {{firm_name}}, {{date}}, etc.
   - Preview before saving
   - Saves generated document to client's folder

6. **Services** — documentService:
   - list(clientId, folder?), getById, create, update, delete
   - createFolder(clientId, name), listFolders(clientId), deleteFolder
   - ensureDefaultFolders(clientId) — creates default folders if missing

7. **Database migration**:
   - `documents` table (firm_id, client_id, name, folder, size, date, ver, sensitivity, imported, file_path, content)
   - Indexes, RLS, GRANTs
   - Supabase Storage bucket for file storage

8. **Wire into ClientView** — Replace documents tab placeholder

Add i18n keys (documents.* section) to all 3 language files.

Files to create:
- `src/components/documents/DocumentsTab.tsx`
- `src/components/documents/FolderSidebar.tsx`
- `src/components/documents/DocumentTable.tsx`
- `src/components/documents/DocumentUpload.tsx`
- `src/components/documents/DocGenModal.tsx`
- `src/services/documentService.ts`
- `src/hooks/useDocuments.ts`
- Database migration for `documents` table
