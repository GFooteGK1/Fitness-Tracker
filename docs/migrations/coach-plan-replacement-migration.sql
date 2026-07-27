BEGIN;

CREATE OR REPLACE FUNCTION public.create_training_plan_replacement_proposal(
  p_program_id UUID,
  p_base_plan_version_id UUID,
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
  v_program public.training_programs%ROWTYPE;
  v_existing public.adaptation_proposals%ROWTYPE;
  v_plan_version_id UUID := gen_random_uuid();
  v_proposal_id UUID := gen_random_uuid();
  v_next_version INTEGER;
  v_week_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_program_id IS NULL OR p_base_plan_version_id IS NULL THEN
    RAISE EXCEPTION 'Program and base plan version are required' USING ERRCODE = '22023';
  END IF;

  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
    OR p_goal_summary IS NULL OR length(btrim(p_goal_summary)) NOT BETWEEN 1 AND 1000
    OR p_start_date IS NULL
  THEN
    RAISE EXCEPTION 'Valid replacement program metadata is required' USING ERRCODE = '22023';
  END IF;

  IF p_reference_version IS NULL OR length(btrim(p_reference_version)) = 0
    OR p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0
  THEN
    RAISE EXCEPTION 'Reference and policy versions are required' USING ERRCODE = '22023';
  END IF;

  IF p_intent IS NULL OR jsonb_typeof(p_intent) <> 'object'
    OR p_intent->>'horizon_weeks' <> '8'
    OR p_input_snapshot IS NULL OR jsonb_typeof(p_input_snapshot) <> 'object'
  THEN
    RAISE EXCEPTION 'Replacement intent and input snapshot must be valid objects'
      USING ERRCODE = '22023';
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

  IF p_rationale IS NULL OR jsonb_typeof(p_rationale) <> 'object'
    OR p_input_fingerprint IS NULL OR p_input_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
  THEN
    RAISE EXCEPTION 'Valid replacement rationale, fingerprint, and idempotency key are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::TEXT || ':replacement-plan:' || btrim(p_idempotency_key), 0)
  );

  SELECT *
  INTO v_existing
  FROM public.adaptation_proposals
  WHERE user_id = v_user_id
    AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.program_id IS DISTINCT FROM p_program_id
      OR v_existing.base_plan_version_id IS DISTINCT FROM p_base_plan_version_id
      OR v_existing.rationale->>'input_fingerprint' IS DISTINCT FROM p_input_fingerprint
    THEN
      RAISE EXCEPTION 'Training proposal idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY SELECT v_existing.id, v_existing.program_id, v_existing.proposed_plan_version_id;
    RETURN;
  END IF;

  SELECT *
  INTO v_program
  FROM public.training_programs
  WHERE id = p_program_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_program.status <> 'active' THEN
    RAISE EXCEPTION 'Active training program not found' USING ERRCODE = '55000';
  END IF;

  IF v_program.active_plan_version_id IS DISTINCT FROM p_base_plan_version_id THEN
    RAISE EXCEPTION 'Proposal is stale because the active plan changed'
      USING ERRCODE = '40001';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_next_version
  FROM public.training_plan_versions
  WHERE program_id = v_program.id;

  INSERT INTO public.training_plan_versions (
    id, program_id, user_id, version, reference_version, policy_version, intent, input_snapshot
  )
  VALUES (
    v_plan_version_id, v_program.id, v_user_id, v_next_version,
    btrim(p_reference_version), btrim(p_policy_version), p_intent, p_input_snapshot
  );

  INSERT INTO public.prescribed_sessions (
    plan_version_id, program_id, user_id, week_number, session_index, scheduled_date, prescription
  )
  SELECT
    v_plan_version_id,
    v_program.id,
    v_user_id,
    (session->>'week_number')::INTEGER,
    (session->>'session_index')::INTEGER,
    (session->>'scheduled_date')::DATE,
    session->'prescription'
  FROM jsonb_array_elements(p_sessions) AS session;

  INSERT INTO public.adaptation_proposals (
    id, user_id, program_id, base_plan_version_id, proposed_plan_version_id,
    idempotency_key, rationale
  )
  VALUES (
    v_proposal_id,
    v_user_id,
    v_program.id,
    p_base_plan_version_id,
    v_plan_version_id,
    btrim(p_idempotency_key),
    p_rationale || jsonb_build_object(
      'input_fingerprint', p_input_fingerprint,
      'program_metadata', jsonb_build_object(
        'title', btrim(p_title),
        'goal_summary', btrim(p_goal_summary),
        'start_date', p_start_date
      )
    )
  );

  RETURN QUERY SELECT v_proposal_id, v_program.id, v_plan_version_id;
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

  UPDATE public.training_plan_versions
  SET status = 'superseded'
  WHERE id = v_program.active_plan_version_id AND status = 'accepted';

  UPDATE public.training_plan_versions
  SET status = 'accepted', accepted_at = v_now
  WHERE id = v_target.id;

  v_proposed_start_date := NULLIF(
    v_proposal.rationale #>> '{program_metadata,start_date}', ''
  )::DATE;

  UPDATE public.training_programs
  SET active_plan_version_id = v_target.id,
      status = 'active',
      title = COALESCE(
        NULLIF(btrim(v_proposal.rationale #>> '{program_metadata,title}'), ''),
        title
      ),
      goal_summary = COALESCE(
        NULLIF(btrim(v_proposal.rationale #>> '{program_metadata,goal_summary}'), ''),
        goal_summary
      ),
      start_date = COALESCE(v_proposed_start_date, start_date),
      end_date = COALESCE(v_proposed_start_date + 55, end_date),
      updated_at = v_now
  WHERE id = v_program.id;

  UPDATE public.adaptation_proposals
  SET status = 'accepted', decided_at = v_now
  WHERE id = v_proposal.id;

  RETURN QUERY SELECT v_program.id, v_target.id, 'accepted'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_training_plan_replacement_proposal(
  UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_training_plan_replacement_proposal(
  UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.create_training_plan_replacement_proposal(
  UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) IS
  'Atomically and idempotently stores an athlete-reviewed replacement plan proposal against the active version';

REVOKE ALL ON FUNCTION public.accept_adaptation_proposal(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_adaptation_proposal(UUID, TEXT) TO authenticated;

COMMIT;
