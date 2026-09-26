// Local-only retained compatible application artifact and same-port rollback exercise.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CookieAuthStorageAdapter } from '@supabase/auth-helpers-shared';
import { provisionLocalOwnerProfile } from './local-owner-profile.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputRoot = path.join(root, 'output/app-quality-release');
const floorCommit = '923473a04583684d3f9b150c35ffa7e0173a8e25', floorBuild = 'N1fNUQnlscYENMsnBEVzj';
const mode = process.argv[2];
if (!['prepare','rehearse'].includes(mode) || process.argv.length !== 3) throw new Error('Use prepare or rehearse; targets are fixed');
const osEnvironment = {};
for (const [key,value] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)) osEnvironment[key]=value;
const sha = value => createHash('sha256').update(value).digest('hex');
const pointerFile = path.join(outputRoot, 'rollback-retained.json');
const status = JSON.parse(fs.readFileSync(path.join(outputRoot, 'local-supabase-status.private.json'), 'utf8'));
const db = new URL(status.DB_URL);
if (status.API_URL !== 'http://127.0.0.1:55321' || db.hostname !== '127.0.0.1' || db.port !== '55322') throw new Error('Refusing nonlocal Supabase');
const localProject = path.join(outputRoot, 'local-supabase');
if (!/^project_id = "sociusfit-programming-local"\s*$/m.test(fs.readFileSync(path.join(localProject, 'supabase/config.toml'), 'utf8'))
  || fs.existsSync(path.join(localProject, 'supabase/.temp/project-ref'))) throw new Error('Refusing linked/nonlocal configuration');
