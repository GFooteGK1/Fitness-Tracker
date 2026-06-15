-- ============================================================================
-- WHOOP v2 Schema Fix
-- ============================================================================
--
-- Purpose:
--   Legacy WHOOP schemas used BIGINT for every WHOOP identifier. WHOOP v2 uses
--   UUID strings for sleep and workout identifiers while cycle and recovery
--   identifiers remain numeric in the application contract.
--
-- Safety features:
--   - Idempotent column checks before every ALTER.
--   - Data preservation through explicit USING casts.
--   - Safe to run multiple times on the expected legacy schema.
--   - Constraint, RLS policy, and index verification before COMMIT.
--
-- Before running:
--   Take a database backup and verify this is the intended environment.
--
-- ============================================================================

BEGIN;

DO $$
DECLARE
  sleep_type TEXT;
  workout_type TEXT;
BEGIN
  SELECT data_type INTO sleep_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'whoop_sleep'
    AND column_name = 'sleep_id';

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whoop_sleep'
      AND column_name = 'sleep_id'
      AND data_type = 'text'
  ) THEN
    RAISE NOTICE 'SKIP whoop_sleep.sleep_id already TEXT';
  ELSIF sleep_type IN ('bigint', 'integer') THEN
    ALTER TABLE public.whoop_sleep
      ALTER COLUMN sleep_id TYPE TEXT
      USING sleep_id::TEXT;
    RAISE NOTICE 'SUCCESS converted whoop_sleep.sleep_id to TEXT';
  ELSE
    RAISE EXCEPTION 'whoop_sleep.sleep_id unexpected state: %', sleep_type;
  END IF;

  SELECT data_type INTO workout_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'whoop_workouts'
    AND column_name = 'whoop_workout_id';

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whoop_workouts'
      AND column_name = 'whoop_workout_id'
      AND data_type = 'text'
  ) THEN
    RAISE NOTICE 'SKIP whoop_workouts.whoop_workout_id already TEXT';
  ELSIF workout_type IN ('bigint', 'integer') THEN
    ALTER TABLE public.whoop_workouts
      ALTER COLUMN whoop_workout_id TYPE TEXT
      USING whoop_workout_id::TEXT;
    RAISE NOTICE 'SUCCESS converted whoop_workouts.whoop_workout_id to TEXT';
  ELSE
    RAISE EXCEPTION 'whoop_workouts.whoop_workout_id unexpected state: %', workout_type;
  END IF;
END $$;

DO $$
DECLARE
  cycle_type TEXT;
  recovery_type TEXT;
BEGIN
  -- Verify whoop_cycles.cycle_id remains bigint for numeric WHOOP cycle IDs.
  SELECT data_type INTO cycle_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'whoop_cycles'
    AND column_name = 'cycle_id';

  IF cycle_type <> 'bigint' THEN
    RAISE EXCEPTION 'whoop_cycles.cycle_id is % - unexpected state, expected bigint', cycle_type;
  END IF;

  -- Verify whoop_recovery.cycle_id remains bigint for numeric WHOOP recovery cycle IDs.
  SELECT data_type INTO recovery_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'whoop_recovery'
    AND column_name = 'cycle_id';

  IF recovery_type <> 'bigint' THEN
    RAISE EXCEPTION 'whoop_recovery.cycle_id is % - unexpected state, expected bigint', recovery_type;
  END IF;

  RAISE NOTICE 'SUCCESS verified whoop_cycles.cycle_id and whoop_recovery.cycle_id remain BIGINT';
END $$;

DO $$
DECLARE
  constraint_count INTEGER;
  policy_count INTEGER;
  index_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO constraint_count
  FROM pg_constraint
  WHERE conname IN (
    'whoop_sleep_user_id_sleep_id_key',
    'whoop_workouts_user_id_whoop_workout_id_key'
  );

  IF constraint_count < 2 THEN
    RAISE EXCEPTION 'Missing WHOOP unique constraint after migration';
  END IF;

  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('whoop_sleep', 'whoop_workouts', 'whoop_cycles', 'whoop_recovery');

  IF policy_count < 4 THEN
    RAISE WARNING 'WHOOP RLS policy count is %, expected at least 4', policy_count;
  ELSE
    RAISE NOTICE 'SUCCESS verified WHOOP RLS policy_count >= 4';
  END IF;

  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('whoop_sleep', 'whoop_workouts', 'whoop_cycles', 'whoop_recovery')
    AND indexdef ILIKE '%user_id%';

  IF index_count < 4 THEN
    RAISE WARNING 'WHOOP user_id index count is %, expected at least 4', index_count;
  ELSE
    RAISE NOTICE 'SUCCESS verified WHOOP index_count >= 4';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-Migration Verification
-- ============================================================================
--
-- Run this SELECT after the transaction commits:
--
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('whoop_sleep', 'whoop_workouts', 'whoop_cycles', 'whoop_recovery')
--   AND column_name IN ('sleep_id', 'whoop_workout_id', 'cycle_id')
-- ORDER BY table_name, column_name;
--
-- Expected results:
--   whoop_sleep.sleep_id: text
--   whoop_workouts.whoop_workout_id: text
--   whoop_cycles.cycle_id: bigint
--   whoop_recovery.cycle_id: bigint
--
-- ============================================================================
-- Rollback
-- ============================================================================
--
-- WARNING: rolling back TEXT identifiers to BIGINT can lose UUID identifiers.
-- WARNING: this rollback can lose data if UUID values have already been stored.
--
-- Example rollback for legacy numeric-only data:
-- BEGIN;
-- ALTER TABLE public.whoop_sleep
--   ALTER COLUMN sleep_id TYPE BIGINT
--   USING sleep_id::BIGINT;
-- ALTER TABLE public.whoop_workouts
--   ALTER COLUMN whoop_workout_id TYPE BIGINT
--   USING whoop_workout_id::BIGINT;
-- COMMIT;
