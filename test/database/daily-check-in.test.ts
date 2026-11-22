import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DailyCheckIn } from '../../app/lib/coach/daily-check-in'
import { sqlFile } from './fixture'

const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const today = '2026-11-21'
const tomorrow = '2026-11-22'
const typical = { stress: 'usual', fatigue: 'usual', sleep: 'usual', soreness: 'usual', motivation: 'usual' } as const
const edited = { stress: 'lower', fatigue: 'higher', sleep: 'worse', soreness: 'higher', motivation: 'lower' } as const
let db: PGlite

async function asOwner(userId: string) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId])
  await db.exec('SET LOCAL ROLE authenticated')
}

async function store(userId: string, date: string, checkIn: DailyCheckIn) {
  const { stress, fatigue, sleep, soreness, motivation } = checkIn
  return (await db.query<DailyCheckIn>(`
    INSERT INTO public.coach_daily_checkins(user_id, local_date, stress, fatigue, sleep, soreness, motivation)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id, local_date) DO UPDATE SET
      user_id = EXCLUDED.user_id, local_date = EXCLUDED.local_date, stress = EXCLUDED.stress,
      fatigue = EXCLUDED.fatigue, sleep = EXCLUDED.sleep, soreness = EXCLUDED.soreness,
      motivation = EXCLUDED.motivation
    RETURNING stress, fatigue, sleep, soreness, motivation
  `, [userId, date, stress, fatigue, sleep, soreness, motivation])).rows
}

async function read(userId: string, date: string) {
  return (await db.query<DailyCheckIn>(`
    SELECT stress, fatigue, sleep, soreness, motivation FROM public.coach_daily_checkins
    WHERE user_id = $1 AND local_date = $2
  `, [userId, date])).rows
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  `)
  await db.query('INSERT INTO auth.users (id) VALUES ($1), ($2)', [owner, other])
  await db.exec(sqlFile('supabase/migrations/20261122002519_coach_daily_checkins.sql'))
}, 30_000)

beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK') })
afterAll(async () => { await db?.close() })

describe('daily coaching check-in persistence', () => {
  it('stores one exact set of answers for each local date and replaces the current day on edit', async () => {
    await asOwner(owner)
    expect(await read(owner, today)).toEqual([])
    expect(await store(owner, today, typical)).toEqual([typical])
    expect(await store(owner, today, typical)).toEqual([typical])
    expect(await read(owner, today)).toEqual([typical])
    expect(await read(owner, tomorrow)).toEqual([])

    expect(await store(owner, today, edited)).toEqual([edited])
    expect(await store(owner, tomorrow, typical)).toEqual([typical])
    expect(await read(owner, today)).toEqual([edited])
    expect(await read(owner, tomorrow)).toEqual([typical])
  })

  it('hides other owners and rejects a cross-owner upsert', async () => {
    await store(other, today, edited)
    await asOwner(owner)
    expect(await read(other, today)).toEqual([])
    expect(await store(owner, today, typical)).toEqual([typical])
    await expect(store(other, today, typical)).rejects.toMatchObject({ code: '42501' })
  })

  it('rejects transferring a saved row to another owner', async () => {
    await asOwner(owner)
    await store(owner, today, typical)
    await expect(db.query('UPDATE public.coach_daily_checkins SET user_id = $1 WHERE user_id = $2', [other, owner]))
      .rejects.toMatchObject({ code: '42501' })
  })

  it('rejects a response outside the field scale even from an authenticated owner', async () => {
    await asOwner(owner)
    await expect(db.query(`
      INSERT INTO public.coach_daily_checkins (user_id, local_date, stress, fatigue, sleep, soreness, motivation)
      VALUES ($1, $2, 'usual', 'usual', 'higher', 'usual', 'usual')
    `, [owner, today])).rejects.toMatchObject({ code: '23514' })
  })

  it('limits table grants and removes rows when their Auth user is deleted', async () => {
    const { rows } = await db.query(`
      SELECT role,
        has_table_privilege(role, 'public.coach_daily_checkins', 'SELECT') AS can_read,
        has_table_privilege(role, 'public.coach_daily_checkins', 'INSERT') AS can_insert,
        has_table_privilege(role, 'public.coach_daily_checkins', 'UPDATE') AS can_update,
        has_table_privilege(role, 'public.coach_daily_checkins', 'DELETE') AS can_delete
      FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role)
    `)
    expect(rows).toEqual([
      { role: 'anon', can_read: false, can_insert: false, can_update: false, can_delete: false },
      { role: 'authenticated', can_read: true, can_insert: true, can_update: true, can_delete: false },
      { role: 'service_role', can_read: false, can_insert: false, can_update: false, can_delete: false },
    ])
    await store(owner, today, typical)
    await store(other, today, edited)
    await db.query('DELETE FROM auth.users WHERE id = $1', [owner])
    expect(await read(owner, today)).toEqual([])
    expect(await read(other, today)).toEqual([edited])
  })
})
