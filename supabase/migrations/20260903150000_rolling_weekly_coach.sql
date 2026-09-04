BEGIN;

-- Rolling-weekly compatibility layer.
-- Apply after coach-trust-review-migration.sql. Existing eight-week rows keep
-- their recorded payloads and are tagged legacy_eight_week by default.

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS program_mode TEXT NOT NULL DEFAULT 'legacy_eight_week',
  ADD COLUMN IF NOT EXISTS goal_target_date DATE,
  ADD COLUMN IF NOT EXISTS direction JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.training_programs
  DROP CONSTRAINT IF EXISTS training_programs_eight_week_dates;

DO $training_program_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_programs_mode_check'
      AND conrelid = 'public.training_programs'::regclass
  ) THEN
    ALTER TABLE public.training_programs
      ADD CONSTRAINT training_programs_mode_check
      CHECK (program_mode IN ('legacy_eight_week', 'rolling_weekly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_programs_direction_object_check'
      AND conrelid = 'public.training_programs'::regclass
  ) THEN
    ALTER TABLE public.training_programs
      ADD CONSTRAINT training_programs_direction_object_check
      CHECK (jsonb_typeof(direction) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_programs_date_contract_check'
      AND conrelid = 'public.training_programs'::regclass
  ) THEN
    ALTER TABLE public.training_programs
      ADD CONSTRAINT training_programs_date_contract_check CHECK (
        (
          program_mode = 'legacy_eight_week'
          AND end_date = start_date + 55
        )
        OR (
          program_mode = 'rolling_weekly'
          AND end_date = start_date + 6
          AND EXTRACT(ISODOW FROM start_date) = 1
        )
      );
  END IF;
END
$training_program_constraints$;

ALTER TABLE public.training_plan_versions
  ADD COLUMN IF NOT EXISTS plan_mode TEXT NOT NULL DEFAULT 'legacy_eight_week',
  ADD COLUMN IF NOT EXISTS window_start DATE,
  ADD COLUMN IF NOT EXISTS window_end DATE,
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER;

ALTER TABLE public.training_plan_versions
  DROP CONSTRAINT IF EXISTS training_plan_versions_eight_week_horizon;

DO $training_plan_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_plan_versions_mode_check'
      AND conrelid = 'public.training_plan_versions'::regclass
  ) THEN
    ALTER TABLE public.training_plan_versions
      ADD CONSTRAINT training_plan_versions_mode_check
      CHECK (plan_mode IN ('legacy_eight_week', 'rolling_weekly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_plan_versions_window_contract_check'
      AND conrelid = 'public.training_plan_versions'::regclass
  ) THEN
    ALTER TABLE public.training_plan_versions
      ADD CONSTRAINT training_plan_versions_window_contract_check CHECK (
        (
          plan_mode = 'legacy_eight_week'
          AND intent->>'horizon_weeks' = '8'
          AND window_start IS NULL
          AND window_end IS NULL
          AND sequence_number IS NULL
        )
        OR (
          plan_mode = 'rolling_weekly'
          AND intent->>'horizon_weeks' = '1'
          AND window_start IS NOT NULL
          AND window_end = window_start + 6
          AND EXTRACT(ISODOW FROM window_start) = 1
          AND sequence_number > 0
        )
      );
  END IF;
END
$training_plan_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_plan_versions_open_rolling_window
  ON public.training_plan_versions(program_id, window_start)
  WHERE plan_mode = 'rolling_weekly' AND status IN ('proposed', 'accepted');

CREATE INDEX IF NOT EXISTS idx_training_plan_versions_rolling_sequence
  ON public.training_plan_versions(program_id, sequence_number DESC)
  WHERE plan_mode = 'rolling_weekly';

CREATE TABLE IF NOT EXISTS public.coach_weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID NOT NULL,
  base_plan_version_id UUID NOT NULL,
  review_window_start DATE NOT NULL,
  review_window_end DATE NOT NULL,
  review_reason TEXT NOT NULL
    CONSTRAINT coach_weekly_reviews_reason_check CHECK (
      review_reason IN ('all_sessions_terminal', 'week_ended', 'athlete_requested', 'safety_override')
    ),
  action TEXT NOT NULL
    CONSTRAINT coach_weekly_reviews_action_check CHECK (
      action IN (
        'continue',
        'adjust_dose',
        'collect_signal',
        'recover',
        'shift_emphasis',
        'pause_review'
      )
    ),
  presentation_class TEXT NOT NULL
    CONSTRAINT coach_weekly_reviews_presentation_check CHECK (
      presentation_class IN (
        'same_track',
        'needs_signal',
        'small_adjustment',
        'material_change',
        'safety'
      )
    ),
  evidence_status TEXT NOT NULL
    CONSTRAINT coach_weekly_reviews_evidence_status_check CHECK (
      evidence_status IN ('sufficient', 'insufficient', 'safety_override')
    ),
  confidence NUMERIC(4, 3) NOT NULL
    CONSTRAINT coach_weekly_reviews_confidence_check CHECK (confidence BETWEEN 0 AND 1),
  evidence_snapshot JSONB NOT NULL
    CONSTRAINT coach_weekly_reviews_evidence_snapshot_check
    CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  evaluation_window JSONB NOT NULL
    CONSTRAINT coach_weekly_reviews_evaluation_window_check
    CHECK (jsonb_typeof(evaluation_window) = 'object'),
  execution_summary JSONB NOT NULL
    CONSTRAINT coach_weekly_reviews_execution_summary_check
    CHECK (jsonb_typeof(execution_summary) = 'object'),
  missing_requirements JSONB NOT NULL DEFAULT '[]'::JSONB
    CONSTRAINT coach_weekly_reviews_missing_requirements_check
    CHECK (jsonb_typeof(missing_requirements) = 'array'),
  safety_override JSONB
    CONSTRAINT coach_weekly_reviews_safety_override_check
    CHECK (safety_override IS NULL OR jsonb_typeof(safety_override) = 'object'),
  rationale JSONB NOT NULL
    CONSTRAINT coach_weekly_reviews_rationale_check CHECK (jsonb_typeof(rationale) = 'object'),
  policy_version TEXT NOT NULL
    CONSTRAINT coach_weekly_reviews_policy_version_present CHECK (length(btrim(policy_version)) > 0),
  algorithm_version TEXT NOT NULL
    CONSTRAINT coach_weekly_reviews_algorithm_version_present CHECK (length(btrim(algorithm_version)) > 0),
  input_fingerprint TEXT NOT NULL
    CONSTRAINT coach_weekly_reviews_fingerprint_check CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key TEXT NOT NULL
    CONSTRAINT coach_weekly_reviews_idempotency_present
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  UNIQUE (id, program_id, user_id),
  UNIQUE (base_plan_version_id, user_id),
  UNIQUE (user_id, idempotency_key),
  CONSTRAINT coach_weekly_reviews_window_check CHECK (
    review_window_end = review_window_start + 6
    AND EXTRACT(ISODOW FROM review_window_start) = 1
  ),
  CONSTRAINT coach_weekly_reviews_action_presentation_check CHECK (
    (action = 'continue' AND presentation_class = 'same_track')
    OR (action = 'collect_signal' AND presentation_class = 'needs_signal')
    OR (action = 'adjust_dose' AND presentation_class = 'small_adjustment')
    OR (action = 'shift_emphasis' AND presentation_class = 'material_change')
    OR (action = 'recover' AND presentation_class IN ('small_adjustment', 'material_change', 'safety'))
    OR (action = 'pause_review' AND presentation_class = 'safety')
  ),
  CONSTRAINT coach_weekly_reviews_safety_shape_check CHECK (
    (
      action = 'pause_review'
      AND review_reason = 'safety_override'
      AND safety_override IS NOT NULL
      AND evidence_status = 'safety_override'
    )
    OR action <> 'pause_review'
  ),
  CONSTRAINT coach_weekly_reviews_program_owner_fk
    FOREIGN KEY (program_id, user_id)
    REFERENCES public.training_programs(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT coach_weekly_reviews_base_plan_owner_fk
    FOREIGN KEY (base_plan_version_id, program_id, user_id)
    REFERENCES public.training_plan_versions(id, program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_weekly_reviews_program_window
  ON public.coach_weekly_reviews(user_id, program_id, review_window_start DESC);

CREATE TABLE IF NOT EXISTS public.coach_weekly_review_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL,
  observation_group_id UUID NOT NULL,
  disposition TEXT NOT NULL
    CONSTRAINT coach_weekly_review_observations_disposition_check
    CHECK (disposition IN ('included', 'excluded')),
  exclusion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  UNIQUE (review_id, observation_group_id),
  CONSTRAINT coach_weekly_review_observations_exclusion_check CHECK (
    (disposition = 'excluded' AND length(btrim(exclusion_reason)) BETWEEN 3 AND 500)
    OR (disposition = 'included' AND exclusion_reason IS NULL)
  ),
  CONSTRAINT coach_weekly_review_observations_review_owner_fk
    FOREIGN KEY (review_id, user_id)
    REFERENCES public.coach_weekly_reviews(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT coach_weekly_review_observations_group_owner_fk
    FOREIGN KEY (observation_group_id, user_id)
    REFERENCES public.performance_observation_groups(id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_weekly_review_observations_review
  ON public.coach_weekly_review_observations(user_id, review_id, disposition);

ALTER TABLE public.adaptation_proposals
  ADD COLUMN IF NOT EXISTS weekly_review_id UUID;

DO $adaptation_review_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'adaptation_proposals_weekly_review_owner_fk'
      AND conrelid = 'public.adaptation_proposals'::regclass
  ) THEN
    ALTER TABLE public.adaptation_proposals
      ADD CONSTRAINT adaptation_proposals_weekly_review_owner_fk
      FOREIGN KEY (weekly_review_id, program_id, user_id)
      REFERENCES public.coach_weekly_reviews(id, program_id, user_id);
  END IF;
END
$adaptation_review_fk$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_adaptation_proposals_one_per_weekly_review
  ON public.adaptation_proposals(weekly_review_id)
  WHERE weekly_review_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_training_plan_version_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('accepted', 'superseded') AND (
    NEW.program_id IS DISTINCT FROM OLD.program_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.reference_version IS DISTINCT FROM OLD.reference_version
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.intent IS DISTINCT FROM OLD.intent
    OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.plan_mode IS DISTINCT FROM OLD.plan_mode
    OR NEW.window_start IS DISTINCT FROM OLD.window_start
    OR NEW.window_end IS DISTINCT FROM OLD.window_end
    OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
  ) THEN
    RAISE EXCEPTION 'Accepted training plan content is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_coach_weekly_review_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Coach weekly reviews are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_coach_weekly_review_content_trigger
  ON public.coach_weekly_reviews;
CREATE TRIGGER protect_coach_weekly_review_content_trigger
  BEFORE UPDATE ON public.coach_weekly_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_coach_weekly_review_content();

CREATE OR REPLACE FUNCTION public.protect_coach_weekly_review_observation_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Coach weekly review observation links are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_coach_weekly_review_observation_content_trigger
  ON public.coach_weekly_review_observations;
CREATE TRIGGER protect_coach_weekly_review_observation_content_trigger
  BEFORE UPDATE ON public.coach_weekly_review_observations
  FOR EACH ROW EXECUTE FUNCTION public.protect_coach_weekly_review_observation_content();

CREATE OR REPLACE FUNCTION public.record_coach_weekly_review(
  p_program_id UUID,
  p_base_plan_version_id UUID,
  p_review_window_start DATE,
  p_review_reason TEXT,
  p_action TEXT,
  p_presentation_class TEXT,
  p_evidence_status TEXT,
  p_confidence NUMERIC,
  p_evidence_snapshot JSONB,
  p_evaluation_window JSONB,
  p_execution_summary JSONB,
  p_missing_requirements JSONB,
  p_safety_override JSONB,
  p_rationale JSONB,
  p_observations JSONB,
  p_policy_version TEXT,
  p_algorithm_version TEXT,
  p_input_fingerprint TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  review_id UUID,
  review_action TEXT,
  review_presentation_class TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_program public.training_programs%ROWTYPE;
  v_plan public.training_plan_versions%ROWTYPE;
  v_existing public.coach_weekly_reviews%ROWTYPE;
  v_review_id UUID := gen_random_uuid();
  v_observation_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_review_window_start IS NULL OR EXTRACT(ISODOW FROM p_review_window_start) <> 1
    OR p_review_reason NOT IN ('all_sessions_terminal', 'week_ended', 'athlete_requested', 'safety_override')
    OR p_action NOT IN ('continue', 'adjust_dose', 'collect_signal', 'recover', 'shift_emphasis', 'pause_review')
    OR p_presentation_class NOT IN ('same_track', 'needs_signal', 'small_adjustment', 'material_change', 'safety')
    OR p_evidence_status NOT IN ('sufficient', 'insufficient', 'safety_override')
    OR p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 1
  THEN
    RAISE EXCEPTION 'Weekly review decision fields are invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_evidence_snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_evaluation_window) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_execution_summary) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_missing_requirements) IS DISTINCT FROM 'array'
    OR (p_safety_override IS NOT NULL AND jsonb_typeof(p_safety_override) IS DISTINCT FROM 'object')
    OR jsonb_typeof(p_rationale) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_observations) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_observations) > 500
  THEN
    RAISE EXCEPTION 'Weekly review evidence fields are invalid' USING ERRCODE = '22023';
  END IF;

  IF p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0
    OR p_algorithm_version IS NULL OR length(btrim(p_algorithm_version)) = 0
    OR p_input_fingerprint IS NULL OR p_input_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
  THEN
    RAISE EXCEPTION 'Weekly review version, fingerprint, or idempotency key is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_observations) AS observation
    WHERE jsonb_typeof(observation) <> 'object'
      OR NOT (observation ? 'groupId')
      OR observation->>'disposition' NOT IN ('included', 'excluded')
      OR (
        observation->>'disposition' = 'excluded'
        AND length(btrim(COALESCE(observation->>'reason', ''))) NOT BETWEEN 3 AND 500
      )
      OR (
        observation->>'disposition' = 'included'
        AND observation ? 'reason'
        AND observation->'reason' <> 'null'::JSONB
      )
  ) THEN
    RAISE EXCEPTION 'Weekly review observation links are invalid' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_observation_count
  FROM (
    SELECT DISTINCT (observation->>'groupId')::UUID
    FROM jsonb_array_elements(p_observations) AS observation
  ) AS distinct_observations;

  IF v_observation_count <> jsonb_array_length(p_observations) THEN
    RAISE EXCEPTION 'Weekly review observation links must be unique' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_observations) AS observation
    LEFT JOIN public.performance_observation_groups AS observation_group
      ON observation_group.id = (observation->>'groupId')::UUID
      AND observation_group.user_id = v_user_id
    WHERE observation_group.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Weekly review observation does not belong to the athlete'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':weekly-review:' || btrim(p_idempotency_key), 0)
  );

  SELECT * INTO v_existing
  FROM public.coach_weekly_reviews
  WHERE user_id = v_user_id AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.program_id IS DISTINCT FROM p_program_id
      OR v_existing.base_plan_version_id IS DISTINCT FROM p_base_plan_version_id
      OR v_existing.input_fingerprint IS DISTINCT FROM p_input_fingerprint
    THEN
      RAISE EXCEPTION 'Weekly review idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.action, v_existing.presentation_class;
    RETURN;
  END IF;

  SELECT * INTO v_program
  FROM public.training_programs
  WHERE id = p_program_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_program.status <> 'active'
    OR v_program.active_plan_version_id IS DISTINCT FROM p_base_plan_version_id THEN
    RAISE EXCEPTION 'Weekly review is stale because the active plan changed'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_plan
  FROM public.training_plan_versions
  WHERE id = p_base_plan_version_id
    AND program_id = p_program_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_plan.status <> 'accepted' OR v_plan.plan_mode <> 'rolling_weekly'
    OR v_plan.window_start IS DISTINCT FROM p_review_window_start THEN
    RAISE EXCEPTION 'Weekly review must match the accepted rolling week'
      USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_weekly_reviews
    WHERE base_plan_version_id = p_base_plan_version_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'The accepted week was already reviewed' USING ERRCODE = '40001';
  END IF;

  IF p_review_reason = 'all_sessions_terminal' AND EXISTS (
    SELECT 1 FROM public.prescribed_sessions
    WHERE plan_version_id = p_base_plan_version_id
      AND user_id = v_user_id
      AND status = 'planned'
  ) THEN
    RAISE EXCEPTION 'The accepted week still has planned sessions' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.coach_weekly_reviews (
    id, user_id, program_id, base_plan_version_id,
    review_window_start, review_window_end, review_reason,
    action, presentation_class, evidence_status, confidence,
    evidence_snapshot, evaluation_window, execution_summary,
    missing_requirements, safety_override, rationale,
    policy_version, algorithm_version, input_fingerprint, idempotency_key
  ) VALUES (
    v_review_id, v_user_id, p_program_id, p_base_plan_version_id,
    p_review_window_start, p_review_window_start + 6, p_review_reason,
    p_action, p_presentation_class, p_evidence_status, p_confidence,
    p_evidence_snapshot, p_evaluation_window, p_execution_summary,
    p_missing_requirements, p_safety_override, p_rationale,
    btrim(p_policy_version), btrim(p_algorithm_version),
    p_input_fingerprint, btrim(p_idempotency_key)
  );

  INSERT INTO public.coach_weekly_review_observations (
    user_id, review_id, observation_group_id, disposition, exclusion_reason
  )
  SELECT
    v_user_id,
    v_review_id,
    (observation->>'groupId')::UUID,
    observation->>'disposition',
    NULLIF(btrim(observation->>'reason'), '')
  FROM jsonb_array_elements(p_observations) AS observation;

  RETURN QUERY SELECT v_review_id, p_action, p_presentation_class;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_initial_rolling_weekly_proposal(
  p_title TEXT,
  p_goal_summary TEXT,
  p_window_start DATE,
  p_goal_target_date DATE,
  p_direction JSONB,
  p_reference_version TEXT,
  p_policy_version TEXT,
  p_intent JSONB,
  p_input_snapshot JSONB,
  p_sessions JSONB,
  p_rationale JSONB,
  p_input_fingerprint TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  proposal_id UUID,
  proposed_program_id UUID,
  proposed_plan_version_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing public.adaptation_proposals%ROWTYPE;
  v_program_id UUID := gen_random_uuid();
  v_plan_version_id UUID := gen_random_uuid();
  v_proposal_id UUID := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
    OR p_goal_summary IS NULL OR length(btrim(p_goal_summary)) NOT BETWEEN 1 AND 1000
    OR p_window_start IS NULL OR EXTRACT(ISODOW FROM p_window_start) <> 1
    OR jsonb_typeof(p_direction) IS DISTINCT FROM 'object'
    OR octet_length(p_direction::TEXT) > 100000
    OR p_reference_version IS NULL OR length(btrim(p_reference_version)) = 0
    OR p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0
    OR jsonb_typeof(p_intent) IS DISTINCT FROM 'object'
    OR p_intent->>'horizon_weeks' IS DISTINCT FROM '1'
    OR jsonb_typeof(p_input_snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_rationale) IS DISTINCT FROM 'object'
    OR p_input_fingerprint IS NULL OR p_input_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
  THEN
    RAISE EXCEPTION 'Initial rolling-week proposal metadata is invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_sessions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Rolling-week sessions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_sessions) NOT BETWEEN 1 AND 14 THEN
    RAISE EXCEPTION 'Rolling-week sessions must contain 1 to 14 sessions'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_sessions) AS session
      WHERE jsonb_typeof(session) <> 'object'
        OR NOT (session ? 'week_number')
        OR NOT (session ? 'session_index')
        OR NOT (session ? 'scheduled_date')
        OR NOT (session ? 'prescription')
        OR (session->>'week_number')::INTEGER <> 1
        OR (session->>'session_index')::INTEGER <= 0
        OR (session->>'scheduled_date')::DATE NOT BETWEEN p_window_start AND p_window_start + 6
        OR jsonb_typeof(session->'prescription') IS DISTINCT FROM 'object'
    )
  THEN
    RAISE EXCEPTION 'Rolling-week sessions must contain 1 to 14 valid sessions in the weekly window'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':initial-rolling-week:' || btrim(p_idempotency_key), 0)
  );

  SELECT * INTO v_existing
  FROM public.adaptation_proposals
  WHERE user_id = v_user_id AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.rationale->>'input_fingerprint' IS DISTINCT FROM p_input_fingerprint
      OR v_existing.rationale->>'proposal_mode' IS DISTINCT FROM 'rolling_weekly'
    THEN
      RAISE EXCEPTION 'Training proposal idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.program_id, v_existing.proposed_plan_version_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.training_programs
    WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active program already exists; propose a next week instead'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.training_programs (
    id, user_id, title, goal_summary, start_date, end_date,
    status, program_mode, goal_target_date, direction
  ) VALUES (
    v_program_id, v_user_id, btrim(p_title), btrim(p_goal_summary),
    p_window_start, p_window_start + 6,
    'draft', 'rolling_weekly', p_goal_target_date, p_direction
  );

  INSERT INTO public.training_plan_versions (
    id, program_id, user_id, version, reference_version, policy_version,
    intent, input_snapshot, plan_mode, window_start, window_end, sequence_number
  ) VALUES (
    v_plan_version_id, v_program_id, v_user_id, 1,
    btrim(p_reference_version), btrim(p_policy_version),
    p_intent, p_input_snapshot, 'rolling_weekly',
    p_window_start, p_window_start + 6, 1
  );

  INSERT INTO public.prescribed_sessions (
    plan_version_id, program_id, user_id, week_number,
    session_index, scheduled_date, prescription
  )
  SELECT
    v_plan_version_id, v_program_id, v_user_id, 1,
    (session->>'session_index')::INTEGER,
    (session->>'scheduled_date')::DATE,
    session->'prescription'
  FROM jsonb_array_elements(p_sessions) AS session;

  INSERT INTO public.adaptation_proposals (
    id, user_id, program_id, proposed_plan_version_id,
    idempotency_key, rationale
  ) VALUES (
    v_proposal_id, v_user_id, v_program_id, v_plan_version_id,
    btrim(p_idempotency_key),
    p_rationale || jsonb_build_object(
      'input_fingerprint', p_input_fingerprint,
      'proposal_mode', 'rolling_weekly',
      'program_metadata', jsonb_build_object(
        'title', btrim(p_title),
        'goal_summary', btrim(p_goal_summary),
        'goal_target_date', p_goal_target_date,
        'direction', p_direction
      )
    )
  );

  RETURN QUERY SELECT v_proposal_id, v_program_id, v_plan_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_rolling_weekly_replacement_proposal(
  p_program_id UUID,
  p_base_plan_version_id UUID,
  p_weekly_review_id UUID,
  p_title TEXT,
  p_goal_summary TEXT,
  p_window_start DATE,
  p_goal_target_date DATE,
  p_direction JSONB,
  p_reference_version TEXT,
  p_policy_version TEXT,
  p_intent JSONB,
  p_input_snapshot JSONB,
  p_sessions JSONB,
  p_rationale JSONB,
  p_input_fingerprint TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  proposal_id UUID,
  proposed_program_id UUID,
  proposed_plan_version_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_program public.training_programs%ROWTYPE;
  v_base_plan public.training_plan_versions%ROWTYPE;
  v_review public.coach_weekly_reviews%ROWTYPE;
  v_existing public.adaptation_proposals%ROWTYPE;
  v_plan_version_id UUID := gen_random_uuid();
  v_proposal_id UUID := gen_random_uuid();
  v_next_version INTEGER;
  v_sequence_number INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_program_id IS NULL OR p_base_plan_version_id IS NULL
    OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
    OR p_goal_summary IS NULL OR length(btrim(p_goal_summary)) NOT BETWEEN 1 AND 1000
    OR p_window_start IS NULL OR EXTRACT(ISODOW FROM p_window_start) <> 1
    OR jsonb_typeof(p_direction) IS DISTINCT FROM 'object'
    OR octet_length(p_direction::TEXT) > 100000
    OR p_reference_version IS NULL OR length(btrim(p_reference_version)) = 0
    OR p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0
    OR jsonb_typeof(p_intent) IS DISTINCT FROM 'object'
    OR p_intent->>'horizon_weeks' IS DISTINCT FROM '1'
    OR jsonb_typeof(p_input_snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_rationale) IS DISTINCT FROM 'object'
    OR p_input_fingerprint IS NULL OR p_input_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
  THEN
    RAISE EXCEPTION 'Rolling-week replacement metadata is invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_sessions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Rolling-week sessions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_sessions) NOT BETWEEN 1 AND 14 THEN
    RAISE EXCEPTION 'Rolling-week sessions must contain 1 to 14 sessions'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_sessions) AS session
      WHERE jsonb_typeof(session) <> 'object'
        OR NOT (session ? 'week_number')
        OR NOT (session ? 'session_index')
        OR NOT (session ? 'scheduled_date')
        OR NOT (session ? 'prescription')
        OR (session->>'week_number')::INTEGER <> 1
        OR (session->>'session_index')::INTEGER <= 0
        OR (session->>'scheduled_date')::DATE NOT BETWEEN p_window_start AND p_window_start + 6
        OR jsonb_typeof(session->'prescription') IS DISTINCT FROM 'object'
    )
  THEN
    RAISE EXCEPTION 'Rolling-week sessions must contain 1 to 14 valid sessions in the weekly window'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':rolling-week-proposal:' || btrim(p_idempotency_key), 0)
  );

  SELECT * INTO v_existing
  FROM public.adaptation_proposals
  WHERE user_id = v_user_id AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.program_id IS DISTINCT FROM p_program_id
      OR v_existing.base_plan_version_id IS DISTINCT FROM p_base_plan_version_id
      OR v_existing.weekly_review_id IS DISTINCT FROM p_weekly_review_id
      OR v_existing.rationale->>'input_fingerprint' IS DISTINCT FROM p_input_fingerprint
    THEN
      RAISE EXCEPTION 'Training proposal idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.program_id, v_existing.proposed_plan_version_id;
    RETURN;
  END IF;

  SELECT * INTO v_program
  FROM public.training_programs
  WHERE id = p_program_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_program.status <> 'active'
    OR v_program.active_plan_version_id IS DISTINCT FROM p_base_plan_version_id THEN
    RAISE EXCEPTION 'Proposal is stale because the active plan changed'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_base_plan
  FROM public.training_plan_versions
  WHERE id = p_base_plan_version_id
    AND program_id = p_program_id
    AND user_id = v_user_id
    AND status = 'accepted'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted base plan was not found' USING ERRCODE = '40001';
  END IF;

  IF v_base_plan.plan_mode = 'rolling_weekly' THEN
    IF p_weekly_review_id IS NULL OR p_window_start IS DISTINCT FROM v_base_plan.window_end + 1 THEN
      RAISE EXCEPTION 'The next rolling week needs its completed review and adjacent Monday window'
        USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_review
    FROM public.coach_weekly_reviews
    WHERE id = p_weekly_review_id
      AND program_id = p_program_id
      AND user_id = v_user_id
      AND base_plan_version_id = p_base_plan_version_id;
    IF NOT FOUND OR v_review.action = 'pause_review' THEN
      RAISE EXCEPTION 'A valid weekly review is required before proposing the next week'
        USING ERRCODE = '55000';
    END IF;
  ELSIF v_base_plan.plan_mode = 'legacy_eight_week' THEN
    IF p_weekly_review_id IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy conversion does not attach a rolling-week review'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported base plan mode' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.training_plan_versions WHERE program_id = p_program_id;
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence_number
  FROM public.training_plan_versions
  WHERE program_id = p_program_id AND plan_mode = 'rolling_weekly';

  INSERT INTO public.training_plan_versions (
    id, program_id, user_id, version, reference_version, policy_version,
    intent, input_snapshot, plan_mode, window_start, window_end, sequence_number
  ) VALUES (
    v_plan_version_id, p_program_id, v_user_id, v_next_version,
    btrim(p_reference_version), btrim(p_policy_version),
    p_intent, p_input_snapshot, 'rolling_weekly',
    p_window_start, p_window_start + 6, v_sequence_number
  );

  INSERT INTO public.prescribed_sessions (
    plan_version_id, program_id, user_id, week_number,
    session_index, scheduled_date, prescription
  )
  SELECT
    v_plan_version_id, p_program_id, v_user_id, 1,
    (session->>'session_index')::INTEGER,
    (session->>'scheduled_date')::DATE,
    session->'prescription'
  FROM jsonb_array_elements(p_sessions) AS session;

  INSERT INTO public.adaptation_proposals (
    id, user_id, program_id, base_plan_version_id, proposed_plan_version_id,
    weekly_review_id, idempotency_key, rationale
  ) VALUES (
    v_proposal_id, v_user_id, p_program_id, p_base_plan_version_id, v_plan_version_id,
    p_weekly_review_id, btrim(p_idempotency_key),
    p_rationale || jsonb_build_object(
      'input_fingerprint', p_input_fingerprint,
      'proposal_mode', 'rolling_weekly',
      'program_metadata', jsonb_build_object(
        'title', btrim(p_title),
        'goal_summary', btrim(p_goal_summary),
        'goal_target_date', p_goal_target_date,
        'direction', p_direction
      )
    )
  );

  RETURN QUERY SELECT v_proposal_id, p_program_id, v_plan_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_adaptation_proposal(
  p_proposal_id UUID,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  accepted_program_id UUID,
  active_plan_version_id UUID,
  proposal_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_proposal public.adaptation_proposals%ROWTYPE;
  v_program public.training_programs%ROWTYPE;
  v_target public.training_plan_versions%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_proposed_start_date DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_proposal
  FROM public.adaptation_proposals
  WHERE id = p_proposal_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adaptation proposal not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_proposal.idempotency_key <> p_idempotency_key THEN
    RAISE EXCEPTION 'Idempotency key does not match proposal' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_program
  FROM public.training_programs
  WHERE id = v_proposal.program_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training program not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_proposal.status = 'accepted' THEN
    IF v_program.active_plan_version_id IS DISTINCT FROM v_proposal.proposed_plan_version_id THEN
      RAISE EXCEPTION 'Accepted proposal no longer matches active plan' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT v_program.id, v_program.active_plan_version_id, v_proposal.status;
    RETURN;
  END IF;
  IF v_proposal.status <> 'proposed' THEN
    RAISE EXCEPTION 'Only proposed adaptations can be accepted' USING ERRCODE = '55000';
  END IF;
  IF v_proposal.base_plan_version_id IS DISTINCT FROM v_program.active_plan_version_id THEN
    RAISE EXCEPTION 'Proposal is stale because the active plan changed' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_target
  FROM public.training_plan_versions
  WHERE id = v_proposal.proposed_plan_version_id
    AND program_id = v_program.id
    AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'proposed' THEN
    RAISE EXCEPTION 'Proposed plan version is unavailable' USING ERRCODE = '55000';
  END IF;

  IF v_target.plan_mode = 'legacy_eight_week' AND v_program.program_mode <> 'legacy_eight_week' THEN
    RAISE EXCEPTION 'A rolling program cannot reactivate a legacy eight-week plan'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.training_plan_versions
  SET status = 'superseded'
  WHERE id = v_program.active_plan_version_id AND status = 'accepted';

  UPDATE public.training_plan_versions
  SET status = 'accepted', accepted_at = v_now
  WHERE id = v_target.id;

  IF v_target.plan_mode = 'rolling_weekly' THEN
    UPDATE public.training_programs
    SET active_plan_version_id = v_target.id,
        status = 'active',
        program_mode = 'rolling_weekly',
        start_date = v_target.window_start,
        end_date = v_target.window_end,
        title = COALESCE(
          NULLIF(btrim(v_proposal.rationale #>> '{program_metadata,title}'), ''), title
        ),
        goal_summary = COALESCE(
          NULLIF(btrim(v_proposal.rationale #>> '{program_metadata,goal_summary}'), ''), goal_summary
        ),
        goal_target_date = CASE
          WHEN (v_proposal.rationale->'program_metadata') ? 'goal_target_date'
            THEN NULLIF(v_proposal.rationale #>> '{program_metadata,goal_target_date}', '')::DATE
          ELSE goal_target_date
        END,
        direction = CASE
          WHEN jsonb_typeof(v_proposal.rationale #> '{program_metadata,direction}') = 'object'
            THEN v_proposal.rationale #> '{program_metadata,direction}'
          ELSE direction
        END,
        updated_at = v_now
    WHERE id = v_program.id;
  ELSE
    v_proposed_start_date := NULLIF(
      v_proposal.rationale #>> '{program_metadata,start_date}', ''
    )::DATE;
    UPDATE public.training_programs
    SET active_plan_version_id = v_target.id,
        status = 'active',
        title = COALESCE(
          NULLIF(btrim(v_proposal.rationale #>> '{program_metadata,title}'), ''), title
        ),
        goal_summary = COALESCE(
          NULLIF(btrim(v_proposal.rationale #>> '{program_metadata,goal_summary}'), ''), goal_summary
        ),
        start_date = COALESCE(v_proposed_start_date, start_date),
        end_date = COALESCE(v_proposed_start_date + 55, end_date),
        updated_at = v_now
    WHERE id = v_program.id;
  END IF;

  UPDATE public.adaptation_proposals
  SET status = 'accepted', decided_at = v_now
  WHERE id = v_proposal.id;

  RETURN QUERY SELECT v_program.id, v_target.id, 'accepted'::TEXT;
END;
$$;

ALTER TABLE public.coach_weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_weekly_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coach_weekly_review_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_weekly_review_observations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_weekly_reviews_select_own ON public.coach_weekly_reviews;
CREATE POLICY coach_weekly_reviews_select_own
  ON public.coach_weekly_reviews FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS coach_weekly_review_observations_select_own
  ON public.coach_weekly_review_observations;
CREATE POLICY coach_weekly_review_observations_select_own
  ON public.coach_weekly_review_observations FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT ON TABLE public.training_programs FROM authenticated;
REVOKE INSERT ON TABLE public.training_plan_versions FROM authenticated;
REVOKE INSERT ON TABLE public.adaptation_proposals FROM authenticated;

REVOKE ALL ON TABLE public.coach_weekly_reviews FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.coach_weekly_review_observations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.coach_weekly_reviews TO authenticated;
GRANT SELECT ON TABLE public.coach_weekly_review_observations TO authenticated;
GRANT ALL ON TABLE public.coach_weekly_reviews TO service_role;
GRANT ALL ON TABLE public.coach_weekly_review_observations TO service_role;

REVOKE ALL ON FUNCTION public.record_coach_weekly_review(
  UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC,
  JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB,
  TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_coach_weekly_review(
  UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC,
  JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB,
  TEXT, TEXT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_initial_rolling_weekly_proposal(
  TEXT, TEXT, DATE, DATE, JSONB, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_initial_rolling_weekly_proposal(
  TEXT, TEXT, DATE, DATE, JSONB, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_rolling_weekly_replacement_proposal(
  UUID, UUID, UUID, TEXT, TEXT, DATE, DATE, JSONB, TEXT, TEXT,
  JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_rolling_weekly_replacement_proposal(
  UUID, UUID, UUID, TEXT, TEXT, DATE, DATE, JSONB, TEXT, TEXT,
  JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_adaptation_proposal(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_adaptation_proposal(UUID, TEXT) TO authenticated;

COMMENT ON COLUMN public.training_programs.program_mode IS
  'Compatibility mode: immutable legacy eight-week payloads or rolling one-week prescriptions';
COMMENT ON COLUMN public.training_programs.goal_target_date IS
  'Optional athlete goal horizon, separate from the active prescription window';
COMMENT ON COLUMN public.training_programs.direction IS
  'Athlete-confirmed durable qualities, emphasis, hypothesis, and constraints';
COMMENT ON TABLE public.coach_weekly_reviews IS
  'Immutable deterministic weekly decisions, including continuation and insufficient-evidence outcomes';
COMMENT ON TABLE public.coach_weekly_review_observations IS
  'Tenant-safe included and excluded evidence links for a weekly review';
COMMENT ON FUNCTION public.record_coach_weekly_review(
  UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC,
  JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB,
  TEXT, TEXT, TEXT, TEXT
) IS 'Atomically stores one immutable, evidence-linked review for the currently accepted rolling week';
COMMENT ON FUNCTION public.create_initial_rolling_weekly_proposal(
  TEXT, TEXT, DATE, DATE, JSONB, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) IS 'Atomically stores one initial Monday-through-Sunday proposal without hidden future weeks';
COMMENT ON FUNCTION public.create_rolling_weekly_replacement_proposal(
  UUID, UUID, UUID, TEXT, TEXT, DATE, DATE, JSONB, TEXT, TEXT,
  JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) IS 'Atomically stores the next rolling-week proposal from a completed review or explicit legacy conversion';

COMMIT;
