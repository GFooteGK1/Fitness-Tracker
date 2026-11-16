import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { qwikPrivateFixture, privateActor, seedPrivateOwner, seedPrivateRecording, persistPrivate } from './qwik-private-fixture'
import { qwikArrayFixture } from '../coach/rep-recording-fixture'

let db: PGlite, lowDb: PGlite, nonBypassDb: PGlite, owner: string
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const bytes = (text: string) => new TextEncoder().encode(text)
const expiry = () => new Date(Date.now() + 3600000).toISOString()
type Mode = 'until_explicit_clear' | 'finite_until'
const seed = (mode: Mode, quotaBytes = 20000000) => seedPrivateOwner(db, owner, randomUUID(), true, { retentionMode: mode, quotaBytes })
async function inspect<T = any>(sql: string, params: unknown[] = []) {
  await db.exec('RESET ROLE')
  try { return await db.query<T>(sql,params) } finally { await privateActor(db,owner) }
}
async function read(id: unknown) {
  return (await db.query<{ metadata: Record<string, any>; bytes: Uint8Array | null }>('SELECT * FROM qwik_private.read_original($1,$2)',[owner,id])).rows[0]
}
const retain = (original: Uint8Array, mode: Mode, expiresAt: string | null = null, key = randomUUID()) =>
  persistPrivate(db,owner,{key,bytes:original,sha256:hash(original),retentionMode:mode,expiresAt})
async function rawCall(mode: unknown, expiresAt: unknown) {
  const original = bytes('[1]')
  return db.query('SELECT qwik_private.persist_original($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [owner,randomUUID(),original,hash(original),'synthetic.json',mode,expiresAt,20000000,null,null,null,'[]'])
}
async function counts() {
  return (await inspect(`SELECT
    (SELECT count(*)::integer FROM qwik_private.artifacts WHERE user_id=$1) artifacts,
    (SELECT count(*)::integer FROM qwik_private.source_claims WHERE user_id=$1) claims,
    (SELECT count(*)::integer FROM qwik_private.claim_versions WHERE user_id=$1) versions,
    (SELECT count(*)::integer FROM qwik_private.commit_receipts WHERE user_id=$1) markers,
    (SELECT count(*)::integer FROM logging_requests WHERE user_id=$1 AND request_key LIKE 'qwik-private:%') ledgers,
    (SELECT coalesce(sum(octet_length(original_bytes)),0)::integer FROM qwik_private.artifacts WHERE user_id=$1) stored_bytes`,[owner])).rows[0]
}
beforeAll(async () => {
  db = await qwikPrivateFixture(); lowDb = await qwikPrivateFixture()
  nonBypassDb = await qwikPrivateFixture()
  // No private function has run/planned in this owned negative fixture.
  await nonBypassDb.exec('ALTER ROLE qwik_private_test_definer NOBYPASSRLS')
  await db.exec('CREATE ROLE qwik_private_test_bridge NOLOGIN NOINHERIT')
},30000)
beforeEach(async () => { owner = randomUUID(); await db.exec('RESET ROLE') })
afterAll(async () => { await nonBypassDb?.close(); await lowDb?.close(); await db?.close() })

it('T1 requires an explicit configured retention mode and complete policy/request tuples', async () => {
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[owner])
  await expect(db.query("INSERT INTO qwik_private.owner_policies(user_id,executor_role,byte_quota) VALUES($1,'qwik_private_test_executor',20)",[owner]))
    .rejects.toMatchObject({code:'23502'})
  for (const [mode,duration] of [['until_explicit_clear',60],['finite_until',null],['unknown',60]]) {
    await expect(db.query("INSERT INTO qwik_private.owner_policies(user_id,executor_role,byte_quota,retention_mode,max_retention_seconds) VALUES($1,'qwik_private_test_executor',20,$2,$3)",[owner,mode,duration]))
      .rejects.toMatchObject({code:'23514'})
  }
  await seed('finite_until')
  for (const [mode,deadline] of [[null,null],['unknown',null],['until_explicit_clear',null],['finite_until',null],['finite_until','infinity'],['finite_until',new Date(Date.now()-1000).toISOString()]]) {
    await expect(rawCall(mode,deadline)).rejects.toMatchObject({code:'22023'})
  }
  expect(await counts()).toMatchObject({artifacts:0,markers:0,stored_bytes:0})
})

