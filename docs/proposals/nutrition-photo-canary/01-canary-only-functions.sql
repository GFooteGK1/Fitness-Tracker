-- PROPOSED ONLY. NOT APPLIED OR EXECUTED. Requires exact owner approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.nutrition_photo_pilot(p_id UUID,p_action TEXT,p_payload JSONB DEFAULT '{}') RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.nutrition_photo_captures; l JSONB; items JSONB; r JSONB; inserted UUID; f JSONB; budget public.nutrition_photo_budget; paid_stage TEXT; amount BIGINT; dispatch_receipt JSONB; admission TIMESTAMPTZ;
BEGIN
 -- Literal gate cannot be activated by an environment variable or request.
 IF NOT true THEN RAISE EXCEPTION 'Pilot not activated' USING ERRCODE='42501'; END IF;
 IF p_id IS DISTINCT FROM '853b894f-fa52-5fec-b503-91c11bdb0978'::uuid THEN RAISE EXCEPTION 'Reference canary only' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR encode(sha256(convert_to(auth.uid()::text,'UTF8')),'hex')<>'2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543'
 THEN RAISE EXCEPTION 'Pilot owner required' USING ERRCODE='42501'; END IF;
 -- Permanent isolation: this fixed reference canary can never become a meal.
 IF p_action='commit' AND p_id='853b894f-fa52-5fec-b503-91c11bdb0978'::uuid THEN RAISE EXCEPTION 'Reference canary cannot enter meal history' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR length(p_payload::text)>40000
 THEN RAISE EXCEPTION 'Invalid capture' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nutrition-photo:'||auth.uid()::text,0));
 -- The same transaction lock serializes every stage's entire budget decision.
 IF p_action IN ('screen_start','estimate_start') THEN
   SELECT * INTO budget FROM public.nutrition_photo_budget WHERE policy='openai-owner-30d-v1' FOR UPDATE;
   admission:=clock_timestamp();
   IF NOT FOUND OR budget.halted OR admission<budget.started_at OR admission+interval '60 seconds'>=budget.ends_at
   THEN RAISE EXCEPTION 'Initial pilot period unavailable or ended' USING ERRCODE='54000'; END IF;
   paid_stage:=CASE p_action WHEN 'screen_start' THEN 'screen' ELSE 'estimate' END;
   amount:=CASE paid_stage WHEN 'screen' THEN 250000 ELSE 600000 END;
   IF (SELECT coalesce(sum(coalesce(confirmed_micro_usd,reserved_micro_usd)),0) FROM public.nutrition_photo_exposure WHERE policy=budget.policy)+amount>5000000
     OR (SELECT coalesce(sum(coalesce(confirmed_micro_usd,reserved_micro_usd)),0) FROM public.nutrition_photo_exposure WHERE policy=budget.policy
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
   VALUES(p_id,auth.uid(),p_payload->>'sourceHash',p_payload->>'normalizedHash','meals/'||auth.uid()::text||(CASE WHEN p_id='853b894f-fa52-5fec-b503-91c11bdb0978'::uuid THEN '/nutrition-canary/' ELSE '/nutrition-pilot/' END)||p_id::text||'.jpg',
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
 -- Owner-submitted result JSON confers NO financial completion/refund authority.
 RETURN to_jsonb(c)||CASE WHEN dispatch_receipt IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('dispatch_grant',dispatch_receipt) END;
END $$;
REVOKE ALL ON FUNCTION public.nutrition_photo_pilot(UUID,TEXT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nutrition_photo_pilot(UUID,TEXT,JSONB) TO authenticated;

-- Trusted server response path only. No authenticated owner may attest usage or
-- completion time, including through the owner-facing result transitions above.
CREATE OR REPLACE FUNCTION public.settle_nutrition_photo_usage(p_capture_id UUID,p_owner UUID,p_stage TEXT,p_evidence JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE exposure public.nutrition_photo_exposure; capture public.nutrition_photo_captures; budget public.nutrition_photo_budget;
 input_count BIGINT; output_count BIGINT; total_count BIGINT; charge BIGINT;
BEGIN
 IF NOT true THEN RAISE EXCEPTION 'Pilot not activated' USING ERRCODE='42501'; END IF;
 IF p_capture_id IS DISTINCT FROM '853b894f-fa52-5fec-b503-91c11bdb0978'::uuid THEN RAISE EXCEPTION 'Reference canary only' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR p_owner IS NULL
   OR encode(sha256(convert_to(p_owner::text,'UTF8')),'hex')<>'2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543'
 THEN RAISE EXCEPTION 'Trusted pilot server required' USING ERRCODE='42501'; END IF;
 IF p_stage IS NULL OR p_stage NOT IN ('screen','estimate') OR p_evidence IS NULL OR jsonb_typeof(p_evidence)<>'object'
   OR length(p_evidence::text)>2048
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_evidence) k WHERE k NOT IN
     ('provider','endpoint','model','receiptId','inputTokens','outputTokens','totalTokens','serviceTier','ratePolicy'))
   OR p_evidence->>'provider' IS DISTINCT FROM 'openai'
   OR p_evidence->>'ratePolicy' IS DISTINCT FROM 'openai-usage-ceiling-2026-10-19-v1'
   OR p_evidence->>'model' IS DISTINCT FROM (CASE p_stage WHEN 'screen' THEN 'gpt-6-luna' ELSE 'gpt-5.6-luna' END)
   OR p_evidence->>'endpoint' IS DISTINCT FROM (CASE p_stage WHEN 'screen' THEN 'decisions' ELSE 'responses' END)
   OR p_evidence->>'serviceTier' IS DISTINCT FROM (CASE p_stage WHEN 'screen' THEN 'fixed-decisions' ELSE 'default' END)
   OR p_evidence->>'receiptId' IS NULL OR p_evidence->>'receiptId' !~ (CASE p_stage WHEN 'screen' THEN '^decisions:[A-Za-z0-9_-]{1,160}$' ELSE '^responses:[A-Za-z0-9_-]{1,160}$' END)
   OR jsonb_typeof(p_evidence->'inputTokens') IS DISTINCT FROM 'number' OR p_evidence->>'inputTokens' !~ '^[0-9]{1,7}$'
   OR jsonb_typeof(p_evidence->'outputTokens') IS DISTINCT FROM 'number' OR p_evidence->>'outputTokens' !~ '^[0-9]{1,4}$'
   OR jsonb_typeof(p_evidence->'totalTokens') IS DISTINCT FROM 'number' OR p_evidence->>'totalTokens' !~ '^[0-9]{1,7}$'
 THEN RAISE EXCEPTION 'Incomplete or invalid provider usage' USING ERRCODE='22023'; END IF;
 input_count:=(p_evidence->>'inputTokens')::bigint; output_count:=(p_evidence->>'outputTokens')::bigint; total_count:=(p_evidence->>'totalTokens')::bigint;
 IF input_count NOT BETWEEN 1 AND 1050000 OR total_count<>input_count+output_count
   OR (p_stage='screen' AND output_count<>0) OR (p_stage='estimate' AND output_count NOT BETWEEN 1 AND 1024)
 THEN RAISE EXCEPTION 'Usage outside qualified request envelope' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nutrition-photo:'||p_owner::text,0));
 SELECT * INTO budget FROM public.nutrition_photo_budget WHERE policy='openai-owner-30d-v1' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original pilot period unavailable' USING ERRCODE='40001'; END IF;
 SELECT * INTO exposure FROM public.nutrition_photo_exposure WHERE capture_id=p_capture_id AND user_id=p_owner AND stage=p_stage FOR UPDATE;
 IF NOT FOUND OR exposure.policy<>budget.policy OR exposure.admitted_at<budget.started_at OR exposure.admitted_at>=budget.ends_at
 THEN RAISE EXCEPTION 'Unknown original reservation' USING ERRCODE='42501'; END IF;
 SELECT * INTO capture FROM public.nutrition_photo_captures WHERE id=p_capture_id AND user_id=p_owner;
 IF NOT FOUND OR (p_stage='screen' AND capture.screening IS NULL) OR (p_stage='estimate' AND capture.original_estimate IS NULL)
 THEN RAISE EXCEPTION 'Provider result was not durably acknowledged' USING ERRCODE='40001'; END IF;
 IF exposure.usage_evidence IS NOT NULL THEN
   IF exposure.usage_evidence IS DISTINCT FROM p_evidence THEN RAISE EXCEPTION 'Settlement evidence conflicts' USING ERRCODE='22023'; END IF;
 ELSE
   charge:=CASE p_stage WHEN 'screen' THEN (input_count*22+99)/100 ELSE (input_count*55+output_count*198+99)/100 END;
   IF charge>exposure.reserved_micro_usd THEN
     UPDATE public.nutrition_photo_budget SET halted=true WHERE policy=budget.policy;
     RETURN jsonb_build_object('state','bound_violation','captureId',p_capture_id,'stage',p_stage);
   END IF;
   UPDATE public.nutrition_photo_exposure SET confirmed_micro_usd=charge,usage_evidence=p_evidence,
     provider_receipt_id=p_evidence->>'receiptId',settled_at=clock_timestamp()
     WHERE capture_id=p_capture_id AND user_id=p_owner AND stage=p_stage RETURNING * INTO exposure;
 END IF;
 RETURN jsonb_build_object('state','settled','captureId',p_capture_id,'owner',p_owner,'stage',p_stage,
   'confirmedMicroUsd',exposure.confirmed_micro_usd,'reservedMicroUsd',exposure.reserved_micro_usd,'settledAt',exposure.settled_at);
END $$;
REVOKE ALL ON FUNCTION public.settle_nutrition_photo_usage(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.settle_nutrition_photo_usage(UUID,UUID,TEXT,JSONB) TO service_role;

COMMIT;
