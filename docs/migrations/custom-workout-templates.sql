-- Migration: Create custom_workout_templates table
-- This table stores user-created workout templates

CREATE TABLE IF NOT EXISTS custom_workout_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('amrap', 'emom', 'for_time', 'strength', 'custom')),
  category TEXT DEFAULT 'custom' CHECK (category IN ('benchmark', 'hero', 'strength', 'conditioning', 'gymnastics', 'custom')),
  movements JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_cap INTEGER,
  rounds INTEGER,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_custom_workout_templates_user_id
  ON custom_workout_templates(user_id);

-- Row Level Security
ALTER TABLE custom_workout_templates ENABLE ROW LEVEL SECURITY;

-- Users can only see their own templates
CREATE POLICY "Users can view own templates"
  ON custom_workout_templates FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own templates
CREATE POLICY "Users can insert own templates"
  ON custom_workout_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own templates
CREATE POLICY "Users can update own templates"
  ON custom_workout_templates FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own templates
CREATE POLICY "Users can delete own templates"
  ON custom_workout_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_workout_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_custom_workout_templates_timestamp
  BEFORE UPDATE ON custom_workout_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_workout_templates_updated_at();
