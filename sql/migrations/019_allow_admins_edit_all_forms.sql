-- Update RLS policies to allow admin users to edit all forms and form fields
-- This allows admins to manage any form in the system, not just their own

-- ============================================
-- FORMS TABLE POLICIES
-- ============================================

-- Drop existing policies for forms table
DROP POLICY IF EXISTS "Users can view own forms" ON forms;
DROP POLICY IF EXISTS "Users can update own forms" ON forms;
DROP POLICY IF EXISTS "Users can delete own forms" ON forms;

-- Create new policies that include admin access

-- View policy: Users can view their own forms OR admins can view all forms
CREATE POLICY "Users and admins can view forms"
  ON forms FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    status = 'published'
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Update policy: Users can update their own forms OR admins can update all forms
CREATE POLICY "Users and admins can update forms"
  ON forms FOR UPDATE
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Delete policy: Users can delete their own forms OR admins can delete all forms
CREATE POLICY "Users and admins can delete forms"
  ON forms FOR DELETE
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- FORM_FIELDS TABLE POLICIES
-- ============================================

-- Drop existing policies for form_fields table
DROP POLICY IF EXISTS "Users can view own form fields" ON form_fields;
DROP POLICY IF EXISTS "Users can create fields for own forms" ON form_fields;
DROP POLICY IF EXISTS "Users can update own form fields" ON form_fields;
DROP POLICY IF EXISTS "Users can delete own form fields" ON form_fields;

-- Create new policies that include admin access

-- View policy: Users can view fields of their own forms OR admins can view all fields
CREATE POLICY "Users and admins can view form fields"
  ON form_fields FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.status = 'published'
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Insert policy: Users can create fields for their own forms OR admins can create fields for any form
CREATE POLICY "Users and admins can create form fields"
  ON form_fields FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Update policy: Users can update fields of their own forms OR admins can update any fields
CREATE POLICY "Users and admins can update form fields"
  ON form_fields FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Delete policy: Users can delete fields of their own forms OR admins can delete any fields
CREATE POLICY "Users and admins can delete form fields"
  ON form_fields FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_fields.form_id
      AND forms.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Add comments for documentation
COMMENT ON POLICY "Users and admins can view forms" ON forms IS
  'Allows users to view their own forms, anyone to view published forms, and admins to view all forms';

COMMENT ON POLICY "Users and admins can update forms" ON forms IS
  'Allows users to update their own forms, and admins to update any form';

COMMENT ON POLICY "Users and admins can delete forms" ON forms IS
  'Allows users to delete their own forms, and admins to delete any form';

COMMENT ON POLICY "Users and admins can view form fields" ON form_fields IS
  'Allows users to view fields of their own forms, anyone to view published form fields, and admins to view all form fields';

COMMENT ON POLICY "Users and admins can create form fields" ON form_fields IS
  'Allows users to create fields for their own forms, and admins to create fields for any form';

COMMENT ON POLICY "Users and admins can update form fields" ON form_fields IS
  'Allows users to update fields of their own forms, and admins to update any form fields';

COMMENT ON POLICY "Users and admins can delete form fields" ON form_fields IS
  'Allows users to delete fields of their own forms, and admins to delete any form fields';
