// Fixed private Windows storage binding. Called only during an approved run;
// no production login, network request or credential discovery is performed.
import {isDeepStrictEqual} from 'node:util';
import {createEncryptedLiveJournal} from './setup-freshness-live-journal.mjs';
import {validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
import {initializePrivateLiveSetupKey,privateLiveSetupDirectory,unwrapRecoveryKey,
  sealPrivateMetadata,unsealPrivateMetadata} from './private-recovery-files.mjs';

export function readPrivateLiveSetupManifest(runId) {
  const directory=privateLiveSetupDirectory(runId),key=unwrapRecoveryKey(directory);
  try {const manifest=JSON.parse(unsealPrivateMetadata(directory,'manifest',key).toString('utf8'));
    validateLiveSetupManifest(manifest);if(manifest.runId!==runId)throw Error('Private run mismatch');return manifest;
  } finally {key.fill(0);}
}

export async function openPrivateLiveSetupJournal(input,{create=false}={}) {
  const manifest=structuredClone(input);validateLiveSetupManifest(manifest);
  const directory=create?initializePrivateLiveSetupKey(manifest.runId):privateLiveSetupDirectory(manifest.runId);
  const key=unwrapRecoveryKey(directory);
  try {
    if(create)sealPrivateMetadata(directory,'manifest',JSON.stringify(manifest),key,'archive-key.dpapi');
    const recovered=JSON.parse(unsealPrivateMetadata(directory,'manifest',key).toString('utf8'));
    if(!isDeepStrictEqual(recovered,manifest))throw Error('Private journal manifest mismatch');
    const journal=await createEncryptedLiveJournal(manifest,{directory,key});
    return Object.freeze({directory,journal,
      record:journal.record,read:journal.readRecord,dispose:journal.dispose,
    });
  } finally {key.fill(0);}
}
