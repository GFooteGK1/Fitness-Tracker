-- Rollback-only verifier for rolling-weekly-coach-migration.sql.
-- Run after the full coach migration chain and after applying the rolling
-- migration twice.

BEGIN;

SELECT set_config('rolling_test.user_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('rolling_test.user_2', gen_random_uuid()::TEXT, TRUE);
INSERT INTO auth.users (id) VALUES
  (current_setting('rolling_test.user_1')::UUID),
  (current_setting('rolling_test.user_2')::UUID);

-- A newly inserted legacy row keeps the original eight-week contract without
-- requiring any rewrite of its plan payload.
SELECT set_config('rolling_test.legacy_program', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('rolling_test.legacy_plan', gen_random_uuid()::TEXT, TRUE);
INSERT INTO public.training_programs (
  id, user_id, title, goal_summary, start_date, end_date, status
) VALUES (
  current_setting('rolling_test.legacy_program')::UUID,
  current_setting('rolling_test.user_1')::UUID,
  'Legacy compatibility program', 'Preserve the accepted legacy contract',
  DATE '2026-01-05', DATE '2026-03-01', 'draft'
);
INSERT INTO public.training_plan_versions (
  id, program_id, user_id, version, status, reference_version, policy_version,
  intent, input_snapshot, accepted_at
) VALUES (
  current_setting('rolling_test.legacy_plan')::UUID,
  current_setting('rolling_test.legacy_program')::UUID,
  current_setting('rolling_test.user_1')::UUID,
  1, 'proposed', '0.1.0', '0.3.0',
  '{"horizon_weeks":8,"weeks":[]}'::JSONB, '{}'::JSONB, NULL
);

DO $verify_legacy_contract$
BEGIN
  IF (SELECT program_mode FROM public.training_programs
      WHERE id = current_setting('rolling_test.legacy_program')::UUID) <> 'legacy_eight_week'
    OR (SELECT plan_mode FROM public.training_plan_versions
        WHERE id = current_setting('rolling_test.legacy_plan')::UUID) <> 'legacy_eight_week'
    OR (SELECT window_start FROM public.training_plan_versions
        WHERE id = current_setting('rolling_test.legacy_plan')::UUID) IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy rows did not retain their compatibility defaults';
  END IF;
END
$verify_legacy_contract$;

SELECT set_config('request.jwt.claim.sub', current_setting('rolling_test.user_1'), TRUE);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('rolling_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

CREATE TEMPORARY TABLE rolling_initial AS
SELECT * FROM public.create_initial_rolling_weekly_proposal(
  'Rolling verifier program',
  'Build useful strength without forecasting future weeks',
  DATE '2026-09-07',
  DATE '2026-12-31',
  '{"primaryGoal":"Build useful strength","currentEmphasis":["strength"],"hypothesis":"Repeatable submaximal practice improves useful strength","constraints":[]}'::JSONB,
  'complete-programming-0.1.0',
  'rolling-weekly-0.1.0',
  '{"horizon_weeks":1,"primary_domain":"strength","weeks":[{"week_number":1}]}'::JSONB,
  '{"planningInput":{"primaryDomain":"strength"}}'::JSONB,
  jsonb_build_array(
    jsonb_build_object(
      'week_number', 1,
      'session_index', 1,
      'scheduled_date', DATE '2026-09-07',
      'prescription', jsonb_build_object(
        'domain', 'strength', 'intent', 'Practice force production',
        'dose', jsonb_build_object('source', 'validated_policy'),
        'effort', 'Controlled', 'rest', 'As needed',
        'success_condition', 'Repeatable quality',
        'stop_condition', 'Stop on technique loss',
        'scale_options', jsonb_build_array('Reduce one set'),
        'evidence', jsonb_build_object('policyVersion', 'rolling-weekly-0.1.0')
      )
    ),
    jsonb_build_object(
      'week_number', 1,
      'session_index', 2,
      'scheduled_date', DATE '2026-09-10',
      'prescription', jsonb_build_object(
        'domain', 'strength', 'intent', 'Repeat the weekly signal',
        'dose', jsonb_build_object('source', 'validated_policy'),
        'effort', 'Controlled', 'rest', 'As needed',
        'success_condition', 'Repeatable quality',
        'stop_condition', 'Stop on technique loss',
        'scale_options', jsonb_build_array('Reduce one set'),
        'evidence', jsonb_build_object('policyVersion', 'rolling-weekly-0.1.0')
      )
    )
  ),
  '{"reason":"initial rolling verifier","automaticPlanActivation":false}'::JSONB,
  repeat('1', 64),
  'rolling-initial-verifier'
);

SELECT set_config('rolling_test.proposal_1', proposal_id::TEXT, TRUE),
       set_config('rolling_test.program', proposed_program_id::TEXT, TRUE),
       set_config('rolling_test.plan_1', proposed_plan_version_id::TEXT, TRUE)
FROM rolling_initial;

SELECT * FROM public.accept_adaptation_proposal(
  current_setting('rolling_test.proposal_1')::UUID,
  'rolling-initial-verifier'
);

DO $verify_initial_week$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_programs
    WHERE id = current_setting('rolling_test.program')::UUID
      AND program_mode = 'rolling_weekly'
      AND start_date = DATE '2026-09-07'
      AND end_date = DATE '2026-09-13'
      AND goal_target_date = DATE '2026-12-31'
      AND active_plan_version_id = current_setting('rolling_test.plan_1')::UUID
  ) OR NOT EXISTS (
    SELECT 1 FROM public.training_plan_versions
    WHERE id = current_setting('rolling_test.plan_1')::UUID
      AND status = 'accepted'
      AND plan_mode = 'rolling_weekly'
      AND window_start = DATE '2026-09-07'
      AND window_end = DATE '2026-09-13'
      AND sequence_number = 1
  ) OR (SELECT count(*) FROM public.training_plan_versions
        WHERE program_id = current_setting('rolling_test.program')::UUID) <> 1
    OR (SELECT count(*) FROM public.prescribed_sessions
        WHERE plan_version_id = current_setting('rolling_test.plan_1')::UUID
          AND scheduled_date BETWEEN DATE '2026-09-07' AND DATE '2026-09-13') <> 2 THEN
    RAISE EXCEPTION 'Initial rolling proposal did not persist exactly one accepted week';
  END IF;
END
$verify_initial_week$;

-- Terminal session results make the normal review path ready. Skips are
-- evidence and are not copied into the next week.
UPDATE public.prescribed_sessions
SET status = 'skipped', completed_at = NULL
WHERE plan_version_id = current_setting('rolling_test.plan_1')::UUID;

SELECT set_config('rolling_test.group_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('rolling_test.group_2', gen_random_uuid()::TEXT, TRUE);
INSERT INTO public.performance_observation_groups (
  id, user_id, observation_kind, status, observed_at, captured_at,
  source_kind, source_system, source_device, source_record_id,
  assessment_definition_id, assessment_catalog_version, protocol_version,
  parser_version, verification_status, verified_at, comparability_key,
  comparison_modifiers, metadata
) VALUES
(
  current_setting('rolling_test.group_1')::UUID,
  current_setting('rolling_test.user_1')::UUID,
  'strength_set', 'complete', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days',
  'manual', 'sociusfit', 'web', 'rolling-observation-user-1',
  'strength.fixed_load_velocity', '0.2.0', '1.0.0', 'manual-0.1.0',
  'athlete_confirmed', NOW() - INTERVAL '2 days',
  'comparison-v1|metric=bar.mean_velocity|movement=barbell_bench_press',
  '{"movementId":"barbell_bench_press","variationId":"press:barbell_bench","repetitions":1,"externalLoad":{"value":100,"unit":"kg"},"distance":null,"duration":null,"equipmentIds":["barbell","bench"],"techniqueModifiers":[],"environmentModifiers":[]}'::JSONB,
  '{"source":"rolling verifier"}'::JSONB
),
(
  current_setting('rolling_test.group_2')::UUID,
  current_setting('rolling_test.user_2')::UUID,
  'strength_set', 'complete', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days',
  'manual', 'sociusfit', 'web', 'rolling-observation-user-2',
  'strength.fixed_load_velocity', '0.2.0', '1.0.0', 'manual-0.1.0',
  'athlete_confirmed', NOW() - INTERVAL '2 days',
  'comparison-v1|metric=bar.mean_velocity|movement=barbell_bench_press',
  '{"movementId":"barbell_bench_press","variationId":"press:barbell_bench","repetitions":1,"externalLoad":{"value":100,"unit":"kg"},"distance":null,"duration":null,"equipmentIds":["barbell","bench"],"techniqueModifiers":[],"environmentModifiers":[]}'::JSONB,
  '{"source":"rolling verifier"}'::JSONB
);

CREATE TEMPORARY TABLE rolling_review AS
SELECT * FROM public.record_coach_weekly_review(
  current_setting('rolling_test.program')::UUID,
  current_setting('rolling_test.plan_1')::UUID,
  DATE '2026-09-07',
  'all_sessions_terminal',
  'continue',
  'same_track',
  'sufficient',
  0.8,
  '{"directOutcomes":[],"proxySignals":[],"trainingSignals":[]}'::JSONB,
  '{"currentWeek":{"start":"2026-09-07","end":"2026-09-13"},"rollingProtocols":[]}'::JSONB,
  '{"planned":2,"completed":0,"skipped":2,"pastDuePlanned":0}'::JSONB,
  '[]'::JSONB,
  NULL,
  '{"summary":"Keep the same emphasis while collecting another compatible signal"}'::JSONB,
  jsonb_build_array(jsonb_build_object(
    'groupId', current_setting('rolling_test.group_1'),
    'disposition', 'included'
  )),
  'rolling-weekly-0.1.0',
  'weekly-review-0.1.0',
  repeat('2', 64),
  'rolling-review-verifier'
);

SELECT set_config('rolling_test.review', review_id::TEXT, TRUE) FROM rolling_review;

DO $verify_review_retry$
DECLARE
  v_retry RECORD;
BEGIN
  SELECT * INTO v_retry FROM public.record_coach_weekly_review(
    current_setting('rolling_test.program')::UUID,
    current_setting('rolling_test.plan_1')::UUID,
    DATE '2026-09-07', 'all_sessions_terminal', 'continue', 'same_track',
    'sufficient', 0.8,
    '{"directOutcomes":[],"proxySignals":[],"trainingSignals":[]}'::JSONB,
    '{"currentWeek":{"start":"2026-09-07","end":"2026-09-13"},"rollingProtocols":[]}'::JSONB,
    '{"planned":2,"completed":0,"skipped":2,"pastDuePlanned":0}'::JSONB,
    '[]'::JSONB, NULL,
    '{"summary":"Keep the same emphasis while collecting another compatible signal"}'::JSONB,
    jsonb_build_array(jsonb_build_object(
      'groupId', current_setting('rolling_test.group_1'), 'disposition', 'included'
    )),
    'rolling-weekly-0.1.0', 'weekly-review-0.1.0', repeat('2', 64),
    'rolling-review-verifier'
  );
  IF v_retry.review_id IS DISTINCT FROM current_setting('rolling_test.review')::UUID
    OR (SELECT count(*) FROM public.coach_weekly_reviews
        WHERE base_plan_version_id = current_setting('rolling_test.plan_1')::UUID) <> 1
    OR (SELECT count(*) FROM public.coach_weekly_review_observations
        WHERE review_id = current_setting('rolling_test.review')::UUID) <> 1 THEN
    RAISE EXCEPTION 'Weekly review retry was not idempotent';
  END IF;
END
$verify_review_retry$;

DO $verify_review_mismatch$
BEGIN
  BEGIN
    PERFORM * FROM public.record_coach_weekly_review(
      current_setting('rolling_test.program')::UUID,
      current_setting('rolling_test.plan_1')::UUID,
      DATE '2026-09-07', 'all_sessions_terminal', 'continue', 'same_track',
      'sufficient', 0.8, '{}'::JSONB, '{}'::JSONB, '{}'::JSONB, '[]'::JSONB,
      NULL, '{}'::JSONB, '[]'::JSONB,
      'rolling-weekly-0.1.0', 'weekly-review-0.1.0', repeat('9', 64),
      'rolling-review-verifier'
    );
    RAISE EXCEPTION 'Weekly review accepted a mismatched idempotent retry';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$verify_review_mismatch$;

CREATE TEMPORARY TABLE rolling_replacement AS
SELECT * FROM public.create_rolling_weekly_replacement_proposal(
  current_setting('rolling_test.program')::UUID,
  current_setting('rolling_test.plan_1')::UUID,
  current_setting('rolling_test.review')::UUID,
  'Rolling verifier program',
  'Build useful strength without forecasting future weeks',
  DATE '2026-09-14',
  DATE '2026-12-31',
  '{"primaryGoal":"Build useful strength","currentEmphasis":["strength"],"hypothesis":"Repeatable submaximal practice improves useful strength","constraints":[]}'::JSONB,
  'complete-programming-0.1.0',
  'rolling-weekly-0.1.0',
  '{"horizon_weeks":1,"primary_domain":"strength","weeks":[{"week_number":1}]}'::JSONB,
  '{"planningInput":{"primaryDomain":"strength"},"reviewAction":"continue"}'::JSONB,
  jsonb_build_array(jsonb_build_object(
    'week_number', 1,
    'session_index', 1,
    'scheduled_date', DATE '2026-09-14',
    'prescription', jsonb_build_object(
      'domain', 'strength', 'intent', 'Repeat the validated dose',
      'dose', jsonb_build_object('source', 'validated_policy'),
      'effort', 'Controlled', 'rest', 'As needed',
      'success_condition', 'Repeatable quality',
      'stop_condition', 'Stop on technique loss',
      'scale_options', jsonb_build_array('Reduce one set'),
      'evidence', jsonb_build_object('policyVersion', 'rolling-weekly-0.1.0')
    )
  )),
  '{"reviewAction":"continue","automaticPlanActivation":false}'::JSONB,
  repeat('3', 64),
  'rolling-replacement-verifier'
);

SELECT set_config('rolling_test.proposal_2', proposal_id::TEXT, TRUE),
       set_config('rolling_test.plan_2', proposed_plan_version_id::TEXT, TRUE)
FROM rolling_replacement;

DO $verify_open_window_uniqueness$
BEGIN
  BEGIN
    INSERT INTO public.training_plan_versions (
      program_id, user_id, version, status, reference_version, policy_version,
      intent, input_snapshot, plan_mode, window_start, window_end, sequence_number
    ) VALUES (
      current_setting('rolling_test.program')::UUID,
      current_setting('rolling_test.user_1')::UUID,
      99, 'proposed', 'complete-programming-0.1.0', 'rolling-weekly-0.1.0',
      '{"horizon_weeks":1}'::JSONB, '{}'::JSONB, 'rolling_weekly',
      DATE '2026-09-14', DATE '2026-09-20', 2
    );
    RAISE EXCEPTION 'An overlapping open rolling window was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$verify_open_window_uniqueness$;

DO $verify_invalid_horizon$
BEGIN
  BEGIN
    INSERT INTO public.training_plan_versions (
      program_id, user_id, version, status, reference_version, policy_version,
      intent, input_snapshot, plan_mode, window_start, window_end, sequence_number
    ) VALUES (
      current_setting('rolling_test.program')::UUID,
      current_setting('rolling_test.user_1')::UUID,
      100, 'rejected', 'complete-programming-0.1.0', 'rolling-weekly-0.1.0',
      '{"horizon_weeks":8}'::JSONB, '{}'::JSONB, 'rolling_weekly',
      DATE '2026-09-21', DATE '2026-09-27', 3
    );
    RAISE EXCEPTION 'A rolling plan accepted an eight-week horizon';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$verify_invalid_horizon$;

SELECT * FROM public.accept_adaptation_proposal(
  current_setting('rolling_test.proposal_2')::UUID,
  'rolling-replacement-verifier'
);

DO $verify_week_transition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_programs
    WHERE id = current_setting('rolling_test.program')::UUID
      AND active_plan_version_id = current_setting('rolling_test.plan_2')::UUID
      AND start_date = DATE '2026-09-14'
      AND end_date = DATE '2026-09-20'
  ) OR (SELECT status FROM public.training_plan_versions
        WHERE id = current_setting('rolling_test.plan_1')::UUID) <> 'superseded'
    OR (SELECT status FROM public.training_plan_versions
        WHERE id = current_setting('rolling_test.plan_2')::UUID) <> 'accepted'
    OR (SELECT count(*) FROM public.prescribed_sessions
        WHERE plan_version_id = current_setting('rolling_test.plan_2')::UUID) <> 1 THEN
    RAISE EXCEPTION 'Weekly acceptance did not atomically move the active window';
  END IF;
END
$verify_week_transition$;

DO $verify_stale_review$
BEGIN
  BEGIN
    PERFORM * FROM public.record_coach_weekly_review(
      current_setting('rolling_test.program')::UUID,
      current_setting('rolling_test.plan_1')::UUID,
      DATE '2026-09-07', 'athlete_requested', 'collect_signal', 'needs_signal',
      'insufficient', 0.3, '{}'::JSONB, '{}'::JSONB, '{}'::JSONB,
      '["compatible direct outcome"]'::JSONB, NULL, '{}'::JSONB, '[]'::JSONB,
      'rolling-weekly-0.1.0', 'weekly-review-0.1.0', repeat('4', 64),
      'rolling-stale-review'
    );
    RAISE EXCEPTION 'A superseded week accepted a new review';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
END
$verify_stale_review$;

DO $verify_review_immutable$
BEGIN
  BEGIN
    UPDATE public.coach_weekly_reviews
    SET confidence = 0.1
    WHERE id = current_setting('rolling_test.review')::UUID;
    RAISE EXCEPTION 'A weekly review was mutable';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END
$verify_review_immutable$;

DO $verify_cross_tenant_link$
BEGIN
  BEGIN
    INSERT INTO public.coach_weekly_review_observations (
      user_id, review_id, observation_group_id, disposition
    ) VALUES (
      current_setting('rolling_test.user_1')::UUID,
      current_setting('rolling_test.review')::UUID,
      current_setting('rolling_test.group_2')::UUID,
      'included'
    );
    RAISE EXCEPTION 'A weekly review linked another athlete observation';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$verify_cross_tenant_link$;

DO $verify_privileges$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.coach_weekly_reviews', 'SELECT')
    OR has_table_privilege('authenticated', 'public.coach_weekly_reviews', 'INSERT')
    OR has_table_privilege('authenticated', 'public.coach_weekly_review_observations', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.training_programs', 'INSERT')
    OR has_table_privilege('authenticated', 'public.training_plan_versions', 'INSERT')
    OR has_table_privilege('authenticated', 'public.adaptation_proposals', 'INSERT')
    OR NOT has_function_privilege(
      'authenticated',
      'public.record_coach_weekly_review(uuid,uuid,date,text,text,text,text,numeric,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,text,text)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Rolling-week grants are unsafe or incomplete';
  END IF;
END
$verify_privileges$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('rolling_test.user_2'), TRUE);

DO $verify_rls$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('coach_weekly_reviews', 'coach_weekly_review_observations')
      AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
  ) OR EXISTS (SELECT 1 FROM public.coach_weekly_reviews)
    OR EXISTS (SELECT 1 FROM public.coach_weekly_review_observations) THEN
    RAISE EXCEPTION 'Rolling-week review RLS did not isolate the second athlete';
  END IF;
END
$verify_rls$;

RESET ROLE;

ROLLBACK;

SELECT 'rollback-complete' AS verification_status;
