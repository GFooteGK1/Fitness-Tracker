-- Rollback-only verifier for coach-trust-review-migration.sql.
-- Run after the base workout, coach, layered evidence, Qwik, and trust migrations.

BEGIN;

SELECT set_config('trust_test.user_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('trust_test.user_2', gen_random_uuid()::TEXT, TRUE);
INSERT INTO auth.users (id) VALUES
  (current_setting('trust_test.user_1')::UUID),
  (current_setting('trust_test.user_2')::UUID);

SELECT set_config('request.jwt.claim.sub', current_setting('trust_test.user_1'), TRUE);
SELECT set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'sub', current_setting('trust_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

CREATE TEMPORARY TABLE trust_memory_initial AS
SELECT * FROM public.confirm_coach_memory(
  'primary_goal',
  'goal',
  '{"goal":"Build useful strength","primaryDomain":"strength","secondaryGoals":[]}'::JSONB,
  '{"source":"program_setup","confirmedBy":"athlete"}'::JSONB,
  1,
  'trust-memory-initial'
);

SELECT * FROM public.review_coach_memory(
  (SELECT memory_id FROM trust_memory_initial),
  'reaffirmed',
  NULL,
  'trust-memory-reaffirm'
);
SELECT * FROM public.review_coach_memory(
  (SELECT memory_id FROM trust_memory_initial),
  'reaffirmed',
  NULL,
  'trust-memory-reaffirm'
);

DO $verify_memory_reaffirm$
BEGIN
  IF (SELECT count(*) FROM public.coach_memory_review_events
      WHERE user_id = current_setting('trust_test.user_1')::UUID
        AND action = 'reaffirmed') <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.coach_memories
      WHERE id = (SELECT memory_id FROM trust_memory_initial)
        AND status = 'confirmed'
        AND last_reviewed_at IS NOT NULL
        AND review_after > last_reviewed_at
    ) THEN
    RAISE EXCEPTION 'Memory reaffirmation was not one idempotent lifecycle event';
  END IF;
END
$verify_memory_reaffirm$;

CREATE TEMPORARY TABLE trust_memory_corrected AS
SELECT * FROM public.correct_coach_memory_with_review(
  (SELECT memory_id FROM trust_memory_initial),
  '{"goal":"Build useful full-body strength","primaryDomain":"strength","secondaryGoals":[]}'::JSONB,
  'trust-memory-correct'
);
SELECT * FROM public.correct_coach_memory_with_review(
  (SELECT memory_id FROM trust_memory_initial),
  '{"goal":"Build useful full-body strength","primaryDomain":"strength","secondaryGoals":[]}'::JSONB,
  'trust-memory-correct'
);

DO $verify_memory_correction$
DECLARE
  v_old UUID := (SELECT memory_id FROM trust_memory_initial);
  v_new UUID := (SELECT replacement_memory_id FROM trust_memory_corrected);
BEGIN
  IF v_new IS NULL OR v_new = v_old
    OR (SELECT status FROM public.coach_memories WHERE id = v_old) <> 'superseded'
    OR (SELECT status FROM public.coach_memories WHERE id = v_new) <> 'confirmed'
    OR (SELECT content->>'goal' FROM public.coach_memories WHERE id = v_new)
      <> 'Build useful full-body strength'
    OR (SELECT count(*) FROM public.coach_memory_review_events
        WHERE user_id = current_setting('trust_test.user_1')::UUID
          AND action = 'corrected') <> 1 THEN
    RAISE EXCEPTION 'Memory correction did not create one immutable replacement version';
  END IF;
END
$verify_memory_correction$;

CREATE TEMPORARY TABLE trust_memory_withdraw AS
SELECT * FROM public.confirm_coach_memory(
  'available_equipment',
  'equipment',
  '{"equipment":"Barbell and rack","resolvedEquipmentIds":["barbell","rack"]}'::JSONB,
  '{"source":"program_setup","confirmedBy":"athlete"}'::JSONB,
  1,
  'trust-memory-equipment'
);
SELECT * FROM public.review_coach_memory(
  (SELECT memory_id FROM trust_memory_withdraw),
  'withdrawn',
  'Equipment is no longer available',
  'trust-memory-withdraw'
);

DO $verify_memory_withdrawal$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_memories
    WHERE id = (SELECT memory_id FROM trust_memory_withdraw)
      AND status = 'withdrawn'
      AND effective_until IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.coach_memory_review_events
    WHERE memory_id = (SELECT memory_id FROM trust_memory_withdraw)
      AND action = 'withdrawn'
      AND reason = 'Equipment is no longer available'
  ) THEN
    RAISE EXCEPTION 'Memory withdrawal did not preserve a reason-bearing history event';
  END IF;
