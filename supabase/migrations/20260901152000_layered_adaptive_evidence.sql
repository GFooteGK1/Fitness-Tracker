BEGIN;

-- Layered adaptive-programming persistence.
--
-- This migration stores imported measurement manifests and append-only,
-- protocol-versioned observations. It does not implement vendor-specific
-- scoring, adaptation decisions, or a second canonical workout record.
--
-- Apply after:
--   1. supabase-migration.sql
--   2. coach-system-migration.sql

CREATE UNIQUE INDEX IF NOT EXISTS workouts_id_user_unique
  ON public.workouts(id, user_id);

ALTER TABLE public.coach_memories
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ;
ALTER TABLE public.coach_memories
  ADD COLUMN IF NOT EXISTS effective_until TIMESTAMPTZ;
ALTER TABLE public.coach_memories
  ADD COLUMN IF NOT EXISTS review_after TIMESTAMPTZ;
ALTER TABLE public.coach_memories
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

DO $add_coach_memories_effective_window_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.coach_memories'::regclass
      AND conname = 'coach_memories_effective_window_check'
  ) THEN
    ALTER TABLE public.coach_memories
      ADD CONSTRAINT coach_memories_effective_window_check
      CHECK (
        effective_until IS NULL
        OR COALESCE(effective_from, confirmed_at) < effective_until
      );
  END IF;
END
$add_coach_memories_effective_window_check$;

DO $add_coach_memories_review_order_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.coach_memories'::regclass
      AND conname = 'coach_memories_review_order_check'
  ) THEN
    ALTER TABLE public.coach_memories
      ADD CONSTRAINT coach_memories_review_order_check
      CHECK (
        last_reviewed_at IS NULL
        OR last_reviewed_at >= confirmed_at
      );
  END IF;
END
$add_coach_memories_review_order_check$;

CREATE INDEX IF NOT EXISTS idx_coach_memories_user_lifecycle
  ON public.coach_memories(
    user_id,
    status,
    effective_from,
    effective_until,
    review_after
  );

COMMENT ON COLUMN public.coach_memories.effective_from IS
  'Optional start of the confirmed fact effective window. Null falls back to confirmed_at.';
COMMENT ON COLUMN public.coach_memories.effective_until IS
  'Optional exclusive end of the confirmed fact effective window.';
COMMENT ON COLUMN public.coach_memories.review_after IS
  'Optional time after which the fact should be re-confirmed before coaching use.';
COMMENT ON COLUMN public.coach_memories.last_reviewed_at IS
  'Most recent authenticated athlete review of this immutable memory version.';

