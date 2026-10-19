-- PREPARATION ONLY: not in supabase/migrations; NOT applied. Both code and SQL
-- remain disabled. Activation requires reviewed retention/deletion, permissions,
-- credential reuse, pricing and hard spending bounds plus migration authority.
CREATE TABLE public.nutrition_photo_captures (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 source_hash TEXT NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 normalized_hash TEXT NOT NULL CHECK(normalized_hash ~ '^[a-f0-9]{64}$'),
 object_path TEXT NOT NULL UNIQUE, captured_at TIMESTAMPTZ NOT NULL,
 captured_at_source TEXT NOT NULL, context TEXT NOT NULL CHECK(length(context)<=1000),
 consent_version TEXT NOT NULL, normalization_version TEXT NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 photo_stored_at TIMESTAMPTZ, screening_started_at TIMESTAMPTZ, estimated_at TIMESTAMPTZ, estimation_started_at TIMESTAMPTZ,
 saved_at TIMESTAMPTZ, state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN
 ('reserved','photo_stored','screening','screened','rejected','estimating','estimated','saved','uncertain')),
 screening JSONB, original_estimate JSONB, operation JSONB, prompt_hash TEXT, parser_version TEXT,
 meal_id UUID, receipt JSONB,
 UNIQUE(user_id,source_hash), UNIQUE(user_id,normalized_hash), UNIQUE(id,user_id),
 FOREIGN KEY(meal_id,user_id) REFERENCES public.meals(id,user_id) ON DELETE SET NULL (meal_id)
);
ALTER TABLE public.nutrition_photo_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_photo_captures FORCE ROW LEVEL SECURITY;
CREATE POLICY nutrition_photo_owner_read ON public.nutrition_photo_captures FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.nutrition_photo_captures FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nutrition_photo_captures TO authenticated;

-- One immutable initial period, started by the explicitly approved migration.
-- No upsert, rollover, refund, cascade, client-supplied price or reset API.
CREATE TABLE public.nutrition_photo_budget (
 policy TEXT PRIMARY KEY CHECK(policy='openai-owner-30d-v1'),
 started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 ends_at TIMESTAMPTZ NOT NULL,
 CHECK(ends_at=started_at+interval '720 hours')
);
WITH period AS (SELECT clock_timestamp() start)
INSERT INTO public.nutrition_photo_budget(policy,started_at,ends_at)
 SELECT 'openai-owner-30d-v1',start,start+interval '720 hours' FROM period;
CREATE TABLE public.nutrition_photo_exposure (
 capture_id UUID NOT NULL, user_id UUID NOT NULL, stage TEXT NOT NULL CHECK(stage IN ('screen','estimate')),
 policy TEXT NOT NULL REFERENCES public.nutrition_photo_budget(policy),
 reserved_micro_usd BIGINT NOT NULL CHECK(reserved_micro_usd=CASE stage WHEN 'screen' THEN 250000 ELSE 600000 END),
 admitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), settled_at TIMESTAMPTZ,
 PRIMARY KEY(capture_id,stage), CHECK(settled_at IS NULL OR settled_at>=admitted_at)
 -- Deliberately no capture/user cascade: deleting source records cannot restore money.
);
ALTER TABLE public.nutrition_photo_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_photo_budget FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_photo_exposure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_photo_exposure FORCE ROW LEVEL SECURITY;
CREATE POLICY nutrition_exposure_owner_read ON public.nutrition_photo_exposure FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.nutrition_photo_budget,public.nutrition_photo_exposure FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nutrition_photo_exposure TO authenticated;

