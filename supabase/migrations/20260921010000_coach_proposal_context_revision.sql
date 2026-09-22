-- Fence rolling proposals and reviews against changed inputs, including newly
-- inserted facts. Accepted prescriptions and response-loss replays stay immutable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.coach_context_revisions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991)
);
ALTER TABLE public.coach_context_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_context_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_context_revision_owner ON public.coach_context_revisions;
CREATE POLICY coach_context_revision_owner ON public.coach_context_revisions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.coach_context_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.coach_context_revisions TO authenticated;

CREATE OR REPLACE FUNCTION public.get_coach_context_revision() RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := auth.uid(); result BIGINT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.coach_context_revisions(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
  SELECT revision INTO result FROM public.coach_context_revisions WHERE user_id = uid;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_coach_context_revision() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_context_revision() TO authenticated;

CREATE OR REPLACE FUNCTION public.advance_coach_context_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row JSONB; new_row JSONB; owner UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' AND old_row - 'updated_at' IS NOT DISTINCT FROM new_row - 'updated_at' THEN RETURN NULL; END IF;
  -- Generated prescriptions are outputs. Only execution changes to already
  -- accepted sessions are inputs; creating proposed sessions cannot dirty itself.
  IF TG_TABLE_NAME = 'prescribed_sessions' THEN
    IF NOT EXISTS (SELECT 1 FROM public.training_plan_versions p
      WHERE p.id = coalesce(new_row->>'plan_version_id', old_row->>'plan_version_id')::UUID
        AND p.user_id = coalesce(new_row->>'user_id', old_row->>'user_id')::UUID
        AND p.status IN ('accepted', 'superseded')) THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' AND (old_row->'status', old_row->'completed_workout_id', old_row->'completed_at')
      IS NOT DISTINCT FROM (new_row->'status', new_row->'completed_workout_id', new_row->'completed_at') THEN RETURN NULL; END IF;
  END IF;
  FOR owner IN SELECT DISTINCT value::UUID FROM unnest(ARRAY[old_row->>'user_id', new_row->>'user_id']) value
    WHERE value IS NOT NULL ORDER BY value::UUID LOOP
    -- Parent deletion must not recreate a cascading revision row.
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = owner) THEN
      INSERT INTO public.coach_context_revisions(user_id, revision) VALUES(owner, 1)
      ON CONFLICT(user_id) DO UPDATE SET revision = coach_context_revisions.revision + 1;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.advance_coach_context_revision() FROM PUBLIC, anon, authenticated, service_role;

