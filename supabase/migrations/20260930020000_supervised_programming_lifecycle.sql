-- ADR0035: database authority for permanently supervised programs.
-- No enrollment, initial-base anchor, registration or activation is created by installation.
BEGIN;

CREATE TABLE public.coach_supervised_initial_bases (
  program_id uuid PRIMARY KEY REFERENCES public.coach_supervised_programs(program_id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_version_id uuid NOT NULL REFERENCES public.training_plan_versions(id),
  plan_snapshot jsonb NOT NULL,
  execution_manifest jsonb NOT NULL,
  operator_ref text NOT NULL CHECK(length(btrim(operator_ref)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.coach_supervised_initial_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_supervised_initial_bases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_supervised_initial_bases FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_supervised_authority BEFORE UPDATE OR DELETE ON public.coach_supervised_initial_bases
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();

CREATE FUNCTION public.lock_supervised_program(p_program uuid,p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=p_program) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=p_program AND user_id=p_owner) THEN
    RAISE EXCEPTION 'Supervised program owner changed' USING ERRCODE='55000'; END IF;
  -- Row triggers can already own a row. Never wait for the program advisory lock
  -- while holding one; a conflict rolls back the caller for explicit reconciliation.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('supervised-program:'||p_program::text,0)) THEN
    RAISE EXCEPTION 'Supervised program is busy' USING ERRCODE='55P03'; END IF;
  PERFORM 1 FROM public.training_programs WHERE id=p_program AND user_id=p_owner FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owned supervised program unavailable' USING ERRCODE='55000'; END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.assert_supervised_writes_open() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE paused boolean;
BEGIN
  SELECT c.paused INTO paused FROM public.coaching_write_control c WHERE singleton FOR SHARE NOWAIT;
  IF NOT FOUND OR paused THEN RAISE EXCEPTION 'Coaching writes are temporarily paused; retry after maintenance' USING ERRCODE='PT503'; END IF;
END $$;

CREATE FUNCTION public.supervised_static_execution(p_owner uuid,p_program uuid,p_plan uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('sessionIndex',s.session_index,'scheduledDate',s.scheduled_date,
    'prescription',s.prescription,'executionSessionId',s.id,'executionPlanVersionId',s.execution_plan_version_id) ORDER BY s.session_index),'[]'::jsonb)
  FROM public.coach_effective_prescribed_sessions s WHERE s.user_id=p_owner AND s.program_id=p_program AND s.plan_version_id=p_plan
$$;

CREATE FUNCTION public.provision_supervised_initial_base(p_program_id uuid,p_plan_version_id uuid,p_operator_ref text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lineage public.coach_supervised_programs%ROWTYPE; plan public.training_plan_versions%ROWTYPE;
  saved public.coach_supervised_initial_bases%ROWTYPE; manifest jsonb; expected jsonb;
BEGIN
  SELECT * INTO lineage FROM public.coach_supervised_programs WHERE program_id=p_program_id;
  IF NOT FOUND OR p_plan_version_id IS NULL OR p_operator_ref IS NULL OR length(btrim(p_operator_ref)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Explicit supervised base provisioning required' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_supervised_program(p_program_id,lineage.user_id);
  SELECT * INTO saved FROM public.coach_supervised_initial_bases WHERE program_id=p_program_id;
  IF FOUND THEN
    IF saved.plan_version_id<>p_plan_version_id OR saved.operator_ref<>p_operator_ref THEN
      RAISE EXCEPTION 'Initial base identity cannot be replaced' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('programId',saved.program_id,'planVersionId',saved.plan_version_id,'replayed',true);
  END IF;
  PERFORM public.assert_supervised_writes_open();
  SELECT v.* INTO plan FROM public.training_plan_versions v JOIN public.training_programs p ON p.active_plan_version_id=v.id
    AND p.id=v.program_id AND p.user_id=v.user_id WHERE p.id=p_program_id AND p.user_id=lineage.user_id AND p.status='active'
    AND p.program_mode='rolling_weekly' AND v.id=p_plan_version_id AND v.status='accepted' AND v.plan_mode='rolling_weekly'
    AND v.intent->>'format'='reviewed_weekly_intent_v0_1' FOR UPDATE OF v NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initial base must be an existing owned accepted reviewed plan' USING ERRCODE='55000'; END IF;
  manifest:=public.supervised_static_execution(lineage.user_id,p_program_id,plan.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('prescription',s->'prescription','scheduledDate',s->'scheduledDate') ORDER BY i),'[]'::jsonb)
    INTO expected FROM jsonb_array_elements(plan.intent#>'{reviewed_week,scheduledSessions}') WITH ORDINALITY x(s,i);
  IF jsonb_array_length(manifest) NOT BETWEEN 1 AND 7 OR expected IS DISTINCT FROM
    (SELECT jsonb_agg(jsonb_build_object('prescription',s->'prescription','scheduledDate',s->'scheduledDate') ORDER BY i)
      FROM jsonb_array_elements(manifest) WITH ORDINALITY x(s,i)) THEN
    RAISE EXCEPTION 'Initial base execution manifest differs from its accepted week' USING ERRCODE='55000'; END IF;
  INSERT INTO public.coach_supervised_initial_bases(program_id,user_id,plan_version_id,plan_snapshot,execution_manifest,operator_ref)
    VALUES(p_program_id,lineage.user_id,plan.id,to_jsonb(plan)-'status',manifest,p_operator_ref);
  RETURN jsonb_build_object('programId',p_program_id,'planVersionId',plan.id,'replayed',false);
END $$;

CREATE FUNCTION public.assert_supervised_current_execution_enrollment(p_program uuid,p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.coach_supervised_enrollments%ROWTYPE;
BEGIN
  PERFORM public.lock_supervised_program(p_program,p_owner);
  SELECT * INTO e FROM public.coach_supervised_enrollments WHERE program_id=p_program ORDER BY version DESC LIMIT 1;
  IF NOT FOUND OR e.user_id<>p_owner OR NOT e.enabled OR e.expires_at<=clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_initial_bases WHERE program_id=p_program AND user_id=p_owner) THEN
    RAISE EXCEPTION 'Supervised execution enrollment unavailable' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_supervised_writes_open();
END $$;

CREATE FUNCTION public.assert_supervised_registration_link(p_id uuid,p_current boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE; c public.coach_supervised_candidates%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed registration unavailable' USING ERRCODE='55000'; END IF;
  IF NOT public.lock_supervised_program((r.packet#>>'{source,binding,scope,programId}')::uuid,r.user_id) THEN RETURN; END IF;
  SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=r.id AND user_id=r.user_id;
  IF NOT FOUND OR c.private_packet IS DISTINCT FROM r.packet OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_initial_bases b
      WHERE b.program_id=c.program_id AND b.user_id=c.user_id)
    OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_decisions d WHERE d.candidate_id=c.id AND d.decision='approve'
      AND d.enrollment_id=c.enrollment_id AND d.content_hash=c.content_hash AND d.source_hash=c.source_hash) THEN
    RAISE EXCEPTION 'Exact supervised approval required' USING ERRCODE='55000'; END IF;
  IF p_current THEN
    PERFORM public.assert_supervised_enrollment_current(c.enrollment_id,c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}');
    PERFORM public.assert_supervised_writes_open();
  END IF;
END $$;

CREATE FUNCTION public.assert_supervised_plan_content(p_plan jsonb,p_registration uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_registration;
  IF NOT FOUND OR p_plan->>'id' IS DISTINCT FROM r.plan_version_id::text OR p_plan->>'user_id' IS DISTINCT FROM r.user_id::text
    OR p_plan->>'program_id' IS DISTINCT FROM r.packet#>>'{source,binding,scope,programId}'
    OR p_plan->'intent' IS DISTINCT FROM r.packet->'intent' OR p_plan->'input_snapshot' IS DISTINCT FROM r.packet->'inputSnapshot'
    OR p_plan->>'plan_mode' IS DISTINCT FROM 'rolling_weekly' OR p_plan->>'policy_version' IS DISTINCT FROM r.packet->>'policyVersion'
    OR p_plan->>'reference_version' IS DISTINCT FROM r.packet->>'movementCatalogVersion'
    OR p_plan->>'window_start' IS DISTINCT FROM r.packet#>>'{intent,reviewed_week,windowStart}'
    OR p_plan->>'window_end' IS DISTINCT FROM r.packet#>>'{intent,reviewed_week,windowEnd}'
    OR p_plan->'sequence_number' IS DISTINCT FROM r.packet#>'{intent,reviewed_week,sequenceNumber}' THEN
    RAISE EXCEPTION 'Supervised plan differs from immutable approval' USING ERRCODE='55000'; END IF;
END $$;

CREATE FUNCTION public.assert_supervised_accepted_content(p_program uuid,p_owner uuid,p_plan uuid,p_current boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan public.training_plan_versions%ROWTYPE; anchor public.coach_supervised_initial_bases%ROWTYPE;
  r public.coach_reviewed_proposal_registrations%ROWTYPE; actual jsonb;
BEGIN
  IF NOT public.lock_supervised_program(p_program,p_owner) THEN RETURN; END IF;
  IF p_current THEN PERFORM public.assert_supervised_current_execution_enrollment(p_program,p_owner); END IF;
  SELECT * INTO plan FROM public.training_plan_versions WHERE id=p_plan AND program_id=p_program AND user_id=p_owner;
  IF NOT FOUND OR plan.status NOT IN ('accepted','superseded') THEN RAISE EXCEPTION 'Accepted supervised content unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO anchor FROM public.coach_supervised_initial_bases WHERE program_id=p_program AND plan_version_id=p_plan;
  IF FOUND THEN
    IF anchor.plan_snapshot IS DISTINCT FROM to_jsonb(plan)-'status' OR anchor.execution_manifest IS DISTINCT FROM public.supervised_static_execution(p_owner,p_program,p_plan) THEN
      RAISE EXCEPTION 'Initial supervised base changed' USING ERRCODE='55000'; END IF;
    RETURN;
  END IF;
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE plan_version_id=p_plan AND user_id=p_owner;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.adaptation_proposals a WHERE a.id=r.proposal_id AND a.user_id=p_owner
    AND a.program_id=p_program AND a.proposed_plan_version_id=p_plan AND a.status='accepted') THEN
    RAISE EXCEPTION 'Supervised plan has no committed acceptance' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_supervised_registration_link(r.id,false);
  PERFORM public.assert_supervised_plan_content(to_jsonb(plan),r.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('week_number',s.week_number,'session_index',s.session_index,'scheduled_date',s.scheduled_date,
    'prescription',s.prescription) ORDER BY s.session_index),'[]'::jsonb) INTO actual
    FROM public.coach_effective_prescribed_sessions s WHERE s.plan_version_id=p_plan AND s.user_id=p_owner;
  IF actual IS DISTINCT FROM r.packet->'sessions' THEN RAISE EXCEPTION 'Accepted supervised manifest changed' USING ERRCODE='55000'; END IF;
END $$;

CREATE FUNCTION public.guard_supervised_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.coach_supervised_candidates%ROWTYPE; program uuid:=(NEW.packet#>>'{source,binding,scope,programId}')::uuid;
BEGIN
  IF NOT public.lock_supervised_program(program,NEW.user_id) THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=NEW.id AND user_id=NEW.user_id AND program_id=program;
  IF NOT FOUND OR c.private_packet IS DISTINCT FROM NEW.packet OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_initial_bases WHERE program_id=program)
    OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_decisions d WHERE d.candidate_id=c.id AND d.decision='approve'
      AND d.enrollment_id=c.enrollment_id AND d.content_hash=c.content_hash AND d.source_hash=c.source_hash) THEN
    RAISE EXCEPTION 'Registration requires exact supervised approval' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_supervised_enrollment_current(c.enrollment_id,c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}');
  PERFORM public.assert_supervised_writes_open();
  PERFORM public.assert_supervised_source_current(NEW.packet);
  RETURN NEW;
END $$;
CREATE TRIGGER guard_supervised_registration BEFORE INSERT ON public.coach_reviewed_proposal_registrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_registration();

-- The existing source assertion knows the pre/post-acceptance state difference.
ALTER FUNCTION public.assert_reviewed_registration_current(uuid,boolean) RENAME TO assert_reviewed_registration_current_before_supervision;
CREATE FUNCTION public.assert_reviewed_registration_current(p_id uuid,p_accepting boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_supervised_registration_link(p_id,true);
  PERFORM public.assert_reviewed_registration_current_before_supervision(p_id,p_accepting);
END $$;

ALTER FUNCTION public.assert_reviewed_execution_active(uuid,uuid,uuid) RENAME TO assert_reviewed_execution_active_before_supervision;
CREATE FUNCTION public.assert_reviewed_execution_active(p_session uuid,p_owner uuid,p_active uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE program uuid;
BEGIN
  SELECT program_id INTO program FROM public.prescribed_sessions WHERE id=p_session AND user_id=p_owner;
  PERFORM public.assert_supervised_accepted_content(program,p_owner,p_active,true);
  PERFORM public.assert_reviewed_execution_active_before_supervision(p_session,p_owner,p_active);
END $$;

CREATE FUNCTION public.guard_supervised_plan_rows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  old_data jsonb; program uuid; owner uuid; r public.coach_reviewed_proposal_registrations%ROWTYPE; anchor public.coach_supervised_initial_bases%ROWTYPE;
BEGIN
  program:=(row_data->>'program_id')::uuid; owner:=(row_data->>'user_id')::uuid;
  IF TG_OP<>'INSERT' THEN
    old_data:=to_jsonb(OLD);
    IF EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=(old_data->>'program_id')::uuid)
      AND (row_data->'program_id',row_data->'user_id') IS DISTINCT FROM (old_data->'program_id',old_data->'user_id') THEN
      RAISE EXCEPTION 'Supervised lineage cannot be moved' USING ERRCODE='55000'; END IF;
  END IF;
  IF NOT public.lock_supervised_program(program,owner) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supervised plan history is retained' USING ERRCODE='55000'; END IF;
  IF TG_TABLE_NAME='training_plan_versions' THEN
    SELECT * INTO anchor FROM public.coach_supervised_initial_bases WHERE program_id=program AND plan_version_id=NEW.id;
    IF FOUND THEN
      IF TG_OP='INSERT' OR anchor.plan_snapshot IS DISTINCT FROM to_jsonb(NEW)-'status' OR NEW.status NOT IN ('accepted','superseded') THEN
        RAISE EXCEPTION 'Initial accepted base is immutable' USING ERRCODE='55000'; END IF;
      IF OLD.status='superseded' AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Initial base cannot be reactivated' USING ERRCODE='55000'; END IF;
      RETURN NEW;
    END IF;
    SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE plan_version_id=NEW.id AND user_id=owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supervised plan requires approved registration' USING ERRCODE='55000'; END IF;
    PERFORM public.assert_supervised_registration_link(r.id,TG_OP='INSERT' OR NEW.status='accepted');
    PERFORM public.assert_supervised_plan_content(to_jsonb(NEW),r.id);
    IF TG_OP='INSERT' AND (NEW.status<>'proposed' OR NEW.accepted_at IS NOT NULL) THEN RAISE EXCEPTION 'Supervised plan must enter as a proposal' USING ERRCODE='55000'; END IF;
    IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'status'-'accepted_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'accepted_at')
      OR (NOT(OLD.status='proposed' AND NEW.status='accepted') AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at)
      OR (OLD.status IN ('superseded','rejected') AND NEW.status<>OLD.status)
      OR (OLD.status='accepted' AND NEW.status NOT IN ('accepted','superseded'))) THEN
      RAISE EXCEPTION 'Supervised plan identity and terminal history are immutable' USING ERRCODE='55000'; END IF;
  ELSE
    SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE proposal_id=NEW.id AND plan_version_id=NEW.proposed_plan_version_id AND user_id=owner;
    IF NOT FOUND OR NEW.base_plan_version_id::text IS DISTINCT FROM r.packet#>>'{source,binding,scope,basePlanVersionId}'
      OR NEW.rationale IS DISTINCT FROM public.reviewed_registration_rationale(r.id) OR NEW.weekly_review_id IS NOT NULL THEN
      RAISE EXCEPTION 'Supervised proposal requires exact approved registration' USING ERRCODE='55000'; END IF;
    PERFORM public.assert_supervised_registration_link(r.id,TG_OP='INSERT' OR NEW.status='accepted');
    IF TG_OP='INSERT' AND NEW.status<>'proposed' THEN RAISE EXCEPTION 'Supervised proposal must enter undecided' USING ERRCODE='55000'; END IF;
    IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'status'-'decided_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'decided_at')
      OR (OLD.status<>'proposed' AND NOT(OLD.status='expired' AND NEW.status='rejected') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))) THEN
      RAISE EXCEPTION 'Supervised proposal identity and committed decision are immutable' USING ERRCODE='55000'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_supervised_plan BEFORE INSERT OR UPDATE OR DELETE ON public.training_plan_versions FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_plan_rows();
CREATE TRIGGER guard_supervised_proposal BEFORE INSERT OR UPDATE OR DELETE ON public.adaptation_proposals FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_plan_rows();

CREATE FUNCTION public.check_supervised_committed_program() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE program uuid:=(CASE WHEN TG_TABLE_NAME='training_programs' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'program_id' END)::uuid;
  p public.training_programs%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=program) THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.training_programs WHERE id=program;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=program AND user_id=p.user_id)
    OR p.program_mode<>'rolling_weekly' THEN RAISE EXCEPTION 'Supervised program lineage changed' USING ERRCODE='55000'; END IF;
  IF p.active_plan_version_id IS NOT NULL THEN
    PERFORM public.assert_supervised_accepted_content(p.id,p.user_id,p.active_plan_version_id,false);
    IF NOT EXISTS(SELECT 1 FROM public.training_plan_versions WHERE id=p.active_plan_version_id AND status='accepted') THEN
      RAISE EXCEPTION 'Active supervised target is not accepted' USING ERRCODE='55000'; END IF;
  END IF;
  IF TG_TABLE_NAME='training_plan_versions' AND NEW.status='accepted' AND NEW.id IS DISTINCT FROM p.active_plan_version_id THEN
    RAISE EXCEPTION 'Accepted supervised target is not active' USING ERRCODE='55000'; END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION public.guard_supervised_program_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id IN (OLD.id,NEW.id)) THEN RETURN NEW; END IF;
  IF (NEW.id,NEW.user_id,NEW.program_mode) IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.program_mode) OR NEW.active_plan_version_id IS NULL THEN
    RAISE EXCEPTION 'Supervised program identity and active lineage are retained' USING ERRCODE='55000'; END IF;
  PERFORM public.lock_supervised_program(OLD.id,OLD.user_id);
  IF NEW.active_plan_version_id IS DISTINCT FROM OLD.active_plan_version_id THEN
    SELECT r0.* INTO r FROM public.coach_reviewed_proposal_registrations r0 JOIN public.adaptation_proposals a ON a.id=r0.proposal_id
      WHERE r0.plan_version_id=NEW.active_plan_version_id AND r0.user_id=OLD.user_id AND a.program_id=OLD.id
      AND a.base_plan_version_id=OLD.active_plan_version_id AND a.status='proposed';
    IF NOT FOUND THEN RAISE EXCEPTION 'Active supervised plan can move only through its approved acceptance' USING ERRCODE='55000'; END IF;
    PERFORM public.assert_supervised_registration_link(r.id,true);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_supervised_program_transition BEFORE UPDATE ON public.training_programs FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_program_transition();
