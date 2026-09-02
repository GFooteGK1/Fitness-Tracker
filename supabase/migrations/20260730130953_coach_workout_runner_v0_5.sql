BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS execution_source TEXT,
  ADD COLUMN IF NOT EXISTS execution_status TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_revision INTEGER;
UPDATE public.workouts
SET
  execution_source = COALESCE(execution_source, 'manual_text'),
  execution_status = COALESCE(execution_status, 'completed'),
  started_at = COALESCE(started_at, created_at, clock_timestamp()),
  completed_at = CASE
    WHEN COALESCE(execution_status, 'completed') = 'in_progress' THEN NULL
    ELSE COALESCE(completed_at, created_at, clock_timestamp())
  END,
  updated_at = COALESCE(updated_at, created_at, clock_timestamp()),
  execution_revision = COALESCE(execution_revision, 0)
WHERE execution_source IS NULL
  OR execution_status IS NULL
  OR started_at IS NULL
  OR completed_at IS NULL
  OR updated_at IS NULL
  OR execution_revision IS NULL;
ALTER TABLE public.workouts
  ALTER COLUMN execution_source SET DEFAULT 'manual_text',
  ALTER COLUMN execution_source SET NOT NULL,
  ALTER COLUMN execution_status SET DEFAULT 'completed',
  ALTER COLUMN execution_status SET NOT NULL,
  ALTER COLUMN started_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN started_at SET NOT NULL,
  ALTER COLUMN completed_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN updated_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN execution_revision SET DEFAULT 0,
  ALTER COLUMN execution_revision SET NOT NULL;
