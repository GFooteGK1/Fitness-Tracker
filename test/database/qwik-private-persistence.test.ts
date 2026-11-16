import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { qwikPrivateFixture, grantPrivateFixtureAccess, privatePreparation, privateActor, canonicalActor, seedPrivateOwner, seedPrivateRecording, persistPrivate } from './qwik-private-fixture'
import { sqlFile } from './fixture'
import { qwikArrayFixture, recordingOptions } from '../coach/rep-recording-fixture'
import { parseQwikArrayRecordings } from '@/app/lib/coach/rep-recording'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { mcpOwnerClient } from './mcp-activity-fixture'

let db: PGlite, privilegeDb: PGlite, sourceAcl: { authenticated: boolean; anon: boolean }
const owner = randomUUID(), other = randomUUID(), legacyId = randomUUID()
const expiry = () => new Date(Date.now() + 3600000).toISOString()
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const raw = () => { const rows: any = qwikArrayFixture(); rows[0].test_case = randomUUID(); return JSON.stringify(rows) }
async function seeded(text = raw()) {
  const namespaceId = await seedPrivateOwner(db, owner)
  const source = await seedPrivateRecording(db, owner, text)
  return { ...source, namespaceId, expiresAt: expiry() }
}
async function persist(source: Awaited<ReturnType<typeof seeded>>, overrides = {}) {
  return persistPrivate(db, owner, { ...source, revision: 1, claims: [source.claims[0]], ...overrides })
}
async function original(id: string, actor = owner) {
  return (await db.query<{ metadata: Record<string, any>; bytes: Uint8Array | null }>('SELECT * FROM qwik_private.read_original($1,$2)', [actor,id])).rows
}
async function inspect<T = any>(sql: string, params: unknown[] = []) {
  await db.exec('RESET ROLE')
  try { return await db.query<T>(sql,params) } finally { await privateActor(db,owner) }
}
async function count(table: string) { return Number((await inspect<any>(`SELECT count(*) n FROM qwik_private.${table} WHERE user_id=$1`,[owner])).rows[0].n) }
async function canonical() { return (await inspect<any>('SELECT to_jsonb(w) value FROM workouts w WHERE user_id=$1 ORDER BY id',[owner])).rows }
async function completePublic(key: string, fingerprint: string, response: unknown) {
  await canonicalActor(db,owner)
  try {
    const row = (await db.query<any>('SELECT public.begin_logging_request($1,$2) value',[key,fingerprint])).rows[0].value
    await db.query('SELECT public.finish_logging_request($1,$2,$3)',[row.id,JSON.stringify(response),200])
  } finally { await privateActor(db,owner) }
}
async function unboundFingerprint(bytes: Uint8Array, expiresAt: string) {
  return (await db.query<any>(`SELECT encode(sha256(convert_to(jsonb_build_object(
    'sha',$1::text,'length',$2::integer,'name','synthetic.json','retentionMode','finite_until','expiryEpoch',extract(epoch FROM $3::timestamptz),
    'quota',20000000::bigint,'namespace',NULL::uuid,'entity',NULL::uuid,'revision',NULL::integer,'claims','[]'::jsonb)::text,'UTF8')),'hex') value`,
    [hash(bytes),bytes.length,expiresAt])).rows[0].value as string
}

