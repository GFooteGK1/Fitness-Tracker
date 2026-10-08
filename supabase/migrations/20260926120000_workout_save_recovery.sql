BEGIN;

-- Retain view OIDs, ACLs, owners, options and dependent function return types.
-- All replacements are invisible outside this transaction. Unknown dependencies abort.
DO $migration$
DECLARE v RECORD; definitions JSONB := '[]'; definition JSONB; projection TEXT; options TEXT;
BEGIN
  FOR v IN
    SELECT DISTINCT c.oid, n.nspname, c.relname, c.relkind, c.reloptions
    FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid
    JOIN pg_class c ON c.oid=rw.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE d.classid='pg_rewrite'::regclass AND d.refobjid='public.workouts'::regclass
      AND d.refobjsubid=(SELECT attnum FROM pg_attribute WHERE attrelid='public.workouts'::regclass AND attname='rpe')
  LOOP
    IF v.nspname<>'public' OR v.relkind<>'v' OR v.relname NOT IN ('agent_daily_workout_context','daily_fitness_summary') THEN
      RAISE EXCEPTION 'Unreviewed RPE view dependency: %.%',v.nspname,v.relname;
    END IF;
    SELECT coalesce(' WITH ('||string_agg(format('%I=%L',split_part(option,'=',1),split_part(option,'=',2)),', ')||')','')
      INTO options FROM unnest(v.reloptions) option;
    definitions:=definitions||jsonb_build_array(jsonb_build_object('name',v.relname,'sql',pg_get_viewdef(v.oid,true),'options',options));
    SELECT string_agg(format('NULL::%s AS %I',format_type(atttypid,atttypmod),attname),', ' ORDER BY attnum)
      INTO projection FROM pg_attribute WHERE attrelid=v.oid AND attnum>0 AND NOT attisdropped;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I%s AS SELECT %s WHERE false',v.relname,options,projection);
  END LOOP;
  ALTER TABLE public.workouts ALTER COLUMN rpe TYPE NUMERIC USING rpe::numeric;
  FOR definition IN SELECT value FROM jsonb_array_elements(definitions) LOOP
    EXECUTE format('CREATE OR REPLACE VIEW public.%I%s AS %s',definition->>'name',definition->>'options',definition->>'sql');
  END LOOP;
END $migration$;

-- Replace the installed legacy writer without bypassing the capture wrapper.
-- The fallback supports databases upgrading directly from the original logging migration.
DO $migration$
DECLARE definition TEXT := $writer$
CREATE OR REPLACE FUNCTION public.save_logged_activity(
  p_kind TEXT, p_record JSONB, p_blocks JSONB DEFAULT '[]', p_request_id UUID DEFAULT NULL,
  p_response JSONB DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id UUID; v_user UUID := auth.uid(); b JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NOT NULL THEN
    PERFORM 1 FROM public.logging_requests WHERE id = p_request_id AND user_id = v_user
      AND status = 'processing' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request is not processing' USING ERRCODE = '55000'; END IF;
  END IF;
  IF p_kind = 'workout' THEN
    IF jsonb_typeof(p_record->'blocks') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_record->'blocks') NOT BETWEEN 1 AND 100
      OR jsonb_typeof(p_blocks) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_blocks) <> jsonb_array_length(p_record->'blocks') THEN
      RAISE EXCEPTION 'Invalid workout blocks' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.workouts(user_id, workout_date, input_text, blocks, primary_score, tags, rpe, parse_confidence, notes)
    VALUES(v_user, (p_record->>'workout_date')::DATE, coalesce(p_record->>'input_text',''),
      p_record->'blocks', p_record->>'primary_score',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_record->'tags','[]'))),
      (p_record->>'rpe')::NUMERIC, (p_record->>'parse_confidence')::NUMERIC, p_record->>'notes') RETURNING id INTO v_id;
    FOR b IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
      INSERT INTO public.block_scores(workout_id, user_id, block_type, block_title, rounds_completed,
        extra_reps, time_s, total_reps, tonnage_lb, rx_status, is_pr)
      VALUES(v_id, v_user, b->>'block_type', b->>'block_title', (b->>'rounds_completed')::INTEGER,
        (b->>'extra_reps')::INTEGER, (b->>'time_s')::INTEGER, (b->>'total_reps')::INTEGER,
        (b->>'tonnage_lb')::NUMERIC, b->>'rx_status', coalesce((b->>'is_pr')::BOOLEAN,false));
    END LOOP;
  ELSIF p_kind = 'meal' THEN
    IF jsonb_typeof(p_record->'items') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_record->'items') NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Invalid meal items' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.meals(user_id, meal_timestamp, photo_url, meal_timing, items,
      total_protein, total_carbs, total_fat, total_calories, needs_review, ai_confidence, input_text)
    VALUES(v_user, (p_record->>'meal_timestamp')::TIMESTAMPTZ, NULL,
      p_record->>'meal_timing', p_record->'items',
      (p_record->>'total_protein')::NUMERIC, (p_record->>'total_carbs')::NUMERIC,
      (p_record->>'total_fat')::NUMERIC, (p_record->>'total_calories')::NUMERIC,
      coalesce((p_record->>'needs_review')::BOOLEAN,true),
      (p_record->>'ai_confidence')::NUMERIC, p_record->>'input_text') RETURNING id INTO v_id;
  ELSE RAISE EXCEPTION 'Unknown activity kind' USING ERRCODE = '22023';
  END IF;
  IF p_request_id IS NOT NULL THEN
    UPDATE public.logging_requests SET entities = entities || jsonb_build_array(jsonb_build_object('kind',p_kind,'id',v_id))
      WHERE id = p_request_id AND user_id = v_user;
    -- Photo analysis + meal + original response commit together.
    IF p_response IS NOT NULL THEN
      PERFORM public.finish_logging_request(p_request_id, p_response || jsonb_build_object('mealId',v_id), 200);
    END IF;
  END IF;
  RETURN v_id;
