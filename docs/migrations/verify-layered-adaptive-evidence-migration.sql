-- Rollback-only verifier for layered-adaptive-evidence-migration.sql.
-- Run after the base workout and coach-system migrations plus the layered
-- adaptive evidence migration. Every fixture is rolled back.

BEGIN;

SELECT set_config('adaptive_evidence_test.user_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('adaptive_evidence_test.user_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('adaptive_evidence_test.workout_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('adaptive_evidence_test.workout_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('adaptive_evidence_test.import_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('adaptive_evidence_test.import_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('adaptive_evidence_test.group_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('adaptive_evidence_test.group_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('adaptive_evidence_test.group_3', gen_random_uuid()::TEXT, TRUE);

INSERT INTO auth.users (id)
VALUES
  (current_setting('adaptive_evidence_test.user_1')::UUID),
  (current_setting('adaptive_evidence_test.user_2')::UUID);

INSERT INTO public.workouts (
  id,
  user_id,
  workout_date,
  input_text,
  blocks
)
VALUES
  (
    current_setting('adaptive_evidence_test.workout_1')::UUID,
    current_setting('adaptive_evidence_test.user_1')::UUID,
    CURRENT_DATE,
    'adaptive evidence verifier user one',
    '[]'::JSONB
  ),
  (
    current_setting('adaptive_evidence_test.workout_2')::UUID,
    current_setting('adaptive_evidence_test.user_2')::UUID,
    CURRENT_DATE,
    'adaptive evidence verifier user two',
    '[]'::JSONB
  );

INSERT INTO public.measurement_imports (
  id,
  user_id,
  source_system,
  source_file_name,
  source_file_hash,
  source_schema_version,
  parser_version,
  status,
  raw_artifact_bucket,
  raw_artifact_path,
  raw_artifact_retention_class,
  raw_artifact_expires_at,
  manifest
)
VALUES
  (
    current_setting('adaptive_evidence_test.import_1')::UUID,
    current_setting('adaptive_evidence_test.user_1')::UUID,
    'verifier-device',
    'user-one.csv',
    repeat('1', 64),
    'export-v1',
    'parser-v1',
    'pending_review',
    'adaptive-evidence-private',
    current_setting('adaptive_evidence_test.user_1') || '/imports/user-one.csv',
    'verification-30-days',
    NOW() + INTERVAL '30 days',
    '{"rowCount":1}'::JSONB
  ),
  (
    current_setting('adaptive_evidence_test.import_2')::UUID,
    current_setting('adaptive_evidence_test.user_2')::UUID,
    'verifier-device',
    'user-two.csv',
    repeat('2', 64),
    'export-v1',
    'parser-v1',
    'pending_review',
    NULL,
    NULL,
    NULL,
    NULL,
    '{"rowCount":1}'::JSONB
  );

DO $verify_duplicate_import_hash$
BEGIN
  INSERT INTO public.measurement_imports (
    user_id,
    source_system,
    source_file_hash,
    source_schema_version,
    parser_version
  )
  VALUES (
    current_setting('adaptive_evidence_test.user_1')::UUID,
    'verifier-device',
    repeat('1', 64),
    'export-v1',
    'parser-v2'
  );

  RAISE EXCEPTION 'A second active import with the same source hash was accepted';
EXCEPTION
  WHEN unique_violation THEN
    NULL;
END
$verify_duplicate_import_hash$;

DO $verify_import_content_immutable$
DECLARE
  mutation_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.measurement_imports
    SET source_file_hash = repeat('9', 64)
    WHERE id = current_setting('adaptive_evidence_test.import_1')::UUID;
  EXCEPTION
    WHEN raise_exception THEN
      mutation_rejected := TRUE;
  END;

  IF NOT mutation_rejected THEN
    RAISE EXCEPTION 'Measurement import source identity was rewritten';
  END IF;
END
$verify_import_content_immutable$;

INSERT INTO public.performance_observation_groups (
  id,
  user_id,
  source_import_id,
  workout_id,
  observation_kind,
  status,
  observed_at,
  source_kind,
  source_system,
  source_device,
  source_record_id,
  assessment_definition_id,
  assessment_catalog_version,
  protocol_version,
  parser_version,
  verification_status,
  verified_at,
  verified_by,
  comparability_key,
  comparison_modifiers
)
VALUES
  (
    current_setting('adaptive_evidence_test.group_1')::UUID,
    current_setting('adaptive_evidence_test.user_1')::UUID,
    current_setting('adaptive_evidence_test.import_1')::UUID,
    current_setting('adaptive_evidence_test.workout_1')::UUID,
    'strength_set',
    'complete',
    NOW() - INTERVAL '1 minute',
    'import',
    'verifier-device',
    'verifier-unit',
    'source-record-1',
    'strength.rep-max',
    '0.1.0',
    'rep-max-v1',
    'parser-v1',
    'athlete_confirmed',
    NOW(),
    current_setting('adaptive_evidence_test.user_1')::UUID,
    'comparison-v1:strength.rep-max:rep-max-v1:back-squat',
    '{"movement":"back-squat"}'::JSONB
  ),
  (
    current_setting('adaptive_evidence_test.group_2')::UUID,
    current_setting('adaptive_evidence_test.user_1')::UUID,
    NULL,
    current_setting('adaptive_evidence_test.workout_1')::UUID,
    'session_outcome',
    'complete',
    NOW() - INTERVAL '1 minute',
    'derived',
    'sociusfit',
    'none',
    'derived-record-1',
    'session.outcome',
    '0.1.0',
    'session-outcome-v1',
    'derived-v1',
    'system_verified',
    NOW(),
    NULL,
    'comparison-v1:session.outcome:session-outcome-v1',
    '{}'::JSONB
  ),
  (
    current_setting('adaptive_evidence_test.group_3')::UUID,
    current_setting('adaptive_evidence_test.user_2')::UUID,
    current_setting('adaptive_evidence_test.import_2')::UUID,
    current_setting('adaptive_evidence_test.workout_2')::UUID,
    'sprint_attempt',
    'complete',
    NOW() - INTERVAL '1 minute',
    'import',
    'verifier-device',
    'verifier-unit',
    'source-record-2',
    'sprint.time',
    '0.1.0',
    'sprint-20m-v1',
    'parser-v1',
    'unverified',
    NULL,
    NULL,
    'comparison-v1:sprint.time:sprint-20m-v1:20m',
    '{"distance":20,"distanceUnit":"m"}'::JSONB
  );

DO $verify_duplicate_source_id$
BEGIN
  INSERT INTO public.performance_observation_groups (
    user_id,
    source_import_id,
    workout_id,
    observation_kind,
    status,
    observed_at,
    source_kind,
    source_system,
    source_device,
    source_record_id,
    assessment_definition_id,
    assessment_catalog_version,
    protocol_version,
    parser_version,
    comparability_key
  )
  VALUES (
    current_setting('adaptive_evidence_test.user_1')::UUID,
    current_setting('adaptive_evidence_test.import_1')::UUID,
    current_setting('adaptive_evidence_test.workout_1')::UUID,
    'strength_set',
    'complete',
    NOW() - INTERVAL '1 minute',
    'import',
    'verifier-device',
    'verifier-unit',
    'source-record-1',
    'strength.rep-max',
    '0.1.0',
    'rep-max-v1',
    'parser-v2',
    'comparison-v1:strength.rep-max:rep-max-v1:back-squat'
  );

  RAISE EXCEPTION 'A second active observation with the same source record was accepted';
EXCEPTION
  WHEN unique_violation THEN
    NULL;
END
$verify_duplicate_source_id$;

DO $verify_cross_user_workout_reference$
BEGIN
  INSERT INTO public.performance_observation_groups (
    user_id,
    workout_id,
    observation_kind,
    status,
    observed_at,
    source_kind,
    source_system,
    source_device,
    source_record_id,
    assessment_definition_id,
    assessment_catalog_version,
    protocol_version,
    parser_version,
    comparability_key
  )
  VALUES (
    current_setting('adaptive_evidence_test.user_2')::UUID,
    current_setting('adaptive_evidence_test.workout_1')::UUID,
    'readiness_check',
    'complete',
    NOW() - INTERVAL '1 minute',
    'manual',
    'sociusfit',
    'none',
    'cross-user-workout',
    'readiness.self-report',
    '0.1.0',
    'readiness-v1',
    'manual-v1',
    'comparison-v1:readiness.self-report:readiness-v1'
  );

  RAISE EXCEPTION 'A cross-user canonical workout reference was accepted';
EXCEPTION
  WHEN foreign_key_violation THEN
    NULL;
END
$verify_cross_user_workout_reference$;

DO $verify_observation_content_immutable$
DECLARE
  mutation_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.performance_observation_groups
    SET comparison_modifiers = '{"movement":"rewritten"}'::JSONB
    WHERE id = current_setting('adaptive_evidence_test.group_1')::UUID;
  EXCEPTION
    WHEN raise_exception THEN
      mutation_rejected := TRUE;
  END;

  IF NOT mutation_rejected THEN
    RAISE EXCEPTION 'Performance observation content was rewritten';
  END IF;
END
$verify_observation_content_immutable$;

DO $verify_observation_status_monotonic$
DECLARE
  reactivation_rejected BOOLEAN := FALSE;
BEGIN
  UPDATE public.performance_observation_groups
  SET
    status = 'excluded',
    exclusion_reason = 'migration verifier correction'
  WHERE id = current_setting('adaptive_evidence_test.group_2')::UUID;

  BEGIN
    UPDATE public.performance_observation_groups
    SET
      status = 'complete',
      exclusion_reason = NULL
    WHERE id = current_setting('adaptive_evidence_test.group_2')::UUID;
  EXCEPTION
    WHEN raise_exception THEN
      reactivation_rejected := TRUE;
  END;

  IF NOT reactivation_rejected THEN
    RAISE EXCEPTION 'An excluded observation was silently reactivated';
  END IF;
END
$verify_observation_status_monotonic$;

INSERT INTO public.performance_observation_values (
  group_id,
  user_id,
  metric_id,
  semantic_role,
  value_numeric,
  unit,
  provenance
)
VALUES
  (
    current_setting('adaptive_evidence_test.group_1')::UUID,
    current_setting('adaptive_evidence_test.user_1')::UUID,
    'strength.load',
    'direct_outcome',
    100,
    'kg',
    '{"sourceColumn":"load"}'::JSONB
  ),
  (
    current_setting('adaptive_evidence_test.group_3')::UUID,
    current_setting('adaptive_evidence_test.user_2')::UUID,
    'sprint.time',
    'direct_outcome',
    3.15,
    's',
    '{"sourceColumn":"time"}'::JSONB
  );

DO $verify_observation_value_immutable$
DECLARE
  mutation_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.performance_observation_values
    SET value_numeric = 101
    WHERE group_id = current_setting('adaptive_evidence_test.group_1')::UUID;
  EXCEPTION
    WHEN raise_exception THEN
      mutation_rejected := TRUE;
  END;

  IF NOT mutation_rejected THEN
    RAISE EXCEPTION 'Performance observation value was rewritten';
  END IF;
END
$verify_observation_value_immutable$;

INSERT INTO public.performance_observation_links (
  user_id,
  derived_group_id,
  source_group_id,
  provenance
)
VALUES (
  current_setting('adaptive_evidence_test.user_1')::UUID,
  current_setting('adaptive_evidence_test.group_2')::UUID,
  current_setting('adaptive_evidence_test.group_1')::UUID,
  '{"derivation":"session-summary-v1"}'::JSONB
);

DO $verify_cross_user_observation_link$
BEGIN
  INSERT INTO public.performance_observation_links (
    user_id,
    derived_group_id,
    source_group_id
  )
  VALUES (
    current_setting('adaptive_evidence_test.user_1')::UUID,
    current_setting('adaptive_evidence_test.group_2')::UUID,
    current_setting('adaptive_evidence_test.group_3')::UUID
  );

  RAISE EXCEPTION 'A cross-user observation lineage link was accepted';
EXCEPTION
  WHEN foreign_key_violation THEN
    NULL;
END
$verify_cross_user_observation_link$;

INSERT INTO public.coach_memories (
  user_id,
  idempotency_key,
  memory_key,
  kind,
  version,
  status,
  content,
  provenance,
  confirmed_at,
  effective_from,
  effective_until,
  review_after,
  last_reviewed_at
)
VALUES (
  current_setting('adaptive_evidence_test.user_1')::UUID,
  'adaptive-evidence-memory-lifecycle',
  'temporary_training_constraint',
  'constraint',
  1,
  'withdrawn',
  '{"constraint":"temporary"}'::JSONB,
  '{"source":"migration-verifier"}'::JSONB,
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '7 days'
);

DO $verify_memory_lifecycle$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.coach_memories
    WHERE user_id = current_setting('adaptive_evidence_test.user_1')::UUID
      AND memory_key = 'temporary_training_constraint'
      AND status = 'withdrawn'
      AND effective_until < NOW()
      AND review_after IS NOT NULL
      AND last_reviewed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Expired or withdrawn memory lifecycle is not representable';
  END IF;
END
$verify_memory_lifecycle$;

DO $verify_evidence_privileges$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'measurement_imports',
    'performance_observation_groups',
    'performance_observation_values',
    'performance_observation_links'
  ] LOOP
    IF NOT has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
      OR has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
      OR has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
      OR has_table_privilege('authenticated', 'public.' || table_name, 'DELETE')
      OR has_table_privilege('anon', 'public.' || table_name, 'SELECT')
      OR has_table_privilege('anon', 'public.' || table_name, 'INSERT')
      OR has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
      OR has_table_privilege('anon', 'public.' || table_name, 'DELETE') THEN
      RAISE EXCEPTION 'Table privileges are incorrect for public.%', table_name;
    END IF;
  END LOOP;
END
$verify_evidence_privileges$;

DO $verify_evidence_rls$
DECLARE
  table_name TEXT;
  rls_state RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'measurement_imports',
    'performance_observation_groups',
    'performance_observation_values',
    'performance_observation_links'
  ] LOOP
    SELECT relrowsecurity, relforcerowsecurity
    INTO rls_state
    FROM pg_class
    WHERE oid = to_regclass('public.' || table_name);

    IF NOT rls_state.relrowsecurity OR NOT rls_state.relforcerowsecurity THEN
      RAISE EXCEPTION 'public.% must have enabled and forced RLS', table_name;
    END IF;
  END LOOP;
END
$verify_evidence_rls$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('adaptive_evidence_test.user_1'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('adaptive_evidence_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

DO $verify_evidence_rls_visibility$
BEGIN
  IF (SELECT count(*) FROM public.measurement_imports) <> 1
    OR (SELECT count(*) FROM public.performance_observation_groups) <> 2
    OR (SELECT count(*) FROM public.performance_observation_values) <> 1
    OR (SELECT count(*) FROM public.performance_observation_links) <> 1 THEN
    RAISE EXCEPTION 'Authenticated evidence reads exposed another athlete or hid owned data';
  END IF;
END
$verify_evidence_rls_visibility$;

RESET ROLE;

ROLLBACK;
