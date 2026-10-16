-- ADR0036: bounded first-review approval before enrollment or permanent lineage.
-- This migration cannot register, issue, accept or enable a reviewed program.
BEGIN;
-- Reviewed setup v2 preserves per-day time and original athlete prose.
-- Legacy content/replays retain their prior contracts; unknown explicit versions fail closed.
CREATE FUNCTION public.valid_reviewed_setup_memory(p_key text,p_content jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE a jsonb; ids jsonb;
BEGIN
  IF jsonb_typeof(p_content) IS DISTINCT FROM 'object' OR p_content->'schemaVersion' IS DISTINCT FROM '2'::jsonb THEN RETURN false; END IF;
  IF p_key='training_schedule' THEN
    IF NOT p_content ?& ARRAY['schemaVersion','experience','sessionAvailability']
      OR p_content - ARRAY['schemaVersion','experience','sessionAvailability'] <> '{}'::jsonb
      OR jsonb_typeof(p_content->'experience') IS DISTINCT FROM 'string'
      OR p_content->>'experience' NOT IN ('new_or_returning','consistent','experienced')
      OR jsonb_typeof(p_content->'sessionAvailability') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    a:=p_content->'sessionAvailability';
    IF jsonb_array_length(a) NOT BETWEEN 2 AND 6
      OR (SELECT count(DISTINCT x->>'day') FROM jsonb_array_elements(a) x) <> jsonb_array_length(a) THEN RETURN false; END IF;
    FOR ids IN SELECT value FROM jsonb_array_elements(a) LOOP
      IF jsonb_typeof(ids) IS DISTINCT FROM 'object' OR NOT ids ?& ARRAY['day','minutes']
        OR ids - ARRAY['day','minutes'] <> '{}'::jsonb OR jsonb_typeof(ids->'day') IS DISTINCT FROM 'string'
        OR ids->>'day' NOT IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
        OR jsonb_typeof(ids->'minutes') IS DISTINCT FROM 'number'
        OR (ids->>'minutes')::numeric NOT BETWEEN 30 AND 90
        OR (ids->>'minutes')::numeric <> trunc((ids->>'minutes')::numeric) THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  ELSIF p_key='available_equipment' THEN
    IF NOT p_content ?& ARRAY['schemaVersion','equipment','resolvedEquipmentIds','unresolvedAthleteDescription']
      OR p_content - ARRAY['schemaVersion','equipment','resolvedEquipmentIds','unresolvedAthleteDescription'] <> '{}'::jsonb
      OR jsonb_typeof(p_content->'equipment') IS DISTINCT FROM 'string'
      OR length(btrim(p_content->>'equipment'))=0 OR length(p_content->>'equipment')>4000
      OR jsonb_typeof(p_content->'resolvedEquipmentIds') IS DISTINCT FROM 'array'
      OR (p_content->'unresolvedAthleteDescription'<>'null'::jsonb AND (
        jsonb_typeof(p_content->'unresolvedAthleteDescription') IS DISTINCT FROM 'string'
        OR length(btrim(p_content->>'unresolvedAthleteDescription'))=0 OR length(p_content->>'unresolvedAthleteDescription')>4000)) THEN RETURN false; END IF;
    a:=p_content->'resolvedEquipmentIds';
    IF jsonb_array_length(a)>29 OR (jsonb_array_length(a)=0 AND p_content->'unresolvedAthleteDescription'='null'::jsonb)
      OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(a) x)<>jsonb_array_length(a) THEN RETURN false; END IF;
    FOR ids IN SELECT value FROM jsonb_array_elements(a) LOOP
      IF jsonb_typeof(ids) IS DISTINCT FROM 'string' OR ids#>>'{}' NOT IN (
        'barbell','rack','dumbbell','kettlebell','bench','band','cable','machine','pull_up_bar','medicine_ball',
        'box','sled','bike','rower','treadmill','track','bodyweight','trap_bar_high_handles',
        'stationary_bike','measured_running_area','safe_runout','flat_bench','rack_safeties','barbell_45lb',
        'plates','dumbbells','cable_station','resistance_band','high_handle_trap_bar') THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  END IF;
  RETURN false;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_reviewed_setup_memory(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.guard_reviewed_setup_memory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.memory_key IN ('training_schedule','available_equipment') AND NEW.content ? 'schemaVersion'
    AND (NEW.kind IS DISTINCT FROM CASE NEW.memory_key WHEN 'training_schedule' THEN 'schedule' ELSE 'equipment' END
      OR NOT public.valid_reviewed_setup_memory(NEW.memory_key,NEW.content)) THEN
    RAISE EXCEPTION 'Reviewed setup memory is invalid or unsupported' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reviewed_setup_memory() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_reviewed_setup_memory BEFORE INSERT OR UPDATE OF content,memory_key,kind ON public.coach_memories
FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_setup_memory();

-- Additive reviewed field; no automatic profile or policy activation.
CREATE OR REPLACE FUNCTION public.supervised_review_field_map() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT '{"week":{"kind":"scalar","format":"scalar","schemaVersion":"scalar","title":"scalar","sequenceNumber":"scalar","windowStart":"scalar","windowEnd":"scalar","profileSnapshot":"profile","directionSnapshot":"direction","basis":"basis","baseSchedule":"schedule","scheduledSessions":"[]slot","spacing":"[]spacing","instructions":"[]scalar","limitations":"[]scalar","adaptiveEvaluation":"scalar"},"profile":{"schemaVersion":"scalar","kernelVersion":"scalar","athleteGoalSummary":"scalar","primaryGoal":"allocation","secondaryGoals":"[]allocation","trainingExperience":"scalar","startDate":"scalar","sessionAvailability":"[]availability","equipment":"equipment","explicitConstraints":"[]constraint","unresolvedConstraintNote":"scalar","preferences":"[]preference","assessments":"[]assessment","recentTraining":"recent","inputSource":"inputSource","exercisePreferences":"exercisePreferences","preferenceNotes":"[]scalar","executionPriority":"executionPriority","trainingIntent":"intentSnapshot","planningContext":"planningContext","prescriptionBasis":"prescriptionBasis"},"allocation":{"id":"scalar","domain":"scalar","role":"scalar","allocation":"scalar","athleteIntent":"scalar","outcome":"outcome"},"outcome":{"statement":"scalar","kind":"scalar","horizon":"horizon","target":"goalTarget"},"horizon":{"startsOn":"scalar","endsOn":"scalar"},"availability":{"day":"scalar","minutes":"scalar"},"equipment":{"resolvedIds":"[]scalar","unresolvedAthleteDescription":"scalar","athleteDescription":"scalar"},"constraint":{"id":"scalar","kind":"scalar","description":"scalar","source":"scalar"},"preference":{"movementId":"scalar","preference":"scalar","source":"scalar"},"assessment":{"id":"scalar","movement":"scalar","variation":"scalar","load":"scalar","unit":"scalar","reps":"scalar","assessedOn":"scalar","isTrueRepMax":"scalar","rir":"scalar","rpe":"scalar","athleteConfidence":"scalar","estimatedOneRepMax":"scalar","estimateKind":"scalar","calculatorVersion":"scalar"},"recent":{"asOfDate":"scalar","lookbackDays":"scalar","completedSessionCount":"scalar","performedMovementIds":"[]scalar","doseByCoverageTarget":"[]coverageDose"},"coverageDose":{"kind":"scalar","targetId":"scalar","unit":"scalar","amount":"scalar"},"inputSource":{"kind":"scalar","snapshot":"legacyInput"},"legacyInput":{"primaryDomain":"scalar","goal":"scalar","experience":"scalar","trainingDays":"[]scalar","sessionMinutes":"scalar","equipment":"scalar","constraints":"scalar","startDate":"scalar"},"exercisePreferences":{"schemaVersion":"scalar","state":"scalar","entries":"[]exercisePreferenceEntry"},"exercisePreferenceEntry":{"athleteWording":"scalar","target":"exercisePreferenceTarget"},"exercisePreferenceTarget":{"kind":"scalar","id":"scalar"},"executionPriority":{"goalId":"scalar","movementId":"scalar"},"intentSnapshot":{"schemaVersion":"scalar","memoryId":"scalar","memoryVersion":"scalar","content":"intentContent"},"intentContent":{"schemaVersion":"scalar","outcomes":"[]planningOutcome","priorityOrder":"[]scalar","event":"event","confirmedAt":"scalar"},"planningOutcome":{"goal":"goal","domain":"scalar","measurement":"measurement","binding":"goalBinding","baseline":"baseline","capability":"capability"},"goal":{"schemaVersion":"scalar","id":"scalar","kind":"scalar","statement":"scalar","priority":"scalar","status":"scalar","target":"goalTarget","targetDate":"scalar","requiredQualityIds":"[]scalar","source":"goalSource"},"goalTarget":{"role":"scalar","comparison":"scalar","metric":"metric","upperMetric":"metric","assessmentDefinition":"pair","protocol":"pair"},"metric":{"metricId":"scalar","value":"scalar","unit":"scalar"},"pair":{"id":"scalar","version":"scalar"},"goalSource":{"kind":"scalar","confirmedAt":"scalar"},"measurement":{"metricId":"scalar","unit":"scalar","assessmentDefinition":"pair","protocol":"pair"},"goalBinding":{"movementId":"scalar","distance":"quantity","equipmentIds":"[]scalar","variation":"scalar","assessmentContext":"assessmentContext"},"quantity":{"value":"scalar","unit":"scalar"},"assessmentContext":{"repetitions":"scalar","externalLoad":"quantity","duration":"quantity","techniqueModifiers":"[]scalar","environmentModifiers":"[]scalar"},"baseline":{"status":"scalar","observationId":"scalar"},"capability":{"status":"scalar","reason":"scalar"},"event":{"name":"scalar","goalIds":"[]scalar","date":"scalar"},"planningContext":{"version":"scalar","mode":"scalar","userId":"scalar","asOf":"scalar","startsOn":"scalar","endsOn":"scalar","status":"scalar","retrievalComplete":"scalar","loggingCoverage":"scalar","sourceIds":"[]scalar","movements":"[]contextMovement","missing":"[]scalar","outsideTraining":"outsideTraining"},"contextMovement":{"movementId":"scalar","workoutId":"scalar","sourcePath":"scalar","eventDate":"scalar","capturedAt":"scalar","revision":"scalar","snapshotId":"scalar","origin":"scalar","reviewState":"scalar","completionId":"scalar","familiarityEligible":"scalar"},"outsideTraining":{"status":"scalar","sourceIds":"[]scalar","notes":"[]scalar"},"prescriptionBasis":{"version":"scalar","numericalBasis":"scalar","numericPolicyEligible":"scalar","historyAsOf":"scalar","sourceIds":"[]scalar","familiarityMovementIds":"[]scalar","restrictions":"[]scalar","equipmentIds":"[]scalar","missing":"[]scalar","statement":"scalar"},"direction":{"schemaVersion":"scalar","goalSummary":"scalar","goalTargetDate":"scalar","currentEmphasis":"[]emphasis","hypothesis":"scalar","constraintIds":"[]scalar","trainingIntent":"intentSnapshot"},"emphasis":{"goalAllocationId":"scalar","domain":"scalar","allocation":"scalar"},"basis":{"recipeId":"scalar","recipeHash":"scalar","contextHash":"scalar","scheduleId":"scalar","reason":"scalar"},"schedule":{"monday":"scalar","tuesday":"scalar","wednesday":"scalar","thursday":"scalar","friday":"scalar","saturday":"scalar","sunday":"scalar"},"slot":{"scheduledDate":"scalar","prescription":"prescription"},"spacing":{"from":"scalar","to":"scalar","baseDays":"scalar","selectedDays":"scalar"},"prescription":{"format":"scalar","schemaVersion":"scalar","policyVersion":"scalar","sessionId":"scalar","day":"scalar","title":"scalar","intent":"scalar","scheduledMinutes":"scalar","estimatedSeconds":"scalar","content":"session","protocols":"[]protocol","source":"source"},"session":{"id":"scalar","steps":"[]step","themes":"[]scalar","instructions":"[]scalar","conditionalTiming":"conditionalTiming","optionalTail":"optionalTail"},"conditionalTiming":{"kind":"scalar","whenOverBudget":"scalar"},"optionalTail":{"fromStepId":"scalar","reason":"scalar"},"step":{"kind":"scalar","id":"scalar","movementId":"scalar","role":"scalar","requiredEquipment":"[]scalar","sets":"scalar","work":"work","load":"load","effort":"effort","restBetweenSeconds":"rest","restAfterSeconds":"rest","protocolId":"scalar","instructions":"[]scalar","seconds":"scalar","activities":"[]step","purpose":"scalar"},"work":{"kind":"scalar","repetitions":"range","sides":"scalar","secondsPerRep":"scalar","targetRir":"scalar","estimatedSecondsPerSet":"scalar","sideSwitchSeconds":"scalar","seconds":"scalar","stages":"[]stage","targetSeconds":"scalar","allowanceSeconds":"scalar","finish":"scalar"},"range":{"min":"scalar","max":"scalar"},"stage":{"label":"scalar","metres":"scalar"},"load":{"kind":"scalar","value":"scalar","unit":"scalar","convention":"scalar","instruction":"scalar"},"effort":{"kind":"scalar","min":"scalar","max":"scalar","cue":"scalar"},"rest":{"kind":"scalar","estimatedSeconds":"scalar"},"protocol":{"id":"scalar","sessionId":"scalar","activityId":"scalar","instructions":"[]scalar","sensorMetadata":"scalar","actualObservations":"[]scalar"},"source":{"recipeId":"scalar","recipeHash":"scalar","review":"review","sources":"[]sourceBinding"},"review":{"id":"scalar","contentHash":"scalar"},"sourceBinding":{"id":"scalar","revision":"scalar","contentHash":"scalar"}}'::jsonb
$$;

-- Existing correction authority, exact replay and lifecycle behavior are preserved.
CREATE OR REPLACE FUNCTION public.correct_coach_memory_with_review(
  p_memory_id UUID,
  p_content JSONB,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  event_id UUID,
  previous_memory_id UUID,
  replacement_memory_id UUID,
  replacement_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_previous public.coach_memories%ROWTYPE;
  v_replacement_id UUID;
  v_replacement_version INTEGER;
  v_event public.coach_memory_review_events%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF p_content IS NULL
    OR jsonb_typeof(p_content) <> 'object'
    OR pg_catalog.octet_length(p_content::TEXT) > 10000
    OR p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Memory correction request is invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':memory-correction:' || btrim(p_idempotency_key), 0)
  );
  SELECT * INTO v_event
  FROM public.coach_memory_review_events
  WHERE user_id = v_user_id AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.memory_id IS DISTINCT FROM p_memory_id OR v_event.action <> 'corrected' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Memory correction key was used for another request';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_memories
      WHERE id = v_event.replacement_memory_id AND user_id = v_user_id AND content = p_content
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Memory correction key was used for different content';
    END IF;
    SELECT version INTO v_replacement_version
    FROM public.coach_memories
    WHERE id = v_event.replacement_memory_id AND user_id = v_user_id;
    RETURN QUERY SELECT v_event.id, v_event.memory_id, v_event.replacement_memory_id, v_replacement_version;
    RETURN;
  END IF;

  SELECT * INTO v_previous
  FROM public.coach_memories
  WHERE id = p_memory_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Coach memory not found';
  END IF;
  IF v_previous.status <> 'confirmed' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Coach memory is no longer current';
  END IF;
  IF (v_previous.memory_key = 'primary_goal' AND (
      (p_content - ARRAY['goal','primaryDomain','secondaryGoals']::TEXT[]) <> '{}'::JSONB
      OR jsonb_typeof(p_content->'goal') IS DISTINCT FROM 'string'
    )) OR (v_previous.memory_key = 'training_schedule' AND (
      (p_content ? 'schemaVersion' AND NOT public.valid_reviewed_setup_memory('training_schedule',p_content))
      OR (NOT p_content ? 'schemaVersion' AND ((p_content - ARRAY['experience','trainingDays','sessionMinutes','startDate']::TEXT[]) <> '{}'::JSONB
      OR jsonb_typeof(p_content->'trainingDays') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_content->'sessionMinutes') IS DISTINCT FROM 'number'))
    )) OR (v_previous.memory_key = 'available_equipment' AND (
      (p_content ? 'schemaVersion' AND NOT public.valid_reviewed_setup_memory('available_equipment',p_content))
      OR (NOT p_content ? 'schemaVersion' AND ((p_content - ARRAY['equipment','resolvedEquipmentIds']::TEXT[]) <> '{}'::JSONB
      OR jsonb_typeof(p_content->'equipment') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_content->'resolvedEquipmentIds') IS DISTINCT FROM 'array'))
    )) OR (v_previous.memory_key = 'training_constraints' AND (
      (p_content - ARRAY['constraints','constraintKinds']::TEXT[]) <> '{}'::JSONB
      OR jsonb_typeof(p_content->'constraints') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_content->'constraintKinds') IS DISTINCT FROM 'array'
    )) OR (v_previous.memory_key = 'exercise_preferences' AND NOT public.valid_exercise_preferences(p_content))
    OR (v_previous.memory_key = 'training_intent' AND NOT public.valid_training_intent(p_content))
    OR v_previous.memory_key NOT IN (
      'primary_goal', 'training_schedule', 'available_equipment', 'training_constraints', 'exercise_preferences', 'training_intent'
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Corrected memory fields do not match the memory contract';
  END IF;

  SELECT memory_id, memory_version INTO v_replacement_id, v_replacement_version
  FROM public.confirm_coach_memory(
    v_previous.memory_key,
    v_previous.kind,
    p_content,
    pg_catalog.jsonb_build_object(
      'source', 'athlete_correction',
      'confirmedBy', 'athlete',
      'correctedMemoryId', v_previous.id
    ),
    v_previous.confidence,
    btrim(p_idempotency_key)
  );

  UPDATE public.coach_memories
  SET effective_until = v_now,
      last_reviewed_at = v_now,
      review_after = NULL
  WHERE id = v_previous.id;
  UPDATE public.coach_memories
  SET effective_from = v_now,
      last_reviewed_at = v_now,
      review_after = v_now + INTERVAL '90 days'
  WHERE id = v_replacement_id;

  INSERT INTO public.coach_memory_review_events (
    user_id, memory_id, replacement_memory_id, action, idempotency_key
  ) VALUES (
    v_user_id, v_previous.id, v_replacement_id, 'corrected', btrim(p_idempotency_key)
  ) RETURNING * INTO v_event;

  RETURN QUERY SELECT v_event.id, v_previous.id, v_replacement_id, v_replacement_version;
END;
$$;
CREATE TABLE public.coach_first_review_candidates (
  id uuid PRIMARY KEY,
  designation_id uuid NOT NULL REFERENCES public.coach_first_review_designations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  program_id uuid NOT NULL REFERENCES public.training_programs(id),
  base_plan_version_id uuid NOT NULL,
  private_packet jsonb NOT NULL CHECK(jsonb_typeof(private_packet)='object'),
  review_packet jsonb NOT NULL CHECK(jsonb_typeof(review_packet)='object'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(base_plan_version_id,program_id,user_id) REFERENCES public.training_plan_versions(id,program_id,user_id)
);
CREATE TABLE public.coach_first_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.coach_first_review_candidates(id),
  designation_id uuid NOT NULL REFERENCES public.coach_first_review_designations(id),
  request_id uuid NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK(decision IN ('approve','reject')),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reviewer_id,request_id)
);
ALTER TABLE public.coach_first_review_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_first_review_candidates,public.coach_first_review_decisions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_first_review_candidate BEFORE UPDATE OR DELETE ON public.coach_first_review_candidates
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();
CREATE TRIGGER immutable_first_review_decision BEFORE UPDATE OR DELETE ON public.coach_first_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();

