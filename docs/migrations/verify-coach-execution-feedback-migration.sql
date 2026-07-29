-- Rollback-only verification for coach-execution-feedback-migration.sql.
-- Apply the forward migration twice before running this verifier.

BEGIN;

SELECT set_config('coach_feedback_test.user_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_feedback_test.user_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_feedback_test.program_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_feedback_test.plan_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_feedback_test.session_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_feedback_test.session_2', gen_random_uuid()::TEXT, TRUE);

INSERT INTO auth.users (id)
VALUES
  (current_setting('coach_feedback_test.user_1')::UUID),
  (current_setting('coach_feedback_test.user_2')::UUID);

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
  current_setting('coach_feedback_test.program_1')::UUID,
  current_setting('coach_feedback_test.user_1')::UUID,
  '__coach_feedback_program__',
  'Verify atomic execution feedback',
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
VALUES (
  current_setting('coach_feedback_test.plan_1')::UUID,
  current_setting('coach_feedback_test.program_1')::UUID,
  current_setting('coach_feedback_test.user_1')::UUID,
  1,
  'accepted',
  'verify-reference',
  'verify-policy',
  '{"horizon_weeks":8}'::JSONB,
  '{"source":"coach_feedback_verifier"}'::JSONB,
  'planning_kernel',
  clock_timestamp()
);

UPDATE public.training_programs
SET
  status = 'active',
  active_plan_version_id = current_setting('coach_feedback_test.plan_1')::UUID
WHERE id = current_setting('coach_feedback_test.program_1')::UUID;

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
    current_setting('coach_feedback_test.session_1')::UUID,
    current_setting('coach_feedback_test.plan_1')::UUID,
    current_setting('coach_feedback_test.program_1')::UUID,
    current_setting('coach_feedback_test.user_1')::UUID,
    1,
    1,
    CURRENT_DATE - 1,
    '{"domain":"strength","intent":"verify","dose":{},"effort":"controlled","rest":"full","success_condition":"quality","stop_condition":"quality loss","scale_options":[],"evidence":{}}'::JSONB
  ),
  (
    current_setting('coach_feedback_test.session_2')::UUID,
    current_setting('coach_feedback_test.plan_1')::UUID,
    current_setting('coach_feedback_test.program_1')::UUID,
    current_setting('coach_feedback_test.user_1')::UUID,
    1,
    2,
    CURRENT_DATE,
    '{"domain":"strength","intent":"verify","dose":{},"effort":"controlled","rest":"full","success_condition":"quality","stop_condition":"quality loss","scale_options":[],"evidence":{}}'::JSONB
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('coach_feedback_test.user_1'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('coach_feedback_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

SELECT *
FROM public.record_coach_session_result(
  current_setting('coach_feedback_test.session_1')::UUID,
  'completed',
  '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7,"energy":"okay","pain":"none","note":null}'::JSONB,
  date_trunc('second', clock_timestamp()),
  'verify-session-completed'
);

DO $verify_completed_session_result$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.prescribed_sessions
    WHERE id = current_setting('coach_feedback_test.session_1')::UUID
      AND status = 'completed'
      AND completed_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.coach_checkins
    WHERE prescribed_session_id = current_setting('coach_feedback_test.session_1')::UUID
      AND checkin_type = 'session'
      AND responses->>'resultStatus' = 'completed'
  ) THEN
    RAISE EXCEPTION 'Completed session result did not update both records';
  END IF;
END
$verify_completed_session_result$;

-- verify_session_result_retry: the same key and payload return the same result.
SELECT *
FROM public.record_coach_session_result(
  current_setting('coach_feedback_test.session_1')::UUID,
  'completed',
  '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7,"energy":"okay","pain":"none","note":null}'::JSONB,
  (
    SELECT occurred_at
    FROM public.coach_checkins
    WHERE prescribed_session_id = current_setting('coach_feedback_test.session_1')::UUID
  ),
  'verify-session-completed'
);

DO $verify_session_result_mismatched_retry$
BEGIN
  PERFORM 1
  FROM public.record_coach_session_result(
    current_setting('coach_feedback_test.session_1')::UUID,
    'completed',
    '{"schemaVersion":1,"outcome":"modified","sessionRpe":9,"energy":"low","pain":"none","note":null}'::JSONB,
    (
      SELECT occurred_at
      FROM public.coach_checkins
      WHERE prescribed_session_id = current_setting('coach_feedback_test.session_1')::UUID
    ),
    'verify-session-completed'
  );
  RAISE EXCEPTION 'Mismatched session-result retry was accepted';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$verify_session_result_mismatched_retry$;

SELECT *
FROM public.record_coach_session_result(
  current_setting('coach_feedback_test.session_2')::UUID,
  'skipped',
  '{"schemaVersion":1,"outcome":"skipped","sessionRpe":null,"energy":"low","pain":"none","note":"Travel"}'::JSONB,
  date_trunc('second', clock_timestamp()),
  'verify-session-skipped'
);

DO $verify_skipped_session_result$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.prescribed_sessions
    WHERE id = current_setting('coach_feedback_test.session_2')::UUID
      AND status = 'skipped'
      AND completed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Skipped session result was not recorded correctly';
  END IF;
END
$verify_skipped_session_result$;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('coach_feedback_test.user_2'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('coach_feedback_test.user_2'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

DO $verify_cross_user_session_result$
BEGIN
  PERFORM 1
  FROM public.record_coach_session_result(
    current_setting('coach_feedback_test.session_1')::UUID,
    'completed',
    '{"schemaVersion":1,"outcome":"as_planned","sessionRpe":7,"energy":"okay","pain":"none","note":null}'::JSONB,
    date_trunc('second', clock_timestamp()),
    'verify-cross-user-session'
  );
  RAISE EXCEPTION 'Cross-user session completion was accepted';
EXCEPTION
  WHEN no_data_found THEN
    NULL;
END
$verify_cross_user_session_result$;

DO $verify_function_privilege$
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.record_coach_session_result(uuid,text,jsonb,timestamp with time zone,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.record_coach_session_result(uuid,text,jsonb,timestamp with time zone,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Session-result function privileges are incorrect';
  END IF;

  IF has_table_privilege('authenticated', 'public.prescribed_sessions', 'INSERT')
    OR has_table_privilege('authenticated', 'public.prescribed_sessions', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.coach_checkins', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated direct execution-feedback writes remain available';
  END IF;
END
$verify_function_privilege$;

ROLLBACK;
