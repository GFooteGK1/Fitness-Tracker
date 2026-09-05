-- Rollback-only verification for atomic-coach-session-completion-migration.sql.
-- Apply the forward migration twice before running this verifier.

BEGIN;

SELECT set_config('atomic_completion_test.user_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.user_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.program_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.plan_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.plan_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.session_as_prescribed', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.session_modified', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.session_skipped', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.session_stale', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('atomic_completion_test.session_legacy', gen_random_uuid()::TEXT, TRUE);

INSERT INTO auth.users (id)
VALUES
  (current_setting('atomic_completion_test.user_1')::UUID),
  (current_setting('atomic_completion_test.user_2')::UUID);

SET CONSTRAINTS ALL DEFERRED;

INSERT INTO public.training_programs (
  id,
  user_id,
  title,
  goal_summary,
  start_date,
  end_date,
  status
)
VALUES (
  current_setting('atomic_completion_test.program_1')::UUID,
  current_setting('atomic_completion_test.user_1')::UUID,
  '__atomic_completion_program__',
  'Verify canonical workout completion',
  CURRENT_DATE - 7,
  CURRENT_DATE + 48,
  'draft'
);

INSERT INTO public.training_plan_versions (
  id,
  program_id,
  user_id,
  version,
  status,
  reference_version,
  policy_version,
  intent,
  input_snapshot,
  created_by,
  accepted_at
)
VALUES
  (
    current_setting('atomic_completion_test.plan_1')::UUID,
    current_setting('atomic_completion_test.program_1')::UUID,
    current_setting('atomic_completion_test.user_1')::UUID,
    1,
    'accepted',
    'verify-reference',
    'verify-policy',
    '{"horizon_weeks":8}'::JSONB,
    '{"source":"atomic_completion_verifier"}'::JSONB,
    'planning_kernel',
    clock_timestamp()
  ),
  (
    current_setting('atomic_completion_test.plan_2')::UUID,
    current_setting('atomic_completion_test.program_1')::UUID,
    current_setting('atomic_completion_test.user_1')::UUID,
    2,
    'superseded',
    'verify-reference',
    'verify-policy',
    '{"horizon_weeks":8}'::JSONB,
    '{"source":"atomic_completion_verifier"}'::JSONB,
    'planning_kernel',
    clock_timestamp()
  );

UPDATE public.training_programs
SET
  status = 'active',
  active_plan_version_id = current_setting('atomic_completion_test.plan_1')::UUID
WHERE id = current_setting('atomic_completion_test.program_1')::UUID;

INSERT INTO public.prescribed_sessions (
  id,
  plan_version_id,
  program_id,
  user_id,
  week_number,
  session_index,
  scheduled_date,
  prescription
)
VALUES
  (
    current_setting('atomic_completion_test.session_as_prescribed')::UUID,
    current_setting('atomic_completion_test.plan_1')::UUID,
    current_setting('atomic_completion_test.program_1')::UUID,
    current_setting('atomic_completion_test.user_1')::UUID,
    1,
    1,
    CURRENT_DATE - 2,
    '{"domain":"strength","title":"Prescribed strength","intent":"Build strength","dose":{},"effort":"controlled","rest":"full","success_condition":"quality","stop_condition":"quality loss","scale_options":[],"evidence":{},"blocks":[{"id":"prescribed-block","sets":4}]}'::JSONB
  ),
  (
    current_setting('atomic_completion_test.session_modified')::UUID,
    current_setting('atomic_completion_test.plan_1')::UUID,
    current_setting('atomic_completion_test.program_1')::UUID,
    current_setting('atomic_completion_test.user_1')::UUID,
    1,
    2,
    CURRENT_DATE - 1,
    '{"domain":"strength","title":"Modified strength","intent":"Build capacity","dose":{},"effort":"controlled","rest":"full","success_condition":"quality","stop_condition":"quality loss","scale_options":[],"evidence":{},"blocks":[{"id":"planned-block","reps":8}]}'::JSONB
  ),
  (
    current_setting('atomic_completion_test.session_skipped')::UUID,
    current_setting('atomic_completion_test.plan_1')::UUID,
    current_setting('atomic_completion_test.program_1')::UUID,
    current_setting('atomic_completion_test.user_1')::UUID,
    1,
    3,
    CURRENT_DATE,
    '{"domain":"aerobic","title":"Skipped aerobic","intent":"Build capacity","dose":{},"effort":"easy","rest":"none","success_condition":"complete","stop_condition":"pain","scale_options":[],"evidence":{},"blocks":[]}'::JSONB
  ),
  (
    current_setting('atomic_completion_test.session_stale')::UUID,
    current_setting('atomic_completion_test.plan_2')::UUID,
    current_setting('atomic_completion_test.program_1')::UUID,
    current_setting('atomic_completion_test.user_1')::UUID,
    1,
    1,
    CURRENT_DATE,
    '{"domain":"strength","title":"Stale session","intent":"Build strength","dose":{},"effort":"controlled","rest":"full","success_condition":"quality","stop_condition":"quality loss","scale_options":[],"evidence":{},"blocks":[]}'::JSONB
  ),
  (
    current_setting('atomic_completion_test.session_legacy')::UUID,
    current_setting('atomic_completion_test.plan_1')::UUID,
    current_setting('atomic_completion_test.program_1')::UUID,
    current_setting('atomic_completion_test.user_1')::UUID,
    1,
    4,
    CURRENT_DATE,
    '{"domain":"strength","title":"Legacy session","intent":"Build strength","dose":{},"effort":"controlled","rest":"full","success_condition":"quality","stop_condition":"quality loss","scale_options":[],"evidence":{},"blocks":[]}'::JSONB
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('atomic_completion_test.user_1'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('atomic_completion_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

SELECT *
FROM public.record_coach_session_result_v2(
  current_setting('atomic_completion_test.session_as_prescribed')::UUID,
  'completed',
  '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7.5,"energy":"okay","pain":"none","note":null}'::JSONB,
  date_trunc('second', clock_timestamp()),
  'verify-atomic-as-prescribed',
  jsonb_build_object(
    'mode', 'as_prescribed',
    'workoutDate', CURRENT_DATE::TEXT,
    'inputText', NULL,
    'blocks', NULL,
    'totalDurationMinutes', 45
  ),
  '[]'::JSONB
);

DO $verify_atomic_as_prescribed$
DECLARE
  v_workout_id UUID;
BEGIN
  SELECT completed_workout_id
  INTO v_workout_id
  FROM public.prescribed_sessions
  WHERE id = current_setting('atomic_completion_test.session_as_prescribed')::UUID;

  IF v_workout_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.workouts
      WHERE id = v_workout_id
        AND user_id = current_setting('atomic_completion_test.user_1')::UUID
        AND blocks = '[{"id":"prescribed-block","sets":4}]'::JSONB
    )
    OR (
      SELECT count(*)
      FROM public.coach_checkins
      WHERE prescribed_session_id = current_setting('atomic_completion_test.session_as_prescribed')::UUID
    ) <> 1
    OR (
      SELECT count(*)
      FROM public.performance_observation_groups
      WHERE prescribed_session_id = current_setting('atomic_completion_test.session_as_prescribed')::UUID
        AND workout_id = v_workout_id
    ) <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.performance_observation_values AS value
      JOIN public.performance_observation_groups AS observation_group
        ON observation_group.id = value.group_id
       AND observation_group.user_id = value.user_id
      WHERE observation_group.prescribed_session_id = current_setting('atomic_completion_test.session_as_prescribed')::UUID
        AND value.metric_id = 'session.rpe'
        AND value.value_numeric = 7.5
        AND value.semantic_role = 'training_signal'
    ) THEN
    RAISE EXCEPTION 'Atomic as-prescribed completion did not create one linked record set';
  END IF;
END
$verify_atomic_as_prescribed$;

RESET ROLE;
UPDATE public.training_programs
SET active_plan_version_id = current_setting('atomic_completion_test.plan_2')::UUID
WHERE id = current_setting('atomic_completion_test.program_1')::UUID;
SET LOCAL ROLE authenticated;

DO $verify_safe_retry_after_plan_change$
DECLARE
  v_result RECORD;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  SELECT checkin.occurred_at
  INTO v_occurred_at
  FROM public.coach_checkins AS checkin
  WHERE checkin.prescribed_session_id = current_setting('atomic_completion_test.session_as_prescribed')::UUID;

  SELECT *
  INTO v_result
  FROM public.record_coach_session_result_v2(
    current_setting('atomic_completion_test.session_as_prescribed')::UUID,
    'completed',
    '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7.5,"energy":"okay","pain":"none","note":null}'::JSONB,
    v_occurred_at,
    'verify-atomic-as-prescribed',
    jsonb_build_object(
      'mode', 'as_prescribed',
      'workoutDate', CURRENT_DATE::TEXT,
      'inputText', NULL,
      'blocks', NULL,
      'totalDurationMinutes', 45
    ),
    '[]'::JSONB
  );

  IF v_result.replayed IS DISTINCT FROM TRUE
    OR (
      SELECT count(*)
      FROM public.workouts
      WHERE id = v_result.workout_id
    ) <> 1 THEN
    RAISE EXCEPTION 'Safe atomic retry did not return the original result';
  END IF;
END
$verify_safe_retry_after_plan_change$;

RESET ROLE;
UPDATE public.training_programs
SET active_plan_version_id = current_setting('atomic_completion_test.plan_1')::UUID
WHERE id = current_setting('atomic_completion_test.program_1')::UUID;
SET LOCAL ROLE authenticated;

DO $verify_mismatched_atomic_retry$
DECLARE
  v_occurred_at TIMESTAMPTZ;
BEGIN
  SELECT checkin.occurred_at
  INTO v_occurred_at
  FROM public.coach_checkins AS checkin
  WHERE checkin.prescribed_session_id = current_setting('atomic_completion_test.session_as_prescribed')::UUID;

  PERFORM 1
  FROM public.record_coach_session_result_v2(
    current_setting('atomic_completion_test.session_as_prescribed')::UUID,
    'completed',
    '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7.5,"energy":"okay","pain":"none","note":null}'::JSONB,
    v_occurred_at,
    'verify-atomic-as-prescribed',
    jsonb_build_object(
      'mode', 'as_prescribed',
      'workoutDate', CURRENT_DATE::TEXT,
      'inputText', NULL,
      'blocks', NULL,
      'totalDurationMinutes', 46
    ),
    '[]'::JSONB
  );
  RAISE EXCEPTION 'Mismatched atomic retry was accepted';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$verify_mismatched_atomic_retry$;

SELECT *
FROM public.record_coach_session_result_v2(
  current_setting('atomic_completion_test.session_modified')::UUID,
  'completed',
  '{"schemaVersion":1,"outcome":"modified","sessionRpe":8,"energy":"okay","pain":"mild","note":"Reduced the final sets"}'::JSONB,
  date_trunc('second', clock_timestamp()),
  'verify-atomic-modified',
  jsonb_build_object(
    'mode', 'modified',
    'workoutDate', CURRENT_DATE::TEXT,
    'inputText', 'Reduced the final two sets from eight reps to six reps.',
    'blocks', '[{"id":"actual-block","reps":[8,8,6,6]}]'::JSONB,
    'totalDurationMinutes', 48
  ),
  jsonb_build_array(jsonb_build_object(
    'clientId', 'trap-bar-capacity-set-1',
    'kind', 'strength_set',
    'semanticRole', 'training_signal',
    'observedAt', date_trunc('second', clock_timestamp()),
    'assessmentDefinition', jsonb_build_object(
      'id', 'strength.repetition_capacity',
      'version', '1.0.0'
    ),
    'assessmentCatalogVersion', '0.2.0',
    'protocol', jsonb_build_object(
      'id', 'strength-repetition-capacity-standard',
      'version', '1.0.0'
    ),
    'metric', jsonb_build_object(
      'metricId', 'strength.repetitions',
      'value', 8,
      'unit', 'repetitions'
    ),
    'sourceDeviceId', NULL,
    'comparison', jsonb_build_object(
      'movementId', 'trap_bar_deadlift',
      'variationId', 'high_handle',
      'repetitions', NULL,
      'externalLoad', jsonb_build_object('value', 315, 'unit', 'lb'),
      'distance', NULL,
      'duration', jsonb_build_object('value', 45, 'unit', 's'),
      'equipmentIds', jsonb_build_array('trap_bar'),
      'techniqueModifiers', jsonb_build_array('continuous_repetitions'),
      'environmentModifiers', '[]'::JSONB
    ),
    'comparabilityKey', 'comparison-v1|metric=strength.repetitions|definition=strength.repetition_capacity%401.0.0|protocol=strength-repetition-capacity-standard%401.0.0|movement=trap_bar_deadlift',
    'metadata', jsonb_build_object('setNumber', 1)
  ))
);

DO $verify_modified_actual_work$
DECLARE
  v_workout_id UUID;
BEGIN
  SELECT completed_workout_id
  INTO v_workout_id
  FROM public.prescribed_sessions
  WHERE id = current_setting('atomic_completion_test.session_modified')::UUID;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workouts
    WHERE id = v_workout_id
      AND blocks = '[{"id":"actual-block","reps":[8,8,6,6]}]'::JSONB
      AND input_text = 'Reduced the final two sets from eight reps to six reps.'
  ) OR (
    SELECT count(*)
    FROM public.performance_observation_groups
    WHERE prescribed_session_id = current_setting('atomic_completion_test.session_modified')::UUID
  ) <> 2 THEN
    RAISE EXCEPTION 'Modified completion did not preserve actual work and supplied evidence';
  END IF;
END
$verify_modified_actual_work$;

SELECT *
FROM public.record_coach_session_result_v2(
  current_setting('atomic_completion_test.session_skipped')::UUID,
  'skipped',
  '{"schemaVersion":1,"outcome":"skipped","sessionRpe":null,"energy":"low","pain":"none","note":"Travel"}'::JSONB,
  date_trunc('second', clock_timestamp()),
  'verify-atomic-skipped',
  NULL,
  '[]'::JSONB
);

DO $verify_atomic_skip_has_no_performed_work$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.prescribed_sessions
    WHERE id = current_setting('atomic_completion_test.session_skipped')::UUID
      AND (
        status <> 'skipped'
        OR completion_contract_version <> 2
        OR completed_workout_id IS NOT NULL
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.performance_observation_groups
    WHERE prescribed_session_id = current_setting('atomic_completion_test.session_skipped')::UUID
  ) THEN
    RAISE EXCEPTION 'Skipped atomic result created performed work';
  END IF;
END
$verify_atomic_skip_has_no_performed_work$;

DO $verify_terminal_session_rejected$
BEGIN
  PERFORM 1
  FROM public.record_coach_session_result_v2(
    current_setting('atomic_completion_test.session_as_prescribed')::UUID,
    'completed',
    '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7.5,"energy":"okay","pain":"none","note":null}'::JSONB,
    date_trunc('second', clock_timestamp()),
    'verify-different-terminal-key',
    jsonb_build_object(
      'mode', 'as_prescribed',
      'workoutDate', CURRENT_DATE::TEXT,
      'inputText', NULL,
      'blocks', NULL,
      'totalDurationMinutes', 45
    ),
    '[]'::JSONB
  );
  RAISE EXCEPTION 'Terminal session accepted a different result';
EXCEPTION
  WHEN object_not_in_prerequisite_state THEN
    NULL;
END
$verify_terminal_session_rejected$;

DO $verify_stale_plan_rejected$
BEGIN
  PERFORM 1
  FROM public.record_coach_session_result_v2(
    current_setting('atomic_completion_test.session_stale')::UUID,
    'completed',
    '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7,"energy":"okay","pain":"none","note":null}'::JSONB,
    date_trunc('second', clock_timestamp()),
    'verify-stale-plan-session',
    jsonb_build_object(
      'mode', 'as_prescribed',
      'workoutDate', CURRENT_DATE::TEXT,
      'inputText', NULL,
      'blocks', NULL,
      'totalDurationMinutes', 45
    ),
    '[]'::JSONB
  );
  RAISE EXCEPTION 'Stale plan session was accepted';
EXCEPTION
  WHEN serialization_failure THEN
    NULL;
END
$verify_stale_plan_rejected$;

SELECT *
FROM public.record_coach_session_result(
  current_setting('atomic_completion_test.session_legacy')::UUID,
  'completed',
  '{"schemaVersion":1,"outcome":"modified","sessionRpe":8,"energy":"okay","pain":"none","note":"Legacy result"}'::JSONB,
  date_trunc('second', clock_timestamp()),
  'verify-legacy-session-result'
);

DO $verify_legacy_completion_compatibility$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.prescribed_sessions
    WHERE id = current_setting('atomic_completion_test.session_legacy')::UUID
      AND status = 'completed'
      AND completion_contract_version IS NULL
      AND completed_workout_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy completion was not preserved during rollout';
  END IF;
END
$verify_legacy_completion_compatibility$;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('atomic_completion_test.user_2'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('atomic_completion_test.user_2'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

DO $verify_cross_user_atomic_completion$
BEGIN
  PERFORM 1
  FROM public.record_coach_session_result_v2(
    current_setting('atomic_completion_test.session_as_prescribed')::UUID,
    'completed',
    '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7,"energy":"okay","pain":"none","note":null}'::JSONB,
    date_trunc('second', clock_timestamp()),
    'verify-cross-user-atomic',
    jsonb_build_object(
      'mode', 'as_prescribed',
      'workoutDate', CURRENT_DATE::TEXT,
      'inputText', NULL,
      'blocks', NULL,
      'totalDurationMinutes', 45
    ),
    '[]'::JSONB
  );
  RAISE EXCEPTION 'Cross-user atomic completion was accepted';
EXCEPTION
  WHEN no_data_found THEN
    NULL;
END
$verify_cross_user_atomic_completion$;

DO $verify_atomic_completion_privileges$
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.record_coach_session_result_v2(uuid,text,jsonb,timestamp with time zone,text,jsonb,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.record_coach_session_result_v2(uuid,text,jsonb,timestamp with time zone,text,jsonb,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Atomic completion function privileges are incorrect';
  END IF;
END
$verify_atomic_completion_privileges$;

ROLLBACK;
