import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const canonical = readFileSync(
  join(process.cwd(), 'docs', 'migrations', 'coach-execution-feedback-migration.sql'),
  'utf8'
)
const generated = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260729182500_coach_execution_feedback.sql'),
  'utf8'
)
const verifier = readFileSync(
  join(process.cwd(), 'docs', 'migrations', 'verify-coach-execution-feedback-migration.sql'),
  'utf8'
)

describe('coach execution-feedback migration', () => {
  it('ships one repeatable, mirrored atomic session-result function', () => {
    expect(canonical).toMatch(/^BEGIN;/m)
    expect(canonical).toMatch(/^COMMIT;/m)
    expect(canonical).toContain(
      'CREATE OR REPLACE FUNCTION public.record_coach_session_result'
    )
    expect(canonical).toContain('SECURITY DEFINER')
    expect(canonical).toContain("SET search_path = ''")
    expect(canonical).toContain('FOR UPDATE')
    expect(canonical).toContain('auth.uid()')
    expect(canonical).toContain('active_plan_version_id')
    expect(canonical).toContain('INSERT INTO public.coach_checkins')
    expect(canonical).toContain('UPDATE public.prescribed_sessions')
    expect(canonical).toContain("p_responses->>'schemaVersion' IS DISTINCT FROM '1'")
    expect(canonical).toContain("responses->>'idempotencyKey'")
    expect(canonical).toContain(
      'GRANT EXECUTE ON FUNCTION public.record_coach_session_result'
    )
    expect(generated).toBe(canonical)
  })

  it('does not broaden direct mutation grants', () => {
    expect(canonical).toContain(
      'REVOKE INSERT, UPDATE ON TABLE public.prescribed_sessions FROM authenticated'
    )
    expect(canonical).toContain(
      'REVOKE INSERT ON TABLE public.coach_checkins FROM authenticated'
    )
    expect(canonical).not.toMatch(
      /GRANT[^;]*UPDATE[^;]*public\.coach_checkins[^;]*authenticated/i
    )
    expect(canonical).not.toMatch(
      /GRANT[^;]*INSERT[^;]*public\.coach_checkins[^;]*authenticated/i
    )
  })

  it('ships rollback-only idempotency, conflict, status, and cross-user verification', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('verify_session_result_retry')
    expect(verifier).toContain('verify_session_result_mismatched_retry')
    expect(verifier).toContain('verify_cross_user_session_result')
    expect(verifier).toContain("'completed'")
    expect(verifier).toContain("'skipped'")
    expect(verifier).toContain('has_function_privilege')
  })
})
