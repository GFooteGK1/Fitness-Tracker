// Exercises the shared live-check worker against ONLY the isolated local stack.
// This adapter cannot reach hosted Supabase or a production application.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { CookieAuthStorageAdapter } from '@supabase/auth-helpers-shared';
import { provisionLocalOwnerProfile } from './local-owner-profile.mjs';
import { root, output, verifyTarget, jsonSql, literal, sha, createLocalAsyncSql } from './setup-freshness-local-db.mjs';
import { LIVE_SETUP_KEYS, LIVE_SETUP_TARGET, createLiveSetupOperationGate } from './setup-freshness-live-contract.mjs';
import { runLiveSetupLifecycle } from './setup-freshness-live-lifecycle.mjs';
import { renderLiveFixtureSql } from './setup-freshness-live-fixtures.mjs';

assert.deepEqual(process.argv.slice(2),['--new-run']);
const status=verifyTarget(), base='http://127.0.0.1:3011';
const build=JSON.parse(fs.readFileSync(path.join(output,'local-app-build.json'),'utf8'));
assert.equal(build.apiUrl,status.API_URL); assert.equal(build.anonKeyHash,sha(status.ANON_KEY));
assert.equal(build.buildId,fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim());
assert.equal((await fetch(`${base}/_next/static/${build.buildId}/_buildManifest.js`,{signal:AbortSignal.timeout(10000)})).status,200);
const control=jsonSql("SELECT json_build_object('paused',paused,'generation',generation::text) FROM coaching_write_control;");
assert.equal(control.paused,false);assert(BigInt(control.generation)>0n);
const runId=randomUUID(), directory=path.join(output,`live-worker-local-${runId}`);
fs.mkdirSync(directory);
const actors=new Map(), owners={};
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
for(const label of ['rolling','legacy']) {
  const email=`setup-${runId}-${label}@sociusfit-local.invalid`,password=randomUUID()+randomUUID();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true}); assert.equal(created.error,null);
  const userId=created.data.user.id;
  const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);
  assert.equal(signed.data.user.id,userId);await provisionLocalOwnerProfile(client,userId);
  const cookies=[];
  class Adapter extends CookieAuthStorageAdapter { setCookie(k,v){cookies.push(`${k}=${encodeURIComponent(v)}`);} }
  new Adapter().setItem('sb-127-auth-token',JSON.stringify(signed.data.session));
  actors.set(userId,{client,cookie:cookies.join('; ')});owners[label]={userId,email,label};
}
const manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',
  deploymentId:'dpl_localfixture',pausedGeneration:String(BigInt(control.generation)-1n),owners,idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),
  numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000};
// Production-shaped manifests exercise contract semantics, not target attestation.
// Actual transport above is verified loopback. No production readiness is claimed.
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
const actor=owner=>{assert(actors.has(owner),'Unknown synthetic owner');return actors.get(owner);};
const actorSql=owner=>{actor(owner);return `SET ROLE authenticated; SET request.jwt.claim.sub=${literal(owner)};`;};
const asyncSql=createLocalAsyncSql();
const fixture=async request=>{
  const rendered=renderLiveFixtureSql(manifest,request.step,request);
  fs.writeFileSync(path.join(directory,`${request.step}.sql-intent.json`),JSON.stringify(rendered),{flag:'wx',flush:true});
  return asyncSql(rendered.sql,{signal:request.signal});
};
const journal={
  async reserve(value){fs.writeFileSync(path.join(directory,`${value.index}-${value.step}.intent.json`),JSON.stringify(value),{flag:'wx'});},
  async complete(value){fs.writeFileSync(path.join(directory,`${value.index}-${value.step}.result.json`),JSON.stringify(value),{flag:'wx'});},
};
const io={
  async api({owner,route,body,signal}) {
    const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:actor(owner).cookie},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal});
    return {status:response.status,value:await response.json()};
  },
  confirm:fixture,
  expire:fixture,
  async revision({owner,signal}) {return asyncSql(`BEGIN READ ONLY; ${actorSql(owner)} SELECT to_json(revision::text) FROM public.coach_context_revisions WHERE user_id=${literal(owner)}::uuid; ROLLBACK;`,{signal});},
  async waitUntil({at,signal}) {const ms=Date.parse(at)-Date.now();assert(ms>0&&ms<=15000);await delay(ms+200,undefined,{signal});},
  async findReview({owner,idempotencyKey,signal}) {
    const result=await actor(owner).client.from('coach_weekly_reviews').select('id,rationale').eq('user_id',owner).eq('idempotency_key',idempotencyKey).abortSignal(signal).single();
    assert.equal(result.error,null);return result.data;
  },
  async history({owner,planId,signal}) {
    const client=actor(owner).client;
    const p=await client.from('training_plan_versions').select('id,user_id,intent,input_snapshot').eq('user_id',owner).eq('id',planId).abortSignal(signal).single();
    const s=await client.from('prescribed_sessions').select('id,plan_version_id,user_id,scheduled_date,week_number,session_index,prescription').eq('user_id',owner).eq('plan_version_id',planId).abortSignal(signal);
    assert.equal(p.error,null);assert.equal(s.error,null);return {plan:p.data,sessions:s.data};
  },
  seedLegacy:fixture,
};
const controller=new AbortController(),openedAt=Date.now();
const gate=createLiveSetupOperationGate(manifest,{journal,openedAt,signal:controller.signal});
try {
  const result=await runLiveSetupLifecycle(manifest,io,gate);
  const receipt={...result,localOnly:true,app:base,api:status.API_URL,buildId:build.buildId,runId,steps:gate.status().completedSteps,
    completedAt:new Date().toISOString(),durationMs:Date.now()-openedAt,guardianRehearsed:false};
  fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify(receipt));
} catch(error) {
  fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({runId,code:error.code??error.message,steps:gate.status(),localOnly:true}),{flag:'wx'});
  console.error(JSON.stringify({runId,localOnly:true,failed:true,code:error.code??error.message}));process.exitCode=1;
}
