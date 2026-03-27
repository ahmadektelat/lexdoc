# Feature Summary — Document Management Module

## Branch
`feature/documents-module`

## Commits
- `dcca858` — feat: implement document management module — folders, upload, DocGen, sensitivity levels
- `dfbcb4d` — fix: address review feedback — delete dialog, download error, sanitizePath fallback, orphan cleanup

## What Was Built

A complete document management module for per-client document organization, file upload to Supabase Storage, metadata management with sensitivity levels, and simplified document generation (Hebrew letter templates).

### Features
1. **Folder Management** — Per-client folders with defaults (חוזים, פיננסים, התכתבויות), create/delete, doc count badges
2. **Document Upload** — Drag-and-drop, file type validation (PDF, DOC/DOCX, XLS/XLSX, TXT, JPG, PNG, ZIP), 10MB limit, sensitivity selector
3. **Document Table** — Sortable list with sensitivity badges, version, date, size, actions (view/download, edit metadata, delete)
4. **Document Generation** — 5 Hebrew letter templates (fine cancellation, extension request, withholding exemption, tax appeal, custom letter), variable substitution, preview, download as .txt, save to client folder
5. **Storage** — Supabase Storage bucket `client-documents` with firm-scoped RLS policies and subscription checks
6. **Security** — Path sanitization, orphan file cleanup, signed URLs, firm_id isolation via RLS

### Files Changed (15 files, ~1900 lines)

#### New files (9):
- `supabase/migrations/20260323100000_create_documents_tables.sql`
- `src/lib/format.ts`
- `src/services/documentService.ts`
- `src/hooks/useDocuments.ts`
- `src/components/documents/DocumentsTab.tsx`
- `src/components/documents/FolderSidebar.tsx`
- `src/components/documents/DocumentTable.tsx`
- `src/components/documents/DocumentUpload.tsx`
- `src/components/documents/DocGenModal.tsx`

#### Modified files (6):
- `src/types/document.ts` — Updated types
- `src/components/clients/ClientTabs.tsx` — Replaced placeholder with DocumentsTab
- `src/i18n/he.ts` — 49 translation keys
- `src/i18n/ar.ts` — 49 translation keys
- `src/i18n/en.ts` — 49 translation keys
- `docs/plans/SHARED-CODE-REGISTRY.md` — New shared exports

## Review Status
- **Code Review**: APPROVED
- **Devil's Advocate**: APPROVED (after 4 fixes applied)
- **Security Audit**: APPROVED (1 non-blocking warning addressed)
- **Verification**: `tsc`, `build`, `lint` all pass

## User Decisions
1. Storage paths: `client-documents/{firm_id}/{client_id}/{folder}/{filename}`
2. Separate `document_folders` table
3. Simplified DocGen (template + variable substitution, no AI chat)
4. 10 MB limit, common office formats
5. Display-only version field

## Architecture
- Database: 2 tables (`document_folders`, `documents`) + Supabase Storage bucket
- Service: `documentService` with 12 methods
- Hooks: 9 React Query hooks with query key factory
- Components: 5 components in two-column layout
- Security: RLS on all tables + storage, path sanitization, orphan cleanup, subscription checks
