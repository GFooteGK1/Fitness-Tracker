import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { toLegacyDailyCheckIn, type DailyCheckIn, type LegacyDailyCheckIn } from '../../app/lib/coach/daily-check-in'
import { sqlFile } from './fixture'

const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const today = '2026-11-21'
const tomorrow = '2026-11-22'
const historicalDate = '2026-11-20'
const typical = { stress: 'usual', fatigue: 'usual', sleep: 'usual', soreness: 'usual', motivation: 'usual' } as const
const edited = { stress: 'lower', fatigue: 'higher', sleep: 'worse', soreness: 'higher', motivation: 'lower' } as const
const rated = { stress: 1, fatigue: 2, sleep: 4, soreness: 5, motivation: 3 } as const
const noRatings = { stress: null, fatigue: null, sleep: null, soreness: null, motivation: null }
let db: PGlite

async function asOwner(userId: string) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId])
  await db.exec('SET LOCAL ROLE authenticated')
}

async function asDraftWriter() {
  await db.exec('SET LOCAL ROLE service_role')
}

// Simulates the existing writer, including a rollback to the deployed binary.
async function store(userId: string, date: string, checkIn: LegacyDailyCheckIn) {
  const { stress, fatigue, sleep, soreness, motivation } = checkIn
  return (await db.query<LegacyDailyCheckIn>(`
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
  return (await db.query<LegacyDailyCheckIn>(`
    SELECT stress, fatigue, sleep, soreness, motivation FROM public.coach_daily_checkins
    WHERE user_id = $1 AND local_date = $2
  `, [userId, date])).rows
}

const ratingFields = 'stress_rating AS stress, fatigue_rating AS fatigue, sleep_rating AS sleep, soreness_rating AS soreness, motivation_rating AS motivation'

async function storeRatings(userId: string, date: string, checkIn: DailyCheckIn, legacy = toLegacyDailyCheckIn(checkIn)) {
  return (await db.query<DailyCheckIn>(`
    INSERT INTO public.coach_daily_checkins(
      user_id, local_date, stress, fatigue, sleep, soreness, motivation,
      stress_rating, fatigue_rating, sleep_rating, soreness_rating, motivation_rating
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (user_id, local_date) DO UPDATE SET
      stress = EXCLUDED.stress, fatigue = EXCLUDED.fatigue, sleep = EXCLUDED.sleep,
      soreness = EXCLUDED.soreness, motivation = EXCLUDED.motivation,
      stress_rating = EXCLUDED.stress_rating, fatigue_rating = EXCLUDED.fatigue_rating, sleep_rating = EXCLUDED.sleep_rating,
      soreness_rating = EXCLUDED.soreness_rating, motivation_rating = EXCLUDED.motivation_rating
    RETURNING ${ratingFields}
  `, [userId, date, legacy.stress, legacy.fatigue, legacy.sleep, legacy.soreness, legacy.motivation,
    checkIn.stress, checkIn.fatigue, checkIn.sleep, checkIn.soreness, checkIn.motivation])).rows
}

async function readRatings(userId: string, date: string) {
  return (await db.query(`
    SELECT ${ratingFields} FROM public.coach_daily_checkins
    WHERE user_id = $1 AND local_date = $2
  `, [userId, date])).rows
}

async function readDraftState(userId: string, date: string) {
  return (await db.query<{ revision: string; draft: { date: string; title: string } | null }>(`
    SELECT check_in_revision AS revision, session_draft AS draft
    FROM public.coach_daily_checkins WHERE user_id = $1 AND local_date = $2
  `, [userId, date])).rows[0]
}

async function storeDraft(userId: string, date: string, revision: string, draft: { date: string; title: string }) {
  return (await db.query(`
    UPDATE public.coach_daily_checkins SET session_draft = $1::jsonb
    WHERE user_id = $2 AND local_date = $3 AND check_in_revision = $4
    RETURNING user_id
  `, [JSON.stringify(draft), userId, date, revision])).rows
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
  await store(owner, historicalDate, edited)
  await db.exec(sqlFile('supabase/migrations/20261122135004_coach_daily_checkin_ratings.sql'))
  await db.exec(sqlFile('supabase/migrations/20261126132624_coach_daily_session_draft.sql'))
}, 30_000)

beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK') })
afterAll(async () => { await db?.close() })

describe('daily coaching check-in persistence', () => {
  it('preserves historical answers without inventing numeric ratings', async () => {
    await asOwner(owner)
    expect(await read(owner, historicalDate)).toEqual([edited])
    expect(await readRatings(owner, historicalDate)).toEqual([noRatings])
    expect(await readDraftState(owner, historicalDate)).toEqual({ revision: expect.any(String), draft: null })
  })

  it('stores exact ratings and updates the same date with its legacy projection', async () => {
    await asOwner(owner)
    expect(await storeRatings(owner, today, rated)).toEqual([rated])
    const projected = { stress: 'higher', fatigue: 'higher', sleep: 'better', soreness: 'lower', motivation: 'usual' }
    expect(await read(owner, today)).toEqual([projected])

    const editedRatings = { stress: 2, fatigue: 1, sleep: 5, soreness: 4, motivation: 3 } as const
    expect(await storeRatings(owner, today, editedRatings)).toEqual([editedRatings])
    expect(await storeRatings(owner, today, editedRatings)).toEqual([editedRatings])
    expect(await readRatings(owner, today)).toEqual([editedRatings])
    expect(await read(owner, today)).toEqual([projected])

    const newProjection = { stress: 3, fatigue: 4, sleep: 1, soreness: 3, motivation: 5 } as const
    expect(await storeRatings(owner, today, newProjection)).toEqual([newProjection])
    expect(await read(owner, today)).toEqual([
      { stress: 'usual', fatigue: 'lower', sleep: 'worse', soreness: 'usual', motivation: 'higher' },
    ])
  })

  it.each([1, 2, 3, 4, 5] as const)('accepts the application’s legacy projection for rating %s in every field', async rating => {
    await asOwner(owner)
    const checkIn = { stress: rating, fatigue: rating, sleep: rating, soreness: rating, motivation: rating }
    expect(await storeRatings(owner, today, checkIn)).toEqual([checkIn])
    expect(await read(owner, today)).toEqual([toLegacyDailyCheckIn(checkIn)])
  })

  it.each([
    { stress: 'lower' }, { fatigue: 'usual' }, { sleep: 'worse' }, { soreness: 'higher' }, { motivation: 'higher' },
  ] as const)('rejects a stored legacy category inconsistent with its rating: %j', async mismatch => {
    await asOwner(owner)
    const contradictory = { ...toLegacyDailyCheckIn(rated), ...mismatch }
    await expect(storeRatings(owner, today, rated, contradictory)).rejects.toMatchObject({
      code: '23514', constraint: 'coach_daily_checkins_ratings_check',
    })
  })

  it('retains exact ratings on a legacy no-op and clears them on a legacy correction', async () => {
    await asOwner(owner)
    await storeRatings(owner, today, rated)
    const projected = toLegacyDailyCheckIn(rated)
    await store(owner, today, projected)
    expect(await readRatings(owner, today)).toEqual([rated])
    await store(owner, today, edited)
    expect(await read(owner, today)).toEqual([edited])
    expect(await readRatings(owner, today)).toEqual([noRatings])
    await store(owner, today, projected)
    expect(await readRatings(owner, today)).toEqual([noRatings])
  })

  it.each([null, 0, 6])('rejects an incomplete or out-of-range rating of %s', async rating => {
    await asOwner(owner)
    await storeRatings(owner, today, rated)
    await expect(db.query('UPDATE public.coach_daily_checkins SET stress_rating = $1 WHERE user_id = $2 AND local_date = $3',
      [rating, owner, today])).rejects.toMatchObject({ code: '23514' })
  })

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

  it('retains a draft across same-day readback and unchanged numeric and legacy submissions', async () => {
    await asOwner(owner)
    await storeRatings(owner, today, rated)
    const { revision } = await readDraftState(owner, today)
    const draft = { date: today, title: 'Upper-body strength' }
    await asDraftWriter()
    expect(await storeDraft(owner, today, revision, draft)).toEqual([{ user_id: owner }])
    await asOwner(owner)
    await storeRatings(owner, today, rated)
    await store(owner, today, toLegacyDailyCheckIn(rated))
    expect(await readDraftState(owner, today)).toEqual({ revision, draft })
    expect(await readDraftState(owner, tomorrow)).toBeUndefined()
    await storeRatings(owner, tomorrow, rated)
    expect(await readDraftState(owner, tomorrow)).toEqual({ revision: expect.any(String), draft: null })
    expect(await readDraftState(owner, today)).toEqual({ revision, draft })
  })

  it('clears the draft on a check-in change and rejects a delayed save after the scores change back', async () => {
    await asOwner(owner)
    await storeRatings(owner, today, rated)
    const draft = { date: today, title: 'Upper-body strength' }
    const { revision: first } = await readDraftState(owner, today)
    await asDraftWriter()
    await storeDraft(owner, today, first, draft)
    await asOwner(owner)
    // 1 and 2 have the same qualitative projection but are different ratings.
    await storeRatings(owner, today, { ...rated, stress: 2 })
    const { revision: second, draft: invalidated } = await readDraftState(owner, today)
    expect(invalidated).toBeNull()
    expect(second).not.toBe(first)
    await storeRatings(owner, today, rated)
    const { revision: third } = await readDraftState(owner, today)
    expect(third).not.toBe(first)
    await asDraftWriter()
    expect(await storeDraft(owner, today, first, draft)).toEqual([])
    expect(await storeDraft(owner, today, third, draft)).toEqual([{ user_id: owner }])
    await asOwner(owner)
    await store(owner, today, edited)
    expect(await readDraftState(owner, today)).toEqual({ revision: expect.not.stringMatching(third), draft: null })
    expect(await readRatings(owner, today)).toEqual([noRatings])
  })

  it('keeps saved drafts private to the check-in owner', async () => {
    await storeRatings(other, today, rated)
    const { revision } = await readDraftState(other, today)
    const draft = { date: today, title: 'Upper-body strength' }
    await asDraftWriter()
    await storeDraft(other, today, revision, draft)
    await asOwner(owner)
    expect(await readDraftState(other, today)).toBeUndefined()
    await asOwner(other)
    expect(await readDraftState(other, today)).toEqual({ revision, draft })
  })

  it('rejects a direct draft write by the authenticated check-in owner', async () => {
    await asOwner(owner)
    await storeRatings(owner, today, rated)
    const { revision } = await readDraftState(owner, today)
    await expect(storeDraft(owner, today, revision, { date: today, title: 'Upper-body strength' }))
      .rejects.toMatchObject({ code: '42501' })
  })

  it('rejects a draft whose date differs from the saved check-in', async () => {
    await asOwner(owner)
    await storeRatings(owner, today, rated)
    const { revision } = await readDraftState(owner, today)
    await asDraftWriter()
    await expect(storeDraft(owner, today, revision, { date: tomorrow, title: 'Upper-body strength' })).rejects.toMatchObject({
      code: '23514', constraint: 'coach_daily_checkins_session_draft_date_check',
    })
  })

  it('hides other owners and rejects a cross-owner upsert', async () => {
    await storeRatings(other, today, rated)
    await asOwner(owner)
    expect(await read(other, today)).toEqual([])
    expect(await readRatings(other, today)).toEqual([])
    expect(await store(owner, today, typical)).toEqual([typical])
    await expect(storeRatings(other, today, rated)).rejects.toMatchObject({ code: '42501' })
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
      { role: 'authenticated', can_read: true, can_insert: false, can_update: false, can_delete: false },
      { role: 'service_role', can_read: false, can_insert: false, can_update: false, can_delete: false },
    ])
    const { rows: columnGrants } = await db.query(`
      SELECT role, column_name,
        has_column_privilege(role, 'public.coach_daily_checkins', column_name, 'INSERT') AS can_insert,
        has_column_privilege(role, 'public.coach_daily_checkins', column_name, 'UPDATE') AS can_update
      FROM (VALUES ('authenticated'), ('service_role')) AS roles(role)
      CROSS JOIN (VALUES ('check_in_revision'), ('session_draft'), ('stress_rating')) AS columns(column_name)
      ORDER BY role, column_name
    `)
    expect(columnGrants).toEqual([
      { role: 'authenticated', column_name: 'check_in_revision', can_insert: false, can_update: false },
      { role: 'authenticated', column_name: 'session_draft', can_insert: false, can_update: false },
      { role: 'authenticated', column_name: 'stress_rating', can_insert: true, can_update: true },
      { role: 'service_role', column_name: 'check_in_revision', can_insert: false, can_update: false },
      { role: 'service_role', column_name: 'session_draft', can_insert: false, can_update: true },
      { role: 'service_role', column_name: 'stress_rating', can_insert: false, can_update: false },
    ])
    await store(owner, today, typical)
    await store(other, today, edited)
    await db.query('DELETE FROM auth.users WHERE id = $1', [owner])
    expect(await read(owner, today)).toEqual([])
    expect(await read(other, today)).toEqual([edited])
  })
})
