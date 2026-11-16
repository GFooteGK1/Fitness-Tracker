import { afterAll, afterEach, beforeEach, describe, expect, it, type TestContext } from 'vitest'
import { Client } from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { retainLocalQwikArtifact } from '@/app/lib/coach/qwik-exact-capture'
import { withVerifiedPrivateQwikOriginals, type PrivateQwikVerifiedAuth } from '@/app/lib/coach/qwik-private-owner-transaction'
import { PrivateNativeFixture, fixtureDb, nativeEligible } from './qwik-private-native-fixture'
import { persistPrivate, seedPrivateOwner, seedPrivateRecording } from './qwik-private-fixture'
import { QwikQualificationPool } from './qwik-private-pg-driver'

const role = 'qwik_private_test_executor', digest = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const settings = { executorRole: role, quotaBytes: 20000000, operationTimeoutMs: 10000, cleanupTimeoutMs: 2000, statementTimeoutMs: 8000 }
const verified = (id: string): PrivateQwikVerifiedAuth => ({ getUser: async () => ({ data: { user: { id } }, error: null }) })
type Proof = { id: string; name: string; status: 'unrun'|'passed'|'failed'; serverVersionNum?: unknown;
  clientsClosed?: boolean; clusterStopped?: boolean; observations?: unknown; sourceSHA256?: unknown; fixture?:Record<string,unknown> }
const proofs: Proof[] = []
let fixture: PrivateNativeFixture, current: Proof, halted = false
let startedForCase = false
let pools: QwikQualificationPool[] = [], clients: Client[] = []
async function cleanupBound<T>(work:Promise<T>,ms:number):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned driver cleanup deadline exceeded')),ms)})])}
  finally{if(timer)clearTimeout(timer)}
}

