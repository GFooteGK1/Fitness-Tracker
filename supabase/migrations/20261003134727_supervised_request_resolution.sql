-- Deliberate closure is separate from receipt-only recovery. Never apply a
-- no-write conclusion from an absent receipt in a separate transaction.
BEGIN;
CREATE TABLE public.coach_supervised_request_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  program_id uuid NOT NULL REFERENCES public.coach_supervised_programs(program_id),
  operation text NOT NULL CHECK(operation IN ('submit','decide')),
  request_id uuid NOT NULL,
  request jsonb NOT NULL CHECK(jsonb_typeof(request)='object' AND octet_length(request::text)<=600000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_id,operation,request_id)
);
ALTER TABLE public.coach_supervised_request_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_supervised_request_resolutions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_supervised_request_resolutions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_supervised_resolution BEFORE UPDATE OR DELETE ON public.coach_supervised_request_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();

-- Decision writer and resolver both take program before request/candidate.
-- Revoke the renamed implementation so authenticated callers cannot bypass it.
ALTER FUNCTION public.decide_supervised_candidate(uuid,uuid,text,text,text,uuid) RENAME TO decide_supervised_candidate_before_resolution;
REVOKE ALL ON FUNCTION public.decide_supervised_candidate_before_resolution(uuid,uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.decide_supervised_candidate(p_id uuid,p_request_id uuid,p_decision text,p_content_hash text,p_source_hash text,p_enrollment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE c public.coach_supervised_candidates%ROWTYPE; e public.coach_supervised_enrollments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=p_id;
  SELECT * INTO e FROM public.coach_supervised_enrollments WHERE id=c.enrollment_id;
  IF e.reviewer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Review candidate unavailable' USING ERRCODE='P0002'; END IF;
  PERFORM public.lock_supervised_program(c.program_id,c.user_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supervised-decision:'||auth.uid()::text||':'||p_request_id::text,0));
  IF EXISTS(SELECT 1 FROM public.coach_supervised_request_resolutions WHERE actor_id=auth.uid() AND operation='decide' AND request_id=p_request_id) THEN
    RAISE EXCEPTION 'Supervised request is closed' USING ERRCODE='55000'; END IF;
  RETURN public.decide_supervised_candidate_before_resolution(p_id,p_request_id,p_decision,p_content_hash,p_source_hash,p_enrollment_id);
END $$;
REVOKE ALL ON FUNCTION public.decide_supervised_candidate(uuid,uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decide_supervised_candidate(uuid,uuid,text,text,text,uuid) TO authenticated;

-- Insert guards also cover privileged alternate inserts. Try-locks avoid
-- waiting with an already-held row or operation lock in an inverse order.
CREATE FUNCTION public.guard_closed_supervised_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid; program uuid; operation text; request uuid; c public.coach_supervised_candidates%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='coach_supervised_candidates' THEN
    actor:=NEW.user_id; program:=NEW.program_id; operation:='submit'; request:=NEW.id;
  ELSE
    SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=NEW.candidate_id;
    actor:=NEW.reviewer_id; program:=c.program_id; operation:='decide'; request:=NEW.request_id;
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('supervised-program:'||program::text,0))
    OR NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(CASE WHEN operation='submit' THEN 'supervised-candidate:'||request::text
      ELSE 'supervised-decision:'||actor::text||':'||request::text END,0)) THEN
    RAISE EXCEPTION 'Supervised request resolution is busy' USING ERRCODE='55P03'; END IF;
  IF EXISTS(SELECT 1 FROM public.coach_supervised_request_resolutions r WHERE r.actor_id=actor AND r.operation=operation AND r.request_id=request) THEN
    RAISE EXCEPTION 'Supervised request is closed' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_supervised_request() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_closed_supervised_request BEFORE INSERT ON public.coach_supervised_candidates
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_supervised_request();
CREATE TRIGGER guard_closed_supervised_request BEFORE INSERT ON public.coach_supervised_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_supervised_request();

CREATE FUNCTION public.supervised_request_resolution_result(p_request jsonb,p_close boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); program uuid; operation text; body jsonb; draft jsonb; candidate_id uuid; request_id uuid;
  e public.coach_supervised_enrollments%ROWTYPE; c public.coach_supervised_candidates%ROWTYPE; d public.coach_supervised_decisions%ROWTYPE;
  r public.coach_supervised_request_resolutions%ROWTYPE; issued jsonb; envelope jsonb; identity jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>600000
    OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>5 OR NOT(p_request ?& ARRAY['schemaVersion','userId','programId','operation','body'])
    OR p_request->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR p_request->>'userId' IS DISTINCT FROM actor::text
    OR jsonb_typeof(p_request->'body') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid supervised request' USING ERRCODE='22023'; END IF;
  body:=p_request->'body'; operation:=p_request->>'operation'; program:=(p_request->>'programId')::uuid;
  IF body->>'expectedUserId' IS DISTINCT FROM actor::text OR operation IS NULL OR operation NOT IN ('submit','decide','issue') THEN
    RAISE EXCEPTION 'Invalid supervised request actor or operation' USING ERRCODE='22023'; END IF;
  IF operation='submit' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(body))<>2 OR NOT(body ?& ARRAY['expectedUserId','draft']) OR jsonb_typeof(body->'draft') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid candidate request' USING ERRCODE='22023'; END IF;
    draft:=body->'draft'; candidate_id:=(draft->>'candidateId')::uuid; request_id:=candidate_id;
    SELECT * INTO e FROM public.coach_supervised_enrollments WHERE id=(draft->>'enrollmentId')::uuid AND user_id=actor AND program_id=program;
    IF NOT FOUND OR draft->>'programId' IS DISTINCT FROM program::text THEN RAISE EXCEPTION 'Owned enrollment unavailable' USING ERRCODE='P0002'; END IF;
  ELSE
    candidate_id:=(body->>'candidateId')::uuid; request_id:=(body->>'requestId')::uuid;
    SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=candidate_id AND program_id=program;
    IF NOT FOUND THEN RAISE EXCEPTION 'Candidate unavailable' USING ERRCODE='P0002'; END IF;
    SELECT * INTO e FROM public.coach_supervised_enrollments WHERE id=c.enrollment_id;
    IF operation='decide' THEN
      IF e.reviewer_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Decision unavailable' USING ERRCODE='P0002'; END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(body))<>7 OR NOT(body ?& ARRAY['expectedUserId','candidateId','requestId','decision','enrollmentId','contentHash','sourceHash'])
        OR body->>'decision' IS NULL OR body->>'decision' NOT IN ('approve','reject') OR body->>'enrollmentId' IS DISTINCT FROM c.enrollment_id::text
        OR body->>'contentHash' IS DISTINCT FROM c.content_hash OR body->>'sourceHash' IS DISTINCT FROM c.source_hash THEN
        RAISE EXCEPTION 'Decision does not bind candidate' USING ERRCODE='22023'; END IF;
    ELSE
      IF c.user_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Owned candidate unavailable' USING ERRCODE='P0002'; END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(body))<>4 OR NOT(body ?& ARRAY['expectedUserId','programId','candidateId','requestId'])
        OR body->>'programId' IS DISTINCT FROM program::text THEN RAISE EXCEPTION 'Invalid issue request' USING ERRCODE='22023'; END IF;
    END IF;
  END IF;
  IF candidate_id IS NULL OR request_id IS NULL OR program IS NULL THEN RAISE EXCEPTION 'Missing request identity' USING ERRCODE='22023'; END IF;
  envelope:=jsonb_build_object('schemaVersion',1,'request',p_request);
  IF p_close THEN
    PERFORM public.lock_supervised_program(program,e.user_id);
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(CASE WHEN operation='decide' THEN 'supervised-decision:'||actor::text||':'||request_id::text
      ELSE 'supervised-candidate:'||candidate_id::text END,0));
  END IF;
  IF operation='issue' THEN
    identity:=jsonb_build_object('reviewId',candidate_id,'registrationId',candidate_id);
    IF p_close THEN
      issued:=public.resolve_reviewed_proposal_request(program,'issue',request_id::text,identity);
    ELSE
      SELECT jsonb_build_object('disposition','closed','resolutionId',x.id,'resolvedAt',x.created_at) INTO issued
        FROM public.coach_reviewed_proposal_resolutions x WHERE x.user_id=actor AND x.operation='issue' AND x.request_id=request_id::text
        AND x.program_id=program AND x.identity=identity;
      IF issued IS NULL THEN
        issued:=public.get_supervised_lifecycle_receipt(program,'issue',request_id::text,identity);
        IF issued->>'disposition'='saved' THEN RETURN envelope||jsonb_build_object('disposition','saved','result',jsonb_build_object('kind','issued','request',body)||(issued->'result')); END IF;
        RETURN envelope||jsonb_build_object('disposition','not_found');
      END IF;
    END IF;
    IF issued->>'disposition'='saved' THEN RETURN envelope||jsonb_build_object('disposition','saved','result',jsonb_build_object('kind','issued','request',body,
      'proposalId',issued->'proposalId','planVersionId',issued->'planVersionId','programId',program,'replayed',true)); END IF;
    RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',issued->'resolutionId','resolvedAt',issued->'resolvedAt');
  END IF;
  SELECT * INTO r FROM public.coach_supervised_request_resolutions x WHERE x.actor_id=actor AND x.operation=operation AND x.request_id=request_id;
  IF FOUND THEN
    IF r.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'Original request changed' USING ERRCODE='22023'; END IF;
    RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',r.id,'resolvedAt',r.created_at);
  END IF;
  IF operation='submit' THEN
    SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=candidate_id;
    IF FOUND THEN
      IF c.user_id IS DISTINCT FROM actor OR c.program_id IS DISTINCT FROM program OR c.enrollment_id IS DISTINCT FROM e.id
        OR c.private_packet#>'{inputSnapshot,supervisedCandidateDraft}' IS DISTINCT FROM draft THEN RAISE EXCEPTION 'Saved candidate conflicts with request' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',jsonb_build_object('kind','candidate','candidate',public.supervised_candidate_json(c.id)));
    END IF;
  ELSE
    SELECT * INTO d FROM public.coach_supervised_decisions x WHERE x.reviewer_id=actor AND x.request_id=request_id;
    IF FOUND THEN
      IF d.candidate_id IS DISTINCT FROM candidate_id OR d.enrollment_id IS DISTINCT FROM e.id OR d.decision IS DISTINCT FROM body->>'decision'
        OR d.content_hash IS DISTINCT FROM body->>'contentHash' OR d.source_hash IS DISTINCT FROM body->>'sourceHash' THEN
        RAISE EXCEPTION 'Saved decision conflicts with request' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',jsonb_build_object('kind','decided','receipt',public.supervised_decision_json(d.id,true)));
    END IF;
  END IF;
  IF NOT p_close THEN RETURN envelope||jsonb_build_object('disposition','not_found'); END IF;
  INSERT INTO public.coach_supervised_request_resolutions(actor_id,program_id,operation,request_id,request)
    VALUES(actor,program,operation,request_id,p_request) RETURNING * INTO r;
  RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',r.id,'resolvedAt',r.created_at);
END $$;
REVOKE ALL ON FUNCTION public.supervised_request_resolution_result(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.resolve_supervised_request(p_request jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.supervised_request_resolution_result(p_request,true)
$$;
CREATE FUNCTION public.get_supervised_request_resolution(p_request jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.supervised_request_resolution_result(p_request,false)
$$;
REVOKE ALL ON FUNCTION public.resolve_supervised_request(jsonb),public.get_supervised_request_resolution(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_supervised_request(jsonb),public.get_supervised_request_resolution(jsonb) TO authenticated;
COMMIT;
