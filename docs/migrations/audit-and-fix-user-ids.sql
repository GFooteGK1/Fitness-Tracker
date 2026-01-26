-- Database User ID Audit and Fix
-- Ensures all user data tables have proper user_id linkage for cross-domain AI analysis
-- Run this in Supabase SQL Editor

-- ============================================================================
-- PART 1: AUDIT - Check which tables have NULL user_id values
-- ============================================================================

-- Check workouts table
SELECT 'workouts' as table_name, COUNT(*) as null_count
FROM workouts
WHERE user_id IS NULL
UNION ALL

-- Check block_scores table (linked via workout_id, but should have user_id for direct queries)
SELECT 'block_scores' as table_name, COUNT(*) as null_count
FROM block_scores
WHERE user_id IS NULL
UNION ALL

-- Check benchmark_prs table
SELECT 'benchmark_prs' as table_name, COUNT(*) as null_count
FROM benchmark_prs
WHERE user_id IS NULL
UNION ALL

-- Check meals table
SELECT 'meals' as table_name, COUNT(*) as null_count
FROM meals
WHERE user_id IS NULL
UNION ALL

-- Check daily_targets table
SELECT 'daily_targets' as table_name, COUNT(*) as null_count
FROM daily_targets
WHERE user_id IS NULL
UNION ALL

-- Check user_profiles table
SELECT 'user_profiles' as table_name, COUNT(*) as null_count
FROM user_profiles
WHERE user_id IS NULL
UNION ALL

-- Check fitness_correlations table
SELECT 'fitness_correlations' as table_name, COUNT(*) as null_count
FROM fitness_correlations
WHERE user_id IS NULL
UNION ALL

-- Check WHOOP tables
SELECT 'whoop_tokens' as table_name, COUNT(*) as null_count
FROM whoop_tokens
WHERE user_id IS NULL
UNION ALL

SELECT 'whoop_recovery' as table_name, COUNT(*) as null_count
FROM whoop_recovery
WHERE user_id IS NULL
UNION ALL

SELECT 'whoop_sleep' as table_name, COUNT(*) as null_count
FROM whoop_sleep
WHERE user_id IS NULL
UNION ALL

SELECT 'whoop_cycles' as table_name, COUNT(*) as null_count
FROM whoop_cycles
WHERE user_id IS NULL
UNION ALL

SELECT 'whoop_workouts' as table_name, COUNT(*) as null_count
FROM whoop_workouts
WHERE user_id IS NULL
UNION ALL

SELECT 'whoop_sync_status' as table_name, COUNT(*) as null_count
FROM whoop_sync_status
WHERE user_id IS NULL;

-- ============================================================================
-- PART 2: CHECK block_scores - Should have user_id for efficient queries
-- ============================================================================

-- Check if block_scores table has user_id column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'block_scores'
  AND column_name = 'user_id';

-- If block_scores doesn't have user_id, we need to add it
-- This is important for cross-domain AI queries

-- ============================================================================
-- PART 3: FIX - Update NULL user_id values
-- Replace 'YOUR_USER_ID_HERE' with your actual user_id
-- ============================================================================

-- IMPORTANT: Replace this with your actual user_id
-- Example: 'ac73492c-263a-46dd-a07a-8f34a80d0c0c'
DO $$
DECLARE
  target_user_id UUID := 'ac73492c-263a-46dd-a07a-8f34a80d0c0c'; -- CHANGE THIS
BEGIN
  -- Update workouts
  UPDATE workouts
  SET user_id = target_user_id
  WHERE user_id IS NULL;
  
  RAISE NOTICE 'Updated workouts: % rows', (SELECT COUNT(*) FROM workouts WHERE user_id = target_user_id);

  -- Update benchmark_prs
  UPDATE benchmark_prs
  SET user_id = target_user_id
  WHERE user_id IS NULL;
  
  RAISE NOTICE 'Updated benchmark_prs: % rows', (SELECT COUNT(*) FROM benchmark_prs WHERE user_id = target_user_id);

  -- Update meals (if any NULL)
  UPDATE meals
  SET user_id = target_user_id
  WHERE user_id IS NULL;
  
  RAISE NOTICE 'Updated meals: % rows', (SELECT COUNT(*) FROM meals WHERE user_id = target_user_id);

  -- Update fitness_correlations (if any NULL)
  UPDATE fitness_correlations
  SET user_id = target_user_id
  WHERE user_id IS NULL;
  
  RAISE NOTICE 'Updated fitness_correlations: % rows', (SELECT COUNT(*) FROM fitness_correlations WHERE user_id = target_user_id);