it('T1 keeps until-clear originals readable without a deadline and never silently changes their mode', async () => {
  await seed('until_explicit_clear')
  await expect(rawCall('until_explicit_clear',expiry())).rejects.toMatchObject({code:'22023'})
  const original = bytes('[1]'), key = randomUUID()
  // Seed an aged synthetic row at creation, with every CHECK/trigger enabled.
  // This compares actual database time to its age; it does not advance a clock.
  await inspect(`INSERT INTO qwik_private.artifacts(user_id,sha256,byte_length,original_bytes,name,retention_mode,expires_at,retained_at)
    VALUES($1,$2,$3,$4,'synthetic.json','until_explicit_clear',NULL,'2000-01-01T00:00:00Z')`,[owner,hash(original),original.length,original])
  const saved = await retain(original,'until_explicit_clear',null,key)
  expect(saved).toMatchObject({retentionMode:'until_explicit_clear',expiresAt:null})
  expect((await inspect('SELECT clock_timestamp()>retained_at aged FROM qwik_private.artifacts WHERE id=$1',[saved.artifactId])).rows[0].aged).toBe(true)
  const current = await read(saved.artifactId)
  expect(current.metadata).toMatchObject({state:'available',retentionMode:'until_explicit_clear',expiresAt:null})
  expect(Buffer.compare(current.bytes!,original)).toBe(0)
  await inspect("UPDATE qwik_private.owner_policies SET retention_mode='finite_until',max_retention_seconds=604800 WHERE user_id=$1",[owner])
  await expect(retain(original,'finite_until',expiry())).rejects.toMatchObject({code:'55000'})
  expect(await retain(original,'until_explicit_clear',null,key)).toEqual(saved)
  expect((await read(saved.artifactId)).metadata.retentionMode).toBe('until_explicit_clear')
})

it('T3 enforces the exact 5000000-byte SQL boundary without replacing the original', async () => {
  await seed('until_explicit_clear')
  const original = new Uint8Array(5000000).fill(97), tooLarge = new Uint8Array(5000001).fill(98)
  const saved = await retain(original,'until_explicit_clear')
  await expect(retain(tooLarge,'until_explicit_clear')).rejects.toMatchObject({code:'22023'})
  const current = await read(saved.artifactId)
  expect(current.metadata.byteLength).toBe(5000000); expect(current.metadata.sha256).toBe(hash(original))
  expect(Buffer.compare(current.bytes!,original)).toBe(0)
  expect(await counts()).toMatchObject({artifacts:1,markers:1,ledgers:1,stored_bytes:5000000})
})

it('T3 stops new until-clear imports at the stored quota without evicting existing bytes', async () => {
  await seed('until_explicit_clear',6)
  const first = await retain(bytes('[1]'),'until_explicit_clear'), second = await retain(bytes('[2]'),'until_explicit_clear')
  await expect(retain(bytes('[3]'),'until_explicit_clear')).rejects.toMatchObject({code:'54000'})
  expect(Buffer.compare((await read(first.artifactId)).bytes!,bytes('[1]'))).toBe(0)
  expect(Buffer.compare((await read(second.artifactId)).bytes!,bytes('[2]'))).toBe(0)
  expect(await counts()).toMatchObject({artifacts:2,markers:2,ledgers:2,stored_bytes:6})
})

