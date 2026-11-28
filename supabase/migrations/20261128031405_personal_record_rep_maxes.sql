BEGIN;
SET LOCAL lock_timeout = '5s';

-- Drain in-flight capture writers before changing the projection and reading history.
-- Ordinary reads of saved workouts can continue.
LOCK TABLE public.workouts IN EXCLUSIVE MODE;

-- Old metric rows can remain as historical data. New rep-max rows have a closed lift set.
ALTER TABLE public.personal_records
  DROP CONSTRAINT personal_records_pr_type_check,
  ADD CONSTRAINT personal_records_pr_type_check CHECK (
    pr_type IN ('weight', 'reps', 'time', 'volume')
    OR (
      pr_type IN ('1rm', '3rm', '5rm')
      AND exercise IN (
        'Bench Press', 'Clean', 'Clean and Jerk', 'Snatch', 'Front Squat',
        'Overhead Squat', 'Jerk', 'Push Press', 'Strict Press', 'Power Clean',
        'Power Clean and Jerk', 'Power Snatch'
      )
    )
  );

COMMENT ON COLUMN public.personal_records.pr_type IS
  'Rep max: 1rm, 3rm or 5rm. Legacy metric rows retain their original type.';
COMMENT ON COLUMN public.personal_records.value IS
  'Rep-max load in pounds. Legacy metric rows retain their original units.';

-- Canonical capture owns new projections. Keep the historical owner permissions
-- for legacy rows and let account deletion continue through the existing FK.
DROP POLICY IF EXISTS personal_records_legacy_insert ON public.personal_records;
CREATE POLICY personal_records_legacy_insert ON public.personal_records AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (pr_type IN ('weight', 'reps', 'time', 'volume'));
DROP POLICY IF EXISTS personal_records_legacy_delete ON public.personal_records;
CREATE POLICY personal_records_legacy_delete ON public.personal_records AS RESTRICTIVE
  FOR DELETE TO authenticated USING (pr_type IN ('weight', 'reps', 'time', 'volume'));

