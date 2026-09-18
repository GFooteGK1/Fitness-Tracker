/** W3 actual SQL on local PGlite with synthetic prerequisite tables. No network or production credentials. */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { PGlite } = require('@electric-sql/pglite')
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const section = (s, start, end) => s.slice(s.indexOf(start), s.indexOf(end, s.indexOf(start)))
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222'
const time='2020-09-17T12:00:00.000Z'
const outcome = (id='goal:5k', distance=5000) => ({
  goal:{schemaVersion:1,id,kind:'performance_outcome',statement:`Improve ${distance} meter time`,priority:'primary',status:'active',target:null,targetDate:null,requiredQualityIds:['aerobic_endurance'],source:{kind:'athlete_confirmed',confirmedAt:time}},
  domain:'aerobic',measurement:{metricId:'run.time',unit:'s',assessmentDefinition:{id:'run.time_trial',version:'1.0.0'},protocol:{id:'run-time-trial-standard',version:'1.0.0'}},
  binding:{movementId:null,distance:{value:distance,unit:'m'},equipmentIds:['track'],variation:null},baseline:{status:'unknown'},capability:{status:'supported'},
})
const content = () => ({schemaVersion:1,outcomes:[outcome(),outcome('goal:mile',1609)],priorityOrder:null,event:null,confirmedAt:time})

