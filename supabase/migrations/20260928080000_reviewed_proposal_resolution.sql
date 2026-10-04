-- Exact owned recovery or permanent closure, without deleting reviewed evidence.
BEGIN;
CREATE TABLE public.coach_reviewed_proposal_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK(operation IN ('issue','accept')),
  request_id text NOT NULL CHECK(length(request_id) BETWEEN 8 AND 200),
  identity jsonb NOT NULL CHECK(jsonb_typeof(identity)='object' AND octet_length(identity::text)<=2000),
  registration_id uuid,
  proposal_id uuid REFERENCES public.adaptation_proposals(id) ON DELETE CASCADE,
  plan_version_id uuid REFERENCES public.training_plan_versions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(user_id,operation,request_id),
  UNIQUE(user_id,registration_id),
  CHECK((operation='issue' AND registration_id IS NOT NULL AND proposal_id IS NULL AND plan_version_id IS NULL)
    OR (operation='accept' AND registration_id IS NULL AND proposal_id IS NOT NULL AND plan_version_id IS NOT NULL))
);
ALTER TABLE public.coach_reviewed_proposal_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_reviewed_proposal_resolutions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_reviewed_proposal_resolutions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_reviewed_proposal_resolution BEFORE UPDATE ON public.coach_reviewed_proposal_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.protect_reviewed_proposal_registration();

CREATE FUNCTION public.guard_closed_reviewed_proposal_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_registration_id uuid;
BEGIN
  IF TG_TABLE_NAME='coach_reviewed_proposal_registrations' THEN
    -- register_reviewed_week_proposal already owns this global ID lock.
    IF EXISTS(SELECT 1 FROM public.coach_reviewed_proposal_resolutions r WHERE r.user_id=NEW.user_id AND r.registration_id=NEW.id) THEN
      RAISE EXCEPTION 'Reviewed proposal request is closed' USING ERRCODE='55000'; END IF;
  ELSIF TG_OP='INSERT' AND NEW.rationale->>'proposal_mode'='reviewed_rolling_week' THEN
    v_registration_id:=(NEW.rationale->>'reviewedRegistrationId')::uuid;
    -- Issuance holds the request key and program before this trigger. Never
    -- wait on a resolver holding registration then waiting for this program.
    IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('reviewed-registration:'||v_registration_id::text,0)) THEN
      RAISE EXCEPTION 'Reviewed registration resolution is in progress' USING ERRCODE='55P03'; END IF;
    IF EXISTS(SELECT 1 FROM public.coach_reviewed_proposal_resolutions r WHERE r.user_id=NEW.user_id AND r.operation='issue'
      AND (r.request_id=NEW.idempotency_key OR r.registration_id=v_registration_id)) THEN
      RAISE EXCEPTION 'Reviewed proposal request is closed' USING ERRCODE='55000'; END IF;
  ELSIF TG_OP='UPDATE' AND NEW.status='accepted' THEN
    IF EXISTS(SELECT 1 FROM public.coach_reviewed_proposal_resolutions r WHERE r.user_id=NEW.user_id AND r.operation='accept' AND r.proposal_id=NEW.id) THEN
      RAISE EXCEPTION 'Reviewed acceptance request is closed' USING ERRCODE='55000'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_reviewed_proposal_request() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_closed_reviewed_registration BEFORE INSERT ON public.coach_reviewed_proposal_registrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_reviewed_proposal_request();
CREATE TRIGGER guard_closed_reviewed_proposal BEFORE INSERT OR UPDATE ON public.adaptation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_reviewed_proposal_request();

