import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260728143952_nutrition_fast_logging.sql',
), 'utf8')
const verifier = readFileSync(join(
  process.cwd(),
  'docs/migrations/verify-nutrition-fast-logging.sql',
), 'utf8')

describe('nutrition fast logging migration', () => {
  it('adds user-owned label provenance and idempotent meal-copy boundaries', () => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toMatch(/^COMMIT;/m)
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.food_catalog_entries')
    expect(migration).toContain('source_nutrition JSONB')
    expect(migration).toContain('corrections JSONB')
    expect(migration).toContain("barcode ~ '^([0-9]{7,8}|[0-9]{12,14})$'")
    expect(migration).toContain('pg_column_size(source_payload) <= 32768')
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_meals_log_request_id')
    expect(migration).toContain('FOREIGN KEY (user_id, source_meal_id)')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE ALL ON TABLE public.food_catalog_entries FROM PUBLIC, anon')
  })

  it('ships rollback-only structure, grant, idempotency, and two-user RLS proof', () => {
    expect(verifier).toMatch(/^BEGIN;/m)
    expect(verifier).toMatch(/^ROLLBACK;/m)
    expect(verifier).not.toMatch(/^COMMIT;/m)
    expect(verifier).toContain('food_catalog_entries must have enabled and forced RLS')
    expect(verifier).toContain('duplicate fast-log request id was accepted')
    expect(verifier).toContain('user 2 can read user 1 food catalog entries')
    expect(verifier).toContain('user 2 referenced user 1 source meal')
    expect(verifier).toContain('anon must not have food_catalog_entries privileges')
  })
})
