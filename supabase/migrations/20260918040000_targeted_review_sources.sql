-- Immutable weekly reviews retain their original basis. Corrections append invalidations.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS activity_revisions_id_owner ON public.activity_revisions(id,user_id);
CREATE TABLE IF NOT EXISTS public.coach_review_source_invalidations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL,
  original_workout_id UUID,
  observation_group_id UUID,
  activity_revision_id UUID,
  reason TEXT NOT NULL CHECK (reason IN ('execution_amended', 'execution_deleted', 'measurement_retracted', 'legacy_source_unverified')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, activity_revision_id),
  UNIQUE (review_id, observation_group_id, reason),
  CHECK ((activity_revision_id IS NOT NULL AND original_workout_id IS NOT NULL) OR observation_group_id IS NOT NULL OR reason='legacy_source_unverified'),
  FOREIGN KEY (observation_group_id,user_id) REFERENCES public.performance_observation_groups(id,user_id),
  FOREIGN KEY (review_id, user_id) REFERENCES public.coach_weekly_reviews(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (activity_revision_id, user_id) REFERENCES public.activity_revisions(id, user_id) ON DELETE CASCADE
);
ALTER TABLE public.coach_review_source_invalidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_review_source_invalidations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_review_source_invalidations_owner ON public.coach_review_source_invalidations;
CREATE POLICY coach_review_source_invalidations_owner ON public.coach_review_source_invalidations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.coach_review_source_invalidations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.coach_review_source_invalidations TO authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS coach_review_legacy_invalidation ON public.coach_review_source_invalidations(review_id,reason) WHERE reason='legacy_source_unverified';
CREATE INDEX IF NOT EXISTS coach_review_source_invalidations_owner_review ON public.coach_review_source_invalidations(user_id, review_id);

ALTER TABLE public.coach_weekly_reviews ADD COLUMN IF NOT EXISTS supersedes_review_id UUID;
ALTER TABLE public.coach_weekly_reviews ADD COLUMN IF NOT EXISTS review_revision INTEGER NOT NULL DEFAULT 1 CHECK(review_revision>0);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_review_supersedes_owner') THEN
    ALTER TABLE public.coach_weekly_reviews ADD CONSTRAINT weekly_review_supersedes_owner
      FOREIGN KEY (supersedes_review_id, user_id) REFERENCES public.coach_weekly_reviews(id, user_id);
  END IF;