CREATE TABLE IF NOT EXISTS public.measurement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL
    CONSTRAINT measurement_imports_source_system_present
    CHECK (length(btrim(source_system)) BETWEEN 1 AND 80),
  source_file_name TEXT
    CONSTRAINT measurement_imports_file_name_length
    CHECK (source_file_name IS NULL OR length(btrim(source_file_name)) BETWEEN 1 AND 255),
  source_file_hash TEXT NOT NULL
    CONSTRAINT measurement_imports_sha256_check
    CHECK (source_file_hash ~ '^[0-9a-f]{64}$'),
  source_schema_version TEXT NOT NULL
    CONSTRAINT measurement_imports_schema_version_present
    CHECK (length(btrim(source_schema_version)) BETWEEN 1 AND 80),
  parser_version TEXT NOT NULL
    CONSTRAINT measurement_imports_parser_version_present
    CHECK (length(btrim(parser_version)) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CONSTRAINT measurement_imports_status_check
    CHECK (status IN ('pending_review', 'confirmed', 'rejected', 'failed', 'superseded')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CONSTRAINT measurement_imports_verification_status_check
    CHECK (verification_status IN ('unverified', 'athlete_confirmed', 'system_verified', 'rejected')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  raw_artifact_bucket TEXT,
  raw_artifact_path TEXT,
  raw_artifact_retention_class TEXT,
  raw_artifact_expires_at TIMESTAMPTZ,
  manifest JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT measurement_imports_manifest_object_check
    CHECK (jsonb_typeof(manifest) = 'object'),
  failure_reason TEXT,
  superseded_by_import_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  CONSTRAINT measurement_imports_confirmed_by_athlete_check CHECK (
    status <> 'confirmed'
    OR (
      verification_status = 'athlete_confirmed'
      AND verified_at IS NOT NULL
      AND verified_by = user_id
    )
  ),
  CONSTRAINT measurement_imports_verification_timestamp_check CHECK (
    (verification_status = 'unverified' AND verified_at IS NULL)
    OR (verification_status <> 'unverified' AND verified_at IS NOT NULL)
  ),
  CONSTRAINT measurement_imports_raw_artifact_contract_check CHECK (
    (
      raw_artifact_bucket IS NULL
      AND raw_artifact_path IS NULL
      AND raw_artifact_retention_class IS NULL
      AND raw_artifact_expires_at IS NULL
    )
    OR (
      length(btrim(raw_artifact_bucket)) BETWEEN 1 AND 100
      AND raw_artifact_path LIKE user_id::TEXT || '/%'
      AND length(btrim(raw_artifact_retention_class)) BETWEEN 1 AND 80
      AND raw_artifact_expires_at > created_at
    )
  ),
  CONSTRAINT measurement_imports_failure_reason_check CHECK (
    (status = 'failed' AND length(btrim(failure_reason)) > 0)
    OR (status <> 'failed' AND failure_reason IS NULL)
  ),
  CONSTRAINT measurement_imports_supersession_check CHECK (
    (status = 'superseded' AND superseded_by_import_id IS NOT NULL)
    OR (status <> 'superseded' AND superseded_by_import_id IS NULL)
  ),
  CONSTRAINT measurement_imports_superseded_owner_fk
    FOREIGN KEY (superseded_by_import_id, user_id)
    REFERENCES public.measurement_imports(id, user_id),
  CONSTRAINT measurement_imports_not_self_superseded_check
    CHECK (superseded_by_import_id IS NULL OR superseded_by_import_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_imports_exact_parser_run
  ON public.measurement_imports(
    user_id,
    source_system,
    source_file_hash,
    parser_version
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_imports_one_active_hash
  ON public.measurement_imports(user_id, source_system, source_file_hash)
  WHERE status IN ('pending_review', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_measurement_imports_user_status_captured
  ON public.measurement_imports(user_id, status, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_measurement_imports_superseded_owner
  ON public.measurement_imports(superseded_by_import_id, user_id)
  WHERE superseded_by_import_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.performance_observation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_import_id UUID,
  workout_id UUID,
  prescribed_session_id UUID,
  observation_kind TEXT NOT NULL
    CONSTRAINT performance_observation_groups_kind_check
    CHECK (
      observation_kind IN (
        'strength_set',
        'jump_attempt',
        'sprint_attempt',
        'run_attempt',
        'readiness_check',
        'session_outcome'
      )
    ),
  status TEXT NOT NULL DEFAULT 'incomplete'
    CONSTRAINT performance_observation_groups_status_check
    CHECK (status IN ('complete', 'incomplete', 'excluded', 'superseded')),
  observed_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_kind TEXT NOT NULL
    CONSTRAINT performance_observation_groups_source_kind_check
    CHECK (source_kind IN ('manual', 'coach_completion', 'import', 'whoop', 'device', 'derived')),
  source_system TEXT NOT NULL
    CONSTRAINT performance_observation_groups_source_system_present
    CHECK (length(btrim(source_system)) BETWEEN 1 AND 80),
  source_device TEXT NOT NULL DEFAULT 'none'
    CONSTRAINT performance_observation_groups_source_device_present
    CHECK (length(btrim(source_device)) BETWEEN 1 AND 120),
  source_record_id TEXT NOT NULL
    CONSTRAINT performance_observation_groups_source_record_present
    CHECK (length(btrim(source_record_id)) BETWEEN 1 AND 255),
  assessment_definition_id TEXT NOT NULL
    CONSTRAINT performance_observation_groups_assessment_id_present
    CHECK (length(btrim(assessment_definition_id)) BETWEEN 1 AND 120),
  assessment_catalog_version TEXT NOT NULL
    CONSTRAINT performance_observation_groups_catalog_version_present
    CHECK (length(btrim(assessment_catalog_version)) BETWEEN 1 AND 80),
  protocol_version TEXT NOT NULL
    CONSTRAINT performance_observation_groups_protocol_version_present
    CHECK (length(btrim(protocol_version)) BETWEEN 1 AND 80),
  parser_version TEXT NOT NULL
    CONSTRAINT performance_observation_groups_parser_version_present
    CHECK (length(btrim(parser_version)) BETWEEN 1 AND 80),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CONSTRAINT performance_observation_groups_verification_status_check
    CHECK (verification_status IN ('unverified', 'athlete_confirmed', 'system_verified', 'rejected')),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  comparability_key TEXT,
  comparison_modifiers JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT performance_observation_groups_modifiers_object_check
    CHECK (jsonb_typeof(comparison_modifiers) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT performance_observation_groups_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  exclusion_reason TEXT,
  superseded_by_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  CONSTRAINT performance_observation_groups_capture_order_check
    CHECK (captured_at >= observed_at),
  CONSTRAINT performance_observation_groups_complete_check CHECK (
    status <> 'complete'
    OR length(btrim(comparability_key)) BETWEEN 1 AND 500
  ),
  CONSTRAINT performance_observation_groups_exclusion_check CHECK (
    (status = 'excluded' AND length(btrim(exclusion_reason)) > 0)
    OR (status <> 'excluded' AND exclusion_reason IS NULL)
  ),
  CONSTRAINT performance_observation_groups_supersession_check CHECK (
    (status = 'superseded' AND superseded_by_group_id IS NOT NULL)
    OR (status <> 'superseded' AND superseded_by_group_id IS NULL)
  ),
  CONSTRAINT performance_observation_groups_verification_timestamp_check CHECK (
    (verification_status = 'unverified' AND verified_at IS NULL)
    OR (verification_status <> 'unverified' AND verified_at IS NOT NULL)
  ),
  CONSTRAINT performance_observation_groups_import_owner_fk
    FOREIGN KEY (source_import_id, user_id)
    REFERENCES public.measurement_imports(id, user_id),
  CONSTRAINT performance_observation_groups_workout_owner_fk
    FOREIGN KEY (workout_id, user_id)
    REFERENCES public.workouts(id, user_id),
  CONSTRAINT performance_observation_groups_session_owner_fk
    FOREIGN KEY (prescribed_session_id, user_id)
    REFERENCES public.prescribed_sessions(id, user_id),
  CONSTRAINT performance_observation_groups_superseded_owner_fk
    FOREIGN KEY (superseded_by_group_id, user_id)
    REFERENCES public.performance_observation_groups(id, user_id),
  CONSTRAINT performance_observation_groups_not_self_superseded_check
    CHECK (superseded_by_group_id IS NULL OR superseded_by_group_id <> id),
  CONSTRAINT performance_observation_groups_import_source_check CHECK (
    (source_kind = 'import' AND source_import_id IS NOT NULL)
    OR source_kind <> 'import'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_observation_groups_exact_source
  ON public.performance_observation_groups(
    user_id,
    source_kind,
    source_system,
    source_device,
    source_record_id,
    protocol_version,
    parser_version
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_observation_groups_one_active_source
  ON public.performance_observation_groups(
    user_id,
    source_kind,
    source_system,
    source_device,
    source_record_id
  )
  WHERE status IN ('complete', 'incomplete');

CREATE INDEX IF NOT EXISTS idx_performance_observation_groups_user_observed
  ON public.performance_observation_groups(user_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_observation_groups_user_comparability
  ON public.performance_observation_groups(user_id, comparability_key, observed_at DESC)
  WHERE status = 'complete';

CREATE INDEX IF NOT EXISTS idx_performance_observation_groups_import_owner
  ON public.performance_observation_groups(source_import_id, user_id)
  WHERE source_import_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_performance_observation_groups_workout_owner
  ON public.performance_observation_groups(workout_id, user_id)
  WHERE workout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_performance_observation_groups_session_owner
  ON public.performance_observation_groups(prescribed_session_id, user_id)
  WHERE prescribed_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.performance_observation_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  user_id UUID NOT NULL,
  metric_id TEXT NOT NULL
    CONSTRAINT performance_observation_values_metric_check
    CHECK (
      metric_id IN (
        'strength.load',
        'strength.repetitions',
        'strength.estimated_1rm',
        'bar.mean_velocity',
        'jump.height',
        'sprint.time',
        'run.time',
        'readiness.score',
        'session.rpe',
        'session.duration',
        'recovery.hrv'
      )
    ),
  semantic_role TEXT NOT NULL
    CONSTRAINT performance_observation_values_semantic_role_check
    CHECK (semantic_role IN ('target', 'estimate', 'proxy', 'training_signal', 'direct_outcome')),
  value_numeric NUMERIC,
  unit TEXT
    CONSTRAINT performance_observation_values_unit_check
    CHECK (
      unit IS NULL
      OR unit IN (
        'kg',
        'lb',
        'm',
        'cm',
        'in',
        'km',
        'mi',
        's',
        'ms',
        'min',
        'm_per_s',
        'km_per_h',
        's_per_m',
        'min_per_km',
        'min_per_mile',
        'repetitions',
        'score',
        'percent',
        'watts',
        'bpm'
      )
    ),
  ordinal INTEGER NOT NULL DEFAULT 0
    CONSTRAINT performance_observation_values_ordinal_check CHECK (ordinal >= 0),
  status TEXT NOT NULL DEFAULT 'complete'
    CONSTRAINT performance_observation_values_status_check
    CHECK (status IN ('complete', 'incomplete', 'excluded', 'superseded')),
  provenance JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT performance_observation_values_provenance_object_check
    CHECK (jsonb_typeof(provenance) = 'object'),
  exclusion_reason TEXT,
  superseded_by_value_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  UNIQUE (group_id, user_id, metric_id, semantic_role, ordinal),
  CONSTRAINT performance_observation_values_complete_check CHECK (
    status <> 'complete'
    OR (value_numeric IS NOT NULL AND unit IS NOT NULL)
  ),
  CONSTRAINT performance_observation_values_exclusion_check CHECK (
    (status = 'excluded' AND length(btrim(exclusion_reason)) > 0)
    OR (status <> 'excluded' AND exclusion_reason IS NULL)
  ),
  CONSTRAINT performance_observation_values_supersession_check CHECK (
    (status = 'superseded' AND superseded_by_value_id IS NOT NULL)
    OR (status <> 'superseded' AND superseded_by_value_id IS NULL)
  ),
  CONSTRAINT performance_observation_values_group_owner_fk
    FOREIGN KEY (group_id, user_id)
    REFERENCES public.performance_observation_groups(id, user_id),
  CONSTRAINT performance_observation_values_superseded_owner_fk
    FOREIGN KEY (superseded_by_value_id, user_id)
    REFERENCES public.performance_observation_values(id, user_id),
  CONSTRAINT performance_observation_values_not_self_superseded_check
    CHECK (superseded_by_value_id IS NULL OR superseded_by_value_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_performance_observation_values_group_owner
  ON public.performance_observation_values(group_id, user_id);

CREATE INDEX IF NOT EXISTS idx_performance_observation_values_user_metric
  ON public.performance_observation_values(user_id, metric_id, status);

CREATE INDEX IF NOT EXISTS idx_performance_observation_values_superseded_owner
  ON public.performance_observation_values(superseded_by_value_id, user_id)
  WHERE superseded_by_value_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.performance_observation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  derived_group_id UUID NOT NULL,
  source_group_id UUID NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'derived_from'
    CONSTRAINT performance_observation_links_type_check CHECK (link_type = 'derived_from'),
  provenance JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT performance_observation_links_provenance_object_check
    CHECK (jsonb_typeof(provenance) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  UNIQUE (derived_group_id, source_group_id, user_id, link_type),
  CONSTRAINT performance_observation_links_not_self_check
    CHECK (derived_group_id <> source_group_id),
  CONSTRAINT performance_observation_links_derived_owner_fk
    FOREIGN KEY (derived_group_id, user_id)
    REFERENCES public.performance_observation_groups(id, user_id),
  CONSTRAINT performance_observation_links_source_owner_fk
    FOREIGN KEY (source_group_id, user_id)
    REFERENCES public.performance_observation_groups(id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_performance_observation_links_derived_owner
  ON public.performance_observation_links(derived_group_id, user_id);

CREATE INDEX IF NOT EXISTS idx_performance_observation_links_source_owner
  ON public.performance_observation_links(source_group_id, user_id);

CREATE OR REPLACE FUNCTION public.set_adaptive_evidence_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.protect_performance_observation_group_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.source_import_id IS DISTINCT FROM OLD.source_import_id
    OR NEW.workout_id IS DISTINCT FROM OLD.workout_id
    OR NEW.prescribed_session_id IS DISTINCT FROM OLD.prescribed_session_id
    OR NEW.observation_kind IS DISTINCT FROM OLD.observation_kind
    OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
    OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
    OR NEW.source_system IS DISTINCT FROM OLD.source_system
    OR NEW.source_device IS DISTINCT FROM OLD.source_device
    OR NEW.source_record_id IS DISTINCT FROM OLD.source_record_id
    OR NEW.assessment_definition_id IS DISTINCT FROM OLD.assessment_definition_id
    OR NEW.assessment_catalog_version IS DISTINCT FROM OLD.assessment_catalog_version
    OR NEW.protocol_version IS DISTINCT FROM OLD.protocol_version
    OR NEW.parser_version IS DISTINCT FROM OLD.parser_version
    OR NEW.comparability_key IS DISTINCT FROM OLD.comparability_key
    OR NEW.comparison_modifiers IS DISTINCT FROM OLD.comparison_modifiers
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Performance observation content is immutable; supersede or exclude it';
  END IF;

  IF NEW.status <> OLD.status AND NOT (
    (
      OLD.status = 'incomplete'
      AND NEW.status IN ('complete', 'excluded', 'superseded')
    )
    OR (OLD.status = 'complete' AND NEW.status IN ('excluded', 'superseded'))
    OR (OLD.status = 'excluded' AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'Performance observation status cannot move from % to %', OLD.status, NEW.status;
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
    RAISE EXCEPTION 'Performance observation verification cannot move from % to %',
      OLD.verification_status, NEW.verification_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_performance_observation_value_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.group_id IS DISTINCT FROM OLD.group_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.metric_id IS DISTINCT FROM OLD.metric_id
    OR NEW.semantic_role IS DISTINCT FROM OLD.semantic_role
    OR NEW.value_numeric IS DISTINCT FROM OLD.value_numeric
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
    OR NEW.provenance IS DISTINCT FROM OLD.provenance
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Performance observation value is immutable; supersede or exclude it';
  END IF;

  IF NEW.status <> OLD.status AND NOT (
    (
      OLD.status = 'incomplete'
      AND NEW.status IN ('complete', 'excluded', 'superseded')
    )
    OR (OLD.status = 'complete' AND NEW.status IN ('excluded', 'superseded'))
    OR (OLD.status = 'excluded' AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'Performance observation value status cannot move from % to %',
      OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_measurement_imports_updated_at
  ON public.measurement_imports;
CREATE TRIGGER set_measurement_imports_updated_at
  BEFORE UPDATE ON public.measurement_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_adaptive_evidence_updated_at();

DROP TRIGGER IF EXISTS protect_measurement_import_content
  ON public.measurement_imports;
CREATE TRIGGER protect_measurement_import_content
  BEFORE UPDATE ON public.measurement_imports
  FOR EACH ROW EXECUTE FUNCTION public.protect_measurement_import_content();

DROP TRIGGER IF EXISTS set_performance_observation_groups_updated_at
  ON public.performance_observation_groups;
CREATE TRIGGER set_performance_observation_groups_updated_at
  BEFORE UPDATE ON public.performance_observation_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_adaptive_evidence_updated_at();

DROP TRIGGER IF EXISTS protect_performance_observation_group_content
  ON public.performance_observation_groups;
CREATE TRIGGER protect_performance_observation_group_content
  BEFORE UPDATE ON public.performance_observation_groups
  FOR EACH ROW EXECUTE FUNCTION public.protect_performance_observation_group_content();

DROP TRIGGER IF EXISTS set_performance_observation_values_updated_at
  ON public.performance_observation_values;
CREATE TRIGGER set_performance_observation_values_updated_at
  BEFORE UPDATE ON public.performance_observation_values
  FOR EACH ROW EXECUTE FUNCTION public.set_adaptive_evidence_updated_at();

DROP TRIGGER IF EXISTS protect_performance_observation_value_content
  ON public.performance_observation_values;
CREATE TRIGGER protect_performance_observation_value_content
  BEFORE UPDATE ON public.performance_observation_values
  FOR EACH ROW EXECUTE FUNCTION public.protect_performance_observation_value_content();

REVOKE ALL ON TABLE public.measurement_imports FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.performance_observation_groups FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.performance_observation_values FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.performance_observation_links FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.measurement_imports TO authenticated;
GRANT SELECT ON TABLE public.performance_observation_groups TO authenticated;
GRANT SELECT ON TABLE public.performance_observation_values TO authenticated;
GRANT SELECT ON TABLE public.performance_observation_links TO authenticated;

GRANT ALL ON TABLE public.measurement_imports TO service_role;
GRANT ALL ON TABLE public.performance_observation_groups TO service_role;
GRANT ALL ON TABLE public.performance_observation_values TO service_role;
GRANT ALL ON TABLE public.performance_observation_links TO service_role;

ALTER TABLE public.measurement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.performance_observation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_observation_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.performance_observation_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_observation_values FORCE ROW LEVEL SECURITY;
ALTER TABLE public.performance_observation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_observation_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS measurement_imports_select_own
  ON public.measurement_imports;
CREATE POLICY measurement_imports_select_own
  ON public.measurement_imports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS performance_observation_groups_select_own
  ON public.performance_observation_groups;
CREATE POLICY performance_observation_groups_select_own
  ON public.performance_observation_groups FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS performance_observation_values_select_own
  ON public.performance_observation_values;
CREATE POLICY performance_observation_values_select_own
  ON public.performance_observation_values FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS performance_observation_links_select_own
  ON public.performance_observation_links;
CREATE POLICY performance_observation_links_select_own
  ON public.performance_observation_links FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.measurement_imports IS
  'Versioned import manifests. Raw payloads remain in private, retained object storage.';
COMMENT ON TABLE public.performance_observation_groups IS
  'Append-only protocol instances linked to the canonical workout and optional prescribed session.';
COMMENT ON TABLE public.performance_observation_values IS
  'Typed numeric measurements for an observation group; corrections supersede or exclude.';
COMMENT ON TABLE public.performance_observation_links IS
  'Owner-safe lineage from derived observation groups to source observation groups.';

COMMIT;
