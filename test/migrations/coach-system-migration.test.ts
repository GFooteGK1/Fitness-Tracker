import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'docs', 'migrations', 'coach-system-migration.sql'),
  'utf-8'
)

const verifier = readFileSync(
  join(process.cwd(), 'docs', 'migrations', 'verify-coach-system-migration.sql'),
  'utf-8'
)

const USER_TABLES = [
  'coach_strength_assessments',
  'coach_memories',
  'training_programs',
  'training_plan_versions',
  'prescribed_sessions',
  'adaptation_proposals',
  'coach_checkins'
]

describe('adaptive coach database migration', () => {
  it('is transactional and repeatable', () => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toMatch(/^COMMIT;/m)
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS')
    expect(migration).toContain('DROP POLICY IF EXISTS')
  })

  it.each(USER_TABLES)('forces user-scoped RLS on %s', table => {
    expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
    expect(migration).toMatch(new RegExp(
      `ON public\\.${table}[\\s\\S]*?(USING|WITH CHECK) \\([^;]*auth\\.uid\\(\\)[^;]*user_id`,
      'i'
    ))
  })

  it('keeps accepted versions unique and prescription content immutable', () => {
    expect(migration).toContain('idx_training_plan_versions_one_accepted')
    expect(migration).toContain("WHERE status = 'accepted'")
    expect(migration).toContain('protect_training_plan_version_content')
    expect(migration).toContain('protect_prescribed_session_content')
    expect(migration).toContain("prescription ? 'stop_condition'")
    expect(migration).toContain("prescription ? 'scale_options'")
  })

  it('makes assessment retries idempotent and indexes tenant foreign keys', () => {
    expect(migration).toContain('idx_coach_strength_assessments_idempotency')
    expect(migration).toContain('input_fingerprint')
    expect(migration).toContain('coach_checkins_program_owner_fk')
    expect(migration).toContain('coach_checkins_plan_owner_fk')
    expect(migration).toContain('coach_checkins_session_owner_fk')
    expect(migration).toContain('coach_checkins_parent_chain_check')
    expect(migration).toContain(
      'FOREIGN KEY (prescribed_session_id, plan_version_id, program_id, user_id)'
    )
    expect(migration).toContain('idx_adaptation_proposals_base_version')
    expect(migration).toContain('idx_coach_checkins_session')
  })

  it('activates proposals atomically, idempotently, and rejects stale bases', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.accept_adaptation_proposal')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain("v_proposal.status = 'accepted'")
    expect(migration).toContain('p_idempotency_key')
    expect(migration).toContain('base_plan_version_id IS DISTINCT FROM')
    expect(migration).toContain("ERRCODE = '40001'")
  })

  it('creates the initial program proposal atomically from validated app output', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.create_initial_training_plan_proposal'
    )
    expect(migration).toContain("jsonb_typeof(p_sessions) <> 'array'")
    expect(migration).toContain('jsonb_array_elements(p_sessions)')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain(
      'Training proposal idempotency key was already used for different data'
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.create_initial_training_plan_proposal'
    )
    expect(verifier).toContain('create_initial_training_plan_proposal')
  })

  it('versions confirmed coach memory atomically and idempotently', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.confirm_coach_memory')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('idempotency_key = p_idempotency_key')
    expect(migration).toContain(
      'Coach memory idempotency key was already used for different data'
    )
    expect(migration).toContain("SET status = 'superseded'")
    expect(migration).toContain('supersedes_id')
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.confirm_coach_memory(TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT)'
    )
  })

  it('does not grant authenticated clients direct acceptance updates', () => {
    expect(migration).toContain(
      'GRANT SELECT, INSERT ON TABLE public.training_plan_versions TO authenticated'
    )
    expect(migration).toContain(
      'GRANT SELECT, INSERT ON TABLE public.adaptation_proposals TO authenticated'
    )
    expect(migration).not.toMatch(
      /GRANT[^;]*UPDATE[^;]*public\.(training_plan_versions|adaptation_proposals)[^;]*authenticated/i
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.accept_adaptation_proposal(UUID, TEXT) TO authenticated'
    )
  })

  it('ships a rollback-only two-user and stale-proposal verifier', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('SET LOCAL ROLE authenticated')
    expect(verifier).toContain("'request.jwt.claim.sub'")
    expect(verifier).toContain('INSERT INTO auth.users (id)')
    expect(verifier).toContain('accept_adaptation_proposal')
    expect(verifier).toContain('serialization_failure')
    expect(verifier).toContain('verify_memory_idempotency_payload')
    expect(verifier).toContain('relforcerowsecurity')
  })
})
