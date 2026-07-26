import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const readMigration = (name: string) =>
  readFileSync(join(process.cwd(), 'docs', 'migrations', name), 'utf-8')

describe('autonomous queue database migrations', () => {
  const personalRecords = readMigration('personal-records-migration.sql')
  const viewTemplates = readMigration('view-templates-migration.sql')
  const verifier = readMigration('verify-autonomous-queue-migrations.sql')

  it.each([
    ['personal records', personalRecords],
    ['view templates', viewTemplates],
  ])('%s migration is transactional and repeatable', (_name, migration) => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toMatch(/^COMMIT;/m)
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS')
    expect(migration).toContain('DROP POLICY IF EXISTS')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
  })

  it('keeps personal records user-scoped and least-privilege', () => {
    expect(personalRecords).toContain('TO authenticated')
    expect(personalRecords).toContain('WITH CHECK ((SELECT auth.uid()) = user_id)')
    expect(personalRecords).toContain('USING ((SELECT auth.uid()) = user_id)')
    expect(personalRecords).toContain(
      'GRANT SELECT, INSERT, DELETE ON TABLE public.personal_records TO authenticated'
    )
    expect(personalRecords).not.toMatch(
      /GRANT[^;]*UPDATE[^;]*public\.personal_records[^;]*authenticated/i
    )
  })

  it('keeps view templates immutable and seeds the default repeatably', () => {
    expect(viewTemplates).toContain('WHERE NOT EXISTS')
    expect(viewTemplates).toContain(
      'USING (user_id = (SELECT auth.uid()) OR user_id IS NULL)'
    )
    expect(viewTemplates).toContain(
      'WITH CHECK (user_id = (SELECT auth.uid()))'
    )
    expect(viewTemplates).toContain(
      'GRANT SELECT, INSERT ON TABLE public.view_templates TO authenticated'
    )
    expect(viewTemplates).not.toMatch(
      /GRANT[^;]*(UPDATE|DELETE)[^;]*public\.view_templates[^;]*authenticated/i
    )
  })

  it('rolls back every two-user verification fixture', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('available_users < 2')
    expect(verifier).toContain('SET LOCAL ROLE authenticated')
    expect(verifier).toContain("'request.jwt.claim.sub'")
    expect(verifier).toContain('fitness_migration_test.user_1')
    expect(verifier).toContain('fitness_migration_test.user_2')
    expect(verifier).toContain('WHEN insufficient_privilege THEN NULL')
    expect(verifier).toContain('GET DIAGNOSTICS affected_rows = ROW_COUNT')
    expect(verifier).toContain('relforcerowsecurity')
    expect(verifier).toContain('has_table_privilege')
  })
})