CREATE FUNCTION public.get_current_first_review_designation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.coach_first_review_designations%ROWTYPE; actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=p_id;
  IF NOT FOUND OR actor NOT IN (d.user_id,d.reviewer_id) OR NOT d.enabled OR d.expires_at<=clock_timestamp()
    OR d.version IS DISTINCT FROM (SELECT max(version) FROM public.coach_first_review_designations WHERE program_id=d.program_id)
    OR EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=d.program_id)
    OR NOT EXISTS(SELECT 1 FROM public.training_programs p JOIN public.training_plan_versions v ON v.id=p.active_plan_version_id
      AND v.user_id=p.user_id AND v.program_id=p.id WHERE p.id=d.program_id AND p.user_id=d.user_id AND p.status='active'
      AND p.program_mode='rolling_weekly' AND v.id=d.base_plan_version_id AND v.status='accepted' AND v.plan_mode='rolling_weekly'
      AND v.intent->>'format'='rolling_weekly_intent_v0_1') THEN RETURN NULL; END IF;
  RETURN public.first_review_designation_json(d.id);
END $$;

-- Exact legacy prescription whitelist. The normal reviewed map is unchanged.
CREATE FUNCTION public.first_legacy_review_field_map() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT '{
    "firstProfileFacts":{"snapshotId":"scalar","confirmationRequestId":"scalar","projectionAsOf":"scalar","factsHash":"scalar","assessments":"[]assessment","baselines":"[]firstBaselineEvidence"},
    "firstBaselineEvidence":{"goalId":"scalar","observationId":"scalar","observedAt":"scalar","source":"scalar","measurement":"measurement","binding":"goalBinding","values":"[]firstBaselineValue"},
    "firstBaselineValue":{"id":"scalar","ordinal":"scalar","value":"scalar","unit":"scalar"},
    "legacyBase":{"format":"scalar","windowStart":"scalar","windowEnd":"scalar","sequenceNumber":"scalar","profileSnapshot":"profile","scheduledSessions":"[]legacySlot"},
    "legacySlot":{"scheduledDate":"scalar","prescription":"legacySession"},
    "legacySession":{"schemaVersion":"scalar","format":"scalar","kernelVersion":"scalar","policyVersion":"scalar","evidenceReferenceVersion":"scalar","movementCatalogVersion":"scalar","weekNumber":"scalar","day":"scalar","sessionId":"scalar","domain":"scalar","title":"scalar","intent":"scalar","scheduledMinutes":"scalar","blocks":"[]legacyBlock"},
    "legacyBlock":{"id":"scalar","role":"scalar","coverageRequirementIds":"[]scalar","intent":"scalar","instructions":"[]scalar","exercises":"[]legacyExercise","estimatedMinutes":"scalar"},
    "legacyExercise":{"movementId":"scalar","movementName":"scalar","role":"scalar","coverageRequirementIds":"[]scalar","intent":"scalar","dose":"legacyDose","loadAnchor":"legacyLoad","executionTarget":"legacyEffort","restSeconds":"range","successCondition":"scalar","stopCondition":"scalar","substitutionMovementIds":"[]scalar","substitutionGuidance":"scalar","selectionReasons":"[]scalar","estimatedMinutes":"scalar","fatigueCost":"scalar","evidenceRuleIds":"[]scalar","policyVersion":"scalar"},
    "legacyDose":{"kind":"scalar","sets":"range","repetitions":"range","totalRepetitions":"scalar","series":"range","repetitionsPerSeries":"range","workSeconds":"range","durationMinutes":"range","totalIntervals":"scalar","recoverySeconds":"range","seriesRecoverySeconds":"range"},
    "legacyLoad":{"source":"scalar","assessmentId":"scalar","percentRange":"range","loadRange":"legacyLoadRange","priorSessionId":"scalar"},
    "legacyLoadRange":{"min":"scalar","max":"scalar","unit":"scalar"},
    "legacyEffort":{"kind":"scalar","range":"range","cue":"scalar","baselineId":"scalar"}
  }'::jsonb
$$;
CREATE FUNCTION public.first_legacy_review_fields_valid(p_value jsonb,p_shape text DEFAULT 'legacyBase',p_depth integer DEFAULT 0) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE fields jsonb; item record;
BEGIN
  IF p_depth>30 OR p_value IS NULL OR p_shape IS NULL THEN RETURN false; END IF;
  IF p_value='null'::jsonb THEN RETURN true; END IF;
  IF left(p_shape,2)='[]' THEN
    IF jsonb_typeof(p_value)<>'array' THEN RETURN false; END IF;
    RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_value) child WHERE NOT public.first_legacy_review_fields_valid(child,substr(p_shape,3),p_depth+1));
  END IF;
  fields:=public.first_legacy_review_field_map()->p_shape;
  IF fields IS NULL THEN RETURN public.supervised_review_fields_valid(p_value,p_shape,p_depth); END IF;
  IF jsonb_typeof(p_value)<>'object' THEN RETURN false; END IF;
  FOR item IN SELECT key,value FROM jsonb_each(p_value) LOOP
    IF NOT(fields ? item.key) OR NOT public.first_legacy_review_fields_valid(item.value,fields->>item.key,p_depth+1) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.assert_coach_setup_memories_current(p_user_id UUID, p_bindings JSONB, p_intent JSONB) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry RECORD; memory public.coach_memories%ROWTYPE; checked_at TIMESTAMPTZ := clock_timestamp();
  week jsonb:=coalesce(p_intent->'reviewed_week',p_intent->'weekly_plan');
