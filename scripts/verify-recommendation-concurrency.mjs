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
const database=`recommendation_verify_${Date.now()}`
const env={...process.env,PGPASSWORD:'',PGOPTIONS:'-c client_min_messages=warning',PGCONNECT_TIMEOUT:'3'}
const args=(db,app)=>['-X','-q','-A','-t','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1',...(app?['-c',`SET application_name='${app}';`]:[])]
function sql(source,db=database){const result=spawnSync(psql,args(db),{input:source,encoding:'utf8',env,windowsHide:true});if(result.status!==0)throw new Error(result.stderr||result.error?.message||'psql failed');return result.stdout.trim()}
sql(`CREATE DATABASE ${database};`,'postgres')
const pieces=[]
class FixtureCollector { async exec(source){pieces.push(source)} }
function compile(path,dependency){const exports={};const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',compiled)(dependency,exports);return exports}
const fixture=compile('test/database/fixture.ts',name=>name==='@electric-sql/pglite'?{PGlite:FixtureCollector}:require(name))
const recommendations=compile('test/database/recommendation-fixture.ts',name=>name==='./fixture'?fixture:require(name))
await recommendations.recommendationFixture()
let bootstrap=pieces.join('\n').replace('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',()=>"DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
sql(bootstrap)
const owner=randomUUID();sql(`INSERT INTO auth.users VALUES ('${owner}');`)
const actor=`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}';`
const json=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`
const operation={sourceItemId:'source:0',kind:'meal',record:{meal_timestamp:'2026-09-17T12:00:00Z',items:[{food:'Egg',portion:'1',protein:6,carbs:0,fat:5,calories:69}]},blocks:[],inputMethod:'text',eventAt:'2026-09-17T12:00:00Z',provenance:{schemaVersion:1,occurrence:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]},fields:{macros:{origin:'model_estimated',reviewState:'unreviewed',sourceReferences:[]}}}}
function freeze(){const ledger=JSON.parse(sql(`${actor} SELECT begin_logging_request('${randomUUID()}','${'a'.repeat(64)}');`));const items=JSON.parse(sql(`${actor} SELECT freeze_logging_request_items('${ledger.id}',${json([operation])});`));return {ledger,child:items[0].id}}
function runProcess(source,app){let readyResolve;const ready=new Promise(r=>readyResolve=r);const child=spawn(psql,args(database),{env,windowsHide:true});let out='',err='';child.stdout.on('data',bytes=>{out+=bytes;if(out.includes('barrier-ready'))readyResolve()});child.stderr.on('data',bytes=>err+=bytes);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{if(!out.includes('barrier-ready'))readyResolve();resolve({code,out:out.trim(),err})})});child.stdin.end(`SET application_name='${app}';${actor}${source}`);return {ready,done}}
async function race(firstSQL,secondSQL,expectedSecondSuccess){
 const app=`recommendation_race_${randomUUID().replaceAll('-','')}`
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
const service=`RESET ROLE; SET ROLE service_role;`,runtime='a'.repeat(64),date=sql("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date;"),deadline=sql("SELECT ((clock_timestamp() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC'-interval '1 second';")
const claimSQL=`${service} SELECT claim_recommendation_refresh('${owner}','${runtime}','${date}',0);`
function claim(){return JSON.parse(sql(claimSQL))}
function decision(c,patch={}){return {schemaVersion:1,kind:'collect_signal',ruleId:'missing_signal.baseline',ruleVersion:'1',policyVersion:'bounded-actions-1',runtimeFingerprint:runtime,scopeKey:'baseline:squat',evidenceFingerprint:'b'.repeat(64),sourceRevision:c.sourceRevision,responseRevision:c.responseRevision,localDate:date,tzOffset:0,validUntil:deadline,planVersionId:c.activePlanId,intentMemoryId:c.intentMemoryId,intentVersion:c.intentVersion,goalId:null,title:'Record baseline',reason:'Defined baseline missing',reasonCodes:[],missing:[],conflicts:[],destination:{type:'baseline',href:'/program'},sources:[],outcome:null,...patch}}
function publication(c,d=decision(c)){return `${service} SELECT publish_recommendations('${owner}','${c.leaseToken}',${c.sourceRevision},${c.responseRevision},'${runtime}','${date}',0,${json([d])},NULL);`}
function dirty(){sql(`SELECT dirty_recommendations('${owner}');`)}
function read(){return JSON.parse(sql(`${service} SELECT read_recommendations('${owner}','${runtime}','${date}',0);`))}
// Two workers cannot hold a valid lease for the same owner.
const claims=await race(claimSQL,claimSQL,true),first=JSON.parse(claims[0].out.split('\n').find(l=>l.startsWith('{')))
assert.ok(first.leaseToken);assert.ok(!claims[1].out.includes('leaseToken'))
let published=JSON.parse(sql(publication(first))).recommendations[0]
// A pending source transaction wins before publication; the old worker must fail.
dirty();const stale=claim(),m=freeze()
await race(`SELECT commit_logging_request_item('${m.child}');`,publication(stale),false)
assert.equal(read().refreshState.pending,true)
sql(`UPDATE recommendation_refresh_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE user_id='${owner}';`)
let fresh=claim();published=JSON.parse(sql(publication(fresh))).recommendations[0]
// A source commit queued behind publication must immediately dirty that publication.
dirty();fresh=claim();const n=freeze()
await race(publication(fresh),`SELECT commit_logging_request_item('${n.child}');`,true)
assert.equal(read().recommendations.length,0)
fresh=claim();published=JSON.parse(sql(publication(fresh))).recommendations[0]
// A response serialized before an in-flight worker invalidates its response revision.
sql(`UPDATE recommendation_refresh_state SET next_due_at=clock_timestamp()-interval '1 second' WHERE user_id='${owner}';`)
const responseLease=claim()
await race(`SELECT respond_recommendation('${published.id}','${randomUUID()}','done_reported',NULL,'${runtime}',0);`,publication(responseLease),false)
assert.equal(read().refreshState.pending,true)
// Same-revision lease takeover: neither an old publish nor old failure can affect the new lease.
sql(`UPDATE recommendation_refresh_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE user_id='${owner}';`)
const taken=claim();assert.notEqual(taken.leaseToken,responseLease.leaseToken)
assert.equal(sql(`${service} SELECT fail_recommendation_refresh('${owner}','${responseLease.leaseToken}',${responseLease.sourceRevision},${responseLease.responseRevision},'late_worker');`),'f')
const abstain=decision(taken,{kind:'abstain',ruleId:'no_eligible_action',scopeKey:'none',evidenceFingerprint:'c'.repeat(64),destination:null});sql(publication(taken,abstain))
// A burst uses separate backends and one coalesced owner state; every source commit remains durable.
const children=Array.from({length:16},()=>freeze()),before=Number(sql(`SELECT source_revision FROM recommendation_refresh_state WHERE user_id='${owner}';`)),started=Date.now()
const burst=await Promise.all(children.map((x,i)=>runProcess(`SELECT commit_logging_request_item('${x.child}');`,`burst_${i}_${Date.now()}`).done))
for(const result of burst)assert.equal(result.code,0,result.err)
assert.equal(sql(`SELECT count(*) FROM logging_request_items WHERE id IN (${children.map(x=>`'${x.child}'`).join(',')}) AND status='committed';`),'16')
assert.equal(sql(`SELECT count(*) FROM recommendation_refresh_state WHERE user_id='${owner}';`),'1')
assert.ok(Number(sql(`SELECT source_revision FROM recommendation_refresh_state WHERE user_id='${owner}';`))>=before+16)
const burstDuration=Date.now()-started
// Typed measurement changes between evaluator read and RPC are rechecked under locks.
function measurement(){
 dirty();const c=claim(),group=randomUUID(),value=randomUUID(),binding={measurement:{assessmentDefinition:{id:'strength.repetition_max',version:'1.0.0'},protocol:{id:'strength.repetition_max',version:'1.0.0'},metricId:'strength.load',unit:'kg'},binding:{movementId:'squat',variation:null,distance:null,equipmentIds:['barbell'],assessmentContext:{repetitions:5}}}
 const r=JSON.parse(sql(publication(c,decision(c,{scopeKey:'baseline:'+group,evidenceFingerprint:group.replaceAll('-','').repeat(2),outcome:{kind:'measurement',sourceId:'goal:'+group,metricId:'strength.load',unit:'kg',binding,dueAt:new Date(Date.now()-1000).toISOString()}})))).recommendations[0]
 sql(`UPDATE recommendations SET created_at=clock_timestamp()-interval '1 hour' WHERE id='${r.id}'; INSERT INTO performance_observation_groups(id,user_id,observation_kind,status,observed_at,captured_at,source_kind,source_system,source_record_id,assessment_definition_id,assessment_catalog_version,protocol_version,parser_version,verification_status,verified_at,verified_by,comparability_key,comparison_modifiers,metadata) VALUES('${group}','${owner}','strength_set','complete',clock_timestamp()-interval '30 seconds',now(),'manual','sociusfit_training_baseline','${group}','strength.repetition_max','0.2.0','1.0.0','manual-1','athlete_confirmed',now(),'${owner}','comparison:test',training_outcome_comparison(${json(binding)}),${json({origin:'athlete_reported',assessmentDefinitionVersion:'1.0.0',protocolId:'strength.repetition_max'})}); INSERT INTO performance_observation_values(id,group_id,user_id,metric_id,semantic_role,value_numeric,unit) VALUES('${value}','${group}','${owner}','strength.load','direct_outcome',100,'kg');`)
 const outcome={schemaVersion:1,adherence:'observed',evidence:[{table:'performance_observation_groups',id:group,revision:null},{table:'performance_observation_values',id:value,revision:null}],metricId:'strength.load',unit:'kg',binding,summary:'Comparable later measurement recorded; benefit unknown.',attributionLimits:['No causal inference.']}
 return {r,group,call:(key=randomUUID())=>`${service} SELECT record_recommendation_outcome('${owner}','${r.id}','${key}',${json(outcome)});`}
}
const retracted=measurement()
await race(`RESET ROLE; UPDATE performance_observation_groups SET verification_status='rejected' WHERE id='${retracted.group}';`,retracted.call(),false)
assert.equal(sql(`SELECT count(*) FROM recommendation_events WHERE recommendation_id='${retracted.r.id}' AND event_type='outcome';`),'0')
const observed=measurement()
await race(observed.call(),`RESET ROLE; UPDATE performance_observation_groups SET verification_status='rejected' WHERE id='${observed.group}';`,true)
assert.equal(sql(`SELECT count(*) FROM recommendation_events WHERE recommendation_id='${observed.r.id}' AND event_type='outcome';`),'1')
assert.equal(sql(`SELECT count(*) FROM recommendation_events WHERE recommendation_id='${observed.r.id}' AND event_type='outcome_invalidated';`),'1')
const duplicateOutcome=measurement()
await race(duplicateOutcome.call(),duplicateOutcome.call(),false)
assert.equal(sql(`SELECT count(*) FROM recommendation_events WHERE recommendation_id='${duplicateOutcome.r.id}' AND event_type='outcome';`),'1')
const ambiguous=measurement()
await race(ambiguous.call(),`RESET ROLE; INSERT INTO performance_observation_values(group_id,user_id,metric_id,semantic_role,value_numeric,unit,ordinal) VALUES('${ambiguous.group}','${owner}','strength.load','direct_outcome',101,'kg',1);`,true)
assert.equal(sql(`SELECT count(*) FROM recommendation_events WHERE recommendation_id='${ambiguous.r.id}' AND event_type='outcome_invalidated';`),'1')
console.log(JSON.stringify({database,server:sql('SELECT version();'),host:'127.0.0.1',port,tests:10,passed:10,observedIndependentLockWaits:8,burst:{sources:16,durationMs:burstDuration},production:false},null,2))
