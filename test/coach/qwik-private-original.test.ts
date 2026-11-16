import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { createPrivateQwikOriginalClient, type PrivateQwikSql } from '@/app/lib/coach/qwik-private-original'
import { retainLocalQwikArtifact, prepareLocalQwikCapture, type QwikSetSelection } from '@/app/lib/coach/qwik-exact-capture'
import { createActivityRecordTool } from '@/app/lib/coach/activity-record-tools'
import { mcpOwnerClient } from '../database/mcp-activity-fixture'
import { qwikPrivateFixture, seedPrivateOwner, privateActor, seedPrivateRecording } from '../database/qwik-private-fixture'
import { qwikArrayFixture } from './rep-recording-fixture'

let db: PGlite, owner: string, other: string, namespace: string
const expires = () => new Date(Date.now()+3600000).toISOString()
const textBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const client = (id = owner, port = db as unknown as PrivateQwikSql) => createPrivateQwikOriginalClient(port,id,{quotaBytes:1000000})
const artifact = (raw = textBytes(qwikArrayFixture()), id = owner) => retainLocalQwikArtifact(raw,id,'synthetic.json')
const count = async (table: string) => (await db.query<any>(`SELECT count(id)::integer n FROM qwik_private.${table}`)).rows[0].n
async function capture(raw = JSON.stringify(qwikArrayFixture())) {
  const seeded = await seedPrivateRecording(db, owner, raw, {attachRecordings:false})
  const canonical = mcpOwnerClient(db,owner), policy = {clientId:'synthetic-private',issuer:'https://synthetic.invalid',resource:'https://synthetic.invalid/mcp'}
  const call = async (name: 'amend_workout' | 'get_activity_record', input: unknown): Promise<any> => (await createActivityRecordTool(async () => ({db:canonical.db,
    principal:{...policy,subject:owner,role:'authenticated',expiresAt:Date.now()+60000}}),policy,name).call(input)).structuredContent.activity
  const original = await artifact(seeded.bytes), current = await call('get_activity_record',{kind:'workout',entityId:seeded.entityId})
  const selections: QwikSetSelection[] = [{sourceSetId:'synthetic-set-0',blockIndex:2,segmentIndex:0,eventIndex:0,collection:'sets',setIndex:3,expectedSetId:null,expectedRecording:null}]
  const packet = await prepareLocalQwikCapture({ownerId:owner,requestId:randomUUID(),expectedRevision:1,snapshot:current.record,artifact:original,selections})
  const saved = await call('amend_workout',packet.command)
  return {original,packet,saved,call,entityId:seeded.entityId}
}
beforeAll(async () => { vi.stubEnv('SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED','true'); db = await qwikPrivateFixture() },30000)
beforeEach(async () => {
  owner = randomUUID(); other = randomUUID()
  namespace = await seedPrivateOwner(db,owner); await seedPrivateOwner(db,other); await privateActor(db,owner)
})
afterAll(async () => { vi.unstubAllEnvs(); await db?.close() })

it('retains exact large bytes privately and independently checks actual retrieved bytes, not metadata alone', async () => {
  const rows: any = qwikArrayFixture(); rows[0].bar_path = Array.from({length:50000},(_,i)=>i/1000)
  rows[0].unknown = {typedString:'001.20',nullable:null}
  const raw = new TextEncoder().encode('\ufeff'+JSON.stringify(rows,null,2)+'\n'), a = await artifact(raw), key = randomUUID()
  const saved = await client().persist({requestId:key,artifact:a,expiresAt:expires()})
  expect(saved.raw).toEqual({state:'available',verifiedSha256:createHash('sha256').update(raw).digest('hex'),byteLength:raw.length})
  const read = await client().readOriginal(String(saved.receipt.artifactId))
  expect(read.state).toBe('available'); if (read.state !== 'available') throw new Error('Missing original')
  expect(read.originalBytes).toEqual(raw); expect(read.metadata.path).toMatch(new RegExp('^'+owner+'/'))
  expect(await count('artifacts')).toBe(1)
  const tampered: PrivateQwikSql = { async query<T>(statement: string, params: unknown[]) {
    const result = await db.query<any>(statement,params)
    if (statement.includes('read_original')) result.rows[0].bytes[0] ^= 1
    return result as {rows:T[]}
  } }
  expect((await client(owner,tampered).readOriginal(String(saved.receipt.artifactId))).state).toBe('corrupt')
  expect((await client().readOriginal(String(saved.receipt.artifactId))).state).toBe('available')
})

