// Prepared production entry point. --prepare is private local storage only.
// All other modes require separately approved production execution. Nothing in
// this file deploys, migrates, deletes accounts or resumes normal coaching.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {privateEnvironment} from './private-recovery-files.mjs';
import {LIVE_SETUP_TARGET,LIVE_SETUP_KEYS,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
import {openPrivateLiveSetupJournal,readPrivateLiveSetupManifest} from './setup-freshness-live-private-journal.mjs';
import {openProductionSetupSql,closeCrashedSetupCoordinator} from './setup-freshness-live-production-sql.mjs';
import {provisionLiveSetupOwners} from './setup-freshness-live-provision.mjs';
import {inspectLiveProcess} from './setup-freshness-live-process.mjs';
import {runSetupGuardian} from './setup-freshness-live-guardian.mjs';
import {compareLiveAudits} from './setup-freshness-live-audit.mjs';
import {historyDigest} from './setup-freshness-live-lifecycle.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
async function main(){
const [mode,runId]=process.argv.slice(2);
assert(['--prepare','--provision','--coordinator','--guardian','--audit-recovery'].includes(mode));
assert.equal(process.argv.length,mode==='--prepare'?3:4);
const optional=async(e,name)=>{try{return await e.read(name);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const waitRecord=async(e,name,ms)=>{const deadline=Date.now()+ms;while(Date.now()<deadline){const r=await optional(e,name);if(r)return r;await delay(200);}throw Error(`Missing ${name}`);};
const bounded=async(promise,ms,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}};
const identity=async pid=>{const r=await inspectLiveProcess(pid);assert.equal(r.running,true);return r.identity;};

function verifyDeployment(manifest){
  const result=execFileSync(process.execPath,['scripts/release/setup-freshness-platform-readback.mjs','--read-only'],
    {cwd:root,env:privateEnvironment(),windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
  const report=JSON.parse(result.trim()),receipt=path.resolve(root,report.receipt);
  assert(receipt.startsWith(path.join(root,'output/setup-freshness-release')+path.sep));
  const readback=JSON.parse(fs.readFileSync(receipt,'utf8'));
  assert.equal(readback.passed,true);assert.equal(readback.deployment.id,manifest.deploymentId);
  assert.equal(readback.deployment.commit,manifest.candidateSha);
  assert(Date.now()-Date.parse(readback.completedAt)<60000);
  const capability=execFileSync('git',['show',`${manifest.candidateSha}:app/lib/personalized-coaching-capabilities.ts`],
    {cwd:root,env:privateEnvironment(),windowsHide:true,encoding:'utf8',timeout:10000});
  assert(/initialDosePolicy:\s*false/.test(capability),'Candidate numerical policy must remain disabled');
  return readback;
}

if(mode==='--prepare'){
  // Secure stdin from an approved local operator. Never use chat, command-line
  // arguments or a repository file for keys. This mode makes no network calls.
  const bytes=[];let count=0;for await(const chunk of process.stdin){count+=chunk.length;assert(count<32768);bytes.push(chunk);}
  const input=JSON.parse(Buffer.concat(bytes).toString('utf8')),id=randomUUID();
  const manifest={schema:'socius-setup-live-1',runId:id,...LIVE_SETUP_TARGET,candidateSha:input.candidateSha,deploymentId:input.deploymentId,pausedGeneration:input.pausedGeneration,
    owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${id}-${label}@sociusfit-local.invalid`}])),
    idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000};
  validateLiveSetupManifest(manifest);assert.notEqual(manifest.deploymentId,'dpl_localfixture');
  for(const [key,role] of [[input.anonKey,'anon'],[input.serviceRoleKey,'service_role']]){
    assert.equal(typeof key,'string');assert.equal(key.split('.').length,3);
    const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));
    assert.equal(claims.ref,LIVE_SETUP_TARGET.project);assert.equal(claims.role,role);
  }
  assert(typeof input.managementAccessToken==='string'&&input.managementAccessToken.length>20,'Approved scoped management token required');
  const e=await openPrivateLiveSetupJournal(manifest,{create:true});
  try{await e.record('operator-credentials',{anonKey:input.anonKey,serviceRoleKey:input.serviceRoleKey,managementAccessToken:input.managementAccessToken});
    console.log(JSON.stringify({prepared:true,runId:id,networkCalls:0,manifestHash:validateLiveSetupManifest(manifest).hash}));
  }finally{e.dispose();}
}else{
  const manifest=readPrivateLiveSetupManifest(runId),e=await openPrivateLiveSetupJournal(manifest);
  assert.notEqual(manifest.deploymentId,'dpl_localfixture');
  let transport,worker;
  try {
    if(mode==='--provision'){
      await e.record('provision-deployment',verifyDeployment(manifest));
      transport=await openProductionSetupSql(manifest,{evidence:e,channel:'operator'});
      assert.deepEqual(await transport.operator.readGate(),{paused:true,generation:manifest.pausedGeneration});
      assert.deepEqual(await transport.operator.readInstalledMigration(),{installed:true,helpersPresent:true});
      const keys=await e.read('operator-credentials');
      const safeFetch=(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url);
        assert.equal(url.origin,LIVE_SETUP_TARGET.apiOrigin);assert(url.pathname.startsWith('/auth/v1/')||url.pathname==='/rest/v1/user_profiles');
        return fetch(input,{...init,redirect:'error',signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(15000)])});};
      const client=key=>createClient(LIVE_SETUP_TARGET.apiOrigin,key,{global:{fetch:safeFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const result=await provisionLiveSetupOwners(manifest,{evidence:e,admin:client(keys.serviceRoleKey),ownerClient:()=>client(keys.anonKey)});
      console.log(JSON.stringify({runId,...result}));
    }else if(mode==='--guardian'){
      transport=await openProductionSetupSql(manifest,{evidence:e,channel:'guardian'});
      const op=transport.operator,w=await e.read('worker-identity'),c=await e.read('coordinator-identity');
      assert.equal(path.resolve(w.path),path.resolve(process.execPath));assert(w.command.includes('setup-freshness-live-hosted-worker.mjs')&&w.command.includes(runId));
      assert(c.command.includes('setup-freshness-live-hosted.mjs')&&c.command.includes('--coordinator')&&c.command.includes(runId));
      assert.deepEqual(await op.readGate(),{paused:true,generation:manifest.pausedGeneration});
      let lastCheck=0,gone=false;
      const result=await runSetupGuardian(manifest,{...op,stopWorker:async context=>({terminated:(await inspectLiveProcess(w.pid,{expected:w,stop:true,...context})).running===false})},
        {startedAt:Date.now(),onReady:()=>e.record('guardian-ready',{pid:process.pid,startedAt:Date.now()}),requested:async()=>{
          if(await optional(e,'worker-result')||await optional(e,'worker-failure')||await optional(e,'worker-startup-failure')||await optional(e,'coordinator-failure'))return true;
          if(Date.now()-lastCheck>2000){lastCheck=Date.now();gone=(await inspectLiveProcess(c.pid,{expected:c})).running===false;}return gone;
        }});
      await e.record('guardian-result',result);console.log(JSON.stringify({runId,containmentVerified:result.containmentVerified,reason:result.reason}));
      // A terminal worker record may have triggered containment before the
      // periodic coordinator check. Inspect again before deciding cleanup.
      if(result.containmentVerified&&(await inspectLiveProcess(c.pid,{expected:c})).running===false)
        await closeCrashedSetupCoordinator(manifest,{evidence:e});
      if(!result.containmentVerified)process.exitCode=1;
    }else{
      // Provisioning closed its transport; use a distinct channel's immutable
      // records for coordinator/recovery. A crashed execution is never resumed.
      await e.record(mode==='--coordinator'?'execution-deployment':'recovery-deployment',verifyDeployment(manifest));
      transport=await openProductionSetupSql(manifest,{evidence:e,channel:mode==='--coordinator'?'coordinator':'recovery'});
      const op=transport.operator;
      if(mode==='--coordinator'){
        assert.deepEqual(await op.readGate(),{paused:true,generation:manifest.pausedGeneration});
        assert.deepEqual(await op.readInstalledMigration(),{installed:true,helpersPresent:true});
        await op.audit('before');const keys=await e.read('operator-credentials'),sessions=await e.read('owner-sessions');
        worker=fork(fileURLToPath(new URL('./setup-freshness-live-hosted-worker.mjs',import.meta.url)),[runId],
          {env:privateEnvironment(),windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
        let readyResolve,readyReject,exitResolve;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;}),exit=new Promise(r=>{exitResolve=r;});
        ready.catch(()=>{});worker.once('error',readyReject);worker.once('exit',exitResolve);worker.stderr.resume();
        worker.on('message',message=>{
          if(message?.type==='ready')readyResolve();
          const action=message?.type==='fixture'?()=>op.fixture(message.payload):message?.type==='database-time'?()=>op.readDatabaseTime():null;
          if(action)void action().then(value=>{if(worker.connected)worker.send({type:'operator-result',id:message.id,value});})
            .catch(()=>{if(worker.connected)worker.send({type:'operator-result',id:message.id,error:'operator_request_failed'});});
        });
        worker.send({type:'initialize',manifest,anonKey:keys.anonKey,sessions});
        await e.record('coordinator-identity',await identity(process.pid));await e.record('worker-identity',await identity(worker.pid));
        await bounded(Promise.race([ready,exit.then(()=>{throw Error('Worker exited before readiness');})]),45000,'Worker readiness timeout');
        console.log(JSON.stringify({runId,waitingForIndependentGuardian:true}));
        const ack=await waitRecord(e,'guardian-ready',60000);assert(Date.now()-ack.startedAt<15000,'Guardian readiness expired');
        await op.open();assert.deepEqual(await op.readGate(),{paused:false,generation:validateLiveSetupManifest(manifest).expectedOpenGeneration});
        worker.send({type:'start'});
        const containment=await waitRecord(e,'guardian-result',225000);assert.equal(containment.containmentVerified,true);
        await bounded(exit,10000,'Worker exit not observed');
      }else{
        for(const name of ['worker-identity','coordinator-identity']){const saved=await e.read(name);assert.equal((await inspectLiveProcess(saved.pid,{expected:saved})).running,false);}
        await closeCrashedSetupCoordinator(manifest,{evidence:e});
      }
      const containment=await e.read('guardian-result'),before=await e.read('audit-before-result');
      assert.deepEqual(await op.readGate(),{paused:true,generation:validateLiveSetupManifest(manifest).expectedClosedGeneration});
      const after=await op.audit(mode==='--coordinator'?'after':'recovery');
      const audit=compareLiveAudits(manifest,before,after,containment);assert.equal(audit.globalHistoryVerified,true);
      const lifecycle=await optional(e,'worker-result');
      if(mode==='--coordinator'){
        assert.equal(lifecycle?.lifecyclePassed,true);assert.equal(lifecycle.historyProofs.length,2);
        for(const proof of lifecycle.historyProofs)assert.equal(historyDigest(await op.history(proof),proof.owner,proof.planId),proof.sha256);
      }
      const result={runId,containmentVerified:true,globalHistoryVerified:true,lifecyclePassed:lifecycle?.lifecyclePassed===true,
        syntheticHistoryVerified:mode==='--coordinator',coachingRemainsPaused:true};
      await e.record(mode==='--coordinator'?'attended-result':'recovery-result',result);console.log(JSON.stringify(result));
    }
  }catch(error){
    if(mode==='--coordinator'){
      await e.record('coordinator-failure',{code:error.message}).catch(()=>{});
      if(await optional(e,'guardian-ready'))await waitRecord(e,'guardian-result',225000).catch(()=>{});
      else if(worker)await inspectLiveProcess(worker.pid,{expected:await e.read('worker-identity'),stop:true}).catch(()=>{});
    }
    // Raw SDK/CLI errors may contain credentials. Detailed responses stay sealed.
    console.error(JSON.stringify({runId,mode,failed:true,reviewPrivateEvidence:true}));process.exitCode=1;
  }finally{try{await transport?.close();}finally{e.dispose();}}
}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{console.error('Hosted setup command failed; retain private evidence and do not retry mutations.');process.exitCode=1;});