DO $$ DECLARE source_table TEXT; BEGIN
  FOREACH source_table IN ARRAY ARRAY['coach_memories', 'workouts', 'coach_checkins',
    'coach_strength_assessments', 'performance_observation_groups',
    'performance_observation_values', 'measurement_imports', 'prescribed_sessions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_advance_coach_context_revision ON public.%I', source_table);
    -- Last among current AFTER triggers: preserve source/recommendation locks
    -- before the shared revision lock, matching proposal and review checks.
    EXECUTE format('CREATE TRIGGER zz_advance_coach_context_revision AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.advance_coach_context_revision()', source_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.coach_context_revision_value(p_value JSONB) RETURNS BIGINT
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'number' OR (p_value #>> '{}') !~ '^[0-9]{1,16}$' THEN RETURN NULL; END IF;
  IF (p_value #>> '{}')::NUMERIC > 9007199254740991 THEN RETURN NULL; END IF;
  RETURN (p_value #>> '{}')::BIGINT;
END $$;
REVOKE ALL ON FUNCTION public.coach_context_revision_value(JSONB) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_coach_context_revision(p_user_id UUID, p_value JSONB) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE expected BIGINT := public.coach_context_revision_value(p_value); current_revision BIGINT;
BEGIN
  IF expected IS NULL THEN RAISE EXCEPTION 'Planning context is unverified; refresh the draft or review' USING ERRCODE = '40001'; END IF;
  -- The owned read RPC initializes the row before application input reads.
  -- Do not insert here: a conflicting insert could wait before the NOWAIT fence.
  -- A source writer may next need a row already locked by review validation;
  -- reject contention instead of waiting while retaining those source locks.
  SELECT revision INTO current_revision FROM public.coach_context_revisions WHERE user_id = p_user_id FOR SHARE NOWAIT;
  IF NOT FOUND OR current_revision IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Planning context changed; refresh the draft or review' USING ERRCODE = '40001';
  END IF;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'Planning context is changing; refresh before retrying' USING ERRCODE = '40001';
END $$;
REVOKE ALL ON FUNCTION public.assert_coach_context_revision(UUID,JSONB) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_coach_plan_intent_current(p_user_id UUID, p_intent JSONB) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE snapshot JSONB := p_intent->'training_intent'; memory public.coach_memories%ROWTYPE; checked_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- Existing capability-off proposals do not claim an intent snapshot.
  IF snapshot IS NULL THEN RETURN; END IF;
  SELECT * INTO memory FROM public.coach_memories WHERE user_id = p_user_id AND memory_key = 'training_intent'
    ORDER BY version DESC LIMIT 1;
  IF NOT FOUND OR memory.id::TEXT IS DISTINCT FROM snapshot->>'memoryId'
    OR to_jsonb(memory.version) IS DISTINCT FROM snapshot->'memoryVersion'
    OR memory.content IS DISTINCT FROM snapshot->'content' OR memory.status <> 'confirmed'
    OR memory.effective_from > checked_at OR memory.effective_until <= checked_at OR memory.review_after <= checked_at THEN
    RAISE EXCEPTION 'Confirmed training intent changed or needs review; refresh the direction' USING ERRCODE = '40001';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_coach_plan_intent_current(UUID,JSONB) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_coach_proposal_context() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE plan public.training_plan_versions%ROWTYPE; review_revision JSONB;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status <> 'accepted' OR OLD.status = 'accepted') THEN RETURN NEW; END IF;
  SELECT * INTO plan FROM public.training_plan_versions WHERE id = NEW.proposed_plan_version_id AND user_id = NEW.user_id;
  IF plan.plan_mode IS DISTINCT FROM 'rolling_weekly' THEN RETURN NEW; END IF;
  IF NEW.weekly_review_id IS NOT NULL THEN
    SELECT rationale->'contextRevision' INTO review_revision FROM public.coach_weekly_reviews
      WHERE id = NEW.weekly_review_id AND user_id = NEW.user_id;
    IF public.coach_context_revision_value(review_revision) IS NULL
      OR review_revision IS DISTINCT FROM plan.input_snapshot->'contextRevision' THEN
      RAISE EXCEPTION 'Weekly review context changed; refresh the review before proposing a week' USING ERRCODE = '40001';
    END IF;
  END IF;
  PERFORM public.assert_coach_context_revision(NEW.user_id, plan.input_snapshot->'contextRevision');
  -- Plain MVCC read under the revision fence: no reverse memory-row lock order.
  PERFORM public.assert_coach_plan_intent_current(NEW.user_id, plan.intent);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_coach_proposal_context() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS zz_guard_coach_proposal_context ON public.adaptation_proposals;
CREATE TRIGGER zz_guard_coach_proposal_context BEFORE INSERT OR UPDATE OF status ON public.adaptation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_proposal_context();

CREATE OR REPLACE FUNCTION public.guard_coach_review_context() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_coach_context_revision(NEW.user_id, NEW.rationale->'contextRevision');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_coach_review_context() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_coach_review_context ON public.coach_weekly_reviews;
-- record_coach_weekly_review acquires source locks after its INSERT. Defer this
-- fence until transaction end to retain the same source -> revision lock order.
CREATE CONSTRAINT TRIGGER guard_coach_review_context AFTER INSERT ON public.coach_weekly_reviews
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_coach_review_context();

CREATE OR REPLACE FUNCTION public.expire_stale_coach_context_proposals(p_user_id UUID, p_program_id UUID, p_review_id UUID DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE proposal public.adaptation_proposals%ROWTYPE; current_revision BIGINT;
BEGIN
  SELECT revision INTO current_revision FROM public.coach_context_revisions WHERE user_id = p_user_id;
  FOR proposal IN SELECT a.* FROM public.adaptation_proposals a
    JOIN public.training_plan_versions p ON p.id = a.proposed_plan_version_id AND p.user_id = a.user_id
    WHERE a.user_id = p_user_id AND a.program_id = p_program_id AND a.status = 'proposed'
      AND p.plan_mode = 'rolling_weekly' AND p.status = 'proposed'
      AND (public.coach_context_revision_value(p.input_snapshot->'contextRevision') IS DISTINCT FROM current_revision
        OR (p_review_id IS NOT NULL AND a.weekly_review_id = p_review_id))
    ORDER BY a.id FOR UPDATE OF a NOWAIT LOOP
    UPDATE public.training_plan_versions SET status = 'rejected' WHERE id = proposal.proposed_plan_version_id AND status = 'proposed';
    UPDATE public.adaptation_proposals SET status = 'expired', decided_at = clock_timestamp() WHERE id = proposal.id AND status = 'proposed';
  END LOOP;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'Proposal is being decided; refresh before retrying' USING ERRCODE = '40001';
END $$;
REVOKE ALL ON FUNCTION public.expire_stale_coach_context_proposals(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Existing RPC definitions below retain their contracts, replay checks and
-- authority. Only stale-review succession and pending-window cleanup change.

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
  v_supersedes UUID;
  v_revision INTEGER := 1;
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

  SELECT * INTO v_existing FROM public.coach_weekly_reviews r
  WHERE r.base_plan_version_id = p_base_plan_version_id AND r.user_id = v_user_id
    AND NOT EXISTS (SELECT 1 FROM public.coach_weekly_reviews child WHERE child.user_id=v_user_id AND child.supersedes_review_id=r.id)
  LIMIT 1;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.coach_review_source_invalidations inv WHERE inv.review_id = v_existing.id AND inv.user_id = v_user_id)
      AND public.coach_context_revision_value(v_existing.rationale->'contextRevision') IS NOT NULL
      AND public.coach_context_revision_value(v_existing.rationale->'contextRevision') = (
        SELECT revision FROM public.coach_context_revisions WHERE user_id = v_user_id
      ) THEN
      RAISE EXCEPTION 'The accepted week was already reviewed' USING ERRCODE = '40001';
    END IF;
    v_supersedes := v_existing.id;
    v_revision := v_existing.review_revision + 1;
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
    id, user_id, program_id, base_plan_version_id, supersedes_review_id, review_revision,
    review_window_start, review_window_end, review_reason,
    action, presentation_class, evidence_status, confidence,
    evidence_snapshot, evaluation_window, execution_summary,
    missing_requirements, safety_override, rationale,
    policy_version, algorithm_version, input_fingerprint, idempotency_key
  ) VALUES (
    v_review_id, v_user_id, p_program_id, p_base_plan_version_id, v_supersedes, v_revision,
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

  PERFORM public.assert_coach_review_sources(v_review_id, v_user_id);
  IF v_supersedes IS NOT NULL THEN
    PERFORM public.expire_stale_coach_context_proposals(v_user_id, p_program_id, v_supersedes);
  END IF;
  RETURN QUERY SELECT v_review_id, p_action, p_presentation_class;
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

  -- Release only obsolete pending windows; accepted versions are never changed.
  PERFORM public.expire_stale_coach_context_proposals(v_user_id, p_program_id);

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

COMMIT;
