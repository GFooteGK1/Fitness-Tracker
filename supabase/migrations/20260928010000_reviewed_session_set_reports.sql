-- Local W5 storage/capture contract. Does not authorize reviewed generation or acceptance.
BEGIN;

ALTER TABLE public.prescribed_sessions DROP CONSTRAINT prescribed_sessions_contract_check;
ALTER TABLE public.prescribed_sessions ADD CONSTRAINT prescribed_sessions_contract_check CHECK ((
  CASE WHEN prescription->>'format' = 'reviewed_programming_v0_1' THEN (
    prescription->'schemaVersion' = '1'::jsonb
    AND prescription->>'policyVersion' = 'initial-dose-0.2.0'
    AND jsonb_typeof(prescription->'content') = 'object'
    AND jsonb_typeof(prescription#>'{content,steps}') = 'array'
    AND jsonb_typeof(prescription->'protocols') = 'array'
    AND jsonb_typeof(prescription->'source') = 'object'
    AND prescription->>'sessionId' = prescription#>>'{content,id}'
    AND prescription#>>'{source,recipeHash}' ~ '^[a-f0-9]{64}$') IS TRUE
  ELSE
    (prescription ?& ARRAY['domain','intent','dose','effort','rest','success_condition','stop_condition','scale_options','evidence'])
    OR (prescription->>'format' = 'complete_programming_v0_3'
      AND prescription->>'kernelVersion' = '0.3.0' AND jsonb_typeof(prescription->'schemaVersion') = 'number'
      AND prescription ?& ARRAY['domain','intent','policyVersion','evidenceReferenceVersion','movementCatalogVersion','blocks']
      AND jsonb_typeof(prescription->'blocks') = 'array' AND jsonb_array_length(prescription->'blocks') >= 2)
  END
)) NOT VALID;
ALTER TABLE public.prescribed_sessions VALIDATE CONSTRAINT prescribed_sessions_contract_check;

-- Store exactly the dated parent-plan session; this is structural correspondence,
-- not evidence that a recipe was reviewed or that numerical generation is enabled.
CREATE FUNCTION public.guard_reviewed_session_storage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE plan public.training_plan_versions%ROWTYPE; matches integer;
BEGIN
  SELECT * INTO plan FROM public.training_plan_versions p
    WHERE p.id=NEW.plan_version_id AND p.program_id=NEW.program_id AND p.user_id=NEW.user_id;
  IF NEW.prescription->>'format' IS DISTINCT FROM 'reviewed_programming_v0_1'
    AND plan.intent->>'format' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1' THEN RETURN NEW; END IF;
  IF NEW.prescription->>'format' IS DISTINCT FROM 'reviewed_programming_v0_1'
    OR plan.plan_mode IS DISTINCT FROM 'rolling_weekly'
    OR plan.intent->>'format' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1'
    OR plan.intent#>>'{reviewed_week,windowStart}' IS DISTINCT FROM plan.window_start::text
    OR plan.intent#>>'{reviewed_week,windowEnd}' IS DISTINCT FROM plan.window_end::text
    OR plan.intent#>'{reviewed_week,sequenceNumber}' IS DISTINCT FROM to_jsonb(plan.sequence_number)
    OR jsonb_typeof(plan.intent#>'{reviewed_week,scheduledSessions}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Reviewed session requires its exact dated parent plan' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO matches FROM jsonb_array_elements(plan.intent#>'{reviewed_week,scheduledSessions}') WITH ORDINALITY s(value,idx)
    WHERE s.value->'prescription'=NEW.prescription AND s.value->>'scheduledDate'=NEW.scheduled_date::text
      AND s.idx=NEW.session_index AND NEW.week_number=1;
  IF matches<>1 THEN RAISE EXCEPTION 'Reviewed session differs from parent plan' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reviewed_session_storage() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_reviewed_session_storage BEFORE INSERT OR UPDATE ON public.prescribed_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_session_storage();

-- Old authenticated proposal RPCs must not gain numerical authority merely
-- because storage can represent a reviewed session. A later explicit acceptance
-- integration must replace this fence with server-registered authority checks.
CREATE FUNCTION public.guard_reviewed_proposal_disabled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.training_plan_versions p WHERE p.id=NEW.proposed_plan_version_id AND p.user_id=NEW.user_id
      AND p.intent->>'format'='reviewed_weekly_intent_v0_1')
    OR EXISTS (SELECT 1 FROM public.prescribed_sessions s WHERE s.plan_version_id=NEW.proposed_plan_version_id AND s.user_id=NEW.user_id
      AND s.prescription->>'format'='reviewed_programming_v0_1') THEN
    RAISE EXCEPTION 'Reviewed numerical proposals remain disabled' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reviewed_proposal_disabled() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_reviewed_proposal_disabled BEFORE INSERT OR UPDATE OF status ON public.adaptation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_proposal_disabled();

CREATE FUNCTION public.reviewed_report_number(v jsonb, maximum numeric, whole boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  RETURN (v#>>'{}')::numeric BETWEEN 0 AND maximum AND (NOT whole OR (v#>>'{}')::numeric=trunc((v#>>'{}')::numeric));
END $$;
REVOKE ALL ON FUNCTION public.reviewed_report_number(jsonb,numeric,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.valid_reviewed_set_report(r jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE field text; maximum numeric; rep jsonb; velocity jsonb := r->'velocity';
BEGIN
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR length(r::text)>100000
    OR NOT (r ?& ARRAY['schemaVersion','activityId','setNumber','side','revision','status','performedAt','repetitions',
      'durationSeconds','distanceMetres','load','rpe','restAfterSeconds','stopped','symptoms','note','velocity'])
    OR (SELECT count(*) FROM jsonb_object_keys(r))<>17
    OR r->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(r->'activityId') IS DISTINCT FROM 'string' OR length(btrim(r->>'activityId')) NOT BETWEEN 1 AND 200
    OR NOT public.reviewed_report_number(r->'setNumber',1000,true) OR (r->>'setNumber')::numeric<1
    OR NOT public.reviewed_report_number(r->'revision',1000000,true) OR (r->>'revision')::numeric<1
    OR coalesce(r->>'side','') NOT IN ('both','left','right') OR coalesce(r->>'status','') NOT IN ('performed','not_performed')
    OR jsonb_typeof(r->'performedAt') IS DISTINCT FROM 'string'
    OR (r->>'performedAt') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-](0\d|1[0-4]):[0-5]\d)$'
    OR NOT isfinite((r->>'performedAt')::timestamptz)
    OR jsonb_typeof(r->'stopped') NOT IN ('boolean','null') THEN RETURN false; END IF;
  FOR field,maximum IN SELECT * FROM (VALUES ('repetitions',1000::numeric),('durationSeconds',86400),('distanceMetres',1000000),('restAfterSeconds',86400)) x(key,maximum) LOOP
    IF r->field<>'null'::jsonb AND NOT public.reviewed_report_number(r->field,maximum,field='repetitions') THEN RETURN false; END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['symptoms','note'] LOOP
    IF r->field<>'null'::jsonb AND (jsonb_typeof(r->field)<>'string' OR length(btrim(r->>field))<1
      OR length(r->>field)>CASE WHEN field='note' THEN 1000 ELSE 500 END) THEN RETURN false; END IF;
  END LOOP;
  IF r->'load'<>'null'::jsonb THEN
    IF jsonb_typeof(r->'load')<>'object' OR NOT (r->'load' ?& ARRAY['value','unit','convention'])
      OR (SELECT count(*) FROM jsonb_object_keys(r->'load'))<>3
      OR NOT public.reviewed_report_number(r#>'{load,value}',2000)
      OR coalesce(r#>>'{load,unit}','') NOT IN ('lb','kg') OR coalesce(r#>>'{load,convention}','') NOT IN ('total','per_hand') THEN RETURN false; END IF;
  END IF;
  IF r->'rpe'<>'null'::jsonb THEN
    IF jsonb_typeof(r->'rpe')<>'object' OR NOT (r->'rpe' ?& ARRAY['value','scale'])
      OR (SELECT count(*) FROM jsonb_object_keys(r->'rpe'))<>2 OR NOT public.reviewed_report_number(r#>'{rpe,value}',10)
      OR coalesce(r#>>'{rpe,scale}','') NOT IN ('effort_0_10','rir_based') THEN RETURN false; END IF;
  END IF;
  IF velocity<>'null'::jsonb THEN
    IF jsonb_typeof(velocity)<>'object' OR NOT (velocity ?& ARRAY['unit','device','method','repetitions'])
      OR (SELECT count(*) FROM jsonb_object_keys(velocity))<>4 OR velocity->>'unit' IS DISTINCT FROM 'm/s'
      OR jsonb_typeof(velocity->'device') IS DISTINCT FROM 'string' OR length(btrim(velocity->>'device')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(velocity->'method') IS DISTINCT FROM 'string' OR length(btrim(velocity->>'method')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(velocity->'repetitions') IS DISTINCT FROM 'array' OR r->'repetitions'='null'::jsonb THEN RETURN false; END IF;
    IF jsonb_array_length(velocity->'repetitions') NOT BETWEEN 1 AND 1000
      OR (SELECT count(DISTINCT value->'rep') FROM jsonb_array_elements(velocity->'repetitions'))<>jsonb_array_length(velocity->'repetitions') THEN RETURN false; END IF;
    FOR rep IN SELECT value FROM jsonb_array_elements(velocity->'repetitions') LOOP
      IF jsonb_typeof(rep)<>'object' OR NOT (rep ?& ARRAY['rep','meanConcentricVelocity'])
        OR (SELECT count(*) FROM jsonb_object_keys(rep))<>2
        OR NOT public.reviewed_report_number(rep->'rep',(r->>'repetitions')::numeric,true) OR (rep->>'rep')::numeric<1
        OR NOT public.reviewed_report_number(rep->'meanConcentricVelocity',20) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  IF r->>'status'='not_performed' AND EXISTS (SELECT 1 FROM unnest(ARRAY['repetitions','durationSeconds','distanceMetres','load','rpe','restAfterSeconds','velocity']) f WHERE r->f<>'null'::jsonb) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_reviewed_set_report(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.coach_reviewed_set_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prescribed_session_id uuid NOT NULL, plan_version_id uuid NOT NULL, program_id uuid NOT NULL,
  request_id text NOT NULL CHECK(length(request_id) BETWEEN 8 AND 200),
  activity_id text NOT NULL, set_number integer NOT NULL, side text NOT NULL, revision integer NOT NULL,
  report jsonb NOT NULL CHECK(public.valid_reviewed_set_report(report)),
  prescription_snapshot jsonb NOT NULL, activity_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(prescribed_session_id,plan_version_id,program_id,user_id) REFERENCES public.prescribed_sessions(id,plan_version_id,program_id,user_id) ON DELETE CASCADE,
  UNIQUE(user_id,request_id), UNIQUE(prescribed_session_id,activity_id,set_number,side,revision),
  CHECK ((report->>'activityId'=activity_id AND report->'setNumber'=to_jsonb(set_number)
    AND report->>'side'=side AND report->'revision'=to_jsonb(revision)) IS TRUE)
);
ALTER TABLE public.coach_reviewed_set_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_reviewed_set_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY reviewed_set_owner_read ON public.coach_reviewed_set_reports FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.coach_reviewed_set_reports FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.coach_reviewed_set_reports TO authenticated;
CREATE INDEX reviewed_set_owner_idx ON public.coach_reviewed_set_reports(user_id,prescribed_session_id,created_at);
CREATE TRIGGER zz_advance_coach_context_revision AFTER INSERT OR UPDATE OR DELETE ON public.coach_reviewed_set_reports
  FOR EACH ROW EXECUTE FUNCTION public.advance_coach_context_revision();

CREATE FUNCTION public.record_reviewed_session_set(p_session_id uuid,p_request_id text,p_report jsonb)
RETURNS TABLE(id uuid,created_at timestamptz,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner uuid:=auth.uid(); session public.prescribed_sessions%ROWTYPE; saved public.coach_reviewed_set_reports%ROWTYPE;
  active uuid; plan_status text; program_status text; program_mode text; activity jsonb; matches integer; current_revision integer; sides integer;
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_request_id IS NULL OR length(btrim(p_request_id)) NOT BETWEEN 8 AND 200 OR NOT public.valid_reviewed_set_report(p_report) THEN
    RAISE EXCEPTION 'Invalid set report' USING ERRCODE='22023'; END IF;
  SELECT * INTO session FROM public.prescribed_sessions s WHERE s.id=p_session_id AND s.user_id=owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prescribed session not found' USING ERRCODE='P0002'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':reviewed-set:'||btrim(p_request_id),0));
  SELECT * INTO saved FROM public.coach_reviewed_set_reports r WHERE r.user_id=owner AND r.request_id=btrim(p_request_id);
  IF FOUND THEN
    IF saved.prescribed_session_id IS DISTINCT FROM p_session_id OR saved.report IS DISTINCT FROM p_report THEN
      RAISE EXCEPTION 'Request conflicts with saved set report' USING ERRCODE='22023'; END IF;
    RETURN QUERY SELECT saved.id,saved.created_at,true; RETURN;
  END IF;
  IF session.status<>'planned' THEN RAISE EXCEPTION 'Session is already terminal' USING ERRCODE='55000'; END IF;
  SELECT p.active_plan_version_id,p.status,p.program_mode INTO active,program_status,program_mode FROM public.training_programs p
    WHERE p.id=session.program_id AND p.user_id=owner FOR UPDATE;
  IF active IS DISTINCT FROM session.plan_version_id OR program_status IS DISTINCT FROM 'active' OR program_mode IS DISTINCT FROM 'rolling_weekly' THEN
    RAISE EXCEPTION 'Active plan changed' USING ERRCODE='40001'; END IF;
  SELECT p.status INTO plan_status FROM public.training_plan_versions p WHERE p.id=active AND p.user_id=owner FOR UPDATE;
  IF plan_status IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Plan is not accepted' USING ERRCODE='40001'; END IF;
  IF session.prescription->>'format' IS DISTINCT FROM 'reviewed_programming_v0_1'
    OR (p_report->>'performedAt')::timestamptz>clock_timestamp()+interval '5 minutes' THEN
    RAISE EXCEPTION 'Set report requires a reviewed session and valid occurrence time' USING ERRCODE='22023'; END IF;
  SELECT count(*),jsonb_agg(a.value)->0 INTO matches,activity FROM (
    SELECT value FROM jsonb_array_elements(session.prescription#>'{content,steps}') WHERE value->>'kind'='activity'
    UNION ALL
    SELECT a.value FROM jsonb_array_elements(session.prescription#>'{content,steps}') s
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN s.value->>'kind'='preparation_window' THEN s.value->'activities' ELSE '[]'::jsonb END) a
  ) a WHERE a.value->>'id'=p_report->>'activityId';
  IF matches<>1 THEN RAISE EXCEPTION 'Activity does not match accepted prescription' USING ERRCODE='22023'; END IF;
  sides:=CASE WHEN activity#>>'{work,kind}'='distance' THEN 1 ELSE (activity#>>'{work,sides}')::integer END;
  IF sides NOT IN (1,2) OR sides IS NULL OR ((sides=1) IS DISTINCT FROM (p_report->>'side'='both')) THEN
    RAISE EXCEPTION 'Report side does not match accepted activity' USING ERRCODE='22023'; END IF;
  SELECT coalesce(max(r.revision),0) INTO current_revision FROM public.coach_reviewed_set_reports r
    WHERE r.prescribed_session_id=p_session_id AND r.activity_id=p_report->>'activityId'
      AND r.set_number=(p_report->>'setNumber')::integer AND r.side=p_report->>'side';
  IF (p_report->>'revision')::integer<>current_revision+1 THEN RAISE EXCEPTION 'Set report revision changed; read current report' USING ERRCODE='40001'; END IF;
  INSERT INTO public.coach_reviewed_set_reports(user_id,prescribed_session_id,plan_version_id,program_id,request_id,
    activity_id,set_number,side,revision,report,prescription_snapshot,activity_snapshot)
    VALUES(owner,p_session_id,session.plan_version_id,session.program_id,btrim(p_request_id),p_report->>'activityId',
      (p_report->>'setNumber')::integer,p_report->>'side',(p_report->>'revision')::integer,p_report,session.prescription,activity)
    RETURNING * INTO saved;
  RETURN QUERY SELECT saved.id,saved.created_at,false;
END $$;
REVOKE ALL ON FUNCTION public.record_reviewed_session_set(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_reviewed_session_set(uuid,text,jsonb) TO authenticated;
ALTER FUNCTION public.record_reviewed_session_set(uuid,text,jsonb) SET lock_timeout='1s';

-- Prevent old completion code from converting targets into fabricated actuals.
CREATE FUNCTION public.guard_reviewed_session_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.checkin_type='session' AND EXISTS (SELECT 1 FROM public.prescribed_sessions s
    WHERE s.id=NEW.prescribed_session_id AND s.user_id=NEW.user_id AND s.prescription->>'format'='reviewed_programming_v0_1') THEN
    RAISE EXCEPTION 'Reviewed completion requires the set-preserving contract' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reviewed_session_completion() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_reviewed_session_completion BEFORE INSERT OR UPDATE ON public.coach_checkins
  FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_session_completion();

COMMIT;