beforeAll(async () => {
  db = await qwikPrivateFixture({ apply: false })
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, other])
  // Genuine old CHECK behavior: partial tuple evaluates UNKNOWN and was accepted.
  await db.query(`INSERT INTO measurement_imports(id,user_id,source_system,source_file_hash,source_schema_version,parser_version,raw_artifact_bucket)
    VALUES($1,$2,'synthetic-null-baseline',$3,'synthetic','synthetic','private')`, [legacyId,owner,'a'.repeat(64)])
  await db.exec("SET socius.qwik_private_disposable_fixture='true'")
  await db.exec(sqlFile(privatePreparation))
  sourceAcl = (await db.query<any>(`SELECT has_schema_privilege('authenticated','qwik_private','USAGE') authenticated,
    has_schema_privilege('anon','qwik_private','USAGE') anon`)).rows[0]
  await grantPrivateFixtureAccess(db)
  await seedPrivateOwner(db, other); await privateActor(db, owner)
  // Change session authorization only in the isolated adversary. Never reuse
  // that low-privilege session as the fixture admin or mask its first failure.
  privilegeDb = await qwikPrivateFixture()
}, 30000)
beforeEach(async () => { await privateActor(db, owner) })
afterAll(async () => { await privilegeDb?.close(); await db?.close() })

it('has no source access grants, fixes new NULL tuples additively and preserves old rows without backfill', async () => {
  expect(sourceAcl).toEqual({ authenticated: false, anon: false })
  await db.exec('RESET ROLE')
  expect((await db.query('SELECT id FROM measurement_imports WHERE id=$1', [legacyId])).rows).toHaveLength(1)
  const add = (value: string | null) => db.query(`INSERT INTO measurement_imports(user_id,source_system,source_file_hash,source_schema_version,parser_version,raw_artifact_bucket)
    VALUES($1,'synthetic-new-tuple',$2,'synthetic','synthetic',$3)`, [owner,randomUUID().replaceAll('-','').repeat(2),value])
  await expect(add('private')).rejects.toMatchObject({ code: '23514' })
  await expect(add(null)).resolves.toBeDefined()
  await db.query(`INSERT INTO measurement_imports(user_id,source_system,source_file_hash,source_schema_version,parser_version,
    raw_artifact_bucket,raw_artifact_path,raw_artifact_retention_class,raw_artifact_expires_at)
    VALUES($1,'synthetic-complete',$2,'synthetic','synthetic','private',$3,'explicit',now()+interval '1 day')`,
  [owner,randomUUID().replaceAll('-','').repeat(2),owner+'/synthetic.qwik'])
  expect((await db.query<any>("SELECT convalidated FROM pg_constraint WHERE conname='measurement_imports_raw_artifact_complete_v2'")).rows[0].convalidated).toBe(false)
})

it('checks stored original digest/length and faithfully reads original bytes; request replay is stable', async () => {
  const source = await seeded(), key = randomUUID(), before = await canonical()
  const saved = await persist(source,{key}), read = (await original(saved.artifactId))[0]
  expect(read.metadata.state).toBe('available'); expect(read.bytes).toEqual(source.bytes)
  expect(hash(read.bytes!)).toBe(source.sha256)
  expect(await persist(source,{key})).toEqual(saved)
  expect(await canonical()).toEqual(before)
  expect(Number((await inspect<any>('SELECT count(*) n FROM qwik_private.source_claims WHERE id=$1',[saved.claims[0].claimId])).rows[0].n)).toBe(1)
  await expect(persist(source,{key,name:'changed-request.json'})).rejects.toMatchObject({code:'22023'})
  await expect(persist(source,{key:randomUUID(),sha256:'f'.repeat(64)})).rejects.toMatchObject({code:'22023'})
})