CREATE CONSTRAINT TRIGGER supervised_committed_program AFTER UPDATE ON public.training_programs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_supervised_committed_program();
CREATE CONSTRAINT TRIGGER supervised_committed_plan AFTER INSERT OR UPDATE ON public.training_plan_versions DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_supervised_committed_program();
CREATE CONSTRAINT TRIGGER supervised_committed_proposal AFTER INSERT OR UPDATE ON public.adaptation_proposals DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_supervised_committed_program();

CREATE FUNCTION public.guard_supervised_execution_slot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  r public.coach_reviewed_proposal_registrations%ROWTYPE; link jsonb; program uuid;
BEGIN
  program:=(row_data->>'program_id')::uuid;
  IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=OLD.program_id) THEN
    RAISE EXCEPTION 'Supervised execution slots are immutable' USING ERRCODE='55000'; END IF;
  IF NOT public.lock_supervised_program(program,(row_data->>'user_id')::uuid) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Supervised execution slots are immutable' USING ERRCODE='55000'; END IF;
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE plan_version_id=NEW.plan_version_id AND user_id=NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supervised execution slot requires approved registration' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_supervised_registration_link(r.id,true);
  link:=r.packet#>'{inputSnapshot,reviewedExecutionContinuity,slots}'->(NEW.session_index-1);
  IF link IS NULL OR (link->>'executionSessionId' IS NOT NULL AND (NEW.prescribed_session_id::text IS DISTINCT FROM link->>'executionSessionId'
    OR NEW.execution_plan_version_id::text IS DISTINCT FROM link->>'executionPlanVersionId'))
    OR (link->>'executionSessionId' IS NULL AND NEW.execution_plan_version_id<>NEW.plan_version_id) THEN
    RAISE EXCEPTION 'Supervised execution root differs from approval' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_supervised_execution_slot BEFORE INSERT OR UPDATE OR DELETE ON public.coach_reviewed_execution_slots
  FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_execution_slot();