END $$;

$writer$;
BEGIN
  IF to_regprocedure('public.save_logged_activity_legacy_capture(text,jsonb,jsonb,uuid,jsonb)') IS NOT NULL THEN
    definition:=replace(definition,'FUNCTION public.save_logged_activity(','FUNCTION public.save_logged_activity_legacy_capture(');
  END IF;
  EXECUTE definition;
END $migration$;

-- Capture's canonical projection can now retain fractional effort too. Keep exact
-- reported_rpe in immutable snapshots, including existing zero-effort semantics.
DO $migration$
DECLARE f RECORD; definition TEXT; previous TEXT; replacement TEXT;
BEGIN
  FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('capture_normalized_record','mutate_capture_activity') LOOP
    definition:=pg_get_functiondef(f.oid);
    IF f.proname='capture_normalized_record' THEN
      previous:='(r->>''rpe'')::numeric<1 OR (r->>''rpe'')::numeric<>trunc((r->>''rpe'')::numeric)';
      replacement:='(r->>''rpe'')::numeric<1';
    ELSE
      previous:='jsonb_typeof(r->''rpe'')=''number'' AND (r->>''rpe'')::numeric=trunc((r->>''rpe'')::numeric) THEN (r->>''rpe'')::integer';
      replacement:='jsonb_typeof(r->''rpe'')=''number'' THEN (r->>''rpe'')::numeric';
    END IF;
    IF position(previous IN definition)>0 THEN
      EXECUTE replace(definition,previous,replacement);
    ELSIF position(replacement IN definition)=0 THEN
      RAISE EXCEPTION 'Unreviewed effort writer definition: %',f.proname;
    END IF;
  END LOOP;
END $migration$;

-- Proof only: never reopen/delete a request or rewrite its historical response.
-- Terminal state prevents a late legacy RPC from saving under the released key.
CREATE OR REPLACE FUNCTION public.confirm_failed_workout_request(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.logging_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
  SELECT * INTO r FROM public.logging_requests WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown logging request' USING ERRCODE='42501'; END IF;
  IF r.request_key NOT LIKE 'workout-text:%' OR r.status<>'complete' OR r.http_status IS DISTINCT FROM 500
    OR r.entities IS DISTINCT FROM '[]'::jsonb OR r.frozen_items IS NOT NULL
    OR r.response->>'error' IS DISTINCT FROM 'Failed to parse workout'
    OR r.response->>'details' IS DISTINCT FROM 'Unable to save the complete activity. Check history before retrying.'
    OR EXISTS(SELECT 1 FROM public.logging_request_items WHERE request_id=r.id)
    OR EXISTS(SELECT 1 FROM public.activity_mutations WHERE user_id=auth.uid()
      AND (request_key=r.id::text OR request_key LIKE r.id::text||':%')) THEN
    RETURN jsonb_build_object('retryAllowed',false);
  END IF;
  RETURN jsonb_build_object('retryAllowed',true);
END $$;
REVOKE ALL ON FUNCTION public.confirm_failed_workout_request(UUID) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.confirm_failed_workout_request(UUID) TO authenticated;
COMMIT;
