import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const canonical = readFileSync(
  join(process.cwd(), 'docs', 'migrations', 'coach-complete-programming-v0-3-migration.sql'),
  'utf8'
)
const generated = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260728234500_coach_complete_programming_v0_3.sql'),
  'utf8'
)
const verifier = readFileSync(
  join(process.cwd(), 'docs', 'migrations', 'verify-coach-complete-programming-v0-3-migration.sql'),
  'utf8'
)

describe('complete programming v0.3 storage migration', () => {
  it('is a repeatable forward migration mirrored in generated history', () => {
    expect(canonical.match(/^BEGIN;/gm)).toHaveLength(2)
    expect(canonical.match(/^COMMIT;/gm)).toHaveLength(2)
    expect(canonical).toContain('DROP CONSTRAINT IF EXISTS prescribed_sessions_contract_check')
    expect(canonical.indexOf('NOT VALID;')).toBeLessThan(canonical.indexOf('\nCOMMIT;'))
    expect(canonical.indexOf('VALIDATE CONSTRAINT prescribed_sessions_contract_check'))
      .toBeGreaterThan(canonical.indexOf('\nCOMMIT;'))
    expect(canonical).toContain("prescription->>'format' = 'complete_programming_v0_3'")
    expect(canonical).toContain("prescription ? 'blocks'")
    expect(canonical).toContain("prescription ? 'stop_condition'")
    expect(generated).toBe(canonical)
  })

  it('keeps legacy and v0.3 prescriptions valid while rejecting incomplete objects', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('verify_complete_programming_contract')
    expect(verifier).toContain('complete_programming_v0_3')
    expect(verifier).toContain('legacy_v0_2')
    expect(verifier).toContain('invalid_prescription_was_accepted')
  })
})