CREATE FUNCTION public.guard_supervised_execution_rows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  prior jsonb; session public.prescribed_sessions%ROWTYPE; program uuid; owner uuid; active uuid; r public.coach_reviewed_proposal_registrations%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='activity_mutations' THEN
    -- Canonical amendments derive authority from the saved workout/session link,
    -- never from caller-provided execution flags or a request-key prefix.
    IF data#>>'{payload,kind}'='workout' THEN
      SELECT * INTO session FROM public.prescribed_sessions WHERE completed_workout_id=(data#>>'{payload,entityId}')::uuid AND user_id=(data->>'user_id')::uuid;
      IF FOUND AND public.lock_supervised_program(session.program_id,session.user_id) THEN
        PERFORM public.assert_supervised_accepted_content(session.program_id,session.user_id,session.plan_version_id,true);
      END IF;
      RETURN NEW;
    END IF;
    IF data#>>'{payload,kind}' IS DISTINCT FROM 'reviewed_session_completion' THEN RETURN NEW; END IF;
    SELECT * INTO session FROM public.prescribed_sessions WHERE id=(data#>>'{payload,sessionId}')::uuid AND user_id=(data->>'user_id')::uuid;
  ELSIF TG_TABLE_NAME='prescribed_sessions' THEN
    session:=jsonb_populate_record(NULL::public.prescribed_sessions,data);
  ELSE
    SELECT * INTO session FROM public.prescribed_sessions WHERE id=(data->>'prescribed_session_id')::uuid AND user_id=(data->>'user_id')::uuid;
  END IF;
  program:=session.program_id; owner:=session.user_id;
  IF TG_OP<>'INSERT' THEN
    prior:=to_jsonb(OLD);
    IF EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=(prior->>'program_id')::uuid)
      AND (prior->'program_id',prior->'user_id',prior->'plan_version_id') IS DISTINCT FROM (data->'program_id',data->'user_id',data->'plan_version_id') THEN
      RAISE EXCEPTION 'Supervised execution lineage cannot be moved' USING ERRCODE='55000'; END IF;
  END IF;
  IF NOT public.lock_supervised_program(program,owner) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supervised execution history is retained' USING ERRCODE='55000'; END IF;
  IF TG_TABLE_NAME='prescribed_sessions' AND TG_OP='INSERT' THEN
    SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE plan_version_id=session.plan_version_id AND user_id=owner;
    IF NOT FOUND OR session.status<>'planned' OR session.completed_workout_id IS NOT NULL OR session.completion_contract_version IS NOT NULL THEN
      RAISE EXCEPTION 'Supervised session requires its unexecuted approved proposal' USING ERRCODE='55000'; END IF;
    PERFORM public.assert_supervised_registration_link(r.id,true);
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.packet->'sessions') s WHERE s->'prescription'=session.prescription
      AND (s->>'session_index')::integer=session.session_index AND (s->>'week_number')::integer=session.week_number
      AND s->>'scheduled_date'=session.scheduled_date::text) THEN RAISE EXCEPTION 'Supervised session differs from approval' USING ERRCODE='55000'; END IF;
    RETURN NEW;
  END IF;
  SELECT active_plan_version_id INTO active FROM public.training_programs WHERE id=program AND user_id=owner;
  PERFORM public.assert_reviewed_execution_active(session.id,owner,active);
  IF TG_TABLE_NAME='coach_session_signals' THEN RAISE EXCEPTION 'Supervised reviewed sessions require set reports' USING ERRCODE='55000'; END IF;
  IF TG_TABLE_NAME='prescribed_sessions' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
    IF (to_jsonb(NEW)-ARRAY['status','completion_contract_version','completed_workout_id','execution_note','completed_at','updated_at']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['status','completion_contract_version','completed_workout_id','execution_note','completed_at','updated_at']) THEN
      RAISE EXCEPTION 'Supervised prescription identity cannot change during completion' USING ERRCODE='55000'; END IF;
    IF OLD.status<>'planned' OR NEW.status NOT IN ('completed','skipped') OR NEW.completion_contract_version IS DISTINCT FROM 3
      OR NOT EXISTS(SELECT 1 FROM public.coach_checkins c JOIN public.activity_mutations m ON m.id::text=c.responses->>'completionOperationId'
        AND m.user_id=c.user_id WHERE c.prescribed_session_id=NEW.id AND c.user_id=owner
        AND m.payload->>'kind'='reviewed_session_completion' AND m.payload->>'sessionId'=NEW.id::text
        AND c.responses->>'resultStatus'=NEW.status AND c.responses->'workoutId' IS NOT DISTINCT FROM coalesce(to_jsonb(NEW.completed_workout_id),'null'::jsonb)) THEN
      RAISE EXCEPTION 'Supervised terminal state requires its protected completion receipt' USING ERRCODE='55000'; END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION public.resolve_reviewed_proposal_request(uuid,text,text,jsonb) RENAME TO resolve_reviewed_proposal_request_before_supervision;