it('T4 keeps tombstones and canonical history through clear, closure denial and same-hash replay', async () => {
  const namespaceId = await seed('until_explicit_clear'), source = await seedPrivateRecording(db,owner)
  const key = randomUUID(), input = {...source,namespaceId,key,retentionMode:'until_explicit_clear' as const,expiresAt:null,revision:1,claims:[source.claims[0]]}
  const saved = await persistPrivate(db,owner,input)
  const before = (await inspect('SELECT to_jsonb(w) value FROM workouts w WHERE user_id=$1',[owner])).rows
  await expect(inspect('DELETE FROM auth.users WHERE id=$1',[owner])).rejects.toMatchObject({code:'23503'})
  expect(Buffer.compare((await read(saved.artifactId)).bytes!,source.bytes)).toBe(0)
  await db.query('SELECT qwik_private.delete_original($1,$2,$3,$4,$5)',[owner,randomUUID(),saved.artifactId,'Synthetic explicit owner clear',true])
  expect((await read(saved.artifactId)).metadata.state).toBe('deleted'); expect((await read(saved.artifactId)).bytes).toBeNull()
  await expect(persistPrivate(db,owner,{...input,key:randomUUID()})).rejects.toMatchObject({code:'55000'})
  expect(await persistPrivate(db,owner,input)).toEqual(saved)
  await expect(inspect('DELETE FROM auth.users WHERE id=$1',[owner])).rejects.toMatchObject({code:'23503'})
  expect(await counts()).toMatchObject({artifacts:1,claims:1,versions:1,markers:2,stored_bytes:0})
  expect((await inspect('SELECT to_jsonb(w) value FROM workouts w WHERE user_id=$1',[owner])).rows).toEqual(before)
})

it('N1 requires owner-attested library confirmation and permanently freezes confirmed identity', async () => {
  const namespaceId = await seed('until_explicit_clear'), other = randomUUID()
  await inspect('INSERT INTO auth.users(id) VALUES($1)',[other])
  const row = (await inspect('SELECT user_id,source_reference,basis,confirmed_by FROM qwik_private.namespaces WHERE id=$1',[namespaceId])).rows[0]
  expect(row).toMatchObject({user_id:owner,basis:'owner_attested_source_library',confirmed_by:owner})
  for (const [sql,params] of [
    ['UPDATE qwik_private.namespaces SET source_reference=$1 WHERE id=$2',['synthetic-other-library',namespaceId]],
    ['UPDATE qwik_private.namespaces SET user_id=$1 WHERE id=$2',[other,namespaceId]],
    ['DELETE FROM qwik_private.namespaces WHERE id=$1',[namespaceId]],
  ] as const) await expect(inspect(sql,[...params])).rejects.toMatchObject({code:'55000'})
  await expect(inspect(`INSERT INTO qwik_private.namespaces(user_id,source_reference,basis,state,confirmed_at,confirmed_by)
    VALUES($1,'synthetic-invalid-attestation','owner_attested_source_library','confirmed',now(),$2)`,[owner,other])).rejects.toMatchObject({code:'23514'})
  const unresolved = randomUUID()
  await inspect("INSERT INTO qwik_private.namespaces(id,user_id,source_reference,basis,state) VALUES($1,$2,'synthetic-unresolved-library','unresolved','unresolved')",[unresolved,owner])
  const source = await seedPrivateRecording(db,owner), input = {...source,namespaceId:unresolved,revision:1,claims:[source.claims[0]],retentionMode:'until_explicit_clear' as const,expiresAt:null}
  await expect(persistPrivate(db,owner,input)).rejects.toMatchObject({code:'42501'})
  await inspect("UPDATE qwik_private.namespaces SET basis='owner_attested_source_library',state='confirmed',confirmed_at=now(),confirmed_by=$1 WHERE id=$2",[owner,unresolved])
  expect((await persistPrivate(db,owner,input)).claims).toHaveLength(1)
})

it('N2 keeps the same library identity across device-labelled exports and separates explicit libraries', async () => {
  const firstLibrary = await seed('until_explicit_clear'), first = await seedPrivateRecording(db,owner)
  const bind = (source: typeof first, namespaceId: string) => ({...source,namespaceId,revision:1,claims:[source.claims[0]],retentionMode:'until_explicit_clear' as const,expiresAt:null})
  await persistPrivate(db,owner,bind(first,firstLibrary))
  const reexport: any = qwikArrayFixture(); reexport[0].device_label = 'different-synthetic-device'
  const second = await seedPrivateRecording(db,owner,JSON.stringify(reexport))
  expect(second.sha256).not.toBe(first.sha256)
  await expect(persistPrivate(db,owner,bind(second,firstLibrary))).rejects.toMatchObject({code:'23505'})
  const secondLibrary = await seedPrivateOwner(db,owner,randomUUID(),true,{retentionMode:'until_explicit_clear'})
  const third = await seedPrivateRecording(db,owner,first.raw)
  expect((await persistPrivate(db,owner,bind(third,secondLibrary))).claims).toHaveLength(1)
  expect(await counts()).toMatchObject({artifacts:1,claims:2,versions:2,markers:2})
})

