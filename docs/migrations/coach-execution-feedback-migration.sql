BEGIN;

-- Session results must move through the atomic RPC. Reads remain available
-- through the existing RLS policies; direct user writes are intentionally
-- removed from the two execution-feedback tables.
REVOKE INSERT, UPDATE ON TABLE public.prescribed_sessions FROM authenticated;
REVOKE INSERT ON TABLE public.coach_checkins FROM authenticated;

CREATE OR REPLACE FUNCTION public.record_coach_session_result(
  p_session_id UUID,
  p_status TEXT,
  p_responses JSONB,
  p_occurred_at TIMESTAMPTZ,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  prescribed_session_id UUID,
  session_status TEXT,
  checkin_id UUID,
  occurred_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session public.prescribed_sessions%ROWTYPE;
  v_locked_session public.prescribed_sessions%ROWTYPE;
  v_existing public.coach_checkins%ROWTYPE;
  v_active_plan_version_id UUID;
  v_plan_status TEXT;
  v_payload JSONB;
  v_checkin_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('completed', 'skipped') THEN
    RAISE EXCEPTION 'Session status must be completed or skipped'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_responses) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Session responses must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A valid session-result idempotency key is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_occurred_at IS NULL OR p_occurred_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Session completion time is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_responses->>'schemaVersion' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Session response schema version is unsupported'
      USING ERRCODE = '22023';
  END IF;

  IF p_responses->>'outcome' IS NULL
    OR p_responses->>'outcome' NOT IN ('as_planned', 'modified', 'stopped_early', 'skipped')
    OR p_responses->>'energy' IS NULL
    OR p_responses->>'energy' NOT IN ('low', 'okay', 'high')
    OR p_responses->>'pain' IS NULL
    OR p_responses->>'pain' NOT IN ('none', 'mild', 'concerning') THEN
    RAISE EXCEPTION 'Session response values are invalid'
      USING ERRCODE = '22023';
  END IF;

  IF (p_status = 'skipped') IS DISTINCT FROM (p_responses->>'outcome' = 'skipped') THEN
    RAISE EXCEPTION 'Session status and outcome do not match'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'completed'
    AND jsonb_typeof(p_responses->'sessionRpe') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Completed sessions need numeric session RPE'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'completed' AND (
    (p_responses->>'sessionRpe')::NUMERIC < 1
    OR (p_responses->>'sessionRpe')::NUMERIC > 10
    OR mod((p_responses->>'sessionRpe')::NUMERIC * 2, 1) <> 0
  ) THEN
    RAISE EXCEPTION 'Completed sessions need RPE from 1 through 10 in half-point steps'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'skipped'
    AND jsonb_typeof(p_responses->'sessionRpe') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'Skipped sessions cannot include session RPE'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (p_responses ? 'note')
    OR jsonb_typeof(p_responses->'note') NOT IN ('string', 'null')
    OR length(COALESCE(p_responses->>'note', '')) > 500 THEN
    RAISE EXCEPTION 'Session note is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT session_row.*
  INTO v_session
  FROM public.prescribed_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.user_id = v_user_id;

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
    RAISE EXCEPTION 'The active plan changed before session completion'
      USING ERRCODE = '40001';
  END IF;

  SELECT version.status
  INTO v_plan_status
  FROM public.training_plan_versions AS version
  WHERE version.id = v_session.plan_version_id
    AND version.program_id = v_session.program_id
    AND version.user_id = v_user_id;

  IF v_plan_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted plan session can be completed'
      USING ERRCODE = '55000';
  END IF;

  SELECT session_row.*
  INTO v_locked_session
  FROM public.prescribed_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.user_id = v_user_id
  FOR UPDATE;

  v_payload := p_responses || jsonb_build_object(
    'idempotencyKey', btrim(p_idempotency_key),
    'resultStatus', p_status
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
      OR v_locked_session.status IS DISTINCT FROM p_status THEN
      RAISE EXCEPTION 'Session-result idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;

    prescribed_session_id := v_locked_session.id;
    session_status := v_locked_session.status;
    checkin_id := v_existing.id;
    occurred_at := v_existing.occurred_at;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_locked_session.status <> 'planned' THEN
    RAISE EXCEPTION 'This prescribed session already has a terminal result'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.prescribed_sessions
  SET
    status = p_status,
    execution_note = NULLIF(p_responses->>'note', ''),
    completed_at = CASE WHEN p_status = 'completed' THEN p_occurred_at ELSE NULL END,
    updated_at = v_now
  WHERE id = v_locked_session.id
    AND user_id = v_user_id;

  INSERT INTO public.coach_checkins (
    user_id,
    program_id,
    plan_version_id,
    prescribed_session_id,
    checkin_type,
    responses,
    occurred_at
  )
  VALUES (
    v_user_id,
    v_locked_session.program_id,
    v_locked_session.plan_version_id,
    v_locked_session.id,
    'session',
    v_payload,
    p_occurred_at
  )
  RETURNING id INTO v_checkin_id;

  prescribed_session_id := v_locked_session.id;
  session_status := p_status;
  checkin_id := v_checkin_id;
  occurred_at := p_occurred_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.record_coach_session_result(
  UUID,
  TEXT,
  JSONB,
  TIMESTAMPTZ,
  TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_coach_session_result(
  UUID,
  TEXT,
  JSONB,
  TIMESTAMPTZ,
  TEXT
) TO authenticated;

COMMENT ON FUNCTION public.record_coach_session_result(
  UUID,
  TEXT,
  JSONB,
  TIMESTAMPTZ,
  TEXT
) IS 'Atomically records one terminal prescribed-session result and its user-scoped check-in with serialized idempotent retries.';

COMMIT;