CREATE FUNCTION public.resolve_reviewed_proposal_request(p_program_id uuid,p_operation text,p_request_id text,p_identity jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.training_programs WHERE id=p_program_id AND user_id=auth.uid()) THEN
    PERFORM public.lock_supervised_program(p_program_id,auth.uid()); END IF;
  RETURN public.resolve_reviewed_proposal_request_before_supervision(p_program_id,p_operation,p_request_id,p_identity);
END $$;
ALTER FUNCTION public.resolve_reviewed_session_request(uuid,text,text,jsonb) RENAME TO resolve_reviewed_session_request_before_supervision;
CREATE FUNCTION public.resolve_reviewed_session_request(p_session_id uuid,p_operation text,p_request_id text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.prescribed_sessions%ROWTYPE;
BEGIN
  IF p_operation='complete' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('capture-owner:'||auth.uid()::text,0)); END IF;
  SELECT * INTO s FROM public.prescribed_sessions WHERE id=p_session_id AND user_id=auth.uid();
  IF FOUND THEN PERFORM public.lock_supervised_program(s.program_id,s.user_id); END IF;
  RETURN public.resolve_reviewed_session_request_before_supervision(p_session_id,p_operation,p_request_id,p_payload);
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['prescribed_sessions','coach_reviewed_set_reports','coach_session_signals','coach_checkins'] LOOP
    EXECUTE format('CREATE TRIGGER guard_supervised_execution BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_execution_rows()',t);
  END LOOP;
