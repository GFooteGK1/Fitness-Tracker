// Cryptographic journal only: callers establish private directory ACLs and
// supply a DPAPI-unwrapped, run-specific key. No credential discovery or network.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {LIVE_SETUP_STEPS,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
const check=(ok,code)=>{if(!ok)throw Error(code);};
const maxBytes=4*1024*1024;

export async function createEncryptedLiveJournal(manifest,{directory,key}) {
  manifest=structuredClone(manifest);
  const validated=validateLiveSetupManifest(manifest);
  check(Buffer.isBuffer(key)&&key.length===32,'journal_key');
  directory=path.resolve(directory);
  for(let current=directory;;current=path.dirname(current)) {
    const stat=await fs.lstat(current);
    check(stat.isDirectory()&&!stat.isSymbolicLink(),'journal_directory');
    if(path.dirname(current)===current)break;
  }
  const secret=Buffer.from(key);let disposed=false;
  const identity=(value,evidence=false)=>{
    check(!disposed,'journal_disposed');
    check(value?.runId===manifest.runId&&value.manifestHash===validated.hash,'journal_identity');
    if(evidence){check(/^[a-z0-9][a-z0-9-]{0,90}$/.test(value.recordName??''),'journal_record_name');return `evidence-${value.recordName}`;}
    check(Number.isSafeInteger(value.index)&&value.index>=0&&value.index<LIVE_SETUP_STEPS.length&&LIVE_SETUP_STEPS[value.index]===value.step,'journal_step');
    return `${value.index}-${value.step}`;
  };
  const aad=(name,kind)=>Buffer.from(JSON.stringify({schema:'setup-live-journal-1',runId:manifest.runId,manifestHash:validated.hash,name,kind}));
  const file=(name,kind)=>path.join(directory,`${name}.${kind}.sealed.json`);
  const write=async(value,kind,evidence=false)=>{
    const name=identity(value,evidence),bytes=Buffer.from(JSON.stringify(value));
    check(bytes.length<=maxBytes,'journal_size');
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);
    cipher.setAAD(aad(name,kind));
    const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
    const envelope=JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
    // Exclusive creation claims this operation across processes. A partial
    // file remains a reserved/uncertain operation and is never overwritten.
    const target=file(name,kind),pending=evidence?`${target}.${randomUUID()}.pending`:target;
    const handle=await fs.open(pending,'wx',0o600);
    try{
      try{await handle.writeFile(envelope);await handle.sync();}finally{await handle.close();}
      // Named cross-process signals publish only a fully flushed envelope.
      // link is atomic and refuses an existing target, unlike rename on POSIX.
      // Operation intents retain their conservative partial-file reservation.
      if(evidence)await fs.link(pending,target);
    }finally{
      // A published readiness signal must never become a failed startup merely
      // because cleanup of our encrypted staging link is temporarily denied.
      if(evidence)await fs.unlink(pending).catch(()=>{});
    }
  };
  const read=async(value,kind,evidence=false)=>{
    const name=identity(value,evidence),target=file(name,kind),stat=await fs.lstat(target);
    check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=maxBytes*2,'journal_file');
    const envelope=JSON.parse(await fs.readFile(target,'utf8'));
    check(envelope.version===1&&/^[A-Za-z0-9+/]{16}$/.test(envelope.iv??'')
      &&/^[A-Za-z0-9+/]{22}==$/.test(envelope.tag??'')&&typeof envelope.data==='string','journal_envelope');
    const decipher=createDecipheriv('aes-256-gcm',secret,Buffer.from(envelope.iv,'base64'));
    decipher.setAAD(aad(name,kind));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    const result=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8'));
    identity(result,evidence);return result;
  };
  return Object.freeze({
    reserve:value=>write(value,'intent'),
    async complete(value){await read(value,'intent');await write(value,'result');},
    readIntent:value=>read(value,'intent'),
    readResult:value=>read(value,'result'),
    record:(name,data)=>write({runId:manifest.runId,manifestHash:validated.hash,recordName:name,data},'record',true),
    async readRecord(name){return (await read({runId:manifest.runId,manifestHash:validated.hash,recordName:name},'record',true)).data;},
    dispose(){disposed=true;secret.fill(0);},
  });
}
