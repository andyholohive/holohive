-- Add section field type to form fields
-- This allows adding section headers/dividers in forms

-- Add 'section' to the field_type enum
ALTER TYPE field_type ADD VALUE IF NOT EXISTS 'section';

-- Add comment
COMMENT ON TYPE field_type IS 'Field types: text, textarea, email, number, select, radio, checkbox, date, section';
