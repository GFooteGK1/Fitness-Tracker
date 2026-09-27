// Concurrency proof using real local PostgreSQL, never a hosted connection.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {verifyTarget,output,createLocalAsyncSql,holdTransaction,literal} from './setup-freshness-local-db.mjs';
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET} from './setup-freshness-live-contract.mjs';
import {renderLiveFixtureSql} from './setup-freshness-live-fixtures.mjs';

assert.deepEqual(process.argv.slice(2),['--new-run']);
const status=verifyTarget(),query=createLocalAsyncSql(),runId=randomUUID();
const dir=path.join(output,`fixture-drain-local-${runId}`);fs.mkdirSync(dir);
const gate=()=>query("SELECT json_build_object('paused',paused,'generation',generation::text) FROM coaching_write_control;");
const change=(paused,generation)=>query(`SELECT json_build_object('paused',paused,'generation',generation::text) FROM set_coaching_write_pause(${paused},${literal(generation)}::bigint,'Local fixture drainage proof');`);
const original=await gate();assert.equal(original.paused,false);assert(BigInt(original.generation)>0n);
const owners={},admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
for(const label of ['rolling','legacy']) {
  const email=`setup-${runId}-${label}@sociusfit-local.invalid`;
  const created=await admin.auth.admin.createUser({email,password:randomUUID()+randomUUID(),email_confirm:true});assert.equal(created.error,null);
  owners[label]={label,email,userId:created.data.user.id};
}
const manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',
  deploymentId:'dpl_localfixture',pausedGeneration:String(BigInt(original.generation)-1n),owners,
  idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000};
const request={owner:owners.rolling.userId,idempotencyKey:manifest.idempotencyKeys['rolling-confirm-initial']};
const source=renderLiveFixtureSql(manifest,'rolling-confirm-initial',request).sql;
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest),{flag:'wx'});
const memoryCount=()=>query(`SELECT to_json(count(*)) FROM coach_memories WHERE user_id=${literal(request.owner)}::uuid;`);
const checks=[];let held;
try {
  const wrong={...manifest,pausedGeneration:original.generation};
  await assert.rejects(query(renderLiveFixtureSql(wrong,'rolling-confirm-initial',request).sql),e=>e.sqlstate==='55000');
  assert.equal(await memoryCount(),0);checks.push('wrong-generation-no-write');

  held=holdTransaction(source.replace(/^BEGIN;\n/,'').replace(/COMMIT;\n$/,''));await held.ready;
  const pendingPause=query(`SET application_name='setup-local-drain-pause'; SELECT json_build_object('paused',paused,'generation',generation::text) FROM set_coaching_write_pause(true,${original.generation}::bigint,'Local pending fixture drain');`);
  pendingPause.catch(()=>{});
  const waiting=await query("SELECT to_json(EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='setup-local-drain-pause' AND wait_event_type='Lock')); ");
  assert.equal(waiting,true,'Pause must be observed waiting for fixture transaction');
  held.release();await held.done;held=undefined;
  const closed=await pendingPause;assert.equal(closed.paused,true);assert.equal(await memoryCount(),1);
  checks.push('in-flight-fixture-commits-before-pause');
  await assert.rejects(query(source),e=>e.sqlstate==='55000');assert.equal(await memoryCount(),1);
  checks.push('late-fixture-rejected-after-pause');

  const reopened=await change(false,closed.generation);
  const nextManifest={...manifest,pausedGeneration:String(BigInt(reopened.generation)-1n)};
  const nextRequest={owner:owners.rolling.userId,idempotencyKey:manifest.idempotencyKeys['rolling-confirm-replacement']};
  held=holdTransaction(`SELECT * FROM set_coaching_write_pause(true,${reopened.generation}::bigint,'Local pause wins fixture race');`);await held.ready;
  const late=query(renderLiveFixtureSql(nextManifest,'rolling-confirm-replacement',nextRequest).sql);late.catch(()=>{});
  await delay(100);held.release();await held.done;held=undefined;
  await assert.rejects(late,e=>e.sqlstate==='55000');assert.equal(await memoryCount(),1);
  checks.push('pause-wins-before-new-fixture');
  const final=await gate();assert.equal(final.paused,true);
  await change(false,final.generation);
  const receipt={localOnly:true,runId,checks,passed:true};
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify(receipt));
} catch(error) {
  if(held){held.abort();await held.done.catch(()=>{});}
  const observed=await gate();if(!observed.paused)await change(true,observed.generation);
  fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify({localOnly:true,runId,checks,code:error.message,sqlstate:error.sqlstate,finalGate:await gate()}),{flag:'wx'});
  throw error;
}
