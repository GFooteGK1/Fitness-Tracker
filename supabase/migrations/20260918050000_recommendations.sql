-- Bounded recommendation publication is server-only. Source invalidation commits
-- with its source write; recommendation computation is a later interaction.
BEGIN;
CREATE TABLE IF NOT EXISTS public.recommendations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 decision JSONB NOT NULL,rule_id TEXT NOT NULL,policy_version TEXT NOT NULL,runtime_fingerprint TEXT NOT NULL,
 scope_key TEXT NOT NULL,evidence_fingerprint TEXT NOT NULL,source_revision BIGINT NOT NULL,response_revision BIGINT NOT NULL,
 local_date DATE NOT NULL,timezone_offset INTEGER NOT NULL,valid_until TIMESTAMPTZ NOT NULL,
 plan_version_id UUID,intent_memory_id UUID,intent_version INTEGER,
 lifecycle TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','superseded','expired','withdrawn')),
 withdrawal_reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,user_id),
 FOREIGN KEY(plan_version_id,user_id) REFERENCES public.training_plan_versions(id,user_id),
 FOREIGN KEY(intent_memory_id,user_id) REFERENCES public.coach_memories(id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS recommendation_active_identity ON public.recommendations(user_id,rule_id,policy_version,runtime_fingerprint,scope_key,evidence_fingerprint,local_date,timezone_offset) WHERE lifecycle='active';
CREATE TABLE IF NOT EXISTS public.recommendation_refresh_state (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 source_revision BIGINT NOT NULL DEFAULT 1,response_revision BIGINT NOT NULL DEFAULT 0,nutrition_revision BIGINT NOT NULL DEFAULT 0,
 processed_source_revision BIGINT NOT NULL DEFAULT -1,processed_response_revision BIGINT NOT NULL DEFAULT -1,
 lease_token UUID,lease_expires_at TIMESTAMPTZ,claim_context JSONB,processed_context JSONB,
 current_recommendation_id UUID,next_due_at TIMESTAMPTZ,last_error TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(current_recommendation_id,user_id) REFERENCES public.recommendations(id,user_id)
);
CREATE TABLE IF NOT EXISTS public.recommendation_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recommendation_id UUID NOT NULL,request_id TEXT NOT NULL,event_type TEXT NOT NULL CHECK(event_type IN ('shown','response','outcome','outcome_invalidated')),
 payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),UNIQUE(user_id,request_id),
 FOREIGN KEY(recommendation_id,user_id) REFERENCES public.recommendations(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.recommendation_suppressions (
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,scope_key TEXT NOT NULL,evidence_fingerprint TEXT NOT NULL,
 response TEXT NOT NULL CHECK(response IN ('done_reported','not_applicable','deferred','adjust_requested')),
 defer_until TIMESTAMPTZ,recommendation_id UUID NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,scope_key,evidence_fingerprint),FOREIGN KEY(recommendation_id,user_id) REFERENCES public.recommendations(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.recommendation_publications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 lease_token UUID NOT NULL,payload JSONB NOT NULL,result JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),UNIQUE(user_id,lease_token)
);
CREATE TABLE IF NOT EXISTS public.logging_coverage_confirmations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 domain TEXT NOT NULL CHECK(domain='nutrition'),local_date DATE NOT NULL,timezone_offset INTEGER NOT NULL,
 coverage_through TIMESTAMPTZ NOT NULL,status TEXT NOT NULL CHECK(status IN ('complete_through','partial','unknown')),
 source_revision BIGINT NOT NULL,nutrition_revision BIGINT NOT NULL,request_id TEXT NOT NULL,payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),UNIQUE(user_id,request_id),UNIQUE(id,user_id)
);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['recommendations','recommendation_refresh_state','recommendation_events','recommendation_suppressions','recommendation_publications','logging_coverage_confirmations'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('DROP POLICY IF EXISTS recommendation_owner ON public.%I',t);
 EXECUTE format('CREATE POLICY recommendation_owner ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated,service_role',t);
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(user_id)',t||'_owner_idx',t);
 END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS recommendation_visible ON public.recommendations(user_id,lifecycle,valid_until);
CREATE INDEX IF NOT EXISTS recommendation_followup ON public.recommendations(user_id,((decision#>>'{outcome,dueAt}')));

CREATE OR REPLACE FUNCTION public.recommendation_authority(p_user_id UUID) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('activePlanId',(SELECT CASE WHEN count(*)=1 THEN min(p.active_plan_version_id::text) END FROM public.training_programs p JOIN public.training_plan_versions v ON v.id=p.active_plan_version_id AND v.user_id=p.user_id WHERE p.user_id=p_user_id AND p.status='active' AND v.status='accepted'),
 'intentMemoryId',(SELECT m.id FROM public.coach_memories m WHERE m.user_id=p_user_id AND m.memory_key='training_intent' AND m.version=(SELECT max(latest.version) FROM public.coach_memories latest WHERE latest.user_id=p_user_id AND latest.memory_key='training_intent') AND m.status='confirmed' AND (m.effective_from IS NULL OR m.effective_from<=clock_timestamp()) AND (m.effective_until IS NULL OR m.effective_until>clock_timestamp()) AND (m.review_after IS NULL OR m.review_after>clock_timestamp())),
 'intentVersion',(SELECT m.version FROM public.coach_memories m WHERE m.user_id=p_user_id AND m.memory_key='training_intent' AND m.version=(SELECT max(latest.version) FROM public.coach_memories latest WHERE latest.user_id=p_user_id AND latest.memory_key='training_intent') AND m.status='confirmed' AND (m.effective_from IS NULL OR m.effective_from<=clock_timestamp()) AND (m.effective_until IS NULL OR m.effective_until>clock_timestamp()) AND (m.review_after IS NULL OR m.review_after>clock_timestamp())))
$$;
CREATE OR REPLACE FUNCTION public.recommendation_scope(p_user_id UUID,p_runtime_fingerprint TEXT,p_local_date DATE,p_timezone_offset INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'Unknown recommendation owner' USING ERRCODE='42501'; END IF;
 IF p_runtime_fingerprint IS NULL OR p_runtime_fingerprint !~ '^[0-9a-f]{64}$' OR p_timezone_offset IS NULL OR p_timezone_offset NOT BETWEEN -840 AND 840 OR p_local_date IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'UTC'-make_interval(mins=>p_timezone_offset))::date THEN RAISE EXCEPTION 'Recommendation local scope changed' USING ERRCODE='40001'; END IF;
 RETURN public.recommendation_authority(p_user_id)||jsonb_build_object('runtimeFingerprint',p_runtime_fingerprint,'localDate',p_local_date,'timezoneOffset',p_timezone_offset);
END $$;
CREATE OR REPLACE FUNCTION public.dirty_recommendations(p_user_id UUID,p_nutrition BOOLEAN DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RETURN; END IF;
 INSERT INTO public.recommendation_refresh_state(user_id,source_revision,nutrition_revision) VALUES(p_user_id,1,CASE WHEN p_nutrition THEN 1 ELSE 0 END)
 ON CONFLICT(user_id) DO UPDATE SET source_revision=recommendation_refresh_state.source_revision+1,nutrition_revision=recommendation_refresh_state.nutrition_revision+CASE WHEN p_nutrition THEN 1 ELSE 0 END,updated_at=clock_timestamp();
END $$;
CREATE OR REPLACE FUNCTION public.invalidate_recommendation_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_row JSONB; new_row JSONB; old_fields JSONB; new_fields JSONB; old_owner UUID; new_owner UUID; fields TEXT[]:=string_to_array(TG_ARGV[0],','); basis_changed BOOLEAN:=true; basis_owner UUID; basis_table TEXT; basis_id TEXT;
BEGIN
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD);old_owner:=(old_row->>'user_id')::uuid; END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW);new_owner:=(new_row->>'user_id')::uuid; END IF;
 IF TG_TABLE_NAME='coach_memories' AND coalesce(old_row->>'memory_key','') NOT IN ('training_intent') AND coalesce(new_row->>'memory_key','') NOT IN ('training_intent') THEN RETURN NULL; END IF;
 SELECT jsonb_object_agg(k,old_row->k),jsonb_object_agg(k,new_row->k) INTO old_fields,new_fields FROM unnest(fields) k;
 IF TG_OP='UPDATE' AND old_owner IS NOT DISTINCT FROM new_owner AND old_fields IS NOT DISTINCT FROM new_fields THEN RETURN NULL; END IF;
 IF old_owner IS NOT NULL AND old_owner IS DISTINCT FROM new_owner THEN PERFORM public.dirty_recommendations(old_owner,TG_TABLE_NAME IN ('meals','daily_targets')); END IF;
 IF new_owner IS NOT NULL THEN PERFORM public.dirty_recommendations(new_owner,TG_TABLE_NAME IN ('meals','daily_targets')); END IF;
 -- Expected completion is follow-up evidence. Correction of the prescription,
 -- original goal or factual nutrition basis instead withdraws that interpretation.
 basis_owner:=old_owner;basis_table:=TG_TABLE_NAME;basis_id:=coalesce(old_row->>'id',old_row->>'user_id');
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='prescribed_sessions' THEN basis_changed:=(old_row->'plan_version_id',old_row->'scheduled_date',old_row->'prescription') IS DISTINCT FROM (new_row->'plan_version_id',new_row->'scheduled_date',new_row->'prescription'); END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='meals' THEN basis_changed:=(old_row->'meal_timestamp',old_row->'total_protein',old_row->'total_carbs',old_row->'total_fat',old_row->'total_calories',old_row#>'{capture_provenance,fields,macros,origin}') IS DISTINCT FROM (new_row->'meal_timestamp',new_row->'total_protein',new_row->'total_carbs',new_row->'total_fat',new_row->'total_calories',new_row#>'{capture_provenance,fields,macros,origin}'); END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='workouts' THEN basis_changed:=(old_row->'workout_date',old_row->'execution_status',old_row->'execution_revision') IS DISTINCT FROM (new_row->'workout_date',new_row->'execution_status',new_row->'execution_revision'); END IF;
 IF TG_OP='INSERT' AND TG_TABLE_NAME='coach_review_source_invalidations' THEN basis_owner:=new_owner;basis_table:='coach_weekly_reviews';basis_id:=new_row->>'review_id'; END IF;
 IF basis_changed AND (TG_OP<>'INSERT' OR TG_TABLE_NAME='coach_review_source_invalidations') THEN
 UPDATE public.recommendations r SET lifecycle=CASE WHEN lifecycle='active' THEN 'withdrawn' ELSE lifecycle END,withdrawal_reason='source_basis_changed'
 WHERE r.user_id=basis_owner AND r.withdrawal_reason IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.decision->'sources') source WHERE source->>'table'=basis_table AND source->>'id'=basis_id);
 INSERT INTO public.recommendation_events(user_id,recommendation_id,request_id,event_type,payload)
 SELECT e.user_id,e.recommendation_id,'invalidate-basis:'||e.id::text,'outcome_invalidated',jsonb_build_object('outcomeEventId',e.id,'sourceTable',basis_table,'sourceId',basis_id,'reason','decision_basis_changed')
 FROM public.recommendation_events e JOIN public.recommendations r ON r.id=e.recommendation_id AND r.user_id=e.user_id WHERE e.user_id=basis_owner AND e.event_type='outcome' AND r.withdrawal_reason IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users WHERE id=basis_owner)
 ON CONFLICT(user_id,request_id) DO NOTHING;
 END IF;
 IF TG_OP<>'INSERT' THEN
 INSERT INTO public.recommendation_events(user_id,recommendation_id,request_id,event_type,payload)
 SELECT e.user_id,e.recommendation_id,'invalidate:'||e.id::text||':'||TG_TABLE_NAME||':'||(old_row->>'id'),'outcome_invalidated',jsonb_build_object('outcomeEventId',e.id,'sourceTable',TG_TABLE_NAME,'sourceId',old_row->>'id','reason','source_changed')
 FROM public.recommendation_events e WHERE e.user_id=old_owner AND e.event_type='outcome' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.payload->'evidence') ref WHERE ref->>'table'=TG_TABLE_NAME AND ref->>'id'=old_row->>'id') AND EXISTS(SELECT 1 FROM auth.users WHERE id=old_owner)
 ON CONFLICT(user_id,request_id) DO NOTHING;
 END IF;
 IF TG_TABLE_NAME='performance_observation_values' AND TG_OP<>'DELETE' AND new_row->>'status'='complete' AND new_row->>'semantic_role'='direct_outcome' THEN
 -- A newly added second matching value removes the evaluator's unique-value basis.
 INSERT INTO public.recommendation_events(user_id,recommendation_id,request_id,event_type,payload)
 SELECT e.user_id,e.recommendation_id,'invalidate-value-set:'||e.id::text||':'||(new_row->>'id'),'outcome_invalidated',jsonb_build_object('outcomeEventId',e.id,'sourceTable',TG_TABLE_NAME,'sourceId',new_row->>'id','reason','measurement_value_set_changed')
 FROM public.recommendation_events e JOIN public.recommendations r ON r.id=e.recommendation_id AND r.user_id=e.user_id WHERE e.user_id=new_owner AND e.event_type='outcome' AND e.payload->>'adherence'='observed'
 AND r.decision#>>'{outcome,metricId}'=new_row->>'metric_id' AND r.decision#>>'{outcome,unit}'=new_row->>'unit'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.payload->'evidence') source WHERE source->>'table'='performance_observation_groups' AND source->>'id'=new_row->>'group_id')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.payload->'evidence') source WHERE source->>'table'=TG_TABLE_NAME AND source->>'id'=new_row->>'id')
 ON CONFLICT(user_id,request_id) DO NOTHING;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.claim_recommendation_refresh(p_user_id UUID,p_runtime_fingerprint TEXT,p_local_date DATE,p_timezone_offset INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.recommendation_refresh_state; context JSONB; token UUID:=gen_random_uuid(); deadline TIMESTAMPTZ:=clock_timestamp()+interval '60 seconds';
BEGIN
 INSERT INTO public.recommendation_refresh_state(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.recommendation_refresh_state WHERE user_id=p_user_id FOR UPDATE;
 context:=public.recommendation_scope(p_user_id,p_runtime_fingerprint,p_local_date,p_timezone_offset);
 IF s.lease_token IS NOT NULL AND s.lease_expires_at>clock_timestamp() THEN RETURN NULL; END IF;
 IF s.source_revision=s.processed_source_revision AND s.response_revision=s.processed_response_revision AND s.processed_context=context AND s.last_error IS NULL AND (s.next_due_at IS NULL OR s.next_due_at>clock_timestamp()) THEN RETURN NULL; END IF;
 context:=context||jsonb_build_object('sourceRevision',s.source_revision,'responseRevision',s.response_revision);
 UPDATE public.recommendation_refresh_state SET lease_token=token,lease_expires_at=deadline,claim_context=context,updated_at=clock_timestamp() WHERE user_id=p_user_id;
 RETURN context||jsonb_build_object('claimed',true,'leaseToken',token,'leaseExpiresAt',deadline,'nutritionRevision',s.nutrition_revision);
END $$;

CREATE OR REPLACE FUNCTION public.recommendation_suppressed(p_user_id UUID,p_scope TEXT,p_fingerprint TEXT) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.recommendation_suppressions WHERE user_id=p_user_id AND scope_key=p_scope AND ((response='deferred' AND defer_until>clock_timestamp()) OR (response<>'deferred' AND evidence_fingerprint=p_fingerprint)))
$$;
CREATE OR REPLACE FUNCTION public.publish_recommendations(p_user_id UUID,p_lease_token UUID,p_source_revision BIGINT,p_response_revision BIGINT,p_runtime_fingerprint TEXT,p_local_date DATE,p_timezone_offset INTEGER,p_decisions JSONB,p_next_due_at TIMESTAMPTZ) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.recommendation_refresh_state; context JSONB; payload JSONB; previous public.recommendation_publications; d JSONB; r public.recommendations; output JSONB; deadline TIMESTAMPTZ;
BEGIN
 SELECT * INTO s FROM public.recommendation_refresh_state WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recommendation lease is unavailable' USING ERRCODE='40001'; END IF;
 context:=public.recommendation_scope(p_user_id,p_runtime_fingerprint,p_local_date,p_timezone_offset);
 payload:=jsonb_build_object('sourceRevision',p_source_revision,'responseRevision',p_response_revision,'context',context,'decisions',p_decisions,'nextDueAt',p_next_due_at);
 IF s.source_revision IS DISTINCT FROM p_source_revision OR s.response_revision IS DISTINCT FROM p_response_revision THEN RAISE EXCEPTION 'Recommendation inputs changed' USING ERRCODE='40001'; END IF;
 SELECT * INTO previous FROM public.recommendation_publications WHERE user_id=p_user_id AND lease_token=p_lease_token;
 IF FOUND THEN IF previous.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Publication replay payload changed' USING ERRCODE='22023'; END IF;RETURN previous.result; END IF;
 IF s.lease_token IS DISTINCT FROM p_lease_token OR s.lease_expires_at<=clock_timestamp() OR s.claim_context IS DISTINCT FROM context||jsonb_build_object('sourceRevision',p_source_revision,'responseRevision',p_response_revision) THEN RAISE EXCEPTION 'Recommendation lease or authority changed' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(p_decisions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_decisions)<>1 THEN RAISE EXCEPTION 'One bounded decision is required' USING ERRCODE='22023'; END IF;
 d:=p_decisions->0;
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>131072 OR d->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR d->>'kind' IS NULL OR d->>'kind' NOT IN ('action','collect_signal','abstain') OR d->>'ruleId' IS NULL OR d->>'ruleId' NOT IN ('accepted_plan.review','accepted_plan.session','accepted_plan.proposal','missing_signal.baseline','logged_nutrition.remaining','no_eligible_action') OR d->>'ruleVersion' IS DISTINCT FROM '1' OR length(coalesce(d->>'policyVersion','')) NOT BETWEEN 1 AND 120 OR length(coalesce(d->>'scopeKey','')) NOT BETWEEN 1 AND 500 OR coalesce(d->>'evidenceFingerprint','') !~ '^[0-9a-f]{64}$' OR length(coalesce(d->>'title','')) NOT BETWEEN 1 AND 250 OR length(coalesce(d->>'reason','')) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Invalid recommendation decision' USING ERRCODE='22023'; END IF;
 IF d->>'runtimeFingerprint' IS DISTINCT FROM p_runtime_fingerprint OR d->'sourceRevision' IS DISTINCT FROM to_jsonb(p_source_revision) OR d->'responseRevision' IS DISTINCT FROM to_jsonb(p_response_revision) OR d->>'localDate' IS DISTINCT FROM p_local_date::text OR d->'tzOffset' IS DISTINCT FROM to_jsonb(p_timezone_offset) OR d->'planVersionId' IS DISTINCT FROM context->'activePlanId' OR d->'intentMemoryId' IS DISTINCT FROM context->'intentMemoryId' OR d->'intentVersion' IS DISTINCT FROM context->'intentVersion' THEN RAISE EXCEPTION 'Decision source binding changed' USING ERRCODE='40001'; END IF;
 deadline:=(d->>'validUntil')::timestamptz;
 IF deadline IS NULL OR deadline<=clock_timestamp() OR deadline>((p_local_date+1)::timestamp AT TIME ZONE 'UTC'+make_interval(mins=>p_timezone_offset)) OR p_next_due_at IS NOT NULL AND p_next_due_at<=clock_timestamp() THEN RAISE EXCEPTION 'Decision validity window changed' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(d->'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'sources')>320 OR jsonb_typeof(d->'reasonCodes') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'missing') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'conflicts') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'outcome') NOT IN ('object','null') OR jsonb_typeof(d->'destination') NOT IN ('object','null') THEN RAISE EXCEPTION 'Invalid recommendation evidence contract' USING ERRCODE='22023'; END IF;
 IF d->>'kind'<>'abstain' AND public.recommendation_suppressed(p_user_id,d->>'scopeKey',d->>'evidenceFingerprint') THEN RAISE EXCEPTION 'Recommendation was suppressed' USING ERRCODE='40001'; END IF;
 UPDATE public.recommendations SET lifecycle='expired' WHERE user_id=p_user_id AND lifecycle='active' AND valid_until<=clock_timestamp();
 SELECT * INTO r FROM public.recommendations WHERE user_id=p_user_id AND lifecycle='active' AND valid_until>clock_timestamp() AND rule_id=d->>'ruleId' AND policy_version=d->>'policyVersion' AND runtime_fingerprint=p_runtime_fingerprint AND scope_key=d->>'scopeKey' AND evidence_fingerprint=d->>'evidenceFingerprint' AND local_date=p_local_date AND timezone_offset=p_timezone_offset;
 IF FOUND THEN
 -- The trusted evaluator fingerprints meaningful evidence. Audit timestamps and
 -- unrelated source revisions may differ; retain the original immutable snapshot
 -- while the publication receipt proves re-evaluation at the current revisions.
 IF r.lifecycle='withdrawn' THEN RAISE EXCEPTION 'Withdrawn evidence requires a new decision fingerprint' USING ERRCODE='22023'; END IF;
 IF r.plan_version_id IS DISTINCT FROM (d->>'planVersionId')::uuid OR r.intent_memory_id IS DISTINCT FROM (d->>'intentMemoryId')::uuid OR r.intent_version IS DISTINCT FROM (d->>'intentVersion')::integer THEN RAISE EXCEPTION 'Decision fingerprint omitted authority binding' USING ERRCODE='40001'; END IF;
 ELSE
 INSERT INTO public.recommendations(user_id,decision,rule_id,policy_version,runtime_fingerprint,scope_key,evidence_fingerprint,source_revision,response_revision,local_date,timezone_offset,valid_until,plan_version_id,intent_memory_id,intent_version)
 VALUES(p_user_id,d,d->>'ruleId',d->>'policyVersion',p_runtime_fingerprint,d->>'scopeKey',d->>'evidenceFingerprint',p_source_revision,p_response_revision,p_local_date,p_timezone_offset,deadline,(d->>'planVersionId')::uuid,(d->>'intentMemoryId')::uuid,(d->>'intentVersion')::integer) RETURNING * INTO r;
 END IF;
 UPDATE public.recommendations SET lifecycle='superseded' WHERE user_id=p_user_id AND lifecycle='active' AND id<>r.id;
 UPDATE public.recommendation_refresh_state SET processed_source_revision=p_source_revision,processed_response_revision=p_response_revision,processed_context=context,current_recommendation_id=r.id,next_due_at=least(deadline,coalesce(p_next_due_at,deadline),(SELECT min(defer_until) FROM public.recommendation_suppressions WHERE user_id=p_user_id AND response='deferred' AND defer_until>clock_timestamp())),lease_token=NULL,lease_expires_at=NULL,claim_context=NULL,last_error=NULL,updated_at=clock_timestamp() WHERE user_id=p_user_id;
 output:=jsonb_build_object('recommendations',jsonb_build_array(to_jsonb(r)));
 INSERT INTO public.recommendation_publications(user_id,lease_token,payload,result) VALUES(p_user_id,p_lease_token,payload,output);
 RETURN output;
END $$;

CREATE OR REPLACE FUNCTION public.assert_recommendation_current(p_user_id UUID,p_id UUID,p_runtime_fingerprint TEXT,p_timezone_offset INTEGER) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.recommendation_refresh_state; r public.recommendations; context JSONB;
BEGIN
 SELECT * INTO s FROM public.recommendation_refresh_state WHERE user_id=p_user_id;
 SELECT * INTO r FROM public.recommendations WHERE id=p_id AND user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown owned recommendation' USING ERRCODE='42501'; END IF;
 context:=public.recommendation_scope(p_user_id,p_runtime_fingerprint,r.local_date,p_timezone_offset);
 IF r.lifecycle<>'active' OR r.valid_until<=clock_timestamp() OR s.current_recommendation_id IS DISTINCT FROM r.id OR s.source_revision<>s.processed_source_revision OR s.response_revision<>s.processed_response_revision OR s.processed_context IS DISTINCT FROM context OR s.last_error IS NOT NULL THEN RAISE EXCEPTION 'Recommendation is no longer current' USING ERRCODE='40001'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fail_recommendation_refresh(p_user_id UUID,p_lease_token UUID,p_source_revision BIGINT,p_response_revision BIGINT,p_error_code TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_:-]{1,80}$' THEN RAISE EXCEPTION 'Bounded error code required' USING ERRCODE='22023'; END IF;
 UPDATE public.recommendation_refresh_state SET lease_token=NULL,lease_expires_at=NULL,claim_context=NULL,last_error=p_error_code,updated_at=clock_timestamp() WHERE user_id=p_user_id AND lease_token=p_lease_token AND lease_expires_at>clock_timestamp() AND claim_context->'sourceRevision'=to_jsonb(p_source_revision) AND claim_context->'responseRevision'=to_jsonb(p_response_revision);
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.respond_recommendation(p_recommendation_id UUID,p_request_id TEXT,p_response TEXT,p_defer_until TIMESTAMPTZ,p_runtime_fingerprint TEXT,p_timezone_offset INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.recommendations; e public.recommendation_events; payload JSONB;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_request_id,'')) NOT BETWEEN 8 AND 200 OR p_response IS NULL OR p_response NOT IN ('done_reported','not_applicable','deferred','adjust_requested') THEN RAISE EXCEPTION 'Invalid recommendation response' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('response',p_response,'deferUntil',p_defer_until);
 PERFORM 1 FROM public.recommendation_refresh_state WHERE user_id=auth.uid() FOR UPDATE;
 SELECT * INTO e FROM public.recommendation_events WHERE user_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN IF e.recommendation_id<>p_recommendation_id OR e.event_type<>'response' OR e.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Response replay payload changed' USING ERRCODE='22023'; END IF;RETURN to_jsonb(e); END IF;
 SELECT * INTO r FROM public.recommendations WHERE id=p_recommendation_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown owned recommendation' USING ERRCODE='42501'; END IF;
 PERFORM public.assert_recommendation_current(auth.uid(),r.id,p_runtime_fingerprint,p_timezone_offset);
 IF p_response='deferred' AND (p_defer_until IS NULL OR p_defer_until<=clock_timestamp()) OR p_response<>'deferred' AND p_defer_until IS NOT NULL THEN RAISE EXCEPTION 'Invalid defer time' USING ERRCODE='22023'; END IF;
 INSERT INTO public.recommendation_events(user_id,recommendation_id,request_id,event_type,payload) VALUES(auth.uid(),r.id,p_request_id,'response',payload) RETURNING * INTO e;
 INSERT INTO public.recommendation_suppressions(user_id,scope_key,evidence_fingerprint,response,defer_until,recommendation_id) VALUES(auth.uid(),r.scope_key,r.evidence_fingerprint,p_response,p_defer_until,r.id)
 ON CONFLICT(user_id,scope_key,evidence_fingerprint) DO UPDATE SET response=excluded.response,defer_until=excluded.defer_until,recommendation_id=excluded.recommendation_id,updated_at=clock_timestamp();
 UPDATE public.recommendation_refresh_state SET response_revision=response_revision+1,next_due_at=CASE WHEN p_defer_until IS NOT NULL THEN least(next_due_at,p_defer_until) ELSE next_due_at END,updated_at=clock_timestamp() WHERE user_id=auth.uid();
 RETURN to_jsonb(e);
END $$;
CREATE OR REPLACE FUNCTION public.acknowledge_recommendation_shown(p_recommendation_id UUID,p_request_id TEXT,p_runtime_fingerprint TEXT,p_timezone_offset INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.recommendation_events;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=p_recommendation_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Unknown owned recommendation' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_request_id,'')) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Request identity required' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.recommendation_refresh_state WHERE user_id=auth.uid() FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':recommendation-event:'||p_request_id,0));
 SELECT * INTO e FROM public.recommendation_events WHERE user_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN IF e.recommendation_id<>p_recommendation_id OR e.event_type<>'shown' THEN RAISE EXCEPTION 'Event replay payload changed' USING ERRCODE='22023'; END IF;RETURN to_jsonb(e); END IF;
 PERFORM public.assert_recommendation_current(auth.uid(),p_recommendation_id,p_runtime_fingerprint,p_timezone_offset);
 INSERT INTO public.recommendation_events(user_id,recommendation_id,request_id,event_type,payload) VALUES(auth.uid(),p_recommendation_id,p_request_id,'shown','{}') RETURNING * INTO e;
 RETURN to_jsonb(e);