it('rejects an external authenticated session even after accidental private API execute grants', async () => {
  const namespaceId = await seedPrivateOwner(privilegeDb,owner)
  const source = await seedPrivateRecording(privilegeDb,owner,raw())
  await canonicalActor(privilegeDb,owner)
  const canonicalRows = async () => (await privilegeDb.query<any>('SELECT to_jsonb(w) value FROM workouts w ORDER BY id')).rows
  const before = await canonicalRows()
  const artifactCount = Number((await privilegeDb.query<any>('SELECT count(id) n FROM qwik_private.artifacts')).rows[0].n)
  const signatures = [
    'persist_original(uuid,text,bytea,text,text,text,timestamptz,bigint,uuid,uuid,integer,jsonb)',
    'read_original(uuid,uuid)', 'delete_original(uuid,text,uuid,text,boolean)', 'read_claims(uuid)', 'read_receipt(uuid,text,text)',
  ]
  await privilegeDb.exec('RESET ROLE')
  for (const signature of signatures) await privilegeDb.exec(`GRANT EXECUTE ON FUNCTION qwik_private.${signature} TO authenticated`)
    await privilegeDb.exec('SET SESSION AUTHORIZATION authenticated')
    await privilegeDb.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
    const role = (await privilegeDb.query<any>("SELECT session_user::text session_user,current_user::text current_user,current_setting('role') active_role,pg_has_role('authenticated','qwik_private_test_executor','MEMBER') member")).rows[0]
    expect(role).toEqual({session_user:'authenticated',current_user:'authenticated',active_role:'none',member:false})
    expect((await privilegeDb.query<any>("SELECT has_function_privilege('authenticated','qwik_private.persist_original(uuid,text,bytea,text,text,text,timestamptz,bigint,uuid,uuid,integer,jsonb)','EXECUTE') allowed")).rows[0].allowed).toBe(true)
    await expect(persistPrivate(privilegeDb,owner,{...source,namespaceId,expiresAt:expiry(),revision:1,claims:[source.claims[0]]})).rejects.toMatchObject({code:'42501',message:'Trusted private executor required'})
    await expect(privilegeDb.query('SELECT * FROM qwik_private.read_original($1,$2)',[owner,randomUUID()])).rejects.toMatchObject({code:'42501',message:'Trusted private executor required'})
    await expect(privilegeDb.query('SELECT qwik_private.read_claims($1)',[owner])).rejects.toMatchObject({code:'42501'})
    await expect(privilegeDb.query('SELECT qwik_private.read_receipt($1,$2,$3)',[owner,randomUUID(),'retain'])).rejects.toMatchObject({code:'42501'})
    await expect(privilegeDb.query('SELECT qwik_private.delete_original($1,$2,$3,$4,$5)',[owner,randomUUID(),randomUUID(),'synthetic',true])).rejects.toMatchObject({code:'42501'})
    await expect(privilegeDb.exec('SET ROLE qwik_private_test_executor')).rejects.toMatchObject({code:'42501'})
    await expect(privilegeDb.query("SELECT set_config('role','qwik_private_test_executor',false)")).rejects.toMatchObject({code:'42501'})
  expect(Number((await privilegeDb.query<any>('SELECT count(id) n FROM qwik_private.artifacts')).rows[0].n)).toBe(artifactCount)
  expect((await privilegeDb.query('SELECT id FROM qwik_private.source_claims')).rows).toHaveLength(0)
  expect((await privilegeDb.query("SELECT id FROM public.logging_requests WHERE request_key LIKE 'qwik-private:%'")).rows).toHaveLength(0)
  expect(await canonicalRows()).toEqual(before)
  // This is actual PostgreSQL session-authorization simulation, not a hosted
  // JWT/login test. Closing this dedicated fixture is its cleanup: do not turn
  // the untrusted session back into an admin or reuse it in subsequent hooks.
})

it('enforces owner correlation, actual raw-storage access and namespace/canonical ownership at the database boundary', async () => {
  const source=await seeded(), saved=await persist(source)
  await expect(db.query('SELECT original_bytes FROM qwik_private.artifacts')).rejects.toMatchObject({code:'42501'})
  await privateActor(db,other)
  expect(await original(saved.artifactId,other)).toEqual([])
  await canonicalActor(db,other)
  expect((await db.query('SELECT id FROM qwik_private.artifacts')).rows).toEqual([])
  await privateActor(db,other)
  await expect(original(saved.artifactId,owner)).rejects.toMatchObject({code:'42501'})
  await expect(persistPrivate(db,other,{...source,revision:1,claims:[source.claims[0]]})).rejects.toMatchObject({code:'42501'})
  await privateActor(db,owner)
  const unresolved=await seedPrivateOwner(db,owner,randomUUID(),false)
  await expect(persist(source,{namespaceId:unresolved})).rejects.toMatchObject({code:'42501'})
  await expect(persist(source,{revision:99})).rejects.toMatchObject({code:'40001'})
})

