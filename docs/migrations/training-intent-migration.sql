-- W3 additive migration draft. Parent migration owner assigns final timestamp/order.
BEGIN;

CREATE OR REPLACE FUNCTION public.training_intent_catalog() RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path = '' AS $catalog$
SELECT '{"assessments":[{"id":"strength.repetition_max","version":"1.0.0","name":"Repetition maximum strength assessment","family":"strength","qualityIds":["maximal_strength"],"observationKind":"strength_set","primaryMetricId":"strength.load","allowedSemanticRoles":["direct_outcome"],"allowedUnits":["kg","lb"],"valueRange":{"min":0.1,"max":null},"protocol":{"id":"strength-repetition-max-standard","version":"1.0.0","comparabilityDimensions":["movement","variation","repetitions","equipment","source","technique_modifiers"]}},{"id":"strength.repetition_capacity","version":"1.0.0","name":"Fixed-load strength repetition capacity","family":"strength","qualityIds":["strength_endurance"],"observationKind":"strength_set","primaryMetricId":"strength.repetitions","allowedSemanticRoles":["direct_outcome","training_signal"],"allowedUnits":["repetitions"],"valueRange":{"min":0,"max":null},"protocol":{"id":"strength-repetition-capacity-standard","version":"1.0.0","comparabilityDimensions":["movement","variation","external_load","duration","equipment","source","technique_modifiers"]}},{"id":"strength.fixed_load_velocity","version":"1.0.0","name":"Fixed-load bar velocity assessment","family":"strength","qualityIds":["maximal_strength","explosive_strength"],"observationKind":"strength_set","primaryMetricId":"bar.mean_velocity","allowedSemanticRoles":["training_signal","direct_outcome"],"allowedUnits":["m_per_s"],"valueRange":{"min":0.01,"max":5},"protocol":{"id":"qwik-video-vbt-fixed-load","version":"1.0.0","comparabilityDimensions":["movement","variation","external_load","equipment","source","technique_modifiers"]}},{"id":"strength.estimated_one_rep_max","version":"1.0.0","name":"Estimated one-repetition maximum","family":"strength","qualityIds":["maximal_strength"],"observationKind":"strength_set","primaryMetricId":"strength.estimated_1rm","allowedSemanticRoles":["estimate"],"allowedUnits":["kg","lb"],"valueRange":{"min":0.1,"max":null},"protocol":{"id":"epley-estimated-one-rep-max","version":"1.0.0","comparabilityDimensions":["movement","variation","equipment","source","technique_modifiers"]}},{"id":"jump.height","version":"1.0.0","name":"Jump height assessment","family":"jump","qualityIds":["explosive_strength","jump_performance"],"observationKind":"jump_attempt","primaryMetricId":"jump.height","allowedSemanticRoles":["direct_outcome"],"allowedUnits":["m","cm","in"],"valueRange":{"min":0,"max":2},"protocol":{"id":"jump-height-standard","version":"1.0.0","comparabilityDimensions":["movement","equipment","source","technique_modifiers"]}},{"id":"sprint.time","version":"1.0.0","name":"Sprint time assessment","family":"sprint","qualityIds":["acceleration","max_velocity"],"observationKind":"sprint_attempt","primaryMetricId":"sprint.time","allowedSemanticRoles":["direct_outcome"],"allowedUnits":["s","ms"],"valueRange":{"min":0.01,"max":null},"protocol":{"id":"sprint-time-standard","version":"1.0.0","comparabilityDimensions":["distance","source","technique_modifiers","environment_modifiers"]}},{"id":"run.time_trial","version":"1.0.0","name":"Run time-trial assessment","family":"run","qualityIds":["aerobic_endurance","anaerobic_work_capacity"],"observationKind":"run_attempt","primaryMetricId":"run.time","allowedSemanticRoles":["direct_outcome"],"allowedUnits":["s","min"],"valueRange":{"min":0.01,"max":null},"protocol":{"id":"run-time-trial-standard","version":"1.0.0","comparabilityDimensions":["distance","equipment","source","environment_modifiers"]}},{"id":"readiness.self_report","version":"1.0.0","name":"Daily readiness self-report","family":"readiness","qualityIds":["recovery_capacity"],"observationKind":"readiness_check","primaryMetricId":"readiness.score","allowedSemanticRoles":["proxy","training_signal"],"allowedUnits":["score"],"valueRange":{"min":1,"max":5},"protocol":{"id":"daily-readiness-five-point","version":"1.0.0","comparabilityDimensions":["source"]}},{"id":"session.rpe","version":"1.0.0","name":"Session rating of perceived exertion","family":"session","qualityIds":["recovery_capacity","training_adherence"],"observationKind":"session_outcome","primaryMetricId":"session.rpe","allowedSemanticRoles":["training_signal"],"allowedUnits":["score"],"valueRange":{"min":1,"max":10},"protocol":{"id":"session-rpe-ten-point","version":"1.0.0","comparabilityDimensions":["source"]}}],"movements":[{"id":"barbell_back_squat","domains":["strength","hypertrophy"]},{"id":"dumbbell_goblet_squat","domains":["strength","hypertrophy"]},{"id":"kettlebell_goblet_squat","domains":["strength","hypertrophy"]},{"id":"tempo_split_squat","domains":["strength","hypertrophy","resilience"]},{"id":"reverse_lunge","domains":["strength","hypertrophy","resilience"]},{"id":"barbell_deadlift","domains":["strength"]},{"id":"dumbbell_romanian_deadlift","domains":["strength","hypertrophy"]},{"id":"barbell_romanian_deadlift","domains":["strength","hypertrophy"]},{"id":"kettlebell_deadlift","domains":["strength","hypertrophy"]},{"id":"single_leg_hip_bridge","domains":["strength","hypertrophy","resilience"]},{"id":"dumbbell_floor_press","domains":["strength","hypertrophy"]},{"id":"barbell_floor_press","domains":["strength","hypertrophy"]},{"id":"push_up","domains":["strength","hypertrophy","resilience"]},{"id":"one_arm_dumbbell_row","domains":["strength","hypertrophy"]},{"id":"cable_row","domains":["strength","hypertrophy"]},{"id":"band_row","domains":["strength","hypertrophy","resilience"]},{"id":"barbell_overhead_press","domains":["strength"]},{"id":"dumbbell_overhead_press","domains":["strength","hypertrophy"]},{"id":"pike_push_up","domains":["strength","hypertrophy"]},{"id":"box_jump","domains":["power_explosiveness"]},{"id":"countermovement_jump","domains":["power_explosiveness"]},{"id":"squat_jump_to_stick","domains":["power_explosiveness","resilience"]},{"id":"dumbbell_jump_squat","domains":["power_explosiveness"]},{"id":"broad_jump","domains":["power_explosiveness"]},{"id":"repeated_broad_jump","domains":["power_explosiveness"]},{"id":"kettlebell_swing","domains":["power_explosiveness"]},{"id":"barbell_jump_shrug","domains":["power_explosiveness"]},{"id":"medicine_ball_chest_pass","domains":["power_explosiveness"]},{"id":"explosive_incline_push_up","domains":["power_explosiveness"]},{"id":"short_hill_sprint","domains":["speed_agility"]},{"id":"flat_acceleration_sprint","domains":["speed_agility"]},{"id":"flying_sprint","domains":["speed_agility"]},{"id":"wicket_stride","domains":["speed_agility"]},{"id":"relaxed_stride","domains":["speed_agility"]},{"id":"bike_acceleration","domains":["speed_agility"]},{"id":"bike_cadence_sprint","domains":["speed_agility"]},{"id":"fast_high_knee_march","domains":["speed_agility"]},{"id":"fast_a_march","domains":["speed_agility"]},{"id":"wall_acceleration_drill","domains":["speed_agility"]},{"id":"straight_leg_bound","domains":["speed_agility"]},{"id":"build_up_to_controlled_stop","domains":["speed_agility"]},{"id":"lateral_shuffle_to_stick","domains":["speed_agility","resilience"]},{"id":"snap_down_to_stick","domains":["speed_agility","resilience"]},{"id":"lateral_bound_to_stick","domains":["speed_agility","resilience"]},{"id":"easy_run","domains":["aerobic"]},{"id":"bike_erg","domains":["aerobic"]},{"id":"row_erg","domains":["aerobic"]},{"id":"incline_walk","domains":["aerobic"]},{"id":"brisk_walk","domains":["aerobic","resilience"]},{"id":"single_leg_calf_raise","domains":["hypertrophy","resilience"]},{"id":"bent_knee_calf_raise","domains":["hypertrophy","resilience"]},{"id":"side_plank","domains":["resilience"]},{"id":"suitcase_carry","domains":["resilience"]},{"id":"dead_bug","domains":["resilience"]},{"id":"bird_dog","domains":["resilience"]},{"id":"prone_y_raise","domains":["resilience"]},{"id":"prone_w_raise","domains":["hypertrophy","resilience"]},{"id":"bear_crawl","domains":["resilience"]},{"id":"farmer_carry","domains":["resilience"]},{"id":"easy_mobility_flow","domains":["resilience"]},{"id":"breathing_mobility_flow","domains":["resilience"]},{"id":"barbell_bench_press","domains":["strength","hypertrophy"]}],"equipment":["barbell","rack","dumbbell","kettlebell","bench","band","cable","machine","pull_up_bar","medicine_ball","box","sled","bike","rower","treadmill","track","bodyweight"],"qualities":["maximal_strength","strength_endurance","explosive_strength","acceleration","max_velocity","change_of_direction","jump_performance","aerobic_endurance","anaerobic_work_capacity","movement_skill","tissue_capacity","recovery_capacity","training_adherence"]}'::JSONB;
$catalog$;