END $$;

CREATE OR REPLACE FUNCTION public.get_recommendation_suppressions(p_user_id UUID,p_candidates JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' OR jsonb_array_length(p_candidates)>128 THEN RAISE EXCEPTION 'Bounded candidates required' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM (
 SELECT DISTINCT ON(s.scope_key,CASE WHEN s.response='deferred' THEN 'deferred' ELSE s.evidence_fingerprint END) s.* FROM public.recommendation_suppressions s
 WHERE s.user_id=p_user_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_candidates) c WHERE c->>'scopeKey'=s.scope_key AND ((s.response='deferred' AND s.defer_until>clock_timestamp()) OR (s.response<>'deferred' AND c->>'evidenceFingerprint'=s.evidence_fingerprint)))
 ORDER BY s.scope_key,CASE WHEN s.response='deferred' THEN 'deferred' ELSE s.evidence_fingerprint END,s.updated_at DESC
 ) q);
END $$;

CREATE OR REPLACE FUNCTION public.confirm_logging_coverage(p_domain TEXT,p_local_date DATE,p_coverage_through TIMESTAMPTZ,p_status TEXT,p_request_id TEXT,p_expected_source_revision BIGINT,p_timezone_offset INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.recommendation_refresh_state; c public.logging_coverage_confirmations; payload JSONB;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 payload:=jsonb_build_object('domain',p_domain,'localDate',p_local_date,'through',p_coverage_through,'status',p_status,'sourceRevision',p_expected_source_revision,'timezoneOffset',p_timezone_offset);
 INSERT INTO public.recommendation_refresh_state(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.recommendation_refresh_state WHERE user_id=auth.uid() FOR UPDATE;
 SELECT * INTO c FROM public.logging_coverage_confirmations WHERE user_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN IF c.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Coverage replay payload changed' USING ERRCODE='22023'; END IF;RETURN to_jsonb(c); END IF;
 IF p_domain IS DISTINCT FROM 'nutrition' OR p_status IS NULL OR p_status NOT IN ('complete_through','partial','unknown') OR length(coalesce(p_request_id,'')) NOT BETWEEN 8 AND 200 OR p_timezone_offset IS NULL OR p_timezone_offset NOT BETWEEN -840 AND 840 OR p_coverage_through IS NULL OR p_coverage_through>clock_timestamp() OR (p_coverage_through AT TIME ZONE 'UTC'-make_interval(mins=>p_timezone_offset))::date IS DISTINCT FROM p_local_date OR p_local_date IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'UTC'-make_interval(mins=>p_timezone_offset))::date THEN RAISE EXCEPTION 'Invalid bounded coverage confirmation' USING ERRCODE='22023'; END IF;
 IF s.source_revision IS DISTINCT FROM p_expected_source_revision THEN RAISE EXCEPTION 'Coverage sources changed' USING ERRCODE='40001'; END IF;
 INSERT INTO public.logging_coverage_confirmations(user_id,domain,local_date,timezone_offset,coverage_through,status,source_revision,nutrition_revision,request_id,payload) VALUES(auth.uid(),p_domain,p_local_date,p_timezone_offset,p_coverage_through,p_status,s.source_revision,s.nutrition_revision,p_request_id,payload) RETURNING * INTO c;
 RETURN to_jsonb(c);
END $$;

CREATE OR REPLACE FUNCTION public.read_recommendations(p_user_id UUID,p_runtime_fingerprint TEXT,p_local_date DATE,p_timezone_offset INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.recommendation_refresh_state; context JSONB; pending BOOLEAN; visible JSONB; suppressions JSONB; due JSONB; coverage JSONB; outcomes JSONB;
BEGIN
 INSERT INTO public.recommendation_refresh_state(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.recommendation_refresh_state WHERE user_id=p_user_id;
 context:=public.recommendation_scope(p_user_id,p_runtime_fingerprint,p_local_date,p_timezone_offset);
 pending:=s.source_revision<>s.processed_source_revision OR s.response_revision<>s.processed_response_revision OR s.processed_context IS DISTINCT FROM context OR s.last_error IS NOT NULL OR s.next_due_at<=clock_timestamp();
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO visible FROM public.recommendations r WHERE r.user_id=p_user_id AND r.id=s.current_recommendation_id AND NOT coalesce(pending,true) AND r.lifecycle='active' AND r.valid_until>clock_timestamp() AND r.runtime_fingerprint=p_runtime_fingerprint AND r.local_date=p_local_date AND r.timezone_offset=p_timezone_offset AND r.plan_version_id IS NOT DISTINCT FROM (context->>'activePlanId')::uuid AND r.intent_memory_id IS NOT DISTINCT FROM (context->>'intentMemoryId')::uuid AND r.intent_version IS NOT DISTINCT FROM (context->>'intentVersion')::integer AND NOT public.recommendation_suppressed(p_user_id,r.scope_key,r.evidence_fingerprint);
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO suppressions FROM (SELECT * FROM public.recommendation_suppressions WHERE user_id=p_user_id AND (response<>'deferred' OR defer_until>clock_timestamp()) ORDER BY updated_at DESC LIMIT 100) q;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO due FROM (SELECT r.* FROM public.recommendations r WHERE r.user_id=p_user_id AND r.decision->'outcome'<>'null'::jsonb AND (r.decision#>>'{outcome,dueAt}')::timestamptz<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM public.recommendation_events e WHERE e.user_id=p_user_id AND e.recommendation_id=r.id AND e.event_type='outcome') ORDER BY r.created_at LIMIT 20) q;
 SELECT to_jsonb(c)||jsonb_build_object('coverageValid',c.nutrition_revision=s.nutrition_revision) INTO coverage FROM public.logging_coverage_confirmations c WHERE c.user_id=p_user_id AND c.local_date=p_local_date AND c.timezone_offset=p_timezone_offset ORDER BY c.created_at DESC,c.id DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(q.value),'[]') INTO outcomes FROM (SELECT jsonb_build_object('id',e.id,'recommendationId',r.id,'title',r.decision->>'title','lifecycle',r.lifecycle,'payload',e.payload,'createdAt',e.created_at,'invalidated',EXISTS(SELECT 1 FROM public.recommendation_events i WHERE i.user_id=p_user_id AND i.event_type='outcome_invalidated' AND i.payload->>'outcomeEventId'=e.id::text),'invalidations',(SELECT coalesce(jsonb_agg(i.payload),'[]') FROM public.recommendation_events i WHERE i.user_id=p_user_id AND i.event_type='outcome_invalidated' AND i.payload->>'outcomeEventId'=e.id::text)) value FROM public.recommendation_events e JOIN public.recommendations r ON r.id=e.recommendation_id AND r.user_id=e.user_id WHERE e.user_id=p_user_id AND e.event_type='outcome' ORDER BY e.created_at DESC,e.id DESC LIMIT 20) q;
 RETURN jsonb_build_object('recommendations',visible,'refreshState',jsonb_build_object('sourceRevision',s.source_revision,'responseRevision',s.response_revision,'nutritionRevision',s.nutrition_revision,'processedSourceRevision',s.processed_source_revision,'processedResponseRevision',s.processed_response_revision,'pending',coalesce(pending,true),'lastError',s.last_error),'suppressions',suppressions,'dueOutcomes',due,'coverage',coverage,'outcomes',outcomes);
END $$;

CREATE OR REPLACE FUNCTION public.record_recommendation_outcome(p_user_id UUID,p_recommendation_id UUID,p_request_id TEXT,p_outcome JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.recommendations; e public.recommendation_events; source_ref JSONB; canonical JSONB; g public.performance_observation_groups; v public.performance_observation_values; binding JSONB; linked UUID;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':recommendation-event:'||p_request_id,0));
 SELECT * INTO e FROM public.recommendation_events WHERE user_id=p_user_id AND request_id=p_request_id;
 IF FOUND THEN IF e.recommendation_id<>p_recommendation_id OR e.event_type<>'outcome' OR e.payload IS DISTINCT FROM p_outcome THEN RAISE EXCEPTION 'Outcome replay payload changed' USING ERRCODE='22023'; END IF;RETURN to_jsonb(e); END IF;
 SELECT * INTO r FROM public.recommendations WHERE id=p_recommendation_id AND user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown owned recommendation' USING ERRCODE='42501'; END IF;
 IF r.decision#>>'{outcome,dueAt}' IS NULL OR (r.decision#>>'{outcome,dueAt}')::timestamptz>clock_timestamp() THEN RAISE EXCEPTION 'Outcome follow-up is not due' USING ERRCODE='22023'; END IF;
 IF length(coalesce(p_request_id,'')) NOT BETWEEN 8 AND 200 OR jsonb_typeof(p_outcome) IS DISTINCT FROM 'object' OR p_outcome->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR p_outcome->>'adherence' IS NULL OR p_outcome->>'adherence' NOT IN ('reported','observed','unknown') OR jsonb_typeof(p_outcome->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(p_outcome->'evidence')>20 OR length(coalesce(p_outcome->>'summary','')) NOT BETWEEN 1 AND 1500 OR jsonb_typeof(p_outcome->'attributionLimits') IS DISTINCT FROM 'array' OR r.decision->'outcome'='null'::jsonb THEN RAISE EXCEPTION 'Invalid outcome evidence contract' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.recommendation_events WHERE user_id=p_user_id AND recommendation_id=r.id AND event_type='outcome') THEN RAISE EXCEPTION 'Follow-up already recorded' USING ERRCODE='23505'; END IF;
 IF p_outcome->>'adherence'='observed' AND (r.lifecycle='withdrawn' OR r.withdrawal_reason IS NOT NULL OR jsonb_array_length(p_outcome->'evidence')=0) THEN RAISE EXCEPTION 'Observed outcome unavailable' USING ERRCODE='22023'; END IF;
 IF p_outcome->>'adherence'='reported' AND NOT EXISTS(SELECT 1 FROM public.recommendation_events WHERE user_id=p_user_id AND recommendation_id=r.id AND event_type='response' AND payload->>'response'='done_reported') THEN RAISE EXCEPTION 'Reported adherence needs athlete report' USING ERRCODE='22023'; END IF;
 -- Lock linked canonical workouts before observation rows, matching correction order.
 IF p_outcome->>'adherence'='observed' AND r.decision#>>'{outcome,kind}'='measurement' THEN
 FOR linked IN SELECT DISTINCT pg.workout_id FROM public.performance_observation_groups pg JOIN jsonb_array_elements(p_outcome->'evidence') ref ON ref->>'table'='performance_observation_groups' AND ref->>'id'=pg.id::text WHERE pg.user_id=p_user_id AND pg.workout_id IS NOT NULL ORDER BY pg.workout_id LOOP
 PERFORM 1 FROM public.workouts WHERE id=linked AND user_id=p_user_id AND capture_revision=1 AND execution_revision=0 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outcome measurement execution changed' USING ERRCODE='40001'; END IF;
 END LOOP;
 END IF;
 FOR source_ref IN SELECT value FROM jsonb_array_elements(p_outcome->'evidence') ORDER BY CASE value->>'table' WHEN 'workouts' THEN 0 WHEN 'prescribed_sessions' THEN 1 WHEN 'performance_observation_groups' THEN 2 WHEN 'performance_observation_values' THEN 3 ELSE 4 END,value->>'id' LOOP
 IF source_ref->>'table' NOT IN ('workouts','prescribed_sessions','performance_observation_groups','performance_observation_values','recommendation_events') OR source_ref->>'table' IS NULL THEN RAISE EXCEPTION 'Unsupported outcome source' USING ERRCODE='22023'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND user_id=$2 FOR %s',source_ref->>'table',CASE WHEN source_ref->>'table'='performance_observation_groups' THEN 'UPDATE' ELSE 'SHARE' END) INTO canonical USING (source_ref->>'id')::uuid,p_user_id;
 IF canonical IS NULL THEN RAISE EXCEPTION 'Outcome source is not owned or available' USING ERRCODE='42501'; END IF;
 IF source_ref->>'table'='recommendation_events' AND (p_outcome->>'adherence'<>'reported' OR canonical->>'event_type'<>'response' OR canonical#>>'{payload,response}'<>'done_reported' OR canonical->>'recommendation_id'<>r.id::text) THEN RAISE EXCEPTION 'Reported source must be this athlete response' USING ERRCODE='22023'; END IF;
 IF p_outcome->>'adherence'='observed' THEN
 IF source_ref->>'table'='workouts' AND ((canonical->>'capture_revision')::integer<>1 OR (canonical->>'execution_revision')::integer<>0 OR source_ref->'revision' IS DISTINCT FROM canonical->'capture_revision') THEN RAISE EXCEPTION 'Outcome execution changed' USING ERRCODE='40001'; END IF;
 IF source_ref->>'table'='prescribed_sessions' AND (canonical->>'status'<>'completed' OR canonical->>'id' IS DISTINCT FROM r.decision#>>'{outcome,sourceId}' OR (canonical->>'completed_at')::timestamptz<r.created_at OR (canonical->>'completed_at')::timestamptz>(r.decision#>>'{outcome,dueAt}')::timestamptz) THEN RAISE EXCEPTION 'Outcome session is not a later matching completion' USING ERRCODE='22023'; END IF;
 IF source_ref->>'table' IN ('performance_observation_groups','performance_observation_values') AND canonical->>'status'<>'complete' THEN RAISE EXCEPTION 'Outcome measurement was retracted' USING ERRCODE='40001'; END IF;
 END IF;
 END LOOP;
 SELECT * INTO r FROM public.recommendations WHERE id=p_recommendation_id AND user_id=p_user_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.recommendation_events WHERE user_id=p_user_id AND recommendation_id=r.id AND event_type='outcome') THEN RAISE EXCEPTION 'Follow-up already recorded' USING ERRCODE='23505'; END IF;
 IF p_outcome->>'adherence'='observed' AND (r.lifecycle='withdrawn' OR r.withdrawal_reason IS NOT NULL) THEN RAISE EXCEPTION 'Observed outcome unavailable' USING ERRCODE='40001'; END IF;
 IF p_outcome->>'adherence'='observed' AND r.decision#>>'{outcome,kind}'='measurement' AND (p_outcome->'metricId' IS DISTINCT FROM r.decision#>'{outcome,metricId}' OR p_outcome->'unit' IS DISTINCT FROM r.decision#>'{outcome,unit}' OR p_outcome->'binding' IS DISTINCT FROM r.decision#>'{outcome,binding}') THEN RAISE EXCEPTION 'Outcome comparability binding changed' USING ERRCODE='22023'; END IF;
 IF p_outcome->>'adherence'='observed' AND r.decision#>>'{outcome,kind}'='measurement' THEN
 binding:=r.decision#>'{outcome,binding}';
 IF (SELECT count(*) FROM jsonb_array_elements(p_outcome->'evidence') ref WHERE ref->>'table'='performance_observation_groups')<>1 OR (SELECT count(*) FROM jsonb_array_elements(p_outcome->'evidence') ref WHERE ref->>'table'='performance_observation_values')<>1 THEN RAISE EXCEPTION 'One comparable measurement pair required' USING ERRCODE='22023'; END IF;
 SELECT pg.* INTO g FROM public.performance_observation_groups pg JOIN jsonb_array_elements(p_outcome->'evidence') ref ON ref->>'table'='performance_observation_groups' AND ref->>'id'=pg.id::text WHERE pg.user_id=p_user_id;
 SELECT pv.* INTO v FROM public.performance_observation_values pv JOIN jsonb_array_elements(p_outcome->'evidence') ref ON ref->>'table'='performance_observation_values' AND ref->>'id'=pv.id::text WHERE pv.user_id=p_user_id;
 IF g.status IS DISTINCT FROM 'complete' OR g.verification_status IS DISTINCT FROM 'athlete_confirmed' OR g.verified_by IS DISTINCT FROM p_user_id
 OR NOT coalesce((g.source_kind='manual' AND g.source_system='sociusfit_training_baseline' AND g.metadata->>'origin'='athlete_reported') OR (g.source_kind='coach_completion' AND g.source_system='sociusfit' AND g.metadata->'completionContractVersion'='2'::jsonb AND g.workout_id IS NOT NULL AND g.prescribed_session_id IS NOT NULL),false)
 OR g.assessment_definition_id IS DISTINCT FROM binding#>>'{measurement,assessmentDefinition,id}' OR g.protocol_version IS DISTINCT FROM binding#>>'{measurement,protocol,version}'
 OR g.metadata->>'assessmentDefinitionVersion' IS DISTINCT FROM binding#>>'{measurement,assessmentDefinition,version}' OR g.metadata->>'protocolId' IS DISTINCT FROM binding#>>'{measurement,protocol,id}'
 OR g.comparison_modifiers IS DISTINCT FROM public.training_outcome_comparison(binding) OR g.observed_at<r.created_at OR g.observed_at>(r.decision#>>'{outcome,dueAt}')::timestamptz
 OR v.group_id IS DISTINCT FROM g.id OR v.status IS DISTINCT FROM 'complete' OR v.semantic_role IS DISTINCT FROM 'direct_outcome' OR v.metric_id IS DISTINCT FROM r.decision#>>'{outcome,metricId}' OR v.unit IS DISTINCT FROM r.decision#>>'{outcome,unit}' OR v.value_numeric IS NULL OR v.value_numeric::text IN ('NaN','Infinity','-Infinity')
 OR (SELECT count(*) FROM public.performance_observation_values pv WHERE pv.user_id=p_user_id AND pv.group_id=g.id AND pv.status='complete' AND pv.semantic_role='direct_outcome' AND pv.metric_id=v.metric_id AND pv.unit=v.unit)<>1
 OR (g.workout_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.workouts w WHERE w.id=g.workout_id AND w.user_id=p_user_id AND w.capture_revision=1 AND w.execution_revision=0))
 THEN RAISE EXCEPTION 'Outcome measurement comparability changed' USING ERRCODE='40001'; END IF;
 END IF;
 IF p_outcome->>'adherence'='observed' AND r.decision#>>'{outcome,kind}'='session_completion' AND NOT EXISTS(SELECT 1 FROM public.prescribed_sessions ps JOIN public.workouts w ON w.id=ps.completed_workout_id AND w.user_id=ps.user_id WHERE ps.user_id=p_user_id AND ps.id=(r.decision#>>'{outcome,sourceId}')::uuid AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_outcome->'evidence') ref WHERE ref->>'table'='prescribed_sessions' AND ref->>'id'=ps.id::text) AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_outcome->'evidence') ref WHERE ref->>'table'='workouts' AND ref->>'id'=w.id::text)) THEN RAISE EXCEPTION 'Outcome linked completion evidence missing' USING ERRCODE='22023'; END IF;
 INSERT INTO public.recommendation_events(user_id,recommendation_id,request_id,event_type,payload) VALUES(p_user_id,r.id,p_request_id,'outcome',p_outcome) RETURNING * INTO e;
 RETURN to_jsonb(e);
END $$;

-- Remove only this feature's unpublished earlier-draft wearable triggers when
-- replaying the local migration. Wearable data is not consumed by these rules.
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['whoop_recovery','whoop_sleep','whoop_cycles','whoop_workouts','whoop_sync_status','whoop_tokens'] LOOP
 IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('DROP TRIGGER IF EXISTS dirty_recommendations ON public.%I',t); END IF;
 END LOOP;
END $$;

-- Exact consumed fields: source dates/status, authoritative plan/review state,
-- baseline comparability/eligibility and factual logged nutrition. No legacy
-- insight/PR projection, raw-media, token-secret or request/draft trigger exists.
DO $$ DECLARE t TEXT; fields TEXT; BEGIN
 FOR t,fields IN SELECT * FROM (VALUES
 ('training_programs','status,active_plan_version_id,start_date,end_date'),
 ('training_plan_versions','program_id,status,version,policy_version,intent,window_start,window_end'),
 ('prescribed_sessions','plan_version_id,scheduled_date,status,completed_workout_id,completed_at,prescription'),
 ('adaptation_proposals','base_plan_version_id,proposed_plan_version_id,status,weekly_review_id'),
 ('coach_weekly_reviews','base_plan_version_id,action,supersedes_review_id,review_revision'),
 ('coach_review_source_invalidations','review_id,activity_revision_id,observation_group_id,reason'),
 ('coach_memories','memory_key,status,version,content,effective_from,effective_until,review_after'),
 ('coach_checkins','plan_version_id,prescribed_session_id,checkin_type,responses,occurred_at'),
 ('performance_observation_groups','workout_id,prescribed_session_id,status,observed_at,source_kind,source_import_id,assessment_definition_id,assessment_catalog_version,protocol_version,verification_status,verified_by,source_system,comparison_modifiers,metadata'),
 ('performance_observation_values','group_id,metric_id,semantic_role,value_numeric,unit,status,provenance'),
 ('measurement_imports','status,verification_status'),
 ('workouts','workout_date,execution_status,capture_revision,execution_revision'),
 ('meals','meal_timestamp,capture_revision,capture_provenance,total_protein,total_carbs,total_fat,total_calories'),
 ('daily_targets','target_protein,target_carbs,target_fat,target_calories'),
 ('logging_coverage_confirmations','domain,local_date,timezone_offset,coverage_through,status,nutrition_revision')
 ) AS inventory(name,columns) LOOP
 IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Recommendation source table missing: %',t; END IF;
 IF EXISTS(SELECT 1 FROM unnest(string_to_array(fields,',')) field WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t AND c.column_name=field)) THEN RAISE EXCEPTION 'Recommendation source column missing: %',t; END IF;
 EXECUTE format('DROP TRIGGER IF EXISTS dirty_recommendations ON public.%I',t);
 EXECUTE format('CREATE TRIGGER dirty_recommendations AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.invalidate_recommendation_source(%L)',t,fields);
 END LOOP;
END $$;

ALTER TABLE public.logging_request_items ADD COLUMN IF NOT EXISTS recommendation_id UUID;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS capture_recommendation_id UUID;
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS capture_recommendation_id UUID;
DO $$ DECLARE t TEXT; column_name TEXT; BEGIN
 FOR t,column_name IN SELECT * FROM (VALUES('logging_request_items','recommendation_id'),('workouts','capture_recommendation_id'),('meals','capture_recommendation_id')) x(t,c) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=t||'_recommendation_owner') THEN
 EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(%I,user_id) REFERENCES public.recommendations(id,user_id) ON DELETE SET NULL(%I)',t,t||'_recommendation_owner',column_name,column_name);
 END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.bind_capture_recommendation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 NEW.recommendation_id:=nullif(NEW.payload->>'recommendationId','')::uuid;
 IF NEW.recommendation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=NEW.recommendation_id AND user_id=NEW.user_id) THEN RAISE EXCEPTION 'Unknown owned recommendation origin' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bind_capture_recommendation ON public.logging_request_items;
CREATE TRIGGER bind_capture_recommendation BEFORE INSERT ON public.logging_request_items FOR EACH ROW EXECUTE FUNCTION public.bind_capture_recommendation();

-- Additive copies of the narrowly adapted W2 functions follow. Their previous
-- definitions remain unchanged in the earlier migration and old seven-argument
-- planned-completion replay retains its original contract.
CREATE OR REPLACE FUNCTION public.validate_capture_operation(p JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f JSONB; k TEXT; r JSONB:=p->'record'; pr JSONB:=p->'provenance';
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR length(p::text)>250000
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) x WHERE x NOT IN ('sourceItemId','kind','record','blocks','provenance','inputMethod','eventAt','recommendationId','response','eventPrecision','eventTimezoneOffset'))
 OR p->>'kind' NOT IN ('workout','meal') OR p->>'kind' IS NULL
 OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'blocks') IS DISTINCT FROM 'array'
 OR p->>'inputMethod' NOT IN ('text','voice','photo','template','catalog','manual','coach','program') OR p->>'inputMethod' IS NULL
 OR jsonb_typeof(p->'eventAt') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid capture operation' USING ERRCODE='22023'; END IF;
 PERFORM (p->>'eventAt')::timestamptz;
 IF p ? 'eventPrecision' AND p->>'eventPrecision' NOT IN ('date','timestamp') THEN RAISE EXCEPTION 'Invalid event precision' USING ERRCODE='22023'; END IF;
 IF p->>'eventPrecision'='date' AND p->>'eventAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR p->>'eventPrecision'='timestamp' AND p->>'eventAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Event precision does not match event value' USING ERRCODE='22023'; END IF;
 IF p ? 'eventTimezoneOffset' AND (jsonb_typeof(p->'eventTimezoneOffset') IS DISTINCT FROM 'number' OR (p->>'eventTimezoneOffset')::numeric NOT BETWEEN -840 AND 840 OR (p->>'eventTimezoneOffset')::numeric<>trunc((p->>'eventTimezoneOffset')::numeric)) THEN RAISE EXCEPTION 'Invalid event timezone offset' USING ERRCODE='22023'; END IF;
 IF p->>'kind'='workout' AND ((p->>'eventAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND p->>'eventAt' IS DISTINCT FROM r->>'workout_date') OR (p->>'eventAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND ((p->>'eventAt')::timestamptz AT TIME ZONE 'UTC' - make_interval(mins=>coalesce((p->>'eventTimezoneOffset')::integer,0)))::date IS DISTINCT FROM (r->>'workout_date')::date)) THEN RAISE EXCEPTION 'Workout event date does not match its local scope' USING ERRCODE='22023'; END IF;
 IF p ? 'response' AND jsonb_typeof(p->'response') <> 'object' THEN RAISE EXCEPTION 'Invalid capture response' USING ERRCODE='22023'; END IF;
 IF coalesce(p->>'recommendationId','')<>'' AND NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=(p->>'recommendationId')::uuid AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Unknown owned recommendation origin' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(pr) IS DISTINCT FROM 'object' OR pr->'schemaVersion' IS DISTINCT FROM '1'::jsonb
 OR jsonb_typeof(pr->'occurrence') IS DISTINCT FROM 'object' OR jsonb_typeof(pr->'fields') IS DISTINCT FROM 'object'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(pr) x WHERE x NOT IN ('schemaVersion','occurrence','fields')) THEN RAISE EXCEPTION 'Invalid capture provenance' USING ERRCODE='22023'; END IF;
 FOR f IN SELECT pr->'occurrence' UNION ALL SELECT value FROM jsonb_each(pr->'fields') LOOP
 IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR f->>'origin' IS NULL OR f->>'origin' NOT IN ('athlete_reported','model_estimated','copied_template','imported_unverified','legacy_unknown')
 OR f->>'reviewState' IS NULL OR f->>'reviewState' NOT IN ('unreviewed','athlete_confirmed','corrected')
 OR jsonb_typeof(f->'sourceReferences') IS DISTINCT FROM 'array'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(f) x WHERE x NOT IN ('origin','reviewState','sourceReferences'))
 THEN RAISE EXCEPTION 'Invalid field provenance' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(f->'sourceReferences')>30 OR EXISTS(SELECT 1 FROM jsonb_array_elements(f->'sourceReferences') x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>500)
 THEN RAISE EXCEPTION 'Invalid source references' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(r) x WHERE x IN ('audio','image','bytes','base64','user_id','id','capture_revision','capture_provenance','captured_at','execution_source','prescribed_session_id'))
 OR (r ? 'photo_url' AND r->'photo_url'<>'null'::jsonb) THEN RAISE EXCEPTION 'Server identity or raw media is not a capture field' USING ERRCODE='22023'; END IF;
 IF p->>'kind'='meal' AND EXISTS(SELECT 1 FROM jsonb_object_keys(r) x WHERE x NOT IN ('meal_timestamp','meal_timing','items','total_protein','total_carbs','total_fat','total_calories','needs_review','ai_confidence','input_text','photo_url','manual_override','reviewed_at','entry_method','source_meal_id'))
 OR p->>'kind'='workout' AND EXISTS(SELECT 1 FROM jsonb_object_keys(r) x WHERE x NOT IN ('workout_date','input_text','blocks','primary_score','total_duration_min','tags','notes','rpe','reported_rpe','parse_confidence'))
 THEN RAISE EXCEPTION 'Unsupported normalized activity field' USING ERRCODE='22023'; END IF;
 IF jsonb_path_exists(p,'$.** ? (@.type() == "object").keyvalue() ? (@.key == "base64" || @.key == "bytes" || @.key == "audio" || @.key == "image" || @.key == "rawPhoto" || @.key == "rawAudio")') OR p::text ~* 'data:(image|audio)/'
 THEN RAISE EXCEPTION 'Raw media cannot be stored in capture records' USING ERRCODE='22023'; END IF;
 IF p->>'kind'='workout' AND ((r ? 'rpe' AND r->'rpe'<>'null'::jsonb AND (jsonb_typeof(r->'rpe')<>'number' OR (r->>'rpe')::numeric NOT BETWEEN 0 AND 10)) OR
 (r ? 'reported_rpe' AND r->'reported_rpe'<>'null'::jsonb AND (jsonb_typeof(r->'reported_rpe')<>'number' OR (r->>'reported_rpe')::numeric NOT BETWEEN 0 AND 10))) THEN RAISE EXCEPTION 'Invalid captured effort' USING ERRCODE='22023'; END IF;
 IF p->>'kind'='meal' THEN
 IF jsonb_typeof(r->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'items') NOT BETWEEN 1 AND 100 OR (r->>'meal_timestamp')::timestamptz IS DISTINCT FROM (p->>'eventAt')::timestamptz
 THEN RAISE EXCEPTION 'Invalid meal capture' USING ERRCODE='22023'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(r->'items') LOOP
 IF jsonb_typeof(f->'food') IS DISTINCT FROM 'string' OR length(btrim(f->>'food')) NOT BETWEEN 1 AND 500 OR jsonb_typeof(f->'portion') IS DISTINCT FROM 'string' OR length(btrim(f->>'portion')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Food and portion are required' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['protein','carbs','fat','calories'] LOOP
 IF jsonb_typeof(f->k) IS DISTINCT FROM 'number' OR (f->>k)::numeric<0 OR (f->>k)::numeric>50000 THEN RAISE EXCEPTION 'Meal items need normalized nonnegative macros' USING ERRCODE='22023'; END IF;
 END LOOP; END LOOP;
 IF r->>'source_meal_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.meals WHERE id=(r->>'source_meal_id')::uuid AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Unknown source meal' USING ERRCODE='42501'; END IF;
 IF r->>'source_meal_id' IS NOT NULL AND r->>'entry_method' IS DISTINCT FROM 'quick_log' THEN RAISE EXCEPTION 'Source meal requires template entry method' USING ERRCODE='22023'; END IF;
 ELSE
 IF jsonb_typeof(r->'blocks') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'blocks') NOT BETWEEN 1 AND 100
 OR jsonb_array_length(r->'blocks')<>jsonb_array_length(p->'blocks') OR (r->>'workout_date')::date IS NULL THEN RAISE EXCEPTION 'Invalid workout capture' USING ERRCODE='22023'; END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.commit_logging_request_item(p_item_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.logging_request_items; l public.logging_requests; p JSONB; r JSONB; v_id UUID; v_revision INTEGER:=1; v_receipt JSONB; amendment JSONB; t TIMESTAMPTZ:=now();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 -- Always ledger then child, matching freeze and old save lock order.
 SELECT q.* INTO l FROM public.logging_requests q JOIN public.logging_request_items i ON i.request_id=q.id AND i.user_id=q.user_id WHERE i.id=p_item_id AND q.user_id=auth.uid() FOR UPDATE OF q;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture item' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT x FROM public.logging_request_items WHERE id=p_item_id AND user_id=auth.uid() FOR UPDATE;
 IF x.status='committed' THEN RETURN x.receipt; END IF;
 IF x.status='canceled' THEN RAISE EXCEPTION 'This child was explicitly canceled without a canonical write' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM public.activity_drafts WHERE id=x.draft_id AND user_id=auth.uid() AND status='draft' AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Capture draft expired or discarded; review before saving' USING ERRCODE='55000'; END IF;
 p:=x.payload; r:=public.capture_normalized_record(x.kind,p->'record');
 IF p#>'{response,correction}' IS NOT NULL THEN
 amendment:=public.amend_logged_activity(x.kind,(p#>>'{response,correction,entityId}')::uuid,(p#>>'{response,correction,expectedRevision}')::integer,'draft-commit:'||x.id::text,r,p->'blocks',p->'provenance');
 v_id:=(amendment->>'entityId')::uuid;v_revision:=(amendment->>'revision')::integer;
 UPDATE public.logging_requests SET entities=entities||jsonb_build_array(jsonb_build_object('kind',x.kind,'id',v_id)) WHERE id=l.id;
 ELSE
 v_id:=public.save_logged_activity_legacy_capture(x.kind,r,CASE WHEN x.kind='workout' THEN public.capture_block_projections(r->'blocks') ELSE '[]'::jsonb END,l.id,NULL);
 IF x.kind='meal' THEN
 UPDATE public.meals SET reviewed_at=(r->>'reviewed_at')::timestamptz,entry_method=coalesce(r->>'entry_method','other'),source_meal_id=(r->>'source_meal_id')::uuid,manual_override=coalesce((r->>'manual_override')::boolean,false),capture_provenance=p->'provenance',capture_input_method=p->>'inputMethod',capture_recommendation_id=x.recommendation_id,captured_at=t WHERE id=v_id AND user_id=auth.uid();
 ELSE
 UPDATE public.workouts SET capture_provenance=p->'provenance',capture_input_method=p->>'inputMethod',capture_recommendation_id=x.recommendation_id,captured_at=t,total_duration_min=(r->>'total_duration_min')::integer WHERE id=v_id AND user_id=auth.uid();
 UPDATE public.block_scores SET is_pr=false WHERE workout_id=v_id AND user_id=auth.uid();
 END IF;
 IF x.kind='workout' AND p#>>'{provenance,fields,quantities,origin}'='athlete_reported' AND p#>>'{provenance,fields,quantities,reviewState}' IN ('athlete_confirmed','corrected') THEN PERFORM public.capture_refresh_prs(v_id,'[]',false); END IF;
 PERFORM public.capture_snapshot(x.kind,v_id,x.id,false,NULL,r,(p->>'eventAt')::timestamptz,coalesce(p->>'eventPrecision',CASE WHEN p->>'eventAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'date' ELSE 'timestamp' END));
 END IF;
 v_receipt:=jsonb_build_object('schemaVersion',2,'userId',auth.uid(),'requestId',l.id,'requestKey',l.request_key,'operationId',x.id,'entityKind',x.kind,'entityId',v_id,'revision',v_revision,'eventPrecision',coalesce(p->>'eventPrecision',CASE WHEN p->>'eventAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'date' ELSE 'timestamp' END),'eventAt',p->>'eventAt','capturedAt',t,'inputMethod',p->>'inputMethod','state','saved','provenance',p->'provenance','recommendationId',CASE WHEN amendment IS NOT NULL THEN amendment->'recommendationId' ELSE to_jsonb(x.recommendation_id) END,'projectionsStatus',CASE WHEN x.kind='workout' THEN 'recomputed_supported_only' ELSE 'recomputed' END);
 UPDATE public.logging_request_items SET status='committed',canonical_id=v_id,canonical_revision=v_revision,receipt=v_receipt,workout_id=CASE WHEN kind='workout' THEN v_id END,meal_id=CASE WHEN kind='meal' THEN v_id END WHERE id=x.id;
 UPDATE public.activity_drafts SET status='committed',original_entity_id=v_id,workout_id=CASE WHEN kind='workout' THEN v_id END,meal_id=CASE WHEN kind='meal' THEN v_id END,updated_at=t WHERE id=x.draft_id;
 RETURN v_receipt;
END $$;

CREATE OR REPLACE FUNCTION public.mutate_capture_activity(p_kind TEXT,p_entity_id UUID,p_expected_revision INTEGER,p_request_id TEXT,p_record JSONB,p_blocks JSONB,p_provenance JSONB,p_execution BOOLEAN,p_delete BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload JSONB; op public.activity_mutations; prior JSONB; r JSONB; b JSONB; t TIMESTAMPTZ:=now(); v INTEGER; out_receipt JSONB; event_time TIMESTAMPTZ; execution JSONB;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 IF p_kind NOT IN ('workout','meal') OR p_kind IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR length(p_request_id) NOT BETWEEN 8 AND 200 OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid amendment identity' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('kind',p_kind,'entityId',p_entity_id,'expectedRevision',p_expected_revision,'record',p_record,'blocks',p_blocks,'provenance',p_provenance,'execution',p_execution,'delete',p_delete);
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id,0));
 SELECT * INTO op FROM public.activity_mutations WHERE user_id=auth.uid() AND request_key=p_request_id;
 IF FOUND THEN
 IF op.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Amendment request reused with different data' USING ERRCODE='22023'; END IF;
 RETURN op.receipt;
 END IF;
 IF p_kind='meal' THEN
 SELECT to_jsonb(m) INTO prior FROM public.meals m WHERE id=p_entity_id AND user_id=auth.uid() FOR UPDATE;
 ELSE
 SELECT to_jsonb(w) INTO prior FROM public.workouts w WHERE id=p_entity_id AND user_id=auth.uid() FOR UPDATE;
 END IF;
 IF prior IS NULL THEN RAISE EXCEPTION 'Unknown activity' USING ERRCODE='42501'; END IF;
 v:=(prior->>'capture_revision')::integer;
 event_time:=coalesce((SELECT event_at FROM public.activity_revisions WHERE original_entity_id=p_entity_id AND user_id=auth.uid() AND entity_kind=p_kind AND revision=v),CASE WHEN p_kind='meal' THEN (prior->>'meal_timestamp')::timestamptz ELSE (prior->>'workout_date')::date::timestamptz END);
 IF v<>p_expected_revision THEN RAISE EXCEPTION 'Activity revision changed; reload before correcting' USING ERRCODE='40001'; END IF;
 IF p_kind='workout' AND prior->>'execution_source'='program_runner' THEN
 IF NOT p_execution OR p_delete OR prior->>'execution_status'<>'completed' THEN RAISE EXCEPTION 'Use the dedicated completed execution amendment' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.prescribed_sessions WHERE completed_workout_id=p_entity_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Execution link is unavailable' USING ERRCODE='55000'; END IF;
 SELECT jsonb_build_object('supersedesRevision',v,'prescribedSessionId',s.id,'planVersionId',s.plan_version_id,'acceptedPrescription',s.prescription,
 'originalCheckinIds',(SELECT coalesce(jsonb_agg(c.id),'[]') FROM public.coach_checkins c WHERE c.prescribed_session_id=s.id AND c.user_id=auth.uid()),
 'originalObservationGroupIds',(SELECT coalesce(jsonb_agg(g.id),'[]') FROM public.performance_observation_groups g WHERE g.prescribed_session_id=s.id AND g.user_id=auth.uid())) INTO execution
 FROM public.prescribed_sessions s WHERE completed_workout_id=p_entity_id AND user_id=auth.uid();
 ELSIF p_execution THEN RAISE EXCEPTION 'This is not a program execution' USING ERRCODE='22023'; END IF;
 INSERT INTO public.activity_mutations(user_id,request_key,payload) VALUES(auth.uid(),p_request_id,payload) RETURNING * INTO op;
 -- Unknown legacy history is observed now, never backdated to the event date.
 PERFORM public.capture_snapshot(p_kind,p_entity_id,op.id);
 IF NOT p_delete THEN
 event_time:=CASE WHEN p_kind='meal' THEN (p_record->>'meal_timestamp')::timestamptz WHEN p_record->>'workout_date'=prior->>'workout_date' THEN coalesce((SELECT event_at FROM public.activity_revisions WHERE original_entity_id=p_entity_id AND user_id=auth.uid() AND entity_kind=p_kind AND revision=v),(p_record->>'workout_date')::date::timestamptz) ELSE (p_record->>'workout_date')::date::timestamptz END;
 PERFORM public.validate_capture_operation(jsonb_build_object('kind',p_kind,'record',p_record,'blocks',p_blocks,'provenance',p_provenance,'inputMethod',prior->>'capture_input_method','eventAt',CASE WHEN p_kind='workout' THEN to_jsonb(p_record->>'workout_date') ELSE to_jsonb(event_time) END));
 r:=public.capture_normalized_record(p_kind,p_record);
 END IF;
 IF p_kind='meal' THEN
 IF NOT p_delete THEN
 UPDATE public.meals SET meal_timestamp=(r->>'meal_timestamp')::timestamptz,meal_timing=r->>'meal_timing',items=r->'items',total_protein=(r->>'total_protein')::numeric,total_carbs=(r->>'total_carbs')::numeric,total_fat=(r->>'total_fat')::numeric,total_calories=(r->>'total_calories')::numeric,
 needs_review=coalesce((r->>'needs_review')::boolean,true),manual_override=coalesce((r->>'manual_override')::boolean,false),reviewed_at=(r->>'reviewed_at')::timestamptz,entry_method=coalesce(r->>'entry_method','other'),source_meal_id=(r->>'source_meal_id')::uuid,ai_confidence=(r->>'ai_confidence')::numeric,input_text=r->>'input_text',capture_provenance=p_provenance,updated_at=t WHERE id=p_entity_id;
 END IF;
 UPDATE public.meals SET capture_revision=v+1,captured_at=t WHERE id=p_entity_id;
 ELSE
 IF NOT p_delete THEN
 UPDATE public.workouts SET workout_date=(r->>'workout_date')::date,input_text=coalesce(r->>'input_text',''),blocks=r->'blocks',primary_score=r->>'primary_score',total_duration_min=(r->>'total_duration_min')::integer,
 tags=ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'tags','[]'))),notes=r->>'notes',rpe=CASE WHEN jsonb_typeof(r->'rpe')='number' AND (r->>'rpe')::numeric=trunc((r->>'rpe')::numeric) THEN (r->>'rpe')::integer END,
 parse_confidence=(r->>'parse_confidence')::numeric,capture_provenance=p_provenance WHERE id=p_entity_id;
 DELETE FROM public.block_scores WHERE workout_id=p_entity_id AND user_id=auth.uid();
 FOR b IN SELECT value FROM jsonb_array_elements(public.capture_block_projections(r->'blocks')) LOOP
 INSERT INTO public.block_scores(workout_id,user_id,block_type,block_title,rounds_completed,extra_reps,time_s,total_reps,tonnage_lb,rx_status,is_pr)
 VALUES(p_entity_id,auth.uid(),b->>'block_type',b->>'block_title',(b->>'rounds_completed')::integer,(b->>'extra_reps')::integer,(b->>'time_s')::integer,(b->>'total_reps')::integer,(b->>'tonnage_lb')::numeric,b->>'rx_status',false);
 END LOOP;
 END IF;
 -- Old PR assertions are no longer current after an execution correction. Never retain a stale score.
 PERFORM public.capture_refresh_prs(p_entity_id,prior->'blocks',p_delete);
 UPDATE public.workouts SET capture_revision=v+1,captured_at=t WHERE id=p_entity_id;
 END IF;
 PERFORM public.capture_snapshot(p_kind,p_entity_id,op.id,p_delete,execution,r,event_time,CASE WHEN p_kind='workout' AND (p_delete OR p_record->>'workout_date'=prior->>'workout_date') THEN coalesce((SELECT event_precision FROM public.activity_revisions WHERE user_id=auth.uid() AND original_entity_id=p_entity_id AND revision=v),'date') WHEN p_kind='workout' THEN 'date' ELSE 'timestamp' END);
 out_receipt:=jsonb_build_object('schemaVersion',2,'userId',auth.uid(),'requestId',op.id,'requestKey',p_request_id,'operationId',op.id,'entityKind',p_kind,'entityId',p_entity_id,'revision',v+1,'eventAt',coalesce(event_time,CASE WHEN p_kind='meal' THEN (prior->>'meal_timestamp')::timestamptz ELSE (prior->>'workout_date')::date::timestamptz END),'capturedAt',t,'inputMethod',prior->>'capture_input_method','state','saved','provenance',coalesce(p_provenance,prior->'capture_provenance'),'recommendationId',prior->'capture_recommendation_id','deleted',p_delete,'projectionsStatus',CASE WHEN p_kind='workout' THEN 'recomputed_supported_only' ELSE 'recomputed' END,'eventPrecision',CASE WHEN p_kind='workout' THEN coalesce((SELECT event_precision FROM public.activity_revisions WHERE user_id=auth.uid() AND original_entity_id=p_entity_id AND revision=v+1),'date') ELSE 'timestamp' END);
 IF p_delete THEN
 IF p_kind='meal' THEN DELETE FROM public.meals WHERE id=p_entity_id AND user_id=auth.uid(); ELSE DELETE FROM public.workouts WHERE id=p_entity_id AND user_id=auth.uid(); END IF;
 END IF;
 IF p_kind='workout' AND out_receipt->>'eventPrecision'='date' THEN out_receipt:=jsonb_set(out_receipt,'{eventAt}',to_jsonb(coalesce(p_record->>'workout_date',prior->>'workout_date'))); END IF;
 UPDATE public.activity_mutations SET receipt=out_receipt WHERE id=op.id;
 RETURN out_receipt;
END $$;

CREATE OR REPLACE FUNCTION public.record_coach_session_capture(p_session_id UUID,p_status TEXT,p_feedback JSONB,p_occurred_at TIMESTAMPTZ,p_idempotency_key TEXT,p_performed_work JSONB,p_observations JSONB,p_recommendation_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result JSONB; op public.activity_mutations; proof JSONB; reported JSONB; unknown_field JSONB; work_field JSONB; refs JSONB; v_key TEXT; t TIMESTAMPTZ:=now();
BEGIN
 IF auth.uid() IS NULL OR p_recommendation_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=p_recommendation_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Unknown owned recommendation origin' USING ERRCODE='42501'; END IF;
 IF p_feedback->>'schemaVersion' IS DISTINCT FROM '2' OR p_feedback->>'feedbackVersion' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Capture completion requires feedback v2' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 SELECT to_jsonb(r) INTO result FROM public.record_coach_session_result_v2(p_session_id,p_status,p_feedback,p_occurred_at,p_idempotency_key,p_performed_work,p_observations) r;
 v_key:='session-capture:'||(result->>'checkin_id');
 SELECT * INTO op FROM public.activity_mutations WHERE user_id=auth.uid() AND request_key=v_key;
 IF FOUND THEN
 IF op.payload IS DISTINCT FROM jsonb_build_object('sessionId',p_session_id,'checkinId',result->>'checkin_id','recommendationId',p_recommendation_id) OR op.receipt->>'entityId' IS DISTINCT FROM result->>'workout_id' OR op.receipt->>'schemaVersion' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Capture request identity conflict' USING ERRCODE='23505'; END IF;
 RETURN jsonb_build_object('result',result,'receipt',op.receipt);
 END IF;
 -- A pre-wrapper completion has no initial immutable capture snapshot. Never
 -- manufacture historical coverage from its potentially amended current row.
 IF result->>'workout_id' IS NULL OR (result->>'replayed')::boolean THEN RETURN jsonb_build_object('result',result,'receipt',NULL); END IF;
 refs:=jsonb_build_array('session:'||p_session_id::text,'checkin:'||(result->>'checkin_id'));
 reported:=jsonb_build_object('origin','athlete_reported','reviewState','athlete_confirmed','sourceReferences',refs);
 unknown_field:=jsonb_build_object('origin','legacy_unknown','reviewState','unreviewed','sourceReferences','[]'::jsonb);
 work_field:=CASE WHEN p_performed_work->>'mode'='as_prescribed' THEN jsonb_build_object('origin','copied_template','reviewState','athlete_confirmed','sourceReferences',refs) ELSE reported END;
 proof:=jsonb_build_object('schemaVersion',1,'occurrence',reported,'fields',jsonb_build_object('blocks',work_field,'quantities',work_field,'rpe',CASE WHEN p_feedback->>'sessionRpe' IS NULL THEN unknown_field ELSE reported END,'duration',CASE WHEN p_performed_work->>'totalDurationMinutes' IS NULL THEN unknown_field ELSE reported END));
 INSERT INTO public.activity_mutations(user_id,request_key,payload) VALUES(auth.uid(),v_key,jsonb_build_object('sessionId',p_session_id,'checkinId',result->>'checkin_id','recommendationId',p_recommendation_id)) RETURNING * INTO op;
 UPDATE public.workouts SET capture_provenance=proof,capture_input_method='program',capture_recommendation_id=p_recommendation_id,captured_at=t WHERE id=(result->>'workout_id')::uuid AND user_id=auth.uid();
 PERFORM public.capture_snapshot('workout',(result->>'workout_id')::uuid,op.id,false,NULL,jsonb_build_object('reported_rpe',p_feedback->'sessionRpe'),(p_performed_work->>'workoutDate')::date::timestamptz,'date');
 op.receipt:=jsonb_build_object('schemaVersion',2,'userId',auth.uid(),'requestId',op.id,'requestKey',v_key,'operationId',op.id,'entityKind','workout','entityId',result->>'workout_id','revision',1,'eventAt',p_performed_work->>'workoutDate','eventPrecision','date','capturedAt',t,'inputMethod','program','state','saved','provenance',proof,'recommendationId',p_recommendation_id);
 UPDATE public.activity_mutations SET receipt=op.receipt WHERE id=op.id;
 RETURN jsonb_build_object('result',result,'receipt',op.receipt);
END $$;

CREATE OR REPLACE FUNCTION public.commit_activity_draft(p_draft_id UUID,p_expected_revision INTEGER,p_request_id UUID,p_recommendation_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.activity_drafts; x public.logging_request_items; items JSONB; operation JSONB;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 PERFORM 1 FROM public.logging_requests WHERE id=p_request_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture request' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.activity_drafts WHERE id=p_draft_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown draft' USING ERRCODE='42501'; END IF;
 IF p_recommendation_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=p_recommendation_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Unknown owned recommendation origin' USING ERRCODE='42501'; END IF;
 IF d.normalized ? 'recommendationId' AND d.normalized->>'recommendationId' IS DISTINCT FROM p_recommendation_id::text THEN RAISE EXCEPTION 'Draft recommendation origin changed' USING ERRCODE='22023'; END IF;
 IF d.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Draft revision changed' USING ERRCODE='40001'; END IF;
 SELECT * INTO x FROM public.logging_request_items WHERE draft_id=d.id AND user_id=auth.uid();
 IF FOUND THEN
 IF x.recommendation_id IS DISTINCT FROM p_recommendation_id THEN RAISE EXCEPTION 'Draft recommendation origin changed' USING ERRCODE='22023'; END IF;
 IF x.request_id<>p_request_id THEN RAISE EXCEPTION 'Draft is bound to another request' USING ERRCODE='22023'; END IF;
 RETURN public.commit_logging_request_item(x.id);
 END IF;
 IF d.status<>'draft' OR d.expires_at<=now() THEN RAISE EXCEPTION 'Draft expired or discarded; review before saving' USING ERRCODE='55000'; END IF;
 operation:=d.normalized||jsonb_build_object('recommendationId',p_recommendation_id)||jsonb_build_object('sourceItemId','draft:'||d.id::text||':'||d.revision::text);
 IF operation#>>'{provenance,occurrence,reviewState}'='unreviewed' OR operation#>>'{provenance,occurrence,origin}'='legacy_unknown' THEN
 operation:=jsonb_set(operation,'{provenance,occurrence}',(operation#>'{provenance,occurrence}')||jsonb_build_object('origin','athlete_reported','reviewState','athlete_confirmed'));
 END IF;
 items:=public.freeze_logging_request_items(p_request_id,jsonb_build_array(operation));
 SELECT * INTO STRICT x FROM public.logging_request_items WHERE id=(items->0->>'id')::uuid AND user_id=auth.uid();
 -- The generic freeze produced a staging copy. Keep it auditable as discarded and bind the original draft.
 UPDATE public.activity_drafts SET status='discarded',updated_at=now() WHERE id=x.draft_id;
 UPDATE public.logging_request_items SET draft_id=d.id WHERE id=x.id;
 RETURN public.commit_logging_request_item(x.id);
END $$;

DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('recommendation_authority','recommendation_scope','dirty_recommendations','invalidate_recommendation_source','recommendation_suppressed','assert_recommendation_current','get_recommendation_suppressions','claim_recommendation_refresh','publish_recommendations','fail_recommendation_refresh','read_recommendations','record_recommendation_outcome','respond_recommendation','acknowledge_recommendation_shown','confirm_logging_coverage','bind_capture_recommendation','validate_capture_operation','commit_logging_request_item','mutate_capture_activity','record_coach_session_capture','commit_activity_draft') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 IF f.proname IN ('claim_recommendation_refresh','publish_recommendations','fail_recommendation_refresh','read_recommendations','record_recommendation_outcome','get_recommendation_suppressions') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig); END IF;
 IF f.proname IN ('respond_recommendation','acknowledge_recommendation_shown','confirm_logging_coverage','commit_logging_request_item','record_coach_session_capture','commit_activity_draft') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF;
 END LOOP;
END $$;
COMMIT;