-- A NULL provenance argument is used only to identify affected keys before a rebuild.
-- With provenance supplied, a narrower leaf overrides the workout quantity source.
CREATE OR REPLACE FUNCTION public.capture_rep_max_candidates(p_blocks JSONB, p_fields JSONB)
RETURNS TABLE(exercise TEXT, pr_type TEXT, value NUMERIC)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH events AS (
    SELECT e.event->'performed' AS performed,
      format('blocks[%s].segments[%s].events[%s]', b.ord - 1, s.ord - 1, e.ord - 1) AS event_path,
      CASE btrim(regexp_replace(replace(lower(e.event->>'movement_name'), '&', ' and '), '[^a-z0-9]+', ' ', 'g'))
        WHEN 'bench press' THEN 'Bench Press'
        WHEN 'bench presses' THEN 'Bench Press'
        WHEN 'flat bench press' THEN 'Bench Press'
        WHEN 'barbell bench press' THEN 'Bench Press'
        WHEN 'flat barbell bench press' THEN 'Bench Press'
        WHEN 'pause bench' THEN 'Bench Press'
        WHEN 'paused bench' THEN 'Bench Press'
        WHEN 'pause bench press' THEN 'Bench Press'
        WHEN 'paused bench press' THEN 'Bench Press'
        WHEN 'bench press pause' THEN 'Bench Press'
        WHEN 'bench press paused' THEN 'Bench Press'
        WHEN 'clean' THEN 'Clean'
        WHEN 'cleans' THEN 'Clean'
        WHEN 'squat clean' THEN 'Clean'
        WHEN 'squat cleans' THEN 'Clean'
        WHEN 'clean and jerk' THEN 'Clean and Jerk'
        WHEN 'clean and jerks' THEN 'Clean and Jerk'
        WHEN 'clean jerk' THEN 'Clean and Jerk'
        WHEN 'c and j' THEN 'Clean and Jerk'
        WHEN 'c j' THEN 'Clean and Jerk'
        WHEN 'snatch' THEN 'Snatch'
        WHEN 'snatches' THEN 'Snatch'
        WHEN 'squat snatch' THEN 'Snatch'
        WHEN 'squat snatches' THEN 'Snatch'
        WHEN 'front squat' THEN 'Front Squat'
        WHEN 'front squats' THEN 'Front Squat'
        WHEN 'fs' THEN 'Front Squat'
        WHEN 'overhead squat' THEN 'Overhead Squat'
        WHEN 'overhead squats' THEN 'Overhead Squat'
        WHEN 'ohs' THEN 'Overhead Squat'
        WHEN 'jerk' THEN 'Jerk'
        WHEN 'jerks' THEN 'Jerk'
        WHEN 'split jerk' THEN 'Jerk'
        WHEN 'push jerk' THEN 'Jerk'
        WHEN 'power jerk' THEN 'Jerk'
        WHEN 'pj' THEN 'Jerk'
        WHEN 'sj' THEN 'Jerk'
        WHEN 'push press' THEN 'Push Press'
        WHEN 'push presses' THEN 'Push Press'
        WHEN 'pp' THEN 'Push Press'
        WHEN 'strict press' THEN 'Strict Press'
        WHEN 'strict presses' THEN 'Strict Press'
        WHEN 'barbell strict press' THEN 'Strict Press'
        WHEN 'strict overhead press' THEN 'Strict Press'
        WHEN 'military press' THEN 'Strict Press'
        WHEN 'power clean' THEN 'Power Clean'
        WHEN 'power cleans' THEN 'Power Clean'
        WHEN 'pc' THEN 'Power Clean'
        WHEN 'power clean and jerk' THEN 'Power Clean and Jerk'
        WHEN 'power clean and jerks' THEN 'Power Clean and Jerk'
        WHEN 'power clean jerk' THEN 'Power Clean and Jerk'
        WHEN 'power c and j' THEN 'Power Clean and Jerk'
        WHEN 'power c j' THEN 'Power Clean and Jerk'
        WHEN 'power snatch' THEN 'Power Snatch'
        WHEN 'power snatches' THEN 'Power Snatch'
        WHEN 'ps' THEN 'Power Snatch'
      END AS lift
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_blocks) = 'array' THEN p_blocks ELSE '[]'::jsonb END)
      WITH ORDINALITY AS b(block, ord)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(b.block->'segments') = 'array' THEN b.block->'segments' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS s(segment, ord)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(s.segment->'events') = 'array' THEN s.segment->'events' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(event, ord)
    WHERE jsonb_typeof(e.event->'performed') = 'object'
  ), collections AS (
    SELECT events.*,
      CASE
        WHEN jsonb_typeof(performed->'set_details') = 'array' AND performed->'set_details' <> '[]'::jsonb THEN 'set_details'
        WHEN jsonb_typeof(performed->'sets') = 'array' AND performed->'sets' <> '[]'::jsonb THEN 'sets'
      END AS collection
    FROM events
    WHERE lift IS NOT NULL
  ), sets AS (
    SELECT lift, event_path, amounts,
      event_path || '.performed' || CASE WHEN collection IS NOT NULL THEN format('.%s[%s]', collection, ord - 1) ELSE '' END AS set_path
    FROM collections
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN collection IS NULL THEN jsonb_build_array(performed) ELSE performed->collection END
    ) WITH ORDINALITY AS details(amounts, ord)
    WHERE jsonb_typeof(amounts) = 'object'
      AND (collection IS NOT NULL OR performed->'sets' IS DISTINCT FROM '0'::jsonb)
  ), stated AS (
    SELECT lift, amounts->'reps' AS reps,
      lower(btrim(amounts#>>'{load,unit}')) AS unit,
      CASE WHEN jsonb_typeof(amounts#>'{load,value}') = 'number' THEN (amounts#>>'{load,value}')::numeric END AS load,
      event_path, set_path
    FROM sets
    WHERE amounts->'reps' IN ('1'::jsonb, '3'::jsonb, '5'::jsonb)
  ), measured AS (
    SELECT lift, (reps::numeric)::integer::text || 'rm' AS record_type,
      round(load * CASE WHEN unit = 'kg' THEN 2.2046226218 ELSE 1 END, 2) AS pounds
    FROM stated
    WHERE unit IN ('lb', 'lbs', 'kg') AND load BETWEEN 0.00001 AND 99999999.99
      AND (p_fields IS NULL OR NOT EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
          event_path || '.movement_name', set_path || '.reps', set_path || '.load.value', set_path || '.load.unit'
        ]) AS leaf(path)
        CROSS JOIN LATERAL (SELECT coalesce(p_fields->leaf.path, p_fields->'quantities') AS source) AS proof
        WHERE proof.source->>'origin' IS DISTINCT FROM 'athlete_reported'
          OR coalesce(proof.source->>'reviewState', '') NOT IN ('athlete_confirmed', 'corrected')
      ))
  )
  SELECT lift, record_type, max(pounds)
  FROM measured
  WHERE pounds BETWEEN 0.01 AND 99999999.99
  GROUP BY lift, record_type;