CREATE OR REPLACE FUNCTION public.valid_training_intent(p JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE o JSONB; g JSONB; b JSONB; m JSONB; d JSONB; c JSONB; q JSONB; k TEXT;
  ids TEXT[] := ARRAY[]::TEXT[]; item TEXT; catalog JSONB := public.training_intent_catalog();
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR octet_length(p::TEXT) > 10000
    OR p->'schemaVersion' IS DISTINCT FROM '1'::JSONB
    OR (p - ARRAY['schemaVersion','outcomes','priorityOrder','event','confirmedAt']) <> '{}' OR NOT (p ?& ARRAY['schemaVersion','outcomes','priorityOrder','event','confirmedAt'])
    OR jsonb_typeof(p->'outcomes') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p->'outcomes') NOT BETWEEN 1 AND 8
    OR jsonb_typeof(p->'confirmedAt') IS DISTINCT FROM 'string'
    OR to_char((p->>'confirmedAt')::TIMESTAMPTZ AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') IS DISTINCT FROM p->>'confirmedAt' THEN RETURN false; END IF;
  FOR o IN SELECT value FROM jsonb_array_elements(p->'outcomes') LOOP
    g := o->'goal'; b := o->'binding'; m := o->'measurement'; c := b->'assessmentContext';
    IF jsonb_typeof(o) <> 'object' OR (o - ARRAY['goal','domain','measurement','binding','baseline','capability']) <> '{}' OR NOT (o ?& ARRAY['goal','domain','measurement','binding','baseline','capability'])
      OR jsonb_typeof(g) IS DISTINCT FROM 'object' OR jsonb_typeof(b) IS DISTINCT FROM 'object'
      OR (g - ARRAY['schemaVersion','id','kind','statement','priority','status','target','targetDate','requiredQualityIds','source']) <> '{}' OR NOT (g ?& ARRAY['schemaVersion','id','kind','statement','priority','status','target','targetDate','requiredQualityIds','source'])
      OR jsonb_typeof(g->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(g->'statement') IS DISTINCT FROM 'string'
      OR g->'schemaVersion' IS DISTINCT FROM '1'::JSONB OR coalesce(g->>'id','') !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,159}$'
      OR length(btrim(coalesce(g->>'statement',''))) NOT BETWEEN 5 AND 500
      OR coalesce(g->>'kind','') NOT IN ('performance_outcome','capacity','skill','process','maintenance')
      OR coalesce(g->>'priority','') NOT IN ('primary','secondary')
      OR coalesce(g->>'status','') NOT IN ('active','achieved','paused','superseded')
      OR jsonb_typeof(g->'source') IS DISTINCT FROM 'object' OR ((g->'source') - ARRAY['kind','confirmedAt']) <> '{}' OR NOT ((g->'source') ?& ARRAY['kind','confirmedAt'])
      OR g->'source'->>'kind' IS DISTINCT FROM 'athlete_confirmed'
      OR g->'source'->>'confirmedAt' IS DISTINCT FROM p->>'confirmedAt'
      OR jsonb_typeof(g->'requiredQualityIds') IS DISTINCT FROM 'array'
      OR jsonb_array_length(g->'requiredQualityIds') < 1
      OR g->>'id' = ANY(ids) THEN RETURN false; END IF;
    ids := array_append(ids,g->>'id');
    IF (g->'targetDate' <> 'null'::JSONB AND (g->>'targetDate')::DATE::TEXT <> g->>'targetDate')
      OR NOT (o->'domain' = 'null'::JSONB OR o->>'domain' IN ('strength','hypertrophy','power_explosiveness','speed_agility','aerobic','resilience'))
      OR (b - ARRAY['movementId','distance','equipmentIds','variation','assessmentContext']) <> '{}' OR NOT (b ?& ARRAY['movementId','distance','equipmentIds','variation'])
      OR jsonb_typeof(b->'equipmentIds') IS DISTINCT FROM 'array'
      OR NOT (b->'movementId' = 'null'::JSONB OR EXISTS (SELECT 1 FROM jsonb_array_elements(catalog->'movements') x WHERE x->>'id' = b->>'movementId'))
      OR NOT (b->'variation' = 'null'::JSONB OR (jsonb_typeof(b->'variation')='string' AND length(btrim(b->>'variation')) BETWEEN 1 AND 160)) THEN RETURN false; END IF;
    IF (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(b->'equipmentIds'))
      OR (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(g->'requiredQualityIds')) THEN RETURN false; END IF;
    FOR item IN SELECT jsonb_array_elements_text(b->'equipmentIds') LOOP
      IF NOT coalesce(catalog->'equipment' ? item,false) THEN RETURN false; END IF;
    END LOOP;
    FOR item IN SELECT jsonb_array_elements_text(g->'requiredQualityIds') LOOP
      IF NOT coalesce(catalog->'qualities' ? item,false) THEN RETURN false; END IF;
    END LOOP;
    q := b->'distance';
    IF q IS DISTINCT FROM 'null'::JSONB AND (jsonb_typeof(q) IS DISTINCT FROM 'object' OR (q - ARRAY['value','unit']) <> '{}' OR NOT (q ?& ARRAY['value','unit'])
      OR jsonb_typeof(q->'value') IS DISTINCT FROM 'number' OR (q->>'value')::NUMERIC <= 0
      OR coalesce(q->>'unit','') NOT IN ('m','km','mi')) THEN RETURN false; END IF;
    IF c IS NOT NULL THEN
      IF jsonb_typeof(c) <> 'object' OR (c - ARRAY['repetitions','externalLoad','duration','techniqueModifiers','environmentModifiers']) <> '{}' OR NOT (c ?& ARRAY['repetitions','externalLoad','duration','techniqueModifiers','environmentModifiers'])
        OR jsonb_typeof(c->'techniqueModifiers') IS DISTINCT FROM 'array' OR jsonb_typeof(c->'environmentModifiers') IS DISTINCT FROM 'array'
        OR NOT (c->'repetitions' = 'null'::JSONB OR (jsonb_typeof(c->'repetitions') = 'number' AND (c->>'repetitions')::NUMERIC BETWEEN 1 AND 1000 AND mod((c->>'repetitions')::NUMERIC,1)=0)) THEN RETURN false; END IF;
      FOREACH k IN ARRAY ARRAY['techniqueModifiers','environmentModifiers'] LOOP
        IF (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(c->k)) THEN RETURN false; END IF;
        FOR q IN SELECT value FROM jsonb_array_elements(c->k) LOOP
          IF jsonb_typeof(q) <> 'string' OR length(btrim(q#>>'{}')) NOT BETWEEN 1 AND 80 THEN RETURN false; END IF;
        END LOOP;
      END LOOP;
      FOREACH k IN ARRAY ARRAY['externalLoad','duration'] LOOP
        q:=c->k;
        IF q IS DISTINCT FROM 'null'::JSONB AND (jsonb_typeof(q) IS DISTINCT FROM 'object' OR (q - ARRAY['value','unit']) <> '{}' OR NOT (q ?& ARRAY['value','unit'])
          OR jsonb_typeof(q->'value') IS DISTINCT FROM 'number' OR (q->>'value')::NUMERIC <= 0
          OR (k='externalLoad' AND coalesce(q->>'unit','') NOT IN ('kg','lb'))
          OR (k='duration' AND coalesce(q->>'unit','') NOT IN ('s','min'))) THEN RETURN false; END IF;
      END LOOP;
    END IF;
    IF jsonb_typeof(o->'baseline') IS DISTINCT FROM 'object' OR NOT (
      (o->'baseline' = '{"status":"unknown"}'::JSONB) OR
      (o->'baseline'->>'status' = 'referenced' AND ((o->'baseline') - ARRAY['status','observationId']) = '{}'
        AND coalesce(o->'baseline'->>'observationId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) THEN RETURN false; END IF;
    IF NOT (o->'capability' = '{"status":"supported"}'::JSONB OR (jsonb_typeof(o->'capability')='object'
      AND ((o->'capability') - ARRAY['status','reason']) = '{}' AND o->'capability'->>'status'='unsupported'
      AND jsonb_typeof(o->'capability'->'reason')='string' AND length(btrim(coalesce(o->'capability'->>'reason',''))) BETWEEN 1 AND 500)) THEN RETURN false; END IF;
    d := NULL;
    IF m IS DISTINCT FROM 'null'::JSONB THEN
      SELECT x INTO d FROM jsonb_array_elements(catalog->'assessments') x WHERE x->>'id'=m->'assessmentDefinition'->>'id';
      IF jsonb_typeof(m) IS DISTINCT FROM 'object' OR (m - ARRAY['metricId','unit','assessmentDefinition','protocol']) <> '{}' OR NOT (m ?& ARRAY['metricId','unit','assessmentDefinition','protocol'])
        OR ((m->'assessmentDefinition') - ARRAY['id','version']) <> '{}' OR NOT ((m->'assessmentDefinition') ?& ARRAY['id','version']) OR ((m->'protocol') - ARRAY['id','version']) <> '{}' OR NOT ((m->'protocol') ?& ARRAY['id','version'])
        OR d IS NULL OR m->>'metricId' IS DISTINCT FROM d->>'primaryMetricId'
        OR m->'assessmentDefinition'->>'version' IS DISTINCT FROM d->>'version'
        OR jsonb_typeof(m->'unit') IS DISTINCT FROM 'string' OR NOT coalesce(d->'allowedUnits' ? (m->>'unit'),false)
        OR m->'protocol'->>'id' IS DISTINCT FROM d->'protocol'->>'id'
        OR m->'protocol'->>'version' IS DISTINCT FROM d->'protocol'->>'version' THEN RETURN false; END IF;
    END IF;
    IF o->'capability'->>'status'='supported' THEN
      IF b->'movementId'<>'null'::JSONB AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'movements') x WHERE x->>'id'=b->>'movementId' AND x->'domains' ? (o->>'domain')) THEN RETURN false; END IF;
      IF d IS NOT NULL AND NOT coalesce((o->>'domain' IN ('strength','hypertrophy') AND d->>'family'='strength')
        OR (o->>'domain'='power_explosiveness' AND d->>'family'='jump') OR (o->>'domain'='speed_agility' AND d->>'family'='sprint')
        OR (o->>'domain'='aerobic' AND d->>'family'='run') OR (o->>'domain'='resilience' AND d->>'family'='readiness'),false) THEN RETURN false; END IF;
      IF o->'domain'='null'::JSONB OR (g->>'kind' NOT IN ('process','skill') AND d IS NULL) THEN RETURN false; END IF;
      FOR item IN SELECT jsonb_array_elements_text(d->'protocol'->'comparabilityDimensions') LOOP
        IF (item='movement' AND b->'movementId'='null'::JSONB) OR (item='distance' AND b->'distance'='null'::JSONB)
          OR (item='variation' AND b->'variation'='null'::JSONB) OR (item='equipment' AND jsonb_array_length(b->'equipmentIds')=0)
          OR (item='repetitions' AND coalesce(c->'repetitions','null')='null'::JSONB)
          OR (item='external_load' AND coalesce(c->'externalLoad','null')='null'::JSONB)
          OR (item='duration' AND coalesce(c->'duration','null')='null'::JSONB) THEN RETURN false; END IF;
      END LOOP;
    END IF;
    q := g->'target';
    IF q IS DISTINCT FROM 'null'::JSONB THEN
      IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR (q - ARRAY['role','comparison','metric','upperMetric','assessmentDefinition','protocol']) <> '{}' OR NOT (q ?& ARRAY['role','comparison','metric','assessmentDefinition','protocol'])
        OR q->>'role' IS DISTINCT FROM 'target' OR coalesce(q->>'comparison','') NOT IN ('at_least','at_most','range')
        OR jsonb_typeof(q->'metric') IS DISTINCT FROM 'object' OR ((q->'metric') - ARRAY['metricId','value','unit']) <> '{}' OR NOT ((q->'metric') ?& ARRAY['metricId','value','unit'])
        OR jsonb_typeof(q->'metric'->'value') IS DISTINCT FROM 'number' OR (q->'metric'->>'value')::NUMERIC < 0
        OR q->'metric'->>'metricId' IS DISTINCT FROM m->>'metricId' OR q->'metric'->>'unit' IS DISTINCT FROM m->>'unit'
        OR q->'assessmentDefinition' IS DISTINCT FROM m->'assessmentDefinition' OR q->'protocol' IS DISTINCT FROM m->'protocol'
        OR (q->>'comparison'='range' AND (jsonb_typeof(q->'upperMetric') IS DISTINCT FROM 'object'
          OR ((q->'upperMetric') - ARRAY['metricId','value','unit']) <> '{}' OR NOT ((q->'upperMetric') ?& ARRAY['metricId','value','unit']) OR q->'upperMetric'->>'metricId' IS DISTINCT FROM m->>'metricId'
          OR q->'upperMetric'->>'unit' IS DISTINCT FROM m->>'unit' OR jsonb_typeof(q->'upperMetric'->'value') IS DISTINCT FROM 'number'
          OR (q->'upperMetric'->>'value')::NUMERIC < (q->'metric'->>'value')::NUMERIC))
        OR (q->>'comparison'<>'range' AND q ? 'upperMetric') THEN RETURN false; END IF;
    END IF;
  END LOOP;
  IF p->'priorityOrder' IS DISTINCT FROM 'null'::JSONB THEN
    IF jsonb_typeof(p->'priorityOrder') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'priorityOrder') <> array_length(ids,1)
      OR (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(p->'priorityOrder'))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'priorityOrder') x WHERE NOT coalesce(x=ANY(ids),false)) THEN RETURN false; END IF;
  END IF;
  q := p->'event';
  IF q IS DISTINCT FROM 'null'::JSONB THEN
    IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR (q - ARRAY['name','goalIds','date']) <> '{}' OR NOT (q ?& ARRAY['name','goalIds','date'])
      OR jsonb_typeof(q->'name') IS DISTINCT FROM 'string' OR length(btrim(coalesce(q->>'name',''))) NOT BETWEEN 1 AND 160 OR jsonb_typeof(q->'goalIds') IS DISTINCT FROM 'array'
      OR jsonb_array_length(q->'goalIds')<1 OR (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(q->'goalIds'))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'goalIds') x WHERE NOT coalesce(x=ANY(ids),false))
      OR (q->'date' <> 'null'::JSONB AND (q->>'date')::DATE::TEXT <> q->>'date') THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_training_intent(p JSONB, t TIMESTAMPTZ) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_set(jsonb_set(p,'{confirmedAt}',to_jsonb(to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),'{outcomes}',
    (SELECT jsonb_agg(jsonb_set(o,'{goal,source}',jsonb_build_object('kind','athlete_confirmed','confirmedAt',to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) ORDER BY n)
     FROM jsonb_array_elements(p->'outcomes') WITH ORDINALITY x(o,n)));
$$;

CREATE OR REPLACE FUNCTION public.training_outcome_comparison(o JSONB) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
SELECT jsonb_build_object('movementId',o->'binding'->'movementId','variationId',o->'binding'->'variation',
  'distance',o->'binding'->'distance','equipmentIds',o->'binding'->'equipmentIds',
  'repetitions',coalesce(o->'binding'->'assessmentContext'->'repetitions','null'),
  'externalLoad',coalesce(o->'binding'->'assessmentContext'->'externalLoad','null'),
  'duration',coalesce(o->'binding'->'assessmentContext'->'duration','null'),
  'techniqueModifiers',coalesce(o->'binding'->'assessmentContext'->'techniqueModifiers','[]'),
  'environmentModifiers',coalesce(o->'binding'->'assessmentContext'->'environmentModifiers','[]'));
$$;

CREATE OR REPLACE FUNCTION public.enforce_training_intent_content() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE o JSONB; g public.performance_observation_groups%ROWTYPE;
BEGIN
  IF NEW.memory_key <> 'training_intent' THEN RETURN NEW; END IF;
  IF NEW.kind <> 'goal' OR NOT public.valid_training_intent(NEW.content) THEN
    RAISE EXCEPTION 'Invalid training intent' USING ERRCODE='22023'; END IF;
  FOR o IN SELECT value FROM jsonb_array_elements(NEW.content->'outcomes') LOOP
    IF o->'baseline'->>'status'='referenced' THEN
      SELECT * INTO g FROM public.performance_observation_groups WHERE id=(o->'baseline'->>'observationId')::UUID AND user_id=NEW.user_id;
      IF NOT FOUND OR g.status <> 'complete' OR g.verification_status <> 'athlete_confirmed'
        OR g.assessment_definition_id IS DISTINCT FROM o->'measurement'->'assessmentDefinition'->>'id'
        OR g.protocol_version IS DISTINCT FROM o->'measurement'->'protocol'->>'version'
        OR NOT coalesce((g.source_kind='manual' AND g.source_system='sociusfit_training_baseline' AND g.metadata->>'origin'='athlete_reported')
          OR (g.source_kind='coach_completion' AND g.source_system='sociusfit' AND g.metadata->'completionContractVersion'='2'::JSONB AND g.workout_id IS NOT NULL AND g.prescribed_session_id IS NOT NULL
            AND EXISTS(SELECT 1 FROM public.workouts w WHERE w.id=g.workout_id AND w.user_id=NEW.user_id AND w.execution_revision=0 AND coalesce((to_jsonb(w)->>'capture_revision')::INTEGER,1)=1)),false)
        OR g.verified_by IS DISTINCT FROM NEW.user_id
        OR g.metadata->>'assessmentDefinitionVersion' IS DISTINCT FROM o->'measurement'->'assessmentDefinition'->>'version'
        OR g.metadata->>'protocolId' IS DISTINCT FROM o->'measurement'->'protocol'->>'id'
        OR g.comparison_modifiers IS DISTINCT FROM public.training_outcome_comparison(o)
        OR NOT EXISTS(SELECT 1 FROM public.performance_observation_values v WHERE v.group_id=g.id AND v.user_id=NEW.user_id
          AND v.status='complete' AND v.metric_id=o->'measurement'->>'metricId' AND v.unit=o->'measurement'->>'unit'
          AND v.semantic_role='direct_outcome') THEN
        RAISE EXCEPTION 'Baseline does not match owned comparable evidence' USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
  IF TG_OP='INSERT' THEN NEW.content:=public.stamp_training_intent(NEW.content,clock_timestamp()); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_training_intent_content ON public.coach_memories;
CREATE TRIGGER enforce_training_intent_content BEFORE INSERT OR UPDATE OF content,memory_key,kind
ON public.coach_memories FOR EACH ROW EXECUTE FUNCTION public.enforce_training_intent_content();

-- The wrapper freezes server confirmation time across replay and rejects stale correction bases.
CREATE OR REPLACE FUNCTION public.confirm_training_intent(p_content JSONB, p_idempotency_key TEXT, p_previous_memory_id UUID DEFAULT NULL)
RETURNS TABLE(memory_id UUID,memory_version INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID:=auth.uid(); existing public.coach_memories%ROWTYPE; previous public.coach_memories%ROWTYPE; stamped JSONB;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.valid_training_intent(p_content) OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'Invalid intent request' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::TEXT||':training_intent',0));
  SELECT * INTO existing FROM public.coach_memories WHERE user_id=uid AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    stamped:=public.stamp_training_intent(p_content,(existing.content->>'confirmedAt')::TIMESTAMPTZ);
    IF existing.memory_key<>'training_intent' OR existing.content IS DISTINCT FROM stamped OR existing.supersedes_id IS DISTINCT FROM p_previous_memory_id THEN
      RAISE EXCEPTION 'Intent request identity conflict' USING ERRCODE='22023'; END IF;
    RETURN QUERY SELECT existing.id,existing.version; RETURN;
  END IF;
  SELECT * INTO previous FROM public.coach_memories WHERE user_id=uid AND memory_key='training_intent' AND status='confirmed' FOR UPDATE;
  IF previous.id IS DISTINCT FROM p_previous_memory_id THEN RAISE EXCEPTION 'Training intent changed' USING ERRCODE='40001'; END IF;
  stamped:=public.stamp_training_intent(p_content,clock_timestamp());
  IF p_previous_memory_id IS NULL THEN
    RETURN QUERY SELECT * FROM public.confirm_coach_memory('training_intent','goal',stamped,
      jsonb_build_object('source','program_setup','confirmedBy','athlete'),1,p_idempotency_key);
  ELSE
    RETURN QUERY SELECT r.replacement_memory_id,r.replacement_version FROM public.correct_coach_memory_with_review(p_previous_memory_id,stamped,p_idempotency_key) r;
  END IF;
END;
$$;

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
      (p_content - ARRAY['experience','trainingDays','sessionMinutes','startDate']::TEXT[]) <> '{}'::JSONB
      OR jsonb_typeof(p_content->'trainingDays') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_content->'sessionMinutes') IS DISTINCT FROM 'number'
    )) OR (v_previous.memory_key = 'available_equipment' AND (
      (p_content - ARRAY['equipment','resolvedEquipmentIds']::TEXT[]) <> '{}'::JSONB
      OR jsonb_typeof(p_content->'equipment') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_content->'resolvedEquipmentIds') IS DISTINCT FROM 'array'
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



CREATE OR REPLACE FUNCTION public.record_training_baseline(p_memory_id UUID,p_goal_id TEXT,p_value NUMERIC,p_observed_at TIMESTAMPTZ,p_idempotency_key TEXT)
RETURNS TABLE(observation_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID:=auth.uid(); mem public.coach_memories%ROWTYPE; o JSONB; d JSONB; comparison JSONB; key TEXT;
  existing public.performance_observation_groups%ROWTYPE; new_id UUID; canonical_value NUMERIC; captured TIMESTAMPTZ:=clock_timestamp();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 120 OR p_value IS NULL OR p_value::TEXT IN ('NaN','Infinity','-Infinity')
    OR p_observed_at IS NULL OR p_observed_at>captured THEN RAISE EXCEPTION 'Invalid baseline request' USING ERRCODE='22023'; END IF;
  SELECT * INTO mem FROM public.coach_memories WHERE id=p_memory_id AND user_id=uid AND memory_key='training_intent';
  IF NOT FOUND THEN RAISE EXCEPTION 'Intent not found' USING ERRCODE='42501'; END IF;
  SELECT x INTO o FROM jsonb_array_elements(mem.content->'outcomes') x WHERE x->'goal'->>'id'=p_goal_id;
  IF o IS NULL OR o->'capability'->>'status'<>'supported' OR o->'measurement'='null'::JSONB THEN
    RAISE EXCEPTION 'No supported baseline protocol' USING ERRCODE='22023'; END IF;
  SELECT x INTO d FROM jsonb_array_elements(public.training_intent_catalog()->'assessments') x WHERE x->>'id'=o->'measurement'->'assessmentDefinition'->>'id';
  canonical_value:=p_value * CASE o->'measurement'->>'unit' WHEN 'lb' THEN 0.45359237 WHEN 'cm' THEN 0.01 WHEN 'in' THEN 0.0254 WHEN 'min' THEN 60 WHEN 'ms' THEN 0.001 ELSE 1 END;
  IF (o->'measurement'->>'unit'='repetitions' AND mod(p_value,1)<>0) OR NOT (d->'allowedSemanticRoles' ? 'direct_outcome') OR canonical_value<(d->'valueRange'->>'min')::NUMERIC
    OR (d->'valueRange'->'max'<>'null'::JSONB AND canonical_value>(d->'valueRange'->>'max')::NUMERIC) THEN
    RAISE EXCEPTION 'Unsupported baseline value' USING ERRCODE='22023'; END IF;
  comparison:=public.training_outcome_comparison(o);
  key:='training-baseline-v1:'||md5(jsonb_build_object('measurement',o->'measurement','comparison',comparison)::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::TEXT||':baseline:'||p_idempotency_key,0));
  SELECT * INTO existing FROM public.performance_observation_groups WHERE user_id=uid AND source_kind='manual'
    AND source_system='sociusfit_training_baseline' AND source_record_id=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF existing.observed_at IS DISTINCT FROM p_observed_at OR existing.comparability_key<>key
      OR existing.metadata->>'intentMemoryId'<>p_memory_id::TEXT OR existing.metadata->>'goalId'<>p_goal_id
      OR NOT EXISTS(SELECT 1 FROM public.performance_observation_values WHERE group_id=existing.id AND user_id=uid AND value_numeric=p_value) THEN
      RAISE EXCEPTION 'Baseline request identity conflict' USING ERRCODE='22023'; END IF;
    RETURN QUERY SELECT existing.id; RETURN;
  END IF;
  IF mem.effective_from>captured OR mem.status<>'confirmed' OR (mem.effective_until IS NOT NULL AND mem.effective_until<=captured)
    OR (mem.review_after IS NOT NULL AND mem.review_after<=captured) THEN RAISE EXCEPTION 'Intent is no longer current' USING ERRCODE='40001'; END IF;
  INSERT INTO public.performance_observation_groups(user_id,observation_kind,status,observed_at,captured_at,source_kind,source_system,source_device,source_record_id,
    assessment_definition_id,assessment_catalog_version,protocol_version,parser_version,verification_status,verified_at,verified_by,comparability_key,comparison_modifiers,metadata)
  VALUES(uid,d->>'observationKind','complete',p_observed_at,captured,'manual','sociusfit_training_baseline','none',p_idempotency_key,
    d->>'id','0.2.0',d->'protocol'->>'version','training-baseline-v1','athlete_confirmed',captured,uid,key,comparison,
    jsonb_build_object('protocolId',d->'protocol'->>'id','assessmentDefinitionVersion',d->>'version','intentMemoryId',p_memory_id,'goalId',p_goal_id,'origin','athlete_reported')) RETURNING id INTO new_id;
  INSERT INTO public.performance_observation_values(group_id,user_id,metric_id,semantic_role,value_numeric,unit,ordinal,status)
  VALUES(new_id,uid,o->'measurement'->>'metricId','direct_outcome',p_value,o->'measurement'->>'unit',0,'complete');
  RETURN QUERY SELECT new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.training_intent_catalog() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.valid_training_intent(JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_training_intent(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.stamp_training_intent(JSONB,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.training_outcome_comparison(JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.enforce_training_intent_content() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.confirm_training_intent(JSONB,TEXT,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_training_intent(JSONB,TEXT,UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.record_training_baseline(UUID,TEXT,NUMERIC,TIMESTAMPTZ,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_training_baseline(UUID,TEXT,NUMERIC,TIMESTAMPTZ,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_intent_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_outcome_comparison(JSONB) TO authenticated;
COMMIT;
