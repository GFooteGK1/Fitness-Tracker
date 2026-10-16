-- DRAFT additive release package. Not installed on a hosted database.
-- Prerequisite: capture_receipts migration. Generate a release migration with
-- the Supabase CLI after local qualification; no CLI is installed on this host.
BEGIN;
CREATE TABLE IF NOT EXISTS public.camera_photo_devices (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 consent_policy text NOT NULL CHECK(consent_policy='camera-cloud-v1'),
 admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '90 days',
 revoked_at timestamptz,
 UNIQUE(id,user_id)
);
CREATE INDEX IF NOT EXISTS camera_photo_devices_owner ON public.camera_photo_devices(user_id);
CREATE TABLE IF NOT EXISTS public.camera_photo_requests (
 id uuid PRIMARY KEY, device_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 captured_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','complete')),
 outcome text CHECK(outcome IN ('draft','non_food','review_required','failed')),
 draft_id uuid REFERENCES public.activity_drafts(id),
 FOREIGN KEY(device_id,user_id) REFERENCES public.camera_photo_devices(id,user_id) ON DELETE CASCADE,
 UNIQUE(device_id,content_hash)
);
CREATE INDEX IF NOT EXISTS camera_photo_requests_owner ON public.camera_photo_requests(user_id);
ALTER TABLE public.camera_photo_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_photo_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.camera_photo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_photo_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS camera_devices_owner ON public.camera_photo_devices;
CREATE POLICY camera_devices_owner ON public.camera_photo_devices FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS camera_requests_owner ON public.camera_photo_requests;
CREATE POLICY camera_requests_owner ON public.camera_photo_requests FOR SELECT TO authenticated USING(user_id=auth.uid());
-- All table access is through bounded RPCs. Even owners cannot read token hashes.
REVOKE ALL ON public.camera_photo_devices,public.camera_photo_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.camera_photo_device_control(
 p_action text,p_id uuid DEFAULT NULL,p_hash text DEFAULT NULL,p_policy text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); d public.camera_photo_devices;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('camera-devices:'||u::text,0));
 IF p_action='create' THEN
  IF p_id IS NULL OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_policy IS DISTINCT FROM 'camera-cloud-v1' THEN RAISE EXCEPTION 'Consent required' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.camera_photo_devices WHERE user_id=u AND revoked_at IS NULL AND expires_at>clock_timestamp())>=5
   OR (SELECT count(*) FROM public.camera_photo_devices WHERE user_id=u AND admitted_at>clock_timestamp()-interval '1 day')>=10 THEN RAISE EXCEPTION 'Device limit reached' USING ERRCODE='54000'; END IF;
  INSERT INTO public.camera_photo_devices(id,user_id,token_hash,consent_policy) VALUES(p_id,u,p_hash,p_policy) RETURNING * INTO d;
  RETURN jsonb_build_object('id',d.id,'admittedAt',d.admitted_at,'expiresAt',d.expires_at);
 ELSIF p_action='revoke_all' THEN
  UPDATE public.camera_photo_devices SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE user_id=u;
  RETURN jsonb_build_object('revoked',true);
 ELSIF p_action='revoke' THEN
  UPDATE public.camera_photo_devices SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_id AND user_id=u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown device' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('revoked',true);
 ELSIF p_action='list' THEN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'admittedAt',x.admitted_at,'expiresAt',x.expires_at,'revokedAt',x.revoked_at) ORDER BY x.admitted_at DESC)
   FROM (SELECT * FROM public.camera_photo_devices WHERE user_id=u ORDER BY admitted_at DESC LIMIT 50) x),'[]'::jsonb);
 END IF;
 RAISE EXCEPTION 'Invalid device action' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.camera_photo_device_control(text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.camera_photo_device_control(text,uuid,text,text) TO authenticated;

-- Only the server calls this RPC. Native tokens never become user JWTs or
-- gain permission to call generic capture/accept/correct RPCs.
CREATE OR REPLACE FUNCTION public.camera_photo_request(
 p_hash text,p_action text,p_id uuid DEFAULT NULL,p_content_hash text DEFAULT NULL,
 p_captured_at timestamptz DEFAULT NULL,p_outcome text DEFAULT NULL,p_operation jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.camera_photo_devices; r public.camera_photo_requests; draft public.activity_drafts; claimed boolean:=false;
BEGIN
 SELECT * INTO d FROM public.camera_photo_devices WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR d.revoked_at IS NOT NULL OR d.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Unauthorized device' USING ERRCODE='42501'; END IF;
 IF p_action='revoke' THEN
  UPDATE public.camera_photo_devices SET revoked_at=clock_timestamp() WHERE id=d.id;
  RETURN jsonb_build_object('revoked',true);
 END IF;
 IF p_action='check' THEN RETURN jsonb_build_object('deviceId',d.id,'admittedAt',d.admitted_at,'expiresAt',d.expires_at); END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.camera_photo_requests WHERE id=p_id AND device_id=d.id AND user_id=d.user_id FOR UPDATE;
 IF p_action='begin' THEN
  IF p_content_hash IS NULL OR p_content_hash !~ '^[a-f0-9]{64}$' OR p_captured_at IS NULL
    OR p_captured_at<d.admitted_at OR p_captured_at>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'Invalid photo admission' USING ERRCODE='22023'; END IF;
  IF r.id IS NOT NULL THEN
   IF r.content_hash IS DISTINCT FROM p_content_hash OR r.captured_at IS DISTINCT FROM p_captured_at THEN RAISE EXCEPTION 'Request input changed' USING ERRCODE='22023'; END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM public.camera_photo_requests WHERE device_id=d.id AND content_hash=p_content_hash)
    THEN RAISE EXCEPTION 'Photo already has a request' USING ERRCODE='22023'; END IF;
   IF (SELECT count(*) FROM public.camera_photo_requests WHERE device_id=d.id AND created_at>clock_timestamp()-interval '1 day')>=50 THEN RAISE EXCEPTION 'Daily limit reached' USING ERRCODE='54000'; END IF;
   INSERT INTO public.camera_photo_requests(id,device_id,user_id,content_hash,captured_at) VALUES(p_id,d.id,d.user_id,p_content_hash,p_captured_at) RETURNING * INTO r;
   claimed:=true;
  END IF;
 ELSIF p_action='status' THEN
  IF r.id IS NULL THEN RETURN jsonb_build_object('state','not_found'); END IF;
 ELSIF p_action='finish' THEN
  IF r.id IS NULL THEN RAISE EXCEPTION 'Unknown device request' USING ERRCODE='42501'; END IF;
  IF r.state='processing' THEN
   IF p_outcome IS NULL OR p_outcome NOT IN ('draft','non_food','review_required','failed') THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023'; END IF;
   IF p_outcome='draft' THEN
    PERFORM public.validate_capture_operation(p_operation);
    IF p_operation->>'kind' IS DISTINCT FROM 'meal' OR p_operation->>'inputMethod' IS DISTINCT FROM 'photo'
      OR (p_operation->>'eventAt')::timestamptz IS DISTINCT FROM r.captured_at
      OR p_operation#>>'{provenance,occurrence,reviewState}' IS DISTINCT FROM 'unreviewed'
      OR p_operation#>>'{record,photo_url}' IS NOT NULL THEN RAISE EXCEPTION 'Review-only photo draft required' USING ERRCODE='22023'; END IF;
    INSERT INTO public.activity_drafts(user_id,kind,normalized,provenance,input_method,event_at)
      VALUES(d.user_id,'meal',p_operation,p_operation->'provenance','photo',r.captured_at) RETURNING * INTO draft;
   ELSIF p_operation IS NOT NULL THEN RAISE EXCEPTION 'Unexpected draft' USING ERRCODE='22023'; END IF;
   UPDATE public.camera_photo_requests SET state='complete',outcome=p_outcome,draft_id=draft.id WHERE id=r.id RETURNING * INTO r;
  END IF;
 ELSE RAISE EXCEPTION 'Invalid device request action' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('requestId',r.id,'state',r.state,'outcome',r.outcome,'draftId',r.draft_id,'claimed',claimed,'canonicalChanged',false);
END $$;
REVOKE ALL ON FUNCTION public.camera_photo_request(text,text,uuid,text,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.camera_photo_request(text,text,uuid,text,timestamptz,text,jsonb) TO service_role;
COMMIT;