it('A1 uses an isolated caller and rejects public writes, raw access and privileged-role assumption', async () => {
  await seedPrivateOwner(lowDb,owner,randomUUID(),true,{retentionMode:'until_explicit_clear'})
  const original = bytes('[1]'), saved = await persistPrivate(lowDb,owner,{bytes:original,sha256:hash(original),retentionMode:'until_explicit_clear',expiresAt:null})
  const role = (await lowDb.query<any>("SELECT rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='qwik_private_test_executor'")).rows[0]
  expect(role).toEqual({rolsuper:false,rolbypassrls:false,rolinherit:false})
  for (const name of ['anon','authenticated','authenticator','service_role']) {
    const membership = (await lowDb.query<any>("SELECT pg_has_role('qwik_private_test_executor',$1,'MEMBER') outgoing,pg_has_role($1,'qwik_private_test_executor','MEMBER') incoming",[name])).rows[0]
    expect(membership).toEqual({outgoing:false,incoming:false})
  }
  await expect(lowDb.query('SELECT public.begin_logging_request($1,$2)',['synthetic-public-bypass','a'.repeat(64)])).rejects.toMatchObject({code:'42501'})
  await expect(lowDb.query('SELECT original_bytes FROM qwik_private.artifacts')).rejects.toMatchObject({code:'42501'})
  await lowDb.exec('RESET ROLE; SET SESSION AUTHORIZATION qwik_private_test_executor')
  await lowDb.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner])
  await lowDb.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner})])
  // Actual SQL session-authorization model, not a network/JWT login. Never reset
  // this engine to an administrator; afterAll closes only the owned engine.
  await expect(lowDb.exec('SET ROLE authenticated')).rejects.toMatchObject({code:'42501'})
  await expect(lowDb.exec('SET ROLE qwik_private_test_definer')).rejects.toMatchObject({code:'42501'})
  await expect(lowDb.query("SELECT set_config('role','qwik_private_test_definer',false)")).rejects.toMatchObject({code:'42501'})
  const raw = (await lowDb.query<any>('SELECT * FROM qwik_private.read_original($1,$2)',[owner,saved.artifactId])).rows[0]
  expect(Buffer.compare(raw.bytes,original)).toBe(0)
})

it('A1 rejects both directions of direct and transitive external-role membership', async () => {
  await seed('until_explicit_clear')
  const configurations = ['anon','authenticated','authenticator','service_role'].flatMap(name => [
    [`GRANT ${name} TO qwik_private_test_executor`,`REVOKE ${name} FROM qwik_private_test_executor`],
    [`GRANT qwik_private_test_executor TO ${name}`,`REVOKE qwik_private_test_executor FROM ${name}`],
  ])
  configurations.push(
    ['GRANT qwik_private_test_bridge TO qwik_private_test_executor; GRANT authenticated TO qwik_private_test_bridge','REVOKE authenticated FROM qwik_private_test_bridge; REVOKE qwik_private_test_bridge FROM qwik_private_test_executor'],
    ['GRANT qwik_private_test_bridge TO authenticated; GRANT qwik_private_test_executor TO qwik_private_test_bridge','REVOKE qwik_private_test_executor FROM qwik_private_test_bridge; REVOKE qwik_private_test_bridge FROM authenticated'])
  for (const [grant,revoke] of configurations) {
    await db.exec('RESET ROLE; '+grant); await privateActor(db,owner)
    try { await expect(db.query('SELECT qwik_private.read_claims($1)',[owner])).rejects.toMatchObject({code:'42501'}) }
    finally { await db.exec('RESET ROLE; '+revoke); await privateActor(db,owner) }
  }
  expect(await counts()).toMatchObject({artifacts:0,markers:0})
})

