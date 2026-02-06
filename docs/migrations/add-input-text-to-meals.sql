-- Migration: Add input_text column to meals table
-- Date: 2026-02-05
-- Purpose: Support text/voice input for meal logging (multi-modal food logging)

-- Add input_text column to store original user input (text or voice transcription)
ALTER TABLE meals 
ADD COLUMN IF NOT EXISTS input_text TEXT;

-- Add comment for documentation
COMMENT ON COLUMN meals.input_text IS 'Original user input text (for text/voice logging) or NULL for photo-only entries';

-- Create index for text search (optional, for future search features)
CREATE INDEX IF NOT EXISTS idx_meals_input_text ON meals USING gin(to_tsvector('english', input_text));

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'meals' AND column_name = 'input_text';
