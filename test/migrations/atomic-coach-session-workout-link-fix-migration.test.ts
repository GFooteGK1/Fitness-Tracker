import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const documentedPath = join(
  repositoryRoot,
  'docs',
  'migrations',
  'atomic-coach-session-workout-link-fix-migration.sql'
)
const executablePath = join(
  repositoryRoot,
  'supabase',
  'migrations',
  '20260904023000_fix_atomic_session_workout_link.sql'
)
const runnerPath = join(
  repositoryRoot,
  'supabase',
  'migrations',
  '20260730130953_coach_workout_runner_v0_5.sql'
)
const documented = readFileSync(documentedPath, 'utf8').replace(/\r\n/g, '\n')
const executable = readFileSync(executablePath, 'utf8').replace(/\r\n/g, '\n')
const runner = readFileSync(runnerPath, 'utf8').replace(/\r\n/g, '\n')

describe('atomic coach session workout-link repair migration', () => {
  it('keeps the documented repair and executable migration identical', () => {
    expect(executable).toBe(documented)
  })

  it('marks the atomically created workout as a completed program-runner result', () => {
    expect(executable).toContain(
      'CREATE OR REPLACE FUNCTION public.record_coach_session_result_v2'
    )
    expect(executable).toMatch(
      /INSERT INTO public\.workouts \([\s\S]*parse_confidence,[\s\S]*execution_source,[\s\S]*execution_status,[\s\S]*started_at,[\s\S]*completed_at,[\s\S]*updated_at,[\s\S]*execution_revision[\s\S]*'program_runner',[\s\S]*'completed',[\s\S]*p_occurred_at,[\s\S]*p_occurred_at,[\s\S]*v_now,[\s\S]*0/
    )
  })

  it('matches the existing owner and runner integrity trigger', () => {
    expect(runner).toContain("v_execution_source IS DISTINCT FROM 'program_runner'")
    expect(runner).toContain(
      "NEW.status = 'completed' AND v_execution_status IS DISTINCT FROM 'completed'"
    )
  })

  it('preserves the authenticated-only RPC boundary', () => {
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION public\.record_coach_session_result_v2[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/
    )
    expect(executable).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_coach_session_result_v2[\s\S]*TO authenticated;/
    )
  })
})
