-- Rollback-only verifier for qwik-vbt-import-migration.sql.
-- Run after the base workout, coach-system, layered adaptive evidence, and
-- Qwik VBT import migrations. Every fixture is rolled back.

BEGIN;

SELECT set_config('qwik_test.user_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('qwik_test.user_2', gen_random_uuid()::TEXT, TRUE);

INSERT INTO auth.users (id)
VALUES
  (current_setting('qwik_test.user_1')::UUID),
  (current_setting('qwik_test.user_2')::UUID);

CREATE TEMPORARY TABLE qwik_request_fixture (
  idempotency_key TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL,
  source_device TEXT NOT NULL,
  manifest JSONB NOT NULL,
  sets JSONB NOT NULL
);

INSERT INTO qwik_request_fixture (
  idempotency_key,
  source_file_name,
  source_file_hash,
  captured_at,
  exported_at,
  source_device,
  manifest,
  sets
)
VALUES (
  'qwik-verifier-request-1',
  'qwik-verifier.json',
  repeat('a', 64),
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '2 hours',
  'verifier_phone',
  '{"sourceByteLength":4096,"rawArtifactUploaded":false,"rawStoragePolicy":"user_retained_not_uploaded","warningCount":0,"warningCodes":[]}'::JSONB,
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'sourceSetId', 'qwik-set-mapped-1',
      'sourceExercise', 'Bench Press',
      'observedAt', NOW() - INTERVAL '4 hours',
      'capturedAt', NOW() - INTERVAL '3 hours',
      'workoutDate', (((NOW() - INTERVAL '4 hours') AT TIME ZONE 'UTC')::DATE)::TEXT,
      'mappingStatus', 'mapped',
      'canonicalMovementId', 'barbell_bench_press',
      'canonicalMovementName', 'Barbell bench press',
      'candidateMovementIds', '["barbell_bench_press"]'::JSONB,
      'comparabilityKey', 'comparison-v1|metric=bar.mean_velocity|movement=barbell_bench_press|technique_modifiers=paused',
      'comparison', pg_catalog.jsonb_build_object(
        'movementId', 'barbell_bench_press',
        'variationId', 'press:barbell_bench',
        'repetitions', 1,
        'externalLoad', '{"value":100,"unit":"kg"}'::JSONB,
        'distance', NULL,
        'duration', NULL,
        'equipmentIds', '["barbell","bench"]'::JSONB,
        'techniqueModifiers', '["paused"]'::JSONB,
        'environmentModifiers', '[]'::JSONB
      ),
      'rpe', 8,
      'notes', NULL,
      'tags', '["paused"]'::JSONB,
      'techniqueModifiers', '["paused"]'::JSONB,
      'velocityLossPercent', 0,
      'repMetadata', '[{"sourceRepId":"qwik-rep-mapped-1","barPathPresent":true,"barPathPointCount":2}]'::JSONB,
      'values', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'metricId', 'strength.load',
          'semanticRole', 'training_signal',
          'value', 100,
          'unit', 'kg',
          'ordinal', 0,
          'provenance', '{"sourceField":"load","originalValue":100,"originalUnit":"kg","canonicalValue":100,"canonicalUnit":"kg"}'::JSONB
        ),
        pg_catalog.jsonb_build_object(
          'metricId', 'strength.repetitions',
          'semanticRole', 'training_signal',
          'value', 1,
          'unit', 'repetitions',
          'ordinal', 0,
          'provenance', '{"sourceField":"reps","sourceRepIds":["qwik-rep-mapped-1"]}'::JSONB
        ),
        pg_catalog.jsonb_build_object(
          'metricId', 'bar.mean_velocity',
          'semanticRole', 'direct_outcome',
          'value', 0.58,
          'unit', 'm_per_s',
          'ordinal', 0,
          'provenance', '{"sourceField":"reps.concentric.mean_velocity_mps","sourceRepId":"qwik-rep-mapped-1","originalValue":0.58,"originalUnit":"m_per_s"}'::JSONB
        )
      )
    ),
    pg_catalog.jsonb_build_object(
      'sourceSetId', 'qwik-set-review-1',
      'sourceExercise', 'Goblet Squat',
      'observedAt', NOW() - INTERVAL '3 hours 30 minutes',
      'capturedAt', NOW() - INTERVAL '3 hours',
      'workoutDate', (((NOW() - INTERVAL '3 hours 30 minutes') AT TIME ZONE 'UTC')::DATE)::TEXT,
      'mappingStatus', 'ambiguous',
      'canonicalMovementId', NULL,
      'canonicalMovementName', NULL,
      'candidateMovementIds', '["dumbbell_goblet_squat","kettlebell_goblet_squat"]'::JSONB,
      'comparabilityKey', NULL,
      'comparison', pg_catalog.jsonb_build_object(
        'movementId', NULL,
        'variationId', NULL,
        'repetitions', 1,
        'externalLoad', '{"value":32,"unit":"kg"}'::JSONB,
        'distance', NULL,
        'duration', NULL,
        'equipmentIds', '[]'::JSONB,
        'techniqueModifiers', '[]'::JSONB,
        'environmentModifiers', '[]'::JSONB
      ),
      'rpe', NULL,
      'notes', NULL,
      'tags', '[]'::JSONB,
      'techniqueModifiers', '[]'::JSONB,
      'velocityLossPercent', NULL,
      'repMetadata', '[{"sourceRepId":"qwik-rep-review-1","barPathPresent":false,"barPathPointCount":0}]'::JSONB,
      'values', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'metricId', 'strength.load',
          'semanticRole', 'training_signal',
          'value', 32,
          'unit', 'kg',
          'ordinal', 0,
          'provenance', '{"sourceField":"load","originalValue":32,"originalUnit":"kg","canonicalValue":32,"canonicalUnit":"kg"}'::JSONB
        ),
        pg_catalog.jsonb_build_object(
          'metricId', 'strength.repetitions',
          'semanticRole', 'training_signal',
          'value', 1,
          'unit', 'repetitions',
          'ordinal', 0,
          'provenance', '{"sourceField":"reps","sourceRepIds":["qwik-rep-review-1"]}'::JSONB
        ),
        pg_catalog.jsonb_build_object(
          'metricId', 'bar.mean_velocity',
          'semanticRole', 'direct_outcome',
          'value', 0.72,
          'unit', 'm_per_s',
          'ordinal', 0,
          'provenance', '{"sourceField":"reps.concentric.mean_velocity_mps","sourceRepId":"qwik-rep-review-1","originalValue":0.72,"originalUnit":"m_per_s"}'::JSONB
        )
      )
    )
  )
);

