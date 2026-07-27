-- Rollback-only verification for coach-plan-replacement-migration.sql.
-- Apply coach-system-migration.sql and the replacement migration twice first.

BEGIN;

SELECT set_config('coach_replacement_test.user_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('coach_replacement_test.user_2', gen_random_uuid()::TEXT, TRUE);

INSERT INTO auth.users (id)
VALUES
  (current_setting('coach_replacement_test.user_1')::UUID),
  (current_setting('coach_replacement_test.user_2')::UUID);

DO $verify_replacement_function_security$
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.create_training_plan_replacement_proposal(uuid,uuid,text,text,date,text,text,jsonb,jsonb,jsonb,jsonb,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must execute the replacement proposal function';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_training_plan_replacement_proposal(uuid,uuid,text,text,date,text,text,jsonb,jsonb,jsonb,jsonb,text,text)',
    'EXECUTE'
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc AS p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS privilege
    WHERE p.oid =
      'public.create_training_plan_replacement_proposal(uuid,uuid,text,text,date,text,text,jsonb,jsonb,jsonb,jsonb,text,text)'::REGPROCEDURE
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon and public must not execute the replacement proposal function';
  END IF;

  IF has_table_privilege('authenticated', 'public.training_plan_versions', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.adaptation_proposals', 'UPDATE')
  THEN
    RAISE EXCEPTION 'authenticated must not directly mutate plan or proposal state';
  END IF;
END
$verify_replacement_function_security$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('coach_replacement_test.user_1'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('coach_replacement_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

SELECT set_config('coach_replacement_test.initial_proposal', result.proposal_id::TEXT, TRUE),
       set_config('coach_replacement_test.program', result.proposed_program_id::TEXT, TRUE),
       set_config('coach_replacement_test.plan_1', result.proposed_plan_version_id::TEXT, TRUE)
FROM public.create_initial_training_plan_proposal(
  'Initial verifier plan',
  'Verify replacement behavior',
  DATE '2026-08-03',
  '0.1.0',
  '0.1.0',
  '{"horizon_weeks":8,"primary_domain":"strength","weeks":[]}'::JSONB,
  '{"planningInput":{"primaryDomain":"strength"}}'::JSONB,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'week_number', week_number,
      'session_index', session_index,
      'scheduled_date', DATE '2026-08-03' + ((week_number - 1) * 7) + (session_index - 1) * 2,
      'prescription', jsonb_build_object(
        'domain', 'strength',
        'intent', 'Initial verification session',
        'dose', jsonb_build_object('source', 'validated_policy'),
        'effort', 'Controlled',
        'rest', 'As needed',
        'success_condition', 'Repeatable quality',
        'stop_condition', 'Stop on technique loss',
        'scale_options', jsonb_build_array('Reduce one set'),
        'evidence', jsonb_build_object('policyVersion', '0.1.0')
      )
    ) ORDER BY week_number, session_index)
    FROM generate_series(1, 8) AS week_number
    CROSS JOIN generate_series(1, 2) AS session_index
  ),
  '{"reason":"replacement verifier initial"}'::JSONB,
  repeat('1', 64),
  'coach-replacement-initial'
) AS result;

SELECT *
FROM public.accept_adaptation_proposal(
  current_setting('coach_replacement_test.initial_proposal')::UUID,
  'coach-replacement-initial'
);

SELECT set_config('coach_replacement_test.proposal_2', result.proposal_id::TEXT, TRUE),
       set_config('coach_replacement_test.plan_2', result.proposed_plan_version_id::TEXT, TRUE)
FROM public.create_training_plan_replacement_proposal(
  current_setting('coach_replacement_test.program')::UUID,
  current_setting('coach_replacement_test.plan_1')::UUID,
  'Specific verifier plan',
  'Use complete session prescriptions',
  DATE '2026-09-28',
  '0.1.0',
  '0.2.0',
  '{"horizon_weeks":8,"primary_domain":"strength","weeks":[]}'::JSONB,
  '{"planningInput":{"primaryDomain":"strength"},"assessments":[]}'::JSONB,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'week_number', week_number,
      'session_index', session_index,
      'scheduled_date', DATE '2026-09-28' + ((week_number - 1) * 7) + (session_index - 1) * 2,
      'prescription', jsonb_build_object(
        'domain', 'strength',
        'intent', 'Specific replacement session',
        'dose', jsonb_build_object('source', 'validated_policy', 'blocks', jsonb_build_array()),
        'effort', 'Two reps in reserve',
        'rest', 'Two to four minutes',
        'success_condition', 'Repeatable quality',
        'stop_condition', 'Stop on technique loss',
        'scale_options', jsonb_build_array('Reduce one set'),
        'evidence', jsonb_build_object('policyVersion', '0.2.0')
      )
    ) ORDER BY week_number, session_index)
    FROM generate_series(1, 8) AS week_number
    CROSS JOIN generate_series(1, 2) AS session_index
  ),
  '{"reason":"replacement verifier"}'::JSONB,
  repeat('2', 64),
  'coach-replacement-specific'
) AS result;

