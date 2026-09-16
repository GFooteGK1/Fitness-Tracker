-- Additive contract; existing memories and accepted plans are unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.valid_exercise_preferences(p_content JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE entry JSONB; target JSONB; entry_key TEXT; seen TEXT[] := '{}';
BEGIN
  IF jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR (p_content - ARRAY['schemaVersion','state','entries']::TEXT[]) <> '{}'::JSONB
    OR p_content->'schemaVersion' IS DISTINCT FROM '1'::JSONB
    OR p_content->>'state' IS NULL OR p_content->>'state' NOT IN ('none','specified')
    OR jsonb_typeof(p_content->'entries') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
  IF jsonb_array_length(p_content->'entries') > 12
    OR (p_content->>'state' = 'none' AND jsonb_array_length(p_content->'entries') <> 0)
    OR (p_content->>'state' = 'specified' AND jsonb_array_length(p_content->'entries') = 0) THEN RETURN FALSE; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_content->'entries') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
      OR (entry - ARRAY['athleteWording','target']::TEXT[]) <> '{}'::JSONB
      OR jsonb_typeof(entry->'athleteWording') IS DISTINCT FROM 'string'
      OR length(btrim(entry->>'athleteWording')) < 1 OR length(entry->>'athleteWording') > 160
      OR jsonb_typeof(entry->'target') IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
    target := entry->'target';
    IF (target - ARRAY['kind','id']::TEXT[]) <> '{}'::JSONB
      OR target->>'kind' IS NULL OR target->>'kind' NOT IN ('movement','interest','unresolved') THEN RETURN FALSE; END IF;
    IF target->>'kind' = 'unresolved' THEN
      IF target ? 'id' THEN RETURN FALSE; END IF;
    ELSIF jsonb_typeof(target->'id') IS DISTINCT FROM 'string'
      OR (target->>'id') !~ '^[a-z0-9_]{1,160}$' THEN RETURN FALSE;
    END IF;
    entry_key := (target->>'kind') || ':' || COALESCE(target->>'id', lower(btrim(entry->>'athleteWording')));
    IF entry_key = ANY(seen) THEN RETURN FALSE; END IF;
    seen := array_append(seen, entry_key);
  END LOOP;
  RETURN TRUE;
END;
$$;

-- Enforce shape for intake and correction, including direct authenticated RPC calls.
CREATE OR REPLACE FUNCTION public.enforce_exercise_preference_content()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.memory_key = 'exercise_preferences' AND (
    NEW.kind <> 'preference' OR NOT public.valid_exercise_preferences(NEW.content)
  ) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid exercise preference snapshot'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER coach_exercise_preference_content
BEFORE INSERT OR UPDATE OF content, memory_key, kind ON public.coach_memories
FOR EACH ROW EXECUTE FUNCTION public.enforce_exercise_preference_content();

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
    OR v_previous.memory_key NOT IN (
      'primary_goal', 'training_schedule', 'available_equipment', 'training_constraints', 'exercise_preferences'
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

REVOKE ALL ON FUNCTION public.valid_exercise_preferences(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_exercise_preferences(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.enforce_exercise_preference_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.correct_coach_memory_with_review(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_coach_memory_with_review(UUID, JSONB, TEXT) TO authenticated;
COMMIT;
