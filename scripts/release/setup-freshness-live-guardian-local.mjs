// Real two-process containment rehearsal. All SQL uses the existing fixed
// loopback-only fixture helper. This file has no hosted execution mode.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {output,createLocalAsyncSql,holdTransaction,literal} from './setup-freshness-local-db.mjs';
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET} from './setup-freshness-live-contract.mjs';
import {runSetupGuardian} from './setup-freshness-live-guardian.mjs';

const jsonSql=createLocalAsyncSql();
const readGate=context=>jsonSql("SELECT json_build_object('paused',paused,'generation',generation::text) FROM public.coaching_write_control;",context);
const pause=(value,generation,context)=>jsonSql(`SELECT json_build_object('paused',paused,'generation',generation::text) FROM public.set_coaching_write_pause(${value},${literal(generation)}::bigint,'Isolated guardian rehearsal');`,context);
const bounded=async(promise,ms,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}};
const args=process.argv.slice(2);
if(args[0]==='--child') {
  assert.equal(args.length,2);assert(/^[a-f0-9-]{36}$/.test(args[1]));
  const directory=path.join(output,`guardian-local-${args[1]}`);
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  assert.equal(manifest.runId,args[1]);
  assert.deepEqual(await readGate(),{paused:true,generation:manifest.pausedGeneration});
  let requested=false;
  let stoppedResolve;
  const stopped=new Promise(resolve=>{stoppedResolve=resolve;});
  const start=new Promise((resolve,reject)=>{
    process.on('message',message=>{if(message?.type==='start')resolve(message.startedAt);if(message?.type==='contain')requested=true;if(message?.type==='worker-stopped')stoppedResolve({terminated:message.terminated===true});});
    process.on('disconnect',()=>{requested=true;reject(Error('disconnected_before_start'));});
  });
  process.send({type:'armed',runId:manifest.runId,pid:process.pid});
  await bounded(start,15000,'guardian_start_timeout');
  // Own the deadline in the guardian's clock domain. Readiness is acknowledged
  // by the validated state machine before the parent is allowed to open.
  const startedAt=Date.now();
  const receipt=await runSetupGuardian(manifest,{
    readGate:context=>readGate(context),
    stopWorker:async()=>{if(process.connected)process.send({type:'stop-worker'});return stopped;},
    reservePause:async value=>fs.writeFileSync(path.join(directory,`pause-${value.expectedGeneration}-intent.json`),JSON.stringify(value),{flag:'wx'}),
    pause:({expectedGeneration,...context})=>pause(true,expectedGeneration,context),
  },{startedAt,requested:()=>requested,onReady:()=>process.send({type:'started',runId:manifest.runId})});
  fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify({...receipt,localOnly:true,pid:process.pid},null,2),{flag:'wx'});
  if(process.connected)process.disconnect();
} else {
  assert.deepEqual(args,['--new-run']);
  const results=[];
  for(const scenario of ['worker-success','worker-crash','writer-delays-pause']) {
    const original=await readGate();assert.equal(original.paused,false,'Fixture must start open');
    const baseline=await pause(true,original.generation);assert.equal(baseline.paused,true);
    const runId=randomUUID(),directory=path.join(output,`guardian-local-${runId}`);fs.mkdirSync(directory);
    const manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',
      deploymentId:'dpl_localfixture',pausedGeneration:baseline.generation,
      owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
      idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000};
    fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest),{flag:'wx'});
    const child=fork(fileURLToPath(import.meta.url),['--child',runId],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
    // The worker is a separate idle process in this control-only rehearsal.
    // Termination is real; no athlete lifecycle is attributed to this fixture.
    const worker=fork(fileURLToPath(new URL('./setup-freshness-live-idle-worker.mjs',import.meta.url)),[],{windowsHide:true,stdio:'ignore'});
    let workerExited=false;const workerDone=new Promise(resolve=>worker.once('exit',()=>{workerExited=true;resolve();}));
    const stopWorker=async()=>{if(!workerExited)worker.kill();await bounded(workerDone,5000,'worker_stop_timeout');return workerExited;};
    let resolveArmed,resolveStarted;
    const armed=new Promise(r=>{resolveArmed=r;}),started=new Promise(r=>{resolveStarted=r;});
    child.on('message',m=>{if(m?.type==='armed')resolveArmed(m);if(m?.type==='started')resolveStarted(m);if(m?.type==='stop-worker')stopWorker().then(terminated=>{if(child.connected)child.send({type:'worker-stopped',terminated});}).catch(()=>{});});
    let childError='';child.stderr.on('data',b=>{childError+=b;});
    const finished=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Guardian exited ${code}: ${childError}`)));});
    finished.catch(()=>{});
    try {
    const ready=await bounded(Promise.race([armed,finished.then(()=>{throw Error('guardian_early_exit');})]),15000,'guardian_readiness_timeout');
    assert.notEqual(ready.pid,process.pid);assert.equal(ready.runId,runId);
    child.send({type:'start',startedAt:Date.now()});await bounded(Promise.race([started,finished]),15000,'guardian_start_timeout');
    assert.equal((await pause(false,baseline.generation)).paused,false);
    let held;
    if(scenario==='writer-delays-pause'){
      held=holdTransaction('SELECT singleton FROM public.coaching_write_control WHERE singleton FOR SHARE;');await held.ready;
      // Release below the operator lock timeout; the guardian must wait for
      // COMMIT and cannot call dispatch or an HTTP response the drain boundary.
      setTimeout(()=>held.release(),1800);
    }
    if(scenario==='worker-crash')await stopWorker();
    child.send({type:'contain'});
    await bounded(finished,220000,'guardian_finish_timeout');if(held)await held.done;
    const receipt=JSON.parse(fs.readFileSync(path.join(directory,'receipt.json'),'utf8'));
    assert.equal(receipt.containmentVerified,true);assert.equal(receipt.pauseSubmissions,1);
    const closed=await readGate();assert.deepEqual(closed,{paused:true,generation:String(BigInt(baseline.generation)+2n)});
    // Restore only this isolated fixture's switch after independently verified
    // containment, so subsequent local tests retain their original environment.
    assert.equal((await pause(false,closed.generation)).paused,false);
    results.push({scenario,runId,containmentVerified:true,separateProcess:true});
    } catch(error) {
      // Local fixture recovery only: never let a failed scenario silently leave
      // its switch open. Retain the failed receipt and independently read state.
      await stopWorker().catch(()=>{});
      if(child.connected)child.send({type:'contain'});
      await bounded(finished,220000,'guardian_failure_wait').catch(()=>{});
      const observed=await readGate();
      if(!observed.paused)await pause(true,observed.generation);
      fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({scenario,code:error.message,localOnly:true,finalGate:await readGate()}),{flag:'wx'});
      throw error;
    }
  }
  console.log(JSON.stringify({localOnly:true,results}));
}
