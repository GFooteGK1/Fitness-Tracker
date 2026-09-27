// New synthetic-only local storage probe. Does not open a network connection.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
import {openPrivateLiveSetupJournal} from './setup-freshness-live-private-journal.mjs';
assert.deepEqual(process.argv.slice(2),['--new-local-probe']);
const runId=randomUUID();
const manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_localStorageProbe',pausedGeneration:'9',
  owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
  idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000};
const intent={runId,manifestHash:validateLiveSetupManifest(manifest).hash,index:0,step:'rolling-confirm-initial',request:{localOnly:true,marker:'synthetic storage verification'}};
const first=await openPrivateLiveSetupJournal(manifest,{create:true});
assert.equal(JSON.parse(fs.readFileSync(path.join(first.directory,'manifest.encryption.json'),'utf8')).key,'archive-key.dpapi');
await first.journal.reserve(intent);await first.journal.complete({...intent,value:{localOnly:true,verified:true}});first.journal.dispose();
const recovered=await openPrivateLiveSetupJournal(manifest);
assert.equal((await recovered.journal.readResult(intent)).value.verified,true);
await assert.rejects(recovered.journal.reserve(intent),e=>e.code==='EEXIST');recovered.journal.dispose();
const receipt={localOnly:true,networkAccess:false,passed:true,dpapiRecovery:true,encryptedReadback:true,correctKeyReference:true,duplicateIntentBlocked:true,runId};
fs.writeFileSync(new URL(`../../output/setup-freshness-release/private-journal-probe-${runId}.json`,import.meta.url),JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify(receipt));
