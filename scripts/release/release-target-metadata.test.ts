import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { recommendationFixture } from '../../test/database/recommendation-fixture'
import { sqlFile } from '../../test/database/fixture'
import { RELEASE_TARGET_METADATA_SQL, RELEASE_MIGRATIONS, RELEASE_PROJECT, releaseMigrationManifest, classifyReleaseTargetMetadata } from './release-target-metadata.mjs'

const baseline = JSON.parse(readFileSync('docs/verification/programming-quality/release-catalog-baseline-2026-09-23.json', 'utf8')).comparison
const hosted = JSON.parse(readFileSync('docs/verification/programming-quality/hosted-catalog-comparison-2026-09-23.json', 'utf8'))
const transport = { projectRef: RELEASE_PROJECT, fixedTargetVerified: true, tlsVerifyFull: true }
let db: PGlite
let before: any
const readMetadata = async () => {
  const result = await db.exec(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
    SET LOCAL row_security=off; SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='5s';
    ${RELEASE_TARGET_METADATA_SQL} ROLLBACK;`)
  return result.flatMap(item => item.rows).find((row: any) => row.release_target_metadata)?.release_target_metadata as any
}
beforeAll(async () => {
  db = await recommendationFixture()
  // Synthetic migration ledger, not an imported production ledger.
  await db.exec('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text)')
  for (const file of RELEASE_MIGRATIONS.slice(0, 7)) await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES($1,$2)', [file.slice(0, 14), file.slice(15, -4)])
  before = await readMetadata()
}, 30_000)
afterAll(async () => { await db?.close() })

function classifiedFixture() {
  // Classifier counterfactual only: model the saved hosted receipt explicitly.
  // Actual execution above remains local PG18 and is not claimed as live evidence.
  const value = structuredClone(before)
  value.identity = { database: 'postgres', role: 'postgres', login: 'cli_login_postgres', versionNum: '170006', ssl: true,
    observedAt: '2026-09-23T20:00:00Z', readOnly: 'on', isolation: 'repeatable read', rowSecurity: 'off', statementTimeoutMs: 120000, lockTimeoutMs: 5000 }
  value.functions = hosted.liveFunctionHashes.map((hash: string, i: number) => ['synthetic-function-identity-' + i, '', hash])
  const old = value.groups.filter((row: any[]) => row[0] !== 'coach_context_revisions' && row[0] !== 'coaching_write_control')
  for (let i = 0; i < old.length; i++) old[i][3] = hosted.liveGroupHashes[i]
  return value
}

describe('read-only release target metadata', () => {
  it('executes catalog-only query against actual prerequisite migrations and synthetic ledger', () => {
    expect(before.identity.readOnly).toBe('on')
    expect(before.identity.isolation).toBe('repeatable read')
    expect(before.identity.rowSecurity).toBe('off')
    expect(before.relations).toHaveLength(16)
    expect(before.groups).toHaveLength(80)
    expect(before.functions).toEqual(baseline.functions)
    expect(before.groups.filter((row: any[]) => !['coach_context_revisions', 'coaching_write_control'].includes(row[0]))).toEqual(baseline.groups)
    expect(before.ledger.filter((row: any) => row.recorded)).toHaveLength(7)
    expect(before.functionAccess.filter((row: any) => row.present)).toHaveLength(6)
    expect(before.postgresRole.superuser || before.postgresRole.bypassRls).toBe(true)
    expect(RELEASE_TARGET_METADATA_SQL).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CALL|SET|ALTER|CREATE|DROP)\b/i)
    expect(RELEASE_TARGET_METADATA_SQL).not.toMatch(/public\.[a-z_]+\s*\(/i)
  })

  it('binds exact prior hosted fingerprints and transport independently from synthetic SQL checks', () => {
    const value = classifiedFixture()
    expect(classifyReleaseTargetMetadata(value, transport)).toMatchObject({ passed: true, state: 'reviewed_pre_install_baseline', missingReleaseMigrations: ['20260921010000', '20260923010000'] })
    expect(classifyReleaseTargetMetadata(before, transport).passed).toBe(false)
    for (const override of [{}, { ...transport, projectRef: 'other' }, { ...transport, fixedTargetVerified: false }, { ...transport, tlsVerifyFull: false }]) expect(classifyReleaseTargetMetadata(value, override).checks.fixedTarget).toBe(false)
  })

  it('distinguishes observed pooler backend SSL from mandatory verified client TLS', () => {
    const value = classifiedFixture()
    value.identity.ssl = false
    expect(classifyReleaseTargetMetadata(value, transport).passed).toBe(true)
    expect(classifyReleaseTargetMetadata(value, { ...transport, tlsVerifyFull: false }).passed).toBe(false)
    for (const ssl of [null, undefined, 'false']) {
      value.identity.ssl = ssl
      expect(classifyReleaseTargetMetadata(value, transport).checks.backendSslObserved).toBe(false)
    }
  })

  it('qualifies only the proven one-group count28 UUID default representation and retains raw inequality', () => {
    const value = classifiedFixture()
    const row = value.groups.find((group: any[]) => group[0] === 'workouts' && group[1] === 'columns')
    row[2] = 28
    row[3] = '66f7424856047a9ba8407991d8fb12c4'
    const result = classifyReleaseTargetMetadata(value, transport)
    expect(result.passed).toBe(true)
    expect(result.metadataComparison.rawExistingMetadataUnchanged).toBe(false)
    expect(result.metadataComparison.qualifications).toEqual([expect.objectContaining({ rule: 'exact-workout-default-deparser-qualification', relation: 'workouts', category: 'columns', count: 28 })])
    const historical = classifyReleaseTargetMetadata(classifiedFixture(), transport)
    expect(historical.metadataComparison).toEqual({ rawExistingMetadataUnchanged: true, qualifications: [] })
    for (const override of [[2, 27], [2, 29], [3, '66f7424856047a9ba8407991d8fb12c5'], [0, 'coach_memories'], [1, 'constraints']]) {
      const changed = structuredClone(value)
      const changedRow = changed.groups.find((group: any[]) => group[0] === 'workouts' && group[1] === 'columns')
      changedRow[override[0] as number] = override[1]
      expect(classifyReleaseTargetMetadata(changed, transport).passed).toBe(false)
    }
    value.groups.find((group: any[]) => group[0] === 'coach_memories')[3] = '0'.repeat(32)
    expect(classifyReleaseTargetMetadata(value, transport).passed).toBe(false)
  })

  it('fails closed on missing prerequisites, unexpected applied release migrations, RLS and RPC drift', () => {
    const variants = [
      (x: any) => { x.identity.readOnly = 'off' }, (x: any) => { x.identity.login = 'postgres' },
      (x: any) => { x.identity.ssl = null }, (x: any) => { x.identity.statementTimeoutMs = 0 },
      (x: any) => { x.postgresRole = { superuser: false, bypassRls: false } },
      (x: any) => { x.ledger[0].recorded = false }, (x: any) => { x.ledger[7].recorded = true },
      (x: any) => { x.newerLedger.push('20260924000000') },
      (x: any) => { x.relations.find((row: any[]) => row[0] === 'workouts')[3] = false },
      (x: any) => { x.functions[0][2] = '0'.repeat(32) },
      (x: any) => { x.groups.find((row: any[]) => row[0] === 'workouts')[3] = '0'.repeat(32) },
      (x: any) => { x.functionAccess.find((row: any) => row.name === 'accept_adaptation_proposal').execute.anon = true },
      (x: any) => { x.functionAccess.find((row: any) => row.name === 'assert_coach_review_sources').execute.authenticated = true },
      (x: any) => { x.functionAccess.find((row: any) => row.name === 'record_coach_weekly_review').proconfig = ['search_path=public'] },
      (x: any) => { x.functionAccess.find((row: any) => row.name === 'set_coaching_write_pause').present = true },
    ]
    for (const change of variants) { const value = classifiedFixture(); change(value); expect(classifyReleaseTargetMetadata(value, transport).passed).toBe(false) }
    expect(classifyReleaseTargetMetadata({}, transport).passed).toBe(false)
  })

  it('reports current candidate file hashes separately from ledger and catalog hashes', () => {
    const files = releaseMigrationManifest()
    expect(files).toHaveLength(9)
    expect(files.map(row => row.file)).toEqual(RELEASE_MIGRATIONS)
    expect(files.every(row => /^[a-f0-9]{64}$/.test(row.sha256))).toBe(true)
  })

  it('detects pause and revision installation without invoking either new RPC or reading pause rows', async () => {
    await db.exec(sqlFile('supabase/migrations/20260923010000_coaching_write_pause.sql'))
    await db.exec(sqlFile('supabase/migrations/20260921010000_coach_proposal_context_revision.sql'))
    const after = await readMetadata()
    expect(after.relations.filter((row: any[]) => ['coach_context_revisions', 'coaching_write_control'].includes(row[0])).every((row: any[]) => row[1] && row[2] && row[3])).toBe(true)
    const classified = classifyReleaseTargetMetadata(after, transport)
    expect(classified.checks.newRelationsAbsent).toBe(false)
    expect(classified.checks.internalHelpersAbsent).toBe(false)
    expect(classified.checks.existingMetadataMatchesReviewedDefinitions).toBe(false)
    expect(classified.checks.publicFunctionDefinitionsUnchanged).toBe(false)
    const revisionRows = await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.coach_context_revisions')
    expect(revisionRows.rows[0].count).toBe(0)
  }, 30_000)
})
