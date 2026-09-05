BEGIN;

CREATE TABLE IF NOT EXISTS public.logging_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 8 AND 200),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'complete')),
  response JSONB,
  http_status INTEGER,
  entities JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_key)
);
ALTER TABLE public.logging_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logging_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS logging_requests_owner ON public.logging_requests;
CREATE POLICY logging_requests_owner ON public.logging_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.logging_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.logging_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.begin_logging_request(p_key TEXT, p_fingerprint TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.logging_requests; inserted_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.logging_requests(user_id, request_key, fingerprint)
    VALUES(auth.uid(), p_key, p_fingerprint)
    ON CONFLICT(user_id, request_key) DO NOTHING RETURNING id INTO inserted_id;
  SELECT * INTO STRICT r FROM public.logging_requests
    WHERE user_id = auth.uid() AND request_key = p_key;
  IF r.fingerprint <> p_fingerprint THEN
    RAISE EXCEPTION 'Request key reused for different input' USING ERRCODE = '22023';
  END IF;
  RETURN to_jsonb(r) || jsonb_build_object('claimed', inserted_id IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.finish_logging_request(p_id UUID, p_response JSONB, p_status INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_response JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_status NOT BETWEEN 200 AND 599 OR p_response IS NULL THEN
    RAISE EXCEPTION 'Invalid response' USING ERRCODE = '22023';
  END IF;
  UPDATE public.logging_requests SET status = 'complete',
    response = (p_response - 'retrySafe') || jsonb_build_object('requestStatus','complete', 'savedEntities', entities, 'retryAllowed', p_status >= 400 AND coalesce(p_response->>'retrySafe' = 'true', false) AND jsonb_array_length(entities) = 0),
    http_status = p_status
    WHERE id = p_id AND user_id = auth.uid() AND status = 'processing' RETURNING response INTO v_response;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request is not processing' USING ERRCODE = '55000'; END IF;
  RETURN v_response;
END $$;

-- One transaction owns the canonical record, block scores and saved-entity receipt.
-- The outer request is never automatically restarted after an uncertain result.
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
      (p_record->>'rpe')::INTEGER, (p_record->>'parse_confidence')::NUMERIC, p_record->>'notes') RETURNING id INTO v_id;
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

REVOKE ALL ON FUNCTION public.begin_logging_request(TEXT,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_logging_request(UUID,JSONB,INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_logged_activity(TEXT,JSONB,JSONB,UUID,JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_logging_request(TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_logging_request(UUID,JSONB,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_logged_activity(TEXT,JSONB,JSONB,UUID,JSONB) TO authenticated;
COMMIT;
