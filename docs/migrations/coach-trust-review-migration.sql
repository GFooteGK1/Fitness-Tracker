BEGIN;

-- Athlete-facing trust and review transitions.
-- Apply after:
--   1. coach-system-migration.sql
--   2. layered-adaptive-evidence-migration.sql
--   3. qwik-vbt-import-migration.sql

CREATE UNIQUE INDEX IF NOT EXISTS adaptation_proposals_id_user_unique
  ON public.adaptation_proposals(id, user_id);

CREATE TABLE IF NOT EXISTS public.coach_memory_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL,
  replacement_memory_id UUID,
  action TEXT NOT NULL CHECK (action IN ('reaffirmed', 'corrected', 'withdrawn')),
  reason TEXT CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (id, user_id),
  CONSTRAINT coach_memory_review_events_memory_owner_fk
    FOREIGN KEY (memory_id, user_id) REFERENCES public.coach_memories(id, user_id),
  CONSTRAINT coach_memory_review_events_replacement_owner_fk
    FOREIGN KEY (replacement_memory_id, user_id) REFERENCES public.coach_memories(id, user_id),
  CONSTRAINT coach_memory_review_events_action_shape CHECK (
    (action = 'corrected' AND replacement_memory_id IS NOT NULL)
    OR (action <> 'corrected' AND replacement_memory_id IS NULL)
  ),
  CONSTRAINT coach_memory_review_events_reason_shape CHECK (
    (action = 'withdrawn' AND reason IS NOT NULL)
    OR action <> 'withdrawn'
  )
);

