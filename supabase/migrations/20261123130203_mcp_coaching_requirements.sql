-- Owner-confirmed coaching declarations and retry receipts. Accepted programming is separate.
BEGIN;

CREATE TABLE public.coach_mcp_requirement_receipts (
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  memory_id uuid NOT NULL UNIQUE,
  PRIMARY KEY (user_id, request_id),
  FOREIGN KEY (memory_id, user_id) REFERENCES public.coach_memories(id, user_id) ON DELETE CASCADE
);

ALTER TABLE public.coach_mcp_requirement_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_mcp_requirement_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_mcp_requirement_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.valid_mcp_coaching_requirement(p_key text, p_content jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  ids jsonb;
  allowed_ids jsonb;
BEGIN
  IF jsonb_typeof(p_content) IS DISTINCT FROM 'object' OR octet_length(p_content::text) > 10000 THEN
    RETURN false;
  END IF;

  CASE p_key
    WHEN 'training_intent' THEN
      RETURN public.valid_training_intent(p_content);
    WHEN 'exercise_preferences' THEN
      RETURN public.valid_exercise_preferences(p_content);
    WHEN 'available_equipment' THEN
      IF p_content ? 'schemaVersion' THEN
        RETURN public.valid_reviewed_setup_memory(p_key, p_content);
      END IF;
      IF p_content - ARRAY['equipment', 'resolvedEquipmentIds'] <> '{}'::jsonb
        OR jsonb_typeof(p_content->'equipment') IS DISTINCT FROM 'string'
        OR length(btrim(p_content->>'equipment')) = 0 OR length(p_content->>'equipment') > 4000
        OR jsonb_typeof(p_content->'resolvedEquipmentIds') IS DISTINCT FROM 'array' THEN
        RETURN false;
      END IF;
      ids := p_content->'resolvedEquipmentIds';
      allowed_ids := (public.training_intent_catalog()->'equipment') || '["trap_bar_high_handles"]'::jsonb;
    WHEN 'training_constraints' THEN
      IF p_content - ARRAY['constraints', 'constraintKinds'] <> '{}'::jsonb
        OR jsonb_typeof(p_content->'constraints') IS DISTINCT FROM 'string'
        OR length(p_content->>'constraints') > 4000
        OR jsonb_typeof(p_content->'constraintKinds') IS DISTINCT FROM 'array' THEN
        RETURN false;
      END IF;
      ids := p_content->'constraintKinds';
      IF jsonb_array_length(ids) > 0 AND btrim(p_content->>'constraints') = '' THEN
        RETURN false;
      END IF;
      allowed_ids := '["no_overhead", "no_running"]'::jsonb;
    ELSE
      RETURN false;
  END CASE;

  RETURN jsonb_array_length(ids) <= jsonb_array_length(allowed_ids)
    AND ids <@ allowed_ids
    AND (SELECT count(DISTINCT item) FROM jsonb_array_elements(ids) AS elements(item)) = jsonb_array_length(ids);
END;
$$;
REVOKE ALL ON FUNCTION public.valid_mcp_coaching_requirement(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_mcp_coaching_requirement(
  p_request_id uuid,
  p_memory_key text,
  p_expected jsonb,
  p_content jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  expected jsonb := coalesce(p_expected, 'null'::jsonb);
  actual jsonb;
  latest public.coach_memories%ROWTYPE;
  saved public.coach_memories%ROWTYPE;
  receipt public.coach_mcp_requirement_receipts%ROWTYPE;
  fingerprint bytea;
  key_kind text;
  idempotency_key text;
  paused boolean;
  saved_id uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  key_kind := CASE p_memory_key
    WHEN 'training_intent' THEN 'goal'
    WHEN 'available_equipment' THEN 'equipment'
    WHEN 'training_constraints' THEN 'constraint'
    WHEN 'exercise_preferences' THEN 'preference'
  END;
  IF p_request_id IS NULL OR key_kind IS NULL OR jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR octet_length(p_content::text) > 10000 THEN
    RAISE EXCEPTION 'Invalid coaching requirement request' USING ERRCODE = '22023';
  END IF;
  IF expected <> 'null'::jsonb THEN
    IF jsonb_typeof(expected) IS DISTINCT FROM 'object'
      OR expected - ARRAY['id', 'version', 'status'] <> '{}'::jsonb
      OR jsonb_typeof(expected->'id') IS DISTINCT FROM 'string'
      OR expected->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(expected->'version') IS DISTINCT FROM 'number'
      OR jsonb_typeof(expected->'status') IS DISTINCT FROM 'string'
      OR expected->>'status' NOT IN ('confirmed', 'withdrawn', 'superseded') THEN
      RAISE EXCEPTION 'Invalid expected coaching requirement' USING ERRCODE = '22023';
    END IF;
    IF (expected->>'version')::numeric NOT BETWEEN 1 AND 2147483647
      OR mod((expected->>'version')::numeric, 1) <> 0 THEN
      RAISE EXCEPTION 'Invalid expected coaching requirement version' USING ERRCODE = '22023';
    END IF;
  END IF;

  fingerprint := sha256(convert_to(jsonb_build_array(p_memory_key, expected, p_content)::text, 'UTF8'));
  idempotency_key := 'mcp-coaching-requirement:' || p_request_id::text;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(actor::text || ':' || idempotency_key, 0)) THEN
    RAISE EXCEPTION 'Coaching requirement request is busy' USING ERRCODE = '55P03';
  END IF;
  SELECT * INTO receipt FROM public.coach_mcp_requirement_receipts
    WHERE user_id = actor AND request_id = p_request_id;

  IF FOUND THEN
    IF receipt.request_hash <> fingerprint THEN
      RAISE EXCEPTION 'Coaching requirement request identity differs' USING ERRCODE = '22023';
    END IF;
    saved_id := receipt.memory_id;
  ELSE
    IF public.valid_mcp_coaching_requirement(p_memory_key, p_content) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Invalid coaching requirement content' USING ERRCODE = '22023';
    END IF;
    SELECT c.paused INTO paused FROM public.coaching_write_control c WHERE c.singleton FOR SHARE NOWAIT;
    IF paused IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Coaching writes are temporarily paused' USING ERRCODE = 'PT503';
    END IF;
    -- Share the canonical writer lock. Ordinary correction can lock the old row first.
    IF NOT pg_try_advisory_xact_lock(hashtextextended(actor::text || ':' || p_memory_key, 0)) THEN
      RAISE EXCEPTION 'Coaching requirement is busy' USING ERRCODE = '55P03';
    END IF;
    SELECT * INTO latest FROM public.coach_memories
      WHERE user_id = actor AND memory_key = p_memory_key
      ORDER BY version DESC LIMIT 1 FOR UPDATE NOWAIT;
    actual := CASE WHEN latest.id IS NULL THEN 'null'::jsonb ELSE
      jsonb_build_object('id', latest.id, 'version', latest.version, 'status', latest.status) END;
    IF expected IS DISTINCT FROM actual THEN
      RAISE EXCEPTION 'Coaching requirement changed; review the current version' USING ERRCODE = '40001';
    END IF;
    IF latest.id IS NOT NULL AND latest.kind <> key_kind THEN
      RAISE EXCEPTION 'Saved coaching requirement has an unexpected kind' USING ERRCODE = '40001';
    END IF;
    -- Legacy rolling plans cannot consume reviewed equipment declarations. Preserve the existing format.
    IF p_memory_key = 'available_equipment' AND (p_content ? 'schemaVersion')
      IS DISTINCT FROM coalesce(latest.content ? 'schemaVersion', false) THEN
      RAISE EXCEPTION 'Coaching equipment update must preserve the saved format' USING ERRCODE = '22023';
    END IF;

    IF p_memory_key = 'training_intent' AND latest.status = 'confirmed' THEN
      SELECT r.memory_id INTO saved_id FROM public.confirm_training_intent(p_content, idempotency_key, latest.id) r;
    ELSIF latest.status = 'confirmed' THEN
      SELECT r.replacement_memory_id INTO saved_id FROM public.correct_coach_memory_with_review(
        latest.id, p_content, idempotency_key) r;
    ELSE
      -- The canonical training-intent insert trigger validates baseline ownership and stamps confirmation time.
      SELECT r.memory_id INTO saved_id FROM public.confirm_coach_memory(p_memory_key, key_kind, p_content,
        jsonb_build_object('source', 'mcp_coaching_context', 'confirmedBy', 'athlete'), 1, idempotency_key) r;
    END IF;

  END IF;

  -- Use the saved version, even if a later version has superseded it.
  SELECT * INTO saved FROM public.coach_memories WHERE id = saved_id AND user_id = actor AND memory_key = p_memory_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saved coaching requirement could not be verified' USING ERRCODE = '55000';
  END IF;
  IF receipt.request_id IS NULL THEN
    IF saved.kind <> key_kind OR saved.status <> 'confirmed' OR saved.version::bigint <> coalesce(latest.version, 0)::bigint + 1
      OR (p_memory_key <> 'training_intent' AND saved.content <> p_content) THEN
      RAISE EXCEPTION 'Coaching requirement save could not be verified' USING ERRCODE = '55000';
    END IF;
    INSERT INTO public.coach_mcp_requirement_receipts (user_id, request_id, request_hash, memory_id)
      VALUES (actor, p_request_id, fingerprint, saved_id);
  END IF;
  RETURN jsonb_build_object('requestId', p_request_id, 'userId', actor, 'key', saved.memory_key,
    'id', saved.id, 'version', saved.version, 'content', saved.content,
    'confirmedAt', to_char(saved.confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'provenance', saved.provenance);
END;
$$;

REVOKE ALL ON FUNCTION public.save_mcp_coaching_requirement(uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_mcp_coaching_requirement(uuid, text, jsonb, jsonb) TO authenticated;

COMMIT;
