import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { recommendationFixture } from '../../test/database/recommendation-fixture'
import { CUTOVER_MIGRATIONS, verifiedMigrationSource, migrationLedgerInsertSql, renderInstallSql, renderPauseSql, renderReadbackSql, cutoverCatalogSql, compareCutoverCatalog } from './cutover-migrations.mjs'

let db: PGlite
const snapshots: Record<string, any> = {}
const fixturePath = 'scripts/release/cutover-migrations.expected.json'
beforeAll(async () => {
  db = await recommendationFixture()
  for (const stage of ['pause', 'revision']) {
    await db.exec(verifiedMigrationSource(stage))
    const rows = await db.exec(`BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; ${cutoverCatalogSql(stage)} ROLLBACK;`)
    snapshots[stage] = (rows.flatMap(row => row.rows).find((row: any) => row.cutover_catalog) as any).cutover_catalog
  }
  if (process.env.CUTOVER_WRITE_FIXTURE === '1') writeFileSync(fixturePath, JSON.stringify({ kind: 'synthetic_exact_migration_catalog', source: 'recommendationFixture then exact pause then exact revision migrations; PostgreSQL18 PGlite, independently checked on local PostgreSQL17 before operator use', migrations: CUTOVER_MIGRATIONS, snapshots }, null, 2) + '\n')
}, 30_000)
afterAll(async () => { await db?.close() })

describe('exact-file cutover preparation', () => {
  it('pins both originals and preserves original transaction envelope around atomic ledger insertion', () => {
    for (const stage of ['pause', 'revision']) {
      const sql = renderInstallSql(stage, { expectedGeneration: '7' })
      const original = verifiedMigrationSource(stage)
      expect(sql).toContain(CUTOVER_MIGRATIONS[stage as 'pause'].sha256)
      // The literal ledger source may itself contain BEGIN/COMMIT; locate the
      // executable envelope using the deliberately inserted ledger marker.
      const insertion = sql.indexOf('-- Atomic with the original migration:')
      expect(insertion).toBeGreaterThan(sql.indexOf('LOCK TABLE supabase_migrations.schema_migrations'))
      expect(sql.slice(0, insertion)).toContain(original.slice(original.indexOf('BEGIN;') + 6, original.lastIndexOf('COMMIT;')))
      expect(sql.lastIndexOf('COMMIT;')).toBeGreaterThan(insertion)
      expect(sql).toContain('statements)\nVALUES')
      expect(sql).not.toMatch(/\]::text\[\]\)\s*ON CONFLICT/)
    }
    expect(renderInstallSql('revision', { expectedGeneration: '7' })).toContain('FOR UPDATE NOWAIT')
    expect(renderInstallSql('revision', { expectedGeneration: '7' })).toContain('v_generation <> 7::bigint')
    expect(() => renderInstallSql('revision')).toThrow(/generation/)
    expect(() => renderInstallSql('pause', { targetDatabase: 'other' })).toThrow(/database/)
  })

  it('requires explicit generation and bounded safely quoted operator reason', () => {
    const sql = renderPauseSql({ paused: true, expectedGeneration: '7', reason: "Greg's reviewed cutover" })
    expect(sql).toContain("TRUE,7::bigint,E'Greg''s reviewed cutover'")
    expect(sql).toContain('generation=8')
    expect(sql).toContain('COMMIT;')
    for (const expectedGeneration of ['-1', '7;SELECT 1', '9223372036854775807', '01', 1]) expect(() => renderPauseSql({ paused: false, expectedGeneration, reason: 'Reviewed resume' })).toThrow()
    expect(() => renderPauseSql({ paused: false, expectedGeneration: '1', reason: 'x\ny' })).toThrow()
  })

  it('preserves exact original ledger bytes after SQL-editor CRLF-to-LF normalization', async () => {
    await db.exec('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[])')
    for (const stage of ['pause', 'revision']) {
      const original = verifiedMigrationSource(stage)
      const rendered = renderInstallSql(stage, { expectedGeneration: '1' }).replaceAll('\r\n', '\n')
      const insert = migrationLedgerInsertSql(stage)
      expect(rendered).toContain(insert)
      expect(insert).not.toContain('\r')
      await db.exec(insert.replaceAll('\r\n', '\n'))
      const saved = await db.query<{ statements: string[] }>('SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1', [CUTOVER_MIGRATIONS[stage as 'pause'].version])
      expect(saved.rows[0].statements).toEqual([original])
    }
  })

  it('post-install queries inspect catalog, ledger and gate without invoking application RPCs', () => {
    for (const stage of ['pause', 'revision']) {
      const sql = renderReadbackSql(stage)
      expect(sql).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      expect(sql).toContain('exact_original_file')
      expect(sql).toContain('SELECT paused,generation')
      expect(cutoverCatalogSql(stage)).not.toMatch(/public\.(?:get_coach|set_coaching|accept_adaptation|record_coach|create_rolling)\w*\s*\(/)
    }
  })

  it('matches independent exact-migration catalog fixtures and rejects missing or altered controls', () => {
    const expected = JSON.parse(readFileSync(fixturePath, 'utf8'))
    expect(expected.migrations).toEqual(CUTOVER_MIGRATIONS)
    for (const stage of ['pause', 'revision']) {
      expect(compareCutoverCatalog(stage, snapshots[stage], expected.snapshots[stage]).matched).toBe(true)
      for (const section of ['functions', 'relations', 'metadata', 'triggers']) {
        const mutated = structuredClone(snapshots[stage]); mutated[section].pop()
        expect(compareCutoverCatalog(stage, mutated, expected.snapshots[stage]).matched).toBe(false)
      }
      const privilegeDrift = structuredClone(snapshots[stage]); privilegeDrift.functions[0].execute.anon = true
      expect(compareCutoverCatalog(stage, privilegeDrift, expected.snapshots[stage]).matched).toBe(false)
    }
  })
})
