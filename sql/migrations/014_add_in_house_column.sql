-- Add in_house column to master_kols table
ALTER TABLE master_kols
ADD COLUMN IF NOT EXISTS in_house TEXT NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_master_kols_in_house ON master_kols(in_house);

-- Add comment
COMMENT ON COLUMN master_kols.in_house IS 'In-house status of the KOL';
