-- Add description field type to form fields
-- This allows adding smaller descriptive text in forms

-- Add 'description' to the field_type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'description' AND enumtypid = 'field_type'::regtype) THEN
        ALTER TYPE field_type ADD VALUE 'description';
    END IF;
END $$;

-- Add comment
COMMENT ON TYPE field_type IS 'Field types: text, textarea, email, number, select, radio, checkbox, date, section, description';
