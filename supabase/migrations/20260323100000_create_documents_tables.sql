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