it('requires configured policy and finite expiry; stored policy limits caller quota hints', async () => {
  const source=await seeded()
  for(const expiresAt of [null,'infinity',new Date(Date.now()-1000).toISOString(),new Date(Date.now()+8*86400000).toISOString()]) {
    await expect(persist(source,{expiresAt})).rejects.toMatchObject({code:'22023'})
  }
  await expect(persist(source,{quota:1})).rejects.toMatchObject({code:'54000'})
  const unconfigured=randomUUID(); await db.exec('RESET ROLE'); await db.query('INSERT INTO auth.users VALUES($1)',[unconfigured]); await privateActor(db,unconfigured)
  await expect(persistPrivate(db,unconfigured,{bytes:source.bytes,sha256:source.sha256,expiresAt:expiry()})).rejects.toMatchObject({code:'42501'})
})

it('refuses available metadata without bytes and prevents foreign-owner composite links', async () => {
  const source=await seeded(), saved=await persist(source)
  await db.exec('RESET ROLE')
  await expect(db.query(`INSERT INTO qwik_private.artifacts(user_id,sha256,byte_length,original_bytes,name,retention_mode,expires_at)
    VALUES($1,$2,2,NULL,'synthetic-missing','finite_until',now()+interval '1 day')`,[owner,'f'.repeat(64)])).rejects.toMatchObject({code:'23514'})
  const otherNamespace=await seedPrivateOwner(db,other), otherSource=await seedPrivateRecording(db,other,raw())
  const otherSaved=await persistPrivate(db,other,{...otherSource,namespaceId:otherNamespace,revision:1,claims:[otherSource.claims[0]],expiresAt:expiry()})
  await db.exec('RESET ROLE')
  await expect(db.query(`INSERT INTO qwik_private.source_claims(user_id,namespace_id,source_set_id,artifact_id,source_index,payload_sha256,entity_id,canonical_revision,canonical_path,version)
    VALUES($1,$2,'synthetic-foreign',$3,0,$4,$5,1,$6,1)`,[owner,source.namespaceId,otherSaved.artifactId,'a'.repeat(64),source.entityId,
    ['blocks','2','segments','0','events','0','performed','sets','4','velocity','recording']])).rejects.toMatchObject({code:'23503'})
  expect(otherNamespace).toBeTruthy(); expect(saved.artifactId).not.toBe(otherSaved.artifactId)
})

it('caps higher caller hints at stored aggregate quota and counts expired bytes until explicit clearing', async () => {
  const isolatedOwner = randomUUID()
  await seedPrivateOwner(db, isolatedOwner)
  await db.exec('RESET ROLE')
  await db.query('UPDATE qwik_private.owner_policies SET byte_quota=6 WHERE user_id=$1', [isolatedOwner])
  await privateActor(db, isolatedOwner)
  const retain = (text: string) => {
    const bytes = new TextEncoder().encode(text)
    return persistPrivate(db, isolatedOwner, { bytes, sha256: hash(bytes), expiresAt: expiry(), quota:20000000 })
  }
  const first = await retain('[1]')
  await retain('[2]') // Exactly six bytes under the authoritative stored policy.
  await expect(retain('[3]')).rejects.toMatchObject({code:'54000'})
  await db.exec('RESET ROLE; ALTER TABLE qwik_private.artifacts DISABLE TRIGGER immutable_original')
  try { await db.query("UPDATE qwik_private.artifacts SET retained_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",[first.artifactId]) }
  finally { await db.exec('ALTER TABLE qwik_private.artifacts ENABLE TRIGGER immutable_original'); await privateActor(db,isolatedOwner) }
  expect((await original(first.artifactId,isolatedOwner))[0].metadata.state).toBe('expired')
  await expect(retain('[3]')).rejects.toMatchObject({code:'54000'})
  await db.query('SELECT qwik_private.delete_original($1,$2,$3,$4,$5)', [isolatedOwner,randomUUID(),first.artifactId,'Synthetic explicit byte clearing',true])
  await retain('[3]')
  await db.exec('RESET ROLE')
  const stored = (await db.query<any>('SELECT sum(octet_length(original_bytes)) n FROM qwik_private.artifacts WHERE user_id=$1',[isolatedOwner])).rows[0].n
  expect(Number(stored)).toBe(6)
  await privateActor(db,owner)
})

