-- Add logo_url field to clients table for client branding
ALTER TABLE clients ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add comment
COMMENT ON COLUMN clients.logo_url IS 'URL to client logo stored in Supabase storage';