-- The same key and fingerprint must return the same proposal and plan.
DO $verify_replacement_retry$
DECLARE
  retry_result RECORD;
BEGIN
  SELECT * INTO retry_result
  FROM public.create_training_plan_replacement_proposal(
    current_setting('coach_replacement_test.program')::UUID,
    current_setting('coach_replacement_test.plan_1')::UUID,
    'Specific verifier plan',
    'Use complete session prescriptions',
    DATE '2026-09-28',
    '0.1.0',
    '0.2.0',
    '{"horizon_weeks":8,"primary_domain":"strength","weeks":[]}'::JSONB,
    '{"planningInput":{"primaryDomain":"strength"},"assessments":[]}'::JSONB,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'week_number', week_number,
        'session_index', session_index,
        'scheduled_date', DATE '2026-09-28' + ((week_number - 1) * 7) + (session_index - 1) * 2,
        'prescription', jsonb_build_object(
          'domain', 'strength', 'intent', 'Specific replacement session',
          'dose', jsonb_build_object('source', 'validated_policy', 'blocks', jsonb_build_array()),
          'effort', 'Two reps in reserve', 'rest', 'Two to four minutes',
          'success_condition', 'Repeatable quality', 'stop_condition', 'Stop on technique loss',
          'scale_options', jsonb_build_array('Reduce one set'),
          'evidence', jsonb_build_object('policyVersion', '0.2.0')
        )
      ) ORDER BY week_number, session_index)
      FROM generate_series(1, 8) AS week_number
      CROSS JOIN generate_series(1, 2) AS session_index
    ),
    '{"reason":"replacement verifier"}'::JSONB,
    repeat('2', 64),
    'coach-replacement-specific'
  );

  IF retry_result.proposal_id IS DISTINCT FROM current_setting('coach_replacement_test.proposal_2')::UUID
    OR retry_result.proposed_plan_version_id IS DISTINCT FROM current_setting('coach_replacement_test.plan_2')::UUID
  THEN
    RAISE EXCEPTION 'Replacement retry did not return the original proposal';
  END IF;
END
$verify_replacement_retry$;

DO $verify_replacement_mismatched_retry$
BEGIN
  BEGIN
    PERFORM *
    FROM public.create_training_plan_replacement_proposal(
      current_setting('coach_replacement_test.program')::UUID,
      current_setting('coach_replacement_test.plan_1')::UUID,
      'Specific verifier plan', 'Use complete session prescriptions', DATE '2026-09-28',
      '0.1.0', '0.2.0',
      '{"horizon_weeks":8}'::JSONB, '{}'::JSONB,
      (SELECT jsonb_agg(jsonb_build_object(
        'week_number', week_number, 'session_index', session_index,
        'scheduled_date', DATE '2026-09-28',
        'prescription', jsonb_build_object(
          'domain','strength','intent','x','dose','{}'::JSONB,'effort','x','rest','x',
          'success_condition','x','stop_condition','x','scale_options','[]'::JSONB,'evidence','{}'::JSONB
        )
      )) FROM generate_series(1, 8) week_number CROSS JOIN generate_series(1, 2) session_index),
      '{}'::JSONB, repeat('9', 64), 'coach-replacement-specific'
    );
    RAISE EXCEPTION 'Replacement idempotency key accepted different data';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;
END
$verify_replacement_mismatched_retry$;

