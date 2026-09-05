import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { databaseFixture, sqlFile } from './fixture'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite
const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const fingerprint = 'a'.repeat(64)
async function claim(key: string, hash = fingerprint) {
  return (await db.query<{r: any}>('SELECT begin_logging_request($1,$2) r',[key,hash])).rows[0].r
}
async function athlete(user: string) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user])
}
beforeAll(async () => {
  db = await databaseFixture()
  const migration = sqlFile('supabase/migrations/20260904120000_logging_receipts.sql')
  await db.exec(migration); await db.exec(migration)
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)',[userA,userB])
  await db.exec('SET ROLE authenticated'); await athlete(userA)
},30000)
afterAll(async () => { await db?.close() })

describe('real PostgreSQL logging transactions', () => {
  it('claims once, rejects changed input, and replays the saved response', async () => {
    const first = await claim('request-one')
    expect(first.claimed).toBe(true)
    expect((await claim('request-one')).claimed).toBe(false)
    await expect(claim('request-one','b'.repeat(64))).rejects.toThrow('different input')
    await db.query('SELECT finish_logging_request($1,$2,200)',[first.id,{ok:true}])
    expect((await claim('request-one')).response.ok).toBe(true)
  })
  it('rolls back the workout when block insertion fails, then saves both atomically', async () => {
    const r = await claim('workout-one')
    const record = {workout_date:'2026-09-03',input_text:'test',blocks:[{block_type:'STRENGTH'}],tags:[],rpe:7}
    await expect(db.query('SELECT save_logged_activity($1,$2,$3,$4)',
      ['workout',record,[{block_type:null}],r.id])).rejects.toThrow()
    expect((await db.query('SELECT * FROM workouts')).rows).toHaveLength(0)
    await db.query('SELECT save_logged_activity($1,$2,$3,$4)',
      ['workout',record,[{block_type:'STRENGTH',total_reps:5}],r.id])
    expect((await db.query('SELECT * FROM workouts')).rows).toHaveLength(1)
    expect((await db.query('SELECT * FROM block_scores')).rows).toHaveLength(1)
    expect((await claim('workout-one')).entities).toHaveLength(1)
    expect((await claim('workout-one')).claimed).toBe(false)
  })
  it('commits photo analysis and meal together and exposes no rows to another tenant', async () => {
    const r = await claim('photo-one')
    const record = {meal_timestamp:'2026-09-03T23:59:00Z',items:[{food:'egg'}],total_protein:6,total_carbs:0,total_fat:5,total_calories:69}
    await db.query('SELECT save_logged_activity($1,$2,$3,$4,$5)', ['meal',record,[],r.id,{analysisStatus:'complete',analysis:{total_protein:6}}])
    const replay = await claim('photo-one')
    expect(replay.status).toBe('complete')
    expect(replay.response.mealId).toBe(replay.entities[0].id)
    await athlete(userB)
    expect((await db.query('SELECT * FROM logging_requests')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(0)
    await expect(db.query('SELECT finish_logging_request($1,$2,200)',[r.id,{}])).rejects.toThrow()
    expect((await claim('photo-one')).claimed).toBe(true)
    await athlete(userA)
  })
  it('only marks a confirmed no-write failure as retryable', async () => {
    const empty = await claim('empty-failure')
    const a = await db.query<{r:any}>('SELECT finish_logging_request($1,$2,503) r',[empty.id,{error:'provider unavailable',retrySafe:true}])
    expect(a.rows[0].r.retryAllowed).toBe(true)
    const written = await claim('workout-one')
    const b = await db.query<{r:any}>('SELECT finish_logging_request($1,$2,503) r',[written.id,{error:'response unavailable',retrySafe:true}])
    expect(b.rows[0].r.retryAllowed).toBe(false)
  })
})
