-- Add allow_attachments column to form_fields table
ALTER TABLE form_fields
ADD COLUMN IF NOT EXISTS allow_attachments BOOLEAN DEFAULT FALSE;

-- Add comment to explain the column
COMMENT ON COLUMN form_fields.allow_attachments IS 'For text and textarea fields, allows users to upload file attachments';