CREATE FUNCTION public.nutrition_photo_pilot(p_id UUID,p_action TEXT,p_payload JSONB DEFAULT '{}') RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.nutrition_photo_captures; l JSONB; items JSONB; r JSONB; inserted UUID; f JSONB; budget public.nutrition_photo_budget; paid_stage TEXT; amount BIGINT; dispatch_receipt JSONB; admission TIMESTAMPTZ;
BEGIN
 -- Literal gate cannot be activated by an environment variable or request.
 IF NOT false THEN RAISE EXCEPTION 'Pilot not activated' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR encode(sha256(convert_to(auth.uid()::text,'UTF8')),'hex')<>'2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543'
 THEN RAISE EXCEPTION 'Pilot owner required' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR length(p_payload::text)>40000
 THEN RAISE EXCEPTION 'Invalid capture' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nutrition-photo:'||auth.uid()::text,0));
 -- The same transaction lock serializes every stage's entire budget decision.
 IF p_action IN ('screen_start','estimate_start') THEN
   SELECT * INTO budget FROM public.nutrition_photo_budget WHERE policy='openai-owner-30d-v1' FOR UPDATE;
   admission:=clock_timestamp();
   IF NOT FOUND OR admission<budget.started_at OR admission+interval '60 seconds'>=budget.ends_at
   THEN RAISE EXCEPTION 'Initial pilot period unavailable or ended' USING ERRCODE='54000'; END IF;
   paid_stage:=CASE p_action WHEN 'screen_start' THEN 'screen' ELSE 'estimate' END;
   amount:=CASE paid_stage WHEN 'screen' THEN 250000 ELSE 600000 END;
   IF (SELECT coalesce(sum(reserved_micro_usd),0) FROM public.nutrition_photo_exposure WHERE policy=budget.policy)+amount>5000000
     OR (SELECT coalesce(sum(reserved_micro_usd),0) FROM public.nutrition_photo_exposure WHERE policy=budget.policy
       AND (settled_at IS NULL OR settled_at>=admission-interval '24 hours 60 seconds'))+amount>1000000
   THEN RAISE EXCEPTION 'Pilot spending ceiling reached' USING ERRCODE='54000'; END IF;
   INSERT INTO public.nutrition_photo_exposure(capture_id,user_id,stage,policy,reserved_micro_usd,admitted_at)
     VALUES(p_id,auth.uid(),paid_stage,budget.policy,amount,admission);
   dispatch_receipt:=jsonb_build_object('policy',budget.policy,'stage',paid_stage,'captureId',p_id,'reservedMicroUsd',amount,
     'model',CASE paid_stage WHEN 'screen' THEN 'gpt-6-luna' ELSE 'gpt-5.6-luna' END,
     'remainingMs',floor(extract(epoch FROM budget.ends_at-clock_timestamp())*1000));
 END IF;
 IF p_action='reserve' THEN
   SELECT * INTO c FROM public.nutrition_photo_captures WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
   IF FOUND THEN
     IF c.source_hash IS DISTINCT FROM p_payload->>'sourceHash' OR c.normalized_hash IS DISTINCT FROM p_payload->>'normalizedHash'
       OR c.captured_at_source IS DISTINCT FROM p_payload->>'capturedAt' OR c.context IS DISTINCT FROM p_payload->>'context'
       OR c.consent_version IS DISTINCT FROM p_payload->>'consent' OR c.normalization_version IS DISTINCT FROM p_payload->>'normalization'
     THEN RAISE EXCEPTION 'Capture identity conflicts with original input' USING ERRCODE='22023'; END IF;
     RETURN to_jsonb(c)||jsonb_build_object('claimed',false);
   END IF;
   IF p_payload->>'consent' IS DISTINCT FROM 'selected-photo-openai-autolog-v1' OR p_payload->>'normalization' IS DISTINCT FROM 'decoded-jpeg-v1'
     OR p_payload->>'capturedAt' IS NULL OR p_payload->>'context' IS NULL
     OR (p_payload->>'capturedAt')::timestamptz > clock_timestamp()+interval '5 minutes'
   THEN RAISE EXCEPTION 'Invalid capture metadata' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM public.nutrition_photo_captures WHERE user_id=auth.uid() AND (source_hash=p_payload->>'sourceHash' OR normalized_hash=p_payload->>'normalizedHash'))
   THEN RAISE EXCEPTION 'Photo already submitted. Retrieve the existing capture; log a distinct occurrence explicitly.' USING ERRCODE='22023'; END IF;
   -- Admission ceiling only; NOT a financial cap. Paid activation remains blocked.
   IF (SELECT count(*) FROM public.nutrition_photo_captures WHERE user_id=auth.uid() AND received_at>=clock_timestamp()-interval '24 hours')>=10
   THEN RAISE EXCEPTION 'Capture admission limit' USING ERRCODE='54000'; END IF;
   INSERT INTO public.nutrition_photo_captures(id,user_id,source_hash,normalized_hash,object_path,captured_at,captured_at_source,context,consent_version,normalization_version)
   VALUES(p_id,auth.uid(),p_payload->>'sourceHash',p_payload->>'normalizedHash','meals/'||auth.uid()::text||'/nutrition-pilot/'||p_id::text||'.jpg',
     (p_payload->>'capturedAt')::timestamptz,p_payload->>'capturedAt',p_payload->>'context',p_payload->>'consent',p_payload->>'normalization') RETURNING * INTO c;
   RETURN to_jsonb(c)||jsonb_build_object('claimed',true);
 END IF;
 SELECT * INTO c FROM public.nutrition_photo_captures WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown owned capture' USING ERRCODE='42501'; END IF;
 IF p_action='commit' AND c.state='saved' THEN RETURN to_jsonb(c); END IF;
 IF p_action='uncertain' THEN
   -- Never demote a confirmed result after a response is lost. An estimate can
   -- safely resume its database transaction; an in-flight provider cannot.
   IF c.state NOT IN ('saved','rejected','estimated') THEN c.state:='uncertain'; END IF;
 ELSIF p_action='photo_stored' AND c.state='reserved' THEN c.state:='photo_stored'; c.photo_stored_at:=clock_timestamp();
 ELSIF p_action='screen_start' AND c.state='photo_stored' THEN c.state:='screening'; c.screening_started_at:=clock_timestamp();
 ELSIF p_action='screen_result' AND c.state='screening' THEN
   IF p_payload#>>'{screening,model}' IS DISTINCT FROM 'gpt-6-luna' OR p_payload#>>'{screening,policy}' IS DISTINCT FROM 'decisions-food-v2'
     OR p_payload#>>'{screening,route}' NOT IN ('food_candidate','non_food_candidate','review') OR p_payload#>>'{screening,route}' IS NULL
   THEN RAISE EXCEPTION 'Invalid screening' USING ERRCODE='22023'; END IF;
   c.screening:=p_payload->'screening'; c.state:=CASE WHEN c.screening->>'route'='food_candidate' THEN 'screened' ELSE 'rejected' END;
 ELSIF p_action='estimate_start' AND c.state='screened' THEN c.state:='estimating'; c.estimation_started_at:=clock_timestamp();
 ELSIF p_action='estimate_result' AND c.state='estimating' THEN
   IF p_payload#>>'{estimate,provider}' IS DISTINCT FROM 'openai' OR p_payload#>>'{estimate,model}' IS DISTINCT FROM 'gpt-5.6-luna'
      OR p_payload->>'parserVersion' IS DISTINCT FROM 'meal-photo-v1' OR p_payload->>'promptHash' IS NULL OR p_payload->>'promptHash' !~ '^[a-f0-9]{64}$'
      OR p_payload#>>'{operation,kind}' IS DISTINCT FROM 'meal' OR p_payload#>>'{operation,inputMethod}' IS DISTINCT FROM 'photo'
      OR p_payload#>>'{operation,record,needs_review}' IS DISTINCT FROM 'true'
      OR coalesce(p_payload#>>'{operation,record,reviewed_at}','')<>''
      OR p_payload#>>'{operation,eventAt}' IS DISTINCT FROM c.captured_at_source
      OR p_payload#>>'{operation,sourceItemId}' IS DISTINCT FROM 'nutrition-photo:'||c.id::text
      OR p_payload#>'{estimate,analysis,items}' IS DISTINCT FROM p_payload#>'{operation,record,items}'
   THEN RAISE EXCEPTION 'Invalid estimate' USING ERRCODE='22023'; END IF;
   PERFORM public.validate_capture_operation(p_payload->'operation');
   FOR f IN SELECT p_payload#>'{operation,provenance,occurrence}' UNION ALL SELECT value FROM jsonb_each(p_payload#>'{operation,provenance,fields}') LOOP
     IF f->>'origin' IS DISTINCT FROM 'model_estimated' OR f->>'reviewState' IS DISTINCT FROM 'unreviewed'
     THEN RAISE EXCEPTION 'Automatic estimate is unreviewed' USING ERRCODE='22023'; END IF;
   END LOOP;
   c.original_estimate:=p_payload->'estimate'; c.operation:=p_payload->'operation'; c.prompt_hash:=p_payload->>'promptHash';
   c.parser_version:=p_payload->>'parserVersion'; c.estimated_at:=clock_timestamp(); c.state:='estimated';
 ELSIF p_action='commit' AND c.state='estimated' THEN
   l:=public.begin_logging_request('nutrition-photo:'||c.id::text,encode(sha256(convert_to(c.operation::text,'UTF8')),'hex'));
   items:=public.freeze_logging_request_items((l->>'id')::uuid,jsonb_build_array(c.operation));
   r:=public.commit_logging_request_item((items->0->>'id')::uuid);
   PERFORM public.finish_logging_request((l->>'id')::uuid,jsonb_build_object('receipt',r),200);
   c.meal_id:=(r->>'entityId')::uuid; c.receipt:=r; c.saved_at:=clock_timestamp(); c.state:='saved';
 ELSE RAISE EXCEPTION 'Capture transition conflicts with durable state' USING ERRCODE='40001'; END IF;
 UPDATE public.nutrition_photo_captures SET state=c.state,photo_stored_at=c.photo_stored_at,screening_started_at=c.screening_started_at,
   estimation_started_at=c.estimation_started_at,screening=c.screening,original_estimate=c.original_estimate,operation=c.operation,
   prompt_hash=c.prompt_hash,parser_version=c.parser_version,estimated_at=c.estimated_at,saved_at=c.saved_at,meal_id=c.meal_id,receipt=c.receipt,
   updated_at=clock_timestamp() WHERE id=c.id AND user_id=auth.uid() RETURNING * INTO c;
 -- Successful stage acknowledgement anchors rolling exposure after completion.
 -- Errors, missing usage, lost acknowledgements and crashes remain unresolved;
 -- they never age out and never refund the $5 initial-period ceiling.
 IF p_action IN ('screen_result','estimate_result') THEN
   UPDATE public.nutrition_photo_exposure SET settled_at=clock_timestamp()
     WHERE capture_id=c.id AND user_id=auth.uid() AND stage=CASE p_action WHEN 'screen_result' THEN 'screen' ELSE 'estimate' END
       AND settled_at IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'Missing paid exposure' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN to_jsonb(c)||CASE WHEN dispatch_receipt IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('dispatch_grant',dispatch_receipt) END;
END $$;
REVOKE ALL ON FUNCTION public.nutrition_photo_pilot(UUID,TEXT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nutrition_photo_pilot(UUID,TEXT,JSONB) TO authenticated;
