// Real candidate HTTP + local Auth/PostgREST. Creates only new synthetic identities.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CookieAuthStorageAdapter } from '@supabase/auth-helpers-shared';
import { provisionLocalOwnerProfile } from './local-owner-profile.mjs';
import { root, output, verifyTarget, sql, jsonSql, literal, callSql, sha } from './setup-freshness-local-db.mjs';

assert.deepEqual(process.argv.slice(2),['--new-run']);
const status=verifyTarget(), base='http://127.0.0.1:3011';
const build=JSON.parse(fs.readFileSync(path.join(output,'local-app-build.json'),'utf8'));
assert.equal(build.apiUrl,status.API_URL); assert.equal(build.anonKeyHash,sha(status.ANON_KEY));
assert.equal(build.buildId,fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim());
assert.equal((await fetch(`${base}/_next/static/${build.buildId}/_buildManifest.js`,{signal:AbortSignal.timeout(10000)})).status,200,'Candidate build is not serving app port');
assert.equal(jsonSql('SELECT to_json(paused) FROM coaching_write_control;'),false);
const run=path.join(output,`http-freshness-${randomUUID()}`); fs.mkdirSync(run);
const checks=[], accounts=[];
const record=label=>{checks.push(label); console.log(`PASS ${label}`);};
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const actor=id=>`SET ROLE authenticated; SET request.jwt.claim.sub=${literal(id)};`;
const rpcSql=(owner,name,args)=>JSON.parse(sql(`${actor(owner.id)} ${callSql(name,args)}`).text);
const revision=owner=>Number(sql(`${actor(owner.id)} SELECT public.get_coach_context_revision();`).text);
async function account(name) {
  const email=`http-setup-${randomUUID()}@sociusfit-local.invalid`, password=randomUUID()+randomUUID();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert.equal(created.error,null);
  const id=created.data.user.id; accounts.push({name,id,email,password});
  fs.writeFileSync(path.join(run,'accounts.private.json'),JSON.stringify(accounts));
  const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email,password});
  assert.equal(signed.error,null); assert.equal(signed.data.user.id,id);
  await provisionLocalOwnerProfile(client,id);
  const cookies=[];
  class Adapter extends CookieAuthStorageAdapter { setCookie(key,value) { cookies.push(`${key}=${encodeURIComponent(value)}`); } }
  new Adapter().setItem('sb-127-auth-token',JSON.stringify(signed.data.session));
  return {id,client,cookie:cookies.join('; ')};
}
async function api(owner,route,body,expected=200) {
  const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:owner.cookie},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  const value=await response.json();
  assert.equal(response.status,expected,`${route}: ${JSON.stringify(value)}`);
  return value;
}
const planningInput={format:'complete_programming_intake_v0_3',primaryDomain:'strength',goal:'Build useful full-body strength',experience:'consistent',
  trainingDays:['monday','wednesday','friday'],sessionMinutes:60,equipment:'Bodyweight',resolvedEquipmentIds:['bodyweight'],constraints:'',constraintKinds:[],
  secondaryGoals:[],startDate:'2026-09-14',setupConfirmed:true};