END
$verify_memory_withdrawal$;

SELECT set_config('trust_test.import_confirm', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('trust_test.group_mapped', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('trust_test.group_ambiguous', gen_random_uuid()::TEXT, TRUE);
INSERT INTO public.measurement_imports (
  id, user_id, source_system, source_file_name, source_file_hash,
  source_schema_version, parser_version, idempotency_key, status,
  verification_status, captured_at, manifest
) VALUES (
  current_setting('trust_test.import_confirm')::UUID,
  current_setting('trust_test.user_1')::UUID,
  'qwik_vbt', 'trust-confirm.json', repeat('a', 64), 'qwik-vbt-json-1.10',
  'qwik-import-0.1.0', 'trust-import-confirm-source', 'pending_review',
  'unverified', NOW() - INTERVAL '1 hour',
  '{"rawArtifactUploaded":false,"rawStoragePolicy":"user_retained_not_uploaded","sourceDevice":"phone-1"}'::JSONB
);
INSERT INTO public.performance_observation_groups (
  id, user_id, source_import_id, observation_kind, status, observed_at, captured_at,
  source_kind, source_system, source_device, source_record_id,
  assessment_definition_id, assessment_catalog_version, protocol_version,
  parser_version, verification_status, comparability_key, comparison_modifiers, metadata
) VALUES
(
  current_setting('trust_test.group_mapped')::UUID,
  current_setting('trust_test.user_1')::UUID,
  current_setting('trust_test.import_confirm')::UUID,
  'strength_set', 'complete', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours',
  'import', 'qwik_vbt', 'phone-1', 'trust-set-mapped',
  'strength.fixed_load_velocity', '0.2.0', '1.0.0', 'qwik-import-0.1.0',
  'unverified',
  'comparison-v1|metric=bar.mean_velocity|movement=barbell_bench_press',
  '{"movementId":"barbell_bench_press","variationId":"press:barbell_bench","repetitions":1,"externalLoad":{"value":100,"unit":"kg"},"distance":null,"duration":null,"equipmentIds":["barbell","bench"],"techniqueModifiers":[],"environmentModifiers":[]}'::JSONB,
  '{"sourceExercise":"Bench Press","mappingStatus":"mapped","canonicalMovementId":"barbell_bench_press","canonicalMovementName":"Barbell bench press","candidateMovementIds":["barbell_bench_press"]}'::JSONB
),
(
  current_setting('trust_test.group_ambiguous')::UUID,
  current_setting('trust_test.user_1')::UUID,
  current_setting('trust_test.import_confirm')::UUID,
  'strength_set', 'incomplete', NOW() - INTERVAL '2 hours 30 minutes', NOW() - INTERVAL '2 hours',
  'import', 'qwik_vbt', 'phone-1', 'trust-set-ambiguous',
  'strength.fixed_load_velocity', '0.2.0', '1.0.0', 'qwik-import-0.1.0',
  'unverified', NULL,
  '{"movementId":null,"variationId":null,"repetitions":1,"externalLoad":{"value":32,"unit":"kg"},"distance":null,"duration":null,"equipmentIds":[],"techniqueModifiers":[],"environmentModifiers":[]}'::JSONB,
  '{"sourceExercise":"Goblet Squat","mappingStatus":"ambiguous","canonicalMovementId":null,"canonicalMovementName":null,"candidateMovementIds":["dumbbell_goblet_squat","kettlebell_goblet_squat"]}'::JSONB
);
INSERT INTO public.performance_observation_values (
  group_id, user_id, metric_id, semantic_role, value_numeric, unit, ordinal, status, provenance
)
SELECT group_id, current_setting('trust_test.user_1')::UUID, metric_id, semantic_role,
  value_numeric, unit, ordinal, 'complete', '{}'::JSONB
FROM (
  VALUES
    (current_setting('trust_test.group_mapped')::UUID, 'strength.load', 'training_signal', 100::NUMERIC, 'kg', 0),
    (current_setting('trust_test.group_mapped')::UUID, 'strength.repetitions', 'training_signal', 1::NUMERIC, 'repetitions', 0),
    (current_setting('trust_test.group_mapped')::UUID, 'bar.mean_velocity', 'direct_outcome', 0.58::NUMERIC, 'm_per_s', 0),
    (current_setting('trust_test.group_ambiguous')::UUID, 'strength.load', 'training_signal', 32::NUMERIC, 'kg', 0),
    (current_setting('trust_test.group_ambiguous')::UUID, 'strength.repetitions', 'training_signal', 1::NUMERIC, 'repetitions', 0),
    (current_setting('trust_test.group_ambiguous')::UUID, 'bar.mean_velocity', 'direct_outcome', 0.72::NUMERIC, 'm_per_s', 0)
) AS fixture(group_id, metric_id, semantic_role, value_numeric, unit, ordinal);

CREATE TEMPORARY TABLE trust_qwik_confirmed AS
SELECT * FROM public.review_qwik_import_v1(
  current_setting('trust_test.import_confirm')::UUID,
  'confirmed',
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'groupId', current_setting('trust_test.group_ambiguous'),
    'movementId', 'dumbbell_goblet_squat',
    'movementName', 'Dumbbell goblet squat',
    'comparison', '{"movementId":"dumbbell_goblet_squat","variationId":"squat:goblet","repetitions":1,"externalLoad":{"value":32,"unit":"kg"},"distance":null,"duration":null,"equipmentIds":["dumbbell"],"techniqueModifiers":[],"environmentModifiers":[]}'::JSONB,
    'comparabilityKey', 'comparison-v1|metric=bar.mean_velocity|movement=dumbbell_goblet_squat'
  )),
  NULL,
  'trust-qwik-confirm'
);
SELECT * FROM public.review_qwik_import_v1(
  current_setting('trust_test.import_confirm')::UUID,
  'confirmed',
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'groupId', current_setting('trust_test.group_ambiguous'),
    'movementId', 'dumbbell_goblet_squat',
    'movementName', 'Dumbbell goblet squat',
    'comparison', '{"movementId":"dumbbell_goblet_squat","variationId":"squat:goblet","repetitions":1,"externalLoad":{"value":32,"unit":"kg"},"distance":null,"duration":null,"equipmentIds":["dumbbell"],"techniqueModifiers":[],"environmentModifiers":[]}'::JSONB,
    'comparabilityKey', 'comparison-v1|metric=bar.mean_velocity|movement=dumbbell_goblet_squat'
  )),
  NULL,
  'trust-qwik-confirm'
);

