// Fixed synthetic target only. No host, database, role or connection overrides.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const output = path.join(root, 'output/setup-freshness-release');
const project = 'sociusfit-setup-freshness-local';
const container = `supabase_db_${project}`;
const binary = path.resolve(root, '../programming-quality/output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
export const sha = value => createHash('sha256').update(value).digest('hex');
export const literal = value => value === null ? 'NULL' : `E'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll('\\', '\\\\').replaceAll("'", "''").replaceAll('\r','\\r').replaceAll('\n','\\n')}'`;
export const callSql = (name, args = []) => {
  assert(/^[a-z_]+$/.test(name));
  return `SELECT row_to_json(q) FROM public.${name}(${args.map(literal).join(',')}) q;`;
};
function command(args, input) {
  const result = spawnSync(binary, ['--connection','sociusfit-local', ...args], { env, cwd:root,
    input, encoding:'utf8', windowsHide:true, timeout:120000, maxBuffer:8*1024*1024 });
  return result;
}
export function verifyTarget() {
  const config = fs.readFileSync(path.join(output,'local-supabase/supabase/config.toml'),'utf8');
  assert(/^project_id = "sociusfit-setup-freshness-local"\s*$/m.test(config));
  assert(!fs.existsSync(path.join(output,'local-supabase/supabase/.temp/project-ref')));
  const inspected = command(['inspect',container]);
  assert.equal(inspected.status,0,'Container inspection failed');
  const identity = JSON.parse(inspected.stdout)[0];
  assert.equal(identity.Config.Labels['com.supabase.cli.project'],project);
  assert.equal(path.resolve(identity.Config.Labels['com.supabase.cli.workdir']),path.join(output,'local-supabase'));
  assert.equal(identity.State.Running,true);
  const status = JSON.parse(fs.readFileSync(path.join(output,'local-supabase-status.private.json'),'utf8').replace(/^\uFEFF/,''));
  assert.equal(status.API_URL,'http://127.0.0.1:55421');
  const db = new URL(status.DB_URL);
  assert.equal(db.hostname,'127.0.0.1'); assert.equal(db.port,'55422'); assert.equal(db.pathname,'/postgres');
  return status;
}
export function sql(query, expectedFailure = false) {
  verifyTarget();
  const result = command(['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'], query);
  fs.appendFileSync(path.join(output,'database.private.log'), result.stderr ?? '');
  assert(!result.error, 'Local SQL transport failed');
  if (!expectedFailure) assert.equal(result.status,0,`Local SQL failed: ${result.stderr}`);
  return { status:result.status, text:result.stdout.trim(), error:result.stderr };
}
export function jsonSql(query) { return JSON.parse(sql(query).text); }

// Separately initialized fixed-local transport for the guardian process. Unlike
// sql(), calls remain interruptible while PostgreSQL waits for a writer lock.
export function createLocalAsyncSql() {
  verifyTarget();
  return (query,{signal}={})=>new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(Error('local_sql_aborted'));return;}
    const child=spawn(binary,['--connection','sociusfit-local','exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{env,windowsHide:true});
    let text='',error='',settled=false;
    const finish=(failure,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);failure?reject(failure):resolve(value);};
    const abort=()=>{child.kill();finish(Error('local_sql_aborted'));};
    const timer=setTimeout(abort,7500);
    signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>finish(Error('local_sql_transport')));
    child.stdin.on('error',()=>finish(Error('local_sql_stdin')));
    child.stdout.on('data',b=>{text+=b;if(text.length>1024*1024)abort();});
    child.stderr.on('data',b=>{error+=b;if(error.length>1024*1024)abort();});
    child.on('exit',code=>{
      if(error)fs.appendFileSync(path.join(output,'database.private.log'),error);
      if(code!==0){finish(Object.assign(Error('local_sql_failed'),{sqlstate:/ERROR:\s+([0-9A-Z]{5})/.exec(error)?.[1]}));return;}
      try{finish(null,JSON.parse(text.trim()));}catch{finish(Error('local_sql_json'));}
    });
    child.stdin.end(`SET statement_timeout='6s'; SET lock_timeout='5s';\n${query}\n`);
  });
}

/** A real concurrent transaction, released through stdin after its lock is observed. */
export function holdTransaction(query) {
  verifyTarget();
  const child = spawn(binary,['--connection','sociusfit-local','exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env,windowsHide:true});
  let text='', error='';
  let resolveReady, rejectReady;
  const ready = new Promise((resolve,reject) => { resolveReady=resolve; rejectReady=reject; });
  const timer = setTimeout(() => { child.kill(); rejectReady(Error('Concurrent transaction deadline exceeded')); },30000);
  child.stdout.on('data',chunk => { text+=chunk; if (text.includes('SETUP_HOLD_READY')) resolveReady(); });
  child.stderr.on('data',chunk => { error+=chunk; });
  const done = new Promise((resolve,reject) => {
    child.once('error',e => { clearTimeout(timer); rejectReady(e); reject(e); });
    child.once('exit',code => { clearTimeout(timer); if (code !== 0) { const e=Error(`Concurrent local SQL exited ${code}: ${error}`); rejectReady(e); reject(e); } else resolve(); });
  });
  // Install rejection handling immediately; callers still await the original promise.
  done.catch(()=>{});
  child.stdin.write(`BEGIN; SET LOCAL statement_timeout='8s'; SET LOCAL idle_in_transaction_session_timeout='25s';\n${query}\n\\echo SETUP_HOLD_READY\n`);
  return { ready, done, release:() => child.stdin.end('COMMIT;\n\\q\n'), abort:() => child.stdin.end('ROLLBACK;\n\\q\n') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2),['--bootstrap']);
  verifyTarget();
  const manifest = JSON.parse(fs.readFileSync(path.join(output,'local-coaching-bootstrap-manifest.json'),'utf8'));
  assert.equal(manifest.schemaScope,'revision-only');
  assert.equal(manifest.expectedTarget.projectId,project);
  const source = fs.readFileSync(path.join(root,manifest.output.path),'utf8');
  assert.equal(sha(source),manifest.output.sha256);
  for (const item of manifest.sourceManifest) assert.equal(sha(fs.readFileSync(path.join(root,item.path))),item.sha256);
  // The generated guard requires empty real Auth/public schemas. No retry/reset.
  sql(`SET socius.local_fixture=${literal(project)};\n${source}`);
  console.log('Isolated real PostgreSQL 17 bootstrap installed; no synthetic accounts or setup migration yet.');
}
