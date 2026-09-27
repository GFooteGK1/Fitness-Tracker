// Two attended commands, launched in INDEPENDENT execution sessions:
//   node ... --coordinator success|worker-failure|coordinator-crash
//   node ... --guardian <printed-run-id>
// Both are hard-bound to the existing isolated loopback stack. No hosted mode.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {provisionLocalOwnerProfile} from './local-owner-profile.mjs';
import {root,output,verifyTarget,createLocalAsyncSql,sha} from './setup-freshness-local-db.mjs';
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
import {openPrivateLiveSetupJournal,readPrivateLiveSetupManifest} from './setup-freshness-live-private-journal.mjs';
import {createLiveSqlOperator,LIVE_GATE_READ_SQL} from './setup-freshness-live-sql.mjs';
import {runSetupGuardian} from './setup-freshness-live-guardian.mjs';
import {inspectLiveProcess} from './setup-freshness-live-process.mjs';
import {compareLiveAudits} from './setup-freshness-live-audit.mjs';
import {historyDigest} from './setup-freshness-live-lifecycle.mjs';

const [mode,arg]=process.argv.slice(2);assert.equal(process.argv.length,4);
assert(['--coordinator','--guardian','--recover-local'].includes(mode));
const status=verifyTarget(),query=createLocalAsyncSql();
const optional=async(evidence,name)=>{try{return await evidence.read(name);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const waitRecord=async(evidence,name,ms)=>{const until=Date.now()+ms;while(Date.now()<until){const value=await optional(evidence,name);if(value)return value;await delay(200);}throw Error(`Timed out waiting for ${name}`);};
const currentProcess=async pid=>{const value=await inspectLiveProcess(pid);assert.equal(value.running,true);return value.identity;};
const bounded=async(promise,ms,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}};

if(mode==='--recover-local') {
  const manifest=readPrivateLiveSetupManifest(arg),evidence=await openPrivateLiveSetupJournal(manifest);
  assert.equal(manifest.deploymentId,'dpl_localfixture');
  try {
    const operator=createLiveSqlOperator(manifest,{query,record:evidence.record});
    const coordinator=await evidence.read('coordinator-identity'),worker=await evidence.read('worker-identity');
    assert.equal((await inspectLiveProcess(coordinator.pid,{expected:coordinator})).running,false);
    assert.equal((await inspectLiveProcess(worker.pid,{expected:worker})).running,false);
    const containment=await evidence.read('guardian-result');assert.equal(containment.containmentVerified,true);
    const before=await evidence.read('audit-before-result');
    const after=await operator.audit('recovery');
    const audit=compareLiveAudits(manifest,before,after,containment);assert.equal(audit.globalHistoryVerified,true);
    const closed=await operator.readGate();assert.deepEqual(closed,{paused:true,generation:validateLiveSetupManifest(manifest).expectedClosedGeneration});
    await evidence.record('local-recovery-restore-intent',{generation:closed.generation});
    const restored=await query(`SELECT json_build_object('paused',paused,'generation',generation::text) FROM public.set_coaching_write_pause(false,${closed.generation}::bigint,'Restore isolated fixture after recovery audit');`);
    assert.deepEqual(restored,{paused:false,generation:String(BigInt(closed.generation)+1n)});
    const receipt={localOnly:true,runId:manifest.runId,containmentVerified:true,globalHistoryVerified:true,restoredLocalFixture:true};
    await evidence.record('local-recovery-result',receipt);
    fs.writeFileSync(path.join(output,`attended-local-recovery-${manifest.runId}.json`),JSON.stringify(receipt,null,2),{flag:'wx'});
    console.log(JSON.stringify(receipt));
  }finally{evidence.dispose();}
} else if(mode==='--guardian') {
  const manifest=readPrivateLiveSetupManifest(arg),evidence=await openPrivateLiveSetupJournal(manifest);
  const operator=createLiveSqlOperator(manifest,{query,record:evidence.record});
  const worker=await evidence.read('worker-identity'),coordinator=await evidence.read('coordinator-identity');
  assert.equal(path.resolve(worker.path),path.resolve(process.execPath));
  assert(worker.command.includes('setup-freshness-live-local-worker.mjs')&&worker.command.includes(manifest.runId));
  assert(coordinator.command.includes('setup-freshness-live-attended-local.mjs')&&coordinator.command.includes('--coordinator'));
  assert.deepEqual(await operator.readGate(),{paused:true,generation:manifest.pausedGeneration});
  let lastProcessRead=0,coordinatorGone=false;
  const result=await runSetupGuardian(manifest,{
    ...operator,
    async stopWorker(context){const value=await inspectLiveProcess(worker.pid,{expected:worker,stop:true,...context});return {terminated:value.running===false};},
  },{startedAt:Date.now(),
    onReady:()=>evidence.record('guardian-ready',{pid:process.pid,startedAt:Date.now()}),
    requested:async()=>{
      if(await optional(evidence,'worker-result')||await optional(evidence,'worker-failure')||await optional(evidence,'coordinator-failure'))return true;
      if(Date.now()-lastProcessRead>2000){lastProcessRead=Date.now();coordinatorGone=(await inspectLiveProcess(coordinator.pid,{expected:coordinator})).running===false;}
      return coordinatorGone;
    },
  });
  await evidence.record('guardian-result',result);
  fs.writeFileSync(path.join(output,`attended-local-guardian-${manifest.runId}.json`),JSON.stringify({localOnly:true,runId:manifest.runId,...result},null,2),{flag:'wx'});
  evidence.dispose();console.log(JSON.stringify({localOnly:true,runId:manifest.runId,containmentVerified:result.containmentVerified,reason:result.reason}));
  if(!result.containmentVerified)process.exitCode=1;
} else {
  assert(['success','worker-failure','coordinator-crash'].includes(arg));
  const build=JSON.parse(fs.readFileSync(path.join(output,'local-app-build.json'),'utf8'));
  assert.equal(build.apiUrl,status.API_URL);assert.equal(build.anonKeyHash,sha(status.ANON_KEY));assert.equal(build.buildId,fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim());
  assert.equal((await fetch(`http://127.0.0.1:3011/_next/static/${build.buildId}/_buildManifest.js`,{signal:AbortSignal.timeout(10000)})).status,200);
  const original=await query(LIVE_GATE_READ_SQL);assert.equal(original.paused,false);
  const runId=randomUUID(),owners={},sessions={};
  const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const label of ['rolling','legacy']){
    const email=`setup-${runId}-${label}@sociusfit-local.invalid`,password=randomUUID()+randomUUID();
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);
    const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.equal(signed.data.user.id,created.data.user.id);
    await provisionLocalOwnerProfile(client,signed.data.user.id);owners[label]={label,email,userId:signed.data.user.id};sessions[signed.data.user.id]=signed.data.session;
  }
  const manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_localfixture',pausedGeneration:String(BigInt(original.generation)+1n),owners,
    idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000};
  const evidence=await openPrivateLiveSetupJournal(manifest,{create:true}),operator=createLiveSqlOperator(manifest,{query,record:evidence.record});
  let worker;
  try {
  await evidence.record('local-preparation-pause-intent',{generation:original.generation});
  const baseline=await query(`SELECT json_build_object('paused',paused,'generation',generation::text) FROM public.set_coaching_write_pause(true,${original.generation}::bigint,'Local attended rehearsal preparation');`);
  assert.deepEqual(baseline,{paused:true,generation:manifest.pausedGeneration});
  const before=await operator.audit('before');
  worker=fork(fileURLToPath(new URL('./setup-freshness-live-local-worker.mjs',import.meta.url)),[runId],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  let resolveReady,rejectReady,resolveExit;const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;}),exited=new Promise(r=>{resolveExit=r;});
  worker.once('error',error=>rejectReady(error));
  ready.catch(()=>{});
  worker.once('exit',code=>resolveExit(code));worker.stderr.resume();
  worker.on('message',message=>{
    if(message?.type==='ready')resolveReady();
    if(message?.type==='database-time')void operator.readDatabaseTime().then(value=>{
      if(worker.connected)worker.send({type:'fixture-result',step:message.step,value});
    }).catch(()=>{if(worker.connected)worker.send({type:'fixture-result',step:message.step,error:'database_clock_read_failed'});});
    if(message?.type==='fixture')void operator.fixture(message.payload).then(async value=>{
      if(arg==='coordinator-crash'){await evidence.record('injected-coordinator-crash',{afterStep:message.payload.step});process.exit(23);}
      if(worker.connected)worker.send({type:'fixture-result',step:message.payload.step,value});
    }).catch(error=>{if(worker.connected)worker.send({type:'fixture-result',step:message.payload.step,error:error.message});});
  });
  worker.send({type:'initialize',manifest,scenario:arg,api:status.API_URL,app:'http://127.0.0.1:3011',anonKey:status.ANON_KEY,sessions});
  await evidence.record('coordinator-identity',await currentProcess(process.pid));
  await evidence.record('worker-identity',await currentProcess(worker.pid));
    await bounded(Promise.race([ready,exited.then(()=>{throw Error('Worker exited before readiness');})]),45000,'Worker readiness timeout');
    console.log(JSON.stringify({localOnly:true,runId,scenario:arg,waitingForIndependentGuardian:true}));
    const guardianReady=await waitRecord(evidence,'guardian-ready',60000);
    assert(Date.now()-guardianReady.startedAt<15000,'Guardian readiness expired');
    await operator.open();assert.deepEqual(await operator.readGate(),{paused:false,generation:validateLiveSetupManifest(manifest).expectedOpenGeneration});
    worker.send({type:'start'});
    const containment=await waitRecord(evidence,'guardian-result',225000);
    assert.equal(containment.containmentVerified,true);
    await bounded(exited,10000,'Worker exit observation timeout');
    const after=await operator.audit('after'),audit=compareLiveAudits(manifest,before,after,containment);
    assert.equal(audit.globalHistoryVerified,true);
    const lifecycle=await optional(evidence,'worker-result'),failure=await optional(evidence,'worker-failure');
    let historyVerified=false;
    if(arg==='success'){
      assert.equal(lifecycle?.lifecyclePassed,true);assert.equal(lifecycle.historyProofs.length,2);
      for(const proof of lifecycle.historyProofs)assert.equal(historyDigest(await operator.history(proof),proof.owner,proof.planId),proof.sha256);
      historyVerified=true;
    } else assert.equal(failure?.code,'injected_worker_failure');
    const receipt={localOnly:true,runId,scenario:arg,passed:true,lifecyclePassed:!!lifecycle?.lifecyclePassed,
      containmentVerified:true,globalHistoryVerified:true,syntheticHistoryVerified:historyVerified,buildId:build.buildId};
    await evidence.record('attended-result',receipt);
    fs.writeFileSync(path.join(output,`attended-local-${runId}.json`),JSON.stringify(receipt,null,2),{flag:'wx'});
    const closed=await operator.readGate();assert.equal(closed.paused,true);
    await query(`SELECT json_build_object('paused',paused,'generation',generation::text) FROM public.set_coaching_write_pause(false,${closed.generation}::bigint,'Restore isolated fixture after attended proof');`);
    console.log(JSON.stringify(receipt));
  } catch(error){
    await evidence.record('coordinator-failure',{code:error.message});
    if(!await optional(evidence,'guardian-ready')){if(worker?.connected)worker.kill();}
    else await waitRecord(evidence,'guardian-result',225000).catch(()=>{});
    console.error(JSON.stringify({localOnly:true,runId,failed:true,code:error.message}));process.exitCode=1;
  } finally {evidence.dispose();}
}
