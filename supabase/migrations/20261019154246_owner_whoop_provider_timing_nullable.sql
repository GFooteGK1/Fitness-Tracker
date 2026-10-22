-- UNAPPLIED PROPOSAL. Outside supabase/migrations intentionally.
-- No defaults/backfill/old-column updates/access changes; fail on schema drift.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE public.whoop_recovery
  ADD COLUMN provider_created_at timestamptz(6),
  ADD COLUMN provider_updated_at timestamptz(6),
  ADD COLUMN provider_interval_start timestamptz(6),
  ADD COLUMN provider_interval_end timestamptz(6),
  ADD COLUMN timing_ingested_at timestamptz(6),
  ADD COLUMN provider_timezone_offset text,
  ADD COLUMN provider_score_state text,
  ADD COLUMN timing_mapping_version text,
  ADD COLUMN timing_provenance jsonb,
  ADD COLUMN provider_sleep_id text;
ALTER TABLE public.whoop_sleep
  ADD COLUMN provider_created_at timestamptz(6),
  ADD COLUMN provider_updated_at timestamptz(6),
  ADD COLUMN provider_interval_start timestamptz(6),
  ADD COLUMN provider_interval_end timestamptz(6),
  ADD COLUMN timing_ingested_at timestamptz(6),
  ADD COLUMN provider_timezone_offset text,
  ADD COLUMN provider_score_state text,
  ADD COLUMN timing_mapping_version text,
  ADD COLUMN timing_provenance jsonb,
  ADD COLUMN provider_cycle_id text;
ALTER TABLE public.whoop_cycles
  ADD COLUMN provider_created_at timestamptz(6),
  ADD COLUMN provider_updated_at timestamptz(6),
  ADD COLUMN provider_interval_start timestamptz(6),
  ADD COLUMN provider_interval_end timestamptz(6),
  ADD COLUMN timing_ingested_at timestamptz(6),
  ADD COLUMN provider_timezone_offset text,
  ADD COLUMN provider_score_state text,
  ADD COLUMN timing_mapping_version text,
  ADD COLUMN timing_provenance jsonb;
COMMIT;