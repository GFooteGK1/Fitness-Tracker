import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const canonicalPath = join(repositoryRoot, 'docs', 'migrations', 'atomic-coach-session-completion-migration.sql')
const mirrorPath = join(repositoryRoot, 'supabase', 'migrations', '20260901170000_atomic_coach_session_completion.sql')
const legacyPath = join(repositoryRoot, 'docs', 'migrations', 'coach-execution-feedback-migration.sql')
const canonical = readFileSync(canonicalPath, 'utf8').replace(/\r\n/g, '\n')
const mirror = readFileSync(mirrorPath, 'utf8').replace(/\r\n/g, '\n')
const legacy = readFileSync(legacyPath, 'utf8').replace(/\r\n/g, '\n')

describe('atomic coach session completion migration', () => {
  it('keeps the documented migration and executable Supabase migration identical', () => {
    expect(mirror).toBe(canonical)
  })

  it('creates one transactional path across the canonical workout and evidence records', () => {
    expect(canonical).toContain('CREATE OR REPLACE FUNCTION public.record_coach_session_result_v2')
    expect(canonical).toContain('INSERT INTO public.workouts')
    expect(canonical).toContain('INSERT INTO public.coach_checkins')
    expect(canonical).toContain('INSERT INTO public.performance_observation_groups')
    expect(canonical).toContain('INSERT INTO public.performance_observation_values')
    expect(canonical).toContain('completed_workout_id = v_workout_id')
    expect(canonical).toContain('completion_contract_version = 2')
  })

  it('enforces owner-safe workout links and version-gated terminal integrity', () => {
    expect(canonical).toContain('prescribed_sessions_completed_workout_owner_fk')
    expect(canonical).toContain('FOREIGN KEY (completed_workout_id, user_id)')
    expect(canonical).toContain('REFERENCES public.workouts(id, user_id)')
    expect(canonical).toContain('completion_contract_version IS NULL')
    expect(canonical).toContain('completion_contract_version = 2')
    expect(canonical).toContain("status = 'completed' AND completed_workout_id IS NOT NULL")
    expect(canonical).toContain("status = 'skipped' AND completed_workout_id IS NULL")
  })

  it('serializes idempotency globally and compares the complete request before plan freshness', () => {
    expect(canonical).toContain('idx_coach_checkins_v2_result_idempotency')
    expect(canonical).toContain('pg_catalog.pg_advisory_xact_lock')
    expect(canonical).toContain("'completionRequest', v_request_payload")
    expect(canonical).toContain(
      'Session-result idempotency key was already used for different data'
    )
    expect(canonical.indexOf('IF FOUND THEN')).toBeLessThan(
      canonical.indexOf("IF v_session.status <> 'planned' THEN")
    )
    expect(canonical.indexOf("IF v_session.status <> 'planned' THEN")).toBeLessThan(
      canonical.indexOf('The active plan changed before session completion')
    )
  })

  it('copies accepted blocks only for explicit as-prescribed confirmation', () => {
    expect(canonical).toContain("p_performed_work->>'mode' = 'as_prescribed'")
    expect(canonical).toContain("p_feedback->>'outcome' <> 'as_planned'")
    expect(canonical).toContain("v_session.prescription->'blocks'")
    expect(canonical).toContain("v_session.prescription#>'{dose,blocks}'")
    expect(canonical).toContain("v_blocks := p_performed_work->'blocks'")
  })

  it('creates session-RPE evidence and rejects skipped performed work', () => {
    expect(canonical).toContain("'session.rpe'")
    expect(canonical).toContain("'training_signal'")
    expect(canonical).toContain("'session-result-v2'")
    expect(canonical).toContain('Skipped sessions cannot include performed work or observations')
  })

  it('keeps the legacy check-in-only function callable during rollout', () => {
    expect(legacy).toContain('CREATE OR REPLACE FUNCTION public.record_coach_session_result(')
    expect(canonical).not.toContain('DROP FUNCTION public.record_coach_session_result(')
  })

  it('exposes only the v2 function to authenticated callers', () => {
    expect(canonical).toMatch(/REVOKE ALL ON FUNCTION public\.record_coach_session_result_v2[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/)
    expect(canonical).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_coach_session_result_v2[\s\S]*TO authenticated;/)
  })
})
