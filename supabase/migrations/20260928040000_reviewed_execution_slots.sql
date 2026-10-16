-- Immutable planning slots reuse canonical execution; actuals are never copied.
BEGIN;
CREATE TABLE public.coach_reviewed_execution_slots (
  plan_version_id uuid NOT NULL,
  program_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_index integer NOT NULL CHECK(session_index BETWEEN 1 AND 14),
  prescribed_session_id uuid NOT NULL,
  execution_plan_version_id uuid NOT NULL,
  PRIMARY KEY(plan_version_id,session_index),
  UNIQUE(plan_version_id,prescribed_session_id),
  FOREIGN KEY(plan_version_id,program_id,user_id) REFERENCES public.training_plan_versions(id,program_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(prescribed_session_id,execution_plan_version_id,program_id,user_id)
    REFERENCES public.prescribed_sessions(id,plan_version_id,program_id,user_id) ON DELETE NO ACTION
);
ALTER TABLE public.coach_reviewed_execution_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_reviewed_execution_slots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_reviewed_execution_slots FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.coach_reviewed_execution_slots TO authenticated;
CREATE POLICY reviewed_execution_slots_owner ON public.coach_reviewed_execution_slots
  FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE FUNCTION public.guard_reviewed_execution_slot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.training_plan_versions%ROWTYPE; root public.prescribed_sessions%ROWTYPE; expected jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Execution slot identity is immutable' USING ERRCODE='55000'; END IF;
  SELECT * INTO target FROM public.training_plan_versions WHERE id=NEW.plan_version_id AND user_id=NEW.user_id AND program_id=NEW.program_id;
  SELECT * INTO root FROM public.prescribed_sessions WHERE id=NEW.prescribed_session_id AND plan_version_id=NEW.execution_plan_version_id
    AND user_id=NEW.user_id AND program_id=NEW.program_id;
  expected:=target.intent#>'{reviewed_week,scheduledSessions}'->(NEW.session_index-1);
  IF target.input_snapshot->>'reviewedExecutionStorage' IS DISTINCT FROM 'reviewed_execution_slots_v1'
    OR target.intent->>'format' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1'
    OR target.status IS DISTINCT FROM 'proposed'
    OR root.id IS NULL OR root.prescription->>'format' IS DISTINCT FROM 'reviewed_programming_v0_1'
    OR expected->'prescription' IS DISTINCT FROM root.prescription
    OR expected->>'scheduledDate' IS DISTINCT FROM root.scheduled_date::text THEN
    RAISE EXCEPTION 'Execution slot must match its complete reviewed prescription and date' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reviewed_execution_slot() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_reviewed_execution_slot BEFORE INSERT OR UPDATE ON public.coach_reviewed_execution_slots
  FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_execution_slot();

CREATE FUNCTION public.guard_reviewed_execution_storage_marker() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.input_snapshot->'reviewedExecutionStorage' IS DISTINCT FROM OLD.input_snapshot->'reviewedExecutionStorage' THEN
    RAISE EXCEPTION 'Execution storage contract is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reviewed_execution_storage_marker() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_reviewed_execution_storage_marker BEFORE UPDATE ON public.training_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_execution_storage_marker();

CREATE VIEW public.coach_effective_prescribed_sessions WITH (security_invoker=true) AS
WITH slots AS (
  SELECT s.id,s.user_id,s.program_id,l.plan_version_id,s.plan_version_id AS execution_plan_version_id,
    1 AS week_number,l.session_index,s.scheduled_date,s.prescription,s.status,s.completed_workout_id,
    s.execution_note,s.completed_at,s.completion_contract_version,s.created_at,s.updated_at
  FROM public.coach_reviewed_execution_slots l JOIN public.prescribed_sessions s ON s.id=l.prescribed_session_id
    AND s.user_id=l.user_id AND s.program_id=l.program_id AND s.plan_version_id=l.execution_plan_version_id
  JOIN public.training_plan_versions p ON p.id=l.plan_version_id AND p.user_id=l.user_id
  WHERE p.input_snapshot->>'reviewedExecutionStorage'='reviewed_execution_slots_v1'
  UNION ALL
  SELECT s.id,s.user_id,s.program_id,s.plan_version_id,s.plan_version_id, s.week_number,s.session_index,
    s.scheduled_date,s.prescription,s.status,s.completed_workout_id,s.execution_note,s.completed_at,
    s.completion_contract_version,s.created_at,s.updated_at
  FROM public.prescribed_sessions s JOIN public.training_plan_versions p ON p.id=s.plan_version_id AND p.user_id=s.user_id
  -- Contract marker, never row existence: an incomplete mapped plan cannot fall back.
  WHERE p.input_snapshot->>'reviewedExecutionStorage' IS DISTINCT FROM 'reviewed_execution_slots_v1'
)
SELECT slots.*,
  (EXISTS(SELECT 1 FROM public.coach_reviewed_set_reports r WHERE r.prescribed_session_id=slots.id AND r.user_id=slots.user_id)
    OR EXISTS(SELECT 1 FROM public.coach_session_signals r WHERE r.prescribed_session_id=slots.id AND r.user_id=slots.user_id)
    OR EXISTS(SELECT 1 FROM public.coach_checkins r WHERE r.prescribed_session_id=slots.id AND r.user_id=slots.user_id)) AS has_reports
FROM slots;
REVOKE ALL ON public.coach_effective_prescribed_sessions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.coach_effective_prescribed_sessions TO authenticated;

-- Old aggregate session signals are also source inputs, even while status is planned.
CREATE TRIGGER zz_advance_coach_context_revision AFTER INSERT OR UPDATE OR DELETE ON public.coach_session_signals
  FOR EACH ROW EXECUTE FUNCTION public.advance_coach_context_revision();

-- Canonical source shape matches the authenticated TypeScript projection exactly.
CREATE FUNCTION public.reviewed_execution_source(p_user uuid,p_program uuid,p_plan uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('userId',s.user_id,'programId',s.program_id,'planVersionId',s.plan_version_id,
    'sessionIndex',s.session_index,'scheduledDate',s.scheduled_date,'prescription',s.prescription,
    'executionSessionId',s.id,'executionPlanVersionId',s.execution_plan_version_id,'status',s.status,
    'completedWorkoutId',s.completed_workout_id,'completionContractVersion',s.completion_contract_version,'hasReports',s.has_reports)
    ORDER BY s.session_index),'[]'::jsonb)
  FROM public.coach_effective_prescribed_sessions s WHERE s.user_id=p_user AND s.program_id=p_program AND s.plan_version_id=p_plan
