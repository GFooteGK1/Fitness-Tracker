-- Food Tracking Feature Database Schema
-- Run this in your Supabase SQL Editor after the main migration

-- Meals table (main meal log with AI analysis)
CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  meal_timestamp TIMESTAMPTZ NOT NULL,
  photo_url TEXT,
  photo_expires_at TIMESTAMPTZ,
  items JSONB NOT NULL, -- Array of food items
  total_protein DECIMAL(6,2) NOT NULL,
  total_carbs DECIMAL(6,2) NOT NULL,
  total_fat DECIMAL(6,2) NOT NULL,
  total_calories DECIMAL(7,2) NOT NULL,
  needs_review BOOLEAN DEFAULT true,
  manual_override BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(3,2),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily targets table (user nutritional goals)
CREATE TABLE daily_targets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  target_protein DECIMAL(6,2) NOT NULL,
  target_carbs DECIMAL(6,2) NOT NULL,
  target_fat DECIMAL(6,2) NOT NULL,
  target_calories DECIMAL(7,2) NOT NULL,
  tolerance_pct DECIMAL(4,2) DEFAULT 5.0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily summaries view (aggregated daily nutrition data)
CREATE VIEW daily_summaries AS
SELECT 
  user_id,
  DATE(meal_timestamp) as date,
  SUM(total_protein) as total_protein,
  SUM(total_carbs) as total_carbs,
  SUM(total_fat) as total_fat,
  SUM(total_calories) as total_calories,
  COUNT(*) as meal_count
FROM meals
GROUP BY user_id, DATE(meal_timestamp);

-- Performance indexes
CREATE INDEX idx_meals_user_date ON meals(user_id, DATE(meal_timestamp) DESC);
CREATE INDEX idx_meals_timestamp ON meals(meal_timestamp DESC);
CREATE INDEX idx_meals_needs_review ON meals(needs_review) WHERE needs_review = true;
CREATE INDEX idx_meals_manual_override ON meals(manual_override) WHERE manual_override = true;
CREATE INDEX idx_meals_photo_expires ON meals(photo_expires_at) WHERE photo_expires_at IS NOT NULL;
CREATE INDEX idx_daily_targets_user ON daily_targets(user_id);

-- Row Level Security (RLS) policies
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY;

-- Meals policies
CREATE POLICY "Users can view their own meals"
  ON meals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meals"
  ON meals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meals"
  ON meals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meals"
  ON meals FOR DELETE
  USING (auth.uid() = user_id);

-- Daily targets policies
CREATE POLICY "Users can view their own targets"
  ON daily_targets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own targets"
  ON daily_targets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own targets"
  ON daily_targets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own targets"
  ON daily_targets FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to automatically set user_id for meals
CREATE TRIGGER set_meal_user_id
  BEFORE INSERT ON meals
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- Trigger to automatically set user_id for daily_targets
CREATE TRIGGER set_daily_targets_user_id
  BEFORE INSERT ON daily_targets
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- Trigger to update updated_at timestamp for meals
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_meals_updated_at
  BEFORE UPDATE ON meals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_targets_updated_at
  BEFORE UPDATE ON daily_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Validation constraints
ALTER TABLE meals ADD CONSTRAINT check_positive_macros 
  CHECK (total_protein >= 0 AND total_carbs >= 0 AND total_fat >= 0 AND total_calories >= 0);

ALTER TABLE daily_targets ADD CONSTRAINT check_positive_targets 
  CHECK (target_protein > 0 AND target_carbs > 0 AND target_fat > 0 AND target_calories > 0);

ALTER TABLE daily_targets ADD CONSTRAINT check_tolerance_range 
  CHECK (tolerance_pct >= 0 AND tolerance_pct <= 100);