SELECT set_config('request.jwt.claim.sub', current_setting('qwik_test.user_1'), TRUE);
SELECT set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'sub', current_setting('qwik_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

CREATE TEMPORARY TABLE qwik_recorded_result AS
SELECT result.*
FROM qwik_request_fixture AS fixture
CROSS JOIN LATERAL public.record_qwik_import_v1(
  fixture.idempotency_key,
  fixture.source_file_name,
  fixture.source_file_hash,
  'qwik-vbt-json-1.10',
  'qwik-import-0.1.0',
  fixture.captured_at,
  fixture.exported_at,
  fixture.source_device,
  fixture.manifest,
  fixture.sets
) AS result;

DO $verify_qwik_recorded$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM qwik_recorded_result
    WHERE disposition = 'recorded'
      AND observation_group_count = 2
      AND review_required
  ) THEN
    RAISE EXCEPTION 'Qwik import did not report one recorded review candidate';
  END IF;

  IF (SELECT count(*) FROM public.measurement_imports WHERE user_id = current_setting('qwik_test.user_1')::UUID) <> 1
    OR (SELECT count(*) FROM public.performance_observation_groups WHERE user_id = current_setting('qwik_test.user_1')::UUID) <> 2
    OR (SELECT count(*) FROM public.performance_observation_values WHERE user_id = current_setting('qwik_test.user_1')::UUID) <> 6 THEN
    RAISE EXCEPTION 'Qwik import did not atomically record the expected normalized rows';
  END IF;

  IF (SELECT count(*) FROM public.performance_observation_groups
      WHERE user_id = current_setting('qwik_test.user_1')::UUID
        AND status = 'complete'
        AND verification_status = 'unverified') <> 1
    OR (SELECT count(*) FROM public.performance_observation_groups
        WHERE user_id = current_setting('qwik_test.user_1')::UUID
          AND status = 'incomplete'
          AND verification_status = 'unverified'
          AND comparability_key IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Qwik mapping review states were not preserved';
  END IF;
END
$verify_qwik_recorded$;

CREATE TEMPORARY TABLE qwik_replay_result AS
SELECT result.*
FROM qwik_request_fixture AS fixture
CROSS JOIN LATERAL public.record_qwik_import_v1(
  fixture.idempotency_key,
  fixture.source_file_name,
  fixture.source_file_hash,
  'qwik-vbt-json-1.10',
  'qwik-import-0.1.0',
  fixture.captured_at,
  fixture.exported_at,
  fixture.source_device,
  fixture.manifest,
  fixture.sets
) AS result;

DO $verify_qwik_replay$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM qwik_replay_result
    WHERE disposition = 'replayed' AND observation_group_count = 2
  ) OR (SELECT count(*) FROM public.measurement_imports
        WHERE user_id = current_setting('qwik_test.user_1')::UUID) <> 1 THEN
    RAISE EXCEPTION 'Exact Qwik retry was not a no-op replay';
  END IF;