DO $workout_execution_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workouts'::regclass
      AND conname = 'workouts_execution_source_check'
  ) THEN
    ALTER TABLE public.workouts
      ADD CONSTRAINT workouts_execution_source_check
      CHECK (execution_source IN ('manual_text', 'agent', 'program_runner', 'import'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workouts'::regclass
      AND conname = 'workouts_execution_status_check'
  ) THEN
    ALTER TABLE public.workouts
      ADD CONSTRAINT workouts_execution_status_check
      CHECK (execution_status IN ('in_progress', 'completed', 'abandoned'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workouts'::regclass
      AND conname = 'workouts_execution_revision_check'
  ) THEN
    ALTER TABLE public.workouts
      ADD CONSTRAINT workouts_execution_revision_check
      CHECK (execution_revision >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workouts'::regclass
      AND conname = 'workouts_execution_completion_check'
  ) THEN
    ALTER TABLE public.workouts
      ADD CONSTRAINT workouts_execution_completion_check
      CHECK (
        (execution_status = 'in_progress' AND completed_at IS NULL)
        OR (execution_status IN ('completed', 'abandoned') AND completed_at IS NOT NULL)
      );
  END IF;
END
$workout_execution_constraints$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_id_user
  ON public.workouts(id, user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_user_execution_status
  ON public.workouts(user_id, execution_status, workout_date DESC);
CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL,
  user_id UUID NOT NULL,
  block_id TEXT NOT NULL
    CONSTRAINT workout_exercises_block_id_check CHECK (length(block_id) BETWEEN 1 AND 200),
  block_order INTEGER NOT NULL
    CONSTRAINT workout_exercises_block_order_check CHECK (block_order >= 0),
  block_role TEXT NOT NULL
    CONSTRAINT workout_exercises_block_role_check CHECK (
      block_role IN (
        'specific_preparation',
        'priority_adaptation',
        'secondary_adaptation',
        'assistance_and_capacity',
        'conditioning',
        'downshift'
      )
    ),
  block_intent TEXT NOT NULL
    CONSTRAINT workout_exercises_block_intent_check CHECK (length(block_intent) BETWEEN 1 AND 1000),
  exercise_order INTEGER NOT NULL
    CONSTRAINT workout_exercises_exercise_order_check CHECK (exercise_order >= 0),
  prescribed_movement_id TEXT NOT NULL
    CONSTRAINT workout_exercises_prescribed_movement_id_check CHECK (length(prescribed_movement_id) BETWEEN 1 AND 200),
  prescribed_movement_name TEXT NOT NULL
    CONSTRAINT workout_exercises_prescribed_movement_name_check CHECK (length(prescribed_movement_name) BETWEEN 1 AND 200),
  performed_movement_id TEXT NOT NULL
    CONSTRAINT workout_exercises_performed_movement_id_check CHECK (length(performed_movement_id) BETWEEN 1 AND 200),
  performed_movement_name TEXT NOT NULL
    CONSTRAINT workout_exercises_performed_movement_name_check CHECK (length(performed_movement_name) BETWEEN 1 AND 200),
  target_snapshot JSONB NOT NULL
    CONSTRAINT workout_exercises_target_object_check CHECK (jsonb_typeof(target_snapshot) = 'object'),
  substitution_reason TEXT
    CONSTRAINT workout_exercises_substitution_reason_check CHECK (length(substitution_reason) <= 300),
  athlete_note TEXT
    CONSTRAINT workout_exercises_athlete_note_check CHECK (length(athlete_note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT workout_exercises_workout_owner_fk
    FOREIGN KEY (workout_id, user_id)
    REFERENCES public.workouts(id, user_id)
    ON DELETE CASCADE,
  UNIQUE (workout_id, block_order, exercise_order),
  UNIQUE (id, workout_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.workout_efforts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL,
  workout_exercise_id UUID NOT NULL,
  user_id UUID NOT NULL,
  effort_order INTEGER NOT NULL
    CONSTRAINT workout_efforts_order_check CHECK (effort_order > 0),
  effort_kind TEXT NOT NULL
    CONSTRAINT workout_efforts_kind_check CHECK (
      effort_kind IN ('set', 'quality_series', 'interval', 'continuous')
    ),
  target_snapshot JSONB NOT NULL
    CONSTRAINT workout_efforts_target_object_check CHECK (jsonb_typeof(target_snapshot) = 'object'),
  status TEXT NOT NULL DEFAULT 'planned'
    CONSTRAINT workout_efforts_status_check CHECK (status IN ('planned', 'completed', 'skipped')),
  actual_reps INTEGER
    CONSTRAINT workout_efforts_reps_check CHECK (actual_reps BETWEEN 0 AND 100000),
  actual_load NUMERIC(10, 2)
    CONSTRAINT workout_efforts_load_check CHECK (actual_load BETWEEN 0 AND 10000),
  load_unit TEXT
    CONSTRAINT workout_efforts_load_unit_check CHECK (load_unit IN ('lb', 'kg', 'bodyweight')),
  actual_duration_seconds INTEGER
    CONSTRAINT workout_efforts_duration_check CHECK (actual_duration_seconds BETWEEN 0 AND 86400),
  actual_distance NUMERIC(12, 2)
    CONSTRAINT workout_efforts_distance_check CHECK (actual_distance BETWEEN 0 AND 10000000),
  distance_unit TEXT
    CONSTRAINT workout_efforts_distance_unit_check CHECK (distance_unit IN ('m', 'km', 'mi', 'ft')),
  actual_rpe NUMERIC(3, 1)
    CONSTRAINT workout_efforts_rpe_check CHECK (
      actual_rpe BETWEEN 1 AND 10 AND mod(actual_rpe * 2, 1) = 0
    ),
  actual_rir NUMERIC(3, 1)
    CONSTRAINT workout_efforts_rir_check CHECK (
      actual_rir BETWEEN 0 AND 10 AND mod(actual_rir * 2, 1) = 0
    ),
  note TEXT
    CONSTRAINT workout_efforts_note_check CHECK (length(note) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT workout_efforts_exercise_owner_fk
    FOREIGN KEY (workout_exercise_id, workout_id, user_id)
    REFERENCES public.workout_exercises(id, workout_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT workout_efforts_load_pair_check CHECK (
    (actual_load IS NULL AND load_unit IS NULL)
    OR (actual_load IS NOT NULL AND load_unit IS NOT NULL)
  ),
  CONSTRAINT workout_efforts_distance_pair_check CHECK (
    (actual_distance IS NULL AND distance_unit IS NULL)
    OR (actual_distance IS NOT NULL AND distance_unit IS NOT NULL)
  ),
  CONSTRAINT workout_efforts_skipped_actuals_check CHECK (
    status <> 'skipped'
    OR (
      actual_reps IS NULL
      AND actual_load IS NULL
      AND actual_duration_seconds IS NULL
      AND actual_distance IS NULL
      AND actual_rpe IS NULL
      AND actual_rir IS NULL
      AND note IS NULL
    )
  ),
  CONSTRAINT workout_efforts_completed_actuals_check CHECK (
    status <> 'completed'
    OR (effort_kind = 'set' AND actual_reps IS NOT NULL)
    OR (effort_kind = 'quality_series' AND (actual_reps IS NOT NULL OR actual_duration_seconds IS NOT NULL))
    OR (effort_kind = 'interval' AND (actual_reps IS NOT NULL OR actual_duration_seconds IS NOT NULL OR actual_distance IS NOT NULL))
    OR (effort_kind = 'continuous' AND (actual_duration_seconds IS NOT NULL OR actual_distance IS NOT NULL))
  ),
  UNIQUE (workout_exercise_id, effort_order)
);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_user_workout
  ON public.workout_exercises(user_id, workout_id, block_order, exercise_order);
CREATE INDEX IF NOT EXISTS idx_workout_efforts_user_workout
  ON public.workout_efforts(user_id, workout_id, workout_exercise_id, effort_order);
CREATE INDEX IF NOT EXISTS idx_workout_efforts_incomplete
  ON public.workout_efforts(workout_id, status)
  WHERE status = 'planned';
DO $prescribed_session_workout_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.prescribed_sessions'::regclass
      AND conname = 'prescribed_sessions_completed_workout_fk'
  ) THEN
    ALTER TABLE public.prescribed_sessions
      ADD CONSTRAINT prescribed_sessions_completed_workout_fk
      FOREIGN KEY (completed_workout_id)
      REFERENCES public.workouts(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$prescribed_session_workout_fk$;
ALTER TABLE public.prescribed_sessions
  VALIDATE CONSTRAINT prescribed_sessions_completed_workout_fk;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescribed_sessions_workout_link
  ON public.prescribed_sessions(completed_workout_id)
  WHERE completed_workout_id IS NOT NULL;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workout_efforts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_efforts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own workouts" ON public.workouts;
DROP POLICY IF EXISTS "Users can view their completed workouts" ON public.workouts;
CREATE POLICY "Users can view their completed workouts"
  ON public.workouts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id AND execution_status = 'completed');
DROP POLICY IF EXISTS "Users can insert their own workouts" ON public.workouts;
DROP POLICY IF EXISTS "Users can insert their completed workouts" ON public.workouts;
CREATE POLICY "Users can insert their completed workouts"
  ON public.workouts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND execution_status = 'completed'
    AND execution_source <> 'program_runner'
  );
DROP POLICY IF EXISTS "Users can update their own workouts" ON public.workouts;
DROP POLICY IF EXISTS "Users can update their completed workouts" ON public.workouts;
CREATE POLICY "Users can update their completed workouts"
  ON public.workouts FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND execution_status = 'completed'
    AND execution_source <> 'program_runner'
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND execution_status = 'completed'
    AND execution_source <> 'program_runner'
  );
DROP POLICY IF EXISTS "Users can delete their own workouts" ON public.workouts;
DROP POLICY IF EXISTS "Users can delete their completed workouts" ON public.workouts;
CREATE POLICY "Users can delete their completed workouts"
  ON public.workouts FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND execution_status = 'completed'
    AND execution_source <> 'program_runner'
  );
DROP POLICY IF EXISTS "Users view their own workout exercises" ON public.workout_exercises;
CREATE POLICY "Users view their own workout exercises"
  ON public.workout_exercises FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users view their own workout efforts" ON public.workout_efforts;
CREATE POLICY "Users view their own workout efforts"
  ON public.workout_efforts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON TABLE public.workout_exercises FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.workout_efforts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.workout_exercises TO authenticated;
GRANT SELECT ON TABLE public.workout_efforts TO authenticated;
GRANT ALL ON TABLE public.workout_exercises TO service_role;
GRANT ALL ON TABLE public.workout_efforts TO service_role;
CREATE OR REPLACE FUNCTION public.get_program_workout(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session public.prescribed_sessions%ROWTYPE;
  v_workout public.workouts%ROWTYPE;
  v_exercises JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT session_row.*
  INTO v_session
  FROM public.prescribed_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.user_id = v_user_id;

  IF NOT FOUND OR v_session.completed_workout_id IS NULL THEN
    RAISE EXCEPTION 'Program workout not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT workout_row.*
  INTO v_workout
  FROM public.workouts AS workout_row
  WHERE workout_row.id = v_session.completed_workout_id
    AND workout_row.user_id = v_user_id
    AND workout_row.execution_source = 'program_runner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program workout not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', exercise.id,
      'blockId', exercise.block_id,
      'blockOrder', exercise.block_order,
      'exerciseOrder', exercise.exercise_order,
      'prescribedMovementId', exercise.prescribed_movement_id,
      'prescribedMovementName', exercise.prescribed_movement_name,
      'performedMovementId', exercise.performed_movement_id,
      'performedMovementName', exercise.performed_movement_name,
      'targetSnapshot', exercise.target_snapshot,
      'substitutionReason', exercise.substitution_reason,
      'athleteNote', exercise.athlete_note,
      'efforts', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', effort.id,
            'order', effort.effort_order,
            'kind', effort.effort_kind,
            'status', effort.status,
            'targetSnapshot', effort.target_snapshot,
            'actualReps', effort.actual_reps,
            'actualLoad', effort.actual_load,
            'loadUnit', effort.load_unit,
            'actualDurationSeconds', effort.actual_duration_seconds,
            'actualDistance', effort.actual_distance,
            'distanceUnit', effort.distance_unit,
            'actualRpe', effort.actual_rpe,
            'actualRir', effort.actual_rir,
            'note', effort.note
          ) ORDER BY effort.effort_order
        )
        FROM public.workout_efforts AS effort
        WHERE effort.workout_exercise_id = exercise.id
          AND effort.workout_id = v_workout.id
          AND effort.user_id = v_user_id
      ), '[]'::JSONB)
    ) ORDER BY exercise.block_order, exercise.exercise_order
  ), '[]'::JSONB)
  INTO v_exercises
  FROM public.workout_exercises AS exercise
  WHERE exercise.workout_id = v_workout.id
    AND exercise.user_id = v_user_id;

  RETURN jsonb_build_object(
    'schemaVersion', 1,
    'workoutId', v_workout.id,
    'prescribedSessionId', v_session.id,
    'workoutDate', v_workout.workout_date,
    'status', v_workout.execution_status,
    'revision', v_workout.execution_revision,
    'startedAt', v_workout.started_at,
    'completedAt', v_workout.completed_at,
    'exercises', v_exercises
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.start_program_workout(
  p_session_id UUID,
  p_workout_date DATE,
  p_started_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session public.prescribed_sessions%ROWTYPE;
  v_plan_status TEXT;
  v_active_plan_version_id UUID;
  v_workout_id UUID;
  v_block RECORD;
  v_exercise RECORD;
  v_exercise_id UUID;
  v_effort_kind TEXT;
  v_effort_count INTEGER;
  v_effort_order INTEGER;
  v_dose JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_workout_date IS NULL
    OR p_workout_date < CURRENT_DATE - 366
    OR p_workout_date > CURRENT_DATE + 366 THEN
    RAISE EXCEPTION 'Workout date is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_started_at IS NULL
    OR p_started_at > v_now + INTERVAL '5 minutes'
    OR p_started_at < v_now - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'Workout start time is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT session_row.*
  INTO v_session
  FROM public.prescribed_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescribed session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT program.active_plan_version_id
  INTO v_active_plan_version_id
  FROM public.training_programs AS program
  WHERE program.id = v_session.program_id
    AND program.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_active_plan_version_id IS DISTINCT FROM v_session.plan_version_id THEN
    RAISE EXCEPTION 'The active plan changed before workout start' USING ERRCODE = '40001';
  END IF;

  SELECT version.status
  INTO v_plan_status
  FROM public.training_plan_versions AS version
  WHERE version.id = v_session.plan_version_id
    AND version.program_id = v_session.program_id
    AND version.user_id = v_user_id;

  IF v_plan_status IS DISTINCT FROM 'accepted' OR v_session.status IS DISTINCT FROM 'planned' THEN
    RAISE EXCEPTION 'Only a planned accepted session can start' USING ERRCODE = '55000';
  END IF;

  IF v_session.completed_workout_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.workouts AS existing
      WHERE existing.id = v_session.completed_workout_id
        AND existing.user_id = v_user_id
        AND existing.execution_source = 'program_runner'
        AND existing.execution_status = 'in_progress'
    ) THEN
      RETURN public.get_program_workout(p_session_id);
    END IF;
    RAISE EXCEPTION 'This session already has a terminal workout' USING ERRCODE = '55000';
  END IF;

  IF v_session.prescription->>'format' IS DISTINCT FROM 'complete_programming_v0_3'
    OR jsonb_typeof(v_session.prescription->'blocks') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_session.prescription->'blocks') = 0 THEN
    RAISE EXCEPTION 'This prescription is not supported by the active runner' USING ERRCODE = '0A000';
  END IF;

  INSERT INTO public.workouts (
    user_id,
    workout_date,
    input_text,
    blocks,
    primary_score,
    total_duration_min,
    tags,
    notes,
    rpe,
    parse_confidence,
    execution_source,
    execution_status,
    started_at,
    completed_at,
    updated_at,
    execution_revision
  ) VALUES (
    v_user_id,
    p_workout_date,
    COALESCE(NULLIF(v_session.prescription->>'title', ''), NULLIF(v_session.prescription->>'intent', ''), 'Program session'),
    '[]'::JSONB,
    'In progress',
    NULL,
    ARRAY['program', 'coach'],
    NULL,
    NULL,
    1,
    'program_runner',
    'in_progress',
    p_started_at,
    NULL,
    v_now,
    0
  ) RETURNING id INTO v_workout_id;

  UPDATE public.prescribed_sessions
  SET completed_workout_id = v_workout_id, updated_at = v_now
  WHERE id = v_session.id AND user_id = v_user_id;

  FOR v_block IN
    SELECT block_value, block_ordinality - 1 AS block_order
    FROM jsonb_array_elements(v_session.prescription->'blocks')
      WITH ORDINALITY AS blocks(block_value, block_ordinality)
  LOOP
    IF jsonb_typeof(v_block.block_value->'exercises') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Prescription block exercises are invalid' USING ERRCODE = '22023';
    END IF;

    FOR v_exercise IN
      SELECT exercise_value, exercise_ordinality - 1 AS exercise_order
      FROM jsonb_array_elements(v_block.block_value->'exercises')
        WITH ORDINALITY AS exercises(exercise_value, exercise_ordinality)
    LOOP
      v_dose := v_exercise.exercise_value->'dose';
      v_effort_kind := CASE v_dose->>'kind'
        WHEN 'sets_reps' THEN 'set'
        WHEN 'quality_repetitions' THEN 'quality_series'
        WHEN 'continuous' THEN 'continuous'
        WHEN 'intervals' THEN 'interval'
        ELSE NULL
      END;
      v_effort_count := CASE v_dose->>'kind'
        WHEN 'sets_reps' THEN CEIL((v_dose->'sets'->>'max')::NUMERIC)::INTEGER
        WHEN 'quality_repetitions' THEN CEIL((v_dose->'series'->>'max')::NUMERIC)::INTEGER
        WHEN 'continuous' THEN 1
        WHEN 'intervals' THEN COALESCE(
          (v_dose->>'totalIntervals')::INTEGER,
          CEIL((v_dose->'series'->>'max')::NUMERIC)::INTEGER
            * CEIL((v_dose->'repetitions'->>'max')::NUMERIC)::INTEGER
        )
        ELSE NULL
      END;

      IF v_effort_kind IS NULL OR v_effort_count IS NULL OR v_effort_count NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Prescription dose cannot create bounded efforts' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.workout_exercises (
        workout_id,
        user_id,
        block_id,
        block_order,
        block_role,
        block_intent,
        exercise_order,
        prescribed_movement_id,
        prescribed_movement_name,
        performed_movement_id,
        performed_movement_name,
        target_snapshot
      ) VALUES (
        v_workout_id,
        v_user_id,
        v_block.block_value->>'id',
        v_block.block_order,
        v_block.block_value->>'role',
        v_block.block_value->>'intent',
        v_exercise.exercise_order,
        v_exercise.exercise_value->>'movementId',
        v_exercise.exercise_value->>'movementName',
        v_exercise.exercise_value->>'movementId',
        v_exercise.exercise_value->>'movementName',
        v_exercise.exercise_value
      ) RETURNING id INTO v_exercise_id;

      FOR v_effort_order IN 1..v_effort_count LOOP
        INSERT INTO public.workout_efforts (
          workout_id,
          workout_exercise_id,
          user_id,
          effort_order,
          effort_kind,
          target_snapshot
        ) VALUES (
          v_workout_id,
          v_exercise_id,
          v_user_id,
          v_effort_order,
          v_effort_kind,
          jsonb_strip_nulls(jsonb_build_object(
            'dose', v_dose,
            'executionTarget', v_exercise.exercise_value->'executionTarget',
            'loadAnchor', v_exercise.exercise_value->'loadAnchor',
            'restSeconds', v_exercise.exercise_value->'restSeconds'
          ))
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN public.get_program_workout(p_session_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.save_program_workout_progress(
  p_session_id UUID,
  p_workout_id UUID,
  p_expected_revision INTEGER,
  p_efforts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session public.prescribed_sessions%ROWTYPE;
  v_workout public.workouts%ROWTYPE;
  v_active_plan_version_id UUID;
  v_effort JSONB;
  v_effort_id UUID;
  v_effort_kind TEXT;
  v_status TEXT;
  v_actual_reps INTEGER;
  v_actual_load NUMERIC;
  v_load_unit TEXT;
  v_actual_duration_seconds INTEGER;
  v_actual_distance NUMERIC;
  v_distance_unit TEXT;
  v_actual_rpe NUMERIC;
  v_actual_rir NUMERIC;
  v_note TEXT;
  v_updated INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Expected revision is invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_efforts) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_efforts) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Effort updates must be a bounded array' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*) FROM jsonb_array_elements(p_efforts)
  ) IS DISTINCT FROM (
    SELECT count(DISTINCT effort->>'effortId') FROM jsonb_array_elements(p_efforts) AS effort
  ) THEN
    RAISE EXCEPTION 'Effort ids must be unique' USING ERRCODE = '22023';
  END IF;

  SELECT session_row.*
  INTO v_session
  FROM public.prescribed_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.completed_workout_id IS DISTINCT FROM p_workout_id THEN
    RAISE EXCEPTION 'Program workout not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT program.active_plan_version_id
  INTO v_active_plan_version_id
  FROM public.training_programs AS program
  WHERE program.id = v_session.program_id
    AND program.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_active_plan_version_id IS DISTINCT FROM v_session.plan_version_id THEN
    RAISE EXCEPTION 'The active plan changed during the workout' USING ERRCODE = '40001';
  END IF;

  SELECT workout_row.*
  INTO v_workout
  FROM public.workouts AS workout_row
  WHERE workout_row.id = p_workout_id
    AND workout_row.user_id = v_user_id
    AND workout_row.execution_source = 'program_runner'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program workout not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_workout.execution_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'This workout can no longer be changed' USING ERRCODE = '55000';
  END IF;
  IF v_workout.execution_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Workout revision changed' USING ERRCODE = '40001';
  END IF;

  FOR v_effort IN SELECT value FROM jsonb_array_elements(p_efforts) LOOP
    BEGIN
      v_effort_id := (v_effort->>'effortId')::UUID;
      v_status := v_effort->>'status';
      v_actual_reps := (v_effort->>'actualReps')::INTEGER;
      v_actual_load := (v_effort->>'actualLoad')::NUMERIC;
      v_load_unit := v_effort->>'loadUnit';
      v_actual_duration_seconds := (v_effort->>'actualDurationSeconds')::INTEGER;
      v_actual_distance := (v_effort->>'actualDistance')::NUMERIC;
      v_distance_unit := v_effort->>'distanceUnit';
      v_actual_rpe := (v_effort->>'actualRpe')::NUMERIC;
      v_actual_rir := (v_effort->>'actualRir')::NUMERIC;
      v_note := NULLIF(v_effort->>'note', '');
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Effort actual values are invalid' USING ERRCODE = '22023';
    END;

    IF v_status IS NULL OR v_status NOT IN ('planned', 'completed', 'skipped')
      OR v_actual_reps NOT BETWEEN 0 AND 100000
      OR v_actual_load NOT BETWEEN 0 AND 10000
      OR v_actual_duration_seconds NOT BETWEEN 0 AND 86400
      OR v_actual_distance NOT BETWEEN 0 AND 10000000
      OR (v_load_unit IS NOT NULL AND v_load_unit NOT IN ('lb', 'kg', 'bodyweight'))
      OR (v_distance_unit IS NOT NULL AND v_distance_unit NOT IN ('m', 'km', 'mi', 'ft'))
      OR (v_actual_load IS NULL) IS DISTINCT FROM (v_load_unit IS NULL)
      OR (v_actual_distance IS NULL) IS DISTINCT FROM (v_distance_unit IS NULL)
      OR (v_actual_rpe IS NOT NULL AND (v_actual_rpe NOT BETWEEN 1 AND 10 OR mod(v_actual_rpe * 2, 1) <> 0))
      OR (v_actual_rir IS NOT NULL AND (v_actual_rir NOT BETWEEN 0 AND 10 OR mod(v_actual_rir * 2, 1) <> 0))
      OR length(COALESCE(v_note, '')) > 300 THEN
      RAISE EXCEPTION 'Effort actual values are invalid' USING ERRCODE = '22023';
    END IF;

    SELECT effort.effort_kind
    INTO v_effort_kind
    FROM public.workout_efforts AS effort
    WHERE effort.id = v_effort_id
      AND effort.workout_id = p_workout_id
      AND effort.user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Workout effort not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_status = 'skipped' AND (
      v_actual_reps IS NOT NULL
      OR v_actual_load IS NOT NULL
      OR v_actual_duration_seconds IS NOT NULL
      OR v_actual_distance IS NOT NULL
      OR v_actual_rpe IS NOT NULL
      OR v_actual_rir IS NOT NULL
      OR v_note IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Skipped effort cannot include actual values' USING ERRCODE = '22023';
    END IF;

    IF v_status = 'completed' AND NOT (
      (v_effort_kind = 'set' AND v_actual_reps IS NOT NULL)
      OR (v_effort_kind = 'quality_series' AND (v_actual_reps IS NOT NULL OR v_actual_duration_seconds IS NOT NULL))
      OR (v_effort_kind = 'interval' AND (v_actual_reps IS NOT NULL OR v_actual_duration_seconds IS NOT NULL OR v_actual_distance IS NOT NULL))
      OR (v_effort_kind = 'continuous' AND (v_actual_duration_seconds IS NOT NULL OR v_actual_distance IS NOT NULL))
    ) THEN
      RAISE EXCEPTION 'Completed effort needs an actual result' USING ERRCODE = '22023';
    END IF;

    UPDATE public.workout_efforts
    SET
      status = v_status,
      actual_reps = v_actual_reps,
      actual_load = v_actual_load,
      load_unit = v_load_unit,
      actual_duration_seconds = v_actual_duration_seconds,
      actual_distance = v_actual_distance,
      distance_unit = v_distance_unit,
      actual_rpe = v_actual_rpe,
      actual_rir = v_actual_rir,
      note = v_note,
      updated_at = clock_timestamp()
    WHERE id = v_effort_id
      AND workout_id = p_workout_id
      AND user_id = v_user_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Workout effort update failed' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  UPDATE public.workouts
  SET execution_revision = execution_revision + 1, updated_at = clock_timestamp()
  WHERE id = p_workout_id AND user_id = v_user_id;

  RETURN public.get_program_workout(p_session_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.build_program_workout_blocks(
  p_workout_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(block_projection ORDER BY block_order), '[]'::JSONB)
  FROM (
    SELECT
      block.block_order,
      jsonb_build_object(
        'block_type', CASE WHEN block.block_role = 'conditioning' THEN 'CARDIO' ELSE 'STRENGTH' END,
        'title', block.block_intent,
        'score_model', jsonb_build_object('scoring',
          CASE WHEN block.block_role = 'conditioning' THEN 'TIME' ELSE 'REPS' END
        ),
        'segments', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'rounds', 1,
              'events', jsonb_build_array(jsonb_build_object(
                'movement_name', exercise.performed_movement_name,
                'prescribed', effort.target_snapshot->'dose',
                'performed', jsonb_strip_nulls(jsonb_build_object(
                  'reps', effort.actual_reps,
                  'load', CASE WHEN effort.actual_load IS NULL THEN NULL ELSE jsonb_build_object(
                    'value', effort.actual_load,
                    'unit', effort.load_unit
                  ) END,
                  'duration_s', effort.actual_duration_seconds,
                  'distance', CASE WHEN effort.actual_distance IS NULL THEN NULL ELSE jsonb_build_object(
                    'value', effort.actual_distance,
                    'unit', effort.distance_unit
                  ) END,
                  'rpe', effort.actual_rpe,
                  'rir', effort.actual_rir
                ))
              ))
            ) ORDER BY exercise.exercise_order, effort.effort_order
          )
          FROM public.workout_exercises AS exercise
          JOIN public.workout_efforts AS effort
            ON effort.workout_exercise_id = exercise.id
           AND effort.workout_id = exercise.workout_id
           AND effort.user_id = exercise.user_id
          WHERE exercise.workout_id = p_workout_id
            AND exercise.user_id = p_user_id
            AND exercise.block_order = block.block_order
            AND effort.status = 'completed'
        ), '[]'::JSONB),
        'block_score', jsonb_strip_nulls(jsonb_build_object(
          'total_reps', block.total_reps,
          'time_s', block.time_s,
          'tonnage_lb', block.tonnage_lb,
          'rx_status', block.rx_status,
          'is_pr', FALSE
        ))
      ) AS block_projection
    FROM (
      SELECT
        exercise.block_order,
        min(exercise.block_role) AS block_role,
        min(exercise.block_intent) AS block_intent,
        NULLIF(sum(CASE WHEN effort.status = 'completed' THEN effort.actual_reps ELSE 0 END), 0) AS total_reps,
        NULLIF(sum(CASE WHEN effort.status = 'completed' THEN effort.actual_duration_seconds ELSE 0 END), 0) AS time_s,
        NULLIF(sum(CASE
          WHEN effort.status = 'completed' AND effort.load_unit = 'lb'
            THEN COALESCE(effort.actual_load, 0) * COALESCE(effort.actual_reps, 0)
          ELSE 0
        END), 0) AS tonnage_lb,
        CASE WHEN bool_or(
          effort.status = 'skipped'
          OR exercise.performed_movement_id IS DISTINCT FROM exercise.prescribed_movement_id
        ) THEN 'MODIFIED' ELSE 'AS_PLANNED' END AS rx_status
      FROM public.workout_exercises AS exercise
      JOIN public.workout_efforts AS effort
        ON effort.workout_exercise_id = exercise.id
       AND effort.workout_id = exercise.workout_id
       AND effort.user_id = exercise.user_id
      WHERE exercise.workout_id = p_workout_id
        AND exercise.user_id = p_user_id
      GROUP BY exercise.block_order
    ) AS block
  ) AS projections;