CREATE INDEX IF NOT EXISTS idx_coach_memory_review_events_memory
  ON public.coach_memory_review_events(user_id, memory_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.measurement_import_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('confirmed', 'rejected')),
  reason TEXT CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
  mapping_summary JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(mapping_summary) = 'array' AND octet_length(mapping_summary::TEXT) <= 200000),
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (id, user_id),
  CONSTRAINT measurement_import_review_events_import_owner_fk
    FOREIGN KEY (import_id, user_id) REFERENCES public.measurement_imports(id, user_id),
  CONSTRAINT measurement_import_review_events_reason_shape CHECK (
    (action = 'rejected' AND reason IS NOT NULL)
    OR (action = 'confirmed' AND reason IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_measurement_import_review_events_import
  ON public.measurement_import_review_events(user_id, import_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.adaptation_proposal_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action = 'rejected'),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (id, user_id),
  CONSTRAINT adaptation_proposal_review_events_proposal_owner_fk
    FOREIGN KEY (proposal_id, user_id) REFERENCES public.adaptation_proposals(id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_adaptation_proposal_review_events_proposal
  ON public.adaptation_proposal_review_events(user_id, proposal_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.review_coach_memory(
  p_memory_id UUID,
  p_action TEXT,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  event_id UUID,
  memory_id UUID,
  memory_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_memory public.coach_memories%ROWTYPE;
  v_event public.coach_memory_review_events%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF p_action NOT IN ('reaffirmed', 'withdrawn')
    OR p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR (p_action = 'withdrawn' AND (p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500))
    OR (p_reason IS NOT NULL AND length(btrim(p_reason)) NOT BETWEEN 3 AND 500) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Memory review request is invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':memory-review:' || btrim(p_idempotency_key), 0)
  );
  SELECT * INTO v_event
  FROM public.coach_memory_review_events
  WHERE user_id = v_user_id AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.memory_id IS DISTINCT FROM p_memory_id OR v_event.action IS DISTINCT FROM p_action THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Memory review key was used for another request';
    END IF;
    SELECT * INTO v_memory FROM public.coach_memories
    WHERE id = p_memory_id AND user_id = v_user_id;
    RETURN QUERY SELECT v_event.id, v_memory.id, v_memory.status;
    RETURN;
  END IF;

  SELECT * INTO v_memory
  FROM public.coach_memories
  WHERE id = p_memory_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Coach memory not found';
  END IF;
  IF v_memory.status <> 'confirmed' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Coach memory is no longer current';
  END IF;

  IF p_action = 'reaffirmed' THEN
    UPDATE public.coach_memories
    SET last_reviewed_at = v_now,
        review_after = v_now + INTERVAL '90 days'
    WHERE id = v_memory.id;
  ELSE
    UPDATE public.coach_memories
    SET status = 'withdrawn',
        effective_until = v_now,
        last_reviewed_at = v_now,
        review_after = NULL
    WHERE id = v_memory.id;
  END IF;

  INSERT INTO public.coach_memory_review_events (
    user_id, memory_id, action, reason, idempotency_key
  ) VALUES (
    v_user_id, v_memory.id, p_action, NULLIF(btrim(p_reason), ''), btrim(p_idempotency_key)
  ) RETURNING * INTO v_event;

  RETURN QUERY SELECT v_event.id, v_memory.id,
    CASE WHEN p_action = 'reaffirmed' THEN 'confirmed'::TEXT ELSE 'withdrawn'::TEXT END;
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
    )) OR v_previous.memory_key NOT IN (
      'primary_goal', 'training_schedule', 'available_equipment', 'training_constraints'
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

CREATE OR REPLACE FUNCTION public.review_qwik_import_v1(
  p_import_id UUID,
  p_action TEXT,
  p_mappings JSONB,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  event_id UUID,
  import_id UUID,
  import_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_import public.measurement_imports%ROWTYPE;
  v_event public.measurement_import_review_events%ROWTYPE;
  v_group public.performance_observation_groups%ROWTYPE;
  v_mapping JSONB;
  v_replacement_group_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF p_action NOT IN ('confirmed', 'rejected')
    OR p_mappings IS NULL
    OR jsonb_typeof(p_mappings) <> 'array'
    OR jsonb_array_length(p_mappings) > 1000
    OR pg_catalog.octet_length(p_mappings::TEXT) > 200000
    OR p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR (p_action = 'rejected' AND (p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500))
    OR (p_action = 'confirmed' AND p_reason IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik review request is invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_mappings) AS mapping(value)
    WHERE jsonb_typeof(mapping.value) <> 'object'
      OR (mapping.value - ARRAY['groupId','movementId','movementName','comparison','comparabilityKey']::TEXT[]) <> '{}'::JSONB
      OR NOT (mapping.value ?& ARRAY['groupId','movementId','movementName','comparison','comparabilityKey'])
      OR jsonb_typeof(mapping.value->'comparison') <> 'object'
      OR length(mapping.value->>'comparabilityKey') NOT BETWEEN 1 AND 500
      OR mapping.value->>'comparabilityKey' NOT LIKE 'comparison-v1|%'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik mapping payload is invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':qwik-review:' || btrim(p_idempotency_key), 0)
  );
  SELECT * INTO v_event
  FROM public.measurement_import_review_events
  WHERE user_id = v_user_id AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.import_id IS DISTINCT FROM p_import_id OR v_event.action IS DISTINCT FROM p_action THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik review key was used for another request';
    END IF;
    RETURN QUERY SELECT v_event.id, v_event.import_id,
      CASE WHEN p_action = 'confirmed' THEN 'confirmed'::TEXT ELSE 'rejected'::TEXT END;
    RETURN;
  END IF;

  SELECT * INTO v_import
  FROM public.measurement_imports
  WHERE id = p_import_id AND user_id = v_user_id AND source_system = 'qwik_vbt'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Qwik import not found';
  END IF;
  IF v_import.status <> 'pending_review' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Qwik import was already reviewed';
  END IF;

  IF p_action = 'rejected' THEN
    UPDATE public.performance_observation_values AS value
    SET status = 'excluded', exclusion_reason = 'athlete_rejected_import'
    FROM public.performance_observation_groups AS observation_group
    WHERE observation_group.source_import_id = v_import.id
      AND observation_group.user_id = v_user_id
      AND value.group_id = observation_group.id
      AND value.user_id = v_user_id
      AND value.status IN ('complete', 'incomplete');
    UPDATE public.performance_observation_groups
    SET status = 'excluded',
        exclusion_reason = 'athlete_rejected_import',
        verification_status = 'rejected',
        verified_at = v_now,
        verified_by = v_user_id
    WHERE source_import_id = v_import.id
      AND user_id = v_user_id
      AND status IN ('complete', 'incomplete');
    UPDATE public.measurement_imports
    SET status = 'rejected',
        verification_status = 'rejected',
        verified_at = v_now,
        verified_by = v_user_id
    WHERE id = v_import.id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.performance_observation_groups
      WHERE source_import_id = v_import.id
        AND user_id = v_user_id
        AND status IN ('complete', 'incomplete')
        AND metadata->>'mappingStatus' = 'unmapped'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unmapped Qwik observations cannot be confirmed';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.performance_observation_groups AS observation_group
      WHERE observation_group.source_import_id = v_import.id
        AND observation_group.user_id = v_user_id
        AND observation_group.status = 'incomplete'
        AND observation_group.metadata->>'mappingStatus' = 'ambiguous'
        AND (
          SELECT count(*) FROM jsonb_array_elements(p_mappings) AS mapping(value)
          WHERE mapping.value->>'groupId' = observation_group.id::TEXT
        ) <> 1
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_mappings) AS mapping(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.performance_observation_groups AS observation_group
        WHERE observation_group.id::TEXT = mapping.value->>'groupId'
          AND observation_group.source_import_id = v_import.id
          AND observation_group.user_id = v_user_id
          AND observation_group.status = 'incomplete'
          AND observation_group.metadata->>'mappingStatus' = 'ambiguous'
          AND observation_group.metadata->'candidateMovementIds' ? (mapping.value->>'movementId')
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Every ambiguous Qwik observation needs one allowed movement';
    END IF;

    FOR v_group IN
      SELECT * FROM public.performance_observation_groups
      WHERE source_import_id = v_import.id
        AND user_id = v_user_id
        AND status = 'incomplete'
        AND metadata->>'mappingStatus' = 'ambiguous'
      ORDER BY observed_at, id
      FOR UPDATE
    LOOP
      SELECT mapping.value INTO v_mapping
      FROM jsonb_array_elements(p_mappings) AS mapping(value)
      WHERE mapping.value->>'groupId' = v_group.id::TEXT;

      IF ((v_mapping->'comparison') - ARRAY[
          'movementId','variationId','repetitions','externalLoad','distance','duration',
          'equipmentIds','techniqueModifiers','environmentModifiers'
        ]::TEXT[]) <> '{}'::JSONB
        OR ((v_mapping->'comparison')->>'movementId') IS DISTINCT FROM (v_mapping->>'movementId')
        OR (v_mapping->>'comparabilityKey') NOT LIKE ('%movement=' || (v_mapping->>'movementId') || '%')
        OR jsonb_typeof((v_mapping->'comparison')->'equipmentIds') <> 'array'
        OR jsonb_typeof((v_mapping->'comparison')->'techniqueModifiers') <> 'array'
        OR jsonb_typeof((v_mapping->'comparison')->'environmentModifiers') <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik mapping comparison is inconsistent';
      END IF;

      UPDATE public.performance_observation_groups
      SET status = 'excluded', exclusion_reason = 'athlete_mapping_corrected'
      WHERE id = v_group.id;

      INSERT INTO public.performance_observation_groups (
        user_id, source_import_id, workout_id, prescribed_session_id,
        observation_kind, status, observed_at, captured_at, source_kind,
        source_system, source_device, source_record_id, assessment_definition_id,
        assessment_catalog_version, protocol_version, parser_version,
        verification_status, verified_at, verified_by, comparability_key,
        comparison_modifiers, metadata
      ) VALUES (
        v_user_id, v_group.source_import_id, v_group.workout_id, v_group.prescribed_session_id,
        v_group.observation_kind, 'complete', v_group.observed_at, v_group.captured_at,
        v_group.source_kind, v_group.source_system, v_group.source_device, v_group.source_record_id,
        v_group.assessment_definition_id, v_group.assessment_catalog_version,
        v_group.protocol_version, 'qwik-athlete-map-0.1.0',
        'athlete_confirmed', v_now, v_user_id, v_mapping->>'comparabilityKey',
        v_mapping->'comparison',
        v_group.metadata || pg_catalog.jsonb_build_object(
          'mappingStatus', 'mapped',
          'canonicalMovementId', v_mapping->>'movementId',
          'canonicalMovementName', v_mapping->>'movementName',
          'candidateMovementIds', pg_catalog.jsonb_build_array(v_mapping->>'movementId'),
          'missingFields', '[]'::JSONB,
          'mappingAuthority', 'athlete_confirmed',
          'supersedesGroupId', v_group.id
        )
      ) RETURNING id INTO v_replacement_group_id;

      INSERT INTO public.performance_observation_values (
        group_id, user_id, metric_id, semantic_role, value_numeric, unit,
        ordinal, status, provenance
      )
      SELECT
        v_replacement_group_id, user_id, metric_id, semantic_role, value_numeric, unit,
        ordinal, status,
        provenance || pg_catalog.jsonb_build_object(
          'mappingAuthority', 'athlete_confirmed',
          'sourceGroupId', v_group.id
        )
      FROM public.performance_observation_values
      WHERE group_id = v_group.id AND user_id = v_user_id;

      UPDATE public.performance_observation_groups
      SET status = 'superseded',
          exclusion_reason = NULL,
          superseded_by_group_id = v_replacement_group_id,
          verification_status = 'rejected',
          verified_at = v_now,
          verified_by = v_user_id
      WHERE id = v_group.id;
    END LOOP;

    UPDATE public.performance_observation_groups
    SET verification_status = 'athlete_confirmed',
        verified_at = v_now,
        verified_by = v_user_id
    WHERE source_import_id = v_import.id
      AND user_id = v_user_id
      AND status = 'complete'
      AND verification_status IN ('unverified', 'system_verified');
    UPDATE public.measurement_imports
    SET status = 'confirmed',
        verification_status = 'athlete_confirmed',
        verified_at = v_now,
        verified_by = v_user_id
    WHERE id = v_import.id;
  END IF;

  INSERT INTO public.measurement_import_review_events (
    user_id, import_id, action, reason, mapping_summary, idempotency_key
  ) VALUES (
    v_user_id,
    v_import.id,
    p_action,
    NULLIF(btrim(p_reason), ''),
    (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'groupId', mapping.value->>'groupId',
        'movementId', mapping.value->>'movementId'
      )), '[]'::JSONB)
      FROM jsonb_array_elements(p_mappings) AS mapping(value)
    ),
    btrim(p_idempotency_key)
  ) RETURNING * INTO v_event;

  RETURN QUERY SELECT v_event.id, v_import.id, p_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_adaptation_proposal(
  p_proposal_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  event_id UUID,
  proposal_id UUID,
  proposal_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_proposal public.adaptation_proposals%ROWTYPE;
  v_program public.training_programs%ROWTYPE;
  v_event public.adaptation_proposal_review_events%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500
    OR p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Proposal rejection request is invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':proposal-reject:' || btrim(p_idempotency_key), 0)
  );
  SELECT * INTO v_event
  FROM public.adaptation_proposal_review_events
  WHERE user_id = v_user_id AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.proposal_id IS DISTINCT FROM p_proposal_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Proposal rejection key was used for another request';
    END IF;
    RETURN QUERY SELECT v_event.id, v_event.proposal_id, 'rejected'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_proposal
  FROM public.adaptation_proposals
  WHERE id = p_proposal_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Adaptation proposal not found';
  END IF;
  IF v_proposal.status <> 'proposed' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Adaptation proposal was already reviewed';
  END IF;

  SELECT * INTO v_program
  FROM public.training_programs
  WHERE id = v_proposal.program_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Training program not found';
  END IF;
  IF v_program.active_plan_version_id = v_proposal.proposed_plan_version_id THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The proposed plan is already active';
  END IF;

  UPDATE public.training_plan_versions
  SET status = 'rejected'
  WHERE id = v_proposal.proposed_plan_version_id
    AND program_id = v_proposal.program_id
    AND user_id = v_user_id
    AND status = 'proposed';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The proposed plan version changed';
  END IF;
  UPDATE public.adaptation_proposals
  SET status = 'rejected', decided_at = v_now
  WHERE id = v_proposal.id;
  INSERT INTO public.adaptation_proposal_review_events (
    user_id, proposal_id, action, reason, idempotency_key
  ) VALUES (
    v_user_id, v_proposal.id, 'rejected', btrim(p_reason), btrim(p_idempotency_key)
  ) RETURNING * INTO v_event;

  RETURN QUERY SELECT v_event.id, v_proposal.id, 'rejected'::TEXT;
