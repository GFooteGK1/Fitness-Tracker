import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture } from './fixture'

// Existing normal-owner permission model in disposable PostgreSQL. This proves
// fixture RLS behavior, not a hosted OAuth/JWT/PostgREST connection.
let db: PGlite
const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const work = '20000000-0000-4000-8000-000000000001'
const foreignWork = '20000000-0000-4000-8000-000000000002'
async function actor(subject: string) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [subject])
  await db.exec('SET ROLE authenticated')
}
beforeAll(async () => {
  db = await databaseFixture()
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [owner, other])
  await db.query(`INSERT INTO workouts(id,user_id,workout_date,input_text,blocks)
    VALUES ($1,$2,'2026-10-18','Owner work','[]'),($3,$4,'2026-10-18','Other work','[]')`, [work, owner, foreignWork, other])
}, 30_000)
beforeEach(async () => { await actor(owner) })
afterAll(async () => { await db?.close() })

describe('accepted personal-pilot normal owner credential boundary', () => {
  it('can directly read own domain records; credential access is broader than the tool', async () => {
    expect((await db.query('SELECT id FROM workouts')).rows).toEqual([{ id: work }])
  })
  it('does not return another owner through a direct lookup', async () => {
    expect((await db.query('SELECT id FROM workouts WHERE id=$1', [foreignWork])).rows).toEqual([])
    await actor(other)
    expect((await db.query('SELECT id FROM workouts')).rows).toEqual([{ id: foreignWork }])
  })
  it('retains ordinary owner write privileges, which read-only tool metadata does not remove', async () => {
    expect((await db.query("SELECT has_table_privilege('authenticated','workouts','UPDATE') AS allowed")).rows).toEqual([{ allowed: true }])
    expect((await db.query('UPDATE workouts SET input_text=$1 WHERE id=$2 RETURNING id', ['Owner work', work])).rows).toEqual([{ id: work }])
  })
  it('cannot update or delete another owner through direct statements', async () => {
    expect((await db.query("UPDATE workouts SET input_text='Attempt' WHERE id=$1 RETURNING id", [foreignWork])).rows).toEqual([])
    expect((await db.query('DELETE FROM workouts WHERE id=$1 RETURNING id', [foreignWork])).rows).toEqual([])
  })
  it('rejects inserting work as another owner', async () => {
    await expect(db.query("INSERT INTO workouts(user_id,workout_date,input_text,blocks) VALUES ($1,'2026-10-18','Attempt','[]')", [other])).rejects.toMatchObject({ code: '42501' })
  })
})
