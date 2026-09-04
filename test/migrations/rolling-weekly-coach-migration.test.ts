import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const canonicalPath = join(
  repositoryRoot,
  'docs',
  'migrations',
  'rolling-weekly-coach-migration.sql'
)
const mirrorPath = join(
  repositoryRoot,
  'supabase',
  'migrations',
  '20260903150000_rolling_weekly_coach.sql'
)
const verifierPath = join(
  repositoryRoot,
  'docs',
  'migrations',
  'verify-rolling-weekly-coach-migration.sql'
)

const normalized = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const migration = normalized(canonicalPath)
const mirror = normalized(mirrorPath)
const verifier = normalized(verifierPath)

describe('rolling weekly coach migration', () => {
  it('is transactional, repeatable, and mirrored exactly', () => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toMatch(/^COMMIT;/m)
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS program_mode')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.coach_weekly_reviews')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS')
    expect(mirror).toBe(migration)
  })

  it('preserves legacy rows while separating goal and weekly plan horizons', () => {
    expect(migration).toContain("DEFAULT 'legacy_eight_week'")
    expect(migration).toContain("program_mode IN ('legacy_eight_week', 'rolling_weekly')")
    expect(migration).toContain('goal_target_date DATE')
    expect(migration).toContain('direction JSONB')
    expect(migration).toContain("intent->>'horizon_weeks' = '8'")
    expect(migration).toContain("intent->>'horizon_weeks' = '1'")
    expect(migration).toContain('window_end = window_start + 6')
    expect(migration).toContain('EXTRACT(ISODOW FROM window_start) = 1')
    expect(migration).not.toMatch(/UPDATE public\.training_(programs|plan_versions)\s+SET\s+program_mode/i)
  })

  it('stores every deterministic weekly decision and its evidence links immutably', () => {
    for (const action of [
      'continue',
      'adjust_dose',
      'collect_signal',
      'recover',
      'shift_emphasis',
      'pause_review'
    ]) {
      expect(migration).toContain(`'${action}'`)
    }

    expect(migration).toContain('UNIQUE (base_plan_version_id, user_id)')
    expect(migration).toContain('coach_weekly_review_observations_group_owner_fk')
    expect(migration).toContain('protect_coach_weekly_review_content')
    expect(migration).toContain('input_fingerprint')
    expect(migration).toContain('policy_version')
    expect(migration).toContain('algorithm_version')
  })

  it('creates only bounded weekly plans through stale-base-checked RPCs', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.create_initial_rolling_weekly_proposal'
    )
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.create_rolling_weekly_replacement_proposal'
    )
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.record_coach_weekly_review')
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock')
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain('active_plan_version_id IS DISTINCT FROM p_base_plan_version_id')
    expect(migration).toContain('p_window_start IS DISTINCT FROM v_base_plan.window_end + 1')
    expect(migration).toContain("jsonb_array_length(p_sessions) NOT BETWEEN 1 AND 14")
    expect(migration).toContain("(session->>'week_number')::INTEGER <> 1")
    expect(migration).toContain("p_intent->>'horizon_weeks' IS DISTINCT FROM '1'")
    expect(migration).toContain('idx_training_plan_versions_open_rolling_window')
  })

  it('keeps activation athlete-owned and mode-aware', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.accept_adaptation_proposal')
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain("SET status = 'superseded'")
    expect(migration).toContain("SET status = 'accepted', accepted_at = v_now")
    expect(migration).toContain("program_mode = 'rolling_weekly'")
    expect(migration).toContain('start_date = v_target.window_start')
    expect(migration).toContain('end_date = v_target.window_end')
    expect(migration).toContain(
      'A rolling program cannot reactivate a legacy eight-week plan'
    )
  })

  it('forces owner-scoped read-only RLS and bounded write authority', () => {
    for (const table of ['coach_weekly_reviews', 'coach_weekly_review_observations']) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
      expect(migration).toMatch(new RegExp(
        `ON public\\.${table} FOR SELECT TO authenticated[\\s\\S]*?auth\\.uid\\(\\).*?user_id`,
        'i'
      ))
      expect(migration).toContain(`GRANT SELECT ON TABLE public.${table} TO authenticated`)
      expect(migration).not.toMatch(
        new RegExp(`GRANT (INSERT|UPDATE|DELETE|ALL) ON TABLE public\\.${table} TO authenticated`, 'i')
      )
    }

    expect(migration).toContain('REVOKE INSERT ON TABLE public.training_programs FROM authenticated')
    expect(migration).toContain('REVOKE INSERT ON TABLE public.training_plan_versions FROM authenticated')
    expect(migration).toContain('REVOKE INSERT ON TABLE public.adaptation_proposals FROM authenticated')
    expect(migration).toContain('adaptation_proposals_weekly_review_owner_fk')
  })

  it('ships rollback-only compatibility, idempotency, stale, overlap, and RLS verification', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('verify_legacy_contract')
    expect(verifier).toContain('verify_review_retry')
    expect(verifier).toContain('verify_review_mismatch')
    expect(verifier).toContain('verify_open_window_uniqueness')
    expect(verifier).toContain('verify_invalid_horizon')
    expect(verifier).toContain('verify_stale_review')
    expect(verifier).toContain('verify_cross_tenant_link')
    expect(verifier).toContain('verify_rls')
    expect(verifier).toContain("SELECT 'rollback-complete' AS verification_status")
  })
})
