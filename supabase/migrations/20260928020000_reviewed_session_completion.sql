-- Atomic reviewed completion from actual set revisions. Numerical proposals stay disabled.
BEGIN;
ALTER TABLE public.prescribed_sessions DROP CONSTRAINT prescribed_sessions_workout_terminal_check;
ALTER TABLE public.prescribed_sessions ADD CONSTRAINT prescribed_sessions_workout_terminal_check CHECK (
  (completion_contract_version IS NULL AND completed_workout_id IS NULL)
  OR (completion_contract_version IN (2,3) AND (
    (status='completed' AND completed_workout_id IS NOT NULL) OR (status='skipped' AND completed_workout_id IS NULL)))
) NOT VALID;

-- Only a protected capture operation created by the new RPC authorizes its
-- check-in. A client cannot bypass this guard by putting version=3 in old RPC input.
CREATE OR REPLACE FUNCTION public.guard_reviewed_session_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.checkin_type='session' AND EXISTS (SELECT 1 FROM public.prescribed_sessions s
    WHERE s.id=NEW.prescribed_session_id AND s.user_id=NEW.user_id AND s.prescription->>'format'='reviewed_programming_v0_1')
    AND NOT EXISTS (SELECT 1 FROM public.activity_mutations op WHERE op.user_id=NEW.user_id
      AND op.id::text=NEW.responses->>'completionOperationId'
      AND op.payload->>'kind'='reviewed_session_completion'
      AND op.payload->>'sessionId'=NEW.prescribed_session_id::text
      AND op.payload->>'checkinId'=NEW.id::text AND op.payload->'response'=NEW.responses
      AND (op.payload#>>'{request,occurredAt}')::timestamptz=NEW.occurred_at) THEN
    RAISE EXCEPTION 'Reviewed completion requires the set-preserving contract' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.complete_reviewed_session(p_session_id uuid,p_request_id text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner uuid:=auth.uid(); session public.prescribed_sessions%ROWTYPE; op public.activity_mutations%ROWTYPE;
  feedback jsonb:=p_request->'feedback'; expected_provenance jsonb; request_payload jsonb;
  occurred timestamptz; workout_day date; completion_day date; first_set_day date; offset_minutes integer; total_minutes integer; state text:=p_request->>'status';
  active uuid; program_status text; program_mode text; plan_status text;
  reports jsonb; report_ids jsonb; supplied_ids jsonb; blocks jsonb; response jsonb; result jsonb; v_receipt jsonb;
  workout_id uuid; checkin_id uuid:=gen_random_uuid(); mutation_id uuid:=gen_random_uuid();
  refs jsonb; reported jsonb; unknown_value jsonb; proof jsonb; captured timestamptz:=clock_timestamp();
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_request_id IS NULL OR length(btrim(p_request_id)) NOT BETWEEN 8 AND 175
    OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR length(p_request::text)>100000
    OR NOT (p_request ?& ARRAY['contractVersion','status','feedback','occurredAt','workoutDate','tzOffset','totalDurationMinutes','setReportIds'])
    OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>8 OR p_request->'contractVersion' IS DISTINCT FROM '3'::jsonb
    OR coalesce(state,'') NOT IN ('completed','skipped') THEN RAISE EXCEPTION 'Invalid reviewed completion request' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(feedback) IS DISTINCT FROM 'object' OR feedback->'schemaVersion' IS DISTINCT FROM '2'::jsonb
    OR feedback->'feedbackVersion' IS DISTINCT FROM '2'::jsonb
    OR NOT (feedback ?& ARRAY['schemaVersion','feedbackVersion','outcome','sessionRpe','energy','pain','note','provenance'])
    OR (SELECT count(*) FROM jsonb_object_keys(feedback))<>8
    OR coalesce(feedback->>'outcome','') NOT IN ('as_planned','modified','stopped_early','skipped')
    OR (state='skipped') IS DISTINCT FROM (feedback->>'outcome'='skipped')
    OR jsonb_typeof(feedback->'sessionRpe') NOT IN ('number','null')
    OR (feedback->'sessionRpe'<>'null'::jsonb AND (NOT public.reviewed_report_number(feedback->'sessionRpe',10)
      OR (feedback->>'sessionRpe')::numeric<1 OR mod((feedback->>'sessionRpe')::numeric*2,1)<>0))
    OR (state='skipped' AND feedback->'sessionRpe'<>'null'::jsonb)
    OR (feedback->'energy'<>'null'::jsonb AND coalesce(feedback->>'energy','') NOT IN ('low','okay','high'))
    OR (feedback->'pain'<>'null'::jsonb AND coalesce(feedback->>'pain','') NOT IN ('none','mild','concerning'))
    OR jsonb_typeof(feedback->'note') NOT IN ('string','null') OR length(coalesce(feedback->>'note',''))>500 THEN
    RAISE EXCEPTION 'Invalid explicit session feedback' USING ERRCODE='22023'; END IF;
  SELECT jsonb_object_agg(field,jsonb_build_object('origin',CASE WHEN feedback->>field IS NULL THEN 'unknown' ELSE 'athlete_reported' END,
    'reviewState',CASE WHEN feedback->>field IS NULL THEN 'unreviewed' ELSE 'athlete_confirmed' END)) INTO expected_provenance
    FROM unnest(ARRAY['sessionRpe','energy','pain']) field;
  IF feedback->'provenance' IS DISTINCT FROM expected_provenance THEN RAISE EXCEPTION 'Feedback provenance changed' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_request->'occurredAt') IS DISTINCT FROM 'string'
    OR (p_request->>'occurredAt') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-](0\d|1[0-4]):[0-5]\d)$'
    OR jsonb_typeof(p_request->'workoutDate') IS DISTINCT FROM 'string' OR (p_request->>'workoutDate') !~ '^\d{4}-\d{2}-\d{2}$'
    OR jsonb_typeof(p_request->'tzOffset') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid completion date or offset' USING ERRCODE='22023'; END IF;
  BEGIN
    occurred:=(p_request->>'occurredAt')::timestamptz; workout_day:=(p_request->>'workoutDate')::date;
    IF abs((p_request->>'tzOffset')::numeric)>840 OR (p_request->>'tzOffset')::numeric<>trunc((p_request->>'tzOffset')::numeric) THEN
      RAISE EXCEPTION 'Invalid offset' USING ERRCODE='22023'; END IF;
    offset_minutes:=(p_request->>'tzOffset')::integer;
    completion_day:=(occurred AT TIME ZONE 'UTC' - make_interval(mins=>offset_minutes))::date;
    IF NOT isfinite(occurred) OR completion_day NOT BETWEEN workout_day AND workout_day+1 THEN
      RAISE EXCEPTION 'Occurrence and athlete-local session dates disagree' USING ERRCODE='22023'; END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid completion date' USING ERRCODE='22023';
  END;
  IF p_request->'totalDurationMinutes'<>'null'::jsonb THEN
    IF NOT public.reviewed_report_number(p_request->'totalDurationMinutes',1440,true) OR (p_request->>'totalDurationMinutes')::integer<1 OR state='skipped' THEN
      RAISE EXCEPTION 'Invalid actual session duration' USING ERRCODE='22023'; END IF;
    total_minutes:=(p_request->>'totalDurationMinutes')::integer;
  END IF;
  IF jsonb_typeof(p_request->'setReportIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'setReportIds')>1000 THEN
    RAISE EXCEPTION 'Invalid set revision manifest' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_request->'setReportIds') e WHERE jsonb_typeof(e)<>'string' OR (e#>>'{}') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
    OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(p_request->'setReportIds'))<>jsonb_array_length(p_request->'setReportIds') THEN
    RAISE EXCEPTION 'Invalid set revision identities' USING ERRCODE='22023'; END IF;
  -- Same owner capture lock order as canonical amendments/completion, then session.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('capture-owner:'||owner::text,0));
  SELECT * INTO session FROM public.prescribed_sessions s WHERE s.id=p_session_id AND s.user_id=owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prescribed session not found' USING ERRCODE='P0002'; END IF;
  request_payload:=jsonb_build_object('kind','reviewed_session_completion','sessionId',p_session_id,'request',p_request);
  SELECT * INTO op FROM public.activity_mutations m WHERE m.user_id=owner AND m.request_key='reviewed-completion:'||btrim(p_request_id);
  IF FOUND THEN
    IF op.payload-'checkinId'-'response' IS DISTINCT FROM request_payload OR op.receipt IS NULL THEN
      RAISE EXCEPTION 'Completion key conflicts with saved request' USING ERRCODE='22023'; END IF;
    RETURN jsonb_set(op.receipt,'{result,replayed}','true');
  END IF;
  IF occurred>transaction_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'Completion time is in the future' USING ERRCODE='22023'; END IF;
  IF session.status<>'planned' OR session.prescription->>'format' IS DISTINCT FROM 'reviewed_programming_v0_1' THEN
    RAISE EXCEPTION 'Reviewed session is unavailable or already terminal' USING ERRCODE='55000'; END IF;
  SELECT p.active_plan_version_id,p.status,p.program_mode INTO active,program_status,program_mode FROM public.training_programs p
    WHERE p.id=session.program_id AND p.user_id=owner FOR UPDATE;
  SELECT p.status INTO plan_status FROM public.training_plan_versions p WHERE p.id=session.plan_version_id AND p.user_id=owner FOR UPDATE;
  IF active IS DISTINCT FROM session.plan_version_id OR program_status IS DISTINCT FROM 'active' OR program_mode IS DISTINCT FROM 'rolling_weekly' OR plan_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Active accepted plan changed' USING ERRCODE='40001'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.activity_id,r.set_number,r.side),'[]'),coalesce(jsonb_agg(r.id::text ORDER BY r.id::text),'[]') INTO reports,report_ids
    FROM (SELECT DISTINCT ON (activity_id,set_number,side) * FROM public.coach_reviewed_set_reports
      WHERE prescribed_session_id=p_session_id AND user_id=owner ORDER BY activity_id,set_number,side,revision DESC) r;
  SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO supplied_ids FROM jsonb_array_elements(p_request->'setReportIds');
  IF report_ids IS DISTINCT FROM supplied_ids THEN RAISE EXCEPTION 'Set reports changed; review current revisions before completing' USING ERRCODE='40001'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(reports) r WHERE (r#>>'{report,performedAt}')::timestamptz>occurred) THEN
    RAISE EXCEPTION 'Set occurrence is after session completion' USING ERRCODE='22023'; END IF;
  SELECT min(((r#>>'{report,performedAt}')::timestamptz AT TIME ZONE 'UTC' - make_interval(mins=>offset_minutes))::date)
    INTO first_set_day FROM jsonb_array_elements(reports) r WHERE r#>>'{report,status}'='performed';
  -- Anchor the workout to the first performed set. Allow completion on the next
  -- local date for overnight sessions; never move older work to the logging day.
  IF coalesce(first_set_day,completion_day)<>workout_day THEN
    RAISE EXCEPTION 'Workout date must match the first reported set date' USING ERRCODE='22023'; END IF;
  IF (state='completed') IS DISTINCT FROM EXISTS(SELECT 1 FROM jsonb_array_elements(reports) r WHERE r#>>'{report,status}'='performed') THEN
    RAISE EXCEPTION 'Session outcome contradicts recorded set work' USING ERRCODE='22023'; END IF;
  -- Each movement is one reported set, including explicit nonperformance. No
  -- target, assistance load, tempo allowance or missing RPE becomes an actual.
  SELECT coalesce(jsonb_agg(jsonb_build_object('block_type',CASE WHEN r#>>'{activity_snapshot,work,kind}'='repetitions' THEN 'STRENGTH' ELSE 'CARDIO' END,
    'role',CASE r#>>'{activity_snapshot,role}' WHEN 'preparation' THEN 'specific_preparation' WHEN 'working' THEN 'priority_adaptation' ELSE r#>>'{activity_snapshot,role}' END,
    'movements',jsonb_build_array(jsonb_build_object(
      'name',r#>>'{activity_snapshot,movementId}','movementId',r#>>'{activity_snapshot,movementId}',
      'completed',r#>>'{report,status}'='performed','sets',CASE WHEN r#>>'{report,status}'='performed' THEN 1 ELSE 0 END,
      'reps',r#>'{report,repetitions}','load',r#>'{report,load,value}','unit',r#>'{report,load,unit}',
      'effort',r#>'{report,rpe}','durationSeconds',r#>'{report,durationSeconds}','distanceMetres',r#>'{report,distanceMetres}',
      'restAfterSeconds',r#>'{report,restAfterSeconds}','velocity',r#>'{report,velocity}',
      'unilateralConvention',jsonb_build_object('side',r#>'{report,side}','loadConvention',r#>'{report,load,convention}'),
      'protocol',jsonb_build_object('prescribedProtocolId',r#>'{activity_snapshot,protocolId}','actualSetup','unknown'),
      'setReportId',r->'id','setReportRevision',r->'revision','setNumber',r#>'{report,setNumber}',
      'performedAt',r#>'{report,performedAt}','stopped',r#>'{report,stopped}','symptoms',r#>'{report,symptoms}','note',r#>'{report,note}'
    ))) ORDER BY ord),'[]') INTO blocks FROM jsonb_array_elements(reports) WITH ORDINALITY x(r,ord);
  IF length(blocks::text)>2000000 THEN RAISE EXCEPTION 'Reported work exceeds completion size limit' USING ERRCODE='22023'; END IF;
  refs:=jsonb_build_array('session:'||p_session_id::text,'checkin:'||checkin_id::text)||report_ids;
  reported:=jsonb_build_object('origin','athlete_reported','reviewState','athlete_confirmed','sourceReferences',refs);
  unknown_value:=jsonb_build_object('origin','legacy_unknown','reviewState','unreviewed','sourceReferences','[]'::jsonb);
  proof:=jsonb_build_object('schemaVersion',1,'occurrence',reported,'fields',jsonb_build_object('blocks',reported,'quantities',reported,
    'rpe',CASE WHEN feedback->>'sessionRpe' IS NULL THEN unknown_value ELSE reported END,'duration',CASE WHEN total_minutes IS NULL THEN unknown_value ELSE reported END));
  IF state='completed' THEN
    INSERT INTO public.workouts(user_id,workout_date,input_text,blocks,primary_score,total_duration_min,tags,notes,rpe,parse_confidence,
      execution_source,execution_status,started_at,completed_at,updated_at,execution_revision,capture_provenance,capture_input_method,captured_at)
      VALUES(owner,workout_day,'Reported sets from reviewed session: '||coalesce(session.prescription->>'title','Training'),blocks,NULL,total_minutes,
        ARRAY['coach-program','reviewed-set-reports'],feedback->>'note',CASE WHEN mod((feedback->>'sessionRpe')::numeric,1)=0 THEN (feedback->>'sessionRpe')::integer ELSE NULL END,
        1.0,'program_runner','completed',(SELECT min((r#>>'{report,performedAt}')::timestamptz) FROM jsonb_array_elements(reports) r WHERE r#>>'{report,status}'='performed'),occurred,captured,0,proof,'program',captured)
      RETURNING id INTO workout_id;
  END IF;
  response:=feedback||jsonb_build_object('completionContractVersion',3,'idempotencyKey',btrim(p_request_id),'resultStatus',state,
    'completionRequest',p_request||jsonb_build_object('sessionId',p_session_id),'workoutId',workout_id,'observationGroupIds','[]'::jsonb,
    'completionOperationId',mutation_id,'setReportIds',report_ids,'performedBlocks',blocks,'feedbackProvenance',jsonb_build_object('checkinId',checkin_id,'revision',1));
  INSERT INTO public.activity_mutations(id,user_id,request_key,payload) VALUES(mutation_id,owner,'reviewed-completion:'||btrim(p_request_id),
    request_payload||jsonb_build_object('checkinId',checkin_id,'response',response));
  INSERT INTO public.coach_checkins(id,user_id,program_id,plan_version_id,prescribed_session_id,checkin_type,responses,occurred_at)
    VALUES(checkin_id,owner,session.program_id,session.plan_version_id,p_session_id,'session',response,occurred);
  UPDATE public.prescribed_sessions SET status=state,completion_contract_version=3,completed_workout_id=workout_id,
    execution_note=feedback->>'note',completed_at=CASE WHEN state='completed' THEN occurred END,updated_at=captured WHERE id=p_session_id AND user_id=owner;
  IF workout_id IS NOT NULL THEN
    PERFORM public.capture_snapshot('workout',workout_id,mutation_id,false,NULL,jsonb_build_object('reported_rpe',feedback->'sessionRpe'),workout_day::timestamptz,'date');
    v_receipt:=jsonb_build_object('schemaVersion',2,'userId',owner,'requestId',mutation_id,'requestKey','reviewed-completion:'||btrim(p_request_id),
      'operationId',mutation_id,'entityKind','workout','entityId',workout_id,'revision',1,'eventAt',workout_day::text,'eventPrecision','date',
      'capturedAt',captured,'inputMethod','program','state','saved','provenance',proof,'recommendationId',NULL);
  END IF;
  result:=jsonb_build_object('prescribed_session_id',p_session_id,'session_status',state,'checkin_id',checkin_id,'workout_id',workout_id,
    'observation_group_ids','[]'::jsonb,'occurred_at',occurred,'replayed',false);
  UPDATE public.activity_mutations SET receipt=jsonb_build_object('result',result,'receipt',v_receipt) WHERE id=mutation_id;
  RETURN jsonb_build_object('result',result,'receipt',v_receipt);
END $$;
REVOKE ALL ON FUNCTION public.complete_reviewed_session(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_reviewed_session(uuid,text,jsonb) TO authenticated;
ALTER FUNCTION public.complete_reviewed_session(uuid,text,jsonb) SET lock_timeout='1s';
COMMIT;
