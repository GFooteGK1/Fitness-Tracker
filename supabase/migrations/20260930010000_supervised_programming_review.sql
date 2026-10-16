-- ADR0035 review-authority foundation only. No registration, issuance or activation.
BEGIN;

CREATE TABLE public.coach_supervised_programs (
  program_id uuid PRIMARY KEY REFERENCES public.training_programs(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.coach_supervised_enrollments (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.coach_supervised_programs(program_id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  version integer NOT NULL CHECK(version>0),
  enabled boolean NOT NULL,
  expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
  operations jsonb NOT NULL CHECK(jsonb_typeof(operations)='array'),
  operator_ref text NOT NULL CHECK(length(btrim(operator_ref)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(program_id,version)
);
CREATE TABLE public.coach_supervised_candidates (
  id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL REFERENCES public.coach_supervised_enrollments(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  program_id uuid NOT NULL REFERENCES public.coach_supervised_programs(program_id),
  base_plan_version_id uuid NOT NULL REFERENCES public.training_plan_versions(id),
  private_packet jsonb NOT NULL,
  review_packet jsonb NOT NULL,
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.coach_supervised_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.coach_supervised_candidates(id),
  request_id uuid NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK(decision IN ('approve','reject')),
  enrollment_id uuid NOT NULL REFERENCES public.coach_supervised_enrollments(id),
  content_hash text NOT NULL,
  source_hash text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(reviewer_id,request_id)
);

CREATE FUNCTION public.protect_supervised_authority() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Supervised authority records are immutable' USING ERRCODE='55000'; END $$;
REVOKE ALL ON FUNCTION public.protect_supervised_authority() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['coach_supervised_programs','coach_supervised_enrollments','coach_supervised_candidates','coach_supervised_decisions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    EXECUTE format('CREATE TRIGGER immutable_supervised_authority BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority()',t);
  END LOOP;
END $$;

CREATE FUNCTION public.supervised_enrollment_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('enrollmentId',e.id,'programId',e.program_id,'userId',e.user_id,'reviewerId',e.reviewer_id,
    'version',e.version,'enabled',e.enabled,'expiresAt',e.expires_at,'operations',e.operations)
  FROM public.coach_supervised_enrollments e WHERE e.id=p_id
$$;
REVOKE ALL ON FUNCTION public.supervised_enrollment_json(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.version_supervised_enrollment(p_id uuid,p_program_id uuid,p_user_id uuid,p_reviewer_id uuid,
  p_expected_version integer,p_enabled boolean,p_expires_at timestamptz,p_operations jsonb,p_operator_ref text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.coach_supervised_enrollments%ROWTYPE; current_version integer; owned public.training_programs%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_program_id IS NULL OR p_user_id IS NULL OR p_reviewer_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0
    OR p_enabled IS NULL OR p_expires_at IS NULL OR NOT isfinite(p_expires_at)
    OR p_operator_ref IS NULL OR length(btrim(p_operator_ref)) NOT BETWEEN 1 AND 200
    OR p_operations IS NULL OR jsonb_typeof(p_operations)<>'array' OR jsonb_array_length(p_operations) NOT BETWEEN 1 AND 2
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_operations) op WHERE op NOT IN ('"same_week"'::jsonb,'"next_week"'::jsonb))
    OR (SELECT count(DISTINCT op) FROM jsonb_array_elements(p_operations) op)<>jsonb_array_length(p_operations) THEN
    RAISE EXCEPTION 'Invalid supervised enrollment' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supervised-program:'||p_program_id::text,0));
  SELECT * INTO old FROM public.coach_supervised_enrollments WHERE id=p_id;
  IF FOUND THEN
    IF old.program_id IS DISTINCT FROM p_program_id OR old.user_id IS DISTINCT FROM p_user_id OR old.reviewer_id IS DISTINCT FROM p_reviewer_id
      OR old.version<>p_expected_version+1 OR old.enabled IS DISTINCT FROM p_enabled OR old.expires_at IS DISTINCT FROM p_expires_at
      OR old.operations IS DISTINCT FROM p_operations OR old.operator_ref IS DISTINCT FROM p_operator_ref THEN
      RAISE EXCEPTION 'Enrollment identity conflicts with saved content' USING ERRCODE='22023'; END IF;
    RETURN public.supervised_enrollment_json(old.id);
  END IF;
  SELECT * INTO owned FROM public.training_programs WHERE id=p_program_id AND user_id=p_user_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR ((p_enabled OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=p_program_id))
    AND (owned.status<>'active' OR owned.program_mode<>'rolling_weekly'
    OR NOT EXISTS(SELECT 1 FROM public.training_plan_versions v WHERE v.id=owned.active_plan_version_id AND v.program_id=owned.id
      AND v.user_id=p_user_id AND v.status='accepted' AND v.plan_mode='rolling_weekly'
      AND v.intent->>'format'='reviewed_weekly_intent_v0_1'))) THEN
    RAISE EXCEPTION 'Owned accepted reviewed base required' USING ERRCODE='55000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_reviewer_id) OR (p_enabled AND p_expires_at<=clock_timestamp()) THEN
    RAISE EXCEPTION 'Reviewer or enrollment expiry invalid' USING ERRCODE='22023'; END IF;
  INSERT INTO public.coach_supervised_programs(program_id,user_id) VALUES(p_program_id,p_user_id) ON CONFLICT(program_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=p_program_id AND user_id=p_user_id) THEN
    RAISE EXCEPTION 'Supervised program owner changed' USING ERRCODE='55000'; END IF;
  SELECT coalesce(max(version),0) INTO current_version FROM public.coach_supervised_enrollments WHERE program_id=p_program_id;
  IF current_version<>p_expected_version THEN RAISE EXCEPTION 'Enrollment version changed' USING ERRCODE='40001'; END IF;
  INSERT INTO public.coach_supervised_enrollments(id,program_id,user_id,reviewer_id,version,enabled,expires_at,operations,operator_ref)
    VALUES(p_id,p_program_id,p_user_id,p_reviewer_id,current_version+1,p_enabled,p_expires_at,p_operations,p_operator_ref);
  RETURN public.supervised_enrollment_json(p_id);
END $$;
REVOKE ALL ON FUNCTION public.version_supervised_enrollment(uuid,uuid,uuid,uuid,integer,boolean,timestamptz,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.version_supervised_enrollment(uuid,uuid,uuid,uuid,integer,boolean,timestamptz,jsonb,text) TO service_role;

CREATE FUNCTION public.assert_supervised_enrollment_current(p_id uuid,p_operation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.coach_supervised_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.coach_supervised_enrollments WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supervised enrollment unavailable' USING ERRCODE='55000'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supervised-program:'||e.program_id::text,0));
  IF NOT e.enabled OR e.expires_at<=clock_timestamp() OR NOT(e.operations ? p_operation)
    OR e.version IS DISTINCT FROM (SELECT max(version) FROM public.coach_supervised_enrollments WHERE program_id=e.program_id) THEN
    RAISE EXCEPTION 'Supervised enrollment changed or disabled' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_supervised_enrollment_current(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Private packet validation reuses the authoritative execution/intent/setup checks.
-- It creates no reviewed registration and conveys no issuance authority.
CREATE FUNCTION public.assert_supervised_source_current(p_packet jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE binding jsonb:=p_packet#>'{source,binding}'; base jsonb:=binding->'base'; owner uuid:=(p_packet->>'userId')::uuid;
  program public.training_programs%ROWTYPE; plan public.training_plan_versions%ROWTYPE;
  current_program jsonb; current_plan jsonb; states jsonb; checked_at timestamptz; offset_minutes integer; source_day date;
BEGIN
  SELECT * INTO program FROM public.training_programs WHERE id=(binding#>>'{scope,programId}')::uuid AND user_id=owner FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supervised program unavailable' USING ERRCODE='40001'; END IF;
  SELECT * INTO plan FROM public.training_plan_versions WHERE id=(binding#>>'{scope,basePlanVersionId}')::uuid
    AND user_id=owner AND program_id=program.id FOR UPDATE NOWAIT;
  IF NOT FOUND OR program.status<>'active' OR program.program_mode<>'rolling_weekly' OR program.active_plan_version_id IS DISTINCT FROM plan.id
    OR plan.status<>'accepted' OR plan.plan_mode<>'rolling_weekly' OR plan.intent->>'format' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1' THEN
    RAISE EXCEPTION 'Supervised accepted base changed' USING ERRCODE='40001'; END IF;
  current_program:=jsonb_build_object('id',program.id,'user_id',program.user_id,'status',program.status,'program_mode',program.program_mode,'active_plan_version_id',plan.id);
  current_plan:=jsonb_build_object('id',plan.id,'user_id',plan.user_id,'program_id',plan.program_id,'status',plan.status,'plan_mode',plan.plan_mode,
    'intent',plan.intent,'input_snapshot',plan.input_snapshot,'window_start',plan.window_start,'window_end',plan.window_end,'sequence_number',plan.sequence_number);
  IF current_program IS DISTINCT FROM base->'program' OR current_plan IS DISTINCT FROM base->'plan' THEN
    RAISE EXCEPTION 'Supervised accepted source changed' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_reviewed_execution_continuity(p_packet);
  PERFORM public.assert_coach_context_revision(owner,binding->'revision');
  checked_at:=clock_timestamp(); offset_minutes:=(binding#>>'{scope,tzOffset}')::integer; source_day:=(binding#>>'{scope,historyThrough}')::date;
  IF offset_minutes IS NULL OR offset_minutes NOT BETWEEN -840 AND 840
    OR source_day IS DISTINCT FROM ((checked_at AT TIME ZONE 'UTC')-make_interval(mins=>offset_minutes))::date
    OR p_packet#>>'{source,validBefore}' IS NULL OR NOT isfinite((p_packet#>>'{source,validBefore}')::timestamptz)
    OR (p_packet#>>'{source,validBefore}')::timestamptz<=checked_at
    OR p_packet->>'policyVersion' IS DISTINCT FROM 'initial-dose-0.2.0'
    OR p_packet->>'movementCatalogVersion' IS DISTINCT FROM 'reviewed-identities-0.1.0' THEN
    RAISE EXCEPTION 'Supervised source validity elapsed' USING ERRCODE='40001'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'state',CASE
    WHEN m.status<>'confirmed' THEN 'unconfirmed' WHEN m.effective_from>checked_at THEN 'future'
    WHEN m.effective_until<=checked_at THEN 'expired' WHEN m.review_after<=checked_at THEN 'review_due' ELSE 'current' END)
    ORDER BY m.id),'[]'::jsonb) INTO states FROM public.coach_memories m WHERE m.user_id=owner;
  IF states IS DISTINCT FROM binding->'memoryStates' THEN RAISE EXCEPTION 'Supervised memory lifecycle changed' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_coach_plan_intent_current(owner,p_packet->'intent');
  PERFORM public.assert_coach_setup_memories_current(owner,p_packet#>'{inputSnapshot,setupMemoryBindings}',p_packet->'intent');
END $$;
REVOKE ALL ON FUNCTION public.assert_supervised_source_current(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.supervised_candidate_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('candidateId',c.id,'enrollmentId',e.id,'enrollmentVersion',e.version,'programId',c.program_id,'userId',c.user_id,
    'reviewerId',e.reviewer_id,'basePlanVersionId',c.base_plan_version_id,'transition',c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}',
    'contentHash',c.content_hash,'sourceHash',c.source_hash,'reviewPacket',c.review_packet,'createdAt',c.created_at)
  FROM public.coach_supervised_candidates c JOIN public.coach_supervised_enrollments e ON e.id=c.enrollment_id WHERE c.id=p_id
$$;
REVOKE ALL ON FUNCTION public.supervised_candidate_json(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Same explicit nested field map as supervised-programming-contract.ts; parity is tested.
CREATE FUNCTION public.supervised_review_field_map() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT '{"week":{"kind":"scalar","format":"scalar","schemaVersion":"scalar","title":"scalar","sequenceNumber":"scalar","windowStart":"scalar","windowEnd":"scalar","profileSnapshot":"profile","directionSnapshot":"direction","basis":"basis","baseSchedule":"schedule","scheduledSessions":"[]slot","spacing":"[]spacing","instructions":"[]scalar","limitations":"[]scalar","adaptiveEvaluation":"scalar"},"profile":{"schemaVersion":"scalar","kernelVersion":"scalar","athleteGoalSummary":"scalar","primaryGoal":"allocation","secondaryGoals":"[]allocation","trainingExperience":"scalar","startDate":"scalar","sessionAvailability":"[]availability","equipment":"equipment","explicitConstraints":"[]constraint","unresolvedConstraintNote":"scalar","preferences":"[]preference","assessments":"[]assessment","recentTraining":"recent","inputSource":"inputSource","exercisePreferences":"exercisePreferences","preferenceNotes":"[]scalar","executionPriority":"executionPriority","trainingIntent":"intentSnapshot","planningContext":"planningContext","prescriptionBasis":"prescriptionBasis"},"allocation":{"id":"scalar","domain":"scalar","role":"scalar","allocation":"scalar","athleteIntent":"scalar","outcome":"outcome"},"outcome":{"statement":"scalar","kind":"scalar","horizon":"horizon","target":"goalTarget"},"horizon":{"startsOn":"scalar","endsOn":"scalar"},"availability":{"day":"scalar","minutes":"scalar"},"equipment":{"resolvedIds":"[]scalar","unresolvedAthleteDescription":"scalar"},"constraint":{"id":"scalar","kind":"scalar","description":"scalar","source":"scalar"},"preference":{"movementId":"scalar","preference":"scalar","source":"scalar"},"assessment":{"id":"scalar","movement":"scalar","variation":"scalar","load":"scalar","unit":"scalar","reps":"scalar","assessedOn":"scalar","isTrueRepMax":"scalar","rir":"scalar","rpe":"scalar","athleteConfidence":"scalar","estimatedOneRepMax":"scalar","estimateKind":"scalar","calculatorVersion":"scalar"},"recent":{"asOfDate":"scalar","lookbackDays":"scalar","completedSessionCount":"scalar","performedMovementIds":"[]scalar","doseByCoverageTarget":"[]coverageDose"},"coverageDose":{"kind":"scalar","targetId":"scalar","unit":"scalar","amount":"scalar"},"inputSource":{"kind":"scalar","snapshot":"legacyInput"},"legacyInput":{"primaryDomain":"scalar","goal":"scalar","experience":"scalar","trainingDays":"[]scalar","sessionMinutes":"scalar","equipment":"scalar","constraints":"scalar","startDate":"scalar"},"exercisePreferences":{"schemaVersion":"scalar","state":"scalar","entries":"[]exercisePreferenceEntry"},"exercisePreferenceEntry":{"athleteWording":"scalar","target":"exercisePreferenceTarget"},"exercisePreferenceTarget":{"kind":"scalar","id":"scalar"},"executionPriority":{"goalId":"scalar","movementId":"scalar"},"intentSnapshot":{"schemaVersion":"scalar","memoryId":"scalar","memoryVersion":"scalar","content":"intentContent"},"intentContent":{"schemaVersion":"scalar","outcomes":"[]planningOutcome","priorityOrder":"[]scalar","event":"event","confirmedAt":"scalar"},"planningOutcome":{"goal":"goal","domain":"scalar","measurement":"measurement","binding":"goalBinding","baseline":"baseline","capability":"capability"},"goal":{"schemaVersion":"scalar","id":"scalar","kind":"scalar","statement":"scalar","priority":"scalar","status":"scalar","target":"goalTarget","targetDate":"scalar","requiredQualityIds":"[]scalar","source":"goalSource"},"goalTarget":{"role":"scalar","comparison":"scalar","metric":"metric","upperMetric":"metric","assessmentDefinition":"pair","protocol":"pair"},"metric":{"metricId":"scalar","value":"scalar","unit":"scalar"},"pair":{"id":"scalar","version":"scalar"},"goalSource":{"kind":"scalar","confirmedAt":"scalar"},"measurement":{"metricId":"scalar","unit":"scalar","assessmentDefinition":"pair","protocol":"pair"},"goalBinding":{"movementId":"scalar","distance":"quantity","equipmentIds":"[]scalar","variation":"scalar","assessmentContext":"assessmentContext"},"quantity":{"value":"scalar","unit":"scalar"},"assessmentContext":{"repetitions":"scalar","externalLoad":"quantity","duration":"quantity","techniqueModifiers":"[]scalar","environmentModifiers":"[]scalar"},"baseline":{"status":"scalar","observationId":"scalar"},"capability":{"status":"scalar","reason":"scalar"},"event":{"name":"scalar","goalIds":"[]scalar","date":"scalar"},"planningContext":{"version":"scalar","mode":"scalar","userId":"scalar","asOf":"scalar","startsOn":"scalar","endsOn":"scalar","status":"scalar","retrievalComplete":"scalar","loggingCoverage":"scalar","sourceIds":"[]scalar","movements":"[]contextMovement","missing":"[]scalar","outsideTraining":"outsideTraining"},"contextMovement":{"movementId":"scalar","workoutId":"scalar","sourcePath":"scalar","eventDate":"scalar","capturedAt":"scalar","revision":"scalar","snapshotId":"scalar","origin":"scalar","reviewState":"scalar","completionId":"scalar","familiarityEligible":"scalar"},"outsideTraining":{"status":"scalar","sourceIds":"[]scalar","notes":"[]scalar"},"prescriptionBasis":{"version":"scalar","numericalBasis":"scalar","numericPolicyEligible":"scalar","historyAsOf":"scalar","sourceIds":"[]scalar","familiarityMovementIds":"[]scalar","restrictions":"[]scalar","equipmentIds":"[]scalar","missing":"[]scalar","statement":"scalar"},"direction":{"schemaVersion":"scalar","goalSummary":"scalar","goalTargetDate":"scalar","currentEmphasis":"[]emphasis","hypothesis":"scalar","constraintIds":"[]scalar","trainingIntent":"intentSnapshot"},"emphasis":{"goalAllocationId":"scalar","domain":"scalar","allocation":"scalar"},"basis":{"recipeId":"scalar","recipeHash":"scalar","contextHash":"scalar","scheduleId":"scalar","reason":"scalar"},"schedule":{"monday":"scalar","tuesday":"scalar","wednesday":"scalar","thursday":"scalar","friday":"scalar","saturday":"scalar","sunday":"scalar"},"slot":{"scheduledDate":"scalar","prescription":"prescription"},"spacing":{"from":"scalar","to":"scalar","baseDays":"scalar","selectedDays":"scalar"},"prescription":{"format":"scalar","schemaVersion":"scalar","policyVersion":"scalar","sessionId":"scalar","day":"scalar","title":"scalar","intent":"scalar","scheduledMinutes":"scalar","estimatedSeconds":"scalar","content":"session","protocols":"[]protocol","source":"source"},"session":{"id":"scalar","steps":"[]step","themes":"[]scalar","instructions":"[]scalar","conditionalTiming":"conditionalTiming","optionalTail":"optionalTail"},"conditionalTiming":{"kind":"scalar","whenOverBudget":"scalar"},"optionalTail":{"fromStepId":"scalar","reason":"scalar"},"step":{"kind":"scalar","id":"scalar","movementId":"scalar","role":"scalar","requiredEquipment":"[]scalar","sets":"scalar","work":"work","load":"load","effort":"effort","restBetweenSeconds":"rest","restAfterSeconds":"rest","protocolId":"scalar","instructions":"[]scalar","seconds":"scalar","activities":"[]step","purpose":"scalar"},"work":{"kind":"scalar","repetitions":"range","sides":"scalar","secondsPerRep":"scalar","targetRir":"scalar","estimatedSecondsPerSet":"scalar","sideSwitchSeconds":"scalar","seconds":"scalar","stages":"[]stage","targetSeconds":"scalar","allowanceSeconds":"scalar","finish":"scalar"},"range":{"min":"scalar","max":"scalar"},"stage":{"label":"scalar","metres":"scalar"},"load":{"kind":"scalar","value":"scalar","unit":"scalar","convention":"scalar","instruction":"scalar"},"effort":{"kind":"scalar","min":"scalar","max":"scalar","cue":"scalar"},"rest":{"kind":"scalar","estimatedSeconds":"scalar"},"protocol":{"id":"scalar","sessionId":"scalar","activityId":"scalar","instructions":"[]scalar","sensorMetadata":"scalar","actualObservations":"[]scalar"},"source":{"recipeId":"scalar","recipeHash":"scalar","review":"review","sources":"[]sourceBinding"},"review":{"id":"scalar","contentHash":"scalar"},"sourceBinding":{"id":"scalar","revision":"scalar","contentHash":"scalar"}}'::jsonb
$$;
REVOKE ALL ON FUNCTION public.supervised_review_field_map() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.supervised_review_fields_valid(p_value jsonb,p_shape text DEFAULT 'week',p_depth integer DEFAULT 0) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE fields jsonb; item record;
BEGIN
  IF p_depth>30 OR p_value IS NULL OR p_shape IS NULL THEN RETURN false; END IF;
  IF p_value='null'::jsonb THEN RETURN true; END IF;
  IF p_shape='scalar' THEN RETURN jsonb_typeof(p_value) IN ('string','number','boolean'); END IF;
  IF p_shape='rest' AND jsonb_typeof(p_value)='number' THEN RETURN true; END IF;
  IF left(p_shape,2)='[]' THEN
    IF jsonb_typeof(p_value)<>'array' THEN RETURN false; END IF;
    RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_value) child WHERE NOT public.supervised_review_fields_valid(child,substr(p_shape,3),p_depth+1));
  END IF;
  fields:=public.supervised_review_field_map()->p_shape;
  IF fields IS NULL OR jsonb_typeof(p_value)<>'object' THEN RETURN false; END IF;
  FOR item IN SELECT key,value FROM jsonb_each(p_value) LOOP
    IF NOT(fields ? item.key) OR NOT public.supervised_review_fields_valid(item.value,fields->>item.key,p_depth+1) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.supervised_review_fields_valid(jsonb,text,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.submit_supervised_candidate(p_id uuid,p_enrollment_id uuid,p_private_packet jsonb,p_review_packet jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.coach_supervised_enrollments%ROWTYPE; saved public.coach_supervised_candidates%ROWTYPE; k text;
  manifest jsonb; item jsonb; source jsonb:=p_review_packet->'evidenceSource'; operation text:=p_private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}';
BEGIN
  IF p_id IS NULL OR p_enrollment_id IS NULL OR jsonb_typeof(p_private_packet) IS DISTINCT FROM 'object'
    OR octet_length(p_private_packet::text)>16000000 OR p_private_packet->'schemaVersion' IS DISTINCT FROM '2'::jsonb
    OR p_private_packet->>'registrationId' IS DISTINCT FROM p_id::text
    OR jsonb_typeof(p_review_packet) IS DISTINCT FROM 'object' OR octet_length(p_review_packet::text)>1000000
    OR (SELECT count(*) FROM jsonb_object_keys(p_review_packet))<>9
    OR NOT(p_review_packet ?& ARRAY['schemaVersion','reviewMode','week','baseWeek','rationale','changes','evidence','evidenceSource','limitations'])
    OR p_review_packet->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR p_review_packet->>'reviewMode' IS DISTINCT FROM 'manual_complete_week'
    OR p_review_packet->'week' IS DISTINCT FROM p_private_packet#>'{intent,reviewed_week}'
    OR p_review_packet->'baseWeek' IS DISTINCT FROM p_private_packet#>'{source,binding,base,plan,intent,reviewed_week}'
    OR jsonb_typeof(p_review_packet->'week') IS DISTINCT FROM 'object' OR jsonb_typeof(p_review_packet->'baseWeek') IS DISTINCT FROM 'object'
    OR NOT public.supervised_review_fields_valid(p_review_packet->'week') OR NOT public.supervised_review_fields_valid(p_review_packet->'baseWeek')
    OR jsonb_typeof(p_review_packet->'rationale') IS DISTINCT FROM 'string' OR length(btrim(p_review_packet->>'rationale')) NOT BETWEEN 1 AND 4000
    OR jsonb_typeof(source) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(source))<>4
    OR NOT(source ?& ARRAY['sourceHash','revision','historyThrough','historyDays'])
    OR source->'sourceHash' IS DISTINCT FROM p_private_packet#>'{source,contextHash}'
    OR (source->>'sourceHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR source->'revision' IS DISTINCT FROM p_private_packet#>'{source,binding,revision}'
    OR source->'historyThrough' IS DISTINCT FROM p_private_packet#>'{source,binding,scope,historyThrough}'
    OR source->'historyDays' IS DISTINCT FROM p_private_packet#>'{source,binding,scope,historyDays}'
    OR operation IS NULL OR operation NOT IN ('same_week','next_week') THEN
    RAISE EXCEPTION 'Invalid supervised review packet' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['changes','evidence','limitations'] LOOP
    IF jsonb_typeof(p_review_packet->k) IS DISTINCT FROM 'array' OR jsonb_array_length(p_review_packet->k)>(CASE WHEN k='limitations' THEN 32 ELSE 64 END)
      OR (k<>'evidence' AND jsonb_array_length(p_review_packet->k)=0) THEN RAISE EXCEPTION 'Invalid bounded review projection' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_review_packet->'limitations') LOOP
    IF jsonb_typeof(item)<>'string' OR length(btrim(item#>>'{}')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid review limitation' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_review_packet->'evidence') LOOP
    IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR NOT(item ?& ARRAY['sourceId','summary'])
      OR jsonb_typeof(item->'sourceId') IS DISTINCT FROM 'string' OR length(btrim(item->>'sourceId')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(item->'summary') IS DISTINCT FROM 'string' OR length(btrim(item->>'summary')) NOT BETWEEN 1 AND 4000 THEN
      RAISE EXCEPTION 'Invalid bounded review evidence' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_review_packet->'changes') LOOP
    IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR NOT(item ?& ARRAY['kind','summary','sessionIds'])
      OR item->>'kind' NOT IN ('changed','preserved','removed') OR jsonb_typeof(item->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'summary') IS DISTINCT FROM 'string'
      OR length(btrim(item->>'summary')) NOT BETWEEN 1 AND 1000 OR jsonb_typeof(item->'sessionIds') IS DISTINCT FROM 'array'
      OR jsonb_array_length(item->'sessionIds')>7 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'sessionIds') sid WHERE jsonb_typeof(sid)<>'string'
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements((p_review_packet#>'{week,scheduledSessions}')||(p_review_packet#>'{baseWeek,scheduledSessions}')) slot WHERE slot#>'{prescription,content,id}'=sid))
      OR (SELECT count(DISTINCT sid) FROM jsonb_array_elements(item->'sessionIds') sid)<>jsonb_array_length(item->'sessionIds') THEN
      RAISE EXCEPTION 'Invalid bounded review change' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT * INTO e FROM public.coach_supervised_enrollments WHERE id=p_enrollment_id;
  IF NOT FOUND OR p_private_packet->>'userId' IS DISTINCT FROM e.user_id::text
    OR p_private_packet#>>'{source,binding,userId}' IS DISTINCT FROM e.user_id::text
    OR p_private_packet#>>'{source,binding,scope,programId}' IS DISTINCT FROM e.program_id::text THEN
    RAISE EXCEPTION 'Candidate enrollment owner mismatch' USING ERRCODE='22023'; END IF;
  -- Stable lock order: program before candidate, including saved submission recovery.
  -- The current-version assertion remains below replay so revocation cannot erase a receipt.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supervised-program:'||e.program_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supervised-candidate:'||p_id::text,0));
  SELECT * INTO saved FROM public.coach_supervised_candidates WHERE id=p_id;
  IF FOUND THEN
    IF saved.enrollment_id IS DISTINCT FROM e.id OR saved.private_packet IS DISTINCT FROM p_private_packet OR saved.review_packet IS DISTINCT FROM p_review_packet THEN
      RAISE EXCEPTION 'Candidate identity conflicts with saved content' USING ERRCODE='22023'; END IF;
    RETURN public.supervised_candidate_json(saved.id);
  END IF;
  PERFORM public.assert_supervised_enrollment_current(e.id,operation);
  IF p_private_packet#>>'{intent,format}' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1'
    OR p_private_packet#>'{intent,horizon_weeks}' IS DISTINCT FROM '1'::jsonb
    OR p_private_packet#>>'{source,binding,version}' IS DISTINCT FROM 'reviewed-dose-context-3'
    OR source->'revision' IS DISTINCT FROM p_private_packet#>'{inputSnapshot,contextRevision}'
    OR source->'sourceHash' IS DISTINCT FROM p_private_packet#>'{inputSnapshot,reviewedSourceHash}'
    OR p_private_packet#>'{source,binding,setup}' IS DISTINCT FROM p_private_packet#>'{inputSnapshot,setupMemoryBindings}' THEN
    RAISE EXCEPTION 'Private candidate source contract differs' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(jsonb_build_object('week_number',1,'session_index',s.idx,'scheduled_date',s.value->>'scheduledDate','prescription',s.value->'prescription') ORDER BY s.idx)
    INTO manifest FROM jsonb_array_elements(p_review_packet#>'{week,scheduledSessions}') WITH ORDINALITY s(value,idx);
  IF manifest IS DISTINCT FROM p_private_packet->'sessions' THEN RAISE EXCEPTION 'Candidate session manifest differs' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_supervised_source_current(p_private_packet);
  INSERT INTO public.coach_supervised_candidates(id,enrollment_id,user_id,program_id,base_plan_version_id,private_packet,review_packet,content_hash,source_hash)
    VALUES(p_id,e.id,e.user_id,e.program_id,(p_private_packet#>>'{source,binding,scope,basePlanVersionId}')::uuid,p_private_packet,p_review_packet,
      encode(sha256(convert_to(p_review_packet::text,'UTF8')),'hex'),source->>'sourceHash');
  RETURN public.supervised_candidate_json(p_id);
END $$;
REVOKE ALL ON FUNCTION public.submit_supervised_candidate(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_supervised_candidate(uuid,uuid,jsonb,jsonb) TO service_role;

CREATE FUNCTION public.get_supervised_candidate(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.coach_supervised_candidates%ROWTYPE; e public.coach_supervised_enrollments%ROWTYPE; actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO e FROM public.coach_supervised_enrollments WHERE id=c.enrollment_id;
  IF actor<>c.user_id THEN
    IF actor<>e.reviewer_id THEN RETURN NULL; END IF;
    PERFORM public.assert_supervised_enrollment_current(e.id,c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}');
  END IF;
  RETURN public.supervised_candidate_json(c.id);
END $$;
REVOKE ALL ON FUNCTION public.get_supervised_candidate(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_supervised_candidate(uuid) TO authenticated;

CREATE FUNCTION public.supervised_decision_json(p_id uuid,p_replayed boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('candidateId',d.candidate_id,'decisionId',d.id,'requestId',d.request_id,'decision',d.decision,
    'reviewerId',d.reviewer_id,'enrollmentId',d.enrollment_id,'enrollmentVersion',e.version,'contentHash',d.content_hash,
    'sourceHash',d.source_hash,'decidedAt',d.decided_at,'replayed',p_replayed)
  FROM public.coach_supervised_decisions d JOIN public.coach_supervised_enrollments e ON e.id=d.enrollment_id WHERE d.id=p_id
$$;
REVOKE ALL ON FUNCTION public.supervised_decision_json(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.decide_supervised_candidate(p_id uuid,p_request_id uuid,p_decision text,p_content_hash text,p_source_hash text,p_enrollment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); c public.coach_supervised_candidates%ROWTYPE; e public.coach_supervised_enrollments%ROWTYPE; d public.coach_supervised_decisions%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_request_id IS NULL OR p_enrollment_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('approve','reject')
    OR p_content_hash IS NULL OR p_source_hash IS NULL THEN RAISE EXCEPTION 'Invalid review decision' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supervised-decision:'||actor::text||':'||p_request_id::text,0));
  SELECT * INTO d FROM public.coach_supervised_decisions WHERE reviewer_id=actor AND request_id=p_request_id;
  IF FOUND THEN
    IF d.candidate_id IS DISTINCT FROM p_id OR d.enrollment_id IS DISTINCT FROM p_enrollment_id OR d.decision IS DISTINCT FROM p_decision
      OR d.content_hash IS DISTINCT FROM p_content_hash OR d.source_hash IS DISTINCT FROM p_source_hash THEN
      RAISE EXCEPTION 'Decision request conflicts with saved receipt' USING ERRCODE='22023'; END IF;
    RETURN public.supervised_decision_json(d.id,true);
  END IF;
  SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review candidate unavailable' USING ERRCODE='P0002'; END IF;
  SELECT * INTO e FROM public.coach_supervised_enrollments WHERE id=c.enrollment_id;
  IF e.reviewer_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Review candidate unavailable' USING ERRCODE='P0002'; END IF;
  IF p_enrollment_id IS DISTINCT FROM e.id OR p_content_hash IS DISTINCT FROM c.content_hash OR p_source_hash IS DISTINCT FROM c.source_hash THEN
    RAISE EXCEPTION 'Decision does not bind exact candidate' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_supervised_enrollment_current(e.id,c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supervised-candidate:'||p_id::text,0));
  IF EXISTS(SELECT 1 FROM public.coach_supervised_decisions WHERE candidate_id=c.id) THEN
    RAISE EXCEPTION 'Candidate already has a decision; recover original receipt' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_supervised_source_current(c.private_packet);
  INSERT INTO public.coach_supervised_decisions(candidate_id,request_id,reviewer_id,decision,enrollment_id,content_hash,source_hash)
    VALUES(c.id,p_request_id,actor,p_decision,e.id,c.content_hash,c.source_hash) RETURNING * INTO d;
  RETURN public.supervised_decision_json(d.id,false);
END $$;
REVOKE ALL ON FUNCTION public.decide_supervised_candidate(uuid,uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decide_supervised_candidate(uuid,uuid,text,text,text,uuid) TO authenticated;

CREATE FUNCTION public.get_supervised_decision_receipt(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); found_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT id INTO found_id FROM public.coach_supervised_decisions WHERE reviewer_id=actor AND request_id=p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public.supervised_decision_json(found_id,true);
END $$;
REVOKE ALL ON FUNCTION public.get_supervised_decision_receipt(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_supervised_decision_receipt(uuid) TO authenticated;

CREATE FUNCTION public.get_approved_supervised_candidate(p_id uuid,p_content_hash text,p_source_hash text,p_enrollment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.coach_supervised_candidates%ROWTYPE; d public.coach_supervised_decisions%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.coach_supervised_candidates WHERE id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF c.enrollment_id IS DISTINCT FROM p_enrollment_id OR c.content_hash IS DISTINCT FROM p_content_hash OR c.source_hash IS DISTINCT FROM p_source_hash THEN
    RAISE EXCEPTION 'Approved candidate identity differs' USING ERRCODE='22023'; END IF;
  SELECT * INTO d FROM public.coach_supervised_decisions WHERE candidate_id=c.id AND decision='approve';
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public.assert_supervised_enrollment_current(c.enrollment_id,c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}');
  PERFORM public.assert_supervised_source_current(c.private_packet);
  RETURN jsonb_build_object('candidate',public.supervised_candidate_json(c.id),'decision',public.supervised_decision_json(d.id,true),'privatePacket',c.private_packet);
END $$;
REVOKE ALL ON FUNCTION public.get_approved_supervised_candidate(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_approved_supervised_candidate(uuid,text,text,uuid) TO service_role;

ALTER FUNCTION public.version_supervised_enrollment(uuid,uuid,uuid,uuid,integer,boolean,timestamptz,jsonb,text) SET lock_timeout='1s';
ALTER FUNCTION public.submit_supervised_candidate(uuid,uuid,jsonb,jsonb) SET lock_timeout='1s';
ALTER FUNCTION public.get_supervised_candidate(uuid) SET lock_timeout='1s';
ALTER FUNCTION public.decide_supervised_candidate(uuid,uuid,text,text,text,uuid) SET lock_timeout='1s';
ALTER FUNCTION public.get_approved_supervised_candidate(uuid,text,text,uuid) SET lock_timeout='1s';
COMMIT;
