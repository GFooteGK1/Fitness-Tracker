-- Fix RLS Policies for Food Tracking Tables
-- Run this in Supabase SQL Editor to allow food tracking without authentication
-- (For single-user personal use)

-- Drop existing restrictive policies for food tracking tables
DROP POLICY IF EXISTS "Users can manage their own targets" ON daily_targets;
DROP POLICY IF EXISTS "Users can view their own targets" ON daily_targets;
DROP POLICY IF EXISTS "Users can insert their own targets" ON daily_targets;
DROP POLICY IF EXISTS "Users can update their own targets" ON daily_targets;

DROP POLICY IF EXISTS "Users can manage their own meals" ON meals;
DROP POLICY IF EXISTS "Users can view their own meals" ON meals;
DROP POLICY IF EXISTS "Users can insert their own meals" ON meals;
DROP POLICY IF EXISTS "Users can update their own meals" ON meals;
DROP POLICY IF EXISTS "Users can delete their own meals" ON meals;

DROP POLICY IF EXISTS "Users can manage their own profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profiles" ON user_profiles;

DROP POLICY IF EXISTS "Users can manage their own fitness correlations" ON fitness_correlations;
DROP POLICY IF EXISTS "Users can view their own fitness correlations" ON fitness_correlations;
DROP POLICY IF EXISTS "Users can insert their own fitness correlations" ON fitness_correlations;
DROP POLICY IF EXISTS "Users can update their own fitness correlations" ON fitness_correlations;

-- Create permissive policies for anonymous access (single-user mode)

-- DAILY_TARGETS
CREATE POLICY "Allow all operations on daily_targets"
  ON daily_targets
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- MEALS
CREATE POLICY "Allow all operations on meals"
  ON meals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- USER_PROFILES
CREATE POLICY "Allow all operations on user_profiles"
  ON user_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- FITNESS_CORRELATIONS
CREATE POLICY "Allow all operations on fitness_correlations"
  ON fitness_correlations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Note: This is appropriate for single-user personal use
-- If you add authentication later, you can replace these with user-scoped policies
-- These policies allow the anon key to perform all operations on food tracking tables