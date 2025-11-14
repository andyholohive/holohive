-- Add columns for requiring reasons when Yes or No is selected in dropdown fields
ALTER TABLE form_fields
ADD COLUMN IF NOT EXISTS is_yes_no_dropdown BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS require_yes_reason BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS require_no_reason BOOLEAN DEFAULT FALSE;

-- Add comments to explain the columns
COMMENT ON COLUMN form_fields.is_yes_no_dropdown IS 'For select fields, indicates this is a Yes/No dropdown with locked options';
COMMENT ON COLUMN form_fields.require_yes_reason IS 'For select fields, requires a reason input when "Yes" is selected';
COMMENT ON COLUMN form_fields.require_no_reason IS 'For select fields, requires a reason input when "No" is selected';