it('recovers a lost committed response using the same request and never duplicates or changes an original', async () => {
  const a = await artifact(), key = randomUUID(), deadline = expires()
  let lose = true
  const port: PrivateQwikSql = { async query<T>(statement: string, params: unknown[]) {
    const result = await db.query<any>(statement,params)
    if (statement.includes('persist_original') && lose) { lose=false; throw new Error('Synthetic response loss after actual SQL commit') }
    return result as {rows:T[]}
  } }
  await expect(client(owner,port).persist({requestId:key,artifact:a,expiresAt:deadline})).rejects.toMatchObject({status:503})
  const recovered = await client().recover(key); expect(recovered.state).toBe('saved')
  if (recovered.state !== 'saved') throw new Error('Missing durable receipt')
  const replay = await client().persist({requestId:key,artifact:a,expiresAt:deadline})
  expect(replay.receipt).toEqual(recovered.receipt); expect(await count('artifacts')).toBe(1)
  const changed = await artifact(textBytes({different:'source'}))
  await expect(client().persist({requestId:key,artifact:changed,expiresAt:deadline})).rejects.toThrow()
  expect((await client().recover(randomUUID())).state).toBe('unconfirmed')
})

it('does not treat externally completed public ledger responses as private retention or deletion commits', async () => {
  const key = randomUUID(), id = randomUUID()
  await db.exec('RESET ROLE; SET ROLE authenticated')
  // The request claim remains this synthetic owner. These are real existing
  // authenticated public RPCs, not private function grants or response mocks.
  for (const operation of ['retain','delete'] as const) {
    const begun = (await db.query<any>('SELECT public.begin_logging_request($1,$2) result',
      ['qwik-private:'+operation+':'+key,'a'.repeat(64)])).rows[0].result
    const response = operation==='retain'
      ? {kind:'qwik_private_retention',schemaVersion:1,userId:owner,artifactId:id,sha256:'b'.repeat(64),byteLength:2,
        expiresAt:expires(),retainedAt:new Date().toISOString(),storage:'private_postgres_bytea',artifactStateAtCommit:'retained',canonicalRevision:null,claims:[]}
      : {kind:'qwik_private_deletion',userId:owner,artifactId:id,state:'deleted',deletedAt:new Date().toISOString(),physicalErasureAsserted:false}
    await db.query('SELECT public.finish_logging_request($1,$2,$3)',[begun.id,JSON.stringify(response),200])
  }
  await privateActor(db,owner)
  expect(await client().recover(key,'retain')).toEqual({state:'unconfirmed',absenceProvesNoWrite:false})
  expect(await client().recover(key,'delete')).toEqual({state:'unconfirmed',absenceProvesNoWrite:false})
  expect(await count('artifacts')).toBe(0)
  expect((await client().readOriginal(id)).state).toBe('missing_or_unauthorized')
})