-- A second proposal against the same base is valid to create but becomes stale
-- after the first proposal is accepted.
SELECT set_config('coach_replacement_test.stale_proposal', result.proposal_id::TEXT, TRUE)
FROM public.create_training_plan_replacement_proposal(
  current_setting('coach_replacement_test.program')::UUID,
  current_setting('coach_replacement_test.plan_1')::UUID,
  'Stale verifier plan', 'Must not replace a newer accepted version', DATE '2026-09-28',
  '0.1.0', '0.2.0', '{"horizon_weeks":8}'::JSONB, '{}'::JSONB,
  (SELECT jsonb_agg(jsonb_build_object(
    'week_number', week_number, 'session_index', session_index,
    'scheduled_date', DATE '2026-09-28',
    'prescription', jsonb_build_object(
      'domain','strength','intent','stale','dose','{}'::JSONB,'effort','x','rest','x',
      'success_condition','x','stop_condition','x','scale_options','[]'::JSONB,'evidence','{}'::JSONB
    )
  )) FROM generate_series(1, 8) week_number CROSS JOIN generate_series(1, 2) session_index),
  '{}'::JSONB, repeat('3', 64), 'coach-replacement-stale'
) AS result;

SELECT *
FROM public.accept_adaptation_proposal(
  current_setting('coach_replacement_test.proposal_2')::UUID,
  'coach-replacement-specific'
);

DO $verify_replacement_state$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_programs
    WHERE id = current_setting('coach_replacement_test.program')::UUID
      AND active_plan_version_id = current_setting('coach_replacement_test.plan_2')::UUID
      AND title = 'Specific verifier plan'
      AND goal_summary = 'Use complete session prescriptions'
      AND start_date = DATE '2026-09-28'
      AND end_date = DATE '2026-11-22'
  ) THEN
    RAISE EXCEPTION 'Accepted replacement did not atomically update plan and program metadata';
  END IF;

  IF (
    SELECT COUNT(*) FROM public.training_plan_versions
    WHERE program_id = current_setting('coach_replacement_test.program')::UUID
      AND status = 'accepted'
  ) <> 1 THEN
    RAISE EXCEPTION 'Program must have exactly one accepted version';
  END IF;
END
$verify_replacement_state$;

DO $verify_stale_replacement$
BEGIN
  BEGIN
    PERFORM *
    FROM public.accept_adaptation_proposal(
      current_setting('coach_replacement_test.stale_proposal')::UUID,
      'coach-replacement-stale'
    );
    RAISE EXCEPTION 'Stale replacement proposal was accepted';
  EXCEPTION
    WHEN serialization_failure THEN NULL;
  END;
END
$verify_stale_replacement$;

-- A second user cannot target the first user's program through the definer RPC.
SELECT set_config('request.jwt.claim.sub', current_setting('coach_replacement_test.user_2'), TRUE);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('coach_replacement_test.user_2'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

DO $verify_cross_user_replacement$
BEGIN
  BEGIN
    PERFORM *
    FROM public.create_training_plan_replacement_proposal(
      current_setting('coach_replacement_test.program')::UUID,
      current_setting('coach_replacement_test.plan_2')::UUID,
      'Cross-user plan', 'Must fail', DATE '2026-09-28',
      '0.1.0', '0.2.0', '{"horizon_weeks":8}'::JSONB, '{}'::JSONB,
      (SELECT jsonb_agg(jsonb_build_object(
        'week_number', week_number, 'session_index', session_index,
        'scheduled_date', DATE '2026-09-28',
        'prescription', jsonb_build_object(
          'domain','strength','intent','x','dose','{}'::JSONB,'effort','x','rest','x',
          'success_condition','x','stop_condition','x','scale_options','[]'::JSONB,'evidence','{}'::JSONB
        )
      )) FROM generate_series(1, 8) week_number CROSS JOIN generate_series(1, 2) session_index),
      '{}'::JSONB, repeat('4', 64), 'coach-cross-user-replacement'
    );
    RAISE EXCEPTION 'Cross-user replacement unexpectedly succeeded';
  EXCEPTION
    WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END
$verify_cross_user_replacement$;

SELECT 'coach plan replacement verification passed; fixtures rolled back'
  AS verification_result;

ROLLBACK;