END $$;

-- ============================================================================
-- PART 4: ADD user_id to block_scores if missing (for efficient AI queries)
-- ============================================================================

-- Check if user_id column exists in block_scores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'block_scores'
      AND column_name = 'user_id'
  ) THEN
    -- Add user_id column
    ALTER TABLE block_scores
    ADD COLUMN user_id UUID REFERENCES auth.users(id);
    
    -- Populate user_id from workouts table
    UPDATE block_scores bs
    SET user_id = w.user_id
    FROM workouts w
    WHERE bs.workout_id = w.id;
    
    -- Make it NOT NULL after populating
    ALTER TABLE block_scores
    ALTER COLUMN user_id SET NOT NULL;
    
    -- Add index for performance
    CREATE INDEX idx_block_scores_user_id ON block_scores(user_id);
    
    -- Add RLS policy
    ALTER TABLE block_scores ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Users can only access their own block scores"
      ON block_scores FOR ALL
      USING (auth.uid() = user_id);
    
    RAISE NOTICE 'Added user_id column to block_scores and created RLS policy';
  ELSE
    RAISE NOTICE 'user_id column already exists in block_scores';
  END IF;
END $$;

-- ============================================================================
-- PART 5: VERIFY - Check all tables now have proper user_id values
-- ============================================================================

SELECT 
  'workouts' as table_name,
  COUNT(*) as total_rows,
  COUNT(user_id) as rows_with_user_id,
  COUNT(*) - COUNT(user_id) as rows_without_user_id
FROM workouts
UNION ALL
SELECT 
  'block_scores' as table_name,
  COUNT(*) as total_rows,
  COUNT(user_id) as rows_with_user_id,
  COUNT(*) - COUNT(user_id) as rows_without_user_id
FROM block_scores
UNION ALL
SELECT 
  'benchmark_prs' as table_name,
  COUNT(*) as total_rows,
  COUNT(user_id) as rows_with_user_id,
  COUNT(*) - COUNT(user_id) as rows_without_user_id
FROM benchmark_prs
UNION ALL
SELECT 
  'meals' as table_name,
  COUNT(*) as total_rows,
  COUNT(user_id) as rows_with_user_id,
  COUNT(*) - COUNT(user_id) as rows_without_user_id
FROM meals
UNION ALL
SELECT 
  'fitness_correlations' as table_name,
  COUNT(*) as total_rows,
  COUNT(user_id) as rows_with_user_id,
  COUNT(*) - COUNT(user_id) as rows_without_user_id
FROM fitness_correlations;

-- ============================================================================
-- PART 6: SUMMARY - Show user data distribution
-- ============================================================================

SELECT 
  u.id as user_id,
  u.email,
  (SELECT COUNT(*) FROM workouts WHERE user_id = u.id) as workouts,
  (SELECT COUNT(*) FROM block_scores WHERE user_id = u.id) as block_scores,
  (SELECT COUNT(*) FROM benchmark_prs WHERE user_id = u.id) as benchmark_prs,
  (SELECT COUNT(*) FROM meals WHERE user_id = u.id) as meals,
  (SELECT COUNT(*) FROM whoop_recovery WHERE user_id = u.id) as whoop_recovery,
  (SELECT COUNT(*) FROM whoop_sleep WHERE user_id = u.id) as whoop_sleep,
  (SELECT COUNT(*) FROM whoop_cycles WHERE user_id = u.id) as whoop_cycles
FROM auth.users u
ORDER BY u.created_at DESC;