it('recovers a lost deletion response with exact same-key replay, isolation and immutable private provenance', async () => {
  const a = await artifact(), retained = await client().persist({requestId:randomUUID(),artifact:a,expiresAt:expires()})
  const key = randomUUID(), artifactId = String(retained.receipt.artifactId), reason = 'Synthetic approved byte clearing'
  let lose = true
  const port: PrivateQwikSql = {async query<T>(statement: string,params: unknown[]) {
    const result = await db.query<any>(statement,params)
    if(statement.includes('delete_original') && lose) { lose=false; throw new Error('Synthetic deletion response loss after SQL commit') }
    return result as {rows:T[]}
  }}
  await expect(client(owner,port).deleteOriginal({requestId:key,artifactId,reason,consent:'clear_private_original_bytes'})).rejects.toMatchObject({status:503})
  const recovered = await client().recover(key,'delete')
  expect(recovered.state).toBe('saved'); if(recovered.state!=='saved')throw new Error('Missing private deletion receipt')
  expect(recovered.raw.state).toBe('deleted')
  const replay = await client().deleteOriginal({requestId:key,artifactId,reason,consent:'clear_private_original_bytes'})
  expect(replay.receipt).toEqual(recovered.receipt)
  await expect(client().deleteOriginal({requestId:key,artifactId,reason:'Changed request body',consent:'clear_private_original_bytes'})).rejects.toMatchObject({status:400})
  expect((await client().recover(key,'retain')).state).toBe('unconfirmed')
  await privateActor(db,other)
  expect((await client(other).recover(key,'delete')).state).toBe('unconfirmed')
  await db.exec('RESET ROLE')
  const params = [owner,key]
  await expect(db.query("UPDATE qwik_private.commit_receipts SET response=response WHERE user_id=$1 AND operation='delete' AND request_key=$2",params)).rejects.toMatchObject({code:'55000'})
  await expect(db.query("DELETE FROM qwik_private.commit_receipts WHERE user_id=$1 AND operation='delete' AND request_key=$2",params)).rejects.toMatchObject({code:'55000'})
  expect((await db.query("SELECT ledger_id FROM qwik_private.commit_receipts WHERE user_id=$1 AND operation='delete' AND request_key=$2",params)).rows).toHaveLength(1)
  await privateActor(db,owner)
  expect((await client().recover(key,'delete')).state).toBe('saved')
})

it('enforces actual SQL owner/function/column boundaries and refuses session/principal mismatch before mutation', async () => {
  const a = await artifact(), saved = await client().persist({requestId:randomUUID(),artifact:a,expiresAt:expires()})
  await privateActor(db,other)
  expect((await client(other).readOriginal(String(saved.receipt.artifactId))).state).toBe('missing_or_unauthorized')
  expect((await db.query('SELECT id FROM qwik_private.artifacts')).rows).toHaveLength(0)
  await expect(db.query('SELECT original_bytes FROM qwik_private.artifacts')).rejects.toMatchObject({code:'42501'})
  const otherArtifact = await artifact(textBytes({synthetic:true}),other)
  await privateActor(db,owner)
  await expect(client(other).persist({requestId:randomUUID(),artifact:otherArtifact,expiresAt:expires()})).rejects.toMatchObject({status:403})
  expect(await count('artifacts')).toBe(1)
  await expect(client().persist({requestId:randomUUID(),artifact:{...a,sha256:'f'.repeat(64)},expiresAt:expires()})).rejects.toMatchObject({status:400})
})

it('links only an already-saved exact canonical revision and rejects overlapping exports across workouts', async () => {
  const first = await capture(), deadline = expires()
  const registered = await client().persist({requestId:randomUUID(),artifact:first.original,expiresAt:deadline,
    binding:{namespaceId:namespace,capture:first.packet,savedCapture:first.saved}})
  expect(registered.raw.state).toBe('available')
  expect((registered.receipt.claims as any[])).toHaveLength(1)
  const before = await first.call('get_activity_record',{kind:'workout',entityId:first.entityId})
  expect(before.record.capture_revision).toBe(2)
  const rows: any = qwikArrayFixture(); rows.push({...structuredClone(rows[0]),id:'synthetic-unselected-extra'})
  const second = await capture(JSON.stringify(rows))
  await expect(client().persist({requestId:randomUUID(),artifact:second.original,expiresAt:deadline,
    binding:{namespaceId:namespace,capture:second.packet,savedCapture:second.saved}})).rejects.toMatchObject({status:409})
  expect(await count('source_claims')).toBe(1)
  expect(await count('artifacts')).toBe(1) // Loser's new bytes and metadata rolled back together.
  expect((await first.call('get_activity_record',{kind:'workout',entityId:first.entityId})).record).toEqual(before.record)
  expect((await second.call('get_activity_record',{kind:'workout',entityId:second.entityId})).record.capture_revision).toBe(2)
  await expect(client().persist({requestId:randomUUID(),artifact:first.original,expiresAt:deadline,
    binding:{namespaceId:randomUUID(),capture:first.packet,savedCapture:first.saved}})).rejects.toThrow()
})

