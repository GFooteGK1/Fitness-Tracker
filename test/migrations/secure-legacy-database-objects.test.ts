import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260730151344_secure_legacy_database_objects.sql',
), 'utf8')
const documentedMigration = readFileSync(join(
  process.cwd(),
  'docs/migrations/secure-legacy-database-objects-migration.sql',
), 'utf8')
const verifier = readFileSync(join(
  process.cwd(),
  'docs/migrations/verify-secure-legacy-database-objects.sql',
), 'utf8')

describe('legacy database object security migration', () => {
  it('ships the exact reviewed migration through the Supabase migration chain', () => {
    expect(migration).toBe(documentedMigration)
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toMatch(/^COMMIT;/m)
  })

  it.each([
    'whoop_recovery_backup',
    'whoop_sleep_backup',
    'whoop_workouts_backup',
  ])('locks down %s without deleting it', tableName => {
    expect(migration).toContain(`ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY`)
    expect(migration).toContain(`ALTER TABLE public.${tableName} FORCE ROW LEVEL SECURITY`)
    expect(migration).toContain(`REVOKE ALL PRIVILEGES ON TABLE public.${tableName}`)
    expect(migration).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${tableName}`)
  })

  it('repairs and de-exposes the legacy meal-workout function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_meals_around_workout')
    expect(migration).toContain('SECURITY INVOKER')
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain("m.items -> 0 ->> 'food'")
    expect(migration).not.toContain('m.meal_name')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('TO service_role')
  })

  it('ships rollback-only privilege, execution, and row-preservation proof', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('must have enabled and forced RLS')
    expect(verifier).toContain('remains reachable by a Data API user role')
    expect(verifier).toContain('get_meals_around_workout remains publicly executable')
    expect(verifier).toContain('Backup-table row counts changed during verification')
  })
})