describe.skipIf(!nativeEligible)('private QWIK: PostgreSQL 17 role and real-driver qualification', () => {
  beforeEach(async (context: TestContext) => {
    current = proofs.find(p => p.name === context.task.name)!
    startedForCase = false; pools = []; clients = []
    if (halted) { context.skip(); return }
    fixture = new PrivateNativeFixture(); startedForCase = true
    try {
      expect(JSON.parse(readFileSync('node_modules/pg/package.json','utf8')).version).toBe('8.23.1')
      await fixture.start()
      current.serverVersionNum = fixture.metadata.serverVersionNum; current.sourceSHA256 = fixture.metadata.sourceSHA256
      current.fixture=structuredClone(fixture.metadata)
      await fixture.admin.exec('RESET ROLE; ALTER ROLE qwik_private_test_executor LOGIN') // Disposable socket login only.
    } catch (error) { halted = true; throw error }
  }, 30000)
  afterEach(async () => {
    if (!startedForCase) return
    let failure: unknown
    // Initiate every known owned close, including when another close rejects.
    const tasks=Promise.allSettled([...pools.map(p=>Promise.resolve().then(()=>p.close())),...clients.map(c=>Promise.resolve().then(()=>c.end()))])
    let results:Awaited<typeof tasks>|undefined
    try {results=await cleanupBound(tasks,2500)} catch(error){failure=error}
    finally{
      // Always stop the owned cluster, even after a stalled driver close.
      try { const closed = await fixture.close(); current.clusterStopped = closed.clusterStopped; expect(closed.ownedClientsClosed).toBe(true) }
      catch (error) { failure ??= error; current.clusterStopped = false }
      if(!results)try{results=await cleanupBound(tasks,1500)}catch(error){failure??=error}
    }
    current.clientsClosed=Boolean(results&&results.every(r=>r.status==='fulfilled'))
    if(!current.clientsClosed)failure??=new Error('Owned driver close acknowledgement incomplete')
    if (failure) { current.status = 'failed'; halted = true; throw failure }
  }, 10000)
  afterAll(() => {
    mkdirSync(join('output','qwik-private-native'),{recursive:true})
    writeFileSync(join('output','qwik-private-native','transport-qualification.json'),JSON.stringify({
      kind:'synthetic-pg17-driver-and-role-qualification', driver:JSON.parse(readFileSync('node_modules/pg/package.json','utf8')).version,
      auth:'verified-principal port fixture; not hosted Auth/JWT', pool:'direct private Unix socket; not Supavisor',
      cases:proofs,
    }),{flag:'wx'})
  })
  function control(id: string, name: string, body: () => Promise<void>) {
    const proof: Proof = {id,name,status:'unrun'};proofs.push(proof)
    it(name,async(context:TestContext)=>{
      if(halted){context.skip();return}
      current=proof
      try{await body();proof.status='passed'}catch(error){proof.status='failed';halted=true;throw error}
    },15000)
  }
  async function admin<T=any>(sql:string,params:unknown[]=[]){await fixture.admin.exec('RESET ROLE');return fixture.admin.query<T>(sql,params)}
  async function owner(id=randomUUID()){await seedPrivateOwner(fixtureDb(fixture.admin),id,randomUUID(),true,{retentionMode:'until_explicit_clear'});return id}
  async function input(id:string,key=randomUUID()){
    const bytes=new TextEncoder().encode(JSON.stringify({synthetic:randomUUID(),unknown:'001.20',signed:-0.7,nullable:null}))
    return {requestId:key,artifact:await retainLocalQwikArtifact(bytes,id,'synthetic.json'),retention:{mode:'until_explicit_clear' as const}}
  }
  function pool(cancel?: (pid:number)=>Promise<void>){const value=new QwikQualificationPool(fixture,cancel);pools.push(value);return value}
  async function client(id:string){
    const value=new Client(fixture.executorConnection());clients.push(value);await value.connect()
    await value.query("SELECT set_config('role',$1,false),set_config('request.jwt.claim.sub',$2,false),set_config('request.jwt.claims',$3,false)",[role,id,JSON.stringify({sub:id})])
    return value
  }
  async function counts(id:string){return (await admin(`SELECT
    (SELECT count(*)::int FROM qwik_private.artifacts WHERE user_id=$1) artifacts,
    (SELECT count(*)::int FROM qwik_private.commit_receipts WHERE user_id=$1) markers,
    (SELECT count(*)::int FROM public.logging_requests WHERE user_id=$1 AND request_key LIKE 'qwik-private:%') ledgers`,[id])).rows[0]}
  async function bound(){
    const id=await owner(),ns=(await admin('SELECT id FROM qwik_private.namespaces WHERE user_id=$1',[id])).rows[0].id
    const source=await seedPrivateRecording(fixtureDb(fixture.admin),id)
    const receipt=await persistPrivate(fixtureDb(fixture.admin),id,{...source,key:randomUUID(),namespaceId:ns,
      revision:1,claims:[source.claims[0]],retentionMode:'until_explicit_clear',expiresAt:null})
    return {id,source,receipt}
  }
  async function knownClaim(c:Client,s:Awaited<ReturnType<typeof bound>>){
    const claims=(await c.query('SELECT qwik_private.read_claims($1) claims',[s.id])).rows[0].claims
    expect(claims).toHaveLength(1);expect(claims[0]).toMatchObject({entityId:s.source.entityId,artifactId:s.receipt.artifactId,version:1})
    return claims
  }
  async function classification(c:Client,s:Awaited<ReturnType<typeof bound>>,exact:unknown){
    try {const actual=await knownClaim(c,s);expect(actual).toEqual(exact);return 'exact_known_claim'}
    catch(error){if((error as {code?:string}).code==='42501')return 'denied42501';throw error}
  }
  async function definerFlags(){return (await admin("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='qwik_private_test_definer'")).rows[0]}

  control('W1','W1 characterizes exact pre-guard warm and cold role-revocation outcomes with a real claim',async()=>{
    const archive=readFileSync('test/fixtures/qwik-private-require-executor-before-owner-guard.sql')
    expect(digest(archive)).toBe('cd2f7dba6d0e6998d4a006c569e869b547ff8634a0b1efc2ff7fe91ba3650721')
    await admin('DROP FUNCTION qwik_private.require_executor(uuid)')
    await fixture.admin.exec(archive.toString('utf8'))
    await fixture.admin.exec(`REVOKE ALL ON FUNCTION qwik_private.require_executor(uuid) FROM PUBLIC,anon,authenticated,service_role,qwik_private_test_executor;
      ALTER FUNCTION qwik_private.require_executor(uuid) OWNER TO qwik_private_test_definer;`)
    const s=await bound() // Baseline helper is installed BEFORE any private binding/call.
    const warm=await client(s.id),exact=await knownClaim(warm,s)
    await admin('ALTER ROLE qwik_private_test_definer NOBYPASSRLS')
    expect(await definerFlags()).toEqual({rolsuper:false,rolbypassrls:false})
    const warmOutcome=await classification(warm,s,exact),cold=await client(s.id),coldOutcome=await classification(cold,s,exact)
    current.observations={archiveSHA256:digest(archive),preGuardFullSourceSHA256:'e9c39ce0768bdc83592a49cdad830675d3b7e5774567b860e9984adbfed28eec',preRevocationClaims:1,warmOutcome,coldOutcome,
      interpretation:'characterization only; no cache-cause claim; no plan reset'}
    console.info('[qwik-pg17-baseline] '+JSON.stringify(current.observations))
  })
  control('W2','W2 explicitly denies warmed and cold private callers after definer capability is removed',async()=>{
    const s=await bound(),warm=await client(s.id);await knownClaim(warm,s)
    await admin('ALTER ROLE qwik_private_test_definer NOBYPASSRLS')
    expect(await definerFlags()).toEqual({rolsuper:false,rolbypassrls:false})
    const cold=await client(s.id)
    for(const c of [warm,cold]){
      await expect(c.query('SELECT qwik_private.read_claims($1)',[s.id])).rejects.toMatchObject({code:'42501',message:'Private definer capability unavailable'})
      await expect(c.query('SELECT * FROM qwik_private.read_original($1,$2)',[s.id,s.receipt.artifactId])).rejects.toMatchObject({code:'42501',message:'Private definer capability unavailable'})
    }
    expect(await counts(s.id)).toEqual({artifacts:1,markers:1,ledgers:1})
    current.observations={warm:'denied42501',cold:'denied42501',rowsPreserved:true}
  })
  control('W3','W3 proves initial non-bypass RLS and catalog preconditions separately from the API guard',async()=>{
    const id=await owner();await admin('ALTER ROLE qwik_private_test_definer NOBYPASSRLS')
    expect(await definerFlags()).toEqual({rolsuper:false,rolbypassrls:false})
    expect((await admin(`SELECT DISTINCT r.rolname,r.rolsuper,r.rolbypassrls FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='qwik_private'`)).rows)
      .toEqual([{rolname:'qwik_private_test_definer',rolsuper:false,rolbypassrls:false}])
    for(const actor of [role,'qwik_private_test_definer'])for(const external of ['anon','authenticated','authenticator','service_role']){
      expect((await admin('SELECT pg_has_role($1,$2,\'MEMBER\') outgoing,pg_has_role($2,$1,\'MEMBER\') incoming',[actor,external])).rows[0])
        .toEqual({outgoing:false,incoming:false})
    }
    expect((await admin("SELECT to_jsonb(roles) roles,cmd FROM pg_policies WHERE schemaname='qwik_private' AND tablename='owner_policies'")).rows)
      .toEqual([{roles:['authenticated'],cmd:'ALL'}])
    expect((await admin('SELECT count(*)::int count FROM qwik_private.owner_policies WHERE user_id=$1',[id])).rows[0].count).toBe(1)
    const row=(await admin("SELECT relrowsecurity enabled,relforcerowsecurity forced FROM pg_class WHERE oid='qwik_private.owner_policies'::regclass")).rows[0]
    expect(row).toEqual({enabled:true,forced:true})
    const inspector=await fixture.session(performance.now()+5000)
    await inspector.exec('SET ROLE qwik_private_test_definer')
    expect((await inspector.query("SELECT row_security_active('qwik_private.owner_policies'::regclass) active,(SELECT count(*)::int FROM qwik_private.owner_policies) visible")).rows[0])
      .toEqual({active:true,visible:0})
    const c=await client(id)
    expect((await c.query('SELECT current_user::text role,session_user::text login,auth.uid() owner')).rows[0])
      .toEqual({role,login:role,owner:id})
    await expect(c.query('SELECT qwik_private.read_claims($1)',[id])).rejects.toMatchObject({code:'42501',message:'Private definer capability unavailable'})
    current.observations={rlsActive:true,visiblePolicies:0,api:'explicit_guard_denied42501'}
  })
  control('P1','P1 reuses a real one-connection pool from A to B with clean owner and ReadyForQuery state',async()=>{
    const a=await owner(),b=await owner(),first=await input(a),second=await input(b),p=pool();let captured!:Parameters<Parameters<typeof withVerifiedPrivateQwikOriginals>[3]>[0]
    const saved=await withVerifiedPrivateQwikOriginals(verified(a),p,settings,async c=>{captured=c;return c.persist(first)})
    const next=await withVerifiedPrivateQwikOriginals(verified(b),p,settings,async c=>{
      await expect(captured.persist(first)).rejects.toThrow()
      expect((await c.readOriginal(String(saved.receipt.artifactId))).state).toBe('missing_or_unauthorized');return c.persist(second)
    })
    expect(saved.receipt.userId).toBe(a);expect(next.receipt.userId).toBe(b);expect(p.pids).toHaveLength(2);expect(p.pids[0]).toBe(p.pids[1])
    expect(p.events.filter(e=>e.event==='release').every(e=>e.state==='I')).toBe(true)
    expect(await counts(a)).toEqual({artifacts:1,markers:1,ledgers:1});expect(await counts(b)).toEqual({artifacts:1,markers:1,ledgers:1})
    current.observations={sameBackendPid:p.pids[0],events:p.events,ownerIsolation:true}
  })
  control('P2','P2 rolls back real SQL failure before clean same-backend owner reuse',async()=>{
    const a=await owner(),b=await owner(),first=await input(a),changed=await input(a,first.requestId),second=await input(b),p=pool();let written=false
    await expect(withVerifiedPrivateQwikOriginals(verified(a),p,settings,async c=>{
      expect((await c.persist(first)).raw.state).toBe('available');written=true;return c.persist(changed)
    }))
      .rejects.toMatchObject({outcome:'rolled_back',cleanup:'released'})
    expect(written).toBe(true)
    expect(await counts(a)).toEqual({artifacts:0,markers:0,ledgers:0})
    await withVerifiedPrivateQwikOriginals(verified(b),p,settings,c=>c.persist(second))
    expect(p.pids[0]).toBe(p.pids[1]);expect(p.events.some(e=>e.event==='error-ready'&&e.code==='22023'&&e.state==='E')).toBe(true)
    current.observations={events:p.events,rolledBackRows:true,sameBackendPid:p.pids[0]}
  })
  control('P3','P3 causally cancels a blocked owned backend and reuses it only after actual rollback',async()=>{
    const a=await owner(),b=await owner(),first=await input(a),second=await input(b),abort=new AbortController();let victim=0,cancelled=false
    await admin("SELECT pg_advisory_lock(hashtextextended('capture-owner:'||$1::text,0))",[a])
    const p=pool(async pid=>{expect(pid).toBe(victim);cancelled=(await admin<{cancelled:boolean}>('SELECT pg_cancel_backend($1) cancelled',[pid])).rows[0].cancelled;expect(cancelled).toBe(true)})
    p.onAcquire=pid=>{victim=pid}
    const operation=withVerifiedPrivateQwikOriginals(verified(a),p,settings,c=>c.persist(first),{signal:abort.signal});void operation.catch(()=>{})
    let blocked=false;const deadline=performance.now()+5000
    try{
      while(performance.now()<deadline){
        if(victim){const row=(await admin<{blocked:boolean;matching:boolean}>(`SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) blocked,
          EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$2 AND wait_event_type='Lock' AND query LIKE '%qwik_private.persist_original%') matching`,[fixture.admin.pid,victim])).rows[0]
          if(row.blocked&&row.matching){blocked=true;break}}
        await new Promise(resolve=>setTimeout(resolve,20))
      }
      expect(blocked).toBe(true);abort.abort()
      await expect(operation).rejects.toMatchObject({fault:'cancelled',outcome:'rolled_back',cleanup:'released'})
    }finally{
      abort.abort();await operation.catch(()=>{});await admin("SELECT pg_advisory_unlock(hashtextextended('capture-owner:'||$1::text,0))",[a])
    }
    expect(cancelled).toBe(true);expect(p.events.some(e=>e.event==='user-cancel'&&e.code==='57014'&&e.state==='E')).toBe(true)
    expect(await counts(a)).toEqual({artifacts:0,markers:0,ledgers:0})
    await withVerifiedPrivateQwikOriginals(verified(b),p,settings,c=>c.persist(second));expect(p.pids[1]).toBe(victim)
    current.observations={victim,blocker:fixture.admin.pid,blocked,cancelled,events:p.events,ownerIsolation:true}
  })
  control('P4','P4 reconciles adapter-visible acknowledgement suppression after actual COMMIT on a fresh backend',async()=>{
    const a=await owner(),first=await input(a),p=pool();p.suppressCommitAcknowledgement=true;let originalReceipt:unknown
    await expect(withVerifiedPrivateQwikOriginals(verified(a),p,settings,async c=>{
      const result=await c.persist(first);originalReceipt=result.receipt;return result
    })).rejects.toMatchObject({phase:'commit',outcome:'unknown',cleanup:'discarded'})
    expect(p.events.filter(e=>e.event==='COMMIT')).toHaveLength(1)
    const recovered=await withVerifiedPrivateQwikOriginals(verified(a),p,settings,c=>c.recover(first.requestId))
    expect(recovered.state).toBe('saved');if(recovered.state!=='saved')throw new Error('Missing synthetic receipt')
    expect(recovered.receipt).toEqual(originalReceipt)
    expect(recovered.receipt.sha256).toBe(first.artifact.sha256);expect(recovered.raw.state).toBe('available')
    expect(p.pids[0]).not.toBe(p.pids[1]);expect(await counts(a)).toEqual({artifacts:1,markers:1,ledgers:1})
    current.observations={events:p.events,pids:p.pids,interpretation:'controlled adapter acknowledgement suppression, not proven wire ACK loss'}
  })
  control('P5','P5 denies invalid authority before acquisition and owner or direct-writer bypass before mutation',async()=>{
    const a=await owner(),b=await owner(),p=pool(),other=await input(b)
    for(const result of [{data:{user:null},error:null},{data:{user:{id:a}},error:{message:'synthetic-expired'}},{data:{user:{id:'invalid'}},error:null}]){
      await expect(withVerifiedPrivateQwikOriginals({getUser:async()=>result},p,settings,async()=>false)).rejects.toMatchObject({phase:'authority',fault:'denied'})
    }
    expect(p.acquisitions).toBe(0)
    await expect(withVerifiedPrivateQwikOriginals(verified(a),p,settings,c=>c.persist(other))).rejects.toMatchObject({outcome:'rolled_back'})
    const c=await client(a)
    await expect(c.query('SELECT original_bytes FROM qwik_private.artifacts')).rejects.toMatchObject({code:'42501'})
    await expect(c.query('SELECT public.begin_logging_request($1,$2)',['synthetic-direct-bypass','a'.repeat(64)])).rejects.toMatchObject({code:'42501'})
    await expect(c.query('SET ROLE qwik_private_test_definer')).rejects.toMatchObject({code:'42501'})
    expect(await counts(a)).toEqual({artifacts:0,markers:0,ledgers:0});expect(await counts(b)).toEqual({artifacts:0,markers:0,ledgers:0})
    current.observations={invalidAuthAcquisitions:0,foreignPayload:'rejected after valid lease before mutation',directBypass:'denied42501'}
  })
})
