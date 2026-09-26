import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { recommendationFixture } from './recommendation-fixture'
import { sqlFile } from './fixture'

// Ordered transactional/authority checks. Real multi-session drain evidence lives
// in scripts/release/local-coaching-pause-rehearsal.mjs, not this PGlite fixture.
let db: PGlite
const migration = () => sqlFile('supabase/migrations/20260923010000_coaching_write_pause.sql')
const tables = ['training_programs', 'training_plan_versions', 'prescribed_sessions',
  'adaptation_proposals', 'coach_weekly_reviews', 'coach_weekly_review_observations']
const state = async () => (await db.query<{ paused: boolean; generation: number; reason: string; changed_at: string }>(
  'SELECT paused,generation,reason,changed_at FROM coaching_write_control')).rows[0]
async function pause(paused: boolean, generation?: number) {
  return db.query('SELECT * FROM set_coaching_write_pause($1,$2,$3)',
    [paused, generation ?? (await state()).generation, 'Synthetic release rehearsal'])
}

beforeAll(async () => {
  db = await recommendationFixture()
  await db.exec(migration())
}, 30_000)
beforeEach(async () => {
  await db.exec('RESET ROLE')
  if ((await state()).paused) await pause(false)
})
afterAll(async () => { await db?.close() })

describe('operator coaching-output write pause', () => {
  it('blocks a legacy first acceptance atomically, resumes, and preserves accepted replay while paused', async () => {
    const owner = randomUUID(), key = randomUUID()
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
    await db.exec('SET ROLE authenticated')
    const intent = { horizon_weeks: 1, primary_domain: 'strength', weeks: [{ week_number: 1 }] }
    const sessions = [{ week_number: 1, session_index: 1, scheduled_date: '2026-09-07',
      prescription: { domain: 'strength', intent: 'Controlled work', dose: {}, effort: 'Controlled',
        rest: 'As needed', success_condition: 'Quality', stop_condition: 'Stop on pain', scale_options: [], evidence: {} } }]
    const args = ['Synthetic pause case', 'Strength', '2026-09-07', '2027-04-01', {}, 'fixture-reference',
      'fixture-policy', intent, {}, sessions, {}, 'a'.repeat(64), key]
    const proposal = (await db.query<{ proposal_id: string; proposed_plan_version_id: string }>(
      `SELECT * FROM create_initial_rolling_weekly_proposal(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args)).rows[0]
    const accept = () => db.transaction(tx => tx.query('SELECT * FROM accept_adaptation_proposal($1,$2)', [proposal.proposal_id, key]))
    const readPlan = async () => (await db.query('SELECT status,intent FROM training_plan_versions WHERE id=$1', [proposal.proposed_plan_version_id])).rows[0]
    const before = await readPlan()
    await db.exec('RESET ROLE')
    await pause(true)
    await db.exec('SET ROLE authenticated')
    await expect(accept()).rejects.toMatchObject({ code: 'PT503' })
    expect(await readPlan()).toEqual(before)
    expect((await db.query('SELECT status FROM adaptation_proposals WHERE id=$1', [proposal.proposal_id])).rows[0]).toEqual({ status: 'proposed' })
    await db.exec('RESET ROLE')
    await pause(false)
    await db.exec('SET ROLE authenticated')
    const accepted = await accept()
    expect(await readPlan()).toEqual({ status: 'accepted', intent })
    await db.exec('RESET ROLE')
    await pause(true)
    await db.exec('SET ROLE authenticated')
    expect((await accept()).rows).toEqual(accepted.rows)
    expect(await readPlan()).toEqual({ status: 'accepted', intent })
  })

  it.each(['anon', 'authenticated', 'service_role'])('denies %s access to pause controls and guard helper', async role => {
    const before = await state()
    await db.exec(`SET ROLE ${role}`)
    await expect(db.query('SELECT * FROM coaching_write_control')).rejects.toMatchObject({ code: '42501' })
    await expect(db.query("SELECT * FROM set_coaching_write_pause(true,0,'Unauthorized pause')")).rejects.toMatchObject({ code: '42501' })
    await expect(db.query('SELECT assert_coaching_writes_open()')).rejects.toMatchObject({ code: '42501' })
    await db.exec('RESET ROLE')
    expect(await state()).toEqual(before)
  })

  it.each(tables)('blocks direct statements against %s even when they match no records', async table => {
    await pause(true)
    await expect(db.exec(`DELETE FROM public.${table} WHERE false`)).rejects.toMatchObject({ code: 'PT503' })
  })

  it('rejects stale resume commands and preserves a pause across migration reapplication', async () => {
    const old = await state()
    await pause(true)
    const paused = await state()
    await expect(pause(false, old.generation)).rejects.toMatchObject({ code: '40001' })
    expect(await state()).toEqual(paused)
    await db.exec(migration())
    expect(await state()).toEqual(paused)
    await pause(false, paused.generation)
    expect((await state()).paused).toBe(false)
    await expect(db.exec('DELETE FROM coach_weekly_reviews WHERE false')).resolves.toBeDefined()
  })

  it('fails closed when operator state is absent, with the fixture mutation rolled back', async () => {
    const before = await state()
    await expect(db.transaction(async tx => {
      await tx.exec('DELETE FROM coaching_write_control')
      await tx.exec('DELETE FROM coach_weekly_reviews WHERE false')
    })).rejects.toMatchObject({ code: 'PT503' })
    expect(await state()).toEqual(before)
  })

  it('rejects invalid operator requests without altering state', async () => {
    const before = await state()
    await expect(db.query("SELECT * FROM set_coaching_write_pause(NULL,0,'Invalid pause')")).rejects.toMatchObject({ code: '22023' })
    expect(await state()).toEqual(before)
  })
})
