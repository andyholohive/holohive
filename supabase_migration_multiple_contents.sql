-- Migration: Change payments.content_id to support multiple content IDs
-- This migration converts the content_id column from a single UUID to an array of UUIDs

-- Step 1: Add a new temporary column to store the array of content IDs
ALTER TABLE payments
ADD COLUMN content_ids uuid[];

-- Step 2: Migrate existing data from content_id to content_ids
-- Convert existing single content_id values to single-item arrays
UPDATE payments
SET content_ids = ARRAY[content_id]
WHERE content_id IS NOT NULL;

-- Step 3: Drop the old content_id column
ALTER TABLE payments
DROP COLUMN content_id;

-- Step 4: Rename content_ids to content_id
ALTER TABLE payments
RENAME COLUMN content_ids TO content_id;

-- Step 5: Add comment to the column
COMMENT ON COLUMN payments.content_id IS 'Array of content IDs linked to this payment';

-- Optional: Create an index on the array column for better query performance
CREATE INDEX idx_payments_content_id_gin ON payments USING GIN (content_id);

-- Note: If you have any foreign key constraints on content_id, you'll need to handle those separately
-- You may also need to update any RLS (Row Level Security) policies that reference content_id