END;
$$;

ALTER TABLE public.coach_memory_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_memory_review_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_import_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_import_review_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_proposal_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_proposal_review_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_memory_review_events_select_own ON public.coach_memory_review_events;
CREATE POLICY coach_memory_review_events_select_own
  ON public.coach_memory_review_events FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS measurement_import_review_events_select_own ON public.measurement_import_review_events;
CREATE POLICY measurement_import_review_events_select_own
  ON public.measurement_import_review_events FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS adaptation_proposal_review_events_select_own ON public.adaptation_proposal_review_events;
CREATE POLICY adaptation_proposal_review_events_select_own
  ON public.adaptation_proposal_review_events FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.coach_memory_review_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.measurement_import_review_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.adaptation_proposal_review_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.coach_memory_review_events TO authenticated;
GRANT SELECT ON TABLE public.measurement_import_review_events TO authenticated;
GRANT SELECT ON TABLE public.adaptation_proposal_review_events TO authenticated;
GRANT ALL ON TABLE public.coach_memory_review_events TO service_role;
GRANT ALL ON TABLE public.measurement_import_review_events TO service_role;
GRANT ALL ON TABLE public.adaptation_proposal_review_events TO service_role;

REVOKE ALL ON FUNCTION public.review_coach_memory(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_coach_memory(UUID, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.correct_coach_memory_with_review(UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_coach_memory_with_review(UUID, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.review_qwik_import_v1(UUID, TEXT, JSONB, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_qwik_import_v1(UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_adaptation_proposal(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_adaptation_proposal(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.coach_memory_review_events IS
  'Append-only athlete reviews of current coach memories. Corrections point to immutable replacement versions.';
COMMENT ON TABLE public.measurement_import_review_events IS
  'Append-only athlete decisions for normalized measurement imports. Raw exports are excluded.';
COMMENT ON TABLE public.adaptation_proposal_review_events IS
  'Append-only athlete rejection events for unaccepted adaptation proposals.';
COMMENT ON FUNCTION public.review_qwik_import_v1(UUID, TEXT, JSONB, TEXT, TEXT) IS
  'Atomically confirms or rejects one normalized Qwik import. Ambiguous movement mappings create superseding observations.';

COMMIT;