const environmentNames = ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local'];
function rejectEnv(directory) { for (const name of environmentNames) if (fs.existsSync(path.join(directory, name))) throw new Error(`Automatic environment file forbidden: ${name}`); }
rejectEnv(root);
function buildReceipt(directory, receiptFile) {
  const value = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  if (value.buildId !== fs.readFileSync(path.join(directory, '.next/BUILD_ID'), 'utf8').trim()
    || value.apiUrl !== status.API_URL || value.anonKeyHash !== sha(status.ANON_KEY)) throw new Error('Build destination/identity receipt mismatch');
  return value;
}
function shell(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, env: osEnvironment, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Local artifact command failed: ${executable}`);
  return result.stdout.trim();
}
function files(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap(entry => {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Retained artifact must not contain links');
    return entry.isDirectory() ? files(directory, name) : [{ path: name.replaceAll('\\','/'), bytes: fs.statSync(path.join(directory, name)).size, sha256: sha(fs.readFileSync(path.join(directory, name))) }];
  }).sort((a,b) => a.path.localeCompare(b.path));
}
if (mode === 'prepare') {
  if (fs.existsSync(pointerFile)) throw new Error('Retained pointer already exists; preserve and inspect it instead of overwriting');
  const receipt = buildReceipt(root, path.join(outputRoot, 'local-app-build.json'));
  if (receipt.buildId !== floorBuild || shell('git', ['rev-parse', `${floorCommit}^{commit}`]) !== floorCommit) throw new Error('Pinned compatible source/build unavailable');
  const artifact = path.join(outputRoot, `retained-app-${floorCommit.slice(0,7)}-${randomUUID().slice(0,8)}`);
  fs.mkdirSync(artifact);
  const sourceArchive = path.join(artifact, 'source.tar'), app = path.join(artifact, 'app');
  fs.mkdirSync(app);
  shell('git', ['archive','--format=tar',`--output=${sourceArchive}`,floorCommit]);
  shell('tar', ['-xf',sourceArchive,'-C',app]);
  rejectEnv(app);
  if (sha(fs.readFileSync(path.join(app, 'package-lock.json'))) !== sha(fs.readFileSync(path.join(root, 'package-lock.json')))) throw new Error('Retained dependency lock mismatch');
  fs.cpSync(path.join(root, '.next'), path.join(app, '.next'), { recursive: true, filter: source => !source.startsWith(path.join(root, '.next/cache')) });
  // Generated service-worker/static assets belong to the verified local build.
  fs.cpSync(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  fs.writeFileSync(path.join(artifact, 'build-receipt.json'), JSON.stringify(receipt, null, 2));
  const manifest = { kind: 'retained_local_revision_compatible_app', sourceCommit: floorCommit, buildId: floorBuild,
    apiUrl: receipt.apiUrl, anonKeyHash: receipt.anonKeyHash, sourceArchiveSha256: sha(fs.readFileSync(sourceArchive)),
    dependencyLockSha256: sha(fs.readFileSync(path.join(app, 'package-lock.json'))), nodeVersion: process.version,
    files: files(app), limitations: ['Loopback-baked local build, not a portable production artifact', 'Execution reuses current lock-matched node_modules', 'Source pinned by Git archive; prior build receipt and retained hashes are local evidence, not a signed build attestation'] };
  fs.writeFileSync(path.join(artifact, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const pointer = { artifact: path.relative(root, artifact), manifestSha256: sha(fs.readFileSync(path.join(artifact, 'manifest.json'))) };
  fs.writeFileSync(pointerFile, JSON.stringify(pointer, null, 2));
  console.log(JSON.stringify({ ...pointer, sourceCommit: floorCommit, buildId: floorBuild, files: manifest.files.length, bytes: manifest.files.reduce((n,f) => n+f.bytes,0), localOnly: true }, null, 2));
  process.exit(0);
}

const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf8'));
const artifact = path.resolve(root, pointer.artifact);
if (!artifact.startsWith(outputRoot + path.sep)) throw new Error('Retained artifact outside ignored local output');
const manifestFile = path.join(artifact, 'manifest.json');
if (sha(fs.readFileSync(manifestFile)) !== pointer.manifestSha256) throw new Error('Retained manifest changed');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (sha(fs.readFileSync(path.join(root,'package-lock.json'))) !== manifest.dependencyLockSha256) throw new Error('Current dependencies differ from retained lock; do not launch or create users');
const retainedApp = path.join(artifact, 'app');
function verifyRetained() {
  if (manifest.sourceCommit !== floorCommit || manifest.buildId !== floorBuild
    || sha(fs.readFileSync(path.join(artifact,'source.tar'))) !== manifest.sourceArchiveSha256
    || JSON.stringify(files(retainedApp)) !== JSON.stringify(manifest.files)) throw new Error('Retained artifact integrity mismatch');
  buildReceipt(retainedApp, path.join(artifact,'build-receipt.json'));
}
verifyRetained();
const candidate = buildReceipt(root, path.join(outputRoot,'local-app-build.json'));
if (candidate.buildId === floorBuild) throw new Error('Candidate must have a distinct built artifact before rollback rehearsal');
const run = path.join(outputRoot, `app-rollback-${randomUUID()}`), runtime = path.join(run,'retained-runtime');
fs.mkdirSync(run);
fs.cpSync(retainedApp, runtime, { recursive: true });
fs.symlinkSync(path.join(root,'node_modules'),path.join(runtime,'node_modules'),'junction');
rejectEnv(runtime);
const env = { ...osEnvironment };
Object.assign(env,{ NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY });
const base='http://127.0.0.1:3012', checks=[], servedBuilds=[];
const assert=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(new Error('Port3012 already in use; existing process will not be stopped')));server.listen(3012,'127.0.0.1',()=>server.close(resolve));});
let child;
async function start(directory,label) {
  const log=fs.openSync(path.join(run,`${label}.private.log`),'a');
  child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3012'],{cwd:directory,env,windowsHide:true,stdio:['ignore',log,log]});
  fs.closeSync(log);
  for(let i=0;i<60;i++) {
    if(child.exitCode!==null)throw new Error(`${label} server exited`);
    try {if((await fetch(base+'/api/coach/weekly',{signal:AbortSignal.timeout(1000)})).status===401){checks.push(`${label} started and anonymous owned read denied`);return;}} catch {}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error(`${label} startup timeout`);
}
async function stop() { if(child && child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;} child=null; }
async function verifyServedBuild(directory,label,buildId) {
  const relative=`/_next/static/${buildId}/_buildManifest.js`;
  const expected=sha(fs.readFileSync(path.join(directory,'.next/static',buildId,'_buildManifest.js')));
  const response=await fetch(base+relative,{signal:AbortSignal.timeout(10000)});
  const actual=sha(Buffer.from(await response.arrayBuffer()));
  assert(response.status===200 && actual===expected,`${label} serves its exact build manifest on the shared port`);
  servedBuilds.push({phase:label,origin:base,buildId,path:relative,sha256:actual});
}
async function api(owner,route,body,expected=200,method=body===undefined?'GET':'POST') {
  const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Cookie:owner?.cookie??''},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});
  const value=await response.json();
  if(response.status!==expected)throw new Error(`${route}: expected${expected}, got${response.status}`);
  return value;
}
async function rpc(owner,name,args={}) {const result=await owner.client.rpc(name,args);if(result.error)throw new Error(`${name}: ${result.error.code}`);return result.data;}
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const credentials=[];
async function account(name) {
  const email=`rollback-${name}-${randomUUID()}@sociusfit-local.invalid`,password=randomUUID()+randomUUID();
  const made=await admin.auth.admin.createUser({email,password,email_confirm:true});if(made.error)throw new Error('Synthetic Auth creation failed');
  credentials.push({id:made.data.user.id,email,password});fs.writeFileSync(path.join(run,'users.private.json'),JSON.stringify(credentials,null,2));
  const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await client.auth.signInWithPassword({email,password});if(login.error)throw new Error('Synthetic Auth login failed');
  await provisionLocalOwnerProfile(client,made.data.user.id);
  const parts=[];class Cookies extends CookieAuthStorageAdapter {setCookie(name,value){parts.push(`${name}=${encodeURIComponent(value)}`);}}
  new Cookies().setItem('sb-127-auth-token',JSON.stringify(login.data.session));
  return {id:made.data.user.id,client,cookie:parts.join('; ')};
}
try {
  const [owner,other]=await Promise.all([account('owner'),account('other')]);
  const initialRevision=Number(await rpc(owner,'get_coach_context_revision'));
  assert(Number.isSafeInteger(initialRevision),'Revision schema remains installed before switch');
  await start(root,'candidate');
  await verifyServedBuild(root,'candidate',candidate.buildId);
  const initialKey=randomUUID();
  const created=await api(owner,'/api/coach/weekly',{tzOffset:300,idempotencyKey:initialKey,goalTargetDate:'2027-04-01',planningInput:{format:'complete_programming_intake_v0_3',primaryDomain:'strength',goal:'Build useful full-body strength',experience:'consistent',trainingDays:['monday','wednesday','friday'],sessionMinutes:60,equipment:'Bodyweight',resolvedEquipmentIds:['bodyweight'],constraints:'',constraintKinds:[],secondaryGoals:[],startDate:'2026-09-14',setupConfirmed:true}},201);
  await api(owner,`/api/coach/proposals/${created.proposalId}/accept`,{idempotencyKey:initialKey});
  const accepted=await api(owner,'/api/coach/weekly'),acceptedHash=sha(JSON.stringify(accepted.currentWeek.intent));
  const request=await rpc(owner,'begin_logging_request',{p_key:randomUUID(),p_fingerprint:'e'.repeat(64)});
  const work={workout_date:'2026-09-22',input_text:'Synthetic rollback source squat',blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:5,weight:'80 lb'}]}]};
  const provenance={schemaVersion:1,occurrence:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]},fields:{quantities:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]}}};
  const items=await rpc(owner,'freeze_logging_request_items',{p_request_id:request.id,p_items:[{sourceItemId:'rollback-source',kind:'workout',record:work,blocks:[{}],provenance,inputMethod:'text',eventAt:work.workout_date}]});
  const logged=await rpc(owner,'commit_logging_request_item',{p_item_id:items[0].id});
  const reviewBody={asOf:'2026-09-23T16:00:00.000Z',tzOffset:300,windowDays:28,athleteRequestedReview:true,reviewIdempotencyKey:randomUUID(),proposalIdempotencyKey:randomUUID()};
  const review=await api(owner,'/api/coach/weekly/review',reviewBody,201);
  assert(Boolean(review.proposalId),'Candidate creates accepted base and pending stamped next week');
  await stop();
  verifyRetained();
  await start(runtime,'retained');
  await verifyServedBuild(runtime,'retained',floorBuild);
  const restored=await api(owner,'/api/coach/weekly');
  assert(restored.currentWeek.id===created.planVersionId && sha(JSON.stringify(restored.currentWeek.intent))===acceptedHash,'Retained app reads candidate accepted plan unchanged');
  assert((await api(other,'/api/coach/weekly')).program===null,'Retained app isolates other owner reads');
  await api(other,`/api/coach/proposals/${review.proposalId}/accept`,{idempotencyKey:reviewBody.proposalIdempotencyKey},404);
  checks.push('Retained app rejects foreign owner acceptance');
  const source=await api(owner,`/api/capture?kind=workout&entityId=${logged.entityId}&expectedUserId=${owner.id}`);
  const beforeCorrection=Number(await rpc(owner,'get_coach_context_revision'));
  const correction=await api(owner,'/api/capture',{kind:'workout',entityId:logged.entityId,expectedRevision:source.revision,requestId:randomUUID(),expectedUserId:owner.id,record:{...source.record,input_text:'Corrected synthetic rollback source squat'}},200,'PATCH');
  assert(correction.success && Number(await rpc(owner,'get_coach_context_revision'))>beforeCorrection,'Retained app source correction advances installed revision fence');
  const conflict=await api(owner,`/api/coach/proposals/${review.proposalId}/accept`,{idempotencyKey:reviewBody.proposalIdempotencyKey},409);
  assert(conflict.error==='Your training information changed; refresh and create a new proposal','Stale acceptance returns the specific training-context conflict');
  const stale=await api(owner,'/api/coach/weekly');
  assert(stale.pendingProposal===null && sha(JSON.stringify(stale.currentWeek.intent))===acceptedHash,'Retained app removes stale proposal and preserves accepted intent');
  await api(owner,`/api/coach/proposals/${created.proposalId}/accept`,{idempotencyKey:initialKey});
  assert(sha(JSON.stringify((await api(owner,'/api/coach/weekly')).currentWeek.intent))===acceptedHash,'Accepted replay remains immutable after rollback and source correction');
  const freshBody={...reviewBody,reviewIdempotencyKey:randomUUID(),proposalIdempotencyKey:randomUUID()};
  const fresh=await api(owner,'/api/coach/weekly/review',freshBody,201);
  assert(fresh.proposalId && fresh.proposalId!==review.proposalId,'Retained app fresh stamped review recovers a new proposal');
  await api(owner,`/api/coach/proposals/${fresh.proposalId}/accept`,{idempotencyKey:freshBody.proposalIdempotencyKey});
  assert((await api(owner,'/api/coach/weekly')).currentWeek.id===fresh.planVersionId,'Retained app accepts newly stamped proposal');
  verifyRetained();
  const receipt={kind:'local_compatible_app_rollback',checkedAt:new Date().toISOString(),app:base,databaseApi:status.API_URL,
    candidateBuildId:candidate.buildId,retainedBuildId:floorBuild,retainedSourceCommit:floorCommit,retainedManifestSha256:pointer.manifestSha256,
    schemaKeptInstalled:true,checks,servedBuilds,acceptedIntentHash:acceptedHash,retainedArtifactUnchanged:true,
    limitations:['Local HTTP/Auth/RLS and synthetic records only; not production promotion','Candidate is a second build of the same compatible application source; this proves artifact-switch mechanics, not a different-code rollback','Retained build is baked for loopback55321 and reuses lock-matched dependencies; production-target artifact remains unbuilt','No old-main rollback, database downgrade, production data or paid/external calls','Switch uses a test-owned process on3012, not a hosted deployment or operator traffic pause']};
  fs.writeFileSync(path.join(run,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({receipt:path.relative(root,path.join(run,'receipt.json')),...receipt},null,2));
} catch(error) {fs.writeFileSync(path.join(run,'failure.json'),JSON.stringify({checkedAt:new Date().toISOString(),error:error.message,preserved:true},null,2));throw error;}
finally {await stop();}
