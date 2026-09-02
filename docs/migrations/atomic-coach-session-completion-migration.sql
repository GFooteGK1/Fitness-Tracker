BEGIN;

-- Atomic canonical workout + check-in + typed evidence completion.
-- Apply after layered-adaptive-evidence-migration.sql.

ALTER TABLE public.prescribed_sessions
  ADD COLUMN IF NOT EXISTS completion_contract_version SMALLINT;

DO $add_prescribed_sessions_completed_workout_owner_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.prescribed_sessions'::regclass
      AND conname = 'prescribed_sessions_completed_workout_owner_fk'
  ) THEN
    ALTER TABLE public.prescribed_sessions
      ADD CONSTRAINT prescribed_sessions_completed_workout_owner_fk
      FOREIGN KEY (completed_workout_id, user_id)
      REFERENCES public.workouts(id, user_id);
  END IF;
END
$add_prescribed_sessions_completed_workout_owner_fk$;

DO $add_prescribed_sessions_workout_terminal_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.prescribed_sessions'::regclass
      AND conname = 'prescribed_sessions_workout_terminal_check'
  ) THEN
    ALTER TABLE public.prescribed_sessions
      ADD CONSTRAINT prescribed_sessions_workout_terminal_check
      CHECK (
        (
          completion_contract_version IS NULL
          AND completed_workout_id IS NULL
        )
        OR (
          completion_contract_version = 2
          AND (
            (status = 'completed' AND completed_workout_id IS NOT NULL)
            OR (status = 'skipped' AND completed_workout_id IS NULL)
          )
        )
      ) NOT VALID;
  END IF;
END
$add_prescribed_sessions_workout_terminal_check$;

CREATE INDEX IF NOT EXISTS idx_prescribed_sessions_completed_workout_owner
  ON public.prescribed_sessions(completed_workout_id, user_id)
  WHERE completed_workout_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_checkins_v2_result_idempotency
  ON public.coach_checkins(user_id, (responses->>'idempotencyKey'))
  WHERE checkin_type = 'session'
    AND responses->>'completionContractVersion' = '2';

COMMENT ON COLUMN public.prescribed_sessions.completion_contract_version IS
  'Null marks the legacy check-in-only completion contract; 2 requires an atomic canonical workout link for completed sessions.';

