-- ADR0036: atomic owned declarations, separate from facts/review/acceptance.
-- Uninstalled draft. Creates no designation, enrollment or numerical capability.
BEGIN;

CREATE TABLE public.coach_first_review_setup_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  program_id uuid NOT NULL REFERENCES public.training_programs(id),
  request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
  disposition text NOT NULL CHECK(disposition IN ('saved','no_write')),
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,request_id),
  CHECK((disposition='saved' AND receipt IS NOT NULL AND jsonb_typeof(receipt)='object') OR (disposition='no_write' AND receipt IS NULL))
);
ALTER TABLE public.coach_first_review_setup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_setup_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_first_review_setup_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.coach_first_review_setup_requests TO authenticated;
CREATE POLICY own_first_review_setup_receipts ON public.coach_first_review_setup_requests
  FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE TRIGGER immutable_first_review_setup_requests BEFORE UPDATE OR DELETE ON public.coach_first_review_setup_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();

CREATE FUNCTION public.first_review_setup_declaration(p_actor uuid,p_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('memoryId',m.id,'version',m.version,'status',m.status,'content',m.content,
    'effectiveFrom',m.effective_from,'effectiveUntil',m.effective_until,'reviewAfter',m.review_after)
  FROM public.coach_memories m WHERE m.user_id=p_actor AND m.memory_key=p_key ORDER BY m.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.first_review_setup_declaration(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.valid_first_review_setup_contents(p_contents jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE goal jsonb; constraints jsonb; item jsonb; domains text[]:=ARRAY['strength','hypertrophy','power_explosiveness','speed_agility','aerobic','resilience'];
BEGIN
  IF jsonb_typeof(p_contents) IS DISTINCT FROM 'object' OR NOT p_contents ?& ARRAY['primary_goal','training_schedule','available_equipment','training_constraints']
    OR p_contents-ARRAY['primary_goal','training_schedule','available_equipment','training_constraints']<>'{}'::jsonb
    OR NOT public.valid_reviewed_setup_memory('training_schedule',p_contents->'training_schedule')
    OR NOT public.valid_reviewed_setup_memory('available_equipment',p_contents->'available_equipment') THEN RETURN false; END IF;
  goal:=p_contents->'primary_goal';constraints:=p_contents->'training_constraints';
  IF jsonb_typeof(goal) IS DISTINCT FROM 'object' OR NOT goal ?& ARRAY['goal','primaryDomain','secondaryGoals']
    OR goal-ARRAY['goal','primaryDomain','secondaryGoals']<>'{}'::jsonb OR jsonb_typeof(goal->'goal') IS DISTINCT FROM 'string'
    OR length(btrim(goal->>'goal'))<5 OR length(goal->>'goal')>500 OR jsonb_typeof(goal->'primaryDomain') IS DISTINCT FROM 'string'
    OR NOT (goal->>'primaryDomain'=ANY(domains)) OR jsonb_typeof(goal->'secondaryGoals') IS DISTINCT FROM 'array'
    OR jsonb_array_length(goal->'secondaryGoals')>5
    OR (SELECT count(DISTINCT g->>'domain') FROM jsonb_array_elements(goal->'secondaryGoals') g)<>jsonb_array_length(goal->'secondaryGoals') THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(goal->'secondaryGoals') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['domain','allocation','athleteIntent']
      OR item-ARRAY['domain','allocation','athleteIntent']<>'{}'::jsonb OR jsonb_typeof(item->'domain') IS DISTINCT FROM 'string'
      OR NOT(item->>'domain'=ANY(domains)) OR item->>'domain'=goal->>'primaryDomain'
      OR jsonb_typeof(item->'allocation') IS DISTINCT FROM 'string' OR item->>'allocation' NOT IN ('development','maintenance')
      OR jsonb_typeof(item->'athleteIntent') IS DISTINCT FROM 'string' OR length(btrim(item->>'athleteIntent'))=0
      OR length(item->>'athleteIntent')>500 THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(constraints) IS DISTINCT FROM 'object' OR NOT constraints ?& ARRAY['constraints','constraintKinds']
    OR constraints-ARRAY['constraints','constraintKinds']<>'{}'::jsonb OR jsonb_typeof(constraints->'constraints') IS DISTINCT FROM 'string'
    OR length(constraints->>'constraints')>4000 OR jsonb_typeof(constraints->'constraintKinds') IS DISTINCT FROM 'array'
    OR jsonb_array_length(constraints->'constraintKinds')>2
    OR (SELECT count(DISTINCT k) FROM jsonb_array_elements(constraints->'constraintKinds') k)<>jsonb_array_length(constraints->'constraintKinds') THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(constraints->'constraintKinds') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR item#>>'{}' NOT IN ('no_running','no_overhead') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_first_review_setup_contents(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.valid_first_review_setup_request(p_request jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE key text; v jsonb; declaration jsonb; field text;
BEGIN
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR pg_catalog.octet_length(p_request::text)>100000
    OR NOT p_request ?& ARRAY['schemaVersion','expectedUserId','programId','designationId','designationVersion','basePlanVersionId','requestId','expectedDeclarations','contents']
    OR p_request-ARRAY['schemaVersion','expectedUserId','programId','designationId','designationVersion','basePlanVersionId','requestId','expectedDeclarations','contents']<>'{}'::jsonb
    OR p_request->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR NOT public.valid_first_review_setup_contents(p_request->'contents')
    OR jsonb_typeof(p_request->'designationVersion') IS DISTINCT FROM 'number'
    OR (p_request->>'designationVersion')::numeric NOT BETWEEN 1 AND 2147483647
    OR (p_request->>'designationVersion')::numeric<>trunc((p_request->>'designationVersion')::numeric) THEN RETURN false; END IF;
  FOREACH key IN ARRAY ARRAY['expectedUserId','programId','designationId','basePlanVersionId','requestId'] LOOP
    IF jsonb_typeof(p_request->key) IS DISTINCT FROM 'string' OR p_request->>key !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RETURN false; END IF;
  END LOOP;
  v:=p_request->'expectedDeclarations';
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v ?& ARRAY['primary_goal','training_schedule','available_equipment','training_constraints']
    OR v-ARRAY['primary_goal','training_schedule','available_equipment','training_constraints']<>'{}'::jsonb THEN RETURN false; END IF;
  FOREACH key IN ARRAY ARRAY['primary_goal','training_schedule','available_equipment','training_constraints'] LOOP
    declaration:=v->key;
    IF declaration='null'::jsonb THEN CONTINUE; END IF;
    IF jsonb_typeof(declaration) IS DISTINCT FROM 'object'
      OR NOT declaration ?& ARRAY['memoryId','version','status','content','effectiveFrom','effectiveUntil','reviewAfter']
      OR declaration-ARRAY['memoryId','version','status','content','effectiveFrom','effectiveUntil','reviewAfter']<>'{}'::jsonb
      OR jsonb_typeof(declaration->'memoryId') IS DISTINCT FROM 'string'
      OR declaration->>'memoryId' !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      OR jsonb_typeof(declaration->'version') IS DISTINCT FROM 'number'
      OR (declaration->>'version')::numeric NOT BETWEEN 1 AND 2147483647
      OR (declaration->>'version')::numeric<>trunc((declaration->>'version')::numeric)
      OR jsonb_typeof(declaration->'status') IS DISTINCT FROM 'string'
      OR declaration->>'status' NOT IN ('confirmed','superseded','withdrawn')
      OR jsonb_typeof(declaration->'content') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    FOREACH field IN ARRAY ARRAY['effectiveFrom','effectiveUntil','reviewAfter'] LOOP
      IF declaration->field='null'::jsonb THEN CONTINUE; END IF;
      IF jsonb_typeof(declaration->field) IS DISTINCT FROM 'string' OR length(declaration->>field)>40
        OR declaration->>field !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
        OR NOT pg_catalog.isfinite((declaration->>field)::timestamptz) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_first_review_setup_request(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_first_review_setup_editor(p_program_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); program jsonb; declarations jsonb:='{}'; key text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  program:=public.first_review_workspace_program(p_program_id,actor);
  IF program IS NULL OR program->>'role'<>'athlete' OR program->'latestDesignation'='null'::jsonb THEN RETURN NULL; END IF;
  FOREACH key IN ARRAY ARRAY['primary_goal','training_schedule','available_equipment','training_constraints'] LOOP
    declarations:=declarations||jsonb_build_object(key,public.first_review_setup_declaration(actor,key));
  END LOOP;
  RETURN jsonb_build_object('schemaVersion',1,'userId',actor,'programId',p_program_id,
    'designationId',program#>'{latestDesignation,designationId}','designationVersion',program#>'{latestDesignation,version}',
    'basePlanVersionId',program#>'{latestDesignation,basePlanVersionId}','declarations',declarations);
END $$;

CREATE FUNCTION public.resolve_first_review_setup_request(p_request jsonb,p_close boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); saved public.coach_first_review_setup_requests%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.valid_first_review_setup_request(p_request) OR p_close IS NULL THEN RAISE EXCEPTION 'Invalid setup request' USING ERRCODE='22023'; END IF;
  IF p_request->>'expectedUserId'<>actor::text OR NOT EXISTS(SELECT 1 FROM public.training_programs
    WHERE id=(p_request->>'programId')::uuid AND user_id=actor) THEN RETURN NULL; END IF;
  IF p_close AND NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('first-review-setup:'||actor::text||':'||(p_request->>'requestId'),0)) THEN
    RAISE EXCEPTION 'Setup request is busy' USING ERRCODE='55P03'; END IF;
  SELECT * INTO saved FROM public.coach_first_review_setup_requests WHERE user_id=actor AND request_id=(p_request->>'requestId')::uuid;
  IF saved.request_id IS NOT NULL AND saved.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'Setup request identity differs' USING ERRCODE='22023'; END IF;
  IF saved.request_id IS NULL AND p_close THEN
    INSERT INTO public.coach_first_review_setup_requests(user_id,request_id,program_id,request,disposition)
    VALUES(actor,(p_request->>'requestId')::uuid,(p_request->>'programId')::uuid,p_request,'no_write') RETURNING * INTO saved;
  END IF;
  IF saved.request_id IS NULL THEN RETURN jsonb_build_object('schemaVersion',1,'request',p_request,'disposition','not_found'); END IF;
  RETURN jsonb_build_object('schemaVersion',1,'request',saved.request,'disposition',saved.disposition,'receipt',saved.receipt,'resolvedAt',saved.created_at);
END $$;

CREATE FUNCTION public.save_first_review_setup(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); d public.coach_first_review_designations%ROWTYPE; prior jsonb; key text; kind text;
  memory_id uuid; memory_version integer; memories jsonb:='{}'; receipt jsonb; paused boolean;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.valid_first_review_setup_request(p_request) THEN RAISE EXCEPTION 'Invalid setup request' USING ERRCODE='22023'; END IF;
  IF p_request->>'expectedUserId'<>actor::text THEN RAISE EXCEPTION 'Owned setup required' USING ERRCODE='42501'; END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('first-review-setup:'||actor::text||':'||(p_request->>'requestId'),0)) THEN
    RAISE EXCEPTION 'Setup request is busy' USING ERRCODE='55P03'; END IF;
  prior:=public.resolve_first_review_setup_request(p_request,false);
  IF prior IS NULL THEN RAISE EXCEPTION 'Owned setup unavailable' USING ERRCODE='P0002'; END IF;
  IF prior->>'disposition'='saved' THEN RETURN prior; END IF;
  IF prior->>'disposition'='no_write' THEN RAISE EXCEPTION 'Setup request is permanently closed' USING ERRCODE='55000'; END IF;
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=(p_request->>'designationId')::uuid;
  IF d.id IS NULL OR d.user_id<>actor OR d.program_id<>(p_request->>'programId')::uuid
    OR d.base_plan_version_id<>(p_request->>'basePlanVersionId')::uuid OR d.version<>(p_request->>'designationVersion')::integer THEN
    RAISE EXCEPTION 'Current owned designation required' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_first_review_designation_current(d.id);
  SELECT c.paused INTO paused FROM public.coaching_write_control c WHERE c.singleton FOR SHARE NOWAIT;
  IF paused IS DISTINCT FROM false THEN RAISE EXCEPTION 'Coaching writes are paused' USING ERRCODE='55000'; END IF;
  -- Acquire every existing writer's per-key lock before checking any CAS value.
  -- Sorted fail-fast locks avoid partial no-row races and cross-program deadlocks.
  FOREACH key IN ARRAY ARRAY['available_equipment','primary_goal','training_constraints','training_schedule'] LOOP
    IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':'||key,0)) THEN
      RAISE EXCEPTION 'Setup declaration is busy' USING ERRCODE='55P03'; END IF;
    -- Ordinary review/correction starts with this row lock. Never wait for it
    -- while holding its key lock; fail fast and retain the exact request instead.
    -- This also fences lifecycle-only changes that do not take the key lock.
    PERFORM 1 FROM public.coach_memories WHERE user_id=actor AND memory_key=key
      ORDER BY version DESC LIMIT 1 FOR UPDATE NOWAIT;
    IF coalesce(public.first_review_setup_declaration(actor,key),'null'::jsonb) IS DISTINCT FROM p_request#>ARRAY['expectedDeclarations',key] THEN
      RAISE EXCEPTION 'Setup declaration changed' USING ERRCODE='40001'; END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['available_equipment','primary_goal','training_constraints','training_schedule'] LOOP
    kind:=CASE key WHEN 'primary_goal' THEN 'goal' WHEN 'training_schedule' THEN 'schedule' WHEN 'available_equipment' THEN 'equipment' ELSE 'constraint' END;
    IF p_request#>ARRAY['expectedDeclarations',key] <> 'null'::jsonb
      AND p_request#>>ARRAY['expectedDeclarations',key,'status']='confirmed' THEN
      SELECT r.replacement_memory_id,r.replacement_version INTO memory_id,memory_version FROM public.correct_coach_memory_with_review(
        (p_request#>>ARRAY['expectedDeclarations',key,'memoryId'])::uuid,p_request#>ARRAY['contents',key],
        'first-review-setup:'||(p_request->>'requestId')||':'||key) r;
    ELSE
      SELECT r.memory_id,r.memory_version INTO memory_id,memory_version FROM public.confirm_coach_memory(key,kind,
        p_request#>ARRAY['contents',key],jsonb_build_object('source','first_reviewed_setup','confirmedBy','athlete'),1,
        'first-review-setup:'||(p_request->>'requestId')||':'||key) r;
    END IF;
    memories:=memories||jsonb_build_object(key,jsonb_build_object('memoryId',memory_id,'version',memory_version,'content',p_request#>ARRAY['contents',key]));
  END LOOP;
  PERFORM public.assert_first_review_designation_current(d.id);
  receipt:=jsonb_build_object('userId',actor,'programId',d.program_id,'requestId',p_request->>'requestId','memories',memories);
  INSERT INTO public.coach_first_review_setup_requests(user_id,request_id,program_id,request,disposition,receipt)
    VALUES(actor,(p_request->>'requestId')::uuid,d.program_id,p_request,'saved',receipt);
  RETURN public.resolve_first_review_setup_request(p_request,false);
END $$;

REVOKE ALL ON FUNCTION public.read_first_review_setup_editor(uuid),public.resolve_first_review_setup_request(jsonb,boolean),public.save_first_review_setup(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_first_review_setup_editor(uuid),public.resolve_first_review_setup_request(jsonb,boolean),public.save_first_review_setup(jsonb) TO authenticated;
COMMIT;
