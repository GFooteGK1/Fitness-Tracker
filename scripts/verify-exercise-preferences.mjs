/** Actual preference migration/RPCs on synthetic prerequisites; not production or concurrency proof. */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)))
const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const none = {schemaVersion:1,state:'none',entries:[]}
const favorite = {schemaVersion:1,state:'specified',entries:[{athleteWording:'Squats',target:{kind:'interest',id:'squat_variations'}}]}
test('exercise preference PostgreSQL contract, correction, replay, and owner isolation', async t => {
 const db = new PGlite()
 const base = read('docs/migrations/coach-system-migration.sql')
 const trust = read('supabase/migrations/20260901220000_coach_trust_review.sql')
 const lifecycle = read('supabase/migrations/20260901152000_layered_adaptive_evidence.sql')
 await db.exec(`CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`)
 await db.exec(section(base,'CREATE TABLE IF NOT EXISTS public.coach_memories (','CREATE TABLE IF NOT EXISTS public.training_programs ('))
 await db.exec(section(lifecycle,'ALTER TABLE public.coach_memories','COMMENT ON COLUMN public.coach_memories.effective_from'))
 await db.exec(section(base,'CREATE OR REPLACE FUNCTION public.confirm_coach_memory(','CREATE OR REPLACE FUNCTION public.create_initial_training_plan_proposal('))
 await db.exec(section(trust,'CREATE TABLE IF NOT EXISTS public.coach_memory_review_events (','CREATE TABLE IF NOT EXISTS public.measurement_import_review_events ('))
 await db.exec(`ALTER TABLE coach_memories ENABLE ROW LEVEL SECURITY; ALTER TABLE coach_memories FORCE ROW LEVEL SECURITY;
 CREATE POLICY owner_read ON coach_memories FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
 GRANT SELECT ON coach_memories TO authenticated;
 REVOKE ALL ON FUNCTION public.confirm_coach_memory(TEXT,TEXT,JSONB,JSONB,NUMERIC,TEXT) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.confirm_coach_memory(TEXT,TEXT,JSONB,JSONB,NUMERIC,TEXT) TO authenticated;`)
 assert.equal(read('docs/migrations/exercise-preferences-migration.sql'), read('supabase/migrations/20260915220000_exercise_preferences.sql'))
 await db.exec(read('supabase/migrations/20260915220000_exercise_preferences.sql'))
 await db.query('INSERT INTO auth.users VALUES ($1),($2)',[owner,other])
 const actor = async id => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id??'']); await db.exec('SET ROLE authenticated') }
 const create = async (content,key) => (await db.query("SELECT * FROM confirm_coach_memory('exercise_preferences','preference',$1,'{}',1,$2)",[content,key])).rows[0]
 const correct = async (id,content,key) => (await db.query('SELECT * FROM correct_coach_memory_with_review($1,$2,$3)',[id,content,key])).rows[0]
 const rejects = (operation,code) => assert.rejects(operation,error=>error.code===code)
 let original, correction
 try {
  await t.test('saves once, preserves content and replays stable intake key',async()=>{
   await actor(owner); original=await create(favorite,'favorite-intake-1')
   assert.deepEqual(await create(favorite,'favorite-intake-1'),original)
   assert.deepEqual((await db.query('SELECT content FROM coach_memories')).rows[0].content,favorite)
   await rejects(create(none,'favorite-intake-1'),'22023')
  })
  await t.test('correction creates a new version and retries after supersession',async()=>{
   correction=await correct(original.memory_id,none,'favorite-correction-1')
   assert.equal(correction.replacement_version,2)
   assert.deepEqual(await correct(original.memory_id,none,'favorite-correction-1'),correction)
   await rejects(correct(original.memory_id,favorite,'favorite-correction-1'),'22023')
   await rejects(correct(original.memory_id,none,'favorite-correction-2'),'40001')
   const rows=(await db.query('SELECT status,content FROM coach_memories ORDER BY version')).rows
   assert.equal(rows[0].status,'superseded'); assert.equal(rows[1].status,'confirmed');assert.deepEqual(rows[1].content,none)
  })
  await t.test('rejects malformed content on both direct RPC paths',async()=>{
   for(const content of [{...none,state:'specified'}, {...none,entries:[{}]}, {...favorite,entries:[{athleteWording:'x',target:{kind:'unresolved',id:'forged'}}]}, {...none,unexpected:true}]) {
    await rejects(create(content,'invalid-create-1'),'22023')
    await rejects(correct(correction.replacement_memory_id,content,'invalid-correct-1'),'22023')
   }
  })
  await t.test('denies cross-user corrections, anonymous calls and direct writes',async()=>{
   await actor(other);assert.equal((await db.query('SELECT * FROM coach_memories')).rows.length,0)
   await rejects(correct(correction.replacement_memory_id,favorite,'other-correction-1'),'P0002')
   await rejects(db.query('DELETE FROM coach_memories'),'42501')
   await actor(null);await rejects(create(none,'anonymous-create-1'),'42501')
  })
 } finally { await db.close() }
})
