-- Migration 054: Create profile-photos storage bucket with proper RLS.
--
-- Why this is needed: /settings tries to upload to profile-photos but
-- the bucket never existed. The code's fallback to campaign-report-files
-- "succeeds" but that bucket is private, so the returned public URL
-- never loads the image — silent breakage.

-- Create bucket: public-read, 5MB cap, image MIME types only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- RLS policies — files live at {user_id}/{timestamp}.{ext} so we gate
-- writes on the first folder matching the caller's auth.uid().

DROP POLICY IF EXISTS "profile_photos_upload_own" ON storage.objects;
CREATE POLICY "profile_photos_upload_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_photos_update_own" ON storage.objects;
CREATE POLICY "profile_photos_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_photos_delete_own" ON storage.objects;
CREATE POLICY "profile_photos_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read — bucket-level public flag handles this for anonymous
-- viewing, but explicit policy is more reliable across SDKs.
DROP POLICY IF EXISTS "profile_photos_public_read" ON storage.objects;
CREATE POLICY "profile_photos_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-photos');
