import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260728134202_personal_record_idempotency.sql',
), 'utf-8')

describe('personal-record idempotency migration', () => {
  it('keeps only the best result per workout, exercise, and PR type', () => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toContain('ROW_NUMBER() OVER')
    expect(migration).toContain('PARTITION BY user_id, workout_id, exercise, pr_type')
    expect(migration).toContain("WHEN pr_type = 'time' THEN value")
    expect(migration).toContain('DELETE FROM public.personal_records')
    expect(migration).toMatch(/^COMMIT;/m)
  })

  it('adds the conflict target used by the application write path', () => {
    expect(migration).toContain('personal_records_one_per_workout_exercise_type')
    expect(migration).toContain('UNIQUE (user_id, workout_id, exercise, pr_type)')
  })
})