CREATE FUNCTION public.resolve_reviewed_proposal_request(p_program_id uuid,p_operation text,p_request_id text,p_identity jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE owner uuid:=auth.uid(); v_registration_id uuid; v_proposal_id uuid; v_plan_id uuid;
  registration public.coach_reviewed_proposal_registrations%ROWTYPE;
  proposal public.adaptation_proposals%ROWTYPE; program public.training_programs%ROWTYPE;
  plan public.training_plan_versions%ROWTYPE; resolution public.coach_reviewed_proposal_resolutions%ROWTYPE; envelope jsonb;
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('issue','accept') OR p_request_id IS NULL
    OR p_request_id<>btrim(p_request_id) OR length(p_request_id) NOT BETWEEN 8 AND 200
    OR jsonb_typeof(p_identity) IS DISTINCT FROM 'object' OR octet_length(p_identity::text)>2000 THEN
    RAISE EXCEPTION 'Invalid reviewed proposal resolution' USING ERRCODE='22023'; END IF;
  -- Authorize target before acquiring identity locks or exposing any metadata.
  PERFORM 1 FROM public.training_programs WHERE id=p_program_id AND user_id=owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owned program unavailable' USING ERRCODE='P0002'; END IF;
  IF p_operation='issue' THEN
    IF NOT (p_identity ?& ARRAY['reviewId','registrationId']) OR (SELECT count(*) FROM jsonb_object_keys(p_identity))<>2
      OR jsonb_typeof(p_identity->'reviewId') IS DISTINCT FROM 'string' OR length(p_identity->>'reviewId') NOT BETWEEN 1 AND 200
      OR jsonb_typeof(p_identity->'registrationId') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Invalid issue resolution identity' USING ERRCODE='22023'; END IF;
    v_registration_id:=(p_identity->>'registrationId')::uuid;
    IF v_registration_id IS NULL OR v_registration_id::text IS DISTINCT FROM p_identity->>'registrationId' THEN
      RAISE EXCEPTION 'Invalid registration identity' USING ERRCODE='22023'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('reviewed-registration:'||v_registration_id::text,0));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':rolling-week-proposal:'||p_request_id,0));
    SELECT * INTO registration FROM public.coach_reviewed_proposal_registrations WHERE id=v_registration_id;
    IF FOUND AND (registration.user_id IS DISTINCT FROM owner OR registration.packet->>'registrationId' IS DISTINCT FROM p_identity->>'reviewId'
      OR registration.packet#>>'{source,binding,scope,programId}' IS DISTINCT FROM p_program_id::text) THEN
      RAISE EXCEPTION 'Resolution conflicts with reviewed registration' USING ERRCODE='22023'; END IF;
    SELECT * INTO proposal FROM public.adaptation_proposals WHERE user_id=owner AND idempotency_key=p_request_id FOR UPDATE;
    IF FOUND AND (registration.id IS NULL OR proposal.id IS DISTINCT FROM registration.proposal_id
      OR proposal.proposed_plan_version_id IS DISTINCT FROM registration.plan_version_id OR proposal.program_id IS DISTINCT FROM p_program_id) THEN
      RAISE EXCEPTION 'Resolution conflicts with issued proposal' USING ERRCODE='22023'; END IF;
    IF proposal.id IS NULL AND registration.id IS NOT NULL AND EXISTS(SELECT 1 FROM public.adaptation_proposals WHERE id=registration.proposal_id) THEN
      RAISE EXCEPTION 'Registration was issued with another request key' USING ERRCODE='22023'; END IF;
  ELSE
    IF NOT (p_identity ?& ARRAY['proposalId','planVersionId']) OR (SELECT count(*) FROM jsonb_object_keys(p_identity))<>2
      OR jsonb_typeof(p_identity->'proposalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_identity->'planVersionId') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Invalid acceptance resolution identity' USING ERRCODE='22023'; END IF;
    v_proposal_id:=(p_identity->>'proposalId')::uuid; v_plan_id:=(p_identity->>'planVersionId')::uuid;
    IF v_proposal_id IS NULL OR v_plan_id IS NULL OR v_proposal_id::text IS DISTINCT FROM p_identity->>'proposalId'
      OR v_plan_id::text IS DISTINCT FROM p_identity->>'planVersionId' THEN
      RAISE EXCEPTION 'Invalid proposal identity' USING ERRCODE='22023'; END IF;
    -- Identical order to accept_adaptation_proposal: proposal then program/plan.
    SELECT * INTO proposal FROM public.adaptation_proposals WHERE id=v_proposal_id AND user_id=owner FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Owned proposal unavailable' USING ERRCODE='P0002'; END IF;
    IF proposal.program_id IS DISTINCT FROM p_program_id OR proposal.proposed_plan_version_id IS DISTINCT FROM v_plan_id
      OR proposal.idempotency_key IS DISTINCT FROM p_request_id OR proposal.rationale->>'proposal_mode' IS DISTINCT FROM 'reviewed_rolling_week' THEN
      RAISE EXCEPTION 'Resolution conflicts with reviewed acceptance' USING ERRCODE='22023'; END IF;
    SELECT * INTO registration FROM public.coach_reviewed_proposal_registrations WHERE proposal_id=proposal.id AND user_id=owner;
    IF NOT FOUND OR registration.plan_version_id IS DISTINCT FROM v_plan_id OR registration.id::text IS DISTINCT FROM proposal.rationale->>'reviewedRegistrationId' THEN
      RAISE EXCEPTION 'Reviewed acceptance registration unavailable' USING ERRCODE='55000'; END IF;
  END IF;
  SELECT * INTO program FROM public.training_programs WHERE id=p_program_id AND user_id=owner FOR UPDATE;
  IF NOT FOUND OR program.program_mode IS DISTINCT FROM 'rolling_weekly' THEN
    RAISE EXCEPTION 'Owned rolling program unavailable' USING ERRCODE='P0002'; END IF;
  envelope:=jsonb_build_object('schemaVersion',1,'userId',owner,'programId',p_program_id,'operation',p_operation,'requestId',p_request_id,'identity',p_identity);
  SELECT * INTO resolution FROM public.coach_reviewed_proposal_resolutions r
    WHERE r.user_id=owner AND r.operation=p_operation AND r.request_id=p_request_id;
  IF FOUND THEN
    IF resolution.program_id IS DISTINCT FROM p_program_id OR resolution.identity IS DISTINCT FROM p_identity THEN
      RAISE EXCEPTION 'Resolution identity changed' USING ERRCODE='22023'; END IF;
  ELSE
    IF p_operation='issue' AND proposal.id IS NOT NULL THEN
      RETURN envelope||jsonb_build_object('disposition','saved','proposalId',proposal.id,'planVersionId',proposal.proposed_plan_version_id,
        'activePlanVersionId',program.active_plan_version_id);
    END IF;
    IF p_operation='accept' THEN
      SELECT * INTO plan FROM public.training_plan_versions WHERE id=v_plan_id AND user_id=owner AND program_id=p_program_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed plan unavailable' USING ERRCODE='55000'; END IF;
      IF proposal.status='accepted' AND plan.status IN ('accepted','superseded') THEN
        RETURN envelope||jsonb_build_object('disposition','saved','proposalId',proposal.id,'planVersionId',plan.id,
          'activePlanVersionId',program.active_plan_version_id);
      END IF;
      IF proposal.status NOT IN ('proposed','rejected','expired') OR plan.status NOT IN ('proposed','rejected')
        OR program.active_plan_version_id=plan.id THEN RAISE EXCEPTION 'Proposal cannot be closed safely' USING ERRCODE='55000'; END IF;
      -- Preserve rationale, prescription, slots and any original evidence.
      IF proposal.status<>'rejected' THEN
        UPDATE public.adaptation_proposals SET status='rejected',decided_at=clock_timestamp() WHERE id=proposal.id;
      END IF;
      IF plan.status='proposed' THEN UPDATE public.training_plan_versions SET status='rejected' WHERE id=plan.id; END IF;
    END IF;
    INSERT INTO public.coach_reviewed_proposal_resolutions(user_id,program_id,operation,request_id,identity,registration_id,proposal_id,plan_version_id)
      VALUES(owner,p_program_id,p_operation,p_request_id,p_identity,
        CASE WHEN p_operation='issue' THEN v_registration_id END,CASE WHEN p_operation='accept' THEN proposal.id END,
        CASE WHEN p_operation='accept' THEN plan.id END) RETURNING * INTO resolution;
  END IF;
  RETURN envelope||jsonb_build_object('disposition','closed','resolutionId',resolution.id,'resolvedAt',resolution.created_at,
    'proposalId',resolution.proposal_id,'planVersionId',resolution.plan_version_id);
END $$;
REVOKE ALL ON FUNCTION public.resolve_reviewed_proposal_request(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_reviewed_proposal_request(uuid,text,text,jsonb) TO authenticated;
COMMIT;
