-- Personal Records (PR) Detection Migration
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- PERSONAL RECORDS TABLE
-- ============================================================================

CREATE TABLE personal_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  exercise TEXT NOT NULL,
  pr_type TEXT NOT NULL CHECK (pr_type IN ('weight', 'reps', 'time', 'volume')),
  value DECIMAL(10,2) NOT NULL,
  previous_value DECIMAL(10,2),
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_personal_records_user ON personal_records(user_id, achieved_at DESC);
CREATE INDEX idx_personal_records_exercise ON personal_records(user_id, exercise, pr_type);
CREATE INDEX idx_personal_records_workout ON personal_records(workout_id);
CREATE INDEX idx_personal_records_type ON personal_records(user_id, pr_type, achieved_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own PRs"
  ON personal_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own PRs"
  ON personal_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own PRs"
  ON personal_records FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGER
-- ============================================================================

CREATE TRIGGER set_personal_records_user_id
  BEFORE INSERT ON personal_records
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE personal_records IS 'Stores personal record history for exercises across all PR types';
COMMENT ON COLUMN personal_records.pr_type IS 'Type of PR: weight (max load), reps (max reps at weight), time (fastest WOD), volume (highest sets x reps x weight)';
COMMENT ON COLUMN personal_records.value IS 'The new record value (lbs for weight/volume, count for reps, seconds for time)';
COMMENT ON COLUMN personal_records.previous_value IS 'The previous best value, NULL if first-time exercise';
