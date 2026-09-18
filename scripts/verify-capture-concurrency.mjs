/** Real independent-connection capture races. Uses only a private loopback test cluster and synthetic owners. */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const ts=require('typescript')
const psql=resolve(process.env.CAPTURE_TEST_PSQL??'output/app-quality-release/postgres-runtime/pgsql/bin/psql.exe')
const port=Number(process.env.CAPTURE_TEST_PORT??55437)
assert.ok(existsSync(psql),'Start the documented isolated PostgreSQL fixture first.')
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535)
const database=`capture_verify_${Date.now()}`
const env={...process.env,PGPASSWORD:'',PGOPTIONS:'-c client_min_messages=warning',PGCONNECT_TIMEOUT:'3'}
const args=(db,app)=>['-X','-q','-A','-t','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1',...(app?['-c',`SET application_name='${app}';`]:[])]
function sql(source,db=database){const result=spawnSync(psql,args(db),{input:source,encoding:'utf8',env,windowsHide:true});if(result.status!==0)throw new Error(result.stderr||result.error?.message||'psql failed');return result.stdout.trim()}
sql(`CREATE DATABASE ${database};`,'postgres')
const pieces=[]
class FixtureCollector { async exec(source){pieces.push(source)} }
const compiled=ts.transpileModule(readFileSync('test/database/fixture.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const exports={}
new Function('require','exports',compiled)(name=>name==='@electric-sql/pglite'?{PGlite:FixtureCollector}:require(name),exports)
await exports.databaseFixture()
let bootstrap=pieces.join('\n').replace('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',
  () => "DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
for(const name of ['coach-system-migration.sql','coach-plan-replacement-migration.sql','coach-complete-programming-v0-3-migration.sql','coach-execution-feedback-migration.sql','layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql','qwik-vbt-import-migration.sql','coach-trust-review-migration.sql','rolling-weekly-coach-migration.sql'])bootstrap+='\n'+readFileSync(`docs/migrations/${name}`,'utf8')
for(const name of ['20260728143952_nutrition_fast_logging.sql','20260730130953_coach_workout_runner_v0_5.sql','20260904023000_fix_atomic_session_workout_link.sql','20260904120000_logging_receipts.sql','20260918010000_optional_session_feedback.sql','20260918011000_session_capture_signals.sql'])bootstrap+='\n'+readFileSync(`supabase/migrations/${name}`,'utf8')
bootstrap+='\n'+readFileSync('docs/migrations/personal-records-migration.sql','utf8')+'\n'+readFileSync('supabase/migrations/20260728134202_personal_record_idempotency.sql','utf8')+'\n'+readFileSync('supabase/migrations/20260918020000_capture_receipts.sql','utf8')
sql(bootstrap)
const owner=randomUUID();sql(`INSERT INTO auth.users VALUES ('${owner}');`)
const actor=`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}';`
const json=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`
const operation={sourceItemId:'source:0',kind:'meal',record:{meal_timestamp:'2026-09-17T12:00:00Z',items:[{food:'Egg',portion:'1',protein:6,carbs:0,fat:5,calories:69}]},blocks:[],inputMethod:'text',eventAt:'2026-09-17T12:00:00Z',provenance:{schemaVersion:1,occurrence:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]},fields:{macros:{origin:'model_estimated',reviewState:'unreviewed',sourceReferences:[]}}}}
function freeze(){const ledger=JSON.parse(sql(`${actor} SELECT begin_logging_request('${randomUUID()}','${'a'.repeat(64)}');`));const items=JSON.parse(sql(`${actor} SELECT freeze_logging_request_items('${ledger.id}',${json([operation])});`));return {ledger,child:items[0].id}}
function runProcess(source,app){let readyResolve;const ready=new Promise(r=>readyResolve=r);const child=spawn(psql,args(database),{env,windowsHide:true});let out='',err='';child.stdout.on('data',bytes=>{out+=bytes;if(out.includes('barrier-ready'))readyResolve()});child.stderr.on('data',bytes=>err+=bytes);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{if(!out.includes('barrier-ready'))readyResolve();resolve({code,out:out.trim(),err})})});child.stdin.end(`SET application_name='${app}';${actor}${source}`);return {ready,done}}
async function race(firstSQL,secondSQL,expectedSecondSuccess){
 const app=`capture_race_${randomUUID().replaceAll('-','')}`
 const first=runProcess(`BEGIN; ${firstSQL} SELECT 'barrier-ready'; SELECT pg_sleep(0.8); COMMIT;`,`${app}_first`)
 await first.ready
 const second=runProcess(`BEGIN; ${secondSQL} COMMIT;`,`${app}_second`)
 let observedLock=false
 for(let attempt=0;attempt<12;attempt++){
  if(sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}_second' AND wait_event_type='Lock';`)==='1'){observedLock=true;break}
  await new Promise(r=>setTimeout(r,25))
 }
 const results=await Promise.all([first.done,second.done]);assert.equal(results[0].code,0,results[0].err);assert.equal(results[1].code===0,expectedSecondSuccess,results[1].err);assert.ok(observedLock,'Second independent backend must demonstrably wait on a transaction lock')
 return results
}
const first=freeze()
const duplicate=await race(`SELECT commit_logging_request_item('${first.child}');`,`SELECT commit_logging_request_item('${first.child}');`,true)
const receipt=JSON.parse(duplicate[0].out.split('\n').find(line=>line.startsWith('{')))
assert.deepEqual(JSON.parse(duplicate[1].out.split('\n').find(line=>line.startsWith('{'))),receipt)
assert.equal(sql(`SELECT count(*) FROM meals WHERE id='${receipt.entityId}';`),'1')
assert.equal(sql(`SELECT count(*) FROM activity_revisions WHERE original_entity_id='${receipt.entityId}';`),'1')
const canceled=freeze();await race(`SELECT cancel_logging_request_item('${canceled.child}');`,`SELECT commit_logging_request_item('${canceled.child}');`,false)
assert.equal(sql(`SELECT status FROM logging_request_items WHERE id='${canceled.child}';`),'canceled')
const committed=freeze();await race(`SELECT commit_logging_request_item('${committed.child}');`,`SELECT cancel_logging_request_item('${committed.child}');`,false)
assert.equal(sql(`SELECT status FROM logging_request_items WHERE id='${committed.child}';`),'committed')
const amended={...operation.record,items:[{...operation.record.items[0],protein:8}]}
await race(`SELECT amend_logged_activity('meal','${receipt.entityId}',1,'amend-first',${json(amended)},'[]',${json(operation.provenance)});`,
 `SELECT amend_logged_activity('meal','${receipt.entityId}',1,'amend-second',${json({...amended,items:[{...amended.items[0],protein:9}]})},'[]',${json(operation.provenance)});`,false)
assert.deepEqual(sql(`SELECT capture_revision||':'||total_protein FROM meals WHERE id='${receipt.entityId}';`).split(':').map(Number),[2,8])
console.log(JSON.stringify({database,server:sql('SELECT version();'),host:'127.0.0.1',port,tests:4,passed:4,observedIndependentLockWaits:4,production:false},null,2))
