-- Add include_other column to form_fields table
ALTER TABLE form_fields
ADD COLUMN IF NOT EXISTS include_other BOOLEAN DEFAULT FALSE;

-- Add comment to explain the column
COMMENT ON COLUMN form_fields.include_other IS 'For select fields, includes an "Other" option that allows users to enter custom text';