$$;
CREATE OR REPLACE FUNCTION public.finalize_program_workout(
  p_session_id UUID,
  p_workout_id UUID,
  p_expected_revision INTEGER,
  p_responses JSONB,
  p_occurred_at TIMESTAMPTZ,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session public.prescribed_sessions%ROWTYPE;
  v_workout public.workouts%ROWTYPE;
  v_active_plan_version_id UUID;
  v_plan_status TEXT;
  v_existing public.coach_checkins%ROWTYPE;
  v_payload JSONB;
  v_blocks JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_total_duration INTEGER;
  v_block RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0
    OR jsonb_typeof(p_responses) IS DISTINCT FROM 'object'
    OR p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR p_occurred_at IS NULL
    OR p_occurred_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Workout completion request is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_responses->>'schemaVersion' IS DISTINCT FROM '1'
    OR p_responses->>'outcome' IS NULL
    OR p_responses->>'outcome' NOT IN ('as_planned', 'modified', 'stopped_early')
    OR p_responses->>'energy' IS NULL
    OR p_responses->>'energy' NOT IN ('low', 'okay', 'high')
    OR p_responses->>'pain' IS NULL
    OR p_responses->>'pain' NOT IN ('none', 'mild', 'concerning')
    OR jsonb_typeof(p_responses->'sessionRpe') IS DISTINCT FROM 'number'
    OR (p_responses->>'sessionRpe')::NUMERIC NOT BETWEEN 1 AND 10
    OR mod((p_responses->>'sessionRpe')::NUMERIC * 2, 1) <> 0
    OR NOT (p_responses ? 'note')
    OR jsonb_typeof(p_responses->'note') NOT IN ('string', 'null')
    OR length(COALESCE(p_responses->>'note', '')) > 500 THEN
    RAISE EXCEPTION 'Session response values are invalid' USING ERRCODE = '22023';
  END IF;

  SELECT session_row.*
  INTO v_session
  FROM public.prescribed_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.completed_workout_id IS DISTINCT FROM p_workout_id THEN
    RAISE EXCEPTION 'Program workout not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT program.active_plan_version_id
  INTO v_active_plan_version_id
  FROM public.training_programs AS program
  WHERE program.id = v_session.program_id
    AND program.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_active_plan_version_id IS DISTINCT FROM v_session.plan_version_id THEN
    RAISE EXCEPTION 'The active plan changed before workout completion' USING ERRCODE = '40001';
  END IF;

  SELECT version.status
  INTO v_plan_status
  FROM public.training_plan_versions AS version
  WHERE version.id = v_session.plan_version_id
    AND version.program_id = v_session.program_id
    AND version.user_id = v_user_id;

  IF v_plan_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted plan workout can be completed' USING ERRCODE = '55000';
  END IF;

  SELECT workout_row.*
  INTO v_workout
  FROM public.workouts AS workout_row
  WHERE workout_row.id = p_workout_id
    AND workout_row.user_id = v_user_id
    AND workout_row.execution_source = 'program_runner'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program workout not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_occurred_at < v_workout.started_at
    OR p_occurred_at > v_workout.started_at + INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'Workout completion time is invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := p_responses || jsonb_build_object(
    'idempotencyKey', btrim(p_idempotency_key),
    'resultStatus', 'completed',
    'workoutId', p_workout_id
  );

  SELECT checkin.*
  INTO v_existing
  FROM public.coach_checkins AS checkin
  WHERE checkin.user_id = v_user_id
    AND checkin.prescribed_session_id = p_session_id
    AND checkin.responses->>'idempotencyKey' = btrim(p_idempotency_key)
  ORDER BY checkin.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.responses IS DISTINCT FROM v_payload
      OR v_existing.occurred_at IS DISTINCT FROM p_occurred_at
      OR v_session.status IS DISTINCT FROM 'completed'
      OR v_workout.execution_status IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION 'Workout idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;
    RETURN public.get_program_workout(p_session_id);
  END IF;

  IF v_session.status IS DISTINCT FROM 'planned'
    OR v_workout.execution_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'This workout already has a terminal result' USING ERRCODE = '55000';
  END IF;
  IF v_workout.execution_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Workout revision changed' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workout_efforts AS effort
    WHERE effort.workout_id = p_workout_id
      AND effort.user_id = v_user_id
      AND effort.status = 'planned'
  ) THEN
    RAISE EXCEPTION 'Every effort needs a completed or skipped result before finishing'
      USING ERRCODE = '55000';
  END IF;
  IF p_responses->>'outcome' <> 'stopped_early' AND NOT EXISTS (
    SELECT 1 FROM public.workout_efforts AS effort
    WHERE effort.workout_id = p_workout_id
      AND effort.user_id = v_user_id
      AND effort.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'A workout with no completed efforts must be stopped early'
      USING ERRCODE = '22023';
  END IF;

  v_blocks := public.build_program_workout_blocks(p_workout_id, v_user_id);
  v_total_duration := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_occurred_at - v_workout.started_at)) / 60.0)::INTEGER);

  UPDATE public.workouts
  SET
    blocks = v_blocks,
    primary_score = 'Program session completed',
    total_duration_min = v_total_duration,
    notes = NULLIF(p_responses->>'note', ''),
    -- workouts.rpe is a legacy integer projection; the exact half-step remains in coach_checkins.
    rpe = ROUND((p_responses->>'sessionRpe')::NUMERIC)::INTEGER,
    execution_status = 'completed',
    completed_at = p_occurred_at,
    updated_at = v_now,
    execution_revision = execution_revision + 1
  WHERE id = p_workout_id AND user_id = v_user_id;

  DELETE FROM public.block_scores WHERE workout_id = p_workout_id;
  FOR v_block IN
    SELECT
      exercise.block_order,
      CASE WHEN min(exercise.block_role) = 'conditioning' THEN 'CARDIO' ELSE 'STRENGTH' END AS block_type,
      min(exercise.block_intent) AS block_title,
      NULLIF(sum(CASE WHEN effort.status = 'completed' THEN effort.actual_reps ELSE 0 END), 0) AS total_reps,
      NULLIF(sum(CASE WHEN effort.status = 'completed' THEN effort.actual_duration_seconds ELSE 0 END), 0) AS time_s,
      NULLIF(sum(CASE
        WHEN effort.status = 'completed' AND effort.load_unit = 'lb'
          THEN COALESCE(effort.actual_load, 0) * COALESCE(effort.actual_reps, 0)
        ELSE 0
      END), 0) AS tonnage_lb,
      CASE WHEN bool_or(
        effort.status = 'skipped'
        OR exercise.performed_movement_id IS DISTINCT FROM exercise.prescribed_movement_id
      ) THEN 'MODIFIED' ELSE 'AS_PLANNED' END AS rx_status
    FROM public.workout_exercises AS exercise
    JOIN public.workout_efforts AS effort
      ON effort.workout_exercise_id = exercise.id
     AND effort.workout_id = exercise.workout_id
     AND effort.user_id = exercise.user_id
    WHERE exercise.workout_id = p_workout_id
      AND exercise.user_id = v_user_id
    GROUP BY exercise.block_order
    ORDER BY exercise.block_order
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'block_scores' AND column_name = 'user_id'
    ) THEN
      EXECUTE '
        INSERT INTO public.block_scores (
          workout_id, user_id, block_type, block_title, time_s,
          total_reps, tonnage_lb, rx_status, is_pr
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE)'
      USING p_workout_id, v_user_id, v_block.block_type, v_block.block_title,
        v_block.time_s, v_block.total_reps, v_block.tonnage_lb, v_block.rx_status;
    ELSE
      INSERT INTO public.block_scores (
        workout_id, block_type, block_title, time_s,
        total_reps, tonnage_lb, rx_status, is_pr
      ) VALUES (
        p_workout_id, v_block.block_type, v_block.block_title, v_block.time_s,
        v_block.total_reps, v_block.tonnage_lb, v_block.rx_status, FALSE
      );
    END IF;
  END LOOP;

  UPDATE public.prescribed_sessions
  SET
    status = 'completed',
    execution_note = NULLIF(p_responses->>'note', ''),
    completed_at = p_occurred_at,
    updated_at = v_now
  WHERE id = p_session_id AND user_id = v_user_id;

  INSERT INTO public.coach_checkins (
    user_id,
    program_id,
    plan_version_id,
    prescribed_session_id,
    checkin_type,
    responses,
    occurred_at
  ) VALUES (
    v_user_id,
    v_session.program_id,
    v_session.plan_version_id,
    v_session.id,
    'session',
    v_payload,
    p_occurred_at
  );

  RETURN public.get_program_workout(p_session_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.enforce_program_workout_session_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workout_user_id UUID;
  v_execution_source TEXT;
  v_execution_status TEXT;
BEGIN
  IF NEW.completed_workout_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT workout.user_id, workout.execution_source, workout.execution_status
  INTO v_workout_user_id, v_execution_source, v_execution_status
  FROM public.workouts AS workout
  WHERE workout.id = NEW.completed_workout_id;

  IF NOT FOUND
    OR v_workout_user_id IS DISTINCT FROM NEW.user_id
    OR v_execution_source IS DISTINCT FROM 'program_runner' THEN
    RAISE EXCEPTION 'Prescribed session workout link is invalid' USING ERRCODE = '23503';
  END IF;

  IF NEW.status = 'completed' AND v_execution_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Program workout must be completed before its session' USING ERRCODE = '55000';
  END IF;
  IF NEW.status = 'skipped' AND v_execution_status IS DISTINCT FROM 'abandoned' THEN
    RAISE EXCEPTION 'Program workout must be abandoned before its session is skipped' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_program_workout_session_link
  ON public.prescribed_sessions;
CREATE TRIGGER enforce_program_workout_session_link
  BEFORE INSERT OR UPDATE OF completed_workout_id, status
  ON public.prescribed_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_program_workout_session_link();
REVOKE ALL ON FUNCTION public.get_program_workout(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_program_workout(UUID, DATE, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_program_workout_progress(UUID, UUID, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_program_workout(UUID, UUID, INTEGER, JSONB, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.build_program_workout_blocks(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_program_workout_session_link()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_program_workout(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_program_workout(UUID, DATE, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_program_workout_progress(UUID, UUID, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_program_workout(UUID, UUID, INTEGER, JSONB, TIMESTAMPTZ, TEXT) TO authenticated;
COMMENT ON FUNCTION public.start_program_workout(UUID, DATE, TIMESTAMPTZ) IS
  'Starts or resumes one accepted complete-programming session as a canonical in-progress workout.';
COMMENT ON FUNCTION public.save_program_workout_progress(UUID, UUID, INTEGER, JSONB) IS
  'Revision-guards and atomically saves bounded normalized effort actuals for an active program workout.';
COMMENT ON FUNCTION public.finalize_program_workout(UUID, UUID, INTEGER, JSONB, TIMESTAMPTZ, TEXT) IS
  'Idempotently publishes normalized program actuals to canonical workout history, block projections, session status, and coach feedback.';
COMMIT;
