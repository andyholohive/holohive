-- Add approved_emails column to lists table for email-based access control
-- This allows lists to have multiple approved email addresses that can access the public list

-- Add the approved_emails column
ALTER TABLE lists ADD COLUMN IF NOT EXISTS approved_emails TEXT[];

-- Add index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_lists_approved_emails ON lists USING GIN (approved_emails);

-- Add comment for documentation
COMMENT ON COLUMN lists.approved_emails IS
  'Array of email addresses that are authorized to access this list via the public link. Empty array or null means public access (no authentication required).';