it('permanently reserves a namespaced source across workouts and accepts distinct real source IDs', async () => {
  const source=await seeded(), first=await persist(source), second=await seedPrivateRecording(db,owner,source.raw)
  await expect(persist(source,{entityId:second.entityId,key:randomUUID()})).rejects.toMatchObject({code:'23505'})
  const distinct=await persist(source,{claims:[source.claims[1]],key:randomUUID()})
  expect(distinct.claims[0].sourceSetId).not.toBe(first.claims[0].sourceSetId)
  expect((await db.query<any>('SELECT qwik_private.read_claims($1) value',[owner])).rows[0].value.filter((c:any)=>c.namespaceId===source.namespaceId)).toHaveLength(2)
})

it('rolls back earlier valid claims and original storage when a final mixed selection is malformed', async () => {
  const source=await seeded(), before=await canonical(), artifactCount=await count('artifacts'), claimCount=await count('source_claims')
  const bad=structuredClone(source.claims[1]); bad.setIndex=99
  await expect(persist(source,{claims:[source.claims[0],bad]})).rejects.toMatchObject({code:'22023'})
  expect(await count('artifacts')).toBe(artifactCount); expect(await count('source_claims')).toBe(claimCount); expect(await canonical()).toEqual(before)
})

it('rolls back byte storage and claims if the final ledger write fails', async () => {
  const source=await seeded(), artifactCount=await count('artifacts'), before=await canonical()
  await db.exec(`RESET ROLE;
    CREATE FUNCTION public.synthetic_qwik_finish_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.request_key LIKE 'qwik-private:retain:%' AND NEW.status='complete' THEN RAISE EXCEPTION 'Synthetic receipt failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER synthetic_qwik_finish_failure BEFORE UPDATE ON public.logging_requests FOR EACH ROW EXECUTE FUNCTION public.synthetic_qwik_finish_failure();`)
  await privateActor(db,owner)
  try { await expect(persist(source)).rejects.toThrow('Synthetic receipt failure') }
  finally { await db.exec('RESET ROLE; DROP TRIGGER synthetic_qwik_finish_failure ON public.logging_requests; DROP FUNCTION public.synthetic_qwik_finish_failure()'); await privateActor(db,owner) }
  expect(await count('artifacts')).toBe(artifactCount); expect(await canonical()).toEqual(before)
})