$$;
REVOKE ALL ON FUNCTION public.reviewed_execution_source(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Called under program/base locks. Lock original roots before taking the revision fence.
CREATE FUNCTION public.assert_reviewed_execution_continuity(p_packet jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=(p_packet->>'userId')::uuid; program uuid:=(p_packet#>>'{source,binding,scope,programId}')::uuid;
  base uuid:=(p_packet#>>'{source,binding,scope,basePlanVersionId}')::uuid;
  source jsonb; expected jsonb; actual jsonb; links jsonb; session_id uuid;
BEGIN
  IF p_packet->'schemaVersion' IS DISTINCT FROM '2'::jsonb
    OR p_packet#>>'{source,binding,version}' IS DISTINCT FROM 'reviewed-dose-context-3'
    OR p_packet#>>'{inputSnapshot,reviewedExecutionStorage}' IS DISTINCT FROM 'reviewed_execution_slots_v1'
    OR p_packet#>>'{inputSnapshot,reviewedExecutionContinuity,storageContract}' IS DISTINCT FROM 'reviewed_execution_slots_v1'
    OR p_packet#>'{inputSnapshot,reviewedExecutionContinuity,schemaVersion}' IS DISTINCT FROM '1'::jsonb
    OR p_packet#>>'{inputSnapshot,reviewedExecutionContinuity,basePlanVersionId}' IS DISTINCT FROM base::text THEN
    RAISE EXCEPTION 'Reviewed execution registration requires refresh' USING ERRCODE='40001';
  END IF;
  FOR session_id IN SELECT s.id FROM public.prescribed_sessions s
    JOIN public.coach_effective_prescribed_sessions e ON e.id=s.id AND e.user_id=s.user_id
    WHERE e.plan_version_id=base AND e.program_id=program AND e.user_id=owner ORDER BY s.id FOR UPDATE OF s NOWAIT LOOP NULL; END LOOP;
  source:=public.reviewed_execution_source(owner,program,base);
  IF source IS DISTINCT FROM p_packet#>'{source,binding,executionSlots}' OR jsonb_array_length(source) NOT BETWEEN 1 AND 14 THEN
    RAISE EXCEPTION 'Reviewed execution source changed or incomplete' USING ERRCODE='40001'; END IF;
  expected:=coalesce(p_packet#>'{source,binding,base,plan,intent,reviewed_week,scheduledSessions}',
    p_packet#>'{source,binding,base,plan,intent,weekly_plan,scheduledSessions}');
  SELECT jsonb_agg(jsonb_build_object('scheduledDate',s->'scheduledDate','prescription',s->'prescription') ORDER BY (s->>'sessionIndex')::integer)
    INTO actual FROM jsonb_array_elements(source) s;
  SELECT jsonb_agg(jsonb_build_object('scheduledDate',s->'scheduledDate','prescription',s->'prescription') ORDER BY i)
    INTO expected FROM jsonb_array_elements(expected) WITH ORDINALITY e(s,i);
  IF actual IS DISTINCT FROM expected OR EXISTS(SELECT 1 FROM jsonb_array_elements(source) WITH ORDINALITY e(s,i)
    WHERE s->'sessionIndex' IS DISTINCT FROM to_jsonb(i)) THEN
    RAISE EXCEPTION 'Accepted execution manifest differs from intent' USING ERRCODE='55000'; END IF;
  -- Derive links ourselves from complete date/prescription equality, never caller IDs.
  SELECT jsonb_agg(jsonb_build_object('sessionIndex',i,'executionSessionId',s->'executionSessionId',
    'executionPlanVersionId',s->'executionPlanVersionId') ORDER BY i) INTO links
  FROM jsonb_array_elements(p_packet->'sessions') WITH ORDINALITY t(target,i)
  LEFT JOIN LATERAL (SELECT value AS s FROM jsonb_array_elements(source)
    WHERE value->'scheduledDate'=target->'scheduled_date' AND value->'prescription'=target->'prescription') matched ON true;
  IF links IS DISTINCT FROM p_packet#>'{inputSnapshot,reviewedExecutionContinuity,slots}'
    OR jsonb_array_length(links)<>jsonb_array_length(p_packet->'sessions')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(links) l WHERE l->>'executionSessionId' IS NOT NULL
      GROUP BY l->>'executionSessionId' HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(source) s WHERE (s->>'status'<>'planned' OR (s->>'hasReports')::boolean
      OR s->>'completedWorkoutId' IS NOT NULL OR s->>'completionContractVersion' IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(links) l WHERE l->>'executionSessionId'=s->>'executionSessionId')) THEN
    RAISE EXCEPTION 'Started execution must retain its exact prescription and date' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_reviewed_execution_continuity(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Shared active-root check; writers already hold original session then program locks.
CREATE FUNCTION public.assert_reviewed_execution_active(p_session uuid,p_owner uuid,p_active uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan public.training_plan_versions%ROWTYPE; sessions jsonb; expected jsonb;
BEGIN
  SELECT * INTO plan FROM public.training_plan_versions WHERE id=p_active AND user_id=p_owner FOR UPDATE;
  IF NOT FOUND OR plan.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Active accepted execution plan changed' USING ERRCODE='40001'; END IF;
  IF plan.input_snapshot->>'reviewedExecutionStorage'='reviewed_execution_slots_v1' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('scheduledDate',s.scheduled_date,'prescription',s.prescription) ORDER BY s.session_index),'[]'::jsonb)
      INTO sessions FROM public.coach_effective_prescribed_sessions s WHERE s.plan_version_id=plan.id AND s.user_id=p_owner;
    SELECT jsonb_agg(jsonb_build_object('scheduledDate',s->'scheduledDate','prescription',s->'prescription') ORDER BY i)
      INTO expected FROM jsonb_array_elements(plan.intent#>'{reviewed_week,scheduledSessions}') WITH ORDINALITY e(s,i);
    IF sessions IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Active execution manifest incomplete' USING ERRCODE='55000'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.coach_effective_prescribed_sessions s WHERE s.id=p_session AND s.user_id=p_owner
    AND s.plan_version_id=p_active AND s.program_id=plan.program_id) THEN
    RAISE EXCEPTION 'Execution is not in the active accepted plan' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_reviewed_execution_active(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.register_reviewed_week_proposal(p_id uuid,p_packet jsonb,p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.coach_reviewed_proposal_registrations%ROWTYPE; owner uuid; manifest jsonb;
BEGIN
  -- Preserve exact existing registration retries across contract upgrades.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('reviewed-registration:'||p_id::text,0));
  SELECT * INTO saved FROM public.coach_reviewed_proposal_registrations WHERE id=p_id;
  IF FOUND THEN
    IF saved.packet IS DISTINCT FROM p_packet OR saved.fingerprint IS DISTINCT FROM p_fingerprint THEN
      RAISE EXCEPTION 'Registration ID was used for different content' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('registrationId',saved.id,'proposalId',saved.proposal_id,'planVersionId',saved.plan_version_id);
  END IF;
  IF p_id IS NULL OR jsonb_typeof(p_packet) IS DISTINCT FROM 'object'
    OR NOT (p_packet ?& ARRAY['schemaVersion','registrationId','userId','policyVersion','movementCatalogVersion','source','intent','inputSnapshot','sessions'])
    OR jsonb_typeof(p_packet->'source') IS DISTINCT FROM 'object'
    OR NOT (p_packet->'source' ?& ARRAY['contextHash','binding','validBefore'])
    OR jsonb_typeof(p_packet#>'{source,validBefore}') IS DISTINCT FROM 'string'
    OR NOT isfinite((p_packet#>>'{source,validBefore}')::timestamptz)
    OR jsonb_typeof(p_packet#>'{source,binding}') IS DISTINCT FROM 'object'
    OR NOT (p_packet#>'{source,binding}' ?& ARRAY['version','reviewedMovementCatalogVersion','userId','scope','revision','base','memories','memoryStates','setup'])
    OR public.coach_context_revision_value(p_packet#>'{source,binding,revision}') IS NULL
    OR jsonb_typeof(p_packet#>'{source,binding,scope}') IS DISTINCT FROM 'object'
    OR NOT (p_packet#>'{source,binding,scope}' ?& ARRAY['programId','basePlanVersionId','historyThrough','historyDays','tzOffset'])
    OR jsonb_typeof(p_packet#>'{source,binding,memoryStates}') IS DISTINCT FROM 'array'
    OR octet_length(p_packet::text)>16000000 OR p_packet->'schemaVersion' IS DISTINCT FROM '2'::jsonb
    OR p_packet->>'policyVersion' IS DISTINCT FROM 'initial-dose-0.2.0'
    OR p_packet->>'movementCatalogVersion' IS DISTINCT FROM 'reviewed-identities-0.1.0'
    OR p_packet#>>'{source,binding,version}' IS DISTINCT FROM 'reviewed-dose-context-3'
    OR p_packet#>>'{source,binding,reviewedMovementCatalogVersion}' IS DISTINCT FROM p_packet->>'movementCatalogVersion'
    OR p_packet#>>'{intent,format}' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1'
    OR p_packet#>'{intent,horizon_weeks}' IS DISTINCT FROM '1'::jsonb
    OR (p_packet#>>'{source,contextHash}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR p_packet#>>'{inputSnapshot,reviewedSourceHash}' IS DISTINCT FROM p_packet#>>'{source,contextHash}'
    OR p_packet#>'{source,binding,revision}' IS DISTINCT FROM p_packet#>'{inputSnapshot,contextRevision}'
    OR p_packet#>'{source,binding,setup}' IS DISTINCT FROM p_packet#>'{inputSnapshot,setupMemoryBindings}'
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_packet#>>'{inputSnapshot,reviewedExecutionStorage}' IS DISTINCT FROM 'reviewed_execution_slots_v1'
    OR jsonb_typeof(p_packet#>'{source,binding,executionSlots}') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_packet#>'{inputSnapshot,reviewedExecutionContinuity,slots}') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_packet->'sessions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_packet->'sessions') NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'Invalid reviewed registration packet' USING ERRCODE='22023';
  END IF;
  owner:=(p_packet->>'userId')::uuid;
  IF owner IS NULL OR p_packet#>>'{source,binding,userId}' IS DISTINCT FROM owner::text THEN
    RAISE EXCEPTION 'Invalid reviewed registration owner' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('week_number',1,'session_index',s.idx,
    'scheduled_date',s.value->>'scheduledDate','prescription',s.value->'prescription') ORDER BY s.idx)
    INTO manifest FROM jsonb_array_elements(p_packet#>'{intent,reviewed_week,scheduledSessions}') WITH ORDINALITY s(value,idx);
  IF manifest IS DISTINCT FROM p_packet->'sessions' THEN
    RAISE EXCEPTION 'Registration session manifest differs from full reviewed week' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('reviewed-registration:'||p_id::text,0));
  SELECT * INTO saved FROM public.coach_reviewed_proposal_registrations WHERE id=p_id;
  IF FOUND THEN
    IF saved.user_id IS DISTINCT FROM owner OR saved.packet IS DISTINCT FROM p_packet OR saved.fingerprint IS DISTINCT FROM p_fingerprint THEN
      RAISE EXCEPTION 'Registration ID was used for different content' USING ERRCODE='22023';
    END IF;
  ELSE
    INSERT INTO public.coach_reviewed_proposal_registrations(id,user_id,packet,fingerprint)
      VALUES(p_id,owner,p_packet,p_fingerprint) RETURNING * INTO saved;
  END IF;
  RETURN jsonb_build_object('registrationId',saved.id,'proposalId',saved.proposal_id,'planVersionId',saved.plan_version_id);
END $$;

CREATE OR REPLACE FUNCTION public.assert_reviewed_registration_current(p_id uuid,p_accepting boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE; packet jsonb; binding jsonb; base jsonb;
  program public.training_programs%ROWTYPE; plan public.training_plan_versions%ROWTYPE;
  current_program jsonb; current_plan jsonb; states jsonb; checked_at timestamptz;
  offset_minutes integer; source_day date; session_id uuid;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed registration unavailable' USING ERRCODE='55000'; END IF;
  packet:=r.packet; binding:=packet#>'{source,binding}'; base:=binding->'base';
  SELECT * INTO program FROM public.training_programs WHERE id=(binding#>>'{scope,programId}')::uuid AND user_id=r.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed program unavailable' USING ERRCODE='40001'; END IF;
  SELECT * INTO plan FROM public.training_plan_versions WHERE id=(binding#>>'{scope,basePlanVersionId}')::uuid
    AND user_id=r.user_id AND program_id=program.id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed base unavailable' USING ERRCODE='40001'; END IF;
  -- Existing accept mutates these states before its proposal-status trigger.
  IF program.status<>'active' OR program.program_mode<>'rolling_weekly'
    OR program.active_plan_version_id IS DISTINCT FROM (CASE WHEN p_accepting THEN r.plan_version_id ELSE plan.id END)
    OR plan.status IS DISTINCT FROM (CASE WHEN p_accepting THEN 'superseded' ELSE 'accepted' END) THEN
    RAISE EXCEPTION 'Reviewed active base changed' USING ERRCODE='40001';
  END IF;
  current_program:=jsonb_build_object('id',program.id,'user_id',program.user_id,'status','active',
    'program_mode',program.program_mode,'active_plan_version_id',plan.id);
  current_plan:=jsonb_build_object('id',plan.id,'user_id',plan.user_id,'program_id',plan.program_id,'status','accepted',
    'plan_mode',plan.plan_mode,'intent',plan.intent,'input_snapshot',plan.input_snapshot,
    'window_start',plan.window_start,'window_end',plan.window_end,'sequence_number',plan.sequence_number);
  IF current_program IS DISTINCT FROM base->'program' OR current_plan IS DISTINCT FROM base->'plan' THEN
    RAISE EXCEPTION 'Reviewed accepted source changed' USING ERRCODE='40001';
  END IF;
  PERFORM public.assert_reviewed_execution_continuity(packet);
  PERFORM public.assert_coach_context_revision(r.user_id,binding->'revision');
  checked_at:=clock_timestamp();
  offset_minutes:=(binding#>>'{scope,tzOffset}')::integer;
  source_day:=(binding#>>'{scope,historyThrough}')::date;
  IF offset_minutes NOT BETWEEN -840 AND 840 OR source_day IS DISTINCT FROM ((checked_at AT TIME ZONE 'UTC')-make_interval(mins=>offset_minutes))::date
    OR NOT isfinite((packet#>>'{source,validBefore}')::timestamptz)
    OR (packet#>>'{source,validBefore}')::timestamptz<=checked_at
    OR packet->>'policyVersion' IS DISTINCT FROM 'initial-dose-0.2.0'
    OR packet->>'movementCatalogVersion' IS DISTINCT FROM 'reviewed-identities-0.1.0' THEN
    RAISE EXCEPTION 'Reviewed source validity elapsed' USING ERRCODE='40001';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'state',CASE
    WHEN m.status<>'confirmed' THEN 'unconfirmed' WHEN m.effective_from>checked_at THEN 'future'
    WHEN m.effective_until<=checked_at THEN 'expired' WHEN m.review_after<=checked_at THEN 'review_due' ELSE 'current' END)
    ORDER BY m.id),'[]'::jsonb) INTO states FROM public.coach_memories m WHERE m.user_id=r.user_id;
  IF states IS DISTINCT FROM binding->'memoryStates' THEN RAISE EXCEPTION 'Reviewed memory lifecycle changed' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_coach_plan_intent_current(r.user_id,packet->'intent');
  PERFORM public.assert_coach_setup_memories_current(r.user_id,packet#>'{inputSnapshot,setupMemoryBindings}',packet->'intent');
END $$;

CREATE OR REPLACE FUNCTION public.guard_reviewed_proposal_disabled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE; plan public.training_plan_versions%ROWTYPE; sessions jsonb;
BEGIN
  SELECT * INTO plan FROM public.training_plan_versions WHERE id=NEW.proposed_plan_version_id AND user_id=NEW.user_id;
  IF plan.intent->>'format' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1'
    AND NOT EXISTS(SELECT 1 FROM public.prescribed_sessions s WHERE s.plan_version_id=NEW.proposed_plan_version_id
      AND s.user_id=NEW.user_id AND s.prescription->>'format'='reviewed_programming_v0_1') THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE proposal_id=NEW.id
    AND plan_version_id=NEW.proposed_plan_version_id AND user_id=NEW.user_id;
  IF NOT FOUND OR NEW.program_id::text IS DISTINCT FROM r.packet#>>'{source,binding,scope,programId}'
    OR NEW.base_plan_version_id::text IS DISTINCT FROM r.packet#>>'{source,binding,scope,basePlanVersionId}'
    OR NEW.weekly_review_id IS NOT NULL OR NEW.rationale IS DISTINCT FROM public.reviewed_registration_rationale(r.id)
    OR plan.intent IS DISTINCT FROM r.packet->'intent' OR plan.input_snapshot IS DISTINCT FROM r.packet->'inputSnapshot'
    OR plan.plan_mode IS DISTINCT FROM 'rolling_weekly' OR plan.policy_version IS DISTINCT FROM r.packet->>'policyVersion'
    OR plan.reference_version IS DISTINCT FROM r.packet->>'movementCatalogVersion'
    OR plan.window_start::text IS DISTINCT FROM r.packet#>>'{intent,reviewed_week,windowStart}'
    OR plan.window_end::text IS DISTINCT FROM r.packet#>>'{intent,reviewed_week,windowEnd}'
    OR to_jsonb(plan.sequence_number) IS DISTINCT FROM r.packet#>'{intent,reviewed_week,sequenceNumber}' THEN
    RAISE EXCEPTION 'Reviewed proposal requires exact private registration' USING ERRCODE='55000';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('week_number',s.week_number,'session_index',s.session_index,
    'scheduled_date',s.scheduled_date,'prescription',s.prescription) ORDER BY s.session_index),'[]'::jsonb)
    INTO sessions FROM public.coach_effective_prescribed_sessions s WHERE s.plan_version_id=plan.id AND s.user_id=NEW.user_id;
  IF sessions IS DISTINCT FROM r.packet->'sessions' THEN RAISE EXCEPTION 'Reviewed session manifest changed' USING ERRCODE='55000'; END IF;
  IF r.packet->'schemaVersion'='2'::jsonb THEN
    IF EXISTS(SELECT 1 FROM public.coach_reviewed_execution_slots l
      FULL JOIN jsonb_array_elements(r.packet#>'{inputSnapshot,reviewedExecutionContinuity,slots}') e
        ON l.session_index=(e->>'sessionIndex')::integer AND l.plan_version_id=plan.id
      WHERE (l.plan_version_id=plan.id OR l.plan_version_id IS NULL) AND
        (l.plan_version_id IS NULL OR e IS NULL
          OR (e->>'executionSessionId' IS NOT NULL AND (l.prescribed_session_id::text IS DISTINCT FROM e->>'executionSessionId'
            OR l.execution_plan_version_id::text IS DISTINCT FROM e->>'executionPlanVersionId'))
          OR (e->>'executionSessionId' IS NULL AND l.execution_plan_version_id IS DISTINCT FROM plan.id)))
      OR EXISTS(SELECT 1 FROM public.prescribed_sessions s WHERE s.plan_version_id=plan.id AND NOT EXISTS(
        SELECT 1 FROM public.coach_reviewed_execution_slots l WHERE l.plan_version_id=plan.id AND l.prescribed_session_id=s.id)) THEN
      RAISE EXCEPTION 'Registered execution identities changed' USING ERRCODE='55000'; END IF;
  END IF;
  IF TG_OP='INSERT' THEN
    PERFORM public.assert_reviewed_registration_current(r.id,false);
  ELSIF NEW.status='accepted' AND OLD.status<>'accepted' THEN
    PERFORM public.assert_reviewed_registration_current(r.id,true);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.create_registered_reviewed_week_proposal(p_registration_id uuid,p_idempotency_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); r public.coach_reviewed_proposal_registrations%ROWTYPE;
  existing public.adaptation_proposals%ROWTYPE; next_version integer; base public.training_plan_versions%ROWTYPE;
  v_program_id uuid; base_id uuid; plan jsonb; slot jsonb; link jsonb; root_id uuid; root_plan uuid;
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid proposal request key' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_registration_id AND user_id=owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owned reviewed registration unavailable' USING ERRCODE='P0002'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':rolling-week-proposal:'||btrim(p_idempotency_key),0));
  SELECT * INTO existing FROM public.adaptation_proposals WHERE user_id=owner AND idempotency_key=btrim(p_idempotency_key) FOR UPDATE;
  IF FOUND THEN
    IF existing.id<>r.proposal_id OR existing.proposed_plan_version_id<>r.plan_version_id THEN
      RAISE EXCEPTION 'Proposal request key was used for different registration' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('proposalId',existing.id,'programId',existing.program_id,'planVersionId',existing.proposed_plan_version_id,'replayed',true);
  END IF;
  -- Lock program before source revision. Serializes competing registration issuances.
  v_program_id:=(r.packet#>>'{source,binding,scope,programId}')::uuid;
  base_id:=(r.packet#>>'{source,binding,scope,basePlanVersionId}')::uuid;
  PERFORM 1 FROM public.training_programs WHERE id=v_program_id AND user_id=owner FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.adaptation_proposals WHERE id=r.proposal_id) THEN
    RAISE EXCEPTION 'Registration was issued with another request key' USING ERRCODE='22023'; END IF;
  SELECT * INTO base FROM public.training_plan_versions WHERE id=base_id AND user_id=owner;
  plan:=r.packet#>'{intent,reviewed_week}';
  -- The current reviewed compiler supports this exact same-week registration.
  -- New-week date rebinding and execution carry-forward remain separate integration.
  IF plan->>'windowStart' IS DISTINCT FROM base.window_start::text OR plan->>'windowEnd' IS DISTINCT FROM base.window_end::text
    OR plan->'sequenceNumber' IS DISTINCT FROM to_jsonb(base.sequence_number) THEN
    RAISE EXCEPTION 'Reviewed target window requires explicit reconciliation' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_reviewed_registration_current(r.id,false);
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public.training_plan_versions WHERE training_plan_versions.program_id=v_program_id;
  INSERT INTO public.training_plan_versions(id,program_id,user_id,version,reference_version,policy_version,intent,input_snapshot,
    plan_mode,window_start,window_end,sequence_number)
    VALUES(r.plan_version_id,v_program_id,owner,next_version,r.packet->>'movementCatalogVersion',r.packet->>'policyVersion',
      r.packet->'intent',r.packet->'inputSnapshot','rolling_weekly',(plan->>'windowStart')::date,(plan->>'windowEnd')::date,(plan->>'sequenceNumber')::integer);
  FOR slot IN SELECT value FROM jsonb_array_elements(r.packet->'sessions') LOOP
    link:=r.packet#>'{inputSnapshot,reviewedExecutionContinuity,slots}'->((slot->>'session_index')::integer-1);
    root_id:=(link->>'executionSessionId')::uuid; root_plan:=(link->>'executionPlanVersionId')::uuid;
    IF root_id IS NULL THEN
      INSERT INTO public.prescribed_sessions(plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
        VALUES(r.plan_version_id,v_program_id,owner,1,(slot->>'session_index')::integer,
          (slot->>'scheduled_date')::date,slot->'prescription') RETURNING id INTO root_id;
      root_plan:=r.plan_version_id;
    END IF;
    INSERT INTO public.coach_reviewed_execution_slots(plan_version_id,program_id,user_id,session_index,prescribed_session_id,execution_plan_version_id)
      VALUES(r.plan_version_id,v_program_id,owner,(slot->>'session_index')::integer,root_id,root_plan);
  END LOOP;
  INSERT INTO public.adaptation_proposals(id,user_id,program_id,base_plan_version_id,proposed_plan_version_id,idempotency_key,rationale)
    VALUES(r.proposal_id,owner,v_program_id,base_id,r.plan_version_id,btrim(p_idempotency_key),public.reviewed_registration_rationale(r.id));
  RETURN jsonb_build_object('proposalId',r.proposal_id,'programId',v_program_id,'planVersionId',r.plan_version_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.record_reviewed_session_set(p_session_id uuid,p_request_id text,p_report jsonb)
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
  IF program_status IS DISTINCT FROM 'active' OR program_mode IS DISTINCT FROM 'rolling_weekly' THEN
    RAISE EXCEPTION 'Active plan changed' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_reviewed_execution_active(session.id,owner,active);
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

CREATE OR REPLACE FUNCTION public.complete_reviewed_session(p_session_id uuid,p_request_id text,p_request jsonb) RETURNS jsonb
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
  PERFORM public.assert_reviewed_execution_active(session.id,owner,active);
  IF program_status IS DISTINCT FROM 'active' OR program_mode IS DISTINCT FROM 'rolling_weekly' THEN
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

COMMIT;