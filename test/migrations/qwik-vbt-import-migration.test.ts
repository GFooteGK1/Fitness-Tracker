import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const canonical = normalized(join(
  repositoryRoot,
  'docs',
  'migrations',
  'qwik-vbt-import-migration.sql'
))
const mirror = normalized(join(
  repositoryRoot,
  'supabase',
  'migrations',
  '20260901183000_qwik_vbt_import.sql'
))
const verifier = normalized(join(
  repositoryRoot,
  'docs',
  'migrations',
  'verify-qwik-vbt-import-migration.sql'
))

describe('Qwik VBT import migration', () => {
  it('keeps the transactional documented migration and Supabase mirror identical', () => {
    expect(canonical).toMatch(/^BEGIN;/m)
    expect(canonical).toMatch(/^COMMIT;/m)
    expect(mirror).toBe(canonical)
  })

  it('adds immutable per-user source idempotency without changing direct table grants', () => {
    expect(canonical).toContain('ADD COLUMN IF NOT EXISTS idempotency_key TEXT')
    expect(canonical).toContain('measurement_imports_idempotency_key_check')
    expect(canonical).toContain('idx_measurement_imports_user_source_idempotency')
    expect(canonical).toContain('NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key')
    expect(canonical).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*authenticated/i)
  })

  it('records normalized Qwik sets through one bounded authenticated transaction', () => {
    expect(canonical).toContain('CREATE OR REPLACE FUNCTION public.record_qwik_import_v1')
    expect(canonical).toContain("SET search_path = ''")
    expect(canonical).toContain('v_user_id UUID := auth.uid()')
    expect(canonical).toContain('pg_advisory_xact_lock')
    expect(canonical).toContain("'qwik-vbt-json-1.10'")
    expect(canonical).toContain("'qwik-import-0.1.0'")
    expect(canonical).toContain('INSERT INTO public.measurement_imports')
    expect(canonical).toContain('INSERT INTO public.performance_observation_groups')
    expect(canonical).toContain('INSERT INTO public.performance_observation_values')
    expect(canonical).toContain("'strength.fixed_load_velocity'")
    expect(canonical).toContain("'0.2.0'")
  })

  it('returns exact replay and source-hash duplicate no-ops but rejects changed key content', () => {
    expect(canonical).toContain("'replayed'::TEXT")
    expect(canonical).toContain("'duplicate'::TEXT")
    expect(canonical).toContain(
      'Qwik idempotency key was already used for different content'
    )
    expect(canonical.indexOf("'replayed'::TEXT")).toBeLessThan(
      canonical.indexOf('INSERT INTO public.measurement_imports')
    )
  })

  it('stores only normalized evidence and explicitly rejects raw payload fields', () => {
    expect(canonical).toContain("'rawArtifactUploaded', FALSE")
    expect(canonical).toContain("'rawStoragePolicy', 'user_retained_not_uploaded'")
    expect(canonical).toContain('p_manifest - ARRAY[')
    expect(canonical).toContain("'warningCodes'")
    expect(canonical).toContain(
      `v_set::TEXT ~ '"(rawText|bar_path|barPath)"[[:space:]]*:'`
    )
    expect(canonical).toContain('Qwik set is invalid or too large')
    expect(canonical).not.toContain('p_raw_text')
    expect(canonical).toMatch(
      /raw_artifact_bucket,[\s\S]*raw_artifact_path,[\s\S]*raw_artifact_retention_class,[\s\S]*raw_artifact_expires_at,[\s\S]*NULL,[\s\S]*NULL,[\s\S]*NULL,[\s\S]*NULL,/i
    )
  })

  it('keeps every imported observation unverified and unresolved mappings incomplete', () => {
    expect(canonical).toContain("CASE WHEN v_mapping_status = 'mapped' THEN 'complete' ELSE 'incomplete' END")
    expect(canonical).toContain("'unverified'")
    expect(canonical).toContain("'pending_review'")
  })

  it('exposes only the bounded function to authenticated callers', () => {
    expect(canonical).toMatch(/REVOKE ALL ON FUNCTION public\.record_qwik_import_v1[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/)
    expect(canonical).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_qwik_import_v1[\s\S]*TO authenticated;/)
  })

  it('ships rollback-only replay, conflict, transaction, privacy, grant, and RLS proof', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    for (const marker of [
      'verify_qwik_recorded',
      'verify_qwik_replay',
      'verify_qwik_duplicate',
      'verify_qwik_key_conflict',
      'verify_qwik_source_conflict_atomic',
      'verify_qwik_no_raw_artifact',
      'verify_qwik_privileges',
      'verify_qwik_rls'
    ]) expect(verifier).toContain(marker)
  })
})

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}
