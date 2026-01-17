-- Cross-Domain Integration Migration - Phase 1
-- This migration adds the foundational cross-domain relationships
-- Run this in your Supabase SQL Editor after existing migrations

-- ============================================================================
-- PHASE 1: CROSS-DOMAIN INTEGRATION
-- ============================================================================

-- 1. User Profiles Table (Foundation for personalization)
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

-- 2. Add cross-domain columns to existing tables
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

-- 3. Fitness Correlations Table (for AI insights)
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

-- 4. Performance indexes for cross-domain queries
CREATE INDEX idx_meals_workout_context ON meals(workout_id, meal_timing) WHERE workout_id IS NOT NULL;
CREATE INDEX idx_meals_timing_user ON meals(user_id, meal_timestamp, meal_timing);
CREATE INDEX idx_workouts_nutrition_context ON workouts(user_id, nutrition_quality_score) WHERE nutrition_quality_score IS NOT NULL;
CREATE INDEX idx_workouts_energy_levels ON workouts(energy_level, hydration_level) WHERE energy_level IS NOT NULL;
CREATE INDEX idx_fitness_correlations_user_type ON fitness_correlations(user_id, correlation_type, calculated_at DESC);
CREATE INDEX idx_user_profiles_goals ON user_profiles USING GIN(fitness_goals);

-- 5. Row Level Security (RLS) policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_correlations ENABLE ROW LEVEL SECURITY;

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

-- 6. Triggers for automatic user_id assignment
CREATE TRIGGER set_user_profile_user_id
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

CREATE TRIGGER set_fitness_correlations_user_id
  BEFORE INSERT ON fitness_correlations
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- Trigger to update updated_at for user_profiles
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Helper functions for cross-domain queries
CREATE OR REPLACE FUNCTION get_meals_around_workout(
  p_workout_id UUID,
  p_time_window INTERVAL DEFAULT '4 hours'::interval
)
RETURNS TABLE (
  meal_id UUID,
  meal_timing TEXT,
  time_difference INTERVAL,
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
      WHEN m.meal_timestamp < (w.workout_date + TIME '00:00:00') THEN 'pre_workout'
      WHEN m.meal_timestamp > (w.workout_date + TIME '23:59:59') THEN 'post_workout'
      ELSE 'concurrent'
    END::TEXT,
    (m.meal_timestamp - (w.workout_date + TIME '12:00:00'))::INTERVAL,
    m.total_protein,
    m.total_carbs,
    m.total_fat,
    m.total_calories
  FROM meals m
  CROSS JOIN workouts w
  WHERE w.id = p_workout_id
    AND m.user_id = w.user_id
    AND m.meal_timestamp BETWEEN (w.workout_date - p_time_window) AND (w.workout_date + INTERVAL '1 day' + p_time_window)
  ORDER BY ABS(EXTRACT(EPOCH FROM (m.meal_timestamp - (w.workout_date + TIME '12:00:00'))));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. View for holistic daily summary
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

-- 9. Seed default user profile for existing users (optional)
-- This will create basic profiles for users who already have data
INSERT INTO user_profiles (user_id, fitness_goals, activity_level)
SELECT DISTINCT user_id, '["general_health"]'::jsonb, 'moderately_active'
FROM workouts 
WHERE user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- 10. Data validation constraints
ALTER TABLE user_profiles ADD CONSTRAINT check_valid_activity_level 
  CHECK (activity_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'));

ALTER TABLE meals ADD CONSTRAINT check_valid_meal_timing
  CHECK (meal_timing IN ('pre_workout', 'post_workout', 'general', 'recovery'));

-- 11. Comments for documentation
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
  AND table_name IN ('user_profiles', 'fitness_correlations')
ORDER BY table_name;

-- Verify columns were added
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('meals', 'workouts')
  AND column_name IN ('workout_id', 'meal_timing', 'nutrition_quality_score', 'energy_level', 'hydration_level')
ORDER BY table_name, column_name;

-- Verify indexes were created
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE '%workout_context%' 
   OR indexname LIKE '%nutrition_context%'
   OR indexname LIKE '%correlations%'
ORDER BY tablename, indexname;

-- Test the helper function
-- SELECT * FROM get_meals_around_workout('your-workout-id-here'::uuid);

-- Test the daily summary view
-- SELECT * FROM daily_fitness_summary WHERE user_id = auth.uid() ORDER BY date DESC LIMIT 7;