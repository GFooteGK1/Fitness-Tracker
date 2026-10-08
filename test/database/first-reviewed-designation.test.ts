import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'

describe('private first reviewed-week designation authority', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const { owner, reviewer, foreign, program, base } = lifecycleIds
  beforeAll(async () => {
    f = await supervisedLifecycleFixture(true, true, true)
    await f.db.exec(sqlFile('supabase/migrations/20261005120000_first_reviewed_designation.sql'))
  }, 30000)
  beforeEach(async () => { await f.db.exec('BEGIN') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  function args(overrides: Record<string, unknown> = {}) {
    return { id: randomUUID(), program, owner, base, reviewer, expected: 0, target: '2026-10-05',
      enabled: true, expiry: new Date(Date.now() + 60000).toISOString(), ref: 'disposable first-review qualification', ...overrides }
  }
  async function version(input = args(), role = 'service_role') {
    await f.actor(owner, role)
    return f.scalar<{ designationId: string; version: number; enabled: boolean }>(
      'SELECT version_first_review_designation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value', Object.values(input))
  }
  async function rejection(operation: () => Promise<unknown>, code: string) {
    await f.db.exec('SAVEPOINT rejection')
    try { await expect(operation()).rejects.toMatchObject({ code }) }
    finally { await f.db.exec('ROLLBACK TO SAVEPOINT rejection; RELEASE SAVEPOINT rejection') }
  }
  it('installs private forced-RLS authority without grants, rows, enrollment or lineage', async () => {
    await f.db.exec('RESET ROLE')
    expect(await f.scalar("SELECT relrowsecurity AND relforcerowsecurity AS value FROM pg_class WHERE oid='public.coach_first_review_designations'::regclass")).toBe(true)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_designations')).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_enrollments')).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(0)
    await f.actor()
    await rejection(() => f.scalar('SELECT count(*) AS value FROM coach_first_review_designations'), '42501')
    await rejection(() => version(args(), 'authenticated'), '42501')
  })
  it('creates scope through the operator function, preserving the exact original retry and rejecting identity reuse', async () => {
    const input = args(), saved = await version(input)
    expect(saved).toMatchObject({ designationId: input.id, version: 1, enabled: true })
    expect(await version(input)).toEqual(saved)
    await rejection(() => version({ ...input, reviewer: foreign }), '22023')
    await rejection(() => version(args()), '40001')
  })
  it.each(['adjacent', 'wrong_owner', 'wrong_base', 'expired', 'non_monday', 'infinite_date', 'negative_infinite_date'])(
    'rejects a designation with %s scope', async failure => {
      const input = args()
      if (failure === 'adjacent') input.target = '2026-09-21'
      if (failure === 'wrong_owner') input.owner = foreign
      if (failure === 'wrong_base') input.base = randomUUID()
      if (failure === 'expired') input.expiry = new Date(Date.now() - 60000).toISOString()
      if (failure === 'non_monday') input.target = '2026-10-06'
      if (failure === 'infinite_date') input.target = 'infinity'
      if (failure === 'negative_infinite_date') input.target = '-infinity'
      await rejection(() => version(input), ['expired', 'non_monday', 'infinite_date', 'negative_infinite_date'].includes(failure) ? '22023' : '55000')
    })
  it('revokes with a new version, denies old authority, preserves owner discovery and hides revoked reviewer scope', async () => {
    const input = args(); await version(input)
    await f.db.exec('RESET ROLE')
    await f.scalar('SELECT assert_first_review_designation_current($1) AS value', [input.id])
    await version({ ...input, id: randomUUID(), expected: 1, enabled: false })
    await f.db.exec('RESET ROLE')
    await rejection(() => f.scalar('SELECT assert_first_review_designation_current($1) AS value', [input.id]), '55000')
    await f.actor(owner)
    expect(await f.scalar('SELECT get_first_review_designation($1) AS value', [input.id])).toMatchObject({ designationId: input.id })
    await f.actor(reviewer)
    expect(await f.scalar('SELECT get_first_review_designation($1) AS value', [input.id])).toBe(null)
  })
  it('allows bounded current reviewer discovery, denies foreign actors, and retains immutable designation history', async () => {
    const input = args(); await version(input)
    await f.actor(reviewer)
    expect(await f.scalar('SELECT get_first_review_designation($1) AS value', [input.id])).toMatchObject({ reviewerId: reviewer })
    await f.actor(foreign)
    expect(await f.scalar('SELECT get_first_review_designation($1) AS value', [input.id])).toBe(null)
    await f.db.exec('RESET ROLE')
    await rejection(() => f.db.query('UPDATE coach_first_review_designations SET enabled=false WHERE id=$1', [input.id]), '55000')
    await rejection(() => f.db.query('DELETE FROM coach_first_review_designations WHERE id=$1', [input.id]), '55000')
  })
  it('checks expiry and current base again even when the version is unchanged', async () => {
    const input = args({ expiry: new Date(Date.now() + 250).toISOString() }); await version(input)
    await new Promise(resolve => setTimeout(resolve, 350))
    await f.db.exec('RESET ROLE')
    await rejection(() => f.scalar('SELECT assert_first_review_designation_current($1) AS value', [input.id]), '55000')
    // Expired retries are observations, never a new grant or a revived version.
    expect(await version(input)).toMatchObject({ version: 1 })
  })
})
