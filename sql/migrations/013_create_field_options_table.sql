-- Create field_options table for dynamic field management
CREATE TABLE IF NOT EXISTS field_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(field_name, option_value)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_field_options_field_name ON field_options(field_name);
CREATE INDEX IF NOT EXISTS idx_field_options_active ON field_options(field_name, is_active);

-- Enable RLS
ALTER TABLE field_options ENABLE ROW LEVEL SECURITY;

-- Create policies for field_options
CREATE POLICY "Allow authenticated users to read field_options"
  ON field_options FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert field_options"
  ON field_options FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update field_options"
  ON field_options FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete field_options"
  ON field_options FOR DELETE
  TO authenticated
  USING (true);

-- Insert default in_house options
INSERT INTO field_options (field_name, option_value, display_order) VALUES
  ('in_house', 'Yes', 1),
  ('in_house', 'No', 2),
  ('in_house', 'Contractor', 3),
  ('in_house', 'Freelancer', 4)
ON CONFLICT (field_name, option_value) DO NOTHING;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_field_options_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_field_options_updated_at_trigger
  BEFORE UPDATE ON field_options
  FOR EACH ROW
  EXECUTE FUNCTION update_field_options_updated_at();
