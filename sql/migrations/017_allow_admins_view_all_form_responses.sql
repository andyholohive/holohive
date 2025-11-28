-- Update RLS policy to allow admin users to view all form responses
-- This allows admins to see responses to all forms, not just their own

-- Drop the existing policy
DROP POLICY IF EXISTS "Form owners can view responses" ON form_responses;

-- Create new policy that allows both form owners AND admin users to view responses
CREATE POLICY "Form owners and admins can view responses"
  ON form_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_responses.form_id
      AND forms.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Also update the delete policy to allow admins to delete any response
DROP POLICY IF EXISTS "Form owners can delete responses" ON form_responses;

CREATE POLICY "Form owners and admins can delete responses"
  ON form_responses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_responses.form_id
      AND forms.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Form owners and admins can view responses" ON form_responses IS
  'Allows form owners to view responses to their own forms, and admin users to view all form responses';

COMMENT ON POLICY "Form owners and admins can delete responses" ON form_responses IS
  'Allows form owners to delete responses to their own forms, and admin users to delete any form response';
