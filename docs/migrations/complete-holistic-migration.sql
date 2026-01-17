-- Complete Holistic Fitness Migration - SociusFit
-- This migration creates both food tracking and cross-domain integration
-- Run this in your Supabase SQL Editor after the main workout migration

-- ============================================================================
-- FOOD TRACKING TABLES
-- ============================================================================

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

-- ============================================================================
-- CROSS-DOMAIN INTEGRATION TABLES
-- ============================================================================

-- User Profiles Table (Foundation for personalization)
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  fitness_goals JSONB DEFAULT '[]'::jsonb, -- ["weight_loss", "muscle_gain", "performance", "general_health"]
  activity_level TEXT DEFAULT 'moderately_active' CHECK (activity_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active')),
  body_metrics JSONB DEFAULT '{}'::jsonb, -- {"height_cm": 175, "weight_kg": 70, "body_fat_pct": 15}
  preferences JSONB DEFAULT '{}'::jsonb, -- {"units": "metric", "notifications": true, "privacy_level": "private"}
  medical_conditions JSONB DEFAULT '[]'::jsonb, -- ["lactose_intolerant", "gluten_free", "vegetarian"]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fitness Correlations Table (for AI insights)
CREATE TABLE fitness_correlations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  correlation_type TEXT NOT NULL, -- 'nutrition_performance', 'meal_timing_energy', 'macro_recovery', etc.
  time_window INTERVAL NOT NULL DEFAULT '24 hours'::interval,
  correlation_strength DECIMAL(4,3) CHECK (correlation_strength BETWEEN -1.000 AND 1.000),
  data_points INTEGER DEFAULT 0,
  insights JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb, -- additional context data
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- ============================================================================
-- ADD CROSS-DOMAIN COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add workout context to meals
ALTER TABLE meals ADD COLUMN workout_id UUID REFERENCES workouts(id);
ALTER TABLE meals ADD COLUMN meal_timing TEXT CHECK (meal_timing IN ('pre_workout', 'post_workout', 'general', 'recovery'));
ALTER TABLE meals ADD COLUMN workout_correlation_window INTERVAL DEFAULT '4 hours'::interval;

-- Add nutrition context to workouts  
ALTER TABLE workouts ADD COLUMN nutrition_quality_score DECIMAL(3,2) CHECK (nutrition_quality_score BETWEEN 0 AND 1);
ALTER TABLE workouts ADD COLUMN hydration_level INTEGER CHECK (hydration_level BETWEEN 1 AND 5);
ALTER TABLE workouts ADD COLUMN energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5);
ALTER TABLE workouts ADD COLUMN pre_workout_meal_id UUID REFERENCES meals(id);
ALTER TABLE workouts ADD COLUMN post_workout_meal_id UUID REFERENCES meals(id);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Food tracking indexes
CREATE INDEX idx_meals_user_timestamp ON meals(user_id, meal_timestamp DESC);
CREATE INDEX idx_meals_timestamp ON meals(meal_timestamp DESC);
CREATE INDEX idx_meals_needs_review ON meals(needs_review) WHERE needs_review = true;
CREATE INDEX idx_meals_manual_override ON meals(manual_override) WHERE manual_override = true;
CREATE INDEX idx_meals_photo_expires ON meals(photo_expires_at) WHERE photo_expires_at IS NOT NULL;
CREATE INDEX idx_daily_targets_user ON daily_targets(user_id);

-- Cross-domain indexes
CREATE INDEX idx_meals_workout_context ON meals(workout_id, meal_timing) WHERE workout_id IS NOT NULL;
CREATE INDEX idx_meals_timing_user ON meals(user_id, meal_timestamp, meal_timing);
CREATE INDEX idx_workouts_nutrition_context ON workouts(user_id, nutrition_quality_score) WHERE nutrition_quality_score IS NOT NULL;
CREATE INDEX idx_workouts_energy_levels ON workouts(energy_level, hydration_level) WHERE energy_level IS NOT NULL;
CREATE INDEX idx_fitness_correlations_user_type ON fitness_correlations(user_id, correlation_type, calculated_at DESC);
CREATE INDEX idx_user_profiles_goals ON user_profiles USING GIN(fitness_goals);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_correlations ENABLE ROW LEVEL SECURITY;

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

-- User profiles policies
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Fitness correlations policies
CREATE POLICY "Users can view their own correlations"
  ON fitness_correlations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own correlations"
  ON fitness_correlations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS (CREATE MISSING FUNCTIONS)
-- ============================================================================

-- Create the set_user_id function if it doesn't exist
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================================

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

-- Trigger to automatically set user_id for user_profiles
CREATE TRIGGER set_user_profile_user_id
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- Trigger to automatically set user_id for fitness_correlations
CREATE TRIGGER set_fitness_correlations_user_id
  BEFORE INSERT ON fitness_correlations
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- Trigger to update updated_at timestamp for meals
CREATE TRIGGER update_meals_updated_at
  BEFORE UPDATE ON meals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at timestamp for daily_targets
CREATE TRIGGER update_daily_targets_updated_at
  BEFORE UPDATE ON daily_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at for user_profiles
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS FOR CROSS-DOMAIN QUERIES
-- ============================================================================

