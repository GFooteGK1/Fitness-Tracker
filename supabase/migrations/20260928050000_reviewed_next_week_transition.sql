-- Explicit reviewed adjacent-week advancement; calendar changes confer no dose authority.
BEGIN;

CREATE FUNCTION public.assert_reviewed_week_transition(p_packet jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb:=p_packet#>'{source,binding,base,plan}'; target jsonb:=p_packet#>'{intent,reviewed_week}';
  transition jsonb:=p_packet#>'{inputSnapshot,reviewedWeekTransition}'; kind text;
  source_window jsonb; target_window jsonb; profile jsonb; expected_start date; expected_sequence integer;
BEGIN
  kind:=coalesce(transition->>'kind','same_week');
  profile:=coalesce(base#>'{intent,reviewed_week,profileSnapshot}',base#>'{intent,weekly_plan,profileSnapshot}');
  source_window:=jsonb_build_object('windowStart',base->'window_start','windowEnd',base->'window_end','sequenceNumber',base->'sequence_number');
  expected_start:=(base->>'window_start')::date;
  expected_sequence:=(base->>'sequence_number')::integer;
  IF kind='next_week' THEN expected_start:=expected_start+7; expected_sequence:=expected_sequence+1;
  ELSIF kind<>'same_week' THEN RAISE EXCEPTION 'Unsupported reviewed week operation' USING ERRCODE='22023'; END IF;
  target_window:=jsonb_build_object('windowStart',expected_start,'windowEnd',expected_start+6,'sequenceNumber',expected_sequence);
  IF base->>'id' IS DISTINCT FROM p_packet#>>'{source,binding,scope,basePlanVersionId}'
    OR jsonb_typeof(profile) IS DISTINCT FROM 'object' OR profile->>'startDate' IS DISTINCT FROM base->>'window_start'
    OR (base->>'window_end')::date IS DISTINCT FROM (base->>'window_start')::date+6
    OR target->>'windowStart' IS DISTINCT FROM expected_start::text
    OR target->>'windowEnd' IS DISTINCT FROM (expected_start+6)::text
    OR target->'sequenceNumber' IS DISTINCT FROM to_jsonb(expected_sequence)
    OR target->'profileSnapshot' IS DISTINCT FROM jsonb_set(profile,'{startDate}',to_jsonb(expected_start::text)) THEN
    RAISE EXCEPTION 'Reviewed window or dated profile differs from its accepted base' USING ERRCODE='55000'; END IF;
  -- Existing same-week registrations may lack this additive transition field.
  IF transition IS NOT NULL AND (transition->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR transition->>'basePlanVersionId' IS DISTINCT FROM base->>'id'
    OR transition->'sourceWindow' IS DISTINCT FROM source_window OR transition->'targetWindow' IS DISTINCT FROM target_window) THEN
    RAISE EXCEPTION 'Reviewed week transition binding is inconsistent' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_reviewed_week_transition(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.assert_reviewed_execution_continuity(p_packet jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=(p_packet->>'userId')::uuid; program uuid:=(p_packet#>>'{source,binding,scope,programId}')::uuid;
  base uuid:=(p_packet#>>'{source,binding,scope,basePlanVersionId}')::uuid;
  source jsonb; expected jsonb; actual jsonb; links jsonb; prior_execution jsonb; session_id uuid; advancing boolean;
BEGIN
  PERFORM public.assert_reviewed_week_transition(p_packet);
  advancing:=p_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}'='next_week';
  advancing:=coalesce(advancing,false);
  IF p_packet->'schemaVersion' IS DISTINCT FROM '2'::jsonb
    OR p_packet#>>'{source,binding,version}' IS DISTINCT FROM 'reviewed-dose-context-3'
    OR p_packet#>>'{inputSnapshot,reviewedExecutionStorage}' IS DISTINCT FROM 'reviewed_execution_slots_v1'
    OR p_packet#>>'{inputSnapshot,reviewedExecutionContinuity,storageContract}' IS DISTINCT FROM 'reviewed_execution_slots_v1'
    OR p_packet#>'{inputSnapshot,reviewedExecutionContinuity,schemaVersion}' IS DISTINCT FROM to_jsonb(CASE WHEN advancing THEN 2 ELSE 1 END)
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
  IF advancing THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(source) s WHERE s->>'status'='planned' AND (s->>'hasReports')::boolean) THEN
      RAISE EXCEPTION 'Resolve begun execution before advancing the week' USING ERRCODE='55000'; END IF;
    SELECT jsonb_agg(jsonb_build_object('executionSessionId',s->'executionSessionId',
      'disposition',CASE WHEN s->>'status'='planned' THEN 'unreported' ELSE s->>'status' END) ORDER BY (s->>'sessionIndex')::integer)
      INTO prior_execution FROM jsonb_array_elements(source) s;
    SELECT jsonb_agg(jsonb_build_object('sessionIndex',i,'executionSessionId',NULL,'executionPlanVersionId',NULL) ORDER BY i)
      INTO links FROM jsonb_array_elements(p_packet->'sessions') WITH ORDINALITY t(value,i);
    IF prior_execution IS DISTINCT FROM p_packet#>'{inputSnapshot,reviewedExecutionContinuity,priorExecution}'
      OR links IS DISTINCT FROM p_packet#>'{inputSnapshot,reviewedExecutionContinuity,slots}' THEN
      RAISE EXCEPTION 'Previous execution history or next-week roots changed' USING ERRCODE='55000'; END IF;
    RETURN;
  END IF;
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
  PERFORM public.assert_reviewed_week_transition(r.packet);
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
-- CREATE OR REPLACE resets function-local settings. Restore bounded waits for
-- the prior execution migration's copied entrypoints as well as this issuance RPC.
ALTER FUNCTION public.register_reviewed_week_proposal(uuid,jsonb,text) SET lock_timeout='1s';
ALTER FUNCTION public.create_registered_reviewed_week_proposal(uuid,text) SET lock_timeout='1s';
ALTER FUNCTION public.record_reviewed_session_set(uuid,text,jsonb) SET lock_timeout='1s';
ALTER FUNCTION public.complete_reviewed_session(uuid,text,jsonb) SET lock_timeout='1s';
COMMIT;
