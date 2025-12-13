-- Add position column to crm_opportunities for custom ordering
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Set initial positions based on created_at (newest first = lowest position)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
  FROM crm_opportunities
)
UPDATE crm_opportunities
SET position = numbered.rn
FROM numbered
WHERE crm_opportunities.id = numbered.id;

-- Create index for faster ordering
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_position ON crm_opportunities(position);
