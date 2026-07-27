-- Rollback-only verification for coach-system-migration.sql.
--
-- Apply the migration twice first. This verifier creates two synthetic auth
-- users inside its rollback-only transaction, exercises cross-user RLS,
-- accepts one proposal twice to prove
-- idempotency, activates a replacement, rejects a stale proposal, and rolls
-- every fixture back.

BEGIN;

SELECT set_config('coach_migration_test.user_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.user_2', gen_random_uuid()::TEXT, TRUE);

INSERT INTO auth.users (id)
VALUES
  (current_setting('coach_migration_test.user_1')::UUID),
  (current_setting('coach_migration_test.user_2')::UUID);

DO $verify_prerequisites$
DECLARE
  table_name TEXT;
  rls_state RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'coach_strength_assessments',
    'coach_memories',
    'training_programs',
    'training_plan_versions',
    'prescribed_sessions',
    'adaptation_proposals',
    'coach_checkins'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      RAISE EXCEPTION 'public.% does not exist', table_name;
    END IF;

    SELECT relrowsecurity, relforcerowsecurity
    INTO rls_state
    FROM pg_class
    WHERE oid = to_regclass('public.' || table_name);

    IF NOT rls_state.relrowsecurity OR NOT rls_state.relforcerowsecurity THEN
      RAISE EXCEPTION 'public.% must have enabled and forced RLS', table_name;
    END IF;
  END LOOP;
END
$verify_prerequisites$;

SELECT set_config('coach_migration_test.assessment_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.program_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.plan_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.plan_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.plan_3', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.session_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.proposal_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.proposal_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_migration_test.proposal_3', gen_random_uuid()::TEXT, TRUE);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('coach_migration_test.user_1'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('coach_migration_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

INSERT INTO public.coach_strength_assessments (
  id,
  user_id,
  idempotency_key,
  input_fingerprint,
  movement,
  load,
  unit,
  reps,
  assessed_on,
  is_true_rep_max,
  athlete_confidence,
  estimated_1rm,
  estimate_kind,
  calculator_version,
  provenance
)
VALUES (
  current_setting('coach_migration_test.assessment_1')::UUID,
  current_setting('coach_migration_test.user_1')::UUID,
  'coach-assessment-verify-1',
  repeat('0', 64),
  '__coach_migration_back_squat__',
  100,
  'kg',
  5,
  CURRENT_DATE,
  true,
  0.9,
  116.7,
  'estimated_1rm',
  'epley-general-v1',
  '{"source":"migration_verifier"}'::JSONB
);

SELECT *
FROM public.confirm_coach_memory(
  'primary_goal',
  'goal',
  '{"goal":"verify durable coach memory"}'::JSONB,
  '{"source":"migration_verifier"}'::JSONB,
  1,
  'coach-memory-verify-initial'
);

DO $verify_memory_idempotency_payload$
BEGIN
  PERFORM 1
  FROM public.confirm_coach_memory(
    'primary_goal',
    'goal',
    '{"goal":"different data must not reuse the same key"}'::JSONB,
    '{"source":"migration_verifier"}'::JSONB,
    1,
    'coach-memory-verify-initial'
  );

  RAISE EXCEPTION 'Memory idempotency key accepted different data';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$verify_memory_idempotency_payload$;

-- The same idempotency key must return the existing memory version.
SELECT *
FROM public.confirm_coach_memory(
  'primary_goal',
  'goal',
  '{"goal":"verify durable coach memory"}'::JSONB,
  '{"source":"migration_verifier"}'::JSONB,
  1,
  'coach-memory-verify-initial'
);

WITH created AS (
  SELECT *
  FROM public.create_initial_training_plan_proposal(
    '__coach_migration_program__',
    'Verify atomic eight-week plan acceptance',
    CURRENT_DATE,
    '0.1.0',
    '0.1.0',
    '{"horizon_weeks":8,"primary_goal":"verification"}'::JSONB,
    '{"generated_at":"2026-07-27T00:00:00Z","sources":[]}'::JSONB,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'week_number', week_number,
        'session_index', session_index,
        'scheduled_date', CURRENT_DATE + ((week_number - 1) * 7) + ((session_index - 1) * 2),
        'prescription', jsonb_build_object(
          'domain', 'strength',
          'intent', 'verify',
          'dose', jsonb_build_object('source', 'validated_policy'),
          'effort', 'controlled',
          'rest', 'repeatable quality',
          'success_condition', 'intent met',
          'stop_condition', 'quality loss',
          'scale_options', '[]'::JSONB,
          'evidence', '[]'::JSONB
        )
      ))
      FROM generate_series(1, 8) AS week_number
      CROSS JOIN generate_series(1, 2) AS session_index
    ),
    '{"reason":"initial acceptance"}'::JSONB,
    repeat('1', 64),
    'coach-verify-initial'
  )
)
SELECT
  set_config('coach_migration_test.proposal_1', proposal_id::TEXT, TRUE),
  set_config('coach_migration_test.program_1', proposed_program_id::TEXT, TRUE),
  set_config('coach_migration_test.plan_1', proposed_plan_version_id::TEXT, TRUE)
