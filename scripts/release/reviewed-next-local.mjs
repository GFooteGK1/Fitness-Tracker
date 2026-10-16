// Isolated Next integration runtime. Generated files never enter the application.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputRoot = path.join(root, 'output/app-quality-release');
const [mode, runId] = process.argv.slice(2);
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
if (!['prepare', 'prepare-c2r', 'prepare-effort', 'start', 'refresh-auth', 'refresh-runner', 'enable-copy'].includes(mode) || (mode !== 'prepare' ? !uuid.test(runId ?? '') : runId !== undefined)) throw Error('Use prepare, prepare-c2r/prepare-effort <fixture UUID>, start, refresh-auth, refresh-runner or enable-copy <run UUID>');
const preparing = ['prepare', 'prepare-c2r', 'prepare-effort'].includes(mode);
const previous = preparing ? null : JSON.parse(fs.readFileSync(path.join(outputRoot, `reviewed-next-${runId}/receipt.json`), 'utf8'));
const sourceKind = mode === 'prepare-c2r' ? 'c2r' : mode === 'prepare-effort' ? 'effort-rir' : previous?.sourceKind ?? 'browser';
if (!['c2r', 'effort-rir', 'browser'].includes(sourceKind)) throw Error('Unknown fixture type');
const sourceRun = ['prepare-c2r', 'prepare-effort'].includes(mode) ? runId : previous?.sourceRun ?? '0b932874-d4a1-4e6c-804e-fec25b5adf1c';
if (!uuid.test(sourceRun)) throw Error('Invalid fixture identity');
const sourceDirectory = sourceKind === 'c2r' ? path.join(outputRoot, `reviewed-c2r-${sourceRun}`) : sourceKind === 'effort-rir' ? path.join(outputRoot, `reviewed-effort-browser-${sourceRun}`) : path.join(root, `output/playwright/reviewed-browser-${sourceRun}`);
const original = JSON.parse(fs.readFileSync(path.join(sourceDirectory, sourceKind === 'browser' ? 'server-receipt.json' : 'fixture.json'), 'utf8'));
if (original.runId !== sourceRun || !uuid.test(original.programId) || original.users.length !== 2
  || original.users.map(u => u.actor).sort().join(',') !== 'athlete,foreign' || original.users.some(u => !uuid.test(u.id))) throw Error('Invalid retained fixture');
