-- Adaptive coach brain and memory foundation.
--
-- Global doctrine and numeric policy remain version-controlled application
-- assets. These tables contain only user-owned assessments, confirmed memory,
-- immutable plan versions, prescribed sessions, proposals, and check-ins.
-- Apply twice before running verify-coach-system-migration.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.coach_strength_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL
    CONSTRAINT coach_strength_assessments_idempotency_present
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  input_fingerprint TEXT NOT NULL
    CONSTRAINT coach_strength_assessments_fingerprint_check
    CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  movement TEXT NOT NULL CONSTRAINT coach_strength_assessments_movement_present
    CHECK (length(btrim(movement)) BETWEEN 1 AND 120),
  variation TEXT,
  load NUMERIC(10, 2) NOT NULL
    CONSTRAINT coach_strength_assessments_load_positive CHECK (load > 0),
  unit TEXT NOT NULL
    CONSTRAINT coach_strength_assessments_unit_check CHECK (unit IN ('lb', 'kg')),
  reps INTEGER NOT NULL
    CONSTRAINT coach_strength_assessments_reps_check CHECK (reps IN (1, 3, 5)),
  assessed_on DATE NOT NULL,
  is_true_rep_max BOOLEAN NOT NULL DEFAULT false,
  rir NUMERIC(3, 1)
    CONSTRAINT coach_strength_assessments_rir_check CHECK (rir BETWEEN 0 AND 10),
  rpe NUMERIC(3, 1)
    CONSTRAINT coach_strength_assessments_rpe_check CHECK (rpe BETWEEN 1 AND 10),
  athlete_confidence NUMERIC(4, 3) NOT NULL
    CONSTRAINT coach_strength_assessments_confidence_check
    CHECK (athlete_confidence BETWEEN 0 AND 1),
  estimated_1rm NUMERIC(10, 2) NOT NULL
    CONSTRAINT coach_strength_assessments_e1rm_positive CHECK (estimated_1rm > 0),
  estimate_kind TEXT NOT NULL
    CONSTRAINT coach_strength_assessments_estimate_kind_check
    CHECK (estimate_kind IN ('reported_1rm', 'estimated_1rm')),
  calculator_version TEXT NOT NULL
    CONSTRAINT coach_strength_assessments_calculator_present
    CHECK (length(btrim(calculator_version)) > 0),
  provenance JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT coach_strength_assessments_provenance_object
    CHECK (jsonb_typeof(provenance) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coach_strength_assessments_kind_matches_reps CHECK (
    (reps = 1 AND estimate_kind = 'reported_1rm')
    OR (reps IN (3, 5) AND estimate_kind = 'estimated_1rm')
  ),
  CONSTRAINT coach_strength_assessments_epley_v1_matches CHECK (
    calculator_version <> 'epley-general-v1'
    OR abs(
      estimated_1rm - round(
        CASE
          WHEN reps = 1 THEN load
          ELSE load * (1 + reps::NUMERIC / 30)
        END,
        1
      )
    ) <= 0.05
  )
);

