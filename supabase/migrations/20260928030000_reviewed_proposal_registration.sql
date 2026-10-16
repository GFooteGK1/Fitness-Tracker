-- Local reviewed proposal issuance. No default registry, route or numerical activation.
BEGIN;

CREATE TABLE public.coach_reviewed_proposal_registrations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  packet jsonb NOT NULL CHECK (jsonb_typeof(packet)='object' AND octet_length(packet::text)<=16000000),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  proposal_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  plan_version_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.coach_reviewed_proposal_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_reviewed_proposal_registrations FORCE ROW LEVEL SECURITY;
-- All access goes through bounded definer functions. Service role gets no table writes.
REVOKE ALL ON public.coach_reviewed_proposal_registrations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.protect_reviewed_proposal_registration() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Reviewed registrations are immutable' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.protect_reviewed_proposal_registration() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_reviewed_proposal_registration BEFORE UPDATE ON public.coach_reviewed_proposal_registrations
  FOR EACH ROW EXECUTE FUNCTION public.protect_reviewed_proposal_registration();

CREATE OR REPLACE FUNCTION public.register_reviewed_week_proposal(p_id uuid,p_packet jsonb,p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.coach_reviewed_proposal_registrations%ROWTYPE; owner uuid; manifest jsonb;
BEGIN
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
    OR octet_length(p_packet::text)>16000000 OR p_packet->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR p_packet->>'policyVersion' IS DISTINCT FROM 'initial-dose-0.2.0'
    OR p_packet->>'movementCatalogVersion' IS DISTINCT FROM 'reviewed-identities-0.1.0'
    OR p_packet#>>'{source,binding,version}' IS DISTINCT FROM 'reviewed-dose-context-2'
    OR p_packet#>>'{source,binding,reviewedMovementCatalogVersion}' IS DISTINCT FROM p_packet->>'movementCatalogVersion'
    OR p_packet#>>'{intent,format}' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1'
    OR p_packet#>'{intent,horizon_weeks}' IS DISTINCT FROM '1'::jsonb
    OR (p_packet#>>'{source,contextHash}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR p_packet#>>'{inputSnapshot,reviewedSourceHash}' IS DISTINCT FROM p_packet#>>'{source,contextHash}'
    OR p_packet#>'{source,binding,revision}' IS DISTINCT FROM p_packet#>'{inputSnapshot,contextRevision}'
    OR p_packet#>'{source,binding,setup}' IS DISTINCT FROM p_packet#>'{inputSnapshot,setupMemoryBindings}'
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$'
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
REVOKE ALL ON FUNCTION public.register_reviewed_week_proposal(uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_reviewed_week_proposal(uuid,jsonb,text) TO service_role;
ALTER FUNCTION public.register_reviewed_week_proposal(uuid,jsonb,text) SET lock_timeout='1s';

CREATE FUNCTION public.assert_reviewed_registration_current(p_id uuid,p_accepting boolean DEFAULT false) RETURNS void
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
  -- Session writers lock session before program. NOWAIT prevents reversed waiting.
  FOR session_id IN SELECT s.id FROM public.prescribed_sessions s WHERE s.plan_version_id=plan.id AND s.user_id=r.user_id
    ORDER BY s.id FOR UPDATE NOWAIT LOOP NULL; END LOOP;
  -- Until execution carry-forward is integrated, never duplicate or abandon begun work.
  IF EXISTS (SELECT 1 FROM public.prescribed_sessions s WHERE s.plan_version_id=plan.id AND s.user_id=r.user_id
      AND (s.status<>'planned' OR s.completed_workout_id IS NOT NULL))
    OR EXISTS (SELECT 1 FROM public.coach_reviewed_set_reports s WHERE s.plan_version_id=plan.id AND s.user_id=r.user_id)
    OR EXISTS (SELECT 1 FROM public.coach_session_signals c JOIN public.prescribed_sessions s ON s.id=c.prescribed_session_id AND s.user_id=c.user_id
      WHERE s.plan_version_id=plan.id AND s.user_id=r.user_id)
    OR EXISTS (SELECT 1 FROM public.coach_checkins c JOIN public.prescribed_sessions s ON s.id=c.prescribed_session_id AND s.user_id=c.user_id
      WHERE s.plan_version_id=plan.id AND s.user_id=r.user_id) THEN
    RAISE EXCEPTION 'Reviewed replacement requires execution carry-forward' USING ERRCODE='55000';
  END IF;
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
REVOKE ALL ON FUNCTION public.assert_reviewed_registration_current(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reviewed_registration_rationale(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('reviewedRegistrationId',r.id,'input_fingerprint',r.fingerprint,'proposal_mode','reviewed_rolling_week',
    'program_metadata',jsonb_build_object('title',r.packet#>>'{intent,reviewed_week,title}',
      'goal_summary',r.packet#>>'{intent,reviewed_week,profileSnapshot,athleteGoalSummary}',
      'goal_target_date',r.packet#>'{intent,reviewed_week,directionSnapshot,goalTargetDate}',
      'direction',r.packet#>'{intent,reviewed_week,directionSnapshot}'))
  FROM public.coach_reviewed_proposal_registrations r WHERE r.id=p_id
$$;
REVOKE ALL ON FUNCTION public.reviewed_registration_rationale(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Existing legacy RPCs cannot manufacture these reserved IDs or change the envelope.
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
    INTO sessions FROM public.prescribed_sessions s WHERE s.plan_version_id=plan.id AND s.user_id=NEW.user_id;
  IF sessions IS DISTINCT FROM r.packet->'sessions' THEN RAISE EXCEPTION 'Reviewed session manifest changed' USING ERRCODE='55000'; END IF;
  IF TG_OP='INSERT' THEN
    PERFORM public.assert_reviewed_registration_current(r.id,false);
  ELSIF NEW.status='accepted' AND OLD.status<>'accepted' THEN
    PERFORM public.assert_reviewed_registration_current(r.id,true);
  END IF;
  RETURN NEW;
END $$;

-- An accepted plan and its proposed same-window revision must coexist unchanged.
DROP INDEX public.idx_training_plan_versions_open_rolling_window;
CREATE UNIQUE INDEX idx_training_plan_versions_accepted_rolling_window ON public.training_plan_versions(program_id,window_start)
  WHERE plan_mode='rolling_weekly' AND status='accepted';
CREATE UNIQUE INDEX idx_training_plan_versions_proposed_rolling_window ON public.training_plan_versions(program_id,window_start)
  WHERE plan_mode='rolling_weekly' AND status='proposed';

CREATE FUNCTION public.create_registered_reviewed_week_proposal(p_registration_id uuid,p_idempotency_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); r public.coach_reviewed_proposal_registrations%ROWTYPE;
  existing public.adaptation_proposals%ROWTYPE; next_version integer; base public.training_plan_versions%ROWTYPE;
  v_program_id uuid; base_id uuid; plan jsonb;
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
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public.training_plan_versions WHERE training_plan_versions.program_id=v_program_id;
  INSERT INTO public.training_plan_versions(id,program_id,user_id,version,reference_version,policy_version,intent,input_snapshot,
    plan_mode,window_start,window_end,sequence_number)
    VALUES(r.plan_version_id,v_program_id,owner,next_version,r.packet->>'movementCatalogVersion',r.packet->>'policyVersion',
      r.packet->'intent',r.packet->'inputSnapshot','rolling_weekly',(plan->>'windowStart')::date,(plan->>'windowEnd')::date,(plan->>'sequenceNumber')::integer);
  INSERT INTO public.prescribed_sessions(plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
    SELECT r.plan_version_id,v_program_id,owner,(s->>'week_number')::integer,(s->>'session_index')::integer,
      (s->>'scheduled_date')::date,s->'prescription' FROM jsonb_array_elements(r.packet->'sessions') s;
  INSERT INTO public.adaptation_proposals(id,user_id,program_id,base_plan_version_id,proposed_plan_version_id,idempotency_key,rationale)
    VALUES(r.proposal_id,owner,v_program_id,base_id,r.plan_version_id,btrim(p_idempotency_key),public.reviewed_registration_rationale(r.id));
  RETURN jsonb_build_object('proposalId',r.proposal_id,'programId',v_program_id,'planVersionId',r.plan_version_id,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.create_registered_reviewed_week_proposal(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_registered_reviewed_week_proposal(uuid,text) TO authenticated;
ALTER FUNCTION public.create_registered_reviewed_week_proposal(uuid,text) SET lock_timeout='1s';

COMMIT;
