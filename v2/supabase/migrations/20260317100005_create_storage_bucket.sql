-- Migration: create_storage_bucket
-- CREATED: 2026-03-17 10:00 IST (Jerusalem)
-- Description: Create firm-logos storage bucket and RLS policies
-- NOTE: The bucket itself must be created via Supabase dashboard or API.
-- This migration creates the storage RLS policies.

-- Storage RLS policies (on storage.objects)
CREATE POLICY "firm_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'firm-logos');

CREATE POLICY "firm_logos_upload_members" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'firm-logos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
  );

CREATE POLICY "firm_logos_update_members" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'firm-logos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
  );

CREATE POLICY "firm_logos_delete_members" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'firm-logos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1]::UUID IN (SELECT user_firm_ids())
  );