BEGIN
  IF p_bindings IS NULL OR p_bindings->'schemaVersion' IS DISTINCT FROM '1'::JSONB
    OR jsonb_typeof(p_bindings->'memories') IS DISTINCT FROM 'object'
    OR NOT (p_bindings->'memories' ?& ARRAY['primary_goal','training_schedule','available_equipment','training_constraints'])
    OR (week #> '{profileSnapshot,exercisePreferences}' IS NOT NULL
      AND week #> '{profileSnapshot,exercisePreferences}' <> 'null'::JSONB
      AND NOT (p_bindings->'memories' ? 'exercise_preferences')) THEN
    RAISE EXCEPTION 'Planning setup is unverified; refresh the review and create a new proposal' USING ERRCODE = '40001';
  END IF;
  FOR entry IN SELECT key, value FROM jsonb_each(p_bindings->'memories') LOOP
    IF entry.key NOT IN ('primary_goal','training_schedule','available_equipment','training_constraints','exercise_preferences') THEN
      RAISE EXCEPTION 'Planning setup binding is unsupported; refresh the review' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO memory FROM public.coach_memories WHERE user_id = p_user_id AND memory_key = entry.key
      ORDER BY version DESC LIMIT 1;
    -- Null is an explicit empty read, not an omitted/unknown legacy binding.
    IF entry.value = 'null'::JSONB THEN
      IF FOUND THEN RAISE EXCEPTION 'Confirmed training setup changed or needs review; refresh the direction' USING ERRCODE = '40001'; END IF;
      CONTINUE;
    END IF;
    IF NOT FOUND OR jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
      OR entry.value->'currentAtRead' IS DISTINCT FROM 'true'::JSONB
      OR memory.id::TEXT IS DISTINCT FROM entry.value->>'memoryId'
      OR to_jsonb(memory.version) IS DISTINCT FROM entry.value->'memoryVersion'
      OR memory.content IS DISTINCT FROM entry.value->'content' OR memory.status <> 'confirmed'
      OR memory.kind IS DISTINCT FROM (CASE entry.key WHEN 'primary_goal' THEN 'goal' WHEN 'training_schedule' THEN 'schedule'
        WHEN 'available_equipment' THEN 'equipment' WHEN 'training_constraints' THEN 'constraint' ELSE 'preference' END)
      OR memory.effective_from > checked_at OR memory.effective_until <= checked_at OR memory.review_after <= checked_at THEN
      RAISE EXCEPTION 'Confirmed training setup changed or needs review; refresh the direction' USING ERRCODE = '40001';
    END IF;
    IF entry.key='available_equipment' AND week#>'{profileSnapshot,equipment}' ? 'athleteDescription'
      AND NOT memory.content ? 'schemaVersion' THEN
      RAISE EXCEPTION 'Original equipment wording requires saved reviewed setup' USING ERRCODE='40001'; END IF;
    IF entry.key IN ('training_schedule','available_equipment') AND memory.content ? 'schemaVersion' THEN
      IF NOT public.valid_reviewed_setup_memory(entry.key,memory.content)
        OR (p_intent ? 'reviewed_week' AND p_intent ? 'weekly_plan')
        OR coalesce(week->>'format','') NOT IN ('reviewed_rolling_week_v0_1','first_review_profile_v1') THEN
        RAISE EXCEPTION 'Reviewed setup needs the reviewed-week workflow' USING ERRCODE='40001'; END IF;
      IF entry.key='training_schedule' AND (
        memory.content->'experience' IS DISTINCT FROM week#>'{profileSnapshot,trainingExperience}'
        OR (SELECT jsonb_agg(x ORDER BY x->>'day') FROM jsonb_array_elements(memory.content->'sessionAvailability') x)
          IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'day') FROM jsonb_array_elements(week#>'{profileSnapshot,sessionAvailability}') x)) THEN
        RAISE EXCEPTION 'Reviewed daily time differs from the saved setup' USING ERRCODE='40001'; END IF;
      IF entry.key='available_equipment' AND (
        memory.content->'equipment' IS DISTINCT FROM week#>'{profileSnapshot,equipment,athleteDescription}'
        OR memory.content->'unresolvedAthleteDescription' IS DISTINCT FROM week#>'{profileSnapshot,equipment,unresolvedAthleteDescription}'
        OR (SELECT jsonb_agg(x ORDER BY x) FROM jsonb_array_elements(memory.content->'resolvedEquipmentIds') x)
          IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x) FROM jsonb_array_elements(week#>'{profileSnapshot,equipment,resolvedIds}') x)) THEN
        RAISE EXCEPTION 'Reviewed equipment differs from the saved setup' USING ERRCODE='40001'; END IF;
    END IF;
  END LOOP;
END $$;

-- First-profile preparation is private service work. Only the owned authenticated
-- athlete can confirm its exact immutable projection. This is not week acceptance.
CREATE TABLE public.coach_first_review_profile_snapshots (
  id uuid PRIMARY KEY,
  designation_id uuid NOT NULL REFERENCES public.coach_first_review_designations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  program_id uuid NOT NULL REFERENCES public.training_programs(id),
  base_plan_version_id uuid NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  request jsonb NOT NULL CHECK(jsonb_typeof(request)='object' AND octet_length(request::text)<=500000),
  source jsonb NOT NULL CHECK(jsonb_typeof(source)='object'),
  projection jsonb NOT NULL CHECK(jsonb_typeof(projection)='object'),
  profile_hash text NOT NULL CHECK(profile_hash ~ '^[a-f0-9]{64}$'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(base_plan_version_id,program_id,user_id) REFERENCES public.training_plan_versions(id,program_id,user_id)
);
CREATE TABLE public.coach_first_review_profile_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL UNIQUE REFERENCES public.coach_first_review_profile_snapshots(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_id)
);
ALTER TABLE public.coach_first_review_profile_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_profile_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_profile_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_profile_confirmations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_first_review_profile_snapshots,public.coach_first_review_profile_confirmations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_first_review_profile_snapshot BEFORE UPDATE OR DELETE ON public.coach_first_review_profile_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();
CREATE TRIGGER immutable_first_review_profile_confirmation BEFORE UPDATE OR DELETE ON public.coach_first_review_profile_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();

CREATE FUNCTION public.assert_first_review_profile_source_current(p_designation_id uuid,p_source jsonb,p_projection jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.coach_first_review_designations%ROWTYPE; program public.training_programs%ROWTYPE; base public.training_plan_versions%ROWTYPE;
  b jsonb:=p_source->'binding'; profile jsonb:=p_projection->'profile'; actual jsonb; states jsonb; latest public.coach_memories%ROWTYPE;
  checked_at timestamptz; cutoff timestamptz; valid_until timestamptz; source_day date; offset_minutes integer;
BEGIN
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=p_designation_id;
  IF NOT FOUND OR b->>'userId' IS DISTINCT FROM d.user_id::text OR b#>>'{scope,programId}' IS DISTINCT FROM d.program_id::text
    OR b#>>'{scope,basePlanVersionId}' IS DISTINCT FROM d.base_plan_version_id::text
    OR b->>'version' IS DISTINCT FROM 'reviewed-dose-context-3' OR b->>'reviewedMovementCatalogVersion' IS DISTINCT FROM 'reviewed-identities-0.1.0'
    OR jsonb_typeof(b->'scope') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b->'scope'))<>5
    OR NOT(b->'scope' ?& ARRAY['programId','basePlanVersionId','historyDays','tzOffset','historyThrough'])
    OR jsonb_typeof(b#>'{scope,historyDays}') IS DISTINCT FROM 'number' OR (b#>>'{scope,historyDays}' ~ '^[0-9]+$') IS DISTINCT FROM true
    OR jsonb_typeof(b#>'{scope,tzOffset}') IS DISTINCT FROM 'number' OR (b#>>'{scope,tzOffset}' ~ '^-?[0-9]+$') IS DISTINCT FROM true
    OR jsonb_typeof(b#>'{scope,historyThrough}') IS DISTINCT FROM 'string' OR (b#>>'{scope,historyThrough}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') IS DISTINCT FROM true
    OR jsonb_typeof(b->'intentBaselineWorkouts') IS DISTINCT FROM 'array'
    OR (p_source->>'contextHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR p_projection->'sourceHash' IS DISTINCT FROM p_source->'contextHash'
    OR profile->>'startDate' IS DISTINCT FROM d.target_window_start::text THEN
    RAISE EXCEPTION 'First profile owner, source or target differs' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_first_review_designation_current(d.id);
  PERFORM public.assert_supervised_writes_open();
  SELECT * INTO program FROM public.training_programs WHERE id=d.program_id AND user_id=d.user_id FOR UPDATE NOWAIT;
  SELECT * INTO base FROM public.training_plan_versions WHERE id=d.base_plan_version_id AND program_id=d.program_id AND user_id=d.user_id FOR UPDATE NOWAIT;
  actual:=jsonb_build_object('program',jsonb_build_object('id',program.id,'user_id',program.user_id,'status',program.status,
    'program_mode',program.program_mode,'active_plan_version_id',program.active_plan_version_id),
    'plan',jsonb_build_object('id',base.id,'user_id',base.user_id,'program_id',base.program_id,'status',base.status,'plan_mode',base.plan_mode,
      'intent',base.intent,'input_snapshot',base.input_snapshot,'window_start',base.window_start,'window_end',base.window_end,'sequence_number',base.sequence_number));
  IF actual IS DISTINCT FROM b->'base' OR profile->'inputSource' IS DISTINCT FROM base.intent#>'{weekly_plan,profileSnapshot,inputSource}' THEN
    RAISE EXCEPTION 'First profile legacy base or provenance changed' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_coach_context_revision(d.user_id,b->'revision');
  checked_at:=clock_timestamp(); cutoff:=(p_projection->>'projectionAsOf')::timestamptz;
  valid_until:=(p_source->>'validBefore')::timestamptz; offset_minutes:=(b#>>'{scope,tzOffset}')::integer; source_day:=(b#>>'{scope,historyThrough}')::date;
  IF cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>checked_at OR valid_until IS NULL OR NOT isfinite(valid_until) OR valid_until<=checked_at
    OR cutoff>=valid_until OR offset_minutes IS NULL OR offset_minutes NOT BETWEEN -840 AND 840 OR source_day IS NULL OR NOT isfinite(source_day)
    OR (b#>>'{scope,historyDays}')::integer NOT BETWEEN 1 AND 180
    OR source_day IS DISTINCT FROM ((checked_at AT TIME ZONE 'UTC')-make_interval(mins=>offset_minutes))::date
    OR source_day IS DISTINCT FROM ((cutoff AT TIME ZONE 'UTC')-make_interval(mins=>offset_minutes))::date
    OR valid_until > ((source_day+1)::timestamp+make_interval(mins=>offset_minutes)) AT TIME ZONE 'UTC'
    OR EXISTS(SELECT 1 FROM public.coach_memories m CROSS JOIN LATERAL
      (VALUES(m.effective_from),(m.effective_until),(m.review_after)) t(boundary)
      WHERE m.user_id=d.user_id AND m.status='confirmed' AND t.boundary>cutoff AND valid_until>t.boundary)
    OR profile#>>'{planningContext,userId}' IS DISTINCT FROM d.user_id::text
    OR (profile#>>'{planningContext,asOf}')::timestamptz IS DISTINCT FROM cutoff
    OR profile#>'{planningContext,retrievalComplete}' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'First profile cutoff or source validity changed' USING ERRCODE='40001'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'state',CASE WHEN m.status<>'confirmed' THEN 'unconfirmed' WHEN m.effective_from>checked_at THEN 'future'
    WHEN m.effective_until<=checked_at THEN 'expired' WHEN m.review_after<=checked_at THEN 'review_due' ELSE 'current' END) ORDER BY m.id),'[]'::jsonb)
    INTO states FROM public.coach_memories m WHERE m.user_id=d.user_id;
  IF states IS DISTINCT FROM b->'memoryStates' THEN RAISE EXCEPTION 'First profile memory lifecycle changed' USING ERRCODE='40001'; END IF;
  SELECT * INTO latest FROM public.coach_memories WHERE user_id=d.user_id AND memory_key='training_intent' ORDER BY version DESC LIMIT 1;
  IF FOUND THEN
    IF profile->'trainingIntent' IS NULL OR profile->'trainingIntent'='null'::jsonb THEN
      RAISE EXCEPTION 'Current first profile intent omitted' USING ERRCODE='40001'; END IF;
    PERFORM public.assert_coach_plan_intent_current(d.user_id,jsonb_build_object('training_intent',profile->'trainingIntent'));
  ELSIF profile->'trainingIntent' IS NOT NULL AND profile->'trainingIntent'<>'null'::jsonb THEN
    RAISE EXCEPTION 'First profile intent unavailable' USING ERRCODE='40001';
  END IF;
  PERFORM public.assert_coach_setup_memories_current(d.user_id,b->'setup',jsonb_build_object('weekly_plan',jsonb_build_object('format','first_review_profile_v1','profileSnapshot',profile)));
END $$;
CREATE FUNCTION public.first_review_profile_snapshot_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('snapshotId',s.id,'designationId',s.designation_id,'userId',s.user_id,'programId',s.program_id,'basePlanVersionId',s.base_plan_version_id,
    'requestHash',s.request_hash,'profileHash',s.profile_hash,'contentHash',s.content_hash,'sourceHash',s.source->'contextHash',
    'historyDays',s.source#>'{binding,scope,historyDays}','historyThrough',s.source#>'{binding,scope,historyThrough}',
    'tzOffset',s.source#>'{binding,scope,tzOffset}','revision',s.source#>'{binding,revision}','validBefore',s.source->'validBefore','projection',s.projection)
  FROM public.coach_first_review_profile_snapshots s WHERE s.id=p_id
$$;
CREATE FUNCTION public.submit_first_review_profile_snapshot(p_id uuid,p_designation_id uuid,p_user_id uuid,p_request_hash text,
  p_source jsonb,p_projection jsonb,p_profile_hash text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.coach_first_review_profile_snapshots%ROWTYPE; d public.coach_first_review_designations%ROWTYPE; request_field text;
BEGIN
  IF p_id IS NULL OR p_user_id IS NULL OR (p_request_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (p_profile_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_source))<>3
    OR NOT(p_source ?& ARRAY['contextHash','binding','validBefore']) OR octet_length(p_source::text)>16000000
    OR jsonb_typeof(p_projection) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_projection))<>8
    OR NOT(p_projection ?& ARRAY['schemaVersion','projectionAsOf','sourceHash','profile','baselines','assessments','factsHash','numericRuntimeEligible'])
    OR p_projection->>'schemaVersion' IS DISTINCT FROM 'first-reviewed-profile-facts-1' OR p_projection->'numericRuntimeEligible' IS DISTINCT FROM 'false'::jsonb
    OR (p_projection->>'factsHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR octet_length(p_projection::text)>1000000
    OR jsonb_typeof(p_projection->'profile') IS DISTINCT FROM 'object' OR NOT public.supervised_review_fields_valid(p_projection->'profile','profile')
    OR p_projection->'assessments' IS DISTINCT FROM p_projection#>'{profile,assessments}'
    OR jsonb_typeof(p_projection->'assessments') IS DISTINCT FROM 'array' OR jsonb_array_length(p_projection->'assessments')>100
    OR jsonb_typeof(p_projection->'baselines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_projection->'baselines')>8
    OR NOT public.first_legacy_review_fields_valid(p_projection->'baselines','[]firstBaselineEvidence') THEN
    RAISE EXCEPTION 'Invalid first profile snapshot' USING ERRCODE='22023'; END IF;
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=p_designation_id;
  IF NOT FOUND OR d.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'First profile owner differs' USING ERRCODE='42501'; END IF;
  IF public.first_review_profile_prepare_request_valid(p_request) IS DISTINCT FROM true
    OR p_request->>'snapshotId' IS DISTINCT FROM p_id::text OR p_request->>'designationId' IS DISTINCT FROM d.id::text
    OR p_request->>'programId' IS DISTINCT FROM d.program_id::text OR p_request->>'basePlanVersionId' IS DISTINCT FROM d.base_plan_version_id::text
    OR p_request->>'windowStart' IS DISTINCT FROM d.target_window_start::text
    OR p_request->'historyDays' IS DISTINCT FROM p_source#>'{binding,scope,historyDays}'
    OR p_request->'tzOffset' IS DISTINCT FROM p_source#>'{binding,scope,tzOffset}' THEN
    RAISE EXCEPTION 'First profile original request differs' USING ERRCODE='22023'; END IF;
  FOREACH request_field IN ARRAY ARRAY['schemaVersion','kernelVersion','trainingExperience','startDate','sessionAvailability','equipment',
    'explicitConstraints','unresolvedConstraintNote','preferences','exercisePreferences','preferenceNotes','executionPriority'] LOOP
    IF p_request#>'{targetSetup}'->request_field IS DISTINCT FROM p_projection#>'{profile}'->request_field THEN
      RAISE EXCEPTION 'First profile requested setup differs from projection' USING ERRCODE='22023'; END IF;
  END LOOP;
  PERFORM public.lock_first_review_program(d.program_id,d.user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('first-profile-snapshot:'||p_id::text,0));
  SELECT * INTO saved FROM public.coach_first_review_profile_snapshots WHERE id=p_id;
  IF FOUND THEN
    IF (saved.designation_id,saved.user_id,saved.request_hash,saved.source,saved.projection,saved.profile_hash,saved.request) IS DISTINCT FROM
      (p_designation_id,p_user_id,p_request_hash,p_source,p_projection,p_profile_hash,p_request) THEN
      RAISE EXCEPTION 'First profile request conflicts with saved snapshot' USING ERRCODE='22023'; END IF;
    RETURN public.first_review_profile_snapshot_json(saved.id);
  END IF;
  IF (p_projection->>'projectionAsOf')::timestamptz<clock_timestamp()-interval '5 minutes' THEN
    RAISE EXCEPTION 'First profile preparation cutoff elapsed' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_first_review_profile_source_current(d.id,p_source,p_projection);
  INSERT INTO public.coach_first_review_profile_snapshots(id,designation_id,user_id,program_id,base_plan_version_id,request_hash,request,source,projection,profile_hash,content_hash)
    VALUES(p_id,d.id,d.user_id,d.program_id,d.base_plan_version_id,p_request_hash,p_request,p_source,p_projection,p_profile_hash,
      encode(sha256(convert_to(p_projection::text,'UTF8')),'hex'));
  RETURN public.first_review_profile_snapshot_json(p_id);
END $$;
CREATE FUNCTION public.get_first_review_profile_snapshot(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.coach_first_review_profile_snapshots WHERE id=p_id AND user_id=actor) THEN RETURN NULL; END IF;
  RETURN public.first_review_profile_snapshot_json(p_id);
END $$;
CREATE FUNCTION public.first_review_profile_receipt_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('snapshotId',r.snapshot_id,'requestId',r.request_id,'userId',r.user_id,'contentHash',s.content_hash,
    'sourceHash',s.source->'contextHash','profileHash',s.profile_hash,'confirmedAt',r.confirmed_at)
  FROM public.coach_first_review_profile_confirmations r JOIN public.coach_first_review_profile_snapshots s ON s.id=r.snapshot_id WHERE r.id=p_id
$$;
CREATE FUNCTION public.confirm_first_review_profile(p_id uuid,p_request_id uuid,p_content_hash text,p_source_hash text,p_profile_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); s public.coach_first_review_profile_snapshots%ROWTYPE; r public.coach_first_review_profile_confirmations%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_request_id IS NULL OR (p_content_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR (p_source_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (p_profile_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Invalid first profile confirmation' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.coach_first_review_profile_confirmations WHERE user_id=actor AND request_id=p_request_id;
  IF FOUND THEN
    SELECT * INTO s FROM public.coach_first_review_profile_snapshots WHERE id=r.snapshot_id;
    IF (s.id,s.content_hash,s.source->>'contextHash',s.profile_hash) IS DISTINCT FROM (p_id,p_content_hash,p_source_hash,p_profile_hash) THEN
      RAISE EXCEPTION 'First profile request conflicts with saved confirmation' USING ERRCODE='22023'; END IF;
    RETURN public.first_review_profile_receipt_json(r.id);
  END IF;
  SELECT * INTO s FROM public.coach_first_review_profile_snapshots WHERE id=p_id;
  IF NOT FOUND OR s.user_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Owned first profile unavailable' USING ERRCODE='42501'; END IF;
  PERFORM public.lock_first_review_program(s.program_id,s.user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('first-profile-confirmation:'||actor::text||':'||p_request_id::text,0));
  SELECT * INTO r FROM public.coach_first_review_profile_confirmations WHERE user_id=actor AND request_id=p_request_id;
  IF FOUND THEN
    IF r.snapshot_id IS DISTINCT FROM p_id OR (s.content_hash,s.source->>'contextHash',s.profile_hash) IS DISTINCT FROM
      (p_content_hash,p_source_hash,p_profile_hash) THEN
      RAISE EXCEPTION 'First profile request conflicts with saved confirmation' USING ERRCODE='22023'; END IF;
    RETURN public.first_review_profile_receipt_json(r.id);
  END IF;
  IF (s.content_hash,s.source->>'contextHash',s.profile_hash) IS DISTINCT FROM (p_content_hash,p_source_hash,p_profile_hash)
    OR EXISTS(SELECT 1 FROM public.coach_first_review_profile_confirmations WHERE snapshot_id=s.id) THEN
    RAISE EXCEPTION 'First profile content or confirmation identity differs' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_first_review_profile_source_current(s.designation_id,s.source,s.projection);
  INSERT INTO public.coach_first_review_profile_confirmations(snapshot_id,user_id,request_id) VALUES(s.id,actor,p_request_id) RETURNING * INTO r;
  RETURN public.first_review_profile_receipt_json(r.id);
END $$;
CREATE FUNCTION public.get_first_review_profile_receipt(p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); found_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT id INTO found_id FROM public.coach_first_review_profile_confirmations WHERE user_id=actor AND request_id=p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public.first_review_profile_receipt_json(found_id);
END $$;
REVOKE ALL ON FUNCTION public.assert_first_review_profile_source_current(uuid,jsonb,jsonb),public.first_review_profile_snapshot_json(uuid),
  public.submit_first_review_profile_snapshot(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb),public.get_first_review_profile_snapshot(uuid),
  public.first_review_profile_receipt_json(uuid),public.confirm_first_review_profile(uuid,uuid,text,text,text),public.get_first_review_profile_receipt(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_first_review_profile_snapshot(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_first_review_profile_snapshot(uuid),public.confirm_first_review_profile(uuid,uuid,text,text,text),public.get_first_review_profile_receipt(uuid) TO authenticated;
ALTER FUNCTION public.submit_first_review_profile_snapshot(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb) SET lock_timeout='1s';
ALTER FUNCTION public.confirm_first_review_profile(uuid,uuid,text,text,text) SET lock_timeout='1s';

CREATE FUNCTION public.assert_first_review_packet_current(p_packet jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE binding jsonb:=p_packet#>'{source,binding}'; owner uuid:=(p_packet->>'userId')::uuid;
  d public.coach_first_review_designations%ROWTYPE; program public.training_programs%ROWTYPE; base public.training_plan_versions%ROWTYPE;
  confirmed public.coach_first_review_profile_snapshots%ROWTYPE;
  target jsonb:=p_packet#>'{intent,reviewed_week}'; profile jsonb; transition jsonb:=p_packet#>'{inputSnapshot,reviewedWeekTransition}';
  continuity jsonb:=p_packet#>'{inputSnapshot,reviewedExecutionContinuity}'; actual jsonb; expected jsonb; source jsonb;
  states jsonb; checked_at timestamptz; offset_minutes integer; source_day date; k text; session_id uuid; current_intent jsonb; current_date_target jsonb;
BEGIN
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=(p_packet#>>'{inputSnapshot,firstReviewDesignation,designationId}')::uuid;
  IF NOT FOUND OR d.user_id IS DISTINCT FROM owner OR binding->>'userId' IS DISTINCT FROM owner::text
    OR binding#>>'{scope,programId}' IS DISTINCT FROM d.program_id::text
    OR binding#>>'{scope,basePlanVersionId}' IS DISTINCT FROM d.base_plan_version_id::text
    OR p_packet#>'{inputSnapshot,firstReviewDesignation}' IS DISTINCT FROM public.first_review_designation_json(d.id) THEN
    RAISE EXCEPTION 'First review owner or designation binding differs' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_first_review_designation_current(d.id);
  PERFORM public.assert_supervised_writes_open();
  SELECT * INTO program FROM public.training_programs WHERE id=d.program_id AND user_id=owner FOR UPDATE NOWAIT;
  SELECT * INTO base FROM public.training_plan_versions WHERE id=d.base_plan_version_id AND program_id=d.program_id AND user_id=owner FOR UPDATE NOWAIT;
  profile:=base.intent#>'{weekly_plan,profileSnapshot}';
  actual:=jsonb_build_object('program',jsonb_build_object('id',program.id,'user_id',program.user_id,'status',program.status,
    'program_mode',program.program_mode,'active_plan_version_id',program.active_plan_version_id),
    'plan',jsonb_build_object('id',base.id,'user_id',base.user_id,'program_id',base.program_id,'status',base.status,'plan_mode',base.plan_mode,
      'intent',base.intent,'input_snapshot',base.input_snapshot,'window_start',base.window_start,'window_end',base.window_end,'sequence_number',base.sequence_number));
  IF actual IS DISTINCT FROM binding->'base' OR p_packet->'schemaVersion' IS DISTINCT FROM '2'::jsonb
    OR binding->>'version' IS DISTINCT FROM 'reviewed-dose-context-3' OR binding->>'reviewedMovementCatalogVersion' IS DISTINCT FROM 'reviewed-identities-0.1.0'
    OR p_packet#>>'{intent,format}' IS DISTINCT FROM 'reviewed_weekly_intent_v0_1' OR p_packet#>'{intent,horizon_weeks}' IS DISTINCT FROM '1'::jsonb
    OR p_packet->>'policyVersion' IS DISTINCT FROM 'initial-dose-0.2.0' OR p_packet->>'movementCatalogVersion' IS DISTINCT FROM 'reviewed-identities-0.1.0'
    OR binding->'revision' IS DISTINCT FROM p_packet#>'{inputSnapshot,contextRevision}'
    OR p_packet#>'{source,contextHash}' IS DISTINCT FROM p_packet#>'{inputSnapshot,reviewedSourceHash}'
    OR binding->'setup' IS DISTINCT FROM p_packet#>'{inputSnapshot,setupMemoryBindings}'
    OR p_packet->>'registrationId' IS DISTINCT FROM p_packet#>>'{inputSnapshot,reviewedRegistrationId}' THEN
    RAISE EXCEPTION 'First review source contract changed' USING ERRCODE='40001'; END IF;
  IF base.sequence_number IS NULL OR base.sequence_number<1 OR base.sequence_number>=2147483647
    OR base.window_start IS NULL OR base.window_end IS NULL OR NOT isfinite(base.window_start) OR NOT isfinite(base.window_end)
    OR EXTRACT(ISODOW FROM base.window_start)<>1 OR base.window_end IS DISTINCT FROM base.window_start+6
    OR base.intent#>>'{weekly_plan,windowStart}' IS DISTINCT FROM base.window_start::text
    OR base.intent#>>'{weekly_plan,windowEnd}' IS DISTINCT FROM base.window_end::text
    OR base.intent#>'{weekly_plan,sequenceNumber}' IS DISTINCT FROM to_jsonb(base.sequence_number)
    OR target->>'windowStart' IS DISTINCT FROM d.target_window_start::text OR target->>'windowEnd' IS DISTINCT FROM (d.target_window_start+6)::text
    OR d.target_window_start<=base.window_end+1 OR target->'sequenceNumber' IS DISTINCT FROM to_jsonb(base.sequence_number+1)
    OR target#>>'{profileSnapshot,startDate}' IS DISTINCT FROM d.target_window_start::text
    OR target->'profileSnapshot' IS DISTINCT FROM p_packet#>'{inputSnapshot,firstReviewedDraft,confirmedTargetProfile}'
    OR transition IS DISTINCT FROM jsonb_build_object('schemaVersion',1,'kind','first_reviewed','basePlanVersionId',base.id,
      'sourceWindow',jsonb_build_object('windowStart',base.window_start,'windowEnd',base.window_end,'sequenceNumber',base.sequence_number),
      'targetWindow',jsonb_build_object('windowStart',d.target_window_start,'windowEnd',d.target_window_start+6,'sequenceNumber',base.sequence_number+1),
      'confirmedTargetProfileHash',p_packet#>'{inputSnapshot,firstReviewedDraft,confirmedTargetProfileHash}')
    OR (transition->>'confirmedTargetProfileHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'First reviewed window or confirmed profile differs' USING ERRCODE='55000'; END IF;
  SELECT * INTO confirmed FROM public.coach_first_review_profile_snapshots WHERE id=(p_packet#>>'{inputSnapshot,firstReviewProfileSnapshotId}')::uuid;
  IF NOT FOUND OR confirmed.user_id IS DISTINCT FROM owner OR confirmed.designation_id IS DISTINCT FROM d.id
    OR confirmed.program_id IS DISTINCT FROM program.id OR confirmed.base_plan_version_id IS DISTINCT FROM base.id
    OR confirmed.source->'binding' IS DISTINCT FROM binding OR confirmed.source->'contextHash' IS DISTINCT FROM p_packet#>'{source,contextHash}'
    OR target->'profileSnapshot' IS DISTINCT FROM confirmed.projection->'profile'
    OR confirmed.profile_hash IS DISTINCT FROM transition->>'confirmedTargetProfileHash'
    OR p_packet#>>'{inputSnapshot,firstReviewedDraft,profileSnapshotId}' IS DISTINCT FROM confirmed.id::text
    OR p_packet#>>'{inputSnapshot,firstReviewedDraft,profileConfirmationRequestId}' IS DISTINCT FROM p_packet#>>'{inputSnapshot,firstReviewProfileConfirmationRequestId}'
    OR NOT EXISTS(SELECT 1 FROM public.coach_first_review_profile_confirmations r WHERE r.snapshot_id=confirmed.id AND r.user_id=owner
      AND r.request_id=(p_packet#>>'{inputSnapshot,firstReviewProfileConfirmationRequestId}')::uuid) THEN
    RAISE EXCEPTION 'First review requires the exact owned confirmed fresh profile' USING ERRCODE='55000'; END IF;
  current_intent:=confirmed.projection#>'{profile,trainingIntent,content}';
  current_date_target:=current_intent#>'{event,date}';
  IF current_date_target IS NULL OR current_date_target='null'::jsonb THEN
    SELECT o#>'{goal,targetDate}' INTO current_date_target FROM jsonb_array_elements(coalesce(current_intent->'outcomes','[]'::jsonb)) o
      WHERE o#>>'{goal,status}'='active' AND (o#>>'{goal,id}'=current_intent#>>'{priorityOrder,0}'
        OR ((current_intent#>>'{priorityOrder,0}') IS NULL AND
          (SELECT count(*) FROM jsonb_array_elements(current_intent->'outcomes') a WHERE a#>>'{goal,status}'='active')=1));
  END IF;
  IF target#>'{directionSnapshot,goalTargetDate}' IS DISTINCT FROM coalesce(current_date_target,'null'::jsonb)
    OR coalesce(target#>'{directionSnapshot,trainingIntent}','null'::jsonb) IS DISTINCT FROM coalesce(confirmed.projection#>'{profile,trainingIntent}','null'::jsonb) THEN
    RAISE EXCEPTION 'First reviewed direction must use current confirmed intent and dates' USING ERRCODE='55000'; END IF;
  FOR session_id IN SELECT s.id FROM public.prescribed_sessions s JOIN public.coach_effective_prescribed_sessions e ON e.id=s.id AND e.user_id=s.user_id
    WHERE e.plan_version_id=base.id AND e.program_id=program.id AND e.user_id=owner ORDER BY s.id FOR UPDATE OF s NOWAIT LOOP NULL; END LOOP;
  source:=public.reviewed_execution_source(owner,program.id,base.id);
  IF source IS DISTINCT FROM binding->'executionSlots' OR jsonb_array_length(source) NOT BETWEEN 1 AND 14
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(source) WITH ORDINALITY e(s,i) WHERE s->'sessionIndex' IS DISTINCT FROM to_jsonb(i)
      OR s->>'status' NOT IN ('planned','completed','skipped') OR (s->>'scheduledDate')::date>=d.target_window_start
      OR (s->>'status'='planned' AND ((s->>'hasReports')::boolean OR s->>'completedWorkoutId' IS NOT NULL OR s->>'completionContractVersion' IS NOT NULL))) THEN
    RAISE EXCEPTION 'First review execution changed or begun work unresolved' USING ERRCODE='40001'; END IF;
  SELECT jsonb_agg(jsonb_build_object('scheduledDate',s->'scheduledDate','prescription',s->'prescription') ORDER BY i) INTO actual
    FROM jsonb_array_elements(source) WITH ORDINALITY e(s,i);
  IF actual IS DISTINCT FROM base.intent#>'{weekly_plan,scheduledSessions}' THEN RAISE EXCEPTION 'Legacy execution manifest differs' USING ERRCODE='55000'; END IF;
  SELECT jsonb_agg(jsonb_build_object('executionSessionId',s->'executionSessionId','disposition',CASE WHEN s->>'status'='planned' THEN 'unreported' ELSE s->>'status' END) ORDER BY i)
    INTO expected FROM jsonb_array_elements(source) WITH ORDINALITY e(s,i);
  SELECT jsonb_agg(jsonb_build_object('sessionIndex',i,'executionSessionId',NULL,'executionPlanVersionId',NULL) ORDER BY i)
    INTO actual FROM jsonb_array_elements(p_packet->'sessions') WITH ORDINALITY e(s,i);
  IF continuity->'schemaVersion' IS DISTINCT FROM '2'::jsonb OR continuity->>'storageContract' IS DISTINCT FROM 'reviewed_execution_slots_v1'
    OR p_packet#>>'{inputSnapshot,reviewedExecutionStorage}' IS DISTINCT FROM 'reviewed_execution_slots_v1'
    OR continuity->>'basePlanVersionId' IS DISTINCT FROM base.id::text OR continuity->'priorExecution' IS DISTINCT FROM expected
    OR continuity->'slots' IS DISTINCT FROM actual THEN RAISE EXCEPTION 'First reviewed roots or prior history differs' USING ERRCODE='55000'; END IF;
  PERFORM public.assert_coach_context_revision(owner,binding->'revision');
  checked_at:=clock_timestamp(); offset_minutes:=(binding#>>'{scope,tzOffset}')::integer; source_day:=(binding#>>'{scope,historyThrough}')::date;
  IF offset_minutes IS NULL OR offset_minutes NOT BETWEEN -840 AND 840 OR source_day IS DISTINCT FROM ((checked_at AT TIME ZONE 'UTC')-make_interval(mins=>offset_minutes))::date
    OR p_packet#>>'{source,validBefore}' IS NULL OR NOT isfinite((p_packet#>>'{source,validBefore}')::timestamptz)
    OR (p_packet#>>'{source,validBefore}')::timestamptz<=checked_at THEN RAISE EXCEPTION 'First review source validity elapsed' USING ERRCODE='40001'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'state',CASE WHEN m.status<>'confirmed' THEN 'unconfirmed' WHEN m.effective_from>checked_at THEN 'future'
    WHEN m.effective_until<=checked_at THEN 'expired' WHEN m.review_after<=checked_at THEN 'review_due' ELSE 'current' END) ORDER BY m.id),'[]'::jsonb)
    INTO states FROM public.coach_memories m WHERE m.user_id=owner;
  IF states IS DISTINCT FROM binding->'memoryStates' THEN RAISE EXCEPTION 'First review memory lifecycle changed' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_coach_plan_intent_current(owner,p_packet->'intent');
  PERFORM public.assert_coach_setup_memories_current(owner,p_packet#>'{inputSnapshot,setupMemoryBindings}',p_packet->'intent');
  -- Execution source locks precede the revision fence. No reverse lock order.
  PERFORM public.assert_first_review_profile_source_current(confirmed.designation_id,confirmed.source,confirmed.projection);
END $$;

CREATE FUNCTION public.first_review_candidate_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('candidateId',c.id,'designationId',d.id,'designationVersion',d.version,'programId',c.program_id,'userId',c.user_id,
    'reviewerId',d.reviewer_id,'basePlanVersionId',c.base_plan_version_id,'contentHash',c.content_hash,'sourceHash',c.source_hash,
    'reviewPacket',c.review_packet,'createdAt',c.created_at)
  FROM public.coach_first_review_candidates c JOIN public.coach_first_review_designations d ON d.id=c.designation_id WHERE c.id=p_id
$$;
CREATE FUNCTION public.submit_first_review_candidate(p_id uuid,p_designation_id uuid,p_private_packet jsonb,p_review_packet jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.coach_first_review_designations%ROWTYPE; saved public.coach_first_review_candidates%ROWTYPE;
  expected jsonb; item jsonb; k text; source jsonb:=p_review_packet->'evidenceSource';
BEGIN
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=p_designation_id;
  IF NOT FOUND OR p_id IS NULL OR jsonb_typeof(p_private_packet) IS DISTINCT FROM 'object' OR octet_length(p_private_packet::text)>16000000
    OR p_private_packet->>'registrationId' IS DISTINCT FROM p_id::text OR p_private_packet->>'userId' IS DISTINCT FROM d.user_id::text
    OR p_private_packet#>>'{inputSnapshot,firstReviewDesignation,designationId}' IS DISTINCT FROM d.id::text
    OR jsonb_typeof(p_review_packet) IS DISTINCT FROM 'object' OR octet_length(p_review_packet::text)>1000000
    OR (SELECT count(*) FROM jsonb_object_keys(p_review_packet))<>10
    OR NOT(p_review_packet ?& ARRAY['schemaVersion','reviewMode','week','legacyBase','profileFacts','rationale','changes','evidence','evidenceSource','limitations'])
    OR p_review_packet->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR p_review_packet->>'reviewMode' IS DISTINCT FROM 'manual_first_reviewed_week'
    OR p_review_packet->'week' IS DISTINCT FROM p_private_packet#>'{intent,reviewed_week}' OR NOT public.supervised_review_fields_valid(p_review_packet->'week')
    OR jsonb_typeof(p_review_packet->'rationale') IS DISTINCT FROM 'string' OR length(btrim(p_review_packet->>'rationale')) NOT BETWEEN 1 AND 4000
    OR jsonb_typeof(source) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(source))<>4
    OR NOT(source ?& ARRAY['sourceHash','revision','historyThrough','historyDays']) OR (source->>'sourceHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR source->'sourceHash' IS DISTINCT FROM p_private_packet#>'{source,contextHash}' OR source->'revision' IS DISTINCT FROM p_private_packet#>'{source,binding,revision}'
    OR source->'historyThrough' IS DISTINCT FROM p_private_packet#>'{source,binding,scope,historyThrough}'
    OR source->'historyDays' IS DISTINCT FROM p_private_packet#>'{source,binding,scope,historyDays}' THEN
    RAISE EXCEPTION 'Invalid first review packet' USING ERRCODE='22023'; END IF;
  expected:=p_private_packet#>'{source,binding,base,plan,intent,weekly_plan}';
  expected:=jsonb_build_object('format','legacy_review_base_v1','windowStart',expected->'windowStart','windowEnd',expected->'windowEnd',
    'sequenceNumber',expected->'sequenceNumber','profileSnapshot',expected->'profileSnapshot','scheduledSessions',expected->'scheduledSessions');
  IF expected IS DISTINCT FROM p_review_packet->'legacyBase' OR NOT public.first_legacy_review_fields_valid(expected) THEN
    RAISE EXCEPTION 'Bounded legacy review base differs' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('snapshotId',s.id,'confirmationRequestId',r.request_id,'projectionAsOf',s.projection->'projectionAsOf',
    'factsHash',s.projection->'factsHash','assessments',s.projection->'assessments','baselines',s.projection->'baselines') INTO expected
    FROM public.coach_first_review_profile_snapshots s JOIN public.coach_first_review_profile_confirmations r ON r.snapshot_id=s.id AND r.user_id=s.user_id
    WHERE s.id=(p_private_packet#>>'{inputSnapshot,firstReviewProfileSnapshotId}')::uuid AND s.user_id=d.user_id
      AND r.request_id=(p_private_packet#>>'{inputSnapshot,firstReviewProfileConfirmationRequestId}')::uuid;
  IF expected IS NULL OR expected IS DISTINCT FROM p_review_packet->'profileFacts' OR NOT public.first_legacy_review_fields_valid(expected,'firstProfileFacts') THEN
    RAISE EXCEPTION 'Bounded confirmed profile facts differ' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['changes','evidence','limitations'] LOOP
    IF jsonb_typeof(p_review_packet->k) IS DISTINCT FROM 'array' OR jsonb_array_length(p_review_packet->k)>(CASE WHEN k='limitations' THEN 32 ELSE 64 END)
      OR (k<>'evidence' AND jsonb_array_length(p_review_packet->k)=0) THEN RAISE EXCEPTION 'Invalid bounded first review projection' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_review_packet->'limitations') LOOP
    IF jsonb_typeof(item)<>'string' OR length(btrim(item#>>'{}')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid first review limitation' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_review_packet->'evidence') LOOP
    IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR NOT(item ?& ARRAY['sourceId','summary'])
      OR jsonb_typeof(item->'sourceId') IS DISTINCT FROM 'string' OR length(btrim(item->>'sourceId')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(item->'summary') IS DISTINCT FROM 'string' OR length(btrim(item->>'summary')) NOT BETWEEN 1 AND 4000 THEN
      RAISE EXCEPTION 'Invalid first review evidence' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_review_packet->'changes') LOOP
    IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR NOT(item ?& ARRAY['kind','summary','sessionIds'])
      OR item->>'kind' NOT IN ('changed','preserved','removed') OR jsonb_typeof(item->'kind') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'summary') IS DISTINCT FROM 'string' OR length(btrim(item->>'summary')) NOT BETWEEN 1 AND 1000
      OR jsonb_typeof(item->'sessionIds') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'sessionIds')>14
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'sessionIds') sid WHERE jsonb_typeof(sid)<>'string' OR NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements((p_review_packet#>'{week,scheduledSessions}')||(p_review_packet#>'{legacyBase,scheduledSessions}')) s WHERE s#>'{prescription,sessionId}'=sid))
      OR (SELECT count(DISTINCT sid) FROM jsonb_array_elements(item->'sessionIds') sid)<>jsonb_array_length(item->'sessionIds') THEN
      RAISE EXCEPTION 'Invalid first review change' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('week_number',1,'session_index',i,'scheduled_date',s->>'scheduledDate','prescription',s->'prescription') ORDER BY i)
    INTO expected FROM jsonb_array_elements(p_review_packet#>'{week,scheduledSessions}') WITH ORDINALITY e(s,i);
  IF expected IS DISTINCT FROM p_private_packet->'sessions' OR jsonb_array_length(expected) NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'First review session manifest differs' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_first_review_program(d.program_id,d.user_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('first-review-candidate:'||p_id::text,0));
  SELECT * INTO saved FROM public.coach_first_review_candidates WHERE id=p_id;
  IF FOUND THEN
    IF saved.designation_id IS DISTINCT FROM d.id OR saved.private_packet IS DISTINCT FROM p_private_packet OR saved.review_packet IS DISTINCT FROM p_review_packet THEN
      RAISE EXCEPTION 'First candidate identity conflicts with saved content' USING ERRCODE='22023'; END IF;
    RETURN public.first_review_candidate_json(saved.id);
  END IF;
  PERFORM public.assert_first_review_packet_current(p_private_packet);
  INSERT INTO public.coach_first_review_candidates(id,designation_id,user_id,program_id,base_plan_version_id,private_packet,review_packet,content_hash,source_hash)
    VALUES(p_id,d.id,d.user_id,d.program_id,d.base_plan_version_id,p_private_packet,p_review_packet,
      encode(sha256(convert_to(p_review_packet::text,'UTF8')),'hex'),source->>'sourceHash');
  RETURN public.first_review_candidate_json(p_id);
END $$;

CREATE FUNCTION public.get_first_review_candidate(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.coach_first_review_candidates%ROWTYPE; d public.coach_first_review_designations%ROWTYPE; actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.coach_first_review_candidates WHERE id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=c.designation_id;
  IF actor<>c.user_id THEN
    IF actor<>d.reviewer_id THEN RETURN NULL; END IF;
    IF public.get_current_first_review_designation(d.id) IS NULL THEN RAISE EXCEPTION 'First reviewer scope unavailable' USING ERRCODE='55000'; END IF;
  END IF;
  RETURN public.first_review_candidate_json(c.id);
END $$;
CREATE FUNCTION public.first_review_decision_json(p_id uuid,p_replayed boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('candidateId',r.candidate_id,'decisionId',r.id,'requestId',r.request_id,'decision',r.decision,
    'reviewerId',r.reviewer_id,'designationId',d.id,'designationVersion',d.version,'contentHash',r.content_hash,'sourceHash',r.source_hash,
    'decidedAt',r.decided_at,'replayed',p_replayed)
  FROM public.coach_first_review_decisions r JOIN public.coach_first_review_designations d ON d.id=r.designation_id WHERE r.id=p_id
$$;
CREATE FUNCTION public.decide_first_review_candidate(p_id uuid,p_request_id uuid,p_decision text,p_content_hash text,p_source_hash text,p_designation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); c public.coach_first_review_candidates%ROWTYPE; d public.coach_first_review_designations%ROWTYPE; receipt public.coach_first_review_decisions%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_request_id IS NULL OR p_designation_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('approve','reject')
    OR p_content_hash IS NULL OR p_source_hash IS NULL THEN RAISE EXCEPTION 'Invalid first review decision' USING ERRCODE='22023'; END IF;
  SELECT * INTO receipt FROM public.coach_first_review_decisions WHERE reviewer_id=actor AND request_id=p_request_id;
  IF FOUND THEN
    IF (receipt.candidate_id,receipt.designation_id,receipt.decision,receipt.content_hash,receipt.source_hash) IS DISTINCT FROM
       (p_id,p_designation_id,p_decision,p_content_hash,p_source_hash) THEN RAISE EXCEPTION 'First decision request conflicts with saved receipt' USING ERRCODE='22023'; END IF;
    RETURN public.first_review_decision_json(receipt.id,true);
  END IF;
  SELECT * INTO c FROM public.coach_first_review_candidates WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'First review candidate unavailable' USING ERRCODE='P0002'; END IF;
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=c.designation_id;
  IF d.reviewer_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'First review candidate unavailable' USING ERRCODE='P0002'; END IF;
  IF p_designation_id IS DISTINCT FROM d.id OR p_content_hash IS DISTINCT FROM c.content_hash OR p_source_hash IS DISTINCT FROM c.source_hash THEN
    RAISE EXCEPTION 'First decision does not bind exact candidate' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_first_review_program(c.program_id,c.user_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('first-review-decision:'||actor::text||':'||p_request_id::text,0));
  -- Recheck the historical receipt after locking; saved results win over closure.
  SELECT * INTO receipt FROM public.coach_first_review_decisions WHERE reviewer_id=actor AND request_id=p_request_id;
  IF FOUND THEN
    IF (receipt.candidate_id,receipt.designation_id,receipt.decision,receipt.content_hash,receipt.source_hash) IS DISTINCT FROM
       (p_id,p_designation_id,p_decision,p_content_hash,p_source_hash) THEN RAISE EXCEPTION 'First decision request conflicts with saved receipt' USING ERRCODE='22023'; END IF;
    RETURN public.first_review_decision_json(receipt.id,true);
  END IF;
  PERFORM public.assert_first_review_packet_current(c.private_packet);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('first-review-candidate:'||c.id::text,0));
  IF EXISTS(SELECT 1 FROM public.coach_first_review_decisions WHERE candidate_id=c.id) THEN
    RAISE EXCEPTION 'First candidate already decided; recover original receipt' USING ERRCODE='22023'; END IF;
  INSERT INTO public.coach_first_review_decisions(candidate_id,designation_id,request_id,reviewer_id,decision,content_hash,source_hash)
    VALUES(c.id,d.id,p_request_id,actor,p_decision,p_content_hash,p_source_hash) RETURNING * INTO receipt;
  RETURN public.first_review_decision_json(receipt.id,false);
END $$;
CREATE FUNCTION public.get_first_review_decision_receipt(p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE found_id uuid; actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT id INTO found_id FROM public.coach_first_review_decisions WHERE reviewer_id=actor AND request_id=p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public.first_review_decision_json(found_id,true);
END $$;
CREATE FUNCTION public.get_approved_first_review_candidate(p_id uuid,p_designation_id uuid,p_content_hash text,p_source_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.coach_first_review_candidates%ROWTYPE; receipt public.coach_first_review_decisions%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.coach_first_review_candidates WHERE id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF c.designation_id IS DISTINCT FROM p_designation_id OR c.content_hash IS DISTINCT FROM p_content_hash OR c.source_hash IS DISTINCT FROM p_source_hash THEN
    RAISE EXCEPTION 'Approved first candidate identity differs' USING ERRCODE='22023'; END IF;
  SELECT * INTO receipt FROM public.coach_first_review_decisions WHERE candidate_id=c.id AND decision='approve';
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public.assert_first_review_packet_current(c.private_packet);
  RETURN jsonb_build_object('candidate',public.first_review_candidate_json(c.id),'decision',public.first_review_decision_json(receipt.id,true),'privatePacket',c.private_packet);
END $$;
REVOKE ALL ON FUNCTION public.get_current_first_review_designation(uuid),public.first_legacy_review_field_map(),public.first_legacy_review_fields_valid(jsonb,text,integer),
  public.assert_first_review_packet_current(jsonb),public.first_review_candidate_json(uuid),public.submit_first_review_candidate(uuid,uuid,jsonb,jsonb),
  public.get_first_review_candidate(uuid),public.first_review_decision_json(uuid,boolean),public.decide_first_review_candidate(uuid,uuid,text,text,text,uuid),
  public.get_first_review_decision_receipt(uuid),public.get_approved_first_review_candidate(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_current_first_review_designation(uuid),public.get_first_review_candidate(uuid),
  public.decide_first_review_candidate(uuid,uuid,text,text,text,uuid),public.get_first_review_decision_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_first_review_candidate(uuid,uuid,jsonb,jsonb),public.get_approved_first_review_candidate(uuid,uuid,text,text) TO service_role;
ALTER FUNCTION public.submit_first_review_candidate(uuid,uuid,jsonb,jsonb) SET lock_timeout='1s';
ALTER FUNCTION public.decide_first_review_candidate(uuid,uuid,text,text,text,uuid) SET lock_timeout='1s';
ALTER FUNCTION public.get_approved_first_review_candidate(uuid,uuid,text,text) SET lock_timeout='1s';

-- First onboarding has no permanent supervised lineage yet. Keep exact request
-- closure private and actor-scoped; historical recovery never grants new authority.
CREATE TABLE public.coach_first_review_request_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK(operation IN ('submit','decide','prepare_profile','confirm_profile')),
  request_id uuid NOT NULL,
  request jsonb NOT NULL CHECK(jsonb_typeof(request)='object' AND octet_length(request::text)<=600000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_id,operation,request_id)
);
ALTER TABLE public.coach_first_review_request_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_request_resolutions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_first_review_request_resolutions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_first_review_request_resolution BEFORE UPDATE OR DELETE ON public.coach_first_review_request_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();

CREATE FUNCTION public.guard_closed_first_review_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; program uuid; v_operation text; v_request_id uuid; operation_key text;
BEGIN
  IF TG_TABLE_NAME='coach_first_review_candidates' THEN
    actor:=NEW.user_id; program:=NEW.program_id; v_operation:='submit'; v_request_id:=NEW.id;
    operation_key:='first-review-candidate:'||v_request_id::text;
  ELSIF TG_TABLE_NAME='coach_first_review_profile_snapshots' THEN
    actor:=NEW.user_id; program:=NEW.program_id; v_operation:='prepare_profile'; v_request_id:=NEW.id;
    operation_key:='first-profile-snapshot:'||v_request_id::text;
  ELSIF TG_TABLE_NAME='coach_first_review_profile_confirmations' THEN
    actor:=NEW.user_id; v_operation:='confirm_profile'; v_request_id:=NEW.request_id;
    SELECT s.program_id INTO program FROM public.coach_first_review_profile_snapshots s WHERE s.id=NEW.snapshot_id;
    operation_key:='first-profile-confirmation:'||actor::text||':'||v_request_id::text;
  ELSE
    actor:=NEW.reviewer_id; v_operation:='decide'; v_request_id:=NEW.request_id;
    SELECT c.program_id INTO program FROM public.coach_first_review_candidates c WHERE c.id=NEW.candidate_id;
    operation_key:='first-review-decision:'||actor::text||':'||v_request_id::text;
  END IF;
  -- Alternate internal writers must not wait in the opposite order to resolution.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('supervised-program:'||program::text,0))
    OR NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(operation_key,0)) THEN
    RAISE EXCEPTION 'First review request resolution is in progress' USING ERRCODE='55P03'; END IF;
  IF EXISTS(SELECT 1 FROM public.coach_first_review_request_resolutions r
    WHERE r.actor_id=actor AND r.operation=v_operation AND r.request_id=v_request_id) THEN
    RAISE EXCEPTION 'First review request is closed' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_first_review_request() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_closed_first_review_submission BEFORE INSERT ON public.coach_first_review_candidates
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_first_review_request();
CREATE TRIGGER guard_closed_first_review_decision BEFORE INSERT ON public.coach_first_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_first_review_request();
CREATE TRIGGER guard_closed_first_review_profile_preparation BEFORE INSERT ON public.coach_first_review_profile_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_first_review_request();
CREATE TRIGGER guard_closed_first_review_profile_confirmation BEFORE INSERT ON public.coach_first_review_profile_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_first_review_request();

CREATE FUNCTION public.first_review_request_resolution_result(p_request jsonb,p_close boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE actor uuid:=auth.uid(); program uuid; v_operation text; body jsonb; draft jsonb; v_request_id uuid;
  candidate_id uuid; designation_id uuid; operation_key text; envelope jsonb; result jsonb; item text;
  d public.coach_first_review_designations%ROWTYPE; c public.coach_first_review_candidates%ROWTYPE;
  receipt public.coach_first_review_decisions%ROWTYPE; closed public.coach_first_review_request_resolutions%ROWTYPE;
  issue_closed public.coach_reviewed_proposal_resolutions%ROWTYPE;
  registration public.coach_reviewed_proposal_registrations%ROWTYPE;
  proposal public.adaptation_proposals%ROWTYPE; identity jsonb; active_plan uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_close IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>600000
    OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>5
    OR NOT(p_request ?& ARRAY['schemaVersion','userId','programId','operation','body'])
    OR p_request->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR p_request->'userId' IS DISTINCT FROM to_jsonb(actor::text)
    OR jsonb_typeof(p_request->'programId') IS DISTINCT FROM 'string'
    OR (p_request->>'programId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
    OR jsonb_typeof(p_request->'operation') IS DISTINCT FROM 'string'
    OR p_request->>'operation' NOT IN ('submit','decide','issue','prepare_profile','confirm_profile') OR jsonb_typeof(p_request->'body') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid first review request envelope' USING ERRCODE='22023'; END IF;
  program:=(p_request->>'programId')::uuid; v_operation:=p_request->>'operation'; body:=p_request->'body';
  IF body->'expectedUserId' IS DISTINCT FROM to_jsonb(actor::text) THEN
    RAISE EXCEPTION 'First review request actor differs' USING ERRCODE='22023'; END IF;
  IF v_operation IN ('prepare_profile','confirm_profile') THEN
    RETURN public.first_review_profile_request_resolution_result(p_request,p_close);
  END IF;
  IF v_operation='submit' THEN
    draft:=body->'draft';
    IF (SELECT count(*) FROM jsonb_object_keys(body))<>2 OR NOT(body ?& ARRAY['expectedUserId','draft'])
      OR jsonb_typeof(draft) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(draft))<>15
      OR NOT(draft ?& ARRAY['candidateId','designationId','programId','basePlanVersionId','profileSnapshotId','profileConfirmationRequestId',
        'historyDays','tzOffset','windowStart','sequenceNumber','confirmedTargetProfile','confirmedTargetProfileHash','recipe','scheduleId','rationale'])
      OR draft->'programId' IS DISTINCT FROM p_request->'programId' THEN
      RAISE EXCEPTION 'Invalid first submission identity' USING ERRCODE='22023'; END IF;
    FOREACH item IN ARRAY ARRAY['candidateId','designationId','basePlanVersionId','profileSnapshotId','profileConfirmationRequestId'] LOOP
      IF jsonb_typeof(draft->item) IS DISTINCT FROM 'string' OR (draft->>item ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Invalid first submission UUID' USING ERRCODE='22023'; END IF;
    END LOOP;
    candidate_id:=(draft->>'candidateId')::uuid; designation_id:=(draft->>'designationId')::uuid; v_request_id:=candidate_id;
    SELECT * INTO d FROM public.coach_first_review_designations WHERE id=designation_id AND user_id=actor AND program_id=program;
    IF NOT FOUND THEN RAISE EXCEPTION 'Owned first review designation unavailable' USING ERRCODE='P0002'; END IF;
    IF draft->>'basePlanVersionId' IS DISTINCT FROM d.base_plan_version_id::text THEN
      RAISE EXCEPTION 'First submission base differs' USING ERRCODE='22023'; END IF;
    operation_key:='first-review-candidate:'||v_request_id::text;
  ELSE
    IF (SELECT count(*) FROM jsonb_object_keys(body))<>(CASE WHEN v_operation='decide' THEN 7 ELSE 4 END)
      OR jsonb_typeof(body->'candidateId') IS DISTINCT FROM 'string'
      OR (body->>'candidateId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Invalid first review request identity' USING ERRCODE='22023'; END IF;
    candidate_id:=(body->>'candidateId')::uuid;
    SELECT * INTO c FROM public.coach_first_review_candidates WHERE id=candidate_id AND program_id=program;
    SELECT * INTO d FROM public.coach_first_review_designations WHERE id=c.designation_id;
    IF v_operation='decide' THEN
      IF c.id IS NULL OR d.reviewer_id IS DISTINCT FROM actor THEN
        RAISE EXCEPTION 'First reviewer request unavailable' USING ERRCODE='P0002'; END IF;
      IF NOT(body ?& ARRAY['expectedUserId','candidateId','designationId','requestId','decision','contentHash','sourceHash'])
        OR jsonb_typeof(body->'requestId') IS DISTINCT FROM 'string'
        OR (body->>'requestId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
        OR jsonb_typeof(body->'decision') IS DISTINCT FROM 'string' OR body->>'decision' NOT IN ('approve','reject')
        OR body->'designationId' IS DISTINCT FROM to_jsonb(d.id::text)
        OR body->'contentHash' IS DISTINCT FROM to_jsonb(c.content_hash) OR body->'sourceHash' IS DISTINCT FROM to_jsonb(c.source_hash) THEN
        RAISE EXCEPTION 'First decision identity differs' USING ERRCODE='22023'; END IF;
      v_request_id:=(body->>'requestId')::uuid;
      operation_key:='first-review-decision:'||actor::text||':'||v_request_id::text;
    ELSE
      IF NOT(body ?& ARRAY['expectedUserId','candidateId','programId','requestId'])
        OR body->'programId' IS DISTINCT FROM p_request->'programId' OR jsonb_typeof(body->'requestId') IS DISTINCT FROM 'string'
        OR body->>'requestId'<>btrim(body->>'requestId') OR length(body->>'requestId') NOT BETWEEN 8 AND 200 THEN
        RAISE EXCEPTION 'Invalid first issue identity' USING ERRCODE='22023'; END IF;
      IF c.id IS NULL OR c.user_id IS DISTINCT FROM actor THEN
        RAISE EXCEPTION 'Owned first candidate unavailable' USING ERRCODE='P0002'; END IF;
    END IF;
  END IF;
  -- Historical authorization deliberately does not require current designation,
  -- enrollment, enablement, source freshness or a still-active legacy base.
  SELECT active_plan_version_id INTO active_plan FROM public.training_programs WHERE id=program AND user_id=d.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owned first review program unavailable' USING ERRCODE='P0002'; END IF;
  envelope:=jsonb_build_object('schemaVersion',1,'request',p_request);
  IF p_close AND v_operation<>'issue' THEN
    PERFORM public.lock_first_review_program(program,d.user_id);
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation_key,0));
  END IF;
  IF v_operation='submit' THEN
    SELECT * INTO c FROM public.coach_first_review_candidates WHERE id=candidate_id;
    IF FOUND THEN
      IF c.user_id IS DISTINCT FROM actor OR c.program_id IS DISTINCT FROM program OR c.designation_id IS DISTINCT FROM d.id
        OR c.private_packet#>'{inputSnapshot,firstReviewedDraft}' IS DISTINCT FROM draft THEN
        RAISE EXCEPTION 'Saved first submission request differs' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',public.first_review_candidate_json(c.id));
    END IF;
  ELSIF v_operation='decide' THEN
    SELECT * INTO receipt FROM public.coach_first_review_decisions r WHERE r.reviewer_id=actor AND r.request_id=v_request_id;
    IF FOUND THEN
      IF (receipt.candidate_id,receipt.designation_id,receipt.decision,receipt.content_hash,receipt.source_hash) IS DISTINCT FROM
        (candidate_id,d.id,body->>'decision',body->>'contentHash',body->>'sourceHash') THEN
        RAISE EXCEPTION 'Saved first decision request differs' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',public.first_review_decision_json(receipt.id,true));
    END IF;
  ELSE
    identity:=jsonb_build_object('reviewId',candidate_id,'registrationId',candidate_id);
    IF p_close THEN
      -- Match the existing resolver's registration -> request -> program order.
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('reviewed-registration:'||candidate_id::text,0));
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':rolling-week-proposal:'||(body->>'requestId'),0));
    END IF;
    SELECT * INTO issue_closed FROM public.coach_reviewed_proposal_resolutions r
      WHERE r.user_id=actor AND r.operation='issue' AND (r.request_id=body->>'requestId' OR r.registration_id=candidate_id);
    IF FOUND THEN
      IF issue_closed.program_id IS DISTINCT FROM program OR issue_closed.identity IS DISTINCT FROM identity
        OR issue_closed.request_id IS DISTINCT FROM body->>'requestId' THEN
        RAISE EXCEPTION 'First issue closure identity differs' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',issue_closed.id,'resolvedAt',issue_closed.created_at);
    END IF;
    IF p_close THEN
      result:=public.resolve_reviewed_proposal_request(program,'issue',body->>'requestId',identity);
      IF result->>'disposition'='saved' THEN
        RETURN envelope||jsonb_build_object('disposition','saved','result',jsonb_build_object('proposalId',result->'proposalId',
          'planVersionId',result->'planVersionId','activePlanVersionId',result->'activePlanVersionId')); END IF;
      RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',result->'resolutionId','resolvedAt',result->'resolvedAt');
    END IF;
    -- Getter is pure: do not call the mutating resolver to establish absence.
    SELECT * INTO registration FROM public.coach_reviewed_proposal_registrations WHERE id=candidate_id;
    IF FOUND AND (registration.user_id IS DISTINCT FROM actor OR registration.packet->>'registrationId' IS DISTINCT FROM candidate_id::text
      OR registration.packet#>>'{source,binding,scope,programId}' IS DISTINCT FROM program::text) THEN
      RAISE EXCEPTION 'First issue registration differs' USING ERRCODE='22023'; END IF;
    SELECT * INTO proposal FROM public.adaptation_proposals WHERE user_id=actor AND idempotency_key=body->>'requestId';
    IF FOUND THEN
      IF registration.id IS NULL OR proposal.id IS DISTINCT FROM registration.proposal_id OR proposal.program_id IS DISTINCT FROM program
        OR proposal.proposed_plan_version_id IS DISTINCT FROM registration.plan_version_id THEN
        RAISE EXCEPTION 'Saved first issue request differs' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',jsonb_build_object('proposalId',proposal.id,
        'planVersionId',proposal.proposed_plan_version_id,'activePlanVersionId',active_plan));
    END IF;
    IF registration.id IS NOT NULL AND EXISTS(SELECT 1 FROM public.adaptation_proposals WHERE id=registration.proposal_id) THEN
      RAISE EXCEPTION 'First candidate issued with another request key' USING ERRCODE='22023'; END IF;
    RETURN envelope||jsonb_build_object('disposition','not_found');
  END IF;
  SELECT * INTO closed FROM public.coach_first_review_request_resolutions r
    WHERE r.actor_id=actor AND r.operation=v_operation AND r.request_id=v_request_id;
  IF FOUND THEN
    IF closed.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'First closure request differs' USING ERRCODE='22023'; END IF;
  ELSIF NOT p_close THEN RETURN envelope||jsonb_build_object('disposition','not_found');
  ELSE
    INSERT INTO public.coach_first_review_request_resolutions(actor_id,program_id,operation,request_id,request)
      VALUES(actor,program,v_operation,v_request_id,p_request) RETURNING * INTO closed;
  END IF;
  RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',closed.id,'resolvedAt',closed.created_at);
END $$;
CREATE FUNCTION public.first_review_profile_prepare_request_valid(p_request jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item text;
BEGIN
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>500000
    OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>8
    OR NOT(p_request ?& ARRAY['snapshotId','designationId','programId','basePlanVersionId','historyDays','tzOffset','windowStart','targetSetup']) THEN RETURN false; END IF;
  FOREACH item IN ARRAY ARRAY['snapshotId','designationId','programId','basePlanVersionId'] LOOP
    IF jsonb_typeof(p_request->item) IS DISTINCT FROM 'string' OR (p_request->>item ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(p_request->'historyDays') IS DISTINCT FROM 'number' OR (p_request->>'historyDays' ~ '^[0-9]+$') IS DISTINCT FROM true
    OR jsonb_typeof(p_request->'tzOffset') IS DISTINCT FROM 'number' OR (p_request->>'tzOffset' ~ '^-?[0-9]+$') IS DISTINCT FROM true THEN RETURN false; END IF;
  RETURN coalesce((p_request->>'historyDays')::numeric BETWEEN 1 AND 180 AND (p_request->>'tzOffset')::numeric BETWEEN -720 AND 840
    AND jsonb_typeof(p_request->'windowStart')='string' AND p_request->>'windowStart' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND jsonb_typeof(p_request->'targetSetup')='object' AND public.supervised_review_fields_valid(p_request->'targetSetup','profile')
    AND p_request->'targetSetup' ?& ARRAY['schemaVersion','kernelVersion','athleteGoalSummary','primaryGoal','secondaryGoals','trainingExperience','startDate',
      'sessionAvailability','equipment','explicitConstraints','unresolvedConstraintNote','preferences','assessments','recentTraining','inputSource']
    AND jsonb_typeof(p_request#>'{targetSetup,trainingExperience}')='string'
    AND p_request#>>'{targetSetup,trainingExperience}' IN ('new_or_returning','consistent','experienced')
    AND p_request#>'{targetSetup,startDate}'=p_request->'windowStart',false);
END $$;
CREATE FUNCTION public.first_review_profile_request_resolution_result(p_request jsonb,p_close boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE actor uuid:=auth.uid(); program uuid:=(p_request->>'programId')::uuid; body jsonb:=p_request->'body';
  v_operation text:=p_request->>'operation'; q jsonb; snapshot_id uuid; v_request_id uuid; operation_key text; envelope jsonb;
  d public.coach_first_review_designations%ROWTYPE; s public.coach_first_review_profile_snapshots%ROWTYPE;
  receipt public.coach_first_review_profile_confirmations%ROWTYPE; closed public.coach_first_review_request_resolutions%ROWTYPE;
BEGIN
  -- Called only by the private generic resolver after exact envelope/auth checks.
  IF actor IS NULL OR body->'expectedUserId' IS DISTINCT FROM to_jsonb(actor::text) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF v_operation='prepare_profile' THEN
    q:=body->'request';
    IF (SELECT count(*) FROM jsonb_object_keys(body))<>2 OR NOT(body ?& ARRAY['expectedUserId','request'])
      OR public.first_review_profile_prepare_request_valid(q) IS DISTINCT FROM true OR q->'programId' IS DISTINCT FROM p_request->'programId' THEN
      RAISE EXCEPTION 'Invalid first profile preparation request' USING ERRCODE='22023'; END IF;
    snapshot_id:=(q->>'snapshotId')::uuid; v_request_id:=snapshot_id;
    SELECT * INTO d FROM public.coach_first_review_designations WHERE id=(q->>'designationId')::uuid AND user_id=actor AND program_id=program;
    IF NOT FOUND THEN RAISE EXCEPTION 'Owned first profile designation unavailable' USING ERRCODE='P0002'; END IF;
    IF q->>'basePlanVersionId' IS DISTINCT FROM d.base_plan_version_id::text OR q->>'windowStart' IS DISTINCT FROM d.target_window_start::text THEN
      RAISE EXCEPTION 'First profile request base or window differs' USING ERRCODE='22023'; END IF;
    operation_key:='first-profile-snapshot:'||snapshot_id::text;
  ELSIF v_operation='confirm_profile' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(body))<>6 OR NOT(body ?& ARRAY['snapshotId','requestId','expectedUserId','contentHash','sourceHash','profileHash'])
      OR jsonb_typeof(body->'snapshotId') IS DISTINCT FROM 'string' OR (body->>'snapshotId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
      OR jsonb_typeof(body->'requestId') IS DISTINCT FROM 'string' OR (body->>'requestId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Invalid first profile confirmation identity' USING ERRCODE='22023'; END IF;
    snapshot_id:=(body->>'snapshotId')::uuid; v_request_id:=(body->>'requestId')::uuid;
    SELECT * INTO s FROM public.coach_first_review_profile_snapshots WHERE id=snapshot_id AND user_id=actor AND program_id=program;
    IF NOT FOUND THEN RAISE EXCEPTION 'Owned first profile unavailable' USING ERRCODE='P0002'; END IF;
    IF body->'contentHash' IS DISTINCT FROM to_jsonb(s.content_hash) OR body->'sourceHash' IS DISTINCT FROM s.source->'contextHash'
      OR body->'profileHash' IS DISTINCT FROM to_jsonb(s.profile_hash) THEN
      RAISE EXCEPTION 'First profile confirmation content differs' USING ERRCODE='22023'; END IF;
    operation_key:='first-profile-confirmation:'||actor::text||':'||v_request_id::text;
  ELSE RAISE EXCEPTION 'Invalid first profile resolution operation' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.training_programs WHERE id=program AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owned first profile program unavailable' USING ERRCODE='P0002'; END IF;
  envelope:=jsonb_build_object('schemaVersion',1,'request',p_request);
  IF p_close THEN
    PERFORM public.lock_first_review_program(program,actor);
    PERFORM pg_advisory_xact_lock(hashtextextended(operation_key,0));
  END IF;
  IF v_operation='prepare_profile' THEN
    SELECT * INTO s FROM public.coach_first_review_profile_snapshots WHERE id=snapshot_id;
    IF FOUND THEN
      IF s.user_id IS DISTINCT FROM actor OR s.program_id IS DISTINCT FROM program OR s.request IS DISTINCT FROM q THEN
        RAISE EXCEPTION 'Saved first profile preparation request differs' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',public.first_review_profile_snapshot_json(s.id));
    END IF;
  ELSE
    SELECT * INTO receipt FROM public.coach_first_review_profile_confirmations r WHERE r.user_id=actor AND r.request_id=v_request_id;
    IF FOUND THEN
      IF receipt.snapshot_id IS DISTINCT FROM snapshot_id THEN RAISE EXCEPTION 'Saved first profile confirmation request differs' USING ERRCODE='22023'; END IF;
      RETURN envelope||jsonb_build_object('disposition','saved','result',public.first_review_profile_receipt_json(receipt.id));
    END IF;
  END IF;
  SELECT * INTO closed FROM public.coach_first_review_request_resolutions r WHERE r.actor_id=actor AND r.operation=v_operation AND r.request_id=v_request_id;
  IF FOUND THEN
    IF closed.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'First profile closure request differs' USING ERRCODE='22023'; END IF;
  ELSIF NOT p_close THEN RETURN envelope||jsonb_build_object('disposition','not_found');
  ELSE
    INSERT INTO public.coach_first_review_request_resolutions(actor_id,program_id,operation,request_id,request)
      VALUES(actor,program,v_operation,v_request_id,p_request) RETURNING * INTO closed;
  END IF;
  RETURN envelope||jsonb_build_object('disposition','no_write','resolutionId',closed.id,'resolvedAt',closed.created_at);
END $$;
REVOKE ALL ON FUNCTION public.first_review_profile_prepare_request_valid(jsonb),public.first_review_profile_request_resolution_result(jsonb,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_first_review_request_resolution(p_request jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.first_review_request_resolution_result(p_request,false) $$;
CREATE FUNCTION public.resolve_first_review_request(p_request jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.first_review_request_resolution_result(p_request,true) $$;
REVOKE ALL ON FUNCTION public.first_review_request_resolution_result(jsonb,boolean),public.get_first_review_request_resolution(jsonb),
  public.resolve_first_review_request(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_first_review_request_resolution(jsonb),public.resolve_first_review_request(jsonb) TO authenticated;
COMMIT;