FROM created;

-- The same key and input fingerprint must return the existing proposal.
SELECT *
FROM public.create_initial_training_plan_proposal(
  '__coach_migration_program__',
  'Verify atomic eight-week plan acceptance',
  CURRENT_DATE,
  '0.1.0',
  '0.1.0',
  '{"horizon_weeks":8,"primary_goal":"verification"}'::JSONB,
  '{"generated_at":"2026-07-27T00:00:00Z","sources":[]}'::JSONB,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'week_number', week_number,
      'session_index', session_index,
      'scheduled_date', CURRENT_DATE + ((week_number - 1) * 7) + ((session_index - 1) * 2),
      'prescription', jsonb_build_object(
        'domain', 'strength',
        'intent', 'verify',
        'dose', jsonb_build_object('source', 'validated_policy'),
        'effort', 'controlled',
        'rest', 'repeatable quality',
        'success_condition', 'intent met',
        'stop_condition', 'quality loss',
        'scale_options', '[]'::JSONB,
        'evidence', '[]'::JSONB
      )
    ))
    FROM generate_series(1, 8) AS week_number
    CROSS JOIN generate_series(1, 2) AS session_index
  ),
  '{"reason":"initial acceptance"}'::JSONB,
  repeat('1', 64),
  'coach-verify-initial'
);

DO $verify_initial_proposal_idempotency_payload$
BEGIN
  PERFORM *
  FROM public.create_initial_training_plan_proposal(
    '__coach_migration_program__',
    'Different data must not reuse the same proposal key',
    CURRENT_DATE,
    '0.1.0',
    '0.1.0',
    '{"horizon_weeks":8,"primary_goal":"verification"}'::JSONB,
    '{"generated_at":"2026-07-27T00:00:00Z","sources":[]}'::JSONB,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'week_number', week_number,
        'session_index', session_index,
        'scheduled_date', CURRENT_DATE,
        'prescription', jsonb_build_object(
          'domain', 'strength',
          'intent', 'verify',
          'dose', jsonb_build_object('source', 'validated_policy'),
          'effort', 'controlled',
          'rest', 'repeatable quality',
          'success_condition', 'intent met',
          'stop_condition', 'quality loss',
          'scale_options', '[]'::JSONB,
          'evidence', '[]'::JSONB
        )
      ))
      FROM generate_series(1, 8) AS week_number
      CROSS JOIN generate_series(1, 2) AS session_index
    ),
    '{"reason":"mismatch"}'::JSONB,
    repeat('2', 64),
    'coach-verify-initial'
  );

  RAISE EXCEPTION 'Training proposal idempotency key accepted different data';
EXCEPTION
  WHEN invalid_parameter_value THEN NULL;
END
$verify_initial_proposal_idempotency_payload$;

SELECT *
FROM public.accept_adaptation_proposal(
  current_setting('coach_migration_test.proposal_1')::UUID,
  'coach-verify-initial'
);

