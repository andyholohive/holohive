-- Create storage bucket for form attachments
-- This allows public form submissions to upload files

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'form-attachments',
  'form-attachments',
  true, -- Public bucket so anyone can read the files
  10485760, -- 10MB file size limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies

-- Allow anyone to upload files (for public form submissions)
CREATE POLICY "Anyone can upload form attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'form-attachments'
  );

-- Allow anyone to read files (public bucket)
CREATE POLICY "Anyone can read form attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'form-attachments'
  );

-- Allow form owners and admins to delete attachments
CREATE POLICY "Form owners and admins can delete attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'form-attachments'
    AND (
      -- Check if user owns the form (path format: formId/fieldId/filename)
      EXISTS (
        SELECT 1 FROM forms
        WHERE forms.id::text = split_part(name, '/', 1)
        AND forms.user_id = auth.uid()
      )
      OR
      -- Check if user is admin
      EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
      )
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Anyone can upload form attachments" ON storage.objects IS
  'Allows anyone (including anonymous users) to upload attachments when submitting forms';

COMMENT ON POLICY "Anyone can read form attachments" ON storage.objects IS
  'Allows public access to read form attachments since the bucket is public';

COMMENT ON POLICY "Form owners and admins can delete attachments" ON storage.objects IS
  'Allows form owners to delete attachments for their forms, and admins to delete any attachment';
