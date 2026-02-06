-- ============================================================================
-- WHOOP Schema Verification Script
-- ============================================================================
-- 
-- Purpose: Verify that WHOOP tables have the correct schema for v2 API
-- 
-- Expected State:
--   - whoop_sleep.sleep_id: TEXT (for UUID strings)
--   - whoop_workouts.whoop_workout_id: TEXT (for UUID strings)
--   - whoop_cycles.cycle_id: TEXT (for integer or UUID strings)
--   - whoop_recovery.cycle_id: TEXT (for integer or UUID strings)
--   - All user_id columns: UUID
--   - Unique constraints exist
--   - RLS policies exist
-- 
-- ============================================================================

DO $$
DECLARE
  v_result TEXT;
  v_count INTEGER;
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'WHOOP Schema Verification';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';

  -- ============================================================================
  -- Step 1: Verify Column Types
  -- ============================================================================
  
  RAISE NOTICE '1. Verifying Column Types...';
  RAISE NOTICE '';
  
  -- Check whoop_sleep.sleep_id
  SELECT data_type INTO v_result
  FROM information_schema.columns
  WHERE table_name = 'whoop_sleep' AND column_name = 'sleep_id';
  
  IF v_result = 'text' THEN
    RAISE NOTICE '  ✓ whoop_sleep.sleep_id is TEXT';
  ELSE
    RAISE NOTICE '  ✗ whoop_sleep.sleep_id is % (expected TEXT)', v_result;
  END IF;
  
  -- Check whoop_workouts.whoop_workout_id
  SELECT data_type INTO v_result
  FROM information_schema.columns
  WHERE table_name = 'whoop_workouts' AND column_name = 'whoop_workout_id';
  
  IF v_result = 'text' THEN
    RAISE NOTICE '  ✓ whoop_workouts.whoop_workout_id is TEXT';
  ELSE
    RAISE NOTICE '  ✗ whoop_workouts.whoop_workout_id is % (expected TEXT)', v_result;
  END IF;
  
  -- Check whoop_cycles.cycle_id
  SELECT data_type INTO v_result
  FROM information_schema.columns
  WHERE table_name = 'whoop_cycles' AND column_name = 'cycle_id';
  
  IF v_result = 'text' THEN
    RAISE NOTICE '  ✓ whoop_cycles.cycle_id is TEXT';
  ELSE
    RAISE NOTICE '  ✗ whoop_cycles.cycle_id is % (expected TEXT)', v_result;
  END IF;
  
  -- Check whoop_recovery.cycle_id
  SELECT data_type INTO v_result
  FROM information_schema.columns
  WHERE table_name = 'whoop_recovery' AND column_name = 'cycle_id';
  
  IF v_result = 'text' THEN
    RAISE NOTICE '  ✓ whoop_recovery.cycle_id is TEXT';
  ELSE
    RAISE NOTICE '  ✗ whoop_recovery.cycle_id is % (expected TEXT)', v_result;
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================================================
  -- Step 2: Verify Unique Constraints
  -- ============================================================================
  
  RAISE NOTICE '2. Verifying Unique Constraints...';
  RAISE NOTICE '';
  
  -- Check whoop_sleep unique constraint
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conname = 'whoop_sleep_user_id_sleep_id_key'
    AND conrelid = 'whoop_sleep'::regclass;
  
  IF v_count > 0 THEN
    RAISE NOTICE '  ✓ whoop_sleep(user_id, sleep_id) unique constraint exists';
  ELSE
    RAISE NOTICE '  ✗ whoop_sleep unique constraint missing';
  END IF;
  
  -- Check whoop_workouts unique constraint
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conname = 'whoop_workouts_user_id_whoop_workout_id_key'
    AND conrelid = 'whoop_workouts'::regclass;
  
  IF v_count > 0 THEN
    RAISE NOTICE '  ✓ whoop_workouts(user_id, whoop_workout_id) unique constraint exists';
  ELSE
    RAISE NOTICE '  ✗ whoop_workouts unique constraint missing';
  END IF;
  
  -- Check whoop_cycles unique constraint
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conname = 'whoop_cycles_user_id_cycle_id_key'
    AND conrelid = 'whoop_cycles'::regclass;
  
  IF v_count > 0 THEN
    RAISE NOTICE '  ✓ whoop_cycles(user_id, cycle_id) unique constraint exists';
  ELSE
    RAISE NOTICE '  ✗ whoop_cycles unique constraint missing';
  END IF;
  
  -- Check whoop_recovery unique constraint
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conname = 'whoop_recovery_user_id_cycle_id_key'
    AND conrelid = 'whoop_recovery'::regclass;
  
  IF v_count > 0 THEN
    RAISE NOTICE '  ✓ whoop_recovery(user_id, cycle_id) unique constraint exists';
  ELSE
    RAISE NOTICE '  ✗ whoop_recovery unique constraint missing';
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================================================
  -- Step 3: Verify RLS Policies
  -- ============================================================================
  
  RAISE NOTICE '3. Verifying RLS Policies...';
  RAISE NOTICE '';
  
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('whoop_sleep', 'whoop_workouts', 'whoop_cycles', 'whoop_recovery');
  
  IF v_count >= 4 THEN
    RAISE NOTICE '  ✓ RLS policies exist (% policies found)', v_count;
  ELSE
    RAISE NOTICE '  ✗ Insufficient RLS policies (% found, expected at least 4)', v_count;
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================================================
  -- Step 4: Verify Indexes
  -- ============================================================================
  
  RAISE NOTICE '4. Verifying Indexes...';
  RAISE NOTICE '';
  
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('whoop_sleep', 'whoop_workouts', 'whoop_cycles', 'whoop_recovery')
    AND indexdef LIKE '%user_id%';
  
  IF v_count >= 4 THEN
    RAISE NOTICE '  ✓ User ID indexes exist (% indexes found)', v_count;
  ELSE
    RAISE NOTICE '  ✗ Insufficient user_id indexes (% found, expected at least 4)', v_count;
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================================================
  -- Step 5: Check Data Integrity
  -- ============================================================================
  
  RAISE NOTICE '5. Checking Data Integrity...';
  RAISE NOTICE '';
  
  -- Check for NULL user_id values
  SELECT COUNT(*) INTO v_count FROM whoop_sleep WHERE user_id IS NULL;
  IF v_count = 0 THEN
    RAISE NOTICE '  ✓ whoop_sleep: No NULL user_id values';
  ELSE
    RAISE NOTICE '  ✗ whoop_sleep: % records with NULL user_id', v_count;
  END IF;
  
  SELECT COUNT(*) INTO v_count FROM whoop_workouts WHERE user_id IS NULL;
  IF v_count = 0 THEN
    RAISE NOTICE '  ✓ whoop_workouts: No NULL user_id values';
  ELSE
    RAISE NOTICE '  ✗ whoop_workouts: % records with NULL user_id', v_count;
  END IF;
  
  SELECT COUNT(*) INTO v_count FROM whoop_cycles WHERE user_id IS NULL;
  IF v_count = 0 THEN
    RAISE NOTICE '  ✓ whoop_cycles: No NULL user_id values';
  ELSE
    RAISE NOTICE '  ✗ whoop_cycles: % records with NULL user_id', v_count;
  END IF;
  
  SELECT COUNT(*) INTO v_count FROM whoop_recovery WHERE user_id IS NULL;
  IF v_count = 0 THEN
    RAISE NOTICE '  ✓ whoop_recovery: No NULL user_id values';
  ELSE
    RAISE NOTICE '  ✗ whoop_recovery: % records with NULL user_id', v_count;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Verification Complete';
  RAISE NOTICE '============================================================================';
  
END $$;

-- ============================================================================
-- Summary Query
-- ============================================================================

SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('whoop_sleep', 'whoop_workouts', 'whoop_cycles', 'whoop_recovery')
  AND column_name IN ('sleep_id', 'whoop_workout_id', 'cycle_id', 'user_id')
ORDER BY table_name, column_name;
