import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'docs/migrations/view-compositions-migration.sql'),
  'utf8',
)
const verifier = readFileSync(
  join(process.cwd(), 'docs/migrations/verify-view-compositions-migration.sql'),
  'utf8',
)

describe('view compositions migration', () => {
  it('defines a user-scoped cache with RLS and fingerprint invalidation', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.view_compositions/i)
    expect(sql).toMatch(/UNIQUE\s*\(user_id, view_type, local_date, template_version, template_fingerprint, facts_fingerprint\)/i)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/user_id\s*=\s*\(SELECT auth\.uid\(\)\)/i)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.view_compositions FROM PUBLIC, anon, authenticated, service_role/i)
    expect(sql).toMatch(/GRANT SELECT, INSERT ON TABLE public\.view_compositions TO authenticated/i)
    expect(sql).not.toMatch(/FOR (?:UPDATE|DELETE)/i)
  })

  it('ships a rollback-only structural, grant, and two-user RLS verifier', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('fitness_view_composition_test.user_1')
    expect(verifier).toContain('fitness_view_composition_test.user_2')
    expect(verifier).toContain("SET LOCAL ROLE authenticated")
    expect(verifier).toContain("enabled and forced RLS")
    expect(verifier).toContain("authenticated view_compositions grants are not least privilege")
    expect(verifier).toContain("anon must not have view_compositions privileges")
    expect(verifier).toContain("user 2 can read user 1 view compositions")
  })
})
