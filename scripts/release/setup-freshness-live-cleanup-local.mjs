// Exercise only post-crash container cleanup against an existing LOCAL receipt.
// The new idle fixture has no network or credentials. Never opens hosted SQL.
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {root,verifyTarget} from './setup-freshness-local-db.mjs';
import {privateEnvironment,RECOVERY_IMAGE} from './private-recovery-files.mjs';
import {readPrivateLiveSetupManifest,openPrivateLiveSetupJournal} from './setup-freshness-live-private-journal.mjs';
import {closeCrashedSetupCoordinator} from './setup-freshness-live-production-sql.mjs';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-crash-run');verifyTarget();
const manifest=readPrivateLiveSetupManifest(process.argv[3]);assert.equal(manifest.deploymentId,'dpl_localfixture');
const e=await openPrivateLiveSetupJournal(manifest);
const client=`socius-setup-live-coordinator-${randomUUID()}`;
const podman=path.resolve(root,'../programming-quality/output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
try{
  await e.read('injected-coordinator-crash');
  await e.record('coordinator-transport-create-intent',{client,localCleanupFixture:true});
  execFileSync(podman,['--connection','sociusfit-local','run','-d','--name',client,'--label',`io.socius.setup-live=${manifest.runId}`,
    '--network','none','--read-only','--image-volume','ignore','--log-driver','none','--user','100:101','--cap-drop','all','--security-opt','no-new-privileges',
    '--entrypoint','/bin/sleep',RECOVERY_IMAGE,'infinity'],{env:privateEnvironment(),windowsHide:true,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']});
  await closeCrashedSetupCoordinator(manifest,{evidence:e});
  assert.equal((await e.read('crashed-coordinator-cleanup-result')).stoppedVerified,true);
  console.log(JSON.stringify({runId:manifest.runId,localOnly:true,orphanClientStopped:true,networkEnabled:false}));
}finally{e.dispose();}
