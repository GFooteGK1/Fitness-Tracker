// Tests the shared provisioning flow only against the fixed isolated stack.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyTarget,createLocalAsyncSql} from './setup-freshness-local-db.mjs';
import {LIVE_SETUP_TARGET,LIVE_SETUP_KEYS} from './setup-freshness-live-contract.mjs';
import {LIVE_GATE_READ_SQL} from './setup-freshness-live-sql.mjs';
import {openPrivateLiveSetupJournal} from './setup-freshness-live-private-journal.mjs';
import {provisionLiveSetupOwners} from './setup-freshness-live-provision.mjs';
assert.deepEqual(process.argv.slice(2),['--new-local-run']);
const status=verifyTarget(),query=createLocalAsyncSql(),before=await query(LIVE_GATE_READ_SQL),runId=randomUUID();
const manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_localfixture',pausedGeneration:before.generation,
  owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
  idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000};
const e=await openPrivateLiveSetupJournal(manifest,{create:true});
try{
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const result=await provisionLiveSetupOwners(manifest,{evidence:e,admin:createClient(status.API_URL,status.SERVICE_ROLE_KEY,options),ownerClient:()=>createClient(status.API_URL,status.ANON_KEY,options)});
  assert.deepEqual(await query(LIVE_GATE_READ_SQL),before);
  const sessions=await e.read('owner-sessions');assert.equal(Object.keys(sessions).length,2);
  await e.record('local-provision-result',{runId,localOnly:true,...result,gateUnchanged:true});
  console.log(JSON.stringify({runId,localOnly:true,...result,gateUnchanged:true}));
}finally{e.dispose();}
