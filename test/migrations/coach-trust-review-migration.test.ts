import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const canonical = normalized(join(repositoryRoot, 'docs', 'migrations', 'coach-trust-review-migration.sql'))
const mirror = normalized(join(repositoryRoot, 'supabase', 'migrations', '20260901220000_coach_trust_review.sql'))
const verifier = normalized(join(repositoryRoot, 'docs', 'migrations', 'verify-coach-trust-review-migration.sql'))

describe('coach trust review migration', () => {
  it('keeps the transactional documented migration and Supabase mirror identical', () => {
    expect(canonical).toMatch(/^BEGIN;/m)
    expect(canonical).toMatch(/^COMMIT;/m)
    expect(mirror).toBe(canonical)
  })

  it('adds append-only owner-scoped review events without direct authenticated writes', () => {
    for (const table of [
      'coach_memory_review_events',
      'measurement_import_review_events',
      'adaptation_proposal_review_events'
    ]) {
      expect(canonical).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
      expect(canonical).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
      expect(canonical).toContain(`GRANT SELECT ON TABLE public.${table} TO authenticated`)
    }
    expect(canonical).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*authenticated/i)
  })

  it('owns every state transition through authenticated, idempotent, locked RPCs', () => {
    for (const name of [
      'review_coach_memory',
      'correct_coach_memory_with_review',
      'review_qwik_import_v1',
      'reject_adaptation_proposal'
    ]) {
      expect(canonical).toContain(`CREATE OR REPLACE FUNCTION public.${name}`)
      expect(canonical).toMatch(new RegExp(`FUNCTION public\\.${name}[\\s\\S]*SECURITY DEFINER[\\s\\S]*SET search_path = ''`))
      expect(canonical).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]*TO authenticated;`))
    }
    expect(canonical).toContain('pg_advisory_xact_lock')
    expect(canonical).toContain('UNIQUE (user_id, idempotency_key)')
  })

  it('versions memory correction and ambiguous Qwik mapping without mutating source content', () => {
    expect(canonical).toContain('FROM public.confirm_coach_memory(')
    expect(canonical).toContain("'athlete_correction'")
    expect(canonical).toContain("'athlete_mapping_corrected'")
    expect(canonical).toContain("'qwik-athlete-map-0.1.0'")
    expect(canonical).toContain('superseded_by_group_id = v_replacement_group_id')
    expect(canonical).toContain("'mappingAuthority', 'athlete_confirmed'")
    expect(canonical).toContain("metadata->'candidateMovementIds' ? (mapping.value->>'movementId')")
  })

  it('keeps raw Qwik artifacts out and preserves explicit acceptance', () => {
    expect(canonical).not.toMatch(/rawText|bar_path|barPath/)
    expect(canonical).toContain("SET status = 'rejected'")
    expect(canonical).toContain('v_program.active_plan_version_id = v_proposal.proposed_plan_version_id')
    expect(canonical).not.toContain("SET status = 'accepted'")
  })

  it('ships rollback-only memory, import, proposal, replay, privilege, and RLS proof', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    for (const marker of [
      'verify_memory_reaffirm',
      'verify_memory_correction',
      'verify_memory_withdrawal',
      'verify_qwik_confirmation',
      'verify_qwik_rejection',
      'verify_proposal_rejection',
      'verify_trust_privileges',
      'verify_trust_rls'
    ]) expect(verifier).toContain(marker)
  })
})

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}
