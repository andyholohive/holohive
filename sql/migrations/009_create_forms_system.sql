-- Create forms system tables and RLS policies
-- This migration adds support for a Tally-like form builder

-- Create enum types
CREATE TYPE form_status AS ENUM ('draft', 'published', 'closed');
CREATE TYPE field_type AS ENUM ('text', 'textarea', 'email', 'number', 'select', 'radio', 'checkbox', 'date');

-- Create forms table
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status form_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create form_fields table
CREATE TABLE IF NOT EXISTS form_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  field_type field_type NOT NULL,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  options JSONB, -- For select/radio/checkbox options: ["Option 1", "Option 2"]
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create form_responses table
CREATE TABLE IF NOT EXISTS form_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  response_data JSONB NOT NULL, -- {field_id: value}
  submitted_by_email TEXT,
  submitted_by_name TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_forms_user_id ON forms(user_id);
CREATE INDEX IF NOT EXISTS idx_forms_status ON forms(status);
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_display_order ON form_fields(form_id, display_order);
CREATE INDEX IF NOT EXISTS idx_form_responses_form_id ON form_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_submitted_at ON form_responses(submitted_at);

-- Enable RLS
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for forms table

-- Users can view their own forms
CREATE POLICY "Users can view own forms"
  ON forms FOR SELECT
  USING (auth.uid() = user_id);

-- Anyone can view published forms (for public sharing)
CREATE POLICY "Anyone can view published forms"
  ON forms FOR SELECT
  USING (status = 'published');

-- Users can create their own forms
CREATE POLICY "Users can create own forms"
  ON forms FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own forms
CREATE POLICY "Users can update own forms"
  ON forms FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own forms
CREATE POLICY "Users can delete own forms"
  ON forms FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for form_fields table

-- Users can view fields of their own forms
CREATE POLICY "Users can view own form fields"
  ON form_fields FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
  );

-- Anyone can view fields of published forms
CREATE POLICY "Anyone can view published form fields"
  ON form_fields FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.status = 'published'
    )
  );

-- Users can create fields for their own forms
CREATE POLICY "Users can create fields for own forms"
  ON form_fields FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
  );

-- Users can update fields of their own forms
CREATE POLICY "Users can update own form fields"
  ON form_fields FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
  );

-- Users can delete fields of their own forms
CREATE POLICY "Users can delete own form fields"
  ON form_fields FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
  );

-- RLS Policies for form_responses table

-- Anyone can submit responses to published forms (public access)
CREATE POLICY "Anyone can submit responses to published forms"
  ON form_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_responses.form_id
      AND forms.status = 'published'
    )
  );

-- Form owners can view responses to their forms
CREATE POLICY "Form owners can view responses"
  ON form_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_responses.form_id
      AND forms.user_id = auth.uid()
    )
  );

-- Form owners can delete responses to their forms
CREATE POLICY "Form owners can delete responses"
  ON form_responses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_responses.form_id
      AND forms.user_id = auth.uid()
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE forms IS 'Stores form metadata and configuration';
COMMENT ON TABLE form_fields IS 'Stores field definitions for forms';
COMMENT ON TABLE form_responses IS 'Stores submitted responses to forms';
COMMENT ON COLUMN form_fields.options IS 'JSONB array of options for select/radio/checkbox fields';
COMMENT ON COLUMN form_responses.response_data IS 'JSONB object mapping field_id to submitted values';