const status = JSON.parse(fs.readFileSync(path.join(outputRoot, 'local-supabase-status.private.json'), 'utf8'));
const db = new URL(status.DB_URL);
if (status.API_URL !== 'http://127.0.0.1:55321' || db.hostname !== '127.0.0.1' || db.port !== '55322') throw Error('Nonlocal database denied');
const sha = data => createHash('sha256').update(data).digest('hex');
let registryBytes;
if (sourceKind !== 'browser') {
  registryBytes = fs.readFileSync(path.join(sourceDirectory, 'registry.json'));
  const registry = JSON.parse(registryBytes), proof = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'receipt.json'), 'utf8'));
  if (proof.status !== 'passed' || proof.runId !== sourceRun || sha(registryBytes) !== original.registrySha256 || registry.length !== 1
    || registry[0].userId !== original.users.find(user => user.actor === 'athlete').id || registry[0].scope.programId !== original.programId
    || registry[0].scope.basePlanVersionId !== original.baseId
    || (sourceKind === 'c2r' && registry[0].operation !== 'reviewed_load_trial')
    || (sourceKind === 'effort-rir' && (!uuid.test(original.authSourceRun ?? '') || registry[0].transition !== 'next_week'))) throw Error('Registry does not match verified fixture');
}
const envNames = ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local'];
function noEnv(directory) { for (const name of envNames) if (fs.existsSync(path.join(directory, name))) throw Error('Automatic environment file denied'); }
noEnv(root);
const id = preparing ? randomUUID() : runId;
const directory = path.join(outputRoot, `reviewed-next-${id}`), runtime = path.join(directory, 'runtime');
const receiptPath = path.join(directory, 'receipt.json');
function write(relative, value) { const file = path.join(runtime, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
if (preparing) {
  fs.mkdirSync(directory); fs.mkdirSync(runtime);
  const files = [];
  const copy = relative => {
    const source = path.join(root, relative), stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw Error('Source links denied');
    if (stat.isDirectory()) for (const name of fs.readdirSync(source)) copy(path.join(relative, name));
    else { const bytes=fs.readFileSync(source); write(relative,bytes); files.push({path:relative.replaceAll('\\','/'),sha256:sha(bytes)}); }
  };
  for (const entry of ['app','public','next.config.ts','package.json','package-lock.json','postcss.config.mjs','tailwind.config.ts','tsconfig.json','next-env.d.ts','.eslintrc.json']) copy(entry);
  fs.symlinkSync(path.join(root,'node_modules'),path.join(runtime,'node_modules'),'junction');
  write('local-fixture.json',JSON.stringify({sourceRun,authSourceRun:original.authSourceRun ?? sourceRun,sourceKind,programId:original.programId,users:original.users}));
  const sourceUpdates = [];
  if (registryBytes) {
    write('local-c2r-registry.json', registryBytes);
    const relative = 'app/lib/coach/reviewed-proposal-service.ts', entry = files.find(file => file.path === relative);
    const source = fs.readFileSync(path.join(runtime, relative), 'utf8');
    const marker = 'export const reviewedProposalRegistry: readonly TrustedReviewedWeekRegistration[] = []';
    if (!entry || source.split(marker).length !== 2) throw Error('Unexpected production registry source');
    const changed = "import localRegistry from '@/local-c2r-registry.json'\n" + source.replace(marker,
      `export const reviewedProposalRegistry: readonly TrustedReviewedWeekRegistration[] = process.env.NODE_ENV === 'development' && process.env.SOCIUS_LOCAL_NEXT_TEST === '${id}' && process.env.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:55321' ? localRegistry as unknown as readonly TrustedReviewedWeekRegistration[] : []`);
    write(relative, changed); sourceUpdates.push({path:relative,before:entry.sha256,after:sha(changed),reason:'Fixed local synthetic registry in generated copy only'}); entry.sha256=sha(changed);
  }
  write('middleware.ts', `import { NextRequest, NextResponse } from 'next/server'
export function middleware(request: NextRequest) {
  if(request.headers.get('host')!=='127.0.0.1:3013' || (!['GET','HEAD','OPTIONS'].includes(request.method) && request.headers.get('origin')!=='http://127.0.0.1:3013')) return new NextResponse('Local verification origin required',{status:403})
  return NextResponse.next()
}
export const config={matcher:'/:path*'}
`);
  write('local-network-guard.cjs', `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(!['http://127.0.0.1:55321','http://127.0.0.1:3013'].includes(url.origin))throw Error('Local verification network boundary');return original(input,{...init,redirect:'error'});};`);
  write('app/api/local-review-test/login/route.ts', `import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import fixture from '@/local-fixture.json'
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' || process.env.SOCIUS_LOCAL_NEXT_TEST !== '${id}' || request.headers.get('host') !== '127.0.0.1:3013' || request.headers.get('origin') !== 'http://127.0.0.1:3013' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:55321') return NextResponse.json({error:'Local test only'},{status:403})
  const actor=(await request.json()).actor, expected=fixture.users.find(u=>u.actor===actor)
  if(!expected) return NextResponse.json({error:'Unknown actor'},{status:400})
  const localFetch: typeof fetch=(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(new URL(url).origin!=='http://127.0.0.1:55321')throw Error('Local only');return fetch(input,{...init,redirect:'error'})}
  const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}}
  const admin=createClient('http://127.0.0.1:55321',process.env.SUPABASE_SERVICE_ROLE_KEY!,options)
  const user=await admin.auth.admin.getUserById(expected.id)
  const email=fixture.sourceKind+'-'+fixture.authSourceRun+'-'+actor+'@sociusfit-local.invalid'
  if(user.error || user.data.user?.email!==email || user.data.user.id!==expected.id) return NextResponse.json({error:'Actor mismatch'},{status:403})
  const link=await admin.auth.admin.generateLink({type:'magiclink',email})
  if(link.error || link.data.user?.id!==expected.id) return NextResponse.json({error:'Recovery failed'},{status:503})
  const owner=createClient('http://127.0.0.1:55321',process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options)
  const auth=await owner.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token})
  if(auth.error || auth.data.user?.id!==expected.id || !auth.data.session) return NextResponse.json({error:'Auth failed'},{status:503})
  return NextResponse.json({access_token:auth.data.session.access_token,refresh_token:auth.data.session.refresh_token},{headers:{'Cache-Control':'no-store'}})
}
`);
  write('app/local-review-test/page.tsx', `'use client'
import {useState} from 'react'
import {createClient} from '@/app/lib/auth/supabase'
export default function LocalLogin(){const [message,setMessage]=useState('');async function login(actor:string){setMessage('Signing in');const response=await fetch('/api/local-review-test/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor})});if(!response.ok){setMessage('Local sign-in failed');return}const session=await response.json();const result=await createClient().auth.setSession(session);setMessage(result.error?'Local session failed':'Signed in '+actor)}return <main className="p-4"><h1>Local Next integration test</h1><button className="min-h-11 p-3" onClick={()=>void login('athlete')}>Use original synthetic athlete</button><button className="min-h-11 p-3" onClick={()=>void login('foreign')}>Use foreign synthetic athlete</button><button className="min-h-11 p-3" onClick={()=>void createClient().auth.signOut().then(()=>setMessage('Signed out'))}>Sign out local session</button><p role="status">{message}</p><a href="/program/reviewed/plans/${original.programId}">Open reviewed program</a>${sourceKind === 'browser' ? '<a className="block" href="/program/reviewed/2ba4fc7a-be9c-47d0-b213-efcb1468f2bb">Open completed session</a>' : ''}</main>}
`);
  const generated=['local-fixture.json','middleware.ts','local-network-guard.cjs','app/api/local-review-test/login/route.ts','app/local-review-test/page.tsx',...(registryBytes ? ['local-c2r-registry.json'] : [])].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(runtime,p)))}));
  const receipt={id,sourceRun,sourceKind,sourceUpdates,origin:'http://127.0.0.1:3013',databaseOrigin:status.API_URL,phase:'default_off',createdAt:new Date().toISOString(),sourceFiles:files,generatedFiles:generated,dependencyLockHash:sha(fs.readFileSync(path.join(root,'package-lock.json')))};
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({id,runtime,receipt:receiptPath,phase:receipt.phase}));
} else if (mode === 'enable-copy') {
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  const relative='app/lib/personalized-coaching-capabilities.ts', entry=receipt.sourceFiles.find(file=>file.path===relative);
  const source=fs.readFileSync(path.join(runtime,relative),'utf8');
  if(receipt.id!==id || receipt.phase!=='default_off' || !entry || sha(source)!==entry.sha256 || source.split('initialDosePolicy: false').length!==2)throw Error('Unexpected default source');
  await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(3013,'127.0.0.1',()=>server.close(resolve));});
  const changed=source.replace('initialDosePolicy: false',`initialDosePolicy: process.env.NODE_ENV === 'development' && process.env.SOCIUS_LOCAL_NEXT_TEST === '${id}' && process.env.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:55321'`);
  const before=entry.sha256;write(relative,changed);entry.sha256=sha(changed);
  receipt.sourceUpdates=[...(receipt.sourceUpdates??[]),{path:relative,before,after:entry.sha256,reason:'Generated-only enabled integration phase; canonical source untouched',at:new Date().toISOString()}];
  receipt.phase='enabled_copy';fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({id,phase:receipt.phase,canonicalCapabilityUnchanged:true,productionRegistryStillEmpty:true}));
} else if (mode === 'refresh-auth' || mode === 'refresh-runner') {
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  const relative=mode === 'refresh-auth' ? 'app/lib/auth/supabase-server.ts' : 'app/program/reviewed-session-runner.tsx', entry=receipt.sourceFiles.find(file=>file.path===relative);
  if(receipt.id!==id || !entry || sha(fs.readFileSync(path.join(runtime,relative)))!==entry.sha256)throw Error('Existing auth source changed');
  const before=entry.sha256, bytes=fs.readFileSync(path.join(root,relative));
  write(relative,bytes); entry.sha256=sha(bytes);
  receipt.sourceUpdates=[...(receipt.sourceUpdates??[]),{path:relative,before,after:entry.sha256,reason:mode === 'refresh-auth' ? 'Await actual Next15 request cookies' : 'Show independent actual RIR in saved-set summary',at:new Date().toISOString()}];
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({id,updated:relative,sha256:entry.sha256}));
} else {
  noEnv(runtime);
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  if(receipt.id!==id || receipt.sourceRun!==sourceRun || receipt.dependencyLockHash!==sha(fs.readFileSync(path.join(root,'package-lock.json'))))throw Error('Runtime identity mismatch');
  for(const file of [...receipt.sourceFiles,...receipt.generatedFiles])if(sha(fs.readFileSync(path.join(runtime,file.path)))!==file.sha256)throw Error('Runtime source changed: '+file.path);
  await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(3013,'127.0.0.1',()=>server.close(resolve));});
  const env={};for(const [key,value]of Object.entries(process.env))if(/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key))env[key]=value;
  Object.assign(env,{NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--require '+JSON.stringify(path.join(runtime,'local-network-guard.cjs')),SOCIUS_LOCAL_NEXT_TEST:id,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY});
  const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3013'],{cwd:runtime,env,stdio:'inherit',windowsHide:true});
  console.log(JSON.stringify({id,pid:child.pid,origin:receipt.origin,phase:receipt.phase}));
  child.on('exit',code=>{process.exitCode=code??1;});
}