END $$;
CREATE TRIGGER guard_supervised_capture BEFORE INSERT ON public.activity_mutations FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_execution_rows();

CREATE FUNCTION public.guard_supervised_review_pause() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_supervised_writes_open();
  IF TG_TABLE_NAME='coach_supervised_candidates' AND NOT EXISTS(SELECT 1 FROM public.coach_supervised_initial_bases
    WHERE program_id=(to_jsonb(NEW)->>'program_id')::uuid AND user_id=(to_jsonb(NEW)->>'user_id')::uuid) THEN
    RAISE EXCEPTION 'Initial supervised base must be anchored before candidate submission' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER supervised_review_pause BEFORE INSERT ON public.coach_supervised_candidates FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_review_pause();
CREATE TRIGGER supervised_review_pause BEFORE INSERT ON public.coach_supervised_decisions FOR EACH ROW EXECUTE FUNCTION public.guard_supervised_review_pause();

-- Privately retain existing implementations. Public wrappers acquire program locks
-- before their request/session locks; existing validation and exact replay stay intact.
ALTER FUNCTION public.register_reviewed_week_proposal(uuid,jsonb,text) RENAME TO register_reviewed_week_proposal_before_supervision;
CREATE FUNCTION public.register_reviewed_week_proposal(p_id uuid,p_packet jsonb,p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.lock_supervised_program((p_packet#>>'{source,binding,scope,programId}')::uuid,(p_packet->>'userId')::uuid);
  RETURN public.register_reviewed_week_proposal_before_supervision(p_id,p_packet,p_fingerprint);
END $$;
ALTER FUNCTION public.create_registered_reviewed_week_proposal(uuid,text) RENAME TO create_registered_reviewed_week_proposal_before_supervision;
CREATE FUNCTION public.create_registered_reviewed_week_proposal(p_registration_id uuid,p_idempotency_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_registration_id AND user_id=auth.uid();
  IF FOUND THEN PERFORM public.lock_supervised_program((r.packet#>>'{source,binding,scope,programId}')::uuid,r.user_id); END IF;
  RETURN public.create_registered_reviewed_week_proposal_before_supervision(p_registration_id,p_idempotency_key);
END $$;
ALTER FUNCTION public.accept_adaptation_proposal(uuid,text) RENAME TO accept_adaptation_proposal_before_supervision;
CREATE FUNCTION public.accept_adaptation_proposal(p_proposal_id uuid,p_idempotency_key text)
RETURNS TABLE(accepted_program_id uuid,active_plan_version_id uuid,proposal_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.adaptation_proposals%ROWTYPE; r uuid;
BEGIN
  SELECT * INTO a FROM public.adaptation_proposals WHERE id=p_proposal_id AND user_id=auth.uid();
  IF FOUND AND public.lock_supervised_program(a.program_id,a.user_id) AND a.status<>'accepted' THEN
    SELECT id INTO r FROM public.coach_reviewed_proposal_registrations WHERE proposal_id=a.id AND user_id=a.user_id;
    IF r IS NULL THEN RAISE EXCEPTION 'Supervised acceptance requires exact approval' USING ERRCODE='55000'; END IF;
    PERFORM public.assert_reviewed_registration_current(r,false);
  END IF;
  RETURN QUERY SELECT * FROM public.accept_adaptation_proposal_before_supervision(p_proposal_id,p_idempotency_key);
END $$;
ALTER FUNCTION public.record_reviewed_session_set(uuid,text,jsonb) RENAME TO record_reviewed_session_set_before_supervision;
CREATE FUNCTION public.record_reviewed_session_set(p_session_id uuid,p_request_id text,p_report jsonb)
RETURNS TABLE(id uuid,created_at timestamptz,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.prescribed_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.prescribed_sessions WHERE prescribed_sessions.id=p_session_id AND user_id=auth.uid();
  IF FOUND THEN PERFORM public.lock_supervised_program(s.program_id,s.user_id); END IF;
  RETURN QUERY SELECT * FROM public.record_reviewed_session_set_before_supervision(p_session_id,p_request_id,p_report);
END $$;
ALTER FUNCTION public.complete_reviewed_session(uuid,text,jsonb) RENAME TO complete_reviewed_session_before_supervision;
CREATE FUNCTION public.complete_reviewed_session(p_session_id uuid,p_request_id text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.prescribed_sessions%ROWTYPE;
BEGIN
  -- Capture remains outermost so amendments and completion retain their owner fence.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('capture-owner:'||auth.uid()::text,0));
  SELECT * INTO s FROM public.prescribed_sessions WHERE id=p_session_id AND user_id=auth.uid();
  IF FOUND THEN PERFORM public.lock_supervised_program(s.program_id,s.user_id); END IF;
  RETURN public.complete_reviewed_session_before_supervision(p_session_id,p_request_id,p_request);
END $$;

CREATE FUNCTION public.get_supervised_lifecycle_receipt(p_program_id uuid,p_operation text,p_request_id text,p_identity jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); result jsonb; a public.adaptation_proposals%ROWTYPE; r public.coach_reviewed_proposal_registrations%ROWTYPE;
  s public.prescribed_sessions%ROWTYPE; report public.coach_reviewed_set_reports%ROWTYPE; mutation public.activity_mutations%ROWTYPE; envelope jsonb;
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('issue','accept','set','complete') OR p_request_id IS NULL OR p_request_id<>btrim(p_request_id)
    OR length(p_request_id) NOT BETWEEN 8 AND 200 OR jsonb_typeof(p_identity) IS DISTINCT FROM 'object' OR octet_length(p_identity::text)>120000
    OR (SELECT count(*) FROM jsonb_object_keys(p_identity))<>2 THEN RAISE EXCEPTION 'Invalid lifecycle receipt identity' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.training_programs WHERE id=p_program_id AND user_id=owner) THEN RAISE EXCEPTION 'Owned program unavailable' USING ERRCODE='P0002'; END IF;
  envelope:=jsonb_build_object('schemaVersion',1,'userId',owner,'programId',p_program_id,'operation',p_operation,'requestId',p_request_id,'identity',p_identity);
  IF p_operation='issue' THEN
    IF NOT(p_identity ?& ARRAY['reviewId','registrationId']) THEN RAISE EXCEPTION 'Invalid issue receipt identity' USING ERRCODE='22023'; END IF;
    SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=(p_identity->>'registrationId')::uuid AND user_id=owner;
    IF FOUND AND (r.packet->>'registrationId' IS DISTINCT FROM p_identity->>'reviewId' OR r.packet#>>'{source,binding,scope,programId}' IS DISTINCT FROM p_program_id::text) THEN
      RAISE EXCEPTION 'Receipt registration identity conflicts' USING ERRCODE='22023'; END IF;
    SELECT * INTO a FROM public.adaptation_proposals WHERE user_id=owner AND idempotency_key=p_request_id;
    IF FOUND THEN
      IF r.id IS NULL OR a.id IS DISTINCT FROM r.proposal_id OR a.proposed_plan_version_id IS DISTINCT FROM r.plan_version_id OR a.program_id<>p_program_id THEN
        RAISE EXCEPTION 'Receipt issue identity conflicts' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('proposalId',a.id,'programId',a.program_id,'planVersionId',a.proposed_plan_version_id,'replayed',true);
    END IF;
  ELSIF p_operation='accept' THEN
    IF NOT(p_identity ?& ARRAY['proposalId','planVersionId']) THEN RAISE EXCEPTION 'Invalid acceptance receipt identity' USING ERRCODE='22023'; END IF;
    SELECT * INTO a FROM public.adaptation_proposals WHERE id=(p_identity->>'proposalId')::uuid AND user_id=owner;
    IF FOUND THEN
      IF a.program_id<>p_program_id OR a.proposed_plan_version_id::text IS DISTINCT FROM p_identity->>'planVersionId' OR a.idempotency_key<>p_request_id THEN
        RAISE EXCEPTION 'Receipt acceptance identity conflicts' USING ERRCODE='22023'; END IF;
      IF a.status='accepted' THEN result:=jsonb_build_object('accepted_program_id',a.program_id,'active_plan_version_id',a.proposed_plan_version_id,'proposal_status','accepted'); END IF;
    END IF;
  ELSE
    IF NOT(p_identity ?& ARRAY['sessionId',CASE WHEN p_operation='set' THEN 'report' ELSE 'completion' END]) THEN
      RAISE EXCEPTION 'Invalid execution receipt identity' USING ERRCODE='22023'; END IF;
    SELECT * INTO s FROM public.prescribed_sessions WHERE id=(p_identity->>'sessionId')::uuid AND user_id=owner AND program_id=p_program_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Owned session unavailable' USING ERRCODE='P0002'; END IF;
    IF p_operation='set' THEN
      SELECT * INTO report FROM public.coach_reviewed_set_reports WHERE user_id=owner AND request_id=p_request_id;
      IF FOUND THEN
        IF report.prescribed_session_id<>s.id OR report.report IS DISTINCT FROM p_identity->'report' THEN RAISE EXCEPTION 'Receipt report identity conflicts' USING ERRCODE='22023'; END IF;
        result:=jsonb_build_object('id',report.id,'created_at',report.created_at,'replayed',true);
      END IF;
    ELSE
      SELECT * INTO mutation FROM public.activity_mutations WHERE user_id=owner AND request_key='reviewed-completion:'||p_request_id;
      IF FOUND THEN
        IF mutation.payload-'checkinId'-'response' IS DISTINCT FROM jsonb_build_object('kind','reviewed_session_completion','sessionId',s.id,'request',p_identity->'completion')
          OR mutation.receipt IS NULL THEN RAISE EXCEPTION 'Receipt completion identity conflicts' USING ERRCODE='22023'; END IF;
        result:=jsonb_set(mutation.receipt,'{result,replayed}','true');
      END IF;
    END IF;
  END IF;
  RETURN envelope||jsonb_build_object('disposition',CASE WHEN result IS NULL THEN 'not_found' ELSE 'saved' END,'result',result);
END $$;

-- Explicit grants; renamed implementations remain private, including from service_role.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname IN ('lock_supervised_program','assert_supervised_writes_open','supervised_static_execution',
      'provision_supervised_initial_base','assert_supervised_current_execution_enrollment','assert_supervised_registration_link','assert_supervised_plan_content',
      'assert_supervised_accepted_content','guard_supervised_registration','assert_reviewed_registration_current','assert_reviewed_execution_active',
      'guard_supervised_plan_rows','check_supervised_committed_program','guard_supervised_execution_rows','register_reviewed_week_proposal',
      'create_registered_reviewed_week_proposal','accept_adaptation_proposal','record_reviewed_session_set','complete_reviewed_session','get_supervised_lifecycle_receipt',
      'resolve_reviewed_proposal_request','resolve_reviewed_session_request','guard_supervised_program_transition','guard_supervised_execution_slot','guard_supervised_review_pause')
      OR p.proname LIKE '%\_before\_supervision' ESCAPE '\') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
    IF f.proname IN ('provision_supervised_initial_base','register_reviewed_week_proposal') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
    ELSIF f.proname IN ('create_registered_reviewed_week_proposal','accept_adaptation_proposal','record_reviewed_session_set','complete_reviewed_session','get_supervised_lifecycle_receipt',
      'resolve_reviewed_proposal_request','resolve_reviewed_session_request') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF;
    IF f.proname NOT IN ('supervised_static_execution','get_supervised_lifecycle_receipt') THEN EXECUTE format('ALTER FUNCTION %s SET lock_timeout=''1s''',f.sig); END IF;
  END LOOP;
END $$;
COMMIT;