DO $verify_qwik_confirmation$
BEGIN
  IF (SELECT status FROM public.measurement_imports
      WHERE id = current_setting('trust_test.import_confirm')::UUID) <> 'confirmed'
    OR (SELECT count(*) FROM public.performance_observation_groups
        WHERE source_import_id = current_setting('trust_test.import_confirm')::UUID
          AND status = 'complete' AND verification_status = 'athlete_confirmed') <> 2
    OR NOT EXISTS (
      SELECT 1 FROM public.performance_observation_groups
      WHERE id = current_setting('trust_test.group_ambiguous')::UUID
        AND status = 'superseded'
        AND superseded_by_group_id IS NOT NULL
    )
    OR (SELECT count(*) FROM public.performance_observation_values
        WHERE user_id = current_setting('trust_test.user_1')::UUID) <> 9
    OR (SELECT count(*) FROM public.measurement_import_review_events
        WHERE import_id = current_setting('trust_test.import_confirm')::UUID) <> 1 THEN
    RAISE EXCEPTION 'Qwik confirmation did not version mappings or replay idempotently';
  END IF;
END
$verify_qwik_confirmation$;

SELECT set_config('trust_test.import_reject', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('trust_test.group_reject', gen_random_uuid()::TEXT, TRUE);
INSERT INTO public.measurement_imports (
  id, user_id, source_system, source_file_name, source_file_hash,
  source_schema_version, parser_version, idempotency_key, status,
  verification_status, captured_at, manifest
) VALUES (
  current_setting('trust_test.import_reject')::UUID,
  current_setting('trust_test.user_1')::UUID,
  'qwik_vbt', 'trust-reject.json', repeat('b', 64), 'qwik-vbt-json-1.10',
  'qwik-import-0.1.0', 'trust-import-reject-source', 'pending_review',
  'unverified', NOW() - INTERVAL '1 hour',
  '{"rawArtifactUploaded":false,"rawStoragePolicy":"user_retained_not_uploaded"}'::JSONB
);
INSERT INTO public.performance_observation_groups (
  id, user_id, source_import_id, observation_kind, status, observed_at, captured_at,
  source_kind, source_system, source_device, source_record_id,
  assessment_definition_id, assessment_catalog_version, protocol_version,
  parser_version, verification_status, comparability_key, comparison_modifiers, metadata
) VALUES (
  current_setting('trust_test.group_reject')::UUID,
  current_setting('trust_test.user_1')::UUID,
  current_setting('trust_test.import_reject')::UUID,
  'strength_set', 'complete', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours',
  'import', 'qwik_vbt', 'phone-2', 'trust-set-reject',
  'strength.fixed_load_velocity', '0.2.0', '1.0.0', 'qwik-import-0.1.0',
  'unverified', 'comparison-v1|metric=bar.mean_velocity|movement=barbell_bench_press',
  '{"movementId":"barbell_bench_press","variationId":"press:barbell_bench","repetitions":1,"externalLoad":{"value":80,"unit":"kg"},"distance":null,"duration":null,"equipmentIds":["barbell","bench"],"techniqueModifiers":[],"environmentModifiers":[]}'::JSONB,
  '{"sourceExercise":"Bench Press","mappingStatus":"mapped","canonicalMovementId":"barbell_bench_press","canonicalMovementName":"Barbell bench press","candidateMovementIds":["barbell_bench_press"]}'::JSONB
);
INSERT INTO public.performance_observation_values (
  group_id, user_id, metric_id, semantic_role, value_numeric, unit, ordinal, status, provenance
) VALUES (
  current_setting('trust_test.group_reject')::UUID,
  current_setting('trust_test.user_1')::UUID,
  'bar.mean_velocity', 'direct_outcome', 0.63, 'm_per_s', 0, 'complete', '{}'::JSONB
);
SELECT * FROM public.review_qwik_import_v1(
  current_setting('trust_test.import_reject')::UUID,
  'rejected',
  '[]'::JSONB,
  'Video setup was invalid',
  'trust-qwik-reject'
);

DO $verify_qwik_rejection$
BEGIN
  IF (SELECT status FROM public.measurement_imports
      WHERE id = current_setting('trust_test.import_reject')::UUID) <> 'rejected'
    OR (SELECT status FROM public.performance_observation_groups
        WHERE id = current_setting('trust_test.group_reject')::UUID) <> 'excluded'
    OR (SELECT status FROM public.performance_observation_values
        WHERE group_id = current_setting('trust_test.group_reject')::UUID) <> 'excluded' THEN
    RAISE EXCEPTION 'Qwik rejection did not exclude the normalized evidence atomically';
  END IF;
END
$verify_qwik_rejection$;

SELECT set_config('trust_test.program', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('trust_test.plan_active', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('trust_test.plan_proposed', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('trust_test.proposal', gen_random_uuid()::TEXT, TRUE);
INSERT INTO public.training_programs (
  id, user_id, title, goal_summary, start_date, end_date, status
) VALUES (
  current_setting('trust_test.program')::UUID,
  current_setting('trust_test.user_1')::UUID,
  'Trust verifier program', 'Build useful strength', CURRENT_DATE, CURRENT_DATE + 55, 'draft'
);
INSERT INTO public.training_plan_versions (
  id, program_id, user_id, version, status, reference_version, policy_version,
  intent, input_snapshot, accepted_at
) VALUES
(
  current_setting('trust_test.plan_active')::UUID,
  current_setting('trust_test.program')::UUID,
  current_setting('trust_test.user_1')::UUID,
  1, 'accepted', '0.1.0', '0.3.0', '{"horizon_weeks":8}'::JSONB, '{}'::JSONB, NOW()
),
(
  current_setting('trust_test.plan_proposed')::UUID,
  current_setting('trust_test.program')::UUID,
  current_setting('trust_test.user_1')::UUID,
  2, 'proposed', '0.1.0', '0.3.0', '{"horizon_weeks":8}'::JSONB, '{}'::JSONB, NULL
);
UPDATE public.training_programs
SET status = 'active', active_plan_version_id = current_setting('trust_test.plan_active')::UUID
WHERE id = current_setting('trust_test.program')::UUID;
INSERT INTO public.adaptation_proposals (
  id, user_id, program_id, base_plan_version_id, proposed_plan_version_id,
  idempotency_key, status, rationale
) VALUES (
  current_setting('trust_test.proposal')::UUID,
  current_setting('trust_test.user_1')::UUID,
  current_setting('trust_test.program')::UUID,
  current_setting('trust_test.plan_active')::UUID,
  current_setting('trust_test.plan_proposed')::UUID,
  'trust-proposal-source', 'proposed',
  '{"reason":"evidence_derived_adaptation","automaticPlanActivation":false}'::JSONB
);
SELECT * FROM public.reject_adaptation_proposal(
  current_setting('trust_test.proposal')::UUID,
  'Keep the current emphasis',
  'trust-proposal-reject'
);
SELECT * FROM public.reject_adaptation_proposal(
  current_setting('trust_test.proposal')::UUID,
  'Keep the current emphasis',
  'trust-proposal-reject'
);

DO $verify_proposal_rejection$
BEGIN
  IF (SELECT status FROM public.adaptation_proposals
      WHERE id = current_setting('trust_test.proposal')::UUID) <> 'rejected'
    OR (SELECT status FROM public.training_plan_versions
        WHERE id = current_setting('trust_test.plan_proposed')::UUID) <> 'rejected'
    OR (SELECT active_plan_version_id FROM public.training_programs
        WHERE id = current_setting('trust_test.program')::UUID)
      <> current_setting('trust_test.plan_active')::UUID
    OR (SELECT count(*) FROM public.adaptation_proposal_review_events
        WHERE proposal_id = current_setting('trust_test.proposal')::UUID) <> 1 THEN
    RAISE EXCEPTION 'Proposal rejection did not preserve the active plan or replay idempotently';
  END IF;
END
$verify_proposal_rejection$;

DO $verify_trust_privileges$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'coach_memory_review_events',
    'measurement_import_review_events',
    'adaptation_proposal_review_events'
  ] LOOP
    IF NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
      OR has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
      OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
      OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') THEN
      RAISE EXCEPTION 'Authenticated review-event privileges are unsafe for %', v_table;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', 'public.review_coach_memory(uuid,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.correct_coach_memory_with_review(uuid,jsonb,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.review_qwik_import_v1(uuid,text,jsonb,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.reject_adaptation_proposal(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated trust RPC execution grants are missing';
  END IF;
END
$verify_trust_privileges$;

SET LOCAL ROLE authenticated;

DO $verify_trust_rls$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'coach_memory_review_events',
        'measurement_import_review_events',
        'adaptation_proposal_review_events'
      )
      AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'Trust review event tables must force row-level security';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', current_setting('trust_test.user_2'), TRUE);
  IF EXISTS (SELECT 1 FROM public.coach_memory_review_events)
    OR EXISTS (SELECT 1 FROM public.measurement_import_review_events)
    OR EXISTS (SELECT 1 FROM public.adaptation_proposal_review_events) THEN
    RAISE EXCEPTION 'A second athlete can read another athlete review history';
  END IF;
END
$verify_trust_rls$;
RESET ROLE;


ROLLBACK;

SELECT 'rollback-complete' AS verification_status;