it('A1 refuses powerful callers and any caller or external path to the definer', async () => {
  await seed('until_explicit_clear')
  for (const [grant,revoke] of [
    ['ALTER ROLE qwik_private_test_executor BYPASSRLS','ALTER ROLE qwik_private_test_executor NOBYPASSRLS'],
    ['ALTER ROLE qwik_private_test_executor SUPERUSER','ALTER ROLE qwik_private_test_executor NOSUPERUSER'],
    ['GRANT qwik_private_test_definer TO qwik_private_test_executor','REVOKE qwik_private_test_definer FROM qwik_private_test_executor'],
    ['GRANT qwik_private_test_definer TO authenticated','REVOKE qwik_private_test_definer FROM authenticated'],
  ]) {
    await db.exec('RESET ROLE; '+grant); await privateActor(db,owner)
    try { await expect(db.query('SELECT qwik_private.read_claims($1)',[owner])).rejects.toMatchObject({code:'42501'}) }
    finally { await db.exec('RESET ROLE; '+revoke); await privateActor(db,owner) }
  }
  expect(await counts()).toMatchObject({artifacts:0,markers:0})
})

it('A1 proves the explicit definer capability and fails closed without its first private RLS bypass', async () => {
  await seed('until_explicit_clear')
  const owners = (await inspect(`SELECT DISTINCT r.rolname,r.rolsuper,r.rolbypassrls FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='qwik_private'`)).rows
  expect(owners).toEqual([{rolname:'qwik_private_test_definer',rolsuper:false,rolbypassrls:true}])
  expect((await inspect("SELECT relforcerowsecurity forced FROM pg_class WHERE oid='qwik_private.owner_policies'::regclass")).rows[0].forced).toBe(true)
  const negativeOwner = randomUUID()
  await seedPrivateOwner(nonBypassDb,negativeOwner,randomUUID(),true,{retentionMode:'until_explicit_clear'})
  await nonBypassDb.exec('RESET ROLE')
  const negativeOwners = (await nonBypassDb.query<any>(`SELECT DISTINCT r.rolname,r.rolsuper,r.rolbypassrls FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='qwik_private'`)).rows
  expect(negativeOwners).toEqual([{rolname:'qwik_private_test_definer',rolsuper:false,rolbypassrls:false}])
  expect((await nonBypassDb.query<any>("SELECT relrowsecurity enabled,relforcerowsecurity forced FROM pg_class WHERE oid='qwik_private.owner_policies'::regclass")).rows[0])
    .toEqual({enabled:true,forced:true})
  expect((await nonBypassDb.query<any>("SELECT policyname,to_jsonb(roles) roles,cmd FROM pg_policies WHERE schemaname='qwik_private' AND tablename='owner_policies'")).rows)
    .toEqual([{policyname:'owner',roles:['authenticated'],cmd:'ALL'}])
  expect(Number((await nonBypassDb.query<any>('SELECT count(*) n FROM qwik_private.owner_policies WHERE user_id=$1',[negativeOwner])).rows[0].n)).toBe(1)
  for (const role of ['qwik_private_test_executor','qwik_private_test_definer']) {
    for (const external of ['anon','authenticated','authenticator','service_role']) {
      expect((await nonBypassDb.query<any>("SELECT pg_has_role($1,$2,'MEMBER') outgoing,pg_has_role($2,$1,'MEMBER') incoming",[role,external])).rows[0])
        .toEqual({outgoing:false,incoming:false})
    }
  }
  await nonBypassDb.exec('SET ROLE qwik_private_test_definer')
  expect((await nonBypassDb.query<any>("SELECT current_user::text actor,row_security_active('qwik_private.owner_policies'::regclass) active")).rows[0])
    .toEqual({actor:'qwik_private_test_definer',active:true})
  expect(Number((await nonBypassDb.query<any>('SELECT count(*) n FROM qwik_private.owner_policies WHERE user_id=$1',[negativeOwner])).rows[0].n)).toBe(0)
  await nonBypassDb.exec('RESET ROLE; SET SESSION AUTHORIZATION qwik_private_test_executor')
  await nonBypassDb.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[negativeOwner])
  await nonBypassDb.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:negativeOwner})])
  expect((await nonBypassDb.query<any>("SELECT session_user::text session_user,current_user::text actor,auth.uid() owner")).rows[0])
    .toEqual({session_user:'qwik_private_test_executor',actor:'qwik_private_test_executor',owner:negativeOwner})
  await expect(nonBypassDb.query('SELECT qwik_private.read_claims($1)',[negativeOwner])).rejects.toMatchObject({code:'42501',message:'Private definer capability unavailable'})
  // The API rejects the explicit current-definer capability before owner lookup.
  // Direct RLS visibility above is separate evidence; neither attributes the
  // historical warmed-role behavior. Production capability remains gated.
  expect((await db.query<any>('SELECT qwik_private.read_claims($1) claims',[owner])).rows[0].claims).toEqual([])
})

