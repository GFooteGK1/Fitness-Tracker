-- ADR0036: explicit legacy-to-first-reviewed issuance and atomic acceptance.
-- Installation creates no program lineage, anchor, enrollment or activation.
BEGIN;

CREATE FUNCTION public.is_first_review_packet(p_packet jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT coalesce(p_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}'='first_reviewed',false)
    OR coalesce(p_packet->'inputSnapshot' ? 'firstReviewDesignation',false)
    OR coalesce(p_packet->'inputSnapshot' ? 'firstReviewedDraft',false)
$$;

CREATE FUNCTION public.assert_first_review_approval(p_id uuid,p_packet jsonb,p_current boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.coach_first_review_candidates%ROWTYPE; d public.coach_first_review_designations%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.coach_first_review_candidates WHERE id=p_id;
  IF NOT FOUND OR c.private_packet IS DISTINCT FROM p_packet OR c.user_id::text IS DISTINCT FROM p_packet->>'userId'
    OR c.program_id::text IS DISTINCT FROM p_packet#>>'{source,binding,scope,programId}' THEN
    RAISE EXCEPTION 'Exact first reviewed candidate required' USING ERRCODE='55000'; END IF;
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=c.designation_id;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.coach_first_review_decisions receipt WHERE receipt.candidate_id=c.id
    AND receipt.designation_id=d.id AND receipt.reviewer_id=d.reviewer_id AND receipt.decision='approve'
    AND receipt.content_hash=c.content_hash AND receipt.source_hash=c.source_hash) THEN
    RAISE EXCEPTION 'Exact designated first review approval required' USING ERRCODE='55000'; END IF;
  IF p_current THEN PERFORM public.assert_first_review_packet_current(p_packet); END IF;
END $$;

CREATE TABLE public.coach_first_review_acceptances (
  registration_id uuid PRIMARY KEY REFERENCES public.coach_reviewed_proposal_registrations(id),
  program_id uuid NOT NULL UNIQUE REFERENCES public.training_programs(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.adaptation_proposals(id),
  base_plan_version_id uuid NOT NULL REFERENCES public.training_plan_versions(id),
  plan_version_id uuid NOT NULL UNIQUE REFERENCES public.training_plan_versions(id),
  request_id text NOT NULL CHECK(length(request_id) BETWEEN 8 AND 200),
  accepted_transaction bigint NOT NULL,
  legacy_snapshot jsonb NOT NULL,
  legacy_execution jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.coach_first_review_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_acceptances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_first_review_acceptances FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_first_review_acceptance BEFORE UPDATE OR DELETE ON public.coach_first_review_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();

CREATE FUNCTION public.guard_first_review_acceptance_proof() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE; a public.adaptation_proposals%ROWTYPE; base public.training_plan_versions%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=NEW.registration_id;
  SELECT * INTO a FROM public.adaptation_proposals WHERE id=r.proposal_id;
  SELECT * INTO base FROM public.training_plan_versions WHERE id=a.base_plan_version_id;
  IF r.id IS NULL OR a.id IS NULL OR auth.uid() IS DISTINCT FROM NEW.user_id OR NEW.user_id IS DISTINCT FROM r.user_id
    OR NEW.program_id IS DISTINCT FROM a.program_id OR NEW.proposal_id IS DISTINCT FROM r.proposal_id
    OR NEW.plan_version_id IS DISTINCT FROM r.plan_version_id OR NEW.base_plan_version_id IS DISTINCT FROM a.base_plan_version_id
    OR NEW.request_id IS DISTINCT FROM a.idempotency_key OR NEW.accepted_transaction IS DISTINCT FROM pg_catalog.txid_current()
    OR a.status IS DISTINCT FROM 'proposed' OR NEW.legacy_snapshot IS DISTINCT FROM to_jsonb(base)-'status'
    OR NEW.legacy_execution IS DISTINCT FROM public.supervised_static_execution(r.user_id,a.program_id,base.id) THEN
    RAISE EXCEPTION 'Invalid first acceptance transaction proof' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_first_review_approval(r.id,r.packet,true);
  RETURN NEW;
END $$;
CREATE TRIGGER guard_first_review_acceptance_proof BEFORE INSERT ON public.coach_first_review_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.guard_first_review_acceptance_proof();

CREATE FUNCTION public.assert_first_review_acceptance_transaction(p_registration uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE; proof public.coach_first_review_acceptances%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_registration;
  SELECT * INTO proof FROM public.coach_first_review_acceptances WHERE registration_id=p_registration;
  IF r.id IS NULL OR proof.registration_id IS NULL OR proof.accepted_transaction IS DISTINCT FROM pg_catalog.txid_current()
    OR auth.uid() IS DISTINCT FROM proof.user_id OR proof.user_id IS DISTINCT FROM r.user_id
    OR proof.proposal_id IS DISTINCT FROM r.proposal_id OR proof.plan_version_id IS DISTINCT FROM r.plan_version_id
    OR proof.program_id::text IS DISTINCT FROM r.packet#>>'{source,binding,scope,programId}'
    OR proof.base_plan_version_id::text IS DISTINCT FROM r.packet#>>'{source,binding,scope,basePlanVersionId}' THEN
    RAISE EXCEPTION 'First acceptance requires its authenticated transaction' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_first_review_approval(r.id,r.packet,false);
END $$;

-- Keep ordinary same/next and nonpilot semantics behind the existing implementation.
ALTER FUNCTION public.assert_reviewed_week_transition(jsonb) RENAME TO assert_reviewed_week_transition_before_first_review;
CREATE FUNCTION public.assert_reviewed_week_transition(p_packet jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.is_first_review_packet(p_packet) THEN PERFORM public.assert_first_review_packet_current(p_packet);
  ELSE PERFORM public.assert_reviewed_week_transition_before_first_review(p_packet); END IF;
END $$;
ALTER FUNCTION public.assert_reviewed_execution_continuity(jsonb) RENAME TO assert_reviewed_execution_continuity_before_first_review;
CREATE FUNCTION public.assert_reviewed_execution_continuity(p_packet jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.is_first_review_packet(p_packet) THEN PERFORM public.assert_first_review_packet_current(p_packet);
  ELSE PERFORM public.assert_reviewed_execution_continuity_before_first_review(p_packet); END IF;
END $$;

ALTER FUNCTION public.assert_supervised_registration_link(uuid,boolean) RENAME TO assert_supervised_registration_link_before_first_review;
CREATE FUNCTION public.assert_supervised_registration_link(p_id uuid,p_current boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_id;
  IF EXISTS(SELECT 1 FROM public.coach_first_review_candidates WHERE id=p_id) OR public.is_first_review_packet(r.packet) THEN
    PERFORM public.assert_first_review_approval(r.id,r.packet,false);
    IF p_current THEN
      IF EXISTS(SELECT 1 FROM public.coach_first_review_acceptances WHERE registration_id=p_id
        AND accepted_transaction=pg_catalog.txid_current()) THEN
        PERFORM public.assert_first_review_acceptance_transaction(p_id);
      ELSE PERFORM public.assert_first_review_packet_current(r.packet); END IF;
    END IF;
  ELSE PERFORM public.assert_supervised_registration_link_before_first_review(p_id,p_current); END IF;
END $$;

ALTER FUNCTION public.assert_reviewed_registration_current(uuid,boolean) RENAME TO assert_reviewed_registration_current_before_first_review;
CREATE FUNCTION public.assert_reviewed_registration_current(p_id uuid,p_accepting boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_id;
  IF EXISTS(SELECT 1 FROM public.coach_first_review_candidates WHERE id=p_id) OR public.is_first_review_packet(r.packet) THEN
    PERFORM public.assert_first_review_approval(r.id,r.packet,false);
    IF p_accepting THEN PERFORM public.assert_first_review_acceptance_transaction(p_id);
    ELSE PERFORM public.assert_first_review_packet_current(r.packet); END IF;
  ELSE PERFORM public.assert_reviewed_registration_current_before_first_review(p_id,p_accepting); END IF;
END $$;

CREATE FUNCTION public.guard_first_review_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.coach_first_review_candidates WHERE id=NEW.id) OR public.is_first_review_packet(NEW.packet) THEN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('reviewed-registration:'||NEW.id::text,0)) THEN
      RAISE EXCEPTION 'First registration is busy' USING ERRCODE='55P03'; END IF;
    PERFORM public.assert_first_review_approval(NEW.id,NEW.packet,true);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_first_review_registration BEFORE INSERT ON public.coach_reviewed_proposal_registrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_first_review_registration();

ALTER FUNCTION public.register_reviewed_week_proposal(uuid,jsonb,text) RENAME TO register_reviewed_week_proposal_before_first_review;
CREATE FUNCTION public.register_reviewed_week_proposal(p_id uuid,p_packet jsonb,p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE saved public.coach_reviewed_proposal_registrations%ROWTYPE;
BEGIN
  IF EXISTS(SELECT 1 FROM public.coach_first_review_candidates WHERE id=p_id) OR public.is_first_review_packet(p_packet) THEN
    -- Same order as issue resolution: registration first, then program try-lock.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('reviewed-registration:'||p_id::text,0));
    SELECT * INTO saved FROM public.coach_reviewed_proposal_registrations WHERE id=p_id;
    IF FOUND THEN
      IF saved.packet IS DISTINCT FROM p_packet OR saved.fingerprint IS DISTINCT FROM p_fingerprint THEN
        RAISE EXCEPTION 'Registration ID was used for different content' USING ERRCODE='22023'; END IF;
      PERFORM public.assert_first_review_approval(p_id,p_packet,false);
    ELSE PERFORM public.assert_first_review_approval(p_id,p_packet,true); END IF;
  END IF;
  RETURN public.register_reviewed_week_proposal_before_first_review(p_id,p_packet,p_fingerprint);
END $$;

ALTER FUNCTION public.create_registered_reviewed_week_proposal(uuid,text) RENAME TO create_registered_reviewed_week_proposal_before_first_review;
CREATE FUNCTION public.create_registered_reviewed_week_proposal(p_registration_id uuid,p_idempotency_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE; existing public.adaptation_proposals%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_registration_id AND user_id=auth.uid();
  IF FOUND AND (EXISTS(SELECT 1 FROM public.coach_first_review_candidates WHERE id=r.id) OR public.is_first_review_packet(r.packet)) THEN
    IF p_idempotency_key IS NULL OR p_idempotency_key<>btrim(p_idempotency_key) OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
      RAISE EXCEPTION 'Invalid first issue request key' USING ERRCODE='22023'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('reviewed-registration:'||r.id::text,0));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.user_id::text||':rolling-week-proposal:'||p_idempotency_key,0));
    PERFORM public.lock_first_review_program((r.packet#>>'{source,binding,scope,programId}')::uuid,r.user_id);
    SELECT * INTO existing FROM public.adaptation_proposals WHERE id=r.proposal_id FOR UPDATE NOWAIT;
    IF FOUND THEN
      IF existing.idempotency_key IS DISTINCT FROM p_idempotency_key OR existing.user_id IS DISTINCT FROM r.user_id THEN
        RAISE EXCEPTION 'First registration was issued with another key' USING ERRCODE='22023'; END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM public.coach_reviewed_proposal_resolutions closed WHERE closed.user_id=r.user_id AND closed.operation='issue'
        AND (closed.registration_id=r.id OR closed.request_id=p_idempotency_key)) THEN
        RAISE EXCEPTION 'First issue request is closed' USING ERRCODE='55000'; END IF;
      PERFORM public.assert_first_review_approval(r.id,r.packet,true);
    END IF;
    RETURN public.create_registered_reviewed_week_proposal_before_supervision(p_registration_id,p_idempotency_key);
  END IF;
  RETURN public.create_registered_reviewed_week_proposal_before_first_review(p_registration_id,p_idempotency_key);
END $$;

-- Reserved registration/candidate IDs classify rows even if mutable markers are stripped.
CREATE FUNCTION public.guard_first_review_rows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE; data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  prior jsonb:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
BEGIN
  SELECT r0.* INTO r FROM public.coach_reviewed_proposal_registrations r0 JOIN public.coach_first_review_candidates c ON c.id=r0.id
    WHERE (TG_TABLE_NAME='training_plan_versions' AND r0.plan_version_id IN ((data->>'id')::uuid,(prior->>'id')::uuid))
      OR (TG_TABLE_NAME='adaptation_proposals' AND r0.proposal_id IN ((data->>'id')::uuid,(prior->>'id')::uuid))
      OR (TG_TABLE_NAME='training_programs' AND r0.plan_version_id=(data->>'active_plan_version_id')::uuid);
  IF NOT FOUND THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'First reviewed history is retained' USING ERRCODE='55000'; END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'training_programs' AND prior->'id' IS DISTINCT FROM data->'id' THEN
    RAISE EXCEPTION 'First reviewed reserved identity cannot move' USING ERRCODE='55000'; END IF;
  PERFORM public.lock_first_review_program((r.packet#>>'{source,binding,scope,programId}')::uuid,r.user_id);
  IF TG_TABLE_NAME='training_plan_versions' THEN
    PERFORM public.assert_supervised_plan_content(data,r.id);
    IF TG_OP='UPDATE' AND ((data-ARRAY['status','accepted_at']) IS DISTINCT FROM (prior-ARRAY['status','accepted_at'])
      OR (NOT(OLD.status='proposed' AND NEW.status='accepted') AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at)
      OR (OLD.status IN ('superseded','rejected') AND NEW.status IS DISTINCT FROM OLD.status)
      OR (OLD.status='accepted' AND NEW.status NOT IN ('accepted','superseded'))) THEN
      RAISE EXCEPTION 'First plan identity and terminal history are immutable' USING ERRCODE='55000'; END IF;
    IF NEW.status='accepted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
      PERFORM public.assert_first_review_acceptance_transaction(r.id); END IF;
  ELSIF TG_TABLE_NAME='adaptation_proposals' THEN
    IF NEW.id IS DISTINCT FROM r.proposal_id THEN RAISE EXCEPTION 'First proposal identity changed' USING ERRCODE='55000'; END IF;
    IF NEW.user_id IS DISTINCT FROM r.user_id OR NEW.program_id::text IS DISTINCT FROM r.packet#>>'{source,binding,scope,programId}'
      OR NEW.proposed_plan_version_id IS DISTINCT FROM r.plan_version_id
      OR NEW.base_plan_version_id::text IS DISTINCT FROM r.packet#>>'{source,binding,scope,basePlanVersionId}'
      OR NEW.rationale IS DISTINCT FROM public.reviewed_registration_rationale(r.id) OR NEW.weekly_review_id IS NOT NULL THEN
      RAISE EXCEPTION 'First proposal differs from exact approval' USING ERRCODE='55000'; END IF;
    IF TG_OP='UPDATE' AND ((data-ARRAY['status','decided_at']) IS DISTINCT FROM (prior-ARRAY['status','decided_at'])
      OR (OLD.status<>'proposed' AND NOT(OLD.status='expired' AND NEW.status='rejected') AND data IS DISTINCT FROM prior)) THEN
      RAISE EXCEPTION 'First proposal identity and committed decision are immutable' USING ERRCODE='55000'; END IF;
    IF NEW.status='accepted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
      PERFORM public.assert_first_review_acceptance_transaction(r.id); END IF;
  ELSIF TG_OP='UPDATE' AND NEW.active_plan_version_id IS DISTINCT FROM OLD.active_plan_version_id THEN
    IF NEW.id::text IS DISTINCT FROM r.packet#>>'{source,binding,scope,programId}' OR NEW.user_id IS DISTINCT FROM r.user_id
      OR NEW.program_mode IS DISTINCT FROM 'rolling_weekly' OR NEW.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'First accepted program identity differs' USING ERRCODE='55000'; END IF;
    PERFORM public.assert_first_review_acceptance_transaction(r.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_first_review_plan BEFORE INSERT OR UPDATE OR DELETE ON public.training_plan_versions FOR EACH ROW EXECUTE FUNCTION public.guard_first_review_rows();
CREATE TRIGGER guard_first_review_proposal BEFORE INSERT OR UPDATE OR DELETE ON public.adaptation_proposals FOR EACH ROW EXECUTE FUNCTION public.guard_first_review_rows();
CREATE TRIGGER guard_first_review_program BEFORE UPDATE ON public.training_programs FOR EACH ROW EXECUTE FUNCTION public.guard_first_review_rows();

CREATE FUNCTION public.check_first_review_committed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE; proof public.coach_first_review_acceptances%ROWTYPE;
  plan public.training_plan_versions%ROWTYPE; base public.training_plan_versions%ROWTYPE; a public.adaptation_proposals%ROWTYPE;
  program public.training_programs%ROWTYPE; anchor public.coach_supervised_initial_bases%ROWTYPE; data jsonb:=to_jsonb(NEW); manifest jsonb;
BEGIN
  FOR r IN SELECT r0.* FROM public.coach_reviewed_proposal_registrations r0 JOIN public.coach_first_review_candidates c ON c.id=r0.id
    WHERE (TG_TABLE_NAME='training_plan_versions' AND r0.plan_version_id=(data->>'id')::uuid)
      OR (TG_TABLE_NAME='adaptation_proposals' AND r0.proposal_id=(data->>'id')::uuid)
      OR (TG_TABLE_NAME='training_programs' AND r0.packet#>>'{source,binding,scope,programId}'=data->>'id')
      OR (TG_TABLE_NAME='coach_first_review_acceptances' AND r0.id=(data->>'registration_id')::uuid) LOOP
    SELECT * INTO plan FROM public.training_plan_versions WHERE id=r.plan_version_id;
    SELECT * INTO a FROM public.adaptation_proposals WHERE id=r.proposal_id;
    SELECT * INTO program FROM public.training_programs WHERE id=(r.packet#>>'{source,binding,scope,programId}')::uuid;
    IF plan.status IN ('accepted','superseded') OR a.status='accepted' OR program.active_plan_version_id=r.plan_version_id
      OR TG_TABLE_NAME='coach_first_review_acceptances' THEN
      SELECT * INTO proof FROM public.coach_first_review_acceptances WHERE registration_id=r.id;
      SELECT * INTO base FROM public.training_plan_versions WHERE id=(r.packet#>>'{source,binding,scope,basePlanVersionId}')::uuid;
      SELECT * INTO anchor FROM public.coach_supervised_initial_bases WHERE program_id=program.id AND plan_version_id=r.plan_version_id;
      SELECT coalesce(jsonb_agg(jsonb_build_object('week_number',s.week_number,'session_index',s.session_index,
        'scheduled_date',s.scheduled_date,'prescription',s.prescription) ORDER BY s.session_index),'[]'::jsonb) INTO manifest
        FROM public.coach_effective_prescribed_sessions s WHERE s.plan_version_id=r.plan_version_id AND s.user_id=r.user_id;
      PERFORM public.assert_first_review_approval(r.id,r.packet,false);
      PERFORM public.assert_supervised_plan_content(to_jsonb(plan),r.id);
      IF proof.registration_id IS NULL OR proof.user_id IS DISTINCT FROM r.user_id OR proof.program_id IS DISTINCT FROM program.id
        OR proof.proposal_id IS DISTINCT FROM r.proposal_id OR proof.plan_version_id IS DISTINCT FROM r.plan_version_id
        OR proof.base_plan_version_id IS DISTINCT FROM base.id OR proof.request_id IS DISTINCT FROM a.idempotency_key
        OR plan.status NOT IN ('accepted','superseded') OR a.status IS DISTINCT FROM 'accepted' OR base.status IS DISTINCT FROM 'superseded'
        OR proof.legacy_snapshot IS DISTINCT FROM to_jsonb(base)-'status'
        OR proof.legacy_execution IS DISTINCT FROM public.supervised_static_execution(r.user_id,program.id,base.id)
        OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=program.id AND user_id=r.user_id)
        OR anchor.program_id IS NULL OR anchor.user_id IS DISTINCT FROM r.user_id
        OR manifest IS DISTINCT FROM r.packet->'sessions' OR anchor.operator_ref IS DISTINCT FROM 'first-reviewed:'||r.id::text
        OR EXISTS(SELECT 1 FROM public.prescribed_sessions s WHERE s.plan_version_id=plan.id AND NOT EXISTS(
          SELECT 1 FROM public.coach_reviewed_execution_slots l WHERE l.plan_version_id=plan.id AND l.prescribed_session_id=s.id))
        OR EXISTS(SELECT 1 FROM public.coach_reviewed_execution_slots l WHERE l.plan_version_id=plan.id
          AND (l.execution_plan_version_id IS DISTINCT FROM plan.id OR l.user_id IS DISTINCT FROM r.user_id OR l.program_id IS DISTINCT FROM program.id))
        OR anchor.plan_snapshot IS DISTINCT FROM to_jsonb(plan)-'status'
        OR anchor.execution_manifest IS DISTINCT FROM public.supervised_static_execution(r.user_id,program.id,plan.id)
        OR (proof.accepted_transaction=pg_catalog.txid_current() AND program.active_plan_version_id IS DISTINCT FROM plan.id) THEN
        RAISE EXCEPTION 'First acceptance must commit exact lineage, anchor and retained history together' USING ERRCODE='55000'; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER first_review_committed_plan AFTER INSERT OR UPDATE ON public.training_plan_versions DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_first_review_committed();
CREATE CONSTRAINT TRIGGER first_review_committed_proposal AFTER INSERT OR UPDATE ON public.adaptation_proposals DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_first_review_committed();
CREATE CONSTRAINT TRIGGER first_review_committed_program AFTER UPDATE ON public.training_programs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_first_review_committed();
CREATE CONSTRAINT TRIGGER first_review_committed_acceptance AFTER INSERT ON public.coach_first_review_acceptances DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_first_review_committed();

ALTER FUNCTION public.accept_adaptation_proposal(uuid,text) RENAME TO accept_adaptation_proposal_before_first_review;
CREATE FUNCTION public.accept_adaptation_proposal(p_proposal_id uuid,p_idempotency_key text)
RETURNS TABLE(accepted_program_id uuid,active_plan_version_id uuid,proposal_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE a public.adaptation_proposals%ROWTYPE; r public.coach_reviewed_proposal_registrations%ROWTYPE; base public.training_plan_versions%ROWTYPE;
  proof public.coach_first_review_acceptances%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.adaptation_proposals WHERE id=p_proposal_id AND user_id=auth.uid();
  SELECT r0.* INTO r FROM public.coach_reviewed_proposal_registrations r0 JOIN public.coach_first_review_candidates c ON c.id=r0.id
    WHERE r0.proposal_id=a.id AND r0.user_id=a.user_id;
  IF r.id IS NULL THEN
    RETURN QUERY SELECT * FROM public.accept_adaptation_proposal_before_first_review(p_proposal_id,p_idempotency_key); RETURN;
  END IF;
  IF p_idempotency_key IS DISTINCT FROM a.idempotency_key THEN RAISE EXCEPTION 'First acceptance key differs' USING ERRCODE='22023'; END IF;
  IF a.status='accepted' THEN
    SELECT * INTO proof FROM public.coach_first_review_acceptances WHERE registration_id=r.id AND user_id=auth.uid();
    IF NOT FOUND OR proof.proposal_id IS DISTINCT FROM a.id OR proof.plan_version_id IS DISTINCT FROM a.proposed_plan_version_id
      OR proof.program_id IS DISTINCT FROM a.program_id OR proof.request_id IS DISTINCT FROM p_idempotency_key THEN
      RAISE EXCEPTION 'Exact saved first acceptance required' USING ERRCODE='55000'; END IF;
    PERFORM public.assert_supervised_accepted_content(a.program_id,a.user_id,a.proposed_plan_version_id,false);
    -- This field reports the current active ID, not that the historical target is still active.
    RETURN QUERY SELECT p.id,p.active_plan_version_id,'accepted'::text FROM public.training_programs p WHERE p.id=a.program_id AND p.user_id=a.user_id;
    RETURN;
  END IF;
  PERFORM public.lock_first_review_program(a.program_id,a.user_id);
  SELECT * INTO a FROM public.adaptation_proposals WHERE id=p_proposal_id AND user_id=auth.uid() FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.training_plan_versions WHERE id IN(a.base_plan_version_id,a.proposed_plan_version_id) ORDER BY id FOR UPDATE NOWAIT;
  IF a.status IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'First proposal is not proposed' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_first_review_approval(r.id,r.packet,true);
  SELECT * INTO base FROM public.training_plan_versions WHERE id=a.base_plan_version_id;
  INSERT INTO public.coach_first_review_acceptances(registration_id,program_id,user_id,proposal_id,base_plan_version_id,plan_version_id,
    request_id,accepted_transaction,legacy_snapshot,legacy_execution)
    VALUES(r.id,a.program_id,a.user_id,a.id,a.base_plan_version_id,a.proposed_plan_version_id,a.idempotency_key,
      pg_catalog.txid_current(),to_jsonb(base)-'status',public.supervised_static_execution(a.user_id,a.program_id,base.id));
  RETURN QUERY SELECT * FROM public.accept_adaptation_proposal_before_supervision(p_proposal_id,p_idempotency_key);
  -- Activate permanent protection only after legacy supersession and the old mutations.
  INSERT INTO public.coach_supervised_programs(program_id,user_id) VALUES(a.program_id,a.user_id);
  PERFORM public.provision_supervised_initial_base(a.program_id,a.proposed_plan_version_id,'first-reviewed:'||r.id::text);
END $$;

-- Exact first acceptance envelope, shared by fresh acceptance and historical recovery.
CREATE FUNCTION public.first_review_accept_request_identity(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); body jsonb:=p_request->'body'; item text;
  c public.coach_first_review_candidates%ROWTYPE; r public.coach_reviewed_proposal_registrations%ROWTYPE; a public.adaptation_proposals%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>600000
    OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>5 OR NOT(p_request ?& ARRAY['schemaVersion','userId','programId','operation','body'])
    OR p_request->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR p_request->'operation' IS DISTINCT FROM '"accept"'::jsonb
    OR p_request->'userId' IS DISTINCT FROM to_jsonb(actor::text) OR body->'expectedUserId' IS DISTINCT FROM to_jsonb(actor::text)
    OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(body))<>8
    OR NOT(body ?& ARRAY['expectedUserId','programId','candidateId','proposalId','planVersionId','requestId','contentHash','sourceHash'])
    OR body->'programId' IS DISTINCT FROM p_request->'programId' OR jsonb_typeof(body->'requestId') IS DISTINCT FROM 'string'
    OR body->>'requestId'<>btrim(body->>'requestId') OR length(body->>'requestId') NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid first acceptance envelope' USING ERRCODE='22023'; END IF;
  FOREACH item IN ARRAY ARRAY['programId','candidateId','proposalId','planVersionId'] LOOP
    IF jsonb_typeof(body->item) IS DISTINCT FROM 'string' OR (body->>item ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Invalid first acceptance identity' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH item IN ARRAY ARRAY['contentHash','sourceHash'] LOOP
    IF jsonb_typeof(body->item) IS DISTINCT FROM 'string' OR (body->>item ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Invalid first acceptance hash' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT * INTO c FROM public.coach_first_review_candidates WHERE id=(body->>'candidateId')::uuid AND user_id=actor AND program_id=(body->>'programId')::uuid;
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=c.id AND user_id=actor;
  SELECT * INTO a FROM public.adaptation_proposals WHERE id=r.proposal_id AND user_id=actor;
  IF c.id IS NULL OR r.id IS NULL OR a.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.training_programs WHERE id=c.program_id AND user_id=actor) THEN
    RAISE EXCEPTION 'Owned first issued candidate unavailable' USING ERRCODE='P0002'; END IF;
  IF body->>'contentHash' IS DISTINCT FROM c.content_hash OR body->>'sourceHash' IS DISTINCT FROM c.source_hash
    OR body->>'proposalId' IS DISTINCT FROM r.proposal_id::text OR body->>'planVersionId' IS DISTINCT FROM r.plan_version_id::text
    OR body->>'requestId' IS DISTINCT FROM a.idempotency_key OR a.program_id IS DISTINCT FROM c.program_id
    OR a.proposed_plan_version_id IS DISTINCT FROM r.plan_version_id OR r.packet IS DISTINCT FROM c.private_packet THEN
    RAISE EXCEPTION 'First acceptance identity conflicts with issued approval' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('proposalId',r.proposal_id,'planVersionId',r.plan_version_id);
END $$;

ALTER FUNCTION public.first_review_request_resolution_result(jsonb,boolean) RENAME TO first_review_request_resolution_result_before_acceptance;
CREATE FUNCTION public.first_review_request_resolution_result(p_request jsonb,p_close boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE identity jsonb; body jsonb:=p_request->'body'; result jsonb; closed public.coach_reviewed_proposal_resolutions%ROWTYPE;
  a public.adaptation_proposals%ROWTYPE; proof public.coach_first_review_acceptances%ROWTYPE; envelope jsonb; active uuid;
  anchor public.coach_supervised_initial_bases%ROWTYPE; plan public.training_plan_versions%ROWTYPE;
BEGIN
  IF p_request->>'operation' IS DISTINCT FROM 'accept' THEN
    RETURN public.first_review_request_resolution_result_before_acceptance(p_request,p_close); END IF;
  IF p_close IS NULL THEN RAISE EXCEPTION 'Invalid acceptance recovery mode' USING ERRCODE='22023'; END IF;
  identity:=public.first_review_accept_request_identity(p_request);
  envelope:=jsonb_build_object('schemaVersion',1,'request',p_request);
  IF p_close THEN
    result:=public.resolve_reviewed_proposal_request((body->>'programId')::uuid,'accept',body->>'requestId',identity);
    IF result->>'disposition'='saved' THEN
      -- Closure recovery certifies the same immutable first proof as the pure getter.
      RETURN public.first_review_request_resolution_result(p_request,false); END IF;
    IF result->>'disposition' IS DISTINCT FROM 'closed' THEN
      RAISE EXCEPTION 'Unexpected first acceptance closure result' USING ERRCODE='55000'; END IF;
    RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',result->'resolutionId','resolvedAt',result->'resolvedAt');
  END IF;
  SELECT * INTO a FROM public.adaptation_proposals WHERE id=(identity->>'proposalId')::uuid AND user_id=auth.uid();
  SELECT active_plan_version_id INTO active FROM public.training_programs WHERE id=a.program_id AND user_id=a.user_id;
  IF a.status='accepted' THEN
    SELECT * INTO proof FROM public.coach_first_review_acceptances WHERE proposal_id=a.id AND registration_id=(body->>'candidateId')::uuid
      AND user_id=a.user_id AND program_id=a.program_id AND plan_version_id=a.proposed_plan_version_id AND request_id=a.idempotency_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'Saved first acceptance proof unavailable' USING ERRCODE='55000'; END IF;
    SELECT * INTO plan FROM public.training_plan_versions WHERE id=proof.plan_version_id AND program_id=proof.program_id AND user_id=proof.user_id;
    SELECT * INTO anchor FROM public.coach_supervised_initial_bases WHERE program_id=proof.program_id AND plan_version_id=proof.plan_version_id;
    IF plan.id IS NULL OR plan.status NOT IN ('accepted','superseded') OR anchor.program_id IS NULL
      OR anchor.user_id IS DISTINCT FROM proof.user_id OR anchor.operator_ref IS DISTINCT FROM 'first-reviewed:'||proof.registration_id::text
      OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=proof.program_id AND user_id=proof.user_id)
      OR anchor.plan_snapshot IS DISTINCT FROM to_jsonb(plan)-'status'
      OR anchor.execution_manifest IS DISTINCT FROM public.supervised_static_execution(proof.user_id,proof.program_id,proof.plan_version_id) THEN
      RAISE EXCEPTION 'Saved first acceptance proof unavailable' USING ERRCODE='55000'; END IF;
    RETURN envelope||jsonb_build_object('disposition','saved','result',jsonb_build_object('proposalId',a.id,'planVersionId',a.proposed_plan_version_id,'activePlanVersionId',active));
  END IF;
  SELECT * INTO closed FROM public.coach_reviewed_proposal_resolutions WHERE user_id=a.user_id AND operation='accept' AND request_id=body->>'requestId';
  IF FOUND THEN
    IF closed.identity IS DISTINCT FROM identity OR closed.program_id IS DISTINCT FROM a.program_id THEN
      RAISE EXCEPTION 'First acceptance closure conflicts' USING ERRCODE='22023'; END IF;
    RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',closed.id,'resolvedAt',closed.created_at);
  END IF;
  RETURN envelope||jsonb_build_object('disposition','not_found');
END $$;
CREATE OR REPLACE FUNCTION public.get_first_review_request_resolution(p_request jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.first_review_request_resolution_result(p_request,false) $$;
CREATE OR REPLACE FUNCTION public.resolve_first_review_request(p_request jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.first_review_request_resolution_result(p_request,true) $$;

CREATE FUNCTION public.accept_first_reviewed_week(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE result jsonb;
BEGIN
  result:=public.first_review_request_resolution_result(p_request,false);
  IF result->>'disposition'='saved' THEN RETURN result->'result'; END IF;
  IF result->>'disposition'='no_write' THEN RAISE EXCEPTION 'First acceptance request is closed' USING ERRCODE='55000'; END IF;
  PERFORM public.accept_adaptation_proposal((p_request#>>'{body,proposalId}')::uuid,p_request#>>'{body,requestId}');
  result:=public.first_review_request_resolution_result(p_request,false);
  IF result->>'disposition' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Exact first acceptance receipt unavailable' USING ERRCODE='55000'; END IF;
  RETURN result->'result';
END $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('is_first_review_packet','assert_first_review_approval','assert_first_review_acceptance_transaction',
      'assert_reviewed_week_transition','assert_reviewed_week_transition_before_first_review','assert_reviewed_execution_continuity','assert_reviewed_execution_continuity_before_first_review',
      'assert_supervised_registration_link','assert_supervised_registration_link_before_first_review','assert_reviewed_registration_current','assert_reviewed_registration_current_before_first_review',
      'guard_first_review_registration','register_reviewed_week_proposal','register_reviewed_week_proposal_before_first_review',
      'create_registered_reviewed_week_proposal','create_registered_reviewed_week_proposal_before_first_review','guard_first_review_rows','check_first_review_committed',
      'accept_adaptation_proposal','accept_adaptation_proposal_before_first_review','guard_first_review_acceptance_proof',
      'first_review_accept_request_identity','first_review_request_resolution_result','first_review_request_resolution_result_before_acceptance',
      'get_first_review_request_resolution','resolve_first_review_request','accept_first_reviewed_week') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
    IF f.proname='register_reviewed_week_proposal' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
    ELSIF f.proname IN ('create_registered_reviewed_week_proposal','accept_adaptation_proposal','accept_first_reviewed_week','get_first_review_request_resolution','resolve_first_review_request') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF;
  END LOOP;
END $$;
COMMIT;