END
$verify_qwik_replay$;

CREATE TEMPORARY TABLE qwik_duplicate_result AS
SELECT result.*
FROM qwik_request_fixture AS fixture
CROSS JOIN LATERAL public.record_qwik_import_v1(
  'qwik-verifier-request-duplicate',
  fixture.source_file_name,
  fixture.source_file_hash,
  'qwik-vbt-json-1.10',
  'qwik-import-0.1.0',
  fixture.captured_at,
  fixture.exported_at,
  fixture.source_device,
  fixture.manifest,
  fixture.sets
) AS result;

DO $verify_qwik_duplicate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM qwik_duplicate_result
    WHERE disposition = 'duplicate' AND observation_group_count = 2
  ) OR (SELECT count(*) FROM public.measurement_imports
        WHERE user_id = current_setting('qwik_test.user_1')::UUID) <> 1 THEN
    RAISE EXCEPTION 'Repeated Qwik file hash was not a no-op duplicate';
  END IF;
END
$verify_qwik_duplicate$;

DO $verify_qwik_key_conflict$
DECLARE
  conflict_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.record_qwik_import_v1(
      fixture.idempotency_key,
      fixture.source_file_name,
      repeat('b', 64),
      'qwik-vbt-json-1.10',
      'qwik-import-0.1.0',
      fixture.captured_at,
      fixture.exported_at,
      fixture.source_device,
      fixture.manifest,
      fixture.sets
    )
    FROM qwik_request_fixture AS fixture;
  EXCEPTION WHEN invalid_parameter_value THEN
    conflict_rejected := TRUE;
  END;

  IF NOT conflict_rejected OR EXISTS (
    SELECT 1 FROM public.measurement_imports
    WHERE user_id = current_setting('qwik_test.user_1')::UUID
      AND source_file_hash = repeat('b', 64)
  ) THEN
    RAISE EXCEPTION 'Changed Qwik content reused an idempotency key';
  END IF;
END
$verify_qwik_key_conflict$;