-- Helper function to get meals around a workout (simplified to avoid IMMUTABLE issues)
CREATE OR REPLACE FUNCTION get_meals_around_workout(
  p_workout_id UUID,
  p_hours_window INTEGER DEFAULT 4
)
RETURNS TABLE (
  meal_id UUID,
  meal_timing TEXT,
  hours_difference NUMERIC,
  total_protein DECIMAL,
  total_carbs DECIMAL,
  total_fat DECIMAL,
  total_calories DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    CASE 
      WHEN m.meal_timestamp < w.workout_date THEN 'pre_workout'
      WHEN m.meal_timestamp > (w.workout_date + INTERVAL '1 day') THEN 'post_workout'
      ELSE 'concurrent'
    END::TEXT,
    EXTRACT(EPOCH FROM (m.meal_timestamp - w.workout_date)) / 3600.0,
    m.total_protein,
    m.total_carbs,
    m.total_fat,
    m.total_calories
  FROM meals m
  CROSS JOIN workouts w
  WHERE w.id = p_workout_id
    AND m.user_id = w.user_id
    AND m.meal_timestamp BETWEEN (w.workout_date - (p_hours_window || ' hours')::interval) 
                              AND (w.workout_date + INTERVAL '1 day' + (p_hours_window || ' hours')::interval)
  ORDER BY ABS(EXTRACT(EPOCH FROM (m.meal_timestamp - w.workout_date)) / 3600.0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEWS FOR HOLISTIC ANALYSIS
-- ============================================================================

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

-- Holistic daily fitness summary
CREATE VIEW daily_fitness_summary AS
SELECT 
  COALESCE(w.user_id, m.user_id) as user_id,
  COALESCE(w.workout_date, DATE(m.meal_timestamp)) as date,
  -- Workout metrics
  COUNT(DISTINCT w.id) as workout_count,
  AVG(w.rpe) as avg_rpe,
  AVG(w.energy_level) as avg_energy_level,
  AVG(w.hydration_level) as avg_hydration_level,
  -- Nutrition metrics  
  COUNT(DISTINCT m.id) as meal_count,
  SUM(m.total_protein) as total_protein,
  SUM(m.total_carbs) as total_carbs,
  SUM(m.total_fat) as total_fat,
  SUM(m.total_calories) as total_calories,
  -- Cross-domain metrics
  COUNT(DISTINCT CASE WHEN m.meal_timing = 'pre_workout' THEN m.id END) as pre_workout_meals,
  COUNT(DISTINCT CASE WHEN m.meal_timing = 'post_workout' THEN m.id END) as post_workout_meals
FROM workouts w
FULL OUTER JOIN meals m ON w.user_id = m.user_id 
  AND w.workout_date = DATE(m.meal_timestamp)
GROUP BY COALESCE(w.user_id, m.user_id), COALESCE(w.workout_date, DATE(m.meal_timestamp));

-- ============================================================================
-- DATA VALIDATION CONSTRAINTS
-- ============================================================================

-- Meals constraints
ALTER TABLE meals ADD CONSTRAINT check_positive_macros 
  CHECK (total_protein >= 0 AND total_carbs >= 0 AND total_fat >= 0 AND total_calories >= 0);

-- Daily targets constraints
ALTER TABLE daily_targets ADD CONSTRAINT check_positive_targets 
  CHECK (target_protein > 0 AND target_carbs > 0 AND target_fat > 0 AND target_calories > 0);

ALTER TABLE daily_targets ADD CONSTRAINT check_tolerance_range 
  CHECK (tolerance_pct >= 0 AND tolerance_pct <= 100);

-- User profiles constraints
ALTER TABLE user_profiles ADD CONSTRAINT check_valid_activity_level 
  CHECK (activity_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'));

-- Meals timing constraint
ALTER TABLE meals ADD CONSTRAINT check_valid_meal_timing
  CHECK (meal_timing IN ('pre_workout', 'post_workout', 'general', 'recovery'));

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Seed default user profile for existing users (optional)
-- This will create basic profiles for users who already have data
INSERT INTO user_profiles (user_id, fitness_goals, activity_level)
SELECT DISTINCT user_id, '["general_health"]'::jsonb, 'moderately_active'
FROM workouts 
WHERE user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE meals IS 'Main meal log with AI analysis and workout correlation';
COMMENT ON TABLE daily_targets IS 'User nutritional goals and targets';
COMMENT ON TABLE user_profiles IS 'Centralized user preferences and fitness goals for personalization';
COMMENT ON TABLE fitness_correlations IS 'AI-generated correlations between workout performance and nutrition data';
COMMENT ON COLUMN meals.workout_id IS 'Links meal to associated workout for pre/post workout nutrition tracking';
COMMENT ON COLUMN meals.meal_timing IS 'Categorizes meal timing relative to workouts for correlation analysis';
COMMENT ON COLUMN workouts.nutrition_quality_score IS 'AI-calculated score (0-1) based on nutrition quality around workout time';
COMMENT ON COLUMN workouts.energy_level IS 'User-reported energy level (1-5) before/during workout';
COMMENT ON COLUMN workouts.hydration_level IS 'User-reported hydration level (1-5) before/during workout';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables were created
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('meals', 'daily_targets', 'user_profiles', 'fitness_correlations')
ORDER BY table_name;

-- Verify columns were added to existing tables
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('meals', 'workouts')
  AND column_name IN ('workout_id', 'meal_timing', 'nutrition_quality_score', 'energy_level', 'hydration_level')
ORDER BY table_name, column_name;

-- Verify views were created
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'VIEW'
  AND table_name IN ('daily_summaries', 'daily_fitness_summary')
ORDER BY table_name;

-- Test the helper function (replace with actual workout ID)
-- SELECT * FROM get_meals_around_workout('your-workout-id-here'::uuid, 4);

-- Test the daily summary view
-- SELECT * FROM daily_fitness_summary WHERE user_id = auth.uid() ORDER BY date DESC LIMIT 7;