CREATE OR REPLACE FUNCTION public.record_coach_session_result_v2(
  p_session_id UUID,
  p_status TEXT,
  p_feedback JSONB,
  p_occurred_at TIMESTAMPTZ,
  p_idempotency_key TEXT,
  p_performed_work JSONB,
  p_observations JSONB
)
RETURNS TABLE (
  prescribed_session_id UUID,
  session_status TEXT,
  checkin_id UUID,
  workout_id UUID,
  observation_group_ids UUID[],
  occurred_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session public.prescribed_sessions%ROWTYPE;
  v_existing public.coach_checkins%ROWTYPE;
  v_active_plan_version_id UUID;
  v_plan_status TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_capture_time TIMESTAMPTZ;
  v_request_payload JSONB;
  v_response_payload JSONB;
  v_workout_id UUID;
  v_checkin_id UUID;
  v_observation_group_id UUID;
  v_observation_group_ids UUID[] := ARRAY[]::UUID[];
  v_observation JSONB;
  v_observation_index INTEGER := 0;
  v_workout_date DATE;
  v_blocks JSONB;
  v_input_text TEXT;
  v_total_duration_min INTEGER;
  v_metric_value NUMERIC;
  v_observed_at TIMESTAMPTZ;
  v_observation_valid BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('completed', 'skipped') THEN
    RAISE EXCEPTION 'Session status must be completed or skipped'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_feedback) IS DISTINCT FROM 'object'
    OR p_feedback->>'schemaVersion' IS DISTINCT FROM '1'
    OR p_feedback->>'outcome' IS NULL
    OR p_feedback->>'outcome' NOT IN ('as_planned', 'modified', 'stopped_early', 'skipped')
    OR p_feedback->>'energy' IS NULL
    OR p_feedback->>'energy' NOT IN ('low', 'okay', 'high')
    OR p_feedback->>'pain' IS NULL
    OR p_feedback->>'pain' NOT IN ('none', 'mild', 'concerning') THEN
    RAISE EXCEPTION 'Session feedback is invalid' USING ERRCODE = '22023';
  END IF;

  IF (p_status = 'skipped') IS DISTINCT FROM (p_feedback->>'outcome' = 'skipped') THEN
    RAISE EXCEPTION 'Session status and outcome do not match'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'completed'
    AND jsonb_typeof(p_feedback->'sessionRpe') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Completed sessions need numeric session RPE'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'completed' AND (
    (p_feedback->>'sessionRpe')::NUMERIC < 1
    OR (p_feedback->>'sessionRpe')::NUMERIC > 10
    OR mod((p_feedback->>'sessionRpe')::NUMERIC * 2, 1) <> 0
  ) THEN
    RAISE EXCEPTION 'Completed sessions need RPE from 1 through 10 in half-point steps'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'skipped'
    AND jsonb_typeof(p_feedback->'sessionRpe') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'Skipped sessions cannot include session RPE'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (p_feedback ? 'note')
    OR jsonb_typeof(p_feedback->'note') NOT IN ('string', 'null')
    OR length(COALESCE(p_feedback->>'note', '')) > 500 THEN
    RAISE EXCEPTION 'Session note is invalid' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A valid session-result idempotency key is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_occurred_at IS NULL OR p_occurred_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Session completion time is invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_observations) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_observations) > 20 THEN
    RAISE EXCEPTION 'Session observations must be an array of at most 20 items'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'skipped' THEN
    IF (p_performed_work IS NOT NULL AND jsonb_typeof(p_performed_work) <> 'null')
      OR jsonb_array_length(p_observations) <> 0 THEN
      RAISE EXCEPTION 'Skipped sessions cannot include performed work or observations'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    IF jsonb_typeof(p_performed_work) IS DISTINCT FROM 'object'
      OR p_performed_work->>'mode' IS NULL
      OR p_performed_work->>'mode' NOT IN ('as_prescribed', 'modified')
      OR p_performed_work->>'workoutDate' IS NULL
      OR p_performed_work->>'workoutDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Completed sessions need valid performed work details'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_workout_date := (p_performed_work->>'workoutDate')::DATE;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Workout date is invalid' USING ERRCODE = '22023';
    END;

    IF p_performed_work->>'mode' = 'as_prescribed' AND (
      p_feedback->>'outcome' <> 'as_planned'
      OR jsonb_typeof(p_performed_work->'blocks') IS DISTINCT FROM 'null'
      OR jsonb_typeof(p_performed_work->'inputText') IS DISTINCT FROM 'null'
    ) THEN
      RAISE EXCEPTION 'As-prescribed completion cannot replace accepted work'
        USING ERRCODE = '22023';
    END IF;

    IF p_performed_work->>'mode' = 'modified' AND (
      p_feedback->>'outcome' NOT IN ('modified', 'stopped_early')
      OR jsonb_typeof(p_performed_work->'blocks') IS DISTINCT FROM 'array'
      OR length(btrim(COALESCE(p_performed_work->>'inputText', ''))) < 3
      OR length(p_performed_work->>'inputText') > 5000
    ) THEN
      RAISE EXCEPTION 'Modified completion needs actual work blocks and summary'
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_performed_work->'totalDurationMinutes') = 'number' THEN
      v_total_duration_min := (p_performed_work->>'totalDurationMinutes')::INTEGER;
      IF v_total_duration_min NOT BETWEEN 1 AND 1440 THEN
        RAISE EXCEPTION 'Workout duration must be 1 through 1440 minutes'
          USING ERRCODE = '22023';
      END IF;
    ELSIF jsonb_typeof(p_performed_work->'totalDurationMinutes') IS DISTINCT FROM 'null' THEN
      RAISE EXCEPTION 'Workout duration is invalid' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT session_row.*
  INTO v_session
  FROM public.prescribed_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescribed session not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':' || btrim(p_idempotency_key), 0)
  );

  v_request_payload := jsonb_build_object(
    'contractVersion', 2,
    'sessionId', p_session_id,
    'status', p_status,
    'feedback', p_feedback,
    'occurredAt', to_jsonb(p_occurred_at),
    'performedWork', p_performed_work,
    'observations', p_observations
  );

  SELECT checkin.*
  INTO v_existing
  FROM public.coach_checkins AS checkin
  WHERE checkin.user_id = v_user_id
    AND checkin.checkin_type = 'session'
    AND checkin.responses->>'completionContractVersion' = '2'
    AND checkin.responses->>'idempotencyKey' = btrim(p_idempotency_key)
  ORDER BY checkin.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.prescribed_session_id IS DISTINCT FROM p_session_id
      OR v_existing.responses->'completionRequest' IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'Session-result idempotency key was already used for different data'
        USING ERRCODE = '22023';
    END IF;

    v_workout_id := NULLIF(v_existing.responses->>'workoutId', '')::UUID;
    v_observation_group_ids := ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(v_existing.responses->'observationGroupIds', '[]'::JSONB)
      )::UUID
    );
    prescribed_session_id := p_session_id;
    session_status := p_status;
    checkin_id := v_existing.id;
    workout_id := v_workout_id;
    observation_group_ids := v_observation_group_ids;
    occurred_at := v_existing.occurred_at;
    replayed := TRUE;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_session.status <> 'planned' THEN
    RAISE EXCEPTION 'This prescribed session already has a terminal result'
      USING ERRCODE = '55000';
  END IF;

  SELECT program.active_plan_version_id
  INTO v_active_plan_version_id
  FROM public.training_programs AS program
  WHERE program.id = v_session.program_id
    AND program.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_active_plan_version_id IS DISTINCT FROM v_session.plan_version_id THEN
    RAISE EXCEPTION 'The active plan changed before session completion'
      USING ERRCODE = '40001';
  END IF;

  SELECT version.status
  INTO v_plan_status
  FROM public.training_plan_versions AS version
  WHERE version.id = v_session.plan_version_id
    AND version.program_id = v_session.program_id
    AND version.user_id = v_user_id;

  IF v_plan_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted plan session can be completed'
      USING ERRCODE = '55000';
  END IF;

  v_capture_time := GREATEST(v_now, p_occurred_at);

  IF p_status = 'completed' THEN
    IF p_performed_work->>'mode' = 'as_prescribed' THEN
      v_blocks := CASE
        WHEN jsonb_typeof(v_session.prescription->'blocks') = 'array'
          THEN v_session.prescription->'blocks'
        WHEN jsonb_typeof(v_session.prescription#>'{dose,blocks}') = 'array'
          THEN v_session.prescription#>'{dose,blocks}'
        ELSE jsonb_build_array(v_session.prescription)
      END;
      v_input_text := 'Completed prescribed session: ' || COALESCE(
        NULLIF(v_session.prescription->>'title', ''),
        NULLIF(v_session.prescription->>'session_title', ''),
        NULLIF(v_session.prescription->>'intent', ''),
        'Training session'
      );
    ELSE
      v_blocks := p_performed_work->'blocks';
      v_input_text := btrim(p_performed_work->>'inputText');
    END IF;

    INSERT INTO public.workouts (
      user_id,
      workout_date,
      input_text,
      blocks,
      primary_score,
      total_duration_min,
      tags,
      notes,
      rpe,
      parse_confidence
    )
    VALUES (
      v_user_id,
      v_workout_date,
      v_input_text,
      v_blocks,
      NULL,
      v_total_duration_min,
      ARRAY['coach-program', 'prescribed-session']::TEXT[],
      NULLIF(p_feedback->>'note', ''),
      CASE
        WHEN mod((p_feedback->>'sessionRpe')::NUMERIC, 1) = 0
          THEN (p_feedback->>'sessionRpe')::INTEGER
        ELSE NULL
      END,
      1.00
    )
    RETURNING id INTO v_workout_id;

    INSERT INTO public.performance_observation_groups (
      user_id,
      workout_id,
      prescribed_session_id,
      observation_kind,
      status,
      observed_at,
      captured_at,
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
      comparison_modifiers,
      metadata
    )
    VALUES (
      v_user_id,
      v_workout_id,
      v_session.id,
      'session_outcome',
      'complete',
      p_occurred_at,
      v_capture_time,
      'coach_completion',
      'sociusfit',
      'none',
      btrim(p_idempotency_key) || ':session-rpe',
      'session.rpe',
      '0.2.0',
      '1.0.0',
      'session-result-v2',
      'athlete_confirmed',
      v_now,
      v_user_id,
      'comparison-v1|metric=session.rpe|definition=session.rpe%401.0.0|protocol=session-rpe-ten-point%401.0.0|source=kind%3Acoach_completion%3Bsystem%3Asociusfit%3Bdevice%3Ano_device',
      jsonb_build_object(
        'source', jsonb_build_object(
          'kind', 'coach_completion',
          'system', 'sociusfit',
          'deviceId', NULL
        )
      ),
      jsonb_build_object('completionContractVersion', 2, 'protocolId', 'session-rpe-ten-point')
    )
    RETURNING id INTO v_observation_group_id;

    v_observation_group_ids := array_append(
      v_observation_group_ids,
      v_observation_group_id
    );

    INSERT INTO public.performance_observation_values (
      group_id,
      user_id,
      metric_id,
      semantic_role,
      value_numeric,
      unit,
      ordinal,
      status,
      provenance
    )
    VALUES (
      v_observation_group_id,
      v_user_id,
      'session.rpe',
      'training_signal',
      (p_feedback->>'sessionRpe')::NUMERIC,
      'score',
      0,
      'complete',
      jsonb_build_object('source', 'coach_checkin', 'completionContractVersion', 2)
    );

    FOR v_observation IN
      SELECT value
      FROM jsonb_array_elements(p_observations)
    LOOP
      v_observation_index := v_observation_index + 1;
      v_observation_valid := jsonb_typeof(v_observation) = 'object'
        AND length(btrim(COALESCE(v_observation->>'clientId', ''))) BETWEEN 1 AND 80
        AND v_observation->>'kind' IN (
          'strength_set', 'jump_attempt', 'sprint_attempt',
          'run_attempt', 'readiness_check'
        )
        AND v_observation->>'semanticRole' IN (
          'estimate', 'proxy', 'training_signal', 'direct_outcome'
        )
        AND v_observation->>'assessmentCatalogVersion' = '0.2.0'
        AND jsonb_typeof(v_observation->'assessmentDefinition') = 'object'
        AND jsonb_typeof(v_observation->'protocol') = 'object'
        AND jsonb_typeof(v_observation->'metric') = 'object'
        AND jsonb_typeof(v_observation->'metric'->'value') = 'number'
        AND v_observation->'metric'->>'metricId' <> 'session.rpe'
        AND jsonb_typeof(v_observation->'comparison') = 'object'
        AND length(btrim(COALESCE(v_observation->>'comparabilityKey', ''))) BETWEEN 1 AND 500
        AND jsonb_typeof(v_observation->'metadata') = 'object';

      IF v_observation_valid IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Session observation % is invalid', v_observation_index
          USING ERRCODE = '22023';
      END IF;

      v_observation_valid := CASE v_observation->'assessmentDefinition'->>'id'
        WHEN 'strength.repetition_max' THEN
          v_observation->>'kind' = 'strength_set'
          AND v_observation->>'semanticRole' = 'direct_outcome'
          AND v_observation->'protocol'->>'id' = 'strength-repetition-max-standard'
          AND v_observation->'metric'->>'metricId' = 'strength.load'
          AND v_observation->'metric'->>'unit' IN ('kg', 'lb')
        WHEN 'strength.repetition_capacity' THEN
          v_observation->>'kind' = 'strength_set'
          AND v_observation->>'semanticRole' IN ('direct_outcome', 'training_signal')
          AND v_observation->'protocol'->>'id' = 'strength-repetition-capacity-standard'
          AND v_observation->'metric'->>'metricId' = 'strength.repetitions'
          AND v_observation->'metric'->>'unit' = 'repetitions'
        WHEN 'strength.estimated_one_rep_max' THEN
          v_observation->>'kind' = 'strength_set'
          AND v_observation->>'semanticRole' = 'estimate'
          AND v_observation->'protocol'->>'id' = 'epley-estimated-one-rep-max'
          AND v_observation->'metric'->>'metricId' = 'strength.estimated_1rm'
          AND v_observation->'metric'->>'unit' IN ('kg', 'lb')
        WHEN 'jump.height' THEN
          v_observation->>'kind' = 'jump_attempt'
          AND v_observation->>'semanticRole' = 'direct_outcome'
          AND v_observation->'protocol'->>'id' = 'jump-height-standard'
          AND v_observation->'metric'->>'metricId' = 'jump.height'
          AND v_observation->'metric'->>'unit' IN ('m', 'cm', 'in')
        WHEN 'sprint.time' THEN
          v_observation->>'kind' = 'sprint_attempt'
          AND v_observation->>'semanticRole' = 'direct_outcome'
          AND v_observation->'protocol'->>'id' = 'sprint-time-standard'
          AND v_observation->'metric'->>'metricId' = 'sprint.time'
          AND v_observation->'metric'->>'unit' IN ('s', 'ms')
        WHEN 'run.time_trial' THEN
          v_observation->>'kind' = 'run_attempt'
          AND v_observation->>'semanticRole' = 'direct_outcome'
          AND v_observation->'protocol'->>'id' = 'run-time-trial-standard'
          AND v_observation->'metric'->>'metricId' = 'run.time'
          AND v_observation->'metric'->>'unit' IN ('s', 'min')
        WHEN 'readiness.self_report' THEN
          v_observation->>'kind' = 'readiness_check'
          AND v_observation->>'semanticRole' IN ('proxy', 'training_signal')
          AND v_observation->'protocol'->>'id' = 'daily-readiness-five-point'
          AND v_observation->'metric'->>'metricId' = 'readiness.score'
          AND v_observation->'metric'->>'unit' = 'score'
        ELSE FALSE
      END;

      IF v_observation_valid IS DISTINCT FROM TRUE
        OR v_observation->'assessmentDefinition'->>'version' <> '1.0.0'
        OR v_observation->'protocol'->>'version' <> '1.0.0' THEN
        RAISE EXCEPTION 'Session observation % does not match the assessment catalog',
          v_observation_index USING ERRCODE = '22023';
      END IF;

      BEGIN
        v_observed_at := (v_observation->>'observedAt')::TIMESTAMPTZ;
        v_metric_value := (v_observation->'metric'->>'value')::NUMERIC;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
        RAISE EXCEPTION 'Session observation % has invalid time or value',
          v_observation_index USING ERRCODE = '22023';
      END;

      IF v_observed_at > p_occurred_at OR v_metric_value < 0 THEN
        RAISE EXCEPTION 'Session observation % has invalid time or value',
          v_observation_index USING ERRCODE = '22023';
      END IF;

      IF v_observation->'metric'->>'metricId' = 'strength.repetitions'
        AND mod(v_metric_value, 1) <> 0 THEN
        RAISE EXCEPTION 'Strength repetitions must be an integer'
          USING ERRCODE = '22023';
      END IF;

      IF (CASE v_observation->'assessmentDefinition'->>'id'
        WHEN 'strength.repetition_max' THEN v_metric_value < 0.1
        WHEN 'strength.repetition_capacity' THEN mod(v_metric_value, 1) <> 0
        WHEN 'strength.estimated_one_rep_max' THEN v_metric_value < 0.1
        WHEN 'jump.height' THEN v_metric_value NOT BETWEEN 0 AND 2
        WHEN 'sprint.time' THEN v_metric_value <= 0
        WHEN 'run.time_trial' THEN v_metric_value <= 0
        WHEN 'readiness.self_report' THEN v_metric_value NOT BETWEEN 1 AND 5
        ELSE TRUE
      END) THEN
        RAISE EXCEPTION 'Session observation % value is outside its assessment range',
          v_observation_index USING ERRCODE = '22023';
      END IF;

      IF NOT starts_with(v_observation->>'comparabilityKey', (
        'comparison-v1|metric=' || (v_observation->'metric'->>'metricId')
        || '|definition=' || (v_observation->'assessmentDefinition'->>'id') || '%40'
        || (v_observation->'assessmentDefinition'->>'version')
        || '|protocol=' || (v_observation->'protocol'->>'id') || '%40'
        || (v_observation->'protocol'->>'version') || '|'
      )) THEN
        RAISE EXCEPTION 'Session observation % comparability key is invalid',
          v_observation_index USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.performance_observation_groups (
        user_id,
        workout_id,
        prescribed_session_id,
        observation_kind,
        status,
        observed_at,
        captured_at,
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
        comparison_modifiers,
        metadata
      )
      VALUES (
        v_user_id,
        v_workout_id,
        v_session.id,
        v_observation->>'kind',
        'complete',
        v_observed_at,
        v_capture_time,
        'coach_completion',
        'sociusfit',
        COALESCE(NULLIF(v_observation->>'sourceDeviceId', ''), 'none'),
        btrim(p_idempotency_key) || ':observation:' || v_observation_index::TEXT,
        v_observation->'assessmentDefinition'->>'id',
        v_observation->>'assessmentCatalogVersion',
        v_observation->'protocol'->>'version',
        'session-result-v2',
        'athlete_confirmed',
        v_now,
        v_user_id,
        v_observation->>'comparabilityKey',
        v_observation->'comparison',
        v_observation->'metadata' || jsonb_build_object(
          'clientId', v_observation->>'clientId',
          'assessmentDefinitionVersion', v_observation->'assessmentDefinition'->>'version',
          'protocolId', v_observation->'protocol'->>'id',
          'completionContractVersion', 2
        )
      )
      RETURNING id INTO v_observation_group_id;

      v_observation_group_ids := array_append(
        v_observation_group_ids,
        v_observation_group_id
      );

      INSERT INTO public.performance_observation_values (
        group_id,
        user_id,
        metric_id,
        semantic_role,
        value_numeric,
        unit,
        ordinal,
        status,
        provenance
      )
      VALUES (
        v_observation_group_id,
        v_user_id,
        v_observation->'metric'->>'metricId',
        v_observation->>'semanticRole',
        v_metric_value,
        v_observation->'metric'->>'unit',
        0,
        'complete',
        jsonb_build_object(
          'source', 'atomic_session_completion',
          'clientId', v_observation->>'clientId',
          'completionContractVersion', 2
        )
      );
    END LOOP;
  END IF;

  v_response_payload := p_feedback || jsonb_build_object(
    'completionContractVersion', 2,
    'idempotencyKey', btrim(p_idempotency_key),
    'resultStatus', p_status,
    'completionRequest', v_request_payload,
    'workoutId', v_workout_id,
    'observationGroupIds', to_jsonb(v_observation_group_ids)
  );

  INSERT INTO public.coach_checkins (
    user_id,
    program_id,
    plan_version_id,
    prescribed_session_id,
    checkin_type,
    responses,
    occurred_at
  )
  VALUES (
    v_user_id,
    v_session.program_id,
    v_session.plan_version_id,
    v_session.id,
    'session',
    v_response_payload,
    p_occurred_at
  )
  RETURNING id INTO v_checkin_id;

  UPDATE public.prescribed_sessions
  SET
    status = p_status,
    completion_contract_version = 2,
    completed_workout_id = v_workout_id,
    execution_note = NULLIF(p_feedback->>'note', ''),
    completed_at = CASE WHEN p_status = 'completed' THEN p_occurred_at ELSE NULL END,
    updated_at = v_now
  WHERE id = v_session.id
    AND user_id = v_user_id;

  prescribed_session_id := v_session.id;
  session_status := p_status;
  checkin_id := v_checkin_id;
  workout_id := v_workout_id;
  observation_group_ids := v_observation_group_ids;
  occurred_at := p_occurred_at;
  replayed := FALSE;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.record_coach_session_result_v2(
  UUID,
  TEXT,
  JSONB,
  TIMESTAMPTZ,
  TEXT,
  JSONB,
  JSONB
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_coach_session_result_v2(
  UUID,
  TEXT,
  JSONB,
  TIMESTAMPTZ,
  TEXT,
  JSONB,
  JSONB
) TO authenticated;

COMMENT ON FUNCTION public.record_coach_session_result_v2(
  UUID,
  TEXT,
  JSONB,
  TIMESTAMPTZ,
  TEXT,
  JSONB,
  JSONB
) IS 'Atomically creates or returns one canonical workout, session check-in, typed observation set, and prescribed-session link. Accepted plans remain immutable.';

COMMIT;