const schedule={experience:planningInput.experience,trainingDays:planningInput.trainingDays,sessionMinutes:planningInput.sessionMinutes};
function confirm(owner) { return rpcSql(owner,'confirm_coach_memory',['training_schedule','schedule',schedule,{source:'program_setup',confirmedBy:'athlete'},1,randomUUID()]); }
function expiring(owner,memory) {
  // Synthetic fixture lifetime is installed BEFORE the proposal reads it.
  return jsonSql(`UPDATE coach_memories SET review_after=clock_timestamp()+interval '15 seconds'
    WHERE id=${literal(memory.memory_id)} AND user_id=${literal(owner.id)} RETURNING to_json(review_after);`);
}
async function elapsed(timestamp) {
  const ms=Date.parse(timestamp)-Date.now(); assert(ms>0 && ms<=15000,'Fixture expired before proposal creation');
  await new Promise(resolve=>setTimeout(resolve,ms+200));
}
const freshRequest=()=>({tzOffset:300,idempotencyKey:randomUUID(),goalTargetDate:'2027-04-01',planningInput});
const reviewRequest=()=>({asOf:'2026-09-23T16:00:00.000Z',tzOffset:300,windowDays:28,athleteRequestedReview:true,reviewIdempotencyKey:randomUUID(),proposalIdempotencyKey:randomUUID()});
const accept=(owner,proposal,key,expected=200)=>api(owner,`/api/coach/proposals/${proposal.proposalId}/accept`,{idempotencyKey:key},expected);
const acceptedHash=state=>sha(JSON.stringify(state.currentWeek.intent));
let phase='initial clock expiry';
try {
  const owner=await account('rolling'), legacy=await account('legacy');
  const expires=expiring(owner,confirm(owner)), observed=revision(owner), initialBody=freshRequest();
  const initial=await api(owner,'/api/coach/weekly',initialBody,201);
  await elapsed(expires); assert.equal(revision(owner),observed);
  await accept(owner,initial,initialBody.idempotencyKey,409);
  assert.equal((await api(owner,'/api/coach/weekly')).pendingProposal,null);
  confirm(owner);
  const freshBody=freshRequest(), fresh=await api(owner,'/api/coach/weekly',freshBody,201);
  assert.notEqual(fresh.proposalId,initial.proposalId); await accept(owner,fresh,freshBody.idempotencyKey);
  const accepted=await api(owner,'/api/coach/weekly'), before=acceptedHash(accepted);
  record('Initial HTTP acceptance rejects clock-expired setup at unchanged revision; confirmed setup recovers with a fresh accepted week');

  phase='stored review clock expiry';
  const reviewExpires=expiring(owner,confirm(owner)), reviewRevision=revision(owner);
  const reviewBody=reviewRequest(); delete reviewBody.proposalIdempotencyKey;
  // Deliberate partial workflow: persist the real review, omit proposal key, then
  // recover it through the separate stored-review route. No forged review JSON.
  const partial=await api(owner,'/api/coach/weekly/review',reviewBody,400);
  assert.equal(partial.error,'A valid proposal idempotency key is required');
  const saved=await owner.client.from('coach_weekly_reviews').select('id,rationale').eq('idempotency_key',reviewBody.reviewIdempotencyKey).single();
  assert.equal(saved.error,null); assert(saved.data.rationale.setupMemoryBindings);
  const storedKey=randomUUID(), route=`/api/coach/weekly/reviews/${saved.data.id}/proposal`;
  const restored=await api(owner,route,{tzOffset:300,idempotencyKey:storedKey},201);
  record('Saved real review reconstructs its pending week through the stored-review HTTP route');
  await elapsed(reviewExpires); assert.equal(revision(owner),reviewRevision);
  await accept(owner,restored,storedKey,409);
  const staleReview=await api(owner,route,{tzOffset:300,idempotencyKey:randomUUID()},409);
  assert.equal(staleReview.error,'Review the current training setup again before creating a proposal');
  assert.equal(acceptedHash(await api(owner,'/api/coach/weekly')),before);
  await accept(owner,fresh,freshBody.idempotencyKey);
  confirm(owner);
  const refreshedBody=reviewRequest(), refreshed=await api(owner,'/api/coach/weekly/review',refreshedBody,201);
  assert.notEqual(refreshed.review.id,saved.data.id); assert.notEqual(refreshed.proposalId,restored.proposalId);
  await accept(owner,refreshed,refreshedBody.proposalIdempotencyKey);
  const historical=await owner.client.from('training_plan_versions').select('intent').eq('id',fresh.planVersionId).single();
  assert.equal(historical.error,null); assert.equal(sha(JSON.stringify(historical.data.intent)),before);
  record('Expired stored review cannot gain fresh authority; current review recovers while accepted history and accepted replay remain intact');

  phase='legacy conversion clock expiry';
  const legacyKey=randomUUID();
  const sessions=Array.from({length:16},(_,i)=>({week_number:Math.floor(i/2)+1,session_index:i%2+1,scheduled_date:'2026-09-14',
    prescription:{domain:'strength',intent:'Synthetic legacy fixture',dose:{},effort:'Controlled',rest:'As needed',success_condition:'Quality',stop_condition:'Stop on pain',scale_options:[],evidence:{}}}));
  const old=rpcSql(legacy,'create_initial_training_plan_proposal',['Synthetic legacy conversion fixture','Build useful full-body strength','2026-09-14','fixture','fixture',
    {horizon_weeks:8,primary_domain:'strength',weeks:[{week_number:1}]},{},sessions,{},'e'.repeat(64),legacyKey]);
  rpcSql(legacy,'accept_adaptation_proposal',[old.proposal_id,legacyKey]);
  const legacyBefore=jsonSql(`SELECT json_build_object('intent',intent,'snapshot',input_snapshot) FROM training_plan_versions WHERE id=${literal(old.proposed_plan_version_id)} AND user_id=${literal(legacy.id)};`);
  const conversionExpires=expiring(legacy,confirm(legacy)), conversionRevision=revision(legacy);
  const conversionBody={...freshRequest(),hypothesis:'Confirm current setup and replace legacy programming'};
  const conversion=await api(legacy,'/api/coach/weekly/convert',conversionBody,201);
  await elapsed(conversionExpires); assert.equal(revision(legacy),conversionRevision);
  await accept(legacy,conversion,conversionBody.idempotencyKey,409);
  confirm(legacy);
  const retryBody={...conversionBody,idempotencyKey:randomUUID()}, retry=await api(legacy,'/api/coach/weekly/convert',retryBody,201);
  assert.notEqual(retry.proposalId,conversion.proposalId); await accept(legacy,retry,retryBody.idempotencyKey);
  assert.equal((await api(legacy,'/api/coach/weekly')).currentWeek.id,retry.planVersionId);
  assert.deepEqual(jsonSql(`SELECT json_build_object('intent',intent,'snapshot',input_snapshot) FROM training_plan_versions WHERE id=${literal(old.proposed_plan_version_id)} AND user_id=${literal(legacy.id)};`),legacyBefore);
  record('Legacy conversion rejects clock-expired setup and accepts a fresh replacement without rewriting legacy history');
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify({verifiedAt:new Date().toISOString(),passed:true,buildId:build.buildId,app:base,api:status.API_URL,checks,
    limitations:['Synthetic local data and schema; no hosted verification','Direct HTTP lifecycle coverage; mobile browser rendering is separate']},null,2)+'\n');
  console.log(`Verified ${checks.length} lifecycle groups; receipt ${path.relative(root,path.join(run,'result.json'))}`);
} catch(error) {
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify({verifiedAt:new Date().toISOString(),passed:false,phase,checks,error:String(error)},null,2)+'\n');
  throw error;
}