test('training intent confirmation, correction, baselines and isolation', async t => {
  const ts=require('typescript')
  require.extensions['.ts']=(module, filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename)
  const { databaseFixture }=require('../test/database/fixture.ts')
  const { validatePlanningIntent }=require('../app/lib/coach/planning-intent.ts')
  const db=await databaseFixture()
  for (const name of ['coach-system-migration.sql','coach-plan-replacement-migration.sql','coach-complete-programming-v0-3-migration.sql','coach-execution-feedback-migration.sql','layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql','qwik-vbt-import-migration.sql','coach-trust-review-migration.sql','rolling-weekly-coach-migration.sql']) await db.exec(read(`docs/migrations/${name}`))
  for (const name of ['20260730130953_coach_workout_runner_v0_5.sql','20260904023000_fix_atomic_session_workout_link.sql','20260904120000_logging_receipts.sql','20260915220000_exercise_preferences.sql','20260918010000_optional_session_feedback.sql','20260918011000_session_capture_signals.sql']) await db.exec(read(`supabase/migrations/${name}`))
  await db.exec(read('supabase/migrations/20260728143952_nutrition_fast_logging.sql'))
  await db.exec(read('docs/migrations/personal-records-migration.sql'))
  await db.exec(read('supabase/migrations/20260728134202_personal_record_idempotency.sql'))
  await db.exec(read('supabase/migrations/20260918020000_capture_receipts.sql'))
  let migration=read('supabase/migrations/20260918030000_training_intent.sql')
  if (process.env.DEBUG_INTENT) migration=migration.replace('EXCEPTION WHEN OTHERS THEN RETURN false;', 'EXCEPTION WHEN OTHERS THEN RAISE;')
  await db.exec(migration)
  await db.query('INSERT INTO auth.users VALUES ($1),($2)',[owner,other])
  const actor=async (id,role='authenticated')=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec(`SET ROLE ${role}`)}
  const confirm=async (p,key,previous=null)=>(await db.query('SELECT * FROM confirm_training_intent($1,$2,$3)',[p,key,previous])).rows[0]
  const baseline=async (memory,id,key,value=1500)=>(await db.query('SELECT * FROM record_training_baseline($1,$2,$3,$4,$5)',[memory,id,value,time,key])).rows[0]
  const rejects=(p,code)=>assert.rejects(p,error=>error.code===code)
  let first,corrected,measurement
  try {
    await actor(owner)
    await t.test('SQL and TypeScript reject removal of every required key',async()=>{
      const valid=content();valid.event={name:'Running race',goalIds:['goal:5k'],date:null}
      valid.outcomes[0].goal.target={role:'target',comparison:'range',metric:{metricId:'run.time',value:1200,unit:'s'},upperMetric:{metricId:'run.time',value:1500,unit:'s'},assessmentDefinition:valid.outcomes[0].measurement.assessmentDefinition,protocol:valid.outcomes[0].measurement.protocol}
      valid.outcomes[0].binding.assessmentContext={repetitions:null,externalLoad:null,duration:null,techniqueModifiers:[],environmentModifiers:[]}
      const paths=[]
      const visit=(value,path=[])=>{if(!value || typeof value!=='object')return; for(const [key,child] of Object.entries(value)){if(!Array.isArray(value) && !['assessmentContext','upperMetric'].includes(key))paths.push([...path,key]);visit(child,[...path,key])}}
      visit(valid)
      assert.equal(validatePlanningIntent(valid).ok,true)
      assert.equal((await db.query('SELECT valid_training_intent($1) valid',[valid])).rows[0].valid,true)
      for(const path of paths){const bad=structuredClone(valid);let parent=bad;for(const key of path.slice(0,-1))parent=parent[key];delete parent[path.at(-1)];assert.equal(validatePlanningIntent(bad).ok,false,`TS missing ${path.join('.')}`);assert.equal((await db.query('SELECT valid_training_intent($1) valid',[bad])).rows[0].valid,false,`SQL missing ${path.join('.')}`)}
      const mismatches=[]
      for(const path of paths) for(const replacement of [null,false,0,'',[],{}]) {const bad=structuredClone(valid);let parent=bad;for(const key of path.slice(0,-1))parent=parent[key];parent[path.at(-1)]=replacement;const expected=validatePlanningIntent(bad).ok;if((await db.query('SELECT valid_training_intent($1) valid',[bad])).rows[0].valid!==expected)mismatches.push(`parity ${path.join('.')}=${JSON.stringify(replacement)} expected:${expected}`)}
      assert.deepEqual(mismatches,[])
      const wrong=content();wrong.outcomes[0].domain='strength';assert.equal((await db.query('SELECT valid_training_intent($1) valid',[wrong])).rows[0].valid,false)
    })
    await t.test('confirms same-domain goals, stamps server time and replays without a new version',async()=>{
      first=await confirm(content(),'intent-first-1')
      assert.deepEqual(await confirm(content(),'intent-first-1'),first)
      const stored=(await db.query('SELECT content FROM coach_memories WHERE id=$1',[first.memory_id])).rows[0].content
      assert.notEqual(stored.confirmedAt,time);assert.equal(stored.outcomes[0].goal.source.confirmedAt,stored.confirmedAt)
      assert.equal(stored.outcomes.length,2)
      const changed=content();changed.outcomes[0].goal.statement='Changed outcome statement'
      await rejects(confirm(changed,'intent-first-1'),'22023')
    })
    await t.test('records exactly one owned baseline with catalog source and preserves fractional results',async()=>{
      measurement=await baseline(first.memory_id,'goal:5k','baseline-first-1',1500.5)
      assert.deepEqual(await baseline(first.memory_id,'goal:5k','baseline-first-1',1500.5),measurement)
      await rejects(baseline(first.memory_id,'goal:5k','baseline-first-1',1499),'22023')
      const rows=(await db.query('SELECT value_numeric,metric_id,unit FROM performance_observation_values')).rows
      assert.equal(rows.length,1);assert.equal(Number(rows[0].value_numeric),1500.5);assert.equal(rows[0].metric_id,'run.time')
    })
    await t.test('links only a comparable baseline and corrects to a new immutable memory',async()=>{
      const p=content();p.outcomes[0].baseline={status:'referenced',observationId:measurement.observation_id}
      corrected=await confirm(p,'intent-correct-1',first.memory_id)
      assert.equal(corrected.memory_version,2)
      assert.deepEqual(await confirm(p,'intent-correct-1',first.memory_id),corrected)
      await rejects(confirm(p,'intent-stale-1',first.memory_id),'40001')
      const wrong=structuredClone(p);wrong.outcomes[1].baseline={status:'referenced',observationId:measurement.observation_id}
      await rejects(confirm(wrong,'intent-wrong-distance',corrected.memory_id),'22023')
      assert.equal((await db.query('SELECT status FROM coach_memories WHERE id=$1',[first.memory_id])).rows[0].status,'superseded')
    })
    await t.test('rejects unknown nested fields and malformed priority in every memory path',async()=>{
      const bad=content();bad.outcomes[0].binding.derivedConfidence=1
      await rejects(confirm(bad,'intent-malformed-1',corrected.memory_id),'22023')
      await rejects(db.query("SELECT * FROM confirm_coach_memory('training_intent','goal',$1,'{}',1,'direct-malformed-1')",[bad]),'22023')
      const priority=content();priority.priorityOrder=['goal:5k']
      await rejects(confirm(priority,'intent-priority-1',corrected.memory_id),'22023')
    })
    await t.test('records strength protocol context and normalizes allowed result units',async()=>{
      await db.exec('BEGIN')
      try {
        const p=content();const o=p.outcomes[0];p.outcomes=[o];o.domain='strength';o.goal.requiredQualityIds=['maximal_strength'];o.measurement={metricId:'strength.load',unit:'lb',assessmentDefinition:{id:'strength.repetition_max',version:'1.0.0'},protocol:{id:'strength-repetition-max-standard',version:'1.0.0'}};o.binding={movementId:'barbell_back_squat',distance:null,equipmentIds:['barbell','rack'],variation:'high bar',assessmentContext:{repetitions:3,externalLoad:null,duration:null,techniqueModifiers:['full depth'],environmentModifiers:[]}}
        assert.equal(validatePlanningIntent(p).ok,true);assert.equal((await db.query('SELECT valid_training_intent($1) valid',[p])).rows[0].valid,true)
        const saved=await confirm(p,'strength-confirm-1',corrected.memory_id)
        const obs=await baseline(saved.memory_id,'goal:5k','strength-baseline-1',225.5)
        const linked=structuredClone(p);linked.outcomes[0].baseline={status:'referenced',observationId:obs.observation_id}
        const next=await confirm(linked,'strength-link-1',saved.memory_id)
        for(const key of ['repetitions','externalLoad','duration','techniqueModifiers','environmentModifiers']){
          const invalid=structuredClone(linked);invalid.outcomes[0].binding.assessmentContext[key]=key==='repetitions'?5:key==='externalLoad'?{value:20,unit:'kg'}:key==='duration'?{value:30,unit:'s'}:['different']
          await db.exec('SAVEPOINT bad_binding');await rejects(confirm(invalid,`strength-wrong-${key}`,next.memory_id),'22023');await db.exec('ROLLBACK TO SAVEPOINT bad_binding')
        }
      } finally {await db.exec('ROLLBACK')}
    })
    await t.test('reuses explicit scheduled-session measurement provenance without creating another workout',async()=>{
      await db.exec('BEGIN');await db.exec('RESET ROLE')
      try {
        const program=(await db.query("INSERT INTO training_programs(user_id,title,goal_summary,start_date,end_date,status,program_mode) VALUES($1,'Fixture','Confirm baseline','2026-09-14','2026-09-20','draft','rolling_weekly') RETURNING id",[owner])).rows[0].id
        const plan=(await db.query("INSERT INTO training_plan_versions(program_id,user_id,version,status,reference_version,policy_version,intent,input_snapshot,accepted_at,plan_mode,window_start,window_end) VALUES($1,$2,1,'accepted','fixture','fixture','{\"horizon_weeks\":1}','{}',now(),'rolling_weekly','2026-09-14','2026-09-20') RETURNING id",[program,owner])).rows[0].id
        const session=(await db.query("INSERT INTO prescribed_sessions(plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription) VALUES($1,$2,$3,1,1,'2026-09-17',$4) RETURNING id",[plan,program,owner,{domain:'aerobic',title:'Time trial',intent:'Measure performance',dose:{},effort:'controlled',rest:'full',success_condition:'Complete protocol',stop_condition:'Pain',scale_options:[],evidence:{}}])).rows[0].id
        const workout=(await db.query("INSERT INTO workouts(user_id,workout_date,input_text,blocks) VALUES($1,'2026-09-17','Completed 5 km time trial','[]') RETURNING id",[owner])).rows[0].id
        const scheduled=(await db.query(`INSERT INTO performance_observation_groups(user_id,workout_id,prescribed_session_id,observation_kind,status,observed_at,captured_at,source_kind,source_system,source_device,source_record_id,assessment_definition_id,assessment_catalog_version,protocol_version,parser_version,verification_status,verified_at,verified_by,comparability_key,comparison_modifiers,metadata)
          SELECT user_id,$1,$2,observation_kind,status,observed_at,captured_at,'coach_completion','sociusfit',source_device,'fixture-scheduled',assessment_definition_id,assessment_catalog_version,protocol_version,'session-result-v2',verification_status,verified_at,verified_by,comparability_key,comparison_modifiers,metadata||'{"completionContractVersion":2}' FROM performance_observation_groups WHERE id=$3 RETURNING id`,[workout,session,measurement.observation_id])).rows[0].id
        await db.query('INSERT INTO performance_observation_values(group_id,user_id,metric_id,semantic_role,value_numeric,unit,ordinal,status) SELECT $1,user_id,metric_id,semantic_role,value_numeric,unit,ordinal,status FROM performance_observation_values WHERE group_id=$2',[scheduled,measurement.observation_id])
        await actor(owner)
        const linked=content();linked.outcomes[0].baseline={status:'referenced',observationId:scheduled}
        const linkedMemory=await confirm(linked,'scheduled-link-1',corrected.memory_id)
        assert.equal((await db.query('SELECT id FROM workouts')).rows.length,1)
        for (const column of ['execution_revision','capture_revision']) {
          await db.exec('SAVEPOINT amended_execution');await db.exec('RESET ROLE');await db.query(`UPDATE workouts SET ${column}=$1 WHERE id=$2`,[column==='capture_revision'?2:1,workout]);await actor(owner)
          await rejects(confirm(linked,`scheduled-stale-${column}`,linkedMemory.memory_id),'22023');await db.exec('ROLLBACK TO SAVEPOINT amended_execution')
        }
      } finally {await db.exec('ROLLBACK');await actor(owner)}
    })
    await t.test('denies cross-owner baselines, anonymous calls and direct writes',async()=>{
      await actor(other)
      assert.equal((await db.query('SELECT * FROM coach_memories')).rows.length,0)
      await rejects(baseline(first.memory_id,'goal:5k','other-baseline-1'),'42501')
      const cross=content();cross.outcomes[0].baseline={status:'referenced',observationId:measurement.observation_id}
      await rejects(confirm(cross,'other-intent-1'),'22023')
      await rejects(db.query('DELETE FROM performance_observation_groups'),'42501')
      await actor(null,'anon');await rejects(confirm(content(),'anonymous-intent-1'),'42501')
    })
  } finally {await db.close()}
})