it('A1 explicit definer guard protects a warmed bound recording after BYPASSRLS removal', async () => {
  const namespaceId = await seed('until_explicit_clear'), source = await seedPrivateRecording(db,owner), key = randomUUID()
  const canonicalBefore = (await inspect('SELECT to_jsonb(w) value FROM workouts w WHERE user_id=$1 ORDER BY id',[owner])).rows
  const saved = await persistPrivate(db,owner,{...source,key,namespaceId,revision:1,claims:[source.claims[0]],retentionMode:'until_explicit_clear',expiresAt:null})
  const claimsBefore = (await db.query<any>('SELECT qwik_private.read_claims($1) claims',[owner])).rows[0].claims
  expect(claimsBefore).toHaveLength(1)
  expect(claimsBefore[0]).toMatchObject({artifactId:saved.artifactId,entityId:source.entityId,canonicalRevision:1,version:1,
    sourceSetId:source.claims[0].sourceSetId,canonicalState:'current',artifactState:'retained'})
  const rawBefore = await read(saved.artifactId)
  expect(rawBefore.metadata).toMatchObject({state:'available',sha256:source.sha256})
  expect(Buffer.compare(rawBefore.bytes!,source.bytes)).toBe(0)
  expect((await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) receipt',[owner,key,'retain'])).rows[0].receipt).toEqual(saved)
  const countsBefore = await counts()
  expect(countsBefore).toMatchObject({artifacts:1,claims:1,versions:1,markers:1})
  await db.exec('RESET ROLE; ALTER ROLE qwik_private_test_definer NOBYPASSRLS'); await privateActor(db,owner)
  try {
    const capability = (await inspect(`SELECT DISTINCT r.rolsuper,r.rolbypassrls FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='qwik_private'`)).rows
    expect(capability).toEqual([{rolsuper:false,rolbypassrls:false}])
    expect((await db.query<any>("SELECT current_user::text actor,auth.uid() owner")).rows[0])
      .toEqual({actor:'qwik_private_test_executor',owner})
    // Same PGlite engine and reapplied caller role, not a new physical session.
    await expect(db.query('SELECT qwik_private.read_claims($1)',[owner])).rejects.toMatchObject({code:'42501',message:'Private definer capability unavailable'})
    await expect(read(saved.artifactId)).rejects.toMatchObject({code:'42501',message:'Private definer capability unavailable'})
    await expect(db.query('SELECT qwik_private.read_receipt($1,$2,$3)',[owner,key,'retain'])).rejects.toMatchObject({code:'42501',message:'Private definer capability unavailable'})
  } finally { await db.exec('RESET ROLE; ALTER ROLE qwik_private_test_definer BYPASSRLS'); await privateActor(db,owner) }
  expect((await db.query<any>('SELECT qwik_private.read_claims($1) claims',[owner])).rows[0].claims).toEqual(claimsBefore)
  expect(Buffer.compare((await read(saved.artifactId)).bytes!,source.bytes)).toBe(0)
  expect((await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) receipt',[owner,key,'retain'])).rows[0].receipt).toEqual(saved)
  expect(await counts()).toEqual(countsBefore)
  expect((await inspect('SELECT to_jsonb(w) value FROM workouts w WHERE user_id=$1 ORDER BY id',[owner])).rows).toEqual(canonicalBefore)
})
