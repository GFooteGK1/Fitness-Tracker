BEGIN;

-- Canonical rows remain the activity stores. Capture metadata never upgrades legacy facts.
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS capture_revision INTEGER NOT NULL DEFAULT 1 CHECK (capture_revision > 0);
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS capture_provenance JSONB NOT NULL DEFAULT '{"schemaVersion":1,"occurrence":{"origin":"legacy_unknown","reviewState":"unreviewed","sourceReferences":[]},"fields":{}}';
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS capture_input_method TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS capture_revision INTEGER NOT NULL DEFAULT 1 CHECK (capture_revision > 0);
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS capture_provenance JSONB NOT NULL DEFAULT '{"schemaVersion":1,"occurrence":{"origin":"legacy_unknown","reviewState":"unreviewed","sourceReferences":[]},"fields":{}}';
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS capture_input_method TEXT NOT NULL DEFAULT 'manual';
UPDATE public.workouts SET captured_at=coalesce(created_at,now()) WHERE captured_at IS NULL;
UPDATE public.meals SET captured_at=coalesce(created_at,now()) WHERE captured_at IS NULL;
ALTER TABLE public.workouts ALTER COLUMN captured_at SET DEFAULT now(), ALTER COLUMN captured_at SET NOT NULL;
ALTER TABLE public.meals ALTER COLUMN captured_at SET DEFAULT now(), ALTER COLUMN captured_at SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS capture_workout_owner ON public.workouts(id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS capture_meal_owner ON public.meals(id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS capture_request_owner ON public.logging_requests(id,user_id);
ALTER TABLE public.logging_requests ADD COLUMN IF NOT EXISTS frozen_items JSONB;

CREATE TABLE IF NOT EXISTS public.activity_drafts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('workout','meal')), normalized JSONB NOT NULL,
 provenance JSONB NOT NULL, input_method TEXT NOT NULL, event_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','committed','discarded')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '7 days',
 workout_id UUID, meal_id UUID, original_entity_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(workout_id,user_id) REFERENCES public.workouts(id,user_id) ON DELETE SET NULL(workout_id),
 FOREIGN KEY(meal_id,user_id) REFERENCES public.meals(id,user_id) ON DELETE SET NULL(meal_id),
 CHECK(NOT(workout_id IS NOT NULL AND meal_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.activity_revisions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('workout','meal')), original_entity_id UUID NOT NULL,
 workout_id UUID, meal_id UUID, revision INTEGER NOT NULL CHECK(revision>0),
 record JSONB NOT NULL, blocks JSONB NOT NULL, provenance JSONB NOT NULL, input_method TEXT NOT NULL,
 event_at TIMESTAMPTZ NOT NULL, captured_at TIMESTAMPTZ NOT NULL DEFAULT now(), actor_id UUID NOT NULL,
 operation_id UUID NOT NULL, event_precision TEXT NOT NULL DEFAULT 'timestamp' CHECK(event_precision IN ('date','timestamp')), deleted BOOLEAN NOT NULL DEFAULT false, execution_supersession JSONB,
 UNIQUE(user_id,entity_kind,original_entity_id,revision),
 FOREIGN KEY(workout_id,user_id) REFERENCES public.workouts(id,user_id) ON DELETE SET NULL(workout_id),
 FOREIGN KEY(meal_id,user_id) REFERENCES public.meals(id,user_id) ON DELETE SET NULL(meal_id),
 CHECK(NOT(workout_id IS NOT NULL AND meal_id IS NOT NULL)), CHECK(actor_id=user_id)
);
CREATE TABLE IF NOT EXISTS public.logging_request_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id UUID NOT NULL, source_item_id TEXT NOT NULL CHECK(length(source_item_id) BETWEEN 1 AND 200),
 ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 19), kind TEXT NOT NULL CHECK(kind IN ('meal','workout')),
 payload JSONB NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','committed','canceled')),
 draft_id UUID NOT NULL, workout_id UUID, meal_id UUID, canonical_id UUID, canonical_revision INTEGER, receipt JSONB, cancellation JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(request_id,source_item_id), UNIQUE(request_id,ordinal),
 FOREIGN KEY(request_id,user_id) REFERENCES public.logging_requests(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workout_id,user_id) REFERENCES public.workouts(id,user_id) ON DELETE SET NULL(workout_id),
 FOREIGN KEY(meal_id,user_id) REFERENCES public.meals(id,user_id) ON DELETE SET NULL(meal_id)
);

