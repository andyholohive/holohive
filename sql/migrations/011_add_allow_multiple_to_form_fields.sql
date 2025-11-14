-- Add allow_multiple column to form_fields table
ALTER TABLE form_fields
ADD COLUMN IF NOT EXISTS allow_multiple BOOLEAN DEFAULT FALSE;

-- Add comment to explain the column
COMMENT ON COLUMN form_fields.allow_multiple IS 'Allows users to add multiple answers for text, textarea, email, number, and date fields';
