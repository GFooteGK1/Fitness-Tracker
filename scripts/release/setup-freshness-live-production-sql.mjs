// FIXED PRODUCTION OPERATOR. Importing does no I/O. Calling openProductionSetupSql
// obtains the run's shared temporary login and opens production; requires explicit
// target-specific execution authority. No deployment or migration capability.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {privateEnvironment,RECOVERY_IMAGE} from './private-recovery-files.mjs';
import {LIVE_SETUP_TARGET,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
import {createLiveSqlOperator} from './setup-freshness-live-sql.mjs';
import {inspectLiveProcess} from './setup-freshness-live-process.mjs';
import {obtainSharedSetupLogin} from './setup-freshness-live-login.mjs';

// Recovery for the single recorded coordinator client after its process died.
// No credential discovery or SQL; verify identity before stopping the container.
export async function closeCrashedSetupCoordinator(input,{evidence}) {
  const v=validateLiveSetupManifest(input),coordinator=await evidence.read('coordinator-identity');
  assert.equal((await inspectLiveProcess(coordinator.pid,{expected:coordinator})).running,false);
  const contained=await evidence.read('guardian-result');
  assert.equal(contained.manifestHash,v.hash);assert.equal(contained.containmentVerified,true);
  const optional=async name=>{try{return await evidence.read(name);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  if(await optional('crashed-coordinator-cleanup-result'))return;
  const {client}=await evidence.read('coordinator-transport-create-intent');
  assert(/^socius-setup-live-coordinator-[a-f0-9-]{36}$/.test(client));
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const binary=path.resolve(root,'../programming-quality/output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
  const pod=async args=>{try{return (await promisify(execFile)(binary,['--connection','sociusfit-local',...args],
    {env:privateEnvironment(),windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})).stdout.trim();}
    catch{throw Error('crashed_coordinator_transport_cleanup_unverified');}};
  const inspect=async()=>{const row=JSON.parse(await pod(['inspect',client]))[0];
    assert.equal(row.Name,client);assert.equal(row.Config.Labels['io.socius.setup-live'],input.runId);return row;};
  if((await inspect()).State.Running){
    assert(!await optional('crashed-coordinator-cleanup-intent'),'Uncertain cleanup requires readback; do not repeat stop');
    await evidence.record('crashed-coordinator-cleanup-intent',{client});await pod(['stop','--time','5',client]);
  }
  assert.equal((await inspect()).State.Running,false);
  await evidence.record('crashed-coordinator-cleanup-result',{client,stoppedVerified:true});
}

export function parseLiveCliConnection(script) {
  /** @type {Record<string,string>} */
  const result={};
  for(const line of script.split(/\r?\n/)) {
    const match=/^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)="([^"\\\r\n]*)"$/.exec(line);
    if(match){assert(!Object.hasOwn(result,match[1]),'Duplicate connection variable');result[match[1]]=match[2];}
  }
  const project=LIVE_SETUP_TARGET.project;
  assert(Object.keys(result).length===5&&result.PGPASSWORD,'Unrecognized CLI connection format');
  assert((result.PGHOST===`db.${project}.supabase.co`&&result.PGUSER==='cli_login_postgres')
    ||(result.PGHOST==='aws-1-us-east-1.pooler.supabase.com'&&result.PGUSER===`cli_login_postgres.${project}`),'Wrong project endpoint');
  assert(result.PGPORT==='5432'&&result.PGDATABASE==='postgres','Wrong database endpoint');
  return result;
}

export async function openProductionSetupSql(input,{evidence,channel}) {
  const manifest=structuredClone(input);validateLiveSetupManifest(manifest);
  assert(['operator','coordinator','guardian','recovery'].includes(channel));assert.equal(typeof evidence.record,'function');
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const platform=path.resolve(root,'../programming-quality/output/app-quality-release');
  const podman=path.join(platform,'tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
  const ca=fs.readFileSync(path.join(platform,'supabase-prod-ca-2021.crt'));
  assert.equal(createHash('sha256').update(ca).digest('hex'),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
  const client=`socius-setup-live-${channel}-${randomUUID()}`,workers=new Set();let attempted=false,index=0,closed=false,cleanupVerified=false;
  const command=(binary,args,input,{signal,timeoutMs=30000}={})=>new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(Error('live_transport_aborted'));return;}
    const child=spawn(binary,args,{cwd:root,env:privateEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});workers.add(child);
    let stdout=[],stderr=[],bytes=0,failed=false;
    const abort=()=>{failed=true;child.kill();reject(Error('live_transport_uncertain_aborted'));};
    const timer=setTimeout(abort,timeoutMs);signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>{failed=true;});child.stdin.on('error',()=>{failed=true;});
    child.stdout.on('data',b=>{bytes+=b.length;if(bytes>8*1024*1024)abort();else stdout.push(b);});
    child.stderr.on('data',b=>{bytes+=b.length;if(bytes>8*1024*1024)abort();else stderr.push(b);});
    child.once('close',async code=>{
      workers.delete(child);clearTimeout(timer);signal?.removeEventListener('abort',abort);
      try{
        if(stderr.length)await evidence.record(`${channel}-diagnostic-${++index}`,{stderr:Buffer.concat(stderr).toString('utf8')});
        if(failed||code!==0)throw Error('live_transport_failed_encrypted_diagnostic');
        resolve(Buffer.concat(stdout).toString('utf8').trim());
      }catch(error){reject(error);}
    });
    child.stdin.end(input);
  });
  const pod=(args,input,context)=>command(podman,['--connection','sociusfit-local',...args],input,context);
  const close=async()=>{
    if(cleanupVerified)return;closed=true;
    for(const worker of workers)worker.kill();
    if(attempted){
      const before=JSON.parse(await pod(['inspect',client]))[0];
      assert.equal(before.Name,client);assert.equal(before.Config.Labels['io.socius.setup-live'],manifest.runId);
      if(before.State.Running)await pod(['stop','--time','5',client]);
      const value=JSON.parse(await pod(['inspect',client]))[0];
      assert.equal(value.Name,client);assert.equal(value.State.Running,false);assert.equal(value.Config.Labels['io.socius.setup-live'],manifest.runId);}
    await evidence.record(`${channel}-transport-closed`,{client,stoppedVerified:attempted,creationAttempted:attempted});
    cleanupVerified=true;
  };
  try {
    const connection=await obtainSharedSetupLogin(manifest,{evidence,channel});
    // Validate the saved endpoint independently before it reaches psql.
    assert.equal(connection.PGHOST,'aws-1-us-east-1.pooler.supabase.com');assert.equal(connection.PGPORT,'5432');
    assert.equal(connection.PGUSER,`cli_login_postgres.${LIVE_SETUP_TARGET.project}`);assert.equal(connection.PGDATABASE,'postgres');
    assert(typeof connection.PGPASSWORD==='string'&&connection.PGPASSWORD.length>0);
    await evidence.record(`${channel}-transport-create-intent`,{client});
    attempted=true;
    await pod(['run','-d','--name',client,'--label',`io.socius.setup-live=${manifest.runId}`,'--network','podman','--read-only','--image-volume','ignore','--log-driver','none','--user','100:101','--cap-drop','all','--security-opt','no-new-privileges','--ulimit','core=0:0','--memory','128m','--memory-swap','128m','--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777','--entrypoint','/bin/sleep',RECOVERY_IMAGE,'infinity']);
    const inspected=JSON.parse(await pod(['inspect',client]))[0];
    assert.equal(inspected.Image.replace(/^sha256:/,''),RECOVERY_IMAGE);assert.equal(inspected.Config.Labels['io.socius.setup-live'],manifest.runId);
    assert.equal(inspected.Config.User,'100:101');assert.equal(inspected.HostConfig.ReadonlyRootfs,true);
    assert.equal(inspected.HostConfig.LogConfig.Type,'none');assert.equal(inspected.HostConfig.Memory,134217728);assert.equal(inspected.HostConfig.MemorySwap,134217728);
    assert.equal(Object.keys(inspected.HostConfig.PortBindings??{}).length,0);
    assert.equal(inspected.HostConfig.NetworkMode,'bridge');assert.equal(Object.keys(inspected.NetworkSettings.Networks??{}).join(','),'podman');
    assert(!(inspected.Mounts??[]).some(m=>['bind','volume'].includes(m.Type)));
    assert(['rw','nosuid','nodev','noexec'].every(x=>inspected.HostConfig.Tmpfs?.['/tmp']?.split(',').includes(x)));
    assert(inspected.HostConfig.Ulimits?.some(x=>x.Name==='RLIMIT_CORE'&&x.Soft===0&&x.Hard===0));
    assert.equal(await pod(['exec',client,'cat','/sys/fs/cgroup/memory.swap.max']),'0');
    const escape=value=>value.replaceAll('\\','\\\\').replaceAll(':','\\:');
    const passfile=['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD'].map(k=>escape(connection[k])).join(':')+'\n';
    await pod(['exec','-i',client,'/bin/sh','-c','umask 077; mkdir /tmp/setup-live; cat > /tmp/setup-live/pgpass'],passfile);
    connection.PGPASSWORD='';
    await pod(['exec','-i',client,'/bin/sh','-c','umask 077; cat > /tmp/setup-live/root.crt'],ca);
    assert.equal(await pod(['exec',client,'stat','-c','%a','/tmp/setup-live','/tmp/setup-live/pgpass']),'700\n600');
    const query=async(sql,{signal,readOnly=false,timeoutMs=7500}={})=>{
      assert(!closed,'Transport closed');
      const env=['env',...['PGHOST','PGPORT','PGUSER','PGDATABASE'].map(k=>`${k}=${connection[k]}`),
        'PGPASSFILE=/tmp/setup-live/pgpass','PGSSLMODE=verify-full','PGSSLROOTCERT=/tmp/setup-live/root.crt','PGCONNECT_TIMEOUT=5',
        `PGOPTIONS=-c default_transaction_read_only=${readOnly?'on':'off'} -c statement_timeout=6000 -c lock_timeout=5000`];
      const raw=await pod(['exec','-i',client,...env,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],sql,{signal,timeoutMs});
      try{return JSON.parse(raw);}catch{throw Error('live_sql_response_invalid');}
    };
    const identity=await query("BEGIN READ ONLY; SET LOCAL ROLE authenticated; SET LOCAL ROLE postgres; SELECT json_build_object('database',current_database(),'role',current_user,'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'loginWindowCovered',(SELECT rolvaliduntil IS NULL OR rolvaliduntil>clock_timestamp()+interval '5 minutes' FROM pg_roles WHERE rolname=session_user)); ROLLBACK;",{readOnly:true});
    assert.deepEqual(identity,{database:'postgres',role:'postgres',ssl:true,loginWindowCovered:true});
    await evidence.record(`${channel}-transport-ready`,{project:LIVE_SETUP_TARGET.project,client,tls:'verify-full',identity});
    return Object.freeze({operator:createLiveSqlOperator(manifest,{query,record:evidence.record}),close});
  }catch(error){
    try{await close();}catch{throw new AggregateError([error],`live_transport_cleanup_unverified:${client}`);}
    throw error;
  }
}
