-- Add slug field to clients table for clean portal URLs
ALTER TABLE clients ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;

-- Add index for faster slug lookups
CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);

-- Add comment
COMMENT ON COLUMN clients.slug IS 'URL-friendly slug for client portal access';
