-- Add explicit setup dependency receipts without rewriting installed migrations
-- or accepted plans. Deploy with compatible proposal/review writers; old pending
-- rolling drafts and reviews must be regenerated, not backfilled by inference.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_coach_setup_memories_current(p_user_id UUID, p_bindings JSONB, p_intent JSONB) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry RECORD; memory public.coach_memories%ROWTYPE; checked_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_bindings IS NULL OR p_bindings->'schemaVersion' IS DISTINCT FROM '1'::JSONB
    OR jsonb_typeof(p_bindings->'memories') IS DISTINCT FROM 'object'
    OR NOT (p_bindings->'memories' ?& ARRAY['primary_goal','training_schedule','available_equipment','training_constraints'])
    OR (p_intent #> '{weekly_plan,profileSnapshot,exercisePreferences}' IS NOT NULL
      AND p_intent #> '{weekly_plan,profileSnapshot,exercisePreferences}' <> 'null'::JSONB
      AND NOT (p_bindings->'memories' ? 'exercise_preferences')) THEN
    RAISE EXCEPTION 'Planning setup is unverified; refresh the review and create a new proposal' USING ERRCODE = '40001';
  END IF;
  FOR entry IN SELECT key, value FROM jsonb_each(p_bindings->'memories') LOOP
    IF entry.key NOT IN ('primary_goal','training_schedule','available_equipment','training_constraints','exercise_preferences') THEN
      RAISE EXCEPTION 'Planning setup binding is unsupported; refresh the review' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO memory FROM public.coach_memories WHERE user_id = p_user_id AND memory_key = entry.key
      ORDER BY version DESC LIMIT 1;
    -- Null is an explicit empty read, not an omitted/unknown legacy binding.
    IF entry.value = 'null'::JSONB THEN
      IF FOUND THEN RAISE EXCEPTION 'Confirmed training setup changed or needs review; refresh the direction' USING ERRCODE = '40001'; END IF;
      CONTINUE;
    END IF;
    IF NOT FOUND OR jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
      OR entry.value->'currentAtRead' IS DISTINCT FROM 'true'::JSONB
      OR memory.id::TEXT IS DISTINCT FROM entry.value->>'memoryId'
      OR to_jsonb(memory.version) IS DISTINCT FROM entry.value->'memoryVersion'
      OR memory.content IS DISTINCT FROM entry.value->'content' OR memory.status <> 'confirmed'
      OR memory.kind IS DISTINCT FROM (CASE entry.key WHEN 'primary_goal' THEN 'goal' WHEN 'training_schedule' THEN 'schedule'
        WHEN 'available_equipment' THEN 'equipment' WHEN 'training_constraints' THEN 'constraint' ELSE 'preference' END)
      OR memory.effective_from > checked_at OR memory.effective_until <= checked_at OR memory.review_after <= checked_at THEN
      RAISE EXCEPTION 'Confirmed training setup changed or needs review; refresh the direction' USING ERRCODE = '40001';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_coach_setup_memories_current(UUID,JSONB,JSONB) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_coach_proposal_context() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE plan public.training_plan_versions%ROWTYPE; review_rationale JSONB;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status <> 'accepted' OR OLD.status = 'accepted') THEN RETURN NEW; END IF;
  SELECT * INTO plan FROM public.training_plan_versions WHERE id = NEW.proposed_plan_version_id AND user_id = NEW.user_id;
  IF plan.plan_mode IS DISTINCT FROM 'rolling_weekly' THEN RETURN NEW; END IF;
  IF NEW.weekly_review_id IS NOT NULL THEN
    SELECT rationale INTO review_rationale FROM public.coach_weekly_reviews
      WHERE id = NEW.weekly_review_id AND user_id = NEW.user_id;
    IF public.coach_context_revision_value(review_rationale->'contextRevision') IS NULL
      OR review_rationale->'contextRevision' IS DISTINCT FROM plan.input_snapshot->'contextRevision'
      OR review_rationale->'setupMemoryBindings' IS DISTINCT FROM plan.input_snapshot->'setupMemoryBindings' THEN
      RAISE EXCEPTION 'Weekly review context changed; refresh the review before proposing a week' USING ERRCODE = '40001';
    END IF;
  END IF;
  PERFORM public.assert_coach_context_revision(NEW.user_id, plan.input_snapshot->'contextRevision');
  -- Retain source -> revision lock order. These reads run under the same fence.
  PERFORM public.assert_coach_plan_intent_current(NEW.user_id, plan.intent);
  PERFORM public.assert_coach_setup_memories_current(NEW.user_id, plan.input_snapshot->'setupMemoryBindings', plan.intent);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_coach_proposal_context() FROM PUBLIC, anon, authenticated, service_role;


-- A blocked review can be superseded after clock-only lifecycle transitions.
-- Catch only the expected freshness conflict; unexpected SQL errors stay errors.
CREATE OR REPLACE FUNCTION public.coach_setup_memories_current(p_user_id UUID, p_bindings JSONB, p_intent JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_coach_setup_memories_current(p_user_id, p_bindings, p_intent);
  RETURN true;
EXCEPTION WHEN serialization_failure THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.coach_setup_memories_current(UUID,JSONB,JSONB) FROM PUBLIC, anon, authenticated, service_role;

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
        OR (p_review_id IS NOT NULL AND a.weekly_review_id = p_review_id)
        OR NOT public.coach_setup_memories_current(p_user_id, p.input_snapshot->'setupMemoryBindings', p.intent))
    ORDER BY a.id FOR UPDATE OF a NOWAIT LOOP
    UPDATE public.training_plan_versions SET status = 'rejected' WHERE id = proposal.proposed_plan_version_id AND status = 'proposed';
    UPDATE public.adaptation_proposals SET status = 'expired', decided_at = clock_timestamp() WHERE id = proposal.id AND status = 'proposed';
  END LOOP;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'Proposal is being decided; refresh before retrying' USING ERRCODE = '40001';
END $$;
REVOKE ALL ON FUNCTION public.expire_stale_coach_context_proposals(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the installed review RPC contract; only successor eligibility changes.
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
      ) AND public.coach_setup_memories_current(v_user_id, v_existing.rationale->'setupMemoryBindings', NULL) THEN
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

ALTER FUNCTION public.record_coach_weekly_review(UUID,UUID,DATE,TEXT,TEXT,TEXT,TEXT,NUMERIC,JSONB,JSONB,JSONB,JSONB,JSONB,JSONB,JSONB,TEXT,TEXT,TEXT,TEXT) SET lock_timeout = '1s';

COMMIT;