-- Deleting a manual workout retains its immutable observations and their source
-- identity. Only an owned terminal capture revision authorizes FK detachment.
CREATE UNIQUE INDEX IF NOT EXISTS activity_revisions_id_owner ON public.activity_revisions(id,user_id);
ALTER TABLE public.performance_observation_groups ADD COLUMN IF NOT EXISTS original_workout_id UUID;
ALTER TABLE public.performance_observation_groups ADD COLUMN IF NOT EXISTS source_workout_deletion_revision_id UUID;
ALTER TABLE public.performance_observation_groups ADD COLUMN IF NOT EXISTS source_workout_deleted_at TIMESTAMPTZ;
ALTER TABLE public.performance_observation_groups ADD COLUMN IF NOT EXISTS source_workout_invalidation_reason TEXT;
UPDATE public.performance_observation_groups SET original_workout_id=workout_id WHERE original_workout_id IS NULL AND workout_id IS NOT NULL;
ALTER TABLE public.performance_observation_groups DROP CONSTRAINT IF EXISTS performance_observation_groups_workout_owner_fk;
ALTER TABLE public.performance_observation_groups ADD CONSTRAINT performance_observation_groups_workout_owner_fk FOREIGN KEY(workout_id,user_id) REFERENCES public.workouts(id,user_id) ON DELETE SET NULL(workout_id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='observation_deleted_workout_revision_owner') THEN
 ALTER TABLE public.performance_observation_groups ADD CONSTRAINT observation_deleted_workout_revision_owner FOREIGN KEY(source_workout_deletion_revision_id,user_id) REFERENCES public.activity_revisions(id,user_id) DEFERRABLE INITIALLY DEFERRED;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protect_observation_workout_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 IF (NEW.original_workout_id IS NOT NULL AND NEW.original_workout_id IS DISTINCT FROM NEW.workout_id) OR NEW.source_workout_deletion_revision_id IS NOT NULL OR NEW.source_workout_deleted_at IS NOT NULL OR NEW.source_workout_invalidation_reason IS NOT NULL THEN RAISE EXCEPTION 'Observation source identity is server owned' USING ERRCODE='22023'; END IF;
 NEW.original_workout_id:=NEW.workout_id;
 ELSE
 IF NEW.original_workout_id IS DISTINCT FROM OLD.original_workout_id THEN RAISE EXCEPTION 'Original workout identity is immutable' USING ERRCODE='22023'; END IF;
 IF NEW.source_workout_deletion_revision_id IS DISTINCT FROM OLD.source_workout_deletion_revision_id OR NEW.source_workout_deleted_at IS DISTINCT FROM OLD.source_workout_deleted_at OR NEW.source_workout_invalidation_reason IS DISTINCT FROM OLD.source_workout_invalidation_reason THEN
 IF OLD.source_workout_deletion_revision_id IS NOT NULL OR NEW.source_workout_deleted_at IS NULL OR NEW.source_workout_invalidation_reason IS DISTINCT FROM 'canonical_workout_deleted' OR NEW.status NOT IN ('excluded','superseded') OR NOT EXISTS(SELECT 1 FROM public.activity_revisions r WHERE r.id=NEW.source_workout_deletion_revision_id AND r.user_id=NEW.user_id AND r.entity_kind='workout' AND r.original_entity_id=OLD.original_workout_id AND r.deleted) THEN RAISE EXCEPTION 'Observation deletion provenance requires owned terminal revision' USING ERRCODE='22023'; END IF;
 END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_observation_workout_source ON public.performance_observation_groups;
CREATE TRIGGER protect_observation_workout_source BEFORE INSERT OR UPDATE ON public.performance_observation_groups FOR EACH ROW EXECUTE FUNCTION public.protect_observation_workout_source();

CREATE OR REPLACE FUNCTION public.protect_performance_observation_group_content() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.source_import_id IS DISTINCT FROM OLD.source_import_id
 OR (NEW.workout_id IS DISTINCT FROM OLD.workout_id AND NOT (
 OLD.workout_id IS NOT NULL AND NEW.workout_id IS NULL AND NEW.original_workout_id=OLD.workout_id
 AND NEW.status IN ('excluded','superseded') AND NEW.source_workout_invalidation_reason='canonical_workout_deleted'
 AND NOT EXISTS(SELECT 1 FROM public.workouts w WHERE w.id=OLD.workout_id AND w.user_id=OLD.user_id)
 AND EXISTS(SELECT 1 FROM public.activity_revisions r WHERE r.id=NEW.source_workout_deletion_revision_id AND r.user_id=NEW.user_id AND r.entity_kind='workout' AND r.original_entity_id=OLD.workout_id AND r.deleted)))
 OR NEW.prescribed_session_id IS DISTINCT FROM OLD.prescribed_session_id OR NEW.observation_kind IS DISTINCT FROM OLD.observation_kind
 OR NEW.observed_at IS DISTINCT FROM OLD.observed_at OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
 OR NEW.source_kind IS DISTINCT FROM OLD.source_kind OR NEW.source_system IS DISTINCT FROM OLD.source_system OR NEW.source_device IS DISTINCT FROM OLD.source_device OR NEW.source_record_id IS DISTINCT FROM OLD.source_record_id
 OR NEW.assessment_definition_id IS DISTINCT FROM OLD.assessment_definition_id OR NEW.assessment_catalog_version IS DISTINCT FROM OLD.assessment_catalog_version OR NEW.protocol_version IS DISTINCT FROM OLD.protocol_version OR NEW.parser_version IS DISTINCT FROM OLD.parser_version
 OR NEW.comparability_key IS DISTINCT FROM OLD.comparability_key OR NEW.comparison_modifiers IS DISTINCT FROM OLD.comparison_modifiers OR NEW.metadata IS DISTINCT FROM OLD.metadata OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
 RAISE EXCEPTION 'Performance observation content is immutable; supersede or exclude it'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='incomplete' AND NEW.status IN ('complete','excluded','superseded')) OR (OLD.status='complete' AND NEW.status IN ('excluded','superseded')) OR (OLD.status='excluded' AND NEW.status='superseded')) THEN RAISE EXCEPTION 'Performance observation status cannot move from % to %',OLD.status,NEW.status; END IF;
 IF NEW.verification_status<>OLD.verification_status AND NOT ((OLD.verification_status='unverified' AND NEW.verification_status IN ('athlete_confirmed','system_verified','rejected')) OR (OLD.verification_status='system_verified' AND NEW.verification_status IN ('athlete_confirmed','rejected')) OR (OLD.verification_status='athlete_confirmed' AND NEW.verification_status='rejected')) THEN RAISE EXCEPTION 'Performance observation verification cannot move from % to %',OLD.verification_status,NEW.verification_status; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.detach_deleted_workout_observations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE terminal public.activity_revisions;
BEGIN
 IF EXISTS(SELECT 1 FROM public.performance_observation_groups WHERE workout_id=OLD.id AND user_id=OLD.user_id) THEN
 SELECT * INTO terminal FROM public.activity_revisions WHERE user_id=OLD.user_id AND entity_kind='workout' AND original_entity_id=OLD.id AND revision=OLD.capture_revision AND deleted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Linked observation deletion requires an audited terminal workout revision' USING ERRCODE='55000'; END IF;
 UPDATE public.performance_observation_groups SET status=CASE WHEN status='superseded' THEN status ELSE 'excluded' END,exclusion_reason=CASE WHEN status='superseded' THEN exclusion_reason ELSE coalesce(exclusion_reason,'canonical_workout_deleted') END,source_workout_deletion_revision_id=terminal.id,source_workout_deleted_at=terminal.captured_at,source_workout_invalidation_reason='canonical_workout_deleted' WHERE workout_id=OLD.id AND user_id=OLD.user_id;
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS detach_deleted_workout_observations ON public.workouts;
CREATE TRIGGER detach_deleted_workout_observations BEFORE DELETE ON public.workouts FOR EACH ROW EXECUTE FUNCTION public.detach_deleted_workout_observations();

