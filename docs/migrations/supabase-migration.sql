-- Fitness Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workouts table (main workout log)
CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users DEFAULT auth.uid(),
  workout_date DATE NOT NULL,
  input_text TEXT NOT NULL,
  blocks JSONB NOT NULL,
  primary_score TEXT,
  total_duration_min INTEGER,
  tags TEXT[],
  notes TEXT,
  rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),
  parse_confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Movements table (movement dictionary)
CREATE TABLE movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  movement_pattern TEXT,
  aliases JSONB NOT NULL,
  equipment JSONB,
  rx_standards JSONB,
  parameter_schema JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Block scores table
CREATE TABLE block_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_id UUID REFERENCES workouts(id) ON DELETE CASCADE NOT NULL,
  block_type TEXT NOT NULL,
  block_title TEXT,
  rounds_completed INTEGER,
  extra_reps INTEGER,
  time_s INTEGER,
  total_reps INTEGER,
  tonnage_lb DECIMAL(10,1),
  rx_status TEXT,
  is_pr BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Benchmark PRs table
CREATE TABLE benchmark_prs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users DEFAULT auth.uid(),
  benchmark_name TEXT NOT NULL,
  date DATE NOT NULL,
  score_value DECIMAL(10,2) NOT NULL,
  score_display TEXT,
  rx_status TEXT,
  is_pr BOOLEAN DEFAULT TRUE,
  workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_workouts_user_date ON workouts(user_id, workout_date DESC);
CREATE INDEX idx_workouts_date ON workouts(workout_date DESC);
CREATE INDEX idx_workouts_tags ON workouts USING GIN(tags);
CREATE INDEX idx_block_scores_workout ON block_scores(workout_id);
CREATE INDEX idx_benchmark_prs_user ON benchmark_prs(user_id, benchmark_name);
CREATE INDEX idx_benchmark_prs_date ON benchmark_prs(date DESC);

-- Row Level Security (RLS) policies
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_prs ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;

-- Workouts policies
CREATE POLICY "Users can view their own workouts"
  ON workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workouts"
  ON workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workouts"
  ON workouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workouts"
  ON workouts FOR DELETE
  USING (auth.uid() = user_id);

-- Block scores policies (inherit from workouts)
CREATE POLICY "Users can view their own block scores"
  ON block_scores FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = block_scores.workout_id 
    AND workouts.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert their own block scores"
  ON block_scores FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = block_scores.workout_id 
    AND workouts.user_id = auth.uid()
  ));

-- Benchmark PRs policies
CREATE POLICY "Users can view their own PRs"
  ON benchmark_prs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own PRs"
  ON benchmark_prs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own PRs"
  ON benchmark_prs FOR UPDATE
  USING (auth.uid() = user_id);

-- Movements policies (read-only for all authenticated users)
CREATE POLICY "Anyone can view movements"
  ON movements FOR SELECT
  TO authenticated
  USING (true);

-- Seed some common movements
INSERT INTO movements (canonical_name, category, movement_pattern, aliases, equipment, rx_standards, parameter_schema) VALUES
('Pull-up', 'GYMNASTICS', 'pull', '["pull-up", "pullup", "pull up", "PU", "pull-ups", "pullups"]', '["pull-up bar"]', '{}', '{"reps": true}'),
('Push-up', 'GYMNASTICS', 'push', '["push-up", "pushup", "push up", "push-ups", "pushups"]', '[]', '{}', '{"reps": true}'),
('Air Squat', 'GYMNASTICS', 'squat', '["air squat", "squat", "squats", "air squats"]', '[]', '{}', '{"reps": true}'),
('Back Squat', 'WEIGHTLIFTING', 'squat', '["back squat", "BS", "back squats"]', '["barbell", "plates", "squat rack"]', '{"unit": "lb"}', '{"load": true, "reps": true}'),
('Deadlift', 'WEIGHTLIFTING', 'hinge', '["DL", "dead lift", "deads", "deadlifts", "deadlift"]', '["barbell", "plates"]', '{"male_lb": 225, "female_lb": 155, "unit": "lb"}', '{"load": true, "reps": true}'),
('Clean and Jerk', 'WEIGHTLIFTING', 'mixed', '["C&J", "C+J", "clean & jerk", "clean and jerk", "CJ"]', '["barbell", "plates"]', '{"male_lb": 135, "female_lb": 95, "unit": "lb"}', '{"load": true, "reps": true}'),
('Thruster', 'WEIGHTLIFTING', 'mixed', '["thruster", "thrusters"]', '["barbell", "plates"]', '{"male_lb": 95, "female_lb": 65, "unit": "lb"}', '{"load": true, "reps": true}'),
('Burpee', 'GYMNASTICS', 'gymnastics', '["burpee", "burpees"]', '[]', '{}', '{"reps": true}'),
('Row', 'MONOSTRUCTURAL', 'monostructural', '["row", "rowing", "erg"]', '["rowing machine"]', '{"unit": "m"}', '{"distance": true, "time_s": true, "calories": true}'),
('Run', 'MONOSTRUCTURAL', 'monostructural', '["run", "running"]', '[]', '{"unit": "m"}', '{"distance": true, "time_s": true}');

-- Create a function to automatically set user_id
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to set user_id on insert
CREATE TRIGGER set_workout_user_id
  BEFORE INSERT ON workouts
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

CREATE TRIGGER set_benchmark_pr_user_id
  BEFORE INSERT ON benchmark_prs
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();
