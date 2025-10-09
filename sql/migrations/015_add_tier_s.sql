-- Add Tier S to tier constraint
-- This updates the tier field to allow 'Tier S' as a valid option

-- Drop existing constraint if it exists
ALTER TABLE master_kols DROP CONSTRAINT IF EXISTS master_kols_tier_check;

-- Add new constraint with Tier S included
ALTER TABLE master_kols ADD CONSTRAINT master_kols_tier_check
CHECK (tier IN ('Tier S', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'));

-- Add comment
COMMENT ON CONSTRAINT master_kols_tier_check ON master_kols IS 'Valid tier values: Tier S, Tier 1, Tier 2, Tier 3, Tier 4';
