-- Make user_id nullable for single-user mode
-- Run this in Supabase SQL Editor

-- Alter workouts table
ALTER TABLE workouts 
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN user_id DROP DEFAULT;

-- Alter benchmark_prs table
ALTER TABLE benchmark_prs 
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN user_id DROP DEFAULT;

-- Drop the auto-set user_id triggers (not needed for single-user mode)
DROP TRIGGER IF EXISTS set_workout_user_id ON workouts;
DROP TRIGGER IF EXISTS set_benchmark_pr_user_id ON benchmark_prs;
DROP FUNCTION IF EXISTS set_user_id();