CREATE TABLE IF NOT EXISTS public.coach_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL
    CONSTRAINT coach_memories_idempotency_present
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  memory_key TEXT NOT NULL
    CONSTRAINT coach_memories_key_present CHECK (length(btrim(memory_key)) BETWEEN 1 AND 120),
  kind TEXT NOT NULL
    CONSTRAINT coach_memories_kind_check CHECK (
      kind IN ('goal', 'schedule', 'equipment', 'preference', 'constraint', 'limitation', 'baseline')
    ),
  version INTEGER NOT NULL DEFAULT 1
    CONSTRAINT coach_memories_version_positive CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CONSTRAINT coach_memories_status_check CHECK (status IN ('confirmed', 'superseded', 'withdrawn')),
  content JSONB NOT NULL
    CONSTRAINT coach_memories_content_object CHECK (jsonb_typeof(content) = 'object'),
  provenance JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT coach_memories_provenance_object CHECK (jsonb_typeof(provenance) = 'object'),
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 1
    CONSTRAINT coach_memories_confidence_check CHECK (confidence BETWEEN 0 AND 1),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supersedes_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, memory_key, version),
  UNIQUE (id, user_id),
  CONSTRAINT coach_memories_supersedes_owner_fk
    FOREIGN KEY (supersedes_id, user_id)
    REFERENCES public.coach_memories(id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_memories_one_confirmed
  ON public.coach_memories(user_id, memory_key)
  WHERE status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_memories_idempotency
  ON public.coach_memories(user_id, idempotency_key);

CREATE TABLE IF NOT EXISTS public.training_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL
    CONSTRAINT training_programs_title_present CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  goal_summary TEXT NOT NULL
    CONSTRAINT training_programs_goal_present CHECK (length(btrim(goal_summary)) BETWEEN 1 AND 1000),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CONSTRAINT training_programs_status_check
    CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  active_plan_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT training_programs_eight_week_dates CHECK (end_date = start_date + 55),
  CONSTRAINT training_programs_active_pointer CHECK (
    status <> 'active' OR active_plan_version_id IS NOT NULL
  ),
  UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS public.training_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL,
  user_id UUID NOT NULL,
  version INTEGER NOT NULL
    CONSTRAINT training_plan_versions_version_positive CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'proposed'
    CONSTRAINT training_plan_versions_status_check
    CHECK (status IN ('proposed', 'accepted', 'superseded', 'rejected')),
  reference_version TEXT NOT NULL
    CONSTRAINT training_plan_versions_reference_present CHECK (length(btrim(reference_version)) > 0),
  policy_version TEXT NOT NULL
    CONSTRAINT training_plan_versions_policy_present CHECK (length(btrim(policy_version)) > 0),
  intent JSONB NOT NULL
    CONSTRAINT training_plan_versions_intent_object CHECK (jsonb_typeof(intent) = 'object'),
  input_snapshot JSONB NOT NULL
    CONSTRAINT training_plan_versions_snapshot_object CHECK (jsonb_typeof(input_snapshot) = 'object'),
  created_by TEXT NOT NULL DEFAULT 'planning_kernel'
    CONSTRAINT training_plan_versions_created_by_check
    CHECK (created_by IN ('planning_kernel', 'manual_import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  CONSTRAINT training_plan_versions_eight_week_horizon
    CHECK (intent->>'horizon_weeks' = '8'),
  CONSTRAINT training_plan_versions_acceptance_time CHECK (
    (status IN ('accepted', 'superseded') AND accepted_at IS NOT NULL)
    OR (status IN ('proposed', 'rejected') AND accepted_at IS NULL)
  ),
  CONSTRAINT training_plan_versions_program_owner_fk
    FOREIGN KEY (program_id, user_id)
    REFERENCES public.training_programs(id, user_id)
    ON DELETE CASCADE,
  UNIQUE (program_id, version),
  UNIQUE (id, user_id),
  UNIQUE (id, program_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_plan_versions_one_accepted
  ON public.training_plan_versions(program_id)
  WHERE status = 'accepted';

DO $add_active_plan_version_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'training_programs_active_plan_version_fk'
      AND conrelid = 'public.training_programs'::regclass
  ) THEN
    ALTER TABLE public.training_programs
      ADD CONSTRAINT training_programs_active_plan_version_fk
      FOREIGN KEY (active_plan_version_id, id, user_id)
      REFERENCES public.training_plan_versions(id, program_id, user_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$add_active_plan_version_fk$;

CREATE TABLE IF NOT EXISTS public.prescribed_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id UUID NOT NULL,
  program_id UUID NOT NULL,
  user_id UUID NOT NULL,
  week_number INTEGER NOT NULL
    CONSTRAINT prescribed_sessions_week_check CHECK (week_number BETWEEN 1 AND 8),
  session_index INTEGER NOT NULL
    CONSTRAINT prescribed_sessions_index_positive CHECK (session_index > 0),
  scheduled_date DATE,
  prescription JSONB NOT NULL
    CONSTRAINT prescribed_sessions_prescription_object CHECK (jsonb_typeof(prescription) = 'object'),
  status TEXT NOT NULL DEFAULT 'planned'
    CONSTRAINT prescribed_sessions_status_check
    CHECK (status IN ('planned', 'completed', 'skipped')),
  completed_workout_id UUID,
  execution_note TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prescribed_sessions_contract_check CHECK (
    prescription ? 'domain'
    AND prescription ? 'intent'
    AND prescription ? 'dose'
    AND prescription ? 'effort'
    AND prescription ? 'rest'
    AND prescription ? 'success_condition'
    AND prescription ? 'stop_condition'
    AND prescription ? 'scale_options'
    AND prescription ? 'evidence'
  ),
  CONSTRAINT prescribed_sessions_completion_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT prescribed_sessions_plan_owner_fk
    FOREIGN KEY (plan_version_id, program_id, user_id)
    REFERENCES public.training_plan_versions(id, program_id, user_id)
    ON DELETE CASCADE,
  UNIQUE (plan_version_id, week_number, session_index),
  UNIQUE (id, user_id),
  UNIQUE (id, plan_version_id, program_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.adaptation_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  program_id UUID NOT NULL,
  base_plan_version_id UUID,
  proposed_plan_version_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL
    CONSTRAINT adaptation_proposals_idempotency_present
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  status TEXT NOT NULL DEFAULT 'proposed'
    CONSTRAINT adaptation_proposals_status_check
    CHECK (status IN ('proposed', 'accepted', 'rejected', 'expired')),
  rationale JSONB NOT NULL
    CONSTRAINT adaptation_proposals_rationale_object CHECK (jsonb_typeof(rationale) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT adaptation_proposals_decision_time CHECK (
    (status = 'proposed' AND decided_at IS NULL)
    OR (status <> 'proposed' AND decided_at IS NOT NULL)
  ),
  CONSTRAINT adaptation_proposals_versions_distinct
    CHECK (base_plan_version_id IS NULL OR base_plan_version_id <> proposed_plan_version_id),
  CONSTRAINT adaptation_proposals_program_owner_fk
    FOREIGN KEY (program_id, user_id)
    REFERENCES public.training_programs(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT adaptation_proposals_base_version_fk
    FOREIGN KEY (base_plan_version_id, program_id, user_id)
    REFERENCES public.training_plan_versions(id, program_id, user_id),
  CONSTRAINT adaptation_proposals_proposed_version_fk
    FOREIGN KEY (proposed_plan_version_id, program_id, user_id)
    REFERENCES public.training_plan_versions(id, program_id, user_id),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.coach_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID,
  plan_version_id UUID,
  prescribed_session_id UUID,
  checkin_type TEXT NOT NULL
    CONSTRAINT coach_checkins_type_check
    CHECK (checkin_type IN ('assessment', 'session', 'weekly', 'deload')),
  responses JSONB NOT NULL
    CONSTRAINT coach_checkins_responses_object CHECK (jsonb_typeof(responses) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coach_checkins_parent_chain_check CHECK (
    (plan_version_id IS NULL OR program_id IS NOT NULL)
    AND (
      prescribed_session_id IS NULL
      OR (plan_version_id IS NOT NULL AND program_id IS NOT NULL)
    )
  ),
  CONSTRAINT coach_checkins_program_owner_fk
    FOREIGN KEY (program_id, user_id)
    REFERENCES public.training_programs(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT coach_checkins_plan_owner_fk
    FOREIGN KEY (plan_version_id, program_id, user_id)
    REFERENCES public.training_plan_versions(id, program_id, user_id),
  CONSTRAINT coach_checkins_session_owner_fk
    FOREIGN KEY (prescribed_session_id, plan_version_id, program_id, user_id)
    REFERENCES public.prescribed_sessions(id, plan_version_id, program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_strength_assessments_user_movement
  ON public.coach_strength_assessments(user_id, movement, assessed_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_strength_assessments_idempotency
  ON public.coach_strength_assessments(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_coach_memories_user_status
  ON public.coach_memories(user_id, status, kind);
CREATE INDEX IF NOT EXISTS idx_coach_memories_supersedes_owner
  ON public.coach_memories(supersedes_id, user_id)
  WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_programs_user_status
  ON public.training_programs(user_id, status, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_training_programs_active_plan_owner
  ON public.training_programs(active_plan_version_id, id, user_id)
  WHERE active_plan_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_plan_versions_program_owner_version
  ON public.training_plan_versions(program_id, user_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_prescribed_sessions_user_schedule
  ON public.prescribed_sessions(user_id, status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_prescribed_sessions_plan_owner
  ON public.prescribed_sessions(plan_version_id, program_id, user_id);
CREATE INDEX IF NOT EXISTS idx_adaptation_proposals_user_status
  ON public.adaptation_proposals(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adaptation_proposals_program_owner
  ON public.adaptation_proposals(program_id, user_id);
CREATE INDEX IF NOT EXISTS idx_adaptation_proposals_base_version_owner
  ON public.adaptation_proposals(base_plan_version_id, program_id, user_id)
  WHERE base_plan_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_adaptation_proposals_proposed_version_owner
  ON public.adaptation_proposals(proposed_plan_version_id, program_id, user_id);
CREATE INDEX IF NOT EXISTS idx_coach_checkins_user_time
  ON public.coach_checkins(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_checkins_program_owner
  ON public.coach_checkins(program_id, user_id)
  WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_checkins_plan_owner
  ON public.coach_checkins(plan_version_id, program_id, user_id)
  WHERE plan_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_checkins_session_owner
  ON public.coach_checkins(prescribed_session_id, plan_version_id, program_id, user_id)
  WHERE prescribed_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_coach_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

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
  ) THEN
    RAISE EXCEPTION 'Accepted training plan content is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_prescribed_session_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan_status TEXT;
BEGIN
  SELECT status
  INTO v_plan_status
  FROM public.training_plan_versions
  WHERE id = OLD.plan_version_id;

  IF v_plan_status IN ('accepted', 'superseded') AND (
    NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id
    OR NEW.program_id IS DISTINCT FROM OLD.program_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.week_number IS DISTINCT FROM OLD.week_number
    OR NEW.session_index IS DISTINCT FROM OLD.session_index
    OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
    OR NEW.prescription IS DISTINCT FROM OLD.prescription
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Accepted prescribed session content is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_coach_strength_assessments_updated_at
  ON public.coach_strength_assessments;
CREATE TRIGGER set_coach_strength_assessments_updated_at
  BEFORE UPDATE ON public.coach_strength_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_coach_updated_at();

DROP TRIGGER IF EXISTS set_coach_memories_updated_at ON public.coach_memories;
CREATE TRIGGER set_coach_memories_updated_at
  BEFORE UPDATE ON public.coach_memories
  FOR EACH ROW EXECUTE FUNCTION public.set_coach_updated_at();

DROP TRIGGER IF EXISTS set_training_programs_updated_at ON public.training_programs;
CREATE TRIGGER set_training_programs_updated_at
  BEFORE UPDATE ON public.training_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_coach_updated_at();

DROP TRIGGER IF EXISTS protect_training_plan_version_content_trigger
  ON public.training_plan_versions;
CREATE TRIGGER protect_training_plan_version_content_trigger
  BEFORE UPDATE ON public.training_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_training_plan_version_content();

DROP TRIGGER IF EXISTS set_prescribed_sessions_updated_at ON public.prescribed_sessions;
CREATE TRIGGER set_prescribed_sessions_updated_at
  BEFORE UPDATE ON public.prescribed_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_coach_updated_at();

DROP TRIGGER IF EXISTS protect_prescribed_session_content_trigger
  ON public.prescribed_sessions;
CREATE TRIGGER protect_prescribed_session_content_trigger
  BEFORE UPDATE ON public.prescribed_sessions
  FOR EACH ROW EXECUTE FUNCTION public.protect_prescribed_session_content();

CREATE OR REPLACE FUNCTION public.confirm_coach_memory(
  p_memory_key TEXT,
  p_kind TEXT,
  p_content JSONB,
  p_provenance JSONB,
  p_confidence NUMERIC,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  memory_id UUID,
  memory_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing public.coach_memories%ROWTYPE;
  v_previous public.coach_memories%ROWTYPE;
  v_new_id UUID;
  v_next_version INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_memory_key IS NULL OR length(btrim(p_memory_key)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'A valid memory key is required' USING ERRCODE = '22023';
  END IF;

  IF p_kind NOT IN ('goal', 'schedule', 'equipment', 'preference', 'constraint', 'limitation', 'baseline') THEN
    RAISE EXCEPTION 'Invalid coach memory kind' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN
    RAISE EXCEPTION 'Coach memory content must be an object' USING ERRCODE = '22023';
  END IF;

  IF p_provenance IS NULL OR jsonb_typeof(p_provenance) <> 'object' THEN
    RAISE EXCEPTION 'Coach memory provenance must be an object' USING ERRCODE = '22023';
  END IF;

  IF p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 1 THEN
    RAISE EXCEPTION 'Coach memory confidence must be between zero and one' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = '22023';
  END IF;

  -- Serializes both the replacement and no-current-row cases for one memory key.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::TEXT || ':' || btrim(p_memory_key), 0)
  );

  SELECT *
  INTO v_existing
  FROM public.coach_memories
  WHERE user_id = v_user_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.memory_key IS DISTINCT FROM btrim(p_memory_key)
      OR v_existing.kind IS DISTINCT FROM p_kind
      OR v_existing.content IS DISTINCT FROM p_content
      OR v_existing.confidence IS DISTINCT FROM p_confidence
    THEN
      RAISE EXCEPTION 'Coach memory idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY SELECT v_existing.id, v_existing.version;
    RETURN;
  END IF;

  SELECT *
  INTO v_previous
  FROM public.coach_memories
  WHERE user_id = v_user_id
    AND memory_key = btrim(p_memory_key)
    AND status = 'confirmed'
  FOR UPDATE;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_next_version
  FROM public.coach_memories
  WHERE user_id = v_user_id
    AND memory_key = btrim(p_memory_key);

  IF v_previous.id IS NOT NULL THEN
    UPDATE public.coach_memories
    SET status = 'superseded'
    WHERE id = v_previous.id;
  END IF;

  INSERT INTO public.coach_memories (
    user_id,
    idempotency_key,
    memory_key,
    kind,
    version,
    status,
    content,
    provenance,
    confidence,
    supersedes_id
  )
  VALUES (
    v_user_id,
    p_idempotency_key,
    btrim(p_memory_key),
    p_kind,
    v_next_version,
    'confirmed',
    p_content,
    p_provenance,
    p_confidence,
    v_previous.id
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, v_next_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_initial_training_plan_proposal(
  p_title TEXT,
  p_goal_summary TEXT,
  p_start_date DATE,
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
  v_week_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'A valid program title is required' USING ERRCODE = '22023';
  END IF;

  IF p_goal_summary IS NULL OR length(btrim(p_goal_summary)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'A valid goal summary is required' USING ERRCODE = '22023';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'A program start date is required' USING ERRCODE = '22023';
  END IF;

  IF p_reference_version IS NULL OR length(btrim(p_reference_version)) = 0
    OR p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0
  THEN
    RAISE EXCEPTION 'Reference and policy versions are required' USING ERRCODE = '22023';
  END IF;

  IF p_intent IS NULL OR jsonb_typeof(p_intent) <> 'object'
    OR p_intent->>'horizon_weeks' <> '8'
  THEN
    RAISE EXCEPTION 'Plan intent must describe an eight-week object' USING ERRCODE = '22023';
  END IF;

  IF p_input_snapshot IS NULL OR jsonb_typeof(p_input_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Plan input snapshot must be an object' USING ERRCODE = '22023';
  END IF;

  IF p_sessions IS NULL OR jsonb_typeof(p_sessions) <> 'array'
    OR jsonb_array_length(p_sessions) NOT BETWEEN 16 AND 48
  THEN
    RAISE EXCEPTION 'Plan sessions must be an array containing 16 to 48 sessions'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_sessions) AS session
    WHERE jsonb_typeof(session) <> 'object'
      OR NOT (session ? 'week_number')
      OR NOT (session ? 'session_index')
      OR NOT (session ? 'scheduled_date')
      OR jsonb_typeof(session->'prescription') <> 'object'
  ) THEN
    RAISE EXCEPTION 'Every plan session must contain its schedule and prescription'
      USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(DISTINCT (session->>'week_number')::INTEGER)
  INTO v_week_count
  FROM jsonb_array_elements(p_sessions) AS session;

  IF v_week_count <> 8 THEN
    RAISE EXCEPTION 'Plan sessions must cover all eight weeks' USING ERRCODE = '22023';
  END IF;

  IF p_rationale IS NULL OR jsonb_typeof(p_rationale) <> 'object' THEN
    RAISE EXCEPTION 'Proposal rationale must be an object' USING ERRCODE = '22023';
  END IF;

  IF p_input_fingerprint IS NULL OR p_input_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'A valid proposal input fingerprint is required' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::TEXT || ':initial-plan:' || btrim(p_idempotency_key), 0)
  );

  SELECT *
  INTO v_existing
  FROM public.adaptation_proposals
  WHERE user_id = v_user_id
    AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.rationale->>'input_fingerprint' IS DISTINCT FROM p_input_fingerprint THEN
      RAISE EXCEPTION 'Training proposal idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY SELECT
      v_existing.id,
      v_existing.program_id,
      v_existing.proposed_plan_version_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.training_programs
    WHERE user_id = v_user_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active program already exists; propose an adaptation instead'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.training_programs (
    id,
    user_id,
    title,
    goal_summary,
    start_date,
    end_date
  )
  VALUES (
    v_program_id,
    v_user_id,
    btrim(p_title),
    btrim(p_goal_summary),
    p_start_date,
    p_start_date + 55
  );

  INSERT INTO public.training_plan_versions (
    id,
    program_id,
    user_id,
    version,
    reference_version,
    policy_version,
    intent,
    input_snapshot
  )
  VALUES (
    v_plan_version_id,
    v_program_id,
    v_user_id,
    1,
    btrim(p_reference_version),
    btrim(p_policy_version),
    p_intent,
    p_input_snapshot
  );

  INSERT INTO public.prescribed_sessions (
    plan_version_id,
    program_id,
    user_id,
    week_number,
    session_index,
    scheduled_date,
    prescription
  )
  SELECT
    v_plan_version_id,
    v_program_id,
    v_user_id,
    (session->>'week_number')::INTEGER,
    (session->>'session_index')::INTEGER,
    (session->>'scheduled_date')::DATE,
    session->'prescription'
  FROM jsonb_array_elements(p_sessions) AS session;

  INSERT INTO public.adaptation_proposals (
    id,
    user_id,
    program_id,
    proposed_plan_version_id,
    idempotency_key,
    rationale
  )
  VALUES (
    v_proposal_id,
    v_user_id,
    v_program_id,
    v_plan_version_id,
    btrim(p_idempotency_key),
    p_rationale || jsonb_build_object('input_fingerprint', p_input_fingerprint)
  );

  RETURN QUERY SELECT v_proposal_id, v_program_id, v_plan_version_id;
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_proposal
  FROM public.adaptation_proposals
  WHERE id = p_proposal_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adaptation proposal not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_proposal.idempotency_key <> p_idempotency_key THEN
    RAISE EXCEPTION 'Idempotency key does not match proposal' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_program
  FROM public.training_programs
  WHERE id = v_proposal.program_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training program not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_proposal.status = 'accepted' THEN
    IF v_program.active_plan_version_id IS DISTINCT FROM v_proposal.proposed_plan_version_id THEN
      RAISE EXCEPTION 'Accepted proposal no longer matches active plan'
        USING ERRCODE = '40001';
    END IF;

    RETURN QUERY SELECT v_program.id, v_program.active_plan_version_id, v_proposal.status;
    RETURN;
  END IF;

  IF v_proposal.status <> 'proposed' THEN
    RAISE EXCEPTION 'Only proposed adaptations can be accepted' USING ERRCODE = '55000';
  END IF;

  IF v_proposal.base_plan_version_id IS DISTINCT FROM v_program.active_plan_version_id THEN
    RAISE EXCEPTION 'Proposal is stale because the active plan changed'
      USING ERRCODE = '40001';
  END IF;

  SELECT *
  INTO v_target
  FROM public.training_plan_versions
  WHERE id = v_proposal.proposed_plan_version_id
    AND program_id = v_program.id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.status <> 'proposed' THEN
    RAISE EXCEPTION 'Proposed plan version is unavailable' USING ERRCODE = '55000';
  END IF;

  UPDATE public.training_plan_versions
  SET status = 'superseded'
  WHERE id = v_program.active_plan_version_id
    AND status = 'accepted';

  UPDATE public.training_plan_versions
  SET status = 'accepted',
      accepted_at = v_now
  WHERE id = v_target.id;

  UPDATE public.training_programs
  SET active_plan_version_id = v_target.id,
      status = 'active',
      updated_at = v_now
  WHERE id = v_program.id;

  UPDATE public.adaptation_proposals
  SET status = 'accepted',
      decided_at = v_now
  WHERE id = v_proposal.id;

  RETURN QUERY SELECT v_program.id, v_target.id, 'accepted'::TEXT;
END;
$$;

ALTER TABLE public.coach_strength_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_strength_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coach_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_memories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_programs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.training_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plan_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.prescribed_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescribed_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coach_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_checkins FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own strength assessments"
  ON public.coach_strength_assessments;
CREATE POLICY "Users manage their own strength assessments"
  ON public.coach_strength_assessments FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users view their own coach memories" ON public.coach_memories;
CREATE POLICY "Users view their own coach memories"
  ON public.coach_memories FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users view their own training programs" ON public.training_programs;
CREATE POLICY "Users view their own training programs"
  ON public.training_programs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users create their own training programs" ON public.training_programs;
CREATE POLICY "Users create their own training programs"
  ON public.training_programs FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users view their own plan versions" ON public.training_plan_versions;
CREATE POLICY "Users view their own plan versions"
  ON public.training_plan_versions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users create their own plan versions" ON public.training_plan_versions;
CREATE POLICY "Users create their own plan versions"
  ON public.training_plan_versions FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage their own prescribed sessions" ON public.prescribed_sessions;
CREATE POLICY "Users manage their own prescribed sessions"
  ON public.prescribed_sessions FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users view their own adaptation proposals" ON public.adaptation_proposals;
CREATE POLICY "Users view their own adaptation proposals"
  ON public.adaptation_proposals FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users create their own adaptation proposals" ON public.adaptation_proposals;
CREATE POLICY "Users create their own adaptation proposals"
  ON public.adaptation_proposals FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users record their own coach checkins" ON public.coach_checkins;
CREATE POLICY "Users record their own coach checkins"
  ON public.coach_checkins FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users create their own coach checkins" ON public.coach_checkins;
CREATE POLICY "Users create their own coach checkins"
  ON public.coach_checkins FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.coach_strength_assessments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.coach_memories FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.training_programs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.training_plan_versions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.prescribed_sessions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.adaptation_proposals FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.coach_checkins FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_strength_assessments TO authenticated;
GRANT SELECT ON TABLE public.coach_memories TO authenticated;
GRANT SELECT, INSERT ON TABLE public.training_programs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.training_plan_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.prescribed_sessions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.adaptation_proposals TO authenticated;
GRANT SELECT, INSERT ON TABLE public.coach_checkins TO authenticated;

GRANT ALL ON TABLE public.coach_strength_assessments TO service_role;
GRANT ALL ON TABLE public.coach_memories TO service_role;
GRANT ALL ON TABLE public.training_programs TO service_role;
GRANT ALL ON TABLE public.training_plan_versions TO service_role;
GRANT ALL ON TABLE public.prescribed_sessions TO service_role;
GRANT ALL ON TABLE public.adaptation_proposals TO service_role;
GRANT ALL ON TABLE public.coach_checkins TO service_role;

REVOKE ALL ON FUNCTION public.create_initial_training_plan_proposal(
  TEXT, TEXT, DATE, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_initial_training_plan_proposal(
  TEXT, TEXT, DATE, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_adaptation_proposal(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_adaptation_proposal(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_coach_memory(TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_coach_memory(TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT)
  TO authenticated;

COMMENT ON TABLE public.coach_strength_assessments IS
  'User-confirmed 1RM, 3RM, and 5RM sources with labeled, versioned estimated 1RM values';
COMMENT ON TABLE public.coach_memories IS
  'Correctable, versioned athlete facts confirmed for future coaching use';
COMMENT ON TABLE public.training_plan_versions IS
  'Immutable eight-week plan intent versions produced by deterministic planning policy';
COMMENT ON FUNCTION public.create_initial_training_plan_proposal(
  TEXT, TEXT, DATE, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) IS
  'Atomically and idempotently stores an initial eight-week proposal produced by the application planning kernel';
COMMENT ON FUNCTION public.accept_adaptation_proposal(UUID, TEXT) IS
  'Atomically and idempotently accepts one user-owned plan proposal after a stale-base check';
COMMENT ON FUNCTION public.confirm_coach_memory(TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT) IS
  'Atomically and idempotently supersedes one confirmed athlete memory with a new version';

COMMIT;
