// Anonymous synthetic owner worker for the integrated LOCAL rehearsal. Receives
// owner sessions over IPC. Privileged fixture requests go back to the operator.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {CookieAuthStorageAdapter} from '@supabase/auth-helpers-shared';
import {openPrivateLiveSetupJournal} from './setup-freshness-live-private-journal.mjs';
import {createLiveSetupOperationGate} from './setup-freshness-live-contract.mjs';
import {runLiveSetupLifecycle} from './setup-freshness-live-lifecycle.mjs';
import {renderLiveFixtureSql} from './setup-freshness-live-fixtures.mjs';
import {readBoundedLiveJson,waitForDatabaseExpiry} from './setup-freshness-live-http.mjs';
assert.equal(process.argv.length,3);const runId=process.argv[2];
const pending=new Map();let initializedResolve,startResolve,terminal=false;
const initialized=new Promise(r=>{initializedResolve=r;}),start=new Promise(r=>{startResolve=r;});
process.on('message',message=>{
  if(message?.type==='initialize')initializedResolve(message);
  if(message?.type==='start')startResolve();
  if(message?.type==='fixture-result'){
    const call=pending.get(message.step);if(call){pending.delete(message.step);message.error?call.reject(Error(message.error)):call.resolve(message.value);}
  }
});
process.on('disconnect',()=>process.exit(terminal?0:2));
const config=await initialized,manifest=config.manifest;assert.equal(manifest.runId,runId);
assert.equal(config.api,'http://127.0.0.1:55421');assert.equal(config.app,'http://127.0.0.1:3011');
const evidence=await openPrivateLiveSetupJournal(manifest),actors=new Map();
for(const owner of Object.values(manifest.owners)) {
  const session=config.sessions[owner.userId];assert.equal(session.user.id,owner.userId);
  const client=createClient(config.api,config.anonKey,{global:{headers:{Authorization:`Bearer ${session.access_token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const identity=await client.auth.getUser(session.access_token);assert.equal(identity.error,null);assert.equal(identity.data.user.id,owner.userId);assert.equal(identity.data.user.email,owner.email);
  const cookies=[];class Adapter extends CookieAuthStorageAdapter{setCookie(k,v){cookies.push(`${k}=${encodeURIComponent(v)}`);}}
  new Adapter().setItem('sb-127-auth-token',JSON.stringify(session));actors.set(owner.userId,{client,cookie:cookies.join('; ')});
}
const actor=owner=>{assert(actors.has(owner));return actors.get(owner);};
const fixture=async request=>{
  const rendered=renderLiveFixtureSql(manifest,request.step,request);
  const value=await new Promise((resolve,reject)=>{assert(!pending.has(request.step));pending.set(request.step,{resolve,reject});process.send({type:'fixture',payload:rendered});});
  if(config.scenario==='worker-failure'&&request.step==='rolling-confirm-initial')throw Error('injected_worker_failure');
  return value;
};
const io={
  async api({owner,route,body,signal}){const response=await fetch(config.app+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:actor(owner).cookie},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal});return {status:response.status,value:await readBoundedLiveJson(response)};},
  confirm:fixture,expire:fixture,seedLegacy:fixture,
  async revision({owner,signal}){const r=await actor(owner).client.from('coach_context_revisions').select('revision').eq('user_id',owner).abortSignal(signal).single();assert.equal(r.error,null);return String(r.data.revision);},
  waitUntil:request=>waitForDatabaseExpiry(request,()=>new Promise((resolve,reject)=>{
    assert(!pending.has(request.step));pending.set(request.step,{resolve,reject});process.send({type:'database-time',step:request.step});
  })),
  async findReview({owner,idempotencyKey,signal}){const r=await actor(owner).client.from('coach_weekly_reviews').select('id,rationale').eq('user_id',owner).eq('idempotency_key',idempotencyKey).abortSignal(signal).single();assert.equal(r.error,null);return r.data;},
  async history({owner,planId,signal}){const c=actor(owner).client;
    const p=await c.from('training_plan_versions').select('id,user_id,intent,input_snapshot').eq('user_id',owner).eq('id',planId).abortSignal(signal).single();
    const s=await c.from('prescribed_sessions').select('id,plan_version_id,user_id,scheduled_date,week_number,session_index,prescription').eq('user_id',owner).eq('plan_version_id',planId).abortSignal(signal);
    assert.equal(p.error,null);assert.equal(s.error,null);return {plan:p.data,sessions:s.data};},
};
await evidence.record('worker-ready',{pid:process.pid});process.send({type:'ready'});
await start;
const gate=createLiveSetupOperationGate(manifest,{journal:evidence.journal,openedAt:Date.now(),signal:new AbortController().signal});
try {const result=await runLiveSetupLifecycle(manifest,io,gate);await evidence.record('worker-result',{...result,steps:gate.status()});}
catch(error){await evidence.record('worker-failure',{code:error.message,steps:gate.status()});}
finally{terminal=true;evidence.dispose();process.disconnect();}
