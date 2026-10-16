-- Resolve exact owned session requests without deleting evidence or allowing
-- a delayed original attempt to commit after a no-write resolution.
BEGIN;
CREATE TABLE public.coach_reviewed_request_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.prescribed_sessions(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK(operation IN ('set','complete')),
  request_id text NOT NULL CHECK(length(request_id) BETWEEN 8 AND 200),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=120000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(user_id,operation,request_id)
);
ALTER TABLE public.coach_reviewed_request_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_reviewed_request_resolutions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_reviewed_request_resolutions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_reviewed_request_resolution BEFORE UPDATE ON public.coach_reviewed_request_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.protect_reviewed_proposal_registration();

CREATE FUNCTION public.guard_resolved_reviewed_session_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request_id text; v_operation text;
BEGIN
  IF TG_TABLE_NAME='coach_reviewed_set_reports' THEN
    v_operation:='set'; v_request_id:=NEW.request_id;
  ELSIF NEW.payload->>'kind'='reviewed_session_completion' THEN
    v_operation:='complete'; v_request_id:=substr(NEW.request_key,length('reviewed-completion:')+1);
  ELSE RETURN NEW;
  END IF;
  -- Writers already hold the same operation locks as the resolver. Raising here
  -- rolls back the entire transaction, including any tentative workout inserts.
  IF EXISTS(SELECT 1 FROM public.coach_reviewed_request_resolutions r
      WHERE r.user_id=NEW.user_id AND r.operation=v_operation AND r.request_id=v_request_id) THEN
    RAISE EXCEPTION 'Reviewed request was resolved without a write' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_resolved_reviewed_session_request() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_resolved_reviewed_set BEFORE INSERT ON public.coach_reviewed_set_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_resolved_reviewed_session_request();
CREATE TRIGGER guard_resolved_reviewed_completion BEFORE INSERT ON public.activity_mutations
  FOR EACH ROW EXECUTE FUNCTION public.guard_resolved_reviewed_session_request();

CREATE FUNCTION public.resolve_reviewed_session_request(p_session_id uuid,p_operation text,p_request_id text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE owner uuid:=auth.uid(); session public.prescribed_sessions%ROWTYPE;
  saved_set public.coach_reviewed_set_reports%ROWTYPE; saved_completion public.activity_mutations%ROWTYPE;
  resolution public.coach_reviewed_request_resolutions%ROWTYPE; envelope jsonb;
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('set','complete') OR p_request_id IS NULL
    OR p_request_id<>btrim(p_request_id) OR length(p_request_id) NOT BETWEEN 8 AND (CASE WHEN p_operation='complete' THEN 175 ELSE 200 END)
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>120000 THEN
    RAISE EXCEPTION 'Invalid reviewed resolution request' USING ERRCODE='22023'; END IF;
  -- Match the existing writers' lock ordering, including their session row lock.
  IF p_operation='complete' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('capture-owner:'||owner::text,0));
  END IF;
  SELECT * INTO session FROM public.prescribed_sessions WHERE id=p_session_id AND user_id=owner FOR UPDATE;
  IF NOT FOUND OR session.prescription->>'format' IS DISTINCT FROM 'reviewed_programming_v0_1' THEN
    RAISE EXCEPTION 'Owned reviewed session unavailable' USING ERRCODE='P0002'; END IF;
  IF p_operation='set' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':reviewed-set:'||p_request_id,0));
  END IF;
  envelope:=jsonb_build_object('schemaVersion',1,'userId',owner,'sessionId',p_session_id,
    'operation',p_operation,'requestId',p_request_id,'payload',p_payload);
  IF p_operation='set' THEN
    SELECT * INTO saved_set FROM public.coach_reviewed_set_reports WHERE user_id=owner AND request_id=p_request_id;
    IF FOUND THEN
      IF saved_set.prescribed_session_id<>p_session_id OR saved_set.report IS DISTINCT FROM p_payload THEN
        RAISE EXCEPTION 'Resolution conflicts with saved request' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',
        jsonb_build_object('id',saved_set.id,'created_at',saved_set.created_at,'replayed',true));
    END IF;
  ELSE
    SELECT * INTO saved_completion FROM public.activity_mutations WHERE user_id=owner AND request_key='reviewed-completion:'||p_request_id;
    IF FOUND THEN
      IF saved_completion.payload-'checkinId'-'response' IS DISTINCT FROM
          jsonb_build_object('kind','reviewed_session_completion','sessionId',p_session_id,'request',p_payload)
        OR saved_completion.receipt IS NULL THEN
        RAISE EXCEPTION 'Resolution conflicts with saved request' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',jsonb_set(saved_completion.receipt,'{result,replayed}','true'));
    END IF;
  END IF;
  SELECT * INTO resolution FROM public.coach_reviewed_request_resolutions
    WHERE user_id=owner AND operation=p_operation AND request_id=p_request_id;
  IF FOUND THEN
    IF resolution.session_id<>p_session_id OR resolution.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Resolution conflicts with saved request' USING ERRCODE='22023'; END IF;
  ELSE
    INSERT INTO public.coach_reviewed_request_resolutions(user_id,session_id,operation,request_id,payload)
      VALUES(owner,p_session_id,p_operation,p_request_id,p_payload) RETURNING * INTO resolution;
  END IF;
  RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',resolution.id,'resolvedAt',resolution.created_at);
END $$;
REVOKE ALL ON FUNCTION public.resolve_reviewed_session_request(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_reviewed_session_request(uuid,text,text,jsonb) TO authenticated;
COMMIT;
