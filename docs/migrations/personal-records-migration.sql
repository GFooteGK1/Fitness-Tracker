-- Personal Records (PR) Detection Migration
--
-- Prerequisites:
--   - auth.users exists (managed by Supabase Auth)
--   - public.workouts exists and uses a UUID primary key
--
-- This migration is transactional and safe to run more than once. It passed
-- apply-twice and two-user RLS verification on a disposable PostgreSQL 17.6
-- Supabase project, then was applied and verified in production, on 2026-07-26.

BEGIN;

-- ============================================================================
-- PERSONAL RECORDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL CONSTRAINT personal_records_exercise_not_blank
    CHECK (length(btrim(exercise)) > 0),
  pr_type TEXT NOT NULL CONSTRAINT personal_records_pr_type_check
    CHECK (pr_type IN ('weight', 'reps', 'time', 'volume')),
  value DECIMAL(10,2) NOT NULL CONSTRAINT personal_records_value_positive
    CHECK (value > 0),
  previous_value DECIMAL(10,2) CONSTRAINT personal_records_previous_value_positive
    CHECK (previous_value IS NULL OR previous_value > 0),
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_personal_records_user
  ON public.personal_records(user_id, achieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_records_exercise
  ON public.personal_records(user_id, exercise, pr_type);
CREATE INDEX IF NOT EXISTS idx_personal_records_workout
  ON public.personal_records(workout_id);
CREATE INDEX IF NOT EXISTS idx_personal_records_type
  ON public.personal_records(user_id, pr_type, achieved_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own PRs" ON public.personal_records;
CREATE POLICY "Users can view their own PRs"
  ON public.personal_records FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own PRs" ON public.personal_records;
CREATE POLICY "Users can insert their own PRs"
  ON public.personal_records FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own PRs" ON public.personal_records;
CREATE POLICY "Users can delete their own PRs"
  ON public.personal_records FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.personal_records FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.personal_records TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.personal_records TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.personal_records IS 'Stores personal record history for exercises across all PR types';
COMMENT ON COLUMN public.personal_records.pr_type IS 'Type of PR: weight (max load), reps (max reps at weight), time (fastest WOD), volume (highest sets x reps x weight)';
COMMENT ON COLUMN public.personal_records.value IS 'The new record value (lbs for weight/volume, count for reps, seconds for time)';
COMMENT ON COLUMN public.personal_records.previous_value IS 'The previous best value, NULL if first-time exercise';

COMMIT;