$$;
REVOKE ALL ON FUNCTION public.capture_rep_max_candidates(JSONB, JSONB) FROM PUBLIC, anon, authenticated, service_role;

-- Keep the internal entry point for identifying affected keys and retain its existing ACL.
CREATE OR REPLACE FUNCTION public.capture_pr_candidates(p_blocks JSONB)
RETURNS TABLE(exercise TEXT, pr_type TEXT, value NUMERIC, rx TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.*, 'unknown'::text FROM public.capture_rep_max_candidates(p_blocks, NULL) AS c;
$$;

-- Use the same history calculation for forward recomputes and the one-time backfill.
-- Older workout statuses were backfilled as completed. Require reported, reviewed
-- quantities in addition to completed status so that status alone cannot prove a set.
CREATE OR REPLACE FUNCTION public.capture_rep_max_history(p_owner UUID, p_keys JSONB, p_omitted_workout UUID)
RETURNS TABLE(user_id UUID, workout_id UUID, achieved_at TIMESTAMPTZ, exercise TEXT, pr_type TEXT, value NUMERIC, previous_value NUMERIC)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH ranked AS (
    SELECT w.user_id, w.id, w.workout_date, c.exercise, c.pr_type, c.value,
      max(c.value) OVER (
        PARTITION BY w.user_id, c.exercise, c.pr_type
        ORDER BY w.workout_date, w.created_at, w.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS previous
    FROM public.workouts AS w
    CROSS JOIN LATERAL public.capture_rep_max_candidates(w.blocks, w.capture_provenance->'fields') AS c
    WHERE w.user_id IS NOT NULL
      AND (p_owner IS NULL OR w.user_id = p_owner)
      AND w.id IS DISTINCT FROM p_omitted_workout
      AND w.execution_status = 'completed'
      AND w.capture_provenance#>>'{fields,quantities,origin}' = 'athlete_reported'
      AND w.capture_provenance#>>'{fields,quantities,reviewState}' IN ('athlete_confirmed', 'corrected')
      AND (p_keys IS NULL OR p_keys ? (c.exercise || ':' || c.pr_type))
  )
  SELECT ranked.user_id, ranked.id, ranked.workout_date::timestamp AT TIME ZONE 'UTC',
    ranked.exercise, ranked.pr_type, ranked.value, ranked.previous
  FROM ranked
  WHERE ranked.previous IS NULL OR ranked.value > ranked.previous;
$$;
REVOKE ALL ON FUNCTION public.capture_rep_max_history(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.capture_refresh_rep_maxes(p_id UUID, p_old_blocks JSONB, p_deleted BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  owner UUID := auth.uid();
  keys JSONB;
  new_blocks JSONB;
BEGIN
  IF owner IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT blocks INTO new_blocks FROM public.workouts WHERE id = p_id AND user_id = owner;
  SELECT coalesce(jsonb_agg(DISTINCT (c.exercise || ':' || c.pr_type)), '[]') INTO keys
  FROM (
    SELECT exercise, pr_type FROM public.personal_records
    WHERE workout_id = p_id AND user_id = owner AND pr_type IN ('1rm', '3rm', '5rm')
    UNION ALL SELECT exercise, pr_type FROM public.capture_pr_candidates(p_old_blocks)
    UNION ALL SELECT exercise, pr_type FROM public.capture_pr_candidates(new_blocks)
  ) AS c;

  IF keys <> '[]'::jsonb THEN
    WITH history AS MATERIALIZED (
      SELECT h.*
      FROM public.capture_rep_max_history(owner, keys, CASE WHEN p_deleted THEN p_id END) AS h
    ), removed AS (
      DELETE FROM public.personal_records AS r
      WHERE r.user_id = owner AND r.workout_id IS NOT NULL
        AND keys ? (r.exercise || ':' || r.pr_type)
        AND NOT EXISTS (
          SELECT 1 FROM history AS h
          WHERE h.workout_id = r.workout_id AND h.exercise = r.exercise AND h.pr_type = r.pr_type
        )
    )
    INSERT INTO public.personal_records AS stored
      (user_id, workout_id, achieved_at, exercise, pr_type, value, previous_value)
    SELECT * FROM history
    ON CONFLICT (user_id, workout_id, exercise, pr_type) DO UPDATE
    SET achieved_at = EXCLUDED.achieved_at, value = EXCLUDED.value, previous_value = EXCLUDED.previous_value
    WHERE (stored.achieved_at, stored.value, stored.previous_value)
      IS DISTINCT FROM (EXCLUDED.achieved_at, EXCLUDED.value, EXCLUDED.previous_value);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_refresh_rep_maxes(UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.capture_refresh_prs(p_id UUID, p_old_blocks JSONB, p_deleted BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  names JSONB;
BEGIN
  PERFORM public.capture_refresh_rep_maxes(p_id, p_old_blocks, p_deleted);

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
END;
$$;

-- Keep the audited amendment writer and its role grants. A leaf eligibility
-- change can update rep maxes without changing block scores or benchmarks.
DO $$ BEGIN
 IF to_regprocedure('public.mutate_capture_activity(text,uuid,integer,text,jsonb,jsonb,jsonb,boolean,boolean)') IS NULL THEN
  RAISE EXCEPTION 'Existing capture correction engine is required; refusing to create a new executable function';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.mutate_capture_activity(p_kind TEXT,p_entity_id UUID,p_expected_revision INTEGER,p_request_id TEXT,p_record JSONB,p_blocks JSONB,p_provenance JSONB,p_execution BOOLEAN,p_delete BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload JSONB; op public.activity_mutations; prior JSONB; r JSONB; b JSONB; t TIMESTAMPTZ:=now(); v INTEGER; out_receipt JSONB; event_time TIMESTAMPTZ; execution JSONB; projection_changed BOOLEAN:=true; rep_max_changed BOOLEAN:=false; old_facts JSONB; new_facts JSONB; facts JSONB; pass INTEGER; bi INTEGER; si INTEGER; ei INTEGER; idx INTEGER; coll TEXT; bp TEXT[]; ep TEXT[];
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
 -- Derive the decision under the existing owner/revision lock, from stored and
 -- validated canonical facts. Never trust caller p_blocks as a skip signal.
 -- Velocity and readiness are recorded context, unused by current score/PR helpers.
 -- Everything else stays conservatively significant, including unknown metadata.
 IF p_kind='workout' THEN
  FOR pass IN 1..2 LOOP
   facts:=CASE WHEN pass=1 THEN prior->'blocks' ELSE r->'blocks' END;
   IF jsonb_typeof(facts)='array' AND jsonb_array_length(facts)>0 THEN
    FOR bi IN 0..jsonb_array_length(facts)-1 LOOP
     facts:=facts #- ARRAY[bi::text,'session_readiness'];
     bp:=ARRAY[bi::text,'segments'];
     IF jsonb_typeof(facts#>bp)='array' AND jsonb_array_length(facts#>bp)>0 THEN
      FOR si IN 0..jsonb_array_length(facts#>bp)-1 LOOP
       ep:=bp||ARRAY[si::text,'events'];
       IF jsonb_typeof(facts#>ep)='array' AND jsonb_array_length(facts#>ep)>0 THEN
        FOR ei IN 0..jsonb_array_length(facts#>ep)-1 LOOP
         FOREACH coll IN ARRAY ARRAY['sets','set_details'] LOOP
          IF jsonb_typeof(facts#>(ep||ARRAY[ei::text,'performed',coll]))='array' AND jsonb_array_length(facts#>(ep||ARRAY[ei::text,'performed',coll]))>0 THEN
           FOR idx IN 0..jsonb_array_length(facts#>(ep||ARRAY[ei::text,'performed',coll]))-1 LOOP
            facts:=facts #- (ep||ARRAY[ei::text,'performed',coll,idx::text,'velocity']);
           END LOOP;
          END IF;
         END LOOP;
        END LOOP;
       END IF;
      END LOOP;
     END IF;
    END LOOP;
   END IF;
   IF pass=1 THEN old_facts:=facts; ELSE new_facts:=facts; END IF;
  END LOOP;
  projection_changed:=old_facts IS DISTINCT FROM new_facts
   OR prior->'workout_date' IS DISTINCT FROM r->'workout_date'
   OR prior#>'{capture_provenance,fields,quantities,origin}' IS DISTINCT FROM p_provenance#>'{fields,quantities,origin}'
   OR prior#>'{capture_provenance,fields,quantities,reviewState}' IS DISTINCT FROM p_provenance#>'{fields,quantities,reviewState}';
  IF NOT projection_changed
    AND prior->>'execution_status' = 'completed'
    AND prior#>'{capture_provenance,fields}' IS DISTINCT FROM p_provenance->'fields'
    AND p_provenance#>>'{fields,quantities,origin}' = 'athlete_reported'
    AND p_provenance#>>'{fields,quantities,reviewState}' IN ('athlete_confirmed', 'corrected')
  THEN
   SELECT EXISTS (
     SELECT 1
     FROM public.capture_rep_max_candidates(prior->'blocks', prior#>'{capture_provenance,fields}') AS old_sets
     FULL JOIN public.capture_rep_max_candidates(r->'blocks', p_provenance->'fields') AS new_sets USING (exercise, pr_type)
     WHERE old_sets.value IS DISTINCT FROM new_sets.value
   ) INTO rep_max_changed;
  END IF;
 END IF;
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
 tags=ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'tags','[]'))),notes=r->>'notes',rpe=CASE WHEN jsonb_typeof(r->'rpe')='number' THEN (r->>'rpe')::numeric END,
 parse_confidence=(r->>'parse_confidence')::numeric,capture_provenance=p_provenance WHERE id=p_entity_id;
 IF projection_changed THEN
 DELETE FROM public.block_scores WHERE workout_id=p_entity_id AND user_id=auth.uid();
 FOR b IN SELECT value FROM jsonb_array_elements(public.capture_block_projections(r->'blocks')) LOOP
 INSERT INTO public.block_scores(workout_id,user_id,block_type,block_title,rounds_completed,extra_reps,time_s,total_reps,tonnage_lb,rx_status,is_pr)
 VALUES(p_entity_id,auth.uid(),b->>'block_type',b->>'block_title',(b->>'rounds_completed')::integer,(b->>'extra_reps')::integer,(b->>'time_s')::integer,(b->>'total_reps')::integer,(b->>'tonnage_lb')::numeric,b->>'rx_status',false);
 END LOOP;
 END IF;
 END IF;
 -- Old PR assertions are no longer current after an execution correction. Never retain a stale score.
 IF p_delete OR projection_changed THEN
  PERFORM public.capture_refresh_prs(p_entity_id,prior->'blocks',p_delete);
 ELSIF rep_max_changed THEN
  PERFORM public.capture_refresh_rep_maxes(p_entity_id,prior->'blocks',false);
 END IF;
 UPDATE public.workouts SET capture_revision=v+1,captured_at=t WHERE id=p_entity_id;
 END IF;
 PERFORM public.capture_snapshot(p_kind,p_entity_id,op.id,p_delete,execution,r,event_time,CASE WHEN p_kind='workout' AND (p_delete OR p_record->>'workout_date'=prior->>'workout_date') THEN coalesce((SELECT event_precision FROM public.activity_revisions WHERE user_id=auth.uid() AND original_entity_id=p_entity_id AND revision=v),'date') WHEN p_kind='workout' THEN 'date' ELSE 'timestamp' END);
 out_receipt:=jsonb_build_object('schemaVersion',2,'userId',auth.uid(),'requestId',op.id,'requestKey',p_request_id,'operationId',op.id,'entityKind',p_kind,'entityId',p_entity_id,'revision',v+1,'eventAt',coalesce(event_time,CASE WHEN p_kind='meal' THEN (prior->>'meal_timestamp')::timestamptz ELSE (prior->>'workout_date')::date::timestamptz END),'capturedAt',t,'inputMethod',prior->>'capture_input_method','state','saved','provenance',coalesce(p_provenance,prior->'capture_provenance'),'recommendationId',prior->'capture_recommendation_id','deleted',p_delete,'projectionsStatus',CASE WHEN p_kind='workout' AND NOT p_delete AND NOT projection_changed AND NOT rep_max_changed THEN 'preserved_unchanged_inputs' WHEN p_kind='workout' THEN 'recomputed_supported_only' ELSE 'recomputed' END,'eventPrecision',CASE WHEN p_kind='workout' THEN coalesce((SELECT event_precision FROM public.activity_revisions WHERE user_id=auth.uid() AND original_entity_id=p_entity_id AND revision=v+1),'date') ELSE 'timestamp' END);
 IF p_delete THEN
 IF p_kind='meal' THEN DELETE FROM public.meals WHERE id=p_entity_id AND user_id=auth.uid(); ELSE DELETE FROM public.workouts WHERE id=p_entity_id AND user_id=auth.uid(); END IF;
 END IF;
 IF p_kind='workout' AND out_receipt->>'eventPrecision'='date' THEN out_receipt:=jsonb_set(out_receipt,'{eventAt}',to_jsonb(coalesce(p_record->>'workout_date',prior->>'workout_date'))); END IF;
 UPDATE public.activity_mutations SET receipt=out_receipt WHERE id=op.id;
 RETURN out_receipt;
END $$;

INSERT INTO public.personal_records (user_id, workout_id, achieved_at, exercise, pr_type, value, previous_value)
SELECT h.* FROM public.capture_rep_max_history(NULL, NULL, NULL) AS h
ON CONFLICT (user_id, workout_id, exercise, pr_type) DO NOTHING;

COMMIT;
