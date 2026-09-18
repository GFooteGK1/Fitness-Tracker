BEGIN;

-- Data-only exercise reports. The server binds each report to the accepted
-- exercise; these rows do not authorize numerical progression or plan changes.
CREATE TABLE public.coach_session_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prescribed_session_id uuid NOT NULL,
  program_id uuid NOT NULL,
  plan_version_id uuid NOT NULL,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  signal jsonb NOT NULL CHECK (jsonb_typeof(signal) = 'object'),
  prescription_snapshot jsonb NOT NULL CHECK (jsonb_typeof(prescription_snapshot) = 'object'),
  policy_version text NOT NULL CHECK (policy_version = 'session-capture-1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_session_signals_session_owner_fk
    FOREIGN KEY (prescribed_session_id, plan_version_id, program_id, user_id)
    REFERENCES public.prescribed_sessions(id, plan_version_id, program_id, user_id) ON DELETE CASCADE,
  CONSTRAINT coach_session_signals_plan_owner_fk
    FOREIGN KEY (plan_version_id, program_id, user_id)
    REFERENCES public.training_plan_versions(id, program_id, user_id) ON DELETE CASCADE,
  CONSTRAINT coach_session_signals_program_owner_fk
    FOREIGN KEY (program_id, user_id)
    REFERENCES public.training_programs(id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, request_id)
);
CREATE INDEX coach_session_signals_session_owner_idx
  ON public.coach_session_signals(user_id, prescribed_session_id, created_at);
ALTER TABLE public.coach_session_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_session_signals FORCE ROW LEVEL SECURITY;
CREATE POLICY coach_session_signals_owner_read ON public.coach_session_signals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.coach_session_signals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.coach_session_signals TO authenticated;

