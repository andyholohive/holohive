-- Add sort_order column to lists table for saved sorting preferences
-- This allows list creators to save the sort order that will be applied
-- when viewers access the public list

ALTER TABLE lists ADD COLUMN IF NOT EXISTS sort_order JSONB;

-- Add comment for documentation
COMMENT ON COLUMN lists.sort_order IS
  'Saved sort order for this list. When viewing the public list, KOLs are displayed in this order. JSON structure: { field: string, direction: "asc" | "desc" }';

-- Keep filters column if it exists (for backwards compatibility), or add it
ALTER TABLE lists ADD COLUMN IF NOT EXISTS filters JSONB;