ALTER TABLE public.logging_request_items ADD COLUMN IF NOT EXISTS cancellation JSONB;
ALTER TABLE public.logging_request_items DROP CONSTRAINT IF EXISTS logging_request_items_status_check;
ALTER TABLE public.logging_request_items ADD CONSTRAINT logging_request_items_status_check CHECK(status IN ('pending','committed','canceled'));
CREATE UNIQUE INDEX IF NOT EXISTS capture_draft_owner ON public.activity_drafts(id,user_id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='capture_item_draft_owner') THEN
 ALTER TABLE public.logging_request_items ADD CONSTRAINT capture_item_draft_owner FOREIGN KEY(draft_id,user_id) REFERENCES public.activity_drafts(id,user_id) ON DELETE CASCADE;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.activity_mutations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 200), payload JSONB NOT NULL, receipt JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,request_key)
);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['activity_drafts','activity_revisions','logging_request_items','activity_mutations'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('DROP POLICY IF EXISTS capture_owner ON public.%I',t);
 EXECUTE format('CREATE POLICY capture_owner ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(user_id)',t||'_owner_idx',t);
 END LOOP;
END $$;

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
 IF coalesce(p->>'recommendationId','')<>'' THEN RAISE EXCEPTION 'Recommendation attribution is not enabled' USING ERRCODE='22023'; END IF;
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

CREATE OR REPLACE FUNCTION public.capture_normalized_record(p_kind TEXT,p_record JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r JSONB:=p_record; k TEXT; n NUMERIC;
BEGIN
 IF p_kind='meal' THEN
 FOREACH k IN ARRAY ARRAY['protein','carbs','fat','calories'] LOOP
 SELECT sum((v->>k)::numeric) INTO n FROM jsonb_array_elements(r->'items') v;
 r:=jsonb_set(r,ARRAY['total_'||k],to_jsonb(n));
 END LOOP;
 r:=jsonb_set(r,'{manual_override}',coalesce(p_record->'manual_override','false'));
 ELSIF jsonb_typeof(r->'rpe')='number' THEN
 r:=jsonb_set(r,'{reported_rpe}',r->'rpe');
 IF (r->>'rpe')::numeric<1 OR (r->>'rpe')::numeric<>trunc((r->>'rpe')::numeric) THEN r:=jsonb_set(r,'{rpe}','null'); END IF;
 END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.freeze_logging_request_items(p_request_id UUID,p_items JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.logging_requests; p JSONB; d UUID; i INTEGER:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.logging_requests WHERE id=p_request_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture request' USING ERRCODE='42501'; END IF;
 IF l.frozen_items IS NOT NULL THEN
 IF l.frozen_items IS DISTINCT FROM p_items THEN RAISE EXCEPTION 'Capture request reused with different operations' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ordinal),'[]') FROM public.logging_request_items x WHERE request_id=l.id AND user_id=auth.uid());
 END IF;
 IF l.status<>'processing' OR jsonb_array_length(l.entities)>0 THEN RAISE EXCEPTION 'Request cannot be frozen after activity writes' USING ERRCODE='55000'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid capture operation list' USING ERRCODE='22023'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(p_items) LOOP
 PERFORM public.validate_capture_operation(p);
 IF jsonb_typeof(p->'sourceItemId') IS DISTINCT FROM 'string' OR length(p->>'sourceItemId') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid source item identity' USING ERRCODE='22023'; END IF;
 INSERT INTO public.activity_drafts(user_id,kind,normalized,provenance,input_method,event_at)
 VALUES(auth.uid(),p->>'kind',p,p->'provenance',p->>'inputMethod',(p->>'eventAt')::timestamptz) RETURNING id INTO d;
 INSERT INTO public.logging_request_items(user_id,request_id,source_item_id,ordinal,kind,payload,fingerprint,draft_id)
 VALUES(auth.uid(),l.id,p->>'sourceItemId',i,p->>'kind',p,encode(sha256(convert_to(p::text,'UTF8')),'hex'),d);
 i:=i+1;
 END LOOP;
 UPDATE public.logging_requests SET frozen_items=p_items WHERE id=l.id;
 RETURN (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.ordinal) FROM public.logging_request_items x WHERE request_id=l.id AND user_id=auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.capture_snapshot(p_kind TEXT,p_id UUID,p_operation UUID,p_deleted BOOLEAN DEFAULT false,p_execution JSONB DEFAULT NULL,p_normalized JSONB DEFAULT NULL,p_event_at TIMESTAMPTZ DEFAULT NULL,p_event_precision TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r JSONB; b JSONB; v INTEGER; t TIMESTAMPTZ;
BEGIN
 IF p_kind='meal' THEN
 SELECT to_jsonb(m),'[]'::jsonb,m.capture_revision,m.meal_timestamp INTO r,b,v,t FROM public.meals m WHERE m.id=p_id AND m.user_id=auth.uid();
 ELSE
 SELECT to_jsonb(w),coalesce((SELECT jsonb_agg(to_jsonb(s)-'id'-'user_id'-'workout_id'-'created_at' ORDER BY s.id) FROM public.block_scores s WHERE s.workout_id=w.id),'[]'),w.capture_revision,w.workout_date::timestamptz INTO r,b,v,t
 FROM public.workouts w WHERE w.id=p_id AND w.user_id=auth.uid();
 END IF;
 IF p_event_at IS NOT NULL THEN t:=p_event_at; END IF;
 IF p_kind='workout' THEN r:=r||jsonb_build_object('derivedProjections',jsonb_build_object('personalRecords',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM public.personal_records q WHERE q.workout_id=p_id AND q.user_id=auth.uid()),'benchmarkPrs',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM public.benchmark_prs q WHERE q.workout_id=p_id AND q.user_id=auth.uid()))); END IF;
 IF p_normalized IS NOT NULL THEN r:=r||p_normalized; END IF;
 IF r IS NULL THEN RAISE EXCEPTION 'Unknown activity' USING ERRCODE='42501'; END IF;
 INSERT INTO public.activity_revisions(user_id,entity_kind,original_entity_id,workout_id,meal_id,revision,record,blocks,provenance,input_method,event_at,captured_at,actor_id,operation_id,event_precision,deleted,execution_supersession)
 VALUES(auth.uid(),p_kind,p_id,CASE WHEN p_kind='workout' THEN p_id END,CASE WHEN p_kind='meal' THEN p_id END,v,r,b,r->'capture_provenance',r->>'capture_input_method',t,now(),auth.uid(),p_operation,coalesce(p_event_precision,CASE WHEN p_kind='workout' THEN 'date' ELSE 'timestamp' END),p_deleted,p_execution)
 ON CONFLICT(user_id,entity_kind,original_entity_id,revision) DO NOTHING;
