-- PREPARED ONLY. No hosted installation, credential issuance or activation.
-- Prerequisite: capture_receipts. Separate approval must authorize new grants.
BEGIN;
CREATE TABLE IF NOT EXISTS public.external_estimate_devices (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 scope text NOT NULL CHECK(scope='external-estimate-v1'),
 admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 UNIQUE(id,user_id), CHECK(expires_at>admitted_at)
);
CREATE TABLE IF NOT EXISTS public.external_estimate_requests (
 id uuid PRIMARY KEY, device_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 payload jsonb NOT NULL, fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 draft_id uuid NOT NULL REFERENCES public.activity_drafts(id), receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(device_id,user_id) REFERENCES public.external_estimate_devices(id,user_id) ON DELETE CASCADE,
 UNIQUE(user_id,content_hash)
);
ALTER TABLE public.external_estimate_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_estimate_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_estimate_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_estimate_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_estimate_devices,public.external_estimate_requests FROM PUBLIC,anon,authenticated,service_role;

-- No issuer/pairing control is supplied. Existing camera credentials are neither
-- read nor modified. Only a separately approved provisioned grant can work.
CREATE OR REPLACE FUNCTION public.external_estimate_request(
 p_hash text,p_action text,p_id uuid DEFAULT NULL,p_payload jsonb DEFAULT NULL,p_fingerprint text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.external_estimate_devices; r public.external_estimate_requests; a public.activity_drafts;
 c jsonb; e jsonb; f jsonb; t jsonb; k text; n numeric; sums jsonb:='{"protein":0,"carbs":0,"fat":0,"calories":0}';
 limits jsonb:='{"protein":500,"carbs":1000,"fat":500,"calories":10000}';
 total_limits jsonb:='{"protein":1000,"carbs":2000,"fat":1000,"calories":20000}';
 pr jsonb; field jsonb; operation jsonb; captured timestamptz; estimated timestamptz; result jsonb;
BEGIN
 SELECT * INTO d FROM public.external_estimate_devices WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR d.scope<>'external-estimate-v1' OR d.revoked_at IS NOT NULL OR d.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'Unauthorized estimate import' USING ERRCODE='42501'; END IF;
 IF p_action='check' THEN RETURN jsonb_build_object('deviceId',d.id,'scope',d.scope); END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'Capture identity required' USING ERRCODE='22023'; END IF;
 -- Serialize across separate devices belonging to one owner and the same ID.
 PERFORM pg_advisory_xact_lock(hashtextextended('external-estimate:'||d.user_id::text,0));
 SELECT * INTO r FROM public.external_estimate_requests WHERE id=p_id AND device_id=d.id AND user_id=d.user_id;
 IF p_action='status' THEN
  IF r.id IS NULL THEN RETURN jsonb_build_object('requestId',p_id,'state','not_found','canonicalChanged',false); END IF;
  RETURN r.receipt;
 END IF;
 IF p_action IS DISTINCT FROM 'import' THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 IF r.id IS NOT NULL THEN
  IF r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Capture input changed' USING ERRCODE='22023'; END IF;
  RETURN r.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM public.external_estimate_requests WHERE id=p_id) THEN RAISE EXCEPTION 'Unavailable capture identity' USING ERRCODE='22023'; END IF;
 IF p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_payload IS NULL OR octet_length(p_payload::text)>65536
  OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload->'schemaVersion' IS DISTINCT FROM '1'::jsonb
  OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>3
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) x WHERE x NOT IN ('schemaVersion','capture','estimate'))
 THEN RAISE EXCEPTION 'Invalid estimate' USING ERRCODE='22023'; END IF;
 c:=p_payload->'capture';e:=p_payload->'estimate';
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR jsonb_typeof(e) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(c))<>3 OR (SELECT count(*) FROM jsonb_object_keys(e))<>4
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) x WHERE x NOT IN ('requestId','capturedAt','contentHash'))
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(e) x WHERE x NOT IN ('items','totals','estimatedAt','model'))
  OR jsonb_typeof(c->'requestId') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'contentHash') IS DISTINCT FROM 'string'
  OR c->>'requestId' IS DISTINCT FROM p_id::text OR coalesce(c->>'contentHash','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(c->'capturedAt') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'estimatedAt') IS DISTINCT FROM 'string'
  OR jsonb_typeof(e->'model') IS DISTINCT FROM 'string' OR octet_length(e->>'model') NOT BETWEEN 1 AND 128 OR btrim(e->>'model')=''
  OR jsonb_typeof(e->'items') IS DISTINCT FROM 'array' OR jsonb_typeof(e->'totals') IS DISTINCT FROM 'object'
  OR c->>'capturedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  OR e->>'estimatedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
 THEN RAISE EXCEPTION 'Invalid estimate shape' USING ERRCODE='22023'; END IF;
 captured:=(c->>'capturedAt')::timestamptz;estimated:=(e->>'estimatedAt')::timestamptz;
 IF captured<d.admitted_at OR captured>clock_timestamp()+interval '5 minutes' OR estimated<captured OR estimated>clock_timestamp()+interval '5 minutes'
  OR jsonb_array_length(e->'items') NOT BETWEEN 1 AND 20 OR (SELECT count(*) FROM jsonb_object_keys(e->'totals'))<>4
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(e->'totals') x WHERE x NOT IN ('protein','carbs','fat','calories'))
 THEN RAISE EXCEPTION 'Invalid estimate admission' USING ERRCODE='22023'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(e->'items') LOOP
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(f))<>6
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(f) x WHERE x NOT IN ('food','portion','protein','carbs','fat','calories'))
   OR jsonb_typeof(f->'food') IS DISTINCT FROM 'string' OR octet_length(f->>'food') NOT BETWEEN 1 AND 256 OR btrim(f->>'food')=''
   OR jsonb_typeof(f->'portion') IS DISTINCT FROM 'string' OR octet_length(f->>'portion') NOT BETWEEN 1 AND 128 OR btrim(f->>'portion')=''
  THEN RAISE EXCEPTION 'Invalid estimated food' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['protein','carbs','fat','calories'] LOOP
   IF jsonb_typeof(f->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid estimated quantity' USING ERRCODE='22023'; END IF;
   n:=(f->>k)::numeric;
   IF n<0 OR n>(limits->>k)::numeric OR n*1000<>trunc(n*1000) THEN RAISE EXCEPTION 'Invalid estimated quantity' USING ERRCODE='22023'; END IF;
   sums:=jsonb_set(sums,ARRAY[k],to_jsonb((sums->>k)::numeric+n));
  END LOOP;
 END LOOP;
 t:=e->'totals';
 FOREACH k IN ARRAY ARRAY['protein','carbs','fat','calories'] LOOP
  IF jsonb_typeof(t->k) IS DISTINCT FROM 'number' OR (t->>k)::numeric IS DISTINCT FROM (sums->>k)::numeric
   OR (sums->>k)::numeric>(total_limits->>k)::numeric THEN RAISE EXCEPTION 'Estimated totals disagree' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.external_estimate_requests WHERE user_id=d.user_id AND content_hash=c->>'contentHash')
 THEN RAISE EXCEPTION 'Image already has a capture identity' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM public.external_estimate_requests WHERE device_id=d.id AND created_at>clock_timestamp()-interval '1 day')>=50
 THEN RAISE EXCEPTION 'Daily import limit reached' USING ERRCODE='54000'; END IF;
 field:=jsonb_build_object('origin','model_estimated','reviewState','unreviewed','sourceReferences',jsonb_build_array('external-estimate:'||p_id::text));
 pr:=jsonb_build_object('schemaVersion',1,'occurrence',field,'fields',jsonb_build_object('items',field,'quantities',field,'macros',field));
 operation:=jsonb_build_object('sourceItemId','external-estimate:'||p_id::text,'kind','meal','inputMethod','photo','eventAt',c->>'capturedAt',
  'record',jsonb_build_object('meal_timestamp',c->>'capturedAt','photo_url',NULL,'items',e->'items','total_protein',sums->'protein','total_carbs',sums->'carbs',
    'total_fat',sums->'fat','total_calories',sums->'calories','needs_review',true,'manual_override',false),
  'blocks','[]'::jsonb,'provenance',pr,'response',jsonb_build_object('consumption','unknown','eventTimeMeaning','photo_capture_only','sourceModelVerified',false));
 PERFORM public.validate_capture_operation(operation);
 INSERT INTO public.activity_drafts(user_id,kind,normalized,provenance,input_method,event_at)
  VALUES(d.user_id,'meal',operation,pr,'photo',captured) RETURNING * INTO a;
 result:=jsonb_build_object('schemaVersion',1,'requestId',p_id,'state','estimated_unreviewed','canonicalChanged',false,'consumption','unknown',
  'capture',c,'originalEstimate',e,'fingerprint',p_fingerprint,'receivedAt',a.created_at,'draftId',a.id,'draftRevisionAtImport',a.revision,
  'record',operation->'record','provenance',pr,'eventTimeMeaning','photo_capture_only','sourceModelVerified',false);
 -- Same 128 KiB contract as HTTP and native transport/completion/persistence.
 -- Raising here rolls back the draft too; never commit an unreadable receipt.
 IF octet_length(result::text)>131072 THEN RAISE EXCEPTION 'Estimated receipt exceeds contract' USING ERRCODE='54000'; END IF;
 INSERT INTO public.external_estimate_requests(id,device_id,user_id,payload,fingerprint,content_hash,draft_id,receipt)
  VALUES(p_id,d.id,d.user_id,p_payload,p_fingerprint,c->>'contentHash',a.id,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.external_estimate_request(text,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.external_estimate_request(text,text,uuid,jsonb,text) TO service_role;
COMMIT;
