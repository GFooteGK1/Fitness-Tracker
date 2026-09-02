import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

const canonical = readFileSync(
  join(repositoryRoot, 'docs', 'migrations', 'layered-adaptive-evidence-migration.sql'),
  'utf8'
)
const generated = readFileSync(
  join(
    repositoryRoot,
    'supabase',
    'migrations',
    '20260901152000_layered_adaptive_evidence.sql'
  ),
  'utf8'
)
const verifier = readFileSync(
  join(
    repositoryRoot,
    'docs',
    'migrations',
    'verify-layered-adaptive-evidence-migration.sql'
  ),
  'utf8'
)

const EVIDENCE_TABLES = [
  'measurement_imports',
  'performance_observation_groups',
  'performance_observation_values',
  'performance_observation_links'
]

describe('layered adaptive evidence migration', () => {
  it('ships one transactional repeatable canonical migration and exact Supabase mirror', () => {
    expect(canonical).toMatch(/^BEGIN;/m)
    expect(canonical).toMatch(/^COMMIT;/m)
    expect(canonical).toContain('CREATE TABLE IF NOT EXISTS')
    expect(canonical).toContain('CREATE INDEX IF NOT EXISTS')
    expect(canonical).toContain('DROP POLICY IF EXISTS')
    expect(generated).toBe(canonical)
  })

  it('extends confirmed memory with effective, expiry, and review lifecycle fields', () => {
    for (const column of [
      'effective_from',
      'effective_until',
      'review_after',
      'last_reviewed_at'
    ]) {
      expect(canonical).toMatch(new RegExp(
        `ALTER TABLE public\\.coach_memories\\s+ADD COLUMN IF NOT EXISTS ${column}`,
        'i'
      ))
    }

    expect(canonical).toContain('coach_memories_effective_window_check')
    expect(canonical).toContain('idx_coach_memories_user_lifecycle')
  })

  it('stores private import manifests without placing large raw payloads in relational rows', () => {
    expect(canonical).toContain('CREATE TABLE IF NOT EXISTS public.measurement_imports')
    expect(canonical).toContain('source_file_hash')
    expect(canonical).toContain('source_schema_version')
    expect(canonical).toContain('parser_version')
    expect(canonical).toContain('raw_artifact_bucket')
    expect(canonical).toContain('raw_artifact_path')
    expect(canonical).toContain('raw_artifact_retention_class')
    expect(canonical).toContain('raw_artifact_expires_at')
    expect(canonical).toContain('measurement_imports_raw_artifact_contract_check')
    expect(canonical).not.toMatch(/\bbar_path\b/i)
    expect(canonical).not.toMatch(/CREATE TABLE[^;]*(apex|qwik)/i)
  })

  it('links generic observations to canonical workouts and prescribed sessions by owner', () => {
    expect(canonical).toContain('CREATE TABLE IF NOT EXISTS public.performance_observation_groups')
    expect(canonical).toContain('CREATE TABLE IF NOT EXISTS public.performance_observation_values')
    expect(canonical).toContain('CREATE TABLE IF NOT EXISTS public.performance_observation_links')
    expect(canonical).toContain('workouts_id_user_unique')
    expect(canonical).toContain('performance_observation_groups_workout_owner_fk')
    expect(canonical).toContain('FOREIGN KEY (workout_id, user_id)')
    expect(canonical).toContain('performance_observation_groups_session_owner_fk')
    expect(canonical).toContain('FOREIGN KEY (prescribed_session_id, user_id)')
    expect(canonical).toContain('performance_observation_values_group_owner_fk')
    expect(canonical).toContain('performance_observation_links_source_owner_fk')
    expect(canonical).not.toMatch(/CREATE TABLE[^;]*canonical_workout/i)
  })

  it('constrains duplicate file hashes and active source records while allowing versioned reprocessing', () => {
    expect(canonical).toContain('idx_measurement_imports_exact_parser_run')
    expect(canonical).toContain('idx_measurement_imports_one_active_hash')
    expect(canonical).toContain('idx_performance_observation_groups_exact_source')
    expect(canonical).toContain('idx_performance_observation_groups_one_active_source')
    expect(canonical).toContain('source_system')
    expect(canonical).toContain('source_record_id')
    expect(canonical).toContain('comparability_key')
  })

  it.each(EVIDENCE_TABLES)('forces tenant RLS and read-only authenticated access on %s', table => {
    expect(canonical).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    expect(canonical).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
    expect(canonical).toMatch(new RegExp(
      `ON public\\.${table} FOR SELECT TO authenticated[\\s\\S]*?auth\\.uid\\(\\) = user_id`,
      'i'
    ))
    expect(canonical).toContain(`GRANT SELECT ON TABLE public.${table} TO authenticated`)
    expect(canonical).not.toMatch(new RegExp(
      `GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*public\\.${table}[^;]*authenticated`,
      'i'
    ))
  })

  it('protects observation identity and content so corrections supersede or exclude', () => {
    expect(canonical).toContain('protect_performance_observation_group_content')
    expect(canonical).toContain('protect_performance_observation_value_content')
    expect(canonical).toContain('Performance observation content is immutable')
    expect(canonical).toContain('Performance observation value is immutable')
    expect(canonical).toContain('Performance observation status cannot move')
    expect(canonical).toContain('Performance observation value status cannot move')
    expect(canonical).toContain('Measurement import status cannot move')
    expect(canonical).toContain("status IN ('complete', 'incomplete', 'excluded', 'superseded')")
    expect(canonical).toContain('superseded_by_group_id')
    expect(canonical).toContain('superseded_by_value_id')
  })

  it('does not rewrite existing workouts or coach memory rows', () => {
    expect(canonical).not.toMatch(/UPDATE\s+public\.(workouts|coach_memories)/i)
    expect(canonical).not.toMatch(/DELETE\s+FROM\s+public\.(workouts|coach_memories)/i)
    expect(canonical).not.toMatch(/INSERT\s+INTO\s+public\.(workouts|coach_memories)/i)
  })

  it('ships rollback-only duplicate, ownership, lifecycle, privilege, and RLS verification', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('verify_duplicate_import_hash')
    expect(verifier).toContain('verify_duplicate_source_id')
    expect(verifier).toContain('verify_cross_user_workout_reference')
    expect(verifier).toContain('verify_cross_user_observation_link')
    expect(verifier).toContain('verify_memory_lifecycle')
    expect(verifier).toContain('verify_evidence_rls')
    expect(verifier).toContain('verify_import_content_immutable')
    expect(verifier).toContain('verify_observation_content_immutable')
    expect(verifier).toContain('verify_observation_status_monotonic')
    expect(verifier).toContain('verify_observation_value_immutable')
    expect(verifier).toContain('verify_evidence_privileges')
    expect(verifier).toContain('relforcerowsecurity')
  })
})