END $$;

-- Exact known movement amounts only. Unsupported ranges/sets remain NULL projections.
CREATE OR REPLACE FUNCTION public.capture_block_projections(p_blocks JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b JSONB; m JSONB; score JSONB; a JSONB:='[]'; reps NUMERIC; weight NUMERIC; tons NUMERIC;
 rounds NUMERIC; extra NUMERIC; tm NUMERIC; match TEXT[]; all_reps BOOLEAN; all_weights BOOLEAN; typ TEXT;
BEGIN
 FOR b IN SELECT value FROM jsonb_array_elements(p_blocks) LOOP
 typ:=coalesce(b->>'block_type',b->>'type');
 IF typ IS NULL OR typ NOT IN ('AMRAP','FOR_TIME','EMOM','STRENGTH','CARDIO') THEN RAISE EXCEPTION 'Unsupported workout block' USING ERRCODE='22023'; END IF;
 score:=coalesce(b->'block_score',b->'score','{}');
 rounds:=CASE WHEN jsonb_typeof(coalesce(score->'rounds_completed',score->'rounds'))='number' THEN coalesce(score->>'rounds_completed',score->>'rounds')::numeric END;
 extra:=CASE WHEN jsonb_typeof(score->'extra_reps')='number' THEN (score->>'extra_reps')::numeric END;
 tm:=CASE WHEN jsonb_typeof(score->'time_s')='number' THEN (score->>'time_s')::numeric END;
 IF (rounds IS NOT NULL AND (rounds<0 OR rounds<>trunc(rounds))) OR (extra IS NOT NULL AND (extra<0 OR extra<>trunc(extra))) OR (tm IS NOT NULL AND (tm<0 OR tm<>trunc(tm))) THEN RAISE EXCEPTION 'Invalid exact block score' USING ERRCODE='22023'; END IF;
 reps:=0; tons:=0; all_reps:=false; all_weights:=false;
 IF jsonb_typeof(b->'movements')='array' AND jsonb_array_length(b->'movements')>0 THEN
 all_reps:=true; all_weights:=true;
 FOR m IN SELECT value FROM jsonb_array_elements(b->'movements') LOOP
 IF jsonb_typeof(m->'reps') IS DISTINCT FROM 'number' OR m ? 'sets' THEN all_reps:=false;
 ELSE
 IF (m->>'reps')::numeric<0 OR (m->>'reps')::numeric<>trunc((m->>'reps')::numeric) THEN all_reps:=false; END IF;
 reps:=reps+(m->>'reps')::numeric;
 END IF;
 match:=regexp_match(coalesce(m->>'weight',''),'^[[:space:]]*([0-9]+(?:\.[0-9]+)?)[[:space:]]*(lb|kg|#)[[:space:]]*$','i');
 IF match IS NULL OR jsonb_typeof(m->'reps') IS DISTINCT FROM 'number' THEN all_weights:=false;
 ELSE weight:=match[1]::numeric*CASE WHEN lower(match[2])='kg' THEN 2.2046226218 ELSE 1 END; tons:=tons+weight*(m->>'reps')::numeric;
 END IF;
 END LOOP;
 END IF;
 a:=a||jsonb_build_array(jsonb_build_object('block_type',typ,'block_title',b->>'title','rounds_completed',rounds,'extra_reps',extra,'time_s',tm,
 'total_reps',CASE WHEN all_reps THEN reps*coalesce(rounds,1)+coalesce(extra,0) END,
 'tonnage_lb',CASE WHEN all_reps AND all_weights THEN round(tons*coalesce(rounds,1),3) END,
 'rx_status',CASE WHEN lower(coalesce(b->>'rx_status',score->>'rx_status')) IN ('rx','scaled') THEN coalesce(b->>'rx_status',score->>'rx_status') END,'is_pr',false));
 END LOOP;
 RETURN a;
END $$;

-- Keep the legacy response contract while preventing writes outside a frozen child list.
DO $$ BEGIN
 IF to_regprocedure('public.save_logged_activity_legacy_capture(text,jsonb,jsonb,uuid,jsonb)') IS NULL THEN
 ALTER FUNCTION public.save_logged_activity(TEXT,JSONB,JSONB,UUID,JSONB) RENAME TO save_logged_activity_legacy_capture;
 END IF;
 IF to_regprocedure('public.finish_logging_request_legacy_capture(uuid,jsonb,integer)') IS NULL THEN
 ALTER FUNCTION public.finish_logging_request(UUID,JSONB,INTEGER) RENAME TO finish_logging_request_legacy_capture;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.save_logged_activity(p_kind TEXT,p_record JSONB,p_blocks JSONB DEFAULT '[]',p_request_id UUID DEFAULT NULL,p_response JSONB DEFAULT NULL) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 IF p_request_id IS NOT NULL THEN
 PERFORM 1 FROM public.logging_requests WHERE id=p_request_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown logging request' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.logging_requests WHERE id=p_request_id AND frozen_items IS NOT NULL) THEN RAISE EXCEPTION 'Frozen requests require their original child operation' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN public.save_logged_activity_legacy_capture(p_kind,p_record,p_blocks,p_request_id,p_response);
END $$;
CREATE OR REPLACE FUNCTION public.finish_logging_request(p_id UUID,p_response JSONB,p_status INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE amendment JSONB;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.logging_requests WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown logging request' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.logging_request_items WHERE request_id=p_id AND user_id=auth.uid() AND status='pending') THEN RAISE EXCEPTION 'Capture children remain unresolved' USING ERRCODE='55000'; END IF;
 SELECT receipt INTO amendment FROM public.activity_mutations WHERE user_id=auth.uid() AND request_key=p_id::text AND receipt ? 'entityId';
 IF amendment IS NOT NULL THEN
 p_response:=p_response||jsonb_build_object('retrySafe',false,'receipts',jsonb_build_array(amendment));
 UPDATE public.logging_requests SET entities=entities||jsonb_build_array(jsonb_build_object('kind',amendment->>'entityKind','id',amendment->>'entityId')) WHERE id=p_id
 AND NOT entities @> jsonb_build_array(jsonb_build_object('kind',amendment->>'entityKind','id',amendment->>'entityId'));
 END IF;
 RETURN public.finish_logging_request_legacy_capture(p_id,p_response,p_status);
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
 UPDATE public.meals SET reviewed_at=(r->>'reviewed_at')::timestamptz,entry_method=coalesce(r->>'entry_method','other'),source_meal_id=(r->>'source_meal_id')::uuid,manual_override=coalesce((r->>'manual_override')::boolean,false),capture_provenance=p->'provenance',capture_input_method=p->>'inputMethod',captured_at=t WHERE id=v_id AND user_id=auth.uid();
 ELSE
 UPDATE public.workouts SET capture_provenance=p->'provenance',capture_input_method=p->>'inputMethod',captured_at=t,total_duration_min=(r->>'total_duration_min')::integer WHERE id=v_id AND user_id=auth.uid();
 UPDATE public.block_scores SET is_pr=false WHERE workout_id=v_id AND user_id=auth.uid();
 END IF;
 IF x.kind='workout' AND p#>>'{provenance,fields,quantities,origin}'='athlete_reported' AND p#>>'{provenance,fields,quantities,reviewState}' IN ('athlete_confirmed','corrected') THEN PERFORM public.capture_refresh_prs(v_id,'[]',false); END IF;
 PERFORM public.capture_snapshot(x.kind,v_id,x.id,false,NULL,r,(p->>'eventAt')::timestamptz,coalesce(p->>'eventPrecision',CASE WHEN p->>'eventAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'date' ELSE 'timestamp' END));
 END IF;
 v_receipt:=jsonb_build_object('schemaVersion',2,'userId',auth.uid(),'requestId',l.id,'requestKey',l.request_key,'operationId',x.id,'entityKind',x.kind,'entityId',v_id,'revision',v_revision,'eventPrecision',coalesce(p->>'eventPrecision',CASE WHEN p->>'eventAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'date' ELSE 'timestamp' END),'eventAt',p->>'eventAt','capturedAt',t,'inputMethod',p->>'inputMethod','state','saved','provenance',p->'provenance','recommendationId',NULL,'projectionsStatus',CASE WHEN x.kind='workout' THEN 'recomputed_supported_only' ELSE 'recomputed' END);
 UPDATE public.logging_request_items SET status='committed',canonical_id=v_id,canonical_revision=v_revision,receipt=v_receipt,workout_id=CASE WHEN kind='workout' THEN v_id END,meal_id=CASE WHEN kind='meal' THEN v_id END WHERE id=x.id;
 UPDATE public.activity_drafts SET status='committed',original_entity_id=v_id,workout_id=CASE WHEN kind='workout' THEN v_id END,meal_id=CASE WHEN kind='meal' THEN v_id END,updated_at=t WHERE id=x.draft_id;
 RETURN v_receipt;
END $$;

-- Typed performance candidates mirror existing PR metric directions, with explicit units.
CREATE OR REPLACE FUNCTION public.capture_pr_candidates(p_blocks JSONB) RETURNS TABLE(exercise TEXT,pr_type TEXT,value NUMERIC,rx TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b JSONB; seg JSONB; e JSONB; load_value NUMERIC; reps NUMERIC; rounds NUMERIC; unit TEXT; title TEXT; score JSONB;
BEGIN
 FOR b IN SELECT x FROM jsonb_array_elements(p_blocks) x LOOP
 rx:=lower(coalesce(b->>'rx_status',b#>>'{block_score,rx_status}','unknown'));
 score:=coalesce(b->'block_score',b->'score','{}');title:=b->>'title';
 IF coalesce(b->>'block_type',b->>'type')='FOR_TIME' AND length(title)>0 AND jsonb_typeof(score->'time_s')='number' AND (score->>'time_s')::numeric>0 THEN exercise:=title;pr_type:='time';value:=(score->>'time_s')::numeric;RETURN NEXT; END IF;
 IF jsonb_typeof(b->'segments')='array' THEN
 FOR seg IN SELECT x FROM jsonb_array_elements(b->'segments') x LOOP
 rounds:=CASE WHEN jsonb_typeof(seg->'rounds')='number' AND (seg->>'rounds')::numeric>0 THEN (seg->>'rounds')::numeric ELSE 1 END;
 IF jsonb_typeof(seg->'events')='array' THEN
 FOR e IN SELECT x FROM jsonb_array_elements(seg->'events') x LOOP
 unit:=lower(e#>>'{performed,load,unit}');
 IF jsonb_typeof(e#>'{performed,load,value}')='number' AND unit IN ('lb','lbs','kg') AND length(e->>'movement_name')>0 THEN
 load_value:=(e#>>'{performed,load,value}')::numeric*CASE WHEN unit='kg' THEN 2.2046226218 ELSE 1 END;
 IF load_value>0 THEN
 exercise:=e->>'movement_name';pr_type:='weight';value:=round(load_value,2);RETURN NEXT;
 IF jsonb_typeof(e#>'{performed,reps}')='number' AND (e#>>'{performed,reps}')::numeric>0 THEN
 reps:=(e#>>'{performed,reps}')::numeric;
 exercise:=(e->>'movement_name')||' @ '||trim(to_char(round(load_value,2),'FM999999990.99'))||' lbs';pr_type:='reps';value:=reps;RETURN NEXT;
 exercise:=e->>'movement_name';pr_type:='volume';value:=round(load_value*reps*rounds,2);RETURN NEXT;
 END IF; END IF; END IF;
 END LOOP; END IF; END LOOP; END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.capture_refresh_prs(p_id UUID,p_old_blocks JSONB,p_deleted BOOLEAN) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE keys JSONB; names JSONB; new_blocks JSONB;
BEGIN
 SELECT blocks INTO new_blocks FROM public.workouts WHERE id=p_id AND user_id=auth.uid();
 SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('exercise',lower(exercise),'type',pr_type)),'[]') INTO keys FROM (
 SELECT exercise,pr_type FROM public.personal_records WHERE workout_id=p_id AND user_id=auth.uid()
 UNION ALL SELECT exercise,pr_type FROM public.capture_pr_candidates(coalesce(p_old_blocks,'[]'))
 UNION ALL SELECT exercise,pr_type FROM public.capture_pr_candidates(coalesce(new_blocks,'[]'))) q;
 DELETE FROM public.personal_records r WHERE r.user_id=auth.uid() AND r.workout_id IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(keys) k WHERE lower(r.exercise)=k->>'exercise' AND r.pr_type=k->>'type');
 -- Rebuild supported affected metric histories from canonical explicit performed data.
 WITH candidates AS (
 SELECT w.id,w.workout_date,c.exercise,c.pr_type,c.rx,CASE WHEN c.pr_type='volume' THEN sum(c.value) WHEN c.pr_type='time' THEN min(c.value) ELSE max(c.value) END value
 FROM public.workouts w CROSS JOIN LATERAL public.capture_pr_candidates(w.blocks) c
 WHERE w.user_id=auth.uid() AND w.execution_status='completed' AND (NOT p_deleted OR w.id<>p_id)
 AND w.capture_provenance#>>'{fields,quantities,origin}'='athlete_reported'
 AND w.capture_provenance#>>'{fields,quantities,reviewState}' IN ('athlete_confirmed','corrected')
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(keys) k WHERE lower(c.exercise)=k->>'exercise' AND c.pr_type=k->>'type')
 GROUP BY w.id,w.workout_date,c.exercise,c.pr_type,c.rx
 ), distinct_scope AS (
 SELECT *,count(*) OVER(PARTITION BY id,lower(exercise),pr_type) scopes FROM candidates
 ), history AS (
 SELECT *,CASE WHEN pr_type='time' THEN min(value) OVER(PARTITION BY lower(exercise),pr_type,rx ORDER BY workout_date,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
 ELSE max(value) OVER(PARTITION BY lower(exercise),pr_type,rx ORDER BY workout_date,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) END previous FROM distinct_scope WHERE scopes=1
 ) INSERT INTO public.personal_records(user_id,exercise,pr_type,value,previous_value,workout_id,achieved_at)
 SELECT auth.uid(),exercise,pr_type,value,previous,id,workout_date::timestamptz FROM history WHERE previous IS NULL OR (pr_type='time' AND value<previous) OR (pr_type<>'time' AND value>previous);
 -- Legacy benchmark names carry no type. Recompute only exact named supported block types.
 SELECT coalesce(jsonb_agg(DISTINCT lower(benchmark_name)),'[]') INTO names FROM public.benchmark_prs WHERE user_id=auth.uid() AND workout_id=p_id;
 DELETE FROM public.benchmark_prs r WHERE r.user_id=auth.uid() AND r.workout_id IS NOT NULL AND (r.workout_id=p_id OR names ? lower(r.benchmark_name));
 WITH candidates AS (
 SELECT w.id,w.workout_date,b->>'title' title,lower(coalesce(b->>'rx_status','unknown')) rx,coalesce(b->>'block_type',b->>'type') typ,
 CASE WHEN coalesce(b->>'block_type',b->>'type')='FOR_TIME' AND jsonb_typeof(coalesce(b->'block_score',b->'score')->'time_s')='number' THEN (coalesce(b->'block_score',b->'score')->>'time_s')::numeric
 WHEN coalesce(b->>'block_type',b->>'type')='AMRAP' AND jsonb_typeof(coalesce(b->'block_score',b->'score')->'rounds')='number' THEN (coalesce(b->'block_score',b->'score')->>'rounds')::numeric*1000+coalesce((coalesce(b->'block_score',b->'score')->>'extra_reps')::numeric,0) END value
 FROM public.workouts w CROSS JOIN LATERAL jsonb_array_elements(w.blocks) b WHERE w.user_id=auth.uid() AND w.execution_status='completed' AND (NOT p_deleted OR w.id<>p_id) AND names ? lower(b->>'title')
 AND w.capture_provenance#>>'{fields,quantities,origin}'='athlete_reported' AND w.capture_provenance#>>'{fields,quantities,reviewState}' IN ('athlete_confirmed','corrected')
 ), compatible AS (
 SELECT * FROM candidates c WHERE value>0 AND NOT EXISTS(SELECT 1 FROM candidates d WHERE lower(c.title)=lower(d.title) AND c.rx=d.rx AND c.typ<>d.typ)
 ), collapsed AS (SELECT id,workout_date,title,rx,typ,CASE WHEN typ='FOR_TIME' THEN min(value) ELSE max(value) END value FROM compatible GROUP BY id,workout_date,title,rx,typ), ranked AS (
 SELECT *,CASE WHEN typ='FOR_TIME' THEN min(value) OVER(PARTITION BY lower(title),rx ORDER BY workout_date,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
 ELSE max(value) OVER(PARTITION BY lower(title),rx ORDER BY workout_date,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) END previous FROM collapsed
 ) INSERT INTO public.benchmark_prs(user_id,benchmark_name,date,score_value,score_display,rx_status,is_pr,workout_id)
 SELECT auth.uid(),title,workout_date,value,value::text,rx,true,id FROM ranked WHERE previous IS NULL OR (typ='FOR_TIME' AND value<previous) OR (typ<>'FOR_TIME' AND value>previous);
 -- The benchmark table cannot encode metric/type ambiguity. Unsupported assertions stay invalidated.
END $$;

-- Internal mutation engine. Public wrappers fix execution authority and delete intent.
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
 out_receipt:=jsonb_build_object('schemaVersion',2,'userId',auth.uid(),'requestId',op.id,'requestKey',p_request_id,'operationId',op.id,'entityKind',p_kind,'entityId',p_entity_id,'revision',v+1,'eventAt',coalesce(event_time,CASE WHEN p_kind='meal' THEN (prior->>'meal_timestamp')::timestamptz ELSE (prior->>'workout_date')::date::timestamptz END),'capturedAt',t,'inputMethod',prior->>'capture_input_method','state','saved','provenance',coalesce(p_provenance,prior->'capture_provenance'),'recommendationId',NULL,'deleted',p_delete,'projectionsStatus',CASE WHEN p_kind='workout' THEN 'recomputed_supported_only' ELSE 'recomputed' END,'eventPrecision',CASE WHEN p_kind='workout' THEN coalesce((SELECT event_precision FROM public.activity_revisions WHERE user_id=auth.uid() AND original_entity_id=p_entity_id AND revision=v+1),'date') ELSE 'timestamp' END);
 IF p_delete THEN
 IF p_kind='meal' THEN DELETE FROM public.meals WHERE id=p_entity_id AND user_id=auth.uid(); ELSE DELETE FROM public.workouts WHERE id=p_entity_id AND user_id=auth.uid(); END IF;
 END IF;
 IF p_kind='workout' AND out_receipt->>'eventPrecision'='date' THEN out_receipt:=jsonb_set(out_receipt,'{eventAt}',to_jsonb(coalesce(p_record->>'workout_date',prior->>'workout_date'))); END IF;
 UPDATE public.activity_mutations SET receipt=out_receipt WHERE id=op.id;
 RETURN out_receipt;
END $$;

CREATE OR REPLACE FUNCTION public.amend_logged_activity(p_kind TEXT,p_entity_id UUID,p_expected_revision INTEGER,p_request_id TEXT,p_record JSONB,p_blocks JSONB,p_provenance JSONB) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.mutate_capture_activity(p_kind,p_entity_id,p_expected_revision,p_request_id,p_record,p_blocks,p_provenance,false,false) $$;
CREATE OR REPLACE FUNCTION public.amend_program_execution(p_entity_id UUID,p_expected_revision INTEGER,p_request_id TEXT,p_record JSONB,p_blocks JSONB,p_provenance JSONB) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.mutate_capture_activity('workout',p_entity_id,p_expected_revision,p_request_id,p_record,p_blocks,p_provenance,true,false) $$;
CREATE OR REPLACE FUNCTION public.delete_logged_activity(p_kind TEXT,p_entity_id UUID,p_expected_revision INTEGER,p_request_id TEXT) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.mutate_capture_activity(p_kind,p_entity_id,p_expected_revision,p_request_id,NULL,NULL,NULL,false,true) $$;

-- Standalone drafts are editable with revision and request identity. Frozen request drafts cannot be rewritten.
CREATE OR REPLACE FUNCTION public.save_activity_draft(p_request_id TEXT,p_draft_id UUID,p_expected_revision INTEGER,p_operation JSONB,p_discard BOOLEAN DEFAULT false) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.activity_drafts; op public.activity_mutations; payload JSONB; result JSONB;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 payload:=jsonb_build_object('draftId',p_draft_id,'expectedRevision',p_expected_revision,'operation',p_operation,'discard',p_discard);
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id,0));
 SELECT * INTO op FROM public.activity_mutations WHERE user_id=auth.uid() AND request_key=p_request_id;
 IF FOUND THEN
 IF op.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Draft request reused with different data' USING ERRCODE='22023'; END IF;
 RETURN op.receipt;
 END IF;
 IF p_draft_id IS NULL THEN
 IF p_discard OR p_expected_revision IS NOT NULL THEN RAISE EXCEPTION 'Invalid new draft revision' USING ERRCODE='22023'; END IF;
 PERFORM public.validate_capture_operation(p_operation);
 INSERT INTO public.activity_drafts(user_id,kind,normalized,provenance,input_method,event_at) VALUES(auth.uid(),p_operation->>'kind',p_operation,p_operation->'provenance',p_operation->>'inputMethod',(p_operation->>'eventAt')::timestamptz) RETURNING * INTO d;
 ELSE
 SELECT * INTO d FROM public.activity_drafts WHERE id=p_draft_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown draft' USING ERRCODE='42501'; END IF;
 IF d.revision IS DISTINCT FROM p_expected_revision OR d.status<>'draft' THEN RAISE EXCEPTION 'Draft revision changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.logging_request_items WHERE draft_id=d.id) THEN RAISE EXCEPTION 'Frozen request draft cannot be edited; reconcile original request' USING ERRCODE='55000'; END IF;
 IF p_discard THEN UPDATE public.activity_drafts SET status='discarded',revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 ELSE
 PERFORM public.validate_capture_operation(p_operation);
 UPDATE public.activity_drafts SET kind=p_operation->>'kind',normalized=p_operation,provenance=p_operation->'provenance',input_method=p_operation->>'inputMethod',event_at=(p_operation->>'eventAt')::timestamptz,revision=revision+1,updated_at=now(),expires_at=now()+interval '7 days' WHERE id=d.id RETURNING * INTO d;
 END IF;
 END IF;
 result:=to_jsonb(d);
 INSERT INTO public.activity_mutations(user_id,request_key,payload,receipt) VALUES(auth.uid(),p_request_id,payload,result);
 RETURN result;
END $$;

-- Explicit review/cancel action: prove the original child can no longer commit.
CREATE OR REPLACE FUNCTION public.cancel_logging_request_item(p_item_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.logging_request_items; l public.logging_requests; proof JSONB;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 SELECT q.* INTO l FROM public.logging_requests q JOIN public.logging_request_items i ON i.request_id=q.id AND i.user_id=q.user_id WHERE i.id=p_item_id AND q.user_id=auth.uid() FOR UPDATE OF q;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture item' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT x FROM public.logging_request_items WHERE id=p_item_id AND user_id=auth.uid() FOR UPDATE;
 IF x.status='committed' THEN RAISE EXCEPTION 'This child already committed; use its saved receipt for correction' USING ERRCODE='55000'; END IF;
 IF x.status='canceled' THEN RETURN x.cancellation; END IF;
 PERFORM 1 FROM public.activity_drafts WHERE id=x.draft_id AND user_id=auth.uid() FOR UPDATE;
 proof:=jsonb_build_object('schemaVersion',1,'userId',auth.uid(),'requestId',l.id,'operationId',x.id,'sourceItemId',x.source_item_id,'state','canceled','noWriteConfirmed',true,'canceledAt',now());
 UPDATE public.logging_request_items SET status='canceled',cancellation=proof WHERE id=x.id;
 UPDATE public.activity_drafts SET status='discarded',revision=revision+1,updated_at=now() WHERE id=x.draft_id;
 RETURN proof;
END $$;

-- Explicitly commit a reviewed standalone proposal using the original draft identity.
CREATE OR REPLACE FUNCTION public.commit_activity_draft(p_draft_id UUID,p_expected_revision INTEGER,p_request_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.activity_drafts; x public.logging_request_items; items JSONB; operation JSONB;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 PERFORM 1 FROM public.logging_requests WHERE id=p_request_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture request' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.activity_drafts WHERE id=p_draft_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown draft' USING ERRCODE='42501'; END IF;
 IF d.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Draft revision changed' USING ERRCODE='40001'; END IF;
 SELECT * INTO x FROM public.logging_request_items WHERE draft_id=d.id AND user_id=auth.uid();
 IF FOUND THEN
 IF x.request_id<>p_request_id THEN RAISE EXCEPTION 'Draft is bound to another request' USING ERRCODE='22023'; END IF;
 RETURN public.commit_logging_request_item(x.id);
 END IF;
 IF d.status<>'draft' OR d.expires_at<=now() THEN RAISE EXCEPTION 'Draft expired or discarded; review before saving' USING ERRCODE='55000'; END IF;
 operation:=d.normalized||jsonb_build_object('sourceItemId','draft:'||d.id::text||':'||d.revision::text);
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

-- All corrections pass the revision/audit boundary. Existing create RPCs retain compatibility.
REVOKE UPDATE,DELETE ON public.workouts,public.meals FROM authenticated;
REVOKE ALL ON public.logging_requests FROM service_role;
-- Preserve the established row-returning completion API. This additive entry point
-- captures only new v2 completions in the same transaction as their canonical save.
CREATE OR REPLACE FUNCTION public.record_coach_session_capture(p_session_id UUID,p_status TEXT,p_feedback JSONB,p_occurred_at TIMESTAMPTZ,p_idempotency_key TEXT,p_performed_work JSONB,p_observations JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result JSONB; op public.activity_mutations; proof JSONB; reported JSONB; unknown_field JSONB; work_field JSONB; refs JSONB; v_key TEXT; t TIMESTAMPTZ:=now();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_feedback->>'schemaVersion' IS DISTINCT FROM '2' OR p_feedback->>'feedbackVersion' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Capture completion requires feedback v2' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 SELECT to_jsonb(r) INTO result FROM public.record_coach_session_result_v2(p_session_id,p_status,p_feedback,p_occurred_at,p_idempotency_key,p_performed_work,p_observations) r;
 v_key:='session-capture:'||(result->>'checkin_id');
 SELECT * INTO op FROM public.activity_mutations WHERE user_id=auth.uid() AND request_key=v_key;
 IF FOUND THEN
 IF op.payload IS DISTINCT FROM jsonb_build_object('sessionId',p_session_id,'checkinId',result->>'checkin_id') OR op.receipt->>'entityId' IS DISTINCT FROM result->>'workout_id' OR op.receipt->>'schemaVersion' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Capture request identity conflict' USING ERRCODE='23505'; END IF;
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
 INSERT INTO public.activity_mutations(user_id,request_key,payload) VALUES(auth.uid(),v_key,jsonb_build_object('sessionId',p_session_id,'checkinId',result->>'checkin_id')) RETURNING * INTO op;
 UPDATE public.workouts SET capture_provenance=proof,capture_input_method='program',captured_at=t WHERE id=(result->>'workout_id')::uuid AND user_id=auth.uid();
 PERFORM public.capture_snapshot('workout',(result->>'workout_id')::uuid,op.id,false,NULL,jsonb_build_object('reported_rpe',p_feedback->'sessionRpe'),(p_performed_work->>'workoutDate')::date::timestamptz,'date');
 op.receipt:=jsonb_build_object('schemaVersion',2,'userId',auth.uid(),'requestId',op.id,'requestKey',v_key,'operationId',op.id,'entityKind','workout','entityId',result->>'workout_id','revision',1,'eventAt',p_performed_work->>'workoutDate','eventPrecision','date','capturedAt',t,'inputMethod','program','state','saved','provenance',proof,'recommendationId',NULL);
 UPDATE public.activity_mutations SET receipt=op.receipt WHERE id=op.id;
 RETURN jsonb_build_object('result',result,'receipt',op.receipt);
END $$;

DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('protect_observation_workout_source','protect_performance_observation_group_content','detach_deleted_workout_observations','validate_capture_operation','capture_normalized_record','capture_block_projections','capture_snapshot','capture_pr_candidates','capture_refresh_prs','save_logged_activity','finish_logging_request','save_logged_activity_legacy_capture','finish_logging_request_legacy_capture','freeze_logging_request_items','commit_logging_request_item','mutate_capture_activity','amend_logged_activity','amend_program_execution','delete_logged_activity','save_activity_draft','commit_activity_draft','cancel_logging_request_item','record_coach_session_capture') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 IF f.proname IN ('save_logged_activity','finish_logging_request','freeze_logging_request_items','commit_logging_request_item','amend_logged_activity','amend_program_execution','delete_logged_activity','save_activity_draft','commit_activity_draft','cancel_logging_request_item','record_coach_session_capture') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF;
 END LOOP;
END $$;
COMMIT;
