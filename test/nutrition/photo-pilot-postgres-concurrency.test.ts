import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {spawn,execFile,type ChildProcessWithoutNullStreams} from 'node:child_process'
import {promisify} from 'node:util'
import {existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'

// No software installation, sudo, system-service operation, hosted URL, credential
// or workflow change. Only this repository's ephemeral Linux CI runner is used.
const eligible=process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'
const run=promisify(execFile),owner='11111111-1111-4111-8111-111111111111'
const literal=(v:string)=>"'"+v.replaceAll("'","''")+"'"
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
let root:string,bin:string,socket:string,server:ReturnType<typeof spawn>,schema:string,pilotFunction:string
let childEnv:NodeJS.ProcessEnv
const children=new Set<ChildProcessWithoutNullStreams>()
const args=()=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',socket,'-p','55432','-U','pilot_test_admin','-d','postgres']
const query=async(sql:string)=>(await run(join(bin,'psql'),[...args(),'-c',sql],{env:childEnv,timeout:8000,maxBuffer:262144})).stdout.trim()
const actor=(role='authenticated')=>`SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claim.sub=${literal(owner)};`
const call=(id:string,action:string,payload:object={})=>`SELECT public.nutrition_photo_pilot(${literal(id)},${literal(action)},${literal(JSON.stringify(payload))}::jsonb);`
async function ready(start=true){
  const id=randomUUID(),hash=id.replaceAll('-','').repeat(2)
  await query(`BEGIN;${actor()}${call(id,'reserve',{sourceHash:hash,normalizedHash:hash,capturedAt:new Date().toISOString(),context:'Synthetic PG race',consent:'selected-photo-openai-autolog-v1',normalization:'decoded-jpeg-v1'})}${call(id,'photo_stored')}${start?call(id,'screen_start')+call(id,'screen_result',{screening:{model:'gpt-6-luna',policy:'decisions-food-v2',route:'food_candidate'}}):''}COMMIT;`)
  return id
}
function session(sql:string){
  const child=spawn(join(bin,'psql'),args(),{env:childEnv,stdio:'pipe'});children.add(child)
  let output='',error=''
  child.stdout.on('data',b=>{output+=String(b)});child.stderr.on('data',b=>{error+=String(b)})
  const done=new Promise<{code:number|null;output:string;error:string}>(resolve=>child.on('close',code=>{children.delete(child);resolve({code,output,error})}))
  child.stdin.write(sql+'\n')
  return {child,done,marker:async(prefix:string)=>{
    const end=Date.now()+5000
    while(Date.now()<end){const line=output.split('\n').find(v=>v.startsWith(prefix));if(line)return Number(line.slice(prefix.length));if(child.exitCode!==null)break;await delay(20)}
    throw new Error('Synthetic PostgreSQL session marker unavailable: '+error.slice(-500))
  }}
}
async function blocked(pid:number){
  const end=Date.now()+5000
  while(Date.now()<end){if(await query(`SELECT wait_event_type FROM pg_stat_activity WHERE pid=${pid}`)==='Lock')return;await delay(20)}
  throw new Error('Independent PostgreSQL session did not wait on a financial transaction lock')
}
const total=async()=>Number(await query('SELECT coalesce(sum(coalesce(confirmed_micro_usd,reserved_micro_usd)),0) FROM nutrition_photo_exposure'))
function withinCap(outcome:{a:number|null;b:number|null;amount:number;capDenied:boolean}){
  if(outcome.a!==0||outcome.b===0||!outcome.capDenied||outcome.amount>1000000)throw new Error('Financial cap invariant violated by competing sessions')
}
async function lastAllowanceRace(locks:boolean){
  for(let i=0;i<3;i++)await ready()
  const x=await ready(false),y=await ready(false)
  const a=session(`BEGIN;${actor()}${call(x,'screen_start')}SELECT 'A:'||pg_backend_pid();`),ap=await a.marker('A:')
  const b=session(`BEGIN;${actor()}SELECT 'B:'||pg_backend_pid();${call(y,'screen_start')}COMMIT;`),bp=await b.marker('B:')
  b.child.stdin.end();expect(ap).not.toBe(bp)
  let br
  if(locks){await blocked(bp);a.child.stdin.end('COMMIT;\n');br=await b.done}
  else{br=await b.done;a.child.stdin.end('COMMIT;\n')}
  const ar=await a.done,outcome={a:ar.code,b:br.code,amount:await total(),capDenied:br.error.includes('Pilot spending ceiling reached')}
  console.info('[nutrition-postgres-concurrency] '+JSON.stringify({case:locks?'last-allowance':'negative-control',backendPids:[ap,bp],...outcome}))
  return outcome
}

describe.skipIf(!eligible)('preinstalled isolated PostgreSQL: genuine independent-session financial races',()=>{
  beforeAll(async()=>{
    if(process.getuid?.()===0)throw new Error('Refusing privileged PostgreSQL fixture')
    const base='/usr/lib/postgresql'
    const versions=existsSync(base)?readdirSync(base).filter(v=>/^\d+$/.test(v)).sort((a,b)=>Number(b)-Number(a)):[]
    const found=versions.map(v=>join(base,v,'bin')).find(p=>['postgres','initdb','psql'].every(n=>existsSync(join(p,n))))
    if(!found)throw new Error('Preinstalled PostgreSQL unavailable; no installation attempted')
    bin=realpathSync(found);if(!bin.startsWith(base+'/'))throw new Error('Unexpected PostgreSQL binary location')
    root=mkdtempSync(join(realpathSync(tmpdir()),'socius-nutrition-race-'));socket=join(root,'socket');mkdirSync(socket,{mode:0o700})
    const home=join(root,'home'),config=join(root,'config')
    mkdirSync(home,{mode:0o700});mkdirSync(config,{mode:0o700})
    const passfile=join(config,'pgpass'),servicefile=join(config,'pg_service.conf')
    writeFileSync(passfile,'',{mode:0o600});writeFileSync(servicefile,'',{mode:0o600})
    childEnv={PATH:'/usr/bin:/bin',LANG:'C.UTF-8',TMPDIR:root,NODE_ENV:'test',HOME:home,
      PGPASSFILE:passfile,PGSERVICEFILE:servicefile,PGSYSCONFDIR:config,
      PGSSLMODE:'disable',PGGSSENCMODE:'disable'}
    await run(join(bin,'initdb'),['-D',join(root,'data'),'--username=pilot_test_admin','--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=reject'],{env:childEnv,timeout:15000,maxBuffer:262144})
    server=spawn(join(bin,'postgres'),['-D',join(root,'data'),'-k',socket,'-h','','-p','55432','-F'],{env:childEnv,stdio:'ignore'})
    let online=false
    for(let i=0;i<100;i++){try{online=await query('SELECT 1')==='1';if(online)break}catch{}await delay(30)}
    if(!online)throw new Error('Isolated PostgreSQL startup failed')
    console.info('[nutrition-postgres-concurrency] '+JSON.stringify({serverVersion:await query('SHOW server_version'),transport:'private Unix socket; TCP disabled'}))
    await query(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
      CREATE TABLE auth.users(id UUID PRIMARY KEY);INSERT INTO auth.users VALUES(${literal(owner)});
      CREATE TABLE public.meals(id UUID PRIMARY KEY,user_id UUID NOT NULL,UNIQUE(id,user_id));
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::UUID $$;
      GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;`)
    schema=readFileSync('docs/migrations/nutrition-photo-owner-pilot.sql','utf8')
      .replaceAll('IF NOT false THEN','IF NOT true THEN')
      .replaceAll('2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543',createHash('sha256').update(owner).digest('hex'))
    await query(schema)
    const start=schema.indexOf('CREATE FUNCTION public.nutrition_photo_pilot'),end=schema.indexOf('REVOKE ALL ON FUNCTION public.nutrition_photo_pilot',start)
    pilotFunction=schema.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')
  },30000)
  beforeEach(async()=>{await query('TRUNCATE nutrition_photo_exposure,nutrition_photo_captures;UPDATE nutrition_photo_budget SET halted=false;')})
  afterEach(async()=>{
    for(const child of children)if(!child.stdin.writableEnded)child.stdin.end('ROLLBACK;\n')
    const end=Date.now()+3000;while(children.size&&Date.now()<end)await delay(20)
    for(const child of children)child.kill('SIGKILL') // exact owned fixture children only
  })
  afterAll(async()=>{
    if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('close',resolve));server.kill('SIGTERM');await Promise.race([stopped,delay(5000)]);if(server.exitCode===null)server.kill('SIGKILL')}
    // No recursive deletion; ephemeral synthetic artifacts leave with the CI VM.
  })
  it('admits only one competing screening for the last250000 allowance',async()=>{withinCap(await lastAllowanceRace(true));expect(await total()).toBe(1000000)},15000)
  it('keeps one reservation/grant across two sessions racing the same capture',async()=>{
    const id=await ready(false),a=session(`BEGIN;${actor()}${call(id,'screen_start')}SELECT 'A:'||pg_backend_pid();`),ap=await a.marker('A:')
    const b=session(`BEGIN;${actor()}SELECT 'B:'||pg_backend_pid();${call(id,'screen_start')}COMMIT;`),bp=await b.marker('B:');b.child.stdin.end()
    expect(ap).not.toBe(bp);await blocked(bp);a.child.stdin.end('COMMIT;\n')
    expect((await a.done).code).toBe(0);const denied=await b.done;expect(denied.code).not.toBe(0);expect(denied.error).toContain('duplicate key');expect(await total()).toBe(250000)
    expect(await query('SELECT count(*) FROM nutrition_photo_exposure')).toBe('1')
    console.info('[nutrition-postgres-concurrency] '+JSON.stringify({case:'duplicate-stage',backendPids:[ap,bp],amount:250000}))
  },15000)
  it('admission sees a settlement only after its separate transaction commits',async()=>{
    const x=await ready(),y=await ready(),proof={provider:'openai',endpoint:'decisions',model:'gpt-6-luna',receiptId:'decisions:'+randomUUID(),inputTokens:3000,outputTokens:0,totalTokens:3000,serviceTier:'fixed-decisions',ratePolicy:'openai-usage-ceiling-2026-10-19-v1'}
    const a=session(`BEGIN;${actor('service_role')}SELECT settle_nutrition_photo_usage(${literal(x)},${literal(owner)},'screen',${literal(JSON.stringify(proof))});SELECT 'A:'||pg_backend_pid();`),ap=await a.marker('A:')
    const b=session(`BEGIN;${actor()}SELECT 'B:'||pg_backend_pid();${call(y,'estimate_start')}COMMIT;`),bp=await b.marker('B:');b.child.stdin.end()
    expect(ap).not.toBe(bp);await blocked(bp);a.child.stdin.end('COMMIT;\n')
    expect((await a.done).code).toBe(0);expect((await b.done).code).toBe(0);expect(await total()).toBe(850660)
    console.info('[nutrition-postgres-concurrency] '+JSON.stringify({case:'settlement-admission',backendPids:[ap,bp],amount:850660}))
  },15000)
  it('negative control detects actual overspending when both financial locks are removed in a disposable function',async()=>{
    const broken=pilotFunction.replace(/ PERFORM pg_advisory_xact_lock[^\n]+\n/g,'').replace(/WHERE policy='openai-owner-30d-v1' FOR UPDATE;/g,"WHERE policy='openai-owner-30d-v1';")
    try{await query(broken);const outcome=await lastAllowanceRace(false);expect(outcome).toMatchObject({a:0,b:0,amount:1250000});expect(()=>withinCap(outcome)).toThrow('Financial cap invariant violated')}
    finally{await query(pilotFunction)}
  },15000)
})