it('refuses forged canonical/raw phase agreement at the trusted adapter before any private SQL write', async () => {
  const first = await capture(), forged = structuredClone(first.packet.command.changes.setRecordings[0])
  forged.recording.repetitions[0].concentricRepetition!.average_velocity = 0.91 // Original raw source remains 0.41.
  forged.expectedRecording = {fileSha256:first.original.sha256,sourceSetId:forged.recording.set.id}
  const requestId = randomUUID()
  const actual = await first.call('amend_workout',{entityId:first.entityId,expectedRevision:2,requestId,
    changes:{setRecordings:[forged]},provenance:{fields:{}}})
  const fakePacket = structuredClone(first.packet)
  fakePacket.command.expectedRevision = 2; fakePacket.command.requestId = requestId
  fakePacket.command.changes.setRecordings = [forged]; fakePacket.normalizedRecordings = [forged.recording]
  fakePacket.selections[0].expectedRecording = forged.expectedRecording
  expect(actual.savedRecord.blocks[2].segments[0].events[0].performed.sets[3].velocity.recording.repetitions[0].concentricRepetition.average_velocity).toBe(0.91)
  let privateWrites = 0
  const observed: PrivateQwikSql = {async query<T>(statement: string,params: unknown[]) {
    if (statement.includes('persist_original')) privateWrites++
    return await db.query<any>(statement,params) as {rows:T[]}
  }}
  await expect(client(owner,observed).persist({requestId:randomUUID(),artifact:first.original,expiresAt:expires(),
    binding:{namespaceId:namespace,capture:fakePacket,savedCapture:actual}})).rejects.toMatchObject({status:409})
  expect(privateWrites).toBe(0); expect(await count('artifacts')).toBe(0); expect(await count('source_claims')).toBe(0)
  expect((await first.call('get_activity_record',{kind:'workout',entityId:first.entityId})).record.capture_revision).toBe(3)
})

it('retains permanent source identity and receipt history after explicit byte clearing, without reconstructing raw', async () => {
  const first = await capture(), key = randomUUID(), deadline = expires()
  const saved = await client().persist({requestId:key,artifact:first.original,expiresAt:deadline,
    binding:{namespaceId:namespace,capture:first.packet,savedCapture:first.saved}})
  const id = String(saved.receipt.artifactId)
  await expect(client().deleteOriginal({requestId:randomUUID(),artifactId:id,reason:'synthetic',consent:'wrong' as any})).rejects.toMatchObject({status:400})
  const clearKey = randomUUID(), cleared = await client().deleteOriginal({requestId:clearKey,artifactId:id,reason:'Explicit synthetic owner decision',consent:'clear_private_original_bytes'})
  expect(cleared.raw.state).toBe('deleted'); expect(cleared.physicalErasureAsserted).toBe(false)
  expect((await client().readOriginal(id)).state).toBe('deleted'); expect(await count('source_claims')).toBe(1)
  const recovered = await client().recover(key)
  expect(recovered.state).toBe('saved'); if (recovered.state !== 'saved') throw new Error('Receipt lost')
  expect(recovered.raw.state).toBe('deleted'); expect(recovered.receipt).toEqual(saved.receipt)
  expect((await client().persist({requestId:key,artifact:first.original,expiresAt:deadline,
    binding:{namespaceId:namespace,capture:first.packet,savedCapture:first.saved}})).raw.state).toBe('deleted')
  expect((await client().recover(clearKey,'delete')).state).toBe('saved')
  expect(await client().readClaims()).toHaveLength(1)
})