it('recovers a lost committed response through the original private receipt without another artifact or claim', async () => {
  const source=await seeded(), key=randomUUID(); let saved:any
  await expect((async()=>{saved=await persist(source,{key});throw new Error('Synthetic response lost')})()).rejects.toThrow('Synthetic response lost')
  const countAfter=await count('artifacts')
  const recovered=(await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) value',[owner,key,'retain'])).rows[0].value
  expect(recovered).toEqual(saved); expect(await persist(source,{key})).toEqual(saved); expect(await count('artifacts')).toBe(countAfter)
  expect((await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) value',[owner,randomUUID(),'retain'])).rows[0].value).toBeNull()
})

it('rejects a forged completed public retention ledger even with the exact private input fingerprint', async () => {
  await seedPrivateOwner(db,owner)
  const bytes = new TextEncoder().encode('[9]'), digest = hash(bytes), expiresAt = expiry(), key = randomUUID()
  const fingerprint = await unboundFingerprint(bytes,expiresAt)
  const real = await persistPrivate(db,owner,{bytes,sha256:digest,expiresAt})
  const before = await count('artifacts')
  // A fully valid decorated private receipt, real owned bytes and matching
  // fingerprint still do not prove a different request privately committed.
  await completePublic('qwik-private:retain:'+key,fingerprint,real)
  await expect(persistPrivate(db,owner,{key,bytes,sha256:digest,expiresAt})).rejects.toMatchObject({code:'55000',message:'Private commit provenance unavailable'})
  expect((await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) value',[owner,key,'retain'])).rows[0].value).toBeNull()
  expect(await count('artifacts')).toBe(before)
  await db.exec('RESET ROLE; SET ROLE authenticated')
  try {
    await expect(db.query('SELECT response FROM qwik_private.commit_receipts')).rejects.toMatchObject({code:'42501'})
    await expect(db.query(`INSERT INTO qwik_private.commit_receipts(ledger_id,user_id,operation,request_key,fingerprint,artifact_id,response)
      VALUES($1,$2,'retain',$3,$4,$5,$6)`,[randomUUID(),owner,key,fingerprint,randomUUID(),'{}'])).rejects.toMatchObject({code:'42501'})
  } finally { await privateActor(db,owner) }
})

it('rejects a forged completed public deletion ledger without clearing the real original', async () => {
  const source = await seeded(), saved = await persist(source), key = randomUUID(), reason = 'Synthetic forged deletion attempt'
  const fingerprint = (await db.query<any>(`SELECT encode(sha256(convert_to(jsonb_build_object('id',$1::uuid,'reason',$2::text,'consent',true)::text,'UTF8')),'hex') value`,
    [saved.artifactId,reason])).rows[0].value
  await completePublic('qwik-private:delete:'+key,fingerprint,{kind:'qwik_private_deletion',userId:owner,artifactId:saved.artifactId,
    state:'deleted',deletedAt:new Date().toISOString(),physicalErasureAsserted:false})
  await expect(db.query('SELECT qwik_private.delete_original($1,$2,$3,$4,$5)',[owner,key,saved.artifactId,reason,true]))
    .rejects.toMatchObject({code:'55000',message:'Private commit provenance unavailable'})
  expect((await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) value',[owner,key,'delete'])).rows[0].value).toBeNull()
  expect((await original(saved.artifactId))[0].bytes).toEqual(source.bytes)
  const actual = (await db.query<any>('SELECT qwik_private.delete_original($1,$2,$3,$4,$5) value',[owner,randomUUID(),saved.artifactId,reason,true])).rows[0].value
  const copiedKey = randomUUID()
  await completePublic('qwik-private:delete:'+copiedKey,fingerprint,actual)
  await expect(db.query('SELECT qwik_private.delete_original($1,$2,$3,$4,$5)',[owner,copiedKey,saved.artifactId,reason,true]))
    .rejects.toMatchObject({code:'55000',message:'Private commit provenance unavailable'})
})

it('finishes a public processing preclaim only through the real private transaction and commit proof', async () => {
  await seedPrivateOwner(db,owner)
  const bytes = new TextEncoder().encode('[8]'), expiresAt = expiry(), key = randomUUID()
  const fingerprint = await unboundFingerprint(bytes,expiresAt)
  await db.exec('RESET ROLE; SET ROLE authenticated')
  const begun = (await db.query<any>('SELECT public.begin_logging_request($1,$2) value',['qwik-private:retain:'+key,fingerprint])).rows[0].value
  expect(begun.status).toBe('processing')
  await privateActor(db,owner)
  expect((await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) value',[owner,key,'retain'])).rows[0].value).toBeNull()
  const saved = await persistPrivate(db,owner,{key,bytes,sha256:hash(bytes),expiresAt})
  expect(saved.artifactStateAtCommit).toBe('retained')
  expect((await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) value',[owner,key,'retain'])).rows[0].value).toEqual(saved)
  await db.exec('RESET ROLE')
  const marker = (await db.query<any>('SELECT ledger_id,response FROM qwik_private.commit_receipts WHERE user_id=$1 AND operation=$2 AND request_key=$3',[owner,'retain',key])).rows
  expect(marker).toEqual([{ledger_id:begun.id,response:saved}])
  await privateActor(db,owner)
})

it('rolls back retention and clearing when private commit provenance cannot be written', async () => {
  const existing = await seeded(), saved = await persist(existing), incoming = await seeded(), key = randomUUID(), deleteKey = randomUUID()
  const artifacts = await count('artifacts'), claims = await count('source_claims'), before = await canonical()
  await db.exec(`RESET ROLE;
    CREATE FUNCTION public.synthetic_private_marker_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic private marker failure'; END $$;
    CREATE TRIGGER synthetic_private_marker_failure BEFORE INSERT ON qwik_private.commit_receipts FOR EACH ROW EXECUTE FUNCTION public.synthetic_private_marker_failure();`)
  await privateActor(db,owner)
  try {
    await expect(persist(incoming,{key})).rejects.toThrow('Synthetic private marker failure')
    await expect(db.query('SELECT qwik_private.delete_original($1,$2,$3,$4,$5)',[owner,deleteKey,saved.artifactId,'Synthetic explicit clearing',true]))
      .rejects.toThrow('Synthetic private marker failure')
  } finally {
    await db.exec('RESET ROLE; DROP TRIGGER synthetic_private_marker_failure ON qwik_private.commit_receipts; DROP FUNCTION public.synthetic_private_marker_failure()')
    await privateActor(db,owner)
  }
  expect(await count('artifacts')).toBe(artifacts); expect(await count('source_claims')).toBe(claims)
  expect(await canonical()).toEqual(before); expect((await original(saved.artifactId))[0].bytes).toEqual(existing.bytes)
  for(const [request,operation] of [[key,'retain'],[deleteKey,'delete']]) {
    expect((await db.query<any>('SELECT qwik_private.read_receipt($1,$2,$3) value',[owner,request,operation])).rows[0].value).toBeNull()
    expect((await inspect('SELECT id FROM public.logging_requests WHERE request_key=$1',['qwik-private:'+operation+':'+request])).rows).toHaveLength(0)
  }
})

it('marks old links stale after canonical correction and appends explicit source version lineage', async () => {
  const source=await seeded(), original=await persist(source), before=(await inspect<any>('SELECT to_jsonb(w) value FROM workouts w WHERE id=$1',[source.entityId])).rows[0].value
  const changed:any=JSON.parse(source.raw); changed[0].ignored_vendor_metadata.changed='new raw unknown value'
  changed[0].exercise_repetitions[0].eccentricRepetition.peak_velocity=-1.2
  const nextRaw=JSON.stringify(changed), nextBytes=new TextEncoder().encode(nextRaw), nextSha=hash(nextBytes)
  const recordings=await parseQwikArrayRecordings(nextRaw,recordingOptions), blocks=structuredClone(before.blocks)
  recordings.forEach((r,i)=>{blocks[2].segments[0].events[0].performed.sets[i+3].velocity={...(blocks[2].segments[0].events[0].performed.sets[i+3].velocity??{}),recording:r}})
  const client=mcpOwnerClient(db,owner).db
  await canonicalActor(db,owner)
  const request=await client.rpc('begin_logging_request',{p_key:'synthetic-private-correction:'+randomUUID(),p_fingerprint:'d'.repeat(64)})
  const normalized=normalizeActivity('workout',{...before,blocks})
  const corrected=await client.rpc('amend_logged_activity',{p_kind:'workout',p_entity_id:source.entityId,p_expected_revision:1,p_request_id:request.data.id,
    p_record:normalized.record,p_blocks:normalized.blocks,p_provenance:source.provenance})
  expect(corrected.error).toBeNull(); expect(corrected.data.revision).toBe(2)
  await privateActor(db,owner)
  const stale=(await db.query<any>('SELECT qwik_private.read_claims($1) value',[owner])).rows[0].value.find((c:any)=>c.claimId===original.claims[0].claimId)
  expect(stale.canonicalState).toBe('stale_or_deleted')
  const nextClaim={...source.claims[0],recording:recordings[0]}
  const next={...source,bytes:nextBytes,sha256:nextSha}
  await expect(persist(next,{revision:2,claims:[nextClaim]})).rejects.toMatchObject({code:'40001'})
  const updated=await persist(next,{revision:2,claims:[{...nextClaim,expectedClaimVersion:1,correctionReason:'Synthetic explicit source correction'}]})
  expect(updated.claims[0].version).toBe(2); expect(updated.claims[0].payloadSha256).not.toBe(original.claims[0].payloadSha256)
  const history=(await inspect<any>('SELECT version,payload_sha256,artifact_id FROM qwik_private.claim_versions WHERE claim_id=$1 ORDER BY version',[original.claims[0].claimId])).rows
  expect(history.map((r:any)=>r.version)).toEqual([1,2]); expect(history[0].artifact_id).toBe(original.artifactId); expect(history[1].artifact_id).toBe(updated.artifactId)
  await expect(db.query('UPDATE qwik_private.claim_versions SET payload_sha256=$1 WHERE claim_id=$2',['f'.repeat(64),original.claims[0].claimId])).rejects.toMatchObject({code:'42501'})
  const current=(await inspect<any>('SELECT to_jsonb(w) value FROM workouts w WHERE id=$1',[source.entityId])).rows[0].value
  expect(current.blocks[2].segments[0].events[0].prescribed).toEqual(before.blocks[2].segments[0].events[0].prescribed)
  expect(current.notes).toBe(before.notes)
})

it('expiry denies raw read without deletion or freeing source identity; consented deletion preserves receipt/history', async () => {
  const source=await seeded(), key=randomUUID(), saved=await persist(source,{key})
  await db.exec('RESET ROLE; ALTER TABLE qwik_private.artifacts DISABLE TRIGGER immutable_original')
  try { await db.query("UPDATE qwik_private.artifacts SET retained_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",[saved.artifactId]) }
  finally { await db.exec('ALTER TABLE qwik_private.artifacts ENABLE TRIGGER immutable_original'); await privateActor(db,owner) }
  const expired=(await original(saved.artifactId))[0]; expect(expired.metadata.state).toBe('expired'); expect(expired.bytes).toBeNull()
  expect((await persist(source,{key})).artifactId).toBe(saved.artifactId)
  await expect(persist(source,{key:randomUUID()})).rejects.toMatchObject({code:'55000'})
  await expect(db.query('SELECT qwik_private.delete_original($1,$2,$3,$4,$5)',[owner,randomUUID(),saved.artifactId,'synthetic delete',false])).rejects.toMatchObject({code:'22023'})
  const deleted=(await db.query<any>('SELECT qwik_private.delete_original($1,$2,$3,$4,$5) value',[owner,randomUUID(),saved.artifactId,'synthetic explicit delete',true])).rows[0].value
  expect(deleted.physicalErasureAsserted).toBe(false)
  const after=(await original(saved.artifactId))[0]; expect(after.metadata.state).toBe('deleted'); expect(after.bytes).toBeNull()
  expect((await inspect('SELECT id FROM qwik_private.source_claims WHERE id=$1',[saved.claims[0].claimId])).rows).toHaveLength(1)
  expect((await inspect('SELECT version FROM qwik_private.claim_versions WHERE claim_id=$1',[saved.claims[0].claimId])).rows).toHaveLength(1)
})