-- The same proposal and key must return the already-active version.
SELECT *
FROM public.accept_adaptation_proposal(
  current_setting('coach_migration_test.proposal_1')::UUID,
  'coach-verify-initial'
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
VALUES
(
  current_setting('coach_migration_test.plan_2')::UUID,
  current_setting('coach_migration_test.program_1')::UUID,
  current_setting('coach_migration_test.user_1')::UUID,
  2,
  '0.1.0',
  '0.1.0',
  '{"horizon_weeks":8,"primary_goal":"replacement"}'::JSONB,
  '{"generated_at":"2026-07-27T00:01:00Z","sources":[]}'::JSONB
),
(
  current_setting('coach_migration_test.plan_3')::UUID,
  current_setting('coach_migration_test.program_1')::UUID,
  current_setting('coach_migration_test.user_1')::UUID,
  3,
  '0.1.0',
  '0.1.0',
  '{"horizon_weeks":8,"primary_goal":"stale"}'::JSONB,
  '{"generated_at":"2026-07-27T00:02:00Z","sources":[]}'::JSONB
);

INSERT INTO public.adaptation_proposals (
  id,
  user_id,
  program_id,
  base_plan_version_id,
  proposed_plan_version_id,
  idempotency_key,
  rationale
)
VALUES
(
  current_setting('coach_migration_test.proposal_2')::UUID,
  current_setting('coach_migration_test.user_1')::UUID,
  current_setting('coach_migration_test.program_1')::UUID,
  current_setting('coach_migration_test.plan_1')::UUID,
  current_setting('coach_migration_test.plan_2')::UUID,
  'coach-verify-replacement',
  '{"reason":"replacement acceptance"}'::JSONB
),
(
  current_setting('coach_migration_test.proposal_3')::UUID,
  current_setting('coach_migration_test.user_1')::UUID,
  current_setting('coach_migration_test.program_1')::UUID,
  current_setting('coach_migration_test.plan_1')::UUID,
  current_setting('coach_migration_test.plan_3')::UUID,
  'coach-verify-stale',
  '{"reason":"must fail after replacement"}'::JSONB
);

SELECT *
FROM public.accept_adaptation_proposal(
  current_setting('coach_migration_test.proposal_2')::UUID,
  'coach-verify-replacement'
);

DO $verify_stale_proposal$
BEGIN
  BEGIN
    PERFORM *
    FROM public.accept_adaptation_proposal(
      current_setting('coach_migration_test.proposal_3')::UUID,
      'coach-verify-stale'
    );
    RAISE EXCEPTION 'Stale proposal was accepted';
  EXCEPTION
    WHEN serialization_failure THEN NULL;
  END;
END
$verify_stale_proposal$;

DO $verify_user_1_state$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.training_plan_versions
    WHERE program_id = current_setting('coach_migration_test.program_1')::UUID
      AND status = 'accepted'
  ) <> 1 THEN
    RAISE EXCEPTION 'Program must have exactly one accepted plan version';
  END IF;

  IF (
    SELECT active_plan_version_id
    FROM public.training_programs
    WHERE id = current_setting('coach_migration_test.program_1')::UUID
  ) IS DISTINCT FROM current_setting('coach_migration_test.plan_2')::UUID THEN
    RAISE EXCEPTION 'Replacement plan was not activated';
  END IF;
END
$verify_user_1_state$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('coach_migration_test.user_2'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('coach_migration_test.user_2'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

DO $verify_cross_user_visibility$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.coach_strength_assessments
    WHERE id = current_setting('coach_migration_test.assessment_1')::UUID
  ) THEN
    RAISE EXCEPTION 'User 2 can read user 1 strength assessment';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.training_programs
    WHERE id = current_setting('coach_migration_test.program_1')::UUID
  ) THEN
    RAISE EXCEPTION 'User 2 can read user 1 training program';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.coach_memories
    WHERE memory_key = 'primary_goal'
  ) THEN
    RAISE EXCEPTION 'User 2 can read user 1 coach memory';
  END IF;
END
$verify_cross_user_visibility$;

RESET ROLE;
ROLLBACK;

-- Success means every statement completed and the transaction rolled back.