END $$;
ALTER TABLE public.coach_weekly_reviews DROP CONSTRAINT IF EXISTS coach_weekly_reviews_base_plan_version_id_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS weekly_review_revision ON public.coach_weekly_reviews(base_plan_version_id,user_id,review_revision);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_review_single_successor ON public.coach_weekly_reviews(supersedes_review_id) WHERE supersedes_review_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.invalidate_coach_review_sources() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.entity_kind = 'workout' AND NEW.revision > 1 THEN
    INSERT INTO public.coach_review_source_invalidations(user_id, review_id, original_workout_id, activity_revision_id, reason)
    SELECT NEW.user_id, r.id, NEW.original_entity_id, NEW.id,
      CASE WHEN NEW.deleted THEN 'execution_deleted' ELSE 'execution_amended' END
    FROM public.coach_weekly_reviews r
    WHERE r.user_id = NEW.user_id AND (
      EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.rationale->'executionSources') = 'array' THEN r.rationale->'executionSources' ELSE '[]'::jsonb END) s
        WHERE s->>'workoutId' = NEW.original_entity_id::text)
      OR EXISTS (SELECT 1 FROM public.coach_weekly_review_observations l
        JOIN public.performance_observation_groups g ON g.id = l.observation_group_id AND g.user_id = l.user_id
        WHERE l.review_id = r.id AND l.user_id = NEW.user_id AND l.disposition = 'included' AND g.workout_id = NEW.original_entity_id)
    ) ON CONFLICT (review_id, activity_revision_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_coach_review_sources() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS invalidate_coach_review_sources ON public.activity_revisions;
CREATE TRIGGER invalidate_coach_review_sources AFTER INSERT ON public.activity_revisions
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_coach_review_sources();

-- Called inside the proposal transaction after its program lock. FOR SHARE conflicts
-- with capture updates/deletion, closing the check-then-accept race.
CREATE OR REPLACE FUNCTION public.assert_coach_review_sources(p_review_id UUID, p_user_id UUID) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE r public.coach_weekly_reviews%ROWTYPE; s jsonb; w public.workouts%ROWTYPE; g public.performance_observation_groups%ROWTYPE; v public.performance_observation_values%ROWTYPE; imp public.measurement_imports%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_weekly_reviews WHERE id = p_review_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown owned weekly review' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.coach_review_source_invalidations WHERE review_id = r.id AND user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.coach_weekly_reviews WHERE supersedes_review_id = r.id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Weekly review sources changed; refresh the review' USING ERRCODE = '40001';
  END IF;
  -- Capture corrections/deletion lock workout before observation rows. Match that
  -- order to avoid an accept/delete deadlock, then recheck eligibility below.
  PERFORM w.id FROM public.workouts w WHERE w.user_id=p_user_id AND w.id IN (
    SELECT g.workout_id FROM public.performance_observation_groups g JOIN public.coach_weekly_review_observations l ON g.id=l.observation_group_id AND g.user_id=l.user_id
    WHERE l.review_id=r.id AND l.user_id=p_user_id AND l.disposition='included'
  ) ORDER BY w.id FOR SHARE;
  -- Import -> group -> value order is stable. Source content is immutable, but
  -- confirmed sources can be retracted; lock their mutable eligibility state.
  FOR imp IN SELECT i.* FROM public.measurement_imports i WHERE i.user_id = p_user_id AND i.id IN (
    SELECT g.source_import_id FROM public.coach_weekly_review_observations l JOIN public.performance_observation_groups g ON g.id=l.observation_group_id AND g.user_id=l.user_id
    WHERE l.review_id=r.id AND l.user_id=p_user_id AND l.disposition='included'
  ) ORDER BY i.id FOR SHARE LOOP
    IF imp.status <> 'confirmed' OR imp.verification_status <> 'athlete_confirmed' THEN RAISE EXCEPTION 'Weekly review measurement was retracted' USING ERRCODE='40001'; END IF;
  END LOOP;
  FOR g IN SELECT g.* FROM public.performance_observation_groups g JOIN public.coach_weekly_review_observations l ON g.id=l.observation_group_id AND g.user_id=l.user_id
    WHERE l.review_id=r.id AND l.user_id=p_user_id AND l.disposition='included' ORDER BY g.id FOR SHARE OF g LOOP
    IF g.status <> 'complete' OR g.verification_status NOT IN ('athlete_confirmed','system_verified') THEN RAISE EXCEPTION 'Weekly review measurement was retracted' USING ERRCODE='40001'; END IF;
  END LOOP;
  IF r.algorithm_version = 'weekly-review-0.3.0' THEN
    IF jsonb_typeof(r.rationale->'executionSources') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Weekly review source contract is missing' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(r.rationale->'executionSources') > 320 THEN
      RAISE EXCEPTION 'Weekly review source contract is too large' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(r.rationale->'observationSources') IS DISTINCT FROM 'array' OR jsonb_array_length(r.rationale->'observationSources') > 320 THEN
      RAISE EXCEPTION 'Weekly review measurement source contract is invalid' USING ERRCODE='22023';
    END IF;
    FOR s IN SELECT value FROM jsonb_array_elements(r.rationale->'observationSources') ORDER BY value->>'valueId' LOOP
      SELECT * INTO v FROM public.performance_observation_values WHERE id=(s->>'valueId')::uuid AND user_id=p_user_id FOR SHARE;
      IF NOT FOUND OR v.group_id IS DISTINCT FROM (s->>'observationId')::uuid OR NOT EXISTS (
        SELECT 1 FROM public.coach_weekly_review_observations WHERE review_id=r.id AND user_id=p_user_id AND observation_group_id=v.group_id AND disposition='included'
      ) THEN RAISE EXCEPTION 'Weekly review measurement source binding is invalid' USING ERRCODE='42501'; END IF;
      IF v.status <> 'complete' THEN RAISE EXCEPTION 'Weekly review measurement was retracted' USING ERRCODE='40001'; END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.coach_weekly_review_observations l WHERE l.review_id=r.id AND l.user_id=p_user_id AND l.disposition='included'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.rationale->'observationSources') s WHERE s->>'observationId'=l.observation_group_id::text)) THEN
      RAISE EXCEPTION 'Weekly review measurement source contract is incomplete' USING ERRCODE='22023';
    END IF;
    FOR s IN SELECT value FROM jsonb_array_elements(r.rationale->'executionSources') ORDER BY value->>'workoutId', value->>'observationId' LOOP
      IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->'captureRevision' IS DISTINCT FROM '1'::jsonb
        OR s->'executionRevision' IS DISTINCT FROM '0'::jsonb OR s->>'workoutId' IS NULL OR s->>'observationId' IS NULL THEN
        RAISE EXCEPTION 'Weekly review source contract is invalid' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO g FROM public.performance_observation_groups WHERE id = (s->>'observationId')::uuid AND user_id = p_user_id;
      IF NOT FOUND OR g.workout_id IS DISTINCT FROM (s->>'workoutId')::uuid OR NOT EXISTS (
        SELECT 1 FROM public.coach_weekly_review_observations WHERE review_id = r.id AND user_id = p_user_id AND observation_group_id = g.id AND disposition = 'included'
      ) THEN RAISE EXCEPTION 'Weekly review source is not an included owned observation' USING ERRCODE = '42501'; END IF;
      SELECT * INTO w FROM public.workouts WHERE id = g.workout_id AND user_id = p_user_id FOR SHARE;
      IF NOT FOUND OR w.capture_revision <> 1 OR w.execution_revision <> 0 THEN
        RAISE EXCEPTION 'Weekly review sources changed; refresh the review' USING ERRCODE = '40001';
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.coach_weekly_review_observations l JOIN public.performance_observation_groups g ON g.id = l.observation_group_id AND g.user_id = l.user_id
      WHERE l.review_id = r.id AND l.user_id = p_user_id AND l.disposition = 'included' AND g.workout_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.rationale->'executionSources') s WHERE s->>'observationId' = g.id::text AND s->>'workoutId' = g.workout_id::text)) THEN
      RAISE EXCEPTION 'Weekly review source contract is incomplete' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Historical records stay readable, but old numeric decisions need a current review.
    IF r.action IN ('adjust_dose','recover') THEN RAISE EXCEPTION 'Legacy dose review needs current source verification' USING ERRCODE = '40001'; END IF;
    FOR w IN SELECT w.* FROM public.workouts w WHERE w.user_id = p_user_id AND w.id IN (
      SELECT g.workout_id FROM public.coach_weekly_review_observations l JOIN public.performance_observation_groups g ON g.id = l.observation_group_id AND g.user_id = l.user_id
      WHERE l.review_id = r.id AND l.user_id = p_user_id AND l.disposition = 'included'
    ) ORDER BY w.id FOR SHARE LOOP
      IF w.capture_revision <> 1 OR w.execution_revision <> 0 THEN RAISE EXCEPTION 'Weekly review sources changed; refresh the review' USING ERRCODE = '40001'; END IF;
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_coach_review_sources(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_coach_proposal_sources() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.weekly_review_id IS NOT NULL AND (TG_OP = 'INSERT' OR (NEW.status = 'accepted' AND OLD.status <> 'accepted')) THEN
    PERFORM public.assert_coach_review_sources(NEW.weekly_review_id, NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_coach_proposal_sources() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_coach_proposal_sources ON public.adaptation_proposals;
CREATE TRIGGER guard_coach_proposal_sources BEFORE INSERT OR UPDATE OF status ON public.adaptation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_proposal_sources();

CREATE OR REPLACE FUNCTION public.invalidate_coach_review_measurements() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    INSERT INTO public.coach_review_source_invalidations(user_id,review_id,observation_group_id,reason)
      SELECT l.user_id,l.review_id,OLD.group_id,'measurement_retracted' FROM public.coach_weekly_review_observations l
      WHERE l.user_id=OLD.user_id AND l.observation_group_id=OLD.group_id AND l.disposition='included'
      ON CONFLICT(review_id,observation_group_id,reason) DO NOTHING;
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME='performance_observation_values' AND NEW.status='complete' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='performance_observation_groups' AND NEW.status='complete' AND to_jsonb(NEW)->>'verification_status' IN ('athlete_confirmed','system_verified') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='measurement_imports' AND NEW.status='confirmed' AND to_jsonb(NEW)->>'verification_status'='athlete_confirmed' THEN RETURN NEW; END IF;
  INSERT INTO public.coach_review_source_invalidations(user_id,review_id,observation_group_id,reason)
    SELECT l.user_id,l.review_id,g.id,'measurement_retracted' FROM public.coach_weekly_review_observations l
    JOIN public.performance_observation_groups g ON g.id=l.observation_group_id AND g.user_id=l.user_id
    WHERE l.user_id=NEW.user_id AND l.disposition='included' AND (
      (TG_TABLE_NAME='performance_observation_values' AND g.id=(to_jsonb(NEW)->>'group_id')::uuid)
      OR (TG_TABLE_NAME='performance_observation_groups' AND g.id=NEW.id)
      OR (TG_TABLE_NAME='measurement_imports' AND g.source_import_id=NEW.id)
    ) ON CONFLICT(review_id,observation_group_id,reason) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_coach_review_measurements() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS invalidate_coach_review_measurements ON public.performance_observation_values;
CREATE TRIGGER invalidate_coach_review_measurements AFTER UPDATE OF status OR DELETE ON public.performance_observation_values FOR EACH ROW EXECUTE FUNCTION public.invalidate_coach_review_measurements();
DROP TRIGGER IF EXISTS invalidate_coach_review_measurements ON public.performance_observation_groups;
CREATE TRIGGER invalidate_coach_review_measurements AFTER UPDATE OF status,verification_status ON public.performance_observation_groups FOR EACH ROW EXECUTE FUNCTION public.invalidate_coach_review_measurements();
DROP TRIGGER IF EXISTS invalidate_coach_review_measurements ON public.measurement_imports;
CREATE TRIGGER invalidate_coach_review_measurements AFTER UPDATE OF status,verification_status ON public.measurement_imports FOR EACH ROW EXECUTE FUNCTION public.invalidate_coach_review_measurements();

-- Successor-capable record_coach_weekly_review definition follows. It preserves all
-- previous validation and idempotent replay, appending only after invalidation.
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
    IF NOT EXISTS (SELECT 1 FROM public.coach_review_source_invalidations inv WHERE inv.review_id = v_existing.id AND inv.user_id = v_user_id) THEN
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
    UPDATE public.training_plan_versions SET status = 'rejected'
    WHERE user_id = v_user_id AND status = 'proposed' AND id IN (
      SELECT proposed_plan_version_id FROM public.adaptation_proposals
      WHERE user_id = v_user_id AND weekly_review_id = v_supersedes AND status = 'proposed'
    );
    UPDATE public.adaptation_proposals SET status = 'expired', decided_at = now()
      WHERE user_id = v_user_id AND weekly_review_id = v_supersedes AND status = 'proposed';
  END IF;
  RETURN QUERY SELECT v_review_id, p_action, p_presentation_class;
END;
$$;


-- Existing unverified numeric decisions remain readable but cannot become active.
-- Marking the schema limitation explicitly permits an immutable current successor.
INSERT INTO public.coach_review_source_invalidations(user_id,review_id,reason)
  SELECT user_id,id,'legacy_source_unverified' FROM public.coach_weekly_reviews
  WHERE algorithm_version <> 'weekly-review-0.3.0' AND action IN ('adjust_dose','recover')
  ON CONFLICT(review_id,reason) WHERE reason='legacy_source_unverified' DO NOTHING;
COMMIT;
