-- Storage policies for form-attachments bucket
-- Run this AFTER creating the bucket through the Supabase Dashboard UI

-- Policy 1: Allow anyone to upload files (for public form submissions)
CREATE POLICY "Anyone can upload form attachments"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'form-attachments');

-- Policy 2: Allow anyone to read files (public bucket)
CREATE POLICY "Anyone can read form attachments"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'form-attachments');

-- Policy 3: Allow form owners and admins to delete attachments
CREATE POLICY "Form owners and admins can delete attachments"
ON storage.objects
FOR DELETE
TO authenticated
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