DO $verify_qwik_source_conflict_atomic$
DECLARE
  conflict_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.record_qwik_import_v1(
      'qwik-verifier-source-conflict',
      fixture.source_file_name,
      repeat('c', 64),
      'qwik-vbt-json-1.10',
      'qwik-import-0.1.0',
      fixture.captured_at,
      fixture.exported_at,
      fixture.source_device,
      fixture.manifest,
      fixture.sets
    )
    FROM qwik_request_fixture AS fixture;
  EXCEPTION WHEN unique_violation THEN
    conflict_rejected := TRUE;
  END;

  IF NOT conflict_rejected OR EXISTS (
    SELECT 1 FROM public.measurement_imports
    WHERE user_id = current_setting('qwik_test.user_1')::UUID
      AND source_file_hash = repeat('c', 64)
  ) THEN
    RAISE EXCEPTION 'Qwik source-record conflict left a partial import';
  END IF;
END
$verify_qwik_source_conflict_atomic$;

DO $verify_qwik_no_raw_artifact$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.measurement_imports
    WHERE user_id = current_setting('qwik_test.user_1')::UUID
      AND (
        raw_artifact_bucket IS NOT NULL
        OR raw_artifact_path IS NOT NULL
        OR raw_artifact_retention_class IS NOT NULL
        OR raw_artifact_expires_at IS NOT NULL
        OR manifest->>'rawArtifactUploaded' <> 'false'
        OR manifest->>'rawStoragePolicy' <> 'user_retained_not_uploaded'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.performance_observation_groups
    WHERE user_id = current_setting('qwik_test.user_1')::UUID
      AND (metadata ? 'rawText' OR metadata ? 'bar_path' OR metadata ? 'barPath')
  ) THEN
    RAISE EXCEPTION 'Qwik import persisted a raw artifact or bar-path array';
  END IF;
END
$verify_qwik_no_raw_artifact$;

SELECT set_config('request.jwt.claim.sub', current_setting('qwik_test.user_2'), TRUE);
SELECT set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'sub', current_setting('qwik_test.user_2'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

SELECT result.*
FROM qwik_request_fixture AS fixture
CROSS JOIN LATERAL public.record_qwik_import_v1(
  fixture.idempotency_key,
  fixture.source_file_name,
  fixture.source_file_hash,
  'qwik-vbt-json-1.10',
  'qwik-import-0.1.0',
  fixture.captured_at,
  fixture.exported_at,
  fixture.source_device,
  fixture.manifest,
  fixture.sets
) AS result;

DO $verify_qwik_privileges$
DECLARE
  function_signature TEXT := 'public.record_qwik_import_v1(text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,jsonb,jsonb)';
BEGIN
  IF NOT has_function_privilege('authenticated', function_signature, 'EXECUTE')
    OR has_function_privilege('anon', function_signature, 'EXECUTE')
    OR has_function_privilege('service_role', function_signature, 'EXECUTE')
    OR NOT has_table_privilege('authenticated', 'public.measurement_imports', 'SELECT')
    OR has_table_privilege('authenticated', 'public.measurement_imports', 'INSERT')
    OR has_table_privilege('authenticated', 'public.performance_observation_groups', 'INSERT')
    OR has_table_privilege('authenticated', 'public.performance_observation_values', 'INSERT') THEN
    RAISE EXCEPTION 'Qwik function or table privileges are incorrect';
  END IF;
END
$verify_qwik_privileges$;

DO $verify_qwik_rls$
DECLARE
  table_name TEXT;
  rls_state RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'measurement_imports',
    'performance_observation_groups',
    'performance_observation_values'
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
$verify_qwik_rls$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('qwik_test.user_1'), TRUE);
SELECT set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'sub', current_setting('qwik_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

DO $verify_qwik_rls_visibility$
BEGIN
  IF (SELECT count(*) FROM public.measurement_imports) <> 1
    OR (SELECT count(*) FROM public.performance_observation_groups) <> 2
    OR (SELECT count(*) FROM public.performance_observation_values) <> 6 THEN
    RAISE EXCEPTION 'Qwik RLS exposed another athlete or hid owned data';
  END IF;
END
$verify_qwik_rls_visibility$;

RESET ROLE;

ROLLBACK;
