-- Add name column to jams table
-- This allows users to save custom names for their JAM recordings

ALTER TABLE jams
ADD COLUMN IF NOT EXISTS name TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN jams.name IS 'User-defined name for the JAM recording (max 30 characters in UI)';
