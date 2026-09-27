// Launched only by the separately authorized hosted coordinator. Privileged
// credentials never enter this process; SQL requests are fixed operator IPC.
import assert from 'node:assert/strict';
import {openPrivateLiveSetupJournal} from './setup-freshness-live-private-journal.mjs';
import {createLiveSetupHttp} from './setup-freshness-live-http.mjs';
import {createLiveSetupOperationGate} from './setup-freshness-live-contract.mjs';
import {runLiveSetupLifecycle} from './setup-freshness-live-lifecycle.mjs';
assert.equal(process.argv.length,3);
let initialize,start,terminal=false;
const initialized=new Promise(r=>{initialize=r;}),started=new Promise(r=>{start=r;}),pending=new Map();
process.on('message',message=>{
  if(message?.type==='initialize')initialize(message);
  if(message?.type==='start')start();
  if(message?.type==='operator-result'){
    const call=pending.get(message.id);if(call){pending.delete(message.id);message.error?call.reject(Error(message.error)):call.resolve(message.value);}
  }
});
process.on('disconnect',()=>process.exit(terminal?0:2));
const config=await initialized;assert.equal(config.manifest.runId,process.argv[2]);
const evidence=await openPrivateLiveSetupJournal(config.manifest);let sequence=0;
const request=(type,payload,signal)=>new Promise((resolve,reject)=>{
  signal?.throwIfAborted();const id=++sequence;pending.set(id,{resolve,reject});
  process.send({type,id,payload});
});
const io=createLiveSetupHttp(config.manifest,{
  anonKey:config.anonKey,sessions:config.sessions,
  executeFixture:({signal,...payload})=>request('fixture',payload,signal),
  readDatabaseTime:({signal})=>request('database-time',{},signal),
});
try {
  await io.ready();await evidence.record('worker-ready',{pid:process.pid});process.send({type:'ready'});
  await started;
  const gate=createLiveSetupOperationGate(config.manifest,{journal:evidence.journal,openedAt:Date.now(),signal:new AbortController().signal});
  try {await evidence.record('worker-result',{...await runLiveSetupLifecycle(config.manifest,io,gate),steps:gate.status()});}
  catch(error){await evidence.record('worker-failure',{code:error.message,steps:gate.status()});}
}catch(error){await evidence.record('worker-startup-failure',{code:error.message});}
finally{terminal=true;evidence.dispose();process.disconnect();}