CREATE FUNCTION public.record_coach_session_signal(
  p_session_id uuid, p_request_id text, p_signal jsonb
) RETURNS TABLE(id uuid, created_at timestamptz, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session public.prescribed_sessions%ROWTYPE;
  v_existing public.coach_session_signals%ROWTYPE;
  v_active uuid;
  v_mode text;
  v_plan_status text;
  v_exercise jsonb;
  v_exercise_count integer;
  v_key text;
  v_max numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_request_id IS NULL OR length(btrim(p_request_id)) NOT BETWEEN 8 AND 200
    OR jsonb_typeof(p_signal) IS DISTINCT FROM 'object'
    OR length(p_signal::text) > 4000 THEN
    RAISE EXCEPTION 'Invalid signal request' USING ERRCODE = '22023';
  END IF;

  -- Match the atomic completion lock order. The same session lock serializes
  -- signal capture against completion before either can persist a result.
  SELECT s.* INTO v_session FROM public.prescribed_sessions s
    WHERE s.id = p_session_id AND s.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prescribed session not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':signal:' || btrim(p_request_id), 0));
  SELECT s.* INTO v_existing FROM public.coach_session_signals s
    WHERE s.user_id = v_user AND s.request_id = btrim(p_request_id);
  IF FOUND THEN
    IF v_existing.prescribed_session_id IS DISTINCT FROM p_session_id
      OR v_existing.signal IS DISTINCT FROM p_signal THEN
      RAISE EXCEPTION 'Request conflicts with saved signal' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.created_at, true;
    RETURN;
  END IF;

  IF v_session.status <> 'planned' THEN
    RAISE EXCEPTION 'Session is already terminal' USING ERRCODE = '55000';
  END IF;
  SELECT p.active_plan_version_id, p.program_mode INTO v_active, v_mode
    FROM public.training_programs p
    WHERE p.id = v_session.program_id AND p.user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_active IS DISTINCT FROM v_session.plan_version_id
    OR v_mode IS DISTINCT FROM 'rolling_weekly' THEN
    RAISE EXCEPTION 'Active plan changed' USING ERRCODE = '40001';
  END IF;
  SELECT p.status INTO v_plan_status FROM public.training_plan_versions p
    WHERE p.id = v_active AND p.program_id = v_session.program_id AND p.user_id = v_user FOR UPDATE;
  IF v_plan_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Plan is not accepted' USING ERRCODE = '40001';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_signal) AS fields(key)
    WHERE fields.key NOT IN ('schemaVersion','exerciseId','ratingScope','workStatus','rpe','rpeScale',
      'actualReps','actualLoad','actualLoadUnit','completedWorkingSets','actualDurationMinutes',
      'actualRestSeconds','stop','note')) THEN
    RAISE EXCEPTION 'Unknown signal field' USING ERRCODE = '22023';
  END IF;
  IF p_signal->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_signal->'exerciseId') IS DISTINCT FROM 'string'
    OR length(p_signal->>'exerciseId') NOT BETWEEN 1 AND 200
    OR coalesce(p_signal->>'ratingScope', '') NOT IN ('hardest_set','effort')
    OR coalesce(p_signal->>'workStatus', '') NOT IN ('as_planned','changed','unsure') THEN
    RAISE EXCEPTION 'Invalid signal fields' USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_max IN SELECT * FROM (VALUES
    ('actualReps',1000::numeric),('actualLoad',2000),('actualRestSeconds',3600),
    ('actualDurationMinutes',1440),('rpe',10),('completedWorkingSets',100)
  ) AS bounds(key, maximum) LOOP
    IF p_signal ? v_key THEN
      IF jsonb_typeof(p_signal->v_key) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Invalid numeric signal' USING ERRCODE = '22023';
      END IF;
      IF (p_signal->>v_key)::numeric < 0 OR (p_signal->>v_key)::numeric > v_max THEN
        RAISE EXCEPTION 'Signal out of bounds' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  IF (p_signal ? 'actualReps' AND (p_signal->>'actualReps')::numeric <> trunc((p_signal->>'actualReps')::numeric))
    OR (p_signal ? 'completedWorkingSets' AND (p_signal->>'completedWorkingSets')::numeric <> trunc((p_signal->>'completedWorkingSets')::numeric))
    OR ((p_signal ? 'actualLoad') IS DISTINCT FROM (p_signal ? 'actualLoadUnit'))
    OR (p_signal ? 'actualLoadUnit' AND coalesce(p_signal->>'actualLoadUnit','') NOT IN ('lb','kg'))
    OR ((p_signal ? 'rpe') IS DISTINCT FROM (p_signal ? 'rpeScale'))
    OR (p_signal ? 'rpeScale' AND coalesce(p_signal->>'rpeScale','') NOT IN ('effort_0_10','rir_based'))
    OR (p_signal ? 'stop' AND jsonb_typeof(p_signal->'stop') IS DISTINCT FROM 'boolean')
    OR (p_signal ? 'note' AND (jsonb_typeof(p_signal->'note') IS DISTINCT FROM 'string' OR length(p_signal->>'note') > 500)) THEN
    RAISE EXCEPTION 'Invalid optional signal fields' USING ERRCODE = '22023';
  END IF;

  -- Stable block ID plus zero-based exercise position is the accepted UI key.
  -- Derive the snapshot from the locked prescription, never from client input.
  SELECT count(*), jsonb_agg(e.value)->0 INTO v_exercise_count, v_exercise
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_session.prescription->'blocks') = 'array'
      THEN v_session.prescription->'blocks' ELSE '[]'::jsonb END) AS b(value)
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.value->'exercises') = 'array'
      THEN b.value->'exercises' ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value, idx)
    WHERE b.value->>'id' || ':' || (e.idx - 1)::text = p_signal->>'exerciseId';
  IF v_exercise_count <> 1 OR jsonb_typeof(v_exercise) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Exercise does not match accepted prescription' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coach_session_signals(user_id, prescribed_session_id, program_id,
    plan_version_id, request_id, signal, prescription_snapshot, policy_version)
    VALUES (v_user, p_session_id, v_session.program_id, v_session.plan_version_id,
      btrim(p_request_id), p_signal, v_exercise, 'session-capture-1')
    RETURNING * INTO v_existing;
  RETURN QUERY SELECT v_existing.id, v_existing.created_at, false;
END;
$$;
REVOKE ALL ON FUNCTION public.record_coach_session_signal(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_coach_session_signal(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.guard_coach_signal_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.checkin_type = 'session' AND NEW.responses->>'outcome' = 'as_planned'
    AND EXISTS (SELECT 1 FROM public.coach_session_signals s
      WHERE s.prescribed_session_id = NEW.prescribed_session_id AND s.user_id = NEW.user_id
      AND (s.signal->>'workStatus' = 'changed' OR s.signal->>'stop' = 'true'
        OR s.signal ? 'actualReps' OR s.signal ? 'actualLoad' OR s.signal ? 'completedWorkingSets'
        OR s.signal ? 'actualDurationMinutes' OR s.signal ? 'actualRestSeconds')) THEN
    RAISE EXCEPTION 'Exercise reports require actual-work details; complete as modified or stopped early'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_coach_signal_completion() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER coach_signal_completion_guard BEFORE INSERT OR UPDATE ON public.coach_checkins
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_signal_completion();

COMMIT;
