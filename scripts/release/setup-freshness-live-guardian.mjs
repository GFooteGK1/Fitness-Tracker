// Independent containment state machine. The caller must run this in its own
// process and acknowledge readiness before submitting any open transaction.
// No credentials, database access, or production executor is present here.
import { LIVE_SETUP_LIMITS, validateLiveSetupManifest } from './setup-freshness-live-contract.mjs';

const check=(ok,code)=>{if(!ok)throw new Error(code);};
export async function runSetupGuardian(input, adapter, options) {
  const manifest=structuredClone(input), validated=validateLiveSetupManifest(manifest);
  const {startedAt, now=Date.now, sleep=ms=>new Promise(r=>setTimeout(r,ms)), requested=()=>false}=options;
  check(Number.isSafeInteger(startedAt)&&startedAt<=now(),'guardian_start');
  await options.onReady?.({startedAt});
  const deadline=startedAt+LIVE_SETUP_LIMITS.closedObservationMs;
  const result={manifestHash:validated.hash,containmentVerified:false,pauseBoundaryVerified:false,workerStoppedVerified:false,pauseSubmissions:0,
    initialPausedObservation:false,containmentStartedAt:null,closedObservedAt:null,reason:null};
  const bounded=async fn=>{
    const ms=Math.min(8000,deadline-now());check(ms>0,'guardian_deadline');
    const controller=new AbortController();let timer;
    try{return await Promise.race([Promise.resolve().then(()=>fn({signal:controller.signal})),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('guardian_call_timeout'));},ms);})]);}
    finally{clearTimeout(timer);}
  };
  const submitted=new Set();let containmentStarted=false;
  try {
    while(now()<deadline) {
      let stopRequested;
      try{stopRequested=await bounded(()=>requested());}catch{stopRequested=true;result.signalReadFailure=true;}
      if(stopRequested||now()-startedAt>=manifest.workMs) {
        if(!containmentStarted){
          containmentStarted=true;result.containmentStartedAt=now();
          try {result.workerStoppedVerified=(await bounded(c=>adapter.stopWorker(c)))?.terminated===true;}
          catch {result.workerStopUncertain=true;}
        }
      }
      if(containmentStarted) {
        let gate;
        try {gate=await bounded(c=>adapter.readGate(c));}
        catch {result.gateReadFailure=true;await sleep(Math.min(250,Math.max(0,deadline-now())));continue;}
        check(gate&&typeof gate.paused==='boolean'&&typeof gate.generation==='string','guardian_gate_shape');
        if(gate.paused&&gate.generation===validated.expectedClosedGeneration) {
          result.pauseBoundaryVerified=true;result.closedObservedAt=now();break;
        }
        if(gate.paused&&gate.generation===validated.expectedOpenGeneration&&submitted.has(manifest.pausedGeneration)) {
          result.pauseBoundaryVerified=true;result.openingFenced=true;result.closedObservedAt=now();break;
        }
        const initial=gate.paused&&gate.generation===manifest.pausedGeneration;
        check(initial||(!gate.paused&&gate.generation===validated.expectedOpenGeneration),'guardian_unexpected_generation');
        if(initial)result.initialPausedObservation=true;
        if(!submitted.has(gate.generation)) {
          // These are two distinct, predefined CAS operations, each at most
          // once. Fencing the still-paused baseline invalidates a late opening.
          // If opening wins that race, a new read permits the open-generation
          // pause. An uncertain mutation is never repeated at its generation.
          submitted.add(gate.generation);
          await bounded(c=>adapter.reservePause({manifestHash:validated.hash,expectedGeneration:gate.generation,...c}));
          result.pauseSubmissions++;
          try {await bounded(c=>adapter.pause({expectedGeneration:gate.generation,...c}));}
          catch {result.pauseResponseUncertain=true;}
        }
      }
      await sleep(Math.min(250,Math.max(0,deadline-now())));
    }
    check(result.pauseBoundaryVerified,'guardian_pause_unverified');
    check(result.workerStoppedVerified,'guardian_worker_stop_unverified');
    result.containmentBeganWithinBound=result.containmentStartedAt-startedAt<=LIVE_SETUP_LIMITS.containmentStartMs;
    result.closedWithinBound=result.closedObservedAt-startedAt<=LIVE_SETUP_LIMITS.closedObservationMs;
    check(result.containmentBeganWithinBound&&result.closedWithinBound,'guardian_bound_exceeded');
    result.containmentVerified=true;
  } catch(error){result.reason=error.message;result.containmentVerified=false;}
  return result;
}
