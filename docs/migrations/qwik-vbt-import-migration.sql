BEGIN;

ALTER TABLE public.measurement_imports
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.measurement_imports
  DROP CONSTRAINT IF EXISTS measurement_imports_idempotency_key_check;
ALTER TABLE public.measurement_imports
  ADD CONSTRAINT measurement_imports_idempotency_key_check CHECK (
    idempotency_key IS NULL
    OR length(btrim(idempotency_key)) BETWEEN 8 AND 200
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_imports_user_source_idempotency
  ON public.measurement_imports(user_id, source_system, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_measurement_import_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.source_system IS DISTINCT FROM OLD.source_system
    OR NEW.source_file_name IS DISTINCT FROM OLD.source_file_name
    OR NEW.source_file_hash IS DISTINCT FROM OLD.source_file_hash
    OR NEW.source_schema_version IS DISTINCT FROM OLD.source_schema_version
    OR NEW.parser_version IS DISTINCT FROM OLD.parser_version
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
    OR NEW.raw_artifact_bucket IS DISTINCT FROM OLD.raw_artifact_bucket
    OR NEW.raw_artifact_path IS DISTINCT FROM OLD.raw_artifact_path
    OR NEW.raw_artifact_retention_class IS DISTINCT FROM OLD.raw_artifact_retention_class
    OR NEW.raw_artifact_expires_at IS DISTINCT FROM OLD.raw_artifact_expires_at
    OR NEW.manifest IS DISTINCT FROM OLD.manifest
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Measurement import content is immutable; create a versioned parser run';
  END IF;

  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'pending_review' AND NEW.status IN ('confirmed', 'rejected', 'failed', 'superseded'))
    OR (OLD.status = 'confirmed' AND NEW.status IN ('rejected', 'superseded'))
    OR (OLD.status IN ('rejected', 'failed') AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'Measurement import status cannot move from % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.verification_status <> OLD.verification_status AND NOT (
    (
      OLD.verification_status = 'unverified'
      AND NEW.verification_status IN ('athlete_confirmed', 'system_verified', 'rejected')
    )
    OR (
      OLD.verification_status = 'system_verified'
      AND NEW.verification_status IN ('athlete_confirmed', 'rejected')
    )
    OR (OLD.verification_status = 'athlete_confirmed' AND NEW.verification_status = 'rejected')
  ) THEN
    RAISE EXCEPTION 'Measurement import verification cannot move from % to %',
      OLD.verification_status, NEW.verification_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_qwik_import_v1(
  p_idempotency_key TEXT,
  p_source_file_name TEXT,
  p_source_file_hash TEXT,
  p_source_schema_version TEXT,
  p_parser_version TEXT,
  p_captured_at TIMESTAMPTZ,
  p_source_exported_at TIMESTAMPTZ,
  p_source_device TEXT,
  p_manifest JSONB,
  p_sets JSONB
)
RETURNS TABLE (
  import_id UUID,
  disposition TEXT,
  observation_group_count INTEGER,
  review_required BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_import_id UUID;
  v_existing_id UUID;
  v_existing_hash TEXT;
  v_existing_schema_version TEXT;
  v_existing_parser_version TEXT;
  v_existing_status TEXT;
  v_group_id UUID;
  v_group_count INTEGER := 0;
  v_set JSONB;
  v_set_index INTEGER;
  v_source_set_id TEXT;
  v_mapping_status TEXT;
  v_comparability_key TEXT;
  v_observed_at TIMESTAMPTZ;
  v_set_captured_at TIMESTAMPTZ;
  v_values JSONB;
  v_value JSONB;
  v_metric_id TEXT;
  v_semantic_role TEXT;
  v_unit TEXT;
  v_numeric_value NUMERIC;
  v_ordinal INTEGER;
  v_load_count INTEGER;
  v_rep_count INTEGER;
  v_velocity_count INTEGER;
  v_velocity_min_ordinal INTEGER;
  v_velocity_max_ordinal INTEGER;
  v_velocity_distinct_ordinals INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid Qwik idempotency key is required';
  END IF;
  IF p_source_file_name IS NULL
    OR length(btrim(p_source_file_name)) NOT BETWEEN 1 AND 255
    OR lower(btrim(p_source_file_name)) NOT LIKE '%.json' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A named Qwik JSON file is required';
  END IF;
  IF p_source_file_hash IS NULL OR p_source_file_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid Qwik file hash is required';
  END IF;
  IF p_source_schema_version IS DISTINCT FROM 'qwik-vbt-json-1.10'
    OR p_parser_version IS DISTINCT FROM 'qwik-import-0.1.0' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported Qwik parser contract';
  END IF;
  IF p_captured_at IS NULL
    OR p_source_exported_at IS NULL
    OR p_captured_at > pg_catalog.now() + INTERVAL '5 minutes'
    OR p_source_exported_at > p_captured_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Qwik capture or export time';
  END IF;
  IF p_source_device IS NULL OR length(btrim(p_source_device)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A bounded Qwik source device is required';
  END IF;
  IF p_manifest IS NULL
    OR jsonb_typeof(p_manifest) <> 'object'
    OR pg_catalog.octet_length(p_manifest::TEXT) > 5000
    OR NOT (
      p_manifest ?& ARRAY[
        'sourceByteLength',
        'rawStoragePolicy',
        'rawArtifactUploaded',
        'warningCount',
        'warningCodes'
      ]
    )
    OR (
      p_manifest - ARRAY[
        'sourceByteLength',
        'rawStoragePolicy',
        'rawArtifactUploaded',
        'warningCount',
        'warningCodes'
      ]::TEXT[]
    ) <> '{}'::JSONB
    OR jsonb_typeof(p_manifest->'sourceByteLength') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_manifest->'rawStoragePolicy') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_manifest->'rawArtifactUploaded') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_manifest->'warningCount') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_manifest->'warningCodes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik import manifest is invalid or too large';
  END IF;
  IF p_manifest->>'sourceByteLength' !~ '^[0-9]+$'
    OR p_manifest->>'warningCount' !~ '^[0-9]+$'
    OR p_manifest->>'rawStoragePolicy' IS DISTINCT FROM 'user_retained_not_uploaded'
    OR p_manifest->'rawArtifactUploaded' IS DISTINCT FROM 'false'::JSONB THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik import manifest policy is invalid';
  END IF;
  IF (p_manifest->>'sourceByteLength')::INTEGER NOT BETWEEN 2 AND 5000000
    OR (p_manifest->>'warningCount')::INTEGER NOT BETWEEN 0 AND 200
    OR jsonb_array_length(p_manifest->'warningCodes') > 12
    OR jsonb_array_length(p_manifest->'warningCodes')
      > (p_manifest->>'warningCount')::INTEGER THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik import manifest bounds are invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_manifest->'warningCodes') AS warning_code(value)
    WHERE jsonb_typeof(warning_code.value) IS DISTINCT FROM 'string'
      OR warning_code.value #>> '{}' NOT IN (
        'invalid_json', 'invalid_root', 'unsupported_format', 'invalid_file',
        'invalid_set', 'invalid_rep', 'duplicate_source_id', 'invalid_time',
        'invalid_load', 'invalid_rpe', 'invalid_metric', 'movement_review_required'
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik import warning summary is invalid';
  END IF;
  IF p_sets IS NULL
    OR jsonb_typeof(p_sets) <> 'array'
    OR jsonb_array_length(p_sets) NOT BETWEEN 1 AND 1000
    OR pg_catalog.octet_length(p_sets::TEXT) > 2000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik normalized sets are invalid or too large';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':qwik-hash:' || p_source_file_hash, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':qwik-key:' || btrim(p_idempotency_key), 0)
  );

  SELECT
    measurement_import.id,
    measurement_import.source_file_hash,
    measurement_import.source_schema_version,
    measurement_import.parser_version,
    measurement_import.status
  INTO
    v_existing_id,
    v_existing_hash,
    v_existing_schema_version,
    v_existing_parser_version,
    v_existing_status
  FROM public.measurement_imports AS measurement_import
  WHERE measurement_import.user_id = v_user_id
    AND measurement_import.source_system = 'qwik_vbt'
    AND measurement_import.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM p_source_file_hash
      OR v_existing_schema_version IS DISTINCT FROM p_source_schema_version
      OR v_existing_parser_version IS DISTINCT FROM p_parser_version THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Qwik idempotency key was already used for different content';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO v_group_count
    FROM public.performance_observation_groups AS observation_group
    WHERE observation_group.user_id = v_user_id
      AND observation_group.source_import_id = v_existing_id;

    RETURN QUERY SELECT
      v_existing_id,
      'replayed'::TEXT,
      v_group_count,
      v_existing_status = 'pending_review';
    RETURN;
  END IF;

  SELECT measurement_import.id, measurement_import.status
  INTO v_existing_id, v_existing_status
  FROM public.measurement_imports AS measurement_import
  WHERE measurement_import.user_id = v_user_id
    AND measurement_import.source_system = 'qwik_vbt'
    AND measurement_import.source_file_hash = p_source_file_hash
    AND measurement_import.parser_version = p_parser_version
  FOR UPDATE;

  IF FOUND THEN
    SELECT pg_catalog.count(*)::INTEGER
    INTO v_group_count
    FROM public.performance_observation_groups AS observation_group
    WHERE observation_group.user_id = v_user_id
      AND observation_group.source_import_id = v_existing_id;

    RETURN QUERY SELECT
      v_existing_id,
      'duplicate'::TEXT,
      v_group_count,
      v_existing_status = 'pending_review';
    RETURN;
  END IF;

  INSERT INTO public.measurement_imports (
    user_id,
    source_system,
    source_file_name,
    source_file_hash,
    source_schema_version,
    parser_version,
    idempotency_key,
    status,
    verification_status,
    captured_at,
    raw_artifact_bucket,
    raw_artifact_path,
    raw_artifact_retention_class,
    raw_artifact_expires_at,
    manifest
  )
  VALUES (
    v_user_id,
    'qwik_vbt',
    btrim(p_source_file_name),
    p_source_file_hash,
    p_source_schema_version,
    p_parser_version,
    btrim(p_idempotency_key),
    'pending_review',
    'unverified',
    p_captured_at,
    NULL,
    NULL,
    NULL,
    NULL,
    p_manifest || pg_catalog.jsonb_build_object(
      'sourceExportedAt', p_source_exported_at,
      'sourceDevice', btrim(p_source_device),
      'setCount', jsonb_array_length(p_sets),
      'rawArtifactUploaded', FALSE,
      'rawStoragePolicy', 'user_retained_not_uploaded'
    )
  )
  RETURNING id INTO v_import_id;

  FOR v_set_index, v_set IN
    SELECT (set_row.ordinality - 1)::INTEGER, set_row.value
    FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS set_row(value, ordinality)
  LOOP
    IF jsonb_typeof(v_set) <> 'object'
      OR pg_catalog.octet_length(v_set::TEXT) > 120000
      OR (
        v_set - ARRAY[
          'sourceSetId',
          'sourceExercise',
          'observedAt',
          'capturedAt',
          'workoutDate',
          'mappingStatus',
          'canonicalMovementId',
          'canonicalMovementName',
          'candidateMovementIds',
          'comparabilityKey',
          'comparison',
          'rpe',
          'notes',
          'tags',
          'techniqueModifiers',
          'velocityLossPercent',
          'repMetadata',
          'values'
        ]::TEXT[]
      ) <> '{}'::JSONB THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik set is invalid or too large';
    END IF;
    IF v_set::TEXT ~ '"(rawText|bar_path|barPath)"[[:space:]]*:' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Raw Qwik payloads cannot be stored in normalized sets';
    END IF;

    v_source_set_id := NULLIF(btrim(v_set->>'sourceSetId'), '');
    IF v_source_set_id IS NULL
      OR length(v_source_set_id) > 255
      OR v_source_set_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik source set ID is invalid';
    END IF;
    IF NULLIF(btrim(v_set->>'sourceExercise'), '') IS NULL
      OR length(btrim(v_set->>'sourceExercise')) > 200 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik source exercise is invalid';
    END IF;

    BEGIN
      v_observed_at := (v_set->>'observedAt')::TIMESTAMPTZ;
      v_set_captured_at := (v_set->>'capturedAt')::TIMESTAMPTZ;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik set timestamps are invalid';
    END;
    IF v_observed_at IS NULL
      OR v_set_captured_at IS NULL
      OR v_set_captured_at < v_observed_at
      OR v_set_captured_at > p_captured_at + INTERVAL '5 minutes' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik set timestamp order is invalid';
    END IF;
    IF v_set->>'workoutDate' IS DISTINCT FROM
      ((v_observed_at AT TIME ZONE 'UTC')::DATE)::TEXT THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik workout date does not match performed time';
    END IF;

    v_mapping_status := v_set->>'mappingStatus';
    v_comparability_key := NULLIF(btrim(v_set->>'comparabilityKey'), '');
    IF v_mapping_status IS NULL OR v_mapping_status NOT IN ('mapped', 'ambiguous', 'unmapped') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik movement mapping status is invalid';
    END IF;
    IF v_mapping_status = 'mapped' AND (
      NULLIF(btrim(v_set->>'canonicalMovementId'), '') IS NULL
      OR NULLIF(btrim(v_set->>'canonicalMovementName'), '') IS NULL
      OR v_comparability_key IS NULL
      OR length(v_comparability_key) > 500
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Mapped Qwik sets require canonical comparability';
    END IF;
    IF v_mapping_status <> 'mapped' AND (
      v_set->>'canonicalMovementId' IS NOT NULL
      OR v_set->>'canonicalMovementName' IS NOT NULL
      OR v_comparability_key IS NOT NULL
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unresolved Qwik sets cannot claim canonical comparability';
    END IF;
    IF jsonb_typeof(v_set->'candidateMovementIds') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_set->'comparison') IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_set->'tags') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_set->'techniqueModifiers') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_set->'repMetadata') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik normalized set metadata is invalid';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_set->'candidateMovementIds') AS candidate(value)
      WHERE jsonb_typeof(candidate.value) IS DISTINCT FROM 'string'
        OR length(candidate.value #>> '{}') > 255
    ) OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_set->'tags') AS tag(value)
      WHERE jsonb_typeof(tag.value) IS DISTINCT FROM 'string'
        OR length(tag.value #>> '{}') > 80
    ) OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_set->'techniqueModifiers') AS modifier(value)
      WHERE jsonb_typeof(modifier.value) IS DISTINCT FROM 'string'
        OR length(modifier.value #>> '{}') > 80
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik normalized text arrays are invalid';
    END IF;
    IF (
      (v_set->'comparison') - ARRAY[
        'movementId',
        'variationId',
        'repetitions',
        'externalLoad',
        'distance',
        'duration',
        'equipmentIds',
        'techniqueModifiers',
        'environmentModifiers'
      ]::TEXT[]
    ) <> '{}'::JSONB THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik comparison contains unsupported fields';
    END IF;
    IF v_set ? 'notes' AND (
      jsonb_typeof(v_set->'notes') NOT IN ('null', 'string')
      OR (
        jsonb_typeof(v_set->'notes') = 'string'
        AND length(v_set->>'notes') > 2000
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik set notes are invalid';
    END IF;
    IF v_set ? 'rpe' AND (
      jsonb_typeof(v_set->'rpe') NOT IN ('null', 'number')
      OR (
        jsonb_typeof(v_set->'rpe') = 'number'
        AND (v_set->>'rpe')::NUMERIC NOT BETWEEN 1 AND 10
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik set RPE is invalid';
    END IF;

    v_values := v_set->'values';
    IF jsonb_typeof(v_values) IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_values) NOT BETWEEN 3 AND 102 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik set values are invalid';
    END IF;

    SELECT
      pg_catalog.count(*) FILTER (WHERE value_row.value->>'metricId' = 'strength.load'),
      pg_catalog.count(*) FILTER (WHERE value_row.value->>'metricId' = 'strength.repetitions'),
      pg_catalog.count(*) FILTER (WHERE value_row.value->>'metricId' = 'bar.mean_velocity')
    INTO v_load_count, v_rep_count, v_velocity_count
    FROM jsonb_array_elements(v_values) AS value_row(value);

    IF v_load_count <> 1 OR v_rep_count <> 1 OR v_velocity_count < 1
      OR v_load_count + v_rep_count + v_velocity_count <> jsonb_array_length(v_values) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik set requires one load, one rep count, and velocity per rep';
    END IF;
    IF jsonb_array_length(v_set->'repMetadata') <> v_velocity_count THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik rep metadata does not match velocity measurements';
    END IF;

    SELECT
      pg_catalog.min((value_row.value->>'ordinal')::INTEGER),
      pg_catalog.max((value_row.value->>'ordinal')::INTEGER),
      pg_catalog.count(DISTINCT (value_row.value->>'ordinal')::INTEGER)
    INTO v_velocity_min_ordinal, v_velocity_max_ordinal, v_velocity_distinct_ordinals
    FROM jsonb_array_elements(v_values) AS value_row(value)
    WHERE value_row.value->>'metricId' = 'bar.mean_velocity'
      AND value_row.value->>'ordinal' ~ '^[0-9]+$';

    IF v_velocity_min_ordinal <> 0
      OR v_velocity_max_ordinal <> v_velocity_count - 1
      OR v_velocity_distinct_ordinals <> v_velocity_count THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik rep velocity ordinals must be contiguous';
    END IF;

    INSERT INTO public.performance_observation_groups (
      user_id,
      source_import_id,
      observation_kind,
      status,
      observed_at,
      captured_at,
      source_kind,
      source_system,
      source_device,
      source_record_id,
      assessment_definition_id,
      assessment_catalog_version,
      protocol_version,
      parser_version,
      verification_status,
      comparability_key,
      comparison_modifiers,
      metadata
    )
    VALUES (
      v_user_id,
      v_import_id,
      'strength_set',
      CASE WHEN v_mapping_status = 'mapped' THEN 'complete' ELSE 'incomplete' END,
      v_observed_at,
      v_set_captured_at,
      'import',
      'qwik_vbt',
      btrim(p_source_device),
      v_source_set_id,
      'strength.fixed_load_velocity',
      '0.2.0',
      '1.0.0',
      p_parser_version,
      'unverified',
      v_comparability_key,
      v_set->'comparison',
      (v_set - 'values' - 'comparison' - 'comparabilityKey')
        || pg_catalog.jsonb_build_object(
          'sourceExportedAt', p_source_exported_at,
          'protocolId', 'qwik-video-vbt-fixed-load',
          'rawArtifactUploaded', FALSE,
          'rawStoragePolicy', 'user_retained_not_uploaded',
          'missingFields', CASE
            WHEN v_mapping_status = 'mapped' THEN '[]'::JSONB
            ELSE '["canonicalMovementId","comparabilityKey"]'::JSONB
          END
        )
    )
    RETURNING id INTO v_group_id;

    FOR v_value IN SELECT value_row.value FROM jsonb_array_elements(v_values) AS value_row(value)
    LOOP
      IF jsonb_typeof(v_value) IS DISTINCT FROM 'object'
        OR jsonb_typeof(v_value->'value') IS DISTINCT FROM 'number'
        OR COALESCE(v_value->>'ordinal', '') !~ '^[0-9]+$'
        OR jsonb_typeof(v_value->'provenance') IS DISTINCT FROM 'object'
        OR pg_catalog.octet_length((v_value->'provenance')::TEXT) > 20000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik measurement value is invalid';
      END IF;

      v_metric_id := v_value->>'metricId';
      v_semantic_role := v_value->>'semanticRole';
      v_unit := v_value->>'unit';
      v_numeric_value := (v_value->>'value')::NUMERIC;
      v_ordinal := (v_value->>'ordinal')::INTEGER;

      IF (
        v_metric_id = 'strength.load'
        AND (
          v_semantic_role <> 'training_signal'
          OR v_unit NOT IN ('kg', 'lb')
          OR v_numeric_value <= 0
          OR v_numeric_value > 2000
          OR v_ordinal <> 0
        )
      ) OR (
        v_metric_id = 'strength.repetitions'
        AND (
          v_semantic_role <> 'training_signal'
          OR v_unit <> 'repetitions'
          OR v_numeric_value <= 0
          OR v_numeric_value > 100
          OR v_numeric_value <> pg_catalog.trunc(v_numeric_value)
          OR v_ordinal <> 0
        )
      ) OR (
        v_metric_id = 'bar.mean_velocity'
        AND (
          v_semantic_role <> 'direct_outcome'
          OR v_unit <> 'm_per_s'
          OR v_numeric_value <= 0
          OR v_numeric_value > 5
          OR v_ordinal < 0
          OR v_ordinal >= v_velocity_count
        )
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Qwik measurement contract is invalid';
      END IF;

      INSERT INTO public.performance_observation_values (
        group_id,
        user_id,
        metric_id,
        semantic_role,
        value_numeric,
        unit,
        ordinal,
        status,
        provenance
      )
      VALUES (
        v_group_id,
        v_user_id,
        v_metric_id,
        v_semantic_role,
        v_numeric_value,
        v_unit,
        v_ordinal,
        'complete',
        v_value->'provenance'
      );
    END LOOP;

    v_group_count := v_group_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_import_id, 'recorded'::TEXT, v_group_count, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_qwik_import_v1(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  JSONB,
  JSONB
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_qwik_import_v1(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  JSONB,
  JSONB
) TO authenticated;

COMMENT ON FUNCTION public.record_qwik_import_v1(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  JSONB,
  JSONB
) IS
  'Atomically records one normalized Qwik JSON 1.10 import for athlete review. Raw JSON and bar-path arrays are never stored.';

COMMIT;
