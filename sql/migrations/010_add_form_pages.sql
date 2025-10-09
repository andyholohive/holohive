-- Add page support to form fields
-- This allows organizing form fields into multiple pages

-- Add page_number column to form_fields
ALTER TABLE form_fields
ADD COLUMN IF NOT EXISTS page_number INTEGER NOT NULL DEFAULT 1;

-- Create index for page queries
CREATE INDEX IF NOT EXISTS idx_form_fields_page ON form_fields(form_id, page_number, display_order);

-- Add comment
COMMENT ON COLUMN form_fields.page_number IS 'Page number for multi-page forms (1-indexed)';
