-- Fix RLS Policies for Anonymous Access
-- Run this in Supabase SQL Editor to allow logging workouts without authentication
-- (For single-user personal use)

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can insert their own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can view their own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can update their own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can delete their own workouts" ON workouts;

DROP POLICY IF EXISTS "Users can insert their own block scores" ON block_scores;
DROP POLICY IF EXISTS "Users can view their own block scores" ON block_scores;

DROP POLICY IF EXISTS "Users can insert their own PRs" ON benchmark_prs;
DROP POLICY IF EXISTS "Users can view their own PRs" ON benchmark_prs;
DROP POLICY IF EXISTS "Users can update their own PRs" ON benchmark_prs;

-- Create permissive policies for anonymous access (single-user mode)
-- WORKOUTS
CREATE POLICY "Allow all operations on workouts"
  ON workouts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- BLOCK_SCORES
CREATE POLICY "Allow all operations on block_scores"
  ON block_scores
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- BENCHMARK_PRS
CREATE POLICY "Allow all operations on benchmark_prs"
  ON benchmark_prs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- MOVEMENTS (already has permissive read policy, add write)
DROP POLICY IF EXISTS "Anyone can view movements" ON movements;

CREATE POLICY "Allow all operations on movements"
  ON movements
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Note: This is appropriate for single-user personal use
-- If you add authentication later, you can replace these with user-scoped policies
